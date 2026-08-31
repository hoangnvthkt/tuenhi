create index purchase_receipts_posted_supplier_received_idx
on api.purchase_receipts (supplier_id, received_at desc, id desc)
where status = 'POSTED' and supplier_id is not null;

create function app_private.get_product_relationship_context_impl(
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
  v_can_read_cost boolean := app_private.has_permission('purchase.cost.read');
  v_supplier_count integer;
  v_receipt_count integer;
  v_total_quantity numeric;
  v_last_received_at timestamptz;
  v_latest_unit_cost numeric;
begin
  if not app_private.has_permission('catalog.read')
    or not (
      app_private.has_permission('purchase.operational.read')
      or app_private.has_permission('purchase.draft.manage')
      or v_can_read_cost
    )
  then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền xem liên kết nhập hàng của sản phẩm.',
      v_correlation_id
    );
  end if;

  if p_product_id is null or not exists (
    select 1 from api.products p where p.id = p_product_id
  ) then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND', 'Không tìm thấy sản phẩm.', v_correlation_id
    );
  end if;

  select
    count(distinct r.supplier_id) filter (where r.supplier_id is not null)::integer,
    count(distinct r.id)::integer,
    coalesce(sum(l.received_qty), 0),
    max(r.received_at)
  into
    v_supplier_count,
    v_receipt_count,
    v_total_quantity,
    v_last_received_at
  from api.purchase_receipt_lines l
  join api.purchase_receipts r on r.id = l.purchase_receipt_id
  where l.product_id = p_product_id
    and r.status = 'POSTED';

  if v_can_read_cost then
    select c.unit_cost
    into v_latest_unit_cost
    from api.purchase_receipt_lines l
    join api.purchase_receipts r on r.id = l.purchase_receipt_id
    left join app_private.purchase_receipt_line_costs c
      on c.purchase_receipt_line_id = l.id
    where l.product_id = p_product_id
      and r.status = 'POSTED'
    order by r.received_at desc, r.id desc, l.id desc
    limit 1;
  end if;

  return app_private.command_success(
    jsonb_build_object(
      'productId', p_product_id,
      'supplierCount', v_supplier_count,
      'postedReceiptCount', v_receipt_count,
      'totalReceivedQty', v_total_quantity::text,
      'lastReceivedAt', v_last_received_at,
      'latestUnitCost', case
        when v_can_read_cost then v_latest_unit_cost::text else null
      end,
      'canReadCost', v_can_read_cost
    ),
    v_correlation_id
  );
end;
$$;

