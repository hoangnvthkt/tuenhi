create table app_private.project_lifecycle (
  id boolean primary key default true check (id),
  mode text not null default 'PRE_PRODUCTION' check (
    mode in ('PRE_PRODUCTION', 'OWNER_PILOT', 'PRODUCTION')
  ),
  cutover_at timestamptz null,
  auth_hardening_completed_at timestamptz null,
  updated_at timestamptz not null default now(),
  check (
    (mode = 'PRE_PRODUCTION' and cutover_at is null and auth_hardening_completed_at is null)
    or (mode = 'OWNER_PILOT' and cutover_at is not null)
    or (mode = 'PRODUCTION' and cutover_at is not null and auth_hardening_completed_at is not null)
  )
);

alter table app_private.project_lifecycle enable row level security;
alter table app_private.project_lifecycle force row level security;
revoke all on table app_private.project_lifecycle from public, anon, authenticated;

insert into app_private.project_lifecycle (id) values (true);

create function app_private.get_project_lifecycle_impl()
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
      'updatedAt', v_lifecycle.updated_at
    ),
    gen_random_uuid()
  );
end;
$$;

create function api.get_project_lifecycle()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.get_project_lifecycle_impl();
$$;

create function app_private.record_auth_hardening_impl()
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
    set auth_hardening_completed_at = now(), updated_at = now()
    where id = true;

    insert into app_private.audit_events(
      actor_id, action, entity_type, entity_id, after_data, metadata, correlation_id
    ) values (
      null,
      'project_lifecycle.auth_hardening_recorded',
      'project_lifecycle',
      null,
      jsonb_build_object('mode', 'OWNER_PILOT'),
      jsonb_build_object('actor', 'cutover_service'),
      v_correlation
    );
  end if;

  return app_private.command_success(
    jsonb_build_object('authHardeningCompletedAt', coalesce(
      (select auth_hardening_completed_at from app_private.project_lifecycle where id = true),
      now()
    )),
    v_correlation
  );
end;
$$;

create function api.record_auth_hardening()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.record_auth_hardening_impl();
$$;

create function app_private.transition_project_lifecycle_impl(
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
    if v_lifecycle.auth_hardening_completed_at is null then
      return app_private.command_error(
        'PRODUCTION_AUTH_HARDENING_REQUIRED',
        'Cần bật và kiểm tra bảo vệ mật khẩu bị rò rỉ trước khi mở đầy đủ production.',
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
    jsonb_build_object('actor', 'cutover_service'),
    v_correlation
  );

  return app_private.command_success(
    jsonb_build_object('mode', v_target, 'cutoverAt', coalesce(p_cutover_at, v_lifecycle.cutover_at)),
    v_correlation
  );
end;
$$;

create function api.transition_project_lifecycle(
  p_target_mode text,
  p_cutover_at timestamptz default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.transition_project_lifecycle_impl(p_target_mode, p_cutover_at);
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

  if not bootstrap_owner and lifecycle.mode = 'OWNER_PILOT'
    and lifecycle.auth_hardening_completed_at is null
  then
    return app_private.command_error(
      'PRODUCTION_AUTH_HARDENING_REQUIRED',
      'Pilot chỉ cho phép chủ cửa hàng sử dụng. Hãy bật bảo vệ mật khẩu bị rò rỉ trước khi tạo nhân viên.',
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

revoke all on function app_private.get_project_lifecycle_impl() from public, anon, authenticated;
revoke all on function app_private.record_auth_hardening_impl() from public, anon, authenticated;
revoke all on function app_private.transition_project_lifecycle_impl(text, timestamptz) from public, anon, authenticated;
revoke all on function api.get_project_lifecycle() from public, anon, authenticated;
revoke all on function api.record_auth_hardening() from public, anon, authenticated;
revoke all on function api.transition_project_lifecycle(text, timestamptz) from public, anon, authenticated;
grant execute on function app_private.get_project_lifecycle_impl() to service_role;
grant execute on function app_private.record_auth_hardening_impl() to service_role;
grant execute on function app_private.transition_project_lifecycle_impl(text, timestamptz) to service_role;
grant execute on function api.get_project_lifecycle() to service_role;
grant execute on function api.record_auth_hardening() to service_role;
grant execute on function api.transition_project_lifecycle(text, timestamptz) to service_role;
