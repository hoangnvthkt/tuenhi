-- Phase 1D: operational sales, payments, immutable invoice snapshots and store settings.

alter table app_private.document_sequences
  drop constraint document_sequences_document_type_check;
alter table app_private.document_sequences
  add constraint document_sequences_document_type_check check (
    document_type in ('PURCHASE_RECEIPT', 'STOCK_COUNT', 'SALE')
  );
insert into app_private.document_sequences (document_type, prefix)
values ('SALE', 'HD') on conflict (document_type) do nothing;

alter table api.stock_movements
  drop constraint stock_movements_movement_type_check,
  drop constraint stock_movements_reference_type_check;
alter table api.stock_movements
  add constraint stock_movements_movement_type_check check (
    movement_type in ('OPENING', 'PURCHASE_RECEIPT', 'PURCHASE_REVERSAL', 'SALE')
  ),
  add constraint stock_movements_reference_type_check check (
    reference_type in ('PURCHASE_RECEIPT', 'STOCK_COUNT', 'SALE')
  );

create table api.store_settings (
  id smallint primary key default 1 check (id = 1),
  display_name text not null check (display_name = btrim(display_name) and length(display_name) between 1 and 160),
  logo_path text null check (logo_path is null or (logo_path = btrim(logo_path) and logo_path ~ '^store/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$')),
  address text null check (address is null or (address = btrim(address) and length(address) between 1 and 500)),
  contact_phone text null check (contact_phone is null or (contact_phone = btrim(contact_phone) and length(contact_phone) between 1 and 30)),
  zalo text null check (zalo is null or (zalo = btrim(zalo) and length(zalo) between 1 and 30)),
  invoice_footer text null check (invoice_footer is null or (invoice_footer = btrim(invoice_footer) and length(invoice_footer) between 1 and 1000)),
  version bigint not null default 1 check (version >= 1),
  updated_by uuid references api.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into api.store_settings (id, display_name) values (1, 'Tuệ Nhi') on conflict (id) do nothing;

create table api.sales (
  id uuid primary key default gen_random_uuid(),
  sale_number text unique,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'COMPLETED', 'PARTIALLY_RETURNED', 'RETURNED', 'CANCELLED')),
  customer_id uuid references api.customers(id) on delete restrict,
  sales_channel_id uuid not null references api.sales_channels(id) on delete restrict,
  sales_channel_code_snapshot text,
  sales_channel_name_snapshot text,
  customer_name_snapshot text,
  customer_phone_snapshot text,
  staff_name_snapshot text,
  subtotal numeric(20,2) not null default 0 check (subtotal >= 0),
  line_discount_total numeric(20,2) not null default 0 check (line_discount_total >= 0),
  order_discount_total numeric(20,2) not null default 0 check (order_discount_total >= 0),
  discount_total numeric(20,2) not null default 0 check (discount_total >= 0),
  net_total numeric(20,2) not null default 0 check (net_total >= 0),
  note text null check (note is null or (note = btrim(note) and length(note) between 1 and 1000)),
  created_by uuid not null references api.profiles(id) on delete restrict,
  completed_by uuid references api.profiles(id) on delete restrict,
  completed_at timestamptz,
  version bigint not null default 1 check (version >= 1),
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'DRAFT') = (sale_number is null)),
  check ((status <> 'DRAFT') = (completed_at is not null)),
  check (discount_total = line_discount_total + order_discount_total)
);
create index sales_creator_sort_idx on api.sales(created_by, coalesce(completed_at, updated_at) desc, id desc);
create index sales_status_sort_idx on api.sales(status, coalesce(completed_at, updated_at) desc, id desc);
create index sales_channel_sort_idx on api.sales(sales_channel_id, completed_at desc, id desc);

