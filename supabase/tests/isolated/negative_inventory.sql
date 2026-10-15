-- Synthetic data only. Run against the disposable Unix-socket database in the runbook.
\set ON_ERROR_STOP on
begin;
do $$ begin
 if current_database()<>'pos_negative_stock' or inet_server_addr() is not null then
  raise exception 'ISOLATED_DATABASE_REQUIRED';
 end if;
end $$;
insert into app_private.permission_definitions(code,category,label,description)
select p,'negative-inventory',p,'Synthetic local fixture' from unnest(array[
 'catalog.read','dashboard.operational.read','sale.draft.manage','sale.complete','sale.cancel','sale.own.read','sale.all.read',
 'return.request.create','return.complete','purchase.post','purchase.cost.enter','purchase.reverse',
 'inventory.count.draft','inventory.count.submit','inventory.adjustment.post']) p on conflict do nothing;
insert into auth.users(id,email) values('96000000-0000-4000-8000-000000000001','negative-stock@example.invalid');
insert into api.profiles(id,email,display_name,role_template,must_change_password) values
 ('96000000-0000-4000-8000-000000000001','negative-stock@example.invalid','Negative stock owner','OWNER',false);
insert into api.store_settings(id,display_name) values(1,'Synthetic negative stock');
insert into api.sales_channels(id,code,name,name_normalized) values('96000000-0000-4000-8000-000000000002','IN_STORE','Local test','local test');
insert into app_private.document_sequences(document_type,prefix) values('SALE','HD'),('SALE_RETURN','TH'),('PURCHASE_RECEIPT','PN'),('STOCK_COUNT','KK') on conflict do nothing;
select set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000001',true);
create function pg_temp.assert_equal(actual numeric,expected numeric,label text) returns void language plpgsql as $$ begin
 if actual is distinct from expected then raise exception '%: expected %, got %',label,expected,actual; end if;
end $$;
create function pg_temp.product(label text,qty integer default 0,stock_value numeric default 0) returns uuid language plpgsql as $$
declare p uuid:=gen_random_uuid(); begin
 insert into api.products(id,sku,sku_normalized,name,name_normalized,unit_name,created_by,updated_by)
 values(p,label,lower(label),label,lower(label),'Box',auth.uid(),auth.uid());
 insert into api.inventory_balances(product_id,on_hand_qty) values(p,qty);
 update app_private.inventory_cost_balances set inventory_value=stock_value,avg_unit_cost=case when qty>0 then stock_value/qty else 0 end where product_id=p;
 insert into app_private.product_sale_prices(product_id,sale_price,changed_by) values(p,100,auth.uid());
 return p;
