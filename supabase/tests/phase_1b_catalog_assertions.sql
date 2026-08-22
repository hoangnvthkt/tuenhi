begin;

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'app_private.get_product_detail_impl(uuid)'::regprocedure
  ) into v_definition;
  if position('''primaryImagePath''' in v_definition) = 0 then
    raise exception 'product detail must include primaryImagePath DTO field';
  end if;
end;
$$;

do $$
declare
  v_relation text;
  v_table text;
  v_function text;
  v_missing_fk text;
begin
  if to_regclass('api.categories') is null then
    raise exception 'api.categories missing';
  end if;

  foreach v_relation in array array[
    'api.products',
    'api.product_images',
    'api.suppliers',
    'api.customers',
    'api.sales_channels',
    'api.inventory_balances',
    'app_private.product_sale_prices',
    'api.product_catalog_read'
  ] loop
    if to_regclass(v_relation) is null then
      raise exception '% missing', v_relation;
    end if;
  end loop;

  foreach v_table in array array[
    'categories',
    'products',
    'product_images',
    'suppliers',
    'customers',
    'sales_channels',
    'inventory_balances'
  ] loop
    if not exists (
      select 1
      from pg_class as c
      join pg_namespace as n on n.oid = c.relnamespace
      where n.nspname = 'api'
        and c.relname = v_table
        and c.relrowsecurity
        and c.relforcerowsecurity
    ) then
      raise exception 'api.% must enable and force RLS', v_table;
    end if;

    if has_table_privilege(
      'authenticated',
      format('api.%I', v_table),
      'insert,update,delete'
    ) then
      raise exception 'browser must not write api.% directly', v_table;
    end if;
  end loop;

  if has_table_privilege(
    'authenticated',
    'api.products',
    'insert,update,delete'
  ) then
    raise exception 'browser must not write products directly';
  end if;

  if has_schema_privilege('anon', 'api', 'usage') then
    raise exception 'anon must not use api schema';
  end if;

  if has_schema_privilege('anon', 'app_private', 'usage') then
    raise exception 'anon must not use app_private schema';
  end if;

  if has_schema_privilege('authenticated', 'app_private', 'usage') is false then
    raise exception 'authenticated needs named helper execution, not table access';
  end if;

  if has_table_privilege(
    'authenticated',
    'app_private.product_sale_prices',
    'select'
  ) then
    raise exception 'sale price history must stay private';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'api'
      and table_name = 'product_catalog_read'
      and column_name ~* 'cost|gia_von|giá_vốn'
  ) then
    raise exception 'product catalog read model must not expose cost';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'api'
      and table_name = 'inventory_balances'
      and column_name ~* 'cost|value|gia_von|giá_vốn'
  ) then
    raise exception 'inventory balances must contain quantity only';
  end if;

  if not exists (
    select 1
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'api'
      and c.relname = 'product_catalog_read'
      and c.relkind = 'v'
      and coalesce(c.reloptions, array[]::text[]) @> array['security_invoker=true']
  ) then
    raise exception 'api.product_catalog_read must be a security-invoker view';
  end if;

  foreach v_function in array array[
    'api.get_product_catalog(text,uuid,text,boolean,text,uuid,integer)',
    'api.get_product_detail(uuid)',
    'api.get_product_sale_price_history(uuid,timestamp with time zone,uuid,integer)',
    'api.list_categories(boolean)',
    'api.list_suppliers(text,text,uuid,integer)',
    'api.list_customers(text,text,uuid,integer)',
    'api.list_sales_channels(boolean)',
    'api.save_category(uuid,text,boolean,uuid)',
    'api.save_product(uuid,bigint,jsonb,uuid)',
    'api.set_product_sale_price(uuid,text,text,uuid)',
    'api.save_supplier(uuid,bigint,jsonb,uuid)',
    'api.save_customer(uuid,bigint,jsonb,uuid)',
    'api.save_sales_channel(uuid,text,text,integer,boolean,uuid)',
    'api.attach_product_image(uuid,text,integer,boolean,uuid)',
    'api.remove_product_image(uuid,uuid)'
  ] loop
    if to_regprocedure(v_function) is null then
      raise exception '% missing', v_function;
    end if;
  end loop;

  if exists (
    select 1
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'app_private'
      and p.proname like '%catalog%_impl'
      and (
        not p.prosecdef
        or not coalesce(p.proconfig, array[]::text[]) @> array['search_path=""']
      )
  ) then
    raise exception 'private catalog functions must be security definer with empty search_path';
  end if;

  if exists (
    select 1
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'api'
      and p.proname in (
        'get_product_catalog',
        'get_product_detail',
        'get_product_sale_price_history',
        'list_categories',
        'list_suppliers',
        'list_customers',
        'list_sales_channels',
        'save_category',
        'save_product',
        'set_product_sale_price',
        'save_supplier',
        'save_customer',
        'save_sales_channel',
        'attach_product_image',
        'remove_product_image'
      )
      and p.prosecdef
  ) then
    raise exception 'api catalog wrappers must remain security invoker';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'app_private'
      and tablename = 'product_sale_prices'
      and indexdef ilike '%unique%'
      and indexdef ilike '%where (valid_to is null)%'
  ) then
    raise exception 'one-current-sale-price partial unique index missing';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'api'
      and tablename = 'product_images'
      and indexdef ilike '%unique%'
      and indexdef ilike '%where is_primary%'
  ) then
    raise exception 'one-primary-image partial unique index missing';
  end if;

  if (
    select count(*)
    from api.sales_channels
    where code in ('IN_STORE', 'REMOTE_PROVINCE', 'ONLINE', 'WHOLESALE')
  ) <> 4 then
    raise exception 'stable sales channel seeds missing';
  end if;

  if (
    select count(*)
    from app_private.permission_definitions as d
    where d.code in (
      'catalog.read',
      'catalog.basic.manage',
      'pricing.sale.manage',
      'supplier.read',
      'supplier.manage',
      'customer.read',
      'customer.manage',
      'settings.manage'
    )
  ) <> 8 or not exists (
    select 1
    from app_private.permission_definitions as d
    where d.code = 'pricing.sale.manage'
      and d.owner_only
  ) then
    raise exception 'catalog permission definitions are incomplete';
  end if;

  select format('%I.%I (%s)', n.nspname, c.relname, con.conname)
  into v_missing_fk
  from pg_constraint as con
  join pg_class as c on c.oid = con.conrelid
  join pg_namespace as n on n.oid = c.relnamespace
  where con.contype = 'f'
    and n.nspname in ('api', 'app_private')
    and c.relname in (
      'categories',
      'products',
      'product_images',
      'suppliers',
      'customers',
      'sales_channels',
      'inventory_balances',
      'product_sale_prices'
    )
    and not exists (
      select 1
      from pg_index as i
      where i.indrelid = con.conrelid
        and i.indisvalid
        and (i.indkey::smallint[])[0:cardinality(con.conkey) - 1] = con.conkey
    )
  limit 1;

  if v_missing_fk is not null then
    raise exception 'foreign key index missing: %', v_missing_fk;
  end if;
