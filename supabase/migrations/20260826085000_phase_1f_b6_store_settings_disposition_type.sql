create function app_private.owner_pilot_mock_manifest_smallint_ids(
  p_manifest jsonb,
  p_record_key text
)
returns smallint[]
language sql
immutable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(value::smallint), array[]::smallint[])
  from jsonb_array_elements_text(
    coalesce(p_manifest -> 'records' -> p_record_key, '[]'::jsonb)
  ) as values_list(value);
$$;

create or replace function app_private.dispose_owner_pilot_mock_data_impl(
  p_manifest_sha256 text,
  p_keep_store_settings boolean,
  p_keep_sales_channels boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lifecycle app_private.project_lifecycle%rowtype;
  v_manifest jsonb;
  v_actual_sha256 text;
  v_receipt_id uuid := extensions.gen_random_uuid();
  v_correlation uuid := extensions.gen_random_uuid();
  v_categories uuid[];
  v_customers uuid[];
  v_imports uuid[];
  v_legacy_sales uuid[];
  v_products uuid[];
  v_purchase_receipts uuid[];
  v_sales uuid[];
  v_sale_returns uuid[];
  v_stock_counts uuid[];
  v_suppliers uuid[];
  v_user_notifications uuid[];
begin
  if auth.role() <> 'service_role' then
    return app_private.command_error('PERMISSION_DENIED', 'Chỉ script cutover được xác nhận mới có thể hủy dữ liệu mock.', v_correlation);
  end if;
  if p_manifest_sha256 !~ '^[0-9a-f]{64}$' or p_keep_store_settings is null or p_keep_sales_channels is null then
    return app_private.command_error('VALIDATION_ERROR', 'Manifest SHA-256 và lựa chọn cấu hình/kênh bán phải hợp lệ.', v_correlation);
  end if;

  lock table
    api.categories, api.customers, api.import_runs, api.inventory_balances,
    api.legacy_sale_lines, api.legacy_sales, api.payments, api.product_images,
    api.products, api.purchase_receipt_lines, api.purchase_receipts,
    api.sale_lines, api.sale_return_lines, api.sale_return_payments,
    api.sale_returns, api.sales, api.sales_channels, api.stock_count_lines,
    api.stock_counts, api.stock_movements, api.store_settings, api.suppliers,
    api.user_notifications, app_private.command_deduplication,
    app_private.document_sequences, app_private.inventory_cost_balances,
    app_private.inventory_cost_movements,
    app_private.legacy_opening_balance_suggestions,
    app_private.product_sale_prices, app_private.purchase_receipt_line_costs,
    app_private.sale_invoice_store_snapshots, app_private.sale_line_costs,
    app_private.sale_return_line_costs, app_private.sales_financial_events,
    app_private.stock_count_adjustment_costs, app_private.stock_count_line_costs,
    app_private.owner_pilot_mock_disposition_receipts, storage.objects
  in share row exclusive mode;

  select * into v_lifecycle from app_private.project_lifecycle where id = true for update;
  if v_lifecycle.mode <> 'OWNER_PILOT' or v_lifecycle.staff_access_policy not in ('OWNER_WAIVER', 'LEAKED_PASSWORD_PROTECTED') then
    return app_private.command_error('INVALID_STATE', 'Chỉ có thể hủy dữ liệu mock trong Owner Pilot có policy nhân viên đã audit.', v_correlation);
  end if;
  if exists (select 1 from app_private.owner_pilot_mock_disposition_receipts) then
    return app_private.command_error('MOCK_DISPOSITION_ALREADY_RECORDED', 'Cloud đã có receipt hủy mock; lệnh không được chạy lại.', v_correlation);
  end if;

  v_manifest := app_private.owner_pilot_mock_manifest_payload(p_keep_store_settings, p_keep_sales_channels);
  v_actual_sha256 := app_private.owner_pilot_mock_manifest_sha256(v_manifest);
  if v_actual_sha256 <> p_manifest_sha256 then
    return app_private.command_error_with_details('MOCK_MANIFEST_MISMATCH', 'Dữ liệu mock đã thay đổi sau khi tạo manifest; cần tạo và duyệt lại manifest mới.', jsonb_build_object('actualSha256', v_actual_sha256), v_correlation);
  end if;

  v_categories := app_private.owner_pilot_mock_manifest_uuid_ids(v_manifest, 'categories');
  v_customers := app_private.owner_pilot_mock_manifest_uuid_ids(v_manifest, 'customers');
  v_imports := app_private.owner_pilot_mock_manifest_uuid_ids(v_manifest, 'imports');
  v_legacy_sales := app_private.owner_pilot_mock_manifest_uuid_ids(v_manifest, 'legacySales');
  v_products := app_private.owner_pilot_mock_manifest_uuid_ids(v_manifest, 'products');
  v_purchase_receipts := app_private.owner_pilot_mock_manifest_uuid_ids(v_manifest, 'purchaseReceipts');
  v_sales := app_private.owner_pilot_mock_manifest_uuid_ids(v_manifest, 'sales');
  v_sale_returns := app_private.owner_pilot_mock_manifest_uuid_ids(v_manifest, 'saleReturns');
  v_stock_counts := app_private.owner_pilot_mock_manifest_uuid_ids(v_manifest, 'stockCounts');
  v_suppliers := app_private.owner_pilot_mock_manifest_uuid_ids(v_manifest, 'suppliers');
  v_user_notifications := app_private.owner_pilot_mock_manifest_uuid_ids(v_manifest, 'userNotifications');

  insert into app_private.owner_pilot_mock_disposition_receipts(
    id, manifest_sha256, keep_store_settings, keep_sales_channels, manifest, storage_paths, correlation_id
  ) values (
    v_receipt_id, v_actual_sha256, p_keep_store_settings, p_keep_sales_channels, v_manifest, v_manifest -> 'storagePaths', v_correlation
  );

  delete from app_private.stock_count_adjustment_costs cost where cost.stock_count_line_id in (select line.id from api.stock_count_lines line where line.stock_count_id = any(v_stock_counts));
  delete from app_private.stock_count_line_costs cost where cost.stock_count_line_id in (select line.id from api.stock_count_lines line where line.stock_count_id = any(v_stock_counts));
  delete from app_private.sale_return_line_costs cost where cost.sale_return_line_id in (select line.id from api.sale_return_lines line where line.sale_return_id = any(v_sale_returns));
  delete from app_private.sale_line_costs cost where cost.sale_line_id in (select line.id from api.sale_lines line where line.sale_id = any(v_sales));
  delete from app_private.purchase_receipt_line_costs cost where cost.purchase_receipt_line_id in (select line.id from api.purchase_receipt_lines line where line.purchase_receipt_id = any(v_purchase_receipts));
  delete from app_private.inventory_cost_movements cost where cost.stock_movement_id in (select movement.id from api.stock_movements movement where movement.product_id = any(v_products));
  delete from app_private.sales_financial_events event where event.sale_id = any(v_sales) or event.sale_return_id = any(v_sale_returns);
  delete from app_private.sale_invoice_store_snapshots snapshot where snapshot.sale_id = any(v_sales);
  delete from api.sale_return_payments payment where payment.sale_return_id = any(v_sale_returns);
  delete from api.sale_return_lines line where line.sale_return_id = any(v_sale_returns);
  delete from api.sale_returns sale_return where sale_return.id = any(v_sale_returns);
  delete from api.payments payment where payment.sale_id = any(v_sales);
  delete from api.sale_lines line where line.sale_id = any(v_sales);
  delete from api.sales sale where sale.id = any(v_sales);
  delete from app_private.inventory_cost_balances balance where balance.product_id = any(v_products);
  delete from api.inventory_balances balance where balance.product_id = any(v_products);
  delete from api.stock_movements movement where movement.product_id = any(v_products);
  delete from api.purchase_receipt_lines line where line.purchase_receipt_id = any(v_purchase_receipts);
  delete from api.purchase_receipts receipt where receipt.id = any(v_purchase_receipts);
  delete from api.stock_count_lines line where line.stock_count_id = any(v_stock_counts);
  delete from api.stock_counts stock_count where stock_count.id = any(v_stock_counts);
  delete from app_private.legacy_opening_balance_suggestions suggestion where suggestion.source_import_run_id = any(v_imports);
  delete from api.legacy_sale_lines line where line.legacy_sale_id = any(v_legacy_sales);
  delete from api.legacy_sales legacy_sale where legacy_sale.id = any(v_legacy_sales);
  delete from app_private.product_sale_prices price where price.product_id = any(v_products);
  delete from api.product_images image where image.product_id = any(v_products);
  delete from api.products product where product.id = any(v_products);
  delete from api.categories category where category.id = any(v_categories);
  delete from api.customers customer where customer.id = any(v_customers);
  delete from api.suppliers supplier where supplier.id = any(v_suppliers);
  delete from api.import_runs import_run where import_run.id = any(v_imports);
  delete from api.user_notifications notification where notification.id = any(v_user_notifications);
  delete from app_private.command_deduplication command where command.created_at <= transaction_timestamp();
  delete from app_private.document_sequences doc_sequence where doc_sequence.document_type in ('PURCHASE_RECEIPT', 'STOCK_COUNT', 'SALE', 'SALE_RETURN');

  if not p_keep_sales_channels then
    delete from api.sales_channels channel
    where channel.id = any(app_private.owner_pilot_mock_manifest_uuid_ids(v_manifest, 'salesChannels'));
  end if;
  if not p_keep_store_settings then
    delete from api.store_settings settings
    where settings.id = any(app_private.owner_pilot_mock_manifest_smallint_ids(v_manifest, 'storeSettings'));
  end if;

  insert into app_private.audit_events(
    actor_id, action, entity_type, entity_id, before_data, after_data, metadata, correlation_id
  ) values (
    null, 'owner_pilot.mock_disposed', 'owner_pilot_mock_disposition_receipt', v_receipt_id,
    jsonb_build_object('manifestSha256', v_actual_sha256, 'records', v_manifest -> 'records'),
    jsonb_build_object('storageFinalized', false),
    jsonb_build_object('actor', 'cutover_service', 'keepStoreSettings', p_keep_store_settings, 'keepSalesChannels', p_keep_sales_channels),
    v_correlation
  );
  return app_private.command_success(
    jsonb_build_object('receiptId', v_receipt_id, 'storagePaths', v_manifest -> 'storagePaths', 'manifestSha256', v_actual_sha256),
    v_correlation
  );
end;
$$;

revoke all on function app_private.owner_pilot_mock_manifest_smallint_ids(jsonb,text)
from public, anon, authenticated;
grant execute on function app_private.owner_pilot_mock_manifest_smallint_ids(jsonb,text)
to service_role;
