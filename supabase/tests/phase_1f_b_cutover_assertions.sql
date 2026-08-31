do $$
declare
  signature text;
  cleanup_signature text;
  checked_role text;
  current_mode text;
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
    'app_private.record_staff_access_waiver_impl(text)',
    'app_private.get_staff_access_capability_impl()',
    'app_private.transition_project_lifecycle_impl(text,timestamp with time zone)',
    'api.get_project_lifecycle()',
    'api.record_auth_hardening()',
    'api.record_staff_access_waiver(text)',
    'api.get_staff_access_capability()',
    'api.transition_project_lifecycle(text,timestamp with time zone)'
  ] loop
    if to_regprocedure(signature) is null then
      raise exception 'missing lifecycle function: %', signature;
    end if;
  end loop;

  if has_function_privilege('authenticated', 'api.get_project_lifecycle()', 'execute')
    or has_function_privilege('authenticated', 'api.record_auth_hardening()', 'execute')
    or has_function_privilege('authenticated', 'api.record_staff_access_waiver(text)', 'execute')
    or has_function_privilege('authenticated', 'api.transition_project_lifecycle(text,timestamp with time zone)', 'execute')
    or not has_function_privilege('service_role', 'api.get_project_lifecycle()', 'execute')
    or not has_function_privilege('service_role', 'api.record_auth_hardening()', 'execute')
    or not has_function_privilege('service_role', 'api.record_staff_access_waiver(text)', 'execute')
    or not has_function_privilege('service_role', 'api.transition_project_lifecycle(text,timestamp with time zone)', 'execute')
    or not has_function_privilege('authenticated', 'api.get_staff_access_capability()', 'execute')
  then
    raise exception 'lifecycle function grants are unsafe';
  end if;

  if not exists (
    select 1
    from app_private.project_lifecycle
    where id = true
      and mode in ('PRE_PRODUCTION', 'OWNER_PILOT', 'PRODUCTION')
      and staff_access_policy in (
        'BLOCKED',
        'OWNER_WAIVER',
        'LEAKED_PASSWORD_PROTECTED'
      )
  ) then
    raise exception 'lifecycle policy is invalid';
  end if;

  select mode
  into current_mode
  from app_private.project_lifecycle
  where id = true;

  foreach signature in array array[
    'app_private.record_auth_hardening_impl()',
    'app_private.record_staff_access_waiver_impl(text)',
    'app_private.transition_project_lifecycle_impl(text,timestamp with time zone)',
    'api.record_auth_hardening()',
    'api.record_staff_access_waiver(text)',
    'api.transition_project_lifecycle(text,timestamp with time zone)'
  ] loop
    foreach checked_role in array array['anon', 'authenticated'] loop
      if has_function_privilege(checked_role, signature, 'execute') then
        raise exception 'lifecycle mutation grant is unsafe: role=%, function=%',
          checked_role,
          signature;
      end if;
    end loop;
  end loop;

  foreach cleanup_signature in array array[
    'app_private.cleanup_phase1a_test_users_impl(uuid[])',
    'app_private.cleanup_phase1b_test_users_impl(uuid[])',
    'app_private.cleanup_phase1c_test_users_impl(uuid[])',
    'app_private.cleanup_phase1e_test_users_impl(uuid[])',
    'app_private.cleanup_phase1f_test_users_impl(uuid[])',
    'api.cleanup_phase1a_test_users(uuid[])',
    'api.cleanup_phase1b_test_users(uuid[])',
    'api.cleanup_phase1c_test_users(uuid[])',
    'api.cleanup_phase1e_test_users(uuid[])',
    'api.cleanup_phase1f_test_users(uuid[])'
  ] loop
    if to_regprocedure(cleanup_signature) is null then
      raise exception 'missing cleanup function: %', cleanup_signature;
    end if;

    foreach checked_role in array array['anon', 'authenticated'] loop
      if has_function_privilege(checked_role, cleanup_signature, 'execute') then
        raise exception 'cleanup function grant is unsafe: role=%, function=%',
          checked_role,
          cleanup_signature;
      end if;
    end loop;

    if current_mode in ('OWNER_PILOT', 'PRODUCTION')
      and has_function_privilege(
        'service_role',
        cleanup_signature,
        'execute'
      )
    then
      raise exception 'cleanup function remains enabled after cutover: %',
        cleanup_signature;
    end if;
  end loop;

  if position('STAFF_ACCESS_POLICY_REQUIRED' in pg_get_functiondef(
    'app_private.finalize_staff_profile_impl(uuid,text,text,text,uuid,uuid)'::regprocedure
  )) = 0 then
    raise exception 'staff finalization missing access-policy guard';
  end if;

  if position('staff_access_policy not in' in pg_get_functiondef(
    'app_private.transition_project_lifecycle_impl(text,timestamp with time zone)'::regprocedure
  )) = 0 then
    raise exception 'production transition must require an approved staff policy';
  end if;

  if position('cutoverAt' in pg_get_functiondef(
    'app_private.get_staff_access_capability_impl()'::regprocedure
  )) > 0 then
    raise exception 'staff capability must not expose private lifecycle timestamps';
  end if;
end;
$$;
