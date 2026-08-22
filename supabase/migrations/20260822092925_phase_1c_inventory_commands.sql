create function app_private.next_document_number_impl(p_document_type text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix text;
  v_value bigint;
begin
  update app_private.document_sequences
  set last_value = last_value + 1, updated_at = now()
  where document_type = p_document_type
  returning prefix, last_value into v_prefix, v_value;
  if not found then
    raise exception 'Unsupported document type';
  end if;
  return v_prefix || lpad(v_value::text, 6, '0');
end;
$$;

create function app_private.save_purchase_receipt_draft_impl(
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
  then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Bạn không có quyền lập phiếu nhập.',
      v_correlation_id
    );
  end if;
  if p_idempotency_key is null or p_received_at is null
    or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) not between 1 and 200
    or (v_note is not null and length(v_note) > 1000)
  then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Thông tin phiếu nhập chưa hợp lệ.',
      v_correlation_id
    );
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) item
    where jsonb_typeof(item) <> 'object'
      or item - array['productId', 'receivedQty'] <> '{}'::jsonb
      or coalesce(item ->> 'productId', '')
        !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      or coalesce(item ->> 'receivedQty', '')
        !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,3})?$'
      or (item ->> 'receivedQty')::numeric <= 0
  ) or exists (
    select 1 from jsonb_array_elements(p_lines) item
    group by item ->> 'productId' having count(*) > 1
  ) then
    return app_private.command_error(
      'VALIDATION_FAILED',
      'Mỗi sản phẩm phải có một số lượng nhập hợp lệ và chỉ xuất hiện một lần.',
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
        'INVALID_STATE', 'Chỉ phiếu nhập nháp mới được chỉnh sửa.',
        v_correlation_id
      );
    end if;
    if v_receipt.created_by <> v_actor_id
      and not app_private.has_permission('purchase.post')
    then
      return app_private.command_error(
        'PERMISSION_DENIED', 'Bạn không có quyền sửa phiếu nhập này.',
        v_correlation_id
      );
    end if;
    if p_expected_version is null or p_expected_version <> v_receipt.version then
      return app_private.command_error_with_details(
        'VERSION_CONFLICT',
        'Phiếu nhập đã được cập nhật. Vui lòng tải lại dữ liệu.',
        jsonb_build_object('currentVersion', v_receipt.version),
        v_correlation_id
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

  insert into app_private.audit_events(
    actor_id, action, entity_type, entity_id, after_data, correlation_id
  ) values (
    v_actor_id,
    case when p_receipt_id is null
      then 'purchase_receipt.created' else 'purchase_receipt.updated' end,
    'purchase_receipt', v_id,
    jsonb_build_object(
      'status', 'DRAFT', 'lineCount', jsonb_array_length(p_lines),
      'supplierId', p_supplier_id, 'version', v_version
    ),
    v_correlation_id
  );
  v_result := app_private.command_success(
    jsonb_build_object(
      'receiptId', v_id, 'status', 'DRAFT', 'version', v_version
    ),
    v_correlation_id
  );
  insert into app_private.command_deduplication(
    actor_id, command_name, idempotency_key, response
  ) values (v_actor_id, 'purchase.save', p_idempotency_key, v_result);
  return v_result;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Số lượng nhập chưa đúng định dạng quốc tế.',
      v_correlation_id
    );
end;
$$;

create function api.save_purchase_receipt_draft(
  p_receipt_id uuid,
  p_expected_version bigint,
  p_supplier_id uuid,
  p_received_at timestamptz,
  p_note text,
  p_lines jsonb,
  p_idempotency_key uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.save_purchase_receipt_draft_impl(
    p_receipt_id, p_expected_version, p_supplier_id, p_received_at,
    p_note, p_lines, p_idempotency_key
  );
$$;

create function app_private.submit_purchase_receipt_impl(
  p_receipt_id uuid,
  p_expected_version bigint,
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
  v_result jsonb;
  v_version bigint;
begin
  if v_actor_id is null
    or not app_private.has_permission('purchase.draft.manage')
  then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Bạn không có quyền gửi phiếu nhập.',
      v_correlation_id
    );
  end if;
  if p_receipt_id is null or p_expected_version is null
    or p_idempotency_key is null
  then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Thông tin gửi phiếu nhập chưa hợp lệ.',
      v_correlation_id
    );
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_actor_id::text || ':purchase.submit:' || p_idempotency_key::text, 0
  ));
  v_cached := app_private.cached_command_response(
    v_actor_id, 'purchase.submit', p_idempotency_key
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
    return app_private.command_error(
      'INVALID_STATE', 'Phiếu nhập không còn ở trạng thái nháp.',
      v_correlation_id
    );
  end if;
  if v_receipt.created_by <> v_actor_id
    and not app_private.has_permission('purchase.post')
  then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Bạn không có quyền gửi phiếu nhập này.',
      v_correlation_id
    );
  end if;
  if v_receipt.version <> p_expected_version then
    return app_private.command_error_with_details(
      'VERSION_CONFLICT',
      'Phiếu nhập đã được cập nhật. Vui lòng tải lại dữ liệu.',
      jsonb_build_object('currentVersion', v_receipt.version),
      v_correlation_id
    );
  end if;
  if not exists (
    select 1 from api.purchase_receipt_lines l
    where l.purchase_receipt_id = p_receipt_id
  ) then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Phiếu nhập phải có ít nhất một sản phẩm.',
      v_correlation_id
    );
  end if;
  update api.purchase_receipts
  set status = 'AWAITING_COST', submitted_by = v_actor_id,
      submitted_at = now(), version = version + 1, updated_at = now()
  where id = p_receipt_id returning version into v_version;
  insert into api.user_notifications(
    user_id, severity, category, title, message, action_route,
    entity_type, entity_id, dedupe_key, metadata, correlation_id
  )
  select p.id, 'INFO', 'Nhập hàng', 'Phiếu nhập đang chờ nhập giá',
    'Có một phiếu nhập mới đang chờ nhập giá và ghi sổ.',
    '/more/purchases/' || p_receipt_id::text,
    'purchase_receipt', p_receipt_id,
    'purchase.awaiting_cost:' || p_receipt_id::text,
    jsonb_build_object('receiptId', p_receipt_id), v_correlation_id
  from api.profiles p
  where p.role_template = 'OWNER' and p.is_active;
  insert into app_private.audit_events(
    actor_id, action, entity_type, entity_id, after_data, correlation_id
  ) values (
    v_actor_id, 'purchase_receipt.submitted', 'purchase_receipt',
    p_receipt_id,
    jsonb_build_object('status', 'AWAITING_COST', 'version', v_version),
    v_correlation_id
  );
  v_result := app_private.command_success(
    jsonb_build_object(
      'receiptId', p_receipt_id, 'status', 'AWAITING_COST',
      'version', v_version
    ),
    v_correlation_id
  );
  insert into app_private.command_deduplication(
    actor_id, command_name, idempotency_key, response
  ) values (v_actor_id, 'purchase.submit', p_idempotency_key, v_result);
  return v_result;
end;
$$;

