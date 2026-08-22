create or replace function app_private.set_staff_active_impl(
  p_user_id uuid,
  p_active boolean,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  correlation_id uuid := gen_random_uuid();
  target_profile api.profiles%rowtype;
  prior_response jsonb;
  result_response jsonb;
  active_owner_count integer;
begin
  if v_actor_id is null or not app_private.has_permission('staff.manage') then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền thực hiện thao tác này.',
      correlation_id
    );
  end if;

  if length(btrim(coalesce(p_reason, ''))) not between 1 and 500 then
    return app_private.command_error(
      'VALIDATION_ERROR',
      'Vui lòng nhập lý do thay đổi trạng thái.',
      correlation_id
    );
  end if;

  perform 1 from app_private.security_lock where id = 1 for update;

  select d.response
  into prior_response
  from app_private.command_deduplication as d
  where d.actor_id = v_actor_id
    and d.command_name = 'staff.set_active'
    and d.idempotency_key = p_idempotency_key;
  if found then return prior_response; end if;

  select p.*
  into target_profile
  from api.profiles as p
  where p.id = p_user_id
  for update;

  if not found then
    return app_private.command_error(
      'STAFF_NOT_FOUND',
      'Không tìm thấy tài khoản nhân viên.',
      correlation_id
    );
  end if;

  if target_profile.is_active = p_active then
    result_response := app_private.command_success(
      jsonb_build_object('userId', p_user_id, 'isActive', p_active),
      correlation_id
    );
  else
    if target_profile.role_template = 'OWNER'
      and target_profile.is_active
      and not p_active
    then
      select count(*)::integer
      into active_owner_count
      from api.profiles as p
      where p.role_template = 'OWNER' and p.is_active;

      if active_owner_count <= 1 then
        return app_private.command_error(
          'LAST_ACTIVE_OWNER',
          'Hệ thống phải luôn còn ít nhất một chủ cửa hàng hoạt động.',
          correlation_id
        );
      end if;
    end if;

    update api.profiles
    set is_active = p_active, updated_at = now()
    where id = p_user_id;

    insert into app_private.audit_events (
      actor_id,
      action,
      entity_type,
      entity_id,
      before_data,
      after_data,
      metadata,
      correlation_id
    ) values (
      v_actor_id,
      case when p_active then 'staff.reactivated' else 'staff.deactivated' end,
      'profile',
      p_user_id,
      jsonb_build_object('isActive', target_profile.is_active),
      jsonb_build_object('isActive', p_active),
      jsonb_build_object('reason', btrim(p_reason)),
      correlation_id
    );

    insert into api.user_notifications (
      user_id,
      severity,
      category,
      title,
      message,
      entity_type,
      entity_id,
      dedupe_key,
      correlation_id
    ) values (
      p_user_id,
      case when p_active then 'SUCCESS' else 'WARNING' end,
      'ACCOUNT',
      case when p_active then 'Tài khoản đã được mở lại' else 'Tài khoản đã bị khóa' end,
      case
        when p_active then 'Bạn có thể đăng nhập và tiếp tục sử dụng hệ thống.'
        else 'Liên hệ chủ cửa hàng nếu bạn cần hỗ trợ.'
      end,
      'profile',
      p_user_id,
      'staff.active:' || p_idempotency_key::text,
      correlation_id
    );

    result_response := app_private.command_success(
      jsonb_build_object('userId', p_user_id, 'isActive', p_active),
      correlation_id
    );
  end if;

  insert into app_private.command_deduplication (
    actor_id,
    command_name,
    idempotency_key,
    response
  ) values (v_actor_id, 'staff.set_active', p_idempotency_key, result_response);

  return result_response;
end;
$$;

