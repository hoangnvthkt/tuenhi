create schema if not exists api;
create schema if not exists app_private;

revoke all on schema api from public, anon, authenticated;
revoke all on schema app_private from public, anon, authenticated;

grant usage on schema api to authenticated, service_role;
grant usage on schema app_private to authenticated, service_role;

alter default privileges for role postgres in schema api
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema api
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema api
  revoke all on functions from public, anon, authenticated;
alter default privileges for role postgres in schema api
  grant all on tables to service_role;
alter default privileges for role postgres in schema api
  grant all on sequences to service_role;
alter default privileges for role postgres in schema api
  grant all on functions to service_role;
alter default privileges for role postgres in schema app_private
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema app_private
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema app_private
  revoke all on functions from public, anon, authenticated;
alter default privileges for role postgres in schema app_private
  grant all on tables to service_role;
alter default privileges for role postgres in schema app_private
  grant all on sequences to service_role;
alter default privileges for role postgres in schema app_private
  grant all on functions to service_role;

create table api.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  email text not null check (email = lower(btrim(email)) and length(email) between 3 and 320),
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  phone text null check (phone is null or length(btrim(phone)) between 1 and 32),
  role_template text not null check (
    role_template in ('SALES_WAREHOUSE', 'BUSINESS', 'OWNER')
  ),
  is_active boolean not null default true,
  must_change_password boolean not null default true,
  last_login_at timestamptz null,
  created_by uuid null references api.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_email_lower_uidx on api.profiles (lower(email));
create index profiles_created_by_idx on api.profiles (created_by)
where created_by is not null;
create index profiles_active_role_idx on api.profiles (is_active, role_template);

alter table api.profiles enable row level security;
alter table api.profiles force row level security;

create table app_private.permission_definitions (
  code text primary key check (code ~ '^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$'),
  category text not null check (length(btrim(category)) between 1 and 80),
  label text not null check (length(btrim(label)) between 1 and 160),
  owner_only boolean not null default false,
  description text not null check (length(btrim(description)) between 1 and 500)
);

create table app_private.role_default_permissions (
  role_template text not null check (
    role_template in ('SALES_WAREHOUSE', 'BUSINESS')
  ),
  permission_code text not null references app_private.permission_definitions(code) on delete restrict,
  allowed boolean not null,
  primary key (role_template, permission_code)
);

create index role_default_permissions_code_idx
  on app_private.role_default_permissions (permission_code);

