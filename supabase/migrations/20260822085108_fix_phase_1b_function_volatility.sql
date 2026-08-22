alter function app_private.get_import_validation_result_impl(uuid, integer, integer)
  volatile;
alter function app_private.get_import_result_impl(uuid) volatile;
alter function app_private.list_import_runs_impl(
  text, text, timestamptz, uuid, integer
) volatile;
alter function app_private.get_legacy_sales_impl(jsonb, date, uuid, integer)
  volatile;
alter function app_private.get_legacy_sale_impl(uuid) volatile;
alter function app_private.get_product_catalog_impl(
  text, uuid, text, boolean, text, uuid, integer
) volatile;
alter function app_private.get_product_detail_impl(uuid) volatile;
alter function app_private.get_product_sale_price_history_impl(
  uuid, timestamptz, uuid, integer
) volatile;
alter function app_private.list_categories_impl(boolean) volatile;
alter function app_private.list_suppliers_impl(text, text, uuid, integer)
  volatile;
alter function app_private.list_customers_impl(text, text, uuid, integer)
  volatile;
alter function app_private.list_sales_channels_impl(boolean) volatile;

alter function api.get_import_validation_result(uuid, integer, integer)
  volatile;
alter function api.get_import_result(uuid) volatile;
alter function api.list_import_runs(text, text, timestamptz, uuid, integer)
  volatile;
alter function api.get_legacy_sales(jsonb, date, uuid, integer) volatile;
alter function api.get_legacy_sale(uuid) volatile;
alter function api.get_product_catalog(
  text, uuid, text, boolean, text, uuid, integer
) volatile;
alter function api.get_product_detail(uuid) volatile;
alter function api.get_product_sale_price_history(
  uuid, timestamptz, uuid, integer
) volatile;
alter function api.list_categories(boolean) volatile;
alter function api.list_suppliers(text, text, uuid, integer) volatile;
alter function api.list_customers(text, text, uuid, integer) volatile;
alter function api.list_sales_channels(boolean) volatile;

alter function app_private.stringify_legacy_list_decimals(jsonb) stable;
alter function app_private.stringify_legacy_detail_decimals(jsonb) stable;
