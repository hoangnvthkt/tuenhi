-- Read-only schema and privilege check, safe on the installed release.
begin read only;
do $$
declare name text; exposed regprocedure; implementation regprocedure;
begin
 foreach name in array array['list_sales_v2','list_sale_returns_v2','list_stock_counts_v2'] loop
  exposed:=to_regprocedure(format('api.%I(jsonb,timestamptz,uuid,integer)',name));
  implementation:=to_regprocedure(format('app_private.%I(jsonb,timestamptz,uuid,integer)',name||'_impl'));
  if exposed is null or implementation is null then raise exception 'PAGINATION_ENDPOINT_MISSING: %',name; end if;
  if (select prosecdef from pg_proc where oid=exposed) or not (select prosecdef from pg_proc where oid=implementation) then raise exception 'PAGINATION_SECURITY_BOUNDARY: %',name; end if;
  if has_function_privilege('anon',exposed,'execute') or has_function_privilege('anon',implementation,'execute') then raise exception 'ANON_PAGINATION_ACCESS: %',name; end if;
  if not has_function_privilege('authenticated',exposed,'execute') or not has_function_privilege('authenticated',implementation,'execute') then raise exception 'PAGINATION_AUTHENTICATED_GRANT_MISSING: %',name; end if;
 end loop;
 if position('v_has_more' in pg_get_functiondef('app_private.list_purchase_receipts_impl(jsonb,timestamptz,uuid,integer)'::regprocedure))=0 then raise exception 'FILTERED_PURCHASE_CURSOR_FIX_MISSING'; end if;
 if position('limit effective_limit + 1' in pg_get_functiondef('app_private.get_my_notifications_impl(boolean,timestamptz,uuid,integer)'::regprocedure))=0 then raise exception 'NOTIFICATION_LAST_CURSOR_FIX_MISSING'; end if;
end $$;
rollback;