create function api.submit_purchase_receipt(
  p_receipt_id uuid,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns jsonb language sql security invoker set search_path = ''
as $$
  select app_private.submit_purchase_receipt_impl(
    p_receipt_id, p_expected_version, p_idempotency_key
  );
$$;

create function app_private.cancel_purchase_receipt_impl(
  p_receipt_id uuid,
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
  v_actor_id uuid := (select auth.uid());
  v_correlation_id uuid := gen_random_uuid();
  v_reason text := normalize(btrim(coalesce(p_reason, '')), NFC);
  v_receipt api.purchase_receipts%rowtype;
  v_cached jsonb;
  v_result jsonb;
  v_version bigint;
begin
  if v_actor_id is null
    or not app_private.has_permission('purchase.draft.manage')
  then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Bạn không có quyền hủy phiếu nhập.',
      v_correlation_id
    );
  end if;
  if p_receipt_id is null or p_expected_version is null
    or p_idempotency_key is null or length(v_reason) not between 1 and 500
  then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Vui lòng nhập lý do hủy phiếu nhập.',
      v_correlation_id
    );
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_actor_id::text || ':purchase.cancel:' || p_idempotency_key::text, 0
  ));
  v_cached := app_private.cached_command_response(
    v_actor_id, 'purchase.cancel', p_idempotency_key
  );
  if v_cached is not null then return v_cached; end if;
  select r.* into v_receipt from api.purchase_receipts r
  where r.id = p_receipt_id for update;
  if not found then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND', 'Không tìm thấy phiếu nhập.', v_correlation_id
    );
  end if;
  if v_receipt.status not in ('DRAFT', 'AWAITING_COST') then
    return app_private.command_error(
      'INVALID_STATE', 'Phiếu nhập này không thể hủy.', v_correlation_id
    );
  end if;
  if v_receipt.created_by <> v_actor_id
    and not app_private.has_permission('purchase.post')
  then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Bạn không có quyền hủy phiếu nhập này.',
      v_correlation_id
    );
  end if;
  if v_receipt.version <> p_expected_version then
    return app_private.command_error_with_details(
      'VERSION_CONFLICT',
      'Phiếu nhập đã được cập nhật. Vui lòng tải lại dữ liệu.',
      jsonb_build_object('currentVersion', v_receipt.version),
      v_correlation_id
    );
  end if;
  update api.purchase_receipts
  set status = 'CANCELLED', cancelled_by = v_actor_id, cancelled_at = now(),
      cancel_reason = v_reason, version = version + 1, updated_at = now()
  where id = p_receipt_id returning version into v_version;
  insert into app_private.audit_events(
    actor_id, action, entity_type, entity_id, after_data, correlation_id
  ) values (
    v_actor_id, 'purchase_receipt.cancelled', 'purchase_receipt',
    p_receipt_id,
    jsonb_build_object(
      'status', 'CANCELLED', 'reason', v_reason, 'version', v_version
    ),
    v_correlation_id
  );
  v_result := app_private.command_success(
    jsonb_build_object(
      'receiptId', p_receipt_id, 'status', 'CANCELLED', 'version', v_version
    ),
    v_correlation_id
  );
  insert into app_private.command_deduplication(
    actor_id, command_name, idempotency_key, response
  ) values (v_actor_id, 'purchase.cancel', p_idempotency_key, v_result);
  return v_result;
end;
$$;

create function api.cancel_purchase_receipt(
  p_receipt_id uuid,
  p_expected_version bigint,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb language sql security invoker set search_path = ''
as $$
  select app_private.cancel_purchase_receipt_impl(
    p_receipt_id, p_expected_version, p_reason, p_idempotency_key
  );
$$;

create function app_private.post_purchase_receipt_impl(
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
  v_result jsonb;
  v_line record;
  v_movement_id uuid;
  v_receipt_number text;
  v_line_cost numeric(20,2);
  v_new_qty numeric(18,3);
  v_new_value numeric(20,2);
  v_new_avg numeric(20,6);
  v_total_cost numeric(20,2) := 0;
  v_version bigint;
  v_now timestamptz := now();
begin
  if v_actor_id is null
    or not app_private.has_permission('purchase.post')
    or not app_private.has_permission('purchase.cost.enter')
  then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Chỉ chủ cửa hàng được ghi sổ phiếu nhập.',
      v_correlation_id
    );
  end if;
  if p_receipt_id is null or p_expected_version is null
    or p_idempotency_key is null or jsonb_typeof(p_cost_lines) <> 'array'
    or jsonb_array_length(p_cost_lines) < 1
  then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Vui lòng nhập đầy đủ đơn giá cho phiếu nhập.',
      v_correlation_id
    );
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_cost_lines) item
    where jsonb_typeof(item) <> 'object'
      or item - array['lineId', 'unitCost'] <> '{}'::jsonb
      or coalesce(item ->> 'lineId', '')
        !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      or coalesce(item ->> 'unitCost', '')
        !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
  ) or exists (
    select 1 from jsonb_array_elements(p_cost_lines) item
    group by item ->> 'lineId' having count(*) > 1
  ) then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Đơn giá nhập chưa đúng định dạng quốc tế.',
      v_correlation_id
    );
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_actor_id::text || ':purchase.post:' || p_idempotency_key::text, 0
  ));
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
  if v_receipt.status <> 'AWAITING_COST' then
    return app_private.command_error(
      'INVALID_STATE', 'Phiếu nhập chưa sẵn sàng để ghi sổ.',
      v_correlation_id
    );
  end if;
  if v_receipt.version <> p_expected_version then
    return app_private.command_error_with_details(
      'VERSION_CONFLICT',
      'Phiếu nhập đã được cập nhật. Vui lòng tải lại dữ liệu.',
      jsonb_build_object('currentVersion', v_receipt.version),
      v_correlation_id
    );
  end if;
  if (
    select count(*) from api.purchase_receipt_lines l
    where l.purchase_receipt_id = p_receipt_id
  ) <> jsonb_array_length(p_cost_lines)
    or exists (
      select 1 from jsonb_array_elements(p_cost_lines) item
      left join api.purchase_receipt_lines l
        on l.id = (item ->> 'lineId')::uuid
        and l.purchase_receipt_id = p_receipt_id
      where l.id is null
    )
  then
    return app_private.command_error(
      'COST_LINES_REQUIRED',
      'Vui lòng nhập đơn giá cho tất cả sản phẩm trong phiếu.',
      v_correlation_id
    );
  end if;
  if exists (
    select 1 from api.purchase_receipt_lines l
    join api.products p on p.id = l.product_id
    where l.purchase_receipt_id = p_receipt_id and not p.is_active
  ) then
    return app_private.command_error(
      'REFERENCE_INACTIVE',
      'Có sản phẩm đã ngừng hoạt động. Vui lòng kích hoạt lại trước khi ghi sổ.',
      v_correlation_id
    );
  end if;

  perform 1 from api.inventory_balances b
  join api.purchase_receipt_lines l on l.product_id = b.product_id
  where l.purchase_receipt_id = p_receipt_id
  order by b.product_id for update of b;
  perform 1 from app_private.inventory_cost_balances b
  join api.purchase_receipt_lines l on l.product_id = b.product_id
  where l.purchase_receipt_id = p_receipt_id
  order by b.product_id for update of b;
  if (
    select count(*) from api.inventory_balances b
    join api.purchase_receipt_lines l on l.product_id = b.product_id
    where l.purchase_receipt_id = p_receipt_id
  ) <> jsonb_array_length(p_cost_lines)
    or (
      select count(*) from app_private.inventory_cost_balances b
      join api.purchase_receipt_lines l on l.product_id = b.product_id
      where l.purchase_receipt_id = p_receipt_id
    ) <> jsonb_array_length(p_cost_lines)
  then
    return app_private.command_error(
      'INVALID_STATE', 'Số dư tồn kho chưa được khởi tạo đầy đủ.',
      v_correlation_id
    );
  end if;

  for v_line in
    select l.*, (item.value ->> 'unitCost')::numeric as unit_cost,
      quantity_balance.on_hand_qty, cost_balance.inventory_value
    from api.purchase_receipt_lines l
    join jsonb_array_elements(p_cost_lines) item(value)
      on (item.value ->> 'lineId')::uuid = l.id
    join api.inventory_balances quantity_balance
      on quantity_balance.product_id = l.product_id
    join app_private.inventory_cost_balances cost_balance
      on cost_balance.product_id = l.product_id
    where l.purchase_receipt_id = p_receipt_id
    order by l.product_id
  loop
    v_line_cost := round(v_line.received_qty * v_line.unit_cost, 2);
    v_new_qty := v_line.on_hand_qty + v_line.received_qty;
    v_new_value := round(v_line.inventory_value + v_line_cost, 2);
    v_new_avg := round(v_new_value / v_new_qty, 6);
    update api.inventory_balances
    set on_hand_qty = v_new_qty, version = version + 1, updated_at = v_now
    where product_id = v_line.product_id;
    update app_private.inventory_cost_balances
    set inventory_value = v_new_value, avg_unit_cost = v_new_avg,
        version = version + 1, updated_at = v_now
    where product_id = v_line.product_id;
    insert into api.stock_movements(
      product_id, movement_type, quantity_delta, quantity_after,
      reference_type, reference_id, occurred_at, actor_id, note,
      correlation_id
    ) values (
      v_line.product_id, 'PURCHASE_RECEIPT', v_line.received_qty, v_new_qty,
      'PURCHASE_RECEIPT', p_receipt_id, v_now, v_actor_id,
      'Ghi sổ phiếu nhập', v_correlation_id
    ) returning id into v_movement_id;
    insert into app_private.purchase_receipt_line_costs(
      purchase_receipt_line_id, unit_cost, line_cost, entered_by
    ) values (v_line.id, v_line.unit_cost, v_line_cost, v_actor_id);
    insert into app_private.inventory_cost_movements(
      stock_movement_id, inventory_value_delta, cogs_delta,
      inventory_value_after, avg_unit_cost_after, occurred_at
    ) values (
      v_movement_id, v_line_cost, 0, v_new_value, v_new_avg, v_now
    );
    v_total_cost := v_total_cost + v_line_cost;
  end loop;

  v_receipt_number := app_private.next_document_number_impl(
    'PURCHASE_RECEIPT'
  );
  update api.purchase_receipts
  set receipt_number = v_receipt_number, status = 'POSTED',
      posted_by = v_actor_id, posted_at = v_now,
      version = version + 1, updated_at = v_now
  where id = p_receipt_id returning version into v_version;
  insert into app_private.audit_events(
    actor_id, action, entity_type, entity_id, after_data, correlation_id
  ) values (
    v_actor_id, 'purchase_receipt.posted', 'purchase_receipt', p_receipt_id,
    jsonb_build_object(
      'receiptNumber', v_receipt_number, 'totalCost', v_total_cost::text,
      'version', v_version
    ),
    v_correlation_id
  );
  insert into api.user_notifications(
    user_id, severity, category, title, message, action_route,
    entity_type, entity_id, dedupe_key, metadata, correlation_id
  ) values (
    v_receipt.created_by, 'SUCCESS', 'Nhập hàng', 'Phiếu nhập đã được ghi sổ',
    'Phiếu ' || v_receipt_number || ' đã cập nhật tồn kho.',
    '/more/purchases/' || p_receipt_id::text,
    'purchase_receipt', p_receipt_id,
    'purchase.posted:' || p_receipt_id::text,
    jsonb_build_object('receiptNumber', v_receipt_number), v_correlation_id
  ) on conflict (user_id, dedupe_key) where dedupe_key is not null and read_at is null
  do nothing;
  v_result := app_private.command_success(
    jsonb_build_object(
      'receiptId', p_receipt_id, 'receiptNumber', v_receipt_number,
      'status', 'POSTED', 'version', v_version
    ),
    v_correlation_id
  );
  insert into app_private.command_deduplication(
    actor_id, command_name, idempotency_key, response
  ) values (v_actor_id, 'purchase.post', p_idempotency_key, v_result);
  return v_result;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Đơn giá nhập chưa đúng định dạng quốc tế.',
      v_correlation_id
    );
