alter table app_private.project_lifecycle
  add column staff_access_policy text not null default 'BLOCKED'
    check (staff_access_policy in (
      'BLOCKED',
      'OWNER_WAIVER',
      'LEAKED_PASSWORD_PROTECTED'
    )),
  add column staff_access_granted_at timestamptz null;

alter table app_private.project_lifecycle
  drop constraint if exists project_lifecycle_check;

alter table app_private.project_lifecycle
  add constraint project_lifecycle_check check (
    (mode = 'PRE_PRODUCTION'
      and cutover_at is null
      and auth_hardening_completed_at is null
      and staff_access_policy = 'BLOCKED'
      and staff_access_granted_at is null)
    or (mode = 'OWNER_PILOT' and cutover_at is not null)
    or (mode = 'PRODUCTION'
      and cutover_at is not null
      and (
        (auth_hardening_completed_at is not null
          and staff_access_policy = 'LEAKED_PASSWORD_PROTECTED')
        or (auth_hardening_completed_at is null
          and staff_access_policy = 'OWNER_WAIVER'
          and staff_access_granted_at is not null)
      ))
  );

create or replace function app_private.get_project_lifecycle_impl()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lifecycle app_private.project_lifecycle%rowtype;
begin
  select * into v_lifecycle
  from app_private.project_lifecycle
  where id = true;

  return app_private.command_success(
    jsonb_build_object(
      'mode', v_lifecycle.mode,
      'cutoverAt', v_lifecycle.cutover_at,
      'authHardeningCompletedAt', v_lifecycle.auth_hardening_completed_at,
      'staffAccessPolicy', v_lifecycle.staff_access_policy,
      'staffAccessGrantedAt', v_lifecycle.staff_access_granted_at,
      'updatedAt', v_lifecycle.updated_at
    ),
    gen_random_uuid()
  );
end;
$$;

create or replace function app_private.record_auth_hardening_impl()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lifecycle app_private.project_lifecycle%rowtype;
  v_correlation uuid := gen_random_uuid();
begin
  if auth.role() <> 'service_role' then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Chỉ script cutover được xác nhận mới có thể xác nhận bảo vệ tài khoản.',
      v_correlation
    );
  end if;

  perform 1 from app_private.security_lock where id = 1 for update;
  select * into v_lifecycle
  from app_private.project_lifecycle
  where id = true
  for update;

  if v_lifecycle.mode <> 'OWNER_PILOT' then
    return app_private.command_error(
      'INVALID_STATE',
      'Chỉ có thể xác nhận bảo vệ tài khoản trong giai đoạn pilot owner.',
      v_correlation
    );
  end if;

  if v_lifecycle.auth_hardening_completed_at is null then
    update app_private.project_lifecycle
    set auth_hardening_completed_at = now(),
        staff_access_policy = 'LEAKED_PASSWORD_PROTECTED',
        staff_access_granted_at = now(),
        updated_at = now()
    where id = true;

    insert into app_private.audit_events(
      actor_id, action, entity_type, entity_id, after_data, metadata, correlation_id
    ) values (
      null,
      'project_lifecycle.auth_hardening_recorded',
      'project_lifecycle',
      null,
      jsonb_build_object(
        'mode', 'OWNER_PILOT',
        'staffAccessPolicy', 'LEAKED_PASSWORD_PROTECTED'
      ),
      jsonb_build_object('actor', 'cutover_service'),
      v_correlation
    );
  end if;

  return app_private.command_success(
    jsonb_build_object(
      'authHardeningCompletedAt', (
        select auth_hardening_completed_at
        from app_private.project_lifecycle
        where id = true
      ),
      'staffAccessPolicy', 'LEAKED_PASSWORD_PROTECTED'
    ),
    v_correlation
  );
end;
$$;

