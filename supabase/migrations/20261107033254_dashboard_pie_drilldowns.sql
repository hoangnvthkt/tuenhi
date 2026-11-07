-- Wave 2b dashboard: disjoint stock states, product revenue slices and the
-- filters their drilldowns need. Read-only reporting; no business rows change.
begin;

CREATE OR REPLACE FUNCTION app_private.get_operational_dashboard_impl(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      'outOfStockCount', count(*) filter (where product.is_active and balance.on_hand_qty <= 0)::integer,
      'lowStockCount', count(*) filter (where product.is_active and balance.on_hand_qty < app_private.low_stock_threshold(product.unit_name,product.min_stock_qty))::integer,
      'totalOnHandQty', coalesce(sum(balance.on_hand_qty) filter (where product.is_active), 0)::text,
      -- Disjoint counts (they add up to activeProductCount) for the stock chart.
      'stockStates', jsonb_build_object(
        'inStock', count(*) filter (where product.is_active and balance.on_hand_qty > 0 and balance.on_hand_qty >= app_private.low_stock_threshold(product.unit_name,product.min_stock_qty))::integer,
        'runningLow', count(*) filter (where product.is_active and balance.on_hand_qty > 0 and balance.on_hand_qty < app_private.low_stock_threshold(product.unit_name,product.min_stock_qty))::integer,
        'zeroStock', count(*) filter (where product.is_active and balance.on_hand_qty = 0)::integer,
        'negativeStock', count(*) filter (where product.is_active and balance.on_hand_qty < 0)::integer
      )
    ) from api.products product join api.inventory_balances balance on balance.product_id = product.id),
    'pending', jsonb_build_object(
      'purchaseReceipts', (select count(*)::integer from api.purchase_receipts receipt where receipt.status = 'AWAITING_COST' and (app_private.has_permission('purchase.cost.enter') or receipt.created_by = v_actor)),
      'stockCounts', (select count(*)::integer from api.stock_counts count_document where count_document.status = 'COUNTED' and (app_private.has_permission('inventory.adjustment.post') or count_document.created_by = v_actor)),
      'saleReturns', (select count(*)::integer from api.sale_returns return_document where return_document.status = 'REQUESTED' and (app_private.has_permission('return.complete') or return_document.created_by = v_actor))
    )
  ), v_correlation_id);
end;
$function$;

