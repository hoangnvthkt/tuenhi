begin;

do $$
declare
  v_table text;
  v_function text;
  v_missing_fk text;
begin
  foreach v_table in array array[
    'api.legacy_sales',
    'api.legacy_sale_lines',
    'app_private.legacy_opening_balance_suggestions'
  ] loop
    if to_regclass(v_table) is null then
      raise exception '% missing', v_table;
    end if;
  end loop;

  foreach v_table in array array['legacy_sales', 'legacy_sale_lines'] loop
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'api' and c.relname = v_table
        and c.relrowsecurity and c.relforcerowsecurity
    ) then
      raise exception 'api.% must enable and force RLS', v_table;
    end if;
    if has_table_privilege(
      'authenticated', format('api.%I', v_table), 'insert,update,delete'
    ) then
      raise exception 'browser must not write api.% directly', v_table;
    end if;
    if has_table_privilege(
      'anon', format('api.%I', v_table), 'select,insert,update,delete'
    ) then
      raise exception 'anon must not access api.%', v_table;
    end if;
  end loop;

  if has_table_privilege(
    'authenticated',
    'app_private.legacy_opening_balance_suggestions',
    'select,insert,update,delete'
  ) then
    raise exception 'opening suggestions must remain owner-command private';
  end if;

  foreach v_function in array array[
    'api.save_legacy_import_mapping(uuid,jsonb)',
    'api.validate_legacy_sales_import(uuid)',
    'api.commit_legacy_sales_import(uuid,uuid)',
    'api.get_legacy_sales(jsonb,date,uuid,integer)',
    'api.get_legacy_sale(uuid)'
  ] loop
    if to_regprocedure(v_function) is null then
      raise exception '% missing', v_function;
    end if;
    if not has_function_privilege('authenticated', v_function, 'execute') then
      raise exception 'authenticated execute missing for %', v_function;
    end if;
    if has_function_privilege('anon', v_function, 'execute') then
      raise exception 'anon execute must be revoked for %', v_function;
    end if;
  end loop;

  if not exists (
    select 1 from app_private.permission_definitions
    where code = 'legacy.sale.import' and owner_only
  ) or not exists (
    select 1 from app_private.permission_definitions
    where code = 'legacy.sale.read' and not owner_only
  ) then
    raise exception 'legacy permissions missing or incorrectly scoped';
  end if;

  if exists (
    select 1
    from pg_constraint con
    join pg_class source_table on source_table.oid = con.conrelid
    join pg_class target_table on target_table.oid = con.confrelid
    where con.contype = 'f'
      and (
        source_table.relname in (
          'sales', 'sale_lines', 'payments', 'stock_movements',
          'inventory_cost_movements', 'sale_returns', 'sale_return_lines'
        ) and target_table.relname in ('legacy_sales', 'legacy_sale_lines')
        or source_table.relname in ('legacy_sales', 'legacy_sale_lines')
          and target_table.relname in (
            'sales', 'sale_lines', 'payments', 'stock_movements',
            'inventory_cost_movements', 'sale_returns', 'sale_return_lines'
          )
      )
  ) then
    raise exception 'legacy archive must not reference operational ledgers';
  end if;

  select format('%I.%I (%s)', n.nspname, c.relname, con.conname)
  into v_missing_fk
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where con.contype = 'f'
    and n.nspname in ('api', 'app_private')
    and c.relname in (
      'legacy_sales', 'legacy_sale_lines',
      'legacy_opening_balance_suggestions'
    )
    and not exists (
      select 1 from pg_index i
      where i.indrelid = con.conrelid
        and i.indisvalid
        and (i.indkey::smallint[])[0:cardinality(con.conkey) - 1] = con.conkey
    )
  limit 1;
  if v_missing_fk is not null then
    raise exception 'legacy foreign key index missing: %', v_missing_fk;
  end if;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private'
      and p.proname like '%legacy%_impl'
      and (
        not p.prosecdef
        or not coalesce(p.proconfig, array[]::text[]) @> array['search_path=""']
      )
  ) then
    raise exception 'legacy implementations must be security definer with empty search_path';
  end if;
end;
$$;

rollback;