create table api.sale_lines (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references api.sales(id) on delete cascade,
  product_id uuid not null references api.products(id) on delete restrict,
  product_name text not null check (length(product_name) between 1 and 200),
  sku text not null check (length(sku) between 1 and 64),
  unit_name text not null check (length(unit_name) between 1 and 50),
  quantity numeric(18,3) not null check (quantity > 0),
  unit_sale_price numeric(18,2) not null check (unit_sale_price >= 0),
  gross_amount numeric(20,2) not null check (gross_amount >= 0),
  line_discount_amount numeric(20,2) not null default 0 check (line_discount_amount >= 0),
  allocated_order_discount numeric(20,2) not null default 0 check (allocated_order_discount >= 0),
  net_amount numeric(20,2) not null check (net_amount >= 0),
  line_order integer not null check (line_order >= 0),
  created_at timestamptz not null default now(),
  unique(sale_id, product_id), unique(sale_id, line_order),
  check (line_discount_amount <= gross_amount),
  check (net_amount = gross_amount - line_discount_amount - allocated_order_discount)
);
create index sale_lines_product_idx on api.sale_lines(product_id, sale_id);

create table api.payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null unique references api.sales(id) on delete restrict,
  method text not null check (method in ('CASH', 'BANK_TRANSFER')),
  amount numeric(20,2) not null check (amount >= 0),
  status text not null check (status in ('CAPTURED', 'REVERSED')),
  paid_at timestamptz not null default now(),
  captured_by uuid not null references api.profiles(id) on delete restrict,
  correlation_id uuid not null
);

create table app_private.sale_line_costs (
  sale_line_id uuid primary key references api.sale_lines(id) on delete restrict,
  unit_cost_snapshot numeric(20,6) not null check (unit_cost_snapshot >= 0),
  cogs_total_snapshot numeric(20,2) not null check (cogs_total_snapshot >= 0),
  created_at timestamptz not null default now()
);
create table app_private.sale_invoice_store_snapshots (
  sale_id uuid primary key references api.sales(id) on delete restrict,
  display_name text not null,
  logo_path text,
  address text,
  contact_phone text,
  zalo text,
  invoice_footer text,
  created_at timestamptz not null default now()
);
create table app_private.sales_financial_events (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null unique references api.sales(id) on delete restrict,
  event_type text not null check (event_type = 'SALE_COMPLETED'),
  gross_sales numeric(20,2) not null,
  discount_total numeric(20,2) not null,
  net_revenue numeric(20,2) not null,
  attributed_user_id uuid not null references api.profiles(id) on delete restrict,
  occurred_at timestamptz not null,
  correlation_id uuid not null
);

alter table api.store_settings enable row level security;
alter table api.store_settings force row level security;
alter table api.sales enable row level security;
alter table api.sales force row level security;
alter table api.sale_lines enable row level security;
alter table api.sale_lines force row level security;
alter table api.payments enable row level security;
alter table api.payments force row level security;
alter table app_private.sale_line_costs enable row level security;
alter table app_private.sale_line_costs force row level security;
alter table app_private.sale_invoice_store_snapshots enable row level security;
alter table app_private.sale_invoice_store_snapshots force row level security;
alter table app_private.sales_financial_events enable row level security;
alter table app_private.sales_financial_events force row level security;
revoke all on api.store_settings, api.sales, api.sale_lines, api.payments from public, anon, authenticated;
revoke all on app_private.sale_line_costs, app_private.sale_invoice_store_snapshots, app_private.sales_financial_events from public, anon, authenticated;
grant all on api.store_settings, api.sales, api.sale_lines, api.payments to service_role;
grant all on app_private.sale_line_costs, app_private.sale_invoice_store_snapshots, app_private.sales_financial_events to service_role;