end
$$;

do $$
declare
  v_owner_id uuid;
begin
  select p.id into v_owner_id
  from api.profiles as p
  where p.role_template = 'OWNER'
    and p.is_active
    and not p.must_change_password
  order by p.created_at
  limit 1;

  if v_owner_id is null then
    perform set_config('phase1b.catalog_command_test', 'skipped', true);
    return;
  end if;

  perform set_config('phase1b.catalog_command_test', 'enabled', true);
  perform set_config('request.jwt.claim.sub', v_owner_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end
$$;

set local role authenticated;

do $$
declare
  v_suffix text := replace(gen_random_uuid()::text, '-', '');
  v_category_response jsonb;
  v_retry_response jsonb;
  v_product_response jsonb;
  v_detail_response jsonb;
  v_price_response jsonb;
  v_conflict_response jsonb;
  v_supplier_response jsonb;
  v_customer_response jsonb;
  v_channel_response jsonb;
  v_image_response jsonb;
  v_remove_response jsonb;
  v_category_id uuid;
  v_product_id uuid;
  v_image_id uuid;
  v_image_object_id uuid := gen_random_uuid();
  v_category_key uuid := gen_random_uuid();
begin
  if current_setting('phase1b.catalog_command_test', true) <> 'enabled' then
    return;
  end if;

  v_category_response := api.save_category(
    null,
    'Nhóm kiểm thử ' || v_suffix,
    true,
    v_category_key
  );
  if not coalesce((v_category_response ->> 'ok')::boolean, false) then
    raise exception 'save_category failed: %', v_category_response -> 'error' ->> 'code';
  end if;
  v_category_id := (v_category_response #>> '{data,categoryId}')::uuid;

  v_retry_response := api.save_category(
    null,
    'Giá trị retry không được áp dụng',
    false,
    v_category_key
  );
  if v_retry_response <> v_category_response then
    raise exception 'save_category idempotency failed';
  end if;

  v_product_response := api.save_product(
    null,
    null,
    jsonb_build_object(
      'sku', 'TEST-' || v_suffix,
      'barcode', '0' || left(v_suffix, 15),
      'name', 'Sản phẩm kiểm thử ' || v_suffix,
      'categoryId', v_category_id,
      'unitName', 'Hộp',
      'description', 'Dữ liệu tổng hợp sẽ rollback',
      'minStockQty', '1.250',
      'isActive', true
    ),
    gen_random_uuid()
  );
  if not coalesce((v_product_response ->> 'ok')::boolean, false) then
    raise exception 'save_product failed: %', v_product_response -> 'error' ->> 'code';
  end if;
  v_product_id := (v_product_response #>> '{data,productId}')::uuid;

  v_detail_response := api.get_product_detail(v_product_id);
  if v_detail_response #>> '{data,onHandQty}' <> '0.000' then
    raise exception 'new product must have one zero inventory balance';
  end if;

  v_conflict_response := api.save_product(
    v_product_id,
    999,
    jsonb_build_object(
      'sku', 'TEST-' || v_suffix,
      'barcode', '0' || left(v_suffix, 15),
      'name', 'Sản phẩm kiểm thử ' || v_suffix,
      'categoryId', v_category_id,
      'unitName', 'Hộp',
      'description', 'Dữ liệu tổng hợp sẽ rollback',
      'minStockQty', '1.250',
      'isActive', true
    ),
    gen_random_uuid()
  );
  if v_conflict_response #>> '{error,code}' <> 'VERSION_CONFLICT'
    or v_conflict_response #>> '{error,details,currentVersion}' <> '1'
  then
    raise exception 'product version conflict envelope missing current version';
  end if;

  v_price_response := api.set_product_sale_price(
    v_product_id, '25000.50', 'Kiểm thử rollback', gen_random_uuid()
  );
  if not coalesce((v_price_response ->> 'ok')::boolean, false) then
    raise exception 'set_product_sale_price failed';
  end if;

  v_supplier_response := api.save_supplier(
    null,
    null,
    jsonb_build_object(
      'code', 'NCC-' || left(v_suffix, 20),
      'name', 'Nhà cung cấp kiểm thử',
      'phone', '+84912345678',
      'email', 'supplier@example.invalid',
      'isActive', true
    ),
    gen_random_uuid()
  );
  if not coalesce((v_supplier_response ->> 'ok')::boolean, false) then
    raise exception 'save_supplier failed';
  end if;

  v_customer_response := api.save_customer(
    null,
    null,
    jsonb_build_object(
      'code', 'KH-' || left(v_suffix, 20),
      'customerType', 'BUSINESS',
      'name', 'Khách hàng kiểm thử',
      'companyName', 'Công ty kiểm thử',
      'phone', '+84912345678',
      'email', 'customer@example.invalid',
      'isActive', true
    ),
    gen_random_uuid()
  );
  if not coalesce((v_customer_response ->> 'ok')::boolean, false) then
    raise exception 'save_customer failed';
  end if;

  v_channel_response := api.save_sales_channel(
    null,
    'TEST_' || upper(left(v_suffix, 10)),
    'Kênh kiểm thử',
    999,
    true,
    gen_random_uuid()
  );
  if not coalesce((v_channel_response ->> 'ok')::boolean, false) then
    raise exception 'save_sales_channel failed';
  end if;

  v_image_response := api.attach_product_image(
    v_product_id,
    'products/' || v_product_id::text || '/' || v_image_object_id::text || '.webp',
    0,
    true,
    gen_random_uuid()
  );
  if not coalesce((v_image_response ->> 'ok')::boolean, false) then
    raise exception 'attach_product_image failed: %', v_image_response -> 'error' ->> 'code';
  end if;
  v_image_id := (v_image_response #>> '{data,productImageId}')::uuid;
  v_remove_response := api.remove_product_image(v_image_id, gen_random_uuid());
  if not coalesce((v_remove_response ->> 'ok')::boolean, false) then
    raise exception 'remove_product_image failed';
  end if;

  begin
    insert into api.products (
      sku, sku_normalized, name, name_normalized, unit_name,
      created_by, updated_by
    ) values (
      'FORBIDDEN', 'forbidden', 'Không được ghi trực tiếp',
      'không được ghi trực tiếp', 'Hộp', auth.uid(), auth.uid()
    );
    raise exception 'authenticated direct product insert unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

reset role;

rollback;

begin;

do $$
declare
  v_signature text;
  v_expected_volatility "char";
begin
  for v_signature, v_expected_volatility in
    select * from (values
      ('app_private.get_import_validation_result_impl(uuid,integer,integer)', 'v'::"char"),
      ('app_private.get_import_result_impl(uuid)', 'v'::"char"),
      ('app_private.list_import_runs_impl(text,text,timestamp with time zone,uuid,integer)', 'v'::"char"),
      ('app_private.get_legacy_sales_impl(jsonb,date,uuid,integer)', 'v'::"char"),
      ('app_private.get_legacy_sale_impl(uuid)', 'v'::"char"),
      ('app_private.get_product_catalog_impl(text,uuid,text,boolean,text,uuid,integer)', 'v'::"char"),
      ('app_private.get_product_detail_impl(uuid)', 'v'::"char"),
      ('app_private.get_product_sale_price_history_impl(uuid,timestamp with time zone,uuid,integer)', 'v'::"char"),
      ('app_private.list_categories_impl(boolean)', 'v'::"char"),
      ('app_private.list_suppliers_impl(text,text,uuid,integer)', 'v'::"char"),
      ('app_private.list_customers_impl(text,text,uuid,integer)', 'v'::"char"),
      ('app_private.list_sales_channels_impl(boolean)', 'v'::"char"),
      ('api.get_import_validation_result(uuid,integer,integer)', 'v'::"char"),
      ('api.get_import_result(uuid)', 'v'::"char"),
      ('api.list_import_runs(text,text,timestamp with time zone,uuid,integer)', 'v'::"char"),
      ('api.get_legacy_sales(jsonb,date,uuid,integer)', 'v'::"char"),
      ('api.get_legacy_sale(uuid)', 'v'::"char"),
      ('api.get_product_catalog(text,uuid,text,boolean,text,uuid,integer)', 'v'::"char"),
      ('api.get_product_detail(uuid)', 'v'::"char"),
      ('api.get_product_sale_price_history(uuid,timestamp with time zone,uuid,integer)', 'v'::"char"),
      ('api.list_categories(boolean)', 'v'::"char"),
      ('api.list_suppliers(text,text,uuid,integer)', 'v'::"char"),
      ('api.list_customers(text,text,uuid,integer)', 'v'::"char"),
      ('api.list_sales_channels(boolean)', 'v'::"char"),
      ('app_private.stringify_legacy_list_decimals(jsonb)', 's'::"char"),
      ('app_private.stringify_legacy_detail_decimals(jsonb)', 's'::"char")
    ) expected(signature, volatility)
  loop
    if not exists (
      select 1
      from pg_proc
      where oid = to_regprocedure(v_signature)
        and provolatile = v_expected_volatility
    ) then
      raise exception 'function volatility mismatch: %', v_signature;
    end if;
  end loop;
end;
$$;

rollback;
