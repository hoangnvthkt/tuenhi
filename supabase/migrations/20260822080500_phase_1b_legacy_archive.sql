alter table api.import_runs
drop constraint import_runs_target_type_check;

alter table api.import_runs
add constraint import_runs_target_type_check check (
  target_type in (
    'CATEGORIES', 'PRODUCTS', 'SUPPLIERS', 'CUSTOMERS',
    'LEGACY_SALES_ARCHIVE'
  )
);

alter table api.import_runs
drop constraint import_runs_adapter_id_check;

alter table api.import_runs
add constraint import_runs_adapter_id_check check (
  (target_type = 'LEGACY_SALES_ARCHIVE' and adapter_id = 'LEGACY_Q237_V1')
  or (target_type <> 'LEGACY_SALES_ARCHIVE' and adapter_id is null)
);

alter table api.import_runs
add constraint import_runs_legacy_mode_check check (
  target_type <> 'LEGACY_SALES_ARCHIVE' or mode = 'CREATE_ONLY'
);

create function app_private.set_import_adapter()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.adapter_id := case
    when new.target_type = 'LEGACY_SALES_ARCHIVE' then 'LEGACY_Q237_V1'
    else null
  end;
  return new;
end;
$$;

create trigger import_runs_set_adapter
before insert or update of target_type on api.import_runs
for each row execute function app_private.set_import_adapter();

create or replace function app_private.import_target_permission(p_target_type text)
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
    when 'LEGACY_SALES_ARCHIVE' then 'legacy.sale.import'
    else null
  end;
$$;

create or replace function app_private.import_allowed_fields(p_target_type text)
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
    when 'LEGACY_SALES_ARCHIVE' then array[
      'sourceGroupIndex', 'sourceSaleNumber', 'sourceRowStart',
      'sourceRowNumber', 'lineNumber', 'soldOn', 'staffLabel',
      'channelLabel', 'customerLabel', 'customerPhone', 'paymentLabel',
      'paymentMethod', 'statusLabel', 'note', 'productCode', 'productName',
      'quantity', 'unitPrice', 'unitPriceProvenance', 'lineDiscount',
      'lineTotal', 'lineTotalProvenance', 'warningCodes',
      'openingSuggestions'
    ]::text[]
    else array[]::text[]
  end;
$$;

create or replace function app_private.import_required_fields(p_target_type text)
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
    when 'LEGACY_SALES_ARCHIVE' then array[
      'sourceGroupIndex', 'sourceSaleNumber', 'sourceRowStart',
      'sourceRowNumber', 'lineNumber', 'productName', 'quantity',
      'warningCodes'
    ]::text[]
    else array[]::text[]
  end;
$$;

