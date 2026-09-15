begin;

select set_config(
  'request.jwt.claim.sub',
  (
    select profile.id::text
    from api.profiles profile
    where profile.role_template = 'OWNER' and profile.is_active
    order by profile.created_at
    limit 1
  ),
  true
);

select set_config(
  'tuenhi.test_product_id',
  (
    select product.id::text
    from api.products product
    where product.is_active
    order by product.created_at
    limit 1
  ),
  true
);

set local role authenticated;

do $$
declare
  v_product_id uuid := current_setting('tuenhi.test_product_id')::uuid;
  v_post_key uuid := gen_random_uuid();
  v_save_result jsonb;
  v_post_result jsonb;
  v_replay_result jsonb;
  v_validation_result jsonb;
begin
  select api.save_purchase_receipt_draft(
    null,
    null,
    null,
    now(),
    null,
    jsonb_build_array(jsonb_build_object(
      'productId', v_product_id,
      'receivedQty', '1'
    )),
    gen_random_uuid()
  ) into v_validation_result;

  if coalesce((v_validation_result ->> 'ok')::boolean, true)
    or v_validation_result -> 'error' ->> 'code' <> 'VALIDATION_FAILED'
  then
    raise exception 'A purchase draft without unit cost was accepted: %',
      v_validation_result;
  end if;

  select api.save_purchase_receipt_draft(
    null,
    null,
    null,
    now(),
    'Kiểm thử rollback luồng nhập hàng có giá',
    jsonb_build_array(jsonb_build_object(
      'productId', v_product_id,
      'receivedQty', '1',
      'unitCost', '1000'
    )),
    gen_random_uuid()
  ) into v_save_result;

  if not coalesce((v_save_result ->> 'ok')::boolean, false) then
    raise exception 'Saving a priced purchase draft failed: %', v_save_result;
  end if;

  select api.post_purchase_receipt(
    (v_save_result -> 'data' ->> 'receiptId')::uuid,
    (v_save_result -> 'data' ->> 'version')::bigint,
    '[]'::jsonb,
    v_post_key
  ) into v_post_result;

  if not coalesce((v_post_result ->> 'ok')::boolean, false)
    or v_post_result -> 'data' ->> 'status' <> 'POSTED'
    or v_post_result -> 'data' ->> 'receiptNumber' !~ '^PN[0-9]{6}$'
  then
    raise exception 'Posting a priced purchase draft failed: %', v_post_result;
  end if;

  select api.post_purchase_receipt(
    (v_save_result -> 'data' ->> 'receiptId')::uuid,
    (v_save_result -> 'data' ->> 'version')::bigint,
    '[]'::jsonb,
    v_post_key
  ) into v_replay_result;

  if v_replay_result <> v_post_result then
    raise exception 'Replaying a purchase post did not return the cached result: %',
      v_replay_result;
  end if;
end;
$$;

rollback;