create function api.get_product_relationship_context(p_product_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.get_product_relationship_context_impl(p_product_id);
$$;

create function app_private.list_product_suppliers_impl(
  p_product_id uuid,
  p_cursor_last_received_at timestamptz,
  p_cursor_supplier_id uuid,
  p_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_correlation_id uuid := gen_random_uuid();
  v_can_read_cost boolean := app_private.has_permission('purchase.cost.read');
  v_items jsonb;
  v_has_more boolean;
  v_next_received_at timestamptz;
  v_next_supplier_id uuid;
begin
  if not app_private.has_permission('catalog.read')
    or not (
      app_private.has_permission('purchase.operational.read')
      or app_private.has_permission('purchase.draft.manage')
      or v_can_read_cost
    )
  then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền xem Nhà cung cấp của sản phẩm.',
      v_correlation_id
    );
  end if;

  if p_limit is null or p_limit not between 1 and 100
    or ((p_cursor_last_received_at is null) <> (p_cursor_supplier_id is null))
  then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Bộ lọc Nhà cung cấp chưa hợp lệ.', v_correlation_id
    );
  end if;

  if p_product_id is null or not exists (
    select 1 from api.products p where p.id = p_product_id
  ) then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND', 'Không tìm thấy sản phẩm.', v_correlation_id
    );
  end if;

  with ranked as (
    select
      s.id as supplier_id,
      s.code as supplier_code,
      s.name as supplier_name,
      s.is_active as supplier_is_active,
      r.id as receipt_id,
      r.receipt_number,
      r.received_at,
      l.id as line_id,
      l.received_qty,
      c.unit_cost,
      row_number() over (
        partition by s.id
        order by r.received_at desc, r.id desc, l.id desc
      ) as latest_rank
    from api.purchase_receipt_lines l
    join api.purchase_receipts r on r.id = l.purchase_receipt_id
    join api.suppliers s on s.id = r.supplier_id
    left join app_private.purchase_receipt_line_costs c
      on c.purchase_receipt_line_id = l.id
    where l.product_id = p_product_id
      and r.status = 'POSTED'
      and r.supplier_id is not null
  ), relationships as (
    select
      supplier_id,
      supplier_code,
      supplier_name,
      supplier_is_active,
      count(distinct receipt_id)::integer as posted_receipt_count,
      sum(received_qty) as total_received_qty,
      max(received_at) as last_received_at,
      (array_agg(receipt_id) filter (where latest_rank = 1))[1] as latest_receipt_id,
      (array_agg(receipt_number) filter (where latest_rank = 1))[1]
        as latest_receipt_number,
      (array_agg(unit_cost) filter (where latest_rank = 1))[1]
        as latest_unit_cost
    from ranked
    group by supplier_id, supplier_code, supplier_name, supplier_is_active
  ), page as (
    select *
    from relationships
    where p_cursor_last_received_at is null
      or (last_received_at, supplier_id)
        < (p_cursor_last_received_at, p_cursor_supplier_id)
    order by last_received_at desc, supplier_id desc
    limit p_limit + 1
  ), numbered as (
    select page.*,
      row_number() over (order by last_received_at desc, supplier_id desc)
        as ordinal
    from page
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'supplierId', supplier_id,
      'supplierCode', supplier_code,
      'supplierName', supplier_name,
      'supplierIsActive', supplier_is_active,
      'postedReceiptCount', posted_receipt_count,
      'totalReceivedQty', total_received_qty::text,
      'lastReceivedAt', last_received_at,
      'latestReceiptId', latest_receipt_id,
      'latestReceiptNumber', latest_receipt_number,
      'latestUnitCost', case
        when v_can_read_cost then latest_unit_cost::text else null
      end,
      'canReadCost', v_can_read_cost
    ) order by last_received_at desc, supplier_id desc)
      filter (where ordinal <= p_limit), '[]'::jsonb),
    count(*) > p_limit,
    (array_agg(last_received_at order by ordinal)
      filter (where ordinal = p_limit))[1],
    (array_agg(supplier_id order by ordinal)
      filter (where ordinal = p_limit))[1]
  into v_items, v_has_more, v_next_received_at, v_next_supplier_id
  from numbered;

  return app_private.command_success(
    jsonb_build_object(
      'items', v_items,
      'nextCursor', case when v_has_more then jsonb_build_object(
        'lastReceivedAt', v_next_received_at,
        'supplierId', v_next_supplier_id
      ) else null end
    ),
    v_correlation_id
  );
end;
$$;

create function api.list_product_suppliers(
  p_product_id uuid,
  p_cursor_last_received_at timestamptz default null,
  p_cursor_supplier_id uuid default null,
  p_limit integer default 25
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.list_product_suppliers_impl(
    p_product_id,
    p_cursor_last_received_at,
    p_cursor_supplier_id,
    p_limit
  );
$$;

create function app_private.get_supplier_detail_impl(p_supplier_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_correlation_id uuid := gen_random_uuid();
  v_supplier api.suppliers%rowtype;
  v_can_read_purchases boolean := (
    app_private.has_permission('purchase.operational.read')
    or app_private.has_permission('purchase.draft.manage')
    or app_private.has_permission('purchase.cost.read')
  );
  v_can_read_cost boolean := app_private.has_permission('purchase.cost.read');
  v_product_count integer;
  v_receipt_count integer;
  v_total_quantity numeric;
  v_last_received_at timestamptz;
  v_total_cost numeric;
begin
  if not (
    app_private.has_permission('supplier.read')
    or app_private.has_permission('supplier.manage')
  ) then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền xem Nhà cung cấp.',
      v_correlation_id
    );
  end if;

  select s.* into v_supplier
  from api.suppliers s
  where s.id = p_supplier_id;
  if not found then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND', 'Không tìm thấy Nhà cung cấp.', v_correlation_id
    );
  end if;

  if v_can_read_purchases then
    select
      count(distinct l.product_id)::integer,
      count(distinct r.id)::integer,
      coalesce(sum(l.received_qty), 0),
      max(r.received_at),
      case when v_can_read_cost then coalesce(sum(c.line_cost), 0) else null end
    into
      v_product_count,
      v_receipt_count,
      v_total_quantity,
      v_last_received_at,
      v_total_cost
    from api.purchase_receipts r
    join api.purchase_receipt_lines l on l.purchase_receipt_id = r.id
    left join app_private.purchase_receipt_line_costs c
      on c.purchase_receipt_line_id = l.id
    where r.supplier_id = p_supplier_id
      and r.status = 'POSTED';
  end if;

  return app_private.command_success(
    jsonb_build_object(
      'id', v_supplier.id,
      'code', v_supplier.code,
      'name', v_supplier.name,
      'phone', v_supplier.phone_e164,
      'email', v_supplier.email,
      'address', v_supplier.address,
      'notes', v_supplier.notes,
      'isActive', v_supplier.is_active,
      'version', v_supplier.version,
      'canReadPurchases', v_can_read_purchases,
      'canReadCost', v_can_read_cost,
      'distinctProductCount', v_product_count,
      'postedReceiptCount', v_receipt_count,
      'totalReceivedQty', case
        when v_can_read_purchases then v_total_quantity::text else null
      end,
      'lastReceivedAt', v_last_received_at,
      'totalPostedCost', case
        when v_can_read_cost then v_total_cost::text else null
      end
    ),
    v_correlation_id
  );