end;
$$;

create function api.post_purchase_receipt(
  p_receipt_id uuid,
  p_expected_version bigint,
  p_cost_lines jsonb,
  p_idempotency_key uuid
)
returns jsonb language sql security invoker set search_path = ''
as $$
  select app_private.post_purchase_receipt_impl(
    p_receipt_id, p_expected_version, p_cost_lines, p_idempotency_key
  );
$$;

create function app_private.reverse_purchase_receipt_impl(
  p_receipt_id uuid,
  p_reason text,
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
  v_reason text := normalize(btrim(coalesce(p_reason, '')), NFC);
  v_receipt api.purchase_receipts%rowtype;
  v_cached jsonb;
  v_result jsonb;
  v_line record;
  v_movement_id uuid;
  v_new_qty numeric(18,3);
  v_new_value numeric(20,2);
  v_new_avg numeric(20,6);
  v_version bigint;
  v_now timestamptz := now();
begin
  if v_actor_id is null or not app_private.has_permission('purchase.post') then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Chỉ chủ cửa hàng được đảo phiếu nhập.',
      v_correlation_id
    );
  end if;
  if p_receipt_id is null or p_idempotency_key is null
    or length(v_reason) not between 1 and 500
  then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Vui lòng nhập lý do đảo phiếu nhập.',
      v_correlation_id
    );
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_actor_id::text || ':purchase.reverse:' || p_idempotency_key::text, 0
  ));
  v_cached := app_private.cached_command_response(
    v_actor_id, 'purchase.reverse', p_idempotency_key
  );
  if v_cached is not null then return v_cached; end if;
  select r.* into v_receipt from api.purchase_receipts r
  where r.id = p_receipt_id for update;
  if not found then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND', 'Không tìm thấy phiếu nhập.', v_correlation_id
    );
  end if;
  if v_receipt.status <> 'POSTED' then
    return app_private.command_error(
      'INVALID_STATE', 'Chỉ phiếu nhập đã ghi sổ mới được đảo.',
      v_correlation_id
    );
  end if;
  perform 1 from api.inventory_balances b
  join api.purchase_receipt_lines l on l.product_id = b.product_id
  where l.purchase_receipt_id = p_receipt_id
  order by b.product_id for update of b;
  perform 1 from app_private.inventory_cost_balances b
  join api.purchase_receipt_lines l on l.product_id = b.product_id
  where l.purchase_receipt_id = p_receipt_id
  order by b.product_id for update of b;
  if exists (
    select 1
    from api.purchase_receipt_lines l
    join api.inventory_balances quantity_balance
      on quantity_balance.product_id = l.product_id
    join app_private.inventory_cost_balances cost_balance
      on cost_balance.product_id = l.product_id
    join app_private.purchase_receipt_line_costs cost
      on cost.purchase_receipt_line_id = l.id
    left join lateral (
      select m.reference_type, m.reference_id, m.movement_type
      from api.stock_movements m
      where m.product_id = l.product_id
      order by m.occurred_at desc, m.id desc limit 1
    ) latest on true
    where l.purchase_receipt_id = p_receipt_id
      and (
        quantity_balance.on_hand_qty < l.received_qty
        or cost_balance.inventory_value < cost.line_cost
        or latest.reference_type is distinct from 'PURCHASE_RECEIPT'
        or latest.reference_id is distinct from p_receipt_id
        or latest.movement_type is distinct from 'PURCHASE_RECEIPT'
      )
  ) then
    return app_private.command_error(
      'PURCHASE_REVERSAL_BLOCKED',
      'Không thể đảo vì tồn kho đã phát sinh thay đổi sau phiếu nhập.',
      v_correlation_id
    );
  end if;
  for v_line in
    select l.*, cost.line_cost, quantity_balance.on_hand_qty,
      cost_balance.inventory_value
    from api.purchase_receipt_lines l
    join app_private.purchase_receipt_line_costs cost
      on cost.purchase_receipt_line_id = l.id
    join api.inventory_balances quantity_balance
      on quantity_balance.product_id = l.product_id
    join app_private.inventory_cost_balances cost_balance
      on cost_balance.product_id = l.product_id
    where l.purchase_receipt_id = p_receipt_id
    order by l.product_id
  loop
    v_new_qty := v_line.on_hand_qty - v_line.received_qty;
    if v_new_qty = 0 then
      v_new_value := 0;
      v_new_avg := 0;
    else
      v_new_value := round(v_line.inventory_value - v_line.line_cost, 2);
      v_new_avg := round(v_new_value / v_new_qty, 6);
    end if;
    update api.inventory_balances
    set on_hand_qty = v_new_qty, version = version + 1, updated_at = v_now
    where product_id = v_line.product_id;
    update app_private.inventory_cost_balances
    set inventory_value = v_new_value, avg_unit_cost = v_new_avg,
        version = version + 1, updated_at = v_now
    where product_id = v_line.product_id;
    insert into api.stock_movements(
      product_id, movement_type, quantity_delta, quantity_after,
      reference_type, reference_id, occurred_at, actor_id, note,
      correlation_id
    ) values (
      v_line.product_id, 'PURCHASE_REVERSAL', -v_line.received_qty, v_new_qty,
      'PURCHASE_RECEIPT', p_receipt_id, v_now, v_actor_id, v_reason,
      v_correlation_id
    ) returning id into v_movement_id;
    insert into app_private.inventory_cost_movements(
      stock_movement_id, inventory_value_delta, cogs_delta,
      inventory_value_after, avg_unit_cost_after, occurred_at
    ) values (
      v_movement_id, -v_line.line_cost, 0, v_new_value, v_new_avg, v_now
    );
  end loop;
  update api.purchase_receipts
  set status = 'REVERSED', reversed_by = v_actor_id, reversed_at = v_now,
      reverse_reason = v_reason, version = version + 1, updated_at = v_now
  where id = p_receipt_id returning version into v_version;
  insert into app_private.audit_events(
    actor_id, action, entity_type, entity_id, after_data, correlation_id
  ) values (
    v_actor_id, 'purchase_receipt.reversed', 'purchase_receipt', p_receipt_id,
    jsonb_build_object(
      'receiptNumber', v_receipt.receipt_number, 'reason', v_reason,
      'version', v_version
    ),
    v_correlation_id
  );
  insert into api.user_notifications(
    user_id, severity, category, title, message, action_route,
    entity_type, entity_id, dedupe_key, metadata, correlation_id
  ) values (
    v_receipt.created_by, 'WARNING', 'Nhập hàng', 'Phiếu nhập đã được đảo',
    'Phiếu ' || v_receipt.receipt_number || ' đã được đảo khỏi tồn kho.',
    '/more/purchases/' || p_receipt_id::text,
    'purchase_receipt', p_receipt_id,
    'purchase.reversed:' || p_receipt_id::text,
    jsonb_build_object('receiptNumber', v_receipt.receipt_number),
    v_correlation_id
  ) on conflict (user_id, dedupe_key) where dedupe_key is not null and read_at is null
  do nothing;
  v_result := app_private.command_success(
    jsonb_build_object(
      'receiptId', p_receipt_id, 'receiptNumber', v_receipt.receipt_number,
      'status', 'REVERSED', 'version', v_version
    ),
    v_correlation_id
  );
  insert into app_private.command_deduplication(
    actor_id, command_name, idempotency_key, response
  ) values (v_actor_id, 'purchase.reverse', p_idempotency_key, v_result);
  return v_result;