create function app_private.record_staff_access_waiver_impl(p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lifecycle app_private.project_lifecycle%rowtype;
  v_correlation uuid := gen_random_uuid();
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if auth.role() <> 'service_role' then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Chỉ script cutover được xác nhận mới có thể cấp ngoại lệ tạo nhân viên.',
      v_correlation
    );
  end if;

  if length(v_reason) not between 10 and 500 then
    return app_private.command_error(
      'VALIDATION_ERROR',
      'Cần nêu lý do vận hành từ 10 đến 500 ký tự, không chứa thông tin bí mật.',
      v_correlation
    );
  end if;

  perform 1 from app_private.security_lock where id = 1 for update;
  select * into v_lifecycle
  from app_private.project_lifecycle
  where id = true
  for update;

  if v_lifecycle.mode <> 'OWNER_PILOT' then
    return app_private.command_error(
      'INVALID_STATE',
      'Chỉ có thể cấp ngoại lệ tạo nhân viên trong giai đoạn pilot owner.',
      v_correlation
    );
  end if;

  if v_lifecycle.staff_access_policy = 'LEAKED_PASSWORD_PROTECTED' then
    return app_private.command_error(
      'INVALID_STATE',
      'Không thể hạ chính sách bảo vệ mật khẩu đã hoàn tất xuống ngoại lệ Owner.',
      v_correlation
    );
  end if;

  if v_lifecycle.staff_access_policy = 'BLOCKED' then
    update app_private.project_lifecycle
    set staff_access_policy = 'OWNER_WAIVER',
        staff_access_granted_at = now(),
        updated_at = now()
    where id = true;

    insert into app_private.audit_events(
      actor_id, action, entity_type, entity_id, after_data, metadata, correlation_id
    ) values (
      null,
      'project_lifecycle.staff_access_waived',
      'project_lifecycle',
      null,
      jsonb_build_object(
        'mode', 'OWNER_PILOT',
        'staffAccessPolicy', 'OWNER_WAIVER'
      ),
      jsonb_build_object('actor', 'cutover_service', 'reason', v_reason),
      v_correlation
    );
  end if;

  return app_private.command_success(
    jsonb_build_object(
      'staffAccessPolicy', 'OWNER_WAIVER',
      'staffAccessGrantedAt', (
        select staff_access_granted_at
        from app_private.project_lifecycle
        where id = true
      )
    ),
    v_correlation
  );
end;
$$;

create function api.record_staff_access_waiver(p_reason text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.record_staff_access_waiver_impl(p_reason);
$$;

create function app_private.get_staff_access_capability_impl()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lifecycle app_private.project_lifecycle%rowtype;
  v_correlation uuid := gen_random_uuid();
  v_policy text;
  v_can_create boolean;
  v_message text;
begin
  if auth.uid() is null or not app_private.has_permission('staff.manage') then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền xem trạng thái tạo nhân viên.',
      v_correlation
    );
  end if;

  select * into v_lifecycle
  from app_private.project_lifecycle
  where id = true;

  v_policy := v_lifecycle.staff_access_policy;
  v_can_create := v_policy in ('OWNER_WAIVER', 'LEAKED_PASSWORD_PROTECTED');
  v_message := case v_policy
    when 'OWNER_WAIVER' then
      'Đang dùng ngoại lệ Owner: Supabase Free không kiểm tra mật khẩu đã bị rò rỉ.'
    when 'LEAKED_PASSWORD_PROTECTED' then
      'Bảo vệ mật khẩu bị rò rỉ đã hoàn tất. Có thể tạo tài khoản nhân viên.'
    else
      'Chưa được phê duyệt tạo nhân viên. Chủ cửa hàng cần xác nhận chính sách tài khoản trước.'
  end;

  return app_private.command_success(
    jsonb_build_object(
      'canCreate', v_can_create,
      'policy', v_policy,
      'message', v_message
    ),
    v_correlation
  );
end;
$$;

create function api.get_staff_access_capability()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.get_staff_access_capability_impl();
$$;

