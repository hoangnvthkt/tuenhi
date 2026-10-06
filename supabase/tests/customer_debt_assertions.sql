-- Read-only release checks, never creates financial/test rows.
begin read only;
do $$
declare relation_id oid; function_id oid; definition text;
begin
 foreach relation_id in array array[
  'app_private.customer_debt_accounts'::regclass::oid,
  'app_private.sale_payment_allocations'::regclass::oid,
  'app_private.customer_debt_entries'::regclass::oid,
  'app_private.customer_debt_allocations'::regclass::oid
 ] loop
  if not exists(select 1 from pg_class where oid=relation_id and relrowsecurity and relforcerowsecurity) then raise exception 'DEBT_RLS_REQUIRED'; end if;
  if has_table_privilege('anon',relation_id,'SELECT') or has_table_privilege('authenticated',relation_id,'SELECT')
   or has_table_privilege('authenticated',relation_id,'INSERT') or has_table_privilege('authenticated',relation_id,'UPDATE')
   or has_table_privilege('authenticated',relation_id,'DELETE') then raise exception 'PRIVATE_DEBT_TABLE_EXPOSED'; end if;
 end loop;
 foreach function_id in array array[
  'app_private.complete_sale_with_allocations_impl(uuid,bigint,text,text,uuid,text)'::regprocedure::oid,
  'app_private.get_customer_debt_impl(uuid)'::regprocedure::oid,
  'app_private.list_customer_debt_entries_impl(uuid,timestamptz,uuid,integer)'::regprocedure::oid,
  'app_private.change_customer_debt_impl(uuid,bigint,text,text,text,text,uuid,text)'::regprocedure::oid,
  'app_private.cancel_sale_impl(uuid,bigint,text,uuid)'::regprocedure::oid,
  'app_private.get_sale_invoice_impl(uuid)'::regprocedure::oid,
  'app_private.get_sale_return_impl(uuid)'::regprocedure::oid
 ] loop
  if not exists(select 1 from pg_proc where oid=function_id and prosecdef and proconfig @> array['search_path=""']) then raise exception 'DEBT_FUNCTION_SECURITY_INVALID'; end if;
  if has_function_privilege('anon',function_id,'EXECUTE') or not has_function_privilege('authenticated',function_id,'EXECUTE') then raise exception 'DEBT_FUNCTION_GRANTS_INVALID'; end if;
 end loop;
 foreach function_id in array array[
  'api.complete_sale_with_allocations(uuid,bigint,text,text,uuid,text)'::regprocedure::oid,
  'api.get_customer_debt(uuid)'::regprocedure::oid,
  'api.list_customer_debt_entries(uuid,timestamptz,uuid,integer)'::regprocedure::oid,
  'api.collect_customer_debt(uuid,bigint,text,text,text,uuid)'::regprocedure::oid,
  'api.adjust_customer_debt(uuid,bigint,text,text,uuid)'::regprocedure::oid
 ] loop
  if not exists(select 1 from pg_proc where oid=function_id and not prosecdef) then raise exception 'DEBT_API_MUST_BE_INVOKER'; end if;
  if has_function_privilege('anon',function_id,'EXECUTE') or not has_function_privilege('authenticated',function_id,'EXECUTE') then raise exception 'DEBT_API_GRANTS_INVALID'; end if;
 end loop;
 definition:=pg_get_functiondef('app_private.get_my_command_outcome_impl(text,uuid)'::regprocedure);
 if position('customer.debt.collect' in definition)=0 or position('customer.debt.adjust' in definition)=0 then raise exception 'DEBT_OUTCOME_SUPPORT_MISSING'; end if;
end $$;
rollback;
