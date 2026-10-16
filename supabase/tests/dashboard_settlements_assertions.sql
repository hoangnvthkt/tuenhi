-- Read-only production release assertions; never seeds test financial rows.
begin read only;
do $$
declare impl oid:='app_private.get_sale_settlement_report_impl(date,date,text,text,timestamptz,uuid,integer)'::regprocedure; api_fn oid:='api.get_sale_settlement_report(date,date,text,text,timestamptz,uuid,integer)'::regprocedure; helper oid:='app_private.sale_settlement_rows(date,date,uuid)'::regprocedure;
 actor uuid; result jsonb; day date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date; expected record;
begin
 if not exists(select 1 from pg_proc where oid=impl and prosecdef and proconfig @> array['search_path=""']) then raise exception 'SETTLEMENT_IMPL_SECURITY_INVALID'; end if;
 if not exists(select 1 from pg_proc where oid=api_fn and not prosecdef and proconfig @> array['search_path=""']) then raise exception 'SETTLEMENT_API_SECURITY_INVALID'; end if;
 if has_function_privilege('anon',impl,'EXECUTE') or has_function_privilege('anon',api_fn,'EXECUTE') or has_function_privilege('authenticated',helper,'EXECUTE') then raise exception 'SETTLEMENT_GRANTS_EXCESSIVE'; end if;
 if not has_function_privilege('authenticated',impl,'EXECUTE') or not has_function_privilege('authenticated',api_fn,'EXECUTE') then raise exception 'SETTLEMENT_GRANTS_MISSING'; end if;
 select id into actor from api.profiles where role_template='OWNER' and is_active and not must_change_password limit 1;
 if actor is not null then
  perform set_config('request.jwt.claim.sub',actor::text,true);
  execute 'set local role authenticated';
  result:=api.get_sale_settlement_report(day,day,'ALL','ALL',null,null,1);
  execute 'reset role';
  if result->>'ok' is distinct from 'true' then raise exception 'SETTLEMENT_OWNER_READ_FAILED %',result; end if;
  select coalesce(sum(cash_amount),0) cash,coalesce(sum(bank_transfer_amount),0) bank,coalesce(sum(outstanding_amount),0) debt into expected from app_private.sale_settlement_rows(day,day,null);
  if (result#>>'{data,summary,cashAmount}')::numeric<>expected.cash or (result#>>'{data,summary,bankTransferAmount}')::numeric<>expected.bank or (result#>>'{data,summary,outstandingAmount}')::numeric<>expected.debt then raise exception 'SETTLEMENT_SUMMARY_NOT_FULL_RANGE'; end if;
 end if;
 perform set_config('request.jwt.claim.sub','',true);
 result:=api.get_sale_settlement_report(day,day,'OWN','ALL',null,null,50);
 if result#>>'{error,code}' is distinct from 'PERMISSION_DENIED' then raise exception 'SETTLEMENT_AUTH_REQUIRED'; end if;
end $$;
rollback;