end $$;
create function pg_temp.sell(p uuid,qty integer) returns uuid language plpgsql as $$
declare r jsonb; draft uuid; key uuid:=gen_random_uuid(); replay jsonb; begin
 r:=api.save_sale_draft(null,null,null,'96000000-0000-4000-8000-000000000002',jsonb_build_array(jsonb_build_object('productId',p,'quantity',qty::text,'lineDiscountAmount','0','lineOrder',0)),'0','Synthetic sale',gen_random_uuid());
 if r->>'ok' is distinct from 'true' then raise exception 'DRAFT_FAILED: %',r; end if;
 draft:=(r#>>'{data,sale,id}')::uuid;
 r:=api.complete_sale(draft,(r#>>'{data,sale,version}')::bigint,'CASH',key,null);
 if r->>'ok' is distinct from 'true' then raise exception 'NEGATIVE_SALE_MUST_COMPLETE: %',r; end if;
 replay:=api.complete_sale(draft,1,'CASH',key,null);
 if replay is distinct from r then raise exception 'SALE_RETRY_NOT_IDEMPOTENT'; end if;
 return draft;
end $$;
create function pg_temp.restock(p uuid,qty integer,unit_cost numeric) returns uuid language plpgsql as $$
declare receipt uuid:=gen_random_uuid(); line uuid:=gen_random_uuid(); key uuid:=gen_random_uuid(); r jsonb; replay jsonb; costs jsonb; begin
 insert into api.purchase_receipts(id,status,received_at,created_by,submitted_by,submitted_at)
 values(receipt,'AWAITING_COST',now(),auth.uid(),auth.uid(),now());
 insert into api.purchase_receipt_lines(id,purchase_receipt_id,product_id,product_name,sku,unit_name,received_qty,line_order)
 select line,receipt,p,name,sku,unit_name,qty,0 from api.products where id=p;
 costs:=jsonb_build_array(jsonb_build_object('lineId',line,'unitCost',unit_cost::text));
 r:=api.post_purchase_receipt(receipt,1,costs,key);
 if r->>'ok' is distinct from 'true' then raise exception 'RESTOCK_FAILED: %',r; end if;
 replay:=api.post_purchase_receipt(receipt,1,costs,key);
 if replay is distinct from r then raise exception 'RESTOCK_RETRY_NOT_IDEMPOTENT'; end if;
 return receipt;
end $$;
create function pg_temp.return_units(s uuid,qty integer) returns uuid language plpgsql as $$
declare r jsonb; rid uuid; line uuid; k uuid:=gen_random_uuid(); payload jsonb; begin
 select id into line from api.sale_lines where sale_id=s;
 r:=api.create_sale_return_request(s,'Synthetic return',jsonb_build_array(jsonb_build_object('originalSaleLineId',line,'requestedQty',qty::text)),gen_random_uuid());
 if r->>'ok' is distinct from 'true' then raise exception 'RETURN_REQUEST_FAILED: %',r; end if;
 rid:=(r#>>'{data,returnId}')::uuid;
 select id into line from api.sale_return_lines where sale_return_id=rid;
 payload:=jsonb_build_array(jsonb_build_object('saleReturnLineId',line,'acceptedQty',qty::text));
 r:=api.complete_sale_return(rid,1,payload,'CASH',k,null);
 if r->>'ok' is distinct from 'true' then raise exception 'RETURN_FAILED: %',r; end if;
 if api.complete_sale_return(rid,1,payload,'CASH',k,null) is distinct from r then raise exception 'RETURN_RETRY_NOT_IDEMPOTENT'; end if;
 return rid;
end $$;
create function pg_temp.cancel(s uuid) returns void language plpgsql as $$
declare r jsonb; v bigint; k uuid:=gen_random_uuid(); begin
 select version into v from api.sales where id=s;
 r:=api.cancel_sale(s,v,'Synthetic cancellation',k);
 if r->>'ok' is distinct from 'true' then raise exception 'CANCEL_FAILED: %',r; end if;
 if api.cancel_sale(s,v,'Synthetic cancellation',k) is distinct from r then raise exception 'CANCEL_RETRY_NOT_IDEMPOTENT'; end if;
end $$;
create function pg_temp.cogs(s uuid) returns numeric language sql as $$ select sum(c.cogs_total_snapshot) from api.sale_lines l join app_private.sale_line_costs c on c.sale_line_id=l.id where l.sale_id=s $$;
-- The first regression fails on the original INSUFFICIENT_STOCK guard.
do $$ declare p uuid; s uuid; receipt uuid; other uuid; r uuid; response jsonb; i integer; begin
 p:=pg_temp.product('ZERO'); s:=pg_temp.sell(p,5);
 perform pg_temp.assert_equal((select on_hand_qty from api.inventory_balances where product_id=p),-5,'zero-stock sale');
 perform pg_temp.assert_equal(pg_temp.cogs(s),0,'unfunded COGS is provisional zero');
 response:=api.get_product_catalog(p_search=>'ZERO',p_stock_state=>'OUT_OF_STOCK');
 if jsonb_array_length(response#>'{data,items}') is distinct from 1 then raise exception 'NEGATIVE_OUT_OF_STOCK_FILTER_MISSING: %',response; end if;
 response:=api.get_operational_dashboard(current_date,current_date);
 if (response#>>'{data,catalog,outOfStockCount}')::integer is distinct from 1 then raise exception 'NEGATIVE_OUT_OF_STOCK_DASHBOARD_MISSING: %',response; end if;
 other:=pg_temp.sell(p,2);
 receipt:=pg_temp.restock(p,3,7);
 perform pg_temp.assert_equal((select on_hand_qty from api.inventory_balances where product_id=p),-4,'partial restock signed balance');
 perform pg_temp.assert_equal(pg_temp.cogs(s),21,'FIFO first sale correction');
 perform pg_temp.assert_equal(pg_temp.cogs(other),0,'FIFO later sale stays provisional');
 perform pg_temp.assert_equal((select inventory_value from app_private.inventory_cost_balances where product_id=p),0,'partial restock holds no inventory value');
 receipt:=pg_temp.restock(p,6,11);
 perform pg_temp.assert_equal(pg_temp.cogs(s),43,'first sale mixed replenishment costs');
 perform pg_temp.assert_equal(pg_temp.cogs(other),22,'second sale fully funded');
 perform pg_temp.assert_equal((select on_hand_qty from api.inventory_balances where product_id=p),2,'restock crosses positive');
 perform pg_temp.assert_equal((select inventory_value from app_private.inventory_cost_balances where product_id=p),22,'only remaining receipt units valued');
 response:=api.reverse_purchase_receipt(receipt,'Must not undo recognized sale cost',gen_random_uuid());
 if response#>>'{error,code}' is distinct from 'PURCHASE_REVERSAL_BLOCKED' then raise exception 'ALLOCATED_RECEIPT_REVERSAL_ALLOWED: %',response; end if;
 raise notice 'PASS zero/negative sales, FIFO partial/full replenishment, blocked allocated reversal';
 p:=pg_temp.product('CROSS',2,10); s:=pg_temp.sell(p,5);
 perform pg_temp.assert_equal(pg_temp.cogs(s),10,'known units costed before shortage');
 perform pg_temp.restock(p,3,9);
 perform pg_temp.assert_equal(pg_temp.cogs(s),37,'crossing sale corrected');
 perform pg_temp.assert_equal((select on_hand_qty from api.inventory_balances where product_id=p),0,'exact restock closes zero without division');
 perform pg_temp.assert_equal((select inventory_value from app_private.inventory_cost_balances where product_id=p),0,'exact restock leaves zero value');
 p:=pg_temp.product('ROUND',3,1); s:=pg_temp.sell(p,4);
 perform pg_temp.assert_equal(pg_temp.cogs(s),1,'known stock consumes full rounding remainder');
 perform pg_temp.restock(p,1,0.01);
 perform pg_temp.assert_equal(pg_temp.cogs(s),1.01,'cent-accurate deferred cost');
 raise notice 'PASS crossing positive stock, exact zero and cost rounding';
 p:=pg_temp.product('CANCEL-OPEN'); s:=pg_temp.sell(p,4); other:=pg_temp.sell(p,2);
 perform pg_temp.cancel(s);
 perform pg_temp.assert_equal((select on_hand_qty from api.inventory_balances where product_id=p),-2,'cancel removes only own shortage');
 perform pg_temp.restock(p,2,8);
 perform pg_temp.assert_equal(pg_temp.cogs(s),0,'cancelled shortage is never funded');
 perform pg_temp.assert_equal(pg_temp.cogs(other),16,'remaining sale funded after cancellation');
 p:=pg_temp.product('CANCEL-FUNDED'); s:=pg_temp.sell(p,3); perform pg_temp.restock(p,3,6); other:=pg_temp.sell(p,2);
 perform pg_temp.cancel(s);
 perform pg_temp.assert_equal(pg_temp.cogs(other),12,'cancelled costed goods fund later shortage');
 perform pg_temp.assert_equal((select on_hand_qty from api.inventory_balances where product_id=p),1,'cancellation fills newer shortage');
 perform pg_temp.assert_equal((select inventory_value from app_private.inventory_cost_balances where product_id=p),6,'only spare cancellation value remains');
 p:=pg_temp.product('CANCEL-PARTIAL'); s:=pg_temp.sell(p,5); perform pg_temp.restock(p,2,7);
 perform pg_temp.cancel(s);
 perform pg_temp.assert_equal((select on_hand_qty from api.inventory_balances where product_id=p),2,'partial funded cancellation quantity');
 perform pg_temp.assert_equal((select inventory_value from app_private.inventory_cost_balances where product_id=p),14,'partial funded cancellation value');
 raise notice 'PASS cancellation of unresolved, partially funded and fully funded shortages';
 p:=pg_temp.product('RETURN-OPEN'); s:=pg_temp.sell(p,5); perform pg_temp.restock(p,2,7);
 r:=pg_temp.return_units(s,2);
 perform pg_temp.assert_equal((select on_hand_qty from api.inventory_balances where product_id=p),-1,'unfunded return shrinks own deficit');
 perform pg_temp.assert_equal((select cogs_delta from app_private.sales_financial_events where sale_return_id=r),0,'unfunded return reverses no known cost');
 perform pg_temp.restock(p,1,11);
 perform pg_temp.assert_equal(pg_temp.cogs(s),25,'only unreturned shortage funded');
 r:=pg_temp.return_units(s,3);
 perform pg_temp.assert_equal((select inventory_value from app_private.inventory_cost_balances where product_id=p),25,'full remaining return restores recognized cost');
 perform pg_temp.assert_equal((select on_hand_qty from api.inventory_balances where product_id=p),3,'full remaining return quantity');
 p:=pg_temp.product('RETURN-FUNDED'); s:=pg_temp.sell(p,3); perform pg_temp.restock(p,3,6); other:=pg_temp.sell(p,2);
 perform pg_temp.return_units(s,3);
 perform pg_temp.assert_equal(pg_temp.cogs(other),12,'costed return funds newer shortage');
 perform pg_temp.assert_equal((select inventory_value from app_private.inventory_cost_balances where product_id=p),6,'costed return leaves spare unit value');
 raise notice 'PASS returns cancel own pending cost first and transfer known cost to newer shortages';
 p:=pg_temp.product('ROUND-RETURN',6,0.04); s:=pg_temp.sell(p,6);
 for i in 1..6 loop perform pg_temp.sell(p,1); end loop;
 perform pg_temp.return_units(s,6);
 perform pg_temp.assert_equal((select sum(a.allocated_cost) from app_private.sale_inventory_cost_allocations a join app_private.sale_inventory_shortages d on d.id=a.shortage_id where d.product_id=p),0.04,'fractional-cent cost allocation conserves cents');
 perform pg_temp.assert_equal((select inventory_value from app_private.inventory_cost_balances where product_id=p),0,'fractional-cent return leaves no inventory asset');
 raise notice 'PASS return spreads mixed unit costs across many shortages without negative cents';
end $$;
-- Global accounting identities, independently derived from fixture opening values (11.04).
do $$ begin
 perform pg_temp.assert_equal((select sum(inventory_value) from app_private.inventory_cost_balances),
  11.04+(select sum(c.line_cost) from app_private.purchase_receipt_line_costs c)
    -(select sum(cogs_delta) from app_private.sales_financial_events),'inventory plus net COGS conserves actual purchase cost');
 perform pg_temp.assert_equal((select sum(cogs_delta) from app_private.inventory_cost_movements),
  (select sum(cogs_delta) from app_private.sales_financial_events),'inventory COGS agrees with reporting COGS');
 if exists(select 1 from api.inventory_balances b join app_private.inventory_cost_balances c using(product_id) where b.on_hand_qty<=0 and (c.inventory_value<>0 or c.avg_unit_cost<>0)) then raise exception 'NONPOSITIVE_STOCK_HAS_ASSET_VALUE'; end if;
 if exists(select 1 from api.inventory_balances b where b.on_hand_qty<> (case when b.on_hand_qty<0 then -(select coalesce(sum(remaining_qty),0) from app_private.sale_inventory_shortages d where d.product_id=b.product_id) else b.on_hand_qty end)) then raise exception 'SHORTAGE_BALANCE_MISMATCH'; end if;
 if has_table_privilege('authenticated','app_private.sale_inventory_shortages','select') or has_table_privilege('anon','app_private.sale_inventory_shortages','select') then raise exception 'PRIVATE_COST_EXPOSED'; end if;
 raise notice 'PASS ledger conservation, signed value invariants and private costing permissions';
end $$;
-- Counts reconcile physical units from a signed snapshot; increases are valued at
-- an explicit estimate and fund the outstanding sale before holding asset value.
do $$ declare p uuid; s uuid; r jsonb; count_id uuid; line uuid; estimates jsonb; key uuid:=gen_random_uuid(); begin
 p:=pg_temp.product('COUNT-NEGATIVE'); s:=pg_temp.sell(p,3);
 r:=api.save_stock_count(null,null,'Negative stock physical count',jsonb_build_array(jsonb_build_object('productId',p,'countedQty','2')),gen_random_uuid());
 if r->>'ok' is distinct from 'true' then raise exception 'SIGNED_SNAPSHOT_SAVE_FAILED: %',r; end if;
 count_id:=(r#>>'{data,countId}')::uuid;
 select id into line from api.stock_count_lines where stock_count_id=count_id;
 r:=api.get_stock_count(count_id);
 if r#>>'{data,lines,0,requiresEstimatedCost}' is distinct from 'true' then raise exception 'NEGATIVE_COUNT_ESTIMATE_NOT_REQUIRED: %',r; end if;
 r:=api.submit_stock_count(count_id,1,gen_random_uuid());
 if r->>'ok' is distinct from 'true' then raise exception 'COUNT_SUBMIT_FAILED: %',r; end if;
 r:=api.post_stock_count(count_id,2,'[]',gen_random_uuid());
 if r#>>'{error,code}' is distinct from 'VALIDATION_FAILED' then raise exception 'NEGATIVE_COUNT_MISSING_COST_ACCEPTED: %',r; end if;
 perform pg_temp.assert_equal((select on_hand_qty from api.inventory_balances where product_id=p),-3,'rejected count unchanged');
 estimates:=jsonb_build_array(jsonb_build_object('stockCountLineId',line,'estimatedUnitCost','4.50'));
 r:=api.post_stock_count(count_id,2,estimates,key);
 if r->>'ok' is distinct from 'true' then raise exception 'NEGATIVE_COUNT_POST_FAILED: %',r; end if;
 if api.post_stock_count(count_id,2,estimates,key) is distinct from r then raise exception 'COUNT_REPLAY_NOT_IDEMPOTENT'; end if;
 perform pg_temp.assert_equal(pg_temp.cogs(s),13.50,'count settles missing sale cost');
 perform pg_temp.assert_equal((select inventory_value from app_private.inventory_cost_balances where product_id=p),9,'count values positive remainder');
 perform pg_temp.assert_equal((select inventory_value_delta from app_private.stock_count_adjustment_costs where stock_count_line_id=line),9,'count asset delta excludes consumed units');
 perform pg_temp.assert_equal((select c.cogs_delta from app_private.inventory_cost_movements c join api.stock_movements m on m.id=c.stock_movement_id where m.reference_id=count_id),13.50,'count cost ledger correction');
 raise notice 'PASS stock-count signed snapshot, explicit estimate, cost allocation and retries';
end $$;
-- Authenticated RPCs retain authorization and version guards while permitting
-- the new signed balance. Cost settlement helpers remain inaccessible directly.
create temporary table negative_inventory_auth_fixture(sale_id uuid);
do $$ declare p uuid; r jsonb; begin
 p:=pg_temp.product('AUTHENTICATED-NEGATIVE');
 r:=api.save_sale_draft(null,null,null,'96000000-0000-4000-8000-000000000002',jsonb_build_array(jsonb_build_object('productId',p,'quantity','1','lineDiscountAmount','0','lineOrder',0)),'0','Authenticated fixture',gen_random_uuid());
 if r->>'ok' is distinct from 'true' then raise exception 'AUTH_DRAFT_FAILED: %',r; end if;
 insert into negative_inventory_auth_fixture values((r#>>'{data,sale,id}')::uuid);
end $$;
grant select on negative_inventory_auth_fixture to authenticated;
grant usage on schema api,app_private to authenticated;
grant execute on function api.complete_sale(uuid,bigint,text,uuid,text),app_private.complete_sale_with_payment_proof_impl(uuid,bigint,text,uuid,text) to authenticated;
set local role authenticated;
do $$ declare r jsonb; s uuid; begin
 select sale_id into s from negative_inventory_auth_fixture;
 r:=api.complete_sale(s,999,'CASH',gen_random_uuid(),null);
 if r#>>'{error,code}' is distinct from 'VERSION_CONFLICT' then raise exception 'AUTH_VERSION_GUARD_BYPASSED: %',r; end if;
 r:=api.complete_sale(s,1,'CASH',gen_random_uuid(),null);
 if r->>'ok' is distinct from 'true' then raise exception 'AUTH_NEGATIVE_SALE_FAILED: %',r; end if;
 perform set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000099',true);
 r:=api.complete_sale(s,1,'CASH',gen_random_uuid(),null);
 if r#>>'{error,code}' is distinct from 'PERMISSION_DENIED' then raise exception 'UNAUTHORIZED_SALE_ALLOWED: %',r; end if;
 if has_function_privilege(current_user,'app_private.allocate_inbound_inventory_cost(uuid,numeric,numeric,uuid)','EXECUTE')
 or has_function_privilege(current_user,'app_private.release_sale_inventory_shortage(uuid,numeric,numeric,numeric)','EXECUTE') then raise exception 'PRIVATE_COST_HELPER_EXPOSED'; end if;
 raise notice 'PASS authenticated checkout, version/permission guards and private helper privileges';
end $$;
reset role;
rollback;
