do $$
begin
  if to_regclass('api.sales') is null
    or to_regclass('api.sale_lines') is null
    or to_regclass('api.payments') is null
    or to_regclass('api.store_settings') is null then
    raise exception 'Phase 1D operational tables are missing';
  end if;
  if to_regclass('app_private.sale_line_costs') is null
    or to_regclass('app_private.sale_invoice_store_snapshots') is null
    or to_regclass('app_private.sales_financial_events') is null then
    raise exception 'Phase 1D private financial tables are missing';
  end if;
  if not exists (select 1 from pg_class where oid = 'api.sales'::regclass and relrowsecurity and relforcerowsecurity) then
    raise exception 'api.sales must use forced RLS';
  end if;
  if has_table_privilege('authenticated', 'app_private.sale_line_costs', 'select')
    or has_table_privilege('authenticated', 'app_private.sales_financial_events', 'select') then
    raise exception 'browser role can read private sales cost data';
  end if;
  if not exists (select 1 from pg_proc where oid = 'api.complete_sale(uuid,bigint,text,uuid)'::regprocedure) then
    raise exception 'complete_sale contract is missing';
  end if;
  if not exists (select 1 from app_private.document_sequences where document_type = 'SALE' and prefix = 'HD') then
    raise exception 'sale document sequence is missing';
  end if;
  if not exists (select 1 from storage.buckets where id = 'store-branding' and public and file_size_limit = 2097152) then
    raise exception 'store-branding bucket contract is missing';
  end if;
end;
$$;
