create table app_private.security_lock (
  id smallint primary key check (id = 1),
  updated_at timestamptz not null default now()
);

insert into app_private.security_lock (id) values (1);

create table app_private.command_deduplication (
  actor_id uuid not null references api.profiles (id) on delete restrict,
  command_name text not null check (length(command_name) between 1 and 120),
  idempotency_key uuid not null,
  response jsonb not null check (jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default now(),
  primary key (actor_id, command_name, idempotency_key)
);

create index command_deduplication_created_idx
  on app_private.command_deduplication (created_at desc);

create function app_private.command_error(
  p_code text,
  p_message text,
  p_correlation_id uuid
)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', false,
    'data', null,
    'error', jsonb_build_object(
      'code', p_code,
      'message', p_message,
      'details', '{}'::jsonb
    ),
    'correlationId', p_correlation_id
  );
$$;

create function app_private.command_success(
  p_data jsonb,
  p_correlation_id uuid
)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'data', p_data,
    'error', null,
    'correlationId', p_correlation_id
  );
$$;

create function app_private.effective_permissions_for(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(d.code order by d.code), '[]'::jsonb)
  from api.profiles as p
  join app_private.permission_definitions as d on true
  left join app_private.role_default_permissions as r
    on r.role_template = p.role_template
    and r.permission_code = d.code
  left join app_private.user_permission_overrides as o
    on o.user_id = p.id
    and o.permission_code = d.code
  where p.id = p_user_id
    and (
      p.role_template = 'OWNER'
      or (
        not d.owner_only
        and case
          when o.effect = 'REVOKE' then false
          when o.effect = 'GRANT' then true
          else coalesce(r.allowed, false)
        end
      )
    );
$$;

create function app_private.authorize_staff_admin_impl()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  correlation_id uuid := gen_random_uuid();
begin
  if actor_id is null or not app_private.has_permission('staff.manage') then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền thực hiện thao tác này.',
      correlation_id
    );
  end if;

  return app_private.command_success(
    jsonb_build_object('actorId', actor_id),
    correlation_id
  );
end;
$$;

create function api.authorize_staff_admin()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.authorize_staff_admin_impl();
$$;

create function app_private.list_staff_impl(
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  correlation_id uuid := gen_random_uuid();
  effective_limit integer := least(greatest(coalesce(p_limit, 30), 1), 50);
  staff_items jsonb := '[]'::jsonb;
  permission_items jsonb := '[]'::jsonb;
  next_created_at timestamptz;
  next_id uuid;
begin
  if actor_id is null or not app_private.has_permission('staff.manage') then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền thực hiện thao tác này.',
      correlation_id
    );
  end if;

  if (p_cursor_created_at is null) <> (p_cursor_id is null) then
    return app_private.command_error(
      'VALIDATION_ERROR',
      'Con trỏ phân trang chưa hợp lệ.',
      correlation_id
    );
  end if;

  with selected as (
    select p.*
    from api.profiles as p
    where p_cursor_created_at is null
      or (p.created_at, p.id) < (p_cursor_created_at, p_cursor_id)
    order by p.created_at desc, p.id desc
    limit effective_limit
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'email', s.email,
        'displayName', s.display_name,
        'roleTemplate', s.role_template,
        'isActive', s.is_active,
        'mustChangePassword', s.must_change_password,
        'createdAt', s.created_at,
        'overrides', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'permissionCode', o.permission_code,
              'effect', o.effect
            ) order by o.permission_code
          )
          from app_private.user_permission_overrides as o
          where o.user_id = s.id
        ), '[]'::jsonb)
      )
      order by s.created_at desc, s.id desc
    ),
    '[]'::jsonb
  )
  into staff_items
  from selected as s;

  if jsonb_array_length(staff_items) = effective_limit then
    select p.created_at, p.id
    into next_created_at, next_id
    from api.profiles as p
    where p_cursor_created_at is null
      or (p.created_at, p.id) < (p_cursor_created_at, p_cursor_id)
    order by p.created_at desc, p.id desc
    offset effective_limit - 1
    limit 1;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'code', d.code,
        'category', d.category,
        'label', d.label,
        'description', d.description,
        'ownerOnly', d.owner_only,
        'salesWarehouseDefault', coalesce(sw.allowed, false),
        'businessDefault', coalesce(b.allowed, false)
      )
      order by d.category, d.code
    ),
    '[]'::jsonb
  )
  into permission_items
  from app_private.permission_definitions as d
  left join app_private.role_default_permissions as sw
    on sw.role_template = 'SALES_WAREHOUSE'
    and sw.permission_code = d.code
  left join app_private.role_default_permissions as b
    on b.role_template = 'BUSINESS'
    and b.permission_code = d.code;

  return app_private.command_success(
    jsonb_build_object(
      'items', staff_items,
      'permissionDefinitions', permission_items,
      'nextCursor', case
        when next_id is null then null
        else jsonb_build_object('createdAt', next_created_at, 'id', next_id)
      end
    ),
    correlation_id
  );
