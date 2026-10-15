-- Deferred inventory costing: quantities may be negative; asset values never are.
-- Uncovered sales carry zero provisional cost until a later inbound movement funds
-- them FIFO. Only new shortages are affected; historical business rows are retained.
begin;
alter table api.inventory_balances drop constraint inventory_balances_on_hand_qty_check;
alter table api.stock_movements drop constraint stock_movements_quantity_after_check;
alter table api.stock_count_lines drop constraint stock_count_lines_system_qty_snapshot_check;

create table app_private.sale_inventory_shortages (
 id bigint generated always as identity primary key,
 sale_line_id uuid not null unique references api.sale_lines(id) on delete restrict,
 product_id uuid not null references api.products(id) on delete restrict,
 initial_qty numeric(18,0) not null check(initial_qty>0),
 remaining_qty numeric(18,0) not null check(remaining_qty>=0 and remaining_qty<=initial_qty),
 created_at timestamptz not null default now()
);
create index sale_inventory_shortages_fifo_idx on app_private.sale_inventory_shortages(product_id,id) where remaining_qty>0;
create table app_private.sale_inventory_cost_allocations (
 id bigint generated always as identity primary key,
 shortage_id bigint not null references app_private.sale_inventory_shortages(id) on delete restrict,
 stock_movement_id uuid not null references api.stock_movements(id) on delete restrict,
 quantity numeric(18,0) not null check(quantity>0),
 allocated_cost numeric(20,2) not null check(allocated_cost>=0),
 created_at timestamptz not null default now(),
 unique(shortage_id,stock_movement_id)
);
create index sale_inventory_cost_allocations_movement_idx on app_private.sale_inventory_cost_allocations(stock_movement_id);
alter table app_private.sale_inventory_shortages enable row level security;
alter table app_private.sale_inventory_shortages force row level security;
alter table app_private.sale_inventory_cost_allocations enable row level security;
alter table app_private.sale_inventory_cost_allocations force row level security;
revoke all on app_private.sale_inventory_shortages,app_private.sale_inventory_cost_allocations from public,anon,authenticated;
grant all on app_private.sale_inventory_shortages,app_private.sale_inventory_cost_allocations to service_role;
grant usage,select on sequence app_private.sale_inventory_shortages_id_seq,app_private.sale_inventory_cost_allocations_id_seq to service_role;

-- Caller already holds quantity and cost balance locks in product UUID order.
-- Never lock the original invoice here: checkout/return commands lock invoice
-- before inventory, so doing so would invert their lock order.
create function app_private.allocate_inbound_inventory_cost(
 p_product_id uuid,p_quantity numeric,p_cost numeric,p_movement_id uuid
) returns numeric language plpgsql security definer set search_path='' as $$
declare v_shortage record; v_qty numeric; v_cost numeric(20,2); v_left numeric:=p_quantity;
 v_allocated numeric(20,2):=0;
begin
 if p_quantity<=0 then
  if p_cost<>0 then raise exception 'INBOUND_COST_WITHOUT_QUANTITY'; end if;
  return 0;
 end if;
 for v_shortage in select d.*,l.sale_id,l.quantity as sold_qty
   from app_private.sale_inventory_shortages d join api.sale_lines l on l.id=d.sale_line_id
   where d.product_id=p_product_id and d.remaining_qty>0 order by d.id for update of d
 loop
  exit when v_left=0;
  v_qty:=least(v_left,v_shortage.remaining_qty);
  -- Cumulative rounding conserves cents even when several one-unit shortages
  -- share an inbound cost smaller than their count (for example returns).
  v_cost:=round(p_cost*(p_quantity-v_left+v_qty)/p_quantity,2)
    -round(p_cost*(p_quantity-v_left)/p_quantity,2);
  update app_private.sale_inventory_shortages set remaining_qty=remaining_qty-v_qty where id=v_shortage.id;
  insert into app_private.sale_inventory_cost_allocations(shortage_id,stock_movement_id,quantity,allocated_cost)
   values(v_shortage.id,p_movement_id,v_qty,v_cost);
  update app_private.sale_line_costs set cogs_total_snapshot=cogs_total_snapshot+v_cost,
    unit_cost_snapshot=round((cogs_total_snapshot+v_cost)/v_shortage.sold_qty,6)
   where sale_line_id=v_shortage.sale_line_id;
  update app_private.sales_financial_events set cogs_delta=cogs_delta+v_cost
   where sale_id=v_shortage.sale_id and event_type='SALE_COMPLETED';
  v_left:=v_left-v_qty; v_allocated:=v_allocated+v_cost;
 end loop;
 return v_allocated;
end $$;

-- Returns release their own uncosted units first; only recognized units reverse
-- COGS. Remaining known cost is shared over the remaining recognized quantity,
-- with the last return consuming the rounding remainder.
create function app_private.release_sale_inventory_shortage(
 p_sale_line_id uuid,p_quantity numeric,p_previous_qty numeric,p_previous_cogs numeric
) returns table(cancelled_qty numeric,returned_cogs numeric)
language plpgsql security definer set search_path='' as $$
declare v_open numeric:=0; v_sold numeric; v_known_qty numeric; v_cost numeric;
begin
 select remaining_qty into v_open from app_private.sale_inventory_shortages where sale_line_id=p_sale_line_id for update;
 v_open:=coalesce(v_open,0);
 select l.quantity,c.cogs_total_snapshot into v_sold,v_cost from api.sale_lines l
  join app_private.sale_line_costs c on c.sale_line_id=l.id where l.id=p_sale_line_id;
 cancelled_qty:=least(v_open,p_quantity);
 v_known_qty:=v_sold-p_previous_qty-v_open;
 returned_cogs:=case when p_quantity=cancelled_qty then 0
   when p_quantity-cancelled_qty=v_known_qty then v_cost-p_previous_cogs
   else round((v_cost-p_previous_cogs)*(p_quantity-cancelled_qty)/v_known_qty,2) end;
 update app_private.sale_inventory_shortages set remaining_qty=remaining_qty-cancelled_qty where sale_line_id=p_sale_line_id;
 return next;
