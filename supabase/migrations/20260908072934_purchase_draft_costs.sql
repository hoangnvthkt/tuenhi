begin;

create table app_private.purchase_receipt_draft_line_costs (
  purchase_receipt_line_id uuid primary key
    references api.purchase_receipt_lines(id) on delete cascade,
  unit_cost numeric(18,2) not null check (unit_cost > 0),
  line_cost numeric(20,2) not null check (line_cost > 0),
  entered_by uuid not null references api.profiles(id) on delete restrict,
  updated_at timestamptz not null default now()
);

alter table app_private.purchase_receipt_draft_line_costs enable row level security;
alter table app_private.purchase_receipt_draft_line_costs force row level security;
revoke all on table app_private.purchase_receipt_draft_line_costs
  from public, anon, authenticated;
grant all on table app_private.purchase_receipt_draft_line_costs to service_role;

update app_private.permission_definitions
set owner_only = false
where code = 'purchase.cost.enter';

update app_private.role_default_permissions cost_entry
set allowed = true
where cost_entry.permission_code = 'purchase.cost.enter'
  and exists (
    select 1
    from app_private.role_default_permissions draft
    where draft.role_template = cost_entry.role_template
      and draft.permission_code = 'purchase.draft.manage'
      and draft.allowed
  );

create or replace function app_private.save_purchase_receipt_draft_impl(
  p_receipt_id uuid,
  p_expected_version bigint,
  p_supplier_id uuid,
  p_received_at timestamptz,
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
  v_actor_id uuid := (select auth.uid());
  v_correlation_id uuid := gen_random_uuid();
  v_id uuid := coalesce(p_receipt_id, gen_random_uuid());
  v_note text := app_private.empty_to_null(p_note);
  v_receipt api.purchase_receipts%rowtype;
  v_version bigint;
  v_cached jsonb;
  v_result jsonb;
begin
  if v_actor_id is null
    or not app_private.has_permission('purchase.draft.manage')
    or not app_private.has_permission('purchase.cost.enter')
  then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Bạn không có quyền lập phiếu nhập có giá.',
      v_correlation_id
    );
  end if;
  if p_idempotency_key is null or p_received_at is null
    or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) not between 1 and 200
    or (v_note is not null and length(v_note) > 1000)
  then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Thông tin phiếu nhập chưa hợp lệ.', v_correlation_id
    );
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) item
    where jsonb_typeof(item) <> 'object'
      or item - array['productId', 'receivedQty', 'unitCost'] <> '{}'::jsonb
      or coalesce(item ->> 'productId', '')
        !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      or coalesce(item ->> 'receivedQty', '')
        !~ '^(0|[1-9][0-9]*)(\\.[0-9]{1,3})?$'
      or coalesce(item ->> 'unitCost', '')
        !~ '^(0|[1-9][0-9]*)(\\.[0-9]{1,2})?$'
      or (item ->> 'receivedQty')::numeric <= 0
      or (item ->> 'unitCost')::numeric <= 0
  ) or exists (
    select 1 from jsonb_array_elements(p_lines) item
    group by item ->> 'productId' having count(*) > 1
  ) then
    return app_private.command_error(
      'VALIDATION_FAILED',
      'Mỗi sản phẩm phải có số lượng và đơn giá nhập lớn hơn 0, đúng định dạng.',
      v_correlation_id
    );
  end if;
  if p_supplier_id is not null and not exists (
    select 1 from api.suppliers s where s.id = p_supplier_id and s.is_active
  ) then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND', 'Nhà cung cấp không tồn tại hoặc đã ngừng hoạt động.',
      v_correlation_id
    );
  end if;
  if (
    select count(*) from api.products p
    where p.id in (
      select (item ->> 'productId')::uuid from jsonb_array_elements(p_lines) item
    ) and p.is_active
  ) <> jsonb_array_length(p_lines) then
    return app_private.command_error(
      'REFERENCE_INACTIVE', 'Có sản phẩm không tồn tại hoặc đã ngừng hoạt động.',
      v_correlation_id
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    v_actor_id::text || ':purchase.save:' || p_idempotency_key::text, 0
  ));
  v_cached := app_private.cached_command_response(
    v_actor_id, 'purchase.save', p_idempotency_key
  );
  if v_cached is not null then return v_cached; end if;

  if p_receipt_id is null then
    if p_expected_version is not null then
      return app_private.command_error(
        'VALIDATION_FAILED', 'Phiếu nhập mới không được có phiên bản cũ.',
        v_correlation_id
      );
    end if;
    insert into api.purchase_receipts(
      id, supplier_id, received_at, note, created_by, correlation_id
    ) values (
      v_id, p_supplier_id, p_received_at, v_note, v_actor_id, v_correlation_id
    ) returning version into v_version;
  else
    select r.* into v_receipt from api.purchase_receipts r
    where r.id = p_receipt_id for update;
    if not found then
      return app_private.command_error(
        'REFERENCE_NOT_FOUND', 'Không tìm thấy phiếu nhập.', v_correlation_id
      );
    end if;
    if v_receipt.status <> 'DRAFT' then
      return app_private.command_error(
        'INVALID_STATE', 'Chỉ phiếu nhập nháp mới được chỉnh sửa.', v_correlation_id
      );
    end if;
    if v_receipt.created_by <> v_actor_id
      and not (
        app_private.has_permission('purchase.post')
        and app_private.has_permission('purchase.cost.read')
      )
    then
      return app_private.command_error(
        'PERMISSION_DENIED', 'Bạn không có quyền sửa giá của phiếu nhập này.',
        v_correlation_id
      );
    end if;
    if p_expected_version is null or p_expected_version <> v_receipt.version then
      return app_private.command_error_with_details(
        'VERSION_CONFLICT', 'Phiếu nhập đã được cập nhật. Vui lòng tải lại dữ liệu.',
        jsonb_build_object('currentVersion', v_receipt.version), v_correlation_id
      );
    end if;
    update api.purchase_receipts
    set supplier_id = p_supplier_id, received_at = p_received_at,
        note = v_note, version = version + 1, updated_at = now()
    where id = v_id returning version into v_version;
    delete from api.purchase_receipt_lines where purchase_receipt_id = v_id;
  end if;

  insert into api.purchase_receipt_lines(
    purchase_receipt_id, product_id, product_name, sku, unit_name,
    received_qty, line_order
  )
  select v_id, p.id, p.name, p.sku, p.unit_name,
    (item.value ->> 'receivedQty')::numeric, item.ordinality::integer - 1
  from jsonb_array_elements(p_lines) with ordinality item(value, ordinality)
  join api.products p on p.id = (item.value ->> 'productId')::uuid
  order by item.ordinality;

  insert into app_private.purchase_receipt_draft_line_costs(
    purchase_receipt_line_id, unit_cost, line_cost, entered_by
  )
  select line.id, (item.value ->> 'unitCost')::numeric,
    round(line.received_qty * (item.value ->> 'unitCost')::numeric, 2),
    v_actor_id
  from jsonb_array_elements(p_lines) with ordinality item(value, ordinality)
  join api.purchase_receipt_lines line
    on line.purchase_receipt_id = v_id
    and line.line_order = item.ordinality::integer - 1;

  insert into app_private.audit_events(
    actor_id, action, entity_type, entity_id, after_data, correlation_id
  ) values (
    v_actor_id,
    case when p_receipt_id is null then 'purchase_receipt.created'
      else 'purchase_receipt.updated' end,
    'purchase_receipt', v_id,
    jsonb_build_object(
      'status', 'DRAFT', 'lineCount', jsonb_array_length(p_lines),
      'supplierId', p_supplier_id, 'version', v_version
    ), v_correlation_id
  );
  v_result := app_private.command_success(
    jsonb_build_object('receiptId', v_id, 'status', 'DRAFT', 'version', v_version),
    v_correlation_id
  );
  insert into app_private.command_deduplication(
    actor_id, command_name, idempotency_key, response
  ) values (v_actor_id, 'purchase.save', p_idempotency_key, v_result);
  return v_result;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Số lượng hoặc đơn giá nhập chưa đúng định dạng quốc tế.',
      v_correlation_id
    );
