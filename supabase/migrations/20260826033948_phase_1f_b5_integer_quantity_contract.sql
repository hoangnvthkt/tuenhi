do $$
begin
  if exists (
    select 1
    from (
      select min_stock_qty as quantity from api.products
      union all select on_hand_qty from api.inventory_balances
      union all select received_qty from api.purchase_receipt_lines
      union all select system_qty_snapshot from api.stock_count_lines
      union all select counted_qty from api.stock_count_lines where counted_qty is not null
      union all select difference_qty from api.stock_count_lines where difference_qty is not null
      union all select quantity_delta from api.stock_movements
      union all select quantity_after from api.stock_movements
      union all select quantity from api.sale_lines
      union all select requested_qty from api.sale_return_lines
      union all select accepted_qty from api.sale_return_lines where accepted_qty is not null
    ) operational_quantities
    where quantity <> trunc(quantity)
  ) then
    raise exception 'Không thể chuyển sang số lượng nguyên vì dữ liệu vận hành có số lượng lẻ.';
  end if;
end;
$$;

drop view api.product_catalog_read;

alter table api.products
  alter column min_stock_qty type numeric(18,0)
  using min_stock_qty::numeric(18,0);

alter table api.inventory_balances
  alter column on_hand_qty type numeric(18,0)
  using on_hand_qty::numeric(18,0);

alter table api.purchase_receipt_lines
  alter column received_qty type numeric(18,0)
  using received_qty::numeric(18,0);

alter table api.stock_count_lines
  alter column system_qty_snapshot type numeric(18,0)
  using system_qty_snapshot::numeric(18,0),
  alter column counted_qty type numeric(18,0)
  using counted_qty::numeric(18,0),
  alter column difference_qty type numeric(18,0)
  using difference_qty::numeric(18,0);

alter table api.stock_movements
  alter column quantity_delta type numeric(18,0)
  using quantity_delta::numeric(18,0),
  alter column quantity_after type numeric(18,0)
  using quantity_after::numeric(18,0);

alter table api.sale_lines
  alter column quantity type numeric(18,0)
  using quantity::numeric(18,0);

alter table api.sale_return_lines
  alter column requested_qty type numeric(18,0)
  using requested_qty::numeric(18,0),
  alter column accepted_qty type numeric(18,0)
  using accepted_qty::numeric(18,0);

create view api.product_catalog_read
with (security_invoker = true)
as
select
  product.id,
  product.sku,
  product.sku_normalized,
  product.barcode,
  product.name,
  product.name_normalized,
  product.category_id,
  category.name as category_name,
  product.unit_name,
  product.description,
  product.min_stock_qty,
  product.is_active,
  product.version,
  product.created_at,
  product.updated_at,
  image.object_path as primary_image_path,
  price.sale_price as current_sale_price,
  price.valid_from as sale_price_valid_from,
  balance.on_hand_qty,
  balance.version as inventory_version
from api.products product
left join api.categories category on category.id = product.category_id
left join lateral (
  select product_image.object_path
  from api.product_images product_image
  where product_image.product_id = product.id
    and product_image.is_primary
  limit 1
) image on true
left join app_private.product_sale_prices price
  on price.product_id = product.id and price.valid_to is null
left join api.inventory_balances balance on balance.product_id = product.id;

revoke all on table api.product_catalog_read from public, anon, authenticated;
grant select on table api.product_catalog_read to authenticated;

do $$
declare
  v_procedure regprocedure;
  v_definition text;
  v_original text;
begin
  foreach v_procedure in array array[
    'app_private.save_product_impl(uuid,bigint,jsonb,uuid)'::regprocedure,
    'app_private.validate_catalog_import_payload(api.import_runs,integer,jsonb)'::regprocedure,
    'app_private.validate_opening_import_payload(api.import_runs,integer,jsonb)'::regprocedure,
    'app_private.save_purchase_receipt_draft_impl(uuid,bigint,uuid,timestamptz,text,jsonb,uuid)'::regprocedure,
    'app_private.save_opening_stock_draft_impl(uuid,bigint,text,jsonb,uuid)'::regprocedure,
    'app_private.create_sale_return_request_impl(uuid,text,jsonb,uuid)'::regprocedure,
    'app_private.complete_sale_return_impl(uuid,bigint,jsonb,text,uuid)'::regprocedure,
    'app_private.save_stock_count_impl(uuid,bigint,text,jsonb,uuid)'::regprocedure,
    'app_private.cancel_sale_impl(uuid,bigint,text,uuid)'::regprocedure,
    'app_private.complete_sale_impl(uuid,bigint,text,uuid)'::regprocedure,
    'app_private.post_purchase_receipt_impl(uuid,bigint,jsonb,uuid)'::regprocedure,
    'app_private.post_stock_count_impl(uuid,bigint,jsonb,uuid)'::regprocedure,
    'app_private.revenue_report_data(date,date,uuid)'::regprocedure,
    'app_private.reverse_purchase_receipt_impl(uuid,text,uuid)'::regprocedure
  ] loop
    select pg_get_functiondef(v_procedure) into v_definition;
    v_original := v_definition;
    v_definition := replace(v_definition, '(?:\.[0-9]{1,3})?', '');
    v_definition := replace(v_definition, '(?:\\.[0-9]{1,3})?', '');
    v_definition := replace(v_definition, '(\.[0-9]{1,3})?', '');
    v_definition := replace(v_definition, '(\\.[0-9]{1,3})?', '');
    v_definition := replace(v_definition, '[0-9]{0,14}', '[0-9]{0,17}');
    v_definition := replace(v_definition, 'numeric(18,3)', 'numeric(18,0)');
    v_definition := replace(
      v_definition,
      'Số lượng chỉ nhận chữ số, dấu chấm và tối đa 3 chữ số thập phân.',
      'Số lượng chỉ được là số nguyên.'
    );
    v_definition := replace(
      v_definition,
      'length(split_part(v_min_stock_text, ''.'', 1)) > 15',
      'length(v_min_stock_text) > 18'
    );
    if v_definition = v_original then
      raise exception 'Không thể cập nhật contract số lượng cho %.', v_procedure::text;
    end if;
    execute v_definition;
  end loop;
end;
$$;

do $$
declare
  v_definition text;
  v_guard text :=
    'if p_idempotency_key is null or jsonb_typeof(p_lines) <> ''array'' or jsonb_array_length(p_lines) = 0 then';
  v_replacement text :=
    'if p_idempotency_key is null or jsonb_typeof(p_lines) <> ''array'' or jsonb_array_length(p_lines) = 0 or exists (select 1 from jsonb_to_recordset(p_lines) as item("productId" uuid, quantity text, "lineDiscountAmount" text, "lineOrder" integer) where coalesce(item.quantity, '''') !~ ''^(0|[1-9][0-9]*)$'') then';
begin
  select pg_get_functiondef(
    'app_private.save_sale_draft_impl(uuid,bigint,uuid,uuid,jsonb,text,text,uuid)'::regprocedure
  ) into v_definition;
  if position(v_guard in v_definition) = 0 then
    raise exception 'Không thể cập nhật contract số lượng cho app_private.save_sale_draft_impl.';
  end if;
  execute replace(v_definition, v_guard, v_replacement);
end;
$$;
