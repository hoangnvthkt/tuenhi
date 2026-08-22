create table api.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = btrim(name) and length(name) between 1 and 120),
  name_normalized text not null check (
    name_normalized = btrim(name_normalized)
    and length(name_normalized) between 1 and 120
  ),
  is_active boolean not null default true,
  created_by uuid not null references api.profiles(id) on delete restrict,
  updated_by uuid not null references api.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name_normalized)
);

create index categories_active_name_idx
  on api.categories (is_active, name_normalized, id);
create index categories_created_by_idx on api.categories (created_by);
create index categories_updated_by_idx on api.categories (updated_by);

create table api.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null check (sku = btrim(sku) and length(sku) between 1 and 64),
  sku_normalized text not null check (
    sku_normalized = btrim(sku_normalized)
    and length(sku_normalized) between 1 and 64
  ),
  barcode text null check (
    barcode is null
    or (barcode = btrim(barcode) and length(barcode) between 1 and 64)
  ),
  name text not null check (name = btrim(name) and length(name) between 1 and 200),
  name_normalized text not null check (
    name_normalized = btrim(name_normalized)
    and length(name_normalized) between 1 and 200
  ),
  category_id uuid null references api.categories(id) on delete restrict,
  unit_name text not null check (
    unit_name = btrim(unit_name)
    and length(unit_name) between 1 and 50
  ),
  description text null check (
    description is null
    or (description = btrim(description) and length(description) between 1 and 2000)
  ),
  specifications jsonb not null default '{}'::jsonb check (
    jsonb_typeof(specifications) = 'object'
  ),
  min_stock_qty numeric(18,3) not null default 0 check (min_stock_qty >= 0),
  is_active boolean not null default true,
  version bigint not null default 1 check (version >= 1),
  created_by uuid not null references api.profiles(id) on delete restrict,
  updated_by uuid not null references api.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sku_normalized)
);

create unique index products_barcode_uidx
  on api.products (barcode)
  where barcode is not null;
create index products_active_name_idx
  on api.products (is_active, name_normalized, id);
create index products_category_active_name_idx
  on api.products (category_id, is_active, name_normalized, id);
create index products_created_by_idx on api.products (created_by);
create index products_updated_by_idx on api.products (updated_by);

create table api.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references api.products(id) on delete restrict,
  object_path text not null unique check (
    object_path = btrim(object_path)
    and length(object_path) between 1 and 500
  ),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_primary boolean not null default false,
  uploaded_by uuid not null references api.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index product_images_product_sort_idx
  on api.product_images (product_id, sort_order, id);
create index product_images_uploaded_by_idx on api.product_images (uploaded_by);
create unique index product_images_one_primary_uidx
  on api.product_images (product_id)
  where is_primary;

create table api.suppliers (
  id uuid primary key default gen_random_uuid(),
  code text null check (
    code is null or (code = btrim(code) and length(code) between 1 and 64)
  ),
  code_normalized text null check (
    code_normalized is null
    or (code_normalized = btrim(code_normalized) and length(code_normalized) between 1 and 64)
  ),
  name text not null check (name = btrim(name) and length(name) between 1 and 200),
  name_normalized text not null check (
    name_normalized = btrim(name_normalized)
    and length(name_normalized) between 1 and 200
  ),
  phone_e164 text null check (
    phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'
  ),
  email text null check (
    email is null
    or (email = lower(btrim(email)) and length(email) between 3 and 254)
  ),
  address text null check (
    address is null
    or (address = btrim(address) and length(address) between 1 and 500)
  ),
  notes text null check (
    notes is null or (notes = btrim(notes) and length(notes) between 1 and 1000)
  ),
  is_active boolean not null default true,
  version bigint not null default 1 check (version >= 1),
  created_by uuid not null references api.profiles(id) on delete restrict,
  updated_by uuid not null references api.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index suppliers_code_uidx
  on api.suppliers (code_normalized)
  where code_normalized is not null;
create index suppliers_active_name_idx
  on api.suppliers (is_active, name_normalized, id);
create index suppliers_created_by_idx on api.suppliers (created_by);
create index suppliers_updated_by_idx on api.suppliers (updated_by);

create table api.customers (
  id uuid primary key default gen_random_uuid(),
  code text null check (
    code is null or (code = btrim(code) and length(code) between 1 and 64)
  ),
  code_normalized text null check (
    code_normalized is null
    or (code_normalized = btrim(code_normalized) and length(code_normalized) between 1 and 64)
  ),
  customer_type text not null default 'INDIVIDUAL' check (
    customer_type in ('INDIVIDUAL', 'BUSINESS')
  ),
  name text not null check (name = btrim(name) and length(name) between 1 and 200),
  name_normalized text not null check (
    name_normalized = btrim(name_normalized)
    and length(name_normalized) between 1 and 200
  ),
  phone_e164 text null check (
    phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'
  ),
  email text null check (
    email is null
    or (email = lower(btrim(email)) and length(email) between 3 and 254)
  ),
  address text null check (
    address is null
    or (address = btrim(address) and length(address) between 1 and 500)
  ),
  company_name text null check (
    company_name is null
    or (company_name = btrim(company_name) and length(company_name) between 1 and 200)
  ),
  tax_code text null check (
    tax_code is null
    or (tax_code = btrim(tax_code) and length(tax_code) between 1 and 32)
  ),
  customer_group text null check (
    customer_group is null
    or (customer_group = btrim(customer_group) and length(customer_group) between 1 and 120)
  ),
  notes text null check (
    notes is null or (notes = btrim(notes) and length(notes) between 1 and 1000)
  ),
  is_active boolean not null default true,
  version bigint not null default 1 check (version >= 1),
  created_by uuid not null references api.profiles(id) on delete restrict,
  updated_by uuid not null references api.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (customer_type <> 'BUSINESS' or company_name is not null)
);

create unique index customers_code_uidx
  on api.customers (code_normalized)
  where code_normalized is not null;
create index customers_active_name_idx
  on api.customers (is_active, name_normalized, id);
create index customers_created_by_idx on api.customers (created_by);
create index customers_updated_by_idx on api.customers (updated_by);

create table api.sales_channels (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z][A-Z0-9_]{1,31}$'),
  name text not null check (name = btrim(name) and length(name) between 1 and 120),
  name_normalized text not null check (
    name_normalized = btrim(name_normalized)
    and length(name_normalized) between 1 and 120
  ),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  version bigint not null default 1 check (version >= 1),
  created_by uuid null references api.profiles(id) on delete restrict,
  updated_by uuid null references api.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sales_channels_active_name_idx
  on api.sales_channels (is_active, name_normalized, id);
create index sales_channels_sort_idx
  on api.sales_channels (is_active, sort_order, code);
create index sales_channels_created_by_idx on api.sales_channels (created_by)
  where created_by is not null;
create index sales_channels_updated_by_idx on api.sales_channels (updated_by)
  where updated_by is not null;

create table api.inventory_balances (
  product_id uuid primary key references api.products(id) on delete restrict,
  on_hand_qty numeric(18,3) not null default 0 check (on_hand_qty >= 0),
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now()
);

create table app_private.product_sale_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references api.products(id) on delete restrict,
  sale_price numeric(18,2) not null check (sale_price >= 0),
  valid_from timestamptz not null default now(),
  valid_to timestamptz null check (valid_to is null or valid_to > valid_from),
  changed_by uuid not null references api.profiles(id) on delete restrict,
  change_reason text null check (
    change_reason is null
    or (change_reason = btrim(change_reason) and length(change_reason) between 1 and 500)
  )
);

create unique index product_sale_prices_current_uidx
  on app_private.product_sale_prices (product_id)
  where valid_to is null;
create index product_sale_prices_history_idx
  on app_private.product_sale_prices (product_id, valid_from desc, id desc);
create index product_sale_prices_changed_by_idx
  on app_private.product_sale_prices (changed_by, valid_from desc, id desc);