end;
$$;

create function api.reverse_purchase_receipt(
  p_receipt_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb language sql security invoker set search_path = ''
as $$
  select app_private.reverse_purchase_receipt_impl(
    p_receipt_id, p_reason, p_idempotency_key
  );
$$;

create function app_private.list_purchase_receipts_impl(
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

create function api.list_purchase_receipts(
  p_filters jsonb default '{}'::jsonb,
  p_cursor_updated_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 30
)
returns jsonb language sql volatile security invoker set search_path = ''
as $$
  select app_private.list_purchase_receipts_impl(
    p_filters, p_cursor_updated_at, p_cursor_id, p_limit
  );
$$;

create function app_private.get_purchase_receipt_operational_impl(
  p_receipt_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_correlation_id uuid := gen_random_uuid();
  v_data jsonb;
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
  select jsonb_build_object(
    'id', r.id, 'receiptNumber', r.receipt_number, 'status', r.status,
    'supplierId', r.supplier_id, 'supplierName', supplier.name,
    'receivedAt', r.received_at, 'note', r.note,
    'createdBy', r.created_by, 'createdByName', creator.display_name,
    'submittedByName', submitter.display_name,
    'postedByName', poster.display_name,
    'reversedByName', reverser.display_name,
    'cancelledByName', canceller.display_name,
    'submittedAt', r.submitted_at, 'postedAt', r.posted_at,
    'reversedAt', r.reversed_at, 'cancelledAt', r.cancelled_at,
    'reverseReason', r.reverse_reason, 'cancelReason', r.cancel_reason,
    'version', r.version, 'createdAt', r.created_at, 'updatedAt', r.updated_at,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'productId', l.product_id,
        'productName', l.product_name, 'sku', l.sku,
        'unitName', l.unit_name, 'receivedQty', l.received_qty::text,
        'lineOrder', l.line_order
      ) order by l.line_order)
      from api.purchase_receipt_lines l where l.purchase_receipt_id = r.id
    ), '[]'::jsonb)
  ) into v_data
  from api.purchase_receipts r
  left join api.suppliers supplier on supplier.id = r.supplier_id
  join api.profiles creator on creator.id = r.created_by
  left join api.profiles submitter on submitter.id = r.submitted_by
  left join api.profiles poster on poster.id = r.posted_by
  left join api.profiles reverser on reverser.id = r.reversed_by
  left join api.profiles canceller on canceller.id = r.cancelled_by
  where r.id = p_receipt_id;
  if v_data is null then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND', 'Không tìm thấy phiếu nhập.', v_correlation_id
    );
  end if;
  return app_private.command_success(v_data, v_correlation_id);
end;
$$;

create function api.get_purchase_receipt_operational(p_receipt_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$
  select app_private.get_purchase_receipt_operational_impl(p_receipt_id);
$$;

create function app_private.get_purchase_receipt_cost_detail_impl(
  p_receipt_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_correlation_id uuid := gen_random_uuid();
  v_data jsonb;
begin
  if not app_private.has_permission('purchase.cost.read') then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Chỉ chủ cửa hàng được xem giá nhập.',
      v_correlation_id
    );
  end if;
  select jsonb_build_object(
    'receiptId', r.id, 'receiptNumber', r.receipt_number,
    'status', r.status,
    'totalCost', coalesce(sum(cost.line_cost), 0)::text,
    'lines', coalesce(jsonb_agg(jsonb_build_object(
      'lineId', l.id, 'unitCost', cost.unit_cost::text,
      'lineCost', cost.line_cost::text
    ) order by l.line_order) filter (where l.id is not null), '[]'::jsonb)
  ) into v_data
  from api.purchase_receipts r
  left join api.purchase_receipt_lines l on l.purchase_receipt_id = r.id
  left join app_private.purchase_receipt_line_costs cost
    on cost.purchase_receipt_line_id = l.id
  where r.id = p_receipt_id
  group by r.id, r.receipt_number, r.status;
  if v_data is null then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND', 'Không tìm thấy phiếu nhập.', v_correlation_id
    );
  end if;
  return app_private.command_success(v_data, v_correlation_id);
end;
$$;

