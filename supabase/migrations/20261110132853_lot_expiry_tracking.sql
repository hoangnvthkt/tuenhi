-- Wave 4a: optional lot / expiry tracking. Off by default; each product picks
-- NONE, EXPIRY (expiry date, lot number optional) or LOT (lot number + expiry).
-- A lot ledger follows every stock movement through a trigger, so sales,
-- returns, cancellations and counts keep working unchanged.
begin;

create table app_private.inventory_feature_settings (
 id smallint primary key default 1 check (id = 1),
 lot_tracking_enabled boolean not null default false,
 expiry_warning_days integer not null default 90 check (expiry_warning_days between 1 and 730),
 version bigint not null default 1,
 updated_by uuid references api.profiles(id),
 updated_at timestamptz not null default now()
);
insert into app_private.inventory_feature_settings(id) values (1);

alter table api.products add column tracking_mode text not null default 'NONE'
 check (tracking_mode in ('NONE','EXPIRY','LOT'));

create table app_private.product_lots (
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references api.products(id),
 lot_number text check (lot_number is null or (lot_number = btrim(lot_number) and length(lot_number) between 1 and 60)),
 expiry_date date not null,
 created_at timestamptz not null default now()
);
create unique index product_lots_identity on app_private.product_lots(product_id, (coalesce(lot_number, '')), expiry_date);

create table app_private.lot_balances (
 lot_id uuid primary key references app_private.product_lots(id),
 product_id uuid not null references api.products(id),
 on_hand_qty numeric(18,0) not null default 0 check (on_hand_qty >= 0),
 updated_at timestamptz not null default now()
);
create index lot_balances_product on app_private.lot_balances(product_id) where on_hand_qty > 0;

create table app_private.lot_movements (
 id uuid primary key default gen_random_uuid(),
 lot_id uuid not null references app_private.product_lots(id),
 product_id uuid not null references api.products(id),
 kind text not null check (kind in ('MOVEMENT','ASSIGN')),
 stock_movement_id uuid references api.stock_movements(id),
 quantity_delta numeric(18,0) not null check (quantity_delta <> 0),
 source_sale_id uuid,
 source_receipt_id uuid,
 actor_id uuid references api.profiles(id),
 occurred_at timestamptz not null default now(),
 check ((kind = 'MOVEMENT') = (stock_movement_id is not null))
);
create index lot_movements_sale on app_private.lot_movements(source_sale_id, product_id) where source_sale_id is not null;
create index lot_movements_receipt on app_private.lot_movements(source_receipt_id, product_id) where source_receipt_id is not null;

-- Lots entered on a purchase receipt, per product (receipt lines are re-created on save).
create table app_private.purchase_receipt_lots (
 id uuid primary key default gen_random_uuid(),
 purchase_receipt_id uuid not null references api.purchase_receipts(id) on delete cascade,
 product_id uuid not null references api.products(id),
 lot_number text check (lot_number is null or (lot_number = btrim(lot_number) and length(lot_number) between 1 and 60)),
 expiry_date date not null,
 quantity numeric(18,0) not null check (quantity > 0)
);
create unique index purchase_receipt_lots_identity on app_private.purchase_receipt_lots(purchase_receipt_id, product_id, (coalesce(lot_number, '')), expiry_date);

do $$ declare t text; begin
 foreach t in array array['inventory_feature_settings','product_lots','lot_balances','lot_movements','purchase_receipt_lots'] loop
  execute format('alter table app_private.%I enable row level security', t);
  execute format('alter table app_private.%I force row level security', t);
  execute format('revoke all on app_private.%I from public, anon, authenticated, service_role', t);
 end loop;
end $$;
create trigger lot_movements_append_only before update or delete on app_private.lot_movements
 for each row execute function app_private.guard_ledger_change();