create function app_private.sale_draft_json(p_sale_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'saleNumber', s.sale_number, 'status', s.status,
    'customerId', s.customer_id, 'salesChannelId', s.sales_channel_id,
    'subtotal', s.subtotal::text, 'lineDiscountTotal', s.line_discount_total::text,
    'orderDiscountTotal', s.order_discount_total::text, 'discountTotal', s.discount_total::text,
    'netTotal', s.net_total::text, 'note', s.note, 'createdBy', s.created_by,
    'version', s.version, 'createdAt', s.created_at, 'updatedAt', s.updated_at,
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
      'id', l.id, 'productId', l.product_id, 'productName', l.product_name,
      'sku', l.sku, 'unitName', l.unit_name, 'quantity', l.quantity::text,
      'unitSalePrice', l.unit_sale_price::text, 'grossAmount', l.gross_amount::text,
      'lineDiscountAmount', l.line_discount_amount::text,
      'allocatedOrderDiscount', l.allocated_order_discount::text,
      'netAmount', l.net_amount::text, 'lineOrder', l.line_order
    ) order by l.line_order) from api.sale_lines l where l.sale_id = s.id), '[]'::jsonb)
  ) from api.sales s where s.id = p_sale_id;
$$;

create function app_private.recalculate_sale_draft_impl(p_sale_id uuid, p_order_discount numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare v_base numeric(20,2); v_allocated numeric(20,2) := 0; v_last uuid; v_line record; v_alloc numeric(20,2);
begin
  select coalesce(sum(gross_amount - line_discount_amount), 0),
    (array_agg(id order by line_order desc) filter (where gross_amount - line_discount_amount > 0))[1]
  into v_base, v_last from api.sale_lines where sale_id = p_sale_id;
  if p_order_discount < 0 or p_order_discount > v_base or (v_base = 0 and p_order_discount <> 0) then
    raise exception 'ORDER_DISCOUNT_EXCEEDED';
  end if;
  for v_line in select * from api.sale_lines where sale_id = p_sale_id order by line_order loop
    if v_line.id = v_last then v_alloc := p_order_discount - v_allocated;
    elsif v_base = 0 then v_alloc := 0;
    else v_alloc := round(p_order_discount * (v_line.gross_amount - v_line.line_discount_amount) / v_base, 2); end if;
    v_allocated := v_allocated + v_alloc;
    update api.sale_lines set allocated_order_discount = v_alloc,
      net_amount = gross_amount - line_discount_amount - v_alloc where id = v_line.id;
  end loop;
  update api.sales set subtotal = (select coalesce(sum(gross_amount), 0) from api.sale_lines where sale_id = p_sale_id),
    line_discount_total = (select coalesce(sum(line_discount_amount), 0) from api.sale_lines where sale_id = p_sale_id),
    order_discount_total = p_order_discount,
    discount_total = (select coalesce(sum(line_discount_amount), 0) from api.sale_lines where sale_id = p_sale_id) + p_order_discount,
    net_total = (select coalesce(sum(net_amount), 0) from api.sale_lines where sale_id = p_sale_id)
  where id = p_sale_id;
end;
$$;

create function app_private.save_sale_draft_impl(
  p_sale_id uuid, p_expected_version bigint, p_customer_id uuid, p_sales_channel_id uuid,
  p_lines jsonb, p_order_discount text, p_note text, p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_correlation uuid := gen_random_uuid(); v_id uuid := coalesce(p_sale_id, gen_random_uuid());
  v_sale api.sales%rowtype; v_cached jsonb; v_result jsonb; v_order numeric(20,2); v_note text := app_private.empty_to_null(p_note); v_version bigint;
begin
  if v_actor is null or not app_private.has_permission('sale.draft.manage') then return app_private.command_error('PERMISSION_DENIED','Bạn không có quyền lập hóa đơn nháp.',v_correlation); end if;
  if p_idempotency_key is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then return app_private.command_error('VALIDATION_FAILED','Giỏ hàng phải có ít nhất một sản phẩm.',v_correlation); end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':sale.save:' || p_idempotency_key::text, 0));
  select response into v_cached from app_private.command_deduplication where actor_id=v_actor and command_name='sale.save' and idempotency_key=p_idempotency_key;
  if found then return v_cached; end if;
  begin v_order := p_order_discount::numeric; exception when others then return app_private.command_error('VALIDATION_FAILED','Giảm giá toàn đơn chưa đúng định dạng quốc tế.',v_correlation); end;
  if v_order < 0 or v_note is not null and length(v_note) > 1000 or not exists(select 1 from api.sales_channels c where c.id=p_sales_channel_id and c.is_active) then return app_private.command_error('VALIDATION_FAILED','Thông tin hóa đơn nháp chưa hợp lệ.',v_correlation); end if;
  if p_customer_id is not null and not exists(select 1 from api.customers c where c.id=p_customer_id and c.is_active) then return app_private.command_error('VALIDATION_FAILED','Khách hàng đã ngừng sử dụng hoặc không tồn tại.',v_correlation); end if;
  if exists(select 1 from jsonb_to_recordset(p_lines) as x("productId" uuid, quantity text, "lineDiscountAmount" text, "lineOrder" integer) group by "productId" having count(*)>1) then return app_private.command_error('VALIDATION_FAILED','Một sản phẩm chỉ được xuất hiện một lần trong hóa đơn.',v_correlation); end if;
  if exists(select 1 from jsonb_to_recordset(p_lines) as x("productId" uuid, quantity text, "lineDiscountAmount" text, "lineOrder" integer) left join api.products p on p.id=x."productId" left join app_private.product_sale_prices price on price.product_id=p.id and price.valid_to is null where p.id is null or not p.is_active or price.id is null) then return app_private.command_error('VALIDATION_FAILED','Có sản phẩm đã ngừng bán hoặc chưa có giá bán.',v_correlation); end if;
  if p_sale_id is null then insert into api.sales(id, customer_id, sales_channel_id, note, created_by, correlation_id) values(v_id,p_customer_id,p_sales_channel_id,v_note,v_actor,v_correlation);
  else
    select * into v_sale from api.sales where id=p_sale_id for update;
    if not found or v_sale.created_by <> v_actor then return app_private.command_error('PERMISSION_DENIED','Bạn chỉ được sửa hóa đơn nháp của mình.',v_correlation); end if;
    if v_sale.status <> 'DRAFT' then return app_private.command_error('INVALID_STATE','Hóa đơn này không còn là bản nháp.',v_correlation); end if;
    if p_expected_version is null or v_sale.version <> p_expected_version then return app_private.command_error_with_details('VERSION_CONFLICT','Hóa đơn nháp đã được cập nhật. Vui lòng tải lại.',jsonb_build_object('currentVersion',v_sale.version),v_correlation); end if;
    update api.sales set customer_id=p_customer_id,sales_channel_id=p_sales_channel_id,note=v_note,version=version+1,updated_at=now(),correlation_id=v_correlation where id=v_id;
    delete from api.sale_lines where sale_id=v_id;
  end if;
  insert into api.sale_lines(sale_id,product_id,product_name,sku,unit_name,quantity,unit_sale_price,gross_amount,line_discount_amount,net_amount,line_order)
  select v_id,p.id,p.name,p.sku,p.unit_name,x.quantity::numeric,price.sale_price,
    round(x.quantity::numeric*price.sale_price,2),coalesce(x."lineDiscountAmount",'0')::numeric,
    round(x.quantity::numeric*price.sale_price,2)-coalesce(x."lineDiscountAmount",'0')::numeric,x."lineOrder"
  from jsonb_to_recordset(p_lines) as x("productId" uuid,quantity text,"lineDiscountAmount" text,"lineOrder" integer)
  join api.products p on p.id=x."productId" join app_private.product_sale_prices price on price.product_id=p.id and price.valid_to is null;
  if exists(select 1 from api.sale_lines where sale_id=v_id and (quantity<=0 or line_discount_amount>gross_amount or line_discount_amount<0)) then return app_private.command_error('LINE_DISCOUNT_EXCEEDED','Giảm giá từng dòng không được vượt tiền hàng.',v_correlation); end if;
  if (v_order > 0 or exists(select 1 from api.sale_lines where sale_id=v_id and line_discount_amount > 0)) and not app_private.has_permission('sale.discount.apply') then return app_private.command_error('PERMISSION_DENIED','Bạn không có quyền áp dụng giảm giá.',v_correlation); end if;
  begin perform app_private.recalculate_sale_draft_impl(v_id,v_order); exception when others then return app_private.command_error('ORDER_DISCOUNT_EXCEEDED','Giảm giá toàn đơn vượt số tiền còn lại.',v_correlation); end;
  select version into v_version from api.sales where id=v_id;
  v_result:=app_private.command_success(jsonb_build_object('sale',app_private.sale_draft_json(v_id),'priceRefreshed',true),v_correlation);
  insert into app_private.command_deduplication(actor_id,command_name,idempotency_key,response) values(v_actor,'sale.save',p_idempotency_key,v_result);
  return v_result;
