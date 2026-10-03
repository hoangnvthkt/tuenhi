-- Read-only release gate. Behavioral fixtures run only on isolated PostgreSQL.
begin read only;
do $$
declare definition text;
begin
  if not exists(select 1 from pg_constraint where conrelid='api.sale_returns'::regclass and conname='sale_returns_requested_history_check' and convalidated) then
    raise exception 'RETURN_CANCELLATION_HISTORY_CONSTRAINT_MISSING';
  end if;
  select pg_get_functiondef('app_private.create_sale_return_request_impl(uuid,text,jsonb,uuid)'::regprocedure) into definition;
  if position('then return_line.accepted_qty else return_line.requested_qty' in definition)=0 then raise exception 'RETURN_RESERVATION_FIX_MISSING'; end if;
  if exists(select 1 from pg_proc where oid in ('api.create_sale_return_request(uuid,text,jsonb,uuid)'::regprocedure,'api.complete_sale_return(uuid,bigint,jsonb,text,uuid,text)'::regprocedure,'api.cancel_sale_return(uuid,bigint,text,uuid)'::regprocedure) and prosecdef) then raise exception 'EXPOSED_RETURN_DEFINER'; end if;
  if has_schema_privilege('anon','app_private','usage') and has_function_privilege('anon','app_private.complete_sale_return_impl(uuid,bigint,jsonb,text,uuid)','execute') then raise exception 'ANON_RETURN_ACCESS'; end if;
end $$;
rollback;
