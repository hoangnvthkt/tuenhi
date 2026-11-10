begin;
-- Báo cáo "Bán chạy": top 5 sản phẩm theo doanh thu thuần, kèm số lượng thuần
-- (bán − hủy − trả). Additive; get_dashboard_product_revenue giữ nguyên.
create function app_private.get_report_top_products_impl(p_from date, p_to date, p_scope text)
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
    select l.product_id, l.product_name, l.unit_name,
      case when e.event_type = 'SALE_COMPLETED' then l.net_amount else -l.net_amount end amount,
      case when e.event_type = 'SALE_COMPLETED' then l.quantity else -l.quantity end qty
    from events e join api.sale_lines l on l.sale_id = e.sale_id
    where e.event_type in ('SALE_COMPLETED', 'SALE_CANCELLED')
    union all
    select l.product_id, l.product_name, l.unit_name, -l.refund_amount, -coalesce(l.accepted_qty, 0)
    from events e join api.sale_return_lines l on l.sale_return_id = e.sale_return_id
    where e.event_type = 'RETURN_COMPLETED'
  ), by_product as (
    select a.product_id, coalesce(p.name, max(a.product_name)) product_name,
      coalesce(p.unit_name, max(a.unit_name)) unit_name,
      sum(a.amount) net_revenue, sum(a.qty) quantity
    from amounts a left join api.products p on p.id = a.product_id
    group by a.product_id, p.name, p.unit_name
    having sum(a.amount) <> 0 or sum(a.qty) <> 0
  ), ranked as (
    select b.*, row_number() over (order by b.net_revenue desc, b.quantity desc, b.product_id) ordinal
    from by_product b
  )
  select jsonb_build_object(
    'version', 1,
    'range', jsonb_build_object('from', p_from, 'to', p_to),
    'scope', p_scope,
    'totalNetRevenue', coalesce(sum(net_revenue), 0)::text,
    'items', coalesce(jsonb_agg(jsonb_build_object(
        'productId', product_id, 'productName', product_name, 'unitName', unit_name,
        'netRevenue', net_revenue::text, 'quantity', trunc(quantity)::text) order by ordinal)
      filter (where ordinal <= 5), '[]'::jsonb),
    'otherNetRevenue', coalesce(sum(net_revenue) filter (where ordinal > 5), 0)::text,
    'otherProductCount', count(*) filter (where ordinal > 5)::integer
  ) into v_data from ranked;
  return app_private.command_success(v_data, v_correlation_id);
end;
$$;
create function api.get_report_top_products(p_from date, p_to date, p_scope text default 'OWN')
returns jsonb language sql stable security invoker set search_path = '' as $$
  select app_private.get_report_top_products_impl(p_from, p_to, p_scope);
$$;
revoke all on function app_private.get_report_top_products_impl(date, date, text), api.get_report_top_products(date, date, text) from public, anon;
grant execute on function app_private.get_report_top_products_impl(date, date, text), api.get_report_top_products(date, date, text) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
