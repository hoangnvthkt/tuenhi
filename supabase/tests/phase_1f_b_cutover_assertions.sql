do $$
declare
  signature text;
begin
  if to_regclass('app_private.project_lifecycle') is null then
    raise exception 'project_lifecycle missing';
  end if;

  if not exists (
    select 1 from pg_tables
    where schemaname = 'app_private' and tablename = 'project_lifecycle'
      and rowsecurity
  ) then
    raise exception 'project_lifecycle must have RLS';
  end if;

  foreach signature in array array[
    'app_private.get_project_lifecycle_impl()',
    'app_private.record_auth_hardening_impl()',
    'app_private.transition_project_lifecycle_impl(text,timestamp with time zone)',
    'api.get_project_lifecycle()',
    'api.record_auth_hardening()',
    'api.transition_project_lifecycle(text,timestamp with time zone)'
  ] loop
    if to_regprocedure(signature) is null then
      raise exception 'missing lifecycle function: %', signature;
    end if;
  end loop;

  if has_function_privilege('authenticated', 'api.get_project_lifecycle()', 'execute')
    or has_function_privilege('authenticated', 'api.record_auth_hardening()', 'execute')
    or has_function_privilege('authenticated', 'api.transition_project_lifecycle(text,timestamp with time zone)', 'execute')
    or not has_function_privilege('service_role', 'api.get_project_lifecycle()', 'execute')
    or not has_function_privilege('service_role', 'api.record_auth_hardening()', 'execute')
    or not has_function_privilege('service_role', 'api.transition_project_lifecycle(text,timestamp with time zone)', 'execute')
  then
    raise exception 'lifecycle function grants are unsafe';
  end if;

  if (select mode from app_private.project_lifecycle where id = true) <> 'PRE_PRODUCTION' then
    raise exception 'new lifecycle must start in PRE_PRODUCTION';
  end if;

  if position('PRODUCTION_AUTH_HARDENING_REQUIRED' in pg_get_functiondef(
    'app_private.finalize_staff_profile_impl(uuid,text,text,text,uuid,uuid)'::regprocedure
  )) = 0 then
    raise exception 'staff finalization missing owner-pilot hardening guard';
  end if;
end;
$$;