exception when invalid_text_representation or numeric_value_out_of_range then return app_private.command_error('VALIDATION_FAILED','Số lượng hoặc giảm giá chưa đúng định dạng quốc tế.',v_correlation); end;
$$;

create function app_private.discard_sale_draft_impl(p_sale_id uuid,p_expected_version bigint,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_sale api.sales%rowtype; v_correlation uuid:=gen_random_uuid(); v_result jsonb; v_cached jsonb;
begin
 if v_actor is null or not app_private.has_permission('sale.draft.manage') then return app_private.command_error('PERMISSION_DENIED','Bạn không có quyền bỏ hóa đơn nháp.',v_correlation); end if;
 if p_idempotency_key is null then return app_private.command_error('VALIDATION_FAILED','Yêu cầu chưa hợp lệ.',v_correlation); end if;
 perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':sale.discard:'||p_idempotency_key::text,0)); select response into v_cached from app_private.command_deduplication where actor_id=v_actor and command_name='sale.discard' and idempotency_key=p_idempotency_key; if found then return v_cached; end if;
 select * into v_sale from api.sales where id=p_sale_id for update;
 if not found or v_sale.created_by<>v_actor or v_sale.status<>'DRAFT' then return app_private.command_error('INVALID_STATE','Không thể bỏ hóa đơn nháp này.',v_correlation); end if;
 if v_sale.version<>p_expected_version then return app_private.command_error('VERSION_CONFLICT','Hóa đơn nháp đã được cập nhật. Vui lòng tải lại.',v_correlation); end if;
 delete from api.sales where id=p_sale_id; insert into app_private.audit_events(actor_id,action,entity_type,entity_id,after_data,correlation_id) values(v_actor,'sale.draft_discarded','sale',p_sale_id,jsonb_build_object('status','DISCARDED'),v_correlation);
 v_result:=app_private.command_success(jsonb_build_object('saleId',p_sale_id,'discarded',true),v_correlation); insert into app_private.command_deduplication(actor_id,command_name,idempotency_key,response) values(v_actor,'sale.discard',p_idempotency_key,v_result); return v_result;
