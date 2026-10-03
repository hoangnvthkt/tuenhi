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
declare saved jsonb; refreshed jsonb; result jsonb; sid uuid; ver bigint;
begin
 saved:=api.save_sale_draft(null,null,null,'20000000-0000-4000-8000-000000000001','[{"productId":"30000000-0000-4000-8000-000000000001","quantity":"5","lineDiscountAmount":"0","lineOrder":0}]','0','Checkout guard',gen_random_uuid());
 if saved->>'ok' is distinct from 'true' then raise exception 'Save failed: %',saved; end if;
 sid:=(saved#>>'{data,sale,id}')::uuid; ver:=(saved#>>'{data,sale,version}')::bigint;
 result:=api.complete_sale(sid,ver+1,'CASH',gen_random_uuid(),null);
 if result#>>'{error,code}' is distinct from 'VERSION_CONFLICT' then raise exception 'Version guard: %',result; end if;
 update app_private.product_sale_prices set sale_price=12 where product_id='30000000-0000-4000-8000-000000000001';
 result:=api.complete_sale(sid,ver,'CASH',gen_random_uuid(),null);
 if result#>>'{error,code}' is distinct from 'PRICE_CHANGED' then raise exception 'Price guard: %',result; end if;
 if exists(select 1 from api.payments) or exists(select 1 from api.stock_movements) or exists(select 1 from app_private.sales_financial_events) then raise exception 'Rejected checkout changed ledger'; end if;
 update app_private.product_sale_prices set sale_price=10 where product_id='30000000-0000-4000-8000-000000000001';
 update api.inventory_balances set on_hand_qty=0;
 result:=api.get_sale_draft_print(sid);
 if result->>'ok' is distinct from 'true' then raise exception 'Zero stock print: %',result; end if;
 result:=api.complete_sale(sid,ver,'CASH',gen_random_uuid(),null);
 if result#>>'{error,code}' is distinct from 'INSUFFICIENT_STOCK' then raise exception 'Stock guard: %',result; end if;
 raise notice 'PASS checkout version, price, stock guards and zero-stock provisional print';
end $$;
rollback;
