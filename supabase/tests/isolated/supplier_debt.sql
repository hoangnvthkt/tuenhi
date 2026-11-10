\set ON_ERROR_STOP on
-- Đợt 5 (10/11/2026): công nợ NCC theo phiếu nhập, trả nợ FIFO qua sổ quỹ,
-- trả hàng nhập một phần, xuất hủy theo giá vốn bình quân. Local PG only.
begin;
do $$ begin if current_database() <> 'supplier_debt_test' or inet_server_addr() is not null then raise exception 'ISOLATED_DATABASE_REQUIRED'; end if; end $$;
insert into app_private.permission_definitions(code,category,label,description)
select permission,'audit',permission,'Synthetic local audit' from unnest(array['purchase.post','purchase.cost.enter','purchase.reverse','report.all_revenue.read']) permission
on conflict (code) do nothing;
insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000001','ncc-owner@example.invalid'),
 ('10000000-0000-4000-8000-000000000002','ncc-staff@example.invalid');
insert into api.profiles(id,email,display_name,role_template,must_change_password) values
 ('10000000-0000-4000-8000-000000000001','ncc-owner@example.invalid','Chủ','OWNER',false),
 ('10000000-0000-4000-8000-000000000002','ncc-staff@example.invalid','Nhân viên','BUSINESS',false);