end;
$$;

create function api.get_supplier_detail(p_supplier_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.get_supplier_detail_impl(p_supplier_id);
$$;

create function app_private.list_supplier_products_impl(
  p_supplier_id uuid,
  p_search text,
  p_cursor_last_received_at timestamptz,
  p_cursor_product_id uuid,
  p_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_correlation_id uuid := gen_random_uuid();
  v_can_read_cost boolean := app_private.has_permission('purchase.cost.read');
  v_search text := app_private.normalize_catalog_key(coalesce(p_search, ''));
  v_items jsonb;
  v_has_more boolean;
  v_next_received_at timestamptz;
  v_next_product_id uuid;
begin
  if not (
      app_private.has_permission('supplier.read')
      or app_private.has_permission('supplier.manage')
    )
    or not (
      app_private.has_permission('purchase.operational.read')
      or app_private.has_permission('purchase.draft.manage')
      or v_can_read_cost
    )
  then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền xem mặt hàng của Nhà cung cấp.',
      v_correlation_id
    );
  end if;

  if p_limit is null or p_limit not between 1 and 100
    or ((p_cursor_last_received_at is null) <> (p_cursor_product_id is null))
    or length(btrim(coalesce(p_search, ''))) > 200
  then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Bộ lọc mặt hàng chưa hợp lệ.', v_correlation_id
    );
  end if;

  if p_supplier_id is null or not exists (
    select 1 from api.suppliers s where s.id = p_supplier_id
  ) then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND', 'Không tìm thấy Nhà cung cấp.', v_correlation_id
    );
  end if;

  with ranked as (
    select
      p.id as product_id,
      p.sku,
      p.name as product_name,
      p.unit_name,
      p.is_active,
      r.id as receipt_id,
      r.receipt_number,
      r.received_at,
      l.id as line_id,
      l.received_qty,
      c.unit_cost,
      row_number() over (
        partition by p.id
        order by r.received_at desc, r.id desc, l.id desc
      ) as latest_rank
    from api.purchase_receipts r
    join api.purchase_receipt_lines l on l.purchase_receipt_id = r.id
    join api.products p on p.id = l.product_id
    left join app_private.purchase_receipt_line_costs c
      on c.purchase_receipt_line_id = l.id
    where r.supplier_id = p_supplier_id
      and r.status = 'POSTED'
      and (
        v_search = ''
        or p.sku_normalized like '%' || v_search || '%'
        or p.name_normalized like '%' || v_search || '%'
      )
  ), relationships as (
    select
      product_id,
      sku,
      product_name,
      unit_name,
      is_active,
      count(distinct receipt_id)::integer as posted_receipt_count,
      sum(received_qty) as total_received_qty,
      max(received_at) as last_received_at,
      (array_agg(receipt_id) filter (where latest_rank = 1))[1] as latest_receipt_id,
      (array_agg(receipt_number) filter (where latest_rank = 1))[1]
        as latest_receipt_number,
      (array_agg(unit_cost) filter (where latest_rank = 1))[1]
        as latest_unit_cost
    from ranked
    group by product_id, sku, product_name, unit_name, is_active
  ), page as (
    select *
    from relationships
    where p_cursor_last_received_at is null
      or (last_received_at, product_id)
        < (p_cursor_last_received_at, p_cursor_product_id)
    order by last_received_at desc, product_id desc
    limit p_limit + 1
  ), numbered as (
    select page.*,
      row_number() over (order by last_received_at desc, product_id desc)
        as ordinal
    from page
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'productId', product_id,
      'sku', sku,
      'productName', product_name,
      'unitName', unit_name,
      'isActive', is_active,
      'postedReceiptCount', posted_receipt_count,
      'totalReceivedQty', total_received_qty::text,
      'lastReceivedAt', last_received_at,
      'latestReceiptId', latest_receipt_id,
      'latestReceiptNumber', latest_receipt_number,
      'latestUnitCost', case
        when v_can_read_cost then latest_unit_cost::text else null
      end,
      'canReadCost', v_can_read_cost
    ) order by last_received_at desc, product_id desc)
      filter (where ordinal <= p_limit), '[]'::jsonb),
    count(*) > p_limit,
    (array_agg(last_received_at order by ordinal)
      filter (where ordinal = p_limit))[1],
    (array_agg(product_id order by ordinal)
      filter (where ordinal = p_limit))[1]
  into v_items, v_has_more, v_next_received_at, v_next_product_id
  from numbered;

  return app_private.command_success(
    jsonb_build_object(
      'items', v_items,
      'nextCursor', case when v_has_more then jsonb_build_object(
        'lastReceivedAt', v_next_received_at,
        'productId', v_next_product_id
      ) else null end
    ),
    v_correlation_id
  );
