begin;

do $$
declare
  v_signature text;
  v_api_functions text[] := array[
    'api.get_product_relationship_context(uuid)',
    'api.list_product_suppliers(uuid,timestamp with time zone,uuid,integer)',
    'api.get_supplier_detail(uuid)',
    'api.list_supplier_products(uuid,text,timestamp with time zone,uuid,integer)',
    'api.list_posted_purchase_history(uuid,uuid,date,date,timestamp with time zone,uuid,uuid,integer)'
  ];
  v_private_functions text[] := array[
    'app_private.get_product_relationship_context_impl(uuid)',
    'app_private.list_product_suppliers_impl(uuid,timestamp with time zone,uuid,integer)',
    'app_private.get_supplier_detail_impl(uuid)',
    'app_private.list_supplier_products_impl(uuid,text,timestamp with time zone,uuid,integer)',
    'app_private.list_posted_purchase_history_impl(uuid,uuid,date,date,timestamp with time zone,uuid,uuid,integer)'
  ];
begin
  foreach v_signature in array v_api_functions || v_private_functions loop
    if to_regprocedure(v_signature) is null then
      raise exception 'P2.2 function missing: %', v_signature;
    end if;
    if not has_function_privilege('authenticated', v_signature, 'execute')
      or has_function_privilege('anon', v_signature, 'execute')
      or has_function_privilege('public', v_signature, 'execute')
    then
      raise exception 'P2.2 function grants unsafe: %', v_signature;
    end if;
    if not coalesce(
      (select p.proconfig from pg_proc p where p.oid = v_signature::regprocedure),
      '{}'::text[]
    ) @> array['search_path=""'] then
      raise exception 'P2.2 function search_path unsafe: %', v_signature;
    end if;
    if (select p.provolatile from pg_proc p where p.oid = v_signature::regprocedure) <> 's' then
      raise exception 'P2.2 read function must be stable: %', v_signature;
    end if;
  end loop;

  foreach v_signature in array v_api_functions loop
    if (select p.prosecdef from pg_proc p where p.oid = v_signature::regprocedure) then
      raise exception 'P2.2 API wrapper must be security invoker: %', v_signature;
    end if;
  end loop;

  foreach v_signature in array v_private_functions loop
    if not (select p.prosecdef from pg_proc p where p.oid = v_signature::regprocedure) then
      raise exception 'P2.2 private implementation must be security definer: %', v_signature;
    end if;
  end loop;

  if exists (
    select 1
    from information_schema.role_table_grants
    where grantee in ('anon', 'authenticated')
      and table_schema = 'app_private'
      and table_name = 'purchase_receipt_line_costs'
  ) then
    raise exception 'P2.2 must not expose private purchase costs';
  end if;

  if to_regclass('api.purchase_receipts_posted_supplier_received_idx') is null then
    raise exception 'P2.2 posted supplier index missing';
  end if;
end;
$$;

do $$
declare
  v_result jsonb;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  v_result := api.get_product_relationship_context(gen_random_uuid());
  if coalesce((v_result ->> 'ok')::boolean, true)
    or v_result #>> '{error,code}' <> 'PERMISSION_DENIED'
  then
    raise exception 'P2.2 no-session product context must fail closed';
  end if;
  v_result := api.get_supplier_detail(gen_random_uuid());
  if coalesce((v_result ->> 'ok')::boolean, true)
    or v_result #>> '{error,code}' <> 'PERMISSION_DENIED'
  then
    raise exception 'P2.2 no-session supplier detail must fail closed';
  end if;
end;
$$;

do $$
declare
  v_owner_id uuid;
  v_product_id uuid;
  v_supplier_id uuid;
  v_result jsonb;
  v_expected_count integer;
  v_expected_supplier_count integer;
  v_expected_product_count integer;
  v_expected_quantity numeric;
  v_history_item jsonb;
