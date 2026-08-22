create function app_private.cleanup_phase1b_test_users_impl(p_user_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_correlation_id uuid := gen_random_uuid();
  v_requested_count integer := coalesce(cardinality(p_user_ids), 0);
  v_matching_count integer;
  v_deleted_profiles integer;
  v_run_ids uuid[];
  v_product_ids uuid[];
  v_legacy_sale_ids uuid[];
begin
  if v_requested_count < 1 or v_requested_count > 20
    or array_position(p_user_ids, null) is not null
  then
    return app_private.command_error(
      'VALIDATION_ERROR', 'Danh sách tài khoản test chưa hợp lệ.',
      v_correlation_id
    );
  end if;

  select count(*)::integer into v_matching_count
  from api.profiles p
  where p.id = any(p_user_ids)
    and p.email like 'codex-phase1b-%@example.invalid';
  if v_matching_count <> v_requested_count then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Chỉ được dọn tài khoản test Phase 1B do runner tạo.',
      v_correlation_id
    );
  end if;
  if exists (
    select 1 from api.profiles p
    where p.created_by = any(p_user_ids) and not (p.id = any(p_user_ids))
  ) then
    return app_private.command_error(
      'INVALID_STATE',
      'Tài khoản test còn liên kết với hồ sơ ngoài phạm vi dọn dẹp.',
      v_correlation_id
    );
  end if;

  select coalesce(array_agg(id), '{}'::uuid[]) into v_run_ids
  from api.import_runs where actor_id = any(p_user_ids);
  select coalesce(array_agg(id), '{}'::uuid[]) into v_product_ids
  from api.products where created_by = any(p_user_ids);
  select coalesce(array_agg(id), '{}'::uuid[]) into v_legacy_sale_ids
  from api.legacy_sales where source_import_run_id = any(v_run_ids);

  delete from api.legacy_sale_lines where legacy_sale_id = any(v_legacy_sale_ids);
  delete from app_private.legacy_opening_balance_suggestions
  where source_import_run_id = any(v_run_ids);
  delete from api.legacy_sales where id = any(v_legacy_sale_ids);
  delete from api.product_images where product_id = any(v_product_ids);
  delete from app_private.product_sale_prices where product_id = any(v_product_ids);
  delete from api.inventory_balances where product_id = any(v_product_ids);
  delete from api.products where id = any(v_product_ids);
  delete from api.categories where created_by = any(p_user_ids);
  delete from api.suppliers where created_by = any(p_user_ids);
  delete from api.customers where created_by = any(p_user_ids);
  delete from api.sales_channels where created_by = any(p_user_ids);
  delete from api.import_runs where id = any(v_run_ids);
  delete from api.user_notifications where user_id = any(p_user_ids);
  delete from app_private.user_permission_overrides
  where user_id = any(p_user_ids) or changed_by = any(p_user_ids);
  delete from app_private.command_deduplication where actor_id = any(p_user_ids);
  delete from app_private.audit_events where actor_id = any(p_user_ids);
  delete from api.profiles where id = any(p_user_ids);
  get diagnostics v_deleted_profiles = row_count;

  return app_private.command_success(
    jsonb_build_object(
      'deletedProfiles', v_deleted_profiles,
      'remainingProfiles', (
        select count(*) from api.profiles where id = any(p_user_ids)
      ),
      'remainingImportRuns', (
        select count(*) from api.import_runs where id = any(v_run_ids)
      ),
      'remainingProducts', (
        select count(*) from api.products where id = any(v_product_ids)
      ),
      'remainingLegacySales', (
        select count(*) from api.legacy_sales where id = any(v_legacy_sale_ids)
      )
    ),
    v_correlation_id
  );
end;
$$;

create function api.cleanup_phase1b_test_users(p_user_ids uuid[])
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.cleanup_phase1b_test_users_impl(p_user_ids);
$$;

revoke all on function app_private.cleanup_phase1b_test_users_impl(uuid[])
from public, anon, authenticated;
revoke all on function api.cleanup_phase1b_test_users(uuid[])
from public, anon, authenticated;
grant execute on function app_private.cleanup_phase1b_test_users_impl(uuid[])
to service_role;
grant execute on function api.cleanup_phase1b_test_users(uuid[])
to service_role;