end;
$$;

create function app_private.complete_sale_impl(p_sale_id uuid,p_expected_version bigint,p_payment_method text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=(select auth.uid()); v_sale api.sales%rowtype; v_correlation uuid:=gen_random_uuid(); v_cached jsonb; v_result jsonb; v_line record; v_movement uuid; v_new_qty numeric(18,3); v_new_value numeric(20,2); v_new_avg numeric(20,6); v_cogs numeric(20,2); v_number text; v_channel api.sales_channels%rowtype; v_store api.store_settings%rowtype; v_customer api.customers%rowtype; v_profile api.profiles%rowtype;
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
   v_new_qty:=v_line.on_hand_qty-v_line.quantity; v_cogs:=round(v_line.quantity*v_line.avg_unit_cost,2);
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
 insert into app_private.sales_financial_events(sale_id,event_type,gross_sales,discount_total,net_revenue,attributed_user_id,occurred_at,correlation_id) values(p_sale_id,'SALE_COMPLETED',v_sale.subtotal,v_sale.discount_total,v_sale.net_total,v_sale.created_by,v_sale.completed_at,v_correlation);
 insert into app_private.audit_events(actor_id,action,entity_type,entity_id,after_data,correlation_id) values(v_actor,'sale.completed','sale',p_sale_id,jsonb_build_object('saleNumber',v_number,'netTotal',v_sale.net_total::text),v_correlation);
 v_result:=app_private.command_success(jsonb_build_object('saleId',p_sale_id,'saleNumber',v_number,'status','COMPLETED','version',v_sale.version),v_correlation); insert into app_private.command_deduplication(actor_id,command_name,idempotency_key,response) values(v_actor,'sale.complete',p_idempotency_key,v_result); return v_result;
end;
$$;

create function app_private.get_sale_detail_impl(p_sale_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=(select auth.uid()); v_sale api.sales%rowtype; v_correlation uuid:=gen_random_uuid();
begin
 if v_actor is null or not app_private.has_permission('sale.own.read') then return app_private.command_error('PERMISSION_DENIED','Bạn không có quyền xem hóa đơn.',v_correlation); end if;
 select * into v_sale from api.sales where id=p_sale_id; if not found or (v_sale.created_by<>v_actor and not app_private.has_permission('sale.all.read')) then return app_private.command_error('PERMISSION_DENIED','Bạn không có quyền xem hóa đơn này.',v_correlation); end if;
 return app_private.command_success(app_private.sale_draft_json(p_sale_id),v_correlation);
end;
$$;

create function app_private.list_sales_impl(p_filters jsonb,p_cursor_sort_at timestamptz,p_cursor_id uuid,p_limit integer default 30) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=(select auth.uid()); v_correlation uuid:=gen_random_uuid(); v_all boolean:=app_private.has_permission('sale.all.read');
begin
 if v_actor is null or not app_private.has_permission('sale.own.read') then return app_private.command_error('PERMISSION_DENIED','Bạn không có quyền xem danh sách hóa đơn.',v_correlation); end if;
 if p_limit is null or p_limit<1 or p_limit>100 then return app_private.command_error('VALIDATION_FAILED','Giới hạn danh sách chưa hợp lệ.',v_correlation); end if;
 return app_private.command_success(jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'saleNumber',s.sale_number,'status',s.status,'customerName',s.customer_name_snapshot,'channelName',coalesce(s.sales_channel_name_snapshot,c.name),'netTotal',s.net_total::text,'createdByName',p.display_name,'completedAt',s.completed_at,'sortAt',coalesce(s.completed_at,s.updated_at),'version',s.version) order by coalesce(s.completed_at,s.updated_at) desc,s.id desc) from (select s.* from api.sales s where (v_all or s.created_by=v_actor) and (p_filters is null or coalesce(p_filters->>'status','')='' or s.status=p_filters->>'status') and (coalesce(p_filters->>'search','')='' or s.sale_number ilike '%'||(p_filters->>'search')||'%' or s.customer_name_snapshot ilike '%'||(p_filters->>'search')||'%' or exists(select 1 from api.sale_lines l where l.sale_id=s.id and (l.product_name ilike '%'||(p_filters->>'search')||'%' or l.sku ilike '%'||(p_filters->>'search')||'%'))) and (p_cursor_sort_at is null or (coalesce(s.completed_at,s.updated_at),s.id)<(p_cursor_sort_at,p_cursor_id)) order by coalesce(s.completed_at,s.updated_at) desc,s.id desc limit p_limit) s join api.profiles p on p.id=s.created_by join api.sales_channels c on c.id=s.sales_channel_id),'[]'::jsonb),'nextCursor',null),v_correlation);
