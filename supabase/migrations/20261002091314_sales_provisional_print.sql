-- Provisional documents read saved DRAFT values only. This path does not issue
-- invoice numbers, complete sales, capture payments or mutate inventory.
create function app_private.get_sale_draft_print_impl(p_sale_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_sale api.sales%rowtype;
  v_correlation uuid := gen_random_uuid();
begin
  if v_actor is null or not app_private.has_permission('sale.own.read') then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền xem phiếu tạm tính.', v_correlation);
  end if;
  select * into v_sale from api.sales where id = p_sale_id;
  if not found or v_sale.status <> 'DRAFT'
    or (v_sale.created_by <> v_actor and not app_private.has_permission('sale.all.read')) then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền xem phiếu tạm tính này.', v_correlation);
  end if;
  return app_private.command_success(jsonb_build_object(
    'version', 1,
    'kind', 'PROVISIONAL',
    'store', (select jsonb_build_object(
      'displayName', s.display_name, 'logoPath', s.logo_path, 'address', s.address,
      'contactPhone', s.contact_phone, 'zalo', s.zalo, 'invoiceFooter', s.invoice_footer
    ) from api.store_settings s where s.id = 1),
    'draft', jsonb_build_object(
      'id', v_sale.id, 'status', v_sale.status, 'version', v_sale.version,
      'updatedAt', v_sale.updated_at, 'note', v_sale.note,
      'channelName', (select c.name from api.sales_channels c where c.id = v_sale.sales_channel_id),
      'staffName', (select p.display_name from api.profiles p where p.id = v_sale.created_by),
      'customerName', (select c.name from api.customers c where c.id = v_sale.customer_id),
      'customerPhone', (select c.phone_e164 from api.customers c where c.id = v_sale.customer_id)
    ),
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
      'id', line.id, 'productName', line.product_name, 'sku', line.sku,
      'unitName', line.unit_name, 'quantity', line.quantity::text,
      'unitSalePrice', line.unit_sale_price::text, 'grossAmount', line.gross_amount::text,
      'lineDiscountAmount', line.line_discount_amount::text,
      'allocatedOrderDiscount', line.allocated_order_discount::text, 'netAmount', line.net_amount::text
    ) order by line.line_order) from api.sale_lines line where line.sale_id = p_sale_id), '[]'::jsonb),
    'totals', jsonb_build_object(
      'subtotal', v_sale.subtotal::text, 'lineDiscountTotal', v_sale.line_discount_total::text,
      'orderDiscountTotal', v_sale.order_discount_total::text, 'netTotal', v_sale.net_total::text
    )
  ), v_correlation);
end;
$$;

create function api.get_sale_draft_print(p_sale_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select app_private.get_sale_draft_print_impl(p_sale_id); $$;

revoke all on function app_private.get_sale_draft_print_impl(uuid), api.get_sale_draft_print(uuid) from public, anon;
grant execute on function app_private.get_sale_draft_print_impl(uuid), api.get_sale_draft_print(uuid) to authenticated;
