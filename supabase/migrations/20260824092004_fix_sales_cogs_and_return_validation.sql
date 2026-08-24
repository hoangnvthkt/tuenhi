-- Repair the completed-sale ledger write. Sale line costs were always snapshotted,
-- but the original financial event relied on the default cogs_delta = 0.
create or replace function app_private.complete_sale_impl(p_sale_id uuid,p_expected_version bigint,p_payment_method text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=(select auth.uid()); v_sale api.sales%rowtype; v_correlation uuid:=gen_random_uuid(); v_cached jsonb; v_result jsonb; v_line record; v_movement uuid; v_new_qty numeric(18,3); v_new_value numeric(20,2); v_new_avg numeric(20,6); v_cogs numeric(20,2); v_total_cogs numeric(20,2) := 0; v_number text; v_channel api.sales_channels%rowtype; v_store api.store_settings%rowtype; v_customer api.customers%rowtype; v_profile api.profiles%rowtype;
begin
 if v_actor is null or not app_private.has_permission('sale.complete') then return app_private.command_error('PERMISSION_DENIED','Bạn không có quyền thanh toán hóa đơn.',v_correlation); end if;
 if p_idempotency_key is null or p_payment_method not in ('CASH','BANK_TRANSFER') then return app_private.command_error('VALIDATION_FAILED','Vui lòng chọn tiền mặt hoặc chuyển khoản.',v_correlation); end if;
 perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':sale.complete:'||p_idempotency_key::text,0)); select response into v_cached from app_private.command_deduplication where actor_id=v_actor and command_name='sale.complete' and idempotency_key=p_idempotency_key; if found then return v_cached; end if;
 select * into v_sale from api.sales where id=p_sale_id for update;
 if not found or v_sale.created_by<>v_actor then return app_private.command_error('PERMISSION_DENIED','Bạn chỉ được thanh toán hóa đơn nháp của mình.',v_correlation); end if;
 if v_sale.status<>'DRAFT' then return app_private.command_error('INVALID_STATE','Hóa đơn này không còn ở trạng thái nháp.',v_correlation); end if;
 if v_sale.version<>p_expected_version then return app_private.command_error_with_details('VERSION_CONFLICT','Hóa đơn nháp đã được cập nhật. Vui lòng tải lại.',jsonb_build_object('currentVersion',v_sale.version),v_correlation); end if;
 select * into v_channel from api.sales_channels where id=v_sale.sales_channel_id; if not found or not v_channel.is_active then return app_private.command_error('SALES_CHANNEL_INACTIVE','Kênh bán đã ngừng sử dụng. Vui lòng chọn kênh khác.',v_correlation); end if;
 if exists(select 1 from api.sale_lines l join api.products p on p.id=l.product_id join app_private.product_sale_prices sp on sp.product_id=p.id and sp.valid_to is null where l.sale_id=p_sale_id and (not p.is_active or l.unit_sale_price<>sp.sale_price)) then return app_private.command_error_with_details('PRICE_CHANGED','Giá bán đã thay đổi. Vui lòng xác nhận lại giỏ hàng.',jsonb_build_object('lines',(select jsonb_agg(jsonb_build_object('productId',l.product_id,'oldPrice',l.unit_sale_price::text,'newPrice',sp.sale_price::text)) from api.sale_lines l join app_private.product_sale_prices sp on sp.product_id=l.product_id and sp.valid_to is null where l.sale_id=p_sale_id and l.unit_sale_price<>sp.sale_price)),v_correlation); end if;
 perform 1 from api.inventory_balances b join api.sale_lines l on l.product_id=b.product_id where l.sale_id=p_sale_id order by b.product_id for update of b;
 perform 1 from app_private.inventory_cost_balances b join api.sale_lines l on l.product_id=b.product_id where l.sale_id=p_sale_id order by b.product_id for update of b;
 if exists(select 1 from api.sale_lines l join api.inventory_balances b on b.product_id=l.product_id where l.sale_id=p_sale_id and b.on_hand_qty<l.quantity) then return app_private.command_error('INSUFFICIENT_STOCK','Tồn kho không đủ để hoàn tất hóa đơn.',v_correlation); end if;
 select * into v_store from api.store_settings where id=1; select * into v_profile from api.profiles where id=v_actor; if v_sale.customer_id is not null then select * into v_customer from api.customers where id=v_sale.customer_id; end if;
 for v_line in select l.*,b.on_hand_qty,cb.inventory_value,cb.avg_unit_cost from api.sale_lines l join api.inventory_balances b on b.product_id=l.product_id join app_private.inventory_cost_balances cb on cb.product_id=l.product_id where l.sale_id=p_sale_id order by l.product_id loop
   v_new_qty:=v_line.on_hand_qty-v_line.quantity; v_cogs:=round(v_line.quantity*v_line.avg_unit_cost,2); v_total_cogs := v_total_cogs + v_cogs;
   if v_new_qty=0 then v_new_value:=0; v_new_avg:=0; else v_new_value:=greatest(round(v_line.inventory_value-v_cogs,2),0); v_new_avg:=round(v_new_value/v_new_qty,6); end if;
   update api.inventory_balances set on_hand_qty=v_new_qty,version=version+1,updated_at=now() where product_id=v_line.product_id;
   update app_private.inventory_cost_balances set inventory_value=v_new_value,avg_unit_cost=v_new_avg,version=version+1,updated_at=now() where product_id=v_line.product_id;
   insert into api.stock_movements(product_id,movement_type,quantity_delta,quantity_after,reference_type,reference_id,occurred_at,actor_id,note,correlation_id) values(v_line.product_id,'SALE',-v_line.quantity,v_new_qty,'SALE',p_sale_id,now(),v_actor,'Hoàn tất bán hàng',v_correlation) returning id into v_movement;
   insert into app_private.inventory_cost_movements(stock_movement_id,inventory_value_delta,cogs_delta,inventory_value_after,avg_unit_cost_after,occurred_at) values(v_movement,-v_cogs,v_cogs,v_new_value,v_new_avg,now());
   insert into app_private.sale_line_costs(sale_line_id,unit_cost_snapshot,cogs_total_snapshot) values(v_line.id,v_line.avg_unit_cost,v_cogs);
 end loop;
 v_number:=app_private.next_document_number_impl('SALE');
 update api.sales set sale_number=v_number,status='COMPLETED',sales_channel_code_snapshot=v_channel.code,sales_channel_name_snapshot=v_channel.name,customer_name_snapshot=case when v_sale.customer_id is null then null else v_customer.name end,customer_phone_snapshot=case when v_sale.customer_id is null then null else v_customer.phone_e164 end,staff_name_snapshot=v_profile.display_name,completed_by=v_actor,completed_at=now(),version=version+1,updated_at=now(),correlation_id=v_correlation where id=p_sale_id returning * into v_sale;
 insert into app_private.sale_invoice_store_snapshots(sale_id,display_name,logo_path,address,contact_phone,zalo,invoice_footer) values(p_sale_id,v_store.display_name,v_store.logo_path,v_store.address,v_store.contact_phone,v_store.zalo,v_store.invoice_footer);
 insert into api.payments(sale_id,method,amount,status,captured_by,correlation_id) values(p_sale_id,p_payment_method,v_sale.net_total,'CAPTURED',v_actor,v_correlation);
 insert into app_private.sales_financial_events(sale_id,event_type,gross_sales,discount_total,net_revenue,cogs_delta,attributed_user_id,occurred_at,correlation_id) values(p_sale_id,'SALE_COMPLETED',v_sale.subtotal,v_sale.discount_total,v_sale.net_total,v_total_cogs,v_sale.created_by,v_sale.completed_at,v_correlation);
 insert into app_private.audit_events(actor_id,action,entity_type,entity_id,after_data,correlation_id) values(v_actor,'sale.completed','sale',p_sale_id,jsonb_build_object('saleNumber',v_number,'netTotal',v_sale.net_total::text),v_correlation);
 v_result:=app_private.command_success(jsonb_build_object('saleId',p_sale_id,'saleNumber',v_number,'status','COMPLETED','version',v_sale.version),v_correlation); insert into app_private.command_deduplication(actor_id,command_name,idempotency_key,response) values(v_actor,'sale.complete',p_idempotency_key,v_result); return v_result;
