\set ON_ERROR_STOP on
-- Đợt 2b dashboard 07/11/2026: tồn tách 4 trạng thái, doanh thu theo sản phẩm
-- khớp doanh thu thuần, và các bộ lọc mà biểu đồ dẫn tới. Local PG only.
begin;
do $$ begin if current_database() <> 'dashboard_pie_test' or inet_server_addr() is not null then raise exception 'ISOLATED_DATABASE_REQUIRED'; end if; end $$;
insert into app_private.permission_definitions(code,category,label,description)
select permission,'audit',permission,'Synthetic local audit' from unnest(array['sale.draft.manage','sale.complete','sale.cancel','sale.discount.apply','sale.own.read','sale.all.read','return.request.create','return.complete','report.all_revenue.read','report.own_revenue.read']) permission
on conflict (code) do nothing;
insert into auth.users(id,email) values('10000000-0000-4000-8000-000000000001','dashboard-pie@example.invalid');
insert into api.profiles(id,email,display_name,role_template,must_change_password) values('10000000-0000-4000-8000-000000000001','dashboard-pie@example.invalid','Synthetic dashboard','OWNER',false);
insert into api.store_settings(id,display_name) values(1,'Synthetic dashboard');
insert into api.sales_channels(id,code,name,name_normalized) values('20000000-0000-4000-8000-000000000001','IN_STORE','Local dashboard','local dashboard');
-- PIE1 đủ, PIE2 sắp hết (3 < tối thiểu 10), PIE3 hết (= 0), PIE4 âm kho; PIE5–7 đủ.
insert into api.products(id,sku,sku_normalized,name,name_normalized,unit_name,min_stock_qty,created_by,updated_by)
select ('3000000' || n || '-0000-4000-8000-000000000001')::uuid, 'PIE' || n, 'pie' || n, 'Pie item ' || n, 'pie item ' || n, 'Box',
  case when n = 2 then 10 else 0 end,
  '10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'
from generate_series(1,7) n;
insert into api.inventory_balances(product_id,on_hand_qty)
select id, case sku when 'PIE2' then 3 when 'PIE3' then 0 when 'PIE4' then -2 else 100 end from api.products where sku like 'PIE%';
insert into app_private.inventory_cost_balances(product_id,inventory_value,avg_unit_cost)
select id,500,5 from api.products where sku like 'PIE%' and sku not in ('PIE3','PIE4')
on conflict(product_id) do update set inventory_value=500,avg_unit_cost=5;
insert into app_private.product_sale_prices(product_id,sale_price,changed_by)
select id, case sku when 'PIE1' then 20000 when 'PIE2' then 10000 when 'PIE5' then 5000 when 'PIE6' then 3000 else 1000 end,
  '10000000-0000-4000-8000-000000000001' from api.products where sku like 'PIE%';
insert into app_private.document_sequences(document_type,prefix) values('SALE','HD'),('SALE_RETURN','TH') on conflict do nothing;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);

