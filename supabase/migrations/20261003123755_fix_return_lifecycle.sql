-- Preserve request timestamps when cancelling; no historical ledger rewrite.
ALTER TABLE api.sale_returns DROP CONSTRAINT sale_returns_check1;
ALTER TABLE api.sale_returns ADD CONSTRAINT sale_returns_requested_history_check CHECK (
  (status = 'DRAFT' AND requested_at IS NULL)
  OR (status IN ('REQUESTED', 'COMPLETED') AND requested_at IS NOT NULL)
  OR status = 'CANCELLED'
);

CREATE OR REPLACE FUNCTION app_private.create_sale_return_request_impl(p_original_sale_id uuid, p_reason text, p_lines jsonb, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_correlation uuid := gen_random_uuid();
  v_reason text := app_private.empty_to_null(p_reason);
  v_sale api.sales%rowtype;
  v_return_id uuid := gen_random_uuid();
  v_version bigint;
  v_cached jsonb;
  v_result jsonb;
begin
  if v_actor is null or not app_private.has_permission('return.request.create') then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền tạo yêu cầu trả hàng.', v_correlation);
  end if;
  if p_original_sale_id is null or p_idempotency_key is null
    or v_reason is null or length(v_reason) > 500
    or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 200
    or exists (
      select 1 from jsonb_array_elements(p_lines) item
      where jsonb_typeof(item) <> 'object'
        or item - array['originalSaleLineId', 'requestedQty'] <> '{}'::jsonb
        or coalesce(item ->> 'originalSaleLineId', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        or coalesce(item ->> 'requestedQty', '') !~ '^(0|[1-9][0-9]*)$'
        or (item ->> 'requestedQty')::numeric <= 0
    ) or exists (
      select 1 from jsonb_array_elements(p_lines) item
      group by item ->> 'originalSaleLineId' having count(*) > 1
    ) then
    return app_private.command_error('RETURN_REQUEST_LINES_INVALID', 'Dòng hàng trả hoặc số lượng trả chưa hợp lệ.', v_correlation);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':sale.return.create:' || p_idempotency_key::text, 0));
  v_cached := app_private.cached_command_response(v_actor, 'sale.return.create', p_idempotency_key);
  if v_cached is not null then return v_cached; end if;
  select * into v_sale from api.sales where id = p_original_sale_id for update;
  if not found or v_sale.status not in ('COMPLETED', 'PARTIALLY_RETURNED') then
    return app_private.command_error('ORIGINAL_INVOICE_REQUIRED', 'Hóa đơn gốc không còn đủ điều kiện trả hàng.', v_correlation);
  end if;
  perform 1 from api.sale_lines line
  join jsonb_array_elements(p_lines) item on line.id = (item ->> 'originalSaleLineId')::uuid
  where line.sale_id = p_original_sale_id order by line.id for update of line;
  if (select count(*) from api.sale_lines line
      join jsonb_array_elements(p_lines) item on line.id = (item ->> 'originalSaleLineId')::uuid
      where line.sale_id = p_original_sale_id) <> jsonb_array_length(p_lines) then
    return app_private.command_error('RETURN_REQUEST_LINES_INVALID', 'Có dòng hàng không thuộc hóa đơn gốc.', v_correlation);
  end if;
  if exists (
    select 1 from api.sale_lines line
    join jsonb_array_elements(p_lines) item on line.id = (item ->> 'originalSaleLineId')::uuid
    where line.sale_id = p_original_sale_id
      and coalesce((select sum(case when return_document.status = 'COMPLETED' then return_line.accepted_qty else return_line.requested_qty end)
        from api.sale_return_lines return_line
        join api.sale_returns return_document on return_document.id = return_line.sale_return_id
        where return_line.original_sale_line_id = line.id
          and return_document.status in ('REQUESTED', 'COMPLETED')), 0)
        + (item ->> 'requestedQty')::numeric > line.quantity
  ) then
    return app_private.command_error('RETURN_QTY_EXCEEDED', 'Số lượng yêu cầu trả vượt quá số lượng còn được trả.', v_correlation);
  end if;
  insert into api.sale_returns(
    id, original_sale_id, status, reason, created_by, requested_by, requested_at, correlation_id
  ) values (
    v_return_id, p_original_sale_id, 'REQUESTED', v_reason, v_actor, v_actor, now(), v_correlation
  ) returning version into v_version;
  insert into api.sale_return_lines(
    sale_return_id, original_sale_line_id, product_id, product_name, sku, unit_name,
    requested_qty, line_order
  )
  select v_return_id, line.id, line.product_id, line.product_name, line.sku, line.unit_name,
    (item.value ->> 'requestedQty')::numeric, item.ordinality::integer - 1
  from jsonb_array_elements(p_lines) with ordinality item(value, ordinality)
  join api.sale_lines line on line.id = (item.value ->> 'originalSaleLineId')::uuid
  order by item.ordinality;
  insert into api.user_notifications(
    user_id, severity, category, title, message, action_route, entity_type, entity_id,
    dedupe_key, metadata, correlation_id
  )
  select profile.id, 'INFO', 'RETURN', 'Có yêu cầu trả hàng mới',
    'Một yêu cầu trả hàng đang chờ kiểm nhận.', '/returns/' || v_return_id::text,
    'sale_return', v_return_id, 'return-request:' || v_return_id::text,
    jsonb_build_object('saleNumber', v_sale.sale_number), v_correlation
  from api.profiles profile
  where profile.is_active and profile.id <> v_actor
    and app_private.effective_permissions_for(profile.id) @> '["return.complete"]'::jsonb
  on conflict do nothing;
  insert into app_private.audit_events(actor_id, action, entity_type, entity_id, after_data, correlation_id)
  values (v_actor, 'sale_return.requested', 'sale_return', v_return_id,
    jsonb_build_object('saleId', p_original_sale_id, 'lineCount', jsonb_array_length(p_lines)), v_correlation);
  v_result := app_private.command_success(jsonb_build_object(
    'returnId', v_return_id, 'status', 'REQUESTED', 'version', v_version
  ), v_correlation);
  insert into app_private.command_deduplication(actor_id, command_name, idempotency_key, response)
  values (v_actor, 'sale.return.create', p_idempotency_key, v_result);
  return v_result;
