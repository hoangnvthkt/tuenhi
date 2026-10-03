-- Preserve legacy null-cursor contracts; v2 lists return a real keyset cursor.
begin;

CREATE OR REPLACE FUNCTION app_private.list_sales_v2_impl(p_filters jsonb, p_cursor_sort_at timestamp with time zone, p_cursor_id uuid, p_limit integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=(select auth.uid()); v_correlation uuid:=gen_random_uuid(); v_all boolean:=app_private.has_permission('sale.all.read'); v_result jsonb; v_items jsonb; v_cursor jsonb;
begin
 if v_actor is null or not app_private.has_permission('sale.own.read') then return app_private.command_error('PERMISSION_DENIED','Bạn không có quyền xem danh sách hóa đơn.',v_correlation); end if;
 if p_limit is null or p_limit<1 or p_limit>100 or ((p_cursor_sort_at is null) <> (p_cursor_id is null)) or (p_filters is not null and jsonb_typeof(p_filters)<>'object') then return app_private.command_error('VALIDATION_FAILED','Giới hạn danh sách chưa hợp lệ.',v_correlation); end if;
 v_result := app_private.command_success(jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'saleNumber',s.sale_number,'status',s.status,'customerName',s.customer_name_snapshot,'channelName',coalesce(s.sales_channel_name_snapshot,c.name),'netTotal',s.net_total::text,'createdByName',p.display_name,'completedAt',s.completed_at,'sortAt',coalesce(s.completed_at,s.updated_at),'version',s.version) order by coalesce(s.completed_at,s.updated_at) desc,s.id desc) from (select s.* from api.sales s where (v_all or s.created_by=v_actor) and (p_filters is null or coalesce(p_filters->>'status','')='' or s.status=p_filters->>'status') and (coalesce(p_filters->>'search','')='' or s.sale_number ilike '%'||(p_filters->>'search')||'%' or s.customer_name_snapshot ilike '%'||(p_filters->>'search')||'%' or exists(select 1 from api.sale_lines l where l.sale_id=s.id and (l.product_name ilike '%'||(p_filters->>'search')||'%' or l.sku ilike '%'||(p_filters->>'search')||'%'))) and (p_cursor_sort_at is null or (coalesce(s.completed_at,s.updated_at),s.id)<(p_cursor_sort_at,p_cursor_id)) order by coalesce(s.completed_at,s.updated_at) desc,s.id desc limit p_limit + 1) s join api.profiles p on p.id=s.created_by join api.sales_channels c on c.id=s.sales_channel_id),'[]'::jsonb),'nextCursor',null),v_correlation);
 v_items:=v_result#>'{data,items}';
 if jsonb_array_length(v_items)>p_limit then
  v_items:=v_items - p_limit;
  v_cursor:=jsonb_build_object('sortAt',v_items->-1->'sortAt','id',v_items->-1->'id');
 end if;
 return app_private.command_success(jsonb_build_object('items',v_items,'nextCursor',v_cursor),v_correlation);
end;
$function$;

create or replace function api.list_sales_v2(p_filters jsonb default '{}',p_cursor_sort_at timestamptz default null,p_cursor_id uuid default null,p_limit integer default 30)
returns jsonb language sql security invoker set search_path='' as $$
 select app_private.list_sales_v2_impl(p_filters,p_cursor_sort_at,p_cursor_id,p_limit);
$$;
revoke all on function api.list_sales_v2(jsonb,timestamptz,uuid,integer) from public,anon;
revoke all on function app_private.list_sales_v2_impl(jsonb,timestamptz,uuid,integer) from public,anon;
grant execute on function api.list_sales_v2(jsonb,timestamptz,uuid,integer) to authenticated,service_role;
grant execute on function app_private.list_sales_v2_impl(jsonb,timestamptz,uuid,integer) to authenticated,service_role;

