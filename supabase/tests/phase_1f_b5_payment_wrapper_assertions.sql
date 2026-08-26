begin;

do $$
begin
  if not has_function_privilege(
    'authenticated',
    'app_private.complete_sale_with_payment_proof_impl(uuid,bigint,text,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must execute the private sale payment-proof implementation through its api wrapper';
  end if;

  if not has_function_privilege(
    'authenticated',
    'app_private.complete_sale_return_with_payment_proof_impl(uuid,bigint,jsonb,text,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must execute the private return payment-proof implementation through its api wrapper';
  end if;

  if (select prosecdef from pg_proc where oid = 'api.complete_sale(uuid,bigint,text,uuid,text)'::regprocedure) then
    raise exception 'api.complete_sale must remain security invoker';
  end if;

  if (select prosecdef from pg_proc where oid = 'api.complete_sale_return(uuid,bigint,jsonb,text,uuid,text)'::regprocedure) then
    raise exception 'api.complete_sale_return must remain security invoker';
  end if;

  if not has_function_privilege(
    'authenticated',
    'api.complete_sale(uuid,bigint,text,uuid,text)',
    'EXECUTE'
  )
  or not has_function_privilege(
    'authenticated',
    'api.complete_sale_return(uuid,bigint,jsonb,text,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must execute only the public api payment commands';
  end if;

  if exists (
    select 1
    from pg_proc
    where oid in (
      'app_private.complete_sale_with_payment_proof_impl(uuid,bigint,text,uuid,text)'::regprocedure,
      'app_private.complete_sale_return_with_payment_proof_impl(uuid,bigint,jsonb,text,uuid,text)'::regprocedure
    )
      and (
        not prosecdef
        or not coalesce(proconfig, '{}'::text[]) @> array['search_path=""']
      )
  ) then
    raise exception 'private payment-proof implementations must remain security definer with an empty search_path';
  end if;

  if has_function_privilege(
    'anon',
    'app_private.complete_sale_with_payment_proof_impl(uuid,bigint,text,uuid,text)',
    'EXECUTE'
  )
  or has_function_privilege(
    'anon',
    'app_private.complete_sale_return_with_payment_proof_impl(uuid,bigint,jsonb,text,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'anon must not execute private payment-proof implementations';
  end if;

  if has_table_privilege('authenticated', 'app_private.sales_financial_events', 'SELECT')
  or has_table_privilege('authenticated', 'app_private.inventory_cost_balances', 'SELECT') then
    raise exception 'authenticated must not receive direct cost or financial ledger read access';
  end if;
end;
$$;

rollback;
