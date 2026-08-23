-- Phase 1E: invoice returns, sale cancellation and periodic stock counts.

alter table app_private.document_sequences
  drop constraint document_sequences_document_type_check;
alter table app_private.document_sequences
  add constraint document_sequences_document_type_check check (
    document_type in ('PURCHASE_RECEIPT', 'STOCK_COUNT', 'SALE', 'SALE_RETURN')
  );
insert into app_private.document_sequences (document_type, prefix)
values ('SALE_RETURN', 'TH')
on conflict (document_type) do nothing;

alter table api.stock_movements
  drop constraint stock_movements_movement_type_check,
  drop constraint stock_movements_reference_type_check;
alter table api.stock_movements
  add constraint stock_movements_movement_type_check check (
    movement_type in (
      'OPENING', 'PURCHASE_RECEIPT', 'PURCHASE_REVERSAL', 'SALE',
      'SALE_RETURN', 'SALE_CANCEL', 'STOCK_ADJUSTMENT'
    )
  ),
  add constraint stock_movements_reference_type_check check (
    reference_type in ('PURCHASE_RECEIPT', 'STOCK_COUNT', 'SALE', 'SALE_RETURN')
  );

alter table api.sales
  add column cancelled_by uuid references api.profiles(id) on delete restrict,
  add column cancelled_at timestamptz,
  add column cancel_reason text check (
    cancel_reason is null
    or (cancel_reason = btrim(cancel_reason) and length(cancel_reason) between 1 and 500)
  );

alter table api.payments
  add column reversed_at timestamptz,
  add column reversed_by uuid references api.profiles(id) on delete restrict,
  add column reversal_reason text check (
    reversal_reason is null
    or (reversal_reason = btrim(reversal_reason) and length(reversal_reason) between 1 and 500)
  );

alter table api.stock_counts
  drop constraint stock_counts_count_type_check;
alter table api.stock_counts
  add constraint stock_counts_count_type_check check (
    count_type in ('OPENING', 'PERIODIC')
  );

alter table api.stock_count_lines
  drop constraint stock_count_lines_counted_qty_check,
  alter column counted_qty drop not null,
  add column difference_qty numeric(18,3);
alter table api.stock_count_lines
  add constraint stock_count_lines_counted_qty_check check (
    counted_qty is null or counted_qty >= 0
  ),
  add constraint stock_count_lines_difference_qty_check check (
    difference_qty is null
    or (counted_qty is not null and difference_qty = counted_qty - system_qty_snapshot)
  );
update api.stock_count_lines
set difference_qty = counted_qty - system_qty_snapshot
where counted_qty is not null;

create table api.sale_returns (
  id uuid primary key default gen_random_uuid(),
  return_number text unique,
  original_sale_id uuid not null references api.sales(id) on delete restrict,
  status text not null default 'REQUESTED' check (
    status in ('DRAFT', 'REQUESTED', 'COMPLETED', 'CANCELLED')
  ),
  reason text not null check (
    reason = btrim(reason) and length(reason) between 1 and 500
  ),
  refund_total numeric(20,2) not null default 0 check (refund_total >= 0),
  created_by uuid not null references api.profiles(id) on delete restrict,
  requested_by uuid references api.profiles(id) on delete restrict,
  requested_at timestamptz,
  completed_by uuid references api.profiles(id) on delete restrict,
  completed_at timestamptz,
  cancelled_by uuid references api.profiles(id) on delete restrict,
  cancelled_at timestamptz,
  cancel_reason text check (
    cancel_reason is null
    or (cancel_reason = btrim(cancel_reason) and length(cancel_reason) between 1 and 500)
  ),
  version bigint not null default 1 check (version >= 1),
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'COMPLETED') = (return_number is not null)),
  check ((status in ('REQUESTED', 'COMPLETED')) = (requested_at is not null)),
  check ((status = 'COMPLETED') = (completed_at is not null)),
  check ((status = 'CANCELLED') = (cancelled_at is not null))
);
create index sale_returns_sale_status_idx
  on api.sale_returns(original_sale_id, status, updated_at desc, id desc);
create index sale_returns_creator_idx
  on api.sale_returns(created_by, updated_at desc, id desc);
create index sale_returns_complete_idx
  on api.sale_returns(completed_by, completed_at desc, id desc)
  where completed_by is not null;

create table api.sale_return_lines (
  id uuid primary key default gen_random_uuid(),
  sale_return_id uuid not null references api.sale_returns(id) on delete cascade,
  original_sale_line_id uuid not null references api.sale_lines(id) on delete restrict,
  product_id uuid not null references api.products(id) on delete restrict,
  product_name text not null check (length(product_name) between 1 and 200),
  sku text not null check (length(sku) between 1 and 64),
  unit_name text not null check (length(unit_name) between 1 and 50),
  requested_qty numeric(18,3) not null check (requested_qty > 0),
  accepted_qty numeric(18,3) check (accepted_qty is null or accepted_qty >= 0),
  refund_amount numeric(20,2) not null default 0 check (refund_amount >= 0),
  line_order integer not null check (line_order >= 0),
  created_at timestamptz not null default now(),
  unique(sale_return_id, original_sale_line_id),
  unique(sale_return_id, line_order)
);
create index sale_return_lines_product_idx
  on api.sale_return_lines(product_id, sale_return_id);
create index sale_return_lines_original_idx
  on api.sale_return_lines(original_sale_line_id, sale_return_id);

create table api.sale_return_payments (
  id uuid primary key default gen_random_uuid(),
  sale_return_id uuid not null unique references api.sale_returns(id) on delete restrict,
  method text not null check (method in ('CASH', 'BANK_TRANSFER')),
  amount numeric(20,2) not null check (amount >= 0),
  status text not null check (status in ('REFUNDED', 'REVERSED')),
  refunded_at timestamptz not null default now(),
  refunded_by uuid not null references api.profiles(id) on delete restrict,
  correlation_id uuid not null
);

create table app_private.sale_return_line_costs (
  sale_return_line_id uuid primary key
    references api.sale_return_lines(id) on delete restrict,
  unit_cost_snapshot numeric(20,6) not null check (unit_cost_snapshot >= 0),
  cogs_returned numeric(20,2) not null check (cogs_returned >= 0),
  created_at timestamptz not null default now()
);