CREATE OR REPLACE FUNCTION app_private.list_sale_returns_v2_impl(p_filters jsonb, p_cursor_updated_at timestamp with time zone, p_cursor_id uuid, p_limit integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_correlation uuid := gen_random_uuid();
  v_can_complete boolean := app_private.has_permission('return.complete');
  v_items jsonb;
  v_cursor jsonb;
begin
  if v_actor is null or (not app_private.has_permission('return.request.create') and not v_can_complete) then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền xem yêu cầu trả hàng.', v_correlation);
  end if;
  if p_limit is null or p_limit not between 1 and 100
    or ((p_cursor_updated_at is null) <> (p_cursor_id is null))
    or (p_filters is not null and jsonb_typeof(p_filters) <> 'object') then
    return app_private.command_error('VALIDATION_FAILED', 'Bộ lọc yêu cầu trả hàng chưa hợp lệ.', v_correlation);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', page.id, 'returnNumber', page.return_number, 'status', page.status,
    'saleId', page.original_sale_id, 'saleNumber', page.sale_number,
    'reason', page.reason, 'refundTotal', page.refund_total::text,
    'createdByName', page.creator_name, 'createdAt', page.created_at,
    'completedAt', page.completed_at, 'version', page.version, 'updatedAt', page.updated_at
  ) order by page.updated_at desc, page.id desc), '[]'::jsonb)
  into v_items
  from (
    select r.*, s.sale_number, creator.display_name creator_name
    from api.sale_returns r
    join api.sales s on s.id = r.original_sale_id
    join api.profiles creator on creator.id = r.created_by
    where (v_can_complete or r.created_by = v_actor)
      and (coalesce(p_filters ->> 'status', '') = '' or r.status = p_filters ->> 'status')
      and (coalesce(p_filters ->> 'search', '') = ''
        or s.sale_number ilike '%' || (p_filters ->> 'search') || '%'
        or r.return_number ilike '%' || (p_filters ->> 'search') || '%')
      and (p_cursor_updated_at is null or (r.updated_at, r.id) < (p_cursor_updated_at, p_cursor_id))
    order by r.updated_at desc, r.id desc
    limit p_limit + 1
  ) page;
  if jsonb_array_length(v_items)>p_limit then
    v_items:=v_items - p_limit;
    v_cursor:=jsonb_build_object('updatedAt',v_items->-1->'updatedAt','id',v_items->-1->'id');
  end if;
  return app_private.command_success(jsonb_build_object('items',v_items,'nextCursor',v_cursor),v_correlation);
end;
$function$;

create or replace function api.list_sale_returns_v2(p_filters jsonb default '{}',p_cursor_updated_at timestamptz default null,p_cursor_id uuid default null,p_limit integer default 30)
returns jsonb language sql security invoker set search_path='' as $$
 select app_private.list_sale_returns_v2_impl(p_filters,p_cursor_updated_at,p_cursor_id,p_limit);
$$;
revoke all on function api.list_sale_returns_v2(jsonb,timestamptz,uuid,integer) from public,anon;
revoke all on function app_private.list_sale_returns_v2_impl(jsonb,timestamptz,uuid,integer) from public,anon;
grant execute on function api.list_sale_returns_v2(jsonb,timestamptz,uuid,integer) to authenticated,service_role;
grant execute on function app_private.list_sale_returns_v2_impl(jsonb,timestamptz,uuid,integer) to authenticated,service_role;

