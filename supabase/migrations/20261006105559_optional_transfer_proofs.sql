-- Transfer proofs are optional. Supplied proofs still require ownership and
-- the correct transaction path; attach them only after a successful command.
begin;

create or replace function app_private.complete_sale_with_payment_proof_impl(
  p_sale_id uuid,
  p_expected_version bigint,
  p_payment_method text,
  p_idempotency_key uuid,
  p_transfer_proof_path text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_correlation uuid := gen_random_uuid();
  v_result jsonb;
begin
  if p_payment_method = 'BANK_TRANSFER' and p_transfer_proof_path is not null
    and not app_private.payment_proof_path_is_owned(
    p_transfer_proof_path, 'sale', p_sale_id, v_actor
  ) then
    return app_private.command_error('TRANSFER_PROOF_INVALID', 'Ảnh chứng từ chuyển khoản không hợp lệ.', v_correlation);
  end if;
  if p_payment_method = 'CASH' and p_transfer_proof_path is not null then
    return app_private.command_error('TRANSFER_PROOF_INVALID', 'Chỉ giao dịch chuyển khoản mới được đính kèm ảnh chứng từ.', v_correlation);
  end if;

  v_result := app_private.complete_sale_impl(
    p_sale_id, p_expected_version, p_payment_method, p_idempotency_key
  );
  if p_payment_method = 'BANK_TRANSFER' and p_transfer_proof_path is not null
    and (v_result ->> 'ok') = 'true' then
    update api.payments
    set transfer_proof_path = p_transfer_proof_path
    where sale_id = p_sale_id and method = 'BANK_TRANSFER' and status = 'CAPTURED'
      and transfer_proof_path is null;
  end if;
  return v_result;
end;
$$;

create or replace function app_private.complete_sale_return_with_payment_proof_impl(
  p_return_id uuid,
  p_expected_version bigint,
  p_lines jsonb,
  p_refund_method text,
  p_idempotency_key uuid,
  p_transfer_proof_path text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_correlation uuid := gen_random_uuid();
  v_result jsonb;
begin
  if p_refund_method = 'BANK_TRANSFER' and p_transfer_proof_path is not null
    and not app_private.payment_proof_path_is_owned(
    p_transfer_proof_path, 'return', p_return_id, v_actor
  ) then
    return app_private.command_error('TRANSFER_PROOF_INVALID', 'Ảnh chứng từ hoàn tiền không hợp lệ.', v_correlation);
  end if;
  if p_refund_method = 'CASH' and p_transfer_proof_path is not null then
    return app_private.command_error('TRANSFER_PROOF_INVALID', 'Chỉ hoàn tiền chuyển khoản mới được đính kèm ảnh chứng từ.', v_correlation);
  end if;

  v_result := app_private.complete_sale_return_impl(
    p_return_id, p_expected_version, p_lines, p_refund_method, p_idempotency_key
  );
  if p_refund_method = 'BANK_TRANSFER' and p_transfer_proof_path is not null
    and (v_result ->> 'ok') = 'true' then
    update api.sale_return_payments
    set transfer_proof_path = p_transfer_proof_path
    where sale_return_id = p_return_id and method = 'BANK_TRANSFER' and status = 'REFUNDED'
      and transfer_proof_path is null;
  end if;
  return v_result;
end;
$$;

revoke all on function
  app_private.complete_sale_with_payment_proof_impl(uuid,bigint,text,uuid,text),
  app_private.complete_sale_return_with_payment_proof_impl(uuid,bigint,jsonb,text,uuid,text)
from public, anon;

grant execute on function
  app_private.complete_sale_with_payment_proof_impl(uuid,bigint,text,uuid,text),
  app_private.complete_sale_return_with_payment_proof_impl(uuid,bigint,jsonb,text,uuid,text)
to authenticated;

commit;
