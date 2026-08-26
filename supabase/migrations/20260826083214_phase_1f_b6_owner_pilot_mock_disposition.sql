create table app_private.owner_pilot_mock_disposition_receipts (
  id uuid primary key default extensions.gen_random_uuid(),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  keep_store_settings boolean not null,
  keep_sales_channels boolean not null,
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object'),
  storage_paths jsonb not null check (jsonb_typeof(storage_paths) = 'array'),
  storage_finalized_at timestamptz null,
  correlation_id uuid not null default extensions.gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table app_private.owner_pilot_mock_disposition_receipts enable row level security;
alter table app_private.owner_pilot_mock_disposition_receipts force row level security;
revoke all on table app_private.owner_pilot_mock_disposition_receipts from public, anon, authenticated;

create function app_private.owner_pilot_mock_table_fingerprint(p_relation regclass)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  execute format(
    'select jsonb_build_object(''count'', count(*), ''sha256'', encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(item) order by item.ctid)::text, ''[]''), ''sha256''), ''hex'')) from %s item',
    p_relation
  ) into v_result;
  return v_result;
end;
$$;

create function app_private.owner_pilot_mock_storage_paths(
  p_keep_store_settings boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_paths jsonb;
begin
  if exists (
    select 1
    from storage.buckets
    where id not in ('product-images', 'payment-proofs', 'store-branding')
  ) then
    raise exception 'MOCK_STORAGE_BUCKET_UNEXPECTED';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('bucketId', bucket_id, 'path', name)
      order by bucket_id, name
    ),
    '[]'::jsonb
  ) into v_paths
  from storage.objects
  where bucket_id in ('product-images', 'payment-proofs')
    or (bucket_id = 'store-branding' and not p_keep_store_settings);

  return v_paths;
end;
$$;