insert into app_private.permission_definitions (
  code,
  category,
  label,
  owner_only,
  description
) values
  ('supplier.read', 'Đối tác', 'Xem nhà cung cấp', false, 'Xem danh sách và thông tin nhà cung cấp.'),
  ('customer.read', 'Đối tác', 'Xem khách hàng', false, 'Xem hồ sơ khách hàng trong phạm vi đã phê duyệt.')
on conflict (code) do nothing;

insert into app_private.role_default_permissions (
  role_template,
  permission_code,
  allowed
) values
  ('SALES_WAREHOUSE', 'supplier.read', true),
  ('SALES_WAREHOUSE', 'customer.read', true),
  ('BUSINESS', 'supplier.read', false),
  ('BUSINESS', 'customer.read', true)
on conflict (role_template, permission_code) do update
set allowed = excluded.allowed;

insert into api.sales_channels (
  code,
  name,
  name_normalized,
  sort_order,
  is_active
) values
  ('IN_STORE', 'Tại quầy', 'tại quầy', 10, true),
  ('REMOTE_PROVINCE', 'Khách tỉnh', 'khách tỉnh', 20, true),
  ('ONLINE', 'Online', 'online', 30, true),
  ('WHOLESALE', 'Đại lý', 'đại lý', 40, true)
on conflict (code) do nothing;

alter table api.categories enable row level security;
alter table api.categories force row level security;
alter table api.products enable row level security;
alter table api.products force row level security;
alter table api.product_images enable row level security;
alter table api.product_images force row level security;
alter table api.suppliers enable row level security;
alter table api.suppliers force row level security;
alter table api.customers enable row level security;
alter table api.customers force row level security;
alter table api.sales_channels enable row level security;
alter table api.sales_channels force row level security;
alter table api.inventory_balances enable row level security;
alter table api.inventory_balances force row level security;
alter table app_private.product_sale_prices enable row level security;
alter table app_private.product_sale_prices force row level security;

create policy categories_read on api.categories for select to authenticated
using ((select app_private.has_permission('catalog.read')));
create policy products_read on api.products for select to authenticated
using ((select app_private.has_permission('catalog.read')));
create policy product_images_read on api.product_images for select to authenticated
using ((select app_private.has_permission('catalog.read')));
create policy suppliers_read on api.suppliers for select to authenticated
using (
  (select app_private.has_permission('supplier.read'))
  or (select app_private.has_permission('supplier.manage'))
);
create policy customers_read on api.customers for select to authenticated
using (
  (select app_private.has_permission('customer.read'))
  or (select app_private.has_permission('customer.manage'))
);
create policy sales_channels_read on api.sales_channels for select to authenticated
using (
  (select app_private.has_active_profile(false))
  and (is_active or (select app_private.has_permission('settings.manage')))
);
create policy inventory_balances_read on api.inventory_balances for select to authenticated
using (
  (select app_private.has_permission('catalog.read'))
  or (select app_private.has_permission('inventory.read'))
);
create policy current_sale_price_read
on app_private.product_sale_prices
for select
to authenticated
using (
  valid_to is null
  and (select app_private.has_permission('pricing.sale.read'))
);

grant select on table api.categories to authenticated;
grant select on table api.products to authenticated;
grant select on table api.product_images to authenticated;
grant select on table api.suppliers to authenticated;
grant select on table api.customers to authenticated;
grant select on table api.sales_channels to authenticated;
grant select on table api.inventory_balances to authenticated;
grant select (product_id, sale_price, valid_from, valid_to)
  on table app_private.product_sale_prices to authenticated;

create view api.product_catalog_read
with (security_invoker = true)
as
select
  p.id,
  p.sku,
  p.sku_normalized,
  p.barcode,
  p.name,
  p.name_normalized,
  p.category_id,
  c.name as category_name,
  p.unit_name,
  p.description,
  p.min_stock_qty,
  p.is_active,
  p.version,
  p.created_at,
  p.updated_at,
  image.object_path as primary_image_path,
  price.sale_price as current_sale_price,
  price.valid_from as sale_price_valid_from,
  balance.on_hand_qty,
  balance.version as inventory_version
from api.products as p
left join api.categories as c on c.id = p.category_id
left join lateral (
  select i.object_path
  from api.product_images as i
  where i.product_id = p.id and i.is_primary
  limit 1
) as image on true
left join app_private.product_sale_prices as price
  on price.product_id = p.id and price.valid_to is null
left join api.inventory_balances as balance on balance.product_id = p.id;

revoke all on table api.product_catalog_read from public, anon, authenticated;
grant select on table api.product_catalog_read to authenticated;

create function app_private.normalize_catalog_key(p_value text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select lower(
    regexp_replace(
      normalize(btrim(p_value), NFC),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );
$$;

create function app_private.empty_to_null(p_value text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select nullif(btrim(p_value), '');
$$;

create function app_private.command_error_with_details(
  p_code text,
  p_message text,
  p_details jsonb,
  p_correlation_id uuid
)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', false,
    'data', null,
    'error', jsonb_build_object(
      'code', p_code,
      'message', p_message,
      'details', coalesce(p_details, '{}'::jsonb)
    ),
    'correlationId', p_correlation_id
  );
$$;

create function app_private.get_product_catalog_impl(
  p_search text default null,
  p_category_id uuid default null,
  p_stock_state text default null,
  p_include_inactive boolean default false,
  p_cursor_name text default null,
  p_cursor_id uuid default null,
  p_limit integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
          and coalesce(catalog.on_hand_qty, 0) = 0
        )
        or (
          p_stock_state = 'LOW_STOCK'
          and coalesce(catalog.on_hand_qty, 0) > 0
          and coalesce(catalog.on_hand_qty, 0) <= catalog.min_stock_qty
        )
        or (
          p_stock_state = 'IN_STOCK'
          and coalesce(catalog.on_hand_qty, 0) > catalog.min_stock_qty
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
        'minStockQty', c.min_stock_qty::text,
        'isActive', c.is_active,
        'version', c.version,
        'primaryImagePath', c.primary_image_path,
        'currentSalePrice', c.current_sale_price::text,
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
$$;

create function api.get_product_catalog(
  p_search text default null,
  p_category_id uuid default null,
  p_stock_state text default null,
  p_include_inactive boolean default false,
  p_cursor_name text default null,
  p_cursor_id uuid default null,
  p_limit integer default 30
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.get_product_catalog_impl(
    p_search,
    p_category_id,
    p_stock_state,
    p_include_inactive,
    p_cursor_name,
    p_cursor_id,
    p_limit
  );
$$;

create function app_private.get_product_detail_impl(p_product_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_correlation_id uuid := gen_random_uuid();
  v_data jsonb;
begin
  if not app_private.has_permission('catalog.read') then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền xem sản phẩm.',
      v_correlation_id
    );
  end if;

  select jsonb_build_object(
    'id', c.id,
    'sku', c.sku,
    'barcode', c.barcode,
    'name', c.name,
    'categoryId', c.category_id,
    'categoryName', c.category_name,
    'unitName', c.unit_name,
    'description', c.description,
    'minStockQty', c.min_stock_qty::text,
    'isActive', c.is_active,
    'version', c.version,
    'currentSalePrice', c.current_sale_price::text,
    'salePriceValidFrom', c.sale_price_valid_from,
    'onHandQty', coalesce(c.on_hand_qty, 0)::text,
    'images', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'objectPath', i.object_path,
        'sortOrder', i.sort_order,
        'isPrimary', i.is_primary
      ) order by i.sort_order, i.id)
      from api.product_images as i
      where i.product_id = c.id
    ), '[]'::jsonb)
  )
  into v_data
  from api.product_catalog_read as c
  where c.id = p_product_id;

  if v_data is null then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND',
      'Không tìm thấy sản phẩm.',
      v_correlation_id
    );
  end if;

  return app_private.command_success(v_data, v_correlation_id);
end;
$$;