create or replace function api.create_import_run(
  p_target_type text,
  p_template_version integer,
  p_file_name text,
  p_file_sha256 text,
  p_mode text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_target_type = 'LEGACY_SALES_ARCHIVE'
    and (p_template_version <> 1 or p_mode <> 'CREATE_ONLY')
  then
    return jsonb_build_object(
      'ok', false, 'data', null,
      'error', jsonb_build_object(
        'code', 'VALIDATION_FAILED',
        'message', 'Phiên nhập dữ liệu cũ chưa hợp lệ.',
        'details', '{}'::jsonb
      ),
      'correlationId', gen_random_uuid()
    );
  end if;
  return app_private.create_import_run_impl(
    p_target_type, p_template_version, p_file_name, p_file_sha256,
    p_mode, p_idempotency_key
  );
end;
$$;

create table api.legacy_sales (
  id uuid primary key default gen_random_uuid(),
  source_import_run_id uuid not null references api.import_runs(id) on delete restrict,
  source_sale_number text not null check (length(source_sale_number) between 1 and 100),
  source_row_start integer not null check (source_row_start >= 2),
  sold_on date,
  staff_label text not null default '' check (length(staff_label) <= 200),
  channel_label text not null default '' check (length(channel_label) <= 200),
  customer_label text not null default '' check (length(customer_label) <= 200),
  customer_phone text not null default '' check (length(customer_phone) <= 32),
  payment_label text not null default '' check (length(payment_label) <= 100),
  payment_method text check (payment_method in ('CASH', 'BANK_TRANSFER')),
  source_status_label text not null default '' check (length(source_status_label) <= 100),
  source_note text not null default '' check (length(source_note) <= 1000),
  profile_id uuid references api.profiles(id) on delete restrict,
  customer_id uuid references api.customers(id) on delete restrict,
  sales_channel_id uuid references api.sales_channels(id) on delete restrict,
  reported_subtotal numeric(20,2) check (reported_subtotal >= 0),
  reported_discount_total numeric(20,2) check (reported_discount_total >= 0),
  reported_net_total numeric(20,2) check (reported_net_total >= 0),
  data_quality_status text not null check (data_quality_status in ('VALID', 'WARNING')),
  warning_codes text[] not null default '{}',
  adapter_id text not null default 'LEGACY_Q237_V1' check (adapter_id = 'LEGACY_Q237_V1'),
  source_file_sha256 text not null check (source_file_sha256 ~ '^[0-9a-f]{64}$'),
  mapping_version integer not null default 1 check (mapping_version = 1),
  created_by uuid not null references api.profiles(id) on delete restrict,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  unique(source_import_run_id, source_sale_number)
);

create index legacy_sales_source_import_run_idx
on api.legacy_sales(source_import_run_id);
create index legacy_sales_profile_idx on api.legacy_sales(profile_id);
create index legacy_sales_customer_idx on api.legacy_sales(customer_id);
create index legacy_sales_channel_idx on api.legacy_sales(sales_channel_id);
create index legacy_sales_created_by_idx on api.legacy_sales(created_by);
create index legacy_sales_sold_on_idx on api.legacy_sales(sold_on desc, id desc);
create index legacy_sales_source_number_idx on api.legacy_sales(source_sale_number);

create table api.legacy_sale_lines (
  id uuid primary key default gen_random_uuid(),
  legacy_sale_id uuid not null references api.legacy_sales(id) on delete restrict,
  source_row_number integer not null check (source_row_number >= 2),
  line_number integer not null check (line_number >= 1),
  product_label text not null check (length(product_label) between 1 and 200),
  product_code text not null default '' check (length(product_code) <= 100),
  product_id uuid references api.products(id) on delete restrict,
  quantity numeric(18,3) check (quantity > 0),
  unit_price numeric(20,2) check (unit_price >= 0),
  unit_price_provenance text check (
    unit_price_provenance in ('SOURCE_VALUE', 'CACHED_UNVERIFIED')
  ),
  line_discount numeric(20,2) check (line_discount >= 0),
  line_total numeric(20,2) check (line_total >= 0),
  line_total_provenance text check (
    line_total_provenance in ('SOURCE_VALUE', 'CACHED_UNVERIFIED')
  ),
  warning_codes text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique(legacy_sale_id, source_row_number),
  unique(legacy_sale_id, line_number)
);

create index legacy_sale_lines_sale_idx on api.legacy_sale_lines(legacy_sale_id);
create index legacy_sale_lines_product_idx on api.legacy_sale_lines(product_id);

create table app_private.legacy_opening_balance_suggestions (
  id uuid primary key default gen_random_uuid(),
  source_import_run_id uuid not null references api.import_runs(id) on delete restrict,
  source_row_number integer not null check (source_row_number >= 2),
  product_code text not null check (length(product_code) between 1 and 100),
  product_id uuid references api.products(id) on delete restrict,
  suggested_unit_cost numeric(20,2) check (suggested_unit_cost >= 0),
  suggested_opening_quantity numeric(18,3) check (suggested_opening_quantity >= 0),
  posting_allowed boolean not null default false check (not posting_allowed),
  warning_codes text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique(source_import_run_id, source_row_number, product_code)
);

create index legacy_opening_source_run_idx
on app_private.legacy_opening_balance_suggestions(source_import_run_id);
create index legacy_opening_product_idx
on app_private.legacy_opening_balance_suggestions(product_id);

alter table api.legacy_sales enable row level security;
alter table api.legacy_sales force row level security;
alter table api.legacy_sale_lines enable row level security;
alter table api.legacy_sale_lines force row level security;

create policy legacy_sales_read
on api.legacy_sales for select to authenticated
using ((select app_private.has_permission('legacy.sale.read')));

create policy legacy_sale_lines_read
on api.legacy_sale_lines for select to authenticated
using (
  (select app_private.has_permission('legacy.sale.read'))
  and exists (
    select 1 from api.legacy_sales s where s.id = legacy_sale_id
  )
);

revoke all on table api.legacy_sales from anon, authenticated;
revoke all on table api.legacy_sale_lines from anon, authenticated;
grant select on table api.legacy_sales to authenticated;
grant select on table api.legacy_sale_lines to authenticated;
revoke all on table app_private.legacy_opening_balance_suggestions
from public, anon, authenticated;

create function app_private.save_legacy_import_mapping_impl(
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
  v_kind text;
  v_label text;
  v_resolution jsonb;
  v_target_id uuid;
begin
  select * into v_run from api.import_runs r
  where r.id = p_import_run_id and r.actor_id = v_actor_id
  for update;
  if not found or not app_private.is_import_owner(v_actor_id)
    or not app_private.has_permission('legacy.sale.import')
  then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Chỉ chủ cửa hàng được ghép dữ liệu cũ.',
      v_correlation_id
    );
  end if;
  if v_run.target_type <> 'LEGACY_SALES_ARCHIVE'
    or v_run.adapter_id <> 'LEGACY_Q237_V1'
    or v_run.status not in ('UPLOADED', 'MAPPED')
    or v_run.next_chunk_index <> 0
  then
    return app_private.command_error(
      'INVALID_STATE', 'Phiên nhập dữ liệu cũ không còn cho phép đổi mapping.',
      v_correlation_id
    );
  end if;
  if jsonb_typeof(p_mapping) <> 'object'
    or p_mapping - array['staff', 'channel', 'customer', 'product'] <> '{}'::jsonb
    or not (p_mapping ?& array['staff', 'channel', 'customer', 'product'])
  then
    return app_private.command_error(
      'LEGACY_MAPPING_REQUIRED',
      'Vui lòng ghép đủ nhân viên, kênh, khách hàng và sản phẩm.',
      v_correlation_id
    );
  end if;

  foreach v_kind in array array['staff', 'channel', 'customer', 'product'] loop
    if jsonb_typeof(p_mapping -> v_kind) <> 'object' then
      return app_private.command_error(
        'LEGACY_MAPPING_REQUIRED', 'Cấu trúc mapping dữ liệu cũ chưa hợp lệ.',
        v_correlation_id
      );
    end if;
    for v_label, v_resolution in
      select key, value from jsonb_each(p_mapping -> v_kind)
    loop
      if length(btrim(v_label)) not between 1 and 200
        or jsonb_typeof(v_resolution) <> 'object'
        or jsonb_typeof(v_resolution -> 'confirmed') <> 'boolean'
        or v_resolution ->> 'confirmed' <> 'true'
        or v_resolution ->> 'kind' not in ('TARGET', 'SOURCE_LABEL_ONLY')
      then
        return app_private.command_error(
          'LEGACY_MAPPING_REQUIRED',
          'Mọi nhãn nguồn phải được chủ cửa hàng xác nhận.', v_correlation_id
        );
      end if;
      if v_resolution ->> 'kind' = 'TARGET' then
        begin
          v_target_id := (v_resolution ->> 'targetId')::uuid;
        exception when others then
          return app_private.command_error(
            'LEGACY_MAPPING_REQUIRED', 'Mã dữ liệu đích chưa hợp lệ.',
            v_correlation_id
          );
        end;
        if (v_kind = 'staff' and not exists (
          select 1 from api.profiles where id = v_target_id
        )) or (v_kind = 'channel' and not exists (
          select 1 from api.sales_channels where id = v_target_id
        )) or (v_kind = 'customer' and not exists (
          select 1 from api.customers where id = v_target_id
        )) or (v_kind = 'product' and not exists (
          select 1 from api.products where id = v_target_id
        )) then
          return app_private.command_error(
            'REFERENCE_NOT_FOUND', 'Dữ liệu được ghép không còn tồn tại.',
            v_correlation_id
          );
        end if;
      end if;
    end loop;
  end loop;

  insert into app_private.import_run_mappings(import_run_id, mapping)
  values (v_run.id, p_mapping)
  on conflict (import_run_id) do update
  set mapping = excluded.mapping, updated_at = now();
  update api.import_runs set status = 'MAPPED' where id = v_run.id;
  return app_private.command_success(
    jsonb_build_object('importRunId', v_run.id, 'status', 'MAPPED'),
    v_run.correlation_id
  );
end;
$$;

create function api.save_legacy_import_mapping(
  p_import_run_id uuid,
  p_mapping jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.save_legacy_import_mapping_impl(
    p_import_run_id, p_mapping
  );
$$;

create function app_private.validate_legacy_sales_import_impl(
  p_import_run_id uuid
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
  v_mapping jsonb;
  v_row record;
  v_kind text;
  v_label text;
  v_field text;
  v_resolution jsonb;
  v_invalid integer;
  v_valid integer;
  v_warning_count integer;
begin
  select * into v_run from api.import_runs r
  where r.id = p_import_run_id and r.actor_id = v_actor_id
  for update;
  if not found or not app_private.is_import_owner(v_actor_id)
    or not app_private.has_permission('legacy.sale.import')
  then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Chỉ chủ cửa hàng được kiểm tra dữ liệu cũ.',
      v_correlation_id
    );
  end if;
  if v_run.target_type <> 'LEGACY_SALES_ARCHIVE'
    or v_run.adapter_id <> 'LEGACY_Q237_V1'
    or v_run.status <> 'VALIDATED'
    or v_run.total_rows < 1
  then
    return app_private.command_error(
      'INVALID_STATE', 'Phiên nhập dữ liệu cũ chưa sẵn sàng để kiểm tra.',
      v_correlation_id
    );
  end if;
  select mapping into v_mapping
  from app_private.import_run_mappings where import_run_id = v_run.id;
  if v_mapping is null then
    return app_private.command_error(
      'LEGACY_MAPPING_REQUIRED', 'Vui lòng hoàn tất mapping dữ liệu cũ.',
      v_correlation_id
    );
  end if;

  delete from app_private.import_run_errors e
  where e.import_run_id = v_run.id
    and e.code like 'LEGACY_%';

  for v_row in
    select row_number, row_payload from app_private.import_run_rows
    where import_run_id = v_run.id order by row_number
  loop
    if coalesce(v_row.row_payload ->> 'sourceGroupIndex', '') !~ '^[1-9][0-9]*$'
      or coalesce(v_row.row_payload ->> 'sourceRowStart', '') !~ '^[2-9][0-9]*$|^[1-9][0-9]{2,}$'
      or coalesce(v_row.row_payload ->> 'sourceRowNumber', '') !~ '^[2-9][0-9]*$|^[1-9][0-9]{2,}$'
      or coalesce(v_row.row_payload ->> 'lineNumber', '') !~ '^[1-9][0-9]*$'
      or length(btrim(coalesce(v_row.row_payload ->> 'sourceSaleNumber', ''))) not between 1 and 100
      or length(btrim(coalesce(v_row.row_payload ->> 'productName', ''))) not between 1 and 200
      or jsonb_typeof(v_row.row_payload -> 'warningCodes') <> 'array'
      or exists (
        select 1 from jsonb_array_elements(v_row.row_payload -> 'warningCodes') w
        where jsonb_typeof(w) <> 'string'
      )
    then
      perform app_private.add_import_error(
        v_run.id, v_row.row_number, null, 'LEGACY_WORKBOOK_UNSUPPORTED',
        'Dòng dữ liệu cũ không đúng cấu trúc được hỗ trợ.', null,
        v_run.expires_at
      );
      continue;
    end if;
    if coalesce(v_row.row_payload ->> 'quantity', '')
      !~ '^[0-9]+(\.[0-9]{1,3})?$'
      or (v_row.row_payload ->> 'quantity')::numeric <= 0
      or exists (
        select 1 from (values
          ('unitPrice'), ('lineDiscount'), ('lineTotal')
        ) fields(name)
        where nullif(v_row.row_payload ->> fields.name, '') is not null
          and v_row.row_payload ->> fields.name
            !~ '^[0-9]+(\.[0-9]{1,2})?$'
      )
    then
      perform app_private.add_import_error(
        v_run.id, v_row.row_number, null, 'VALIDATION_FAILED',
        'Số lượng, giá hoặc thành tiền của dòng dữ liệu cũ chưa hợp lệ.',
        null, v_run.expires_at
      );
    end if;
    if nullif(v_row.row_payload ->> 'soldOn', '') is not null
      and (
        v_row.row_payload ->> 'soldOn' !~ '^\d{4}-\d{2}-\d{2}$'
        or to_char(to_date(v_row.row_payload ->> 'soldOn', 'YYYY-MM-DD'), 'YYYY-MM-DD')
          <> v_row.row_payload ->> 'soldOn'
      )
    then
      perform app_private.add_import_error(
        v_run.id, v_row.row_number, 'soldOn', 'VALIDATION_FAILED',
        'Ngày bán chưa đúng định dạng ngày/tháng/năm.', null,
        v_run.expires_at
      );
    end if;
    if coalesce(v_row.row_payload ->> 'unitPriceProvenance', '')
      not in ('', 'SOURCE_VALUE', 'CACHED_UNVERIFIED')
      or coalesce(v_row.row_payload ->> 'lineTotalProvenance', '')
        not in ('', 'SOURCE_VALUE', 'CACHED_UNVERIFIED')
    then
      perform app_private.add_import_error(
        v_run.id, v_row.row_number, null, 'VALIDATION_FAILED',
        'Nguồn giá trị cache chưa hợp lệ.', null, v_run.expires_at
      );
    end if;
    if v_row.row_payload ? 'openingSuggestions'
      and jsonb_typeof(v_row.row_payload -> 'openingSuggestions') <> 'array'
    then
      perform app_private.add_import_error(
        v_run.id, v_row.row_number, 'openingSuggestions', 'VALIDATION_FAILED',
        'Danh sách gợi ý mở sổ chưa hợp lệ.', null, v_run.expires_at
      );
    elsif v_row.row_payload ? 'openingSuggestions' and exists (
      select 1
      from jsonb_array_elements(v_row.row_payload -> 'openingSuggestions') s
      where jsonb_typeof(s) <> 'object'
        or s - array[
          'sourceRowNumber', 'productCode', 'unitCost',
          'openingQuantity', 'postingAllowed'
        ] <> '{}'::jsonb
        or coalesce(s ->> 'sourceRowNumber', '') !~ '^[1-9][0-9]*$'
        or length(btrim(coalesce(s ->> 'productCode', ''))) not between 1 and 100
        or coalesce(s ->> 'postingAllowed', '') <> 'false'
        or (nullif(s ->> 'unitCost', '') is not null
          and s ->> 'unitCost' !~ '^[0-9]+(\.[0-9]{1,2})?$')
        or (nullif(s ->> 'openingQuantity', '') is not null
          and s ->> 'openingQuantity' !~ '^[0-9]+(\.[0-9]{1,3})?$')
    ) then
      perform app_private.add_import_error(
        v_run.id, v_row.row_number, 'openingSuggestions', 'VALIDATION_FAILED',
        'Gợi ý giá vốn hoặc tồn đầu kỳ chưa hợp lệ và chưa được ghi sổ.',
        null, v_run.expires_at
      );
    end if;
  end loop;

  insert into app_private.import_run_errors(
    import_run_id, row_number, code, message, expires_at
  )
  select v_run.id, min(r.row_number), 'LEGACY_DUPLICATE_INVOICE_NUMBER',
    'Mã đơn xuất hiện ở nhiều nhóm không liền nhau. Vui lòng kiểm tra lại.',
    v_run.expires_at
  from app_private.import_run_rows r
  where r.import_run_id = v_run.id
  group by r.row_payload ->> 'sourceSaleNumber'
  having count(distinct r.row_payload ->> 'sourceGroupIndex') > 1;

  insert into app_private.import_run_errors(
    import_run_id, row_number, code, message, expires_at
  )
  select v_run.id, min(r.row_number), 'LEGACY_GROUP_CONFLICT',
    'Các dòng cùng mã đơn có thông tin đơn hàng không thống nhất.',
    v_run.expires_at
  from app_private.import_run_rows r
  where r.import_run_id = v_run.id
  group by r.row_payload ->> 'sourceGroupIndex'
  having count(distinct jsonb_build_array(
    r.row_payload ->> 'sourceSaleNumber', r.row_payload ->> 'sourceRowStart',
    r.row_payload ->> 'soldOn', r.row_payload ->> 'staffLabel',
    r.row_payload ->> 'channelLabel', r.row_payload ->> 'customerLabel',
    r.row_payload ->> 'customerPhone', r.row_payload ->> 'paymentLabel',
    r.row_payload ->> 'paymentMethod', r.row_payload ->> 'statusLabel',
    r.row_payload ->> 'note'
  )) > 1;

  insert into app_private.import_run_errors(
    import_run_id, row_number, code, message, expires_at
  )
  select v_run.id, min(r.row_number), 'LEGACY_GROUP_CONFLICT',
    'Số thứ tự hoặc dòng nguồn bị trùng trong cùng mã đơn.',
    v_run.expires_at
  from app_private.import_run_rows r
  where r.import_run_id = v_run.id
  group by r.row_payload ->> 'sourceGroupIndex',
    coalesce(r.row_payload ->> 'lineNumber',
      r.row_payload ->> 'sourceRowNumber')
  having count(*) > 1;

  insert into app_private.import_run_errors(
    import_run_id, row_number, code, message, expires_at
  )
  select v_run.id, min(r.row_number), 'LEGACY_GROUP_CONFLICT',
    'Dòng nguồn bị trùng trong cùng mã đơn.', v_run.expires_at
  from app_private.import_run_rows r
  where r.import_run_id = v_run.id
  group by r.row_payload ->> 'sourceGroupIndex',
    r.row_payload ->> 'sourceRowNumber'
  having count(*) > 1;

  foreach v_kind in array array['staff', 'channel', 'customer', 'product'] loop
    v_field := case v_kind
      when 'staff' then 'staffLabel'
      when 'channel' then 'channelLabel'
      when 'customer' then 'customerLabel'
      else 'productCode'
    end;
    for v_label in
      select distinct btrim(case when v_kind = 'product' then
        coalesce(nullif(r.row_payload ->> 'productCode', ''),
          r.row_payload ->> 'productName')
      else r.row_payload ->> v_field end)
      from app_private.import_run_rows r
      where r.import_run_id = v_run.id
        and nullif(btrim(coalesce(case when v_kind = 'product' then
          coalesce(nullif(r.row_payload ->> 'productCode', ''),
            r.row_payload ->> 'productName')
        else r.row_payload ->> v_field end, '')), '') is not null
    loop
      v_resolution := v_mapping -> v_kind -> v_label;
      if v_resolution is null
        or jsonb_typeof(v_resolution -> 'confirmed') <> 'boolean'
        or v_resolution ->> 'confirmed' <> 'true'
        or v_resolution ->> 'kind' not in ('TARGET', 'SOURCE_LABEL_ONLY')
      then
        perform app_private.add_import_error(
          v_run.id,
          (select min(row_number) from app_private.import_run_rows
           where import_run_id = v_run.id),
          null, 'LEGACY_MAPPING_REQUIRED',
          'Vui lòng ghép dữ liệu hoặc xác nhận chỉ giữ nhãn cũ trước khi tiếp tục.',
          null, v_run.expires_at
        );
      end if;
    end loop;
  end loop;

  update app_private.import_run_rows r
  set validation_status = case when exists (
    select 1 from app_private.import_run_errors e
    where e.import_run_id = r.import_run_id and e.row_number = r.row_number
  ) then 'INVALID' else 'VALID' end
  where r.import_run_id = v_run.id;

  select count(*) filter (where validation_status = 'VALID')::integer,
    count(*) filter (where validation_status = 'INVALID')::integer
  into v_valid, v_invalid
  from app_private.import_run_rows where import_run_id = v_run.id;
  update api.import_runs
  set valid_rows = v_valid, invalid_rows = v_invalid
  where id = v_run.id;
  if v_invalid > 0 then
    return app_private.command_error_with_details(
      'IMPORT_VALIDATION_FAILED',
      'Dữ liệu cũ còn lỗi chặn. Không có hóa đơn nào được lưu.',
      jsonb_build_object('invalidRows', v_invalid), v_run.correlation_id
    );
  end if;
  select count(*)::integer into v_warning_count
  from app_private.import_run_rows r
  cross join lateral jsonb_array_elements_text(r.row_payload -> 'warningCodes') w
  where r.import_run_id = v_run.id;
  return app_private.command_success(
    jsonb_build_object(
      'importRunId', v_run.id, 'status', 'VALIDATED',
      'totalRows', v_run.total_rows, 'validRows', v_valid,
      'invalidRows', 0, 'warningCount', v_warning_count,
      'isOperational', false
    ),
    v_run.correlation_id
  );
end;
$$;

create function api.validate_legacy_sales_import(p_import_run_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.validate_legacy_sales_import_impl(p_import_run_id);
$$;

create function app_private.commit_legacy_sales_import_impl(
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
  v_mapping jsonb;
  v_cached jsonb;
  v_validation jsonb;
  v_group record;
  v_line record;
  v_sale_id uuid;
  v_profile_id uuid;
  v_customer_id uuid;
  v_channel_id uuid;
  v_product_id uuid;
  v_warnings text[];
  v_resolution jsonb;
  v_created_sales integer := 0;
  v_created_lines integer := 0;
  v_suggestion jsonb;
  v_suggestions integer := 0;
  v_result jsonb;
begin
  if p_idempotency_key is null then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Thiếu mã chống gửi trùng thao tác.',
      v_correlation_id
    );
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_actor_id::text || ':legacy.commit:' || p_import_run_id::text || ':' ||
    p_idempotency_key::text, 0
  ));
  v_cached := app_private.cached_command_response(
    v_actor_id, 'legacy.import.commit', p_idempotency_key
  );
  if v_cached is not null then return v_cached; end if;

  select * into v_run from api.import_runs r
  where r.id = p_import_run_id and r.actor_id = v_actor_id
  for update;
  if not found or not app_private.is_import_owner(v_actor_id)
    or not app_private.has_permission('legacy.sale.import')
  then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Chỉ chủ cửa hàng được lưu dữ liệu cũ.',
      v_correlation_id
    );
  end if;
  if v_run.status = 'COMMITTED' then
    return app_private.command_error(
      'LEGACY_ARCHIVE_ALREADY_COMMITTED',
      'Dữ liệu từ tệp này đã được lưu trước đó.', v_run.correlation_id
    );
  end if;
  if v_run.target_type <> 'LEGACY_SALES_ARCHIVE'
    or v_run.adapter_id <> 'LEGACY_Q237_V1'
    or v_run.status <> 'VALIDATED'
    or v_run.invalid_rows > 0
  then
    return app_private.command_error(
      'INVALID_STATE', 'Phiên dữ liệu cũ chưa sẵn sàng để lưu.',
      v_correlation_id
    );
  end if;
  v_validation := app_private.validate_legacy_sales_import_impl(v_run.id);
  if coalesce((v_validation ->> 'ok')::boolean, false) is not true then
    return v_validation;
  end if;
  select mapping into strict v_mapping
  from app_private.import_run_mappings where import_run_id = v_run.id;

  for v_group in
    select
      (r.row_payload ->> 'sourceGroupIndex')::integer group_index,
      min(r.row_number) first_row,
      min(r.row_payload ->> 'sourceSaleNumber') source_sale_number,
      min((r.row_payload ->> 'sourceRowStart')::integer) source_row_start,
      min(nullif(r.row_payload ->> 'soldOn', '')) sold_on,
      min(coalesce(r.row_payload ->> 'staffLabel', '')) staff_label,
      min(coalesce(r.row_payload ->> 'channelLabel', '')) channel_label,
      min(coalesce(r.row_payload ->> 'customerLabel', '')) customer_label,
      min(coalesce(r.row_payload ->> 'customerPhone', '')) customer_phone,
      min(coalesce(r.row_payload ->> 'paymentLabel', '')) payment_label,
      min(nullif(r.row_payload ->> 'paymentMethod', '')) payment_method,
      min(coalesce(r.row_payload ->> 'statusLabel', '')) status_label,
      min(coalesce(r.row_payload ->> 'note', '')) note,
      case when bool_and(nullif(r.row_payload ->> 'quantity', '') is not null
        and nullif(r.row_payload ->> 'unitPrice', '') is not null)
        then sum((r.row_payload ->> 'quantity')::numeric *
          (r.row_payload ->> 'unitPrice')::numeric) end subtotal,
      case when bool_and(nullif(r.row_payload ->> 'lineDiscount', '') is not null)
        then sum((r.row_payload ->> 'lineDiscount')::numeric) end discount_total,
      case when bool_and(nullif(r.row_payload ->> 'lineTotal', '') is not null)
        then sum((r.row_payload ->> 'lineTotal')::numeric) end net_total
    from app_private.import_run_rows r
    where r.import_run_id = v_run.id
    group by (r.row_payload ->> 'sourceGroupIndex')::integer
    order by group_index
  loop
    v_resolution := v_mapping -> 'staff' -> v_group.staff_label;
    v_profile_id := case when v_resolution ->> 'kind' = 'TARGET'
      then (v_resolution ->> 'targetId')::uuid else null end;
    v_resolution := v_mapping -> 'customer' -> v_group.customer_label;
    v_customer_id := case when v_resolution ->> 'kind' = 'TARGET'
      then (v_resolution ->> 'targetId')::uuid else null end;
    v_resolution := v_mapping -> 'channel' -> v_group.channel_label;
    v_channel_id := case when v_resolution ->> 'kind' = 'TARGET'
      then (v_resolution ->> 'targetId')::uuid else null end;

    select coalesce(array_agg(distinct warning), '{}'::text[])
    into v_warnings
    from app_private.import_run_rows r
    cross join lateral jsonb_array_elements_text(r.row_payload -> 'warningCodes') warning
    where r.import_run_id = v_run.id
      and (r.row_payload ->> 'sourceGroupIndex')::integer = v_group.group_index;
    if v_profile_id is null and v_group.staff_label <> '' then
      v_warnings := array_append(v_warnings, 'LEGACY_STAFF_LABEL_ONLY');
    end if;
    if v_customer_id is null and v_group.customer_label <> '' then
      v_warnings := array_append(v_warnings, 'LEGACY_CUSTOMER_LABEL_ONLY');
    end if;
    if v_channel_id is null and v_group.channel_label <> '' then
      v_warnings := array_append(v_warnings, 'LEGACY_CHANNEL_LABEL_ONLY');
    end if;
    if v_group.payment_method is null and v_group.payment_label <> '' then
      v_warnings := array_append(v_warnings, 'LEGACY_PAYMENT_LABEL_ONLY');
    end if;
    select coalesce(array_agg(distinct item), '{}'::text[])
    into v_warnings from unnest(v_warnings) item;

    insert into api.legacy_sales(
      source_import_run_id, source_sale_number, source_row_start, sold_on,
      staff_label, channel_label, customer_label, customer_phone,
      payment_label, payment_method, source_status_label, source_note,
      profile_id, customer_id, sales_channel_id, reported_subtotal,
      reported_discount_total, reported_net_total, data_quality_status,
      warning_codes, source_file_sha256, created_by, correlation_id
    ) values (
      v_run.id, v_group.source_sale_number, v_group.source_row_start,
      v_group.sold_on::date, v_group.staff_label, v_group.channel_label,
      v_group.customer_label, v_group.customer_phone, v_group.payment_label,
      v_group.payment_method, v_group.status_label, v_group.note,
      v_profile_id, v_customer_id, v_channel_id, v_group.subtotal,
      v_group.discount_total, v_group.net_total,
      case when cardinality(v_warnings) > 0 then 'WARNING' else 'VALID' end,
      v_warnings, v_run.file_sha256, v_actor_id, v_run.correlation_id
    ) returning id into v_sale_id;
    v_created_sales := v_created_sales + 1;

    for v_line in
      select row_number, row_payload
      from app_private.import_run_rows r
      where r.import_run_id = v_run.id
        and (r.row_payload ->> 'sourceGroupIndex')::integer = v_group.group_index
      order by (r.row_payload ->> 'lineNumber')::integer
    loop
      v_resolution := v_mapping -> 'product' ->
        coalesce(nullif(v_line.row_payload ->> 'productCode', ''),
          v_line.row_payload ->> 'productName');
      v_product_id := case when v_resolution ->> 'kind' = 'TARGET'
        then (v_resolution ->> 'targetId')::uuid else null end;
      insert into api.legacy_sale_lines(
        legacy_sale_id, source_row_number, line_number, product_label,
        product_code, product_id, quantity, unit_price,
        unit_price_provenance, line_discount, line_total,
        line_total_provenance, warning_codes
      ) values (
        v_sale_id, (v_line.row_payload ->> 'sourceRowNumber')::integer,
        (v_line.row_payload ->> 'lineNumber')::integer,
        v_line.row_payload ->> 'productName',
        coalesce(v_line.row_payload ->> 'productCode', ''), v_product_id,
        nullif(v_line.row_payload ->> 'quantity', '')::numeric,
        nullif(v_line.row_payload ->> 'unitPrice', '')::numeric,
        nullif(v_line.row_payload ->> 'unitPriceProvenance', ''),
        nullif(v_line.row_payload ->> 'lineDiscount', '')::numeric,
        nullif(v_line.row_payload ->> 'lineTotal', '')::numeric,
        nullif(v_line.row_payload ->> 'lineTotalProvenance', ''),
        array(select jsonb_array_elements_text(v_line.row_payload -> 'warningCodes'))
      );
      v_created_lines := v_created_lines + 1;
    end loop;
  end loop;

  for v_suggestion in
    select value
    from app_private.import_run_rows r
    cross join lateral jsonb_array_elements(
      coalesce(r.row_payload -> 'openingSuggestions', '[]'::jsonb)
    ) item(value)
    where r.import_run_id = v_run.id
  loop
    v_resolution := v_mapping -> 'product' ->
      (v_suggestion ->> 'productCode');
    v_product_id := case when v_resolution ->> 'kind' = 'TARGET'
      then (v_resolution ->> 'targetId')::uuid else null end;
    insert into app_private.legacy_opening_balance_suggestions(
      source_import_run_id, source_row_number, product_code, product_id,
      suggested_unit_cost, suggested_opening_quantity, posting_allowed,
      warning_codes
    ) values (
      v_run.id, (v_suggestion ->> 'sourceRowNumber')::integer,
      v_suggestion ->> 'productCode', v_product_id,
      nullif(v_suggestion ->> 'unitCost', '')::numeric,
      nullif(v_suggestion ->> 'openingQuantity', '')::numeric,
      false, array['LEGACY_OPENING_DEFERRED']
    ) on conflict (source_import_run_id, source_row_number, product_code)
      do nothing;
    v_suggestions := v_suggestions + 1;
  end loop;

  v_result := jsonb_build_object(
    'importRunId', v_run.id, 'adapterId', v_run.adapter_id,
    'archiveSales', v_created_sales, 'archiveLines', v_created_lines,
    'openingSuggestions', v_suggestions, 'isOperational', false
  );
  update api.import_runs
  set status = 'COMMITTED', committed_at = now(), result = v_result
  where id = v_run.id;
  insert into app_private.audit_events(
    actor_id, action, entity_type, entity_id, after_data, correlation_id
  ) values (
    v_actor_id, 'legacy.import.committed', 'import_run', v_run.id,
    jsonb_build_object(
      'adapterId', v_run.adapter_id, 'fileSha256', v_run.file_sha256,
      'mappingVersion', 1, 'archiveSales', v_created_sales,
      'archiveLines', v_created_lines, 'openingSuggestions', v_suggestions
    ), v_run.correlation_id
  );
  insert into api.user_notifications(
    user_id, severity, category, title, message, action_route,
    entity_type, entity_id, dedupe_key, metadata, correlation_id
  ) values (
    v_actor_id, 'SUCCESS', 'Dữ liệu cũ', 'Đã lưu dữ liệu cũ để tra cứu',
    format('Đã lưu %s hóa đơn cũ. Dữ liệu không tham gia sổ vận hành.',
      v_created_sales),
    '/legacy-sales?importRunId=' || v_run.id::text, 'import_run', v_run.id,
    'legacy.import.committed:' || v_run.id::text,
    jsonb_build_object('archiveSales', v_created_sales, 'isOperational', false),
    v_run.correlation_id
  );
  v_result := app_private.command_success(v_result, v_run.correlation_id);
  insert into app_private.command_deduplication(
    actor_id, command_name, idempotency_key, response
  ) values (
    v_actor_id, 'legacy.import.commit', p_idempotency_key, v_result
  );
  return v_result;