end $$;
revoke all on function app_private.allocate_inbound_inventory_cost(uuid,numeric,numeric,uuid),
 app_private.release_sale_inventory_shortage(uuid,numeric,numeric,numeric) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION app_private.complete_sale_impl(p_sale_id uuid, p_expected_version bigint, p_payment_method text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=(select auth.uid()); v_sale api.sales%rowtype; v_correlation uuid:=gen_random_uuid(); v_cached jsonb; v_result jsonb; v_line record; v_movement uuid; v_new_qty numeric(18,0); v_new_value numeric(20,2); v_new_avg numeric(20,6); v_cogs numeric(20,2); v_total_cogs numeric(20,2) := 0; v_number text; v_channel api.sales_channels%rowtype; v_store api.store_settings%rowtype; v_customer api.customers%rowtype; v_profile api.profiles%rowtype;
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
 if not exists(select 1 from api.sale_lines where sale_id=p_sale_id)
 or exists(select 1 from api.sale_lines l left join api.inventory_balances b on b.product_id=l.product_id left join app_private.inventory_cost_balances c on c.product_id=l.product_id where l.sale_id=p_sale_id and (b.product_id is null or c.product_id is null)) then
  return app_private.command_error('INVALID_STATE','Số dư tồn kho chưa được khởi tạo đầy đủ.',v_correlation);
 end if;
 select * into v_store from api.store_settings where id=1; select * into v_profile from api.profiles where id=v_actor; if v_sale.customer_id is not null then select * into v_customer from api.customers where id=v_sale.customer_id; end if;
 for v_line in select l.*,b.on_hand_qty,cb.inventory_value,cb.avg_unit_cost from api.sale_lines l join api.inventory_balances b on b.product_id=l.product_id join app_private.inventory_cost_balances cb on cb.product_id=l.product_id where l.sale_id=p_sale_id order by l.product_id loop
   v_new_qty:=v_line.on_hand_qty-v_line.quantity; v_cogs:=case when v_line.on_hand_qty<=0 then 0 when v_line.quantity>=v_line.on_hand_qty then v_line.inventory_value else least(v_line.inventory_value,round(v_line.quantity*v_line.avg_unit_cost,2)) end; v_total_cogs := v_total_cogs + v_cogs;
   if v_new_qty<=0 then v_new_value:=0; v_new_avg:=0; else v_new_value:=greatest(round(v_line.inventory_value-v_cogs,2),0); v_new_avg:=round(v_new_value/v_new_qty,6); end if;
   update api.inventory_balances set on_hand_qty=v_new_qty,version=version+1,updated_at=now() where product_id=v_line.product_id;
   update app_private.inventory_cost_balances set inventory_value=v_new_value,avg_unit_cost=v_new_avg,version=version+1,updated_at=now() where product_id=v_line.product_id;
   insert into api.stock_movements(product_id,movement_type,quantity_delta,quantity_after,reference_type,reference_id,occurred_at,actor_id,note,correlation_id) values(v_line.product_id,'SALE',-v_line.quantity,v_new_qty,'SALE',p_sale_id,now(),v_actor,'Hoàn tất bán hàng',v_correlation) returning id into v_movement;
   insert into app_private.inventory_cost_movements(stock_movement_id,inventory_value_delta,cogs_delta,inventory_value_after,avg_unit_cost_after,occurred_at) values(v_movement,-v_cogs,v_cogs,v_new_value,v_new_avg,now());
   insert into app_private.sale_line_costs(sale_line_id,unit_cost_snapshot,cogs_total_snapshot) values(v_line.id,round(v_cogs/v_line.quantity,6),v_cogs);
   if v_line.quantity>greatest(v_line.on_hand_qty,0) then
    insert into app_private.sale_inventory_shortages(sale_line_id,product_id,initial_qty,remaining_qty)
    values(v_line.id,v_line.product_id,v_line.quantity-greatest(v_line.on_hand_qty,0),v_line.quantity-greatest(v_line.on_hand_qty,0));
   end if;
 end loop;
 v_number:=app_private.next_document_number_impl('SALE');
 update api.sales set sale_number=v_number,status='COMPLETED',sales_channel_code_snapshot=v_channel.code,sales_channel_name_snapshot=v_channel.name,customer_name_snapshot=case when v_sale.customer_id is null then null else v_customer.name end,customer_phone_snapshot=case when v_sale.customer_id is null then null else v_customer.phone_e164 end,staff_name_snapshot=v_profile.display_name,completed_by=v_actor,completed_at=now(),version=version+1,updated_at=now(),correlation_id=v_correlation where id=p_sale_id returning * into v_sale;
 insert into app_private.sale_invoice_store_snapshots(sale_id,display_name,logo_path,address,contact_phone,zalo,invoice_footer) values(p_sale_id,v_store.display_name,v_store.logo_path,v_store.address,v_store.contact_phone,v_store.zalo,v_store.invoice_footer);
 insert into api.payments(sale_id,method,amount,status,captured_by,correlation_id) values(p_sale_id,p_payment_method,v_sale.net_total,'CAPTURED',v_actor,v_correlation);
 insert into app_private.sales_financial_events(sale_id,event_type,gross_sales,discount_total,net_revenue,cogs_delta,attributed_user_id,occurred_at,correlation_id) values(p_sale_id,'SALE_COMPLETED',v_sale.subtotal,v_sale.discount_total,v_sale.net_total,v_total_cogs,v_sale.created_by,v_sale.completed_at,v_correlation);
 insert into app_private.audit_events(actor_id,action,entity_type,entity_id,after_data,correlation_id) values(v_actor,'sale.completed','sale',p_sale_id,jsonb_build_object('saleNumber',v_number,'netTotal',v_sale.net_total::text),v_correlation);
 v_result:=app_private.command_success(jsonb_build_object('saleId',p_sale_id,'saleNumber',v_number,'status','COMPLETED','version',v_sale.version),v_correlation); insert into app_private.command_deduplication(actor_id,command_name,idempotency_key,response) values(v_actor,'sale.complete',p_idempotency_key,v_result); return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION app_private.post_purchase_receipt_impl(p_receipt_id uuid, p_expected_version bigint, p_cost_lines jsonb, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_correlation_id uuid := gen_random_uuid();
  v_receipt api.purchase_receipts%rowtype;
  v_cached jsonb;
  v_result jsonb;
  v_line record;
  v_movement_id uuid;
  v_receipt_number text;
  v_line_cost numeric(20,2);
  v_new_qty numeric(18,0);
  v_new_value numeric(20,2);
  v_new_avg numeric(20,6);
  v_total_cost numeric(20,2) := 0;
  v_version bigint;
  v_allocated numeric(20,2);
  v_now timestamptz := now();
begin
  if v_actor_id is null
    or not app_private.has_permission('purchase.post')
    or not app_private.has_permission('purchase.cost.enter')
  then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Chỉ chủ cửa hàng được ghi sổ phiếu nhập.',
      v_correlation_id
    );
  end if;
  if p_receipt_id is null or p_expected_version is null
    or p_idempotency_key is null or jsonb_typeof(p_cost_lines) <> 'array'
    or jsonb_array_length(p_cost_lines) < 1
  then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Vui lòng nhập đầy đủ đơn giá cho phiếu nhập.',
      v_correlation_id
    );
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_cost_lines) item
    where jsonb_typeof(item) <> 'object'
      or item - array['lineId', 'unitCost'] <> '{}'::jsonb
      or coalesce(item ->> 'lineId', '')
        !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      or coalesce(item ->> 'unitCost', '')
        !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
  ) or exists (
    select 1 from jsonb_array_elements(p_cost_lines) item
    group by item ->> 'lineId' having count(*) > 1
  ) then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Đơn giá nhập chưa đúng định dạng quốc tế.',
      v_correlation_id
    );
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_actor_id::text || ':purchase.post:' || p_idempotency_key::text, 0
  ));
  v_cached := app_private.cached_command_response(
    v_actor_id, 'purchase.post', p_idempotency_key
  );
  if v_cached is not null then return v_cached; end if;
  select r.* into v_receipt from api.purchase_receipts r
  where r.id = p_receipt_id for update;
  if not found then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND', 'Không tìm thấy phiếu nhập.', v_correlation_id
    );
  end if;
  if v_receipt.status <> 'AWAITING_COST' then
    return app_private.command_error(
      'INVALID_STATE', 'Phiếu nhập chưa sẵn sàng để ghi sổ.',
      v_correlation_id
    );
  end if;
  if v_receipt.version <> p_expected_version then
    return app_private.command_error_with_details(
      'VERSION_CONFLICT',
      'Phiếu nhập đã được cập nhật. Vui lòng tải lại dữ liệu.',
      jsonb_build_object('currentVersion', v_receipt.version),
      v_correlation_id
    );
  end if;
  if (
    select count(*) from api.purchase_receipt_lines l
    where l.purchase_receipt_id = p_receipt_id
  ) <> jsonb_array_length(p_cost_lines)
    or exists (
      select 1 from jsonb_array_elements(p_cost_lines) item
      left join api.purchase_receipt_lines l
        on l.id = (item ->> 'lineId')::uuid
        and l.purchase_receipt_id = p_receipt_id
      where l.id is null
    )
  then
    return app_private.command_error(
      'COST_LINES_REQUIRED',
      'Vui lòng nhập đơn giá cho tất cả sản phẩm trong phiếu.',
      v_correlation_id
    );
  end if;
  if exists (
    select 1 from api.purchase_receipt_lines l
    join api.products p on p.id = l.product_id
    where l.purchase_receipt_id = p_receipt_id and not p.is_active
  ) then
    return app_private.command_error(
      'REFERENCE_INACTIVE',
      'Có sản phẩm đã ngừng hoạt động. Vui lòng kích hoạt lại trước khi ghi sổ.',
      v_correlation_id
    );
  end if;

  perform 1 from api.inventory_balances b
  join api.purchase_receipt_lines l on l.product_id = b.product_id
  where l.purchase_receipt_id = p_receipt_id
  order by b.product_id for update of b;
  perform 1 from app_private.inventory_cost_balances b
  join api.purchase_receipt_lines l on l.product_id = b.product_id
  where l.purchase_receipt_id = p_receipt_id
  order by b.product_id for update of b;
  if (
    select count(*) from api.inventory_balances b
    join api.purchase_receipt_lines l on l.product_id = b.product_id
    where l.purchase_receipt_id = p_receipt_id
  ) <> jsonb_array_length(p_cost_lines)
    or (
      select count(*) from app_private.inventory_cost_balances b
      join api.purchase_receipt_lines l on l.product_id = b.product_id
      where l.purchase_receipt_id = p_receipt_id
    ) <> jsonb_array_length(p_cost_lines)
  then
    return app_private.command_error(
      'INVALID_STATE', 'Số dư tồn kho chưa được khởi tạo đầy đủ.',
      v_correlation_id
    );
  end if;

  for v_line in
    select l.*, (item.value ->> 'unitCost')::numeric as unit_cost,
      quantity_balance.on_hand_qty, cost_balance.inventory_value
    from api.purchase_receipt_lines l
    join jsonb_array_elements(p_cost_lines) item(value)
      on (item.value ->> 'lineId')::uuid = l.id
    join api.inventory_balances quantity_balance
      on quantity_balance.product_id = l.product_id
    join app_private.inventory_cost_balances cost_balance
      on cost_balance.product_id = l.product_id
    where l.purchase_receipt_id = p_receipt_id
    order by l.product_id
  loop
    v_line_cost := round(v_line.received_qty * v_line.unit_cost, 2);
    v_new_qty := v_line.on_hand_qty + v_line.received_qty;
    v_new_value := round(v_line.inventory_value + v_line_cost, 2);
    v_new_avg := 0; -- Set after deferred costs have been allocated.
    insert into api.stock_movements(
      product_id, movement_type, quantity_delta, quantity_after,
      reference_type, reference_id, occurred_at, actor_id, note,
      correlation_id
    ) values (
      v_line.product_id, 'PURCHASE_RECEIPT', v_line.received_qty, v_new_qty,
      'PURCHASE_RECEIPT', p_receipt_id, v_now, v_actor_id,
      'Ghi sổ phiếu nhập', v_correlation_id
    ) returning id into v_movement_id;
    v_allocated:=app_private.allocate_inbound_inventory_cost(v_line.product_id,v_line.received_qty,v_line_cost,v_movement_id);
    v_new_value:=round(v_line.inventory_value+v_line_cost-v_allocated,2);
    v_new_avg:=case when v_new_qty>0 then round(v_new_value/v_new_qty,6) else 0 end;
    update api.inventory_balances
    set on_hand_qty = v_new_qty, version = version + 1, updated_at = v_now
    where product_id = v_line.product_id;
    update app_private.inventory_cost_balances
    set inventory_value = v_new_value, avg_unit_cost = v_new_avg,
        version = version + 1, updated_at = v_now
    where product_id = v_line.product_id;
    insert into app_private.purchase_receipt_line_costs(
      purchase_receipt_line_id, unit_cost, line_cost, entered_by
    ) values (v_line.id, v_line.unit_cost, v_line_cost, v_actor_id);
    insert into app_private.inventory_cost_movements(
      stock_movement_id, inventory_value_delta, cogs_delta,
      inventory_value_after, avg_unit_cost_after, occurred_at
    ) values (
      v_movement_id, v_line_cost-v_allocated, v_allocated, v_new_value, v_new_avg, v_now
    );
    v_total_cost := v_total_cost + v_line_cost;
  end loop;

  v_receipt_number := app_private.next_document_number_impl(
    'PURCHASE_RECEIPT'
  );
  update api.purchase_receipts
  set receipt_number = v_receipt_number, status = 'POSTED',
      posted_by = v_actor_id, posted_at = v_now,
      version = version + 1, updated_at = v_now
  where id = p_receipt_id returning version into v_version;
  insert into app_private.audit_events(
    actor_id, action, entity_type, entity_id, after_data, correlation_id
  ) values (
    v_actor_id, 'purchase_receipt.posted', 'purchase_receipt', p_receipt_id,
    jsonb_build_object(
      'receiptNumber', v_receipt_number, 'totalCost', v_total_cost::text,
      'version', v_version
    ),
    v_correlation_id
  );
  insert into api.user_notifications(
    user_id, severity, category, title, message, action_route,
    entity_type, entity_id, dedupe_key, metadata, correlation_id
  ) values (
    v_receipt.created_by, 'SUCCESS', 'Nhập hàng', 'Phiếu nhập đã được ghi sổ',
    'Phiếu ' || v_receipt_number || ' đã cập nhật tồn kho.',
    '/more/purchases/' || p_receipt_id::text,
    'purchase_receipt', p_receipt_id,
    'purchase.posted:' || p_receipt_id::text,
    jsonb_build_object('receiptNumber', v_receipt_number), v_correlation_id
  ) on conflict (user_id, dedupe_key) where dedupe_key is not null and read_at is null
  do nothing;
  v_result := app_private.command_success(
    jsonb_build_object(
      'receiptId', p_receipt_id, 'receiptNumber', v_receipt_number,
      'status', 'POSTED', 'version', v_version
    ),
    v_correlation_id
  );
  insert into app_private.command_deduplication(
    actor_id, command_name, idempotency_key, response
  ) values (v_actor_id, 'purchase.post', p_idempotency_key, v_result);
  return v_result;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Đơn giá nhập chưa đúng định dạng quốc tế.',
      v_correlation_id
    );