create function api.get_product_detail(p_product_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.get_product_detail_impl(p_product_id);
$$;

create function app_private.get_product_sale_price_history_impl(
  p_product_id uuid,
  p_cursor_valid_from timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_correlation_id uuid := gen_random_uuid();
  v_items jsonb;
begin
  if not app_private.has_permission('pricing.sale.manage') then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền xem lịch sử giá bán.',
      v_correlation_id
    );
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100
    or ((p_cursor_valid_from is null) <> (p_cursor_id is null))
  then
    return app_private.command_error(
      'VALIDATION_FAILED',
      'Bộ lọc lịch sử giá chưa hợp lệ.',
      v_correlation_id
    );
  end if;

  select coalesce(jsonb_agg(item order by valid_from desc, id desc), '[]'::jsonb)
  into v_items
  from (
    select
      price.id,
      price.valid_from,
      jsonb_build_object(
        'id', price.id,
        'salePrice', price.sale_price::text,
        'validFrom', price.valid_from,
        'validTo', price.valid_to,
        'changedBy', price.changed_by,
        'changeReason', price.change_reason
      ) as item
    from app_private.product_sale_prices as price
    where price.product_id = p_product_id
      and (
        p_cursor_valid_from is null
        or (price.valid_from, price.id) < (p_cursor_valid_from, p_cursor_id)
      )
    order by price.valid_from desc, price.id desc
    limit p_limit
  ) as page;

  return app_private.command_success(
    jsonb_build_object('items', v_items),
    v_correlation_id
  );
end;
$$;

create function api.get_product_sale_price_history(
  p_product_id uuid,
  p_cursor_valid_from timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 30
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.get_product_sale_price_history_impl(
    p_product_id,
    p_cursor_valid_from,
    p_cursor_id,
    p_limit
  );
$$;

create function app_private.list_categories_impl(
  p_include_inactive boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_correlation_id uuid := gen_random_uuid();
  v_items jsonb;
begin
  if not app_private.has_permission('catalog.read') then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền xem nhóm hàng.',
      v_correlation_id
    );
  end if;
  if p_include_inactive and not app_private.has_permission('catalog.basic.manage') then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền xem nhóm hàng đã tắt.',
      v_correlation_id
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'isActive', c.is_active
  ) order by c.name_normalized, c.id), '[]'::jsonb)
  into v_items
  from api.categories as c
  where p_include_inactive or c.is_active;

  return app_private.command_success(
    jsonb_build_object('items', v_items),
    v_correlation_id
  );
end;
$$;

create function api.list_categories(p_include_inactive boolean default false)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.list_categories_impl(p_include_inactive);
$$;

create function app_private.list_suppliers_impl(
  p_search text default null,
  p_cursor_name text default null,
  p_cursor_id uuid default null,
  p_limit integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_correlation_id uuid := gen_random_uuid();
  v_search text := app_private.normalize_catalog_key(coalesce(p_search, ''));
  v_items jsonb;
begin
  if not (
    app_private.has_permission('supplier.read')
    or app_private.has_permission('supplier.manage')
  ) then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền xem nhà cung cấp.',
      v_correlation_id
    );
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100
    or ((p_cursor_name is null) <> (p_cursor_id is null))
  then
    return app_private.command_error(
      'VALIDATION_FAILED',
      'Bộ lọc nhà cung cấp chưa hợp lệ.',
      v_correlation_id
    );
  end if;

  select coalesce(jsonb_agg(item order by name_normalized, id), '[]'::jsonb)
  into v_items
  from (
    select
      s.id,
      s.name_normalized,
      jsonb_build_object(
        'id', s.id,
        'code', s.code,
        'name', s.name,
        'phone', s.phone_e164,
        'email', s.email,
        'address', s.address,
        'notes', s.notes,
        'isActive', s.is_active,
        'version', s.version
      ) as item
    from api.suppliers as s
    where (
      v_search = ''
      or s.name_normalized like '%' || v_search || '%'
      or s.code_normalized = v_search
      or s.phone_e164 = p_search
    )
      and (
        p_cursor_name is null
        or (s.name_normalized, s.id) > (p_cursor_name, p_cursor_id)
      )
    order by s.name_normalized, s.id
    limit p_limit
  ) as page;

  return app_private.command_success(
    jsonb_build_object('items', v_items),
    v_correlation_id
  );
end;
$$;

create function api.list_suppliers(
  p_search text default null,
  p_cursor_name text default null,
  p_cursor_id uuid default null,
  p_limit integer default 30
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.list_suppliers_impl(
    p_search,
    p_cursor_name,
    p_cursor_id,
    p_limit
  );
$$;

create function app_private.list_customers_impl(
  p_search text default null,
  p_cursor_name text default null,
  p_cursor_id uuid default null,
  p_limit integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_correlation_id uuid := gen_random_uuid();
  v_search text := app_private.normalize_catalog_key(coalesce(p_search, ''));
  v_items jsonb;
begin
  if not (
    app_private.has_permission('customer.read')
    or app_private.has_permission('customer.manage')
  ) then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền xem khách hàng.',
      v_correlation_id
    );
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100
    or ((p_cursor_name is null) <> (p_cursor_id is null))
  then
    return app_private.command_error(
      'VALIDATION_FAILED',
      'Bộ lọc khách hàng chưa hợp lệ.',
      v_correlation_id
    );
  end if;

  select coalesce(jsonb_agg(item order by name_normalized, id), '[]'::jsonb)
  into v_items
  from (
    select
      c.id,
      c.name_normalized,
      jsonb_build_object(
        'id', c.id,
        'code', c.code,
        'customerType', c.customer_type,
        'name', c.name,
        'phone', c.phone_e164,
        'email', c.email,
        'address', c.address,
        'companyName', c.company_name,
        'taxCode', c.tax_code,
        'customerGroup', c.customer_group,
        'notes', c.notes,
        'isActive', c.is_active,
        'version', c.version
      ) as item
    from api.customers as c
    where (
      v_search = ''
      or c.name_normalized like '%' || v_search || '%'
      or c.code_normalized = v_search
      or c.phone_e164 = p_search
    )
      and (
        p_cursor_name is null
        or (c.name_normalized, c.id) > (p_cursor_name, p_cursor_id)
      )
    order by c.name_normalized, c.id
    limit p_limit
  ) as page;

  return app_private.command_success(
    jsonb_build_object('items', v_items),
    v_correlation_id
  );
end;
$$;

create function api.list_customers(
  p_search text default null,
  p_cursor_name text default null,
  p_cursor_id uuid default null,
  p_limit integer default 30
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.list_customers_impl(
    p_search,
    p_cursor_name,
    p_cursor_id,
    p_limit
  );
$$;

create function app_private.list_sales_channels_impl(
  p_include_inactive boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_correlation_id uuid := gen_random_uuid();
  v_items jsonb;
begin
  if not app_private.has_active_profile(false) then
    return app_private.command_error(
      'AUTH_REQUIRED',
      'Vui lòng đăng nhập để xem kênh bán.',
      v_correlation_id
    );
  end if;
  if p_include_inactive and not app_private.has_permission('settings.manage') then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền xem kênh bán đã tắt.',
      v_correlation_id
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'code', c.code,
    'name', c.name,
    'sortOrder', c.sort_order,
    'isActive', c.is_active,
    'version', c.version
  ) order by c.sort_order, c.code), '[]'::jsonb)
  into v_items
  from api.sales_channels as c
  where p_include_inactive or c.is_active;

  return app_private.command_success(
    jsonb_build_object('items', v_items),
    v_correlation_id
  );
end;
$$;

