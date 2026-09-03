create index sales_customer_completed_idx
on api.sales (customer_id, completed_at desc, id desc)
where customer_id is not null and status <> 'DRAFT';

create function app_private.get_customer_detail_impl(
  p_customer_id uuid,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_correlation_id uuid := gen_random_uuid();
  v_customer api.customers%rowtype;
  v_scope text;
  v_summary jsonb;
begin
  if v_actor is null or not (
    app_private.has_permission('customer.read')
    or app_private.has_permission('customer.manage')
  ) then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền xem khách hàng.',
      v_correlation_id
    );
  end if;

  if p_from is not null and p_to is not null and (
    p_from > p_to or p_to - p_from > 365
  ) then
    return app_private.command_error(
      'VALIDATION_FAILED',
      'Khoảng thời gian khách hàng chưa hợp lệ.',
      v_correlation_id
    );
  end if;

  select c.* into v_customer
  from api.customers c
  where c.id = p_customer_id;
  if not found then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND',
      'Không tìm thấy khách hàng.',
      v_correlation_id
    );
  end if;

  v_scope := case
    when app_private.has_permission('sale.all.read') then 'ALL'
    when app_private.has_permission('sale.own.read') then 'OWN'
    else 'NONE'
  end;

  if v_scope <> 'NONE' then
    with scoped_events as (
      select event.*, sale.status
      from app_private.sales_financial_events event
      join api.sales sale on sale.id = event.sale_id
      where sale.customer_id = p_customer_id
        and (v_scope = 'ALL' or event.attributed_user_id = v_actor)
        and (p_from is null or event.occurred_at >= (
          p_from::timestamp at time zone 'Asia/Ho_Chi_Minh'
        ))
        and (p_to is null or event.occurred_at < (
          (p_to + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh'
        ))
    )
    select jsonb_build_object(
      'orderCount', count(distinct sale_id) filter (
        where event_type = 'SALE_COMPLETED' and status <> 'CANCELLED'
      )::integer,
      'cancelledOrderCount', count(*) filter (
        where event_type = 'SALE_CANCELLED'
      )::integer,
      'completedReturnCount', count(*) filter (
        where event_type = 'RETURN_COMPLETED'
      )::integer,
      'completedSalesNet', coalesce(sum(net_revenue) filter (
        where event_type = 'SALE_COMPLETED'
      ), 0)::text,
      'returnedTotal', coalesce(-sum(net_revenue) filter (
        where event_type = 'RETURN_COMPLETED'
      ), 0)::text,
      'cancelledTotal', coalesce(-sum(net_revenue) filter (
        where event_type = 'SALE_CANCELLED'
      ), 0)::text,
      'netSpend', coalesce(sum(net_revenue), 0)::text,
      'lastPurchaseAt', max(occurred_at) filter (
        where event_type = 'SALE_COMPLETED' and status <> 'CANCELLED'
      )
    ) into v_summary
    from scoped_events;
  end if;

  return app_private.command_success(
    jsonb_build_object(
      'id', v_customer.id,
      'code', v_customer.code,
      'customerType', v_customer.customer_type,
      'name', v_customer.name,
      'phone', v_customer.phone_e164,
      'email', v_customer.email,
      'address', v_customer.address,
      'companyName', v_customer.company_name,
      'taxCode', v_customer.tax_code,
      'customerGroup', v_customer.customer_group,
      'notes', v_customer.notes,
      'isActive', v_customer.is_active,
      'version', v_customer.version,
      'salesScope', v_scope,
      'purchaseSummary', v_summary
    ),
    v_correlation_id
  );
end;
$$;

create function api.get_customer_detail(
  p_customer_id uuid,
  p_from date default null,
  p_to date default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.get_customer_detail_impl(p_customer_id, p_from, p_to);
$$;

create function app_private.list_customer_sales_impl(
  p_customer_id uuid,
  p_from date,
  p_to date,
  p_cursor_completed_at timestamptz,
  p_cursor_sale_id uuid,
  p_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_correlation_id uuid := gen_random_uuid();
  v_scope text;
  v_items jsonb;
  v_has_more boolean;
  v_next_completed_at timestamptz;
  v_next_sale_id uuid;
begin
  if v_actor is null or not (
    app_private.has_permission('customer.read')
    or app_private.has_permission('customer.manage')
  ) then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền xem lịch sử khách hàng.',
      v_correlation_id
    );
  end if;

  v_scope := case
    when app_private.has_permission('sale.all.read') then 'ALL'
    when app_private.has_permission('sale.own.read') then 'OWN'
    else 'NONE'
  end;
  if v_scope = 'NONE' then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền xem giao dịch của khách hàng.',
      v_correlation_id
    );
  end if;

  if p_limit is null or p_limit not between 1 and 100
    or ((p_cursor_completed_at is null) <> (p_cursor_sale_id is null))
    or (p_from is not null and p_to is not null and (
      p_from > p_to or p_to - p_from > 365
    ))
  then
    return app_private.command_error(
      'VALIDATION_FAILED',
      'Bộ lọc hóa đơn khách hàng chưa hợp lệ.',
      v_correlation_id
    );
  end if;

  if p_customer_id is null or not exists (
    select 1 from api.customers c where c.id = p_customer_id
  ) then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND',
      'Không tìm thấy khách hàng.',
      v_correlation_id
    );
  end if;

  with completed_refunds as (
    select r.original_sale_id, coalesce(sum(r.refund_total), 0) as returned_total
    from api.sale_returns r
    where r.status = 'COMPLETED'
    group by r.original_sale_id
  ), page as (
    select
      sale.id,
      sale.sale_number,
      sale.completed_at,
      sale.status,
      sale.customer_name_snapshot,
      sale.sales_channel_name_snapshot,
      profile.display_name as created_by_name,
      payment.method as payment_method,
      payment.status as payment_status,
      sale.net_total,
      coalesce(refund.returned_total, 0) as returned_total,
      row_number() over (
        order by sale.completed_at desc, sale.id desc
      ) as ordinal
    from api.sales sale
    join api.profiles profile on profile.id = sale.created_by
    left join api.payments payment on payment.sale_id = sale.id
    left join completed_refunds refund on refund.original_sale_id = sale.id
    where sale.customer_id = p_customer_id
      and sale.status <> 'DRAFT'
      and (v_scope = 'ALL' or sale.created_by = v_actor)
      and (p_from is null or sale.completed_at >= (
        p_from::timestamp at time zone 'Asia/Ho_Chi_Minh'
      ))
      and (p_to is null or sale.completed_at < (
        (p_to + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh'
      ))
      and (
        p_cursor_completed_at is null
        or (sale.completed_at, sale.id)
          < (p_cursor_completed_at, p_cursor_sale_id)
      )
    order by sale.completed_at desc, sale.id desc
    limit p_limit + 1
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'saleId', id,
      'saleNumber', sale_number,
      'completedAt', completed_at,
      'status', status,
      'customerNameSnapshot', customer_name_snapshot,
      'channelName', sales_channel_name_snapshot,
      'createdByName', created_by_name,
      'paymentMethod', payment_method,
      'paymentStatus', payment_status,
      'originalNetTotal', net_total::text,
      'returnedTotal', returned_total::text,
      'effectiveNetTotal', case
        when status = 'CANCELLED' then '0'
        else (net_total - returned_total)::text
      end
    ) order by completed_at desc, id desc) filter (where ordinal <= p_limit),
      '[]'::jsonb),
    count(*) > p_limit,
    (array_agg(completed_at order by ordinal) filter (
      where ordinal = p_limit
    ))[1],
    (array_agg(id order by ordinal) filter (where ordinal = p_limit))[1]
  into v_items, v_has_more, v_next_completed_at, v_next_sale_id
  from page;

  return app_private.command_success(
    jsonb_build_object(
      'items', v_items,
      'nextCursor', case when v_has_more then jsonb_build_object(
        'completedAt', v_next_completed_at,
        'saleId', v_next_sale_id
      ) else null end
    ),
    v_correlation_id
  );
