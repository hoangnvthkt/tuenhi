\set ON_ERROR_STOP on
begin;
do $$ begin if current_database() <> 'audit_remediation' then raise exception 'ISOLATED_DATABASE_REQUIRED'; end if; end $$;
insert into app_private.permission_definitions(code,category,label,description)
select permission,'audit',permission,'Synthetic local audit' from unnest(array['inventory.count.draft','inventory.adjustment.post']) permission;
insert into auth.users(id,email) values('10000000-0000-4000-8000-000000000001','sales-audit@example.invalid');
insert into api.profiles(id,email,display_name,role_template,must_change_password) values('10000000-0000-4000-8000-000000000001','sales-audit@example.invalid','Synthetic audit','OWNER',false);
insert into api.store_settings(id,display_name) values(1,'Synthetic audit');
insert into api.sales_channels(id,code,name,name_normalized) values('20000000-0000-4000-8000-000000000001','IN_STORE','Local audit','local audit');
insert into api.products(id,sku,sku_normalized,name,name_normalized,unit_name,created_by,updated_by) values('30000000-0000-4000-8000-000000000001','AUDIT','audit','Audit item','audit item','Box','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
insert into api.inventory_balances(product_id,on_hand_qty) values('30000000-0000-4000-8000-000000000001',100);
insert into app_private.inventory_cost_balances(product_id,inventory_value,avg_unit_cost) values('30000000-0000-4000-8000-000000000001',500,5) on conflict(product_id) do update set inventory_value=500,avg_unit_cost=5;
insert into app_private.product_sale_prices(product_id,sale_price,changed_by) values('30000000-0000-4000-8000-000000000001',10,'10000000-0000-4000-8000-000000000001');
insert into app_private.document_sequences(document_type,prefix) values('STOCK_COUNT','KK');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$
declare result jsonb; cid uuid; v bigint; old_v bigint;
begin
 result:=api.save_stock_count(null,null,'Count five','[{"productId":"30000000-0000-4000-8000-000000000001","countedQty":"5"}]',gen_random_uuid());
 if result->>'ok' is distinct from 'true' then raise exception 'Initial save: %',result; end if;
 cid:=(result#>>'{data,countId}')::uuid; old_v:=(result#>>'{data,version}')::bigint;
 result:=api.save_stock_count(cid,old_v,'Count nine','[{"productId":"30000000-0000-4000-8000-000000000001","countedQty":"9"}]',gen_random_uuid());
 if result->>'ok' is distinct from 'true' then raise exception 'Save nine: %',result; end if;
 v:=(result#>>'{data,version}')::bigint;
 result:=api.submit_stock_count(cid,old_v,gen_random_uuid());
 if result#>>'{error,code}' is distinct from 'VERSION_CONFLICT' then raise exception 'Stale count accepted: %',result; end if;
 result:=api.submit_stock_count(cid,v,gen_random_uuid());
 if result->>'ok' is distinct from 'true' then raise exception 'Submit nine: %',result; end if;
 result:=api.post_stock_count(cid,(result#>>'{data,version}')::bigint,'[]',gen_random_uuid());
 if result->>'ok' is distinct from 'true' then raise exception 'Post nine: %',result; end if;
 if (select on_hand_qty from api.inventory_balances where product_id='30000000-0000-4000-8000-000000000001') <> 9 then raise exception 'Posted other than saved nine'; end if;
 result:=api.save_stock_count(null,null,'Recount','[{"productId":"30000000-0000-4000-8000-000000000001","countedQty":"9"}]',gen_random_uuid());
 cid:=(result#>>'{data,countId}')::uuid;
 result:=api.submit_stock_count(cid,(result#>>'{data,version}')::bigint,gen_random_uuid());
 result:=api.refresh_stock_count_snapshot(cid,(result#>>'{data,version}')::bigint,gen_random_uuid());
 if result->>'ok' is distinct from 'true' then raise exception 'Recount: %',result; end if;
 v:=(result#>>'{data,version}')::bigint;
 if exists(select 1 from api.stock_count_lines where stock_count_id=cid and counted_qty is not null) then raise exception 'Stale recount'; end if;
 result:=api.submit_stock_count(cid,v,gen_random_uuid());
 if result#>>'{error,code}' is distinct from 'VALIDATION_FAILED' then raise exception 'Uncounted accepted: %',result; end if;
 result:=api.save_stock_count(cid,v,'Zero is counted','[{"productId":"30000000-0000-4000-8000-000000000001","countedQty":"0"}]',gen_random_uuid());
 result:=api.submit_stock_count(cid,(result#>>'{data,version}')::bigint,gen_random_uuid());
 if result->>'ok' is distinct from 'true' then raise exception 'Zero count rejected: %',result; end if;
 raise notice 'PASS saved nine, stale version, cleared recount, null versus zero';
end $$;
rollback;
