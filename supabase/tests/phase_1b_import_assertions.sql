begin;

do $$
declare
  v_table text;
  v_function text;
begin
  foreach v_table in array array[
    'api.import_runs',
    'app_private.import_run_mappings',
    'app_private.import_run_rows',
    'app_private.import_run_errors',
    'app_private.import_run_chunks'
  ] loop
    if to_regclass(v_table) is null then
      raise exception '% missing', v_table;
    end if;
  end loop;

  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'api' and c.relname = 'import_runs'
      and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'api.import_runs must enable and force RLS';
  end if;

  if has_table_privilege('authenticated', 'api.import_runs', 'insert,update,delete') then
    raise exception 'browser must not write import_runs directly';
  end if;
  if not has_table_privilege('authenticated', 'api.import_runs', 'select') then
    raise exception 'authenticated needs actor-scoped import summary select';
  end if;
  if has_table_privilege('anon', 'api.import_runs', 'select,insert,update,delete') then
    raise exception 'anon must have no import_runs privileges';
  end if;

  foreach v_table in array array[
    'app_private.import_run_mappings',
    'app_private.import_run_rows',
    'app_private.import_run_errors',
    'app_private.import_run_chunks'
  ] loop
    if has_table_privilege('authenticated', v_table, 'select,insert,update,delete')
      or has_table_privilege('anon', v_table, 'select,insert,update,delete')
    then
      raise exception 'browser must have no direct private import privilege on %', v_table;
    end if;
  end loop;

  foreach v_function in array array[
    'api.create_import_run(text,integer,text,text,text,uuid)',
    'api.save_import_mapping(uuid,jsonb)',
    'api.validate_import_rows(uuid,integer,jsonb,boolean)',
    'api.get_import_validation_result(uuid,integer,integer)',
    'api.commit_import(uuid,uuid)',
    'api.get_import_result(uuid)',
    'api.list_import_runs(text,text,timestamp with time zone,uuid,integer)'
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

  if to_regprocedure('app_private.cleanup_expired_import_payloads()') is null then
    raise exception 'cleanup_expired_import_payloads missing';
  end if;
  if not exists (
    select 1 from cron.job
    where jobname = 'cleanup-expired-import-payloads'
      and active
      and command = 'select app_private.cleanup_expired_import_payloads();'
  ) then
    raise exception 'daily import cleanup cron missing';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'api' and tablename = 'import_runs'
      and indexdef like '%(actor_id, created_at DESC, id DESC)%'
  ) then
    raise exception 'actor import history index missing';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'api' and tablename = 'import_runs'
      and indexdef like '%(status, expires_at)%'
  ) then
    raise exception 'import cleanup index missing';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'api' and tablename = 'import_runs'
      and indexdef like '%UNIQUE%actor_id, target_type, idempotency_key%'
  ) then
    raise exception 'import idempotency index missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'api' and tablename = 'import_runs'
      and cmd = 'SELECT'
      and position('actor_id' in coalesce(qual, '')) > 0
      and position('uid()' in coalesce(qual, '')) > 0
  ) then
    raise exception 'actor-scoped import_runs select policy missing';
  end if;
end;
$$;

rollback;