create table app_private.stock_count_adjustment_costs (
  stock_count_line_id uuid primary key
    references api.stock_count_lines(id) on delete restrict,
  applied_unit_cost numeric(20,6) not null check (applied_unit_cost >= 0),
  inventory_value_delta numeric(20,2) not null,
  source text not null check (source in ('CURRENT_AVERAGE', 'OWNER_ESTIMATE')),
  entered_by uuid not null references api.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table app_private.sales_financial_events
  drop constraint sales_financial_events_sale_id_key,
  drop constraint sales_financial_events_event_type_check,
  add column sale_return_id uuid references api.sale_returns(id) on delete restrict,
  add column cogs_delta numeric(20,2) not null default 0,
  add constraint sales_financial_events_event_type_check check (
    event_type in ('SALE_COMPLETED', 'RETURN_COMPLETED', 'SALE_CANCELLED')
  );
update app_private.sales_financial_events event
set cogs_delta = coalesce((
  select sum(cost.cogs_total_snapshot)
  from api.sale_lines line
  join app_private.sale_line_costs cost on cost.sale_line_id = line.id
  where line.sale_id = event.sale_id
), 0)
where event.event_type = 'SALE_COMPLETED';
create unique index sales_financial_event_sale_completed_uidx
  on app_private.sales_financial_events(sale_id)
  where event_type = 'SALE_COMPLETED';
create unique index sales_financial_event_sale_cancelled_uidx
  on app_private.sales_financial_events(sale_id)
  where event_type = 'SALE_CANCELLED';
create unique index sales_financial_event_return_completed_uidx
  on app_private.sales_financial_events(sale_return_id)
  where event_type = 'RETURN_COMPLETED';

alter table api.sale_returns enable row level security;
alter table api.sale_returns force row level security;
alter table api.sale_return_lines enable row level security;
alter table api.sale_return_lines force row level security;
alter table api.sale_return_payments enable row level security;
alter table api.sale_return_payments force row level security;
alter table app_private.sale_return_line_costs enable row level security;
alter table app_private.sale_return_line_costs force row level security;
alter table app_private.stock_count_adjustment_costs enable row level security;
alter table app_private.stock_count_adjustment_costs force row level security;

revoke all on api.sale_returns, api.sale_return_lines, api.sale_return_payments
  from public, anon, authenticated;
revoke all on app_private.sale_return_line_costs,
  app_private.stock_count_adjustment_costs from public, anon, authenticated;
grant all on api.sale_returns, api.sale_return_lines, api.sale_return_payments
  to service_role;
grant all on app_private.sale_return_line_costs,
  app_private.stock_count_adjustment_costs to service_role;

drop policy if exists stock_counts_owner_read on api.stock_counts;
drop policy if exists stock_count_lines_owner_read on api.stock_count_lines;
create policy stock_counts_operational_read on api.stock_counts for select to authenticated
using (
  (select app_private.has_permission('inventory.adjustment.post'))
  or (
    (select app_private.has_permission('inventory.count.draft'))
    and created_by = (select auth.uid())
  )
);
create policy stock_count_lines_operational_read on api.stock_count_lines for select to authenticated
using (
  exists (
    select 1 from api.stock_counts count_document
    where count_document.id = stock_count_id
  )
);

create or replace function app_private.get_sale_invoice_impl(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_sale api.sales%rowtype;
  v_correlation uuid := gen_random_uuid();
begin
  if v_actor is null or not app_private.has_permission('sale.own.read') then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Bạn không có quyền xem hóa đơn.', v_correlation
    );
  end if;
  select * into v_sale from api.sales where id = p_sale_id;
  if not found or v_sale.status = 'DRAFT'
    or (v_sale.created_by <> v_actor and not app_private.has_permission('sale.all.read')) then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Bạn không có quyền xem hóa đơn này.', v_correlation
    );
  end if;
  return app_private.command_success(jsonb_build_object(
    'version', 2,
    'store', (select jsonb_build_object(
      'displayName', x.display_name, 'logoPath', x.logo_path,
      'address', x.address, 'contactPhone', x.contact_phone,
      'zalo', x.zalo, 'invoiceFooter', x.invoice_footer
    ) from app_private.sale_invoice_store_snapshots x where x.sale_id = p_sale_id),
    'sale', jsonb_build_object(
      'id', v_sale.id, 'saleNumber', v_sale.sale_number,
      'completedAt', v_sale.completed_at, 'status', v_sale.status,
      'channelCode', v_sale.sales_channel_code_snapshot,
      'channelName', v_sale.sales_channel_name_snapshot,
      'staffName', v_sale.staff_name_snapshot,
      'customerName', v_sale.customer_name_snapshot,
      'customerPhone', v_sale.customer_phone_snapshot,
      'paymentMethod', (select method from api.payments where sale_id = p_sale_id),
      'paymentStatus', (select status from api.payments where sale_id = p_sale_id),
      'cancelledAt', v_sale.cancelled_at, 'cancelReason', v_sale.cancel_reason
    ),
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
      'id', l.id, 'productName', l.product_name, 'sku', l.sku,
      'unitName', l.unit_name, 'quantity', l.quantity::text,
      'unitSalePrice', l.unit_sale_price::text, 'grossAmount', l.gross_amount::text,
      'lineDiscountAmount', l.line_discount_amount::text,
      'allocatedOrderDiscount', l.allocated_order_discount::text,
      'netAmount', l.net_amount::text,
      'returnedQty', coalesce((select sum(rl.accepted_qty) from api.sale_return_lines rl
        join api.sale_returns r on r.id = rl.sale_return_id
        where r.status = 'COMPLETED' and rl.original_sale_line_id = l.id), 0)::text,
      'returnableQty', greatest(l.quantity - coalesce((select sum(rl.accepted_qty)
        from api.sale_return_lines rl join api.sale_returns r on r.id = rl.sale_return_id
        where r.status = 'COMPLETED' and rl.original_sale_line_id = l.id), 0), 0)::text
    ) order by l.line_order) from api.sale_lines l where l.sale_id = p_sale_id), '[]'::jsonb),
    'totals', jsonb_build_object(
      'subtotal', v_sale.subtotal::text,
      'lineDiscountTotal', v_sale.line_discount_total::text,
      'orderDiscountTotal', v_sale.order_discount_total::text,
      'netTotal', v_sale.net_total::text,
      'capturedAmount', (select amount::text from api.payments where sale_id = p_sale_id)
    ),
    'lifecycle', jsonb_build_object(
      'canReturn', v_sale.status in ('COMPLETED', 'PARTIALLY_RETURNED') and exists (
        select 1 from api.sale_lines l where l.sale_id = p_sale_id and l.quantity > coalesce((
          select sum(rl.accepted_qty) from api.sale_return_lines rl
          join api.sale_returns r on r.id = rl.sale_return_id
          where r.status = 'COMPLETED' and rl.original_sale_line_id = l.id
        ), 0)
      ),
      'canCancel', v_sale.status = 'COMPLETED' and not exists (
        select 1 from api.sale_returns r
        where r.original_sale_id = p_sale_id and r.status = 'COMPLETED'
      ),
      'returns', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'returnNumber', r.return_number, 'status', r.status,
        'reason', r.reason, 'refundTotal', r.refund_total::text,
        'createdAt', r.created_at, 'completedAt', r.completed_at,
        'cancelReason', r.cancel_reason
      ) order by r.created_at desc, r.id desc) from api.sale_returns r
      where r.original_sale_id = p_sale_id), '[]'::jsonb)
    )
  ), v_correlation);
end;
$$;

create function app_private.lookup_sale_for_return_impl(p_full_sale_number text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_sale api.sales%rowtype;
  v_correlation uuid := gen_random_uuid();
begin
  if v_actor is null or not app_private.has_permission('return.request.create') then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Bạn không có quyền tạo yêu cầu trả hàng.', v_correlation
    );
  end if;
  if coalesce(p_full_sale_number, '') !~ '^HD[0-9]{6,}$' then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Vui lòng nhập đầy đủ mã hóa đơn theo dạng HDxxxxxx.', v_correlation
    );
  end if;
  select * into v_sale
  from api.sales
  where sale_number = upper(btrim(p_full_sale_number))
    and status in ('COMPLETED', 'PARTIALLY_RETURNED');
  if not found then
    return app_private.command_error(
      'ORIGINAL_INVOICE_REQUIRED', 'Không tìm thấy hóa đơn còn đủ điều kiện trả hàng.', v_correlation
    );
  end if;
  insert into app_private.audit_events(
    actor_id, action, entity_type, entity_id, after_data, correlation_id
  ) values (
    v_actor, 'sale.return_lookup', 'sale', v_sale.id,
    jsonb_build_object('saleNumber', v_sale.sale_number), v_correlation
  );
  return app_private.command_success(jsonb_build_object(
    'saleId', v_sale.id, 'saleNumber', v_sale.sale_number,
    'completedAt', v_sale.completed_at, 'customerName', v_sale.customer_name_snapshot,
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
      'id', l.id, 'productId', l.product_id, 'productName', l.product_name,
      'sku', l.sku, 'unitName', l.unit_name, 'soldQty', l.quantity::text,
      'returnedQty', coalesce((select sum(rl.accepted_qty) from api.sale_return_lines rl
        join api.sale_returns r on r.id = rl.sale_return_id
        where r.status = 'COMPLETED' and rl.original_sale_line_id = l.id), 0)::text,
      'returnableQty', greatest(l.quantity - coalesce((select sum(rl.accepted_qty)
        from api.sale_return_lines rl join api.sale_returns r on r.id = rl.sale_return_id
        where r.status = 'COMPLETED' and rl.original_sale_line_id = l.id), 0), 0)::text,
      'netAmount', l.net_amount::text
    ) order by l.line_order) from api.sale_lines l where l.sale_id = v_sale.id), '[]'::jsonb)
  ), v_correlation);
end;
$$;

create function app_private.create_sale_return_request_impl(
  p_original_sale_id uuid,
  p_reason text,
  p_lines jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_correlation uuid := gen_random_uuid();
  v_reason text := app_private.empty_to_null(p_reason);
  v_sale api.sales%rowtype;
  v_return_id uuid := gen_random_uuid();
  v_version bigint;
  v_cached jsonb;
  v_result jsonb;
begin
  if v_actor is null or not app_private.has_permission('return.request.create') then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền tạo yêu cầu trả hàng.', v_correlation);
  end if;
  if p_original_sale_id is null or p_idempotency_key is null
    or v_reason is null or length(v_reason) > 500
    or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 200
    or exists (
      select 1 from jsonb_array_elements(p_lines) item
      where jsonb_typeof(item) <> 'object'
        or item - array['originalSaleLineId', 'requestedQty'] <> '{}'::jsonb
        or coalesce(item ->> 'originalSaleLineId', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        or coalesce(item ->> 'requestedQty', '') !~ '^(0|[1-9][0-9]*)(\\.[0-9]{1,3})?$'
        or (item ->> 'requestedQty')::numeric <= 0
    ) or exists (
      select 1 from jsonb_array_elements(p_lines) item
      group by item ->> 'originalSaleLineId' having count(*) > 1
    ) then
    return app_private.command_error('VALIDATION_FAILED', 'Dòng hàng trả hoặc số lượng trả chưa hợp lệ.', v_correlation);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':sale.return.create:' || p_idempotency_key::text, 0));
  v_cached := app_private.cached_command_response(v_actor, 'sale.return.create', p_idempotency_key);
  if v_cached is not null then return v_cached; end if;
  select * into v_sale from api.sales where id = p_original_sale_id for update;
  if not found or v_sale.status not in ('COMPLETED', 'PARTIALLY_RETURNED') then
    return app_private.command_error('ORIGINAL_INVOICE_REQUIRED', 'Hóa đơn gốc không còn đủ điều kiện trả hàng.', v_correlation);
  end if;
  perform 1 from api.sale_lines line
  join jsonb_array_elements(p_lines) item on line.id = (item ->> 'originalSaleLineId')::uuid
  where line.sale_id = p_original_sale_id order by line.id for update of line;
  if (select count(*) from api.sale_lines line
      join jsonb_array_elements(p_lines) item on line.id = (item ->> 'originalSaleLineId')::uuid
      where line.sale_id = p_original_sale_id) <> jsonb_array_length(p_lines) then
    return app_private.command_error('VALIDATION_FAILED', 'Có dòng hàng không thuộc hóa đơn gốc.', v_correlation);
  end if;
  if exists (
    select 1 from api.sale_lines line
    join jsonb_array_elements(p_lines) item on line.id = (item ->> 'originalSaleLineId')::uuid
    where line.sale_id = p_original_sale_id
      and coalesce((select sum(return_line.requested_qty)
        from api.sale_return_lines return_line
        join api.sale_returns return_document on return_document.id = return_line.sale_return_id
        where return_line.original_sale_line_id = line.id
          and return_document.status in ('REQUESTED', 'COMPLETED')), 0)
        + (item ->> 'requestedQty')::numeric > line.quantity
  ) then
    return app_private.command_error('RETURN_QTY_EXCEEDED', 'Số lượng yêu cầu trả vượt quá số lượng còn được trả.', v_correlation);
  end if;
  insert into api.sale_returns(
    id, original_sale_id, status, reason, created_by, requested_by, requested_at, correlation_id
  ) values (
    v_return_id, p_original_sale_id, 'REQUESTED', v_reason, v_actor, v_actor, now(), v_correlation
  ) returning version into v_version;
  insert into api.sale_return_lines(
    sale_return_id, original_sale_line_id, product_id, product_name, sku, unit_name,
    requested_qty, line_order
  )
  select v_return_id, line.id, line.product_id, line.product_name, line.sku, line.unit_name,
    (item.value ->> 'requestedQty')::numeric, item.ordinality::integer - 1
  from jsonb_array_elements(p_lines) with ordinality item(value, ordinality)
  join api.sale_lines line on line.id = (item.value ->> 'originalSaleLineId')::uuid
  order by item.ordinality;
  insert into api.user_notifications(
    user_id, severity, category, title, message, action_route, entity_type, entity_id,
    dedupe_key, metadata, correlation_id
  )
  select profile.id, 'INFO', 'RETURN', 'Có yêu cầu trả hàng mới',
    'Một yêu cầu trả hàng đang chờ kiểm nhận.', '/returns/' || v_return_id::text,
    'sale_return', v_return_id, 'return-request:' || v_return_id::text,
    jsonb_build_object('saleNumber', v_sale.sale_number), v_correlation
  from api.profiles profile
  where profile.is_active and profile.id <> v_actor
    and app_private.effective_permissions_for(profile.id) @> '["return.complete"]'::jsonb
  on conflict do nothing;
  insert into app_private.audit_events(actor_id, action, entity_type, entity_id, after_data, correlation_id)
  values (v_actor, 'sale_return.requested', 'sale_return', v_return_id,
    jsonb_build_object('saleId', p_original_sale_id, 'lineCount', jsonb_array_length(p_lines)), v_correlation);
  v_result := app_private.command_success(jsonb_build_object(
    'returnId', v_return_id, 'status', 'REQUESTED', 'version', v_version
  ), v_correlation);
  insert into app_private.command_deduplication(actor_id, command_name, idempotency_key, response)
  values (v_actor, 'sale.return.create', p_idempotency_key, v_result);
  return v_result;
