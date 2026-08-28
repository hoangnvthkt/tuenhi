create function app_private.get_my_command_outcome_impl(
  p_command_name text,
  p_idempotency_key uuid
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
  v_command_name text := btrim(coalesce(p_command_name, ''));
  v_response jsonb;
begin
  if v_actor_id is null or not app_private.has_active_profile() then
    return app_private.command_error(
      'AUTH_REQUIRED',
      'Vui lòng đăng nhập để kiểm tra kết quả giao dịch.',
      v_correlation_id
    );
  end if;

  if p_idempotency_key is null
    or v_command_name not in (
      'sale.complete',
      'sale.cancel',
      'sale.return.complete',
      'purchase.post',
      'purchase.reverse',
      'stock.count.post',
      'opening.post'
    ) then
    return app_private.command_error(
      'VALIDATION_ERROR',
      'Mã yêu cầu hoặc loại giao dịch chưa hợp lệ.',
      v_correlation_id
    );
  end if;

  select d.response
  into v_response
  from app_private.command_deduplication as d
  where d.actor_id = v_actor_id
    and d.command_name = v_command_name
    and d.idempotency_key = p_idempotency_key;

  if v_response is null then
    return app_private.command_success(
      jsonb_build_object('status', 'NOT_FOUND', 'response', null),
      v_correlation_id
    );
  end if;

  return app_private.command_success(
    jsonb_build_object('status', 'RESOLVED', 'response', v_response),
    v_correlation_id
  );
end;
$$;

create function api.get_my_command_outcome(
  p_command_name text,
  p_idempotency_key uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.get_my_command_outcome_impl(
    p_command_name,
    p_idempotency_key
  );
$$;

revoke all on function app_private.get_my_command_outcome_impl(text, uuid)
from public, anon, authenticated, service_role;
revoke all on function api.get_my_command_outcome(text, uuid)
from public, anon, authenticated, service_role;

grant execute on function app_private.get_my_command_outcome_impl(text, uuid)
to authenticated;
grant execute on function api.get_my_command_outcome(text, uuid)
to authenticated;