end;
$$;

create function api.list_supplier_products(
  p_supplier_id uuid,
  p_search text default null,
  p_cursor_last_received_at timestamptz default null,
  p_cursor_product_id uuid default null,
  p_limit integer default 25
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.list_supplier_products_impl(
    p_supplier_id,
    p_search,
    p_cursor_last_received_at,
    p_cursor_product_id,
    p_limit
  );
$$;

create function app_private.list_posted_purchase_history_impl(
  p_product_id uuid,
  p_supplier_id uuid,
  p_from date,
  p_to date,
  p_cursor_received_at timestamptz,
  p_cursor_receipt_id uuid,
  p_cursor_line_id uuid,
  p_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_correlation_id uuid := gen_random_uuid();
  v_can_read_cost boolean := app_private.has_permission('purchase.cost.read');
  v_items jsonb;
  v_has_more boolean;
  v_next_received_at timestamptz;
  v_next_receipt_id uuid;
  v_next_line_id uuid;
begin
  if not (
    app_private.has_permission('purchase.operational.read')
    or app_private.has_permission('purchase.draft.manage')
    or v_can_read_cost
  )
    or (p_product_id is not null and not app_private.has_permission('catalog.read'))
    or (
      p_supplier_id is not null
      and not (
        app_private.has_permission('supplier.read')
        or app_private.has_permission('supplier.manage')
      )
    )
  then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền xem lịch sử nhập hàng.',
      v_correlation_id
    );
  end if;

  if (p_product_id is null and p_supplier_id is null)
    or p_limit is null or p_limit not between 1 and 100
    or num_nonnulls(
      p_cursor_received_at, p_cursor_receipt_id, p_cursor_line_id
    ) not in (0, 3)
    or (p_from is not null and p_to is not null and (
      p_from > p_to or p_to - p_from > 365
    ))
  then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Bộ lọc lịch sử nhập chưa hợp lệ.', v_correlation_id
    );
  end if;

  if p_product_id is not null and not exists (
    select 1 from api.products p where p.id = p_product_id
  ) then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND', 'Không tìm thấy sản phẩm.', v_correlation_id
    );
  end if;
  if p_supplier_id is not null and not exists (
    select 1 from api.suppliers s where s.id = p_supplier_id
  ) then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND', 'Không tìm thấy Nhà cung cấp.', v_correlation_id
    );
  end if;

  with page as (
    select
      l.id as line_id,
      r.id as receipt_id,
      r.receipt_number,
      r.received_at,
      r.supplier_id,
      s.name as supplier_name,
      l.product_id,
      l.sku,
      l.product_name,
      l.unit_name,
      l.received_qty,
      c.unit_cost,
      c.line_cost
    from api.purchase_receipt_lines l
    join api.purchase_receipts r on r.id = l.purchase_receipt_id
    left join api.suppliers s on s.id = r.supplier_id
    left join app_private.purchase_receipt_line_costs c
      on c.purchase_receipt_line_id = l.id
    where r.status = 'POSTED'
      and (p_product_id is null or l.product_id = p_product_id)
      and (p_supplier_id is null or r.supplier_id = p_supplier_id)
      and (p_from is null or r.received_at >= (
        p_from::timestamp at time zone 'Asia/Ho_Chi_Minh'
      ))
      and (p_to is null or r.received_at < (
        (p_to + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh'
      ))
      and (
        p_cursor_received_at is null
        or (r.received_at, r.id, l.id)
          < (p_cursor_received_at, p_cursor_receipt_id, p_cursor_line_id)
      )
    order by r.received_at desc, r.id desc, l.id desc
    limit p_limit + 1
  ), numbered as (
    select page.*,
      row_number() over (order by received_at desc, receipt_id desc, line_id desc)
        as ordinal
    from page
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'lineId', line_id,
      'receiptId', receipt_id,
      'receiptNumber', receipt_number,
      'receivedAt', received_at,
      'supplierId', supplier_id,
      'supplierName', supplier_name,
      'productId', product_id,
      'sku', sku,
      'productName', product_name,
      'unitName', unit_name,
      'receivedQty', received_qty::text,
      'unitCost', case when v_can_read_cost then unit_cost::text else null end,
      'lineCost', case when v_can_read_cost then line_cost::text else null end,
      'canReadCost', v_can_read_cost
    ) order by received_at desc, receipt_id desc, line_id desc)
      filter (where ordinal <= p_limit), '[]'::jsonb),
    count(*) > p_limit,
    (array_agg(received_at order by ordinal)
      filter (where ordinal = p_limit))[1],
    (array_agg(receipt_id order by ordinal)
      filter (where ordinal = p_limit))[1],
    (array_agg(line_id order by ordinal)
      filter (where ordinal = p_limit))[1]
  into
    v_items,
    v_has_more,
    v_next_received_at,
    v_next_receipt_id,
    v_next_line_id
  from numbered;

  return app_private.command_success(
    jsonb_build_object(
      'items', v_items,
      'nextCursor', case when v_has_more then jsonb_build_object(
        'receivedAt', v_next_received_at,
        'receiptId', v_next_receipt_id,
        'lineId', v_next_line_id
      ) else null end
    ),
    v_correlation_id
  );