create function api.get_purchase_receipt_cost_detail(p_receipt_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$
  select app_private.get_purchase_receipt_cost_detail_impl(p_receipt_id);
$$;

create function app_private.save_opening_stock_draft_impl(
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
  v_actor_id uuid := (select auth.uid());
  v_correlation_id uuid := gen_random_uuid();
  v_id uuid := coalesce(p_count_id, gen_random_uuid());
  v_note text := app_private.empty_to_null(p_note);
  v_count api.stock_counts%rowtype;
  v_version bigint;
  v_cached jsonb;
  v_result jsonb;
begin
  if v_actor_id is null
    or not app_private.has_permission('inventory.adjustment.post')
  then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Chỉ chủ cửa hàng được lập phiếu mở sổ.',
      v_correlation_id
    );
  end if;
  if p_idempotency_key is null or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) not between 1 and 5000
    or (v_note is not null and length(v_note) > 1000)
  then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Thông tin phiếu mở sổ chưa hợp lệ.',
      v_correlation_id
    );
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) item
    where jsonb_typeof(item) <> 'object'
      or item - array[
        'productId', 'countedQty', 'openingUnitCost',
        'sourceSuggestionId', 'confirmedUnverified'
      ] <> '{}'::jsonb
      or coalesce(item ->> 'productId', '')
        !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      or coalesce(item ->> 'countedQty', '')
        !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,3})?$'
      or (item ->> 'countedQty')::numeric <= 0
      or coalesce(item ->> 'openingUnitCost', '')
        !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
      or (item ->> 'sourceSuggestionId' is not null and (
        item ->> 'sourceSuggestionId'
          !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        or coalesce((item ->> 'confirmedUnverified')::boolean, false) is false
      ))
  ) or exists (
    select 1 from jsonb_array_elements(p_lines) item
    group by item ->> 'productId' having count(*) > 1
  ) then
    return app_private.command_error(
      'VALIDATION_FAILED',
      'Mỗi sản phẩm phải có tồn và giá vốn hợp lệ, chỉ xuất hiện một lần.',
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
  if exists (
    select 1 from jsonb_array_elements(p_lines) item
    left join app_private.legacy_opening_balance_suggestions suggestion
      on suggestion.id = nullif(item ->> 'sourceSuggestionId', '')::uuid
      and suggestion.product_id = (item ->> 'productId')::uuid
    where item ->> 'sourceSuggestionId' is not null
      and suggestion.id is null
  ) then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND', 'Gợi ý mở sổ không khớp với sản phẩm đã chọn.',
      v_correlation_id
    );
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_lines) item
    join api.inventory_balances quantity_balance
      on quantity_balance.product_id = (item ->> 'productId')::uuid
    join app_private.inventory_cost_balances cost_balance
      on cost_balance.product_id = (item ->> 'productId')::uuid
    where quantity_balance.on_hand_qty <> 0
      or cost_balance.inventory_value <> 0
      or exists (
        select 1 from api.stock_movements movement
        where movement.product_id = (item ->> 'productId')::uuid
      )
  ) then
    return app_private.command_error(
      'OPENING_NOT_ALLOWED',
      'Sản phẩm đã phát sinh tồn kho nên không thể mở sổ lần nữa.',
      v_correlation_id
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    v_actor_id::text || ':opening.save:' || p_idempotency_key::text, 0
  ));
  v_cached := app_private.cached_command_response(
    v_actor_id, 'opening.save', p_idempotency_key
  );
  if v_cached is not null then return v_cached; end if;
  if p_count_id is null then
    if p_expected_version is not null then
      return app_private.command_error(
        'VALIDATION_FAILED', 'Phiếu mở sổ mới không được có phiên bản cũ.',
        v_correlation_id
      );
    end if;
    insert into api.stock_counts(
      id, count_type, note, created_by, correlation_id
    ) values (v_id, 'OPENING', v_note, v_actor_id, v_correlation_id)
    returning version into v_version;
  else
    select c.* into v_count from api.stock_counts c
    where c.id = p_count_id for update;
    if not found then
      return app_private.command_error(
        'REFERENCE_NOT_FOUND', 'Không tìm thấy phiếu mở sổ.',
        v_correlation_id
      );
    end if;
    if v_count.count_type <> 'OPENING' or v_count.status <> 'DRAFT' then
      return app_private.command_error(
        'INVALID_STATE', 'Chỉ phiếu mở sổ nháp mới được chỉnh sửa.',
        v_correlation_id
      );
    end if;
    if p_expected_version is null or p_expected_version <> v_count.version then
      return app_private.command_error_with_details(
        'VERSION_CONFLICT',
        'Phiếu mở sổ đã được cập nhật. Vui lòng tải lại dữ liệu.',
        jsonb_build_object('currentVersion', v_count.version),
        v_correlation_id
      );
    end if;
    update api.stock_counts
    set note = v_note, version = version + 1, updated_at = now()
    where id = v_id returning version into v_version;
    delete from api.stock_count_lines where stock_count_id = v_id;
  end if;
  insert into api.stock_count_lines(
    stock_count_id, product_id, product_name, sku, unit_name,
    system_qty_snapshot, inventory_version_snapshot, counted_qty, line_order
  )
  select v_id, p.id, p.name, p.sku, p.unit_name,
    quantity_balance.on_hand_qty, quantity_balance.version,
    (item.value ->> 'countedQty')::numeric, item.ordinality::integer - 1
  from jsonb_array_elements(p_lines) with ordinality item(value, ordinality)
  join api.products p on p.id = (item.value ->> 'productId')::uuid
  join api.inventory_balances quantity_balance
    on quantity_balance.product_id = p.id
  order by item.ordinality;
  insert into app_private.stock_count_line_costs(
    stock_count_line_id, opening_unit_cost, opening_value,
    source_suggestion_id, unverified_source_confirmed, entered_by
  )
  select line.id, (item.value ->> 'openingUnitCost')::numeric,
    round((item.value ->> 'countedQty')::numeric
      * (item.value ->> 'openingUnitCost')::numeric, 2),
    nullif(item.value ->> 'sourceSuggestionId', '')::uuid,
    coalesce((item.value ->> 'confirmedUnverified')::boolean, false),
    v_actor_id
  from jsonb_array_elements(p_lines) item(value)
  join api.stock_count_lines line
    on line.stock_count_id = v_id
    and line.product_id = (item.value ->> 'productId')::uuid;
  insert into app_private.audit_events(
    actor_id, action, entity_type, entity_id, after_data, correlation_id
  ) values (
    v_actor_id,
    case when p_count_id is null
      then 'opening_stock.created' else 'opening_stock.updated' end,
    'stock_count', v_id,
    jsonb_build_object(
      'countType', 'OPENING', 'lineCount', jsonb_array_length(p_lines),
      'version', v_version
    ),
    v_correlation_id
  );
  v_result := app_private.command_success(
    jsonb_build_object(
      'countId', v_id, 'status', 'DRAFT', 'version', v_version
    ),
    v_correlation_id
  );
  insert into app_private.command_deduplication(
    actor_id, command_name, idempotency_key, response
  ) values (v_actor_id, 'opening.save', p_idempotency_key, v_result);
  return v_result;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Tồn hoặc giá vốn đầu kỳ chưa đúng định dạng.',
      v_correlation_id
    );
end;
$$;

create function api.save_opening_stock_draft(
  p_count_id uuid,
  p_expected_version bigint,
  p_note text,
  p_lines jsonb,
  p_idempotency_key uuid
)
returns jsonb language sql security invoker set search_path = ''
as $$
  select app_private.save_opening_stock_draft_impl(
    p_count_id, p_expected_version, p_note, p_lines, p_idempotency_key
  );
$$;

create function app_private.submit_opening_stock_impl(
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
  v_actor_id uuid := (select auth.uid());
  v_correlation_id uuid := gen_random_uuid();
  v_count api.stock_counts%rowtype;
  v_cached jsonb;
  v_result jsonb;
  v_version bigint;
begin
  if v_actor_id is null
    or not app_private.has_permission('inventory.adjustment.post')
  then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Chỉ chủ cửa hàng được xác nhận phiếu mở sổ.',
      v_correlation_id
    );
  end if;
  if p_count_id is null or p_expected_version is null
    or p_idempotency_key is null
  then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Thông tin xác nhận mở sổ chưa hợp lệ.',
      v_correlation_id
    );
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_actor_id::text || ':opening.submit:' || p_idempotency_key::text, 0
  ));
  v_cached := app_private.cached_command_response(
    v_actor_id, 'opening.submit', p_idempotency_key
  );
  if v_cached is not null then return v_cached; end if;
  select c.* into v_count from api.stock_counts c
  where c.id = p_count_id for update;
  if not found then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND', 'Không tìm thấy phiếu mở sổ.', v_correlation_id
    );
  end if;
  if v_count.count_type <> 'OPENING' or v_count.status <> 'DRAFT' then
    return app_private.command_error(
      'INVALID_STATE', 'Phiếu mở sổ không còn ở trạng thái nháp.',
      v_correlation_id
    );
  end if;
  if v_count.version <> p_expected_version then
    return app_private.command_error_with_details(
      'VERSION_CONFLICT',
      'Phiếu mở sổ đã được cập nhật. Vui lòng tải lại dữ liệu.',
      jsonb_build_object('currentVersion', v_count.version),
      v_correlation_id
    );
  end if;
  update api.stock_counts
  set status = 'COUNTED', submitted_by = v_actor_id, submitted_at = now(),
      version = version + 1, updated_at = now()
  where id = p_count_id returning version into v_version;
  v_result := app_private.command_success(
    jsonb_build_object(
      'countId', p_count_id, 'status', 'COUNTED', 'version', v_version
    ),
    v_correlation_id
  );
  insert into app_private.command_deduplication(
    actor_id, command_name, idempotency_key, response
  ) values (v_actor_id, 'opening.submit', p_idempotency_key, v_result);
  return v_result;
end;
$$;