create function app_private.ensure_product_lot(p_product_id uuid, p_lot_number text, p_expiry date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
 insert into app_private.product_lots(product_id, lot_number, expiry_date) values (p_product_id, nullif(btrim(coalesce(p_lot_number, '')), ''), p_expiry)
 on conflict (product_id, (coalesce(lot_number, '')), expiry_date) do nothing returning id into v_id;
 if v_id is null then
  select id into v_id from app_private.product_lots where product_id = p_product_id
   and coalesce(lot_number, '') = coalesce(nullif(btrim(coalesce(p_lot_number, '')), ''), '') and expiry_date = p_expiry;
 end if;
 return v_id;
end $$;

create function app_private.apply_lot_delta(p_lot_id uuid, p_product_id uuid, p_kind text, p_movement_id uuid, p_delta numeric,
 p_sale_id uuid, p_receipt_id uuid, p_actor uuid, p_at timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if p_delta > 0 then
  insert into app_private.lot_balances(lot_id, product_id, on_hand_qty, updated_at) values (p_lot_id, p_product_id, p_delta, p_at)
  on conflict (lot_id) do update set on_hand_qty = app_private.lot_balances.on_hand_qty + excluded.on_hand_qty, updated_at = excluded.updated_at;
 else
  -- Taking from a lot: the row exists; the check keeps it from going below zero.
  update app_private.lot_balances set on_hand_qty = on_hand_qty + p_delta, updated_at = p_at where lot_id = p_lot_id;
  if not found then raise exception 'LOT_BALANCE_MISSING'; end if;
 end if;
 insert into app_private.lot_movements(lot_id, product_id, kind, stock_movement_id, quantity_delta, source_sale_id, source_receipt_id, actor_id, occurred_at)
 values (p_lot_id, p_product_id, p_kind, p_movement_id, p_delta, p_sale_id, p_receipt_id, p_actor, p_at);
end $$;

-- Stock not held in any lot (older stock, counts, or sales beyond the lots).
create function app_private.unassigned_lot_qty(p_product_id uuid) returns numeric
language sql stable security definer set search_path = '' as $$
 select coalesce((select on_hand_qty from api.inventory_balances where product_id = p_product_id), 0)
  - coalesce((select sum(on_hand_qty) from app_private.lot_balances where product_id = p_product_id), 0);
$$;

create function app_private.allocate_movement_lots() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_mode text; v_left numeric; v_take numeric; v_lot record; v_sale uuid; v_receipt uuid; v_override uuid; v_short numeric;
 v_free numeric; v_pass integer; v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
 select tracking_mode into v_mode from api.products where id = new.product_id;
 if v_mode is null or v_mode = 'NONE' then return null; end if;
 if new.movement_type in ('SALE', 'SALE_CANCEL') then v_sale := new.reference_id;
 elsif new.movement_type = 'SALE_RETURN' then select original_sale_id into v_sale from api.sale_returns where id = new.reference_id;
 end if;
 if new.movement_type in ('PURCHASE_RECEIPT', 'PURCHASE_REVERSAL') then v_receipt := new.reference_id;
 elsif new.movement_type = 'PURCHASE_RETURN' then select purchase_receipt_id into v_receipt from app_private.purchase_returns where id = new.reference_id;
 end if;
 perform 1 from app_private.lot_balances where product_id = new.product_id order by lot_id for update;
 if new.quantity_delta > 0 then
  if new.movement_type = 'PURCHASE_RECEIPT' then
   -- Units already sold below zero came from this delivery: fill that gap first.
   v_short := greatest(-((new.quantity_after - new.quantity_delta)
    - coalesce((select sum(on_hand_qty) from app_private.lot_balances where product_id = new.product_id), 0)), 0);
   for v_lot in select * from app_private.purchase_receipt_lots where purchase_receipt_id = v_receipt and product_id = new.product_id
    order by expiry_date, coalesce(lot_number, '') loop
    v_take := v_lot.quantity - least(v_short, v_lot.quantity);
    v_short := v_short - least(v_short, v_lot.quantity);
    if v_take > 0 then
     perform app_private.apply_lot_delta(app_private.ensure_product_lot(new.product_id, v_lot.lot_number, v_lot.expiry_date),
      new.product_id, 'MOVEMENT', new.id, v_take, null, v_receipt, new.actor_id, new.occurred_at);
    end if;
   end loop;
  elsif v_sale is not null then
   -- Returns and cancellations go back to the lots that sale took, latest expiry first.
   v_left := new.quantity_delta;
   for v_lot in select m.lot_id, -sum(m.quantity_delta) still_out from app_private.lot_movements m join app_private.product_lots l on l.id = m.lot_id
    where m.source_sale_id = v_sale and m.product_id = new.product_id group by m.lot_id, l.expiry_date
    having sum(m.quantity_delta) < 0 order by l.expiry_date desc, m.lot_id loop
    exit when v_left = 0;
    v_take := least(v_left, v_lot.still_out);
    perform app_private.apply_lot_delta(v_lot.lot_id, new.product_id, 'MOVEMENT', new.id, v_take, v_sale, null, new.actor_id, new.occurred_at);
    v_left := v_left - v_take;
   end loop;
  end if;
  -- Any other inbound (opening, counts) stays unassigned until lots are assigned.
 else
  v_left := -new.quantity_delta;
  begin
   v_override := (nullif(current_setting('app.lot_override', true), '')::jsonb ->> new.product_id::text)::uuid;
  exception when others then v_override := null;
  end;
  -- Order: chosen lot, this receipt's own lots, then earliest expiry (FEFO).
  -- A sale never picks an expired lot automatically: it takes unexpired lots,
  -- then stock without a lot, and expired lots only when nothing else is left.
  v_free := greatest((new.quantity_after - new.quantity_delta)
   - coalesce((select sum(on_hand_qty) from app_private.lot_balances where product_id = new.product_id), 0), 0);
  for v_pass in 1..2 loop
   for v_lot in select b.lot_id, b.on_hand_qty from app_private.lot_balances b join app_private.product_lots l on l.id = b.lot_id
    where b.product_id = new.product_id and b.on_hand_qty > 0
     and (new.movement_type <> 'SALE' or (v_pass = 1) = (l.expiry_date >= v_today) or coalesce(b.lot_id = v_override, false))
     and (new.movement_type = 'SALE' or v_pass = 1)
    order by coalesce(b.lot_id = v_override, false) desc,
     (v_receipt is not null and exists (select 1 from app_private.lot_movements m where m.lot_id = b.lot_id and m.source_receipt_id = v_receipt)) desc,
     l.expiry_date, l.created_at, b.lot_id loop
    exit when v_left = 0;
    v_take := least(v_left, v_lot.on_hand_qty);
    perform app_private.apply_lot_delta(v_lot.lot_id, new.product_id, 'MOVEMENT', new.id, -v_take, v_sale, v_receipt, new.actor_id, new.occurred_at);
    v_left := v_left - v_take;
   end loop;
   if v_pass = 1 and new.movement_type = 'SALE' then
    v_left := v_left - least(v_left, v_free);
   end if;
  end loop;
  -- The rest comes from unassigned stock (which may go below zero, as stock may).
 end if;
 return null;
end $$;
create trigger stock_movements_allocate_lots after insert on api.stock_movements
 for each row execute function app_private.allocate_movement_lots();
revoke all on function app_private.allocate_movement_lots(), app_private.apply_lot_delta(uuid,uuid,text,uuid,numeric,uuid,uuid,uuid,timestamptz),
 app_private.ensure_product_lot(uuid,text,date), app_private.unassigned_lot_qty(uuid) from public, anon, authenticated, service_role;

create function app_private.get_inventory_features_impl() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_s app_private.inventory_feature_settings%rowtype;
begin
 if (select auth.uid()) is null or not app_private.has_active_profile() then
  return app_private.command_error('AUTH_REQUIRED', 'Vui lòng đăng nhập.', gen_random_uuid());
 end if;
 select * into v_s from app_private.inventory_feature_settings where id = 1;
 return app_private.command_success(jsonb_build_object('lotTrackingEnabled', v_s.lot_tracking_enabled, 'expiryWarningDays', v_s.expiry_warning_days,
  'version', v_s.version, 'trackedProductCount', (select count(*) from api.products where tracking_mode <> 'NONE')), gen_random_uuid());
end $$;

create function app_private.set_inventory_features_impl(p_expected_version bigint, p_lot_tracking_enabled boolean, p_expiry_warning_days integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_correlation uuid := gen_random_uuid(); v_s app_private.inventory_feature_settings%rowtype;
begin
 if v_actor is null or not app_private.has_permission('settings.manage') then
  return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền cấu hình cửa hàng.', v_correlation);
 end if;
 if p_expected_version is null or p_lot_tracking_enabled is null or p_expiry_warning_days is null or p_expiry_warning_days not between 1 and 730 then
  return app_private.command_error('VALIDATION_FAILED', 'Số ngày cảnh báo từ 1 đến 730.', v_correlation);
 end if;
 select * into v_s from app_private.inventory_feature_settings where id = 1 for update;
 if v_s.version <> p_expected_version then return app_private.command_error('VERSION_CONFLICT', 'Cấu hình đã thay đổi. Vui lòng tải lại.', v_correlation); end if;
 if not p_lot_tracking_enabled and exists (select 1 from api.products where tracking_mode <> 'NONE') then
  return app_private.command_error('LOT_TRACKING_IN_USE', 'Còn sản phẩm đang theo lô/hạn dùng: chuyển chúng về Không trước khi tắt.', v_correlation);
 end if;
 update app_private.inventory_feature_settings set lot_tracking_enabled = p_lot_tracking_enabled, expiry_warning_days = p_expiry_warning_days,
  version = version + 1, updated_by = v_actor, updated_at = now() where id = 1 returning * into v_s;
 insert into app_private.audit_events(actor_id, action, entity_type, entity_id, after_data, correlation_id)
 values (v_actor, 'settings.inventory_features', 'store_settings', null, jsonb_build_object('lotTrackingEnabled', v_s.lot_tracking_enabled, 'expiryWarningDays', v_s.expiry_warning_days), v_correlation);
 return app_private.command_success(jsonb_build_object('lotTrackingEnabled', v_s.lot_tracking_enabled, 'expiryWarningDays', v_s.expiry_warning_days,
  'version', v_s.version, 'trackedProductCount', (select count(*) from api.products where tracking_mode <> 'NONE')), v_correlation);
end $$;

create function app_private.set_product_tracking_impl(p_product_id uuid, p_mode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_correlation uuid := gen_random_uuid(); v_old text;
begin
 if v_actor is null or not app_private.has_permission('catalog.basic.manage') then
  return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền sửa hàng hóa.', v_correlation);
 end if;
 if p_product_id is null or p_mode is null or p_mode not in ('NONE', 'EXPIRY', 'LOT') then
  return app_private.command_error('VALIDATION_FAILED', 'Chế độ theo dõi chưa hợp lệ.', v_correlation);
 end if;
 if p_mode <> 'NONE' and not (select lot_tracking_enabled from app_private.inventory_feature_settings where id = 1) then
  return app_private.command_error('LOT_TRACKING_DISABLED', 'Bật "Quản lý hạn sử dụng và lô" trong Cấu hình cửa hàng trước.', v_correlation);
 end if;
 select tracking_mode into v_old from api.products where id = p_product_id for update;
 if not found then return app_private.command_error('REFERENCE_NOT_FOUND', 'Không tìm thấy sản phẩm.', v_correlation); end if;
 if p_mode = 'NONE' and exists (select 1 from app_private.lot_balances where product_id = p_product_id and on_hand_qty > 0) then
  return app_private.command_error('LOT_STOCK_REMAINS', 'Sản phẩm còn hàng trong lô: bán hoặc xuất hủy hết trước khi tắt.', v_correlation);
 end if;
 if p_mode <> v_old then
  update api.products set tracking_mode = p_mode, version = version + 1, updated_by = v_actor, updated_at = now() where id = p_product_id;
  insert into app_private.audit_events(actor_id, action, entity_type, entity_id, before_data, after_data, correlation_id)
  values (v_actor, 'product.tracking_changed', 'product', p_product_id, jsonb_build_object('trackingMode', v_old), jsonb_build_object('trackingMode', p_mode), v_correlation);
 end if;
 return app_private.command_success(jsonb_build_object('productId', p_product_id, 'trackingMode', p_mode,
  'unassignedQty', app_private.unassigned_lot_qty(p_product_id)::text), v_correlation);
end $$;

create function app_private.valid_lot_rows(p_rows jsonb) returns boolean
language sql immutable set search_path = '' as $$
 select jsonb_typeof(p_rows) = 'array' and not exists (select 1 from jsonb_array_elements(p_rows) e
  where coalesce(e ->> 'quantity', '') !~ '^[1-9][0-9]{0,8}$' or coalesce(e ->> 'expiryDate', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   or length(btrim(coalesce(e ->> 'lotNumber', ''))) > 60);
$$;

create function app_private.get_purchase_receipt_lots_impl(p_receipt_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_correlation uuid := gen_random_uuid();
begin
 if (select auth.uid()) is null or not (app_private.has_permission('purchase.draft.manage') or app_private.has_permission('purchase.post') or app_private.has_permission('purchase.operational.read')) then
  return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền xem phiếu nhập.', v_correlation);
 end if;
 return app_private.command_success(jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object(
   'productId', l.product_id, 'productName', l.product_name, 'unitName', l.unit_name, 'receivedQty', l.received_qty::text, 'trackingMode', p.tracking_mode,
   'lots', coalesce((select jsonb_agg(jsonb_build_object('lotNumber', x.lot_number, 'expiryDate', x.expiry_date, 'quantity', x.quantity::text) order by x.expiry_date, x.lot_number)
     from app_private.purchase_receipt_lots x where x.purchase_receipt_id = p_receipt_id and x.product_id = l.product_id), '[]'::jsonb)) order by l.line_order)
  from api.purchase_receipt_lines l join api.products p on p.id = l.product_id
  where l.purchase_receipt_id = p_receipt_id and p.tracking_mode <> 'NONE'), '[]'::jsonb)), v_correlation);
end $$;

create function app_private.set_purchase_receipt_lots_impl(p_receipt_id uuid, p_lots jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_correlation uuid := gen_random_uuid(); v_status text;
begin
 if v_actor is null or not (app_private.has_permission('purchase.draft.manage') or app_private.has_permission('purchase.post')) then
  return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền sửa phiếu nhập.', v_correlation);
 end if;
 if p_receipt_id is null or jsonb_typeof(p_lots) is distinct from 'array'
  or exists (select 1 from jsonb_array_elements(p_lots) e where coalesce(e ->> 'productId', '') !~ '^[0-9a-f-]{36}$' or not coalesce(app_private.valid_lot_rows(e -> 'lots'), false)) then
  return app_private.command_error('VALIDATION_FAILED', 'Nhập hạn dùng và số lượng cho từng lô.', v_correlation);
 end if;
 select status into v_status from api.purchase_receipts where id = p_receipt_id for update;
 if not found then return app_private.command_error('REFERENCE_NOT_FOUND', 'Không tìm thấy phiếu nhập.', v_correlation); end if;
 if v_status not in ('DRAFT', 'AWAITING_COST') then return app_private.command_error('INVALID_STATE', 'Chỉ sửa lô khi phiếu chưa ghi sổ.', v_correlation); end if;
 if exists (select 1 from jsonb_array_elements(p_lots) e left join api.purchase_receipt_lines l on l.purchase_receipt_id = p_receipt_id and l.product_id = (e ->> 'productId')::uuid
   left join api.products p on p.id = l.product_id
   where l.id is null or p.tracking_mode = 'NONE'
    or (p.tracking_mode = 'LOT' and exists (select 1 from jsonb_array_elements(e -> 'lots') x where btrim(coalesce(x ->> 'lotNumber', '')) = ''))
    or (select coalesce(sum((x ->> 'quantity')::numeric), 0) from jsonb_array_elements(e -> 'lots') x) > l.received_qty) then
  return app_private.command_error('LOT_DETAILS_INVALID', 'Lô phải thuộc sản phẩm theo dõi trong phiếu, có số lô khi theo lô, và không vượt số lượng nhập.', v_correlation);
 end if;
 delete from app_private.purchase_receipt_lots where purchase_receipt_id = p_receipt_id;
 insert into app_private.purchase_receipt_lots(purchase_receipt_id, product_id, lot_number, expiry_date, quantity)
 select p_receipt_id, (e ->> 'productId')::uuid, nullif(btrim(coalesce(x ->> 'lotNumber', '')), ''), (x ->> 'expiryDate')::date, sum((x ->> 'quantity')::numeric)
 from jsonb_array_elements(p_lots) e cross join lateral jsonb_array_elements(e -> 'lots') x
 group by 1, 2, 3, 4;
 return app_private.get_purchase_receipt_lots_impl(p_receipt_id);
exception when unique_violation or check_violation or invalid_datetime_format or datetime_field_overflow then
 return app_private.command_error('LOT_DETAILS_INVALID', 'Thông tin lô chưa hợp lệ.', v_correlation);
end $$;

-- Posting needs full lot details for tracked products.
create function app_private.post_purchase_receipt_lot_guard_impl(p_receipt_id uuid, p_expected_version bigint, p_cost_lines jsonb, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_cached jsonb;
begin
 v_cached := app_private.cached_command_response((select auth.uid()), 'purchase.post', p_idempotency_key);
 if v_cached is not null then return v_cached; end if;
 if exists (select 1 from api.purchase_receipt_lines l join api.products p on p.id = l.product_id
   where l.purchase_receipt_id = p_receipt_id and p.tracking_mode <> 'NONE'
    and coalesce((select sum(x.quantity) from app_private.purchase_receipt_lots x where x.purchase_receipt_id = p_receipt_id and x.product_id = l.product_id), 0) <> l.received_qty) then
  return app_private.command_error('LOT_DETAILS_REQUIRED', 'Nhập đủ lô và hạn dùng cho các sản phẩm theo dõi trước khi ghi sổ.', gen_random_uuid());
 end if;
 return app_private.post_purchase_receipt_dispatch_impl(p_receipt_id, p_expected_version, p_cost_lines, p_idempotency_key);
end $$;
create or replace function api.post_purchase_receipt(p_receipt_id uuid, p_expected_version bigint, p_cost_lines jsonb, p_idempotency_key uuid)
returns jsonb language sql set search_path to '' as $$
 select app_private.post_purchase_receipt_lot_guard_impl(p_receipt_id, p_expected_version, p_cost_lines, p_idempotency_key);
$$;

-- Put stock that has no lot yet (older stock) into lots once.
create function app_private.assign_unassigned_lots_impl(p_product_id uuid, p_lots jsonb, p_idempotency_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_correlation uuid := gen_random_uuid(); v_name text := 'lots.assign'; v_hash text; v_cached jsonb; v_result jsonb;
 v_mode text; v_total numeric; v_free numeric; v_row record;
begin
 if v_actor is null or not app_private.has_permission('inventory.adjustment.post') then
  return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền gán lô.', v_correlation);
 end if;
 if p_product_id is null or p_idempotency_key is null or not coalesce(app_private.valid_lot_rows(p_lots), false) or jsonb_array_length(p_lots) = 0 then
  return app_private.command_error('VALIDATION_FAILED', 'Nhập hạn dùng và số lượng cho từng lô.', v_correlation);
 end if;
 v_hash := md5(jsonb_build_object('productId', p_product_id, 'lots', p_lots)::text);
 v_cached := app_private.cash_command_cached(v_actor, v_name, p_idempotency_key, v_hash, v_correlation);
 if v_cached is not null then return v_cached; end if;
 perform 1 from api.inventory_balances where product_id = p_product_id for update;
 perform 1 from app_private.lot_balances where product_id = p_product_id order by lot_id for update;
 select tracking_mode into v_mode from api.products where id = p_product_id;
 if v_mode is null or v_mode = 'NONE' then return app_private.command_error('LOT_TRACKING_DISABLED', 'Sản phẩm chưa theo lô/hạn dùng.', v_correlation); end if;
 if v_mode = 'LOT' and exists (select 1 from jsonb_array_elements(p_lots) x where btrim(coalesce(x ->> 'lotNumber', '')) = '') then
  return app_private.command_error('LOT_DETAILS_INVALID', 'Sản phẩm theo lô cần số lô.', v_correlation);
 end if;
 select sum((x ->> 'quantity')::numeric) into v_total from jsonb_array_elements(p_lots) x;
 v_free := app_private.unassigned_lot_qty(p_product_id);
 if v_total > v_free then
  return app_private.command_error('LOT_ASSIGN_EXCEEDS_STOCK', 'Số gán vượt tồn chưa có lô.', v_correlation);
 end if;
 for v_row in select nullif(btrim(coalesce(x ->> 'lotNumber', '')), '') lot_number, (x ->> 'expiryDate')::date expiry_date, sum((x ->> 'quantity')::numeric) quantity
  from jsonb_array_elements(p_lots) x group by 1, 2 loop
  perform app_private.apply_lot_delta(app_private.ensure_product_lot(p_product_id, v_row.lot_number, v_row.expiry_date), p_product_id, 'ASSIGN', null,
   v_row.quantity, null, null, v_actor, now());
 end loop;
 v_result := app_private.command_success(jsonb_build_object('productId', p_product_id, 'assignedQty', v_total::text,
  'unassignedQty', app_private.unassigned_lot_qty(p_product_id)::text), v_correlation);
 insert into app_private.command_deduplication(actor_id, command_name, idempotency_key, response, request_hash) values (v_actor, v_name, p_idempotency_key, v_result, v_hash);
 insert into app_private.audit_events(actor_id, action, entity_type, entity_id, after_data, correlation_id)
 values (v_actor, 'lots.assigned', 'product', p_product_id, jsonb_build_object('lots', p_lots, 'assignedQty', v_total::text), v_correlation);
 return v_result;
exception when invalid_datetime_format or datetime_field_overflow then
 return app_private.command_error('LOT_DETAILS_INVALID', 'Hạn dùng chưa hợp lệ.', v_correlation);
end $$;

create function app_private.list_product_lots_impl(p_status text, p_product_id uuid, p_limit integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_correlation uuid := gen_random_uuid(); v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date; v_warn integer;
begin
 if (select auth.uid()) is null or not app_private.has_permission('inventory.read') then
  return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền xem tồn kho.', v_correlation);
 end if;
 if coalesce(p_status, 'ALL') not in ('ALL', 'EXPIRED', 'EXPIRING', 'OK') or p_limit is null or p_limit not between 1 and 200 then
  return app_private.command_error('VALIDATION_FAILED', 'Bộ lọc chưa hợp lệ.', v_correlation);
 end if;
 select expiry_warning_days into v_warn from app_private.inventory_feature_settings where id = 1;
 return app_private.command_success(jsonb_build_object(
  'warningDays', v_warn,
  'trackingMode', case when p_product_id is not null then (select tracking_mode from api.products where id = p_product_id) end,
  'unassignedQty', case when p_product_id is not null then app_private.unassigned_lot_qty(p_product_id)::text end,
  'summary', (select jsonb_build_object(
    'expired', count(*) filter (where l.expiry_date < v_today),
    'expiring', count(*) filter (where l.expiry_date >= v_today and l.expiry_date <= v_today + v_warn),
    'ok', count(*) filter (where l.expiry_date > v_today + v_warn))
   from app_private.lot_balances b join app_private.product_lots l on l.id = b.lot_id
   where b.on_hand_qty > 0 and (p_product_id is null or b.product_id = p_product_id)),
  'items', coalesce((select jsonb_agg(row order by (row ->> 'expiryDate'), row ->> 'productName') from (
    select jsonb_build_object('lotId', l.id, 'productId', p.id, 'productName', p.name, 'unitName', p.unit_name, 'trackingMode', p.tracking_mode,
     'lotNumber', l.lot_number, 'expiryDate', l.expiry_date, 'daysLeft', l.expiry_date - v_today, 'quantity', b.on_hand_qty::text,
     'status', case when l.expiry_date < v_today then 'EXPIRED' when l.expiry_date <= v_today + v_warn then 'EXPIRING' else 'OK' end) row
    from app_private.lot_balances b join app_private.product_lots l on l.id = b.lot_id join api.products p on p.id = b.product_id
    where b.on_hand_qty > 0 and (p_product_id is null or b.product_id = p_product_id)
     and (coalesce(p_status, 'ALL') = 'ALL'
      or (p_status = 'EXPIRED' and l.expiry_date < v_today)
      or (p_status = 'EXPIRING' and l.expiry_date >= v_today and l.expiry_date <= v_today + v_warn)
      or (p_status = 'OK' and l.expiry_date > v_today + v_warn))
    order by l.expiry_date, p.name limit p_limit) sorted), '[]'::jsonb),
  'unassigned', coalesce((select jsonb_agg(jsonb_build_object('productId', p.id, 'productName', p.name, 'unitName', p.unit_name,
    'trackingMode', p.tracking_mode, 'quantity', app_private.unassigned_lot_qty(p.id)::text) order by p.name)
   from api.products p where p.tracking_mode <> 'NONE' and app_private.unassigned_lot_qty(p.id) <> 0
    and (p_product_id is null or p.id = p_product_id)), '[]'::jsonb)), v_correlation);
end $$;

create function api.get_inventory_features() returns jsonb language sql stable security invoker set search_path = '' as $$ select app_private.get_inventory_features_impl(); $$;
create function api.set_inventory_features(p_expected_version bigint, p_lot_tracking_enabled boolean, p_expiry_warning_days integer)
returns jsonb language sql security invoker set search_path = '' as $$ select app_private.set_inventory_features_impl(p_expected_version, p_lot_tracking_enabled, p_expiry_warning_days); $$;
create function api.set_product_tracking(p_product_id uuid, p_mode text) returns jsonb language sql security invoker set search_path = '' as $$ select app_private.set_product_tracking_impl(p_product_id, p_mode); $$;
create function api.get_purchase_receipt_lots(p_receipt_id uuid) returns jsonb language sql stable security invoker set search_path = '' as $$ select app_private.get_purchase_receipt_lots_impl(p_receipt_id); $$;
create function api.set_purchase_receipt_lots(p_receipt_id uuid, p_lots jsonb) returns jsonb language sql security invoker set search_path = '' as $$ select app_private.set_purchase_receipt_lots_impl(p_receipt_id, p_lots); $$;
create function api.assign_unassigned_lots(p_product_id uuid, p_lots jsonb, p_idempotency_key uuid) returns jsonb language sql security invoker set search_path = '' as $$ select app_private.assign_unassigned_lots_impl(p_product_id, p_lots, p_idempotency_key); $$;
create function api.list_product_lots(p_status text default 'ALL', p_product_id uuid default null, p_limit integer default 100) returns jsonb language sql stable security invoker set search_path = '' as $$ select app_private.list_product_lots_impl(p_status, p_product_id, p_limit); $$;

do $$ declare f text; begin
 foreach f in array array[
  'app_private.get_inventory_features_impl()', 'api.get_inventory_features()',
  'app_private.set_inventory_features_impl(bigint,boolean,integer)', 'api.set_inventory_features(bigint,boolean,integer)',
  'app_private.set_product_tracking_impl(uuid,text)', 'api.set_product_tracking(uuid,text)',
  'app_private.get_purchase_receipt_lots_impl(uuid)', 'api.get_purchase_receipt_lots(uuid)',
  'app_private.set_purchase_receipt_lots_impl(uuid,jsonb)', 'api.set_purchase_receipt_lots(uuid,jsonb)',
  'app_private.post_purchase_receipt_lot_guard_impl(uuid,bigint,jsonb,uuid)',
  'app_private.assign_unassigned_lots_impl(uuid,jsonb,uuid)', 'api.assign_unassigned_lots(uuid,jsonb,uuid)',
  'app_private.list_product_lots_impl(text,uuid,integer)', 'api.list_product_lots(text,uuid,integer)'] loop
  execute format('revoke all on function %s from public, anon', f);
  execute format('grant execute on function %s to authenticated, service_role', f);
 end loop;
end $$;

alter table app_private.stock_write_off_lines add column lot_id uuid references app_private.product_lots(id);

-- Write-offs may pick a lot; otherwise the earliest expiry goes first.
create or replace function app_private.post_stock_write_off_impl(p_lines jsonb, p_reason_code text, p_note text, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_correlation uuid := gen_random_uuid(); v_name text := 'inventory.writeoff.post'; v_hash text; v_cached jsonb; v_result jsonb;
 v_note text := nullif(btrim(coalesce(p_note, '')), ''); v_lines jsonb; v_line record; v_id uuid := gen_random_uuid(); v_number text; v_movement uuid;
 v_new_qty numeric(18,0); v_value numeric(20,2); v_new_value numeric(20,2); v_new_avg numeric(20,6); v_total numeric(20,2) := 0; v_written numeric(20,2) := 0; v_now timestamptz := now();
begin
 if v_actor is null or not app_private.has_permission(v_name) then
  return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền xuất hủy.', v_correlation);
 end if;
 if p_idempotency_key is null or p_reason_code is null or p_reason_code not in ('EXPIRED', 'DAMAGED', 'LOST', 'OTHER')
  or (p_reason_code = 'OTHER' and v_note is null) or length(coalesce(v_note, '')) > 500
  or jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 100
  or exists (select 1 from jsonb_array_elements(p_lines) e where coalesce(e ->> 'quantity', '') !~ '^[1-9][0-9]{0,8}$'
   or coalesce(e ->> 'productId', '') !~ '^[0-9a-f-]{36}$' or coalesce(e ->> 'lotId', '00000000-0000-0000-0000-000000000000') !~ '^[0-9a-f-]{36}$')
  or (select count(*) from jsonb_array_elements(p_lines)) <> (select count(distinct e ->> 'productId') from jsonb_array_elements(p_lines) e) then
  return app_private.command_error('VALIDATION_FAILED', 'Chọn sản phẩm, số lượng và lý do hủy.', v_correlation);
 end if;
 select jsonb_agg(jsonb_build_object('productId', e ->> 'productId', 'quantity', (e ->> 'quantity')::numeric, 'lotId', e ->> 'lotId') order by e ->> 'productId')
 into v_lines from jsonb_array_elements(p_lines) e;
 v_hash := md5(jsonb_build_object('lines', v_lines, 'reason', p_reason_code, 'note', v_note)::text);
 v_cached := app_private.cash_command_cached(v_actor, v_name, p_idempotency_key, v_hash, v_correlation);
 if v_cached is not null then return v_cached; end if;
 perform 1 from api.inventory_balances b where b.product_id in (select (x ->> 'productId')::uuid from jsonb_array_elements(v_lines) x) order by b.product_id for update;
 perform 1 from app_private.inventory_cost_balances b where b.product_id in (select (x ->> 'productId')::uuid from jsonb_array_elements(v_lines) x) order by b.product_id for update;
 if exists (select 1 from jsonb_to_recordset(v_lines) x("productId" uuid, quantity numeric)
   left join api.inventory_balances b on b.product_id = x."productId" where b.product_id is null or b.on_hand_qty < x.quantity) then
  return app_private.command_error('WRITE_OFF_QTY_EXCEEDED', 'Số hủy vượt tồn kho hiện tại.', v_correlation);
 end if;
 -- Wave 4a: a chosen lot must belong to the product and hold the quantity.
 perform 1 from app_private.lot_balances b where b.product_id in (select (x ->> 'productId')::uuid from jsonb_array_elements(v_lines) x) order by b.lot_id for update;
 if exists (select 1 from jsonb_to_recordset(v_lines) x("productId" uuid, quantity numeric, "lotId" uuid) where x."lotId" is not null
   and not exists (select 1 from app_private.lot_balances b where b.lot_id = x."lotId" and b.product_id = x."productId" and b.on_hand_qty >= x.quantity)) then
  return app_private.command_error('WRITE_OFF_LOT_INVALID', 'Lô đã chọn không đủ hàng để hủy.', v_correlation);
 end if;
 perform set_config('app.lot_override', coalesce((select jsonb_object_agg(x."productId", x."lotId") from jsonb_to_recordset(v_lines) x("productId" uuid, "lotId" uuid)
  where x."lotId" is not null), '{}'::jsonb)::text, true);
 -- Same rule as each line below: the last units take the whole remaining value.
 select coalesce(sum(case when b.on_hand_qty = x.quantity then coalesce(cb.inventory_value, 0)
   else least(round(coalesce(cb.avg_unit_cost, 0) * x.quantity, 2), coalesce(cb.inventory_value, 0)) end), 0)
 into v_total from jsonb_to_recordset(v_lines) x("productId" uuid, quantity numeric) join api.inventory_balances b on b.product_id = x."productId"
 left join app_private.inventory_cost_balances cb on cb.product_id = x."productId";
 v_number := app_private.next_document_number_impl('WRITE_OFF');
 insert into app_private.stock_write_offs(id, write_off_number, reason_code, note, total_value, actor_id, posted_at, correlation_id)
 values (v_id, v_number, p_reason_code, v_note, v_total, v_actor, v_now, v_correlation);
 for v_line in select x."productId" product_id, x.quantity, b.on_hand_qty, coalesce(cb.inventory_value, 0) inventory_value, coalesce(cb.avg_unit_cost, 0) avg_unit_cost
  from jsonb_to_recordset(v_lines) x("productId" uuid, quantity numeric) join api.inventory_balances b on b.product_id = x."productId"
  left join app_private.inventory_cost_balances cb on cb.product_id = x."productId" order by x."productId" loop
  v_new_qty := v_line.on_hand_qty - v_line.quantity;
  -- The last units take the whole remaining value so no cents are stranded.
  v_value := case when v_new_qty = 0 then v_line.inventory_value else least(round(v_line.avg_unit_cost * v_line.quantity, 2), v_line.inventory_value) end;
  v_new_value := v_line.inventory_value - v_value;
  v_new_avg := case when v_new_qty = 0 then 0 else round(v_new_value / v_new_qty, 6) end;
  update api.inventory_balances set on_hand_qty = v_new_qty, version = version + 1, updated_at = v_now where product_id = v_line.product_id;
  update app_private.inventory_cost_balances set inventory_value = v_new_value, avg_unit_cost = v_new_avg, version = version + 1, updated_at = v_now
  where product_id = v_line.product_id;
  insert into api.stock_movements(product_id, movement_type, quantity_delta, quantity_after, reference_type, reference_id, occurred_at, actor_id, note, correlation_id)
  values (v_line.product_id, 'WRITE_OFF', -v_line.quantity, v_new_qty, 'WRITE_OFF', v_id, v_now, v_actor, v_note, v_correlation) returning id into v_movement;
  insert into app_private.inventory_cost_movements(stock_movement_id, inventory_value_delta, cogs_delta, inventory_value_after, avg_unit_cost_after, occurred_at)
  values (v_movement, -v_value, 0, v_new_value, v_new_avg, v_now);
  insert into app_private.stock_write_off_lines(write_off_id, product_id, quantity, unit_cost, line_value, stock_movement_id, lot_id)
  values (v_id, v_line.product_id, v_line.quantity, v_line.avg_unit_cost, v_value, v_movement,
   (select (x ->> 'lotId')::uuid from jsonb_array_elements(v_lines) x where (x ->> 'productId')::uuid = v_line.product_id));
  v_written := v_written + v_value;
 end loop;
 perform set_config('app.lot_override', '', true);
 if v_written <> v_total then raise exception 'WRITE_OFF_TOTAL_MISMATCH'; end if;
 v_result := app_private.command_success(jsonb_build_object('writeOffId', v_id, 'writeOffNumber', v_number,
  'totalValue', case when app_private.has_permission('report.cost_profit.read') then v_total::text end), v_correlation);
 insert into app_private.command_deduplication(actor_id, command_name, idempotency_key, response, request_hash) values (v_actor, v_name, p_idempotency_key, v_result, v_hash);
 insert into app_private.audit_events(actor_id, action, entity_type, entity_id, after_data, correlation_id)
 values (v_actor, 'stock_write_off.posted', 'stock_write_off', v_id, jsonb_build_object('writeOffNumber', v_number, 'reason', p_reason_code,
  'note', v_note, 'lines', v_lines, 'totalValue', v_total::text), v_correlation);
 return v_result;
end $$;

create or replace function app_private.get_write_off_products_impl(p_product_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_correlation uuid := gen_random_uuid(); v_cost boolean := app_private.has_permission('report.cost_profit.read');
begin
 if (select auth.uid()) is null or not app_private.has_permission('inventory.writeoff.post') then
  return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền xuất hủy.', v_correlation);
 end if;
 if p_product_ids is null or cardinality(p_product_ids) > 100 then
  return app_private.command_error('VALIDATION_FAILED', 'Danh sách sản phẩm chưa hợp lệ.', v_correlation);
 end if;
 return app_private.command_success(jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object(
   'productId', p.id, 'name', p.name, 'sku', p.sku, 'unitName', p.unit_name, 'onHandQty', coalesce(b.on_hand_qty, 0)::text,
   'avgUnitCost', case when v_cost then coalesce(cb.avg_unit_cost, 0)::numeric(20,2)::text end,
   -- Exact inputs so the screen previews the very value the write-off posts.
   'avgUnitCostExact', case when v_cost then coalesce(cb.avg_unit_cost, 0)::text end,
   'inventoryValue', case when v_cost then coalesce(cb.inventory_value, 0)::text end,
   'trackingMode', p.tracking_mode,
   'lots', coalesce((select jsonb_agg(jsonb_build_object('lotId', l.id, 'lotNumber', l.lot_number, 'expiryDate', l.expiry_date, 'quantity', lb.on_hand_qty::text)
     order by l.expiry_date, l.created_at) from app_private.lot_balances lb join app_private.product_lots l on l.id = lb.lot_id
     where lb.product_id = p.id and lb.on_hand_qty > 0), '[]'::jsonb)) order by p.name)
  from api.products p left join api.inventory_balances b on b.product_id = p.id left join app_private.inventory_cost_balances cb on cb.product_id = p.id
  where p.id = any(p_product_ids)), '[]'::jsonb)), v_correlation);
end $$;

CREATE OR REPLACE FUNCTION app_private.get_my_command_outcome_impl(p_command_name text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_correlation_id uuid := gen_random_uuid();
  v_command_name text := btrim(coalesce(p_command_name, ''));
  v_response jsonb;
begin
  if v_actor_id is null or not app_private.has_active_profile() then
    return app_private.command_error(
      'AUTH_REQUIRED',
      'Vui lòng đăng nhập để kiểm tra kết quả giao dịch.',
      v_correlation_id
    );
  end if;

  if p_idempotency_key is null
    or v_command_name not in (
      'sale.complete',
      'sale.cancel',
      'sale.return.complete',
      'purchase.post',
      'purchase.reverse',
      'stock.count.post',
      'opening.post', 'customer.debt.collect', 'customer.debt.adjust',
      'cash.voucher.create', 'cash.voucher.cancel', 'cash.opening.set', 'cash.shift.open', 'cash.shift.close',
      'supplier.debt.pay', 'supplier.debt.opening', 'purchase.return.post', 'inventory.writeoff.post', 'lots.assign'
    ) then
    return app_private.command_error(
      'VALIDATION_ERROR',
      'Mã yêu cầu hoặc loại giao dịch chưa hợp lệ.',
      v_correlation_id
    );
  end if;

  select d.response
  into v_response
  from app_private.command_deduplication as d
  where d.actor_id = v_actor_id
    and d.command_name = v_command_name
    and d.idempotency_key = p_idempotency_key;

  if v_response is null then
    return app_private.command_success(
      jsonb_build_object('status', 'NOT_FOUND', 'response', null),
      v_correlation_id
    );
  end if;

  return app_private.command_success(
    jsonb_build_object('status', 'RESOLVED', 'response', v_response),
    v_correlation_id
  );
end;
$function$;

notify pgrst, 'reload schema';
commit;