end;
$$;

create function api.list_customer_sales(
  p_customer_id uuid,
  p_from date default null,
  p_to date default null,
  p_cursor_completed_at timestamptz default null,
  p_cursor_sale_id uuid default null,
  p_limit integer default 25
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.list_customer_sales_impl(
    p_customer_id,
    p_from,
    p_to,
    p_cursor_completed_at,
    p_cursor_sale_id,
    p_limit
  );
$$;

create function app_private.list_customer_returns_impl(
  p_customer_id uuid,
  p_from date,
  p_to date,
  p_cursor_completed_at timestamptz,
  p_cursor_return_id uuid,
  p_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_correlation_id uuid := gen_random_uuid();
  v_scope text;
  v_items jsonb;
  v_has_more boolean;
  v_next_completed_at timestamptz;
  v_next_return_id uuid;
begin
  if v_actor is null or not (
    app_private.has_permission('customer.read')
    or app_private.has_permission('customer.manage')
  ) then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền xem lịch sử khách hàng.',
      v_correlation_id
    );
  end if;

  v_scope := case
    when app_private.has_permission('sale.all.read') then 'ALL'
    when app_private.has_permission('sale.own.read') then 'OWN'
    else 'NONE'
  end;
  if v_scope = 'NONE' then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền xem giao dịch của khách hàng.',
      v_correlation_id
    );
  end if;

  if p_limit is null or p_limit not between 1 and 100
    or ((p_cursor_completed_at is null) <> (p_cursor_return_id is null))
    or (p_from is not null and p_to is not null and (
      p_from > p_to or p_to - p_from > 365
    ))
  then
    return app_private.command_error(
      'VALIDATION_FAILED',
      'Bộ lọc phiếu trả của khách hàng chưa hợp lệ.',
      v_correlation_id
    );
  end if;

  if p_customer_id is null or not exists (
    select 1 from api.customers c where c.id = p_customer_id
  ) then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND',
      'Không tìm thấy khách hàng.',
      v_correlation_id
    );
  end if;

  with page as (
    select
      return_document.id,
      return_document.return_number,
      return_document.completed_at,
      return_document.reason,
      return_document.refund_total,
      return_payment.method as refund_method,
      sale.id as sale_id,
      sale.sale_number,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'lineId', line.id,
          'productId', line.product_id,
          'sku', line.sku,
          'productName', line.product_name,
          'unitName', line.unit_name,
          'acceptedQty', coalesce(line.accepted_qty, 0)::text,
          'refundAmount', line.refund_amount::text
        ) order by line.line_order)
        from api.sale_return_lines line
        where line.sale_return_id = return_document.id
      ), '[]'::jsonb) as lines,
      row_number() over (
        order by return_document.completed_at desc, return_document.id desc
      ) as ordinal
    from api.sale_returns return_document
    join api.sales sale on sale.id = return_document.original_sale_id
    left join api.sale_return_payments return_payment
      on return_payment.sale_return_id = return_document.id
    where sale.customer_id = p_customer_id
      and return_document.status = 'COMPLETED'
      and (v_scope = 'ALL' or sale.created_by = v_actor)
      and (p_from is null or return_document.completed_at >= (
        p_from::timestamp at time zone 'Asia/Ho_Chi_Minh'
      ))
      and (p_to is null or return_document.completed_at < (
        (p_to + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh'
      ))
      and (
        p_cursor_completed_at is null
        or (return_document.completed_at, return_document.id)
          < (p_cursor_completed_at, p_cursor_return_id)
      )
    order by return_document.completed_at desc, return_document.id desc
    limit p_limit + 1
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'returnId', id,
      'returnNumber', return_number,
      'completedAt', completed_at,
      'reason', reason,
      'refundTotal', refund_total::text,
      'refundMethod', refund_method,
      'saleId', sale_id,
      'saleNumber', sale_number,
      'lines', lines
    ) order by completed_at desc, id desc) filter (where ordinal <= p_limit),
      '[]'::jsonb),
    count(*) > p_limit,
    (array_agg(completed_at order by ordinal) filter (
      where ordinal = p_limit
    ))[1],
    (array_agg(id order by ordinal) filter (where ordinal = p_limit))[1]
  into v_items, v_has_more, v_next_completed_at, v_next_return_id
  from page;

  return app_private.command_success(
    jsonb_build_object(
      'items', v_items,
      'nextCursor', case when v_has_more then jsonb_build_object(
        'completedAt', v_next_completed_at,
        'returnId', v_next_return_id
      ) else null end
    ),
    v_correlation_id
  );