end;
$$;

create function app_private.get_sale_invoice_impl(p_sale_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=(select auth.uid()); v_sale api.sales%rowtype; v_correlation uuid:=gen_random_uuid();
begin
 if v_actor is null or not app_private.has_permission('sale.own.read') then return app_private.command_error('PERMISSION_DENIED','Bạn không có quyền xem hóa đơn.',v_correlation); end if;
 select * into v_sale from api.sales where id=p_sale_id; if not found or v_sale.status='DRAFT' or (v_sale.created_by<>v_actor and not app_private.has_permission('sale.all.read')) then return app_private.command_error('PERMISSION_DENIED','Bạn không có quyền xem hóa đơn này.',v_correlation); end if;
 return app_private.command_success(jsonb_build_object('version',1,'store',(select jsonb_build_object('displayName',x.display_name,'logoPath',x.logo_path,'address',x.address,'contactPhone',x.contact_phone,'zalo',x.zalo,'invoiceFooter',x.invoice_footer) from app_private.sale_invoice_store_snapshots x where x.sale_id=p_sale_id),'sale',jsonb_build_object('id',v_sale.id,'saleNumber',v_sale.sale_number,'completedAt',v_sale.completed_at,'status',v_sale.status,'channelCode',v_sale.sales_channel_code_snapshot,'channelName',v_sale.sales_channel_name_snapshot,'staffName',v_sale.staff_name_snapshot,'customerName',v_sale.customer_name_snapshot,'customerPhone',v_sale.customer_phone_snapshot,'paymentMethod',(select method from api.payments where sale_id=p_sale_id)),'lines',(select jsonb_agg(jsonb_build_object('id',l.id,'productName',l.product_name,'sku',l.sku,'unitName',l.unit_name,'quantity',l.quantity::text,'unitSalePrice',l.unit_sale_price::text,'grossAmount',l.gross_amount::text,'lineDiscountAmount',l.line_discount_amount::text,'allocatedOrderDiscount',l.allocated_order_discount::text,'netAmount',l.net_amount::text) order by l.line_order) from api.sale_lines l where l.sale_id=p_sale_id),'totals',jsonb_build_object('subtotal',v_sale.subtotal::text,'lineDiscountTotal',v_sale.line_discount_total::text,'orderDiscountTotal',v_sale.order_discount_total::text,'netTotal',v_sale.net_total::text,'capturedAmount',(select amount::text from api.payments where sale_id=p_sale_id))),v_correlation);
end;
$$;

create function app_private.get_store_settings_impl() returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_correlation uuid:=gen_random_uuid(); begin if not app_private.has_permission('settings.manage') then return app_private.command_error('PERMISSION_DENIED','Bạn không có quyền cấu hình cửa hàng.',v_correlation); end if; return app_private.command_success((select jsonb_build_object('displayName',display_name,'logoPath',logo_path,'address',address,'contactPhone',contact_phone,'zalo',zalo,'invoiceFooter',invoice_footer,'version',version) from api.store_settings where id=1),v_correlation); end;
$$;
create function app_private.save_store_settings_impl(p_expected_version bigint,p_settings jsonb,p_idempotency_key uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=(select auth.uid()); v_correlation uuid:=gen_random_uuid(); v_settings api.store_settings%rowtype; v_cached jsonb; v_result jsonb;
begin
 if v_actor is null or not app_private.has_permission('settings.manage') then return app_private.command_error('PERMISSION_DENIED','Bạn không có quyền cấu hình cửa hàng.',v_correlation); end if; if p_idempotency_key is null or jsonb_typeof(p_settings)<>'object' then return app_private.command_error('VALIDATION_FAILED','Thông tin cửa hàng chưa hợp lệ.',v_correlation); end if;
 perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':settings.store:'||p_idempotency_key::text,0)); select response into v_cached from app_private.command_deduplication where actor_id=v_actor and command_name='settings.store' and idempotency_key=p_idempotency_key; if found then return v_cached; end if;
 select * into v_settings from api.store_settings where id=1 for update; if v_settings.version<>p_expected_version then return app_private.command_error('VERSION_CONFLICT','Cấu hình cửa hàng đã được cập nhật. Vui lòng tải lại.',v_correlation); end if;
 update api.store_settings set display_name=btrim(p_settings->>'displayName'),logo_path=app_private.empty_to_null(p_settings->>'logoPath'),address=app_private.empty_to_null(p_settings->>'address'),contact_phone=app_private.empty_to_null(p_settings->>'contactPhone'),zalo=app_private.empty_to_null(p_settings->>'zalo'),invoice_footer=app_private.empty_to_null(p_settings->>'invoiceFooter'),version=version+1,updated_by=v_actor,updated_at=now() where id=1 returning * into v_settings;
 v_result:=app_private.command_success(jsonb_build_object('version',v_settings.version),v_correlation); insert into app_private.command_deduplication(actor_id,command_name,idempotency_key,response) values(v_actor,'settings.store',p_idempotency_key,v_result); return v_result;