create function pg_temp.sale(lines jsonb, order_discount text, cash text) returns uuid language plpgsql as $$
declare saved jsonb; result jsonb; sid uuid;
begin
 saved:=api.save_sale_draft(null,null,null,'20000000-0000-4000-8000-000000000001',lines,order_discount,'Pie fixture',gen_random_uuid());
 if saved->>'ok' is distinct from 'true' then raise exception 'SAVE_FAILED %',saved; end if;
 sid:=(saved#>>'{data,sale,id}')::uuid;
 result:=api.complete_sale_with_allocations(sid,(saved#>>'{data,sale,version}')::bigint,cash,'0',gen_random_uuid(),null);
 if result->>'ok' is distinct from 'true' then raise exception 'COMPLETE_FAILED %',result; end if;
 return sid;
end $$;
create function pg_temp.line(n int, qty int) returns jsonb language sql as $$
 select jsonb_build_object('productId','3000000' || n || '-0000-4000-8000-000000000001','quantity',qty::text,'lineDiscountAmount','0','lineOrder',n)
$$;
create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'Asia/Ho_Chi_Minh')::date $$;
create function pg_temp.skus(state text) returns text language sql as $$
 select string_agg(item->>'sku',',' order by item->>'sku')
 from jsonb_array_elements(api.get_product_catalog(null,null,state,false,null,null,100)#>'{data,items}') item
$$;

-- Tồn: 4 trạng thái rời nhau, cộng đủ số sản phẩm; bộ lọc ra đúng danh sách.
do $$
declare r jsonb; s jsonb;
begin
 r:=api.get_operational_dashboard(pg_temp.today(),pg_temp.today());
 s:=r#>'{data,catalog,stockStates}';
 if s is distinct from '{"inStock":4,"runningLow":1,"zeroStock":1,"negativeStock":1}'::jsonb then raise exception 'STOCK_STATES_WRONG %',s; end if;
 if (s->>'inStock')::int+(s->>'runningLow')::int+(s->>'zeroStock')::int+(s->>'negativeStock')::int <> (r#>>'{data,catalog,activeProductCount}')::int then
  raise exception 'STOCK_STATES_DO_NOT_ADD_UP %',r#>'{data,catalog}';
 end if;
 if (pg_temp.skus('IN_STOCK'),pg_temp.skus('RUNNING_LOW'),pg_temp.skus('ZERO_STOCK'),pg_temp.skus('NEGATIVE_STOCK'))
   is distinct from ('PIE1,PIE5,PIE6,PIE7'::text,'PIE2'::text,'PIE3'::text,'PIE4'::text) then
  raise exception 'STOCK_FILTERS_WRONG % % % %',pg_temp.skus('IN_STOCK'),pg_temp.skus('RUNNING_LOW'),pg_temp.skus('ZERO_STOCK'),pg_temp.skus('NEGATIVE_STOCK');
 end if;
 -- Bộ lọc cũ giữ nguyên nghĩa.
 if (pg_temp.skus('OUT_OF_STOCK'),pg_temp.skus('LOW_STOCK')) is distinct from ('PIE3,PIE4'::text,'PIE2,PIE4'::text) then
  raise exception 'LEGACY_STOCK_FILTERS_CHANGED';
 end if;
 if api.get_product_catalog(null,null,'BOGUS',false,null,null,10)#>>'{error,code}' is distinct from 'VALIDATION_FAILED' then raise exception 'BAD_STATE_ACCEPTED'; end if;
 raise notice 'PASS stock states are disjoint and match their product filters';
end $$;

-- Doanh thu theo sản phẩm: bán, giảm giá đơn, hủy, trả; top 3 + Khác; cộng đúng doanh thu thuần.
do $$
declare a uuid; b uuid; c uuid; r jsonb; rev jsonb; rid uuid; rlid uuid; v bigint; items jsonb; total numeric;
begin
 a:=pg_temp.sale(jsonb_build_array(pg_temp.line(1,2),pg_temp.line(2,1)),'1000','49000');
 b:=pg_temp.sale(jsonb_build_array(pg_temp.line(5,1),pg_temp.line(6,1),pg_temp.line(7,1)),'0','9000');
 c:=pg_temp.sale(jsonb_build_array(pg_temp.line(2,3)),'0','30000');
 select version into v from api.sales where id=c;
 r:=api.cancel_sale(c,v,'Hủy thử',gen_random_uuid());
 if r->>'ok' is distinct from 'true' then raise exception 'CANCEL_FAILED %',r; end if;
 r:=api.create_sale_return_request(a,'Trả một hộp',jsonb_build_array(jsonb_build_object('originalSaleLineId',(select id from api.sale_lines where sale_id=a and line_order=1),'requestedQty','1')),gen_random_uuid());
 if r->>'ok' is distinct from 'true' then raise exception 'RETURN_REQUEST_FAILED %',r; end if;
 rid:=(r#>>'{data,returnId}')::uuid;
 select id into rlid from api.sale_return_lines where sale_return_id=rid;
 r:=api.complete_sale_return(rid,(r#>>'{data,version}')::bigint,jsonb_build_array(jsonb_build_object('saleReturnLineId',rlid,'acceptedQty','1')),'CASH',gen_random_uuid(),null);
 if r->>'ok' is distinct from 'true' then raise exception 'RETURN_FAILED %',r; end if;

 r:=api.get_dashboard_product_revenue(pg_temp.today(),pg_temp.today(),'ALL');
 if r->>'ok' is distinct from 'true' then raise exception 'PRODUCT_REVENUE_FAILED %',r; end if;
 rev:=api.get_revenue_report(pg_temp.today(),pg_temp.today(),'ALL');
 items:=r#>'{data,items}';
 select coalesce(sum((item->>'netRevenue')::numeric),0) into total from jsonb_array_elements(items) item;
 if total+(r#>>'{data,otherNetRevenue}')::numeric <> (r#>>'{data,totalNetRevenue}')::numeric
   or (r#>>'{data,totalNetRevenue}')::numeric <> (rev#>>'{data,summary,netRevenue}')::numeric then
  raise exception 'PRODUCT_REVENUE_DOES_NOT_RECONCILE % vs %',r->'data',rev#>'{data,summary}';
 end if;
 -- PIE1 2×20.000 − 800 giảm đơn, trả 1 hộp; PIE2 chỉ còn đơn a (đơn c đã hủy).
 if jsonb_array_length(items)<>3 or items#>>'{0,productName}'<>'Pie item 1' or items#>>'{1,productName}'<>'Pie item 2'
   or items#>>'{2,productName}'<>'Pie item 5' or (r#>>'{data,otherProductCount}')::int<>2 or (r#>>'{data,otherNetRevenue}')::numeric<>4000 then
  raise exception 'PRODUCT_REVENUE_RANKING_WRONG %',r->'data';
 end if;
 if (items#>>'{1,netRevenue}')::numeric <> (select net_amount from api.sale_lines where sale_id=a and line_order=2) then
  raise exception 'CANCELLED_SALE_NOT_REVERSED %',items->1;
 end if;
 if api.get_dashboard_product_revenue(pg_temp.today(),pg_temp.today(),'BOGUS')#>>'{error,code}' is distinct from 'REPORT_SCOPE_DENIED' then raise exception 'BAD_SCOPE_ACCEPTED'; end if;

 -- Bấm lát sản phẩm → chi tiết thanh toán chỉ các đơn có sản phẩm đó.
 r:=api.get_sale_settlement_report(pg_temp.today(),pg_temp.today(),'ALL','ALL',null,null,50,'30000005-0000-4000-8000-000000000001');
 if jsonb_array_length(r#>'{data,items}')<>1 or (r#>>'{data,items,0,id}')::uuid<>b or r#>>'{data,product,name}'<>'Pie item 5'
   or (r#>>'{data,summary,cashAmount}')::numeric<>9000 then
  raise exception 'PRODUCT_SETTLEMENT_FILTER_WRONG %',r->'data';
 end if;
 r:=api.get_sale_settlement_report(pg_temp.today(),pg_temp.today(),'ALL','ALL',null,null,50);
 if jsonb_array_length(r#>'{data,items}')<>3 or r#>'{data,product}' <> 'null'::jsonb then raise exception 'UNFILTERED_SETTLEMENT_CHANGED %',r->'data'; end if;
 if api.get_sale_settlement_report(pg_temp.today(),pg_temp.today(),'ALL','ALL',null,null,50,gen_random_uuid())#>>'{error,code}' is distinct from 'VALIDATION_FAILED' then
  raise exception 'UNKNOWN_PRODUCT_ACCEPTED';
 end if;

 -- Bấm thẻ Trả hàng → phiếu trả hoàn tất trong kỳ.
 r:=api.list_sale_returns_v2(jsonb_build_object('status','COMPLETED','completedFrom',pg_temp.today(),'completedTo',pg_temp.today()),null,null,50);
 if jsonb_array_length(r#>'{data,items}')<>1 or (r#>>'{data,items,0,id}')::uuid<>rid then raise exception 'RETURN_PERIOD_FILTER_WRONG %',r; end if;
 r:=api.list_sale_returns_v2(jsonb_build_object('completedFrom',pg_temp.today()+1),null,null,50);
 if jsonb_array_length(r#>'{data,items}')<>0 then raise exception 'RETURN_FUTURE_FILTER_WRONG %',r; end if;
 if api.list_sale_returns_v2('{"completedFrom":"hôm nay"}',null,null,50)#>>'{error,code}' is distinct from 'VALIDATION_FAILED' then raise exception 'BAD_RETURN_DATE_ACCEPTED'; end if;
 raise notice 'PASS product revenue reconciles with net revenue and every slice has a filtered list';
end $$;
rollback;
