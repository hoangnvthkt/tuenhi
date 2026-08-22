begin;

do $$
begin
  if to_regprocedure(
    'app_private.complete_initial_password_change_impl(uuid)'
  ) is null then
    raise exception 'password change finalizer implementation missing';
  end if;

  if to_regprocedure('api.complete_initial_password_change(uuid)') is null then
    raise exception 'password change finalizer wrapper missing';
  end if;

  if has_function_privilege(
    'anon',
    'api.complete_initial_password_change(uuid)',
    'execute'
  ) then
    raise exception 'anon must not execute password finalizer';
  end if;

  if has_function_privilege(
    'authenticated',
    'api.complete_initial_password_change(uuid)',
    'execute'
  ) then
    raise exception 'authenticated must not execute password finalizer';
  end if;

  if not has_function_privilege(
    'service_role',
    'api.complete_initial_password_change(uuid)',
    'execute'
  ) then
    raise exception 'service_role cannot execute password finalizer';
  end if;
end
$$;

rollback;
