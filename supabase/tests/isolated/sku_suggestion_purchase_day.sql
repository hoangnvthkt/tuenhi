-- Tự chứa: dựng stub tối thiểu rồi nạp hàm từ migration
-- 20261120101816_sku_suggestion_and_purchase_day_filter.sql.
-- Chỉ chạy trên PostgreSQL cô lập, database `sku_day_test`. Không chạy trên Cloud.
-- psql -X -v ON_ERROR_STOP=1 -v migration=<đường dẫn migration> -d sku_day_test -f <file này>
\set ON_ERROR_STOP 1
select current_database() = 'sku_day_test' as ok \gset
\if :ok
\else
  \echo 'Sai database, dừng.'
  \quit
\endif

drop schema if exists api cascade;
drop schema if exists app_private cascade;
create schema api;
create schema app_private;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;

create table app_private.test_permissions (code text primary key);
create function app_private.has_permission(p text) returns boolean language sql stable as
  $$ select exists (select 1 from app_private.test_permissions where code = p) $$;
create function app_private.command_error(c text, m text, id uuid) returns jsonb language sql as
  $$ select jsonb_build_object('ok', false, 'error', jsonb_build_object('code', c, 'message', m), 'correlationId', id) $$;
create function app_private.command_success(d jsonb, id uuid) returns jsonb language sql as
  $$ select jsonb_build_object('ok', true, 'data', d, 'correlationId', id) $$;

create table api.products (id uuid primary key default gen_random_uuid(), sku text not null);
create table api.profiles (id uuid primary key, display_name text not null);
create table api.suppliers (id uuid primary key, name text not null);
create table api.purchase_receipts (
  id uuid primary key default gen_random_uuid(), receipt_number text, status text not null,
  supplier_id uuid, received_at timestamptz not null, created_by uuid not null,
  version bigint not null default 1, updated_at timestamptz not null default now()
);
create table api.purchase_receipt_lines (purchase_receipt_id uuid not null, received_qty bigint not null);

\i :migration

set timezone = 'UTC';

-- SKU
insert into app_private.test_permissions values ('catalog.basic.manage');
do $$
declare r jsonb;
begin
  r := api.suggest_next_product_sku();
  assert r #>> '{data,sku}' = 'SP000001', 'rỗng phải ra SP000001: ' || r::text;
  insert into api.products (sku) values ('SP000009'), ('SP528015'), ('sp000777'),
    ('SP5276899'), ('SP0000025100'), ('8938530820145'), ('Ginko 240'), ('SKU12112026');
  r := api.suggest_next_product_sku();
  assert r #>> '{data,sku}' = 'SP528016', 'phải bỏ qua mã khác mẫu: ' || r::text;
  insert into api.products (sku) values ('SP999999');
  r := api.suggest_next_product_sku();
  assert r #>> '{data,sku}' = 'SP1000000', 'tràn 6 số vẫn tăng: ' || r::text;
  delete from app_private.test_permissions;
  r := api.suggest_next_product_sku();
  assert r #>> '{error,code}' = 'PERMISSION_DENIED', 'thiếu quyền phải bị chặn: ' || r::text;
end $$;

-- Lọc ngày phiếu nhập theo giờ Việt Nam
insert into app_private.test_permissions values ('purchase.operational.read');
insert into api.profiles values ('00000000-0000-0000-0000-000000000001', 'Admin');
insert into api.purchase_receipts (receipt_number, status, received_at, created_by) values
  ('PN-A', 'POSTED', '2026-12-11 16:59:59+00', '00000000-0000-0000-0000-000000000001'), -- 11/12 23:59 VN
  ('PN-B', 'POSTED', '2026-12-11 17:00:00+00', '00000000-0000-0000-0000-000000000001'), -- 12/12 00:00 VN
  ('PN-C', 'POSTED', '2026-12-12 16:59:59+00', '00000000-0000-0000-0000-000000000001'), -- 12/12 23:59 VN
  ('PN-D', 'POSTED', '2026-12-12 17:00:00+00', '00000000-0000-0000-0000-000000000001'); -- 13/12 00:00 VN
do $$
declare r jsonb; v text;
begin
  r := app_private.list_purchase_receipts_impl('{"from":"2026-12-12","to":"2026-12-12"}', null, null, 30);
  select string_agg(i ->> 'receiptNumber', ',' order by i ->> 'receiptNumber') into v
    from jsonb_array_elements(r #> '{data,items}') i;
  assert v = 'PN-B,PN-C', 'ngày 12/12 VN phải gồm B,C: ' || coalesce(v, 'null');
  r := app_private.list_purchase_receipts_impl('{"from":"2026-12-01","to":"2026-12-31"}', null, null, 30);
  assert jsonb_array_length(r #> '{data,items}') = 4, 'cả tháng 12: ' || r::text;
  r := app_private.list_purchase_receipts_impl('{"from":"12/12/2026"}', null, null, 30);
  assert r #>> '{error,code}' = 'VALIDATION_FAILED', 'ngày sai định dạng: ' || r::text;
end $$;

\echo 'sku_suggestion_purchase_day: PASS'