exception when invalid_text_representation or numeric_value_out_of_range then
  return app_private.command_error('VALIDATION_FAILED', 'Số lượng trả chưa đúng định dạng quốc tế.', v_correlation);
end;
$$;

create function app_private.cancel_sale_return_impl(
  p_return_id uuid,
  p_expected_version bigint,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_correlation uuid := gen_random_uuid();
  v_reason text := app_private.empty_to_null(p_reason);
  v_return api.sale_returns%rowtype;
  v_sale api.sales%rowtype;
  v_version bigint;
  v_cached jsonb;
  v_result jsonb;
begin
  if v_actor is null or (not app_private.has_permission('return.request.create') and not app_private.has_permission('return.complete')) then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền hủy yêu cầu trả hàng.', v_correlation);
  end if;
  if p_return_id is null or p_expected_version is null or p_idempotency_key is null
    or v_reason is null or length(v_reason) > 500 then
    return app_private.command_error('VALIDATION_FAILED', 'Vui lòng nhập lý do hủy yêu cầu trả hàng.', v_correlation);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':sale.return.cancel:' || p_idempotency_key::text, 0));
  v_cached := app_private.cached_command_response(v_actor, 'sale.return.cancel', p_idempotency_key);
  if v_cached is not null then return v_cached; end if;
  select * into v_return from api.sale_returns where id = p_return_id for update;
  if not found or v_return.status not in ('DRAFT', 'REQUESTED') then
    return app_private.command_error('INVALID_STATE', 'Yêu cầu trả hàng này không thể hủy.', v_correlation);
  end if;
  if v_return.created_by <> v_actor and not app_private.has_permission('return.complete') then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn chỉ được hủy yêu cầu trả do mình tạo.', v_correlation);
  end if;
  if v_return.version <> p_expected_version then
    return app_private.command_error_with_details('VERSION_CONFLICT', 'Yêu cầu trả hàng đã được cập nhật. Vui lòng tải lại.', jsonb_build_object('currentVersion', v_return.version), v_correlation);
  end if;
  select * into v_sale from api.sales where id = v_return.original_sale_id;
  update api.sale_returns
  set status = 'CANCELLED', cancelled_by = v_actor, cancelled_at = now(), cancel_reason = v_reason,
      version = version + 1, updated_at = now(), correlation_id = v_correlation
  where id = p_return_id returning version into v_version;
  insert into api.user_notifications(user_id, severity, category, title, message, action_route, entity_type, entity_id, dedupe_key, correlation_id)
  select distinct recipient.id, 'INFO', 'RETURN', 'Yêu cầu trả hàng đã hủy',
    'Yêu cầu trả hàng liên quan đến hóa đơn ' || v_sale.sale_number || ' đã được hủy.',
    '/returns/' || p_return_id::text, 'sale_return', p_return_id,
    'return-cancel:' || p_return_id::text, v_correlation
  from api.profiles recipient
  where recipient.id in (v_return.created_by, v_sale.created_by)
    and recipient.id <> v_actor
  on conflict do nothing;
  insert into app_private.audit_events(actor_id, action, entity_type, entity_id, after_data, correlation_id)
  values (v_actor, 'sale_return.cancelled', 'sale_return', p_return_id,
    jsonb_build_object('reason', v_reason), v_correlation);
  v_result := app_private.command_success(jsonb_build_object('returnId', p_return_id, 'status', 'CANCELLED', 'version', v_version), v_correlation);
  insert into app_private.command_deduplication(actor_id, command_name, idempotency_key, response)
  values (v_actor, 'sale.return.cancel', p_idempotency_key, v_result);
  return v_result;
end;
$$;

