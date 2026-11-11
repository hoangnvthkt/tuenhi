begin;
-- Gói hàng: danh sách thuốc khai trong danh mục để chọn nhanh khi bán. Không có
-- giá gói; mỗi món bán theo giá hiện hành, tồn/giá vốn/báo cáo vẫn theo từng món.
create table app_private.product_bundles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = btrim(name) and length(name) between 1 and 120),
  name_normalized text not null,
  is_active boolean not null default true,
  version bigint not null default 1,
  created_by uuid not null references api.profiles(id),
  updated_by uuid not null references api.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index product_bundles_active_name on app_private.product_bundles(name_normalized) where is_active;
create table app_private.product_bundle_lines (
  bundle_id uuid not null references app_private.product_bundles(id) on delete cascade,
  product_id uuid not null references api.products(id),
  quantity integer not null check (quantity between 1 and 999999),
  line_order integer not null,
  primary key (bundle_id, product_id)
);
create index product_bundle_lines_product on app_private.product_bundle_lines(product_id);
alter table app_private.product_bundles enable row level security;
alter table app_private.product_bundle_lines enable row level security;
revoke all on table app_private.product_bundles, app_private.product_bundle_lines from public, anon, authenticated;

create function app_private.list_product_bundles_impl(p_include_inactive boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_correlation uuid := gen_random_uuid(); v_items jsonb;
begin
  if not app_private.has_permission('catalog.read') then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền xem gói hàng.', v_correlation);
  end if;
  if coalesce(p_include_inactive, false) and not app_private.has_permission('catalog.basic.manage') then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền quản lý gói hàng.', v_correlation);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', b.id, 'name', b.name, 'isActive', b.is_active, 'version', b.version, 'lines', lines.items
    ) order by b.name_normalized, b.id), '[]'::jsonb)
  into v_items
  from app_private.product_bundles b
  cross join lateral (
    select coalesce(jsonb_agg(jsonb_build_object(
        'productId', c.id, 'productName', c.name, 'sku', c.sku, 'unitName', c.unit_name,
        'quantity', l.quantity::text, 'isActive', c.is_active,
        'currentSalePrice', case when app_private.has_permission('pricing.sale.read') then c.current_sale_price::text else null end,
        'onHandQty', coalesce(c.on_hand_qty, 0)::text,
        'primaryImagePath', c.primary_image_path
      ) order by l.line_order), '[]'::jsonb) items
    from app_private.product_bundle_lines l
    join api.product_catalog_read c on c.id = l.product_id
    where l.bundle_id = b.id
  ) lines
  where b.is_active or coalesce(p_include_inactive, false);
  return app_private.command_success(jsonb_build_object('items', v_items), v_correlation);
end $$;

