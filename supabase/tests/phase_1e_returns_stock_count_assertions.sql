do $$
begin
  if to_regclass('api.sale_returns') is null
    or to_regclass('api.sale_return_lines') is null
    or to_regclass('api.sale_return_payments') is null then
    raise exception 'Phase 1E return tables are missing';
  end if;
  if to_regclass('app_private.sale_return_line_costs') is null
    or to_regclass('app_private.stock_count_adjustment_costs') is null then
    raise exception 'Phase 1E private cost tables are missing';
  end if;
  if not exists (
    select 1 from app_private.document_sequences
    where document_type = 'SALE_RETURN' and prefix = 'TH'
  ) then
    raise exception 'sale return document sequence is missing';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'api.stock_counts'::regclass
      and pg_get_constraintdef(oid) like '%PERIODIC%'
  ) then
    raise exception 'stock count must allow PERIODIC';
  end if;
  if has_table_privilege('authenticated', 'app_private.sale_return_line_costs', 'select')
    or has_table_privilege('authenticated', 'app_private.stock_count_adjustment_costs', 'select')
    or has_table_privilege('authenticated', 'app_private.sales_financial_events', 'select') then
    raise exception 'browser role can read Phase 1E private cost data';
  end if;
  if not exists (select 1 from pg_proc where oid = 'api.lookup_sale_for_return(text)'::regprocedure)
    or not exists (select 1 from pg_proc where oid = 'api.complete_sale_return(uuid,bigint,jsonb,text,uuid)'::regprocedure)
    or not exists (select 1 from pg_proc where oid = 'api.cancel_sale(uuid,bigint,text,uuid)'::regprocedure)
    or not exists (select 1 from pg_proc where oid = 'api.post_stock_count(uuid,bigint,jsonb,uuid)'::regprocedure) then
    raise exception 'Phase 1E public command contract is missing';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'api.stock_movements'::regclass
      and pg_get_constraintdef(oid) like '%SALE_RETURN%'
      and pg_get_constraintdef(oid) like '%STOCK_ADJUSTMENT%'
  ) then
    raise exception 'stock movement types are incomplete';
  end if;
end;
$$;