end;
$$;

create function api.list_customer_returns(
  p_customer_id uuid,
  p_from date default null,
  p_to date default null,
  p_cursor_completed_at timestamptz default null,
  p_cursor_return_id uuid default null,
  p_limit integer default 25
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.list_customer_returns_impl(
    p_customer_id,
    p_from,
    p_to,
    p_cursor_completed_at,
    p_cursor_return_id,
    p_limit
  );
$$;

create function app_private.list_customer_products_impl(
  p_customer_id uuid,
  p_search text,
  p_from date,
  p_to date,
  p_cursor_net_purchased_qty text,
  p_cursor_last_purchased_at timestamptz,
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
  v_actor uuid := (select auth.uid());
  v_correlation_id uuid := gen_random_uuid();
  v_scope text;
  v_search text := app_private.normalize_catalog_key(coalesce(p_search, ''));
  v_cursor_quantity numeric;
  v_items jsonb;
  v_has_more boolean;
  v_next_quantity numeric;
  v_next_purchased_at timestamptz;
  v_next_product_id uuid;
begin
  if v_actor is null or not (
    app_private.has_permission('customer.read')
    or app_private.has_permission('customer.manage')
  ) then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền xem lịch sử khách hàng.',
      v_correlation_id
    );
  end if;

  v_scope := case
    when app_private.has_permission('sale.all.read') then 'ALL'
    when app_private.has_permission('sale.own.read') then 'OWN'
    else 'NONE'
  end;
  if v_scope = 'NONE' then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Bạn không có quyền xem giao dịch của khách hàng.',
      v_correlation_id
    );
  end if;

  if p_limit is null or p_limit not between 1 and 100
    or length(btrim(coalesce(p_search, ''))) > 200
    or (p_from is not null and p_to is not null and (
      p_from > p_to or p_to - p_from > 365
    ))
    or not (
      (
        p_cursor_net_purchased_qty is null
        and p_cursor_last_purchased_at is null
        and p_cursor_product_id is null
      ) or (
        p_cursor_net_purchased_qty is not null
        and p_cursor_last_purchased_at is not null
        and p_cursor_product_id is not null
        and p_cursor_net_purchased_qty
          ~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$'
      )
    )
  then
    return app_private.command_error(
      'VALIDATION_FAILED',
      'Bộ lọc sản phẩm của khách hàng chưa hợp lệ.',
      v_correlation_id
    );
  end if;

  if p_cursor_net_purchased_qty is not null then
    begin
      v_cursor_quantity := p_cursor_net_purchased_qty::numeric;
    exception when invalid_text_representation or numeric_value_out_of_range then
      return app_private.command_error(
        'VALIDATION_FAILED',
        'Bộ lọc sản phẩm của khách hàng chưa hợp lệ.',
        v_correlation_id
      );
    end;
  end if;

  if p_customer_id is null or not exists (
    select 1 from api.customers c where c.id = p_customer_id
  ) then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND',
      'Không tìm thấy khách hàng.',
      v_correlation_id
    );
  end if;

  with eligible_sales as (
    select sale.id, sale.completed_at
    from api.sales sale
    where sale.customer_id = p_customer_id
      and sale.status not in ('DRAFT', 'CANCELLED')
      and (v_scope = 'ALL' or sale.created_by = v_actor)
      and (p_from is null or sale.completed_at >= (
        p_from::timestamp at time zone 'Asia/Ho_Chi_Minh'
      ))
      and (p_to is null or sale.completed_at < (
        (p_to + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh'
      ))
  ), returned_by_line as (
    select
      return_line.original_sale_line_id,
      coalesce(sum(return_line.accepted_qty), 0) as returned_qty,
      coalesce(sum(return_line.refund_amount), 0) as refunded_amount
    from api.sale_return_lines return_line
    join api.sale_returns return_document
      on return_document.id = return_line.sale_return_id
    join eligible_sales sale on sale.id = return_document.original_sale_id
    where return_document.status = 'COMPLETED'
    group by return_line.original_sale_line_id
  ), ranked as (
    select
      line.product_id,
      line.id as line_id,
      line.sale_id,
      line.sku,
      line.product_name,
      line.unit_name,
      product.is_active,
      line.quantity,
      line.net_amount,
      coalesce(returned.returned_qty, 0) as returned_qty,
      coalesce(returned.refunded_amount, 0) as refunded_amount,
      sale.completed_at,
      row_number() over (
        partition by line.product_id
        order by sale.completed_at desc, sale.id desc, line.id desc
      ) as latest_rank,
      (
        app_private.normalize_catalog_key(line.sku) like '%' || v_search || '%'
        or app_private.normalize_catalog_key(line.product_name)
          like '%' || v_search || '%'
      ) as matches_search
    from eligible_sales sale
    join api.sale_lines line on line.sale_id = sale.id
    join api.products product on product.id = line.product_id
    left join returned_by_line returned
      on returned.original_sale_line_id = line.id
  ), relationships as (
    select
      product_id,
      (array_agg(sku) filter (where latest_rank = 1))[1] as sku,
      (array_agg(product_name) filter (
        where latest_rank = 1
      ))[1] as product_name,
      (array_agg(unit_name) filter (where latest_rank = 1))[1] as unit_name,
      bool_or(is_active) as product_is_active,
      count(distinct sale_id)::integer as order_count,
      sum(quantity) as gross_sold_qty,
      sum(returned_qty) as returned_qty,
      sum(quantity - returned_qty) as net_purchased_qty,
      sum(net_amount) as gross_net_amount,
      sum(refunded_amount) as refunded_amount,
      sum(net_amount - refunded_amount) as net_purchased_amount,
      max(completed_at) as last_purchased_at,
      bool_or(matches_search) as matches_search
    from ranked
    group by product_id
  ), page as (
    select relationships.*,
      row_number() over (
        order by net_purchased_qty desc, last_purchased_at desc, product_id desc
      ) as ordinal
    from relationships
    where (v_search = '' or matches_search)
      and (
        p_cursor_net_purchased_qty is null
        or (net_purchased_qty, last_purchased_at, product_id)
          < (v_cursor_quantity, p_cursor_last_purchased_at, p_cursor_product_id)
      )
    order by net_purchased_qty desc, last_purchased_at desc, product_id desc
    limit p_limit + 1
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'productId', product_id,
      'sku', sku,
      'productName', product_name,
      'unitName', unit_name,
      'productIsActive', product_is_active,
      'orderCount', order_count,
      'grossSoldQty', gross_sold_qty::text,
      'returnedQty', returned_qty::text,
      'netPurchasedQty', net_purchased_qty::text,
      'grossNetAmount', gross_net_amount::text,
      'refundedAmount', refunded_amount::text,
      'netPurchasedAmount', net_purchased_amount::text,
      'lastPurchasedAt', last_purchased_at
    ) order by net_purchased_qty desc, last_purchased_at desc, product_id desc)
      filter (where ordinal <= p_limit), '[]'::jsonb),
    count(*) > p_limit,
    (array_agg(net_purchased_qty order by ordinal) filter (
      where ordinal = p_limit
    ))[1],
    (array_agg(last_purchased_at order by ordinal) filter (
      where ordinal = p_limit
    ))[1],
    (array_agg(product_id order by ordinal) filter (
      where ordinal = p_limit
    ))[1]
  into
    v_items,
    v_has_more,
    v_next_quantity,
    v_next_purchased_at,
    v_next_product_id
  from page;

  return app_private.command_success(
    jsonb_build_object(
      'items', v_items,
      'nextCursor', case when v_has_more then jsonb_build_object(
        'netPurchasedQty', v_next_quantity::text,
        'lastPurchasedAt', v_next_purchased_at,
        'productId', v_next_product_id
      ) else null end
    ),
    v_correlation_id
  );