create function api.submit_opening_stock(
  p_count_id uuid,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns jsonb language sql security invoker set search_path = ''
as $$
  select app_private.submit_opening_stock_impl(
    p_count_id, p_expected_version, p_idempotency_key
  );
$$;

create function app_private.cancel_opening_stock_impl(
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
  v_actor_id uuid := (select auth.uid());
  v_correlation_id uuid := gen_random_uuid();
  v_reason text := normalize(btrim(coalesce(p_reason, '')), NFC);
  v_count api.stock_counts%rowtype;
  v_cached jsonb;
  v_result jsonb;
  v_version bigint;
begin
  if v_actor_id is null
    or not app_private.has_permission('inventory.adjustment.post')
  then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Chỉ chủ cửa hàng được hủy phiếu mở sổ.',
      v_correlation_id
    );
  end if;
  if p_count_id is null or p_expected_version is null
    or p_idempotency_key is null or length(v_reason) not between 1 and 500
  then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Vui lòng nhập lý do hủy phiếu mở sổ.',
      v_correlation_id
    );
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_actor_id::text || ':opening.cancel:' || p_idempotency_key::text, 0
  ));
  v_cached := app_private.cached_command_response(
    v_actor_id, 'opening.cancel', p_idempotency_key
  );
  if v_cached is not null then return v_cached; end if;
  select c.* into v_count from api.stock_counts c
  where c.id = p_count_id for update;
  if not found then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND', 'Không tìm thấy phiếu mở sổ.', v_correlation_id
    );
  end if;
  if v_count.status not in ('DRAFT', 'COUNTED') then
    return app_private.command_error(
      'INVALID_STATE', 'Phiếu mở sổ này không thể hủy.', v_correlation_id
    );
  end if;
  if v_count.version <> p_expected_version then
    return app_private.command_error_with_details(
      'VERSION_CONFLICT',
      'Phiếu mở sổ đã được cập nhật. Vui lòng tải lại dữ liệu.',
      jsonb_build_object('currentVersion', v_count.version),
      v_correlation_id
    );
  end if;
  update api.stock_counts
  set status = 'CANCELLED', cancelled_by = v_actor_id, cancelled_at = now(),
      cancel_reason = v_reason, version = version + 1, updated_at = now()
  where id = p_count_id returning version into v_version;
  v_result := app_private.command_success(
    jsonb_build_object(
      'countId', p_count_id, 'status', 'CANCELLED', 'version', v_version
    ),
    v_correlation_id
  );
  insert into app_private.command_deduplication(
    actor_id, command_name, idempotency_key, response
  ) values (v_actor_id, 'opening.cancel', p_idempotency_key, v_result);
  return v_result;
end;
$$;

create function api.cancel_opening_stock(
  p_count_id uuid,
  p_expected_version bigint,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb language sql security invoker set search_path = ''
as $$
  select app_private.cancel_opening_stock_impl(
    p_count_id, p_expected_version, p_reason, p_idempotency_key
  );
$$;

create function app_private.post_opening_stock_impl(
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
  v_actor_id uuid := (select auth.uid());
  v_correlation_id uuid := gen_random_uuid();
  v_count api.stock_counts%rowtype;
  v_cached jsonb;
  v_result jsonb;
  v_line record;
  v_movement_id uuid;
  v_count_number text;
  v_new_avg numeric(20,6);
  v_total_value numeric(20,2) := 0;
  v_version bigint;
  v_now timestamptz := now();
begin
  if v_actor_id is null
    or not app_private.has_permission('inventory.adjustment.post')
  then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Chỉ chủ cửa hàng được ghi sổ tồn đầu kỳ.',
      v_correlation_id
    );
  end if;
  if p_count_id is null or p_expected_version is null
    or p_idempotency_key is null
  then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Thông tin ghi sổ tồn đầu kỳ chưa hợp lệ.',
      v_correlation_id
    );
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_actor_id::text || ':opening.post:' || p_idempotency_key::text, 0
  ));
  v_cached := app_private.cached_command_response(
    v_actor_id, 'opening.post', p_idempotency_key
  );
  if v_cached is not null then return v_cached; end if;
  select c.* into v_count from api.stock_counts c
  where c.id = p_count_id for update;
  if not found then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND', 'Không tìm thấy phiếu mở sổ.', v_correlation_id
    );
  end if;
  if v_count.count_type <> 'OPENING' or v_count.status <> 'COUNTED' then
    return app_private.command_error(
      'INVALID_STATE', 'Phiếu mở sổ chưa được xác nhận để ghi sổ.',
      v_correlation_id
    );
  end if;
  if v_count.version <> p_expected_version then
    return app_private.command_error_with_details(
      'VERSION_CONFLICT',
      'Phiếu mở sổ đã được cập nhật. Vui lòng tải lại dữ liệu.',
      jsonb_build_object('currentVersion', v_count.version),
      v_correlation_id
    );
  end if;
  perform 1 from api.inventory_balances b
  join api.stock_count_lines l on l.product_id = b.product_id
  where l.stock_count_id = p_count_id
  order by b.product_id for update of b;
  perform 1 from app_private.inventory_cost_balances b
  join api.stock_count_lines l on l.product_id = b.product_id
  where l.stock_count_id = p_count_id
  order by b.product_id for update of b;
  if not exists (
    select 1 from api.stock_count_lines l where l.stock_count_id = p_count_id
  ) or exists (
    select 1
    from api.stock_count_lines l
    join api.products p on p.id = l.product_id
    join api.inventory_balances quantity_balance
      on quantity_balance.product_id = l.product_id
    join app_private.inventory_cost_balances cost_balance
      on cost_balance.product_id = l.product_id
    left join app_private.stock_count_line_costs cost
      on cost.stock_count_line_id = l.id
    where l.stock_count_id = p_count_id
      and (
        not p.is_active or cost.stock_count_line_id is null
        or quantity_balance.on_hand_qty <> 0
        or cost_balance.inventory_value <> 0
        or quantity_balance.version <> l.inventory_version_snapshot
        or exists (
          select 1 from api.stock_movements movement
          where movement.product_id = l.product_id
        )
      )
  ) then
    return app_private.command_error(
      'OPENING_NOT_ALLOWED',
      'Tồn kho đã thay đổi hoặc sản phẩm không còn đủ điều kiện mở sổ.',
      v_correlation_id
    );
  end if;
  for v_line in
    select l.*, cost.opening_value, cost.opening_unit_cost
    from api.stock_count_lines l
    join app_private.stock_count_line_costs cost
      on cost.stock_count_line_id = l.id
    where l.stock_count_id = p_count_id
    order by l.product_id
  loop
    v_new_avg := round(v_line.opening_value / v_line.counted_qty, 6);
    update api.inventory_balances
    set on_hand_qty = v_line.counted_qty,
        version = version + 1, updated_at = v_now
    where product_id = v_line.product_id;
    update app_private.inventory_cost_balances
    set inventory_value = v_line.opening_value, avg_unit_cost = v_new_avg,
        version = version + 1, updated_at = v_now
    where product_id = v_line.product_id;
    insert into api.stock_movements(
      product_id, movement_type, quantity_delta, quantity_after,
      reference_type, reference_id, occurred_at, actor_id, note,
      correlation_id
    ) values (
      v_line.product_id, 'OPENING', v_line.counted_qty, v_line.counted_qty,
      'STOCK_COUNT', p_count_id, v_now, v_actor_id,
      'Ghi sổ tồn đầu kỳ', v_correlation_id
    ) returning id into v_movement_id;
    insert into app_private.inventory_cost_movements(
      stock_movement_id, inventory_value_delta, cogs_delta,
      inventory_value_after, avg_unit_cost_after, occurred_at
    ) values (
      v_movement_id, v_line.opening_value, 0,
      v_line.opening_value, v_new_avg, v_now
    );
    v_total_value := v_total_value + v_line.opening_value;
  end loop;
  v_count_number := app_private.next_document_number_impl('STOCK_COUNT');
  update api.stock_counts
  set count_number = v_count_number, status = 'POSTED',
      posted_by = v_actor_id, posted_at = v_now,
      version = version + 1, updated_at = v_now
  where id = p_count_id returning version into v_version;
  insert into app_private.audit_events(
    actor_id, action, entity_type, entity_id, after_data, correlation_id
  ) values (
    v_actor_id, 'opening_stock.posted', 'stock_count', p_count_id,
    jsonb_build_object(
      'countNumber', v_count_number, 'totalValue', v_total_value::text,
      'version', v_version
    ),
    v_correlation_id
  );
  insert into api.user_notifications(
    user_id, severity, category, title, message, action_route,
    entity_type, entity_id, dedupe_key, metadata, correlation_id
  ) values (
    v_actor_id, 'SUCCESS', 'Tồn kho', 'Đã ghi sổ tồn đầu kỳ',
    'Phiếu ' || v_count_number || ' đã cập nhật tồn kho.',
    '/more/inventory/opening/' || p_count_id::text,
    'stock_count', p_count_id,
    'opening.posted:' || p_count_id::text,
    jsonb_build_object('countNumber', v_count_number), v_correlation_id
  );
  v_result := app_private.command_success(
    jsonb_build_object(
      'countId', p_count_id, 'countNumber', v_count_number,
      'status', 'POSTED', 'version', v_version
    ),
    v_correlation_id
  );
  insert into app_private.command_deduplication(
    actor_id, command_name, idempotency_key, response
  ) values (v_actor_id, 'opening.post', p_idempotency_key, v_result);
  return v_result;
