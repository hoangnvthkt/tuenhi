do $$
begin
  if exists (
    select 1
    from (
      values
        ('api', 'products', 'min_stock_qty'),
        ('api', 'inventory_balances', 'on_hand_qty'),
        ('api', 'purchase_receipt_lines', 'received_qty'),
        ('api', 'stock_count_lines', 'system_qty_snapshot'),
        ('api', 'stock_count_lines', 'counted_qty'),
        ('api', 'stock_count_lines', 'difference_qty'),
        ('api', 'stock_movements', 'quantity_delta'),
        ('api', 'stock_movements', 'quantity_after'),
        ('api', 'sale_lines', 'quantity'),
        ('api', 'sale_return_lines', 'requested_qty'),
        ('api', 'sale_return_lines', 'accepted_qty')
    ) expected(table_schema, table_name, column_name)
    left join information_schema.columns column_info
      on column_info.table_schema = expected.table_schema
      and column_info.table_name = expected.table_name
      and column_info.column_name = expected.column_name
    where column_info.data_type <> 'numeric'
      or column_info.numeric_precision <> 18
      or column_info.numeric_scale <> 0
  ) then
    raise exception 'Operational quantity columns must be numeric(18,0)';
  end if;

  if exists (
    select 1
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'app_private'
      and procedure.proname in (
        'save_product_impl',
        'validate_catalog_import_payload',
        'validate_opening_import_payload',
        'save_purchase_receipt_draft_impl',
        'save_opening_stock_draft_impl',
        'save_sale_draft_impl',
        'create_sale_return_request_impl',
        'complete_sale_return_impl',
        'save_stock_count_impl'
      )
      and procedure.prosrc like '%[0-9]{1,3}%'
  ) then
    raise exception 'Operational command still accepts decimal quantity input';
  end if;

  if not exists (
    select 1
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'app_private'
      and procedure.oid = 'app_private.save_sale_draft_impl(uuid,bigint,uuid,uuid,jsonb,text,text,uuid)'::regprocedure
      and pg_get_functiondef(procedure.oid) like '%coalesce(item.quantity, '''') !~ ''^(0|[1-9][0-9]*)$''%'
  ) then
    raise exception 'Sale draft command must reject decimal JSON quantity';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'api'
      and table_name = 'legacy_sale_lines'
      and column_name = 'quantity'
      and numeric_scale = 3
  ) then
    raise exception 'Legacy archive quantity must remain unchanged';
  end if;

  if has_table_privilege('authenticated', 'app_private.sales_financial_events', 'select')
    or has_table_privilege('authenticated', 'app_private.inventory_cost_balances', 'select') then
    raise exception 'Browser role can read private cost data';
  end if;
end;
$$;
