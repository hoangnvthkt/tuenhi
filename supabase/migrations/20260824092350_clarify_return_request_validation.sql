create or replace function app_private.create_sale_return_request_impl(
  p_original_sale_id uuid,
  p_reason text,
  p_lines jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
        or coalesce(item ->> 'requestedQty', '') !~ '^(0|[1-9][0-9]*)(\\.[0-9]{1,3})?$'
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
      and coalesce((select sum(return_line.requested_qty)
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
$$;
