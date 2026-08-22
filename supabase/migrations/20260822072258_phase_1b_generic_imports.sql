create extension if not exists pg_cron with schema pg_catalog;

create table api.import_runs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references api.profiles(id) on delete restrict,
  target_type text not null check (
    target_type in ('CATEGORIES', 'PRODUCTS', 'SUPPLIERS', 'CUSTOMERS')
  ),
  template_version integer,
  adapter_id text,
  file_name text not null check (length(file_name) between 1 and 255),
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  mode text not null check (mode in ('CREATE_ONLY', 'UPDATE_EXISTING')),
  status text not null default 'UPLOADED' check (
    status in ('UPLOADED', 'MAPPED', 'VALIDATED', 'COMMITTED', 'FAILED', 'EXPIRED')
  ),
  total_rows integer not null default 0 check (total_rows between 0 and 5000),
  valid_rows integer not null default 0 check (valid_rows between 0 and 5000),
  invalid_rows integer not null default 0 check (invalid_rows between 0 and 5000),
  next_chunk_index integer not null default 0 check (next_chunk_index >= 0),
  result jsonb,
  created_at timestamptz not null default now(),
  validated_at timestamptz,
  committed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  correlation_id uuid not null default gen_random_uuid(),
  idempotency_key uuid not null,
  check (adapter_id is null),
  check (valid_rows + invalid_rows <= total_rows)
);

create unique index import_runs_actor_target_idempotency_uidx
on api.import_runs(actor_id, target_type, idempotency_key);

create index import_runs_actor_history_idx
on api.import_runs(actor_id, created_at desc, id desc);

create index import_runs_status_expiry_idx
on api.import_runs(status, expires_at);

