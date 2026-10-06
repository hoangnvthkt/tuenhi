\set ON_ERROR_STOP on
begin;
do $$ begin if current_database() <> 'payment_proof_test' or inet_server_addr() is not null then raise exception 'ISOLATED_DATABASE_REQUIRED'; end if; end $$;
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
insert into storage.buckets(id,name) values ('payment-proofs','payment-proofs');
do $$
declare
 saved jsonb; completed jsonb; requested jsonb; returned jsonb; result jsonb;
 sid uuid; lid uuid; rid uuid; rlid uuid; sale_key uuid; return_key uuid;
 sale_path text; return_path text; replacement_path text; version bigint; return_version bigint; return_lines jsonb; i integer;
begin
 for i in 1..2 loop
  saved := api.save_sale_draft(null,null,null,'20000000-0000-4000-8000-000000000001','[{"productId":"30000000-0000-4000-8000-000000000001","quantity":"5","lineDiscountAmount":"0","lineOrder":0}]','0','Optional proof regression',gen_random_uuid());
  if saved->>'ok' is distinct from 'true' then raise exception 'Save failed: %',saved; end if;
  sid := (saved#>>'{data,sale,id}')::uuid;
  version := (saved#>>'{data,sale,version}')::bigint;
  sale_key := gen_random_uuid();
  sale_path := case when i=2 then 'sales/'||sid||'/'||gen_random_uuid()||'.jpg' end;
  if sale_path is not null then
   insert into storage.objects(bucket_id,name,owner_id) values ('payment-proofs',sale_path,'10000000-0000-4000-8000-000000000001');
  end if;
  result := api.complete_sale(sid,version,'BANK_TRANSFER',gen_random_uuid(),'sales/'||sid||'/'||gen_random_uuid()||'.jpg');
  if result#>>'{error,code}' is distinct from 'TRANSFER_PROOF_INVALID' then raise exception 'Unowned sale proof accepted: %',result; end if;
  result := api.complete_sale(sid,version,'CASH',gen_random_uuid(),coalesce(sale_path,'invalid.jpg'));
  if result#>>'{error,code}' is distinct from 'TRANSFER_PROOF_INVALID' then raise exception 'Cash sale proof accepted: %',result; end if;
  if exists(select 1 from api.payments where sale_id=sid) then raise exception 'Invalid proof created payment'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  result := api.complete_sale(sid,version,'BANK_TRANSFER',gen_random_uuid(),null);
  if result->>'ok' is distinct from 'false' then raise exception 'Unauthenticated transfer accepted: %',result; end if;
  perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
  result := api.complete_sale(sid,version+100,'BANK_TRANSFER',gen_random_uuid(),sale_path);
  if result->>'ok' is distinct from 'false' or exists(select 1 from api.payments where sale_id=sid) then raise exception 'Failed command changed payment'; end if;
  completed := api.complete_sale(sid,version,'BANK_TRANSFER',sale_key,sale_path);
  if completed->>'ok' is distinct from 'true' then raise exception 'Bank sale failed: %',completed; end if;
  if api.complete_sale(sid,version,'BANK_TRANSFER',sale_key,null) is distinct from completed then raise exception 'Sale replay differs'; end if;
  if (select count(*) from api.payments where sale_id=sid) <> 1 then raise exception 'Duplicate sale payment'; end if;
  if sale_path is not null then
   replacement_path := 'sales/'||sid||'/'||gen_random_uuid()||'.jpg';
   insert into storage.objects(bucket_id,name,owner_id) values ('payment-proofs',replacement_path,'10000000-0000-4000-8000-000000000001');
   if api.complete_sale(sid,version,'BANK_TRANSFER',sale_key,replacement_path) is distinct from completed then raise exception 'Sale attached replay differs'; end if;
  end if;
  if (select transfer_proof_path from api.payments where sale_id=sid) is distinct from sale_path then raise exception 'Sale proof lost on replay'; end if;
  select id into lid from api.sale_lines where sale_id=sid;
  requested := api.create_sale_return_request(sid,'Return optional proof test',jsonb_build_array(jsonb_build_object('originalSaleLineId',lid,'requestedQty','5')),gen_random_uuid());
  if requested->>'ok' is distinct from 'true' then raise exception 'Return request failed: %',requested; end if;
  rid := (requested#>>'{data,returnId}')::uuid;
  return_version := (requested#>>'{data,version}')::bigint;
  select id into rlid from api.sale_return_lines where sale_return_id=rid;
  return_lines := jsonb_build_array(jsonb_build_object('saleReturnLineId',rlid,'acceptedQty','5'));
  return_key := gen_random_uuid();
  return_path := case when i=2 then 'returns/'||rid||'/'||gen_random_uuid()||'.png' end;
  if return_path is not null then
   insert into storage.objects(bucket_id,name,owner_id) values ('payment-proofs',return_path,'10000000-0000-4000-8000-000000000001');
  end if;
  result := api.complete_sale_return(rid,return_version,return_lines,'BANK_TRANSFER',gen_random_uuid(),'returns/'||rid||'/'||gen_random_uuid()||'.png');
  if result#>>'{error,code}' is distinct from 'TRANSFER_PROOF_INVALID' then raise exception 'Unowned return proof accepted: %',result; end if;
  result := api.complete_sale_return(rid,return_version,return_lines,'CASH',gen_random_uuid(),coalesce(return_path,'invalid.jpg'));
  if result#>>'{error,code}' is distinct from 'TRANSFER_PROOF_INVALID' then raise exception 'Cash refund proof accepted: %',result; end if;
  if exists(select 1 from api.sale_return_payments where sale_return_id=rid) then raise exception 'Invalid proof created refund'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  result := api.complete_sale_return(rid,return_version,return_lines,'BANK_TRANSFER',gen_random_uuid(),null);
  if result->>'ok' is distinct from 'false' then raise exception 'Unauthenticated refund accepted: %',result; end if;
  perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
  result := api.complete_sale_return(rid,return_version+100,return_lines,'BANK_TRANSFER',gen_random_uuid(),return_path);
  if result->>'ok' is distinct from 'false' or exists(select 1 from api.sale_return_payments where sale_return_id=rid) then raise exception 'Failed command changed refund'; end if;
  returned := api.complete_sale_return(rid,return_version,return_lines,'BANK_TRANSFER',return_key,return_path);
  if returned->>'ok' is distinct from 'true' then raise exception 'Bank refund failed: %',returned; end if;
  if api.complete_sale_return(rid,return_version,return_lines,'BANK_TRANSFER',return_key,null) is distinct from returned then raise exception 'Return replay differs'; end if;
  if return_path is not null then
   replacement_path := 'returns/'||rid||'/'||gen_random_uuid()||'.png';
   insert into storage.objects(bucket_id,name,owner_id) values ('payment-proofs',replacement_path,'10000000-0000-4000-8000-000000000001');
   if api.complete_sale_return(rid,return_version,return_lines,'BANK_TRANSFER',return_key,replacement_path) is distinct from returned then raise exception 'Refund attached replay differs'; end if;
  end if;
  if (select transfer_proof_path from api.sale_return_payments where sale_return_id=rid) is distinct from return_path then raise exception 'Return proof lost on replay'; end if;
  if (select count(*) from api.sale_return_payments where sale_return_id=rid) <> 1 or (select count(*) from api.stock_movements where reference_id=rid) <> 1 or (select count(*) from app_private.sales_financial_events where sale_return_id=rid) <> 1 then raise exception 'Duplicate refund ledger effects'; end if;
  raise notice 'PASS bank sale/refund optional proof scenario %',i;
 end loop;
end $$;
rollback;