CREATE OR REPLACE FUNCTION app_private.list_stock_counts_v2_impl(p_filters jsonb, p_cursor_updated_at timestamp with time zone, p_cursor_id uuid, p_limit integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_correlation uuid := gen_random_uuid();
  v_owner boolean := app_private.has_permission('inventory.adjustment.post');
  v_items jsonb;
  v_cursor jsonb;
begin
  if v_actor is null or not app_private.has_permission('inventory.count.draft') then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền xem phiếu kiểm kho.', v_correlation);
  end if;
  if p_limit is null or p_limit not between 1 and 100
    or ((p_cursor_updated_at is null) <> (p_cursor_id is null))
    or (p_filters is not null and jsonb_typeof(p_filters) <> 'object') then
    return app_private.command_error('VALIDATION_FAILED', 'Bộ lọc phiếu kiểm kho chưa hợp lệ.', v_correlation);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', page.id, 'countNumber', page.count_number, 'status', page.status,
    'createdByName', page.creator_name, 'lineCount', page.line_count,
    'createdAt', page.created_at, 'submittedAt', page.submitted_at,
    'postedAt', page.posted_at, 'version', page.version, 'updatedAt', page.updated_at
  ) order by page.updated_at desc, page.id desc), '[]'::jsonb)
  into v_items from (
    select count_document.*, creator.display_name creator_name,
      (select count(*) from api.stock_count_lines line where line.stock_count_id = count_document.id)::integer line_count
    from api.stock_counts count_document
    join api.profiles creator on creator.id = count_document.created_by
    where count_document.count_type = 'PERIODIC'
      and (v_owner or count_document.created_by = v_actor)
      and (coalesce(p_filters ->> 'status', '') = '' or count_document.status = p_filters ->> 'status')
      and (p_cursor_updated_at is null or (count_document.updated_at, count_document.id) < (p_cursor_updated_at, p_cursor_id))
    order by count_document.updated_at desc, count_document.id desc limit p_limit + 1
  ) page;
  if jsonb_array_length(v_items)>p_limit then
    v_items:=v_items - p_limit;
    v_cursor:=jsonb_build_object('updatedAt',v_items->-1->'updatedAt','id',v_items->-1->'id');
  end if;
  return app_private.command_success(jsonb_build_object('items',v_items,'nextCursor',v_cursor),v_correlation);
end;
$function$;

create or replace function api.list_stock_counts_v2(p_filters jsonb default '{}',p_cursor_updated_at timestamptz default null,p_cursor_id uuid default null,p_limit integer default 30)
returns jsonb language sql security invoker set search_path='' as $$
 select app_private.list_stock_counts_v2_impl(p_filters,p_cursor_updated_at,p_cursor_id,p_limit);
$$;
revoke all on function api.list_stock_counts_v2(jsonb,timestamptz,uuid,integer) from public,anon;
revoke all on function app_private.list_stock_counts_v2_impl(jsonb,timestamptz,uuid,integer) from public,anon;
grant execute on function api.list_stock_counts_v2(jsonb,timestamptz,uuid,integer) to authenticated,service_role;
grant execute on function app_private.list_stock_counts_v2_impl(jsonb,timestamptz,uuid,integer) to authenticated,service_role;

CREATE OR REPLACE FUNCTION app_private.list_purchase_receipts_impl(p_filters jsonb, p_cursor_updated_at timestamp with time zone, p_cursor_id uuid, p_limit integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_correlation_id uuid := gen_random_uuid();
  v_items jsonb;
  v_has_more boolean;
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
        or r.received_at >= (p_filters ->> 'from')::date)
      and (nullif(p_filters ->> 'to', '') is null
        or r.received_at < ((p_filters ->> 'to')::date + 1))
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
, bool_or(ordinal > p_limit)
  into v_items, v_next_updated_at, v_next_id, v_has_more from numbered;
  if not coalesce(v_has_more,false) then
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
$function$;

