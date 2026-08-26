-- Supabase Data API does not support overloaded RPC names. Keep one public
-- signature per operation; PostgreSQL supplies the nullable proof default for
-- older clients that omit it.

drop function api.complete_sale(uuid,bigint,text,uuid);

create or replace function api.complete_sale(
  p_sale_id uuid,
  p_expected_version bigint,
  p_payment_method text,
  p_idempotency_key uuid,
  p_transfer_proof_path text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.complete_sale_with_payment_proof_impl(
    p_sale_id,
    p_expected_version,
    p_payment_method,
    p_idempotency_key,
    p_transfer_proof_path
  );
$$;

drop function api.complete_sale_return(uuid,bigint,jsonb,text,uuid);

create or replace function api.complete_sale_return(
  p_return_id uuid,
  p_expected_version bigint,
  p_lines jsonb,
  p_refund_method text,
  p_idempotency_key uuid,
  p_transfer_proof_path text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.complete_sale_return_with_payment_proof_impl(
    p_return_id,
    p_expected_version,
    p_lines,
    p_refund_method,
    p_idempotency_key,
    p_transfer_proof_path
  );
$$;

revoke all on function
  api.complete_sale(uuid,bigint,text,uuid,text),
  api.complete_sale_return(uuid,bigint,jsonb,text,uuid,text)
from public, anon;
grant execute on function
  api.complete_sale(uuid,bigint,text,uuid,text),
  api.complete_sale_return(uuid,bigint,jsonb,text,uuid,text)
to authenticated;
