-- Fixture data is permitted only in the disposable local database.
do $$ begin
  if current_database() <> 'feedback_alerts' then raise exception 'ISOLATED_TEST_DATABASE_REQUIRED'; end if;
end $$;
begin;
insert into auth.users(id) select ('20000000-0000-4000-8000-00000000000'||n)::uuid from generate_series(1,6) n;
insert into api.profiles(id,email,display_name,role_template,is_active,must_change_password)
select ('20000000-0000-4000-8000-00000000000'||n)::uuid,'fixture-'||n||'@example.invalid','Fixture '||n,
 case when n in (1,4) then 'OWNER' when n=3 then 'BUSINESS' when n=6 then 'WAREHOUSE_VIEWER' else 'SALES_WAREHOUSE' end,n<>4,false
from generate_series(1,6) n;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
insert into app_private.user_permission_overrides(user_id,permission_code,effect,changed_by,reason)
values ('20000000-0000-4000-8000-000000000005','inventory.read','REVOKE','20000000-0000-4000-8000-000000000001','Fixture revoke');
insert into api.products(id,sku,sku_normalized,name,name_normalized,unit_name,min_stock_qty,created_by,updated_by)
values
 ('20000000-0000-4000-8000-000000000011','BOX','box','Hàng hộp','hàng hộp','Hộp',0,'20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000012','CASE','case','Hàng thùng','hàng thùng','Thùng',0,'20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
insert into api.inventory_balances(product_id,on_hand_qty) values
 ('20000000-0000-4000-8000-000000000011',50),('20000000-0000-4000-8000-000000000012',1);
do $$ declare response jsonb; begin
 if exists(select 1 from api.user_notifications where category='Tồn kho') then raise exception '50 boxes/non-box zero-threshold must not alert'; end if;
 response := api.get_product_catalog(p_stock_state=>'LOW_STOCK');
 if jsonb_array_length(response#>'{data,items}')<>0 then raise exception '50 must not be included in low stock'; end if;
 response := api.get_product_catalog(p_stock_state=>'IN_STOCK');
 if jsonb_array_length(response#>'{data,items}')<>2 then raise exception 'Threshold stock must be in stock'; end if;
end $$;
update api.inventory_balances set on_hand_qty=49 where product_id='20000000-0000-4000-8000-000000000011';
do $$ declare response jsonb; begin
 if (select count(*) from api.user_notifications where category='Tồn kho')<>4 then raise exception 'Expected owner and all effective inventory readers'; end if;
 if exists(select 1 from api.user_notifications where category='Tồn kho' and user_id not in ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000006')) then raise exception 'Wrong recipient'; end if;
 if not exists(select 1 from api.user_notifications where category='Tồn kho' and metadata->>'onHandQty'='49' and metadata->>'threshold'='50') then raise exception 'Wrong alert quantities'; end if;
 response := api.get_product_detail('20000000-0000-4000-8000-000000000011');
 if response#>>'{data,minStockQty}'<>'0' then raise exception 'Configured threshold must survive an editor round trip'; end if;
 if response#>>'{data,effectiveMinStockQty}'<>'50' then raise exception 'Catalog threshold disagrees with notifications'; end if;
 response := api.get_product_catalog(p_stock_state=>'LOW_STOCK');
 if jsonb_array_length(response#>'{data,items}')<>1 then raise exception '49 must be included in low stock'; end if;
end $$;
-- Round-trip the editor's stored minimum through an unrelated edit and a unit change.
savepoint threshold_round_trip;
do $$ declare response jsonb; begin
 response := api.get_product_detail('20000000-0000-4000-8000-000000000011');
 update api.products set description='Unrelated edit',min_stock_qty=(response#>>'{data,minStockQty}')::numeric
 where id='20000000-0000-4000-8000-000000000011';
 response := api.get_product_detail('20000000-0000-4000-8000-000000000011');
 if response#>>'{data,minStockQty}'<>'0' then raise exception 'Unrelated save changed configured threshold'; end if;
 update api.products set unit_name='Thùng',min_stock_qty=(response#>>'{data,minStockQty}')::numeric
 where id='20000000-0000-4000-8000-000000000011';
 response := api.get_product_detail('20000000-0000-4000-8000-000000000011');
 if response#>>'{data,effectiveMinStockQty}'<>'0' then raise exception 'Unset minimum must follow the new product unit'; end if;
end $$;
rollback to threshold_round_trip;
update api.user_notifications set read_at=now() where category='Tồn kho';
update api.inventory_balances set on_hand_qty=48 where product_id='20000000-0000-4000-8000-000000000011';
update api.inventory_balances set on_hand_qty=0 where product_id='20000000-0000-4000-8000-000000000011';
do $$ declare response jsonb; begin
 if (select count(*) from api.user_notifications where category='Tồn kho')<>4 then raise exception 'Repeated notification after reading or reaching zero'; end if;
 response := api.get_operational_dashboard(current_date,current_date);
 if response#>>'{data,catalog,lowStockCount}'<>'1' then raise exception 'Dashboard must include zero below the threshold'; end if;
end $$;
update api.inventory_balances set on_hand_qty=50 where product_id='20000000-0000-4000-8000-000000000011';
savepoint no_false_alert;
update api.inventory_balances set on_hand_qty=49 where product_id='20000000-0000-4000-8000-000000000011';
rollback to no_false_alert;
do $$ begin
 if (select count(*) from api.user_notifications where category='Tồn kho')<>4 then raise exception 'Rolled-back stock change published an alert'; end if;
end $$;
update api.inventory_balances set on_hand_qty=0 where product_id='20000000-0000-4000-8000-000000000011';
do $$ begin
 if (select count(*) from api.user_notifications where category='Tồn kho')<>8 then raise exception 'Recovery must permit a new episode, including zero'; end if;
end $$;
-- A custom minimum uses the stored unit, without converting cases to boxes.
update api.products set min_stock_qty=2 where id='20000000-0000-4000-8000-000000000012';
do $$ begin
 if (select count(*) from api.user_notifications where category='Tồn kho')<>12 then raise exception 'Threshold change must evaluate existing stock'; end if;
 if exists(select 1 from api.user_notifications where entity_id='20000000-0000-4000-8000-000000000012' and metadata->>'unitName'<>'Thùng') then raise exception 'Incorrect unit conversion'; end if;
 perform app_private.refresh_low_stock_episode('20000000-0000-4000-8000-000000000011');
 perform app_private.refresh_low_stock_episode('20000000-0000-4000-8000-000000000012');
 if (select count(*) from api.user_notifications where category='Tồn kho')<>12 then raise exception 'Reconciliation must not repeat existing episodes'; end if;
end $$;
rollback;