CREATE OR REPLACE FUNCTION app_private.get_product_catalog_impl(p_search text DEFAULT NULL::text, p_category_id uuid DEFAULT NULL::uuid, p_stock_state text DEFAULT NULL::text, p_include_inactive boolean DEFAULT false, p_cursor_name text DEFAULT NULL::text, p_cursor_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_correlation_id uuid := gen_random_uuid();
  v_search text := app_private.normalize_catalog_key(coalesce(p_search, ''));
  v_items jsonb := '[]'::jsonb;
  v_last_name text;
  v_last_id uuid;
  v_count integer := 0;
begin
  if not app_private.has_permission('catalog.read') then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền xem danh mục hàng hóa.',
      v_correlation_id
    );
  end if;

  if p_include_inactive and not app_private.has_permission('catalog.basic.manage') then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền xem hàng hóa đã ngừng hoạt động.',
      v_correlation_id
    );
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100
    or coalesce(p_stock_state, 'ALL') not in (
      'ALL', 'IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK',
      'RUNNING_LOW', 'ZERO_STOCK', 'NEGATIVE_STOCK'
    )
    or ((p_cursor_name is null) <> (p_cursor_id is null))
  then
    return app_private.command_error(
      'VALIDATION_FAILED',
      'Bộ lọc danh mục chưa hợp lệ.',
      v_correlation_id
    );
  end if;

  with candidates as (
    select
      catalog.*,
      case
        when v_search <> '' and (
          catalog.sku_normalized = v_search
          or lower(coalesce(catalog.barcode, '')) = v_search
        ) then 0
        else 1
      end as search_rank
    from api.product_catalog_read as catalog
    where (p_include_inactive or catalog.is_active)
      and (p_category_id is null or catalog.category_id = p_category_id)
      and (
        v_search = ''
        or catalog.sku_normalized = v_search
        or lower(coalesce(catalog.barcode, '')) = v_search
        or catalog.name_normalized like '%' || v_search || '%'
      )
      and (
        coalesce(p_stock_state, 'ALL') = 'ALL'
        or (
          p_stock_state = 'OUT_OF_STOCK'
          and coalesce(catalog.on_hand_qty, 0) <= 0
        )
        or (
          p_stock_state = 'LOW_STOCK'
          and coalesce(catalog.on_hand_qty, 0) < app_private.low_stock_threshold(catalog.unit_name,catalog.min_stock_qty)
        )
        or (
          p_stock_state = 'IN_STOCK'
          and coalesce(catalog.on_hand_qty, 0) > 0 and coalesce(catalog.on_hand_qty, 0) >= app_private.low_stock_threshold(catalog.unit_name,catalog.min_stock_qty)
        )
        -- Disjoint states for the dashboard stock chart.
        or (
          p_stock_state = 'RUNNING_LOW'
          and coalesce(catalog.on_hand_qty, 0) > 0 and coalesce(catalog.on_hand_qty, 0) < app_private.low_stock_threshold(catalog.unit_name,catalog.min_stock_qty)
        )
        or (p_stock_state = 'ZERO_STOCK' and coalesce(catalog.on_hand_qty, 0) = 0)
        or (p_stock_state = 'NEGATIVE_STOCK' and coalesce(catalog.on_hand_qty, 0) < 0)
      )
      and (
        p_cursor_name is null
        or (catalog.name_normalized, catalog.id) > (p_cursor_name, p_cursor_id)
      )
    order by search_rank, catalog.name_normalized, catalog.id
    limit p_limit
  ), serialized as (
    select
      c.*,
      jsonb_build_object(
        'id', c.id,
        'sku', c.sku,
        'barcode', c.barcode,
        'name', c.name,
        'categoryId', c.category_id,
        'categoryName', c.category_name,
        'unitName', c.unit_name,
        'minStockQty', c.min_stock_qty::text, 'effectiveMinStockQty', app_private.low_stock_threshold(c.unit_name,c.min_stock_qty)::text,
        'isActive', c.is_active,
        'version', c.version,
        'primaryImagePath', c.primary_image_path,
        'currentSalePrice', case when app_private.has_permission('pricing.sale.read') then c.current_sale_price::text else null end,
        'defaultCost', case when app_private.has_permission('purchase.cost.read') then
        (select unit_cost::text from app_private.product_default_costs dc where dc.product_id=c.id) else null end,
      'onHandQty', coalesce(c.on_hand_qty, 0)::text
      ) as item
    from candidates as c
  )
  select
    coalesce(jsonb_agg(s.item order by s.search_rank, s.name_normalized, s.id), '[]'::jsonb),
    count(*)::integer
  into v_items, v_count
  from serialized as s;

  if v_count > 0 then
    select c.name_normalized, c.id
    into v_last_name, v_last_id
    from api.product_catalog_read as c
    where c.id = (v_items -> (v_count - 1) ->> 'id')::uuid;
  end if;

  return app_private.command_success(
    jsonb_build_object(
      'items', v_items,
      'nextCursor', case when v_count = p_limit then jsonb_build_object(
        'name', v_last_name,
        'id', v_last_id
      ) else null end
    ),
    v_correlation_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION app_private.list_sale_returns_v2_impl(p_filters jsonb, p_cursor_updated_at timestamp with time zone, p_cursor_id uuid, p_limit integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_correlation uuid := gen_random_uuid();
  v_can_complete boolean := app_private.has_permission('return.complete');
  v_items jsonb;
  v_cursor jsonb;
begin
  if v_actor is null or (not app_private.has_permission('return.request.create') and not v_can_complete) then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền xem yêu cầu trả hàng.', v_correlation);
  end if;
  if p_limit is null or p_limit not between 1 and 100
    or ((p_cursor_updated_at is null) <> (p_cursor_id is null))
    or (p_filters is not null and jsonb_typeof(p_filters) <> 'object')
    or (coalesce(p_filters ->> 'completedFrom', '') <> '' and coalesce(p_filters ->> 'completedFrom', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
    or (coalesce(p_filters ->> 'completedTo', '') <> '' and coalesce(p_filters ->> 'completedTo', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
    return app_private.command_error('VALIDATION_FAILED', 'Bộ lọc yêu cầu trả hàng chưa hợp lệ.', v_correlation);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', page.id, 'returnNumber', page.return_number, 'status', page.status,
    'saleId', page.original_sale_id, 'saleNumber', page.sale_number,
    'reason', page.reason, 'refundTotal', page.refund_total::text,
    'createdByName', page.creator_name, 'createdAt', page.created_at,
    'completedAt', page.completed_at, 'version', page.version, 'updatedAt', page.updated_at
  ) order by page.updated_at desc, page.id desc), '[]'::jsonb)
  into v_items
  from (
    select r.*, s.sale_number, creator.display_name creator_name
    from api.sale_returns r
    join api.sales s on s.id = r.original_sale_id
    join api.profiles creator on creator.id = r.created_by
    where (v_can_complete or r.created_by = v_actor)
      and (coalesce(p_filters ->> 'status', '') = '' or r.status = p_filters ->> 'status')
      and (coalesce(p_filters ->> 'search', '') = ''
        or s.sale_number ilike '%' || (p_filters ->> 'search') || '%'
        or r.return_number ilike '%' || (p_filters ->> 'search') || '%')
      -- Same day boundaries as the revenue report's RETURN_COMPLETED events.
      and (coalesce(p_filters ->> 'completedFrom', '') = '' or exists (
        select 1 from app_private.sales_financial_events e
        where e.sale_return_id = r.id and e.event_type = 'RETURN_COMPLETED'
          and e.occurred_at >= (p_filters ->> 'completedFrom')::date::timestamp at time zone 'Asia/Ho_Chi_Minh'
          and (coalesce(p_filters ->> 'completedTo', '') = ''
            or e.occurred_at < ((p_filters ->> 'completedTo')::date + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh')))
      and (p_cursor_updated_at is null or (r.updated_at, r.id) < (p_cursor_updated_at, p_cursor_id))
    order by r.updated_at desc, r.id desc
    limit p_limit + 1
  ) page;
  if jsonb_array_length(v_items)>p_limit then
    v_items:=v_items - p_limit;
    v_cursor:=jsonb_build_object('updatedAt',v_items->-1->'updatedAt','id',v_items->-1->'id');
  end if;
  return app_private.command_success(jsonb_build_object('items',v_items,'nextCursor',v_cursor),v_correlation);
end;
$function$;

-- Net revenue by product for the dashboard chart. Line-level amounts reconcile
-- exactly with sales_financial_events.net_revenue (sale net_amount, cancellation
-- reversal, return refund_amount), so the slices add up to the report total.
create function app_private.get_dashboard_product_revenue_impl(p_from date, p_to date, p_scope text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_correlation_id uuid := gen_random_uuid(); v_actor uuid := (select auth.uid()); v_data jsonb;
begin
  if p_scope is null or p_scope not in ('OWN', 'ALL') then
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
  with events as (
    select e.* from app_private.sales_financial_events e
    where e.occurred_at >= p_from::timestamp at time zone 'Asia/Ho_Chi_Minh'
      and e.occurred_at < (p_to + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh'
      and (p_scope = 'ALL' or e.attributed_user_id = v_actor)
  ), amounts as (
    select l.product_id, l.product_name,
      case when e.event_type = 'SALE_COMPLETED' then l.net_amount else -l.net_amount end amount
    from events e join api.sale_lines l on l.sale_id = e.sale_id
    where e.event_type in ('SALE_COMPLETED', 'SALE_CANCELLED')
    union all
    select l.product_id, l.product_name, -l.refund_amount
    from events e join api.sale_return_lines l on l.sale_return_id = e.sale_return_id
    where e.event_type = 'RETURN_COMPLETED'
  ), by_product as (
    select a.product_id, coalesce(p.name, max(a.product_name)) product_name, sum(a.amount) net_revenue
    from amounts a left join api.products p on p.id = a.product_id
    group by a.product_id, p.name
    having sum(a.amount) <> 0
  ), ranked as (
    select b.*, row_number() over (order by b.net_revenue desc, b.product_id) ordinal
    from by_product b
  )
  select jsonb_build_object(
    'version', 1,
    'range', jsonb_build_object('from', p_from, 'to', p_to),
    'scope', p_scope,
    'totalNetRevenue', coalesce(sum(net_revenue), 0)::text,
    -- Top three products (three validated chart colours) plus "Khác".
    'items', coalesce(jsonb_agg(jsonb_build_object('productId', product_id, 'productName', product_name, 'netRevenue', net_revenue::text) order by ordinal)
      filter (where ordinal <= 3), '[]'::jsonb),
    'otherNetRevenue', coalesce(sum(net_revenue) filter (where ordinal > 3), 0)::text,
    'otherProductCount', count(*) filter (where ordinal > 3)::integer
  ) into v_data from ranked;
  return app_private.command_success(v_data, v_correlation_id);
end;
$$;
create function api.get_dashboard_product_revenue(p_from date, p_to date, p_scope text default 'OWN')
returns jsonb language sql stable security invoker set search_path = '' as $$
  select app_private.get_dashboard_product_revenue_impl(p_from, p_to, p_scope);
$$;
revoke all on function app_private.get_dashboard_product_revenue_impl(date, date, text), api.get_dashboard_product_revenue(date, date, text) from public, anon;
grant execute on function app_private.get_dashboard_product_revenue_impl(date, date, text), api.get_dashboard_product_revenue(date, date, text) to authenticated, service_role;

-- Settlement drilldown gains an optional product filter (signature change).
drop function api.get_sale_settlement_report(date,date,text,text,timestamptz,uuid,integer);
drop function app_private.get_sale_settlement_report_impl(date,date,text,text,timestamptz,uuid,integer);
create function app_private.get_sale_settlement_report_impl(p_from date,p_to date,p_scope text,p_method text,p_cursor_completed_at timestamptz,p_cursor_id uuid,p_limit integer,p_product_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid()); v_correlation uuid:=gen_random_uuid(); v_summary jsonb; v_items jsonb; v_next jsonb; v_product jsonb;
begin
 if v_actor is null then return app_private.command_error('PERMISSION_DENIED','Vui lòng đăng nhập để xem báo cáo.',v_correlation); end if;
 if p_scope is null or p_scope not in ('OWN','ALL')
  or (p_scope='OWN' and not app_private.has_permission('report.own_revenue.read'))
  or (p_scope='ALL' and not app_private.has_permission('report.all_revenue.read')) then
  return app_private.command_error('REPORT_SCOPE_DENIED','Bạn không có quyền xem phạm vi báo cáo này.',v_correlation);
 end if;
 if not app_private.report_period_is_valid(p_from,p_to) then
  return app_private.command_error('REPORT_DATE_RANGE_INVALID','Khoảng thời gian báo cáo chưa hợp lệ.',v_correlation);
 end if;
 if p_method is null or p_method not in ('ALL','CASH','BANK_TRANSFER','DEBT') or p_limit is null or p_limit not between 1 and 100
  or (p_cursor_completed_at is null)<>(p_cursor_id is null) then
  return app_private.command_error('VALIDATION_FAILED','Bộ lọc thanh toán chưa hợp lệ.',v_correlation);
 end if;
 -- Materialize once: totals are for the whole range, never limited to a page or method.
 if p_product_id is not null then
  select jsonb_build_object('id',product.id,'name',product.name) into v_product from api.products product where product.id=p_product_id;
  if v_product is null then return app_private.command_error('VALIDATION_FAILED','Bộ lọc thanh toán chưa hợp lệ.',v_correlation); end if;
 end if;
 -- A product filter narrows the invoices (and their totals) to those that sold it.
 with source as materialized (
  select rows.* from app_private.sale_settlement_rows(p_from,p_to,case when p_scope='OWN' then v_actor else null end) rows
  where p_product_id is null or exists(select 1 from api.sale_lines line where line.sale_id=rows.id and line.product_id=p_product_id)
 ), page as (
  select source.*,row_number() over(order by completed_at desc,id desc) ordinal
  from source
  where (p_method='ALL' or (p_method='CASH' and cash_amount<>0)
   or (p_method='BANK_TRANSFER' and bank_transfer_amount<>0) or (p_method='DEBT' and outstanding_amount>0))
   and (p_cursor_completed_at is null or (completed_at,id)<(p_cursor_completed_at,p_cursor_id))
  order by completed_at desc,id desc limit p_limit+1
 )
 select
  (select jsonb_build_object('cashAmount',coalesce(sum(cash_amount),0)::text,'bankTransferAmount',coalesce(sum(bank_transfer_amount),0)::text,'outstandingAmount',coalesce(sum(outstanding_amount),0)::text) from source),
  coalesce((select jsonb_agg(jsonb_build_object('id',id,'saleNumber',sale_number,'completedAt',completed_at,'customerName',customer_name,'status',status,'cashAmount',cash_amount::text,'bankTransferAmount',bank_transfer_amount::text,'outstandingAmount',outstanding_amount::text) order by completed_at desc,id desc) from page where ordinal<=p_limit),'[]'::jsonb),
  case when (select count(*) from page)>p_limit then (select jsonb_build_object('completedAt',completed_at,'id',id) from page where ordinal=p_limit) else null end
 into v_summary,v_items,v_next;
 return app_private.command_success(jsonb_build_object('version',1,'range',jsonb_build_object('from',p_from,'to',p_to),'scope',p_scope,'product',v_product,'summary',v_summary,'items',v_items,'nextCursor',v_next),v_correlation);
end $$;

create function api.get_sale_settlement_report(p_from date,p_to date,p_scope text default 'OWN',p_method text default 'ALL',p_cursor_completed_at timestamptz default null,p_cursor_id uuid default null,p_limit integer default 50,p_product_id uuid default null)
returns jsonb language sql stable security invoker set search_path='' as $$
 select app_private.get_sale_settlement_report_impl(p_from,p_to,p_scope,p_method,p_cursor_completed_at,p_cursor_id,p_limit,p_product_id);
$$;
revoke all on function app_private.get_sale_settlement_report_impl(date,date,text,text,timestamptz,uuid,integer,uuid),api.get_sale_settlement_report(date,date,text,text,timestamptz,uuid,integer,uuid) from public,anon;
grant execute on function app_private.get_sale_settlement_report_impl(date,date,text,text,timestamptz,uuid,integer,uuid),api.get_sale_settlement_report(date,date,text,text,timestamptz,uuid,integer,uuid) to authenticated,service_role;

notify pgrst, 'reload schema';
commit;
