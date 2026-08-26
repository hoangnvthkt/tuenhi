create or replace function app_private.get_owner_pilot_real_data_verification_impl(
  p_stage text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lifecycle app_private.project_lifecycle%rowtype;
  v_stage text := upper(coalesce(p_stage, ''));
  v_correlation uuid := extensions.gen_random_uuid();
  v_counts jsonb;
  v_financial jsonb;
  v_inventory_value numeric(20,2);
  v_on_hand_quantity numeric(18,0);
  v_opening_movements bigint;
begin
  if auth.role() <> 'service_role' then
    return app_private.command_error('PERMISSION_DENIED', 'Chỉ script cutover được xác nhận mới có thể đối soát dữ liệu Owner Pilot.', v_correlation);
  end if;
  if v_stage not in ('EMPTY', 'CATALOG', 'OPENING') then
    return app_private.command_error('VALIDATION_ERROR', 'Mốc đối soát phải là EMPTY, CATALOG hoặc OPENING.', v_correlation);
  end if;

  select * into v_lifecycle from app_private.project_lifecycle where id = true;
  if v_lifecycle.mode <> 'OWNER_PILOT' or v_lifecycle.staff_access_policy not in ('OWNER_WAIVER', 'LEAKED_PASSWORD_PROTECTED') then
    return app_private.command_error('INVALID_STATE', 'Chỉ có thể đối soát dữ liệu trong Owner Pilot với policy nhân viên đã audit.', v_correlation);
  end if;

  select jsonb_build_object(
    'categories', (select count(*) from api.categories),
    'suppliers', (select count(*) from api.suppliers),
    'customers', (select count(*) from api.customers),
    'products', (select count(*) from api.products),
    'productImages', (select count(*) from api.product_images),
    'inventoryBalances', (select count(*) from api.inventory_balances),
    'stockMovements', (select count(*) from api.stock_movements),
    'sales', (select count(*) from api.sales),
    'saleReturns', (select count(*) from api.sale_returns),
    'stockCounts', (select count(*) from api.stock_counts),
    'importRuns', (select count(*) from api.import_runs),
    'legacySales', (select count(*) from api.legacy_sales)
  ) into v_counts;
  select jsonb_build_object(
    'eventCount', count(*),
    'netRevenue', coalesce(sum(event.net_revenue), 0)::text,
    'netCogs', coalesce(sum(event.cogs_delta), 0)::text
  ) into v_financial from app_private.sales_financial_events event;
  select coalesce(sum(balance.inventory_value), 0) into v_inventory_value from app_private.inventory_cost_balances balance;
  select coalesce(sum(balance.on_hand_qty), 0) into v_on_hand_quantity from api.inventory_balances balance;
  select count(*) into v_opening_movements from api.stock_movements movement where movement.movement_type = 'OPENING';

  return app_private.command_success(
    jsonb_build_object(
      'stage', v_stage,
      'operationalEmpty',
        (v_counts->>'categories')::bigint = 0
        and (v_counts->>'suppliers')::bigint = 0
        and (v_counts->>'customers')::bigint = 0
        and (v_counts->>'products')::bigint = 0
        and (v_counts->>'productImages')::bigint = 0
        and (v_counts->>'inventoryBalances')::bigint = 0
        and (v_counts->>'stockMovements')::bigint = 0
        and (v_counts->>'sales')::bigint = 0
        and (v_counts->>'saleReturns')::bigint = 0
        and (v_counts->>'stockCounts')::bigint = 0
        and (v_counts->>'importRuns')::bigint = 0
        and (v_counts->>'legacySales')::bigint = 0
        and (v_financial->>'eventCount')::bigint = 0,
      'catalogReady',
        (v_counts->>'products')::bigint > 0
        and (v_counts->>'inventoryBalances')::bigint = (v_counts->>'products')::bigint
        and v_on_hand_quantity = 0
        and v_inventory_value = 0
        and (v_counts->>'stockMovements')::bigint = 0
        and (v_counts->>'sales')::bigint = 0
        and (v_counts->>'saleReturns')::bigint = 0
        and (v_counts->>'stockCounts')::bigint = 0
        and (v_financial->>'eventCount')::bigint = 0,
      'openingReady',
        (v_counts->>'products')::bigint > 0
        and (v_counts->>'inventoryBalances')::bigint > 0
        and v_opening_movements > 0
        and (v_counts->>'sales')::bigint = 0
        and (v_counts->>'saleReturns')::bigint = 0
        and (v_financial->>'eventCount')::bigint = 0
        and (v_financial->>'netRevenue')::numeric = 0
        and (v_financial->>'netCogs')::numeric = 0,
      'counts', v_counts,
      'openingMovementCount', v_opening_movements,
      'onHandQuantity', v_on_hand_quantity::text,
      'inventoryValue', v_inventory_value::text,
      'financial', v_financial
    ),
    v_correlation
  );
end;
$$;