end;
$function$;

CREATE OR REPLACE FUNCTION app_private.cancel_sale_before_debt_impl(p_sale_id uuid, p_expected_version bigint, p_reason text, p_idempotency_key uuid)
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
  v_cached jsonb;
  v_result jsonb;
  v_line record;
  v_new_qty numeric(18,0);
  v_new_value numeric(20,2);
  v_new_average numeric(20,6);
  v_movement_id uuid;
  v_total_cogs numeric(20,2) := 0;
  v_version bigint;
  v_released record;
  v_allocated numeric(20,2);
begin
  if v_actor is null or not app_private.has_permission('sale.cancel') then
    return app_private.command_error('PERMISSION_DENIED', 'Chỉ chủ cửa hàng được hủy hóa đơn.', v_correlation);
  end if;
  if p_sale_id is null or p_expected_version is null or p_idempotency_key is null
    or v_reason is null or length(v_reason) > 500 then
    return app_private.command_error('VALIDATION_FAILED', 'Vui lòng nhập lý do hủy hóa đơn.', v_correlation);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':sale.cancel:' || p_idempotency_key::text, 0));
  v_cached := app_private.cached_command_response(v_actor, 'sale.cancel', p_idempotency_key);
  if v_cached is not null then return v_cached; end if;
  select * into v_sale from api.sales where id = p_sale_id for update;
  if not found or v_sale.status <> 'COMPLETED' then
    return app_private.command_error('INVALID_STATE', 'Chỉ hóa đơn đã hoàn tất và chưa trả hàng mới được hủy.', v_correlation);
  end if;
  if v_sale.version <> p_expected_version then
    return app_private.command_error_with_details('VERSION_CONFLICT', 'Hóa đơn đã được cập nhật. Vui lòng tải lại.', jsonb_build_object('currentVersion', v_sale.version), v_correlation);
  end if;
  if exists (select 1 from api.sale_returns where original_sale_id = p_sale_id and status = 'COMPLETED') then
    return app_private.command_error('INVALID_STATE', 'Không thể hủy hóa đơn đã có phiếu trả hoàn tất.', v_correlation);
  end if;
  if not exists (select 1 from api.payments where sale_id = p_sale_id and status = 'CAPTURED') then
    return app_private.command_error('INVALID_STATE', 'Không tìm thấy thanh toán hợp lệ để đảo hóa đơn.', v_correlation);
  end if;
  perform 1 from api.inventory_balances balance
  join api.sale_lines line on line.product_id = balance.product_id
  where line.sale_id = p_sale_id order by balance.product_id for update of balance;
  perform 1 from app_private.inventory_cost_balances balance
  join api.sale_lines line on line.product_id = balance.product_id
  where line.sale_id = p_sale_id order by balance.product_id for update of balance;
  for v_line in
    select line.*, cost.unit_cost_snapshot, cost.cogs_total_snapshot,
      quantity_balance.on_hand_qty, cost_balance.inventory_value
    from api.sale_lines line
    join app_private.sale_line_costs cost on cost.sale_line_id = line.id
    join api.inventory_balances quantity_balance on quantity_balance.product_id = line.product_id
    join app_private.inventory_cost_balances cost_balance on cost_balance.product_id = line.product_id
    where line.sale_id = p_sale_id order by line.product_id
  loop
    select * into v_released from app_private.release_sale_inventory_shortage(v_line.id,v_line.quantity,0,0);
    v_new_qty:=v_line.on_hand_qty+v_line.quantity;
    insert into api.stock_movements(product_id,movement_type,quantity_delta,quantity_after,reference_type,reference_id,occurred_at,actor_id,note,correlation_id)
    values(v_line.product_id,'SALE_CANCEL',v_line.quantity,v_new_qty,'SALE',p_sale_id,now(),v_actor,'Hủy hóa đơn',v_correlation) returning id into v_movement_id;
    v_allocated:=app_private.allocate_inbound_inventory_cost(v_line.product_id,v_line.quantity-v_released.cancelled_qty,v_line.cogs_total_snapshot,v_movement_id);
    v_new_value:=round(v_line.inventory_value+v_line.cogs_total_snapshot-v_allocated,2);
    v_new_average:=case when v_new_qty>0 then round(v_new_value/v_new_qty,6) else 0 end;
    update api.inventory_balances set on_hand_qty=v_new_qty,version=version+1,updated_at=now() where product_id=v_line.product_id;
    update app_private.inventory_cost_balances set inventory_value=v_new_value,avg_unit_cost=v_new_average,version=version+1,updated_at=now() where product_id=v_line.product_id;
    insert into app_private.inventory_cost_movements(stock_movement_id,inventory_value_delta,cogs_delta,inventory_value_after,avg_unit_cost_after,occurred_at)
    values(v_movement_id,v_line.cogs_total_snapshot-v_allocated,-v_line.cogs_total_snapshot+v_allocated,v_new_value,v_new_average,now());
    v_total_cogs := v_total_cogs + v_line.cogs_total_snapshot;
  end loop;
  update api.payments
  set status = 'REVERSED', reversed_at = now(), reversed_by = v_actor, reversal_reason = v_reason
  where sale_id = p_sale_id and status = 'CAPTURED';
  update api.sales
  set status = 'CANCELLED', cancelled_by = v_actor, cancelled_at = now(), cancel_reason = v_reason,
      version = version + 1, updated_at = now(), correlation_id = v_correlation
  where id = p_sale_id returning version into v_version;
  insert into app_private.sales_financial_events(
    sale_id, event_type, gross_sales, discount_total, net_revenue,
    cogs_delta, attributed_user_id, occurred_at, correlation_id
  ) values (
    p_sale_id, 'SALE_CANCELLED', 0, 0, -v_sale.net_total,
    -v_total_cogs, v_sale.created_by, now(), v_correlation
  );
  insert into api.user_notifications(user_id, severity, category, title, message, action_route, entity_type, entity_id, dedupe_key, correlation_id)
  select v_sale.created_by, 'WARNING', 'SALE', 'Hóa đơn đã bị hủy',
    'Hóa đơn ' || v_sale.sale_number || ' đã bị hủy.', '/sales/' || p_sale_id::text,
    'sale', p_sale_id, 'sale-cancel:' || p_sale_id::text, v_correlation
  where v_sale.created_by <> v_actor
  on conflict do nothing;
  insert into app_private.audit_events(actor_id, action, entity_type, entity_id, after_data, correlation_id)
  values (v_actor, 'sale.cancelled', 'sale', p_sale_id,
    jsonb_build_object('saleNumber', v_sale.sale_number, 'reason', v_reason), v_correlation);
  v_result := app_private.command_success(jsonb_build_object(
    'saleId', p_sale_id, 'status', 'CANCELLED', 'version', v_version
  ), v_correlation);
  insert into app_private.command_deduplication(actor_id, command_name, idempotency_key, response)
  values (v_actor, 'sale.cancel', p_idempotency_key, v_result);
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION app_private.complete_sale_return_before_debt_impl(p_return_id uuid, p_expected_version bigint, p_lines jsonb, p_refund_method text, p_idempotency_key uuid)
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
  v_released record;
  v_allocated numeric(20,2);
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
    select * into v_released from app_private.release_sale_inventory_shortage(v_line.original_sale_line_id,v_accepted,v_previous_qty,v_previous_cogs);
    v_returned_cogs:=v_released.returned_cogs;
    update api.sale_return_lines
    set accepted_qty = v_accepted, refund_amount = v_refund
    where id = v_line.id;
    if v_accepted > 0 then
      v_new_qty:=v_line.on_hand_qty+v_accepted;
      insert into api.stock_movements(product_id,movement_type,quantity_delta,quantity_after,reference_type,reference_id,occurred_at,actor_id,note,correlation_id)
      values(v_line.product_id,'SALE_RETURN',v_accepted,v_new_qty,'SALE_RETURN',p_return_id,now(),v_actor,'Hoàn tất trả hàng',v_correlation) returning id into v_movement_id;
      v_allocated:=app_private.allocate_inbound_inventory_cost(v_line.product_id,v_accepted-v_released.cancelled_qty,v_returned_cogs,v_movement_id);
      v_new_value:=round(v_line.inventory_value+v_returned_cogs-v_allocated,2);
      v_new_average:=case when v_new_qty>0 then round(v_new_value/v_new_qty,6) else 0 end;
      update api.inventory_balances set on_hand_qty=v_new_qty,version=version+1,updated_at=now() where product_id=v_line.product_id;
      update app_private.inventory_cost_balances set inventory_value=v_new_value,avg_unit_cost=v_new_average,version=version+1,updated_at=now() where product_id=v_line.product_id;
      insert into app_private.inventory_cost_movements(stock_movement_id,inventory_value_delta,cogs_delta,inventory_value_after,avg_unit_cost_after,occurred_at)
      values(v_movement_id,v_returned_cogs-v_allocated,-v_returned_cogs+v_allocated,v_new_value,v_new_average,now());
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