end;
$$;

create function api.list_posted_purchase_history(
  p_product_id uuid default null,
  p_supplier_id uuid default null,
  p_from date default null,
  p_to date default null,
  p_cursor_received_at timestamptz default null,
  p_cursor_receipt_id uuid default null,
  p_cursor_line_id uuid default null,
  p_limit integer default 25
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.list_posted_purchase_history_impl(
    p_product_id,
    p_supplier_id,
    p_from,
    p_to,
    p_cursor_received_at,
    p_cursor_receipt_id,
    p_cursor_line_id,
    p_limit
  );
$$;

revoke execute on function api.get_product_relationship_context(uuid)
  from public, anon;
revoke execute on function app_private.get_product_relationship_context_impl(uuid)
  from public, anon;
revoke execute on function api.list_product_suppliers(
  uuid, timestamptz, uuid, integer
) from public, anon;
revoke execute on function app_private.list_product_suppliers_impl(
  uuid, timestamptz, uuid, integer
) from public, anon;
revoke execute on function api.get_supplier_detail(uuid) from public, anon;
revoke execute on function app_private.get_supplier_detail_impl(uuid)
  from public, anon;
revoke execute on function api.list_supplier_products(
  uuid, text, timestamptz, uuid, integer
) from public, anon;
revoke execute on function app_private.list_supplier_products_impl(
  uuid, text, timestamptz, uuid, integer
) from public, anon;
revoke execute on function api.list_posted_purchase_history(
  uuid, uuid, date, date, timestamptz, uuid, uuid, integer
) from public, anon;
revoke execute on function app_private.list_posted_purchase_history_impl(
  uuid, uuid, date, date, timestamptz, uuid, uuid, integer
) from public, anon;

grant execute on function api.get_product_relationship_context(uuid)
  to authenticated;
grant execute on function app_private.get_product_relationship_context_impl(uuid)
  to authenticated;
grant execute on function api.list_product_suppliers(
  uuid, timestamptz, uuid, integer
) to authenticated;
grant execute on function app_private.list_product_suppliers_impl(
  uuid, timestamptz, uuid, integer
) to authenticated;
grant execute on function api.get_supplier_detail(uuid) to authenticated;
grant execute on function app_private.get_supplier_detail_impl(uuid)
  to authenticated;
grant execute on function api.list_supplier_products(
  uuid, text, timestamptz, uuid, integer
) to authenticated;
grant execute on function app_private.list_supplier_products_impl(
  uuid, text, timestamptz, uuid, integer
) to authenticated;
grant execute on function api.list_posted_purchase_history(
  uuid, uuid, date, date, timestamptz, uuid, uuid, integer
) to authenticated;
grant execute on function app_private.list_posted_purchase_history_impl(
  uuid, uuid, date, date, timestamptz, uuid, uuid, integer
) to authenticated;
