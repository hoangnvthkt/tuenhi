\set ON_ERROR_STOP on
-- Báo cáo Bán chạy 10/11/2026: top 5 sản phẩm theo doanh thu thuần, kèm số lượng
-- thuần (bán − hủy − trả), khớp doanh thu thuần của báo cáo. Local PG only.
begin;
do $$ begin if current_database() <> 'report_top_products_test' or inet_server_addr() is not null then raise exception 'ISOLATED_DATABASE_REQUIRED'; end if; end $$;
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

-- Bán, giảm giá đơn, hủy, trả; top 5 + Khác; cộng đúng doanh thu thuần.
do $$
declare a uuid; c uuid; r jsonb; rev jsonb; rid uuid; rlid uuid; v bigint; items jsonb; total numeric;
begin
 a:=pg_temp.sale(jsonb_build_array(pg_temp.line(1,2),pg_temp.line(2,1)),'1000','49000');
 perform pg_temp.sale(jsonb_build_array(pg_temp.line(5,1),pg_temp.line(6,1),pg_temp.line(7,1),pg_temp.line(3,1),pg_temp.line(4,2)),'0','12000');
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

 r:=api.get_report_top_products(pg_temp.today(),pg_temp.today(),'ALL');
 if r->>'ok' is distinct from 'true' then raise exception 'TOP_PRODUCTS_FAILED %',r; end if;
 rev:=api.get_revenue_report(pg_temp.today(),pg_temp.today(),'ALL');
 items:=r#>'{data,items}';
 select coalesce(sum((item->>'netRevenue')::numeric),0) into total from jsonb_array_elements(items) item;
 if total+(r#>>'{data,otherNetRevenue}')::numeric <> (r#>>'{data,totalNetRevenue}')::numeric
   or (r#>>'{data,totalNetRevenue}')::numeric <> (rev#>>'{data,summary,netRevenue}')::numeric then
  raise exception 'TOP_PRODUCTS_DO_NOT_RECONCILE % vs %',r->'data',rev#>'{data,summary}';
 end if;
 -- PIE1 bán 2 trả 1; PIE2 chỉ còn đơn a (đơn c 3 hộp đã hủy); PIE4 2 hộp × 1.000.
 if (select string_agg((item->>'productName') || ':' || (item->>'quantity') || ':' || (item->>'unitName'), ',' order by ord)
     from jsonb_array_elements(items) with ordinality as x(item, ord))
   is distinct from 'Pie item 1:1:Box,Pie item 2:1:Box,Pie item 5:1:Box,Pie item 6:1:Box,Pie item 4:2:Box' then
  raise exception 'TOP_PRODUCTS_RANKING_WRONG %',items;
 end if;
 if (r#>>'{data,otherProductCount}')::int<>2 or (r#>>'{data,otherNetRevenue}')::numeric<>2000
   or (items#>>'{4,netRevenue}')::numeric<>2000 then
  raise exception 'TOP_PRODUCTS_OTHER_WRONG %',r->'data';
 end if;
 if (items#>>'{1,netRevenue}')::numeric <> (select net_amount from api.sale_lines where sale_id=a and line_order=2) then
  raise exception 'CANCELLED_SALE_NOT_REVERSED %',items->1;
 end if;
 if api.get_report_top_products(pg_temp.today(),pg_temp.today(),'BOGUS')#>>'{error,code}' is distinct from 'REPORT_SCOPE_DENIED' then raise exception 'BAD_SCOPE_ACCEPTED'; end if;
 if api.get_report_top_products(pg_temp.today(),pg_temp.today()-1,'ALL')#>>'{error,code}' is distinct from 'REPORT_DATE_RANGE_INVALID' then raise exception 'BAD_RANGE_ACCEPTED'; end if;
 -- Kỳ trống: mảng rỗng, không lỗi.
 r:=api.get_report_top_products(pg_temp.today()+1,pg_temp.today()+1,'ALL');
 if r#>'{data,items}' <> '[]'::jsonb or r#>>'{data,totalNetRevenue}' <> '0' then raise exception 'EMPTY_PERIOD_WRONG %',r; end if;
 raise notice 'PASS top products: five by net revenue with net quantity, reconciles with net revenue';
end $$;

-- Nhân viên không có quyền xem toàn cửa hàng → bị chặn.
do $$
begin
 insert into auth.users(id,email) values('10000000-0000-4000-8000-000000000002','top-staff@example.invalid');
 insert into api.profiles(id,email,display_name,role_template,must_change_password) values('10000000-0000-4000-8000-000000000002','top-staff@example.invalid','Synthetic staff','SALES_WAREHOUSE',false);
 insert into app_private.user_permission_overrides(user_id,permission_code,effect,changed_by,reason)
 values('10000000-0000-4000-8000-000000000002','report.all_revenue.read','REVOKE','10000000-0000-4000-8000-000000000001','Synthetic');
 perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
 if api.get_report_top_products(pg_temp.today(),pg_temp.today(),'ALL')#>>'{error,code}' is distinct from 'REPORT_SCOPE_DENIED' then raise exception 'ALL_SCOPE_NOT_GATED'; end if;
 raise notice 'PASS top products ALL scope is gated by report.all_revenue.read';
end $$;
rollback;
