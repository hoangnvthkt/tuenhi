begin;
-- Gợi ý SKU kế tiếp theo mẫu SP + 6 số (SP000001…). Chỉ đọc; trùng mã vẫn do
-- unique(sku_normalized) trong save_product chặn.
create function app_private.suggest_next_product_sku_impl()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_correlation uuid := gen_random_uuid();
  v_max bigint;
begin
  if not app_private.has_permission('catalog.basic.manage') then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền tạo sản phẩm.', v_correlation);
  end if;
  select max(substring(p.sku from 3)::bigint) into v_max
  from api.products p where p.sku ~* '^SP[0-9]{6}$';
  return app_private.command_success(
    jsonb_build_object('sku', 'SP' || lpad((coalesce(v_max, 0) + 1)::text, greatest(6, length((coalesce(v_max, 0) + 1)::text)), '0')),
    v_correlation
  );
end;
$$;
create function api.suggest_next_product_sku()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select app_private.suggest_next_product_sku_impl();
$$;
revoke execute on function app_private.suggest_next_product_sku_impl() from public, anon;
revoke execute on function api.suggest_next_product_sku() from public, anon;
grant execute on function app_private.suggest_next_product_sku_impl() to authenticated;
grant execute on function api.suggest_next_product_sku() to authenticated;

-- Lọc phiếu nhập theo ngày Việt Nam (trước đây ngày được hiểu theo UTC).
create or replace function app_private.list_purchase_receipts_impl(
  p_filters jsonb,
  p_cursor_updated_at timestamptz,
  p_cursor_id uuid,
  p_limit integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_correlation_id uuid := gen_random_uuid();
  v_items jsonb;
  v_next_updated_at timestamptz;
  v_next_id uuid;
begin
  if not (
    app_private.has_permission('purchase.operational.read')
    or app_private.has_permission('purchase.draft.manage')
    or app_private.has_permission('purchase.cost.read')
  ) then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Bạn không có quyền xem phiếu nhập.',
      v_correlation_id
    );
  end if;
  p_filters := coalesce(p_filters, '{}'::jsonb);
  if jsonb_typeof(p_filters) <> 'object'
    or p_filters - array['status', 'supplierId', 'from', 'to', 'search']
      <> '{}'::jsonb
    or p_limit is null or p_limit not between 1 and 100
    or ((p_cursor_updated_at is null) <> (p_cursor_id is null))
    or coalesce(p_filters ->> 'status', '') not in (
      '', 'DRAFT', 'AWAITING_COST', 'POSTED', 'REVERSED', 'CANCELLED'
    )
    or (nullif(p_filters ->> 'from', '') is not null
      and p_filters ->> 'from' !~ '^\d{4}-\d{2}-\d{2}$')
    or (nullif(p_filters ->> 'to', '') is not null
      and p_filters ->> 'to' !~ '^\d{4}-\d{2}-\d{2}$')
  then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Bộ lọc phiếu nhập chưa hợp lệ.',
      v_correlation_id
    );
  end if;
  with page as (
    select r.*, s.name as supplier_name,
      creator.display_name as created_by_name,
      (select count(*) from api.purchase_receipt_lines l
        where l.purchase_receipt_id = r.id)::integer as line_count,
      coalesce((select sum(l.received_qty) from api.purchase_receipt_lines l
        where l.purchase_receipt_id = r.id), 0) as total_quantity
    from api.purchase_receipts r
    left join api.suppliers s on s.id = r.supplier_id
    join api.profiles creator on creator.id = r.created_by
    where (nullif(p_filters ->> 'status', '') is null
        or r.status = p_filters ->> 'status')
      and (nullif(p_filters ->> 'supplierId', '') is null
        or r.supplier_id = (p_filters ->> 'supplierId')::uuid)
      and (nullif(p_filters ->> 'from', '') is null
        or r.received_at >= (p_filters ->> 'from')::date::timestamp
          at time zone 'Asia/Ho_Chi_Minh')
      and (nullif(p_filters ->> 'to', '') is null
        or r.received_at < ((p_filters ->> 'to')::date + 1)::timestamp
          at time zone 'Asia/Ho_Chi_Minh')
      and (
        nullif(btrim(coalesce(p_filters ->> 'search', '')), '') is null
        or r.receipt_number ilike '%'
          || btrim(p_filters ->> 'search') || '%'
        or s.name ilike '%' || btrim(p_filters ->> 'search') || '%'
      )
      and (p_cursor_updated_at is null
        or (r.updated_at, r.id) < (p_cursor_updated_at, p_cursor_id))
    order by r.updated_at desc, r.id desc limit p_limit + 1
  ), numbered as (
    select page.*, row_number() over (order by updated_at desc, id desc) ordinal
    from page
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'receiptNumber', receipt_number, 'status', status,
      'supplierId', supplier_id, 'supplierName', supplier_name,
      'receivedAt', received_at, 'createdByName', created_by_name,
      'lineCount', line_count, 'totalQuantity', total_quantity::text,
      'version', version, 'updatedAt', updated_at
    ) order by updated_at desc, id desc)
      filter (where ordinal <= p_limit), '[]'::jsonb),
    (array_agg(updated_at order by updated_at desc, id desc)
      filter (where ordinal = p_limit))[1],
    (array_agg(id order by updated_at desc, id desc)
      filter (where ordinal = p_limit))[1]
  into v_items, v_next_updated_at, v_next_id from numbered;
  if jsonb_array_length(v_items) < p_limit or not exists (
    select 1 from api.purchase_receipts r
    where v_next_id is not null
      and (r.updated_at, r.id) < (v_next_updated_at, v_next_id)
  ) then
    v_next_updated_at := null;
    v_next_id := null;
  end if;
  return app_private.command_success(
    jsonb_build_object(
      'items', v_items,
      'nextCursor', case when v_next_id is null then null else
        jsonb_build_object('updatedAt', v_next_updated_at, 'id', v_next_id)
      end
    ),
    v_correlation_id
  );
exception
  when invalid_text_representation then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Bộ lọc phiếu nhập chưa hợp lệ.',
      v_correlation_id
    );
end;
$$;
commit;