create function app_private.complete_sale_return_impl(
  p_return_id uuid,
  p_expected_version bigint,
  p_lines jsonb,
  p_refund_method text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_correlation uuid := gen_random_uuid();
  v_return api.sale_returns%rowtype;
  v_sale api.sales%rowtype;
  v_cached jsonb;
  v_result jsonb;
  v_line record;
  v_accepted numeric(18,3);
  v_previous_qty numeric(18,3);
  v_previous_refund numeric(20,2);
  v_previous_cogs numeric(20,2);
  v_refund numeric(20,2);
  v_returned_cogs numeric(20,2);
  v_total_refund numeric(20,2) := 0;
  v_total_cogs numeric(20,2) := 0;
  v_new_qty numeric(18,3);
  v_new_value numeric(20,2);
  v_new_average numeric(20,6);
  v_movement_id uuid;
  v_return_number text;
  v_version bigint;
  v_next_sale_status text;
begin
  if v_actor is null or not app_private.has_permission('return.complete') then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền hoàn tất trả hàng.', v_correlation);
  end if;
  if p_return_id is null or p_expected_version is null or p_idempotency_key is null
    or p_refund_method not in ('CASH', 'BANK_TRANSFER')
    or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 200
    or exists (
      select 1 from jsonb_array_elements(p_lines) item
      where jsonb_typeof(item) <> 'object'
        or item - array['saleReturnLineId', 'acceptedQty'] <> '{}'::jsonb
        or coalesce(item ->> 'saleReturnLineId', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        or coalesce(item ->> 'acceptedQty', '') !~ '^(0|[1-9][0-9]*)(\\.[0-9]{1,3})?$'
        or (item ->> 'acceptedQty')::numeric < 0
    ) or exists (
      select 1 from jsonb_array_elements(p_lines) item
      group by item ->> 'saleReturnLineId' having count(*) > 1
    ) then
    return app_private.command_error('VALIDATION_FAILED', 'Dòng kiểm nhận hoặc phương thức hoàn tiền chưa hợp lệ.', v_correlation);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':sale.return.complete:' || p_idempotency_key::text, 0));
  v_cached := app_private.cached_command_response(v_actor, 'sale.return.complete', p_idempotency_key);
  if v_cached is not null then return v_cached; end if;
  select * into v_return from api.sale_returns where id = p_return_id for update;
  if not found or v_return.status <> 'REQUESTED' then
    return app_private.command_error('INVALID_STATE', 'Yêu cầu trả hàng này không còn chờ kiểm nhận.', v_correlation);
  end if;
  if v_return.version <> p_expected_version then
    return app_private.command_error_with_details('VERSION_CONFLICT', 'Yêu cầu trả hàng đã được cập nhật. Vui lòng tải lại.', jsonb_build_object('currentVersion', v_return.version), v_correlation);
  end if;
  select * into v_sale from api.sales where id = v_return.original_sale_id for update;
  if not found or v_sale.status not in ('COMPLETED', 'PARTIALLY_RETURNED') then
    return app_private.command_error('ORIGINAL_INVOICE_REQUIRED', 'Hóa đơn gốc không còn đủ điều kiện trả hàng.', v_correlation);
  end if;
  perform 1 from api.sale_return_lines return_line
  where return_line.sale_return_id = p_return_id order by return_line.product_id for update;
  if (select count(*) from api.sale_return_lines where sale_return_id = p_return_id) <> jsonb_array_length(p_lines)
    or exists (
      select 1 from jsonb_array_elements(p_lines) item
      left join api.sale_return_lines return_line
        on return_line.id = (item ->> 'saleReturnLineId')::uuid and return_line.sale_return_id = p_return_id
      where return_line.id is null
    ) then
    return app_private.command_error('VALIDATION_FAILED', 'Danh sách dòng kiểm nhận không khớp với yêu cầu trả.', v_correlation);
  end if;
  if coalesce((select sum((item ->> 'acceptedQty')::numeric) from jsonb_array_elements(p_lines) item), 0) <= 0 then
    return app_private.command_error('RETURN_NOTHING_ACCEPTED', 'Cần chấp nhận ít nhất một sản phẩm để hoàn tất trả hàng.', v_correlation);
  end if;
  if exists (
    select 1 from api.sale_return_lines return_line
    join jsonb_array_elements(p_lines) item on (item ->> 'saleReturnLineId')::uuid = return_line.id
    where return_line.sale_return_id = p_return_id
      and (item ->> 'acceptedQty')::numeric > return_line.requested_qty
  ) then
    return app_private.command_error('RETURN_QTY_EXCEEDED', 'Số lượng chấp nhận không được vượt số lượng yêu cầu.', v_correlation);
  end if;
  perform 1 from api.inventory_balances balance
  join api.sale_return_lines return_line on return_line.product_id = balance.product_id
  where return_line.sale_return_id = p_return_id order by balance.product_id for update of balance;
  perform 1 from app_private.inventory_cost_balances balance
  join api.sale_return_lines return_line on return_line.product_id = balance.product_id
  where return_line.sale_return_id = p_return_id order by balance.product_id for update of balance;
  for v_line in
    select return_line.*, sale_line.quantity as sold_qty, sale_line.net_amount,
      sale_cost.unit_cost_snapshot, sale_cost.cogs_total_snapshot,
      quantity_balance.on_hand_qty, cost_balance.inventory_value, cost_balance.avg_unit_cost
    from api.sale_return_lines return_line
    join api.sale_lines sale_line on sale_line.id = return_line.original_sale_line_id
    join app_private.sale_line_costs sale_cost on sale_cost.sale_line_id = sale_line.id
    join api.inventory_balances quantity_balance on quantity_balance.product_id = return_line.product_id
    join app_private.inventory_cost_balances cost_balance on cost_balance.product_id = return_line.product_id
    where return_line.sale_return_id = p_return_id
    order by return_line.product_id
  loop
    select (item ->> 'acceptedQty')::numeric into v_accepted
    from jsonb_array_elements(p_lines) item
    where (item ->> 'saleReturnLineId')::uuid = v_line.id;
    select coalesce(sum(previous_line.accepted_qty), 0),
      coalesce(sum(previous_line.refund_amount), 0),
      coalesce(sum(previous_cost.cogs_returned), 0)
    into v_previous_qty, v_previous_refund, v_previous_cogs
    from api.sale_return_lines previous_line
    join api.sale_returns previous_return on previous_return.id = previous_line.sale_return_id
    left join app_private.sale_return_line_costs previous_cost on previous_cost.sale_return_line_id = previous_line.id
    where previous_line.original_sale_line_id = v_line.original_sale_line_id
      and previous_return.status = 'COMPLETED';
    if v_previous_qty + v_accepted > v_line.sold_qty then
      return app_private.command_error('RETURN_QTY_EXCEEDED', 'Số lượng được trả đã thay đổi. Vui lòng tải lại hóa đơn.', v_correlation);
    end if;
    if v_previous_qty + v_accepted = v_line.sold_qty then
      v_refund := v_line.net_amount - v_previous_refund;
      v_returned_cogs := v_line.cogs_total_snapshot - v_previous_cogs;
    else
      v_refund := round(v_line.net_amount * v_accepted / v_line.sold_qty, 2);
      v_returned_cogs := round(v_line.cogs_total_snapshot * v_accepted / v_line.sold_qty, 2);
    end if;
    update api.sale_return_lines
    set accepted_qty = v_accepted, refund_amount = v_refund
    where id = v_line.id;
    if v_accepted > 0 then
      v_new_qty := v_line.on_hand_qty + v_accepted;
      v_new_value := round(v_line.inventory_value + v_returned_cogs, 2);
      v_new_average := round(v_new_value / v_new_qty, 6);
      update api.inventory_balances
      set on_hand_qty = v_new_qty, version = version + 1, updated_at = now()
      where product_id = v_line.product_id;
      update app_private.inventory_cost_balances
      set inventory_value = v_new_value, avg_unit_cost = v_new_average,
          version = version + 1, updated_at = now()
      where product_id = v_line.product_id;
      insert into api.stock_movements(
        product_id, movement_type, quantity_delta, quantity_after, reference_type,
        reference_id, occurred_at, actor_id, note, correlation_id
      ) values (
        v_line.product_id, 'SALE_RETURN', v_accepted, v_new_qty, 'SALE_RETURN',
        p_return_id, now(), v_actor, 'Hoàn tất trả hàng', v_correlation
      ) returning id into v_movement_id;
      insert into app_private.inventory_cost_movements(
        stock_movement_id, inventory_value_delta, cogs_delta, inventory_value_after,
        avg_unit_cost_after, occurred_at
      ) values (
        v_movement_id, v_returned_cogs, -v_returned_cogs, v_new_value, v_new_average, now()
      );
      insert into app_private.sale_return_line_costs(
        sale_return_line_id, unit_cost_snapshot, cogs_returned
      ) values (v_line.id, v_line.unit_cost_snapshot, v_returned_cogs);
    end if;
    v_total_refund := v_total_refund + v_refund;
    v_total_cogs := v_total_cogs + v_returned_cogs;
  end loop;
  v_return_number := app_private.next_document_number_impl('SALE_RETURN');
  if exists (
    select 1 from api.sale_lines sale_line
    where sale_line.sale_id = v_sale.id and sale_line.quantity > coalesce((
      select sum(return_line.accepted_qty) from api.sale_return_lines return_line
      join api.sale_returns return_document on return_document.id = return_line.sale_return_id
      where return_document.status = 'COMPLETED' and return_line.original_sale_line_id = sale_line.id
    ), 0)
  ) then v_next_sale_status := 'PARTIALLY_RETURNED'; else v_next_sale_status := 'RETURNED'; end if;
  update api.sale_returns
  set return_number = v_return_number, status = 'COMPLETED', refund_total = v_total_refund,
      completed_by = v_actor, completed_at = now(), version = version + 1,
      updated_at = now(), correlation_id = v_correlation
  where id = p_return_id returning version into v_version;
  insert into api.sale_return_payments(
    sale_return_id, method, amount, status, refunded_by, correlation_id
  ) values (p_return_id, p_refund_method, v_total_refund, 'REFUNDED', v_actor, v_correlation);
  update api.sales
  set status = v_next_sale_status, version = version + 1, updated_at = now(), correlation_id = v_correlation
  where id = v_sale.id;
  insert into app_private.sales_financial_events(
    sale_id, sale_return_id, event_type, gross_sales, discount_total, net_revenue,
    cogs_delta, attributed_user_id, occurred_at, correlation_id
  ) values (
    v_sale.id, p_return_id, 'RETURN_COMPLETED', 0, 0, -v_total_refund,
    -v_total_cogs, v_sale.created_by, now(), v_correlation
  );
  insert into api.user_notifications(user_id, severity, category, title, message, action_route, entity_type, entity_id, dedupe_key, correlation_id)
  select distinct recipient.id, 'SUCCESS', 'RETURN', 'Đã hoàn tất trả hàng',
    'Phiếu ' || v_return_number || ' của hóa đơn ' || v_sale.sale_number || ' đã được hoàn tất.',
    '/returns/' || p_return_id::text, 'sale_return', p_return_id,
    'return-complete:' || p_return_id::text, v_correlation
  from api.profiles recipient
  where recipient.id in (v_return.created_by, v_sale.created_by) and recipient.id <> v_actor
  on conflict do nothing;
  insert into app_private.audit_events(actor_id, action, entity_type, entity_id, after_data, correlation_id)
  values (v_actor, 'sale_return.completed', 'sale_return', p_return_id,
    jsonb_build_object('returnNumber', v_return_number, 'refundTotal', v_total_refund::text), v_correlation);
  v_result := app_private.command_success(jsonb_build_object(
    'returnId', p_return_id, 'returnNumber', v_return_number, 'status', 'COMPLETED',
    'refundTotal', v_total_refund::text, 'version', v_version
  ), v_correlation);
  insert into app_private.command_deduplication(actor_id, command_name, idempotency_key, response)
  values (v_actor, 'sale.return.complete', p_idempotency_key, v_result);
  return v_result;
exception when invalid_text_representation or numeric_value_out_of_range then
  return app_private.command_error('VALIDATION_FAILED', 'Số lượng kiểm nhận chưa đúng định dạng quốc tế.', v_correlation);
end;
$$;