create table app_private.import_run_mappings (
  import_run_id uuid primary key references api.import_runs(id) on delete cascade,
  mapping jsonb not null check (jsonb_typeof(mapping) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app_private.import_run_rows (
  import_run_id uuid not null references api.import_runs(id) on delete cascade,
  row_number integer not null check (row_number >= 2),
  row_payload jsonb not null check (jsonb_typeof(row_payload) = 'object'),
  normalized_key text,
  validation_status text not null check (validation_status in ('VALID', 'INVALID')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (import_run_id, row_number)
);

create index import_run_rows_run_key_idx
on app_private.import_run_rows(import_run_id, normalized_key, row_number);

create index import_run_rows_expiry_idx
on app_private.import_run_rows(expires_at);

create table app_private.import_run_errors (
  id bigint generated always as identity primary key,
  import_run_id uuid not null references api.import_runs(id) on delete cascade,
  row_number integer not null check (row_number >= 2),
  source_column text,
  target_field text,
  code text not null check (length(code) between 1 and 100),
  message text not null check (length(message) between 1 and 1000),
  raw_value jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index import_run_errors_run_row_idx
on app_private.import_run_errors(import_run_id, row_number, id);

create index import_run_errors_expiry_idx
on app_private.import_run_errors(expires_at);

create table app_private.import_run_chunks (
  import_run_id uuid not null references api.import_runs(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  chunk_sha256 text not null check (chunk_sha256 ~ '^[0-9a-f]{64}$'),
  row_count integer not null check (row_count between 1 and 250),
  is_last_chunk boolean not null,
  created_at timestamptz not null default now(),
  primary key (import_run_id, chunk_index)
);

alter table api.import_runs enable row level security;
alter table api.import_runs force row level security;

create policy import_runs_select_own
on api.import_runs
for select
to authenticated
using (
  actor_id = (select auth.uid())
  and (select app_private.has_active_profile(false))
);

revoke all on table api.import_runs from anon, authenticated;
grant select on table api.import_runs to authenticated;

revoke all on table app_private.import_run_mappings from public, anon, authenticated;
revoke all on table app_private.import_run_rows from public, anon, authenticated;
revoke all on table app_private.import_run_errors from public, anon, authenticated;
revoke all on table app_private.import_run_chunks from public, anon, authenticated;
revoke all on sequence app_private.import_run_errors_id_seq from public, anon, authenticated;

create function app_private.import_target_permission(p_target_type text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case p_target_type
    when 'CATEGORIES' then 'catalog.basic.manage'
    when 'PRODUCTS' then 'catalog.basic.manage'
    when 'SUPPLIERS' then 'supplier.manage'
    when 'CUSTOMERS' then 'customer.manage'
    else null
  end;
$$;

create function app_private.import_allowed_fields(p_target_type text)
returns text[]
language sql
immutable
security invoker
set search_path = ''
as $$
  select case p_target_type
    when 'CATEGORIES' then array['name', 'isActive']::text[]
    when 'PRODUCTS' then array[
      'sku', 'barcode', 'name', 'categoryName', 'unitName', 'description',
      'minStockQty', 'salePrice', 'isActive'
    ]::text[]
    when 'SUPPLIERS' then array[
      'code', 'name', 'phone', 'email', 'address', 'notes', 'isActive'
    ]::text[]
    when 'CUSTOMERS' then array[
      'code', 'customerType', 'name', 'phone', 'email', 'address',
      'companyName', 'taxCode', 'customerGroup', 'notes', 'isActive'
    ]::text[]
    else array[]::text[]
  end;
$$;

create function app_private.import_required_fields(p_target_type text)
returns text[]
language sql
immutable
security invoker
set search_path = ''
as $$
  select case p_target_type
    when 'CATEGORIES' then array['name']::text[]
    when 'PRODUCTS' then array['sku', 'name', 'unitName']::text[]
    when 'SUPPLIERS' then array['name']::text[]
    when 'CUSTOMERS' then array['name']::text[]
    else array[]::text[]
  end;
$$;

create function app_private.add_import_error(
  p_import_run_id uuid,
  p_row_number integer,
  p_target_field text,
  p_code text,
  p_message text,
  p_raw_value jsonb,
  p_expires_at timestamptz
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into app_private.import_run_errors (
    import_run_id, row_number, target_field, code, message, raw_value, expires_at
  ) values (
    p_import_run_id, p_row_number, p_target_field, p_code, p_message,
    p_raw_value, p_expires_at
  );
$$;

create function app_private.is_import_owner(p_actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from api.profiles p
    where p.id = p_actor_id
      and p.role_template = 'OWNER'
      and p.is_active
      and not p.must_change_password
  );
$$;

create function app_private.create_import_run_impl(
  p_target_type text,
  p_template_version integer,
  p_file_name text,
  p_file_sha256 text,
  p_mode text,
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
  v_permission text := app_private.import_target_permission(p_target_type);
  v_existing api.import_runs%rowtype;
  v_run api.import_runs%rowtype;
  v_expected_version integer;
  v_file_name text;
begin
  if v_actor_id is null or v_permission is null
    or not app_private.has_permission(v_permission)
  then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Bạn không có quyền nhập loại dữ liệu này.',
      v_correlation_id
    );
  end if;
  if p_mode not in ('CREATE_ONLY', 'UPDATE_EXISTING')
    or p_idempotency_key is null
  then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Thông tin phiên nhập chưa hợp lệ.', v_correlation_id
    );
  end if;
  if p_mode = 'UPDATE_EXISTING' and not app_private.is_import_owner(v_actor_id) then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Chỉ chủ cửa hàng được cập nhật dữ liệu hiện có bằng Excel.',
      v_correlation_id
    );
  end if;
  v_expected_version := case p_target_type
    when 'CUSTOMERS' then 2 else 1 end;
  if p_template_version is null or p_template_version < 1
    or (p_target_type <> 'CUSTOMERS' and p_template_version <> v_expected_version)
    or (p_target_type = 'CUSTOMERS' and p_template_version not in (1, 2))
  then
    return app_private.command_error(
      'TEMPLATE_VERSION_UNSUPPORTED',
      'Phiên bản mẫu Excel chưa được hỗ trợ.', v_correlation_id
    );
  end if;
  if p_file_sha256 is null or lower(p_file_sha256) !~ '^[0-9a-f]{64}$' then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Mã kiểm tra tệp chưa hợp lệ.', v_correlation_id
    );
  end if;
  v_file_name := left(
    regexp_replace(btrim(coalesce(p_file_name, '')), '[[:cntrl:]/\\]+', '_', 'g'),
    255
  );
  if v_file_name = '' then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Tên tệp không được để trống.', v_correlation_id
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    v_actor_id::text || ':import.create:' || p_target_type || ':' ||
    p_idempotency_key::text, 0
  ));
  select * into v_existing
  from api.import_runs r
  where r.actor_id = v_actor_id
    and r.target_type = p_target_type
    and r.idempotency_key = p_idempotency_key;
  if found then
    return app_private.command_success(
      jsonb_build_object(
        'importRunId', v_existing.id,
        'status', v_existing.status,
        'expiresAt', v_existing.expires_at
      ),
      v_existing.correlation_id
    );
  end if;

  insert into api.import_runs (
    actor_id, target_type, template_version, file_name, file_sha256, mode,
    correlation_id, idempotency_key
  ) values (
    v_actor_id, p_target_type, p_template_version, v_file_name,
    lower(p_file_sha256), p_mode, v_correlation_id, p_idempotency_key
  ) returning * into v_run;

  return app_private.command_success(
    jsonb_build_object(
      'importRunId', v_run.id,
      'status', v_run.status,
      'expiresAt', v_run.expires_at
    ),
    v_correlation_id
  );
end;
$$;

create function api.create_import_run(
  p_target_type text,
  p_template_version integer,
  p_file_name text,
  p_file_sha256 text,
  p_mode text,
  p_idempotency_key uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.create_import_run_impl(
    p_target_type, p_template_version, p_file_name, p_file_sha256,
    p_mode, p_idempotency_key
  );
$$;

create function app_private.save_import_mapping_impl(
  p_import_run_id uuid,
  p_mapping jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_correlation_id uuid := gen_random_uuid();
  v_run api.import_runs%rowtype;
  v_allowed text[];
  v_required text[];
  v_value text;
  v_required_field text;
begin
  select * into v_run
  from api.import_runs r
  where r.id = p_import_run_id and r.actor_id = v_actor_id
  for update;
  if not found or not app_private.has_permission(
    app_private.import_target_permission(v_run.target_type)
  ) then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Bạn không có quyền cập nhật phiên nhập này.',
      v_correlation_id
    );
  end if;
  if v_run.status not in ('UPLOADED', 'MAPPED') or v_run.next_chunk_index <> 0 then
    return app_private.command_error(
      'INVALID_STATE', 'Không thể thay đổi ghép cột sau khi đã gửi dữ liệu.',
      v_correlation_id
    );
  end if;
  if jsonb_typeof(p_mapping) <> 'object' or p_mapping = '{}'::jsonb then
    return app_private.command_error(
      'COLUMN_MAPPING_REQUIRED', 'Vui lòng ghép các cột bắt buộc.',
      v_correlation_id
    );
  end if;
  if (select count(*) from jsonb_object_keys(p_mapping)) > 50 then
    return app_private.command_error(
      'COLUMN_MAPPING_REQUIRED', 'Tệp không được có quá 50 cột dữ liệu.',
      v_correlation_id
    );
  end if;
  v_allowed := app_private.import_allowed_fields(v_run.target_type);
  v_required := app_private.import_required_fields(v_run.target_type);
  for v_value in select value from jsonb_each_text(p_mapping) loop
    if v_value not in ('IGNORED', 'IGNORED_SENSITIVE')
      and not (v_value = any(v_allowed))
    then
      return app_private.command_error(
        'COLUMN_MAPPING_REQUIRED', 'Ghép cột chứa trường không được hỗ trợ.',
        v_correlation_id
      );
    end if;
  end loop;
  if exists (
    select 1 from (
      select value, count(*)
      from jsonb_each_text(p_mapping)
      where value not in ('IGNORED', 'IGNORED_SENSITIVE')
      group by value having count(*) > 1
    ) duplicates
  ) then
    return app_private.command_error(
      'COLUMN_MAPPING_DUPLICATE', 'Mỗi trường chỉ được ghép với một cột.',
      v_correlation_id
    );
  end if;
  foreach v_required_field in array v_required loop
    if not exists (
      select 1 from jsonb_each_text(p_mapping) where value = v_required_field
    ) then
      return app_private.command_error(
        'COLUMN_MAPPING_REQUIRED', 'Vui lòng ghép đủ các cột bắt buộc.',
        v_correlation_id
      );
    end if;
  end loop;

  insert into app_private.import_run_mappings(import_run_id, mapping)
  values (v_run.id, p_mapping)
  on conflict (import_run_id) do update
  set mapping = excluded.mapping, updated_at = now();
  update api.import_runs set status = 'MAPPED' where id = v_run.id;
  return app_private.command_success(
    jsonb_build_object('importRunId', v_run.id, 'status', 'MAPPED'),
    v_correlation_id
  );
end;
$$;

create function api.save_import_mapping(
  p_import_run_id uuid,
  p_mapping jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.save_import_mapping_impl(p_import_run_id, p_mapping);
$$;

create function app_private.validate_import_payload(
  p_run api.import_runs,
  p_row_number integer,
  p_payload jsonb
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_allowed text[] := app_private.import_allowed_fields(p_run.target_type);
  v_required text[] := app_private.import_required_fields(p_run.target_type);
  v_field text;
  v_value text;
  v_key text;
  v_phone text;
  v_email text;
  v_expires_at timestamptz := p_run.expires_at;
begin
  if jsonb_typeof(p_payload) <> 'object' or p_payload - v_allowed <> '{}'::jsonb then
    perform app_private.add_import_error(
      p_run.id, p_row_number, null, 'VALIDATION_FAILED',
      'Dòng dữ liệu chứa trường không được hỗ trợ hoặc nhạy cảm.',
      null, v_expires_at
    );
    return null;
  end if;

  foreach v_field in array v_required loop
    if nullif(btrim(coalesce(p_payload ->> v_field, '')), '') is null then
      perform app_private.add_import_error(
        p_run.id, p_row_number, v_field, 'VALUE_REQUIRED',
        'Giá trị bắt buộc không được để trống.', p_payload -> v_field,
        v_expires_at
      );
    end if;
  end loop;

  if p_payload ? 'isActive'
    and coalesce(p_payload ->> 'isActive', '') not in ('true', 'false')
  then
    perform app_private.add_import_error(
      p_run.id, p_row_number, 'isActive', 'VALIDATION_FAILED',
      'Trạng thái chỉ nhận Đang hoạt động hoặc Ngừng hoạt động.',
      p_payload -> 'isActive', v_expires_at
    );
  end if;

  v_phone := nullif(btrim(coalesce(p_payload ->> 'phone', '')), '');
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    perform app_private.add_import_error(
      p_run.id, p_row_number, 'phone', 'PHONE_FORMAT_INVALID',
      'Số điện thoại chưa đúng định dạng quốc tế.', p_payload -> 'phone',
      v_expires_at
    );
  end if;
  v_email := nullif(lower(btrim(coalesce(p_payload ->> 'email', ''))), '');
  if v_email is not null and (
    length(v_email) > 254
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    perform app_private.add_import_error(
      p_run.id, p_row_number, 'email', 'EMAIL_FORMAT_INVALID',
      'Email chưa đúng định dạng.', p_payload -> 'email', v_expires_at
    );
  end if;

  if length(coalesce(p_payload ->> 'code', '')) > 64 then
    perform app_private.add_import_error(
      p_run.id, p_row_number, 'code', 'VALUE_TOO_LONG',
      'Mã không được vượt quá 64 ký tự.', p_payload -> 'code', v_expires_at
    );
  end if;
  if length(coalesce(p_payload ->> 'name', '')) > 200 then
    perform app_private.add_import_error(
      p_run.id, p_row_number, 'name', 'VALUE_TOO_LONG',
      'Tên không được vượt quá 200 ký tự.', p_payload -> 'name', v_expires_at
    );
  end if;
  if length(coalesce(p_payload ->> 'address', '')) > 500 then
    perform app_private.add_import_error(
      p_run.id, p_row_number, 'address', 'VALUE_TOO_LONG',
      'Địa chỉ không được vượt quá 500 ký tự.', p_payload -> 'address',
      v_expires_at
    );
  end if;
  if length(coalesce(p_payload ->> 'notes', '')) > 1000
    or length(coalesce(p_payload ->> 'description', '')) > 2000
  then
    perform app_private.add_import_error(
      p_run.id, p_row_number,
      case when length(coalesce(p_payload ->> 'notes', '')) > 1000
        then 'notes' else 'description' end,
      'VALUE_TOO_LONG', 'Nội dung mô tả hoặc ghi chú vượt quá giới hạn.',
      null, v_expires_at
    );
  end if;

  if p_run.target_type = 'CATEGORIES' then
    v_key := app_private.normalize_catalog_key(coalesce(p_payload ->> 'name', ''));
    if length(coalesce(p_payload ->> 'name', '')) > 120 then
      perform app_private.add_import_error(
        p_run.id, p_row_number, 'name', 'VALUE_TOO_LONG',
        'Tên nhóm hàng không được vượt quá 120 ký tự.', p_payload -> 'name',
        v_expires_at
      );
    end if;
  elsif p_run.target_type = 'PRODUCTS' then
    v_key := app_private.normalize_catalog_key(coalesce(p_payload ->> 'sku', ''));
    if length(coalesce(p_payload ->> 'sku', '')) > 64
      or length(coalesce(p_payload ->> 'barcode', '')) > 64
      or length(coalesce(p_payload ->> 'unitName', '')) > 50
    then
      perform app_private.add_import_error(
        p_run.id, p_row_number, null, 'VALUE_TOO_LONG',
        'SKU, mã vạch hoặc đơn vị tính vượt quá giới hạn.', null, v_expires_at
      );
    end if;
    v_value := coalesce(nullif(p_payload ->> 'minStockQty', ''), '0');
    if v_value !~ '^(0|[1-9][0-9]{0,14})(\.[0-9]{1,3})?$' then
      perform app_private.add_import_error(
        p_run.id, p_row_number, 'minStockQty', 'NUMBER_FORMAT_INVALID',
        'Số lượng chỉ nhận chữ số và tối đa 3 chữ số thập phân.',
        p_payload -> 'minStockQty', v_expires_at
      );
    end if;
    v_value := nullif(p_payload ->> 'salePrice', '');
    if v_value is not null then
      if not app_private.has_permission('pricing.sale.manage') then
        perform app_private.add_import_error(
          p_run.id, p_row_number, 'salePrice', 'PERMISSION_DENIED',
          'Bạn không có quyền nhập giá bán hiện hành.', null, v_expires_at
        );
      elsif v_value !~ '^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$' then
        perform app_private.add_import_error(
          p_run.id, p_row_number, 'salePrice', 'NUMBER_FORMAT_INVALID',
          'Tiền chỉ nhận chữ số và tối đa 2 chữ số thập phân.',
          p_payload -> 'salePrice', v_expires_at
        );
      end if;
    end if;
    v_value := nullif(btrim(coalesce(p_payload ->> 'categoryName', '')), '');
    if v_value is not null and not exists (
      select 1 from api.categories c
      where c.name_normalized = app_private.normalize_catalog_key(v_value)
        and c.is_active
    ) then
      perform app_private.add_import_error(
        p_run.id, p_row_number, 'categoryName', 'REFERENCE_NOT_FOUND',
        'Không tìm thấy nhóm hàng đang hoạt động.',
        p_payload -> 'categoryName', v_expires_at
      );
    end if;
  elsif p_run.target_type = 'SUPPLIERS' then
    v_key := case
      when nullif(btrim(coalesce(p_payload ->> 'code', '')), '') is not null
        then app_private.normalize_catalog_key(p_payload ->> 'code')
      else 'row:' || p_row_number::text
    end;
    if p_run.mode = 'UPDATE_EXISTING'
      and nullif(btrim(coalesce(p_payload ->> 'code', '')), '') is null
    then
      perform app_private.add_import_error(
        p_run.id, p_row_number, 'code', 'VALUE_REQUIRED',
        'Cập nhật nhà cung cấp cần có mã.', p_payload -> 'code', v_expires_at
      );
    end if;
  elsif p_run.target_type = 'CUSTOMERS' then
    v_key := case
      when nullif(btrim(coalesce(p_payload ->> 'code', '')), '') is not null
        then app_private.normalize_catalog_key(p_payload ->> 'code')
      else 'row:' || p_row_number::text
    end;
    v_value := coalesce(nullif(p_payload ->> 'customerType', ''), 'INDIVIDUAL');
    if v_value not in ('INDIVIDUAL', 'BUSINESS') then
      perform app_private.add_import_error(
        p_run.id, p_row_number, 'customerType', 'VALIDATION_FAILED',
        'Loại khách hàng chưa hợp lệ.', p_payload -> 'customerType', v_expires_at
      );
    elsif v_value = 'BUSINESS'
      and nullif(btrim(coalesce(p_payload ->> 'companyName', '')), '') is null
    then
      perform app_private.add_import_error(
        p_run.id, p_row_number, 'companyName', 'VALUE_REQUIRED',
        'Khách doanh nghiệp cần có tên công ty.', p_payload -> 'companyName',
        v_expires_at
      );
    end if;
    if length(coalesce(p_payload ->> 'companyName', '')) > 200
      or length(coalesce(p_payload ->> 'taxCode', '')) > 32
      or length(coalesce(p_payload ->> 'customerGroup', '')) > 120
    then
      perform app_private.add_import_error(
        p_run.id, p_row_number, null, 'VALUE_TOO_LONG',
        'Thông tin công ty, mã số thuế hoặc nhóm khách vượt quá giới hạn.',
        null, v_expires_at
      );
    end if;
    if p_run.mode = 'UPDATE_EXISTING'
      and nullif(btrim(coalesce(p_payload ->> 'code', '')), '') is null
    then
      perform app_private.add_import_error(
        p_run.id, p_row_number, 'code', 'VALUE_REQUIRED',
        'Cập nhật khách hàng cần có mã.', p_payload -> 'code', v_expires_at
      );
    end if;
  end if;
  return nullif(v_key, '');
end;
$$;

create function app_private.finalize_import_validation(p_import_run_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run api.import_runs%rowtype;
begin
  select * into strict v_run from api.import_runs where id = p_import_run_id;

  insert into app_private.import_run_errors (
    import_run_id, row_number, target_field, code, message, raw_value, expires_at
  )
  select
    r.import_run_id, r.row_number, null, 'DUPLICATE_IN_FILE',
    'Khóa dữ liệu bị trùng trong tệp.', to_jsonb(r.normalized_key), v_run.expires_at
  from app_private.import_run_rows r
  where r.import_run_id = v_run.id
    and r.normalized_key is not null
    and r.normalized_key not like 'row:%'
    and exists (
      select 1 from app_private.import_run_rows other
      where other.import_run_id = r.import_run_id
        and other.normalized_key = r.normalized_key
        and other.row_number <> r.row_number
    );

  if v_run.mode = 'CREATE_ONLY' then
    insert into app_private.import_run_errors (
      import_run_id, row_number, target_field, code, message, raw_value, expires_at
    )
    select r.import_run_id, r.row_number, null, 'DUPLICATE_IN_DATABASE',
      'Dữ liệu đã tồn tại trong hệ thống.', null, v_run.expires_at
    from app_private.import_run_rows r
    where r.import_run_id = v_run.id and (
      (v_run.target_type = 'CATEGORIES' and exists (
        select 1 from api.categories c where c.name_normalized = r.normalized_key
      ))
      or (v_run.target_type = 'PRODUCTS' and exists (
        select 1 from api.products p where p.sku_normalized = r.normalized_key
      ))
      or (v_run.target_type = 'SUPPLIERS'
        and r.normalized_key not like 'row:%' and exists (
          select 1 from api.suppliers s where s.code_normalized = r.normalized_key
        ))
      or (v_run.target_type = 'CUSTOMERS'
        and r.normalized_key not like 'row:%' and exists (
          select 1 from api.customers c where c.code_normalized = r.normalized_key
        ))
    );
  else
    insert into app_private.import_run_errors (
      import_run_id, row_number, target_field, code, message, raw_value, expires_at
    )
    select r.import_run_id, r.row_number, null, 'REFERENCE_NOT_FOUND',
      'Không tìm thấy dữ liệu cần cập nhật.', null, v_run.expires_at
    from app_private.import_run_rows r
    where r.import_run_id = v_run.id and not (
      (v_run.target_type = 'CATEGORIES' and exists (
        select 1 from api.categories c where c.name_normalized = r.normalized_key
      ))
      or (v_run.target_type = 'PRODUCTS' and exists (
        select 1 from api.products p where p.sku_normalized = r.normalized_key
      ))
      or (v_run.target_type = 'SUPPLIERS' and exists (
        select 1 from api.suppliers s where s.code_normalized = r.normalized_key
      ))
      or (v_run.target_type = 'CUSTOMERS' and exists (
        select 1 from api.customers c where c.code_normalized = r.normalized_key
      ))
    );
  end if;

  update app_private.import_run_rows r
  set validation_status = case when exists (
    select 1 from app_private.import_run_errors e
    where e.import_run_id = r.import_run_id and e.row_number = r.row_number
  ) then 'INVALID' else 'VALID' end
  where r.import_run_id = v_run.id;

  update api.import_runs run
  set total_rows = counts.total_rows,
      valid_rows = counts.valid_rows,
      invalid_rows = counts.invalid_rows,
      status = 'VALIDATED',
      validated_at = now()
  from (
    select count(*)::integer as total_rows,
      count(*) filter (where validation_status = 'VALID')::integer as valid_rows,
      count(*) filter (where validation_status = 'INVALID')::integer as invalid_rows
    from app_private.import_run_rows
    where import_run_id = v_run.id
  ) counts
  where run.id = v_run.id;
end;
$$;

create function app_private.validate_import_rows_impl(
  p_import_run_id uuid,
  p_chunk_index integer,
  p_rows jsonb,
  p_is_last_chunk boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_correlation_id uuid := gen_random_uuid();
  v_run api.import_runs%rowtype;
  v_existing app_private.import_run_chunks%rowtype;
  v_row jsonb;
  v_row_number integer;
  v_payload jsonb;
  v_key text;
  v_status text;
  v_row_count integer;
  v_chunk_sha text;
begin
  select * into v_run
  from api.import_runs r
  where r.id = p_import_run_id and r.actor_id = v_actor_id
  for update;
  if not found or not app_private.has_permission(
    app_private.import_target_permission(v_run.target_type)
  ) then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Bạn không có quyền kiểm tra phiên nhập này.',
      v_correlation_id
    );
  end if;
  if p_chunk_index is null or p_chunk_index < 0 or p_is_last_chunk is null
    or jsonb_typeof(p_rows) <> 'array'
  then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Gói dữ liệu nhập chưa hợp lệ.', v_correlation_id
    );
  end if;
  v_row_count := jsonb_array_length(p_rows);
  if v_row_count < 1 or v_row_count > 250 then
    return app_private.command_error(
      'ROW_LIMIT_EXCEEDED', 'Mỗi gói tối đa 250 dòng và mỗi tệp tối đa 5.000 dòng.',
      v_correlation_id
    );
  end if;
  v_chunk_sha := md5(p_rows::text) || md5('tuenhi:' || p_rows::text);
  select * into v_existing
  from app_private.import_run_chunks c
  where c.import_run_id = v_run.id and c.chunk_index = p_chunk_index;
  if found then
    if v_existing.chunk_sha256 <> v_chunk_sha
      or v_existing.row_count <> v_row_count
      or v_existing.is_last_chunk <> p_is_last_chunk
    then
      return app_private.command_error(
        'DUPLICATE_REQUEST', 'Gói dữ liệu đã được gửi với nội dung khác.',
        v_correlation_id
      );
    end if;
    return app_private.command_success(
      jsonb_build_object(
        'importRunId', v_run.id, 'status', v_run.status,
        'totalRows', v_run.total_rows, 'validRows', v_run.valid_rows,
        'invalidRows', v_run.invalid_rows,
        'nextChunkIndex', v_run.next_chunk_index
      ),
      v_run.correlation_id
    );
  end if;
  if v_run.total_rows + v_row_count > 5000 then
    return app_private.command_error(
      'ROW_LIMIT_EXCEEDED', 'Mỗi tệp chỉ được có tối đa 5.000 dòng.',
      v_correlation_id
    );
  end if;
  if v_run.status <> 'MAPPED' or v_run.next_chunk_index <> p_chunk_index then
    return app_private.command_error(
      'INVALID_STATE', 'Gói dữ liệu không đúng thứ tự hoặc phiên nhập đã khóa.',
      v_correlation_id
    );
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) item
    group by item ->> 'rowNumber'
    having count(*) > 1
  ) then
    return app_private.command_error(
      'DUPLICATE_REQUEST', 'Số dòng Excel bị trùng trong cùng gói dữ liệu.',
      v_correlation_id
    );
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_row) <> 'object'
      or v_row - array['rowNumber', 'values'] <> '{}'::jsonb
      or jsonb_typeof(v_row -> 'rowNumber') <> 'number'
      or jsonb_typeof(v_row -> 'values') <> 'object'
      or coalesce(v_row ->> 'rowNumber', '') !~ '^[0-9]+$'
    then
      return app_private.command_error(
        'VALIDATION_FAILED', 'Cấu trúc dòng dữ liệu chưa hợp lệ.',
        v_correlation_id
      );
    end if;
    begin
      v_row_number := (v_row ->> 'rowNumber')::integer;
    exception when others then
      return app_private.command_error(
        'VALIDATION_FAILED', 'Số dòng Excel chưa hợp lệ.', v_correlation_id
      );
    end;
    if v_row_number < 2 or exists (
      select 1 from app_private.import_run_rows r
      where r.import_run_id = v_run.id and r.row_number = v_row_number
    ) then
      return app_private.command_error(
        'DUPLICATE_REQUEST', 'Số dòng Excel bị trùng hoặc chưa hợp lệ.',
        v_correlation_id
      );
    end if;
  end loop;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_row_number := (v_row ->> 'rowNumber')::integer;
    v_payload := v_row -> 'values';
    v_key := app_private.validate_import_payload(v_run, v_row_number, v_payload);
    v_status := case when exists (
      select 1 from app_private.import_run_errors e
      where e.import_run_id = v_run.id and e.row_number = v_row_number
    ) then 'INVALID' else 'VALID' end;
    insert into app_private.import_run_rows (
      import_run_id, row_number, row_payload, normalized_key,
      validation_status, expires_at
    ) values (
      v_run.id, v_row_number, v_payload, v_key, v_status, v_run.expires_at
    );
  end loop;

  insert into app_private.import_run_chunks (
    import_run_id, chunk_index, chunk_sha256, row_count, is_last_chunk
  ) values (
    v_run.id, p_chunk_index, v_chunk_sha, v_row_count, p_is_last_chunk
  );
  update api.import_runs
  set next_chunk_index = next_chunk_index + 1,
      total_rows = total_rows + v_row_count
  where id = v_run.id;

  if p_is_last_chunk then
    perform app_private.finalize_import_validation(v_run.id);
  else
    update api.import_runs run
    set valid_rows = counts.valid_rows,
        invalid_rows = counts.invalid_rows
    from (
      select
        count(*) filter (where validation_status = 'VALID')::integer as valid_rows,
        count(*) filter (where validation_status = 'INVALID')::integer as invalid_rows
      from app_private.import_run_rows where import_run_id = v_run.id
    ) counts
    where run.id = v_run.id;
  end if;

  select * into strict v_run from api.import_runs where id = v_run.id;
  return app_private.command_success(
    jsonb_build_object(
      'importRunId', v_run.id, 'status', v_run.status,
      'totalRows', v_run.total_rows, 'validRows', v_run.valid_rows,
      'invalidRows', v_run.invalid_rows,
      'nextChunkIndex', v_run.next_chunk_index
    ),
    v_run.correlation_id
  );
end;
$$;

create function api.validate_import_rows(
  p_import_run_id uuid,
  p_chunk_index integer,
  p_rows jsonb,
  p_is_last_chunk boolean
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.validate_import_rows_impl(
    p_import_run_id, p_chunk_index, p_rows, p_is_last_chunk
  );
$$;

create function app_private.get_import_validation_result_impl(
  p_import_run_id uuid,
  p_cursor_row_number integer,
  p_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_correlation_id uuid := gen_random_uuid();
  v_run api.import_runs%rowtype;
  v_items jsonb;
  v_next integer;
begin
  select * into v_run from api.import_runs r
  where r.id = p_import_run_id and r.actor_id = v_actor_id;
  if not found or not app_private.has_active_profile(false) then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Bạn không có quyền xem kết quả nhập này.',
      v_correlation_id
    );
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100
    or coalesce(p_cursor_row_number, 0) < 0
  then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Bộ lọc lỗi nhập chưa hợp lệ.', v_correlation_id
    );
  end if;

  select coalesce(jsonb_agg(item order by row_number), '[]'::jsonb),
    max(row_number) filter (where ordinal = p_limit + 1)
  into v_items, v_next
  from (
    select r.row_number,
      row_number() over (order by r.row_number) as ordinal,
      jsonb_build_object(
        'rowNumber', r.row_number,
        'status', r.validation_status,
        'values', r.row_payload,
        'errors', coalesce((
          select jsonb_agg(jsonb_build_object(
            'sourceColumn', e.source_column,
            'targetField', e.target_field,
            'code', e.code,
            'message', e.message,
            'rawValue', e.raw_value
          ) order by e.id)
          from app_private.import_run_errors e
          where e.import_run_id = r.import_run_id
            and e.row_number = r.row_number
        ), '[]'::jsonb)
      ) as item
    from app_private.import_run_rows r
    where r.import_run_id = v_run.id
      and r.row_number > coalesce(p_cursor_row_number, 0)
    order by r.row_number
    limit p_limit + 1
  ) page
  where ordinal <= p_limit;

  if exists (
    select 1 from app_private.import_run_rows r
    where r.import_run_id = v_run.id
      and r.row_number > coalesce(p_cursor_row_number, 0)
    offset p_limit limit 1
  ) then
    select max(r.row_number) into v_next
    from (
      select row_number from app_private.import_run_rows
      where import_run_id = v_run.id
        and row_number > coalesce(p_cursor_row_number, 0)
      order by row_number limit p_limit
    ) r;
  else
    v_next := null;
  end if;

  return app_private.command_success(
    jsonb_build_object(
      'summary', jsonb_build_object(
        'importRunId', v_run.id, 'targetType', v_run.target_type,
        'status', v_run.status, 'totalRows', v_run.total_rows,
        'validRows', v_run.valid_rows, 'invalidRows', v_run.invalid_rows
      ),
      'items', v_items,
      'nextCursorRowNumber', v_next
    ),
    v_run.correlation_id
  );
end;
$$;

create function api.get_import_validation_result(
  p_import_run_id uuid,
  p_cursor_row_number integer default null,
  p_limit integer default 50
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.get_import_validation_result_impl(
    p_import_run_id, p_cursor_row_number, p_limit
  );
$$;

create function app_private.get_import_result_impl(p_import_run_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_correlation_id uuid := gen_random_uuid();
  v_run api.import_runs%rowtype;
begin
  select * into v_run from api.import_runs r
  where r.id = p_import_run_id and r.actor_id = v_actor_id;
  if not found or not app_private.has_active_profile(false) then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Bạn không có quyền xem phiên nhập này.',
      v_correlation_id
    );
  end if;
  return app_private.command_success(
    jsonb_build_object(
      'importRunId', v_run.id, 'targetType', v_run.target_type,
      'templateVersion', v_run.template_version, 'fileName', v_run.file_name,
      'fileSha256', v_run.file_sha256, 'mode', v_run.mode,
      'status', v_run.status, 'totalRows', v_run.total_rows,
      'validRows', v_run.valid_rows, 'invalidRows', v_run.invalid_rows,
      'result', v_run.result, 'createdAt', v_run.created_at,
      'validatedAt', v_run.validated_at, 'committedAt', v_run.committed_at,
      'expiresAt', v_run.expires_at
    ),
    v_run.correlation_id
  );
end;
$$;

create function api.get_import_result(p_import_run_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select app_private.get_import_result_impl(p_import_run_id); $$;

create function app_private.list_import_runs_impl(
  p_target_type text,
  p_status text,
  p_cursor_created_at timestamptz,
  p_cursor_id uuid,
  p_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_correlation_id uuid := gen_random_uuid();
  v_items jsonb;
  v_next_created_at timestamptz;
  v_next_id uuid;
begin
  if not app_private.has_active_profile(false) then
    return app_private.command_error(
      'AUTH_REQUIRED', 'Vui lòng đăng nhập để xem lịch sử nhập.', v_correlation_id
    );
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100
    or ((p_cursor_created_at is null) <> (p_cursor_id is null))
  then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Bộ lọc lịch sử nhập chưa hợp lệ.', v_correlation_id
    );
  end if;
  with page as (
    select r.* from api.import_runs r
    where r.actor_id = v_actor_id
      and (p_target_type is null or r.target_type = p_target_type)
      and (p_status is null or r.status = p_status)
      and (p_cursor_created_at is null
        or (r.created_at, r.id) < (p_cursor_created_at, p_cursor_id))
    order by r.created_at desc, r.id desc
    limit p_limit + 1
  ), numbered as (
    select page.*, row_number() over (order by created_at desc, id desc) ordinal
    from page
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'importRunId', id, 'targetType', target_type, 'fileName', file_name,
      'mode', mode, 'status', status, 'totalRows', total_rows,
      'validRows', valid_rows, 'invalidRows', invalid_rows,
      'createdAt', created_at, 'committedAt', committed_at
    ) order by created_at desc, id desc) filter (where ordinal <= p_limit), '[]'::jsonb),
    max(created_at) filter (where ordinal = p_limit),
    max(id) filter (where ordinal = p_limit)
  into v_items, v_next_created_at, v_next_id
  from numbered;
  if jsonb_array_length(v_items) < p_limit or not exists (
    select 1 from api.import_runs r where r.actor_id = v_actor_id
      and (v_next_created_at is not null)
      and (r.created_at, r.id) < (v_next_created_at, v_next_id)
      and (p_target_type is null or r.target_type = p_target_type)
      and (p_status is null or r.status = p_status)
  ) then
    v_next_created_at := null;
    v_next_id := null;
  end if;
  return app_private.command_success(
    jsonb_build_object(
      'items', v_items,
      'nextCursor', case when v_next_id is null then null else jsonb_build_object(
        'createdAt', v_next_created_at, 'id', v_next_id
      ) end
    ),
    v_correlation_id
  );
end;
$$;

create function api.list_import_runs(
  p_target_type text default null,
  p_status text default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 30
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.list_import_runs_impl(
    p_target_type, p_status, p_cursor_created_at, p_cursor_id, p_limit
  );
$$;

create function app_private.commit_import_impl(
  p_import_run_id uuid,
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
  v_run api.import_runs%rowtype;
  v_cached jsonb;
  v_result jsonb;
  v_key text;
  v_created integer := 0;
  v_updated integer := 0;
begin
  if p_idempotency_key is null then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Thiếu mã chống gửi trùng thao tác.', v_correlation_id
    );
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_actor_id::text || ':import.commit:' || p_import_run_id::text || ':' ||
    p_idempotency_key::text, 0
  ));
  v_cached := app_private.cached_command_response(
    v_actor_id, 'import.commit', p_idempotency_key
  );
  if v_cached is not null then return v_cached; end if;

  select * into v_run from api.import_runs r
  where r.id = p_import_run_id and r.actor_id = v_actor_id
  for update;
  if not found or not app_private.has_permission(
    app_private.import_target_permission(v_run.target_type)
  ) then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Bạn không có quyền xác nhận phiên nhập này.',
      v_correlation_id
    );
  end if;
  if v_run.mode = 'UPDATE_EXISTING' and not app_private.is_import_owner(v_actor_id) then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Chỉ chủ cửa hàng được cập nhật dữ liệu hiện có bằng Excel.',
      v_correlation_id
    );
  end if;
  if v_run.status = 'COMMITTED' then
    return app_private.command_error(
      'IMPORT_ALREADY_COMMITTED', 'Phiên nhập đã được xác nhận trước đó.',
      v_run.correlation_id
    );
  end if;
  if v_run.status <> 'VALIDATED' or v_run.total_rows < 1 then
    return app_private.command_error(
      'INVALID_STATE', 'Phiên nhập chưa sẵn sàng để xác nhận.', v_correlation_id
    );
  end if;
  if v_run.invalid_rows > 0 then
    return app_private.command_error_with_details(
      'IMPORT_VALIDATION_FAILED',
      'Tệp còn dữ liệu chưa hợp lệ. Vui lòng kiểm tra danh sách lỗi.',
      jsonb_build_object('invalidRows', v_run.invalid_rows),
      v_correlation_id
    );
  end if;
  if v_run.target_type = 'PRODUCTS'
    and exists (
      select 1 from app_private.import_run_rows r
      where r.import_run_id = v_run.id
        and nullif(r.row_payload ->> 'salePrice', '') is not null
    )
    and not app_private.has_permission('pricing.sale.manage')
  then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Bạn không có quyền nhập giá bán hiện hành.',
      v_correlation_id
    );
  end if;

  for v_key in
    select distinct r.normalized_key
    from app_private.import_run_rows r
    where r.import_run_id = v_run.id and r.normalized_key is not null
    order by r.normalized_key
  loop
    perform pg_advisory_xact_lock(hashtextextended(
      'import-business-key:' || v_run.target_type || ':' || v_key, 0
    ));
  end loop;

  delete from app_private.import_run_errors e
  where e.import_run_id = v_run.id
    and e.code in ('DUPLICATE_IN_DATABASE', 'REFERENCE_NOT_FOUND');

  if v_run.mode = 'CREATE_ONLY' then
    insert into app_private.import_run_errors (
      import_run_id, row_number, code, message, expires_at
    )
    select r.import_run_id, r.row_number, 'DUPLICATE_IN_DATABASE',
      'Dữ liệu đã tồn tại trong hệ thống.', v_run.expires_at
    from app_private.import_run_rows r
    where r.import_run_id = v_run.id and (
      (v_run.target_type = 'CATEGORIES' and exists (
        select 1 from api.categories c where c.name_normalized = r.normalized_key
      ))
      or (v_run.target_type = 'PRODUCTS' and exists (
        select 1 from api.products p where p.sku_normalized = r.normalized_key
      ))
      or (v_run.target_type = 'SUPPLIERS'
        and r.normalized_key not like 'row:%' and exists (
          select 1 from api.suppliers s where s.code_normalized = r.normalized_key
        ))
      or (v_run.target_type = 'CUSTOMERS'
        and r.normalized_key not like 'row:%' and exists (
          select 1 from api.customers c where c.code_normalized = r.normalized_key
        ))
    );
  else
    insert into app_private.import_run_errors (
      import_run_id, row_number, code, message, expires_at
    )
    select r.import_run_id, r.row_number, 'REFERENCE_NOT_FOUND',
      'Không tìm thấy dữ liệu cần cập nhật.', v_run.expires_at
    from app_private.import_run_rows r
    where r.import_run_id = v_run.id and not (
      (v_run.target_type = 'CATEGORIES' and exists (
        select 1 from api.categories c where c.name_normalized = r.normalized_key
      ))
      or (v_run.target_type = 'PRODUCTS' and exists (
        select 1 from api.products p where p.sku_normalized = r.normalized_key
      ))
      or (v_run.target_type = 'SUPPLIERS' and exists (
        select 1 from api.suppliers s where s.code_normalized = r.normalized_key
      ))
      or (v_run.target_type = 'CUSTOMERS' and exists (
        select 1 from api.customers c where c.code_normalized = r.normalized_key
      ))
    );
  end if;

  if v_run.target_type = 'PRODUCTS' then
    insert into app_private.import_run_errors (
      import_run_id, row_number, target_field, code, message, raw_value,
      expires_at
    )
    select r.import_run_id, r.row_number, 'categoryName', 'REFERENCE_NOT_FOUND',
      'Không tìm thấy nhóm hàng đang hoạt động.',
      r.row_payload -> 'categoryName', v_run.expires_at
    from app_private.import_run_rows r
    where r.import_run_id = v_run.id
      and nullif(btrim(coalesce(r.row_payload ->> 'categoryName', '')), '') is not null
      and not exists (
        select 1 from api.categories c
        where c.name_normalized = app_private.normalize_catalog_key(
          r.row_payload ->> 'categoryName'
        ) and c.is_active
      );
  end if;

  if exists (
    select 1 from app_private.import_run_errors e where e.import_run_id = v_run.id
  ) then
    update app_private.import_run_rows r
    set validation_status = case when exists (
      select 1 from app_private.import_run_errors e
      where e.import_run_id = r.import_run_id and e.row_number = r.row_number
    ) then 'INVALID' else 'VALID' end
    where r.import_run_id = v_run.id;
    update api.import_runs run
    set valid_rows = counts.valid_rows, invalid_rows = counts.invalid_rows
    from (
      select
        count(*) filter (where validation_status = 'VALID')::integer valid_rows,
        count(*) filter (where validation_status = 'INVALID')::integer invalid_rows
      from app_private.import_run_rows where import_run_id = v_run.id
    ) counts where run.id = v_run.id;
    select * into strict v_run from api.import_runs where id = v_run.id;
    return app_private.command_error_with_details(
      'IMPORT_VALIDATION_FAILED',
      'Dữ liệu đã thay đổi từ lúc kiểm tra. Vui lòng xem lại danh sách lỗi.',
      jsonb_build_object('invalidRows', v_run.invalid_rows), v_correlation_id
    );
  end if;

  if v_run.target_type = 'CATEGORIES' and v_run.mode = 'CREATE_ONLY' then
    insert into api.categories(name, name_normalized, is_active, created_by, updated_by)
    select normalize(btrim(r.row_payload ->> 'name'), NFC), r.normalized_key,
      coalesce((r.row_payload ->> 'isActive')::boolean, true),
      v_actor_id, v_actor_id
    from app_private.import_run_rows r
    where r.import_run_id = v_run.id order by r.normalized_key;
    get diagnostics v_created = row_count;
  elsif v_run.target_type = 'CATEGORIES' then
    update api.categories c
    set is_active = coalesce((r.row_payload ->> 'isActive')::boolean, true),
        updated_by = v_actor_id, updated_at = now()
    from app_private.import_run_rows r
    where r.import_run_id = v_run.id and c.name_normalized = r.normalized_key;
    get diagnostics v_updated = row_count;
  elsif v_run.target_type = 'PRODUCTS' and v_run.mode = 'CREATE_ONLY' then
    insert into api.products (
      sku, sku_normalized, barcode, name, name_normalized, category_id,
      unit_name, description, min_stock_qty, is_active, created_by, updated_by
    )
    select normalize(btrim(r.row_payload ->> 'sku'), NFC), r.normalized_key,
      app_private.empty_to_null(r.row_payload ->> 'barcode'),
      normalize(btrim(r.row_payload ->> 'name'), NFC),
      app_private.normalize_catalog_key(r.row_payload ->> 'name'),
      (select c.id from api.categories c where c.name_normalized =
        app_private.normalize_catalog_key(r.row_payload ->> 'categoryName')),
      normalize(btrim(r.row_payload ->> 'unitName'), NFC),
      app_private.empty_to_null(r.row_payload ->> 'description'),
      coalesce(nullif(r.row_payload ->> 'minStockQty', ''), '0')::numeric,
      coalesce((r.row_payload ->> 'isActive')::boolean, true),
      v_actor_id, v_actor_id
    from app_private.import_run_rows r
    where r.import_run_id = v_run.id order by r.normalized_key;
    get diagnostics v_created = row_count;
    insert into api.inventory_balances(product_id, on_hand_qty)
    select p.id, 0 from api.products p
    join app_private.import_run_rows r on r.normalized_key = p.sku_normalized
    where r.import_run_id = v_run.id;
  elsif v_run.target_type = 'PRODUCTS' then
    update api.products p
    set barcode = app_private.empty_to_null(r.row_payload ->> 'barcode'),
        name = normalize(btrim(r.row_payload ->> 'name'), NFC),
        name_normalized = app_private.normalize_catalog_key(r.row_payload ->> 'name'),
        category_id = (select c.id from api.categories c where c.name_normalized =
          app_private.normalize_catalog_key(r.row_payload ->> 'categoryName')),
        unit_name = normalize(btrim(r.row_payload ->> 'unitName'), NFC),
        description = app_private.empty_to_null(r.row_payload ->> 'description'),
        min_stock_qty = coalesce(nullif(r.row_payload ->> 'minStockQty', ''), '0')::numeric,
        is_active = coalesce((r.row_payload ->> 'isActive')::boolean, true),
        version = p.version + 1, updated_by = v_actor_id, updated_at = now()
    from app_private.import_run_rows r
    where r.import_run_id = v_run.id and p.sku_normalized = r.normalized_key;
    get diagnostics v_updated = row_count;
  elsif v_run.target_type = 'SUPPLIERS' and v_run.mode = 'CREATE_ONLY' then
    insert into api.suppliers (
      code, code_normalized, name, name_normalized, phone_e164, email,
      address, notes, is_active, created_by, updated_by
    )
    select app_private.empty_to_null(r.row_payload ->> 'code'),
      case when r.normalized_key like 'row:%' then null else r.normalized_key end,
      normalize(btrim(r.row_payload ->> 'name'), NFC),
      app_private.normalize_catalog_key(r.row_payload ->> 'name'),
      app_private.empty_to_null(r.row_payload ->> 'phone'),
      lower(app_private.empty_to_null(r.row_payload ->> 'email')),
      app_private.empty_to_null(r.row_payload ->> 'address'),
      app_private.empty_to_null(r.row_payload ->> 'notes'),
      coalesce((r.row_payload ->> 'isActive')::boolean, true),
      v_actor_id, v_actor_id
    from app_private.import_run_rows r
    where r.import_run_id = v_run.id order by r.normalized_key;
    get diagnostics v_created = row_count;
  elsif v_run.target_type = 'SUPPLIERS' then
    update api.suppliers s
    set name = normalize(btrim(r.row_payload ->> 'name'), NFC),
        name_normalized = app_private.normalize_catalog_key(r.row_payload ->> 'name'),
        phone_e164 = app_private.empty_to_null(r.row_payload ->> 'phone'),
        email = lower(app_private.empty_to_null(r.row_payload ->> 'email')),
        address = app_private.empty_to_null(r.row_payload ->> 'address'),
        notes = app_private.empty_to_null(r.row_payload ->> 'notes'),
        is_active = coalesce((r.row_payload ->> 'isActive')::boolean, true),
        version = s.version + 1, updated_by = v_actor_id, updated_at = now()
    from app_private.import_run_rows r
    where r.import_run_id = v_run.id and s.code_normalized = r.normalized_key;
    get diagnostics v_updated = row_count;
  elsif v_run.target_type = 'CUSTOMERS' and v_run.mode = 'CREATE_ONLY' then
    insert into api.customers (
      code, code_normalized, customer_type, name, name_normalized, phone_e164,
      email, address, company_name, tax_code, customer_group, notes, is_active,
      created_by, updated_by
    )
    select app_private.empty_to_null(r.row_payload ->> 'code'),
      case when r.normalized_key like 'row:%' then null else r.normalized_key end,
      coalesce(nullif(r.row_payload ->> 'customerType', ''), 'INDIVIDUAL'),
      normalize(btrim(r.row_payload ->> 'name'), NFC),
      app_private.normalize_catalog_key(r.row_payload ->> 'name'),
      app_private.empty_to_null(r.row_payload ->> 'phone'),
      lower(app_private.empty_to_null(r.row_payload ->> 'email')),
      app_private.empty_to_null(r.row_payload ->> 'address'),
      case when coalesce(nullif(r.row_payload ->> 'customerType', ''), 'INDIVIDUAL') = 'BUSINESS'
        then app_private.empty_to_null(r.row_payload ->> 'companyName') else null end,
      app_private.empty_to_null(r.row_payload ->> 'taxCode'),
      app_private.empty_to_null(r.row_payload ->> 'customerGroup'),
      app_private.empty_to_null(r.row_payload ->> 'notes'),
      coalesce((r.row_payload ->> 'isActive')::boolean, true),
      v_actor_id, v_actor_id
    from app_private.import_run_rows r
    where r.import_run_id = v_run.id order by r.normalized_key;
    get diagnostics v_created = row_count;
  elsif v_run.target_type = 'CUSTOMERS' then
    update api.customers c
    set customer_type = coalesce(nullif(r.row_payload ->> 'customerType', ''), 'INDIVIDUAL'),
        name = normalize(btrim(r.row_payload ->> 'name'), NFC),
        name_normalized = app_private.normalize_catalog_key(r.row_payload ->> 'name'),
        phone_e164 = app_private.empty_to_null(r.row_payload ->> 'phone'),
        email = lower(app_private.empty_to_null(r.row_payload ->> 'email')),
        address = app_private.empty_to_null(r.row_payload ->> 'address'),
        company_name = case when coalesce(nullif(r.row_payload ->> 'customerType', ''), 'INDIVIDUAL') = 'BUSINESS'
          then app_private.empty_to_null(r.row_payload ->> 'companyName') else null end,
        tax_code = app_private.empty_to_null(r.row_payload ->> 'taxCode'),
        customer_group = app_private.empty_to_null(r.row_payload ->> 'customerGroup'),
        notes = app_private.empty_to_null(r.row_payload ->> 'notes'),
        is_active = coalesce((r.row_payload ->> 'isActive')::boolean, true),
        version = c.version + 1, updated_by = v_actor_id, updated_at = now()
    from app_private.import_run_rows r
    where r.import_run_id = v_run.id and c.code_normalized = r.normalized_key;
    get diagnostics v_updated = row_count;
  end if;

  if v_run.target_type = 'PRODUCTS' then
    update app_private.product_sale_prices price
    set valid_to = now()
    from api.products p
    join app_private.import_run_rows r on r.normalized_key = p.sku_normalized
    where r.import_run_id = v_run.id
      and price.product_id = p.id and price.valid_to is null
      and nullif(r.row_payload ->> 'salePrice', '') is not null
      and price.sale_price <> (r.row_payload ->> 'salePrice')::numeric;
    insert into app_private.product_sale_prices (
      product_id, sale_price, changed_by, change_reason
    )
    select p.id, (r.row_payload ->> 'salePrice')::numeric, v_actor_id,
      'Nhập giá bán từ Excel'
    from api.products p
    join app_private.import_run_rows r on r.normalized_key = p.sku_normalized
    where r.import_run_id = v_run.id
      and nullif(r.row_payload ->> 'salePrice', '') is not null
      and not exists (
        select 1 from app_private.product_sale_prices current_price
        where current_price.product_id = p.id and current_price.valid_to is null
          and current_price.sale_price = (r.row_payload ->> 'salePrice')::numeric
      );
  end if;

  v_result := jsonb_build_object(
    'importRunId', v_run.id, 'targetType', v_run.target_type,
    'createdRows', v_created, 'updatedRows', v_updated,
    'totalRows', v_run.total_rows
  );
  update api.import_runs
  set status = 'COMMITTED', committed_at = now(), result = v_result
  where id = v_run.id;
  insert into app_private.audit_events (
    actor_id, action, entity_type, entity_id, after_data, correlation_id
  ) values (
    v_actor_id, 'import.committed', 'import_run', v_run.id,
    jsonb_build_object(
      'targetType', v_run.target_type, 'mode', v_run.mode,
      'totalRows', v_run.total_rows, 'createdRows', v_created,
      'updatedRows', v_updated
    ),
    v_run.correlation_id
  );
  insert into api.user_notifications (
    user_id, severity, category, title, message, action_route,
    entity_type, entity_id, dedupe_key, metadata, correlation_id
  ) values (
    v_actor_id, 'SUCCESS', 'Nhập dữ liệu', 'Đã nhập dữ liệu thành công',
    format('Đã nhập %s dòng dữ liệu.', v_run.total_rows),
    '/imports/' || v_run.id::text, 'import_run', v_run.id,
    'import.committed:' || v_run.id::text,
    jsonb_build_object('targetType', v_run.target_type, 'totalRows', v_run.total_rows),
    v_run.correlation_id
  );
  v_result := app_private.command_success(v_result, v_run.correlation_id);
  insert into app_private.command_deduplication (
    actor_id, command_name, idempotency_key, response
  ) values (v_actor_id, 'import.commit', p_idempotency_key, v_result);
  return v_result;
