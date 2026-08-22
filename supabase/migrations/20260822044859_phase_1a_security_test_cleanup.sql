create function app_private.cleanup_phase1a_test_users_impl(p_user_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  correlation_id uuid := gen_random_uuid();
  requested_count integer := coalesce(cardinality(p_user_ids), 0);
  matching_count integer;
  deleted_count integer;
begin
  if requested_count < 1 or requested_count > 20
    or array_position(p_user_ids, null) is not null
  then
    return app_private.command_error(
      'VALIDATION_ERROR',
      'Danh sách tài khoản test chưa hợp lệ.',
      correlation_id
    );
  end if;

  select count(*)::integer
  into matching_count
  from api.profiles as p
  where p.id = any(p_user_ids)
    and p.email like 'codex-phase1a-%@example.invalid';

  if matching_count <> requested_count then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Chỉ được dọn tài khoản test Phase 1A do chính runner tạo.',
      correlation_id
    );
  end if;

  if exists (
    select 1
    from api.profiles as p
    where p.created_by = any(p_user_ids)
      and not (p.id = any(p_user_ids))
  ) then
    return app_private.command_error(
      'INVALID_STATE',
      'Tài khoản test còn liên kết với hồ sơ ngoài phạm vi dọn dẹp.',
      correlation_id
    );
  end if;

  delete from api.user_notifications as n where n.user_id = any(p_user_ids);
  delete from app_private.user_permission_overrides as o
  where o.user_id = any(p_user_ids) or o.changed_by = any(p_user_ids);
  delete from app_private.command_deduplication as d
  where d.actor_id = any(p_user_ids);
  delete from app_private.audit_events as a
  where a.actor_id = any(p_user_ids) or a.entity_id = any(p_user_ids);
  delete from api.profiles as p where p.id = any(p_user_ids);
  get diagnostics deleted_count = row_count;

  return app_private.command_success(
    jsonb_build_object('deletedProfiles', deleted_count),
    correlation_id
  );
end;
$$;

create function api.cleanup_phase1a_test_users(p_user_ids uuid[])
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.cleanup_phase1a_test_users_impl(p_user_ids);
$$;

revoke all on function app_private.cleanup_phase1a_test_users_impl(uuid[])
  from public, anon, authenticated;
revoke all on function api.cleanup_phase1a_test_users(uuid[])
  from public, anon, authenticated;

grant execute on function app_private.cleanup_phase1a_test_users_impl(uuid[])
  to service_role;
grant execute on function api.cleanup_phase1a_test_users(uuid[])
  to service_role;