create function app_private.cancel_sale_impl(
  p_sale_id uuid,
  p_expected_version bigint,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_correlation uuid := gen_random_uuid();
  v_reason text := app_private.empty_to_null(p_reason);
  v_sale api.sales%rowtype;
  v_cached jsonb;
  v_result jsonb;
  v_line record;
  v_new_qty numeric(18,3);
  v_new_value numeric(20,2);
  v_new_average numeric(20,6);
  v_movement_id uuid;
  v_total_cogs numeric(20,2) := 0;
  v_version bigint;
begin
  if v_actor is null or not app_private.has_permission('sale.cancel') then
    return app_private.command_error('PERMISSION_DENIED', 'Chỉ chủ cửa hàng được hủy hóa đơn.', v_correlation);
  end if;
  if p_sale_id is null or p_expected_version is null or p_idempotency_key is null
    or v_reason is null or length(v_reason) > 500 then
    return app_private.command_error('VALIDATION_FAILED', 'Vui lòng nhập lý do hủy hóa đơn.', v_correlation);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':sale.cancel:' || p_idempotency_key::text, 0));
  v_cached := app_private.cached_command_response(v_actor, 'sale.cancel', p_idempotency_key);
  if v_cached is not null then return v_cached; end if;
  select * into v_sale from api.sales where id = p_sale_id for update;
  if not found or v_sale.status <> 'COMPLETED' then
    return app_private.command_error('INVALID_STATE', 'Chỉ hóa đơn đã hoàn tất và chưa trả hàng mới được hủy.', v_correlation);
  end if;
  if v_sale.version <> p_expected_version then
    return app_private.command_error_with_details('VERSION_CONFLICT', 'Hóa đơn đã được cập nhật. Vui lòng tải lại.', jsonb_build_object('currentVersion', v_sale.version), v_correlation);
  end if;
  if exists (select 1 from api.sale_returns where original_sale_id = p_sale_id and status = 'COMPLETED') then
    return app_private.command_error('INVALID_STATE', 'Không thể hủy hóa đơn đã có phiếu trả hoàn tất.', v_correlation);
  end if;
  if not exists (select 1 from api.payments where sale_id = p_sale_id and status = 'CAPTURED') then
    return app_private.command_error('INVALID_STATE', 'Không tìm thấy thanh toán hợp lệ để đảo hóa đơn.', v_correlation);
  end if;
  perform 1 from api.inventory_balances balance
  join api.sale_lines line on line.product_id = balance.product_id
  where line.sale_id = p_sale_id order by balance.product_id for update of balance;
  perform 1 from app_private.inventory_cost_balances balance
  join api.sale_lines line on line.product_id = balance.product_id
  where line.sale_id = p_sale_id order by balance.product_id for update of balance;
  for v_line in
    select line.*, cost.unit_cost_snapshot, cost.cogs_total_snapshot,
      quantity_balance.on_hand_qty, cost_balance.inventory_value
    from api.sale_lines line
    join app_private.sale_line_costs cost on cost.sale_line_id = line.id
    join api.inventory_balances quantity_balance on quantity_balance.product_id = line.product_id
    join app_private.inventory_cost_balances cost_balance on cost_balance.product_id = line.product_id
    where line.sale_id = p_sale_id order by line.product_id
  loop
    v_new_qty := v_line.on_hand_qty + v_line.quantity;
    v_new_value := round(v_line.inventory_value + v_line.cogs_total_snapshot, 2);
    v_new_average := round(v_new_value / v_new_qty, 6);
    update api.inventory_balances set on_hand_qty = v_new_qty, version = version + 1, updated_at = now()
    where product_id = v_line.product_id;
    update app_private.inventory_cost_balances
    set inventory_value = v_new_value, avg_unit_cost = v_new_average, version = version + 1, updated_at = now()
    where product_id = v_line.product_id;
    insert into api.stock_movements(product_id, movement_type, quantity_delta, quantity_after, reference_type, reference_id, occurred_at, actor_id, note, correlation_id)
    values (v_line.product_id, 'SALE_CANCEL', v_line.quantity, v_new_qty, 'SALE', p_sale_id, now(), v_actor, 'Hủy hóa đơn', v_correlation)
    returning id into v_movement_id;
    insert into app_private.inventory_cost_movements(stock_movement_id, inventory_value_delta, cogs_delta, inventory_value_after, avg_unit_cost_after, occurred_at)
    values (v_movement_id, v_line.cogs_total_snapshot, -v_line.cogs_total_snapshot, v_new_value, v_new_average, now());
    v_total_cogs := v_total_cogs + v_line.cogs_total_snapshot;
  end loop;
  update api.payments
  set status = 'REVERSED', reversed_at = now(), reversed_by = v_actor, reversal_reason = v_reason
  where sale_id = p_sale_id and status = 'CAPTURED';
  update api.sales
  set status = 'CANCELLED', cancelled_by = v_actor, cancelled_at = now(), cancel_reason = v_reason,
      version = version + 1, updated_at = now(), correlation_id = v_correlation
  where id = p_sale_id returning version into v_version;
  insert into app_private.sales_financial_events(
    sale_id, event_type, gross_sales, discount_total, net_revenue,
    cogs_delta, attributed_user_id, occurred_at, correlation_id
  ) values (
    p_sale_id, 'SALE_CANCELLED', 0, 0, -v_sale.net_total,
    -v_total_cogs, v_sale.created_by, now(), v_correlation
  );
  insert into api.user_notifications(user_id, severity, category, title, message, action_route, entity_type, entity_id, dedupe_key, correlation_id)
  select v_sale.created_by, 'WARNING', 'SALE', 'Hóa đơn đã bị hủy',
    'Hóa đơn ' || v_sale.sale_number || ' đã bị hủy.', '/sales/' || p_sale_id::text,
    'sale', p_sale_id, 'sale-cancel:' || p_sale_id::text, v_correlation
  where v_sale.created_by <> v_actor
  on conflict do nothing;
  insert into app_private.audit_events(actor_id, action, entity_type, entity_id, after_data, correlation_id)
  values (v_actor, 'sale.cancelled', 'sale', p_sale_id,
    jsonb_build_object('saleNumber', v_sale.sale_number, 'reason', v_reason), v_correlation);
  v_result := app_private.command_success(jsonb_build_object(
    'saleId', p_sale_id, 'status', 'CANCELLED', 'version', v_version
  ), v_correlation);
  insert into app_private.command_deduplication(actor_id, command_name, idempotency_key, response)
  values (v_actor, 'sale.cancel', p_idempotency_key, v_result);
  return v_result;
end;
$$;

create function app_private.list_sale_returns_impl(
  p_filters jsonb,
  p_cursor_updated_at timestamptz,
  p_cursor_id uuid,
  p_limit integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_correlation uuid := gen_random_uuid();
  v_can_complete boolean := app_private.has_permission('return.complete');
  v_items jsonb;
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
    limit p_limit
  ) page;
  return app_private.command_success(jsonb_build_object('items', v_items, 'nextCursor', null), v_correlation);
end;
$$;

create function app_private.get_sale_return_impl(p_return_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_correlation uuid := gen_random_uuid();
  v_return api.sale_returns%rowtype;
begin
  if v_actor is null or (not app_private.has_permission('return.request.create') and not app_private.has_permission('return.complete')) then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền xem yêu cầu trả hàng.', v_correlation);
  end if;
  select * into v_return from api.sale_returns where id = p_return_id;
  if not found or (v_return.created_by <> v_actor and not app_private.has_permission('return.complete')) then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền xem yêu cầu trả hàng này.', v_correlation);
  end if;
  return app_private.command_success(jsonb_build_object(
    'id', v_return.id, 'returnNumber', v_return.return_number,
    'saleId', v_return.original_sale_id,
    'saleNumber', (select sale_number from api.sales where id = v_return.original_sale_id),
    'status', v_return.status, 'reason', v_return.reason,
    'refundTotal', v_return.refund_total::text, 'version', v_return.version,
    'createdByName', (select display_name from api.profiles where id = v_return.created_by),
    'createdAt', v_return.created_at, 'completedAt', v_return.completed_at,
    'cancelReason', v_return.cancel_reason, 'canComplete', app_private.has_permission('return.complete'),
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
      'id', return_line.id, 'originalSaleLineId', return_line.original_sale_line_id,
      'productId', return_line.product_id, 'productName', return_line.product_name,
      'sku', return_line.sku, 'unitName', return_line.unit_name,
      'requestedQty', return_line.requested_qty::text,
      'acceptedQty', return_line.accepted_qty::text,
      'refundAmount', return_line.refund_amount::text,
      'soldQty', sale_line.quantity::text,
      'returnedQtyBefore', coalesce((select sum(previous_line.accepted_qty)
        from api.sale_return_lines previous_line
        join api.sale_returns previous_return on previous_return.id = previous_line.sale_return_id
        where previous_return.status = 'COMPLETED'
          and previous_line.original_sale_line_id = return_line.original_sale_line_id
          and previous_line.sale_return_id <> v_return.id), 0)::text
    ) order by return_line.line_order)
    from api.sale_return_lines return_line
    join api.sale_lines sale_line on sale_line.id = return_line.original_sale_line_id
    where return_line.sale_return_id = v_return.id), '[]'::jsonb)
  ), v_correlation);
end;
$$;