begin
  select p.id into v_owner_id
  from api.profiles p
  where p.is_active
  order by (p.role_template = 'OWNER') desc, p.created_at
  limit 1;
  if v_owner_id is null then
    raise notice 'P2.2 aggregate assertions skipped: no active profile';
    return;
  end if;
  perform set_config('request.jwt.claim.sub', v_owner_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  v_result := api.list_posted_purchase_history(
    null, null, null, null, null, null, null, 25
  );
  if coalesce((v_result ->> 'ok')::boolean, true)
    or v_result #>> '{error,code}' <> 'VALIDATION_FAILED'
  then
    raise exception 'P2.2 history must require a product or supplier filter';
  end if;

  select p.id into v_product_id from api.products p order by p.created_at limit 1;
  if v_product_id is not null then
    v_result := api.list_product_suppliers(
      v_product_id, statement_timestamp(), null, 25
    );
    if coalesce((v_result ->> 'ok')::boolean, true)
      or v_result #>> '{error,code}' <> 'VALIDATION_FAILED'
    then
      raise exception 'P2.2 supplier cursor must be complete';
    end if;
    v_result := api.list_product_suppliers(v_product_id, null, null, 0);
    if coalesce((v_result ->> 'ok')::boolean, true)
      or v_result #>> '{error,code}' <> 'VALIDATION_FAILED'
    then
      raise exception 'P2.2 supplier limit must be validated';
    end if;
    v_result := api.list_posted_purchase_history(
      v_product_id,
      null,
      date '2026-01-02',
      date '2026-01-01',
      null,
      null,
      null,
      25
    );
    if coalesce((v_result ->> 'ok')::boolean, true)
      or v_result #>> '{error,code}' <> 'VALIDATION_FAILED'
    then
      raise exception 'P2.2 history date range must be validated';
    end if;

    v_result := api.get_product_relationship_context(v_product_id);
    if not coalesce((v_result ->> 'ok')::boolean, false) then
      raise exception 'P2.2 product context failed for existing product';
    end if;
    select
      count(distinct r.id),
      count(distinct r.supplier_id) filter (where r.supplier_id is not null),
      coalesce(sum(l.received_qty), 0)
      into v_expected_count, v_expected_supplier_count, v_expected_quantity
    from api.purchase_receipt_lines l
    join api.purchase_receipts r on r.id = l.purchase_receipt_id
    where l.product_id = v_product_id and r.status = 'POSTED';
    if (v_result #>> '{data,postedReceiptCount}')::integer <> v_expected_count
      or (v_result #>> '{data,supplierCount}')::integer
        <> v_expected_supplier_count
      or (v_result #>> '{data,totalReceivedQty}')::numeric <> v_expected_quantity
    then
      raise exception 'P2.2 product aggregate mismatch';
    end if;

    v_result := api.list_posted_purchase_history(
      v_product_id, null, null, null, null, null, null, 100
    );
    if not coalesce((v_result ->> 'ok')::boolean, false) then
      raise exception 'P2.2 product history failed for existing product';
    end if;
    for v_history_item in
      select value from jsonb_array_elements(v_result #> '{data,items}')
    loop
      if not exists (
        select 1
        from api.purchase_receipts r
        where r.id = (v_history_item ->> 'receiptId')::uuid
          and r.status = 'POSTED'
      ) then
        raise exception 'P2.2 history exposed a non-posted receipt';
      end if;
    end loop;
  end if;

  v_result := api.get_product_relationship_context(gen_random_uuid());
  if coalesce((v_result ->> 'ok')::boolean, true)
    or v_result #>> '{error,code}' <> 'REFERENCE_NOT_FOUND'
  then
    raise exception 'P2.2 missing product must return safe not-found';
  end if;

  select s.id into v_supplier_id from api.suppliers s order by s.created_at limit 1;
  if v_supplier_id is not null then
    v_result := api.get_supplier_detail(v_supplier_id);
    if not coalesce((v_result ->> 'ok')::boolean, false) then
      raise exception 'P2.2 supplier detail failed for existing supplier';
    end if;
    select
      count(distinct l.product_id),
      count(distinct r.id),
      coalesce(sum(l.received_qty), 0)
    into v_expected_product_count, v_expected_count, v_expected_quantity
    from api.purchase_receipts r
    join api.purchase_receipt_lines l on l.purchase_receipt_id = r.id
    where r.supplier_id = v_supplier_id
      and r.status = 'POSTED';
    if (v_result #>> '{data,distinctProductCount}')::integer
        <> v_expected_product_count
      or (v_result #>> '{data,postedReceiptCount}')::integer
        <> v_expected_count
      or (v_result #>> '{data,totalReceivedQty}')::numeric
        <> v_expected_quantity
    then
      raise exception 'P2.2 supplier aggregate mismatch';
    end if;
  end if;

  v_result := api.get_supplier_detail(gen_random_uuid());
  if coalesce((v_result ->> 'ok')::boolean, true)
    or v_result #>> '{error,code}' <> 'REFERENCE_NOT_FOUND'
  then
    raise exception 'P2.2 missing supplier must return safe not-found';
  end if;
end;
$$;

do $$
declare
  v_actor_id uuid;
  v_product_id uuid;
  v_result jsonb;
  v_item jsonb;
  v_actor_found boolean := false;
begin
  select p.id into v_product_id
  from api.products p
  where exists (
    select 1
    from api.purchase_receipt_lines l
    join api.purchase_receipts r on r.id = l.purchase_receipt_id
    where l.product_id = p.id and r.status = 'POSTED'
  )
  order by p.created_at
  limit 1;
  if v_product_id is null then
    raise notice 'P2.2 cost-null assertion skipped: no posted purchase history';
    return;
  end if;

  for v_actor_id in
    select p.id from api.profiles p where p.is_active order by p.created_at
  loop
    perform set_config('request.jwt.claim.sub', v_actor_id::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    if app_private.has_permission('catalog.read')
      and app_private.has_permission('purchase.operational.read')
      and not app_private.has_permission('purchase.cost.read')
    then
      v_actor_found := true;
      exit;
    end if;
  end loop;
  if not v_actor_found then
    raise notice 'P2.2 cost-null assertion skipped: no eligible non-cost actor';
    return;
  end if;

  v_result := api.get_product_relationship_context(v_product_id);
  if not coalesce((v_result ->> 'ok')::boolean, false)
    or coalesce((v_result #>> '{data,canReadCost}')::boolean, true)
    or v_result #> '{data,latestUnitCost}' is distinct from 'null'::jsonb
  then
    raise exception 'P2.2 product context leaked cost to non-cost actor';
  end if;
  v_result := api.list_posted_purchase_history(
    v_product_id, null, null, null, null, null, null, 100
  );
  for v_item in
    select value from jsonb_array_elements(v_result #> '{data,items}')
  loop
    if coalesce((v_item ->> 'canReadCost')::boolean, true)
      or v_item -> 'unitCost' is distinct from 'null'::jsonb
      or v_item -> 'lineCost' is distinct from 'null'::jsonb
    then
      raise exception 'P2.2 purchase history leaked cost to non-cost actor';
    end if;
  end loop;
end;
$$;

rollback;