create table app_private.user_permission_overrides (
  user_id uuid not null references api.profiles(id) on delete restrict,
  permission_code text not null references app_private.permission_definitions(code) on delete restrict,
  effect text not null check (effect in ('GRANT', 'REVOKE')),
  changed_by uuid not null references api.profiles(id) on delete restrict,
  reason text not null check (length(btrim(reason)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, permission_code)
);

create index user_permission_overrides_permission_idx
  on app_private.user_permission_overrides (permission_code);
create index user_permission_overrides_changed_by_idx
  on app_private.user_permission_overrides (changed_by);

create table app_private.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid null references api.profiles(id) on delete restrict,
  action text not null check (length(btrim(action)) between 1 and 120),
  entity_type text not null check (length(btrim(entity_type)) between 1 and 120),
  entity_id uuid null,
  before_data jsonb null check (before_data is null or jsonb_typeof(before_data) = 'object'),
  after_data jsonb null check (after_data is null or jsonb_typeof(after_data) = 'object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  correlation_id uuid not null default gen_random_uuid(),
  occurred_at timestamptz not null default now()
);

create index audit_events_actor_occurred_idx
  on app_private.audit_events (actor_id, occurred_at desc, id desc)
  where actor_id is not null;
create index audit_events_entity_occurred_idx
  on app_private.audit_events (entity_type, entity_id, occurred_at desc)
  where entity_id is not null;

insert into app_private.permission_definitions (
  code,
  category,
  label,
  owner_only,
  description
)
values
  ('dashboard.operational.read', 'Tổng quan', 'Xem tổng quan vận hành', false, 'Xem các chỉ số vận hành không chứa giá vốn hoặc lợi nhuận.'),
  ('catalog.read', 'Hàng hóa', 'Xem danh mục hàng hóa', false, 'Xem sản phẩm, ảnh và thông số hàng hóa.'),
  ('catalog.basic.manage', 'Hàng hóa', 'Quản lý thông tin hàng hóa', false, 'Thêm và sửa thông tin cơ bản của sản phẩm.'),
  ('pricing.sale.read', 'Giá bán', 'Xem giá bán', false, 'Xem giá bán hiện hành của sản phẩm.'),
  ('pricing.sale.manage', 'Giá bán', 'Thay đổi giá bán', true, 'Thay đổi và lưu lịch sử giá bán.'),
  ('inventory.read', 'Tồn kho', 'Xem tồn kho', false, 'Xem số lượng tồn hiện tại, không gồm giá trị tồn.'),
  ('inventory.count.draft', 'Tồn kho', 'Lập phiếu kiểm kho', false, 'Tạo và sửa phiếu kiểm kho chưa ghi sổ.'),
  ('inventory.adjustment.post', 'Tồn kho', 'Ghi sổ điều chỉnh kho', true, 'Chốt chênh lệch và ghi sổ điều chỉnh kho.'),
  ('purchase.draft.manage', 'Nhập hàng', 'Lập phiếu nhập hàng', false, 'Tạo và sửa phiếu nhập hàng chưa ghi sổ.'),
  ('purchase.operational.read', 'Nhập hàng', 'Xem phiếu nhập vận hành', false, 'Xem số lượng nhập mà không xem giá vốn.'),
  ('purchase.cost.read', 'Nhập hàng', 'Xem giá nhập', true, 'Xem giá nhập và dữ liệu giá vốn.'),
  ('purchase.cost.enter', 'Nhập hàng', 'Nhập giá nhập', true, 'Nhập đơn giá thực tế cho phiếu nhập.'),
  ('purchase.post', 'Nhập hàng', 'Ghi sổ phiếu nhập', true, 'Ghi sổ phiếu nhập và cập nhật giá vốn.'),
  ('sale.draft.manage', 'Bán hàng', 'Lập hóa đơn nháp', false, 'Tạo và sửa hóa đơn nháp của bản thân.'),
  ('sale.complete', 'Bán hàng', 'Hoàn tất bán hàng', false, 'Hoàn tất hóa đơn và thu đủ tiền.'),
  ('sale.discount.apply', 'Bán hàng', 'Áp dụng giảm giá', false, 'Áp dụng giảm giá từng dòng và toàn hóa đơn.'),
  ('sale.own.read', 'Hóa đơn', 'Xem hóa đơn của mình', false, 'Xem hóa đơn do bản thân tạo.'),
  ('sale.all.read', 'Hóa đơn', 'Xem mọi hóa đơn', false, 'Xem hóa đơn của toàn cửa hàng.'),
  ('sale.cancel', 'Hóa đơn', 'Hủy hóa đơn', true, 'Hủy hóa đơn hoàn tất khi đủ điều kiện.'),
  ('return.request.create', 'Trả hàng', 'Tạo yêu cầu trả hàng', false, 'Tạo yêu cầu trả từ hóa đơn gốc.'),
  ('return.complete', 'Trả hàng', 'Hoàn tất trả hàng', false, 'Kiểm nhận, hoàn tiền và hoàn tất trả hàng.'),
  ('customer.manage', 'Đối tác', 'Quản lý khách hàng', false, 'Thêm và sửa thông tin khách hàng tối thiểu.'),
  ('supplier.manage', 'Đối tác', 'Quản lý nhà cung cấp', false, 'Thêm và sửa thông tin nhà cung cấp.'),
  ('report.own_revenue.read', 'Báo cáo', 'Xem doanh thu cá nhân', false, 'Xem doanh thu do bản thân tạo.'),
  ('report.all_revenue.read', 'Báo cáo', 'Xem doanh thu cửa hàng', false, 'Xem tổng doanh thu của cửa hàng.'),
  ('report.cost_profit.read', 'Báo cáo', 'Xem giá vốn và lợi nhuận', true, 'Xem giá vốn, giá trị tồn và lợi nhuận gộp.'),
  ('legacy.sale.read', 'Dữ liệu cũ', 'Tra cứu dữ liệu bán hàng cũ', false, 'Tra cứu kho hóa đơn cũ tách khỏi sổ vận hành.'),
  ('legacy.sale.import', 'Dữ liệu cũ', 'Nhập dữ liệu bán hàng cũ', true, 'Nhập và đối soát workbook bán hàng cũ.'),
  ('staff.manage', 'Nhân viên', 'Quản lý nhân viên', true, 'Tạo, khóa, đổi vai trò và phân quyền nhân viên.'),
  ('settings.manage', 'Cấu hình', 'Quản lý cấu hình', true, 'Quản lý cấu hình cửa hàng, chứng từ và kênh bán.'),
  ('audit.read', 'Nhật ký', 'Xem nhật ký audit', true, 'Xem lịch sử thao tác nhạy cảm của hệ thống.');

insert into app_private.role_default_permissions (
  role_template,
  permission_code,
  allowed
)
select
  roles.role_template,
  permissions.code,
  case roles.role_template
    when 'SALES_WAREHOUSE' then permissions.code = any (array[
      'dashboard.operational.read',
      'catalog.read',
      'catalog.basic.manage',
      'pricing.sale.read',
      'inventory.read',
      'inventory.count.draft',
      'purchase.draft.manage',
      'purchase.operational.read',
      'sale.draft.manage',
      'sale.complete',
      'sale.discount.apply',
      'sale.own.read',
      'return.request.create',
      'return.complete',
      'customer.manage',
      'supplier.manage',
      'report.own_revenue.read'
    ]::text[])
    when 'BUSINESS' then permissions.code = any (array[
      'dashboard.operational.read',
      'catalog.read',
      'pricing.sale.read',
      'inventory.read',
      'sale.draft.manage',
      'sale.complete',
      'sale.discount.apply',
      'sale.own.read',
      'return.request.create',
      'customer.manage',
      'report.own_revenue.read'
    ]::text[])
    else false
  end
from (
  values ('SALES_WAREHOUSE'::text), ('BUSINESS'::text)
) as roles(role_template)
cross join app_private.permission_definitions as permissions;

create function app_private.reject_invalid_permission_override()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_role text;
  permission_is_owner_only boolean;
begin
  select p.role_template
  into target_role
  from api.profiles as p
  where p.id = new.user_id;

  select d.owner_only
  into permission_is_owner_only
  from app_private.permission_definitions as d
  where d.code = new.permission_code;

  if target_role = 'OWNER' then
    raise exception using
      errcode = 'P0001',
      message = 'OWNER_PERMISSION_OVERRIDE_NOT_ALLOWED';
  end if;

  if new.effect = 'GRANT' and permission_is_owner_only then
    raise exception using
      errcode = 'P0001',
      message = 'OWNER_ONLY_PERMISSION';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger user_permission_overrides_guard
before insert or update on app_private.user_permission_overrides
for each row execute function app_private.reject_invalid_permission_override();

create function app_private.has_active_profile(
  p_allow_password_change boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from api.profiles as p
    where p.id = (select auth.uid())
      and p.is_active
      and (p_allow_password_change or not p.must_change_password)
  );
$$;

create function app_private.has_permission(p_permission_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when p.role_template = 'OWNER' then true
      when d.owner_only then false
      when o.effect = 'REVOKE' then false
      when o.effect = 'GRANT' then true
      else coalesce(r.allowed, false)
    end
    from api.profiles as p
    join app_private.permission_definitions as d
      on d.code = p_permission_code
    left join app_private.role_default_permissions as r
      on r.role_template = p.role_template
      and r.permission_code = d.code
    left join app_private.user_permission_overrides as o
      on o.user_id = p.id
      and o.permission_code = d.code
    where p.id = (select auth.uid())
      and p.is_active
      and not p.must_change_password
  ), false);
