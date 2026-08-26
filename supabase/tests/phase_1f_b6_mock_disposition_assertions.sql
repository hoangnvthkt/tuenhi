begin;

do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'api.get_owner_pilot_mock_manifest(boolean,boolean)',
    'api.dispose_owner_pilot_mock_data(text,boolean,boolean)',
    'api.finalize_owner_pilot_mock_storage_disposal(uuid,jsonb)',
    'api.get_owner_pilot_real_data_verification(text)'
  ] loop
    if to_regprocedure(function_signature) is null then
      raise exception 'missing service-only B6 API function: %', function_signature;
    end if;
    if not has_function_privilege('service_role', function_signature, 'EXECUTE')
      or has_function_privilege('authenticated', function_signature, 'EXECUTE')
      or has_function_privilege('anon', function_signature, 'EXECUTE') then
      raise exception 'B6 API function has an invalid grant: %', function_signature;
    end if;
    if (select prosecdef from pg_proc where oid = function_signature::regprocedure) then
      raise exception 'B6 API wrapper must remain security invoker: %', function_signature;
    end if;
  end loop;

  foreach function_signature in array array[
    'app_private.get_owner_pilot_mock_manifest_impl(boolean,boolean)',
    'app_private.dispose_owner_pilot_mock_data_impl(text,boolean,boolean)',
    'app_private.finalize_owner_pilot_mock_storage_disposal_impl(uuid,jsonb)',
    'app_private.get_owner_pilot_real_data_verification_impl(text)'
  ] loop
    if to_regprocedure(function_signature) is null then
      raise exception 'missing B6 private implementation: %', function_signature;
    end if;
    if not (select prosecdef from pg_proc where oid = function_signature::regprocedure)
      or not coalesce((select proconfig from pg_proc where oid = function_signature::regprocedure), '{}'::text[]) @> array['search_path=""'] then
      raise exception 'B6 private implementation must use security definer with empty search_path: %', function_signature;
    end if;
    if has_function_privilege('authenticated', function_signature, 'EXECUTE')
      or has_function_privilege('anon', function_signature, 'EXECUTE') then
      raise exception 'browser role may not execute B6 private implementation: %', function_signature;
    end if;
  end loop;

  if to_regclass('app_private.owner_pilot_mock_disposition_receipts') is null then
    raise exception 'missing owner-pilot mock disposition receipt table';
  end if;

  if has_table_privilege('authenticated', 'app_private.owner_pilot_mock_disposition_receipts', 'SELECT')
    or has_table_privilege('authenticated', 'app_private.sales_financial_events', 'SELECT')
    or has_table_privilege('authenticated', 'app_private.inventory_cost_balances', 'SELECT') then
    raise exception 'browser role must not read B6 receipt, ledger, or cost data';
  end if;
end;
$$;

rollback;