end;
$$;

create or replace function app_private.get_purchase_receipt_cost_detail_impl(
  p_receipt_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_correlation_id uuid := gen_random_uuid();
  v_receipt api.purchase_receipts%rowtype;
  v_can_read_all boolean := app_private.has_permission('purchase.cost.read');
  v_data jsonb;
begin
  select r.* into v_receipt from api.purchase_receipts r where r.id = p_receipt_id;
  if not found then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND', 'Không tìm thấy phiếu nhập.', v_correlation_id
    );
  end if;
  if not v_can_read_all and not (
    v_receipt.status = 'DRAFT'
    and v_receipt.created_by = v_actor_id
    and app_private.has_permission('purchase.draft.manage')
    and app_private.has_permission('purchase.cost.enter')
  ) then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Bạn không có quyền xem giá nhập của phiếu này.',
      v_correlation_id
    );
  end if;
  select jsonb_build_object(
    'receiptId', r.id, 'receiptNumber', r.receipt_number, 'status', r.status,
    'totalCost', coalesce(sum(coalesce(final_cost.line_cost, draft_cost.line_cost)), 0)::text,
    'lines', coalesce(jsonb_agg(jsonb_build_object(
      'lineId', line.id,
      'unitCost', coalesce(final_cost.unit_cost, draft_cost.unit_cost)::text,
      'lineCost', coalesce(final_cost.line_cost, draft_cost.line_cost)::text
    ) order by line.line_order) filter (where line.id is not null), '[]'::jsonb)
  ) into v_data
  from api.purchase_receipts r
  left join api.purchase_receipt_lines line on line.purchase_receipt_id = r.id
  left join app_private.purchase_receipt_line_costs final_cost
    on final_cost.purchase_receipt_line_id = line.id
  left join app_private.purchase_receipt_draft_line_costs draft_cost
    on draft_cost.purchase_receipt_line_id = line.id
  where r.id = p_receipt_id
  group by r.id, r.receipt_number, r.status;
  return app_private.command_success(v_data, v_correlation_id);