exception when check_violation then return app_private.command_error('VALIDATION_FAILED','Thông tin cửa hàng chưa hợp lệ.',v_correlation); end;
$$;

create function api.save_sale_draft(p_sale_id uuid,p_expected_version bigint,p_customer_id uuid,p_sales_channel_id uuid,p_lines jsonb,p_order_discount text,p_note text,p_idempotency_key uuid) returns jsonb language sql security invoker set search_path='' as $$ select app_private.save_sale_draft_impl(p_sale_id,p_expected_version,p_customer_id,p_sales_channel_id,p_lines,p_order_discount,p_note,p_idempotency_key); $$;
create function api.discard_sale_draft(p_sale_id uuid,p_expected_version bigint,p_idempotency_key uuid) returns jsonb language sql security invoker set search_path='' as $$ select app_private.discard_sale_draft_impl(p_sale_id,p_expected_version,p_idempotency_key); $$;
create function api.complete_sale(p_sale_id uuid,p_expected_version bigint,p_payment_method text,p_idempotency_key uuid) returns jsonb language sql security invoker set search_path='' as $$ select app_private.complete_sale_impl(p_sale_id,p_expected_version,p_payment_method,p_idempotency_key); $$;
create function api.get_sale_detail(p_sale_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select app_private.get_sale_detail_impl(p_sale_id); $$;
create function api.list_sales(p_filters jsonb default '{}'::jsonb,p_cursor_sort_at timestamptz default null,p_cursor_id uuid default null,p_limit integer default 30) returns jsonb language sql stable security invoker set search_path='' as $$ select app_private.list_sales_impl(p_filters,p_cursor_sort_at,p_cursor_id,p_limit); $$;
create function api.get_sale_invoice(p_sale_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select app_private.get_sale_invoice_impl(p_sale_id); $$;
create function api.get_store_settings() returns jsonb language sql stable security invoker set search_path='' as $$ select app_private.get_store_settings_impl(); $$;
create function api.save_store_settings(p_expected_version bigint,p_settings jsonb,p_idempotency_key uuid) returns jsonb language sql security invoker set search_path='' as $$ select app_private.save_store_settings_impl(p_expected_version,p_settings,p_idempotency_key); $$;

revoke all on function api.save_sale_draft(uuid,bigint,uuid,uuid,jsonb,text,text,uuid),api.discard_sale_draft(uuid,bigint,uuid),api.complete_sale(uuid,bigint,text,uuid),api.get_sale_detail(uuid),api.list_sales(jsonb,timestamptz,uuid,integer),api.get_sale_invoice(uuid),api.get_store_settings(),api.save_store_settings(bigint,jsonb,uuid) from public,anon;
grant execute on function api.save_sale_draft(uuid,bigint,uuid,uuid,jsonb,text,text,uuid),api.discard_sale_draft(uuid,bigint,uuid),api.complete_sale(uuid,bigint,text,uuid),api.get_sale_detail(uuid),api.list_sales(jsonb,timestamptz,uuid,integer),api.get_sale_invoice(uuid),api.get_store_settings(),api.save_store_settings(bigint,jsonb,uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('store-branding','store-branding',true,2097152,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy "store_branding_owner_write" on storage.objects for all to authenticated using (bucket_id='store-branding' and app_private.has_permission('settings.manage')) with check (bucket_id='store-branding' and app_private.has_permission('settings.manage'));