exception
  when unique_violation then
    return app_private.command_error(
      'DUPLICATE_IN_DATABASE',
      'Dữ liệu đã thay đổi trong lúc nhập. Không có dòng nào được lưu.',
      v_correlation_id
    );
  when others then
    return app_private.command_error(
      'IMPORT_COMMIT_FAILED',
      'Không thể nhập dữ liệu. Không có dòng nào được lưu.',
      v_correlation_id
    );
end;
$$;

create function api.commit_import(
  p_import_run_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select app_private.commit_import_impl(p_import_run_id, p_idempotency_key); $$;

create function app_private.cleanup_expired_import_payloads()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from app_private.import_run_errors e
  using api.import_runs r
  where e.import_run_id = r.id and r.expires_at <= now();
  delete from app_private.import_run_rows rows
  using api.import_runs r
  where rows.import_run_id = r.id and r.expires_at <= now();
  get diagnostics v_deleted = row_count;
  delete from app_private.import_run_mappings m
  using api.import_runs r
  where m.import_run_id = r.id and r.expires_at <= now();
  delete from app_private.import_run_chunks c
  using api.import_runs r
  where c.import_run_id = r.id and r.expires_at <= now();
  update api.import_runs
  set status = 'EXPIRED'
  where expires_at <= now() and status not in ('COMMITTED', 'EXPIRED');
  return v_deleted;
end;
$$;

select cron.unschedule(jobid)
from cron.job
where jobname = 'cleanup-expired-import-payloads';

select cron.schedule(
  'cleanup-expired-import-payloads',
  '17 2 * * *',
  'select app_private.cleanup_expired_import_payloads();'
);

revoke execute on function app_private.import_target_permission(text) from public, anon;
revoke execute on function app_private.import_allowed_fields(text) from public, anon;
revoke execute on function app_private.import_required_fields(text) from public, anon;
revoke execute on function app_private.add_import_error(uuid, integer, text, text, text, jsonb, timestamptz) from public, anon;
revoke execute on function app_private.is_import_owner(uuid) from public, anon;
revoke execute on function app_private.create_import_run_impl(text, integer, text, text, text, uuid) from public, anon;
revoke execute on function app_private.save_import_mapping_impl(uuid, jsonb) from public, anon;
revoke execute on function app_private.validate_import_payload(api.import_runs, integer, jsonb) from public, anon;
revoke execute on function app_private.finalize_import_validation(uuid) from public, anon;
revoke execute on function app_private.validate_import_rows_impl(uuid, integer, jsonb, boolean) from public, anon;
revoke execute on function app_private.get_import_validation_result_impl(uuid, integer, integer) from public, anon;
revoke execute on function app_private.get_import_result_impl(uuid) from public, anon;
revoke execute on function app_private.list_import_runs_impl(text, text, timestamptz, uuid, integer) from public, anon;
revoke execute on function app_private.commit_import_impl(uuid, uuid) from public, anon;
revoke execute on function app_private.cleanup_expired_import_payloads() from public, anon, authenticated;

grant execute on function app_private.import_target_permission(text) to authenticated;
grant execute on function app_private.import_allowed_fields(text) to authenticated;
grant execute on function app_private.import_required_fields(text) to authenticated;
grant execute on function app_private.add_import_error(uuid, integer, text, text, text, jsonb, timestamptz) to authenticated;
grant execute on function app_private.is_import_owner(uuid) to authenticated;
grant execute on function app_private.create_import_run_impl(text, integer, text, text, text, uuid) to authenticated;
grant execute on function app_private.save_import_mapping_impl(uuid, jsonb) to authenticated;
grant execute on function app_private.validate_import_payload(api.import_runs, integer, jsonb) to authenticated;
grant execute on function app_private.finalize_import_validation(uuid) to authenticated;
grant execute on function app_private.validate_import_rows_impl(uuid, integer, jsonb, boolean) to authenticated;
grant execute on function app_private.get_import_validation_result_impl(uuid, integer, integer) to authenticated;
grant execute on function app_private.get_import_result_impl(uuid) to authenticated;
grant execute on function app_private.list_import_runs_impl(text, text, timestamptz, uuid, integer) to authenticated;
grant execute on function app_private.commit_import_impl(uuid, uuid) to authenticated;

revoke execute on function api.create_import_run(text, integer, text, text, text, uuid) from public, anon;
revoke execute on function api.save_import_mapping(uuid, jsonb) from public, anon;
revoke execute on function api.validate_import_rows(uuid, integer, jsonb, boolean) from public, anon;
revoke execute on function api.get_import_validation_result(uuid, integer, integer) from public, anon;
revoke execute on function api.commit_import(uuid, uuid) from public, anon;
revoke execute on function api.get_import_result(uuid) from public, anon;
revoke execute on function api.list_import_runs(text, text, timestamptz, uuid, integer) from public, anon;

grant execute on function api.create_import_run(text, integer, text, text, text, uuid) to authenticated;
grant execute on function api.save_import_mapping(uuid, jsonb) to authenticated;
grant execute on function api.validate_import_rows(uuid, integer, jsonb, boolean) to authenticated;
grant execute on function api.get_import_validation_result(uuid, integer, integer) to authenticated;
grant execute on function api.commit_import(uuid, uuid) to authenticated;
grant execute on function api.get_import_result(uuid) to authenticated;
grant execute on function api.list_import_runs(text, text, timestamptz, uuid, integer) to authenticated;
