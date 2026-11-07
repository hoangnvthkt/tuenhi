\set ON_ERROR_STOP on
-- Đợt 3 sổ quỹ 07/11/2026: số dư đầu, phiếu tay, sổ tự sinh từ bán/thu nợ/
-- trả/hủy khớp sổ nguồn, kết ca theo người, quyền và chỉ ghi thêm. Local PG only.
begin;
do $$ begin if current_database() <> 'cash_book_test' or inet_server_addr() is not null then raise exception 'ISOLATED_DATABASE_REQUIRED'; end if; end $$;
insert into app_private.permission_definitions(code,category,label,description)
select permission,'audit',permission,'Synthetic local audit' from unnest(array['sale.draft.manage','sale.complete','sale.cancel','sale.discount.apply','sale.own.read','sale.all.read','return.request.create','return.complete','report.all_revenue.read','report.own_revenue.read']) permission
on conflict (code) do nothing;
insert into app_private.role_default_permissions(role_template,permission_code,allowed)
select 'BUSINESS', permission, true from unnest(array['sale.draft.manage','sale.complete','sale.own.read','return.request.create','return.complete']) permission
on conflict (role_template, permission_code) do update set allowed = true;
insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000001','cash-owner@example.invalid'),
 ('10000000-0000-4000-8000-000000000002','cash-cashier@example.invalid');
insert into api.profiles(id,email,display_name,role_template,must_change_password) values
 ('10000000-0000-4000-8000-000000000001','cash-owner@example.invalid','Chủ','OWNER',false),
 ('10000000-0000-4000-8000-000000000002','cash-cashier@example.invalid','Thu ngân','BUSINESS',false);
