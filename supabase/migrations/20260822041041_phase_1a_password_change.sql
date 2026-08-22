create function app_private.complete_initial_password_change_impl(
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_profile api.profiles%rowtype;
  correlation_id uuid := gen_random_uuid();
begin
  select p.*
  into target_profile
  from api.profiles as p
  where p.id = p_user_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'data', null,
      'error', jsonb_build_object(
        'code', 'AUTH_REQUIRED',
        'message', 'Tài khoản chưa được cấp hồ sơ truy cập.',
        'details', '{}'::jsonb
      ),
      'correlationId', correlation_id
    );
  end if;

  if not target_profile.is_active then
    return jsonb_build_object(
      'ok', false,
      'data', null,
      'error', jsonb_build_object(
        'code', 'ACCOUNT_INACTIVE',
        'message', 'Tài khoản đã bị khóa.',
        'details', '{}'::jsonb
      ),
      'correlationId', correlation_id
    );
  end if;

  update api.profiles
  set
    must_change_password = false,
    last_login_at = now(),
    updated_at = now()
  where id = p_user_id;

  if target_profile.must_change_password then
    insert into app_private.audit_events (
      actor_id,
      action,
      entity_type,
      entity_id,
      before_data,
      after_data,
      correlation_id
    )
    values (
      p_user_id,
      'auth.initial_password_changed',
      'profile',
      p_user_id,
      jsonb_build_object('mustChangePassword', true),
      jsonb_build_object('mustChangePassword', false),
      correlation_id
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'userId', p_user_id,
      'mustChangePassword', false
    ),
    'error', null,
    'correlationId', correlation_id
  );
end;
$$;

create function api.complete_initial_password_change(p_user_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.complete_initial_password_change_impl(p_user_id);
$$;

revoke all on function app_private.complete_initial_password_change_impl(uuid)
  from public, anon, authenticated;
revoke all on function api.complete_initial_password_change(uuid)
  from public, anon, authenticated;

grant execute on function app_private.complete_initial_password_change_impl(uuid)
  to service_role;
grant execute on function api.complete_initial_password_change(uuid)
  to service_role;
