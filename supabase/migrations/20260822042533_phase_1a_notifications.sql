create table api.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references api.profiles (id) on delete restrict,
  severity text not null check (
    severity in ('INFO', 'SUCCESS', 'WARNING', 'ERROR')
  ),
  category text not null check (length(category) between 1 and 80),
  title text not null check (length(title) between 1 and 160),
  message text not null check (length(message) between 1 and 1000),
  action_route text null check (
    action_route is null
    or (
      length(action_route) between 1 and 300
      and left(action_route, 1) = '/'
      and left(action_route, 2) <> '//'
      and position('://' in action_route) = 0
    )
  ),
  entity_type text null check (
    entity_type is null or length(entity_type) between 1 and 80
  ),
  entity_id uuid null,
  dedupe_key text null check (
    dedupe_key is null or length(dedupe_key) between 1 and 200
  ),
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object'
  ),
  correlation_id uuid not null default gen_random_uuid(),
  read_at timestamptz null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '365 days'),
  check (expires_at > created_at)
);

create unique index user_notifications_unread_dedupe_idx
  on api.user_notifications (user_id, dedupe_key)
  where dedupe_key is not null and read_at is null;

create index user_notifications_feed_idx
  on api.user_notifications (user_id, read_at, created_at desc, id desc);

create index user_notifications_created_idx
  on api.user_notifications (user_id, created_at desc, id desc);

alter table api.user_notifications enable row level security;
alter table api.user_notifications force row level security;

create policy user_notifications_select_own
on api.user_notifications
for select
to authenticated
using (
  user_id = (select auth.uid())
  and (select app_private.has_active_profile(false))
  and expires_at > now()
);

revoke all on table api.user_notifications from public, anon, authenticated;
grant select on table api.user_notifications to authenticated;

create function app_private.get_my_notifications_impl(
  p_unread_only boolean default false,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  correlation_id uuid := gen_random_uuid();
  result_items jsonb := '[]'::jsonb;
  unread_count integer := 0;
  effective_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  next_created_at timestamptz;
  next_id uuid;
begin
  if actor_id is null or not app_private.has_active_profile(false) then
    return jsonb_build_object(
      'ok', false,
      'data', null,
      'error', jsonb_build_object(
        'code', 'AUTH_REQUIRED',
        'message', 'Vui lòng đăng nhập để tiếp tục.',
        'details', '{}'::jsonb
      ),
      'correlationId', correlation_id
    );
  end if;

  if (p_cursor_created_at is null) <> (p_cursor_id is null) then
    return jsonb_build_object(
      'ok', false,
      'data', null,
      'error', jsonb_build_object(
        'code', 'VALIDATION_ERROR',
        'message', 'Con trỏ phân trang chưa hợp lệ.',
        'details', '{}'::jsonb
      ),
      'correlationId', correlation_id
    );
  end if;

  select count(*)::integer
  into unread_count
  from api.user_notifications as n
  where n.user_id = actor_id
    and n.read_at is null
    and n.expires_at > now();

  with selected as (
    select n.*
    from api.user_notifications as n
    where n.user_id = actor_id
      and n.expires_at > now()
      and (not coalesce(p_unread_only, false) or n.read_at is null)
      and (
        p_cursor_created_at is null
        or (n.created_at, n.id) < (p_cursor_created_at, p_cursor_id)
      )
    order by n.created_at desc, n.id desc
    limit effective_limit
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'severity', s.severity,
        'category', s.category,
        'title', s.title,
        'message', s.message,
        'actionRoute', s.action_route,
        'entityType', s.entity_type,
        'entityId', s.entity_id,
        'correlationId', s.correlation_id,
        'readAt', s.read_at,
        'createdAt', s.created_at
      )
      order by s.created_at desc, s.id desc
    ),
    '[]'::jsonb
  )
  into result_items
  from selected as s;

  if jsonb_array_length(result_items) = effective_limit then
    select n.created_at, n.id
    into next_created_at, next_id
    from api.user_notifications as n
    where n.user_id = actor_id
      and n.expires_at > now()
      and (not coalesce(p_unread_only, false) or n.read_at is null)
      and (
        p_cursor_created_at is null
        or (n.created_at, n.id) < (p_cursor_created_at, p_cursor_id)
      )
    order by n.created_at desc, n.id desc
    offset effective_limit - 1
    limit 1;
  end if;

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'items', result_items,
      'unreadCount', unread_count,
      'nextCursor', case
        when jsonb_array_length(result_items) = effective_limit then
          jsonb_build_object('createdAt', next_created_at, 'id', next_id)
        else null
      end
    ),
    'error', null,
    'correlationId', correlation_id
  );