create or replace function app_private.transition_project_lifecycle_impl(
  p_target_mode text,
  p_cutover_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lifecycle app_private.project_lifecycle%rowtype;
  v_correlation uuid := gen_random_uuid();
  v_target text := upper(btrim(coalesce(p_target_mode, '')));
begin
  if auth.role() <> 'service_role' then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Chỉ script cutover được xác nhận mới có thể chuyển trạng thái môi trường.',
      v_correlation
    );
  end if;

  perform 1 from app_private.security_lock where id = 1 for update;
  select * into v_lifecycle
  from app_private.project_lifecycle
  where id = true
  for update;

  if v_target = v_lifecycle.mode then
    return app_private.command_success(
      jsonb_build_object('mode', v_lifecycle.mode, 'cutoverAt', v_lifecycle.cutover_at),
      v_correlation
    );
  end if;

  if v_lifecycle.mode = 'PRE_PRODUCTION' and v_target = 'OWNER_PILOT' then
    if p_cutover_at is null then
      return app_private.command_error(
        'VALIDATION_ERROR',
        'Thời điểm cutover là bắt buộc khi chuyển sang pilot owner.',
        v_correlation
      );
    end if;

    update app_private.project_lifecycle
    set mode = 'OWNER_PILOT', cutover_at = p_cutover_at, updated_at = now()
    where id = true;

    revoke execute on function app_private.cleanup_phase1a_test_users_impl(uuid[]) from service_role;
    revoke execute on function app_private.cleanup_phase1b_test_users_impl(uuid[]) from service_role;
    revoke execute on function app_private.cleanup_phase1c_test_users_impl(uuid[]) from service_role;
    revoke execute on function app_private.cleanup_phase1e_test_users_impl(uuid[]) from service_role;
    revoke execute on function app_private.cleanup_phase1f_test_users_impl(uuid[]) from service_role;
    revoke execute on function api.cleanup_phase1a_test_users(uuid[]) from service_role;
    revoke execute on function api.cleanup_phase1b_test_users(uuid[]) from service_role;
    revoke execute on function api.cleanup_phase1c_test_users(uuid[]) from service_role;
    revoke execute on function api.cleanup_phase1e_test_users(uuid[]) from service_role;
    revoke execute on function api.cleanup_phase1f_test_users(uuid[]) from service_role;
  elsif v_lifecycle.mode = 'OWNER_PILOT' and v_target = 'PRODUCTION' then
    if v_lifecycle.staff_access_policy not in (
      'OWNER_WAIVER',
      'LEAKED_PASSWORD_PROTECTED'
    ) then
      return app_private.command_error(
        'STAFF_ACCESS_POLICY_REQUIRED',
        'Cần xác nhận chính sách tạo nhân viên trước khi mở đầy đủ production.',
        v_correlation
      );
    end if;

    update app_private.project_lifecycle
    set mode = 'PRODUCTION', updated_at = now()
    where id = true;
  else
    return app_private.command_error(
      'INVALID_STATE',
      'Chuyển trạng thái môi trường không hợp lệ.',
      v_correlation
    );
  end if;

  insert into app_private.audit_events(
    actor_id, action, entity_type, entity_id, before_data, after_data, metadata, correlation_id
  ) values (
    null,
    'project_lifecycle.transitioned',
    'project_lifecycle',
    null,
    jsonb_build_object('mode', v_lifecycle.mode),
    jsonb_build_object('mode', v_target, 'cutoverAt', coalesce(p_cutover_at, v_lifecycle.cutover_at)),
    jsonb_build_object('actor', 'cutover_service', 'staffAccessPolicy', v_lifecycle.staff_access_policy),
    v_correlation
  );

  return app_private.command_success(
    jsonb_build_object('mode', v_target, 'cutoverAt', coalesce(p_cutover_at, v_lifecycle.cutover_at)),
    v_correlation
  );
end;
$$;

