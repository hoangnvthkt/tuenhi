\set ON_ERROR_STOP on
-- Đợt 1 audit 07/11/2026: phiếu thu theo phương thức, sổ chỉ ghi thêm,
-- chia giảm giá đơn theo đồng nguyên, nhật ký 4 lệnh kho. Local PG only.
begin;
do $$ begin if current_database() <> 'ledger_integrity_test' or inet_server_addr() is not null then raise exception 'ISOLATED_DATABASE_REQUIRED'; end if; end $$;
insert into app_private.permission_definitions(code,category,label,description)
select permission,'audit',permission,'Synthetic local audit' from unnest(array['sale.draft.manage','sale.complete','sale.cancel','sale.discount.apply','sale.own.read','sale.all.read','return.request.create','return.complete','report.all_revenue.read','report.own_revenue.read']) permission
on conflict (code) do nothing;
insert into auth.users(id,email) values('10000000-0000-4000-8000-000000000001','ledger-audit@example.invalid');
insert into api.profiles(id,email,display_name,role_template,must_change_password) values('10000000-0000-4000-8000-000000000001','ledger-audit@example.invalid','Synthetic audit','OWNER',false);
insert into api.store_settings(id,display_name) values(1,'Synthetic audit');
insert into api.sales_channels(id,code,name,name_normalized) values('20000000-0000-4000-8000-000000000001','IN_STORE','Local audit','local audit');
insert into api.products(id,sku,sku_normalized,name,name_normalized,unit_name,created_by,updated_by)
select ('3000000' || n || '-0000-4000-8000-000000000001')::uuid, 'LEDGER' || n, 'ledger' || n, 'Ledger item ' || n, 'ledger item ' || n, 'Box',
  '10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'
from generate_series(1,5) n;
insert into api.inventory_balances(product_id,on_hand_qty) select id,100 from api.products where sku like 'LEDGER%' and sku <> 'LEDGER5';
insert into app_private.inventory_cost_balances(product_id,inventory_value,avg_unit_cost)
select id,500,5 from api.products where sku like 'LEDGER%' and sku <> 'LEDGER5'
on conflict(product_id) do update set inventory_value=500,avg_unit_cost=5;
insert into app_private.product_sale_prices(product_id,sale_price,changed_by)
select id, case when sku='LEDGER1' then 20000 else 1 end,'10000000-0000-4000-8000-000000000001' from api.products where sku like 'LEDGER%';
insert into app_private.document_sequences(document_type,prefix) values('SALE','HD'),('SALE_RETURN','TH'),('STOCK_COUNT','KK') on conflict do nothing;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
insert into api.customers(id,code,code_normalized,customer_type,name,name_normalized,created_by,updated_by) values
('40000000-0000-4000-8000-000000000001','KH01','kh01','INDIVIDUAL','Khách 01','khách 01','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');