CREATE OR REPLACE FUNCTION app_private.post_stock_count_impl(p_count_id uuid, p_expected_version bigint, p_estimated_costs jsonb, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_correlation uuid := gen_random_uuid();
  v_count api.stock_counts%rowtype;
  v_cached jsonb;
  v_result jsonb;
  v_line record;
  v_estimate text;
  v_unit_cost numeric(20,6);
  v_value_delta numeric(20,2);
  v_new_qty numeric(18,0);
  v_new_value numeric(20,2);
  v_new_average numeric(20,6);
  v_movement_id uuid;
  v_number text;
  v_version bigint;
  v_allocated numeric(20,2);
begin
  if v_actor is null or not app_private.has_permission('inventory.adjustment.post') then
    return app_private.command_error('PERMISSION_DENIED', 'Chỉ chủ cửa hàng được ghi sổ kiểm kho.', v_correlation);
  end if;
  if p_count_id is null or p_expected_version is null or p_idempotency_key is null
    or jsonb_typeof(coalesce(p_estimated_costs, '[]'::jsonb)) <> 'array'
    or exists (
      select 1 from jsonb_array_elements(coalesce(p_estimated_costs, '[]'::jsonb)) item
      where jsonb_typeof(item) <> 'object'
        or item - array['stockCountLineId', 'estimatedUnitCost'] <> '{}'::jsonb
        or coalesce(item ->> 'stockCountLineId', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        or coalesce(item ->> 'estimatedUnitCost', '') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$'
        or (item ->> 'estimatedUnitCost')::numeric < 0
    ) or exists (
      select 1 from jsonb_array_elements(coalesce(p_estimated_costs, '[]'::jsonb)) item
      group by item ->> 'stockCountLineId' having count(*) > 1
    ) then
    return app_private.command_error('VALIDATION_FAILED', 'Đơn giá vốn ước tính chưa đúng định dạng quốc tế.', v_correlation);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':stock.count.post:' || p_idempotency_key::text, 0));
  v_cached := app_private.cached_command_response(v_actor, 'stock.count.post', p_idempotency_key);
  if v_cached is not null then return v_cached; end if;
  select * into v_count from api.stock_counts where id = p_count_id for update;
  if not found or v_count.count_type <> 'PERIODIC' or v_count.status <> 'COUNTED' then
    return app_private.command_error('INVALID_STATE', 'Phiếu kiểm kho chưa được xác nhận để ghi sổ.', v_correlation);
  end if;
  if v_count.version <> p_expected_version then
    return app_private.command_error_with_details('VERSION_CONFLICT', 'Phiếu kiểm kho đã được cập nhật. Vui lòng tải lại.', jsonb_build_object('currentVersion', v_count.version), v_correlation);
  end if;
  perform 1 from api.inventory_balances balance
  join api.stock_count_lines line on line.product_id = balance.product_id
  where line.stock_count_id = p_count_id order by balance.product_id for update of balance;
  perform 1 from app_private.inventory_cost_balances balance
  join api.stock_count_lines line on line.product_id = balance.product_id
  where line.stock_count_id = p_count_id order by balance.product_id for update of balance;
  if exists (
    select 1 from api.stock_count_lines line
    join api.inventory_balances balance on balance.product_id = line.product_id
    where line.stock_count_id = p_count_id
      and (line.counted_qty is null or line.inventory_version_snapshot <> balance.version)
  ) then
    return app_private.command_error_with_details(
      'STALE_STOCK_COUNT', 'Tồn kho đã thay đổi. Vui lòng kiểm tra và đếm lại.',
      jsonb_build_object('productIds', coalesce((select jsonb_agg(line.product_id)
        from api.stock_count_lines line join api.inventory_balances balance on balance.product_id = line.product_id
        where line.stock_count_id = p_count_id
          and (line.counted_qty is null or line.inventory_version_snapshot <> balance.version)), '[]'::jsonb)),
      v_correlation
    );
  end if;
  if exists(select 1 from api.stock_count_lines l join api.inventory_balances b on b.product_id=l.product_id
    where l.stock_count_id=p_count_id and l.difference_qty>0 and b.on_hand_qty<=0
    and not exists(select 1 from jsonb_array_elements(coalesce(p_estimated_costs,'[]'::jsonb)) item
      where (item->>'stockCountLineId')::uuid=l.id)) then
    return app_private.command_error('VALIDATION_FAILED','Vui lòng nhập đơn giá vốn ước tính cho phần tồn tăng từ 0 hoặc âm.',v_correlation);
  end if;
  for v_line in
    select line.*, quantity_balance.on_hand_qty, cost_balance.inventory_value, cost_balance.avg_unit_cost
    from api.stock_count_lines line
    join api.inventory_balances quantity_balance on quantity_balance.product_id = line.product_id
    join app_private.inventory_cost_balances cost_balance on cost_balance.product_id = line.product_id
    where line.stock_count_id = p_count_id order by line.product_id
  loop
    if v_line.difference_qty = 0 then continue; end if;
    v_new_qty := v_line.counted_qty;
    if v_line.difference_qty > 0 and v_line.on_hand_qty <= 0 and v_line.inventory_value = 0 then
      select item ->> 'estimatedUnitCost' into v_estimate
      from jsonb_array_elements(coalesce(p_estimated_costs, '[]'::jsonb)) item
      where (item ->> 'stockCountLineId')::uuid = v_line.id;
      if v_estimate is null then
        return app_private.command_error('VALIDATION_FAILED', 'Vui lòng nhập đơn giá vốn ước tính cho phần tồn tăng từ 0.', v_correlation);
      end if;
      v_unit_cost := v_estimate::numeric;
      v_value_delta := round(v_line.difference_qty * v_unit_cost, 2);
      insert into app_private.stock_count_adjustment_costs(
        stock_count_line_id, applied_unit_cost, inventory_value_delta, source, entered_by
      ) values (v_line.id, v_unit_cost, v_value_delta, 'OWNER_ESTIMATE', v_actor);
    else
      v_unit_cost := v_line.avg_unit_cost;
      if v_new_qty = 0 then v_value_delta := -v_line.inventory_value;
      else v_value_delta := round(v_line.difference_qty * v_unit_cost, 2); end if;
      insert into app_private.stock_count_adjustment_costs(
        stock_count_line_id, applied_unit_cost, inventory_value_delta, source, entered_by
      ) values (v_line.id, v_unit_cost, v_value_delta, 'CURRENT_AVERAGE', v_actor);
    end if;
    insert into api.stock_movements(product_id, movement_type, quantity_delta, quantity_after, reference_type, reference_id, occurred_at, actor_id, note, correlation_id)
    values (v_line.product_id, 'STOCK_ADJUSTMENT', v_line.difference_qty, v_new_qty,
      'STOCK_COUNT', p_count_id, now(), v_actor, 'Điều chỉnh từ kiểm kho', v_correlation)
    returning id into v_movement_id;
    v_allocated:=case when v_line.difference_qty>0 then
      app_private.allocate_inbound_inventory_cost(v_line.product_id,v_line.difference_qty,v_value_delta,v_movement_id) else 0 end;
    v_value_delta:=v_value_delta-v_allocated;
    v_new_value:=greatest(round(v_line.inventory_value+v_value_delta,2),0);
    v_new_average:=case when v_new_qty>0 then round(v_new_value/v_new_qty,6) else 0 end;
    update app_private.stock_count_adjustment_costs set inventory_value_delta=v_value_delta where stock_count_line_id=v_line.id;
    update api.inventory_balances set on_hand_qty=v_new_qty,version=version+1,updated_at=now() where product_id=v_line.product_id;
    update app_private.inventory_cost_balances set inventory_value=v_new_value,avg_unit_cost=v_new_average,version=version+1,updated_at=now() where product_id=v_line.product_id;
    insert into app_private.inventory_cost_movements(stock_movement_id, inventory_value_delta, cogs_delta, inventory_value_after, avg_unit_cost_after, occurred_at)
    values (v_movement_id, v_value_delta, v_allocated, v_new_value, v_new_average, now());
  end loop;
  v_number := app_private.next_document_number_impl('STOCK_COUNT');
  update api.stock_counts
  set count_number = v_number, status = 'POSTED', posted_by = v_actor, posted_at = now(),
      version = version + 1, updated_at = now(), correlation_id = v_correlation
  where id = p_count_id returning version into v_version;
  insert into api.user_notifications(user_id, severity, category, title, message, action_route, entity_type, entity_id, dedupe_key, correlation_id)
  select v_count.created_by, 'SUCCESS', 'INVENTORY', 'Phiếu kiểm kho đã ghi sổ',
    'Phiếu ' || v_number || ' đã được ghi sổ.', '/stock-counts/' || p_count_id::text,
    'stock_count', p_count_id, 'stock-count-post:' || p_count_id::text, v_correlation
  where v_count.created_by <> v_actor
  on conflict do nothing;
  insert into app_private.audit_events(actor_id, action, entity_type, entity_id, after_data, correlation_id)
  values (v_actor, 'stock_count.posted', 'stock_count', p_count_id,
    jsonb_build_object('countNumber', v_number), v_correlation);
  v_result := app_private.command_success(jsonb_build_object('countId', p_count_id, 'countNumber', v_number, 'status', 'POSTED', 'version', v_version), v_correlation);
  insert into app_private.command_deduplication(actor_id, command_name, idempotency_key, response)
  values (v_actor, 'stock.count.post', p_idempotency_key, v_result);
  return v_result;