create function app_private.save_stock_count_impl(
  p_count_id uuid,
  p_expected_version bigint,
  p_note text,
  p_lines jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_correlation uuid := gen_random_uuid();
  v_note text := app_private.empty_to_null(p_note);
  v_count api.stock_counts%rowtype;
  v_id uuid := coalesce(p_count_id, gen_random_uuid());
  v_version bigint;
  v_cached jsonb;
  v_result jsonb;
begin
  if v_actor is null or not app_private.has_permission('inventory.count.draft') then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền lập phiếu kiểm kho.', v_correlation);
  end if;
  if p_idempotency_key is null or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) not between 1 and 5000
    or (v_note is not null and length(v_note) > 1000)
    or exists (
      select 1 from jsonb_array_elements(p_lines) item
      where jsonb_typeof(item) <> 'object'
        or item - array['productId', 'countedQty'] <> '{}'::jsonb
        or coalesce(item ->> 'productId', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        or (item ->> 'countedQty' is not null
          and ((item ->> 'countedQty') !~ '^(0|[1-9][0-9]*)(\\.[0-9]{1,3})?$'
            or (item ->> 'countedQty')::numeric < 0))
    ) or exists (
      select 1 from jsonb_array_elements(p_lines) item
      group by item ->> 'productId' having count(*) > 1
    ) then
    return app_private.command_error('VALIDATION_FAILED', 'Dòng hàng kiểm kho hoặc số đếm chưa hợp lệ.', v_correlation);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':stock.count.save:' || p_idempotency_key::text, 0));
  v_cached := app_private.cached_command_response(v_actor, 'stock.count.save', p_idempotency_key);
  if v_cached is not null then return v_cached; end if;
  if (select count(*) from api.products product
      where product.id in (select (item ->> 'productId')::uuid from jsonb_array_elements(p_lines) item))
      <> jsonb_array_length(p_lines) then
    return app_private.command_error('REFERENCE_NOT_FOUND', 'Có sản phẩm không còn tồn tại.', v_correlation);
  end if;
  if p_count_id is null then
    if p_expected_version is not null then
      return app_private.command_error('VALIDATION_FAILED', 'Phiếu kiểm kho mới không được có phiên bản cũ.', v_correlation);
    end if;
    insert into api.stock_counts(id, count_type, status, note, created_by, correlation_id)
    values (v_id, 'PERIODIC', 'DRAFT', v_note, v_actor, v_correlation)
    returning version into v_version;
  else
    select * into v_count from api.stock_counts where id = p_count_id for update;
    if not found or v_count.count_type <> 'PERIODIC' or v_count.status <> 'DRAFT' then
      return app_private.command_error('INVALID_STATE', 'Chỉ phiếu kiểm kho nháp mới được chỉnh sửa.', v_correlation);
    end if;
    if v_count.created_by <> v_actor and not app_private.has_permission('inventory.adjustment.post') then
      return app_private.command_error('PERMISSION_DENIED', 'Bạn chỉ được sửa phiếu kiểm kho do mình lập.', v_correlation);
    end if;
    if p_expected_version is null or v_count.version <> p_expected_version then
      return app_private.command_error_with_details('VERSION_CONFLICT', 'Phiếu kiểm kho đã được cập nhật. Vui lòng tải lại.', jsonb_build_object('currentVersion', v_count.version), v_correlation);
    end if;
    update api.stock_counts set note = v_note, version = version + 1, updated_at = now(), correlation_id = v_correlation
    where id = p_count_id returning version into v_version;
    delete from api.stock_count_lines where stock_count_id = p_count_id;
  end if;
  insert into api.stock_count_lines(
    stock_count_id, product_id, product_name, sku, unit_name,
    system_qty_snapshot, inventory_version_snapshot, counted_qty, difference_qty, line_order
  )
  select v_id, product.id, product.name, product.sku, product.unit_name,
    balance.on_hand_qty, balance.version,
    nullif(item.value ->> 'countedQty', '')::numeric,
    case when nullif(item.value ->> 'countedQty', '') is null then null
      else (item.value ->> 'countedQty')::numeric - balance.on_hand_qty end,
    item.ordinality::integer - 1
  from jsonb_array_elements(p_lines) with ordinality item(value, ordinality)
  join api.products product on product.id = (item.value ->> 'productId')::uuid
  join api.inventory_balances balance on balance.product_id = product.id
  order by item.ordinality;
  insert into app_private.audit_events(actor_id, action, entity_type, entity_id, after_data, correlation_id)
  values (v_actor, case when p_count_id is null then 'stock_count.created' else 'stock_count.updated' end,
    'stock_count', v_id, jsonb_build_object('countType', 'PERIODIC', 'lineCount', jsonb_array_length(p_lines)), v_correlation);
  v_result := app_private.command_success(jsonb_build_object('countId', v_id, 'status', 'DRAFT', 'version', v_version), v_correlation);
  insert into app_private.command_deduplication(actor_id, command_name, idempotency_key, response)
  values (v_actor, 'stock.count.save', p_idempotency_key, v_result);
  return v_result;
exception when invalid_text_representation or numeric_value_out_of_range then
  return app_private.command_error('VALIDATION_FAILED', 'Số đếm chưa đúng định dạng quốc tế.', v_correlation);
end;
$$;

create function app_private.submit_stock_count_impl(
  p_count_id uuid,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_correlation uuid := gen_random_uuid();
  v_count api.stock_counts%rowtype;
  v_cached jsonb;
  v_result jsonb;
  v_version bigint;
begin
  if v_actor is null or not app_private.has_permission('inventory.count.draft') then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền gửi phiếu kiểm kho.', v_correlation);
  end if;
  if p_count_id is null or p_expected_version is null or p_idempotency_key is null then
    return app_private.command_error('VALIDATION_FAILED', 'Thông tin gửi phiếu kiểm kho chưa hợp lệ.', v_correlation);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':stock.count.submit:' || p_idempotency_key::text, 0));
  v_cached := app_private.cached_command_response(v_actor, 'stock.count.submit', p_idempotency_key);
  if v_cached is not null then return v_cached; end if;
  select * into v_count from api.stock_counts where id = p_count_id for update;
  if not found or v_count.count_type <> 'PERIODIC' or v_count.status <> 'DRAFT' then
    return app_private.command_error('INVALID_STATE', 'Phiếu kiểm kho không còn ở trạng thái nháp.', v_correlation);
  end if;
  if v_count.created_by <> v_actor and not app_private.has_permission('inventory.adjustment.post') then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn chỉ được gửi phiếu kiểm kho do mình lập.', v_correlation);
  end if;
  if v_count.version <> p_expected_version then
    return app_private.command_error_with_details('VERSION_CONFLICT', 'Phiếu kiểm kho đã được cập nhật. Vui lòng tải lại.', jsonb_build_object('currentVersion', v_count.version), v_correlation);
  end if;
  if not exists (select 1 from api.stock_count_lines where stock_count_id = p_count_id)
    or exists (select 1 from api.stock_count_lines where stock_count_id = p_count_id and counted_qty is null) then
    return app_private.command_error('VALIDATION_FAILED', 'Vui lòng nhập số đếm cho tất cả sản phẩm trước khi gửi.', v_correlation);
  end if;
  update api.stock_counts
  set status = 'COUNTED', submitted_by = v_actor, submitted_at = now(), version = version + 1,
      updated_at = now(), correlation_id = v_correlation
  where id = p_count_id returning version into v_version;
  insert into api.user_notifications(user_id, severity, category, title, message, action_route, entity_type, entity_id, dedupe_key, correlation_id)
  select profile.id, 'INFO', 'INVENTORY', 'Có phiếu kiểm kho chờ ghi sổ',
    'Một phiếu kiểm kho đang chờ chủ cửa hàng duyệt.', '/stock-counts/' || p_count_id::text,
    'stock_count', p_count_id, 'stock-count-submitted:' || p_count_id::text, v_correlation
  from api.profiles profile where profile.is_active and profile.role_template = 'OWNER' and profile.id <> v_actor
  on conflict do nothing;
  v_result := app_private.command_success(jsonb_build_object('countId', p_count_id, 'status', 'COUNTED', 'version', v_version), v_correlation);
  insert into app_private.command_deduplication(actor_id, command_name, idempotency_key, response)
  values (v_actor, 'stock.count.submit', p_idempotency_key, v_result);
  return v_result;
end;
$$;

create function app_private.refresh_stock_count_snapshot_impl(
  p_count_id uuid,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_correlation uuid := gen_random_uuid();
  v_count api.stock_counts%rowtype;
  v_cached jsonb;
  v_result jsonb;
  v_version bigint;
begin
  if v_actor is null or not app_private.has_permission('inventory.count.draft') then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền cập nhật phiếu kiểm kho.', v_correlation);
  end if;
  if p_count_id is null or p_expected_version is null or p_idempotency_key is null then
    return app_private.command_error('VALIDATION_FAILED', 'Thông tin cập nhật phiếu kiểm kho chưa hợp lệ.', v_correlation);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':stock.count.refresh:' || p_idempotency_key::text, 0));
  v_cached := app_private.cached_command_response(v_actor, 'stock.count.refresh', p_idempotency_key);
  if v_cached is not null then return v_cached; end if;
  select * into v_count from api.stock_counts where id = p_count_id for update;
  if not found or v_count.count_type <> 'PERIODIC' or v_count.status not in ('DRAFT', 'COUNTED') then
    return app_private.command_error('INVALID_STATE', 'Phiếu kiểm kho này không thể cập nhật lại tồn hệ thống.', v_correlation);
  end if;
  if v_count.created_by <> v_actor and not app_private.has_permission('inventory.adjustment.post') then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn chỉ được cập nhật phiếu kiểm kho do mình lập.', v_correlation);
  end if;
  if v_count.version <> p_expected_version then
    return app_private.command_error_with_details('VERSION_CONFLICT', 'Phiếu kiểm kho đã được cập nhật. Vui lòng tải lại.', jsonb_build_object('currentVersion', v_count.version), v_correlation);
  end if;
  update api.stock_count_lines line
  set system_qty_snapshot = balance.on_hand_qty, inventory_version_snapshot = balance.version,
      counted_qty = null, difference_qty = null
  from api.inventory_balances balance
  where line.stock_count_id = p_count_id and balance.product_id = line.product_id;
  update api.stock_counts
  set status = 'DRAFT', submitted_by = null, submitted_at = null, version = version + 1,
      updated_at = now(), correlation_id = v_correlation
  where id = p_count_id returning version into v_version;
  v_result := app_private.command_success(jsonb_build_object('countId', p_count_id, 'status', 'DRAFT', 'version', v_version), v_correlation);
  insert into app_private.command_deduplication(actor_id, command_name, idempotency_key, response)
  values (v_actor, 'stock.count.refresh', p_idempotency_key, v_result);
  return v_result;