exception when unique_violation then
  return app_private.command_error(
    'LEGACY_ARCHIVE_ALREADY_COMMITTED',
    'Dữ liệu từ tệp này đã được lưu trước đó.', v_correlation_id
  );
when others then
  return app_private.command_error(
    'IMPORT_COMMIT_FAILED',
    'Không thể lưu dữ liệu cũ. Không có hóa đơn nào được lưu.',
    v_correlation_id
  );
end;
$$;

create function api.commit_legacy_sales_import(
  p_import_run_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.commit_legacy_sales_import_impl(
    p_import_run_id, p_idempotency_key
  );
$$;

create or replace function api.commit_import(
  p_import_run_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1 from api.import_runs r
    where r.id = p_import_run_id and r.target_type = 'LEGACY_SALES_ARCHIVE'
  ) then
    return jsonb_build_object(
      'ok', false, 'data', null,
      'error', jsonb_build_object(
        'code', 'INVALID_STATE',
        'message', 'Dữ liệu cũ phải dùng lệnh lưu kho tra cứu riêng.',
        'details', '{}'::jsonb
      ),
      'correlationId', gen_random_uuid()
    );
  end if;
  return app_private.commit_import_impl(p_import_run_id, p_idempotency_key);
end;
$$;

create function app_private.get_legacy_sales_impl(
  p_filters jsonb,
  p_cursor_sold_on date,
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
  v_correlation_id uuid := gen_random_uuid();
  v_items jsonb;
  v_next_date date;
  v_next_id uuid;
begin
  if not app_private.has_permission('legacy.sale.read') then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Bạn không có quyền tra cứu dữ liệu cũ.',
      v_correlation_id
    );
  end if;
  p_filters := coalesce(p_filters, '{}'::jsonb);
  if jsonb_typeof(p_filters) <> 'object'
    or p_filters - array['search', 'from', 'to', 'channelId', 'quality',
      'importRunId'] <> '{}'::jsonb
    or p_limit is null or p_limit < 1 or p_limit > 100
    or ((p_cursor_sold_on is null) <> (p_cursor_id is null))
    or coalesce(p_filters ->> 'quality', '') not in ('', 'VALID', 'WARNING')
    or (nullif(p_filters ->> 'from', '') is not null
      and p_filters ->> 'from' !~ '^\d{4}-\d{2}-\d{2}$')
    or (nullif(p_filters ->> 'to', '') is not null
      and p_filters ->> 'to' !~ '^\d{4}-\d{2}-\d{2}$')
  then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Bộ lọc dữ liệu cũ chưa hợp lệ.',
      v_correlation_id
    );
  end if;
  with page as (
    select s.* from api.legacy_sales s
    where (
      nullif(btrim(coalesce(p_filters ->> 'search', '')), '') is null
      or s.source_sale_number ilike '%' || btrim(p_filters ->> 'search') || '%'
      or s.customer_label ilike '%' || btrim(p_filters ->> 'search') || '%'
    )
      and (nullif(p_filters ->> 'from', '') is null
        or s.sold_on >= (p_filters ->> 'from')::date)
      and (nullif(p_filters ->> 'to', '') is null
        or s.sold_on <= (p_filters ->> 'to')::date)
      and (nullif(p_filters ->> 'channelId', '') is null
        or s.sales_channel_id = (p_filters ->> 'channelId')::uuid)
      and (nullif(p_filters ->> 'quality', '') is null
        or s.data_quality_status = p_filters ->> 'quality')
      and (nullif(p_filters ->> 'importRunId', '') is null
        or s.source_import_run_id = (p_filters ->> 'importRunId')::uuid)
      and (p_cursor_sold_on is null or
        (coalesce(s.sold_on, date '0001-01-01'), s.id)
          < (p_cursor_sold_on, p_cursor_id))
    order by coalesce(s.sold_on, date '0001-01-01') desc, s.id desc
    limit p_limit + 1
  ), numbered as (
    select page.*,
      row_number() over (
        order by coalesce(sold_on, date '0001-01-01') desc, id desc
      ) ordinal
    from page
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'sourceSaleNumber', source_sale_number,
      'soldOn', sold_on, 'customerLabel', customer_label,
      'channelLabel', channel_label, 'reportedNetTotal', reported_net_total,
      'qualityStatus', data_quality_status, 'warningCount', cardinality(warning_codes),
      'isOperational', false, 'sourceImportRunId', source_import_run_id
    ) order by coalesce(sold_on, date '0001-01-01') desc, id desc)
      filter (where ordinal <= p_limit), '[]'::jsonb),
    (array_agg(coalesce(sold_on, date '0001-01-01')
      order by coalesce(sold_on, date '0001-01-01') desc, id desc)
      filter (where ordinal = p_limit))[1],
    (array_agg(id order by coalesce(sold_on, date '0001-01-01') desc, id desc)
      filter (where ordinal = p_limit))[1]
  into v_items, v_next_date, v_next_id
  from numbered;
  if jsonb_array_length(v_items) < p_limit or not exists (
    select 1 from api.legacy_sales s
    where v_next_id is not null
      and (coalesce(s.sold_on, date '0001-01-01'), s.id)
        < (v_next_date, v_next_id)
  ) then
    v_next_date := null;
    v_next_id := null;
  end if;
  return app_private.command_success(
    jsonb_build_object(
      'items', v_items,
      'nextCursor', case when v_next_id is null then null else
        jsonb_build_object('soldOn', v_next_date, 'id', v_next_id) end
    ),
    v_correlation_id
  );