CREATE OR REPLACE FUNCTION app_private.list_opening_stock_documents_impl(p_cursor_updated_at timestamp with time zone, p_cursor_id uuid, p_limit integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_correlation_id uuid := gen_random_uuid();
  v_items jsonb;
  v_has_more boolean;
  v_next_updated_at timestamptz;
  v_next_id uuid;
begin
  if not app_private.has_permission('inventory.adjustment.post') then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Chỉ chủ cửa hàng được xem phiếu mở sổ.',
      v_correlation_id
    );
  end if;
  if p_limit is null or p_limit not between 1 and 100
    or ((p_cursor_updated_at is null) <> (p_cursor_id is null))
  then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Bộ lọc phiếu mở sổ chưa hợp lệ.',
      v_correlation_id
    );
  end if;
  with page as (
    select c.*, creator.display_name as created_by_name,
      (select count(*) from api.stock_count_lines l
        where l.stock_count_id = c.id)::integer as line_count,
      coalesce((select sum(l.counted_qty) from api.stock_count_lines l
        where l.stock_count_id = c.id), 0) as total_quantity,
      coalesce((select sum(cost.opening_value)
        from api.stock_count_lines l
        join app_private.stock_count_line_costs cost
          on cost.stock_count_line_id = l.id
        where l.stock_count_id = c.id), 0) as total_value
    from api.stock_counts c
    join api.profiles creator on creator.id = c.created_by
    where c.count_type = 'OPENING'
      and (p_cursor_updated_at is null
        or (c.updated_at, c.id) < (p_cursor_updated_at, p_cursor_id))
    order by c.updated_at desc, c.id desc limit p_limit + 1
  ), numbered as (
    select page.*, row_number() over (order by updated_at desc, id desc) ordinal
    from page
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'countNumber', count_number, 'status', status,
      'createdByName', created_by_name, 'lineCount', line_count,
      'totalQuantity', total_quantity::text, 'totalValue', total_value::text,
      'version', version, 'updatedAt', updated_at
    ) order by updated_at desc, id desc)
      filter (where ordinal <= p_limit), '[]'::jsonb),
    (array_agg(updated_at order by updated_at desc, id desc)
      filter (where ordinal = p_limit))[1],
    (array_agg(id order by updated_at desc, id desc)
      filter (where ordinal = p_limit))[1]
, bool_or(ordinal > p_limit)
  into v_items, v_next_updated_at, v_next_id, v_has_more from numbered;
  if not coalesce(v_has_more,false) then
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
end;
$function$;

CREATE OR REPLACE FUNCTION app_private.get_my_notifications_impl(p_unread_only boolean DEFAULT false, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := (select auth.uid());
  correlation_id uuid := gen_random_uuid();
  result_items jsonb := '[]'::jsonb;
  unread_count integer := 0;
  effective_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  next_cursor jsonb;
begin
  if actor_id is null or not app_private.has_active_profile(false) then
    return jsonb_build_object(
      'ok', false,
      'data', null,
      'error', jsonb_build_object(
        'code', 'AUTH_REQUIRED',
        'message', 'Vui lòng đăng nhập để tiếp tục.',
        'details', '{}'::jsonb
      ),
      'correlationId', correlation_id
    );
  end if;

  if (p_cursor_created_at is null) <> (p_cursor_id is null) then
    return jsonb_build_object(
      'ok', false,
      'data', null,
      'error', jsonb_build_object(
        'code', 'VALIDATION_ERROR',
        'message', 'Con trỏ phân trang chưa hợp lệ.',
        'details', '{}'::jsonb
      ),
      'correlationId', correlation_id
    );
  end if;

  select count(*)::integer
  into unread_count
  from api.user_notifications as n
  where n.user_id = actor_id
    and n.read_at is null
    and n.expires_at > now();

  with selected as (
    select n.*
    from api.user_notifications as n
    where n.user_id = actor_id
      and n.expires_at > now()
      and (not coalesce(p_unread_only, false) or n.read_at is null)
      and (
        p_cursor_created_at is null
        or (n.created_at, n.id) < (p_cursor_created_at, p_cursor_id)
      )
    order by n.created_at desc, n.id desc
    limit effective_limit + 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'severity', s.severity,
        'category', s.category,
        'title', s.title,
        'message', s.message,
        'actionRoute', s.action_route,
        'entityType', s.entity_type,
        'entityId', s.entity_id,
        'correlationId', s.correlation_id,
        'readAt', s.read_at,
        'createdAt', s.created_at
      )
      order by s.created_at desc, s.id desc
    ),
    '[]'::jsonb
  )
  into result_items
  from selected as s;

  if jsonb_array_length(result_items)>effective_limit then
    result_items:=result_items - effective_limit;
    next_cursor:=jsonb_build_object('createdAt',result_items->-1->'createdAt','id',result_items->-1->'id');
  end if;

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'items', result_items,
      'unreadCount', unread_count,
      'nextCursor', next_cursor
    ),
    'error', null,
    'correlationId', correlation_id
  );
end;
$function$;

notify pgrst, 'reload schema';
commit;
