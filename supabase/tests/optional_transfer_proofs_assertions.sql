-- Read-only deployment checks. Behavioral fixtures belong on isolated local PostgreSQL.
begin read only;
do $$
declare
  function_id oid;
  definition text;
begin
  foreach function_id in array array[
    'app_private.complete_sale_with_payment_proof_impl(uuid,bigint,text,uuid,text)'::regprocedure::oid,
    'app_private.complete_sale_return_with_payment_proof_impl(uuid,bigint,jsonb,text,uuid,text)'::regprocedure::oid
  ] loop
    if not exists (
      select 1 from pg_proc
      where oid = function_id and prosecdef
        and proconfig @> array['search_path=""']
    ) then raise exception 'PAYMENT_PROOF_FUNCTION_SECURITY_INVALID'; end if;
    if has_function_privilege('anon', function_id, 'EXECUTE')
      or not has_function_privilege('authenticated', function_id, 'EXECUTE') then
      raise exception 'PAYMENT_PROOF_FUNCTION_GRANTS_INVALID';
    end if;
    definition := pg_get_functiondef(function_id);
    if position('TRANSFER_PROOF_REQUIRED' in definition) > 0
      or position('p_transfer_proof_path is not null' in definition) = 0
      or position('payment_proof_path_is_owned' in definition) = 0
      or position('transfer_proof_path is null' in definition) = 0 then
      raise exception 'OPTIONAL_PAYMENT_PROOF_GUARDS_MISSING';
    end if;
  end loop;
end $$;
rollback;