create function app_private.owner_pilot_mock_manifest_payload(
  p_keep_store_settings boolean,
  p_keep_sales_channels boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_records jsonb;
  v_fingerprints jsonb;
  v_storage_paths jsonb;
begin
  v_storage_paths := app_private.owner_pilot_mock_storage_paths(p_keep_store_settings);

  select jsonb_build_object(
    'categories', coalesce((select jsonb_agg(id::text order by id) from api.categories), '[]'::jsonb),
    'customers', coalesce((select jsonb_agg(id::text order by id) from api.customers), '[]'::jsonb),
    'imports', coalesce((select jsonb_agg(id::text order by id) from api.import_runs), '[]'::jsonb),
    'legacySales', coalesce((select jsonb_agg(id::text order by id) from api.legacy_sales), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(id::text order by id) from api.products), '[]'::jsonb),
    'purchaseReceipts', coalesce((select jsonb_agg(id::text order by id) from api.purchase_receipts), '[]'::jsonb),
    'sales', coalesce((select jsonb_agg(id::text order by id) from api.sales), '[]'::jsonb),
    'saleReturns', coalesce((select jsonb_agg(id::text order by id) from api.sale_returns), '[]'::jsonb),
    'stockCounts', coalesce((select jsonb_agg(id::text order by id) from api.stock_counts), '[]'::jsonb),
    'suppliers', coalesce((select jsonb_agg(id::text order by id) from api.suppliers), '[]'::jsonb),
    'userNotifications', coalesce((select jsonb_agg(id::text order by id) from api.user_notifications), '[]'::jsonb),
    'salesChannels', case when p_keep_sales_channels then '[]'::jsonb else coalesce((select jsonb_agg(id::text order by id) from api.sales_channels), '[]'::jsonb) end,
    'storeSettings', case when p_keep_store_settings then '[]'::jsonb else coalesce((select jsonb_agg(id::text order by id) from api.store_settings), '[]'::jsonb) end
  ) into v_records;

  select jsonb_object_agg(name, fingerprint order by name)
  into v_fingerprints
  from (
    select name, app_private.owner_pilot_mock_table_fingerprint(relation) as fingerprint
    from (values
      ('api.categories', 'api.categories'::regclass),
      ('api.customers', 'api.customers'::regclass),
      ('api.import_runs', 'api.import_runs'::regclass),
      ('api.inventory_balances', 'api.inventory_balances'::regclass),
      ('api.legacy_sale_lines', 'api.legacy_sale_lines'::regclass),
      ('api.legacy_sales', 'api.legacy_sales'::regclass),
      ('api.payments', 'api.payments'::regclass),
      ('api.product_images', 'api.product_images'::regclass),
      ('api.products', 'api.products'::regclass),
      ('api.purchase_receipt_lines', 'api.purchase_receipt_lines'::regclass),
      ('api.purchase_receipts', 'api.purchase_receipts'::regclass),
      ('api.sale_lines', 'api.sale_lines'::regclass),
      ('api.sale_return_lines', 'api.sale_return_lines'::regclass),
      ('api.sale_return_payments', 'api.sale_return_payments'::regclass),
      ('api.sale_returns', 'api.sale_returns'::regclass),
      ('api.sales', 'api.sales'::regclass),
      ('api.stock_count_lines', 'api.stock_count_lines'::regclass),
      ('api.stock_counts', 'api.stock_counts'::regclass),
      ('api.stock_movements', 'api.stock_movements'::regclass),
      ('api.suppliers', 'api.suppliers'::regclass),
      ('api.user_notifications', 'api.user_notifications'::regclass),
      ('app_private.command_deduplication', 'app_private.command_deduplication'::regclass),
      ('app_private.document_sequences', 'app_private.document_sequences'::regclass),
      ('app_private.inventory_cost_balances', 'app_private.inventory_cost_balances'::regclass),
      ('app_private.inventory_cost_movements', 'app_private.inventory_cost_movements'::regclass),
      ('app_private.legacy_opening_balance_suggestions', 'app_private.legacy_opening_balance_suggestions'::regclass),
      ('app_private.product_sale_prices', 'app_private.product_sale_prices'::regclass),
      ('app_private.purchase_receipt_line_costs', 'app_private.purchase_receipt_line_costs'::regclass),
      ('app_private.sale_invoice_store_snapshots', 'app_private.sale_invoice_store_snapshots'::regclass),
      ('app_private.sale_line_costs', 'app_private.sale_line_costs'::regclass),
      ('app_private.sale_return_line_costs', 'app_private.sale_return_line_costs'::regclass),
      ('app_private.sales_financial_events', 'app_private.sales_financial_events'::regclass),
      ('app_private.stock_count_adjustment_costs', 'app_private.stock_count_adjustment_costs'::regclass),
      ('app_private.stock_count_line_costs', 'app_private.stock_count_line_costs'::regclass)
    ) as targets(name, relation)

    union all

    select 'api.sales_channels', app_private.owner_pilot_mock_table_fingerprint('api.sales_channels'::regclass)
    where not p_keep_sales_channels

    union all

    select 'api.store_settings', app_private.owner_pilot_mock_table_fingerprint('api.store_settings'::regclass)
    where not p_keep_store_settings
  ) fingerprints;

  return jsonb_build_object(
    'version', 1,
    'lifecycle', 'OWNER_PILOT',
    'keepStoreSettings', p_keep_store_settings,
    'keepSalesChannels', p_keep_sales_channels,
    'records', v_records,
    'fingerprints', v_fingerprints,
    'storagePaths', v_storage_paths
  );
end;
$$;

create function app_private.owner_pilot_mock_manifest_sha256(p_manifest jsonb)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select encode(extensions.digest(p_manifest::text, 'sha256'), 'hex');
$$;