end;
$$;

create function app_private.cancel_stock_count_impl(
  p_count_id uuid,
  p_expected_version bigint,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_correlation uuid := gen_random_uuid();
  v_reason text := app_private.empty_to_null(p_reason);
  v_count api.stock_counts%rowtype;
  v_cached jsonb;
  v_result jsonb;
  v_version bigint;
begin
  if v_actor is null or not app_private.has_permission('inventory.count.draft') then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền hủy phiếu kiểm kho.', v_correlation);
  end if;
  if p_count_id is null or p_expected_version is null or p_idempotency_key is null
    or v_reason is null or length(v_reason) > 500 then
    return app_private.command_error('VALIDATION_FAILED', 'Vui lòng nhập lý do hủy phiếu kiểm kho.', v_correlation);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':stock.count.cancel:' || p_idempotency_key::text, 0));
  v_cached := app_private.cached_command_response(v_actor, 'stock.count.cancel', p_idempotency_key);
  if v_cached is not null then return v_cached; end if;
  select * into v_count from api.stock_counts where id = p_count_id for update;
  if not found or v_count.count_type <> 'PERIODIC' or v_count.status not in ('DRAFT', 'COUNTED') then
    return app_private.command_error('INVALID_STATE', 'Phiếu kiểm kho này không thể hủy.', v_correlation);
  end if;
  if v_count.created_by <> v_actor and not app_private.has_permission('inventory.adjustment.post') then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn chỉ được hủy phiếu kiểm kho do mình lập.', v_correlation);
  end if;
  if v_count.version <> p_expected_version then
    return app_private.command_error_with_details('VERSION_CONFLICT', 'Phiếu kiểm kho đã được cập nhật. Vui lòng tải lại.', jsonb_build_object('currentVersion', v_count.version), v_correlation);
  end if;
  update api.stock_counts
  set status = 'CANCELLED', cancelled_by = v_actor, cancelled_at = now(), cancel_reason = v_reason,
      version = version + 1, updated_at = now(), correlation_id = v_correlation
  where id = p_count_id returning version into v_version;
  insert into api.user_notifications(user_id, severity, category, title, message, action_route, entity_type, entity_id, dedupe_key, correlation_id)
  select v_count.created_by, 'INFO', 'INVENTORY', 'Phiếu kiểm kho đã hủy',
    'Phiếu kiểm kho của bạn đã được hủy.', '/stock-counts/' || p_count_id::text,
    'stock_count', p_count_id, 'stock-count-cancel:' || p_count_id::text, v_correlation
  where v_count.created_by <> v_actor
  on conflict do nothing;
  v_result := app_private.command_success(jsonb_build_object('countId', p_count_id, 'status', 'CANCELLED', 'version', v_version), v_correlation);
  insert into app_private.command_deduplication(actor_id, command_name, idempotency_key, response)
  values (v_actor, 'stock.count.cancel', p_idempotency_key, v_result);
  return v_result;
end;
$$;

create function app_private.post_stock_count_impl(
  p_count_id uuid,
  p_expected_version bigint,
  p_estimated_costs jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_correlation uuid := gen_random_uuid();
  v_count api.stock_counts%rowtype;
  v_cached jsonb;
  v_result jsonb;
  v_line record;
  v_estimate text;
  v_unit_cost numeric(20,6);
  v_value_delta numeric(20,2);
  v_new_qty numeric(18,3);
  v_new_value numeric(20,2);
  v_new_average numeric(20,6);
  v_movement_id uuid;
  v_number text;
  v_version bigint;
begin
  if v_actor is null or not app_private.has_permission('inventory.adjustment.post') then
    return app_private.command_error('PERMISSION_DENIED', 'Chỉ chủ cửa hàng được ghi sổ kiểm kho.', v_correlation);
  end if;
  if p_count_id is null or p_expected_version is null or p_idempotency_key is null
    or jsonb_typeof(coalesce(p_estimated_costs, '[]'::jsonb)) <> 'array'
    or exists (
      select 1 from jsonb_array_elements(coalesce(p_estimated_costs, '[]'::jsonb)) item
      where jsonb_typeof(item) <> 'object'
        or item - array['stockCountLineId', 'estimatedUnitCost'] <> '{}'::jsonb
        or coalesce(item ->> 'stockCountLineId', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        or coalesce(item ->> 'estimatedUnitCost', '') !~ '^(0|[1-9][0-9]*)(\\.[0-9]{1,6})?$'
        or (item ->> 'estimatedUnitCost')::numeric < 0
    ) or exists (
      select 1 from jsonb_array_elements(coalesce(p_estimated_costs, '[]'::jsonb)) item
      group by item ->> 'stockCountLineId' having count(*) > 1
    ) then
    return app_private.command_error('VALIDATION_FAILED', 'Đơn giá vốn ước tính chưa đúng định dạng quốc tế.', v_correlation);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':stock.count.post:' || p_idempotency_key::text, 0));
  v_cached := app_private.cached_command_response(v_actor, 'stock.count.post', p_idempotency_key);
  if v_cached is not null then return v_cached; end if;
  select * into v_count from api.stock_counts where id = p_count_id for update;
  if not found or v_count.count_type <> 'PERIODIC' or v_count.status <> 'COUNTED' then
    return app_private.command_error('INVALID_STATE', 'Phiếu kiểm kho chưa được xác nhận để ghi sổ.', v_correlation);
  end if;
  if v_count.version <> p_expected_version then
    return app_private.command_error_with_details('VERSION_CONFLICT', 'Phiếu kiểm kho đã được cập nhật. Vui lòng tải lại.', jsonb_build_object('currentVersion', v_count.version), v_correlation);
  end if;
  perform 1 from api.inventory_balances balance
  join api.stock_count_lines line on line.product_id = balance.product_id
  where line.stock_count_id = p_count_id order by balance.product_id for update of balance;
  perform 1 from app_private.inventory_cost_balances balance
  join api.stock_count_lines line on line.product_id = balance.product_id
  where line.stock_count_id = p_count_id order by balance.product_id for update of balance;
  if exists (
    select 1 from api.stock_count_lines line
    join api.inventory_balances balance on balance.product_id = line.product_id
    where line.stock_count_id = p_count_id
      and (line.counted_qty is null or line.inventory_version_snapshot <> balance.version)
  ) then
    return app_private.command_error_with_details(
      'STALE_STOCK_COUNT', 'Tồn kho đã thay đổi. Vui lòng kiểm tra và đếm lại.',
      jsonb_build_object('productIds', coalesce((select jsonb_agg(line.product_id)
        from api.stock_count_lines line join api.inventory_balances balance on balance.product_id = line.product_id
        where line.stock_count_id = p_count_id
          and (line.counted_qty is null or line.inventory_version_snapshot <> balance.version)), '[]'::jsonb)),
      v_correlation
    );
  end if;
  for v_line in
    select line.*, quantity_balance.on_hand_qty, cost_balance.inventory_value, cost_balance.avg_unit_cost
    from api.stock_count_lines line
    join api.inventory_balances quantity_balance on quantity_balance.product_id = line.product_id
    join app_private.inventory_cost_balances cost_balance on cost_balance.product_id = line.product_id
    where line.stock_count_id = p_count_id order by line.product_id
  loop
    if v_line.difference_qty = 0 then continue; end if;
    v_new_qty := v_line.counted_qty;
    if v_line.difference_qty > 0 and v_line.on_hand_qty = 0 and v_line.inventory_value = 0 then
      select item ->> 'estimatedUnitCost' into v_estimate
      from jsonb_array_elements(coalesce(p_estimated_costs, '[]'::jsonb)) item
      where (item ->> 'stockCountLineId')::uuid = v_line.id;
      if v_estimate is null then
        return app_private.command_error('VALIDATION_FAILED', 'Vui lòng nhập đơn giá vốn ước tính cho phần tồn tăng từ 0.', v_correlation);
      end if;
      v_unit_cost := v_estimate::numeric;
      v_value_delta := round(v_line.difference_qty * v_unit_cost, 2);
      insert into app_private.stock_count_adjustment_costs(
        stock_count_line_id, applied_unit_cost, inventory_value_delta, source, entered_by
      ) values (v_line.id, v_unit_cost, v_value_delta, 'OWNER_ESTIMATE', v_actor);
    else
      v_unit_cost := v_line.avg_unit_cost;
      if v_new_qty = 0 then v_value_delta := -v_line.inventory_value;
      else v_value_delta := round(v_line.difference_qty * v_unit_cost, 2); end if;
      insert into app_private.stock_count_adjustment_costs(
        stock_count_line_id, applied_unit_cost, inventory_value_delta, source, entered_by
      ) values (v_line.id, v_unit_cost, v_value_delta, 'CURRENT_AVERAGE', v_actor);
    end if;
    if v_new_qty = 0 then
      v_new_value := 0;
      v_new_average := 0;
    else
      v_new_value := greatest(round(v_line.inventory_value + v_value_delta, 2), 0);
      v_new_average := round(v_new_value / v_new_qty, 6);
    end if;
    update api.inventory_balances set on_hand_qty = v_new_qty, version = version + 1, updated_at = now()
    where product_id = v_line.product_id;
    update app_private.inventory_cost_balances
    set inventory_value = v_new_value, avg_unit_cost = v_new_average, version = version + 1, updated_at = now()
    where product_id = v_line.product_id;
    insert into api.stock_movements(product_id, movement_type, quantity_delta, quantity_after, reference_type, reference_id, occurred_at, actor_id, note, correlation_id)
    values (v_line.product_id, 'STOCK_ADJUSTMENT', v_line.difference_qty, v_new_qty,
      'STOCK_COUNT', p_count_id, now(), v_actor, 'Điều chỉnh từ kiểm kho', v_correlation)
    returning id into v_movement_id;
    insert into app_private.inventory_cost_movements(stock_movement_id, inventory_value_delta, cogs_delta, inventory_value_after, avg_unit_cost_after, occurred_at)
    values (v_movement_id, v_value_delta, 0, v_new_value, v_new_average, now());
  end loop;
  v_number := app_private.next_document_number_impl('STOCK_COUNT');
  update api.stock_counts
  set count_number = v_number, status = 'POSTED', posted_by = v_actor, posted_at = now(),
      version = version + 1, updated_at = now(), correlation_id = v_correlation
  where id = p_count_id returning version into v_version;
  insert into api.user_notifications(user_id, severity, category, title, message, action_route, entity_type, entity_id, dedupe_key, correlation_id)
  select v_count.created_by, 'SUCCESS', 'INVENTORY', 'Phiếu kiểm kho đã ghi sổ',
    'Phiếu ' || v_number || ' đã được ghi sổ.', '/stock-counts/' || p_count_id::text,
    'stock_count', p_count_id, 'stock-count-post:' || p_count_id::text, v_correlation
  where v_count.created_by <> v_actor
  on conflict do nothing;
  insert into app_private.audit_events(actor_id, action, entity_type, entity_id, after_data, correlation_id)
  values (v_actor, 'stock_count.posted', 'stock_count', p_count_id,
    jsonb_build_object('countNumber', v_number), v_correlation);
  v_result := app_private.command_success(jsonb_build_object('countId', p_count_id, 'countNumber', v_number, 'status', 'POSTED', 'version', v_version), v_correlation);
  insert into app_private.command_deduplication(actor_id, command_name, idempotency_key, response)
  values (v_actor, 'stock.count.post', p_idempotency_key, v_result);
  return v_result;