end;
$$;

create or replace function app_private.post_purchase_receipt_dispatch_impl(
  p_receipt_id uuid,
  p_expected_version bigint,
  p_cost_lines jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_correlation_id uuid := gen_random_uuid();
  v_receipt api.purchase_receipts%rowtype;
  v_cached jsonb;
  v_cost_lines jsonb;
  v_result jsonb;
begin
  if v_actor_id is null or p_receipt_id is null or p_expected_version is null
    or p_idempotency_key is null or jsonb_typeof(p_cost_lines) <> 'array'
  then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Thông tin ghi sổ phiếu nhập chưa hợp lệ.', v_correlation_id
    );
  end if;
  v_cached := app_private.cached_command_response(
    v_actor_id, 'purchase.post', p_idempotency_key
  );
  if v_cached is not null then return v_cached; end if;
  select r.* into v_receipt from api.purchase_receipts r
  where r.id = p_receipt_id for update;
  if not found then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND', 'Không tìm thấy phiếu nhập.', v_correlation_id
    );
  end if;
  if v_receipt.status <> 'DRAFT' then
    return app_private.post_purchase_receipt_impl(
      p_receipt_id, p_expected_version, p_cost_lines, p_idempotency_key
    );
  end if;
  if jsonb_array_length(p_cost_lines) <> 0 then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Đơn giá phải được lưu trong phiếu nháp trước khi ghi sổ.',
      v_correlation_id
    );
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'lineId', line.id, 'unitCost', draft_cost.unit_cost::text
  ) order by line.line_order), '[]'::jsonb) into v_cost_lines
  from api.purchase_receipt_lines line
  join app_private.purchase_receipt_draft_line_costs draft_cost
    on draft_cost.purchase_receipt_line_id = line.id
  where line.purchase_receipt_id = p_receipt_id;
  if jsonb_array_length(v_cost_lines) <> (
    select count(*) from api.purchase_receipt_lines line
    where line.purchase_receipt_id = p_receipt_id
  ) then
    return app_private.command_error(
      'COST_LINES_REQUIRED', 'Vui lòng nhập đơn giá cho tất cả sản phẩm trong phiếu.',
      v_correlation_id
    );
  end if;
  update api.purchase_receipts set status = 'AWAITING_COST'
  where id = p_receipt_id;
  v_result := app_private.post_purchase_receipt_impl(
    p_receipt_id, p_expected_version, v_cost_lines, p_idempotency_key
  );
  if not coalesce((v_result ->> 'ok')::boolean, false) then
    update api.purchase_receipts set status = 'DRAFT'
    where id = p_receipt_id and status = 'AWAITING_COST';
  end if;
  return v_result;