insert into api.store_settings(id,display_name) values(1,'Synthetic supplier');
insert into app_private.document_sequences(document_type,prefix) values('PURCHASE_RECEIPT','PN') on conflict do nothing;
insert into api.suppliers(id,code,code_normalized,name,name_normalized,created_by,updated_by)
values('20000000-0000-4000-8000-000000000001','LC','lc','Dược phẩm Long Châu','dược phẩm long châu','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
insert into api.products(id,sku,sku_normalized,name,name_normalized,unit_name,created_by,updated_by)
select ('3000000' || n || '-0000-4000-8000-000000000001')::uuid, 'NCC' || n, 'ncc' || n, 'NCC item ' || n, 'ncc item ' || n, 'Box',
 '10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001' from generate_series(1,3) n;
insert into api.inventory_balances(product_id,on_hand_qty) select id,0 from api.products where sku like 'NCC%' on conflict do nothing;
insert into app_private.inventory_cost_balances(product_id,inventory_value,avg_unit_cost) select id,0,0 from api.products where sku like 'NCC%'
on conflict(product_id) do update set inventory_value=0,avg_unit_cost=0;

create function pg_temp.as_user(n int) returns void language sql as $$
 select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-00000000000' || n,true) $$;
create function pg_temp.ok(r jsonb, label text) returns jsonb language plpgsql as $$
begin if r->>'ok' is distinct from 'true' then raise exception '% FAILED %', label, r; end if; return r; end $$;
create function pg_temp.code(r jsonb) returns text language sql as $$ select r#>>'{error,code}' $$;
create function pg_temp.product(n int) returns uuid language sql as $$ select ('3000000' || n || '-0000-4000-8000-000000000001')::uuid $$;
create function pg_temp.receive(supplier uuid, n int, qty int, unit_cost text) returns uuid language plpgsql as $$
declare receipt uuid:=gen_random_uuid(); line uuid:=gen_random_uuid(); r jsonb;
begin
 insert into api.purchase_receipts(id,status,supplier_id,received_at,created_by,submitted_by,submitted_at)
 values(receipt,'AWAITING_COST',supplier,now(),auth.uid(),auth.uid(),now());
 insert into api.purchase_receipt_lines(id,purchase_receipt_id,product_id,product_name,sku,unit_name,received_qty,line_order)
 select line,receipt,id,name,sku,unit_name,qty,0 from api.products where id=pg_temp.product(n);
 r:=pg_temp.ok(api.post_purchase_receipt(receipt,1,jsonb_build_array(jsonb_build_object('lineId',line,'unitCost',unit_cost)),gen_random_uuid()),'POST_RECEIPT');
 return receipt;
end $$;
create function pg_temp.debt() returns jsonb language sql as $$ select api.get_supplier_debt('20000000-0000-4000-8000-000000000001') $$;
create function pg_temp.reconciled() returns boolean language sql as $$
 select (select balance from app_private.supplier_debt_accounts where supplier_id='20000000-0000-4000-8000-000000000001')
   = (select sum(outstanding_amount) from app_private.supplier_payables where supplier_id='20000000-0000-4000-8000-000000000001')
  -- One transaction gives every entry the same timestamp, so compare totals, not "the latest" row.
  and (select sum(delta) from app_private.supplier_debt_entries where supplier_id='20000000-0000-4000-8000-000000000001')
   = (select balance from app_private.supplier_debt_accounts where supplier_id='20000000-0000-4000-8000-000000000001')
  and not exists (select 1 from api.inventory_balances b left join (select product_id, sum(quantity_delta) q from api.stock_movements group by 1) m using (product_id)
   where b.product_id in (pg_temp.product(1), pg_temp.product(2), pg_temp.product(3)) and coalesce(m.q,0) <> b.on_hand_qty)
  and not exists (select 1 from app_private.inventory_cost_balances c left join (select m.product_id, sum(cm.inventory_value_delta) v
   from app_private.inventory_cost_movements cm join api.stock_movements m on m.id=cm.stock_movement_id group by 1) x using (product_id)
   where c.product_id in (pg_temp.product(1), pg_temp.product(2), pg_temp.product(3)) and coalesce(x.v,0) <> c.inventory_value) $$;

-- Ghi sổ phiếu có NCC mở công nợ; phiếu không có NCC thì không.
do $$
declare r1 uuid; r2 uuid; r3 uuid; d jsonb;
begin
 perform pg_temp.as_user(1);
 r1:=pg_temp.receive('20000000-0000-4000-8000-000000000001',1,5,'40000');
 r2:=pg_temp.receive(null,2,10,'1000');
 r3:=pg_temp.receive('20000000-0000-4000-8000-000000000001',3,3,'1001');
 -- Distinct days so the oldest-first rule is observable inside one transaction.
 update app_private.supplier_payables set opened_at='2026-09-15T08:00:00+07' where purchase_receipt_id=r1;
 update app_private.supplier_payables set opened_at='2026-10-01T08:00:00+07' where purchase_receipt_id=r3;
 if exists (select 1 from app_private.supplier_payables where purchase_receipt_id=r2) then raise exception 'NO_SUPPLIER_PAYABLE_CREATED'; end if;
 d:=pg_temp.ok(pg_temp.debt(),'DEBT');
 if (d#>>'{data,balance}')::numeric <> 203003 or jsonb_array_length(d#>'{data,openPayables}') <> 2 then raise exception 'RECEIPT_PAYABLES_WRONG %',d->'data'; end if;
 perform pg_temp.as_user(2);
 if pg_temp.code(pg_temp.debt()) <> 'PERMISSION_DENIED' or pg_temp.code(api.get_supplier_debts()) <> 'PERMISSION_DENIED'
  or pg_temp.code(api.pay_supplier_debt('20000000-0000-4000-8000-000000000001',1,'1','0',null,gen_random_uuid())) <> 'PERMISSION_DENIED' then
  raise exception 'STAFF_SEES_SUPPLIER_DEBT';
 end if;
 if not pg_temp.reconciled() then raise exception 'NOT_RECONCILED_AFTER_POST % % %',
  (select json_agg(row_to_json(e)) from app_private.supplier_debt_entries e),(select json_agg(row_to_json(b)) from api.inventory_balances b),(select json_agg(row_to_json(c)) from app_private.inventory_cost_balances c); end if;
 raise notice 'PASS posted receipts with a supplier open payables';
end $$;

-- Nợ đầu kỳ một lần, bắt buộc lý do; trả nợ cũ nhất trước, chống phát lại.
do $$
declare d jsonb; k uuid:=gen_random_uuid(); r jsonb; v bigint;
begin
 perform pg_temp.as_user(1);
 if pg_temp.code(api.set_supplier_opening_debt('20000000-0000-4000-8000-000000000001','50000',' ',gen_random_uuid())) <> 'VALIDATION_FAILED' then raise exception 'OPENING_WITHOUT_NOTE'; end if;
 perform pg_temp.ok(api.set_supplier_opening_debt('20000000-0000-4000-8000-000000000001','50000','Nợ sổ tay trước 09/2026',gen_random_uuid()),'OPENING');
 if pg_temp.code(api.set_supplier_opening_debt('20000000-0000-4000-8000-000000000001','1','Lần hai',gen_random_uuid())) <> 'SUPPLIER_OPENING_ALREADY_SET' then raise exception 'OPENING_TWICE'; end if;
 update app_private.supplier_payables set opened_at='2026-01-01T08:00:00+07' where kind='OPENING';
 d:=pg_temp.debt(); v:=(d#>>'{data,version}')::bigint;
 if (d#>>'{data,balance}')::numeric <> 253003 then raise exception 'OPENING_BALANCE_WRONG %',d->'data'; end if;
 if pg_temp.code(api.pay_supplier_debt('20000000-0000-4000-8000-000000000001',v,'253004','0',null,gen_random_uuid())) <> 'SUPPLIER_PAYMENT_EXCEEDS_BALANCE' then raise exception 'OVERPAY_ACCEPTED'; end if;
 if pg_temp.code(api.pay_supplier_debt('20000000-0000-4000-8000-000000000001',v-1,'1','0',null,gen_random_uuid())) <> 'VERSION_CONFLICT' then raise exception 'STALE_PAY_ACCEPTED'; end if;
 r:=pg_temp.ok(api.pay_supplier_debt('20000000-0000-4000-8000-000000000001',v,'60000','10000','Trả đợt 1',k),'PAY');
 if api.pay_supplier_debt('20000000-0000-4000-8000-000000000001',v,'60000','10000','Trả đợt 1',k) is distinct from r then raise exception 'PAY_REPLAY_DIFFERS'; end if;
 if pg_temp.code(api.pay_supplier_debt('20000000-0000-4000-8000-000000000001',v,'1','0',null,k)) <> 'IDEMPOTENCY_CONFLICT' then raise exception 'PAY_KEY_REUSED'; end if;
 if (select array_agg(kind || ':' || paid_amount::text order by opened_at) from app_private.supplier_payables where supplier_id='20000000-0000-4000-8000-000000000001')
   is distinct from array['OPENING:50000.00','RECEIPT:20000.00','RECEIPT:0.00'] then
  raise exception 'FIFO_WRONG %',(select json_agg(json_build_object('k',kind,'paid',paid_amount,'at',opened_at)) from app_private.supplier_payables);
 end if;
 if (r#>>'{data,balance}')::numeric <> 183003 or not pg_temp.reconciled() then raise exception 'PAY_NOT_RECONCILED %',r; end if;
 raise notice 'PASS opening debt is once with a reason; payments settle the oldest debt first';
end $$;

-- Đảo phiếu đã trả bị chặn; đảo phiếu chưa đụng tới thì đóng luôn công nợ.
do $$
declare r1 uuid; r3 uuid;
begin
 perform pg_temp.as_user(1);
 select purchase_receipt_id into r1 from app_private.supplier_payables where kind='RECEIPT' and paid_amount>0;
 select purchase_receipt_id into r3 from app_private.supplier_payables where kind='RECEIPT' and paid_amount=0;
 if pg_temp.code(api.reverse_purchase_receipt(r1,'Nhập nhầm',gen_random_uuid())) <> 'PURCHASE_REVERSAL_SETTLED' then raise exception 'PAID_RECEIPT_REVERSED'; end if;
 perform pg_temp.ok(api.reverse_purchase_receipt(r3,'Nhập nhầm',gen_random_uuid()),'REVERSE');
 if (select (outstanding_amount, reversed_amount) from app_private.supplier_payables where purchase_receipt_id=r3) is distinct from (0::numeric(20,2), 3003::numeric(20,2))
   or (pg_temp.debt()#>>'{data,balance}')::numeric <> 180000 or not pg_temp.reconciled() then
  raise exception 'REVERSAL_DID_NOT_CLOSE_PAYABLE %',pg_temp.debt()->'data';
 end if;
 raise notice 'PASS reversal is refused once money moved, and closes an untouched payable';
end $$;

-- Xuất hủy theo giá vốn bình quân, không quá tồn.
do $$
declare r jsonb;
begin
 perform pg_temp.as_user(2);
 if pg_temp.code(api.post_stock_write_off(jsonb_build_array(jsonb_build_object('productId',pg_temp.product(1),'quantity','1')),'EXPIRED',null,gen_random_uuid())) <> 'PERMISSION_DENIED' then raise exception 'STAFF_WRITE_OFF'; end if;
 perform pg_temp.as_user(1);
 if pg_temp.code(api.post_stock_write_off(jsonb_build_array(jsonb_build_object('productId',pg_temp.product(1),'quantity','6')),'EXPIRED',null,gen_random_uuid())) <> 'WRITE_OFF_QTY_EXCEEDED'
  or pg_temp.code(api.post_stock_write_off(jsonb_build_array(jsonb_build_object('productId',pg_temp.product(1),'quantity','1')),'OTHER',null,gen_random_uuid())) <> 'VALIDATION_FAILED' then
  raise exception 'BAD_WRITE_OFF_ACCEPTED';
 end if;
 r:=pg_temp.ok(api.post_stock_write_off(jsonb_build_array(jsonb_build_object('productId',pg_temp.product(1),'quantity','4')),'EXPIRED','Hết hạn 10/2026',gen_random_uuid()),'WRITE_OFF');
 if r#>>'{data,writeOffNumber}' <> 'XH000001' or (r#>>'{data,totalValue}')::numeric <> 160000 then raise exception 'WRITE_OFF_RESULT %',r; end if;
 if (select (on_hand_qty) from api.inventory_balances where product_id=pg_temp.product(1)) <> 1
   or (select (inventory_value, avg_unit_cost) from app_private.inventory_cost_balances where product_id=pg_temp.product(1)) is distinct from (40000::numeric(20,2), 40000::numeric(20,6))
   or not pg_temp.reconciled() then
  raise exception 'WRITE_OFF_STOCK_WRONG';
 end if;
 if jsonb_array_length(pg_temp.ok(api.list_stock_write_offs(30),'LIST_WO')#>'{data,items}') <> 1 then raise exception 'WRITE_OFF_LIST'; end if;
 raise notice 'PASS write-offs remove stock at the moving average and never exceed stock';
end $$;

-- Trả hàng nhập: theo phiếu, giá nhập gốc, trừ nợ trước rồi NCC hoàn phần dư.
do $$
declare r1 uuid; r2 uuid; l1 uuid; l2 uuid; r jsonb; opts jsonb; cash jsonb; bank jsonb;
begin
 perform pg_temp.as_user(1);
 select purchase_receipt_id into r1 from app_private.supplier_payables where kind='RECEIPT' and paid_amount>0;
 select id into r2 from api.purchase_receipts where supplier_id is null and status='POSTED';
 select id into l1 from api.purchase_receipt_lines where purchase_receipt_id=r1;
 select id into l2 from api.purchase_receipt_lines where purchase_receipt_id=r2;
 opts:=pg_temp.ok(api.get_purchase_return_options(r1),'OPTIONS');
 if (opts#>>'{data,lines,0,maxQty}')::numeric <> 1 or (opts#>>'{data,outstandingAmount}')::numeric <> 180000 then raise exception 'OPTIONS_WRONG %',opts->'data'; end if;
 if pg_temp.code(api.post_purchase_return(r1,jsonb_build_array(jsonb_build_object('receiptLineId',l1,'quantity','2')),'Lỗi bao bì',null,gen_random_uuid())) <> 'PURCHASE_RETURN_QTY_EXCEEDED' then raise exception 'RETURN_OVER_STOCK'; end if;
 r:=pg_temp.ok(api.post_purchase_return(r1,jsonb_build_array(jsonb_build_object('receiptLineId',l1,'quantity','1')),'Lỗi bao bì',null,gen_random_uuid()),'RETURN_1');
 if (r#>>'{data,totalAmount}')::numeric <> 40000 or (r#>>'{data,debtApplied}')::numeric <> 40000 or (r#>>'{data,refundAmount}')::numeric <> 0 then raise exception 'RETURN_1_WRONG %',r; end if;
 if (pg_temp.debt()#>>'{data,balance}')::numeric <> 140000 or (select on_hand_qty from api.inventory_balances where product_id=pg_temp.product(1)) <> 0
   or (select inventory_value from app_private.inventory_cost_balances where product_id=pg_temp.product(1)) <> 0 or not pg_temp.reconciled() then
  raise exception 'RETURN_1_LEDGERS_WRONG';
 end if;
 -- No supplier on the receipt: everything is refunded, and the refund needs a method.
 if pg_temp.code(api.post_purchase_return(r2,jsonb_build_array(jsonb_build_object('receiptLineId',l2,'quantity','2')),'Trả bớt',null,gen_random_uuid())) <> 'REFUND_METHOD_REQUIRED' then raise exception 'REFUND_WITHOUT_METHOD'; end if;
 r:=pg_temp.ok(api.post_purchase_return(r2,jsonb_build_array(jsonb_build_object('receiptLineId',l2,'quantity','2')),'Trả bớt','CASH',gen_random_uuid()),'RETURN_2');
 if (r#>>'{data,refundAmount}')::numeric <> 2000 or (select (on_hand_qty) from api.inventory_balances where product_id=pg_temp.product(2)) <> 8
   or (select inventory_value from app_private.inventory_cost_balances where product_id=pg_temp.product(2)) <> 8000 then
  raise exception 'RETURN_2_WRONG %',r;
 end if;
 if pg_temp.code(api.reverse_purchase_receipt(r2,'x',gen_random_uuid())) <> 'PURCHASE_REVERSAL_SETTLED' then raise exception 'RETURNED_RECEIPT_REVERSED'; end if;
 -- Money paid to and refunded by the supplier appears in the cash book.
 cash:=pg_temp.ok(api.get_cash_book('CASH',(now() at time zone 'Asia/Ho_Chi_Minh')::date,(now() at time zone 'Asia/Ho_Chi_Minh')::date,'ALL',null,null,null,50),'CASH_BOOK');
 bank:=pg_temp.ok(api.get_cash_book('BANK',(now() at time zone 'Asia/Ho_Chi_Minh')::date,(now() at time zone 'Asia/Ho_Chi_Minh')::date,'ALL',null,null,null,50),'BANK_BOOK');
 if (cash#>>'{data,summary,totalIn}')::numeric <> 2000 or (cash#>>'{data,summary,totalOut}')::numeric <> 60000
   or (bank#>>'{data,summary,totalOut}')::numeric <> 10000 or (bank#>>'{data,summary,totalIn}')::numeric <> 0 then
  raise exception 'CASH_BOOK_SUPPLIER_WRONG % %',cash#>'{data,summary}',bank#>'{data,summary}';
 end if;
 if (pg_temp.ok(api.get_supplier_debts(),'DEBTS')#>>'{data,summary,totalPayable}')::numeric <> 140000 then raise exception 'SUMMARY_WRONG'; end if;
 raise notice 'PASS purchase returns use the receipt cost, settle debt first and refund the rest';
end $$;

-- Chỉ ghi thêm, nhật ký đủ, đối soát được sau khi mất phản hồi.
do $$
declare blocked int:=0;
begin
 begin update app_private.supplier_debt_entries set note='sửa' where kind='PAYMENT'; exception when sqlstate '55000' then blocked:=blocked+1; end;
 begin delete from app_private.purchase_returns; exception when sqlstate '55000' then blocked:=blocked+1; end;
 begin update app_private.stock_write_off_lines set quantity=1; exception when sqlstate '55000' then blocked:=blocked+1; end;
 begin delete from app_private.supplier_debt_allocations; exception when sqlstate '55000' then blocked:=blocked+1; end;
 if blocked<>4 then raise exception 'SUPPLIER_LEDGER_EDIT_NOT_BLOCKED %',blocked; end if;
 if (select count(*) from app_private.audit_events where action in ('supplier.debt.paid','supplier.debt.opening_set','purchase_return.posted','stock_write_off.posted')) <> 5 then
  raise exception 'AUDIT_MISSING %',(select json_agg(action) from app_private.audit_events);
 end if;
 if pg_temp.ok(api.get_my_command_outcome('supplier.debt.pay',(select idempotency_key from app_private.command_deduplication where command_name='supplier.debt.pay' limit 1)),'OUTCOME')#>>'{data,status}' <> 'RESOLVED' then
  raise exception 'OUTCOME_LOOKUP_MISSING';
 end if;
 raise notice 'PASS supplier and stock ledgers are append-only, audited and recoverable';
end $$;
rollback;
