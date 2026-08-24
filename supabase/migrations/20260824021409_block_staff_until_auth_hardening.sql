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

  if not bootstrap_owner and lifecycle.auth_hardening_completed_at is null then
    return app_private.command_error(
      'PRODUCTION_AUTH_HARDENING_REQUIRED',
      'Chỉ chủ cửa hàng được sử dụng trước khi hoàn tất bảo vệ mật khẩu.',
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

revoke all on function app_private.finalize_staff_profile_impl(uuid, text, text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function app_private.finalize_staff_profile_impl(uuid, text, text, text, uuid, uuid)
  to service_role;