end;
$$;

create or replace function api.post_purchase_receipt(
  p_receipt_id uuid,
  p_expected_version bigint,
  p_cost_lines jsonb,
  p_idempotency_key uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.post_purchase_receipt_dispatch_impl(
    p_receipt_id, p_expected_version, p_cost_lines, p_idempotency_key
  );
$$;

create or replace function app_private.resolve_purchase_receipt_products_impl(
  p_skus text[]
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
  if not app_private.has_permission('purchase.draft.manage') then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Bạn không có quyền tra cứu hàng hóa cho phiếu nhập.',
      v_correlation_id
    );
  end if;
  if p_skus is null or cardinality(p_skus) not between 1 and 5000
    or exists (select 1 from unnest(p_skus) sku where normalize(btrim(sku), NFC) = '')
  then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Danh sách SKU cần từ 1 đến 5.000 giá trị hợp lệ.',
      v_correlation_id
    );
  end if;
  select jsonb_agg(jsonb_build_object(
    'requestedSku', request_norm.sku,
    'productId', product.id,
    'sku', product.sku,
    'productName', product.name,
    'unitName', product.unit_name,
    'isActive', coalesce(product.is_active, false)
  ) order by request.ordinality) into v_data
  from unnest(p_skus) with ordinality request(raw_sku, ordinality)
  cross join lateral (select normalize(btrim(request.raw_sku), NFC) as sku) request_norm
  left join api.products product on product.sku = request_norm.sku;
  return app_private.command_success(coalesce(v_data, '[]'::jsonb), v_correlation_id);
end;
$$;

create or replace function api.resolve_purchase_receipt_products(p_skus text[])
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.resolve_purchase_receipt_products_impl(p_skus);
$$;

revoke all on function app_private.save_purchase_receipt_draft_impl(
  uuid, bigint, uuid, timestamptz, text, jsonb, uuid
) from public, anon;
revoke all on function app_private.get_purchase_receipt_cost_detail_impl(uuid)
  from public, anon;
revoke all on function app_private.post_purchase_receipt_dispatch_impl(
  uuid, bigint, jsonb, uuid
) from public, anon;
revoke all on function app_private.resolve_purchase_receipt_products_impl(text[])
  from public, anon;
revoke all on function api.resolve_purchase_receipt_products(text[])
  from public, anon;
revoke all on function api.post_purchase_receipt(uuid, bigint, jsonb, uuid)
  from public, anon;
grant execute on function app_private.save_purchase_receipt_draft_impl(
  uuid, bigint, uuid, timestamptz, text, jsonb, uuid
) to authenticated;
grant execute on function app_private.get_purchase_receipt_cost_detail_impl(uuid)
  to authenticated;
grant execute on function app_private.post_purchase_receipt_dispatch_impl(
  uuid, bigint, jsonb, uuid
) to authenticated;
grant execute on function app_private.resolve_purchase_receipt_products_impl(text[])
  to authenticated;
grant execute on function api.save_purchase_receipt_draft(
  uuid, bigint, uuid, timestamptz, text, jsonb, uuid
) to authenticated;
grant execute on function api.get_purchase_receipt_cost_detail(uuid)
  to authenticated;
grant execute on function api.post_purchase_receipt(uuid, bigint, jsonb, uuid)
  to authenticated;
grant execute on function api.resolve_purchase_receipt_products(text[])
  to authenticated;

commit;