end;
$$;

create function api.get_legacy_sales(
  p_filters jsonb default '{}'::jsonb,
  p_cursor_sold_on date default null,
  p_cursor_id uuid default null,
  p_limit integer default 30
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.get_legacy_sales_impl(
    p_filters, p_cursor_sold_on, p_cursor_id, p_limit
  );
$$;

create function app_private.get_legacy_sale_impl(p_legacy_sale_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_correlation_id uuid := gen_random_uuid();
  v_sale api.legacy_sales%rowtype;
  v_lines jsonb;
begin
  if not app_private.has_permission('legacy.sale.read') then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Bạn không có quyền tra cứu dữ liệu cũ.',
      v_correlation_id
    );
  end if;
  select * into v_sale from api.legacy_sales where id = p_legacy_sale_id;
  if not found then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND', 'Không tìm thấy hóa đơn dữ liệu cũ.',
      v_correlation_id
    );
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'sourceRowNumber', l.source_row_number,
    'lineNumber', l.line_number, 'productLabel', l.product_label,
    'productCode', l.product_code, 'productId', l.product_id,
    'quantity', l.quantity, 'unitPrice', l.unit_price,
    'unitPriceProvenance', l.unit_price_provenance,
    'lineDiscount', l.line_discount, 'lineTotal', l.line_total,
    'lineTotalProvenance', l.line_total_provenance,
    'warningCodes', l.warning_codes
  ) order by l.line_number), '[]'::jsonb)
  into v_lines from api.legacy_sale_lines l
  where l.legacy_sale_id = v_sale.id;
  return app_private.command_success(
    jsonb_build_object(
      'id', v_sale.id, 'sourceSaleNumber', v_sale.source_sale_number,
      'sourceRowStart', v_sale.source_row_start, 'soldOn', v_sale.sold_on,
      'staffLabel', v_sale.staff_label, 'channelLabel', v_sale.channel_label,
      'customerLabel', v_sale.customer_label,
      'customerPhone', v_sale.customer_phone,
      'paymentLabel', v_sale.payment_label,
      'paymentMethod', v_sale.payment_method,
      'sourceStatusLabel', v_sale.source_status_label,
      'sourceNote', v_sale.source_note, 'profileId', v_sale.profile_id,
      'customerId', v_sale.customer_id,
      'salesChannelId', v_sale.sales_channel_id,
      'reportedSubtotal', v_sale.reported_subtotal,
      'reportedDiscountTotal', v_sale.reported_discount_total,
      'reportedNetTotal', v_sale.reported_net_total,
      'qualityStatus', v_sale.data_quality_status,
      'warningCodes', v_sale.warning_codes, 'adapterId', v_sale.adapter_id,
      'sourceFileSha256', v_sale.source_file_sha256,
      'sourceImportRunId', v_sale.source_import_run_id,
      'mappingVersion', v_sale.mapping_version, 'lines', v_lines,
      'isOperational', false
    ),
    v_sale.correlation_id
  );
