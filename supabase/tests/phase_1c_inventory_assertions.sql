begin;

do $$
declare
  v_relation text;
  v_function text;
begin
  foreach v_relation in array array[
    'api.stock_movements',
    'api.purchase_receipts',
    'api.purchase_receipt_lines',
    'api.stock_counts',
    'api.stock_count_lines',
    'app_private.inventory_cost_balances',
    'app_private.inventory_cost_movements',
    'app_private.purchase_receipt_draft_line_costs',
    'app_private.purchase_receipt_line_costs',
    'app_private.stock_count_line_costs',
    'app_private.document_sequences'
  ] loop
    if to_regclass(v_relation) is null then
      raise exception '% missing', v_relation;
    end if;
  end loop;

  foreach v_function in array array[
    'api.save_purchase_receipt_draft(uuid,bigint,uuid,timestamp with time zone,text,jsonb,uuid)',
    'api.submit_purchase_receipt(uuid,bigint,uuid)',
    'api.cancel_purchase_receipt(uuid,bigint,text,uuid)',
    'api.post_purchase_receipt(uuid,bigint,jsonb,uuid)',
    'api.reverse_purchase_receipt(uuid,text,uuid)',
    'api.list_purchase_receipts(jsonb,timestamp with time zone,uuid,integer)',
    'api.get_purchase_receipt_operational(uuid)',
    'api.get_purchase_receipt_cost_detail(uuid)',
    'api.resolve_purchase_receipt_products(text[])',
    'api.save_opening_stock_draft(uuid,bigint,text,jsonb,uuid)',
    'api.submit_opening_stock(uuid,bigint,uuid)',
    'api.cancel_opening_stock(uuid,bigint,text,uuid)',
    'api.post_opening_stock(uuid,bigint,uuid)',
    'api.list_opening_stock_documents(timestamp with time zone,uuid,integer)',
    'api.get_opening_stock_document(uuid)',
    'api.list_opening_balance_suggestions(uuid,integer)',
    'api.get_inventory_valuation(text,uuid,integer)',
    'api.create_import_run(text,integer,text,text,text,uuid)',
    'api.commit_import(uuid,uuid)'
  ] loop
    if to_regprocedure(v_function) is null then
      raise exception '% missing', v_function;
    end if;
    if not has_function_privilege('authenticated', v_function, 'execute') then
      raise exception 'authenticated execute missing for %', v_function;
    end if;
    if has_function_privilege('anon', v_function, 'execute') then
      raise exception 'anon execute must be revoked for %', v_function;
    end if;
  end loop;

  if not exists (
    select 1 from app_private.document_sequences
    where document_type = 'PURCHASE_RECEIPT' and prefix = 'PN'
  ) or not exists (
    select 1 from app_private.document_sequences
    where document_type = 'STOCK_COUNT' and prefix = 'KK'
  ) then
    raise exception 'Phase 1C document sequences missing';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where grantee in ('anon', 'authenticated')
      and table_schema = 'app_private'
      and table_name in (
        'inventory_cost_balances', 'inventory_cost_movements',
        'purchase_receipt_draft_line_costs', 'purchase_receipt_line_costs',
        'stock_count_line_costs'
      )
  ) then
    raise exception 'browser role must not receive direct cost table grants';
  end if;

  if has_table_privilege('authenticated', 'api.stock_movements', 'insert')
    or has_table_privilege('authenticated', 'api.purchase_receipts', 'insert')
    or has_table_privilege('authenticated', 'api.stock_counts', 'insert')
  then
    raise exception 'authenticated direct financial writes must stay revoked';
  end if;

  if not has_table_privilege('authenticated', 'api.stock_movements', 'select')
    or not has_table_privilege('authenticated', 'api.purchase_receipts', 'select')
    or not has_table_privilege('authenticated', 'api.purchase_receipt_lines', 'select')
    or not has_table_privilege('authenticated', 'api.stock_counts', 'select')
    or not has_table_privilege('authenticated', 'api.stock_count_lines', 'select')
  then
    raise exception 'authenticated operational read grants missing';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'api'
      and table_name in (
        'stock_movements', 'purchase_receipts', 'purchase_receipt_lines',
        'stock_counts', 'stock_count_lines'
      )
      and column_name in (
        'unit_cost', 'line_cost', 'inventory_value', 'avg_unit_cost',
        'inventory_value_delta', 'inventory_value_after'
      )
  ) then
    raise exception 'cost fields leaked into exposed operational tables';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'api'
      and c.relname in (
        'stock_movements', 'purchase_receipts', 'purchase_receipt_lines',
        'stock_counts', 'stock_count_lines'
      )
      and (not c.relrowsecurity or not c.relforcerowsecurity)
  ) then
    raise exception 'Phase 1C exposed tables must force RLS';
  end if;

  if exists (
    select 1
    from api.products p
    left join app_private.inventory_cost_balances c on c.product_id = p.id
    where c.product_id is null
  ) then
    raise exception 'every product must have one cost balance';
  end if;

  if to_regprocedure('api.cleanup_phase1c_test_users(uuid[])') is null
    or not has_function_privilege(
      'service_role', 'api.cleanup_phase1c_test_users(uuid[])', 'execute'
    )
    or has_function_privilege(
      'authenticated', 'api.cleanup_phase1c_test_users(uuid[])', 'execute'
    )
  then
    raise exception 'Phase 1C Cloud test cleanup grants are unsafe';
  end if;