create function app_private.save_product_bundle_impl(p_bundle_id uuid, p_expected_version bigint, p_name text, p_is_active boolean, p_lines jsonb, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_correlation uuid := gen_random_uuid();
  v_name text := normalize(btrim(coalesce(p_name, '')), NFC);
  v_id uuid := coalesce(p_bundle_id, gen_random_uuid());
  v_before app_private.product_bundles%rowtype;
  v_cached jsonb; v_result jsonb; v_version bigint := 1;
begin
  if v_actor is null or not app_private.has_permission('catalog.basic.manage') then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền quản lý gói hàng.', v_correlation);
  end if;
  if p_idempotency_key is null then
    return app_private.command_error('VALIDATION_FAILED', 'Thiếu mã chống gửi trùng thao tác.', v_correlation);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':catalog.save_bundle:' || p_idempotency_key::text, 0));
  v_cached := app_private.cached_command_response(v_actor, 'catalog.save_bundle', p_idempotency_key);
  if v_cached is not null then return v_cached; end if;

  if length(v_name) not between 1 and 120 or p_is_active is null
    or jsonb_typeof(p_lines) is distinct from 'array'
    or jsonb_array_length(p_lines) not between 1 and 50
    or exists (select 1 from jsonb_array_elements(p_lines) e
      where jsonb_typeof(e) <> 'object'
        or coalesce(e->>'productId', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        or coalesce(e->>'quantity', '') !~ '^[1-9][0-9]{0,5}$')
    or (select count(distinct lower(e->>'productId')) <> count(*) from jsonb_array_elements(p_lines) e) then
    return app_private.command_error('VALIDATION_FAILED', 'Gói hàng cần có tên và từ 1 đến 50 món khác nhau.', v_correlation);
  end if;
  if p_is_active and exists (
    select 1 from jsonb_array_elements(p_lines) e
    left join api.products p on p.id = (e->>'productId')::uuid
    where p.id is null or not p.is_active
  ) then
    return app_private.command_error('REFERENCE_NOT_FOUND', 'Gói có sản phẩm không còn kinh doanh.', v_correlation);
  end if;

  if p_bundle_id is null then
    insert into app_private.product_bundles(id, name, name_normalized, is_active, created_by, updated_by)
    values (v_id, v_name, app_private.normalize_catalog_key(v_name), p_is_active, v_actor, v_actor);
  else
    select * into v_before from app_private.product_bundles where id = p_bundle_id for update;
    if not found then
      return app_private.command_error('REFERENCE_NOT_FOUND', 'Không tìm thấy gói hàng.', v_correlation);
    end if;
    if v_before.version is distinct from p_expected_version then
      return app_private.command_error('VERSION_CONFLICT', 'Gói hàng đã thay đổi. Vui lòng tải lại.', v_correlation);
    end if;
    v_version := v_before.version + 1;
    update app_private.product_bundles
    set name = v_name, name_normalized = app_private.normalize_catalog_key(v_name), is_active = p_is_active,
        version = v_version, updated_by = v_actor, updated_at = now()
    where id = p_bundle_id;
    delete from app_private.product_bundle_lines where bundle_id = p_bundle_id;
  end if;
  insert into app_private.product_bundle_lines(bundle_id, product_id, quantity, line_order)
  select v_id, (e->>'productId')::uuid, (e->>'quantity')::integer, (ord - 1)::integer
  from jsonb_array_elements(p_lines) with ordinality as x(e, ord);

  insert into app_private.audit_events(actor_id, action, entity_type, entity_id, before_data, after_data, correlation_id)
  values (v_actor, case when p_bundle_id is null then 'product_bundle.created' else 'product_bundle.updated' end, 'product_bundle', v_id,
    case when p_bundle_id is null then null else jsonb_build_object('name', v_before.name, 'isActive', v_before.is_active) end,
    jsonb_build_object('name', v_name, 'isActive', p_is_active, 'lines', p_lines), v_correlation);
  v_result := app_private.command_success(jsonb_build_object('bundleId', v_id, 'version', v_version), v_correlation);
  insert into app_private.command_deduplication(actor_id, command_name, idempotency_key, response)
  values (v_actor, 'catalog.save_bundle', p_idempotency_key, v_result);
  return v_result;
exception when unique_violation then
  return app_private.command_error('DUPLICATE_IN_DATABASE', 'Tên gói hàng đã tồn tại.', v_correlation);
end $$;

create function api.list_product_bundles(p_include_inactive boolean default false)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select app_private.list_product_bundles_impl(p_include_inactive);
$$;
create function api.save_product_bundle(p_bundle_id uuid, p_expected_version bigint, p_name text, p_is_active boolean, p_lines jsonb, p_idempotency_key uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select app_private.save_product_bundle_impl(p_bundle_id, p_expected_version, p_name, p_is_active, p_lines, p_idempotency_key);
$$;
revoke all on function app_private.list_product_bundles_impl(boolean), api.list_product_bundles(boolean),
  app_private.save_product_bundle_impl(uuid, bigint, text, boolean, jsonb, uuid), api.save_product_bundle(uuid, bigint, text, boolean, jsonb, uuid) from public, anon;
grant execute on function app_private.list_product_bundles_impl(boolean), api.list_product_bundles(boolean),
  app_private.save_product_bundle_impl(uuid, bigint, text, boolean, jsonb, uuid), api.save_product_bundle(uuid, bigint, text, boolean, jsonb, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