$$;

create function app_private.get_my_session_context_impl()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_profile api.profiles%rowtype;
  effective_permissions jsonb := '[]'::jsonb;
  correlation_id uuid := gen_random_uuid();
begin
  if actor_id is null then
    return jsonb_build_object(
      'ok', false,
      'data', null,
      'error', jsonb_build_object(
        'code', 'AUTH_REQUIRED',
        'message', 'Vui lòng đăng nhập để tiếp tục.',
        'details', '{}'::jsonb
      ),
      'correlationId', correlation_id
    );
  end if;

  select p.*
  into actor_profile
  from api.profiles as p
  where p.id = actor_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'data', null,
      'error', jsonb_build_object(
        'code', 'AUTH_REQUIRED',
        'message', 'Tài khoản chưa được cấp hồ sơ truy cập.',
        'details', '{}'::jsonb
      ),
      'correlationId', correlation_id
    );
  end if;

  if not actor_profile.is_active then
    return jsonb_build_object(
      'ok', false,
      'data', null,
      'error', jsonb_build_object(
        'code', 'ACCOUNT_INACTIVE',
        'message', 'Tài khoản đã bị khóa.',
        'details', '{}'::jsonb
      ),
      'correlationId', correlation_id
    );
  end if;

  if not actor_profile.must_change_password then
    select coalesce(jsonb_agg(d.code order by d.code), '[]'::jsonb)
    into effective_permissions
    from app_private.permission_definitions as d
    left join app_private.role_default_permissions as r
      on r.role_template = actor_profile.role_template
      and r.permission_code = d.code
    left join app_private.user_permission_overrides as o
      on o.user_id = actor_profile.id
      and o.permission_code = d.code
    where actor_profile.role_template = 'OWNER'
      or (
        not d.owner_only
        and case
          when o.effect = 'REVOKE' then false
          when o.effect = 'GRANT' then true
          else coalesce(r.allowed, false)
        end
      );
  end if;

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'userId', actor_profile.id,
      'email', actor_profile.email,
      'displayName', actor_profile.display_name,
      'roleTemplate', actor_profile.role_template,
      'isActive', actor_profile.is_active,
      'mustChangePassword', actor_profile.must_change_password,
      'permissions', effective_permissions
    ),
    'error', null,
    'correlationId', correlation_id
  );
end;
$$;

create function api.get_my_session_context()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.get_my_session_context_impl();
$$;

revoke all on all tables in schema api from public, anon, authenticated;
revoke all on all sequences in schema api from public, anon, authenticated;
revoke all on all functions in schema api from public, anon, authenticated;
revoke all on all tables in schema app_private from public, anon, authenticated;
revoke all on all sequences in schema app_private from public, anon, authenticated;
revoke all on all functions in schema app_private from public, anon, authenticated;

grant all on all tables in schema api to service_role;
grant all on all sequences in schema api to service_role;
grant all on all functions in schema api to service_role;
grant all on all tables in schema app_private to service_role;
grant all on all sequences in schema app_private to service_role;
grant all on all functions in schema app_private to service_role;

grant execute on function app_private.has_active_profile(boolean) to authenticated;
grant execute on function app_private.has_permission(text) to authenticated;
grant execute on function app_private.get_my_session_context_impl() to authenticated;
grant execute on function api.get_my_session_context() to authenticated;