exception when invalid_text_representation or numeric_value_out_of_range then
  return app_private.command_error('VALIDATION_FAILED', 'Dữ liệu kiểm kho chưa đúng định dạng quốc tế.', v_correlation);
end;
$$;

create function app_private.list_stock_counts_impl(
  p_filters jsonb,
  p_cursor_updated_at timestamptz,
  p_cursor_id uuid,
  p_limit integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_correlation uuid := gen_random_uuid();
  v_owner boolean := app_private.has_permission('inventory.adjustment.post');
  v_items jsonb;
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
    order by count_document.updated_at desc, count_document.id desc limit p_limit
  ) page;
  return app_private.command_success(jsonb_build_object('items', v_items, 'nextCursor', null), v_correlation);
end;
$$;

create function app_private.get_stock_count_impl(p_count_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_correlation uuid := gen_random_uuid();
  v_count api.stock_counts%rowtype;
begin
  if v_actor is null or not app_private.has_permission('inventory.count.draft') then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền xem phiếu kiểm kho.', v_correlation);
  end if;
  select * into v_count from api.stock_counts where id = p_count_id;
  if not found or v_count.count_type <> 'PERIODIC'
    or (v_count.created_by <> v_actor and not app_private.has_permission('inventory.adjustment.post')) then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền xem phiếu kiểm kho này.', v_correlation);
  end if;
  return app_private.command_success(jsonb_build_object(
    'id', v_count.id, 'countNumber', v_count.count_number, 'status', v_count.status,
    'note', v_count.note, 'version', v_count.version,
    'createdByName', (select display_name from api.profiles where id = v_count.created_by),
    'createdAt', v_count.created_at, 'submittedAt', v_count.submitted_at,
    'postedAt', v_count.posted_at, 'cancelReason', v_count.cancel_reason,
    'canPost', app_private.has_permission('inventory.adjustment.post'),
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
      'id', line.id, 'productId', line.product_id, 'productName', line.product_name,
      'sku', line.sku, 'unitName', line.unit_name,
      'systemQtySnapshot', line.system_qty_snapshot::text,
      'inventoryVersionSnapshot', line.inventory_version_snapshot,
      'countedQty', line.counted_qty::text,
      'differenceQty', line.difference_qty::text, 'lineOrder', line.line_order,
      'requiresEstimatedCost', line.difference_qty > 0 and balance.on_hand_qty = 0
        and cost_balance.inventory_value = 0
    ) order by line.line_order)
    from api.stock_count_lines line
    join api.inventory_balances balance on balance.product_id = line.product_id
    join app_private.inventory_cost_balances cost_balance on cost_balance.product_id = line.product_id
    where line.stock_count_id = v_count.id), '[]'::jsonb)
  ), v_correlation);
end;
$$;

create function api.lookup_sale_for_return(p_full_sale_number text)
returns jsonb language sql security invoker set search_path = ''
as $$ select app_private.lookup_sale_for_return_impl(p_full_sale_number); $$;
create function api.create_sale_return_request(p_original_sale_id uuid, p_reason text, p_lines jsonb, p_idempotency_key uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select app_private.create_sale_return_request_impl(p_original_sale_id, p_reason, p_lines, p_idempotency_key); $$;
create function api.cancel_sale_return(p_return_id uuid, p_expected_version bigint, p_reason text, p_idempotency_key uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select app_private.cancel_sale_return_impl(p_return_id, p_expected_version, p_reason, p_idempotency_key); $$;
create function api.complete_sale_return(p_return_id uuid, p_expected_version bigint, p_lines jsonb, p_refund_method text, p_idempotency_key uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select app_private.complete_sale_return_impl(p_return_id, p_expected_version, p_lines, p_refund_method, p_idempotency_key); $$;
create function api.list_sale_returns(p_filters jsonb default '{}'::jsonb, p_cursor_updated_at timestamptz default null, p_cursor_id uuid default null, p_limit integer default 30)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select app_private.list_sale_returns_impl(p_filters, p_cursor_updated_at, p_cursor_id, p_limit); $$;
create function api.get_sale_return(p_return_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select app_private.get_sale_return_impl(p_return_id); $$;
create function api.cancel_sale(p_sale_id uuid, p_expected_version bigint, p_reason text, p_idempotency_key uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select app_private.cancel_sale_impl(p_sale_id, p_expected_version, p_reason, p_idempotency_key); $$;
create function api.save_stock_count(p_count_id uuid, p_expected_version bigint, p_note text, p_lines jsonb, p_idempotency_key uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select app_private.save_stock_count_impl(p_count_id, p_expected_version, p_note, p_lines, p_idempotency_key); $$;
create function api.submit_stock_count(p_count_id uuid, p_expected_version bigint, p_idempotency_key uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select app_private.submit_stock_count_impl(p_count_id, p_expected_version, p_idempotency_key); $$;
create function api.refresh_stock_count_snapshot(p_count_id uuid, p_expected_version bigint, p_idempotency_key uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select app_private.refresh_stock_count_snapshot_impl(p_count_id, p_expected_version, p_idempotency_key); $$;
create function api.cancel_stock_count(p_count_id uuid, p_expected_version bigint, p_reason text, p_idempotency_key uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select app_private.cancel_stock_count_impl(p_count_id, p_expected_version, p_reason, p_idempotency_key); $$;
create function api.post_stock_count(p_count_id uuid, p_expected_version bigint, p_estimated_costs jsonb, p_idempotency_key uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select app_private.post_stock_count_impl(p_count_id, p_expected_version, p_estimated_costs, p_idempotency_key); $$;
create function api.list_stock_counts(p_filters jsonb default '{}'::jsonb, p_cursor_updated_at timestamptz default null, p_cursor_id uuid default null, p_limit integer default 30)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select app_private.list_stock_counts_impl(p_filters, p_cursor_updated_at, p_cursor_id, p_limit); $$;
create function api.get_stock_count(p_count_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select app_private.get_stock_count_impl(p_count_id); $$;

revoke all on function
  api.lookup_sale_for_return(text),
  api.create_sale_return_request(uuid,text,jsonb,uuid),
  api.cancel_sale_return(uuid,bigint,text,uuid),
  api.complete_sale_return(uuid,bigint,jsonb,text,uuid),
  api.list_sale_returns(jsonb,timestamptz,uuid,integer),
  api.get_sale_return(uuid), api.cancel_sale(uuid,bigint,text,uuid),
  api.save_stock_count(uuid,bigint,text,jsonb,uuid),
  api.submit_stock_count(uuid,bigint,uuid),
  api.refresh_stock_count_snapshot(uuid,bigint,uuid),
  api.cancel_stock_count(uuid,bigint,text,uuid),
  api.post_stock_count(uuid,bigint,jsonb,uuid),
  api.list_stock_counts(jsonb,timestamptz,uuid,integer),
  api.get_stock_count(uuid)
from public, anon;
grant execute on function
  api.lookup_sale_for_return(text),
  api.create_sale_return_request(uuid,text,jsonb,uuid),
  api.cancel_sale_return(uuid,bigint,text,uuid),
  api.complete_sale_return(uuid,bigint,jsonb,text,uuid),
  api.list_sale_returns(jsonb,timestamptz,uuid,integer),
  api.get_sale_return(uuid), api.cancel_sale(uuid,bigint,text,uuid),
  api.save_stock_count(uuid,bigint,text,jsonb,uuid),
  api.submit_stock_count(uuid,bigint,uuid),
  api.refresh_stock_count_snapshot(uuid,bigint,uuid),
  api.cancel_stock_count(uuid,bigint,text,uuid),
  api.post_stock_count(uuid,bigint,jsonb,uuid),
  api.list_stock_counts(jsonb,timestamptz,uuid,integer),
  api.get_stock_count(uuid)
to authenticated;
