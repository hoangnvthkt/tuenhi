create index sales_financial_events_occurred_idx
  on app_private.sales_financial_events(occurred_at desc, id desc);
create index sales_financial_events_actor_occurred_idx
  on app_private.sales_financial_events(attributed_user_id, occurred_at desc, id desc);
create index sale_returns_status_updated_idx
  on api.sale_returns(status, updated_at desc, id desc);

create function app_private.report_period_is_valid(p_from date, p_to date)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_from is not null
    and p_to is not null
    and p_to >= p_from
    and p_to - p_from <= 365;
$$;

create function app_private.revenue_report_data(
  p_from date,
  p_to date,
  p_attributed_user_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with period as (
    select p_from::timestamp at time zone 'Asia/Ho_Chi_Minh' as starts_at,
      (p_to + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh' as ends_at
  ), events as (
    select event.id, event.sale_id, event.sale_return_id, event.event_type,
      event.gross_sales, event.net_revenue, event.cogs_delta,
      event.attributed_user_id, event.occurred_at,
      sale.sale_number, sale.sales_channel_code_snapshot,
      sale.sales_channel_name_snapshot, sale.line_discount_total,
      sale.order_discount_total,
      coalesce(lines.total_quantity, 0)::numeric(18,3) as sold_quantity,
      case
        when event.event_type = 'RETURN_COMPLETED' then (
          select payment.method from api.sale_return_payments payment
          where payment.sale_return_id = event.sale_return_id
            and payment.status = 'REFUNDED'
          limit 1
        )
        else (
          select payment.method from api.payments payment
          where payment.sale_id = event.sale_id
          limit 1
        )
      end as payment_method
    from app_private.sales_financial_events event
    join api.sales sale on sale.id = event.sale_id
    left join lateral (
      select coalesce(sum(line.quantity), 0) as total_quantity
      from api.sale_lines line
      where line.sale_id = event.sale_id
    ) lines on event.event_type = 'SALE_COMPLETED'
    join period on event.occurred_at >= period.starts_at
      and event.occurred_at < period.ends_at
    where p_attributed_user_id is null
      or event.attributed_user_id = p_attributed_user_id
  ), summary as (
    select count(*) filter (where event_type = 'SALE_COMPLETED')::integer as completed_order_count,
      coalesce(sum(sold_quantity) filter (where event_type = 'SALE_COMPLETED'), 0)::numeric(18,3) as sold_quantity,
      coalesce(sum(gross_sales), 0)::numeric(20,2) as gross_sales,
      coalesce(sum(line_discount_total) filter (where event_type = 'SALE_COMPLETED'), 0)::numeric(20,2) as line_discounts,
      coalesce(sum(order_discount_total) filter (where event_type = 'SALE_COMPLETED'), 0)::numeric(20,2) as order_discounts,
      coalesce(-sum(net_revenue) filter (where event_type = 'RETURN_COMPLETED'), 0)::numeric(20,2) as sales_returns,
      coalesce(-sum(net_revenue) filter (where event_type = 'SALE_CANCELLED'), 0)::numeric(20,2) as cancellations,
      coalesce(sum(net_revenue), 0)::numeric(20,2) as net_revenue,
      coalesce(sum(cogs_delta), 0)::numeric(20,2) as net_cogs,
      coalesce(sum(net_revenue) filter (where event_type = 'SALE_COMPLETED'), 0)::numeric(20,2) as completed_sales_net
    from events
  ), daily as (
    select to_char(timezone('Asia/Ho_Chi_Minh', occurred_at)::date, 'YYYY-MM-DD') as day,
      count(*) filter (where event_type = 'SALE_COMPLETED')::integer as completed_order_count,
      coalesce(sum(sold_quantity) filter (where event_type = 'SALE_COMPLETED'), 0)::numeric(18,3) as sold_quantity,
      coalesce(sum(gross_sales), 0)::numeric(20,2) as gross_sales,
      coalesce(sum(line_discount_total) filter (where event_type = 'SALE_COMPLETED'), 0)::numeric(20,2) as line_discounts,
      coalesce(sum(order_discount_total) filter (where event_type = 'SALE_COMPLETED'), 0)::numeric(20,2) as order_discounts,
      coalesce(-sum(net_revenue) filter (where event_type = 'RETURN_COMPLETED'), 0)::numeric(20,2) as sales_returns,
      coalesce(-sum(net_revenue) filter (where event_type = 'SALE_CANCELLED'), 0)::numeric(20,2) as cancellations,
      coalesce(sum(net_revenue), 0)::numeric(20,2) as net_revenue
    from events group by 1
  ), channels as (
    select coalesce(sales_channel_code_snapshot, 'UNKNOWN') as code,
      coalesce(sales_channel_name_snapshot, 'Không xác định') as name,
      count(*) filter (where event_type = 'SALE_COMPLETED')::integer as completed_order_count,
      coalesce(sum(gross_sales), 0)::numeric(20,2) as gross_sales,
      coalesce(sum(net_revenue), 0)::numeric(20,2) as net_revenue
    from events group by 1, 2
  ), payment_methods as (
    select coalesce(payment_method, 'UNKNOWN') as method,
      count(*) filter (where event_type = 'SALE_COMPLETED')::integer as completed_order_count,
      coalesce(sum(gross_sales), 0)::numeric(20,2) as gross_sales,
      coalesce(sum(net_revenue), 0)::numeric(20,2) as net_revenue
    from events group by 1
  )
  select jsonb_build_object(
    'version', 1,
    'timezone', 'Asia/Ho_Chi_Minh',
    'range', jsonb_build_object('from', p_from::text, 'to', p_to::text),
    'generatedAt', now(),
    'summary', (select jsonb_build_object(
      'completedOrderCount', completed_order_count,
      'soldQuantity', sold_quantity::text,
      'grossSales', gross_sales::text,
      'lineDiscounts', line_discounts::text,
      'orderDiscounts', order_discounts::text,
      'salesReturns', sales_returns::text,
      'cancellations', cancellations::text,
      'netRevenue', net_revenue::text,
      'netCogs', net_cogs::text,
      'averageOrderValue', case when completed_order_count = 0 then null else round(completed_sales_net / completed_order_count, 2)::text end
    ) from summary),
    'daily', coalesce((select jsonb_agg(jsonb_build_object(
      'day', day, 'completedOrderCount', completed_order_count,
      'soldQuantity', sold_quantity::text, 'grossSales', gross_sales::text,
      'lineDiscounts', line_discounts::text, 'orderDiscounts', order_discounts::text,
      'salesReturns', sales_returns::text, 'cancellations', cancellations::text,
      'netRevenue', net_revenue::text
    ) order by day) from daily), '[]'::jsonb),
    'channels', coalesce((select jsonb_agg(jsonb_build_object(
      'code', code, 'name', name, 'completedOrderCount', completed_order_count,
      'grossSales', gross_sales::text, 'netRevenue', net_revenue::text
    ) order by net_revenue desc, code) from channels), '[]'::jsonb),
    'paymentMethods', coalesce((select jsonb_agg(jsonb_build_object(
      'method', method, 'completedOrderCount', completed_order_count,
      'grossSales', gross_sales::text, 'netRevenue', net_revenue::text
    ) order by net_revenue desc, method) from payment_methods), '[]'::jsonb)
  );
$$;

create function app_private.get_operational_dashboard_impl(p_from date, p_to date)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_correlation_id uuid := gen_random_uuid(); v_actor uuid := (select auth.uid());
begin
  if not app_private.has_permission('dashboard.operational.read') then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền xem tổng quan.', v_correlation_id);
  end if;
  if not app_private.report_period_is_valid(p_from, p_to) then
    return app_private.command_error('REPORT_DATE_RANGE_INVALID', 'Khoảng thời gian báo cáo chưa hợp lệ.', v_correlation_id);
  end if;
  return app_private.command_success(jsonb_build_object(
    'version', 1, 'timezone', 'Asia/Ho_Chi_Minh',
    'catalog', (select jsonb_build_object(
      'activeProductCount', count(*) filter (where product.is_active)::integer,
      'outOfStockCount', count(*) filter (where product.is_active and balance.on_hand_qty = 0)::integer,
      'lowStockCount', count(*) filter (where product.is_active and balance.on_hand_qty > 0 and balance.on_hand_qty <= product.min_stock_qty)::integer,
      'totalOnHandQty', coalesce(sum(balance.on_hand_qty) filter (where product.is_active), 0)::text
    ) from api.products product join api.inventory_balances balance on balance.product_id = product.id),
    'pending', jsonb_build_object(
      'purchaseReceipts', (select count(*)::integer from api.purchase_receipts receipt where receipt.status = 'AWAITING_COST' and (app_private.has_permission('purchase.cost.enter') or receipt.created_by = v_actor)),
      'stockCounts', (select count(*)::integer from api.stock_counts count_document where count_document.status = 'COUNTED' and (app_private.has_permission('inventory.adjustment.post') or count_document.created_by = v_actor)),
      'saleReturns', (select count(*)::integer from api.sale_returns return_document where return_document.status = 'REQUESTED' and (app_private.has_permission('return.complete') or return_document.created_by = v_actor))
    )
  ), v_correlation_id);
end;
$$;

create function app_private.get_my_sales_summary_impl(p_from date, p_to date)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_correlation_id uuid := gen_random_uuid();
begin
  if not app_private.has_permission('report.own_revenue.read') then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền xem doanh thu cá nhân.', v_correlation_id);
  end if;
  if not app_private.report_period_is_valid(p_from, p_to) then
    return app_private.command_error('REPORT_DATE_RANGE_INVALID', 'Khoảng thời gian báo cáo chưa hợp lệ.', v_correlation_id);
  end if;
  return app_private.command_success(app_private.revenue_report_data(p_from, p_to, (select auth.uid())) #- '{summary,netCogs}', v_correlation_id);
end;
$$;

create function app_private.get_revenue_report_impl(p_from date, p_to date, p_scope text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_correlation_id uuid := gen_random_uuid(); v_actor uuid := (select auth.uid()); v_data jsonb;
begin
  if p_scope not in ('OWN', 'ALL') then
    return app_private.command_error('REPORT_SCOPE_DENIED', 'Phạm vi báo cáo chưa hợp lệ.', v_correlation_id);
  end if;
  if not app_private.report_period_is_valid(p_from, p_to) then
    return app_private.command_error('REPORT_DATE_RANGE_INVALID', 'Khoảng thời gian báo cáo chưa hợp lệ.', v_correlation_id);
  end if;
  if p_scope = 'OWN' and not app_private.has_permission('report.own_revenue.read') then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền xem doanh thu cá nhân.', v_correlation_id);
  end if;
  if p_scope = 'ALL' and not app_private.has_permission('report.all_revenue.read') then
    return app_private.command_error('REPORT_SCOPE_DENIED', 'Bạn không có quyền xem doanh thu toàn cửa hàng.', v_correlation_id);
  end if;
  v_data := app_private.revenue_report_data(p_from, p_to, case when p_scope = 'OWN' then v_actor else null end) #- '{summary,netCogs}';
  return app_private.command_success(v_data || jsonb_build_object('scope', p_scope), v_correlation_id);
end;
$$;

create function app_private.get_owner_dashboard_impl(p_from date, p_to date)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_correlation_id uuid := gen_random_uuid(); v_revenue jsonb; v_net_revenue numeric(20,2); v_net_cogs numeric(20,2);
begin
  if not app_private.has_permission('report.cost_profit.read') then
    return app_private.command_error('PERMISSION_DENIED', 'Chỉ chủ cửa hàng được xem lợi nhuận.', v_correlation_id);
  end if;
  if not app_private.report_period_is_valid(p_from, p_to) then
    return app_private.command_error('REPORT_DATE_RANGE_INVALID', 'Khoảng thời gian báo cáo chưa hợp lệ.', v_correlation_id);
  end if;
  v_revenue := app_private.revenue_report_data(p_from, p_to, null);
  v_net_revenue := (v_revenue #>> '{summary,netRevenue}')::numeric;
  v_net_cogs := (v_revenue #>> '{summary,netCogs}')::numeric;
  return app_private.command_success(jsonb_build_object(
    'version', 1, 'netRevenue', v_net_revenue::text, 'netCogs', v_net_cogs::text,
    'grossProfit', (v_net_revenue - v_net_cogs)::text,
    'grossMarginPct', case when v_net_revenue = 0 then null else round((v_net_revenue - v_net_cogs) / v_net_revenue * 100, 2)::text end,
    'inventoryValue', (select coalesce(sum(balance.inventory_value), 0)::text from app_private.inventory_cost_balances balance)
  ), v_correlation_id);
end;
$$;

create function app_private.get_profit_report_impl(p_from date, p_to date, p_cursor_occurred_at timestamptz, p_cursor_id uuid, p_limit integer)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_correlation_id uuid := gen_random_uuid(); v_items jsonb; v_next_at timestamptz; v_next_id uuid;
begin
  if not app_private.has_permission('report.cost_profit.read') then
    return app_private.command_error('PERMISSION_DENIED', 'Chỉ chủ cửa hàng được xem chi tiết lợi nhuận.', v_correlation_id);
  end if;
  if not app_private.report_period_is_valid(p_from, p_to) then
    return app_private.command_error('REPORT_DATE_RANGE_INVALID', 'Khoảng thời gian báo cáo chưa hợp lệ.', v_correlation_id);
  end if;
  if p_limit is null or p_limit not between 1 and 100 or ((p_cursor_occurred_at is null) <> (p_cursor_id is null)) then
    return app_private.command_error('REPORT_LIMIT_INVALID', 'Phân trang báo cáo chưa hợp lệ.', v_correlation_id);
  end if;
  with period as (
    select p_from::timestamp at time zone 'Asia/Ho_Chi_Minh' as starts_at, (p_to + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh' as ends_at
  ), page as (
    select event.*, sale.sale_number, sale.sales_channel_code_snapshot, sale.sales_channel_name_snapshot,
      profile.display_name as attributed_user_name,
      case when event.event_type = 'RETURN_COMPLETED' then (select payment.method from api.sale_return_payments payment where payment.sale_return_id = event.sale_return_id and payment.status = 'REFUNDED' limit 1)
      else (select payment.method from api.payments payment where payment.sale_id = event.sale_id limit 1) end as payment_method,
      (select return_document.return_number from api.sale_returns return_document where return_document.id = event.sale_return_id) as return_number,
      row_number() over (order by event.occurred_at desc, event.id desc) as ordinal
    from app_private.sales_financial_events event
    join api.sales sale on sale.id = event.sale_id
    join api.profiles profile on profile.id = event.attributed_user_id
    join period on event.occurred_at >= period.starts_at and event.occurred_at < period.ends_at
    where p_cursor_occurred_at is null or (event.occurred_at, event.id) < (p_cursor_occurred_at, p_cursor_id)
    order by event.occurred_at desc, event.id desc limit p_limit + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'eventType', event_type, 'saleId', sale_id, 'saleNumber', sale_number,
    'returnId', sale_return_id, 'returnNumber', return_number, 'occurredAt', occurred_at,
    'attributedUserName', attributed_user_name, 'channelCode', sales_channel_code_snapshot,
    'channelName', sales_channel_name_snapshot, 'paymentMethod', payment_method,
    'grossSales', gross_sales::text, 'netRevenue', net_revenue::text,
    'netCogs', cogs_delta::text, 'grossProfit', (net_revenue - cogs_delta)::text
  ) order by occurred_at desc, id desc) filter (where ordinal <= p_limit), '[]'::jsonb),
  (array_agg(occurred_at order by occurred_at desc, id desc) filter (where ordinal = p_limit))[1],
  (array_agg(id order by occurred_at desc, id desc) filter (where ordinal = p_limit))[1]
  into v_items, v_next_at, v_next_id from page;
  if jsonb_array_length(v_items) < p_limit then v_next_at := null; v_next_id := null; end if;
  return app_private.command_success(jsonb_build_object('version', 1, 'items', v_items, 'nextCursor', case when v_next_id is null then null else jsonb_build_object('occurredAt', v_next_at, 'id', v_next_id) end), v_correlation_id);
end;
$$;

drop function api.get_inventory_valuation(text, uuid, integer);
drop function app_private.get_inventory_valuation_impl(text, uuid, integer);

create function app_private.get_inventory_valuation_impl(p_search text, p_cursor_name text, p_cursor_id uuid, p_limit integer)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_correlation_id uuid := gen_random_uuid(); v_items jsonb; v_next_name text; v_next_id uuid; v_search text := nullif(lower(btrim(p_search)), '');
begin
  if not app_private.has_permission('report.cost_profit.read') then return app_private.command_error('PERMISSION_DENIED', 'Chỉ chủ cửa hàng được xem giá trị tồn kho.', v_correlation_id); end if;
  if p_limit is null or p_limit not between 1 and 100 or ((p_cursor_name is null) <> (p_cursor_id is null)) or (v_search is not null and length(v_search) > 100) then return app_private.command_error('VALIDATION_FAILED', 'Bộ lọc định giá tồn kho chưa hợp lệ.', v_correlation_id); end if;
  with page as (
    select product.id, product.sku, product.name, product.name_normalized, product.unit_name, balance.on_hand_qty, cost.inventory_value, cost.avg_unit_cost,
      row_number() over(order by product.name_normalized, product.id) ordinal
    from api.products product join api.inventory_balances balance on balance.product_id = product.id join app_private.inventory_cost_balances cost on cost.product_id = product.id
    where (v_search is null or product.name_normalized like '%' || v_search || '%' or product.sku_normalized like '%' || v_search || '%')
      and (p_cursor_name is null or (product.name_normalized, product.id) > (p_cursor_name, p_cursor_id))
    order by product.name_normalized, product.id limit p_limit + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('productId', id, 'sku', sku, 'name', name, 'unitName', unit_name, 'onHandQty', on_hand_qty::text, 'avgUnitCost', avg_unit_cost::text, 'inventoryValue', inventory_value::text) order by name_normalized, id) filter(where ordinal <= p_limit), '[]'::jsonb),
    (array_agg(name_normalized order by name_normalized, id) filter(where ordinal = p_limit))[1], (array_agg(id order by name_normalized, id) filter(where ordinal = p_limit))[1]
  into v_items, v_next_name, v_next_id from page;
  if jsonb_array_length(v_items) < p_limit then v_next_name := null; v_next_id := null; end if;
  return app_private.command_success(jsonb_build_object('version', 2, 'items', v_items, 'nextCursor', case when v_next_id is null then null else jsonb_build_object('name', v_next_name, 'id', v_next_id) end, 'totalInventoryValue', (select coalesce(sum(balance.inventory_value), 0)::text from app_private.inventory_cost_balances balance)), v_correlation_id);
end;
$$;

create function api.get_operational_dashboard(p_from date, p_to date) returns jsonb language sql volatile security invoker set search_path = '' as $$ select app_private.get_operational_dashboard_impl(p_from, p_to); $$;
create function api.get_my_sales_summary(p_from date, p_to date) returns jsonb language sql volatile security invoker set search_path = '' as $$ select app_private.get_my_sales_summary_impl(p_from, p_to); $$;
create function api.get_revenue_report(p_from date, p_to date, p_scope text) returns jsonb language sql volatile security invoker set search_path = '' as $$ select app_private.get_revenue_report_impl(p_from, p_to, p_scope); $$;
create function api.get_owner_dashboard(p_from date, p_to date) returns jsonb language sql volatile security invoker set search_path = '' as $$ select app_private.get_owner_dashboard_impl(p_from, p_to); $$;
create function api.get_profit_report(p_from date, p_to date, p_cursor_occurred_at timestamptz default null, p_cursor_id uuid default null, p_limit integer default 50) returns jsonb language sql volatile security invoker set search_path = '' as $$ select app_private.get_profit_report_impl(p_from, p_to, p_cursor_occurred_at, p_cursor_id, p_limit); $$;
create function api.get_inventory_valuation(p_search text default null, p_cursor_name text default null, p_cursor_id uuid default null, p_limit integer default 50) returns jsonb language sql volatile security invoker set search_path = '' as $$ select app_private.get_inventory_valuation_impl(p_search, p_cursor_name, p_cursor_id, p_limit); $$;

revoke execute on function app_private.revenue_report_data(date, date, uuid) from public, anon, authenticated;
revoke execute on function app_private.get_operational_dashboard_impl(date, date) from public, anon;
revoke execute on function app_private.get_my_sales_summary_impl(date, date) from public, anon;
revoke execute on function app_private.get_revenue_report_impl(date, date, text) from public, anon;
revoke execute on function app_private.get_owner_dashboard_impl(date, date) from public, anon;
revoke execute on function app_private.get_profit_report_impl(date, date, timestamptz, uuid, integer) from public, anon;
revoke execute on function app_private.get_inventory_valuation_impl(text, text, uuid, integer) from public, anon;
revoke execute on function api.get_operational_dashboard(date, date), api.get_my_sales_summary(date, date), api.get_revenue_report(date, date, text), api.get_owner_dashboard(date, date), api.get_profit_report(date, date, timestamptz, uuid, integer), api.get_inventory_valuation(text, text, uuid, integer) from public, anon;
grant execute on function api.get_operational_dashboard(date, date), api.get_my_sales_summary(date, date), api.get_revenue_report(date, date, text), api.get_owner_dashboard(date, date), api.get_profit_report(date, date, timestamptz, uuid, integer), api.get_inventory_valuation(text, text, uuid, integer) to authenticated;