exception when invalid_text_representation or numeric_value_out_of_range then
  return app_private.command_error('VALIDATION_FAILED', 'Dữ liệu kiểm kho chưa đúng định dạng quốc tế.', v_correlation);
end;
$function$;

CREATE OR REPLACE FUNCTION app_private.get_stock_count_impl(p_count_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_correlation uuid := gen_random_uuid();
  v_count api.stock_counts%rowtype;
begin
  if v_actor is null or not app_private.has_permission('inventory.count.draft') then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền xem phiếu kiểm kho.', v_correlation);
  end if;
  select * into v_count from api.stock_counts where id = p_count_id;
  if not found or v_count.count_type <> 'PERIODIC'
    or (v_count.created_by <> v_actor and not app_private.has_permission('inventory.adjustment.post')) then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền xem phiếu kiểm kho này.', v_correlation);
  end if;
  return app_private.command_success(jsonb_build_object(
    'id', v_count.id, 'countNumber', v_count.count_number, 'status', v_count.status,
    'note', v_count.note, 'version', v_count.version,
    'createdByName', (select display_name from api.profiles where id = v_count.created_by),
    'createdAt', v_count.created_at, 'submittedAt', v_count.submitted_at,
    'postedAt', v_count.posted_at, 'cancelReason', v_count.cancel_reason,
    'canPost', app_private.has_permission('inventory.adjustment.post'),
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
      'id', line.id, 'productId', line.product_id, 'productName', line.product_name,
      'sku', line.sku, 'unitName', line.unit_name,
      'systemQtySnapshot', line.system_qty_snapshot::text,
      'inventoryVersionSnapshot', line.inventory_version_snapshot,
      'countedQty', line.counted_qty::text,
      'differenceQty', line.difference_qty::text, 'lineOrder', line.line_order,
      'requiresEstimatedCost', line.difference_qty > 0 and balance.on_hand_qty <= 0
        and cost_balance.inventory_value = 0
    ) order by line.line_order)
    from api.stock_count_lines line
    join api.inventory_balances balance on balance.product_id = line.product_id
    join app_private.inventory_cost_balances cost_balance on cost_balance.product_id = line.product_id
    where line.stock_count_id = v_count.id), '[]'::jsonb)
  ), v_correlation);
