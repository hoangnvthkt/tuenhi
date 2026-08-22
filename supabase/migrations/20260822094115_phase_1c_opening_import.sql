alter table api.import_runs
drop constraint import_runs_target_type_check;

alter table api.import_runs
add constraint import_runs_target_type_check check (
  target_type in (
    'CATEGORIES', 'PRODUCTS', 'SUPPLIERS', 'CUSTOMERS',
    'LEGACY_SALES_ARCHIVE', 'OPENING_BALANCES'
  )
);

alter table api.import_runs
drop constraint import_runs_legacy_mode_check;

alter table api.import_runs
add constraint import_runs_special_mode_check check (
  target_type not in ('LEGACY_SALES_ARCHIVE', 'OPENING_BALANCES')
  or mode = 'CREATE_ONLY'
);

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
    when 'OPENING_BALANCES' then 'inventory.adjustment.post'
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
    when 'OPENING_BALANCES' then array[
      'sku', 'openingQuantity', 'openingUnitCost'
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
    when 'OPENING_BALANCES' then array[
      'sku', 'openingQuantity', 'openingUnitCost'
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
  if p_target_type in ('LEGACY_SALES_ARCHIVE', 'OPENING_BALANCES')
    and (p_template_version <> 1 or p_mode <> 'CREATE_ONLY')
  then
    return jsonb_build_object(
      'ok', false, 'data', null,
      'error', jsonb_build_object(
        'code', 'VALIDATION_FAILED',
        'message', case
          when p_target_type = 'OPENING_BALANCES'
            then 'Phiên nhập tồn đầu kỳ chưa hợp lệ.'
          else 'Phiên nhập dữ liệu cũ chưa hợp lệ.'
        end,
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

alter function app_private.validate_import_payload(api.import_runs, integer, jsonb)
rename to validate_catalog_import_payload;

create function app_private.validate_opening_import_payload(
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
  v_sku text := btrim(coalesce(p_payload ->> 'sku', ''));
  v_key text;
  v_quantity text := btrim(coalesce(p_payload ->> 'openingQuantity', ''));
  v_unit_cost text := btrim(coalesce(p_payload ->> 'openingUnitCost', ''));
  v_expires_at timestamptz := p_run.expires_at;
  v_product api.products%rowtype;
begin
  if jsonb_typeof(p_payload) <> 'object'
    or p_payload - app_private.import_allowed_fields('OPENING_BALANCES')
      <> '{}'::jsonb
  then
    perform app_private.add_import_error(
      p_run.id, p_row_number, null, 'VALIDATION_FAILED',
      'Dòng tồn đầu kỳ chứa trường không được hỗ trợ.', null, v_expires_at
    );
    return null;
  end if;
  if v_sku = '' then
    perform app_private.add_import_error(
      p_run.id, p_row_number, 'sku', 'VALUE_REQUIRED',
      'SKU không được để trống.', p_payload -> 'sku', v_expires_at
    );
  elsif length(v_sku) > 64 then
    perform app_private.add_import_error(
      p_run.id, p_row_number, 'sku', 'VALUE_TOO_LONG',
      'SKU không được vượt quá 64 ký tự.', p_payload -> 'sku', v_expires_at
    );
  end if;
  if v_quantity = '' then
    perform app_private.add_import_error(
      p_run.id, p_row_number, 'openingQuantity', 'VALUE_REQUIRED',
      'Số lượng tồn đầu kỳ không được để trống.',
      p_payload -> 'openingQuantity', v_expires_at
    );
  elsif v_quantity !~ '^(0|[1-9][0-9]{0,14})(\.[0-9]{1,3})?$' then
    perform app_private.add_import_error(
      p_run.id, p_row_number, 'openingQuantity', 'NUMBER_FORMAT_INVALID',
      'Số lượng chỉ nhận chữ số, dấu chấm và tối đa 3 chữ số thập phân.',
      p_payload -> 'openingQuantity', v_expires_at
    );
  elsif v_quantity::numeric <= 0 then
    perform app_private.add_import_error(
      p_run.id, p_row_number, 'openingQuantity', 'NUMBER_MUST_BE_POSITIVE',
      'Số lượng tồn đầu kỳ phải lớn hơn 0.',
      p_payload -> 'openingQuantity', v_expires_at
    );
  end if;
  if v_unit_cost = '' then
    perform app_private.add_import_error(
      p_run.id, p_row_number, 'openingUnitCost', 'VALUE_REQUIRED',
      'Đơn giá vốn đầu kỳ không được để trống.',
      p_payload -> 'openingUnitCost', v_expires_at
    );
  elsif v_unit_cost !~ '^(0|[1-9][0-9]{0,17})(\.[0-9]{1,2})?$' then
    perform app_private.add_import_error(
      p_run.id, p_row_number, 'openingUnitCost', 'NUMBER_FORMAT_INVALID',
      'Đơn giá chỉ nhận chữ số, dấu chấm và tối đa 2 chữ số thập phân.',
      p_payload -> 'openingUnitCost', v_expires_at
    );
  end if;
  v_key := app_private.normalize_catalog_key(v_sku);
  select p.* into v_product
  from api.products p where p.sku_normalized = v_key;
  if not found then
    perform app_private.add_import_error(
      p_run.id, p_row_number, 'sku', 'REFERENCE_NOT_FOUND',
      'Không tìm thấy sản phẩm theo SKU.', p_payload -> 'sku', v_expires_at
    );
  elsif not v_product.is_active then
    perform app_private.add_import_error(
      p_run.id, p_row_number, 'sku', 'REFERENCE_INACTIVE',
      'Sản phẩm đã ngừng hoạt động.', p_payload -> 'sku', v_expires_at
    );
  elsif exists (
    select 1
    from api.inventory_balances quantity_balance
    join app_private.inventory_cost_balances cost_balance
      on cost_balance.product_id = quantity_balance.product_id
    where quantity_balance.product_id = v_product.id
      and (
        quantity_balance.on_hand_qty <> 0
        or cost_balance.inventory_value <> 0
        or exists (
          select 1 from api.stock_movements movement
          where movement.product_id = v_product.id
        )
      )
  ) then
    perform app_private.add_import_error(
      p_run.id, p_row_number, 'sku', 'OPENING_NOT_ALLOWED',
      'Sản phẩm đã phát sinh tồn kho nên không thể mở sổ.',
      p_payload -> 'sku', v_expires_at
    );
  end if;
  return nullif(v_key, '');
exception when invalid_text_representation or numeric_value_out_of_range then
  perform app_private.add_import_error(
    p_run.id, p_row_number, null, 'NUMBER_FORMAT_INVALID',
    'Tồn hoặc giá vốn đầu kỳ chưa đúng định dạng.', null, v_expires_at
  );
  return nullif(v_key, '');
end;
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
begin
  if p_run.target_type = 'OPENING_BALANCES' then
    return app_private.validate_opening_import_payload(
      p_run, p_row_number, p_payload
    );
  end if;
  return app_private.validate_catalog_import_payload(
    p_run, p_row_number, p_payload
  );
end;
$$;

alter function app_private.finalize_import_validation(uuid)
rename to finalize_catalog_import_validation;

create function app_private.finalize_opening_import_validation(
  p_import_run_id uuid
)
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
  insert into app_private.import_run_errors(
    import_run_id, row_number, target_field, code, message, raw_value, expires_at
  )
  select r.import_run_id, r.row_number, 'sku', 'DUPLICATE_IN_FILE',
    'SKU bị trùng trong tệp.', to_jsonb(r.normalized_key), v_run.expires_at
  from app_private.import_run_rows r
  where r.import_run_id = v_run.id
    and r.normalized_key is not null
    and exists (
      select 1 from app_private.import_run_rows other
      where other.import_run_id = r.import_run_id
        and other.normalized_key = r.normalized_key
        and other.row_number <> r.row_number
    )
    and not exists (
      select 1 from app_private.import_run_errors existing
      where existing.import_run_id = r.import_run_id
        and existing.row_number = r.row_number
        and existing.code = 'DUPLICATE_IN_FILE'
    );
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
    select count(*)::integer total_rows,
      count(*) filter (where validation_status = 'VALID')::integer valid_rows,
      count(*) filter (where validation_status = 'INVALID')::integer invalid_rows
    from app_private.import_run_rows where import_run_id = v_run.id
  ) counts
  where run.id = v_run.id;
end;
$$;

create function app_private.finalize_import_validation(p_import_run_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from api.import_runs r
    where r.id = p_import_run_id and r.target_type = 'OPENING_BALANCES'
  ) then
    perform app_private.finalize_opening_import_validation(p_import_run_id);
  else
    perform app_private.finalize_catalog_import_validation(p_import_run_id);
  end if;
end;
$$;

create function app_private.commit_opening_balance_import_impl(
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
  v_save_result jsonb;
  v_result jsonb;
  v_lines jsonb;
  v_count_id uuid;
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
  if not found or v_run.target_type <> 'OPENING_BALANCES'
    or not app_private.has_permission('inventory.adjustment.post')
  then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Bạn không có quyền xác nhận tồn đầu kỳ.',
      v_correlation_id
    );
  end if;
  if v_run.status = 'COMMITTED' then
    return app_private.command_error(
      'IMPORT_ALREADY_COMMITTED', 'Phiên nhập đã được xác nhận trước đó.',
      v_run.correlation_id
    );
  end if;
  if v_run.mode <> 'CREATE_ONLY' or v_run.status <> 'VALIDATED'
    or v_run.total_rows < 1
  then
    return app_private.command_error(
      'INVALID_STATE', 'Phiên nhập tồn đầu kỳ chưa sẵn sàng để xác nhận.',
      v_correlation_id
    );
  end if;
  if v_run.invalid_rows > 0 then
    return app_private.command_error_with_details(
      'IMPORT_VALIDATION_FAILED',
      'Tệp còn dữ liệu chưa hợp lệ. Vui lòng kiểm tra danh sách lỗi.',
      jsonb_build_object('invalidRows', v_run.invalid_rows), v_correlation_id
    );
  end if;
  select jsonb_agg(jsonb_build_object(
    'productId', p.id,
    'countedQty', r.row_payload ->> 'openingQuantity',
    'openingUnitCost', r.row_payload ->> 'openingUnitCost',
    'sourceSuggestionId', null,
    'confirmedUnverified', false
  ) order by r.row_number)
  into v_lines
  from app_private.import_run_rows r
  join api.products p on p.sku_normalized = r.normalized_key
  where r.import_run_id = v_run.id
    and p.is_active
    and exists (
      select 1 from api.inventory_balances quantity_balance
      join app_private.inventory_cost_balances cost_balance
        on cost_balance.product_id = quantity_balance.product_id
      where quantity_balance.product_id = p.id
        and quantity_balance.on_hand_qty = 0
        and cost_balance.inventory_value = 0
        and not exists (
          select 1 from api.stock_movements movement
          where movement.product_id = p.id
        )
    );
  if v_lines is null or jsonb_array_length(v_lines) <> v_run.total_rows then
    return app_private.command_error(
      'IMPORT_VALIDATION_FAILED',
      'Dữ liệu tồn kho đã thay đổi từ lúc kiểm tra. Vui lòng kiểm tra lại tệp.',
      v_correlation_id
    );
  end if;
  v_save_result := app_private.save_opening_stock_draft_impl(
    null, null, 'Tạo từ mẫu Excel ' || v_run.file_name,
    v_lines, p_idempotency_key
  );
  if not coalesce((v_save_result ->> 'ok')::boolean, false) then
    return v_save_result;
  end if;
  v_count_id := (v_save_result #>> '{data,countId}')::uuid;
  v_result := jsonb_build_object(
    'importRunId', v_run.id,
    'targetType', v_run.target_type,
    'createdRows', v_run.total_rows,
    'updatedRows', 0,
    'totalRows', v_run.total_rows,
    'stockCountId', v_count_id
  );
  update api.import_runs
  set status = 'COMMITTED', committed_at = now(), result = v_result
  where id = v_run.id;
  insert into app_private.audit_events(
    actor_id, action, entity_type, entity_id, after_data, correlation_id
  ) values (
    v_actor_id, 'import.opening_draft_created', 'import_run', v_run.id,
    jsonb_build_object(
      'targetType', v_run.target_type, 'totalRows', v_run.total_rows,
      'stockCountId', v_count_id
    ), v_run.correlation_id
  );
  insert into api.user_notifications(
    user_id, severity, category, title, message, action_route,
    entity_type, entity_id, dedupe_key, metadata, correlation_id
  ) values (
    v_actor_id, 'SUCCESS', 'Nhập dữ liệu', 'Đã tạo phiếu mở sổ nháp',
    format('Đã đưa %s dòng vào phiếu mở sổ nháp.', v_run.total_rows),
    '/more/inventory/opening/' || v_count_id::text,
    'stock_count', v_count_id, 'import.opening:' || v_run.id::text,
    jsonb_build_object('importRunId', v_run.id, 'totalRows', v_run.total_rows),
    v_run.correlation_id
  );
  v_result := app_private.command_success(v_result, v_run.correlation_id);
  insert into app_private.command_deduplication(
    actor_id, command_name, idempotency_key, response
  ) values (v_actor_id, 'import.commit', p_idempotency_key, v_result);
  return v_result;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return app_private.command_error(
      'IMPORT_VALIDATION_FAILED',
      'Tồn hoặc giá vốn đầu kỳ chưa đúng định dạng.', v_correlation_id
    );
  when others then
    return app_private.command_error(
      'IMPORT_COMMIT_FAILED',
      'Không thể tạo phiếu mở sổ. Không có tồn kho nào được ghi sổ.',
      v_correlation_id
    );
end;
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
  if exists (
    select 1 from api.import_runs r
    where r.id = p_import_run_id and r.target_type = 'OPENING_BALANCES'
  ) then
    return app_private.commit_opening_balance_import_impl(
      p_import_run_id, p_idempotency_key
    );
  end if;
  return app_private.commit_import_impl(p_import_run_id, p_idempotency_key);
end;
$$;

revoke execute on function app_private.validate_catalog_import_payload(
  api.import_runs, integer, jsonb
) from public, anon;
revoke execute on function app_private.validate_opening_import_payload(
  api.import_runs, integer, jsonb
) from public, anon;
revoke execute on function app_private.validate_import_payload(
  api.import_runs, integer, jsonb
) from public, anon;
revoke execute on function app_private.finalize_catalog_import_validation(uuid)
from public, anon;
revoke execute on function app_private.finalize_opening_import_validation(uuid)
from public, anon;
revoke execute on function app_private.finalize_import_validation(uuid)
from public, anon;
revoke execute on function app_private.commit_opening_balance_import_impl(
  uuid, uuid
) from public, anon;

grant execute on function app_private.validate_catalog_import_payload(
  api.import_runs, integer, jsonb
) to authenticated;
grant execute on function app_private.validate_opening_import_payload(
  api.import_runs, integer, jsonb
) to authenticated;
grant execute on function app_private.validate_import_payload(
  api.import_runs, integer, jsonb
) to authenticated;
grant execute on function app_private.finalize_catalog_import_validation(uuid)
to authenticated;
grant execute on function app_private.finalize_opening_import_validation(uuid)
to authenticated;
grant execute on function app_private.finalize_import_validation(uuid)
to authenticated;
grant execute on function app_private.commit_opening_balance_import_impl(
  uuid, uuid
) to authenticated;

revoke execute on function api.create_import_run(
  text, integer, text, text, text, uuid
) from public, anon;
revoke execute on function api.commit_import(uuid, uuid) from public, anon;
grant execute on function api.create_import_run(
  text, integer, text, text, text, uuid
) to authenticated;
grant execute on function api.commit_import(uuid, uuid) to authenticated;
