\set ON_ERROR_STOP on
begin;
do $$ begin if current_database() <> 'audit_remediation' then raise exception 'ISOLATED_DATABASE_REQUIRED'; end if; end $$;
insert into app_private.permission_definitions(code,category,label,description)
select permission,'audit',permission,'Synthetic local audit' from unnest(array['sale.draft.manage','sale.complete','sale.discount.apply','sale.own.read','sale.all.read','return.request.create','return.complete']) permission;
insert into auth.users(id,email) values('10000000-0000-4000-8000-000000000001','sales-audit@example.invalid');
insert into api.profiles(id,email,display_name,role_template,must_change_password) values('10000000-0000-4000-8000-000000000001','sales-audit@example.invalid','Synthetic audit','OWNER',false);
insert into api.store_settings(id,display_name) values(1,'Synthetic audit');
insert into api.sales_channels(id,code,name,name_normalized) values('20000000-0000-4000-8000-000000000001','IN_STORE','Local audit','local audit');
insert into api.products(id,sku,sku_normalized,name,name_normalized,unit_name,created_by,updated_by) values('30000000-0000-4000-8000-000000000001','AUDIT','audit','Audit item','audit item','Box','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
insert into api.inventory_balances(product_id,on_hand_qty) values('30000000-0000-4000-8000-000000000001',100);
insert into app_private.inventory_cost_balances(product_id,inventory_value,avg_unit_cost) values('30000000-0000-4000-8000-000000000001',500,5) on conflict(product_id) do update set inventory_value=500,avg_unit_cost=5;
insert into app_private.product_sale_prices(product_id,sale_price,changed_by) values('30000000-0000-4000-8000-000000000001',10,'10000000-0000-4000-8000-000000000001');
insert into app_private.document_sequences(document_type,prefix) values('SALE','HD'),('SALE_RETURN','TH');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$
<<checks>>
declare saved jsonb; completed jsonb; requested jsonb; returned jsonb; result jsonb; sid uuid; lid uuid; rid uuid; rlid uuid; operation uuid; i integer; accepted integer; failures text[] := '{}';
begin
 for i in 1..3 loop
  begin
   saved:=api.save_sale_draft(null,null,null,'20000000-0000-4000-8000-000000000001','[{"productId":"30000000-0000-4000-8000-000000000001","quantity":"5","lineDiscountAmount":"0","lineOrder":0}]','0.01','Return regression',gen_random_uuid());
   if saved->>'ok' is distinct from 'true' then raise exception 'Save: %',saved; end if;
   sid:=(saved#>>'{data,sale,id}')::uuid;
   completed:=api.complete_sale(sid,(saved#>>'{data,sale,version}')::bigint,'CASH',gen_random_uuid(),null);
   if completed->>'ok' is distinct from 'true' then raise exception 'Complete: %',completed; end if;
   select id into lid from api.sale_lines where sale_id=sid;
   requested:=api.create_sale_return_request(sid,'Customer return',jsonb_build_array(jsonb_build_object('originalSaleLineId',lid,'requestedQty','5')),gen_random_uuid());
   if requested->>'ok' is distinct from 'true' then raise exception 'Request: %',requested; end if;
   rid:=(requested#>>'{data,returnId}')::uuid;
   select id into rlid from api.sale_return_lines where sale_return_id=rid;
   if i=3 then
    operation:=gen_random_uuid();
    result:=api.cancel_sale_return(rid,(requested#>>'{data,version}')::bigint,'Cancelled',operation);
    if result->>'ok' is distinct from 'true' then raise exception 'Cancel: %',result; end if;
    if (select requested_at from api.sale_returns where id=rid) is null then raise exception 'Lost request provenance'; end if;
    if api.cancel_sale_return(rid,(requested#>>'{data,version}')::bigint,'Cancelled',operation) is distinct from result then raise exception 'Cancel replay differs'; end if;
    if exists(select 1 from api.sale_return_payments where sale_return_id=rid) or exists(select 1 from api.stock_movements where reference_id=rid) then raise exception 'Cancel changed ledger'; end if;
    result:=api.create_sale_return_request(sid,'After cancel',jsonb_build_array(jsonb_build_object('originalSaleLineId',lid,'requestedQty','5')),gen_random_uuid());
    if result->>'ok' is distinct from 'true' then raise exception 'Cancel did not release quantity'; end if;
   else
    result:=api.complete_sale_return(rid,(requested#>>'{data,version}')::bigint,jsonb_build_array(jsonb_build_object('saleReturnLineId',rlid,'acceptedQty','0')),'CASH',gen_random_uuid(),null);
    if result#>>'{error,code}' is distinct from 'RETURN_NOTHING_ACCEPTED' then raise exception 'Zero accept policy: %',result; end if;
    accepted:=case when i=1 then 5 else 2 end; operation:=gen_random_uuid();
    returned:=api.complete_sale_return(rid,(requested#>>'{data,version}')::bigint,jsonb_build_array(jsonb_build_object('saleReturnLineId',rlid,'acceptedQty',accepted::text)),'CASH',operation,null);
    if returned->>'ok' is distinct from 'true' then raise exception 'Return complete: %',returned; end if;
    if api.complete_sale_return(rid,(requested#>>'{data,version}')::bigint,jsonb_build_array(jsonb_build_object('saleReturnLineId',rlid,'acceptedQty',accepted::text)),'CASH',operation,null) is distinct from returned then raise exception 'Complete replay differs'; end if;
    if (select count(*) from api.sale_return_payments where sale_return_id=rid) <> 1 or (select count(*) from api.stock_movements where reference_id=rid) <> 1 or (select count(*) from app_private.sales_financial_events where sale_return_id=rid) <> 1 then raise exception 'Repeated ledger effects'; end if;
    if i=2 then
     if (select status from api.sales where id=sid) <> 'PARTIALLY_RETURNED' then raise exception 'Partial status wrong'; end if;
     requested:=api.create_sale_return_request(sid,'Remaining three',jsonb_build_array(jsonb_build_object('originalSaleLineId',lid,'requestedQty','3')),gen_random_uuid());
     if requested->>'ok' is distinct from 'true' then raise exception 'Remaining quantity rejected: %',requested#>>'{error,code}'; end if;
     rid:=(requested#>>'{data,returnId}')::uuid;select id into rlid from api.sale_return_lines where sale_return_id=rid;
     returned:=api.complete_sale_return(rid,(requested#>>'{data,version}')::bigint,jsonb_build_array(jsonb_build_object('saleReturnLineId',rlid,'acceptedQty','3')),'CASH',gen_random_uuid(),null);
     if returned->>'ok' is distinct from 'true' then raise exception 'Remaining completion: %',returned; end if;
    end if;
    if (select status from api.sales where id=sid) <> 'RETURNED' then raise exception 'Full return status is not RETURNED'; end if;
    if (select sum(p.amount) from api.sale_return_payments p join api.sale_returns r on r.id=p.sale_return_id where r.original_sale_id=sid) <> 49.99 then raise exception 'Refund discount rounding did not close'; end if;
   end if;
   raise notice 'PASS return scenario %',i;
  exception when others then
   failures:=array_append(failures,format('scenario %s: %s',i,SQLERRM));
   raise notice 'FAIL scenario %: %',i,SQLERRM;
  end;
 end loop;
 if cardinality(failures)>0 then raise exception 'Return regressions: %',failures; end if;
end $$;
rollback;
