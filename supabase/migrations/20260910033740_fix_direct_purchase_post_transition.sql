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
  update api.purchase_receipts
  set status = 'AWAITING_COST',
      submitted_by = v_actor_id,
      submitted_at = now(),
      updated_at = now()
  where id = p_receipt_id;
  v_result := app_private.post_purchase_receipt_impl(
    p_receipt_id, p_expected_version, v_cost_lines, p_idempotency_key
  );
  if not coalesce((v_result ->> 'ok')::boolean, false) then
    update api.purchase_receipts
    set status = 'DRAFT',
        submitted_by = null,
        submitted_at = null,
        updated_at = now()
    where id = p_receipt_id and status = 'AWAITING_COST';
  end if;
  return v_result;
end;
$$;