create or replace function app_private.finalize_staff_profile_impl(
  p_user_id uuid,
  p_email text,
  p_display_name text,
  p_role_template text,
  p_created_by uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  correlation_id uuid := gen_random_uuid();
  normalized_email text := lower(btrim(p_email));
  normalized_name text := btrim(p_display_name);
  prior_response jsonb;
  result_response jsonb;
  bootstrap_owner boolean := false;
  existing_profile api.profiles%rowtype;
  lifecycle app_private.project_lifecycle%rowtype;
begin
  if p_role_template not in ('SALES_WAREHOUSE', 'BUSINESS', 'OWNER')
    or length(normalized_email) not between 3 and 320
    or length(normalized_name) not between 1 and 120
  then
    return app_private.command_error('VALIDATION_ERROR', 'Thông tin tài khoản chưa hợp lệ.', correlation_id);
  end if;

  perform 1 from app_private.security_lock where id = 1 for update;
  select * into lifecycle from app_private.project_lifecycle where id = true for update;
  select * into existing_profile from api.profiles as p where p.id = p_user_id;

  if found then
    if existing_profile.email <> normalized_email then
      return app_private.command_error('INVALID_STATE', 'Tài khoản đã tồn tại với email khác.', correlation_id);
    end if;
    return app_private.command_success(jsonb_build_object('userId', existing_profile.id, 'created', false), correlation_id);
  end if;

  if exists (select 1 from api.profiles as p where p.email = normalized_email) then
    return app_private.command_error('DUPLICATE_STAFF_EMAIL', 'Email này đã được dùng cho tài khoản khác.', correlation_id);
  end if;

  select not exists (
    select 1 from api.profiles as p where p.role_template = 'OWNER' and p.is_active
  ) and p_role_template = 'OWNER' and p_created_by = p_user_id into bootstrap_owner;

  if not bootstrap_owner and not exists (
    select 1 from api.profiles as creator
    where creator.id = p_created_by and creator.role_template = 'OWNER'
      and creator.is_active and not creator.must_change_password
  ) then
    return app_private.command_error('PERMISSION_DENIED', 'Chủ cửa hàng không còn quyền tạo tài khoản.', correlation_id);
  end if;

  if not bootstrap_owner and p_role_template = 'OWNER' then
    return app_private.command_error('VALIDATION_ERROR', 'Không thể tạo tài khoản chủ cửa hàng từ chức năng nhân viên.', correlation_id);
  end if;

  if not bootstrap_owner and lifecycle.staff_access_policy not in (
    'OWNER_WAIVER',
    'LEAKED_PASSWORD_PROTECTED'
  ) then
    return app_private.command_error(
      'STAFF_ACCESS_POLICY_REQUIRED',
      'Chưa được phê duyệt tạo tài khoản nhân viên.',
      correlation_id
    );
  end if;

  if not bootstrap_owner then
    select d.response into prior_response from app_private.command_deduplication as d
    where d.actor_id = p_created_by and d.command_name = 'staff.finalize'
      and d.idempotency_key = p_idempotency_key;
    if found then return prior_response; end if;
  end if;

  insert into api.profiles (id, email, display_name, role_template, is_active, must_change_password, created_by)
  values (p_user_id, normalized_email, normalized_name, p_role_template, true, true,
    case when bootstrap_owner then null else p_created_by end);

  insert into app_private.audit_events (actor_id, action, entity_type, entity_id, after_data, correlation_id)
  values (
    case when bootstrap_owner then p_user_id else p_created_by end,
    case when bootstrap_owner then 'staff.owner_bootstrapped' else 'staff.created' end,
    'profile', p_user_id,
    jsonb_build_object('roleTemplate', p_role_template, 'isActive', true, 'mustChangePassword', true),
    correlation_id
  );

  insert into api.user_notifications (user_id, severity, category, title, message, entity_type, entity_id, dedupe_key, correlation_id)
  values (p_user_id, 'INFO', 'ACCOUNT', 'Tài khoản đã được tạo',
    'Vui lòng đổi mật khẩu tạm trong lần đăng nhập đầu tiên.', 'profile', p_user_id,
    'staff.created:' || p_idempotency_key::text, correlation_id);

  result_response := app_private.command_success(jsonb_build_object('userId', p_user_id, 'created', true), correlation_id);
  insert into app_private.command_deduplication (actor_id, command_name, idempotency_key, response)
  values (case when bootstrap_owner then p_user_id else p_created_by end, 'staff.finalize', p_idempotency_key, result_response);
  return result_response;
end;
$$;

revoke all on function app_private.record_staff_access_waiver_impl(text)
  from public, anon, authenticated;
revoke all on function app_private.get_staff_access_capability_impl()
  from public, anon, authenticated;
revoke all on function api.record_staff_access_waiver(text)
  from public, anon, authenticated;
revoke all on function api.get_staff_access_capability()
  from public, anon, authenticated;

grant execute on function app_private.record_staff_access_waiver_impl(text)
  to service_role;
grant execute on function app_private.get_staff_access_capability_impl()
  to authenticated;
grant execute on function api.record_staff_access_waiver(text) to service_role;
grant execute on function api.get_staff_access_capability() to authenticated;