create or replace function app_private.set_staff_role_impl(
  p_user_id uuid,
  p_role text,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  correlation_id uuid := gen_random_uuid();
  target_profile api.profiles%rowtype;
  prior_response jsonb;
  result_response jsonb;
  active_owner_count integer;
begin
  if v_actor_id is null or not app_private.has_permission('staff.manage') then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền thực hiện thao tác này.',
      correlation_id
    );
  end if;

  if p_role not in ('SALES_WAREHOUSE', 'BUSINESS', 'OWNER')
    or length(btrim(coalesce(p_reason, ''))) not between 1 and 500
  then
    return app_private.command_error(
      'VALIDATION_ERROR',
      'Vai trò hoặc lý do thay đổi chưa hợp lệ.',
      correlation_id
    );
  end if;

  perform 1 from app_private.security_lock where id = 1 for update;

  select d.response
  into prior_response
  from app_private.command_deduplication as d
  where d.actor_id = v_actor_id
    and d.command_name = 'staff.set_role'
    and d.idempotency_key = p_idempotency_key;
  if found then return prior_response; end if;

  select p.*
  into target_profile
  from api.profiles as p
  where p.id = p_user_id
  for update;

  if not found then
    return app_private.command_error(
      'STAFF_NOT_FOUND',
      'Không tìm thấy tài khoản nhân viên.',
      correlation_id
    );
  end if;

  if target_profile.role_template = 'OWNER'
    and p_role <> 'OWNER'
    and target_profile.is_active
  then
    select count(*)::integer
    into active_owner_count
    from api.profiles as p
    where p.role_template = 'OWNER' and p.is_active;

    if active_owner_count <= 1 then
      return app_private.command_error(
        'LAST_ACTIVE_OWNER',
        'Hệ thống phải luôn còn ít nhất một chủ cửa hàng hoạt động.',
        correlation_id
      );
    end if;
  end if;

  if target_profile.role_template <> p_role then
    update api.profiles
    set role_template = p_role, updated_at = now()
    where id = p_user_id;

    if p_role = 'OWNER' then
      delete from app_private.user_permission_overrides where user_id = p_user_id;
    end if;

    insert into app_private.audit_events (
      actor_id,
      action,
      entity_type,
      entity_id,
      before_data,
      after_data,
      metadata,
      correlation_id
    ) values (
      v_actor_id,
      'staff.role_changed',
      'profile',
      p_user_id,
      jsonb_build_object('roleTemplate', target_profile.role_template),
      jsonb_build_object('roleTemplate', p_role),
      jsonb_build_object('reason', btrim(p_reason)),
      correlation_id
    );

    insert into api.user_notifications (
      user_id,
      severity,
      category,
      title,
      message,
      entity_type,
      entity_id,
      dedupe_key,
      correlation_id
    ) values (
      p_user_id,
      'INFO',
      'ACCOUNT',
      'Vai trò tài khoản đã thay đổi',
      'Quyền truy cập của bạn đã được cập nhật theo vai trò mới.',
      'profile',
      p_user_id,
      'staff.role:' || p_idempotency_key::text,
      correlation_id
    );
  end if;

  result_response := app_private.command_success(
    jsonb_build_object('userId', p_user_id, 'roleTemplate', p_role),
    correlation_id
  );

  insert into app_private.command_deduplication (
    actor_id,
    command_name,
    idempotency_key,
    response
  ) values (v_actor_id, 'staff.set_role', p_idempotency_key, result_response);

  return result_response;
end;
$$;

