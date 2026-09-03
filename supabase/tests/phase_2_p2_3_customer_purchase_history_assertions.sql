begin;

do $$
declare
  v_signature text;
  v_api_functions text[] := array[
    'api.get_customer_detail(uuid,date,date)',
    'api.list_customer_sales(uuid,date,date,timestamp with time zone,uuid,integer)',
    'api.list_customer_returns(uuid,date,date,timestamp with time zone,uuid,integer)',
    'api.list_customer_products(uuid,text,date,date,text,timestamp with time zone,uuid,integer)'
  ];
  v_private_functions text[] := array[
    'app_private.get_customer_detail_impl(uuid,date,date)',
    'app_private.list_customer_sales_impl(uuid,date,date,timestamp with time zone,uuid,integer)',
    'app_private.list_customer_returns_impl(uuid,date,date,timestamp with time zone,uuid,integer)',
    'app_private.list_customer_products_impl(uuid,text,date,date,text,timestamp with time zone,uuid,integer)'
  ];
begin
  foreach v_signature in array v_api_functions || v_private_functions loop
    if to_regprocedure(v_signature) is null then
      raise exception 'P2.3 function missing: %', v_signature;
    end if;
    if not has_function_privilege('authenticated', v_signature, 'execute')
      or has_function_privilege('anon', v_signature, 'execute')
      or has_function_privilege('public', v_signature, 'execute')
    then
      raise exception 'P2.3 function grants unsafe: %', v_signature;
    end if;
    if not coalesce(
      (select p.proconfig from pg_proc p where p.oid = v_signature::regprocedure),
      '{}'::text[]
    ) @> array['search_path=""'] then
      raise exception 'P2.3 function search_path unsafe: %', v_signature;
    end if;
    if (select p.provolatile from pg_proc p where p.oid = v_signature::regprocedure) <> 's' then
      raise exception 'P2.3 read function must be stable: %', v_signature;
    end if;
  end loop;

  foreach v_signature in array v_api_functions loop
    if (select p.prosecdef from pg_proc p where p.oid = v_signature::regprocedure) then
      raise exception 'P2.3 API wrapper must be security invoker: %', v_signature;
    end if;
  end loop;

  foreach v_signature in array v_private_functions loop
    if not (select p.prosecdef from pg_proc p where p.oid = v_signature::regprocedure) then
      raise exception 'P2.3 private implementation must be security definer: %', v_signature;
    end if;
  end loop;

  if to_regclass('api.sales_customer_completed_idx') is null then
    raise exception 'P2.3 customer sales index missing';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where grantee in ('anon', 'authenticated')
      and table_schema = 'app_private'
      and table_name in (
        'sales_financial_events',
        'sale_line_costs',
        'sale_return_line_costs'
      )
  ) then
    raise exception 'P2.3 must not expose private sales or return costs';
  end if;
end;
$$;

do $$
declare
  v_result jsonb;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  v_result := api.get_customer_detail(gen_random_uuid(), null, null);
  if coalesce((v_result ->> 'ok')::boolean, true)
    or v_result #>> '{error,code}' <> 'PERMISSION_DENIED'
  then
    raise exception 'P2.3 no-session detail must fail closed';
  end if;
end;
$$;

do $$
declare
  v_actor_id uuid;
  v_candidate_id uuid;
  v_customer_id uuid;
  v_result jsonb;
  v_expected_order_count integer;
  v_expected_cancel_count integer;
  v_expected_return_count integer;
  v_expected_completed numeric;
  v_expected_returned numeric;
  v_expected_cancelled numeric;
  v_expected_net numeric;
  v_expected_last timestamptz;
  v_item jsonb;