end;
$$;

create function api.post_opening_stock(
  p_count_id uuid,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns jsonb language sql security invoker set search_path = ''
as $$
  select app_private.post_opening_stock_impl(
    p_count_id, p_expected_version, p_idempotency_key
  );
$$;

create function app_private.list_opening_stock_documents_impl(
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
  into v_items, v_next_updated_at, v_next_id from numbered;
  if jsonb_array_length(v_items) < p_limit or not exists (
    select 1 from api.stock_counts c
    where c.count_type = 'OPENING' and v_next_id is not null
      and (c.updated_at, c.id) < (v_next_updated_at, v_next_id)
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
end;
$$;

create function api.list_opening_stock_documents(
  p_cursor_updated_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 30
)
returns jsonb language sql volatile security invoker set search_path = ''
as $$
  select app_private.list_opening_stock_documents_impl(
    p_cursor_updated_at, p_cursor_id, p_limit
  );
$$;

create function app_private.get_opening_stock_document_impl(p_count_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_correlation_id uuid := gen_random_uuid();
  v_data jsonb;
begin
  if not app_private.has_permission('inventory.adjustment.post') then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Chỉ chủ cửa hàng được xem phiếu mở sổ.',
      v_correlation_id
    );
  end if;
  select jsonb_build_object(
    'id', c.id, 'countNumber', c.count_number, 'countType', c.count_type,
    'status', c.status, 'note', c.note, 'version', c.version,
    'createdByName', creator.display_name,
    'submittedByName', submitter.display_name,
    'postedByName', poster.display_name,
    'cancelledByName', canceller.display_name,
    'submittedAt', c.submitted_at, 'postedAt', c.posted_at,
    'cancelledAt', c.cancelled_at, 'cancelReason', c.cancel_reason,
    'createdAt', c.created_at, 'updatedAt', c.updated_at,
    'totalValue', coalesce((
      select sum(cost.opening_value) from api.stock_count_lines l
      join app_private.stock_count_line_costs cost
        on cost.stock_count_line_id = l.id
      where l.stock_count_id = c.id
    ), 0)::text,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'productId', l.product_id,
        'productName', l.product_name, 'sku', l.sku,
        'unitName', l.unit_name,
        'systemQtySnapshot', l.system_qty_snapshot::text,
        'inventoryVersionSnapshot', l.inventory_version_snapshot,
        'countedQty', l.counted_qty::text,
        'openingUnitCost', cost.opening_unit_cost::text,
        'openingValue', cost.opening_value::text,
        'sourceSuggestionId', cost.source_suggestion_id,
        'unverifiedSourceConfirmed', cost.unverified_source_confirmed,
        'lineOrder', l.line_order
      ) order by l.line_order)
      from api.stock_count_lines l
      join app_private.stock_count_line_costs cost
        on cost.stock_count_line_id = l.id
      where l.stock_count_id = c.id
    ), '[]'::jsonb)
  ) into v_data
  from api.stock_counts c
  join api.profiles creator on creator.id = c.created_by
  left join api.profiles submitter on submitter.id = c.submitted_by
  left join api.profiles poster on poster.id = c.posted_by
  left join api.profiles canceller on canceller.id = c.cancelled_by
  where c.id = p_count_id and c.count_type = 'OPENING';
  if v_data is null then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND', 'Không tìm thấy phiếu mở sổ.', v_correlation_id
    );
  end if;
  return app_private.command_success(v_data, v_correlation_id);
end;
$$;

create function api.get_opening_stock_document(p_count_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select app_private.get_opening_stock_document_impl(p_count_id); $$;

create function app_private.list_opening_balance_suggestions_impl(
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
  v_next_id uuid;
begin
  if not app_private.has_permission('inventory.adjustment.post') then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Chỉ chủ cửa hàng được xem gợi ý mở sổ.',
      v_correlation_id
    );
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Bộ lọc gợi ý mở sổ chưa hợp lệ.',
      v_correlation_id
    );
  end if;
  with page as (
    select suggestion.*, product.name as product_name, product.sku,
      row_number() over (order by suggestion.id) ordinal
    from app_private.legacy_opening_balance_suggestions suggestion
    left join api.products product on product.id = suggestion.product_id
    where (p_cursor_id is null or suggestion.id > p_cursor_id)
      and suggestion.product_id is not null
      and product.is_active
      and not exists (
        select 1 from api.stock_movements movement
        where movement.product_id = suggestion.product_id
      )
    order by suggestion.id limit p_limit + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'sourceImportRunId', source_import_run_id,
      'sourceRowNumber', source_row_number, 'productCode', product_code,
      'productId', product_id, 'productName', product_name, 'sku', sku,
      'suggestedUnitCost', suggested_unit_cost::text,
      'suggestedOpeningQuantity', suggested_opening_quantity::text,
      'warningCodes', warning_codes, 'requiresConfirmation', true
    ) order by id) filter (where ordinal <= p_limit), '[]'::jsonb),
    (array_agg(id order by id) filter (where ordinal = p_limit))[1]
  into v_items, v_next_id from page;
  if jsonb_array_length(v_items) < p_limit then v_next_id := null; end if;
  return app_private.command_success(
    jsonb_build_object('items', v_items, 'nextCursorId', v_next_id),
    v_correlation_id
  );
end;
$$;

create function api.list_opening_balance_suggestions(
  p_cursor_id uuid default null,
  p_limit integer default 50
)
returns jsonb language sql volatile security invoker set search_path = ''
as $$
  select app_private.list_opening_balance_suggestions_impl(
    p_cursor_id, p_limit
  );
$$;

create function app_private.get_inventory_valuation_impl(
  p_cursor_name text,
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
  v_next_name text;
  v_next_id uuid;
begin
  if not app_private.has_permission('report.cost_profit.read') then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Chỉ chủ cửa hàng được xem giá trị tồn kho.',
      v_correlation_id
    );
  end if;
  if p_limit is null or p_limit not between 1 and 100
    or ((p_cursor_name is null) <> (p_cursor_id is null))
  then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Bộ lọc định giá tồn kho chưa hợp lệ.',
      v_correlation_id
    );
  end if;
  with page as (
    select p.id, p.sku, p.name, p.name_normalized, p.unit_name,
      quantity_balance.on_hand_qty, cost_balance.inventory_value,
      cost_balance.avg_unit_cost,
      row_number() over (order by p.name_normalized, p.id) ordinal
    from api.products p
    join api.inventory_balances quantity_balance
      on quantity_balance.product_id = p.id
    join app_private.inventory_cost_balances cost_balance
      on cost_balance.product_id = p.id
    where p_cursor_name is null
      or (p.name_normalized, p.id) > (p_cursor_name, p_cursor_id)
    order by p.name_normalized, p.id limit p_limit + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'productId', id, 'sku', sku, 'name', name, 'unitName', unit_name,
      'onHandQty', on_hand_qty::text,
      'avgUnitCost', avg_unit_cost::text,
      'inventoryValue', inventory_value::text
    ) order by name_normalized, id)
      filter (where ordinal <= p_limit), '[]'::jsonb),
    (array_agg(name_normalized order by name_normalized, id)
      filter (where ordinal = p_limit))[1],
    (array_agg(id order by name_normalized, id)
      filter (where ordinal = p_limit))[1]
  into v_items, v_next_name, v_next_id from page;
  if jsonb_array_length(v_items) < p_limit then
    v_next_name := null;
    v_next_id := null;
  end if;
  return app_private.command_success(
    jsonb_build_object(
      'items', v_items,
      'nextCursor', case when v_next_id is null then null else
        jsonb_build_object('name', v_next_name, 'id', v_next_id) end,
      'totalInventoryValue', (
        select coalesce(sum(balance.inventory_value), 0)::text
        from app_private.inventory_cost_balances balance
      )
    ),
    v_correlation_id
  );