create function app_private.get_owner_pilot_mock_manifest_impl(
  p_keep_store_settings boolean,
  p_keep_sales_channels boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lifecycle app_private.project_lifecycle%rowtype;
  v_manifest jsonb;
  v_correlation uuid := extensions.gen_random_uuid();
begin
  if auth.role() <> 'service_role' then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Chỉ script cutover được xác nhận mới có thể tạo manifest dữ liệu mock.',
      v_correlation
    );
  end if;

  if p_keep_store_settings is null or p_keep_sales_channels is null then
    return app_private.command_error(
      'VALIDATION_ERROR',
      'Cần xác định rõ giữ hay thay cấu hình cửa hàng và kênh bán.',
      v_correlation
    );
  end if;

  select * into v_lifecycle
  from app_private.project_lifecycle
  where id = true;

  if v_lifecycle.mode <> 'OWNER_PILOT'
    or v_lifecycle.staff_access_policy not in ('OWNER_WAIVER', 'LEAKED_PASSWORD_PROTECTED') then
    return app_private.command_error(
      'INVALID_STATE',
      'Chỉ có thể tạo manifest khi Owner Pilot đang được bảo vệ bằng policy nhân viên đã audit.',
      v_correlation
    );
  end if;

  if exists (select 1 from app_private.owner_pilot_mock_disposition_receipts) then
    return app_private.command_error(
      'MOCK_DISPOSITION_ALREADY_RECORDED',
      'Cloud đã có receipt hủy mock; không thể tạo thêm manifest reset.',
      v_correlation
    );
  end if;

  v_manifest := app_private.owner_pilot_mock_manifest_payload(
    p_keep_store_settings,
    p_keep_sales_channels
  );

  return app_private.command_success(
    jsonb_build_object(
      'manifest', v_manifest,
      'sha256', app_private.owner_pilot_mock_manifest_sha256(v_manifest)
    ),
    v_correlation
  );
end;
$$;

create function app_private.dispose_owner_pilot_mock_data_impl(
  p_manifest_sha256 text,
  p_keep_store_settings boolean,
  p_keep_sales_channels boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lifecycle app_private.project_lifecycle%rowtype;
  v_manifest jsonb;
  v_actual_sha256 text;
  v_receipt_id uuid := extensions.gen_random_uuid();
  v_correlation uuid := extensions.gen_random_uuid();
begin
  if auth.role() <> 'service_role' then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Chỉ script cutover được xác nhận mới có thể hủy dữ liệu mock.',
      v_correlation
    );
  end if;

  if p_manifest_sha256 !~ '^[0-9a-f]{64}$'
    or p_keep_store_settings is null
    or p_keep_sales_channels is null then
    return app_private.command_error(
      'VALIDATION_ERROR',
      'Manifest SHA-256 và lựa chọn cấu hình/kênh bán phải hợp lệ.',
      v_correlation
    );
  end if;

  lock table
    api.categories, api.customers, api.import_runs, api.inventory_balances,
    api.legacy_sale_lines, api.legacy_sales, api.payments, api.product_images,
    api.products, api.purchase_receipt_lines, api.purchase_receipts,
    api.sale_lines, api.sale_return_lines, api.sale_return_payments,
    api.sale_returns, api.sales, api.sales_channels, api.stock_count_lines,
    api.stock_counts, api.stock_movements, api.store_settings, api.suppliers,
    api.user_notifications, app_private.command_deduplication,
    app_private.document_sequences, app_private.inventory_cost_balances,
    app_private.inventory_cost_movements,
    app_private.legacy_opening_balance_suggestions,
    app_private.product_sale_prices, app_private.purchase_receipt_line_costs,
    app_private.sale_invoice_store_snapshots, app_private.sale_line_costs,
    app_private.sale_return_line_costs, app_private.sales_financial_events,
    app_private.stock_count_adjustment_costs, app_private.stock_count_line_costs,
    app_private.owner_pilot_mock_disposition_receipts, storage.objects
  in share row exclusive mode;

  select * into v_lifecycle
  from app_private.project_lifecycle
  where id = true
  for update;

  if v_lifecycle.mode <> 'OWNER_PILOT'
    or v_lifecycle.staff_access_policy not in ('OWNER_WAIVER', 'LEAKED_PASSWORD_PROTECTED') then
    return app_private.command_error(
      'INVALID_STATE',
      'Chỉ có thể hủy dữ liệu mock trong Owner Pilot có policy nhân viên đã audit.',
      v_correlation
    );
  end if;

  if exists (select 1 from app_private.owner_pilot_mock_disposition_receipts) then
    return app_private.command_error(
      'MOCK_DISPOSITION_ALREADY_RECORDED',
      'Cloud đã có receipt hủy mock; lệnh không được chạy lại.',
      v_correlation
    );
  end if;

  v_manifest := app_private.owner_pilot_mock_manifest_payload(
    p_keep_store_settings,
    p_keep_sales_channels
  );
  v_actual_sha256 := app_private.owner_pilot_mock_manifest_sha256(v_manifest);

  if v_actual_sha256 <> p_manifest_sha256 then
    return app_private.command_error_with_details(
      'MOCK_MANIFEST_MISMATCH',
      'Dữ liệu mock đã thay đổi sau khi tạo manifest; cần tạo và duyệt lại manifest mới.',
      jsonb_build_object('actualSha256', v_actual_sha256),
      v_correlation
    );
  end if;

  insert into app_private.owner_pilot_mock_disposition_receipts(
    id, manifest_sha256, keep_store_settings, keep_sales_channels,
    manifest, storage_paths, correlation_id
  ) values (
    v_receipt_id, v_actual_sha256, p_keep_store_settings, p_keep_sales_channels,
    v_manifest, v_manifest -> 'storagePaths', v_correlation
  );

  delete from app_private.stock_count_adjustment_costs;
  delete from app_private.stock_count_line_costs;
  delete from app_private.sale_return_line_costs;
  delete from app_private.sale_line_costs;
  delete from app_private.purchase_receipt_line_costs;
  delete from app_private.inventory_cost_movements;
  delete from app_private.sales_financial_events;
  delete from app_private.sale_invoice_store_snapshots;
  delete from api.sale_return_payments;
  delete from api.sale_return_lines;
  delete from api.sale_returns;
  delete from api.payments;
  delete from api.sale_lines;
  delete from api.sales;
  delete from app_private.inventory_cost_balances;
  delete from api.inventory_balances;
  delete from api.stock_movements;
  delete from api.purchase_receipt_lines;
  delete from api.purchase_receipts;
  delete from api.stock_count_lines;
  delete from api.stock_counts;
  delete from app_private.legacy_opening_balance_suggestions;
  delete from api.legacy_sale_lines;
  delete from api.legacy_sales;
  delete from app_private.product_sale_prices;
  delete from api.product_images;
  delete from api.products;
  delete from api.categories;
  delete from api.customers;
  delete from api.suppliers;
  delete from api.import_runs;
  delete from api.user_notifications;
  delete from app_private.command_deduplication;
  delete from app_private.document_sequences;

  if not p_keep_sales_channels then
    delete from api.sales_channels;
  end if;
  if not p_keep_store_settings then
    delete from api.store_settings;
  end if;

  insert into app_private.audit_events(
    actor_id, action, entity_type, entity_id, before_data, after_data, metadata, correlation_id
  ) values (
    null,
    'owner_pilot.mock_disposed',
    'owner_pilot_mock_disposition_receipt',
    v_receipt_id,
    jsonb_build_object('manifestSha256', v_actual_sha256, 'records', v_manifest -> 'records'),
    jsonb_build_object('storageFinalized', false),
    jsonb_build_object(
      'actor', 'cutover_service',
      'keepStoreSettings', p_keep_store_settings,
      'keepSalesChannels', p_keep_sales_channels
    ),
    v_correlation
  );

  return app_private.command_success(
    jsonb_build_object(
      'receiptId', v_receipt_id,
      'storagePaths', v_manifest -> 'storagePaths',
      'manifestSha256', v_actual_sha256
    ),
    v_correlation
  );