begin
  for v_candidate_id in
    select p.id
    from api.profiles p
    where p.is_active
    order by (p.role_template = 'OWNER') desc, p.created_at
  loop
    perform set_config('request.jwt.claim.sub', v_candidate_id::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    if (
      app_private.has_permission('customer.read')
      or app_private.has_permission('customer.manage')
    ) and (
      app_private.has_permission('sale.all.read')
      or app_private.has_permission('sale.own.read')
    ) then
      v_actor_id := v_candidate_id;
      exit;
    end if;
  end loop;

  if v_actor_id is null then
    raise notice 'P2.3 aggregate assertions skipped: no eligible actor';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', v_actor_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  select c.id into v_customer_id
  from api.customers c
  order by c.created_at, c.id
  limit 1;

  if v_customer_id is null then
    raise notice 'P2.3 aggregate assertions skipped: no customer';
    return;
  end if;

  v_result := api.get_customer_detail(
    v_customer_id, date '2026-01-02', date '2026-01-01'
  );
  if coalesce((v_result ->> 'ok')::boolean, true)
    or v_result #>> '{error,code}' <> 'VALIDATION_FAILED'
  then
    raise exception 'P2.3 detail must validate reversed date range';
  end if;

  v_result := api.list_customer_sales(
    v_customer_id, null, null, statement_timestamp(), null, 25
  );
  if coalesce((v_result ->> 'ok')::boolean, true)
    or v_result #>> '{error,code}' <> 'VALIDATION_FAILED'
  then
    raise exception 'P2.3 sale cursor must be complete';
  end if;

  v_result := api.list_customer_returns(
    v_customer_id, null, null, null, null, 0
  );
  if coalesce((v_result ->> 'ok')::boolean, true)
    or v_result #>> '{error,code}' <> 'VALIDATION_FAILED'
  then
    raise exception 'P2.3 return limit must be validated';
  end if;

  v_result := api.list_customer_products(
    v_customer_id, null, null, null, '-1', statement_timestamp(),
    gen_random_uuid(), 25
  );
  if coalesce((v_result ->> 'ok')::boolean, true)
    or v_result #>> '{error,code}' <> 'VALIDATION_FAILED'
  then
    raise exception 'P2.3 product cursor quantity must be canonical non-negative';
  end if;

  v_result := api.get_customer_detail(v_customer_id, null, null);
  if not coalesce((v_result ->> 'ok')::boolean, false) then
    raise exception 'P2.3 customer detail failed for existing customer';
  end if;

  with scoped_events as (
    select e.*, s.status
    from app_private.sales_financial_events e
    join api.sales s on s.id = e.sale_id
    where s.customer_id = v_customer_id
      and (
        app_private.has_permission('sale.all.read')
        or e.attributed_user_id = v_actor_id
      )
  )
  select
    count(distinct sale_id) filter (
      where event_type = 'SALE_COMPLETED' and status <> 'CANCELLED'
    )::integer,
    count(*) filter (where event_type = 'SALE_CANCELLED')::integer,
    count(*) filter (where event_type = 'RETURN_COMPLETED')::integer,
    coalesce(sum(net_revenue) filter (where event_type = 'SALE_COMPLETED'), 0),
    coalesce(-sum(net_revenue) filter (where event_type = 'RETURN_COMPLETED'), 0),
    coalesce(-sum(net_revenue) filter (where event_type = 'SALE_CANCELLED'), 0),
    coalesce(sum(net_revenue), 0),
    max(occurred_at) filter (
      where event_type = 'SALE_COMPLETED' and status <> 'CANCELLED'
    )
  into
    v_expected_order_count,
    v_expected_cancel_count,
    v_expected_return_count,
    v_expected_completed,
    v_expected_returned,
    v_expected_cancelled,
    v_expected_net,
    v_expected_last
  from scoped_events;

  if (v_result #>> '{data,purchaseSummary,orderCount}')::integer
      <> v_expected_order_count
    or (v_result #>> '{data,purchaseSummary,cancelledOrderCount}')::integer
      <> v_expected_cancel_count
    or (v_result #>> '{data,purchaseSummary,completedReturnCount}')::integer
      <> v_expected_return_count
    or (v_result #>> '{data,purchaseSummary,completedSalesNet}')::numeric
      <> v_expected_completed
    or (v_result #>> '{data,purchaseSummary,returnedTotal}')::numeric
      <> v_expected_returned
    or (v_result #>> '{data,purchaseSummary,cancelledTotal}')::numeric
      <> v_expected_cancelled
    or (v_result #>> '{data,purchaseSummary,netSpend}')::numeric
      <> v_expected_net
    or (v_result #>> '{data,purchaseSummary,lastPurchaseAt}')::timestamptz
      is distinct from v_expected_last
  then
    raise exception 'P2.3 customer financial summary mismatch';
  end if;

  v_result := api.list_customer_sales(
    v_customer_id, null, null, null, null, 100
  );
  if not coalesce((v_result ->> 'ok')::boolean, false) then
    raise exception 'P2.3 customer sales failed';
  end if;
  for v_item in select value from jsonb_array_elements(v_result #> '{data,items}')
  loop
    if not exists (
      select 1 from api.sales s
      where s.id = (v_item ->> 'saleId')::uuid
        and s.customer_id = v_customer_id
        and s.status <> 'DRAFT'
    ) then
      raise exception 'P2.3 sales exposed draft or another customer';
    end if;
  end loop;

  v_result := api.list_customer_returns(
    v_customer_id, null, null, null, null, 100
  );
  if not coalesce((v_result ->> 'ok')::boolean, false) then
    raise exception 'P2.3 customer returns failed';
  end if;
  for v_item in select value from jsonb_array_elements(v_result #> '{data,items}')
  loop
    if not exists (
      select 1
      from api.sale_returns r
      join api.sales s on s.id = r.original_sale_id
      where r.id = (v_item ->> 'returnId')::uuid
        and r.status = 'COMPLETED'
        and s.customer_id = v_customer_id
    ) then
      raise exception 'P2.3 returns exposed unsettled or another customer';
    end if;
  end loop;

  v_result := api.get_customer_detail(gen_random_uuid(), null, null);
  if coalesce((v_result ->> 'ok')::boolean, true)
    or v_result #>> '{error,code}' <> 'REFERENCE_NOT_FOUND'
  then
    raise exception 'P2.3 missing customer must return safe not-found';
  end if;
end;
$$;

do $$
declare
  v_actor_id uuid;
  v_candidate_id uuid;
  v_customer_id uuid;
  v_result jsonb;
  v_item jsonb;
  v_first_id uuid;
  v_next_id uuid;
  v_next_at timestamptz;
begin
  for v_candidate_id in
    select p.id from api.profiles p where p.is_active order by p.created_at
  loop
    perform set_config('request.jwt.claim.sub', v_candidate_id::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    if (
      app_private.has_permission('customer.read')
      or app_private.has_permission('customer.manage')
    ) and app_private.has_permission('sale.own.read')
      and not app_private.has_permission('sale.all.read')
    then
      v_actor_id := v_candidate_id;
      exit;
    end if;
  end loop;

  if v_actor_id is null then
    raise notice 'P2.3 OWN isolation assertion skipped: no eligible actor';
    return;
  end if;

  select c.id into v_customer_id
  from api.customers c
  where exists (
    select 1 from api.sales s where s.customer_id = c.id
  )
  order by c.created_at
  limit 1;
  if v_customer_id is null then
    raise notice 'P2.3 OWN isolation assertion skipped: no customer sales';
    return;
  end if;

  v_result := api.get_customer_detail(v_customer_id, null, null);
  if not coalesce((v_result ->> 'ok')::boolean, false)
    or v_result #>> '{data,salesScope}' <> 'OWN'
  then
    raise exception 'P2.3 OWN actor did not receive OWN scope';
  end if;

  v_result := api.list_customer_sales(
    v_customer_id, null, null, null, null, 100
  );
  for v_item in select value from jsonb_array_elements(v_result #> '{data,items}')
  loop
    if not exists (
      select 1 from api.sales s
      where s.id = (v_item ->> 'saleId')::uuid
        and s.created_by = v_actor_id
    ) then
      raise exception 'P2.3 OWN actor received another actor sale';
    end if;
  end loop;

  v_result := api.list_customer_sales(
    v_customer_id, null, null, null, null, 1
  );
  if v_result #> '{data,nextCursor}' is distinct from 'null'::jsonb then
    v_first_id := (v_result #>> '{data,items,0,saleId}')::uuid;
    v_next_at := (v_result #>> '{data,nextCursor,completedAt}')::timestamptz;
    v_next_id := (v_result #>> '{data,nextCursor,saleId}')::uuid;
    v_result := api.list_customer_sales(
      v_customer_id, null, null, v_next_at, v_next_id, 1
    );
    if (v_result #>> '{data,items,0,saleId}')::uuid = v_first_id then
      raise exception 'P2.3 customer sales cursor repeated a row';
    end if;
  end if;
end;
$$;

do $$
declare
  v_actor_id uuid;
  v_candidate_id uuid;
  v_customer_id uuid;
  v_result jsonb;
begin
  for v_candidate_id in
    select p.id from api.profiles p where p.is_active order by p.created_at
  loop
    perform set_config('request.jwt.claim.sub', v_candidate_id::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    if (
      app_private.has_permission('customer.read')
      or app_private.has_permission('customer.manage')
    ) and not app_private.has_permission('sale.all.read')
      and not app_private.has_permission('sale.own.read')
    then
      v_actor_id := v_candidate_id;
      exit;
    end if;
  end loop;

  if v_actor_id is null then
    raise notice 'P2.3 profile-only assertion skipped: no eligible actor';
    return;
  end if;

  select c.id into v_customer_id from api.customers c order by c.created_at limit 1;
  if v_customer_id is null then
    raise notice 'P2.3 profile-only assertion skipped: no customer';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', v_actor_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  v_result := api.get_customer_detail(v_customer_id, null, null);
  if not coalesce((v_result ->> 'ok')::boolean, false)
    or v_result #>> '{data,salesScope}' <> 'NONE'
    or v_result #> '{data,purchaseSummary}' is distinct from 'null'::jsonb
  then
    raise exception 'P2.3 profile-only actor received transaction data';
  end if;
end;
$$;

rollback;