end;
$$;

-- The only historic correction eligible here is an event recorded with the old
-- default zero while its immutable sale-line cost snapshots prove non-zero COGS.
with corrected_events as (
  update app_private.sales_financial_events event
  set cogs_delta = source.expected_cogs
  from (
    select event.id, round(sum(cost.cogs_total_snapshot), 2) as expected_cogs
    from app_private.sales_financial_events event
    join api.sale_lines line on line.sale_id = event.sale_id
    join app_private.sale_line_costs cost on cost.sale_line_id = line.id
    where event.event_type = 'SALE_COMPLETED'
      and event.cogs_delta = 0
    group by event.id
    having sum(cost.cogs_total_snapshot) > 0
  ) source
  where event.id = source.id
  returning event.id, event.sale_id, event.cogs_delta
)
insert into app_private.audit_events(
  actor_id, action, entity_type, entity_id, before_data, after_data, metadata, correlation_id
)
select null, 'sales_financial_event.cogs_corrected', 'sales_financial_event', id,
  jsonb_build_object('cogsDelta', '0'),
  jsonb_build_object('cogsDelta', cogs_delta::text),
  jsonb_build_object('reason', 'Backfill ledger COGS omitted by complete_sale_impl before 20260824092004'),
  gen_random_uuid()
from corrected_events;

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
    return app_private.command_error('VALIDATION_FAILED', 'Có dòng hàng không thuộc hóa đơn gốc.', v_correlation);
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
