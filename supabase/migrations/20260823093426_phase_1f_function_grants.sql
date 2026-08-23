grant execute on function app_private.get_operational_dashboard_impl(date, date) to authenticated;
grant execute on function app_private.get_my_sales_summary_impl(date, date) to authenticated;
grant execute on function app_private.get_revenue_report_impl(date, date, text) to authenticated;
grant execute on function app_private.get_owner_dashboard_impl(date, date) to authenticated;
grant execute on function app_private.get_profit_report_impl(date, date, timestamptz, uuid, integer) to authenticated;
grant execute on function app_private.get_inventory_valuation_impl(text, text, uuid, integer) to authenticated;