end;
$$;

create function api.get_inventory_valuation(
  p_cursor_name text default null,
  p_cursor_id uuid default null,
  p_limit integer default 50
)
returns jsonb language sql volatile security invoker set search_path = ''
as $$
  select app_private.get_inventory_valuation_impl(
    p_cursor_name, p_cursor_id, p_limit
  );
$$;

revoke execute on function app_private.next_document_number_impl(text)
from public, anon, authenticated;

revoke execute on function app_private.save_purchase_receipt_draft_impl(
  uuid, bigint, uuid, timestamptz, text, jsonb, uuid
) from public, anon;
revoke execute on function app_private.submit_purchase_receipt_impl(
  uuid, bigint, uuid
) from public, anon;
revoke execute on function app_private.cancel_purchase_receipt_impl(
  uuid, bigint, text, uuid
) from public, anon;
revoke execute on function app_private.post_purchase_receipt_impl(
  uuid, bigint, jsonb, uuid
) from public, anon;
revoke execute on function app_private.reverse_purchase_receipt_impl(
  uuid, text, uuid
) from public, anon;
revoke execute on function app_private.list_purchase_receipts_impl(
  jsonb, timestamptz, uuid, integer
) from public, anon;
revoke execute on function app_private.get_purchase_receipt_operational_impl(
  uuid
) from public, anon;
revoke execute on function app_private.get_purchase_receipt_cost_detail_impl(
  uuid
) from public, anon;
revoke execute on function app_private.save_opening_stock_draft_impl(
  uuid, bigint, text, jsonb, uuid
) from public, anon;
revoke execute on function app_private.submit_opening_stock_impl(
  uuid, bigint, uuid
) from public, anon;
revoke execute on function app_private.cancel_opening_stock_impl(
  uuid, bigint, text, uuid
) from public, anon;
revoke execute on function app_private.post_opening_stock_impl(
  uuid, bigint, uuid
) from public, anon;
revoke execute on function app_private.list_opening_stock_documents_impl(
  timestamptz, uuid, integer
) from public, anon;
revoke execute on function app_private.get_opening_stock_document_impl(uuid)
from public, anon;
revoke execute on function app_private.list_opening_balance_suggestions_impl(
  uuid, integer
) from public, anon;
revoke execute on function app_private.get_inventory_valuation_impl(
  text, uuid, integer
) from public, anon;

revoke execute on function api.save_purchase_receipt_draft(
  uuid, bigint, uuid, timestamptz, text, jsonb, uuid
) from public, anon;
revoke execute on function api.submit_purchase_receipt(uuid, bigint, uuid)
from public, anon;
revoke execute on function api.cancel_purchase_receipt(
  uuid, bigint, text, uuid
) from public, anon;
revoke execute on function api.post_purchase_receipt(
  uuid, bigint, jsonb, uuid
) from public, anon;
revoke execute on function api.reverse_purchase_receipt(uuid, text, uuid)
from public, anon;
revoke execute on function api.list_purchase_receipts(
  jsonb, timestamptz, uuid, integer
) from public, anon;
revoke execute on function api.get_purchase_receipt_operational(uuid)
from public, anon;
revoke execute on function api.get_purchase_receipt_cost_detail(uuid)
from public, anon;
revoke execute on function api.save_opening_stock_draft(
  uuid, bigint, text, jsonb, uuid
) from public, anon;
revoke execute on function api.submit_opening_stock(uuid, bigint, uuid)
from public, anon;
revoke execute on function api.cancel_opening_stock(
  uuid, bigint, text, uuid
) from public, anon;
revoke execute on function api.post_opening_stock(uuid, bigint, uuid)
from public, anon;
revoke execute on function api.list_opening_stock_documents(
  timestamptz, uuid, integer
) from public, anon;
revoke execute on function api.get_opening_stock_document(uuid)
from public, anon;
revoke execute on function api.list_opening_balance_suggestions(uuid, integer)
from public, anon;
revoke execute on function api.get_inventory_valuation(text, uuid, integer)
from public, anon;

grant execute on function app_private.save_purchase_receipt_draft_impl(
  uuid, bigint, uuid, timestamptz, text, jsonb, uuid
) to authenticated;
grant execute on function app_private.submit_purchase_receipt_impl(
  uuid, bigint, uuid
) to authenticated;
grant execute on function app_private.cancel_purchase_receipt_impl(
  uuid, bigint, text, uuid
) to authenticated;
grant execute on function app_private.post_purchase_receipt_impl(
  uuid, bigint, jsonb, uuid
) to authenticated;
grant execute on function app_private.reverse_purchase_receipt_impl(
  uuid, text, uuid
) to authenticated;
grant execute on function app_private.list_purchase_receipts_impl(
  jsonb, timestamptz, uuid, integer
) to authenticated;
grant execute on function app_private.get_purchase_receipt_operational_impl(
  uuid
) to authenticated;
grant execute on function app_private.get_purchase_receipt_cost_detail_impl(
  uuid
) to authenticated;
grant execute on function app_private.save_opening_stock_draft_impl(
  uuid, bigint, text, jsonb, uuid
) to authenticated;
grant execute on function app_private.submit_opening_stock_impl(
  uuid, bigint, uuid
) to authenticated;
grant execute on function app_private.cancel_opening_stock_impl(
  uuid, bigint, text, uuid
) to authenticated;
grant execute on function app_private.post_opening_stock_impl(
  uuid, bigint, uuid
) to authenticated;
grant execute on function app_private.list_opening_stock_documents_impl(
  timestamptz, uuid, integer
) to authenticated;
grant execute on function app_private.get_opening_stock_document_impl(uuid)
to authenticated;
grant execute on function app_private.list_opening_balance_suggestions_impl(
  uuid, integer
) to authenticated;
grant execute on function app_private.get_inventory_valuation_impl(
  text, uuid, integer
) to authenticated;

grant execute on function api.save_purchase_receipt_draft(
  uuid, bigint, uuid, timestamptz, text, jsonb, uuid
) to authenticated;
grant execute on function api.submit_purchase_receipt(uuid, bigint, uuid)
to authenticated;
grant execute on function api.cancel_purchase_receipt(
  uuid, bigint, text, uuid
) to authenticated;
grant execute on function api.post_purchase_receipt(
  uuid, bigint, jsonb, uuid
) to authenticated;
grant execute on function api.reverse_purchase_receipt(uuid, text, uuid)
to authenticated;
grant execute on function api.list_purchase_receipts(
  jsonb, timestamptz, uuid, integer
) to authenticated;
grant execute on function api.get_purchase_receipt_operational(uuid)
to authenticated;
grant execute on function api.get_purchase_receipt_cost_detail(uuid)
to authenticated;
grant execute on function api.save_opening_stock_draft(
  uuid, bigint, text, jsonb, uuid
) to authenticated;
grant execute on function api.submit_opening_stock(uuid, bigint, uuid)
to authenticated;
grant execute on function api.cancel_opening_stock(
  uuid, bigint, text, uuid
) to authenticated;
grant execute on function api.post_opening_stock(uuid, bigint, uuid)
to authenticated;
grant execute on function api.list_opening_stock_documents(
  timestamptz, uuid, integer
) to authenticated;
grant execute on function api.get_opening_stock_document(uuid)
to authenticated;
grant execute on function api.list_opening_balance_suggestions(uuid, integer)
to authenticated;
grant execute on function api.get_inventory_valuation(text, uuid, integer)
to authenticated;

grant execute on all functions in schema api to service_role;
grant execute on all functions in schema app_private to service_role;