exception when invalid_text_representation or numeric_value_out_of_range then
  return app_private.command_error('RETURN_REQUEST_LINES_INVALID', 'Số lượng trả chưa đúng định dạng quốc tế.', v_correlation);
end;
$function$;

CREATE OR REPLACE FUNCTION app_private.complete_sale_return_impl(p_return_id uuid, p_expected_version bigint, p_lines jsonb, p_refund_method text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_correlation uuid := gen_random_uuid();
  v_return api.sale_returns%rowtype;
  v_sale api.sales%rowtype;
  v_cached jsonb;
  v_result jsonb;
  v_line record;
  v_accepted numeric(18,0);
  v_previous_qty numeric(18,0);
  v_previous_refund numeric(20,2);
  v_previous_cogs numeric(20,2);
  v_refund numeric(20,2);
  v_returned_cogs numeric(20,2);
  v_total_refund numeric(20,2) := 0;
  v_total_cogs numeric(20,2) := 0;
  v_new_qty numeric(18,0);
  v_new_value numeric(20,2);
  v_new_average numeric(20,6);
  v_movement_id uuid;
  v_return_number text;
  v_version bigint;
  v_next_sale_status text;
begin
  if v_actor is null or not app_private.has_permission('return.complete') then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền hoàn tất trả hàng.', v_correlation);
  end if;
  if p_return_id is null or p_expected_version is null or p_idempotency_key is null
    or p_refund_method not in ('CASH', 'BANK_TRANSFER')
    or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 200
    or exists (
      select 1 from jsonb_array_elements(p_lines) item
      where jsonb_typeof(item) <> 'object'
        or item - array['saleReturnLineId', 'acceptedQty'] <> '{}'::jsonb
        or coalesce(item ->> 'saleReturnLineId', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        or coalesce(item ->> 'acceptedQty', '') !~ '^(0|[1-9][0-9]*)$'
        or (item ->> 'acceptedQty')::numeric < 0
    ) or exists (
      select 1 from jsonb_array_elements(p_lines) item
      group by item ->> 'saleReturnLineId' having count(*) > 1
    ) then
    return app_private.command_error('VALIDATION_FAILED', 'Dòng kiểm nhận hoặc phương thức hoàn tiền chưa hợp lệ.', v_correlation);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':sale.return.complete:' || p_idempotency_key::text, 0));
  v_cached := app_private.cached_command_response(v_actor, 'sale.return.complete', p_idempotency_key);
  if v_cached is not null then return v_cached; end if;
  -- Serialize reservation, completion and cancellation on the original invoice.
  perform 1 from api.sales
  where id = (select original_sale_id from api.sale_returns where id = p_return_id)
  for update;
  select * into v_return from api.sale_returns where id = p_return_id for update;
  if not found or v_return.status <> 'REQUESTED' then
    return app_private.command_error('INVALID_STATE', 'Yêu cầu trả hàng này không còn chờ kiểm nhận.', v_correlation);
  end if;
  if v_return.version <> p_expected_version then
    return app_private.command_error_with_details('VERSION_CONFLICT', 'Yêu cầu trả hàng đã được cập nhật. Vui lòng tải lại.', jsonb_build_object('currentVersion', v_return.version), v_correlation);
  end if;
  select * into v_sale from api.sales where id = v_return.original_sale_id for update;
  if not found or v_sale.status not in ('COMPLETED', 'PARTIALLY_RETURNED') then
    return app_private.command_error('ORIGINAL_INVOICE_REQUIRED', 'Hóa đơn gốc không còn đủ điều kiện trả hàng.', v_correlation);
  end if;
  perform 1 from api.sale_return_lines return_line
  where return_line.sale_return_id = p_return_id order by return_line.product_id for update;
  if (select count(*) from api.sale_return_lines where sale_return_id = p_return_id) <> jsonb_array_length(p_lines)
    or exists (
      select 1 from jsonb_array_elements(p_lines) item
      left join api.sale_return_lines return_line
        on return_line.id = (item ->> 'saleReturnLineId')::uuid and return_line.sale_return_id = p_return_id
      where return_line.id is null
    ) then
    return app_private.command_error('VALIDATION_FAILED', 'Danh sách dòng kiểm nhận không khớp với yêu cầu trả.', v_correlation);
  end if;
  if coalesce((select sum((item ->> 'acceptedQty')::numeric) from jsonb_array_elements(p_lines) item), 0) <= 0 then
    return app_private.command_error('RETURN_NOTHING_ACCEPTED', 'Cần chấp nhận ít nhất một sản phẩm để hoàn tất trả hàng.', v_correlation);
  end if;
  if exists (
    select 1 from api.sale_return_lines return_line
    join jsonb_array_elements(p_lines) item on (item ->> 'saleReturnLineId')::uuid = return_line.id
    where return_line.sale_return_id = p_return_id
      and (item ->> 'acceptedQty')::numeric > return_line.requested_qty
  ) then
    return app_private.command_error('RETURN_QTY_EXCEEDED', 'Số lượng chấp nhận không được vượt số lượng yêu cầu.', v_correlation);
  end if;
  perform 1 from api.inventory_balances balance
  join api.sale_return_lines return_line on return_line.product_id = balance.product_id
  where return_line.sale_return_id = p_return_id order by balance.product_id for update of balance;
  perform 1 from app_private.inventory_cost_balances balance
  join api.sale_return_lines return_line on return_line.product_id = balance.product_id
  where return_line.sale_return_id = p_return_id order by balance.product_id for update of balance;
  for v_line in
    select return_line.*, sale_line.quantity as sold_qty, sale_line.net_amount,
      sale_cost.unit_cost_snapshot, sale_cost.cogs_total_snapshot,
      quantity_balance.on_hand_qty, cost_balance.inventory_value, cost_balance.avg_unit_cost
    from api.sale_return_lines return_line
    join api.sale_lines sale_line on sale_line.id = return_line.original_sale_line_id
    join app_private.sale_line_costs sale_cost on sale_cost.sale_line_id = sale_line.id
    join api.inventory_balances quantity_balance on quantity_balance.product_id = return_line.product_id
    join app_private.inventory_cost_balances cost_balance on cost_balance.product_id = return_line.product_id
    where return_line.sale_return_id = p_return_id
    order by return_line.product_id
  loop
    select (item ->> 'acceptedQty')::numeric into v_accepted
    from jsonb_array_elements(p_lines) item
    where (item ->> 'saleReturnLineId')::uuid = v_line.id;
    select coalesce(sum(previous_line.accepted_qty), 0),
      coalesce(sum(previous_line.refund_amount), 0),
      coalesce(sum(previous_cost.cogs_returned), 0)
    into v_previous_qty, v_previous_refund, v_previous_cogs
    from api.sale_return_lines previous_line
    join api.sale_returns previous_return on previous_return.id = previous_line.sale_return_id
    left join app_private.sale_return_line_costs previous_cost on previous_cost.sale_return_line_id = previous_line.id
    where previous_line.original_sale_line_id = v_line.original_sale_line_id
      and previous_return.status = 'COMPLETED';
    if v_previous_qty + v_accepted > v_line.sold_qty then
      return app_private.command_error('RETURN_QTY_EXCEEDED', 'Số lượng được trả đã thay đổi. Vui lòng tải lại hóa đơn.', v_correlation);
    end if;
    if v_previous_qty + v_accepted = v_line.sold_qty then
      v_refund := v_line.net_amount - v_previous_refund;
      v_returned_cogs := v_line.cogs_total_snapshot - v_previous_cogs;
    else
      v_refund := round(v_line.net_amount * v_accepted / v_line.sold_qty, 2);
      v_returned_cogs := round(v_line.cogs_total_snapshot * v_accepted / v_line.sold_qty, 2);
    end if;
    update api.sale_return_lines
    set accepted_qty = v_accepted, refund_amount = v_refund
    where id = v_line.id;
    if v_accepted > 0 then
      v_new_qty := v_line.on_hand_qty + v_accepted;
      v_new_value := round(v_line.inventory_value + v_returned_cogs, 2);
      v_new_average := round(v_new_value / v_new_qty, 6);
      update api.inventory_balances
      set on_hand_qty = v_new_qty, version = version + 1, updated_at = now()
      where product_id = v_line.product_id;
      update app_private.inventory_cost_balances
      set inventory_value = v_new_value, avg_unit_cost = v_new_average,
          version = version + 1, updated_at = now()
      where product_id = v_line.product_id;
      insert into api.stock_movements(
        product_id, movement_type, quantity_delta, quantity_after, reference_type,
        reference_id, occurred_at, actor_id, note, correlation_id
      ) values (
        v_line.product_id, 'SALE_RETURN', v_accepted, v_new_qty, 'SALE_RETURN',
        p_return_id, now(), v_actor, 'Hoàn tất trả hàng', v_correlation
      ) returning id into v_movement_id;
      insert into app_private.inventory_cost_movements(
        stock_movement_id, inventory_value_delta, cogs_delta, inventory_value_after,
        avg_unit_cost_after, occurred_at
      ) values (
        v_movement_id, v_returned_cogs, -v_returned_cogs, v_new_value, v_new_average, now()
      );
      insert into app_private.sale_return_line_costs(
        sale_return_line_id, unit_cost_snapshot, cogs_returned
      ) values (v_line.id, v_line.unit_cost_snapshot, v_returned_cogs);
    end if;
    v_total_refund := v_total_refund + v_refund;
    v_total_cogs := v_total_cogs + v_returned_cogs;
  end loop;
  v_return_number := app_private.next_document_number_impl('SALE_RETURN');
  update api.sale_returns
  set return_number = v_return_number, status = 'COMPLETED', refund_total = v_total_refund,
      completed_by = v_actor, completed_at = now(), version = version + 1,
      updated_at = now(), correlation_id = v_correlation
  where id = p_return_id returning version into v_version;
  if exists (
    select 1 from api.sale_lines sale_line
    where sale_line.sale_id = v_sale.id and sale_line.quantity > coalesce((
      select sum(return_line.accepted_qty) from api.sale_return_lines return_line
      join api.sale_returns return_document on return_document.id = return_line.sale_return_id
      where return_document.status = 'COMPLETED' and return_line.original_sale_line_id = sale_line.id
    ), 0)
  ) then v_next_sale_status := 'PARTIALLY_RETURNED'; else v_next_sale_status := 'RETURNED'; end if;
  insert into api.sale_return_payments(
    sale_return_id, method, amount, status, refunded_by, correlation_id
  ) values (p_return_id, p_refund_method, v_total_refund, 'REFUNDED', v_actor, v_correlation);
  update api.sales
  set status = v_next_sale_status, version = version + 1, updated_at = now(), correlation_id = v_correlation
  where id = v_sale.id;
  insert into app_private.sales_financial_events(
    sale_id, sale_return_id, event_type, gross_sales, discount_total, net_revenue,
    cogs_delta, attributed_user_id, occurred_at, correlation_id
  ) values (
    v_sale.id, p_return_id, 'RETURN_COMPLETED', 0, 0, -v_total_refund,
    -v_total_cogs, v_sale.created_by, now(), v_correlation
  );
  insert into api.user_notifications(user_id, severity, category, title, message, action_route, entity_type, entity_id, dedupe_key, correlation_id)
  select distinct recipient.id, 'SUCCESS', 'RETURN', 'Đã hoàn tất trả hàng',
    'Phiếu ' || v_return_number || ' của hóa đơn ' || v_sale.sale_number || ' đã được hoàn tất.',
    '/returns/' || p_return_id::text, 'sale_return', p_return_id,
    'return-complete:' || p_return_id::text, v_correlation
  from api.profiles recipient
  where recipient.id in (v_return.created_by, v_sale.created_by) and recipient.id <> v_actor
  on conflict do nothing;
  insert into app_private.audit_events(actor_id, action, entity_type, entity_id, after_data, correlation_id)
  values (v_actor, 'sale_return.completed', 'sale_return', p_return_id,
    jsonb_build_object('returnNumber', v_return_number, 'refundTotal', v_total_refund::text), v_correlation);
  v_result := app_private.command_success(jsonb_build_object(
    'returnId', p_return_id, 'returnNumber', v_return_number, 'status', 'COMPLETED',
    'refundTotal', v_total_refund::text, 'version', v_version
  ), v_correlation);
  insert into app_private.command_deduplication(actor_id, command_name, idempotency_key, response)
  values (v_actor, 'sale.return.complete', p_idempotency_key, v_result);
  return v_result;
