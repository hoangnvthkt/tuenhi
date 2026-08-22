create or replace function app_private.list_import_runs_impl(
  p_target_type text,
  p_status text,
  p_cursor_created_at timestamptz,
  p_cursor_id uuid,
  p_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_correlation_id uuid := gen_random_uuid();
  v_items jsonb;
  v_next_created_at timestamptz;
  v_next_id uuid;
begin
  if not app_private.has_active_profile(false) then
    return app_private.command_error(
      'AUTH_REQUIRED', 'Vui lòng đăng nhập để xem lịch sử nhập.', v_correlation_id
    );
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100
    or ((p_cursor_created_at is null) <> (p_cursor_id is null))
  then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Bộ lọc lịch sử nhập chưa hợp lệ.', v_correlation_id
    );
  end if;
  with page as (
    select r.* from api.import_runs r
    where r.actor_id = v_actor_id
      and (p_target_type is null or r.target_type = p_target_type)
      and (p_status is null or r.status = p_status)
      and (p_cursor_created_at is null
        or (r.created_at, r.id) < (p_cursor_created_at, p_cursor_id))
    order by r.created_at desc, r.id desc
    limit p_limit + 1
  ), numbered as (
    select page.*, row_number() over (order by created_at desc, id desc) ordinal
    from page
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'importRunId', id, 'targetType', target_type, 'fileName', file_name,
      'mode', mode, 'status', status, 'totalRows', total_rows,
      'validRows', valid_rows, 'invalidRows', invalid_rows,
      'createdAt', created_at, 'committedAt', committed_at
    ) order by created_at desc, id desc) filter (where ordinal <= p_limit), '[]'::jsonb),
    max(created_at) filter (where ordinal = p_limit),
    (max(id::text) filter (where ordinal = p_limit))::uuid
  into v_items, v_next_created_at, v_next_id
  from numbered;
  if jsonb_array_length(v_items) < p_limit or not exists (
    select 1 from api.import_runs r where r.actor_id = v_actor_id
      and (v_next_created_at is not null)
      and (r.created_at, r.id) < (v_next_created_at, v_next_id)
      and (p_target_type is null or r.target_type = p_target_type)
      and (p_status is null or r.status = p_status)
  ) then
    v_next_created_at := null;
    v_next_id := null;
  end if;
  return app_private.command_success(
    jsonb_build_object(
      'items', v_items,
      'nextCursor', case when v_next_id is null then null else jsonb_build_object(
        'createdAt', v_next_created_at, 'id', v_next_id
      ) end
    ),
    v_correlation_id
  );
end;
$$;