create function api.list_sales_channels(
  p_include_inactive boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.list_sales_channels_impl(p_include_inactive);
$$;

create function app_private.cached_command_response(
  p_actor_id uuid,
  p_command_name text,
  p_idempotency_key uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select d.response
  from app_private.command_deduplication as d
  where d.actor_id = p_actor_id
    and d.command_name = p_command_name
    and d.idempotency_key = p_idempotency_key;
$$;

create function app_private.save_category_impl(
  p_category_id uuid,
  p_name text,
  p_is_active boolean,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_correlation_id uuid := gen_random_uuid();
  v_name text := normalize(btrim(coalesce(p_name, '')), NFC);
  v_normalized text;
  v_id uuid := coalesce(p_category_id, gen_random_uuid());
  v_cached jsonb;
  v_result jsonb;
  v_before api.categories%rowtype;
begin
  if v_actor_id is null or not app_private.has_permission('catalog.basic.manage') then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền quản lý nhóm hàng.',
      v_correlation_id
    );
  end if;
  if p_idempotency_key is null then
    return app_private.command_error(
      'VALIDATION_FAILED',
      'Thiếu mã chống gửi trùng thao tác.',
      v_correlation_id
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    v_actor_id::text || ':catalog.save_category:' || p_idempotency_key::text,
    0
  ));
  v_cached := app_private.cached_command_response(
    v_actor_id,
    'catalog.save_category',
    p_idempotency_key
  );
  if v_cached is not null then return v_cached; end if;

  if length(v_name) < 1 or length(v_name) > 120 or p_is_active is null then
    return app_private.command_error(
      'VALIDATION_FAILED',
      'Tên nhóm hàng phải có từ 1 đến 120 ký tự.',
      v_correlation_id
    );
  end if;
  v_normalized := app_private.normalize_catalog_key(v_name);

  if p_category_id is null then
    insert into api.categories (
      id, name, name_normalized, is_active, created_by, updated_by
    ) values (
      v_id, v_name, v_normalized, p_is_active, v_actor_id, v_actor_id
    );
  else
    select c.* into v_before
    from api.categories as c
    where c.id = p_category_id
    for update;
    if not found then
      return app_private.command_error(
        'REFERENCE_NOT_FOUND',
        'Không tìm thấy nhóm hàng.',
        v_correlation_id
      );
    end if;
    if not p_is_active and exists (
      select 1 from api.products as p
      where p.category_id = p_category_id and p.is_active
    ) then
      return app_private.command_error(
        'CATEGORY_IN_USE',
        'Không thể tắt nhóm hàng đang có sản phẩm hoạt động.',
        v_correlation_id
      );
    end if;
    update api.categories
    set name = v_name,
        name_normalized = v_normalized,
        is_active = p_is_active,
        updated_by = v_actor_id,
        updated_at = now()
    where id = p_category_id;
  end if;

  insert into app_private.audit_events (
    actor_id, action, entity_type, entity_id, before_data, after_data,
    correlation_id
  ) values (
    v_actor_id,
    case when p_category_id is null then 'category.created' else 'category.updated' end,
    'category',
    v_id,
    case when p_category_id is null then null else jsonb_build_object(
      'name', v_before.name, 'isActive', v_before.is_active
    ) end,
    jsonb_build_object('name', v_name, 'isActive', p_is_active),
    v_correlation_id
  );

  v_result := app_private.command_success(
    jsonb_build_object('categoryId', v_id),
    v_correlation_id
  );
  insert into app_private.command_deduplication (
    actor_id, command_name, idempotency_key, response
  ) values (
    v_actor_id, 'catalog.save_category', p_idempotency_key, v_result
  );
  return v_result;
exception
  when unique_violation then
    return app_private.command_error(
      'DUPLICATE_IN_DATABASE',
      'Tên nhóm hàng đã tồn tại.',
      v_correlation_id
    );
end;
$$;

create function api.save_category(
  p_category_id uuid,
  p_name text,
  p_is_active boolean,
  p_idempotency_key uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.save_category_impl(
    p_category_id, p_name, p_is_active, p_idempotency_key
  );
$$;

create function app_private.save_product_impl(
  p_product_id uuid,
  p_expected_version bigint,
  p_product jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_correlation_id uuid := gen_random_uuid();
  v_cached jsonb;
  v_result jsonb;
  v_id uuid := coalesce(p_product_id, gen_random_uuid());
  v_sku text;
  v_sku_normalized text;
  v_barcode text;
  v_name text;
  v_name_normalized text;
  v_category_id uuid;
  v_unit_name text;
  v_description text;
  v_min_stock_text text;
  v_min_stock numeric(18,3);
  v_is_active boolean;
  v_before api.products%rowtype;
  v_version bigint;
begin
  if v_actor_id is null or not app_private.has_permission('catalog.basic.manage') then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền quản lý sản phẩm.',
      v_correlation_id
    );
  end if;
  if p_idempotency_key is null then
    return app_private.command_error(
      'VALIDATION_FAILED',
      'Thiếu mã chống gửi trùng thao tác.',
      v_correlation_id
    );
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_actor_id::text || ':catalog.save_product:' || p_idempotency_key::text,
    0
  ));
  v_cached := app_private.cached_command_response(
    v_actor_id, 'catalog.save_product', p_idempotency_key
  );
  if v_cached is not null then return v_cached; end if;

  if jsonb_typeof(p_product) <> 'object'
    or p_product - array[
      'sku', 'barcode', 'name', 'categoryId', 'unitName', 'description',
      'minStockQty', 'isActive'
    ] <> '{}'::jsonb
  then
    return app_private.command_error(
      'VALIDATION_FAILED',
      'Dữ liệu sản phẩm chứa trường không được hỗ trợ.',
      v_correlation_id
    );
  end if;

  v_sku := normalize(btrim(coalesce(p_product ->> 'sku', '')), NFC);
  v_sku_normalized := app_private.normalize_catalog_key(v_sku);
  v_barcode := app_private.empty_to_null(p_product ->> 'barcode');
  v_name := normalize(btrim(coalesce(p_product ->> 'name', '')), NFC);
  v_name_normalized := app_private.normalize_catalog_key(v_name);
  v_category_id := nullif(p_product ->> 'categoryId', '')::uuid;
  v_unit_name := normalize(btrim(coalesce(p_product ->> 'unitName', '')), NFC);
  v_description := app_private.empty_to_null(p_product ->> 'description');
  v_min_stock_text := coalesce(nullif(p_product ->> 'minStockQty', ''), '0');
  v_is_active := coalesce((p_product ->> 'isActive')::boolean, true);

  if length(v_sku) < 1 or length(v_sku) > 64
    or length(v_name) < 1 or length(v_name) > 200
    or length(v_unit_name) < 1 or length(v_unit_name) > 50
    or length(coalesce(v_barcode, '')) > 64
    or length(coalesce(v_description, '')) > 2000
    or v_min_stock_text !~ '^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,3})?$'
    or length(split_part(v_min_stock_text, '.', 1)) > 15
  then
    return app_private.command_error(
      'VALIDATION_FAILED',
      'Thông tin sản phẩm chưa đúng định dạng hoặc vượt giới hạn.',
      v_correlation_id
    );
  end if;
  v_min_stock := v_min_stock_text::numeric(18,3);

  if v_category_id is not null and not exists (
    select 1 from api.categories as c
    where c.id = v_category_id and c.is_active
  ) then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND',
      'Nhóm hàng không tồn tại hoặc đã ngừng hoạt động.',
      v_correlation_id
    );
  end if;

  if p_product_id is null then
    if p_expected_version is not null then
      return app_private.command_error(
        'VALIDATION_FAILED',
        'Sản phẩm mới không được có phiên bản cũ.',
        v_correlation_id
      );
    end if;
    insert into api.products (
      id, sku, sku_normalized, barcode, name, name_normalized, category_id,
      unit_name, description, min_stock_qty, is_active, created_by, updated_by
    ) values (
      v_id, v_sku, v_sku_normalized, v_barcode, v_name, v_name_normalized,
      v_category_id, v_unit_name, v_description, v_min_stock, v_is_active,
      v_actor_id, v_actor_id
    ) returning version into v_version;
    insert into api.inventory_balances (product_id, on_hand_qty)
    values (v_id, 0);
  else
    select p.* into v_before
    from api.products as p
    where p.id = p_product_id
    for update;
    if not found then
      return app_private.command_error(
        'REFERENCE_NOT_FOUND',
        'Không tìm thấy sản phẩm.',
        v_correlation_id
      );
    end if;
    if p_expected_version is null or v_before.version <> p_expected_version then
      return app_private.command_error_with_details(
        'VERSION_CONFLICT',
        'Sản phẩm đã được người khác cập nhật. Vui lòng tải lại dữ liệu.',
        jsonb_build_object('currentVersion', v_before.version),
        v_correlation_id
      );
    end if;
    update api.products
    set sku = v_sku,
        sku_normalized = v_sku_normalized,
        barcode = v_barcode,
        name = v_name,
        name_normalized = v_name_normalized,
        category_id = v_category_id,
        unit_name = v_unit_name,
        description = v_description,
        min_stock_qty = v_min_stock,
        is_active = v_is_active,
        version = version + 1,
        updated_by = v_actor_id,
        updated_at = now()
    where id = p_product_id
    returning version into v_version;
  end if;

  insert into app_private.audit_events (
    actor_id, action, entity_type, entity_id, before_data, after_data,
    correlation_id
  ) values (
    v_actor_id,
    case when p_product_id is null then 'product.created' else 'product.updated' end,
    'product',
    v_id,
    case when p_product_id is null then null else jsonb_build_object(
      'sku', v_before.sku,
      'name', v_before.name,
      'categoryId', v_before.category_id,
      'isActive', v_before.is_active,
      'version', v_before.version
    ) end,
    jsonb_build_object(
      'sku', v_sku,
      'name', v_name,
      'categoryId', v_category_id,
      'isActive', v_is_active,
      'version', v_version
    ),
    v_correlation_id
  );

  v_result := app_private.command_success(
    jsonb_build_object('productId', v_id, 'version', v_version),
    v_correlation_id
  );
  insert into app_private.command_deduplication (
    actor_id, command_name, idempotency_key, response
  ) values (
    v_actor_id, 'catalog.save_product', p_idempotency_key, v_result
  );
  return v_result;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return app_private.command_error(
      'VALIDATION_FAILED',
      'Thông tin sản phẩm chưa đúng định dạng.',
      v_correlation_id
    );
  when unique_violation then
    return app_private.command_error(
      'DUPLICATE_IN_DATABASE',
      'SKU hoặc mã vạch đã tồn tại.',
      v_correlation_id
    );