exception when invalid_text_representation or numeric_value_out_of_range then
  return app_private.command_error('VALIDATION_FAILED', 'Số lượng kiểm nhận chưa đúng định dạng quốc tế.', v_correlation);
end;
$function$;

CREATE OR REPLACE FUNCTION app_private.cancel_sale_return_impl(p_return_id uuid, p_expected_version bigint, p_reason text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_correlation uuid := gen_random_uuid();
  v_reason text := app_private.empty_to_null(p_reason);
  v_return api.sale_returns%rowtype;
  v_sale api.sales%rowtype;
  v_version bigint;
  v_cached jsonb;
  v_result jsonb;
begin
  if v_actor is null or (not app_private.has_permission('return.request.create') and not app_private.has_permission('return.complete')) then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền hủy yêu cầu trả hàng.', v_correlation);
  end if;
  if p_return_id is null or p_expected_version is null or p_idempotency_key is null
    or v_reason is null or length(v_reason) > 500 then
    return app_private.command_error('VALIDATION_FAILED', 'Vui lòng nhập lý do hủy yêu cầu trả hàng.', v_correlation);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':sale.return.cancel:' || p_idempotency_key::text, 0));
  v_cached := app_private.cached_command_response(v_actor, 'sale.return.cancel', p_idempotency_key);
  if v_cached is not null then return v_cached; end if;
  -- Serialize reservation, completion and cancellation on the original invoice.
  perform 1 from api.sales
  where id = (select original_sale_id from api.sale_returns where id = p_return_id)
  for update;
  select * into v_return from api.sale_returns where id = p_return_id for update;
  if not found or v_return.status not in ('DRAFT', 'REQUESTED') then
    return app_private.command_error('INVALID_STATE', 'Yêu cầu trả hàng này không thể hủy.', v_correlation);
  end if;
  if v_return.created_by <> v_actor and not app_private.has_permission('return.complete') then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn chỉ được hủy yêu cầu trả do mình tạo.', v_correlation);
  end if;
  if v_return.version <> p_expected_version then
    return app_private.command_error_with_details('VERSION_CONFLICT', 'Yêu cầu trả hàng đã được cập nhật. Vui lòng tải lại.', jsonb_build_object('currentVersion', v_return.version), v_correlation);
  end if;
  select * into v_sale from api.sales where id = v_return.original_sale_id;
  update api.sale_returns
  set status = 'CANCELLED', cancelled_by = v_actor, cancelled_at = now(), cancel_reason = v_reason,
      version = version + 1, updated_at = now(), correlation_id = v_correlation
  where id = p_return_id returning version into v_version;
  insert into api.user_notifications(user_id, severity, category, title, message, action_route, entity_type, entity_id, dedupe_key, correlation_id)
  select distinct recipient.id, 'INFO', 'RETURN', 'Yêu cầu trả hàng đã hủy',
    'Yêu cầu trả hàng liên quan đến hóa đơn ' || v_sale.sale_number || ' đã được hủy.',
    '/returns/' || p_return_id::text, 'sale_return', p_return_id,
    'return-cancel:' || p_return_id::text, v_correlation
  from api.profiles recipient
  where recipient.id in (v_return.created_by, v_sale.created_by)
    and recipient.id <> v_actor
  on conflict do nothing;
  insert into app_private.audit_events(actor_id, action, entity_type, entity_id, after_data, correlation_id)
  values (v_actor, 'sale_return.cancelled', 'sale_return', p_return_id,
    jsonb_build_object('reason', v_reason), v_correlation);
  v_result := app_private.command_success(jsonb_build_object('returnId', p_return_id, 'status', 'CANCELLED', 'version', v_version), v_correlation);
  insert into app_private.command_deduplication(actor_id, command_name, idempotency_key, response)
  values (v_actor, 'sale.return.cancel', p_idempotency_key, v_result);
  return v_result;
end;
$function$;