end;
$$;

create function api.get_legacy_sale(p_legacy_sale_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select app_private.get_legacy_sale_impl(p_legacy_sale_id); $$;

revoke execute on function app_private.set_import_adapter() from public, anon, authenticated;
revoke execute on function app_private.save_legacy_import_mapping_impl(uuid,jsonb) from public, anon;
revoke execute on function app_private.validate_legacy_sales_import_impl(uuid) from public, anon;
revoke execute on function app_private.commit_legacy_sales_import_impl(uuid,uuid) from public, anon;
revoke execute on function app_private.get_legacy_sales_impl(jsonb,date,uuid,integer) from public, anon;
revoke execute on function app_private.get_legacy_sale_impl(uuid) from public, anon;
grant execute on function app_private.save_legacy_import_mapping_impl(uuid,jsonb) to authenticated;
grant execute on function app_private.validate_legacy_sales_import_impl(uuid) to authenticated;
grant execute on function app_private.commit_legacy_sales_import_impl(uuid,uuid) to authenticated;
grant execute on function app_private.get_legacy_sales_impl(jsonb,date,uuid,integer) to authenticated;
grant execute on function app_private.get_legacy_sale_impl(uuid) to authenticated;

revoke execute on function api.save_legacy_import_mapping(uuid,jsonb) from public, anon;
revoke execute on function api.validate_legacy_sales_import(uuid) from public, anon;
revoke execute on function api.commit_legacy_sales_import(uuid,uuid) from public, anon;
revoke execute on function api.get_legacy_sales(jsonb,date,uuid,integer) from public, anon;
revoke execute on function api.get_legacy_sale(uuid) from public, anon;
grant execute on function api.save_legacy_import_mapping(uuid,jsonb) to authenticated;
grant execute on function api.validate_legacy_sales_import(uuid) to authenticated;
grant execute on function api.commit_legacy_sales_import(uuid,uuid) to authenticated;
grant execute on function api.get_legacy_sales(jsonb,date,uuid,integer) to authenticated;
grant execute on function api.get_legacy_sale(uuid) to authenticated;