end;
$$;

create function api.get_my_notifications(
  p_unread_only boolean default false,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.get_my_notifications_impl(
    p_unread_only,
    p_cursor_created_at,
    p_cursor_id,
    p_limit
  );
$$;

create function app_private.mark_notification_read_impl(p_notification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  correlation_id uuid := gen_random_uuid();
  notification_read_at timestamptz;
begin
  if actor_id is null or not app_private.has_active_profile(false) then
    return jsonb_build_object(
      'ok', false,
      'data', null,
      'error', jsonb_build_object(
        'code', 'AUTH_REQUIRED',
        'message', 'Vui lòng đăng nhập để tiếp tục.',
        'details', '{}'::jsonb
      ),
      'correlationId', correlation_id
    );
  end if;

  update api.user_notifications as n
  set read_at = coalesce(n.read_at, now())
  where n.id = p_notification_id
    and n.user_id = actor_id
    and n.expires_at > now()
  returning n.read_at into notification_read_at;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'data', null,
      'error', jsonb_build_object(
        'code', 'NOTIFICATION_NOT_FOUND',
        'message', 'Không tìm thấy thông báo.',
        'details', '{}'::jsonb
      ),
      'correlationId', correlation_id
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'notificationId', p_notification_id,
      'readAt', notification_read_at
    ),
    'error', null,
    'correlationId', correlation_id
  );
end;
$$;

create function api.mark_notification_read(p_notification_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.mark_notification_read_impl(p_notification_id);
$$;

create function app_private.mark_all_notifications_read_impl()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  correlation_id uuid := gen_random_uuid();
  affected_count integer := 0;
begin
  if actor_id is null or not app_private.has_active_profile(false) then
    return jsonb_build_object(
      'ok', false,
      'data', null,
      'error', jsonb_build_object(
        'code', 'AUTH_REQUIRED',
        'message', 'Vui lòng đăng nhập để tiếp tục.',
        'details', '{}'::jsonb
      ),
      'correlationId', correlation_id
    );
  end if;

  update api.user_notifications as n
  set read_at = now()
  where n.user_id = actor_id
    and n.read_at is null
    and n.expires_at > now();

  get diagnostics affected_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object('updatedCount', affected_count),
    'error', null,
    'correlationId', correlation_id
  );
end;
$$;

create function api.mark_all_notifications_read()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.mark_all_notifications_read_impl();
$$;

revoke all on function app_private.get_my_notifications_impl(
  boolean,
  timestamptz,
  uuid,
  integer
) from public, anon, authenticated;
revoke all on function app_private.mark_notification_read_impl(uuid)
  from public, anon, authenticated;
revoke all on function app_private.mark_all_notifications_read_impl()
  from public, anon, authenticated;
revoke all on function api.get_my_notifications(
  boolean,
  timestamptz,
  uuid,
  integer
) from public, anon, authenticated;
revoke all on function api.mark_notification_read(uuid)
  from public, anon, authenticated;
revoke all on function api.mark_all_notifications_read()
  from public, anon, authenticated;

grant execute on function app_private.get_my_notifications_impl(
  boolean,
  timestamptz,
  uuid,
  integer
) to authenticated;
grant execute on function app_private.mark_notification_read_impl(uuid)
  to authenticated;
grant execute on function app_private.mark_all_notifications_read_impl()
  to authenticated;
grant execute on function api.get_my_notifications(
  boolean,
  timestamptz,
  uuid,
  integer
) to authenticated;
grant execute on function api.mark_notification_read(uuid)
  to authenticated;
grant execute on function api.mark_all_notifications_read()
  to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'api'
      and tablename = 'user_notifications'
  ) then
    alter publication supabase_realtime add table api.user_notifications;
  end if;
end
$$;
