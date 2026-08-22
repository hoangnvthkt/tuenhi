begin;

do $$
declare
  routine_signature text;
begin
  if to_regclass('app_private.security_lock') is null then
    raise exception 'staff security lock missing';
  end if;

  if to_regclass('app_private.command_deduplication') is null then
    raise exception 'command deduplication missing';
  end if;

  foreach routine_signature in array array[
    'api.authorize_staff_admin()',
    'api.list_staff(timestamp with time zone,uuid,integer)',
    'api.finalize_staff_profile(uuid,text,text,text,uuid,uuid)',
    'api.set_staff_active(uuid,boolean,text,uuid)',
    'api.set_staff_role(uuid,text,text,uuid)',
    'api.set_staff_permission_override(uuid,text,text,text,uuid)',
    'api.get_effective_permissions(uuid)',
    'api.prepare_staff_password_reset(uuid,text,uuid)'
  ]
  loop
    if to_regprocedure(routine_signature) is null then
      raise exception 'staff routine missing: %', routine_signature;
    end if;
  end loop;

  if has_function_privilege(
    'anon',
    'api.authorize_staff_admin()',
    'execute'
  ) then
    raise exception 'anon must not authorize staff admin';
  end if;

  if has_function_privilege(
    'authenticated',
    'api.finalize_staff_profile(uuid,text,text,text,uuid,uuid)',
    'execute'
  ) then
    raise exception 'browser must not finalize staff profiles';
  end if;

  if not has_function_privilege(
    'service_role',
    'api.finalize_staff_profile(uuid,text,text,text,uuid,uuid)',
    'execute'
  ) then
    raise exception 'service role cannot finalize staff profiles';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'user_permission_overrides_guard'
      and not tgisinternal
  ) then
    raise exception 'owner-only permission override guard missing';
  end if;
end
$$;

rollback;