end;
$$;

create function api.list_customer_products(
  p_customer_id uuid,
  p_search text default null,
  p_from date default null,
  p_to date default null,
  p_cursor_net_purchased_qty text default null,
  p_cursor_last_purchased_at timestamptz default null,
  p_cursor_product_id uuid default null,
  p_limit integer default 25
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.list_customer_products_impl(
    p_customer_id,
    p_search,
    p_from,
    p_to,
    p_cursor_net_purchased_qty,
    p_cursor_last_purchased_at,
    p_cursor_product_id,
    p_limit
  );
$$;

revoke all on function app_private.get_customer_detail_impl(uuid, date, date)
  from public, anon;
revoke all on function app_private.list_customer_sales_impl(
  uuid, date, date, timestamptz, uuid, integer
) from public, anon;
revoke all on function app_private.list_customer_returns_impl(
  uuid, date, date, timestamptz, uuid, integer
) from public, anon;
revoke all on function app_private.list_customer_products_impl(
  uuid, text, date, date, text, timestamptz, uuid, integer
) from public, anon;
revoke all on function api.get_customer_detail(uuid, date, date)
  from public, anon;
revoke all on function api.list_customer_sales(
  uuid, date, date, timestamptz, uuid, integer
) from public, anon;
revoke all on function api.list_customer_returns(
  uuid, date, date, timestamptz, uuid, integer
) from public, anon;
revoke all on function api.list_customer_products(
  uuid, text, date, date, text, timestamptz, uuid, integer
) from public, anon;

grant execute on function app_private.get_customer_detail_impl(uuid, date, date)
  to authenticated;
grant execute on function app_private.list_customer_sales_impl(
  uuid, date, date, timestamptz, uuid, integer
) to authenticated;
grant execute on function app_private.list_customer_returns_impl(
  uuid, date, date, timestamptz, uuid, integer
) to authenticated;
grant execute on function app_private.list_customer_products_impl(
  uuid, text, date, date, text, timestamptz, uuid, integer
) to authenticated;
grant execute on function api.get_customer_detail(uuid, date, date)
  to authenticated;
grant execute on function api.list_customer_sales(
  uuid, date, date, timestamptz, uuid, integer
) to authenticated;
grant execute on function api.list_customer_returns(
  uuid, date, date, timestamptz, uuid, integer
) to authenticated;
grant execute on function api.list_customer_products(
  uuid, text, date, date, text, timestamptz, uuid, integer
) to authenticated;
