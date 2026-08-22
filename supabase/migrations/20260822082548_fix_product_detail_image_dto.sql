create or replace function app_private.get_product_detail_impl(
  p_product_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_correlation_id uuid := gen_random_uuid();
  v_data jsonb;
begin
  if not app_private.has_permission('catalog.read') then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Bạn không có quyền xem sản phẩm.',
      v_correlation_id
    );
  end if;

  select jsonb_build_object(
    'id', c.id,
    'sku', c.sku,
    'barcode', c.barcode,
    'name', c.name,
    'categoryId', c.category_id,
    'categoryName', c.category_name,
    'unitName', c.unit_name,
    'description', c.description,
    'minStockQty', c.min_stock_qty::text,
    'isActive', c.is_active,
    'version', c.version,
    'primaryImagePath', c.primary_image_path,
    'currentSalePrice', c.current_sale_price::text,
    'salePriceValidFrom', c.sale_price_valid_from,
    'onHandQty', coalesce(c.on_hand_qty, 0)::text,
    'images', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'objectPath', i.object_path,
        'sortOrder', i.sort_order,
        'isPrimary', i.is_primary
      ) order by i.sort_order, i.id)
      from api.product_images i
      where i.product_id = c.id
    ), '[]'::jsonb)
  ) into v_data
  from api.product_catalog_read c
  where c.id = p_product_id;

  if v_data is null then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND', 'Không tìm thấy sản phẩm.', v_correlation_id
    );
  end if;
  return app_private.command_success(v_data, v_correlation_id);
end;
$$;