create or replace function app_private.set_staff_permission_override_impl(
  p_user_id uuid,
  p_permission_code text,
  p_effect text,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  correlation_id uuid := gen_random_uuid();
  target_profile api.profiles%rowtype;
  permission_definition app_private.permission_definitions%rowtype;
  prior_response jsonb;
  result_response jsonb;
  previous_effect text;
begin
  if v_actor_id is null or not app_private.has_permission('staff.manage') then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền thực hiện thao tác này.',
      correlation_id
    );
  end if;

  if p_effect not in ('DEFAULT', 'GRANT', 'REVOKE')
    or length(btrim(coalesce(p_reason, ''))) not between 1 and 500
  then
    return app_private.command_error(
      'VALIDATION_ERROR',
      'Quyền hoặc lý do thay đổi chưa hợp lệ.',
      correlation_id
    );
  end if;

  perform 1 from app_private.security_lock where id = 1 for update;

  select d.response
  into prior_response
  from app_private.command_deduplication as d
  where d.actor_id = v_actor_id
    and d.command_name = 'staff.set_permission_override'
    and d.idempotency_key = p_idempotency_key;
  if found then return prior_response; end if;

  select p.*
  into target_profile
  from api.profiles as p
  where p.id = p_user_id
  for update;

  if not found then
    return app_private.command_error(
      'STAFF_NOT_FOUND',
      'Không tìm thấy tài khoản nhân viên.',
      correlation_id
    );
  end if;

  if target_profile.role_template = 'OWNER' then
    return app_private.command_error(
      'OWNER_PERMISSION_OVERRIDE_NOT_ALLOWED',
      'Tài khoản chủ cửa hàng không sử dụng quyền tùy chỉnh.',
      correlation_id
    );
  end if;

  select d.*
  into permission_definition
  from app_private.permission_definitions as d
  where d.code = p_permission_code;

  if not found then
    return app_private.command_error(
      'VALIDATION_ERROR',
      'Mã quyền không hợp lệ.',
      correlation_id
    );
  end if;

  if p_effect = 'GRANT' and permission_definition.owner_only then
    return app_private.command_error(
      'OWNER_ONLY_PERMISSION',
      'Quyền này chỉ dành cho chủ cửa hàng.',
      correlation_id
    );
  end if;

  select o.effect
  into previous_effect
  from app_private.user_permission_overrides as o
  where o.user_id = p_user_id and o.permission_code = p_permission_code;

  if p_effect = 'DEFAULT' then
    delete from app_private.user_permission_overrides
    where user_id = p_user_id and permission_code = p_permission_code;
  else
    insert into app_private.user_permission_overrides (
      user_id,
      permission_code,
      effect,
      changed_by,
      reason
    ) values (
      p_user_id,
      p_permission_code,
      p_effect,
      v_actor_id,
      btrim(p_reason)
    )
    on conflict (user_id, permission_code) do update
    set
      effect = excluded.effect,
      changed_by = excluded.changed_by,
      reason = excluded.reason,
      updated_at = now();
  end if;

  insert into app_private.audit_events (
    actor_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data,
    metadata,
    correlation_id
  ) values (
    v_actor_id,
    'staff.permission_override_changed',
    'profile',
    p_user_id,
    jsonb_build_object(
      'permissionCode', p_permission_code,
      'effect', previous_effect
    ),
    jsonb_build_object(
      'permissionCode', p_permission_code,
      'effect', case when p_effect = 'DEFAULT' then null else p_effect end
    ),
    jsonb_build_object('reason', btrim(p_reason)),
    correlation_id
  );

  insert into api.user_notifications (
    user_id,
    severity,
    category,
    title,
    message,
    entity_type,
    entity_id,
    dedupe_key,
    correlation_id
  ) values (
    p_user_id,
    'INFO',
    'ACCOUNT',
    'Quyền tài khoản đã thay đổi',
    'Quyền truy cập riêng của bạn vừa được chủ cửa hàng cập nhật.',
    'profile',
    p_user_id,
    'staff.permission:' || p_idempotency_key::text,
    correlation_id
  );

  result_response := app_private.command_success(
    jsonb_build_object(
      'userId', p_user_id,
      'permissionCode', p_permission_code,
      'effect', case when p_effect = 'DEFAULT' then null else p_effect end
    ),
    correlation_id
  );

  insert into app_private.command_deduplication (
    actor_id,
    command_name,
    idempotency_key,
    response
  ) values (
    v_actor_id,
    'staff.set_permission_override',
    p_idempotency_key,
    result_response
  );

  return result_response;
end;
$$;

create or replace function app_private.prepare_staff_password_reset_impl(
  p_user_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  correlation_id uuid := gen_random_uuid();
  target_profile api.profiles%rowtype;
  prior_response jsonb;
  result_response jsonb;
begin
  if v_actor_id is null or not app_private.has_permission('staff.manage') then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền thực hiện thao tác này.',
      correlation_id
    );
  end if;

  if length(btrim(coalesce(p_reason, ''))) not between 1 and 500 then
    return app_private.command_error(
      'VALIDATION_ERROR',
      'Vui lòng nhập lý do đặt lại mật khẩu.',
      correlation_id
    );
  end if;

  perform 1 from app_private.security_lock where id = 1 for update;

  select d.response
  into prior_response
  from app_private.command_deduplication as d
  where d.actor_id = v_actor_id
    and d.command_name = 'staff.prepare_password_reset'
    and d.idempotency_key = p_idempotency_key;
  if found then return prior_response; end if;

  select p.*
  into target_profile
  from api.profiles as p
  where p.id = p_user_id
  for update;

  if not found then
    return app_private.command_error(
      'STAFF_NOT_FOUND',
      'Không tìm thấy tài khoản nhân viên.',
      correlation_id
    );
  end if;

  update api.profiles
  set must_change_password = true, updated_at = now()
  where id = p_user_id;

  insert into app_private.audit_events (
    actor_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data,
    metadata,
    correlation_id
  ) values (
    v_actor_id,
    'staff.password_reset_prepared',
    'profile',
    p_user_id,
    jsonb_build_object('mustChangePassword', target_profile.must_change_password),
    jsonb_build_object('mustChangePassword', true),
    jsonb_build_object('reason', btrim(p_reason)),
    correlation_id
  );

  result_response := app_private.command_success(
    jsonb_build_object('userId', p_user_id, 'mustChangePassword', true),
    correlation_id
  );

  insert into app_private.command_deduplication (
    actor_id,
    command_name,
    idempotency_key,
    response
  ) values (
    v_actor_id,
    'staff.prepare_password_reset',
    p_idempotency_key,
    result_response
  );

  return result_response;
end;
$$;