insert into api.store_settings(id,display_name) values(1,'Synthetic cash');
insert into api.sales_channels(id,code,name,name_normalized) values('20000000-0000-4000-8000-000000000001','IN_STORE','Local cash','local cash');
insert into api.products(id,sku,sku_normalized,name,name_normalized,unit_name,created_by,updated_by)
values('30000001-0000-4000-8000-000000000001','CASH1','cash1','Cash item','cash item','Box','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
insert into api.inventory_balances(product_id,on_hand_qty) values('30000001-0000-4000-8000-000000000001',100);
insert into app_private.inventory_cost_balances(product_id,inventory_value,avg_unit_cost) values('30000001-0000-4000-8000-000000000001',500,5)
on conflict(product_id) do update set inventory_value=500,avg_unit_cost=5;
insert into app_private.product_sale_prices(product_id,sale_price,changed_by) values('30000001-0000-4000-8000-000000000001',20000,'10000000-0000-4000-8000-000000000001');
insert into app_private.document_sequences(document_type,prefix) values('SALE','HD'),('SALE_RETURN','TH') on conflict do nothing;
insert into api.customers(id,code,code_normalized,customer_type,name,name_normalized,created_by,updated_by) values
('40000000-0000-4000-8000-000000000001','KH01','kh01','INDIVIDUAL','Khách 01','khách 01','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');

create function pg_temp.as_user(n int) returns void language sql as $$
 select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-00000000000' || n,true) $$;
create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'Asia/Ho_Chi_Minh')::date $$;
create function pg_temp.ok(r jsonb, label text) returns jsonb language plpgsql as $$
begin if r->>'ok' is distinct from 'true' then raise exception '% FAILED %', label, r; end if; return r; end $$;
create function pg_temp.code(r jsonb) returns text language sql as $$ select r#>>'{error,code}' $$;
create function pg_temp.sale(cust uuid, qty int, cash text, bank text) returns uuid language plpgsql as $$
declare saved jsonb; sid uuid;
begin
 saved:=pg_temp.ok(api.save_sale_draft(null,null,cust,'20000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object('productId','30000001-0000-4000-8000-000000000001','quantity',qty::text,'lineDiscountAmount','0','lineOrder',1)),
  '0','Cash fixture',gen_random_uuid()),'SAVE');
 sid:=(saved#>>'{data,sale,id}')::uuid;
 perform pg_temp.ok(api.complete_sale_with_allocations(sid,(saved#>>'{data,sale,version}')::bigint,cash,bank,gen_random_uuid(),null),'COMPLETE');
 return sid;
end $$;
create function pg_temp.book(fund text, scope text, lim int default 100) returns jsonb language sql as $$
 select api.get_cash_book(fund,pg_temp.today(),pg_temp.today(),scope,null,null,null,lim) $$;

-- Số dư đầu: Owner nhập một lần mỗi quỹ; thu ngân không được.
do $$
declare k uuid:=gen_random_uuid(); r jsonb;
begin
 perform pg_temp.as_user(2);
 if pg_temp.code(api.set_cash_fund_opening('CASH',pg_temp.today(),'500000',gen_random_uuid())) <> 'PERMISSION_DENIED' then raise exception 'CASHIER_SET_OPENING'; end if;
 perform pg_temp.as_user(1);
 r:=pg_temp.ok(api.set_cash_fund_opening('CASH',pg_temp.today(),'500000',k),'OPENING');
 if api.set_cash_fund_opening('CASH',pg_temp.today(),'500000',k) is distinct from r then raise exception 'OPENING_REPLAY_DIFFERS'; end if;
 if pg_temp.code(api.set_cash_fund_opening('CASH',pg_temp.today(),'1',gen_random_uuid())) <> 'CASH_OPENING_ALREADY_SET' then raise exception 'OPENING_TWICE'; end if;
 if pg_temp.code(api.set_cash_fund_opening('BANK',pg_temp.today()+1,'1',gen_random_uuid())) <> 'VALIDATION_FAILED' then raise exception 'FUTURE_OPENING'; end if;
 raise notice 'PASS fund opening is owner-only, once per fund and idempotent';
end $$;

-- Ca: một ca mở mỗi người, phát lại cùng mã trả cùng kết quả.
do $$
declare k uuid:=gen_random_uuid(); r jsonb;
begin
 perform pg_temp.as_user(2);
 if pg_temp.ok(api.get_my_cash_shift(),'MY_SHIFT')#>'{data,shift}' <> 'null'::jsonb then raise exception 'SHIFT_EXISTS_EARLY'; end if;
 r:=pg_temp.ok(api.open_cash_shift('200000',k),'OPEN_SHIFT');
 if api.open_cash_shift('200000',k) is distinct from r then raise exception 'SHIFT_REPLAY_DIFFERS'; end if;
 if pg_temp.code(api.open_cash_shift('1',gen_random_uuid())) <> 'CASH_SHIFT_ALREADY_OPEN' then raise exception 'TWO_OPEN_SHIFTS'; end if;
 if pg_temp.code(api.open_cash_shift('200000',k)) is not null then raise exception 'REPLAY_TURNED_INTO_ERROR'; end if;
 if pg_temp.code(api.open_cash_shift('300000',k)) <> 'IDEMPOTENCY_CONFLICT' then raise exception 'KEY_REUSE_ACCEPTED'; end if;
 raise notice 'PASS one open shift per cashier with idempotent opening';
end $$;

-- Giao dịch thật: thu ngân bán và nhận trả hàng; chủ hủy đơn, thu nợ, lập phiếu tay.
do $$
declare a uuid; b uuid; c uuid; r jsonb; rid uuid; rlid uuid; v bigint; expense uuid; d jsonb;
begin
 perform pg_temp.as_user(2);
 a:=pg_temp.sale(null,5,'40000','60000');                                        -- 100.000: 40k TM + 60k CK
 b:=pg_temp.sale('40000000-0000-4000-8000-000000000001',3,'10000','0');          -- 60.000: 10k TM, nợ 50k
 c:=pg_temp.sale(null,1,'20000','0');                                            -- 20.000 TM rồi chủ hủy
 r:=pg_temp.ok(api.create_sale_return_request(a,'Trả một hộp',jsonb_build_array(jsonb_build_object('originalSaleLineId',(select id from api.sale_lines where sale_id=a),'requestedQty','1')),gen_random_uuid()),'RETURN_REQ');
 rid:=(r#>>'{data,returnId}')::uuid; select id into rlid from api.sale_return_lines where sale_return_id=rid;
 perform pg_temp.ok(api.complete_sale_return(rid,(r#>>'{data,version}')::bigint,jsonb_build_array(jsonb_build_object('saleReturnLineId',rlid,'acceptedQty','1')),'CASH',gen_random_uuid(),null),'RETURN');
 if pg_temp.code(api.create_cash_voucher('CASH','OUT','EXPENSE','1000',null,'Ship',gen_random_uuid())) <> 'PERMISSION_DENIED' then raise exception 'CASHIER_VOUCHER'; end if;

 perform pg_temp.as_user(1);
 select version into v from api.sales where id=c;
 perform pg_temp.ok(api.cancel_sale(c,v,'Khách đổi ý',gen_random_uuid()),'CANCEL');
 d:=api.get_customer_debt('40000000-0000-4000-8000-000000000001');
 perform pg_temp.ok(api.collect_customer_debt('40000000-0000-4000-8000-000000000001',(d#>>'{data,version}')::bigint,'30000','0','Thu nợ',gen_random_uuid()),'COLLECT');
 r:=pg_temp.ok(api.create_cash_voucher('CASH','OUT','EXPENSE','15000','Điện lực','Tiền điện',gen_random_uuid()),'EXPENSE');
 expense:=(r#>>'{data,voucherId}')::uuid;
 if r#>>'{data,voucherNumber}' <> 'PC000001' then raise exception 'VOUCHER_NUMBER %',r; end if;
 r:=pg_temp.ok(api.create_cash_voucher('CASH','OUT','FUND_TRANSFER','100000',null,'Nộp tiền vào ngân hàng',gen_random_uuid()),'TRANSFER');
 if r#>>'{data,transferVoucherNumber}' is null then raise exception 'TRANSFER_PAIR_MISSING %',r; end if;
 if pg_temp.code(api.create_cash_voucher('CASH','IN','EXPENSE','1',null,'x',gen_random_uuid())) <> 'VALIDATION_FAILED'
  or pg_temp.code(api.create_cash_voucher('CASH','OUT','OTHER','0',null,'x',gen_random_uuid())) <> 'VALIDATION_FAILED'
  or pg_temp.code(api.create_cash_voucher('CASH','OUT','OTHER','5',null,' ',gen_random_uuid())) <> 'VALIDATION_FAILED' then
  raise exception 'BAD_VOUCHER_ACCEPTED';
 end if;
 r:=pg_temp.ok(api.cancel_cash_voucher(expense,'Nhập nhầm',gen_random_uuid()),'CANCEL_VOUCHER');
 if pg_temp.code(api.cancel_cash_voucher(expense,'Lần nữa',gen_random_uuid())) <> 'CASH_VOUCHER_ALREADY_CANCELLED' then raise exception 'DOUBLE_CANCEL'; end if;
 if pg_temp.code(api.cancel_cash_voucher((r#>>'{data,reversals,0,reversalId}')::uuid,'x',gen_random_uuid())) <> 'VALIDATION_FAILED' then raise exception 'REVERSAL_CANCELLED'; end if;
 raise notice 'PASS sales, returns, cancels, collections and manual vouchers are recorded';
end $$;

-- Đối soát: sổ quỹ khớp từng sổ nguồn, tồn chạy khớp tồn quỹ.
do $$
declare cash jsonb; bank jsonb; expected numeric; expected_bank numeric; refund numeric;
begin
 perform pg_temp.as_user(1);
 cash:=pg_temp.ok(pg_temp.book('CASH','ALL'),'BOOK_CASH');
 bank:=pg_temp.ok(pg_temp.book('BANK','ALL'),'BOOK_BANK');
 select amount into refund from api.sale_return_payments;
 -- Independent sum straight from the source tables.
 expected := 500000
  + (select sum(cash_amount) from api.payments)
  + (select sum(cash_amount) from app_private.customer_debt_entries where kind='COLLECTION')
  - (select sum(amount) from api.sale_return_payments where method='CASH')
  - (select sum(a.cash_amount) from app_private.sale_payment_allocations a join api.sales s on s.id=a.sale_id where s.status='CANCELLED')
  + (select coalesce(sum(case when direction='IN' then amount else -amount end),0) from app_private.cash_vouchers where fund='CASH');
 expected_bank := (select sum(bank_transfer_amount) from api.payments) + 100000;
 if expected <> 500000 + 40000 + 10000 + 20000 + 30000 - refund - 20000 - 15000 - 100000 + 15000 then raise exception 'FIXTURE_ARITHMETIC'; end if;
 if (cash#>>'{data,summary,closingBalance}')::numeric <> expected or (cash#>>'{data,fundBalances,CASH}')::numeric <> expected
   or (cash#>>'{data,items,0,balanceAfter}')::numeric <> expected or (cash#>>'{data,summary,openingBalance}')::numeric <> 500000 then
  raise exception 'CASH_BOOK_DOES_NOT_RECONCILE expected % got %',expected,cash#>'{data,summary}';
 end if;
 if (cash#>>'{data,summary,totalIn}')::numeric <> 40000+10000+20000+30000+15000 or (cash#>>'{data,summary,inCount}')::int <> 5
   or (cash#>>'{data,summary,totalOut}')::numeric <> refund+20000+15000+100000 or (cash#>>'{data,summary,outCount}')::int <> 4 then
  raise exception 'CASH_TOTALS_WRONG %',cash#>'{data,summary}';
 end if;
 if (bank#>>'{data,summary,closingBalance}')::numeric <> expected_bank or (bank#>>'{data,summary,openingBalance}') is not null and (bank#>>'{data,summary,openingBalance}')::numeric <> 0 then
  raise exception 'BANK_BOOK_WRONG %',bank#>'{data,summary}';
 end if;
 if (select count(*) from jsonb_array_elements(cash#>'{data,items}') i where (i->>'canCancel')::boolean) <> 1 then
  raise exception 'ONLY_THE_TRANSFER_IS_CANCELLABLE %',cash#>'{data,items}';
 end if;
 raise notice 'PASS cash book reconciles with every source ledger and the running balance';
end $$;

-- Phân trang không trùng không sót.
do $$
declare page jsonb; seen text[]:='{}'; cur jsonb:=null; n int:=0;
begin
 perform pg_temp.as_user(1);
 loop
  page:=pg_temp.ok(api.get_cash_book('CASH',pg_temp.today(),pg_temp.today(),'ALL',null,(cur->>'occurredAt')::timestamptz,cur->>'key',2),'PAGE');
  seen:=seen||array(select i->>'entryKey' from jsonb_array_elements(page#>'{data,items}') i);
  cur:=page#>'{data,nextCursor}'; n:=n+1;
  exit when cur='null'::jsonb or n>20;
 end loop;
 if cardinality(seen)<>9 or (select count(distinct x) from unnest(seen) x)<>9 then raise exception 'PAGINATION_WRONG %',seen; end if;
 raise notice 'PASS cash book pages cover every entry once';
end $$;

-- Thu ngân: chỉ thấy phiếu của mình, không thấy tồn; kết ca tính đúng tiền phải có.
do $$
declare own jsonb; s jsonb; sid uuid; ver bigint; expected numeric; r jsonb; refund numeric;
begin
 select amount into refund from api.sale_return_payments;
 perform pg_temp.as_user(2);
 if pg_temp.code(pg_temp.book('CASH','ALL')) <> 'REPORT_SCOPE_DENIED' then raise exception 'CASHIER_SEES_ALL'; end if;
 own:=pg_temp.ok(pg_temp.book('CASH','OWN'),'OWN_BOOK');
 if own#>'{data,summary,openingBalance}' <> 'null'::jsonb or own#>'{data,fundBalances}' <> 'null'::jsonb
   or exists (select 1 from jsonb_array_elements(own#>'{data,items}') i where i->>'actorName' <> 'Thu ngân') then
  raise exception 'OWN_BOOK_LEAKS %',own->'data';
 end if;
 s:=pg_temp.ok(api.get_my_cash_shift(),'MY_SHIFT')#>'{data,shift}';
 sid:=(s->>'id')::uuid; ver:=(s->>'version')::bigint;
 -- The owner cancelled sale C, so its refund is in the owner's money, not this shift.
 expected:=200000 + 40000 + 10000 + 20000 - refund;
 if (s->>'expectedCash')::numeric <> expected or (s->>'cashInCount')::int <> 3 or (s->>'cashOutCount')::int <> 1 or (s->>'bankIn')::numeric <> 60000 then
  raise exception 'LIVE_SHIFT_WRONG %',s;
 end if;
 r:=pg_temp.ok(api.get_cash_book('CASH',null,null,null,sid,null,null,50),'SHIFT_BOOK');
 if jsonb_array_length(r#>'{data,items}') <> 4 then raise exception 'SHIFT_DRILLDOWN_WRONG %',r->'data'; end if;
 if pg_temp.code(api.close_cash_shift(sid,ver,(expected-1000)::text,null,gen_random_uuid())) <> 'CASH_SHIFT_NOTE_REQUIRED' then raise exception 'SHORTAGE_WITHOUT_NOTE'; end if;
 if pg_temp.code(api.close_cash_shift(sid,ver+5,expected::text,null,gen_random_uuid())) <> 'VERSION_CONFLICT' then raise exception 'STALE_CLOSE'; end if;
 r:=pg_temp.ok(api.close_cash_shift(sid,ver,(expected-1000)::text,'Thối nhầm 1.000',gen_random_uuid()),'CLOSE');
 if (r#>>'{data,difference}')::numeric <> -1000 or r#>>'{data,status}' <> 'CLOSED' then raise exception 'CLOSE_RESULT_WRONG %',r; end if;
 if pg_temp.code(api.close_cash_shift(sid,ver+1,expected::text,null,gen_random_uuid())) <> 'CASH_SHIFT_ALREADY_CLOSED' then raise exception 'CLOSED_TWICE'; end if;
 if jsonb_array_length(pg_temp.ok(api.list_cash_shifts('OWN',null,null,30),'LIST')#>'{data,items}') <> 1 then raise exception 'LIST_OWN_WRONG'; end if;
 if pg_temp.code(api.list_cash_shifts('ALL',null,null,30)) <> 'REPORT_SCOPE_DENIED' then raise exception 'CASHIER_LISTS_ALL'; end if;
 if pg_temp.ok(api.get_my_command_outcome('cash.shift.close',(select idempotency_key from app_private.command_deduplication where command_name='cash.shift.close' limit 1)),'OUTCOME')#>>'{data,status}' <> 'RESOLVED' then
  raise exception 'OUTCOME_LOOKUP_MISSING';
 end if;
 raise notice 'PASS cashier sees only own money and closes a shift with the exact expected cash';
end $$;

-- Chỉ ghi thêm: phiếu, số dư đầu và ca đã đóng không sửa/xóa được.
do $$
declare blocked int:=0;
begin
 begin update app_private.cash_vouchers set amount=amount+1 where voucher_number='PC000001'; exception when sqlstate '55000' then blocked:=blocked+1; end;
 begin delete from app_private.cash_vouchers where voucher_number='PC000001'; exception when sqlstate '55000' then blocked:=blocked+1; end;
 begin update app_private.cash_fund_openings set amount=1; exception when sqlstate '55000' then blocked:=blocked+1; end;
 begin update app_private.cash_shifts set counted_cash=counted_cash+1; exception when sqlstate '55000' then blocked:=blocked+1; end;
 begin delete from app_private.cash_shifts; exception when sqlstate '55000' then blocked:=blocked+1; end;
 if blocked<>5 then raise exception 'CASH_LEDGER_EDIT_NOT_BLOCKED %',blocked; end if;
 if (select count(*) from app_private.audit_events where action like 'cash.%') <> 6 then
  raise exception 'CASH_AUDIT_MISSING %',(select json_agg(action) from app_private.audit_events where action like 'cash.%');
 end if;
 raise notice 'PASS cash ledgers are append-only and every command is audited';
end $$;
rollback;
