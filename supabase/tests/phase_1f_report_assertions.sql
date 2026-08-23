do $$
begin
  if not exists (select 1 from pg_proc where oid = 'api.get_operational_dashboard(date,date)'::regprocedure)
    or not exists (select 1 from pg_proc where oid = 'api.get_my_sales_summary(date,date)'::regprocedure)
    or not exists (select 1 from pg_proc where oid = 'api.get_revenue_report(date,date,text)'::regprocedure)
    or not exists (select 1 from pg_proc where oid = 'api.get_owner_dashboard(date,date)'::regprocedure)
    or not exists (select 1 from pg_proc where oid = 'api.get_profit_report(date,date,timestamptz,uuid,integer)'::regprocedure)
    or not exists (select 1 from pg_proc where oid = 'api.get_inventory_valuation(text,text,uuid,integer)'::regprocedure) then
    raise exception 'Phase 1F report RPC contract is missing';
  end if;
  if not exists (select 1 from pg_proc where oid = 'api.cleanup_phase1f_test_users(uuid[])'::regprocedure)
    or has_function_privilege('authenticated', 'api.cleanup_phase1f_test_users(uuid[])', 'execute') then
    raise exception 'Phase 1F synthetic-data cleanup contract is invalid';
  end if;
  if has_function_privilege('anon', 'api.get_revenue_report(date,date,text)', 'execute')
    or has_function_privilege('anon', 'api.get_profit_report(date,date,timestamptz,uuid,integer)', 'execute') then
    raise exception 'anonymous role can execute a report RPC';
  end if;
  if has_table_privilege('authenticated', 'app_private.sales_financial_events', 'select')
    or has_function_privilege('authenticated', 'app_private.revenue_report_data(date,date,uuid)', 'execute') then
    raise exception 'browser role can access private financial report objects';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'app_private' and indexname = 'sales_financial_events_occurred_idx')
    or not exists (select 1 from pg_indexes where schemaname = 'app_private' and indexname = 'sales_financial_events_actor_occurred_idx')
    or not exists (select 1 from pg_indexes where schemaname = 'api' and indexname = 'sale_returns_status_updated_idx') then
    raise exception 'Phase 1F reporting indexes are missing';
  end if;
  if position('legacy_sales' in pg_get_functiondef('app_private.revenue_report_data(date,date,uuid)'::regprocedure)) > 0 then
    raise exception 'official revenue report must not reference legacy_sales';
  end if;
end;
$$;
