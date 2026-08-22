create function app_private.cleanup_phase1c_test_users_impl(p_user_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_correlation_id uuid := gen_random_uuid();
  v_requested_count integer := coalesce(cardinality(p_user_ids), 0);
  v_matching_count integer;
  v_product_ids uuid[];
  v_receipt_ids uuid[];
  v_count_ids uuid[];
  v_movement_ids uuid[];
  v_run_ids uuid[];
  v_deleted_profiles integer;
begin
  if v_requested_count < 1 or v_requested_count > 10
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
    and p.email like 'codex-phase1c-%@example.invalid';
  if v_matching_count <> v_requested_count then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Chỉ được dọn tài khoản test Phase 1C do runner tạo.',
      v_correlation_id
    );
  end if;
  if exists (
    select 1 from api.profiles p
    where p.created_by = any(p_user_ids) and not (p.id = any(p_user_ids))
  ) then
    return app_private.command_error(
      'INVALID_STATE', 'Tài khoản test còn liên kết ngoài phạm vi dọn dẹp.',
      v_correlation_id
    );
  end if;

  select coalesce(array_agg(id), '{}'::uuid[]) into v_product_ids
  from api.products where created_by = any(p_user_ids);
  select coalesce(array_agg(id), '{}'::uuid[]) into v_receipt_ids
  from api.purchase_receipts
  where created_by = any(p_user_ids)
    or submitted_by = any(p_user_ids) or posted_by = any(p_user_ids)
    or reversed_by = any(p_user_ids) or cancelled_by = any(p_user_ids);
  select coalesce(array_agg(id), '{}'::uuid[]) into v_count_ids
  from api.stock_counts
  where created_by = any(p_user_ids)
    or submitted_by = any(p_user_ids) or posted_by = any(p_user_ids)
    or cancelled_by = any(p_user_ids);
  select coalesce(array_agg(id), '{}'::uuid[]) into v_movement_ids
  from api.stock_movements
  where actor_id = any(p_user_ids)
    or product_id = any(v_product_ids)
    or (reference_type = 'PURCHASE_RECEIPT' and reference_id = any(v_receipt_ids))
    or (reference_type = 'STOCK_COUNT' and reference_id = any(v_count_ids));
  select coalesce(array_agg(id), '{}'::uuid[]) into v_run_ids
  from api.import_runs where actor_id = any(p_user_ids);

  delete from app_private.inventory_cost_movements
  where stock_movement_id = any(v_movement_ids);
  delete from api.stock_movements where id = any(v_movement_ids);
  delete from api.purchase_receipts where id = any(v_receipt_ids);
  delete from api.stock_counts where id = any(v_count_ids);
  delete from app_private.legacy_opening_balance_suggestions
  where source_import_run_id = any(v_run_ids);
  delete from api.import_runs where id = any(v_run_ids);
  delete from api.product_images where product_id = any(v_product_ids);
  delete from app_private.product_sale_prices where product_id = any(v_product_ids);
  delete from app_private.inventory_cost_balances
  where product_id = any(v_product_ids);
  delete from api.inventory_balances where product_id = any(v_product_ids);
  delete from api.products where id = any(v_product_ids);
  delete from api.categories where created_by = any(p_user_ids);
  delete from api.suppliers where created_by = any(p_user_ids);
  delete from api.customers where created_by = any(p_user_ids);
  delete from api.sales_channels where created_by = any(p_user_ids);
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
      'remainingProducts', (
        select count(*) from api.products where id = any(v_product_ids)
      ),
      'remainingReceipts', (
        select count(*) from api.purchase_receipts where id = any(v_receipt_ids)
      ),
      'remainingCounts', (
        select count(*) from api.stock_counts where id = any(v_count_ids)
      )
    ), v_correlation_id
  );
end;
$$;

create function api.cleanup_phase1c_test_users(p_user_ids uuid[])
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.cleanup_phase1c_test_users_impl(p_user_ids);
$$;

revoke all on function app_private.cleanup_phase1c_test_users_impl(uuid[])
from public, anon, authenticated;
revoke all on function api.cleanup_phase1c_test_users(uuid[])
from public, anon, authenticated;
grant execute on function app_private.cleanup_phase1c_test_users_impl(uuid[])
to service_role;
grant execute on function api.cleanup_phase1c_test_users(uuid[])
to service_role;