end;
$$;

create function api.list_staff(
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 30
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.list_staff_impl(
    p_cursor_created_at,
    p_cursor_id,
    p_limit
  );
$$;

create function app_private.finalize_staff_profile_impl(
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
begin
  if p_role_template not in ('SALES_WAREHOUSE', 'BUSINESS', 'OWNER')
    or length(normalized_email) not between 3 and 320
    or length(normalized_name) not between 1 and 120
  then
    return app_private.command_error(
      'VALIDATION_ERROR',
      'Thông tin tài khoản chưa hợp lệ.',
      correlation_id
    );
  end if;

  perform 1 from app_private.security_lock where id = 1 for update;

  select *
  into existing_profile
  from api.profiles as p
  where p.id = p_user_id;

  if found then
    if existing_profile.email <> normalized_email then
      return app_private.command_error(
        'INVALID_STATE',
        'Tài khoản đã tồn tại với email khác.',
        correlation_id
      );
    end if;

    return app_private.command_success(
      jsonb_build_object('userId', existing_profile.id, 'created', false),
      correlation_id
    );
  end if;

  if exists (
    select 1 from api.profiles as p where p.email = normalized_email
  ) then
    return app_private.command_error(
      'DUPLICATE_STAFF_EMAIL',
      'Email này đã được dùng cho tài khoản khác.',
      correlation_id
    );
  end if;

  select not exists (
    select 1
    from api.profiles as p
    where p.role_template = 'OWNER' and p.is_active
  ) and p_role_template = 'OWNER' and p_created_by = p_user_id
  into bootstrap_owner;

  if not bootstrap_owner and not exists (
    select 1
    from api.profiles as creator
    where creator.id = p_created_by
      and creator.role_template = 'OWNER'
      and creator.is_active
      and not creator.must_change_password
  ) then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Chủ cửa hàng không còn quyền tạo tài khoản.',
      correlation_id
    );
  end if;

  if not bootstrap_owner and p_role_template = 'OWNER' then
    return app_private.command_error(
      'VALIDATION_ERROR',
      'Không thể tạo tài khoản chủ cửa hàng từ chức năng nhân viên.',
      correlation_id
    );
  end if;

  if not bootstrap_owner then
    select d.response
    into prior_response
    from app_private.command_deduplication as d
    where d.actor_id = p_created_by
      and d.command_name = 'staff.finalize'
      and d.idempotency_key = p_idempotency_key;
    if found then return prior_response; end if;
  end if;

  insert into api.profiles (
    id,
    email,
    display_name,
    role_template,
    is_active,
    must_change_password,
    created_by
  )
  values (
    p_user_id,
    normalized_email,
    normalized_name,
    p_role_template,
    true,
    true,
    case when bootstrap_owner then null else p_created_by end
  );

  insert into app_private.audit_events (
    actor_id,
    action,
    entity_type,
    entity_id,
    after_data,
    correlation_id
  )
  values (
    case when bootstrap_owner then p_user_id else p_created_by end,
    case when bootstrap_owner then 'staff.owner_bootstrapped' else 'staff.created' end,
    'profile',
    p_user_id,
    jsonb_build_object(
      'roleTemplate', p_role_template,
      'isActive', true,
      'mustChangePassword', true
    ),
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
  )
  values (
    p_user_id,
    'INFO',
    'ACCOUNT',
    'Tài khoản đã được tạo',
    'Vui lòng đổi mật khẩu tạm trong lần đăng nhập đầu tiên.',
    'profile',
    p_user_id,
    'staff.created:' || p_idempotency_key::text,
    correlation_id
  );

  result_response := app_private.command_success(
    jsonb_build_object('userId', p_user_id, 'created', true),
    correlation_id
  );

  insert into app_private.command_deduplication (
    actor_id,
    command_name,
    idempotency_key,
    response
  ) values (
    case when bootstrap_owner then p_user_id else p_created_by end,
    'staff.finalize',
    p_idempotency_key,
    result_response
  );

  return result_response;
end;
$$;

create function api.finalize_staff_profile(
  p_user_id uuid,
  p_email text,
  p_display_name text,
  p_role_template text,
  p_created_by uuid,
  p_idempotency_key uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.finalize_staff_profile_impl(
    p_user_id,
    p_email,
    p_display_name,
    p_role_template,
    p_created_by,
    p_idempotency_key
  );
$$;

create function app_private.set_staff_active_impl(
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
  actor_id uuid := (select auth.uid());
  correlation_id uuid := gen_random_uuid();
  target_profile api.profiles%rowtype;
  prior_response jsonb;
  result_response jsonb;
  active_owner_count integer;
begin
  if actor_id is null or not app_private.has_permission('staff.manage') then
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
  where d.actor_id = actor_id
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
      actor_id,
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
  ) values (actor_id, 'staff.set_active', p_idempotency_key, result_response);

  return result_response;
end;
$$;

create function api.set_staff_active(
  p_user_id uuid,
  p_active boolean,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.set_staff_active_impl(
    p_user_id,
    p_active,
    p_reason,
    p_idempotency_key
  );
$$;

create function app_private.set_staff_role_impl(
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
  actor_id uuid := (select auth.uid());
  correlation_id uuid := gen_random_uuid();
  target_profile api.profiles%rowtype;
  prior_response jsonb;
  result_response jsonb;
  active_owner_count integer;
begin
  if actor_id is null or not app_private.has_permission('staff.manage') then
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
  where d.actor_id = actor_id
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
      actor_id,
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
  ) values (actor_id, 'staff.set_role', p_idempotency_key, result_response);

  return result_response;
end;
$$;

create function api.set_staff_role(
  p_user_id uuid,
  p_role text,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.set_staff_role_impl(
    p_user_id,
    p_role,
    p_reason,
    p_idempotency_key
  );
$$;

create function app_private.set_staff_permission_override_impl(
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
  actor_id uuid := (select auth.uid());
  correlation_id uuid := gen_random_uuid();
  target_profile api.profiles%rowtype;
  permission_definition app_private.permission_definitions%rowtype;
  prior_response jsonb;
  result_response jsonb;
  previous_effect text;
begin
  if actor_id is null or not app_private.has_permission('staff.manage') then
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
  where d.actor_id = actor_id
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
      actor_id,
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
    actor_id,
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
    actor_id,
    'staff.set_permission_override',
    p_idempotency_key,
    result_response
  );

  return result_response;
end;
$$;

create function api.set_staff_permission_override(
  p_user_id uuid,
  p_permission_code text,
  p_effect text,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.set_staff_permission_override_impl(
    p_user_id,
    p_permission_code,
    p_effect,
    p_reason,
    p_idempotency_key
  );
$$;

create function app_private.get_effective_permissions_impl(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  correlation_id uuid := gen_random_uuid();
  target_exists boolean;
begin
  if actor_id is null or not app_private.has_permission('staff.manage') then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền thực hiện thao tác này.',
      correlation_id
    );
  end if;

  select exists(select 1 from api.profiles as p where p.id = p_user_id)
  into target_exists;

  if not target_exists then
    return app_private.command_error(
      'STAFF_NOT_FOUND',
      'Không tìm thấy tài khoản nhân viên.',
      correlation_id
    );
  end if;

  return app_private.command_success(
    jsonb_build_object(
      'userId', p_user_id,
      'permissions', app_private.effective_permissions_for(p_user_id)
    ),
    correlation_id
  );
end;
$$;

create function api.get_effective_permissions(p_user_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.get_effective_permissions_impl(p_user_id);
$$;

create function app_private.prepare_staff_password_reset_impl(
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
  actor_id uuid := (select auth.uid());
  correlation_id uuid := gen_random_uuid();
  target_profile api.profiles%rowtype;
  prior_response jsonb;
  result_response jsonb;
begin
  if actor_id is null or not app_private.has_permission('staff.manage') then
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
  where d.actor_id = actor_id
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
    actor_id,
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
    actor_id,
    'staff.prepare_password_reset',
    p_idempotency_key,
    result_response
  );

  return result_response;
end;
$$;

create function api.prepare_staff_password_reset(
  p_user_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.prepare_staff_password_reset_impl(
    p_user_id,
    p_reason,
    p_idempotency_key
  );
$$;

revoke all on table app_private.security_lock from public, anon, authenticated;
revoke all on table app_private.command_deduplication
  from public, anon, authenticated;

revoke all on function api.authorize_staff_admin()
  from public, anon, authenticated;
revoke all on function api.list_staff(timestamptz, uuid, integer)
  from public, anon, authenticated;
revoke all on function api.finalize_staff_profile(
  uuid,
  text,
  text,
  text,
  uuid,
  uuid
) from public, anon, authenticated;
revoke all on function api.set_staff_active(uuid, boolean, text, uuid)
  from public, anon, authenticated;
revoke all on function api.set_staff_role(uuid, text, text, uuid)
  from public, anon, authenticated;
revoke all on function api.set_staff_permission_override(
  uuid,
  text,
  text,
  text,
  uuid
) from public, anon, authenticated;
revoke all on function api.get_effective_permissions(uuid)
  from public, anon, authenticated;
revoke all on function api.prepare_staff_password_reset(uuid, text, uuid)
  from public, anon, authenticated;

revoke all on function app_private.authorize_staff_admin_impl()
  from public, anon, authenticated;
revoke all on function app_private.list_staff_impl(timestamptz, uuid, integer)
  from public, anon, authenticated;
revoke all on function app_private.finalize_staff_profile_impl(
  uuid,
  text,
  text,
  text,
  uuid,
  uuid
) from public, anon, authenticated;
revoke all on function app_private.set_staff_active_impl(
  uuid,
  boolean,
  text,
  uuid
) from public, anon, authenticated;
revoke all on function app_private.set_staff_role_impl(uuid, text, text, uuid)
  from public, anon, authenticated;
revoke all on function app_private.set_staff_permission_override_impl(
  uuid,
  text,
  text,
  text,
  uuid
) from public, anon, authenticated;
revoke all on function app_private.get_effective_permissions_impl(uuid)
  from public, anon, authenticated;
revoke all on function app_private.prepare_staff_password_reset_impl(
  uuid,
  text,
  uuid
) from public, anon, authenticated;

grant execute on function app_private.authorize_staff_admin_impl()
  to authenticated;
grant execute on function app_private.list_staff_impl(timestamptz, uuid, integer)
  to authenticated;
grant execute on function app_private.set_staff_active_impl(
  uuid,
  boolean,
  text,
  uuid
) to authenticated;
grant execute on function app_private.set_staff_role_impl(uuid, text, text, uuid)
  to authenticated;
grant execute on function app_private.set_staff_permission_override_impl(
  uuid,
  text,
  text,
  text,
  uuid
) to authenticated;
grant execute on function app_private.get_effective_permissions_impl(uuid)
  to authenticated;
grant execute on function app_private.prepare_staff_password_reset_impl(
  uuid,
  text,
  uuid
) to authenticated;

grant execute on function api.authorize_staff_admin() to authenticated;
grant execute on function api.list_staff(timestamptz, uuid, integer)
  to authenticated;
grant execute on function api.set_staff_active(uuid, boolean, text, uuid)
  to authenticated;
grant execute on function api.set_staff_role(uuid, text, text, uuid)
  to authenticated;
grant execute on function api.set_staff_permission_override(
  uuid,
  text,
  text,
  text,
  uuid
) to authenticated;
grant execute on function api.get_effective_permissions(uuid)
  to authenticated;
grant execute on function api.prepare_staff_password_reset(uuid, text, uuid)
  to authenticated;

grant execute on function app_private.finalize_staff_profile_impl(
  uuid,
  text,
  text,
  text,
  uuid,
  uuid
) to service_role;
grant execute on function api.finalize_staff_profile(
  uuid,
  text,
  text,
  text,
  uuid,
  uuid
) to service_role;
