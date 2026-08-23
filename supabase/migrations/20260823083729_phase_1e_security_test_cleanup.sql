create function app_private.cleanup_phase1e_test_users_impl(p_user_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_correlation uuid := gen_random_uuid();
  v_requested integer := coalesce(cardinality(p_user_ids), 0);
  v_matching integer;
  v_product_ids uuid[];
  v_sale_ids uuid[];
  v_return_ids uuid[];
  v_count_ids uuid[];
  v_movement_ids uuid[];
  v_deleted integer;
begin
  if v_requested < 1 or v_requested > 10 or array_position(p_user_ids, null) is not null then
    return app_private.command_error('VALIDATION_ERROR', 'Danh sách tài khoản test chưa hợp lệ.', v_correlation);
  end if;
  select count(*) into v_matching from api.profiles
  where id = any(p_user_ids) and email like 'codex-phase1e-%@example.invalid';
  if v_matching <> v_requested then
    return app_private.command_error('PERMISSION_DENIED', 'Chỉ dọn dữ liệu test Phase 1E do runner tạo.', v_correlation);
  end if;
  select coalesce(array_agg(id), '{}'::uuid[]) into v_product_ids
  from api.products where created_by = any(p_user_ids);
  select coalesce(array_agg(id), '{}'::uuid[]) into v_sale_ids
  from api.sales where created_by = any(p_user_ids);
  select coalesce(array_agg(id), '{}'::uuid[]) into v_return_ids
  from api.sale_returns
  where original_sale_id = any(v_sale_ids) or created_by = any(p_user_ids)
    or completed_by = any(p_user_ids) or cancelled_by = any(p_user_ids);
  select coalesce(array_agg(id), '{}'::uuid[]) into v_count_ids
  from api.stock_counts count_document where (
    count_document.created_by = any(p_user_ids) or count_document.submitted_by = any(p_user_ids)
    or count_document.posted_by = any(p_user_ids) or count_document.cancelled_by = any(p_user_ids)
    or exists (select 1 from api.stock_count_lines line
      where line.stock_count_id = count_document.id and line.product_id = any(v_product_ids))
  );
  select coalesce(array_agg(id), '{}'::uuid[]) into v_movement_ids
  from api.stock_movements
  where product_id = any(v_product_ids)
    or reference_id = any(v_sale_ids)
    or reference_id = any(v_return_ids)
    or reference_id = any(v_count_ids);

  delete from app_private.sales_financial_events
  where sale_id = any(v_sale_ids) or sale_return_id = any(v_return_ids);
  delete from app_private.sale_return_line_costs
  where sale_return_line_id in (
    select id from api.sale_return_lines where sale_return_id = any(v_return_ids)
  );
  delete from api.sale_return_payments where sale_return_id = any(v_return_ids);
  delete from api.sale_returns where id = any(v_return_ids);
  delete from app_private.stock_count_adjustment_costs
  where stock_count_line_id in (
    select id from api.stock_count_lines where stock_count_id = any(v_count_ids)
  );
  delete from app_private.inventory_cost_movements where stock_movement_id = any(v_movement_ids);
  delete from api.stock_movements where id = any(v_movement_ids);
  delete from app_private.sale_line_costs
  where sale_line_id in (select id from api.sale_lines where sale_id = any(v_sale_ids));
  delete from app_private.sale_invoice_store_snapshots where sale_id = any(v_sale_ids);
  delete from api.payments where sale_id = any(v_sale_ids);
  delete from api.sales where id = any(v_sale_ids);
  delete from api.stock_counts where id = any(v_count_ids);
  delete from api.product_images where product_id = any(v_product_ids);
  delete from app_private.product_sale_prices where product_id = any(v_product_ids);
  delete from app_private.inventory_cost_balances where product_id = any(v_product_ids);
  delete from api.inventory_balances where product_id = any(v_product_ids);
  delete from api.products where id = any(v_product_ids);
  delete from api.user_notifications where user_id = any(p_user_ids);
  delete from app_private.user_permission_overrides
  where user_id = any(p_user_ids) or changed_by = any(p_user_ids);
  delete from app_private.command_deduplication where actor_id = any(p_user_ids);
  delete from app_private.audit_events where actor_id = any(p_user_ids);
  delete from api.profiles where id = any(p_user_ids);
  get diagnostics v_deleted = row_count;
  return app_private.command_success(jsonb_build_object(
    'deletedProfiles', v_deleted,
    'remainingProfiles', (select count(*) from api.profiles where id = any(p_user_ids)),
    'remainingSales', (select count(*) from api.sales where id = any(v_sale_ids)),
    'remainingReturns', (select count(*) from api.sale_returns where id = any(v_return_ids)),
    'remainingCounts', (select count(*) from api.stock_counts where id = any(v_count_ids))
  ), v_correlation);
end;
$$;

create function api.cleanup_phase1e_test_users(p_user_ids uuid[])
returns jsonb language sql security invoker set search_path = ''
as $$ select app_private.cleanup_phase1e_test_users_impl(p_user_ids); $$;

revoke all on function app_private.cleanup_phase1e_test_users_impl(uuid[]) from public, anon, authenticated;
revoke all on function api.cleanup_phase1e_test_users(uuid[]) from public, anon, authenticated;
grant execute on function app_private.cleanup_phase1e_test_users_impl(uuid[]) to service_role;
grant execute on function api.cleanup_phase1e_test_users(uuid[]) to service_role;