end;
$$;

rollback;

begin;

do $$
declare
  v_owner_id uuid;
begin
  select p.id into v_owner_id
  from api.profiles p
  where p.role_template = 'OWNER' and p.is_active
    and not p.must_change_password
  order by p.created_at limit 1;
  if v_owner_id is null then
    perform set_config('phase1c.inventory_command_test', 'skipped', true);
    return;
  end if;
  perform set_config('phase1c.inventory_command_test', 'enabled', true);
  perform set_config('request.jwt.claim.sub', v_owner_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end;
$$;

do $$
declare
  v_suffix text := replace(gen_random_uuid()::text, '-', '');
  v_product_one jsonb;
  v_product_two jsonb;
  v_product_three jsonb;
  v_product_four jsonb;
  v_receipt jsonb;
  v_detail jsonb;
  v_submit jsonb;
  v_post jsonb;
  v_retry jsonb;
  v_reverse jsonb;
  v_opening jsonb;
  v_opening_submit jsonb;
  v_opening_post jsonb;
  v_blocked jsonb;
  v_product_one_id uuid;
  v_product_two_id uuid;
  v_product_three_id uuid;
  v_product_four_id uuid;
  v_receipt_id uuid;
  v_line_id uuid;
  v_version bigint;
  v_key uuid;
  v_import jsonb;
  v_import_run_id uuid;
  v_mapping jsonb;
  v_validation jsonb;
  v_import_commit jsonb;
  v_import_retry jsonb;
  v_stock_count_id uuid;
begin
  if current_setting('phase1c.inventory_command_test', true) <> 'enabled' then
    return;
  end if;

  v_product_one := api.save_product(
    null, null,
    jsonb_build_object(
      'sku', 'P1C-A-' || left(v_suffix, 20), 'name', 'Giá vốn A',
      'unitName', 'Hộp', 'minStockQty', '0', 'isActive', true
    ), gen_random_uuid()
  );
  v_product_two := api.save_product(
    null, null,
    jsonb_build_object(
      'sku', 'P1C-B-' || left(v_suffix, 20), 'name', 'Mở sổ B',
      'unitName', 'Hộp', 'minStockQty', '0', 'isActive', true
    ), gen_random_uuid()
  );
  v_product_three := api.save_product(
    null, null,
    jsonb_build_object(
      'sku', 'P1C-C-' || left(v_suffix, 20), 'name', 'Đảo phiếu C',
      'unitName', 'Hộp', 'minStockQty', '0', 'isActive', true
    ), gen_random_uuid()
  );
  v_product_four := api.save_product(
    null, null,
    jsonb_build_object(
      'sku', 'P1C-D-' || left(v_suffix, 20), 'name', 'Excel mở sổ D',
      'unitName', 'Hộp', 'minStockQty', '0', 'isActive', true
    ), gen_random_uuid()
  );
  if not coalesce((v_product_one ->> 'ok')::boolean, false)
    or not coalesce((v_product_two ->> 'ok')::boolean, false)
    or not coalesce((v_product_three ->> 'ok')::boolean, false)
    or not coalesce((v_product_four ->> 'ok')::boolean, false)
  then
    raise exception 'Phase 1C test product creation failed';
  end if;
  v_product_one_id := (v_product_one #>> '{data,productId}')::uuid;
  v_product_two_id := (v_product_two #>> '{data,productId}')::uuid;
  v_product_three_id := (v_product_three #>> '{data,productId}')::uuid;
  v_product_four_id := (v_product_four #>> '{data,productId}')::uuid;

  v_blocked := api.save_purchase_receipt_draft(
    null, null, null, now(), 'Thiếu giá nhập',
    jsonb_build_array(jsonb_build_object(
      'productId', v_product_one_id, 'receivedQty', '1', 'unitCost', '0'
    )), gen_random_uuid()
  );
  if v_blocked #>> '{error,code}' <> 'VALIDATION_FAILED' then
    raise exception 'zero purchase cost must be rejected';
  end if;
  v_blocked := api.save_purchase_receipt_draft(
    null, null, null, now(), 'Trùng sản phẩm',
    jsonb_build_array(
      jsonb_build_object(
        'productId', v_product_one_id, 'receivedQty', '1', 'unitCost', '100'
      ),
      jsonb_build_object(
        'productId', v_product_one_id, 'receivedQty', '2', 'unitCost', '100'
      )
    ), gen_random_uuid()
  );
  if v_blocked #>> '{error,code}' <> 'VALIDATION_FAILED' then
    raise exception 'duplicate purchase product must be rejected';
  end if;
  v_detail := api.resolve_purchase_receipt_products(array[
    ' P1C-A-' || left(v_suffix, 20) || ' ', 'UNKNOWN-' || left(v_suffix, 20)
  ]);
  if not coalesce((v_detail ->> 'ok')::boolean, false)
    or v_detail #>> '{data,0,productId}' <> v_product_one_id::text
    or v_detail #>> '{data,1,productId}' is not null
  then
    raise exception 'purchase product resolver must retain known and unknown SKU positions';
  end if;

  v_receipt := api.save_purchase_receipt_draft(
    null, null, null, now(), 'Vector 10 x 40000',
    jsonb_build_array(jsonb_build_object(
      'productId', v_product_one_id, 'receivedQty', '10', 'unitCost', '40000'
    )), gen_random_uuid()
  );
  v_receipt_id := (v_receipt #>> '{data,receiptId}')::uuid;
  v_version := (v_receipt #>> '{data,version}')::bigint;
  v_detail := api.get_purchase_receipt_operational(v_receipt_id);
  if v_detail::text ilike '%unitCost%' then
    raise exception 'operational purchase DTO must not expose cost';
  end if;
  v_line_id := (v_detail #>> '{data,lines,0,id}')::uuid;
  if not exists (
    select 1
    from app_private.purchase_receipt_draft_line_costs draft_cost
    where draft_cost.purchase_receipt_line_id = v_line_id
      and draft_cost.unit_cost = 40000
      and draft_cost.entered_by = v_owner_id
  ) then
    raise exception 'draft cost must be private and attributed to its creator';
  end if;
  v_key := gen_random_uuid();
  v_post := api.post_purchase_receipt(
    v_receipt_id, v_version, '[]'::jsonb, v_key
  );
  v_retry := api.post_purchase_receipt(
    v_receipt_id, v_version, '[]'::jsonb, v_key
  );
  if not coalesce((v_post ->> 'ok')::boolean, false) or v_retry <> v_post then
    raise exception 'purchase post or idempotent retry failed';
  end if;

  v_receipt := api.save_purchase_receipt_draft(
    null, null, null, now(), 'Vector 5 x 50000',
    jsonb_build_array(jsonb_build_object(
      'productId', v_product_one_id, 'receivedQty', '5', 'unitCost', '50000'
    )), gen_random_uuid()
  );
  v_receipt_id := (v_receipt #>> '{data,receiptId}')::uuid;
  v_detail := api.get_purchase_receipt_operational(v_receipt_id);
  v_line_id := (v_detail #>> '{data,lines,0,id}')::uuid;
  v_post := api.post_purchase_receipt(
    v_receipt_id, (v_receipt #>> '{data,version}')::bigint,
    '[]'::jsonb, gen_random_uuid()
  );
  if not coalesce((v_post ->> 'ok')::boolean, false) then
    raise exception 'second weighted-average receipt failed';
  end if;
  if not exists (
    select 1 from api.inventory_balances quantity_balance
    join app_private.inventory_cost_balances cost_balance
      on cost_balance.product_id = quantity_balance.product_id
    where quantity_balance.product_id = v_product_one_id
      and quantity_balance.on_hand_qty = 15
      and cost_balance.inventory_value = 650000
      and cost_balance.avg_unit_cost = 43333.333333
  ) then
    raise exception 'weighted-average vector mismatch';
  end if;

  v_opening := api.save_opening_stock_draft(
    null, null, 'Mở sổ nhiều đợt',
    jsonb_build_array(jsonb_build_object(
      'productId', v_product_two_id, 'countedQty', '2.500',
      'openingUnitCost', '12000', 'sourceSuggestionId', null,
      'confirmedUnverified', false
    )), gen_random_uuid()
  );
  v_opening_submit := api.submit_opening_stock(
    (v_opening #>> '{data,countId}')::uuid,
    (v_opening #>> '{data,version}')::bigint, gen_random_uuid()
  );
  v_opening_post := api.post_opening_stock(
    (v_opening #>> '{data,countId}')::uuid,
    (v_opening_submit #>> '{data,version}')::bigint, gen_random_uuid()
  );
  if not coalesce((v_opening_post ->> 'ok')::boolean, false) then
    raise exception 'opening post failed: %', v_opening_post #>> '{error,code}';
  end if;
  v_blocked := api.save_opening_stock_draft(
    null, null, 'Không được mở lại',
    jsonb_build_array(jsonb_build_object(
      'productId', v_product_two_id, 'countedQty', '1',
      'openingUnitCost', '12000', 'sourceSuggestionId', null,
      'confirmedUnverified', false
    )), gen_random_uuid()
  );
  if v_blocked #>> '{error,code}' <> 'OPENING_NOT_ALLOWED' then
    raise exception 'duplicate opening must be blocked';
  end if;

  v_receipt := api.save_purchase_receipt_draft(
    null, null, null, now(), 'Phiếu được đảo',
    jsonb_build_array(jsonb_build_object(
      'productId', v_product_three_id, 'receivedQty', '3', 'unitCost', '15000'
    )), gen_random_uuid()
  );
  v_receipt_id := (v_receipt #>> '{data,receiptId}')::uuid;
  v_detail := api.get_purchase_receipt_operational(v_receipt_id);
  v_line_id := (v_detail #>> '{data,lines,0,id}')::uuid;
  v_post := api.post_purchase_receipt(
    v_receipt_id, (v_receipt #>> '{data,version}')::bigint,
    '[]'::jsonb, gen_random_uuid()
  );
  v_reverse := api.reverse_purchase_receipt(
    v_receipt_id, 'Kiểm thử đảo phiếu', gen_random_uuid()
  );
  if not coalesce((v_reverse ->> 'ok')::boolean, false)
    or not exists (
      select 1 from api.inventory_balances quantity_balance
      join app_private.inventory_cost_balances cost_balance
        on cost_balance.product_id = quantity_balance.product_id
      where quantity_balance.product_id = v_product_three_id
        and quantity_balance.on_hand_qty = 0
        and cost_balance.inventory_value = 0
        and cost_balance.avg_unit_cost = 0
    )
  then
    raise exception 'purchase reversal failed';
  end if;

  v_import := api.create_import_run(
    'OPENING_BALANCES', 1, 'opening-balances-v1.xlsx', repeat('a', 64),
    'CREATE_ONLY', gen_random_uuid()
  );
  if not coalesce((v_import ->> 'ok')::boolean, false) then
    raise exception 'opening import run creation failed: %', v_import;
  end if;
  v_import_run_id := (v_import #>> '{data,importRunId}')::uuid;
  v_mapping := api.save_import_mapping(
    v_import_run_id,
    jsonb_build_object(
      'SKU', 'sku', 'Số lượng tồn đầu kỳ', 'openingQuantity',
      'Đơn giá vốn đầu kỳ', 'openingUnitCost'
    )
  );
  v_validation := api.validate_import_rows(
    v_import_run_id, 0,
    jsonb_build_array(jsonb_build_object(
      'rowNumber', 2,
      'values', jsonb_build_object(
        'sku', 'P1C-D-' || left(v_suffix, 20),
        'openingQuantity', '4.250', 'openingUnitCost', '12500.50'
      )
    )), true
  );
  if not coalesce((v_mapping ->> 'ok')::boolean, false)
    or not coalesce((v_validation ->> 'ok')::boolean, false)
    or (v_validation #>> '{data,invalidRows}')::integer <> 0
  then
    raise exception 'opening import validation failed: %', v_validation;
  end if;
  v_key := gen_random_uuid();
  v_import_commit := api.commit_import(v_import_run_id, v_key);
  v_import_retry := api.commit_import(v_import_run_id, v_key);
  if not coalesce((v_import_commit ->> 'ok')::boolean, false)
    or v_import_retry <> v_import_commit
  then
    raise exception 'opening import commit or retry failed: %', v_import_commit;
  end if;
  v_stock_count_id := (v_import_commit #>> '{data,stockCountId}')::uuid;
  if not exists (
    select 1 from api.stock_counts c
    join api.stock_count_lines line on line.stock_count_id = c.id
    join app_private.stock_count_line_costs cost
      on cost.stock_count_line_id = line.id
    where c.id = v_stock_count_id and c.status = 'DRAFT'
      and line.product_id = v_product_four_id and line.counted_qty = 4.250
      and cost.opening_unit_cost = 12500.50
  ) or exists (
    select 1 from api.stock_movements movement
    where movement.product_id = v_product_four_id
  ) or not exists (
    select 1 from api.inventory_balances quantity_balance
    join app_private.inventory_cost_balances cost_balance
      on cost_balance.product_id = quantity_balance.product_id
    where quantity_balance.product_id = v_product_four_id
      and quantity_balance.on_hand_qty = 0
      and cost_balance.inventory_value = 0
  ) then
    raise exception 'opening import must create draft without posting balances';
  end if;
end;
$$;

rollback;
