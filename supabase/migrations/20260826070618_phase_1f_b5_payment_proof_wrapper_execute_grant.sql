-- api.complete_sale and api.complete_sale_return are security invoker
-- wrappers. They call these private proof implementations as authenticated;
-- this narrowly restores that internal execution path without exposing either
-- function to anon or public callers.
revoke all on function
  app_private.complete_sale_with_payment_proof_impl(uuid,bigint,text,uuid,text),
  app_private.complete_sale_return_with_payment_proof_impl(uuid,bigint,jsonb,text,uuid,text)
from public, anon;

grant execute on function
  app_private.complete_sale_with_payment_proof_impl(uuid,bigint,text,uuid,text),
  app_private.complete_sale_return_with_payment_proof_impl(uuid,bigint,jsonb,text,uuid,text)
to authenticated;