create function pg_temp.sale(cust uuid, lines jsonb, order_discount text, cash text, bank text) returns uuid language plpgsql as $$
declare saved jsonb; result jsonb; sid uuid;
begin
 saved:=api.save_sale_draft(null,null,cust,'20000000-0000-4000-8000-000000000001',lines,order_discount,'Ledger fixture',gen_random_uuid());
 if saved->>'ok' is distinct from 'true' then raise exception 'SAVE_FAILED %',saved; end if;
 sid:=(saved#>>'{data,sale,id}')::uuid;
 result:=api.complete_sale_with_allocations(sid,(saved#>>'{data,sale,version}')::bigint,cash,bank,gen_random_uuid(),null);
 if result->>'ok' is distinct from 'true' then raise exception 'COMPLETE_FAILED %',result; end if;
 return sid;
end $$;
create function pg_temp.line(n int, qty int) returns jsonb language sql as $$
 select jsonb_build_object('productId','3000000' || n || '-0000-4000-8000-000000000001','quantity',qty::text,'lineDiscountAmount','0','lineOrder',n)
$$;

-- A1: phiếu thu tại quầy theo phương thức; thu nợ không sửa phiếu.
do $$
declare mixed uuid; debt uuid; d jsonb; r jsonb; v bigint;
begin
 mixed:=pg_temp.sale(null,jsonb_build_array(pg_temp.line(1,5)),'0','40000','60000');
 if (select (method,amount,cash_amount,bank_transfer_amount) from api.payments where sale_id=mixed)
   is distinct from ('BANK_TRANSFER'::text,100000::numeric(20,2),40000::numeric(20,2),60000::numeric(20,2)) then
  raise exception 'MIXED_SPLIT_WRONG %',(select row_to_json(p) from api.payments p where sale_id=mixed);
 end if;

 debt:=pg_temp.sale('40000000-0000-4000-8000-000000000001',jsonb_build_array(pg_temp.line(1,5)),'0','10000','0');
 d:=api.get_customer_debt('40000000-0000-4000-8000-000000000001');
 r:=api.collect_customer_debt('40000000-0000-4000-8000-000000000001',(d#>>'{data,version}')::bigint,'0','30000','Thu chuyển khoản',gen_random_uuid());
 if r->>'ok' is distinct from 'true' then raise exception 'COLLECT_FAILED %',r; end if;
 if (select (method,amount,cash_amount,bank_transfer_amount) from api.payments where sale_id=debt)
   is distinct from ('CASH'::text,10000::numeric(20,2),10000::numeric(20,2),0::numeric(20,2)) then
  raise exception 'CHECKOUT_RECEIPT_CHANGED_BY_COLLECTION %',(select row_to_json(p) from api.payments p where sale_id=debt);
 end if;
 r:=api.get_sale_invoice(debt);
 if (r#>>'{data,totals,capturedAmount}',r#>>'{data,totals,cashAmount}',r#>>'{data,totals,bankTransferAmount}',r#>>'{data,totals,outstandingAmount}')
   is distinct from ('40000.00','10000.00','30000.00','60000.00') then
  raise exception 'INVOICE_TOTALS_WRONG %',r#>'{data,totals}';
 end if;

 -- Hủy: đảo phiếu thu được phép, số tiền giữ nguyên.
 select version into v from api.sales where id=mixed;
 r:=api.cancel_sale(mixed,v,'Hủy kết hợp',gen_random_uuid());
 if r->>'ok' is distinct from 'true' then raise exception 'CANCEL_FAILED %',r; end if;
 if (select (status,cash_amount,bank_transfer_amount) from api.payments where sale_id=mixed)
   is distinct from ('REVERSED'::text,40000::numeric(20,2),60000::numeric(20,2)) then
  raise exception 'REVERSAL_CHANGED_AMOUNTS';
 end if;
 raise notice 'PASS payment receipts keep their method split; collections stay in the debt ledger';
end $$;

-- L2: sổ chỉ ghi thêm.
do $$
declare sid uuid; blocked int:=0;
begin
 -- Phiếu tạo ở giao dịch trước: cả fixture là một giao dịch nên lùi giờ thu.
 perform set_config('app.ledger_maintenance','on',true);
 update api.payments set paid_at=paid_at-interval '1 day';
 perform set_config('app.ledger_maintenance','off',true);
 sid:=(select sale_id from api.payments where status='CAPTURED' order by paid_at limit 1);
 begin update api.payments set amount=amount+1, cash_amount=cash_amount+1 where sale_id=sid; exception when sqlstate '55000' then blocked:=blocked+1; end;
 begin delete from api.payments where sale_id=sid; exception when sqlstate '55000' then blocked:=blocked+1; end;
 begin update api.stock_movements set quantity_delta=quantity_delta where id=(select id from api.stock_movements limit 1); exception when sqlstate '55000' then blocked:=blocked+1; end;
 begin delete from api.stock_movements where id=(select id from api.stock_movements limit 1); exception when sqlstate '55000' then blocked:=blocked+1; end;
 begin update app_private.customer_debt_entries set note='sửa' where id=(select id from app_private.customer_debt_entries limit 1); exception when sqlstate '55000' then blocked:=blocked+1; end;
 begin delete from app_private.customer_debt_allocations where entry_id=(select entry_id from app_private.customer_debt_allocations limit 1); exception when sqlstate '55000' then blocked:=blocked+1; end;
 begin update app_private.audit_events set action='x' where id=(select id from app_private.audit_events limit 1); exception when sqlstate '55000' then blocked:=blocked+1; end;
 begin delete from app_private.inventory_cost_movements where stock_movement_id=(select stock_movement_id from app_private.inventory_cost_movements limit 1); exception when sqlstate '55000' then blocked:=blocked+1; end;
 if blocked<>8 then raise exception 'LEDGER_EDIT_NOT_BLOCKED blocked=%',blocked; end if;
 -- Cờ bảo trì chỉ dành cho công cụ dọn dữ liệu thử.
 perform set_config('app.ledger_maintenance','on',true);
 update app_private.audit_events set metadata=metadata where id=(select id from app_private.audit_events limit 1);
 perform set_config('app.ledger_maintenance','off',true);
 raise notice 'PASS ledgers reject update and delete outside maintenance';
end $$;

-- A4: giảm giá đơn chia theo đồng nguyên, đủ tổng, không dòng nào âm.
do $$
declare sid uuid;
begin
 -- 4 dòng 1 đồng, giảm đơn 2 đồng: cách cũ có thể làm dòng cuối âm.
 sid:=pg_temp.sale(null,jsonb_build_array(pg_temp.line(2,1),pg_temp.line(3,1),pg_temp.line(4,1)),'2','1','0');
 if exists(select 1 from api.sale_lines where sale_id=sid and (net_amount<0 or allocated_order_discount<>trunc(allocated_order_discount)))
   or (select sum(allocated_order_discount) from api.sale_lines where sale_id=sid)<>2 then
  raise exception 'SMALL_DISCOUNT_SPLIT_WRONG %',(select json_agg(json_build_object('d',allocated_order_discount,'n',net_amount)) from api.sale_lines where sale_id=sid);
 end if;
 -- 3 dòng bằng nhau, giảm 1.000: 334 + 333 + 333, không còn 333,33.
 sid:=pg_temp.sale(null,jsonb_build_array(pg_temp.line(2,10000),pg_temp.line(3,10000),pg_temp.line(4,10000)),'1000','29000','0');
 if (select array_agg(allocated_order_discount order by line_order) from api.sale_lines where sale_id=sid) is distinct from array[334,333,333]::numeric(20,2)[] then
  raise exception 'EVEN_DISCOUNT_SPLIT_WRONG %',(select array_agg(allocated_order_discount order by line_order) from api.sale_lines where sale_id=sid);
 end if;
 if (select net_total from api.sales where id=sid)<>29000 then raise exception 'NET_TOTAL_WRONG'; end if;
 raise notice 'PASS order discounts split in whole dong and sum exactly';
end $$;

-- L1: nhật ký cho hủy/cập nhật kiểm kho và gửi/hủy mở sổ.
do $$
declare r jsonb; cid uuid; oid uuid;
begin
 r:=api.save_stock_count(null,null,'Count','[{"productId":"30000002-0000-4000-8000-000000000001","countedQty":"5"}]',gen_random_uuid());
 cid:=(r#>>'{data,countId}')::uuid;
 r:=api.refresh_stock_count_snapshot(cid,(r#>>'{data,version}')::bigint,gen_random_uuid());
 if r->>'ok' is distinct from 'true' then raise exception 'REFRESH_FAILED %',r; end if;
 r:=api.cancel_stock_count(cid,(r#>>'{data,version}')::bigint,'Đếm sai',gen_random_uuid());
 if r->>'ok' is distinct from 'true' then raise exception 'COUNT_CANCEL_FAILED %',r; end if;
 if (select count(*) from app_private.audit_events where entity_id=cid and action in ('stock_count.snapshot_refreshed','stock_count.cancelled'))<>2 then
  raise exception 'STOCK_COUNT_AUDIT_MISSING';
 end if;
 r:=api.save_opening_stock_draft(null,null,'Opening','[{"productId":"30000005-0000-4000-8000-000000000001","countedQty":"7","openingUnitCost":"5"}]',gen_random_uuid());
 if r->>'ok' is distinct from 'true' then raise exception 'OPENING_SAVE_FAILED %',r; end if;
 oid:=(r#>>'{data,countId}')::uuid;
 r:=api.submit_opening_stock(oid,(r#>>'{data,version}')::bigint,gen_random_uuid());
 if r->>'ok' is distinct from 'true' then raise exception 'OPENING_SUBMIT_FAILED %',r; end if;
 r:=api.cancel_opening_stock(oid,(r#>>'{data,version}')::bigint,'Nhập nhầm',gen_random_uuid());
 if r->>'ok' is distinct from 'true' then raise exception 'OPENING_CANCEL_FAILED %',r; end if;
 if (select count(*) from app_private.audit_events where entity_id=oid and action in ('opening_stock.submitted','opening_stock.cancelled'))<>2 then
  raise exception 'OPENING_AUDIT_MISSING';
 end if;
 if (select submitted_at from api.stock_counts where id=oid) is null then raise exception 'SUBMISSION_HISTORY_LOST'; end if;
 -- Phiếu kiểm kho đã gửi (COUNTED) cũng phải hủy được.
 r:=api.save_stock_count(null,null,'Count again','[{"productId":"30000003-0000-4000-8000-000000000001","countedQty":"4"}]',gen_random_uuid());
 cid:=(r#>>'{data,countId}')::uuid;
 r:=api.submit_stock_count(cid,(r#>>'{data,version}')::bigint,gen_random_uuid());
 if r->>'ok' is distinct from 'true' then raise exception 'COUNT_SUBMIT_FAILED %',r; end if;
 r:=api.cancel_stock_count(cid,(r#>>'{data,version}')::bigint,'Hủy sau khi gửi',gen_random_uuid());
 if r->>'ok' is distinct from 'true' then raise exception 'SUBMITTED_COUNT_CANCEL_FAILED %',r; end if;
 raise notice 'PASS stock count and opening commands write audit events; submitted documents cancel';
end $$;
rollback;