end;
$$;

create function api.save_product(
  p_product_id uuid,
  p_expected_version bigint,
  p_product jsonb,
  p_idempotency_key uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.save_product_impl(
    p_product_id, p_expected_version, p_product, p_idempotency_key
  );
$$;

create function app_private.set_product_sale_price_impl(
  p_product_id uuid,
  p_sale_price text,
  p_change_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_correlation_id uuid := gen_random_uuid();
  v_cached jsonb;
  v_result jsonb;
  v_price numeric(18,2);
  v_reason text := app_private.empty_to_null(p_change_reason);
  v_previous numeric(18,2);
  v_price_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if v_actor_id is null or not app_private.has_permission('pricing.sale.manage') then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền thay đổi giá bán.',
      v_correlation_id
    );
  end if;
  if p_idempotency_key is null then
    return app_private.command_error(
      'VALIDATION_FAILED',
      'Thiếu mã chống gửi trùng thao tác.',
      v_correlation_id
    );
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_actor_id::text || ':pricing.set_sale_price:' || p_idempotency_key::text,
    0
  ));
  v_cached := app_private.cached_command_response(
    v_actor_id, 'pricing.set_sale_price', p_idempotency_key
  );
  if v_cached is not null then return v_cached; end if;

  if p_sale_price is null
    or p_sale_price !~ '^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$'
    or length(split_part(p_sale_price, '.', 1)) > 16
    or length(coalesce(v_reason, '')) > 500
  then
    return app_private.command_error(
      'VALIDATION_FAILED',
      'Giá bán phải là số không âm, tối đa 2 chữ số thập phân.',
      v_correlation_id
    );
  end if;
  v_price := p_sale_price::numeric(18,2);

  perform 1 from api.products as p where p.id = p_product_id for update;
  if not found then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND',
      'Không tìm thấy sản phẩm.',
      v_correlation_id
    );
  end if;

  select price.sale_price into v_previous
  from app_private.product_sale_prices as price
  where price.product_id = p_product_id and price.valid_to is null
  for update;

  if v_previous is not null and v_previous = v_price then
    select price.id into v_price_id
    from app_private.product_sale_prices as price
    where price.product_id = p_product_id and price.valid_to is null;
  else
    update app_private.product_sale_prices
    set valid_to = v_now
    where product_id = p_product_id and valid_to is null;

    insert into app_private.product_sale_prices (
      product_id, sale_price, valid_from, changed_by, change_reason
    ) values (
      p_product_id, v_price, v_now, v_actor_id, v_reason
    ) returning id into v_price_id;

    insert into app_private.audit_events (
      actor_id, action, entity_type, entity_id, before_data, after_data,
      correlation_id
    ) values (
      v_actor_id,
      'product.sale_price_changed',
      'product',
      p_product_id,
      case when v_previous is null then null else jsonb_build_object(
        'salePrice', v_previous::text
      ) end,
      jsonb_build_object('salePrice', v_price::text, 'reason', v_reason),
      v_correlation_id
    );
  end if;

  v_result := app_private.command_success(
    jsonb_build_object(
      'productId', p_product_id,
      'priceId', v_price_id,
      'salePrice', v_price::text
    ),
    v_correlation_id
  );
  insert into app_private.command_deduplication (
    actor_id, command_name, idempotency_key, response
  ) values (
    v_actor_id, 'pricing.set_sale_price', p_idempotency_key, v_result
  );
  return v_result;
exception
  when numeric_value_out_of_range then
    return app_private.command_error(
      'VALIDATION_FAILED',
      'Giá bán vượt quá giới hạn hệ thống.',
      v_correlation_id
    );
end;
$$;

