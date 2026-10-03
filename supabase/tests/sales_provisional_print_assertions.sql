-- Read-only rollout assertions. No operational rows are created or changed.
begin;
set transaction read only;
do $$
declare v_signature text;
begin
  foreach v_signature in array array['api.get_sale_draft_print(uuid)', 'app_private.get_sale_draft_print_impl(uuid)'] loop
    if to_regprocedure(v_signature) is null then raise exception 'Provisional print function missing: %',v_signature; end if;
    if not has_function_privilege('authenticated',v_signature,'EXECUTE')
      or has_function_privilege('anon',v_signature,'EXECUTE')
      or has_function_privilege('public',v_signature,'EXECUTE') then
      raise exception 'Unsafe provisional print grants: %',v_signature;
    end if;
    if not (select coalesce(proconfig,'{}'::text[]) @> array['search_path=""'] and provolatile = 's' from pg_proc where oid=v_signature::regprocedure) then
      raise exception 'Provisional print must be stable with empty search_path: %',v_signature;
    end if;
  end loop;
  if (select prosecdef from pg_proc where oid='api.get_sale_draft_print(uuid)'::regprocedure)
    or not (select prosecdef from pg_proc where oid='app_private.get_sale_draft_print_impl(uuid)'::regprocedure) then
    raise exception 'Provisional print must use a private definer and public invoker';
  end if;
  perform set_config('request.jwt.claim.sub','',true);
  if api.get_sale_draft_print(gen_random_uuid()) #>> '{error,code}' <> 'PERMISSION_DENIED' then
    raise exception 'No-session draft print must fail closed';
  end if;
end $$;
rollback;