end;
$function$;

CREATE OR REPLACE FUNCTION app_private.get_product_catalog_impl(p_search text DEFAULT NULL::text, p_category_id uuid DEFAULT NULL::uuid, p_stock_state text DEFAULT NULL::text, p_include_inactive boolean DEFAULT false, p_cursor_name text DEFAULT NULL::text, p_cursor_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_correlation_id uuid := gen_random_uuid();
  v_search text := app_private.normalize_catalog_key(coalesce(p_search, ''));
  v_items jsonb := '[]'::jsonb;
  v_last_name text;
  v_last_id uuid;
  v_count integer := 0;
begin
  if not app_private.has_permission('catalog.read') then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền xem danh mục hàng hóa.',
      v_correlation_id
    );
  end if;

  if p_include_inactive and not app_private.has_permission('catalog.basic.manage') then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền xem hàng hóa đã ngừng hoạt động.',
      v_correlation_id
    );
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100
    or coalesce(p_stock_state, 'ALL') not in (
      'ALL', 'IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'
    )
    or ((p_cursor_name is null) <> (p_cursor_id is null))
  then
    return app_private.command_error(
      'VALIDATION_FAILED',
      'Bộ lọc danh mục chưa hợp lệ.',
      v_correlation_id
    );
  end if;

  with candidates as (
    select
      catalog.*,
      case
        when v_search <> '' and (
          catalog.sku_normalized = v_search
          or lower(coalesce(catalog.barcode, '')) = v_search
        ) then 0
        else 1
      end as search_rank
    from api.product_catalog_read as catalog
    where (p_include_inactive or catalog.is_active)
      and (p_category_id is null or catalog.category_id = p_category_id)
      and (
        v_search = ''
        or catalog.sku_normalized = v_search
        or lower(coalesce(catalog.barcode, '')) = v_search
        or catalog.name_normalized like '%' || v_search || '%'
      )
      and (
        coalesce(p_stock_state, 'ALL') = 'ALL'
        or (
          p_stock_state = 'OUT_OF_STOCK'
          and coalesce(catalog.on_hand_qty, 0) <= 0
        )
        or (
          p_stock_state = 'LOW_STOCK'
          and coalesce(catalog.on_hand_qty, 0) < app_private.low_stock_threshold(catalog.unit_name,catalog.min_stock_qty)
        )
        or (
          p_stock_state = 'IN_STOCK'
          and coalesce(catalog.on_hand_qty, 0) > 0 and coalesce(catalog.on_hand_qty, 0) >= app_private.low_stock_threshold(catalog.unit_name,catalog.min_stock_qty)
        )
      )
      and (
        p_cursor_name is null
        or (catalog.name_normalized, catalog.id) > (p_cursor_name, p_cursor_id)
      )
    order by search_rank, catalog.name_normalized, catalog.id
    limit p_limit
  ), serialized as (
    select
      c.*,
      jsonb_build_object(
        'id', c.id,
        'sku', c.sku,
        'barcode', c.barcode,
        'name', c.name,
        'categoryId', c.category_id,
        'categoryName', c.category_name,
        'unitName', c.unit_name,
        'minStockQty', c.min_stock_qty::text, 'effectiveMinStockQty', app_private.low_stock_threshold(c.unit_name,c.min_stock_qty)::text,
        'isActive', c.is_active,
        'version', c.version,
        'primaryImagePath', c.primary_image_path,
        'currentSalePrice', case when app_private.has_permission('pricing.sale.read') then c.current_sale_price::text else null end,
        'defaultCost', case when app_private.has_permission('purchase.cost.read') then
        (select unit_cost::text from app_private.product_default_costs dc where dc.product_id=c.id) else null end,
      'onHandQty', coalesce(c.on_hand_qty, 0)::text
      ) as item
    from candidates as c
  )
  select
    coalesce(jsonb_agg(s.item order by s.search_rank, s.name_normalized, s.id), '[]'::jsonb),
    count(*)::integer
  into v_items, v_count
  from serialized as s;

  if v_count > 0 then
    select c.name_normalized, c.id
    into v_last_name, v_last_id
    from api.product_catalog_read as c
    where c.id = (v_items -> (v_count - 1) ->> 'id')::uuid;
  end if;

  return app_private.command_success(
    jsonb_build_object(
      'items', v_items,
      'nextCursor', case when v_count = p_limit then jsonb_build_object(
        'name', v_last_name,
        'id', v_last_id
      ) else null end
    ),
    v_correlation_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION app_private.get_operational_dashboard_impl(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_correlation_id uuid := gen_random_uuid(); v_actor uuid := (select auth.uid());
begin
  if not app_private.has_permission('dashboard.operational.read') then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền xem tổng quan.', v_correlation_id);
  end if;
  if not app_private.report_period_is_valid(p_from, p_to) then
    return app_private.command_error('REPORT_DATE_RANGE_INVALID', 'Khoảng thời gian báo cáo chưa hợp lệ.', v_correlation_id);
  end if;
  return app_private.command_success(jsonb_build_object(
    'version', 1, 'timezone', 'Asia/Ho_Chi_Minh',
    'catalog', (select jsonb_build_object(
      'activeProductCount', count(*) filter (where product.is_active)::integer,
      'outOfStockCount', count(*) filter (where product.is_active and balance.on_hand_qty <= 0)::integer,
      'lowStockCount', count(*) filter (where product.is_active and balance.on_hand_qty < app_private.low_stock_threshold(product.unit_name,product.min_stock_qty))::integer,
      'totalOnHandQty', coalesce(sum(balance.on_hand_qty) filter (where product.is_active), 0)::text
    ) from api.products product join api.inventory_balances balance on balance.product_id = product.id),
    'pending', jsonb_build_object(
      'purchaseReceipts', (select count(*)::integer from api.purchase_receipts receipt where receipt.status = 'AWAITING_COST' and (app_private.has_permission('purchase.cost.enter') or receipt.created_by = v_actor)),
      'stockCounts', (select count(*)::integer from api.stock_counts count_document where count_document.status = 'COUNTED' and (app_private.has_permission('inventory.adjustment.post') or count_document.created_by = v_actor)),
      'saleReturns', (select count(*)::integer from api.sale_returns return_document where return_document.status = 'REQUESTED' and (app_private.has_permission('return.complete') or return_document.created_by = v_actor))
    )
  ), v_correlation_id);
end;
$function$;

notify pgrst, 'reload schema';
commit;