create function api.set_product_sale_price(
  p_product_id uuid,
  p_sale_price text,
  p_change_reason text,
  p_idempotency_key uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.set_product_sale_price_impl(
    p_product_id, p_sale_price, p_change_reason, p_idempotency_key
  );
$$;

create function app_private.save_supplier_impl(
  p_supplier_id uuid,
  p_expected_version bigint,
  p_supplier jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_correlation_id uuid := gen_random_uuid();
  v_cached jsonb;
  v_result jsonb;
  v_id uuid := coalesce(p_supplier_id, gen_random_uuid());
  v_code text;
  v_name text;
  v_phone text;
  v_email text;
  v_address text;
  v_notes text;
  v_is_active boolean;
  v_before api.suppliers%rowtype;
  v_version bigint;
begin
  if v_actor_id is null or not app_private.has_permission('supplier.manage') then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền quản lý nhà cung cấp.',
      v_correlation_id
    );
  end if;
  if p_idempotency_key is null then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Thiếu mã chống gửi trùng thao tác.', v_correlation_id
    );
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_actor_id::text || ':supplier.save:' || p_idempotency_key::text, 0
  ));
  v_cached := app_private.cached_command_response(
    v_actor_id, 'supplier.save', p_idempotency_key
  );
  if v_cached is not null then return v_cached; end if;

  if jsonb_typeof(p_supplier) <> 'object'
    or p_supplier - array[
      'code', 'name', 'phone', 'email', 'address', 'notes', 'isActive'
    ] <> '{}'::jsonb
  then
    return app_private.command_error(
      'VALIDATION_FAILED',
      'Dữ liệu nhà cung cấp chứa trường không được hỗ trợ.',
      v_correlation_id
    );
  end if;

  v_code := app_private.empty_to_null(p_supplier ->> 'code');
  v_name := normalize(btrim(coalesce(p_supplier ->> 'name', '')), NFC);
  v_phone := app_private.empty_to_null(p_supplier ->> 'phone');
  v_email := lower(app_private.empty_to_null(p_supplier ->> 'email'));
  v_address := app_private.empty_to_null(p_supplier ->> 'address');
  v_notes := app_private.empty_to_null(p_supplier ->> 'notes');
  v_is_active := coalesce((p_supplier ->> 'isActive')::boolean, true);

  if length(v_name) < 1 or length(v_name) > 200
    or length(coalesce(v_code, '')) > 64
    or length(coalesce(v_address, '')) > 500
    or length(coalesce(v_notes, '')) > 1000
    or (v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$')
    or (v_email is not null and (
      length(v_email) > 254
      or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ))
  then
    return app_private.command_error(
      'VALIDATION_FAILED',
      'Thông tin nhà cung cấp chưa đúng định dạng hoặc vượt giới hạn.',
      v_correlation_id
    );
  end if;

  if p_supplier_id is null then
    if p_expected_version is not null then
      return app_private.command_error(
        'VALIDATION_FAILED',
        'Nhà cung cấp mới không được có phiên bản cũ.',
        v_correlation_id
      );
    end if;
    insert into api.suppliers (
      id, code, code_normalized, name, name_normalized, phone_e164, email,
      address, notes, is_active, created_by, updated_by
    ) values (
      v_id, v_code,
      case when v_code is null then null else app_private.normalize_catalog_key(v_code) end,
      v_name, app_private.normalize_catalog_key(v_name), v_phone, v_email,
      v_address, v_notes, v_is_active, v_actor_id, v_actor_id
    ) returning version into v_version;
  else
    select s.* into v_before
    from api.suppliers as s where s.id = p_supplier_id for update;
    if not found then
      return app_private.command_error(
        'REFERENCE_NOT_FOUND', 'Không tìm thấy nhà cung cấp.', v_correlation_id
      );
    end if;
    if p_expected_version is null or v_before.version <> p_expected_version then
      return app_private.command_error_with_details(
        'VERSION_CONFLICT',
        'Nhà cung cấp đã được người khác cập nhật. Vui lòng tải lại dữ liệu.',
        jsonb_build_object('currentVersion', v_before.version),
        v_correlation_id
      );
    end if;
    update api.suppliers
    set code = v_code,
        code_normalized = case when v_code is null then null else app_private.normalize_catalog_key(v_code) end,
        name = v_name,
        name_normalized = app_private.normalize_catalog_key(v_name),
        phone_e164 = v_phone,
        email = v_email,
        address = v_address,
        notes = v_notes,
        is_active = v_is_active,
        version = version + 1,
        updated_by = v_actor_id,
        updated_at = now()
    where id = p_supplier_id
    returning version into v_version;
  end if;

  insert into app_private.audit_events (
    actor_id, action, entity_type, entity_id, before_data, after_data,
    correlation_id
  ) values (
    v_actor_id,
    case when p_supplier_id is null then 'supplier.created' else 'supplier.updated' end,
    'supplier', v_id,
    case when p_supplier_id is null then null else jsonb_build_object(
      'code', v_before.code, 'name', v_before.name,
      'isActive', v_before.is_active, 'version', v_before.version
    ) end,
    jsonb_build_object(
      'code', v_code, 'name', v_name, 'isActive', v_is_active,
      'version', v_version
    ),
    v_correlation_id
  );
  v_result := app_private.command_success(
    jsonb_build_object('supplierId', v_id, 'version', v_version),
    v_correlation_id
  );
  insert into app_private.command_deduplication (
    actor_id, command_name, idempotency_key, response
  ) values (v_actor_id, 'supplier.save', p_idempotency_key, v_result);
  return v_result;
exception
  when invalid_text_representation then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Thông tin nhà cung cấp chưa đúng định dạng.', v_correlation_id
    );
  when unique_violation then
    return app_private.command_error(
      'DUPLICATE_IN_DATABASE', 'Mã nhà cung cấp đã tồn tại.', v_correlation_id
    );
end;
$$;

create function api.save_supplier(
  p_supplier_id uuid,
  p_expected_version bigint,
  p_supplier jsonb,
  p_idempotency_key uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.save_supplier_impl(
    p_supplier_id, p_expected_version, p_supplier, p_idempotency_key
  );
$$;

create function app_private.save_customer_impl(
  p_customer_id uuid,
  p_expected_version bigint,
  p_customer jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_correlation_id uuid := gen_random_uuid();
  v_cached jsonb;
  v_result jsonb;
  v_id uuid := coalesce(p_customer_id, gen_random_uuid());
  v_code text;
  v_type text;
  v_name text;
  v_phone text;
  v_email text;
  v_address text;
  v_company text;
  v_tax_code text;
  v_group text;
  v_notes text;
  v_is_active boolean;
  v_before api.customers%rowtype;
  v_version bigint;
begin
  if v_actor_id is null or not app_private.has_permission('customer.manage') then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Bạn không có quyền quản lý khách hàng.', v_correlation_id
    );
  end if;
  if p_idempotency_key is null then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Thiếu mã chống gửi trùng thao tác.', v_correlation_id
    );
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_actor_id::text || ':customer.save:' || p_idempotency_key::text, 0
  ));
  v_cached := app_private.cached_command_response(
    v_actor_id, 'customer.save', p_idempotency_key
  );
  if v_cached is not null then return v_cached; end if;

  if jsonb_typeof(p_customer) <> 'object'
    or p_customer - array[
      'code', 'customerType', 'name', 'phone', 'email', 'address',
      'companyName', 'taxCode', 'customerGroup', 'notes', 'isActive'
    ] <> '{}'::jsonb
  then
    return app_private.command_error(
      'VALIDATION_FAILED',
      'Dữ liệu khách hàng chứa trường không được hỗ trợ hoặc nhạy cảm.',
      v_correlation_id
    );
  end if;

  v_code := app_private.empty_to_null(p_customer ->> 'code');
  v_type := coalesce(nullif(p_customer ->> 'customerType', ''), 'INDIVIDUAL');
  v_name := normalize(btrim(coalesce(p_customer ->> 'name', '')), NFC);
  v_phone := app_private.empty_to_null(p_customer ->> 'phone');
  v_email := lower(app_private.empty_to_null(p_customer ->> 'email'));
  v_address := app_private.empty_to_null(p_customer ->> 'address');
  v_company := app_private.empty_to_null(p_customer ->> 'companyName');
  v_tax_code := app_private.empty_to_null(p_customer ->> 'taxCode');
  v_group := app_private.empty_to_null(p_customer ->> 'customerGroup');
  v_notes := app_private.empty_to_null(p_customer ->> 'notes');
  v_is_active := coalesce((p_customer ->> 'isActive')::boolean, true);

  if v_type not in ('INDIVIDUAL', 'BUSINESS')
    or (v_type = 'BUSINESS' and v_company is null)
    or length(v_name) < 1 or length(v_name) > 200
    or length(coalesce(v_code, '')) > 64
    or length(coalesce(v_address, '')) > 500
    or length(coalesce(v_company, '')) > 200
    or length(coalesce(v_tax_code, '')) > 32
    or length(coalesce(v_group, '')) > 120
    or length(coalesce(v_notes, '')) > 1000
    or (v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$')
    or (v_email is not null and (
      length(v_email) > 254
      or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ))
  then
    return app_private.command_error(
      'VALIDATION_FAILED',
      'Thông tin khách hàng chưa đúng định dạng hoặc vượt giới hạn.',
      v_correlation_id
    );
  end if;

  if p_customer_id is null then
    if p_expected_version is not null then
      return app_private.command_error(
        'VALIDATION_FAILED',
        'Khách hàng mới không được có phiên bản cũ.',
        v_correlation_id
      );
    end if;
    insert into api.customers (
      id, code, code_normalized, customer_type, name, name_normalized,
      phone_e164, email, address, company_name, tax_code, customer_group,
      notes, is_active, created_by, updated_by
    ) values (
      v_id, v_code,
      case when v_code is null then null else app_private.normalize_catalog_key(v_code) end,
      v_type, v_name, app_private.normalize_catalog_key(v_name), v_phone,
      v_email, v_address, v_company, v_tax_code, v_group, v_notes,
      v_is_active, v_actor_id, v_actor_id
    ) returning version into v_version;
  else
    select c.* into v_before
    from api.customers as c where c.id = p_customer_id for update;
    if not found then
      return app_private.command_error(
        'REFERENCE_NOT_FOUND', 'Không tìm thấy khách hàng.', v_correlation_id
      );
    end if;
    if p_expected_version is null or v_before.version <> p_expected_version then
      return app_private.command_error_with_details(
        'VERSION_CONFLICT',
        'Khách hàng đã được người khác cập nhật. Vui lòng tải lại dữ liệu.',
        jsonb_build_object('currentVersion', v_before.version),
        v_correlation_id
      );
    end if;
    update api.customers
    set code = v_code,
        code_normalized = case when v_code is null then null else app_private.normalize_catalog_key(v_code) end,
        customer_type = v_type,
        name = v_name,
        name_normalized = app_private.normalize_catalog_key(v_name),
        phone_e164 = v_phone,
        email = v_email,
        address = v_address,
        company_name = v_company,
        tax_code = v_tax_code,
        customer_group = v_group,
        notes = v_notes,
        is_active = v_is_active,
        version = version + 1,
        updated_by = v_actor_id,
        updated_at = now()
    where id = p_customer_id
    returning version into v_version;
  end if;

  insert into app_private.audit_events (
    actor_id, action, entity_type, entity_id, before_data, after_data,
    correlation_id
  ) values (
    v_actor_id,
    case when p_customer_id is null then 'customer.created' else 'customer.updated' end,
    'customer', v_id,
    case when p_customer_id is null then null else jsonb_build_object(
      'code', v_before.code, 'name', v_before.name,
      'customerType', v_before.customer_type,
      'isActive', v_before.is_active, 'version', v_before.version
    ) end,
    jsonb_build_object(
      'code', v_code, 'name', v_name, 'customerType', v_type,
      'isActive', v_is_active, 'version', v_version
    ),
    v_correlation_id
  );
  v_result := app_private.command_success(
    jsonb_build_object('customerId', v_id, 'version', v_version),
    v_correlation_id
  );
  insert into app_private.command_deduplication (
    actor_id, command_name, idempotency_key, response
  ) values (v_actor_id, 'customer.save', p_idempotency_key, v_result);
  return v_result;
exception
  when invalid_text_representation then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Thông tin khách hàng chưa đúng định dạng.', v_correlation_id
    );
  when unique_violation then
    return app_private.command_error(
      'DUPLICATE_IN_DATABASE', 'Mã khách hàng đã tồn tại.', v_correlation_id
    );