end;
$$;

create function app_private.finalize_owner_pilot_mock_storage_disposal_impl(
  p_receipt_id uuid,
  p_deleted_paths jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt app_private.owner_pilot_mock_disposition_receipts%rowtype;
  v_normalized_paths jsonb;
  v_correlation uuid := extensions.gen_random_uuid();
begin
  if auth.role() <> 'service_role' then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Chỉ script cutover được xác nhận mới có thể hoàn tất receipt Storage.',
      v_correlation
    );
  end if;

  if p_receipt_id is null or jsonb_typeof(p_deleted_paths) <> 'array' then
    return app_private.command_error(
      'VALIDATION_ERROR',
      'Receipt và danh sách object Storage phải hợp lệ.',
      v_correlation
    );
  end if;

  select * into v_receipt
  from app_private.owner_pilot_mock_disposition_receipts
  where id = p_receipt_id
  for update;

  if not found then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND',
      'Không tìm thấy receipt hủy dữ liệu mock.',
      v_correlation
    );
  end if;

  if v_receipt.storage_finalized_at is not null then
    return app_private.command_error(
      'MOCK_STORAGE_DISPOSAL_ALREADY_FINALIZED',
      'Receipt Storage đã được hoàn tất; không thể chạy lại.',
      v_correlation
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('bucketId', entry ->> 'bucketId', 'path', entry ->> 'path')
      order by entry ->> 'bucketId', entry ->> 'path'
    ),
    '[]'::jsonb
  ) into v_normalized_paths
  from jsonb_array_elements(p_deleted_paths) entry
  where jsonb_typeof(entry) = 'object'
    and entry ? 'bucketId'
    and entry ? 'path'
    and entry ->> 'bucketId' in ('product-images', 'payment-proofs', 'store-branding')
    and length(btrim(entry ->> 'path')) > 0;

  if jsonb_array_length(v_normalized_paths) <> jsonb_array_length(p_deleted_paths)
    or v_normalized_paths <> v_receipt.storage_paths then
    return app_private.command_error(
      'MOCK_STORAGE_DISPOSAL_MISMATCH',
      'Danh sách object Storage hoàn tất không khớp receipt được duyệt.',
      v_correlation
    );
  end if;

  update app_private.owner_pilot_mock_disposition_receipts
  set storage_finalized_at = now()
  where id = p_receipt_id;

  insert into app_private.audit_events(
    actor_id, action, entity_type, entity_id, after_data, metadata, correlation_id
  ) values (
    null,
    'owner_pilot.mock_storage_disposed',
    'owner_pilot_mock_disposition_receipt',
    p_receipt_id,
    jsonb_build_object('storageFinalized', true, 'storageObjectCount', jsonb_array_length(v_normalized_paths)),
    jsonb_build_object('actor', 'cutover_service'),
    v_correlation
  );

  return app_private.command_success(
    jsonb_build_object('receiptId', p_receipt_id, 'storageFinalizedAt', now()),
    v_correlation
  );
