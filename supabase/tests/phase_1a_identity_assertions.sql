begin;

do $$
declare
  permission_count integer;
  owner_only_count integer;
begin
  if to_regnamespace('api') is null then
    raise exception 'api schema missing';
  end if;

  if to_regnamespace('app_private') is null then
    raise exception 'app_private schema missing';
  end if;

  if to_regclass('api.profiles') is null then
    raise exception 'api.profiles missing';
  end if;

  if to_regclass('app_private.permission_definitions') is null then
    raise exception 'permission_definitions missing';
  end if;

  if to_regclass('app_private.role_default_permissions') is null then
    raise exception 'role_default_permissions missing';
  end if;

  if to_regclass('app_private.user_permission_overrides') is null then
    raise exception 'user_permission_overrides missing';
  end if;

  if to_regclass('app_private.audit_events') is null then
    raise exception 'audit_events missing';
  end if;

  if to_regprocedure('app_private.has_active_profile(boolean)') is null then
    raise exception 'has_active_profile missing';
  end if;

  if to_regprocedure('app_private.has_permission(text)') is null then
    raise exception 'has_permission missing';
  end if;

  if to_regprocedure('app_private.get_my_session_context_impl()') is null then
    raise exception 'get_my_session_context_impl missing';
  end if;

  if to_regprocedure('api.get_my_session_context()') is null then
    raise exception 'get_my_session_context missing';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'api'
      and c.relname = 'profiles'
      and c.relrowsecurity
      and c.relforcerowsecurity
  ) then
    raise exception 'profiles RLS not enabled and forced';
  end if;

  if has_schema_privilege('anon', 'api', 'usage') then
    raise exception 'anon must not use api';
  end if;

  if has_table_privilege(
    'authenticated',
    'app_private.permission_definitions',
    'select'
  ) then
    raise exception 'authenticated must not read app_private tables';
  end if;

  if has_table_privilege('authenticated', 'api.profiles', 'select') then
    raise exception 'authenticated must not read profiles directly';
  end if;

  if not has_function_privilege(
    'authenticated',
    'api.get_my_session_context()',
    'execute'
  ) then
    raise exception 'authenticated cannot execute session wrapper';
  end if;

  select count(*), count(*) filter (where owner_only)
  into permission_count, owner_only_count
  from app_private.permission_definitions;

  if permission_count <> 31 then
    raise exception 'expected 31 permissions, got %', permission_count;
  end if;

  if owner_only_count <> 11 then
    raise exception 'expected 11 owner-only permissions, got %', owner_only_count;
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'api'
      and tablename = 'profiles'
      and indexname = 'profiles_active_role_idx'
  ) then
    raise exception 'profiles active-role index missing';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'app_private'
      and tablename = 'audit_events'
      and indexname = 'audit_events_actor_occurred_idx'
  ) then
    raise exception 'audit actor index missing';
  end if;
end
$$;

rollback;