end;
$$;

create function api.save_customer(
  p_customer_id uuid,
  p_expected_version bigint,
  p_customer jsonb,
  p_idempotency_key uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.save_customer_impl(
    p_customer_id, p_expected_version, p_customer, p_idempotency_key
  );
$$;

create function app_private.save_sales_channel_impl(
  p_channel_id uuid,
  p_code text,
  p_name text,
  p_sort_order integer,
  p_is_active boolean,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_correlation_id uuid := gen_random_uuid();
  v_cached jsonb;
  v_result jsonb;
  v_id uuid := coalesce(p_channel_id, gen_random_uuid());
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_name text := normalize(btrim(coalesce(p_name, '')), NFC);
  v_before api.sales_channels%rowtype;
begin
  if v_actor_id is null or not app_private.has_permission('settings.manage') then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Bạn không có quyền quản lý kênh bán.', v_correlation_id
    );
  end if;
  if p_idempotency_key is null then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Thiếu mã chống gửi trùng thao tác.', v_correlation_id
    );
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_actor_id::text || ':settings.save_sales_channel:' || p_idempotency_key::text,
    0
  ));
  v_cached := app_private.cached_command_response(
    v_actor_id, 'settings.save_sales_channel', p_idempotency_key
  );
  if v_cached is not null then return v_cached; end if;

  if v_code !~ '^[A-Z][A-Z0-9_]{1,31}$'
    or length(v_name) < 1 or length(v_name) > 120
    or p_sort_order is null or p_sort_order < 0
    or p_is_active is null
  then
    return app_private.command_error(
      'VALIDATION_FAILED',
      'Mã, tên hoặc thứ tự kênh bán chưa hợp lệ.',
      v_correlation_id
    );
  end if;

  if p_channel_id is null then
    insert into api.sales_channels (
      id, code, name, name_normalized, sort_order, is_active,
      created_by, updated_by
    ) values (
      v_id, v_code, v_name, app_private.normalize_catalog_key(v_name),
      p_sort_order, p_is_active, v_actor_id, v_actor_id
    );
  else
    select c.* into v_before
    from api.sales_channels as c where c.id = p_channel_id for update;
    if not found then
      return app_private.command_error(
        'REFERENCE_NOT_FOUND', 'Không tìm thấy kênh bán.', v_correlation_id
      );
    end if;
    if v_before.code <> v_code then
      return app_private.command_error(
        'IMMUTABLE_FIELD',
        'Mã kênh bán không thể thay đổi sau khi tạo.',
        v_correlation_id
      );
    end if;
    update api.sales_channels
    set name = v_name,
        name_normalized = app_private.normalize_catalog_key(v_name),
        sort_order = p_sort_order,
        is_active = p_is_active,
        version = version + 1,
        updated_by = v_actor_id,
        updated_at = now()
    where id = p_channel_id;
  end if;

  insert into app_private.audit_events (
    actor_id, action, entity_type, entity_id, before_data, after_data,
    correlation_id
  ) values (
    v_actor_id,
    case when p_channel_id is null then 'sales_channel.created' else 'sales_channel.updated' end,
    'sales_channel', v_id,
    case when p_channel_id is null then null else jsonb_build_object(
      'code', v_before.code, 'name', v_before.name,
      'sortOrder', v_before.sort_order, 'isActive', v_before.is_active
    ) end,
    jsonb_build_object(
      'code', v_code, 'name', v_name,
      'sortOrder', p_sort_order, 'isActive', p_is_active
    ),
    v_correlation_id
  );

  insert into api.user_notifications (
    user_id, severity, category, title, message, action_route,
    entity_type, entity_id, dedupe_key, metadata, correlation_id
  ) values (
    v_actor_id,
    'SUCCESS',
    'Cấu hình',
    'Đã cập nhật kênh bán',
    format('Kênh bán “%s” đã được lưu.', v_name),
    '/more/sales-channels',
    'sales_channel',
    v_id,
    'sales_channel.saved:' || p_idempotency_key::text,
    jsonb_build_object('code', v_code),
    v_correlation_id
  );

  v_result := app_private.command_success(
    jsonb_build_object('channelId', v_id), v_correlation_id
  );
  insert into app_private.command_deduplication (
    actor_id, command_name, idempotency_key, response
  ) values (
    v_actor_id, 'settings.save_sales_channel', p_idempotency_key, v_result
  );
  return v_result;
exception
  when unique_violation then
    return app_private.command_error(
      'DUPLICATE_IN_DATABASE', 'Mã kênh bán đã tồn tại.', v_correlation_id
    );
end;
$$;