end;
$$;

create function api.get_owner_pilot_mock_manifest(
  p_keep_store_settings boolean,
  p_keep_sales_channels boolean
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.get_owner_pilot_mock_manifest_impl(
    p_keep_store_settings,
    p_keep_sales_channels
  );
$$;

create function api.dispose_owner_pilot_mock_data(
  p_manifest_sha256 text,
  p_keep_store_settings boolean,
  p_keep_sales_channels boolean
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.dispose_owner_pilot_mock_data_impl(
    p_manifest_sha256,
    p_keep_store_settings,
    p_keep_sales_channels
  );
$$;

create function api.finalize_owner_pilot_mock_storage_disposal(
  p_receipt_id uuid,
  p_deleted_paths jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.finalize_owner_pilot_mock_storage_disposal_impl(
    p_receipt_id,
    p_deleted_paths
  );
$$;

revoke all on function
  app_private.owner_pilot_mock_table_fingerprint(regclass),
  app_private.owner_pilot_mock_storage_paths(boolean),
  app_private.owner_pilot_mock_manifest_payload(boolean,boolean),
  app_private.owner_pilot_mock_manifest_sha256(jsonb),
  app_private.get_owner_pilot_mock_manifest_impl(boolean,boolean),
  app_private.dispose_owner_pilot_mock_data_impl(text,boolean,boolean),
  app_private.finalize_owner_pilot_mock_storage_disposal_impl(uuid,jsonb),
  api.get_owner_pilot_mock_manifest(boolean,boolean),
  api.dispose_owner_pilot_mock_data(text,boolean,boolean),
  api.finalize_owner_pilot_mock_storage_disposal(uuid,jsonb)
from public, anon, authenticated;

grant execute on function
  app_private.owner_pilot_mock_table_fingerprint(regclass),
  app_private.owner_pilot_mock_storage_paths(boolean),
  app_private.owner_pilot_mock_manifest_payload(boolean,boolean),
  app_private.owner_pilot_mock_manifest_sha256(jsonb),
  app_private.get_owner_pilot_mock_manifest_impl(boolean,boolean),
  app_private.dispose_owner_pilot_mock_data_impl(text,boolean,boolean),
  app_private.finalize_owner_pilot_mock_storage_disposal_impl(uuid,jsonb),
  api.get_owner_pilot_mock_manifest(boolean,boolean),
  api.dispose_owner_pilot_mock_data(text,boolean,boolean),
  api.finalize_owner_pilot_mock_storage_disposal(uuid,jsonb)
to service_role;