create function api.save_sales_channel(
  p_channel_id uuid,
  p_code text,
  p_name text,
  p_sort_order integer,
  p_is_active boolean,
  p_idempotency_key uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.save_sales_channel_impl(
    p_channel_id, p_code, p_name, p_sort_order, p_is_active,
    p_idempotency_key
  );
$$;

create function app_private.attach_product_image_impl(
  p_product_id uuid,
  p_object_path text,
  p_sort_order integer,
  p_is_primary boolean,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_correlation_id uuid := gen_random_uuid();
  v_cached jsonb;
  v_result jsonb;
  v_image_id uuid := gen_random_uuid();
begin
  if v_actor_id is null or not app_private.has_permission('catalog.basic.manage') then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Bạn không có quyền quản lý ảnh sản phẩm.', v_correlation_id
    );
  end if;
  if p_idempotency_key is null then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Thiếu mã chống gửi trùng thao tác.', v_correlation_id
    );
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_actor_id::text || ':catalog.attach_product_image:' || p_idempotency_key::text,
    0
  ));
  v_cached := app_private.cached_command_response(
    v_actor_id, 'catalog.attach_product_image', p_idempotency_key
  );
  if v_cached is not null then return v_cached; end if;

  if p_sort_order is null or p_sort_order < 0 or p_is_primary is null
    or p_object_path is null
    or p_object_path !~ ('^products/' || p_product_id::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$')
  then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Đường dẫn hoặc thứ tự ảnh chưa hợp lệ.', v_correlation_id
    );
  end if;

  perform 1 from api.products as p where p.id = p_product_id for update;
  if not found then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND', 'Không tìm thấy sản phẩm.', v_correlation_id
    );
  end if;
  if (select count(*) from api.product_images as i where i.product_id = p_product_id) >= 5 then
    return app_private.command_error(
      'IMAGE_LIMIT_EXCEEDED', 'Mỗi sản phẩm chỉ được lưu tối đa 5 ảnh.', v_correlation_id
    );
  end if;
  if p_is_primary then
    update api.product_images set is_primary = false
    where product_id = p_product_id and is_primary;
  end if;
  insert into api.product_images (
    id, product_id, object_path, sort_order, is_primary, uploaded_by
  ) values (
    v_image_id, p_product_id, p_object_path, p_sort_order,
    p_is_primary, v_actor_id
  );

  insert into app_private.audit_events (
    actor_id, action, entity_type, entity_id, after_data, correlation_id
  ) values (
    v_actor_id, 'product.image_attached', 'product_image', v_image_id,
    jsonb_build_object(
      'productId', p_product_id,
      'objectPath', p_object_path,
      'isPrimary', p_is_primary
    ),
    v_correlation_id
  );
  v_result := app_private.command_success(
    jsonb_build_object('productImageId', v_image_id), v_correlation_id
  );
  insert into app_private.command_deduplication (
    actor_id, command_name, idempotency_key, response
  ) values (
    v_actor_id, 'catalog.attach_product_image', p_idempotency_key, v_result
  );
  return v_result;
exception
  when unique_violation then
    return app_private.command_error(
      'DUPLICATE_IN_DATABASE', 'Ảnh sản phẩm đã được liên kết.', v_correlation_id
    );
end;
$$;

create function api.attach_product_image(
  p_product_id uuid,
  p_object_path text,
  p_sort_order integer,
  p_is_primary boolean,
  p_idempotency_key uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.attach_product_image_impl(
    p_product_id, p_object_path, p_sort_order, p_is_primary,
    p_idempotency_key
  );
$$;

create function app_private.remove_product_image_impl(
  p_product_image_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_correlation_id uuid := gen_random_uuid();
  v_cached jsonb;
  v_result jsonb;
  v_image api.product_images%rowtype;
begin
  if v_actor_id is null or not app_private.has_permission('catalog.basic.manage') then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Bạn không có quyền quản lý ảnh sản phẩm.', v_correlation_id
    );
  end if;
  if p_idempotency_key is null then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Thiếu mã chống gửi trùng thao tác.', v_correlation_id
    );
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_actor_id::text || ':catalog.remove_product_image:' || p_idempotency_key::text,
    0
  ));
  v_cached := app_private.cached_command_response(
    v_actor_id, 'catalog.remove_product_image', p_idempotency_key
  );
  if v_cached is not null then return v_cached; end if;

  select i.* into v_image
  from api.product_images as i
  where i.id = p_product_image_id
  for update;
  if not found then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND', 'Không tìm thấy ảnh sản phẩm.', v_correlation_id
    );
  end if;
  delete from api.product_images where id = p_product_image_id;
  insert into app_private.audit_events (
    actor_id, action, entity_type, entity_id, before_data, correlation_id
  ) values (
    v_actor_id, 'product.image_removed', 'product_image', p_product_image_id,
    jsonb_build_object(
      'productId', v_image.product_id,
      'objectPath', v_image.object_path,
      'isPrimary', v_image.is_primary
    ),
    v_correlation_id
  );
  v_result := app_private.command_success(
    jsonb_build_object(
      'productImageId', p_product_image_id,
      'objectPath', v_image.object_path
    ),
    v_correlation_id
  );
  insert into app_private.command_deduplication (
    actor_id, command_name, idempotency_key, response
  ) values (
    v_actor_id, 'catalog.remove_product_image', p_idempotency_key, v_result
  );
  return v_result;
end;
$$;

create function api.remove_product_image(
  p_product_image_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.remove_product_image_impl(
    p_product_image_id, p_idempotency_key
  );
$$;

revoke all on function app_private.normalize_catalog_key(text)
  from public, anon, authenticated;
revoke all on function app_private.empty_to_null(text)
  from public, anon, authenticated;
revoke all on function app_private.command_error_with_details(text, text, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function app_private.cached_command_response(uuid, text, uuid)
  from public, anon, authenticated;

grant execute on function app_private.get_product_catalog_impl(
  text, uuid, text, boolean, text, uuid, integer
) to authenticated;
grant execute on function app_private.get_product_detail_impl(uuid)
  to authenticated;
grant execute on function app_private.get_product_sale_price_history_impl(
  uuid, timestamptz, uuid, integer
) to authenticated;
grant execute on function app_private.list_categories_impl(boolean)
  to authenticated;
grant execute on function app_private.list_suppliers_impl(text, text, uuid, integer)
  to authenticated;
grant execute on function app_private.list_customers_impl(text, text, uuid, integer)
  to authenticated;
grant execute on function app_private.list_sales_channels_impl(boolean)
  to authenticated;
grant execute on function app_private.save_category_impl(uuid, text, boolean, uuid)
  to authenticated;
grant execute on function app_private.save_product_impl(uuid, bigint, jsonb, uuid)
  to authenticated;
grant execute on function app_private.set_product_sale_price_impl(uuid, text, text, uuid)
  to authenticated;
grant execute on function app_private.save_supplier_impl(uuid, bigint, jsonb, uuid)
  to authenticated;
grant execute on function app_private.save_customer_impl(uuid, bigint, jsonb, uuid)
  to authenticated;
grant execute on function app_private.save_sales_channel_impl(
  uuid, text, text, integer, boolean, uuid
) to authenticated;
grant execute on function app_private.attach_product_image_impl(
  uuid, text, integer, boolean, uuid
) to authenticated;
grant execute on function app_private.remove_product_image_impl(uuid, uuid)
  to authenticated;

grant execute on function api.get_product_catalog(
  text, uuid, text, boolean, text, uuid, integer
) to authenticated;
grant execute on function api.get_product_detail(uuid) to authenticated;
grant execute on function api.get_product_sale_price_history(
  uuid, timestamptz, uuid, integer
) to authenticated;
grant execute on function api.list_categories(boolean) to authenticated;
grant execute on function api.list_suppliers(text, text, uuid, integer)
  to authenticated;
grant execute on function api.list_customers(text, text, uuid, integer)
  to authenticated;
grant execute on function api.list_sales_channels(boolean) to authenticated;
grant execute on function api.save_category(uuid, text, boolean, uuid)
  to authenticated;
grant execute on function api.save_product(uuid, bigint, jsonb, uuid)
  to authenticated;
grant execute on function api.set_product_sale_price(uuid, text, text, uuid)
  to authenticated;
grant execute on function api.save_supplier(uuid, bigint, jsonb, uuid)
  to authenticated;
grant execute on function api.save_customer(uuid, bigint, jsonb, uuid)
  to authenticated;
grant execute on function api.save_sales_channel(
  uuid, text, text, integer, boolean, uuid
) to authenticated;
grant execute on function api.attach_product_image(
  uuid, text, integer, boolean, uuid
) to authenticated;
grant execute on function api.remove_product_image(uuid, uuid)
  to authenticated;
