\set ON_ERROR_STOP on
begin;
do $$ begin if current_database() <> 'dashboard_settlement_test' or inet_server_addr() is not null then raise exception 'ISOLATED_DATABASE_REQUIRED'; end if; end $$;
insert into app_private.permission_definitions(code,category,label,description)
select permission,'audit',permission,'Synthetic local audit' from unnest(array['sale.draft.manage','sale.complete','sale.cancel','sale.discount.apply','sale.own.read','sale.all.read','return.request.create','return.complete','report.all_revenue.read','report.own_revenue.read']) permission;
insert into auth.users(id,email) values('10000000-0000-4000-8000-000000000001','sales-audit@example.invalid');
insert into api.profiles(id,email,display_name,role_template,must_change_password) values('10000000-0000-4000-8000-000000000001','sales-audit@example.invalid','Synthetic audit','OWNER',false);
insert into api.store_settings(id,display_name) values(1,'Synthetic audit');
insert into api.sales_channels(id,code,name,name_normalized) values('20000000-0000-4000-8000-000000000001','IN_STORE','Local audit','local audit');
insert into api.products(id,sku,sku_normalized,name,name_normalized,unit_name,created_by,updated_by) values('30000000-0000-4000-8000-000000000001','AUDIT','audit','Audit item','audit item','Box','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
insert into api.inventory_balances(product_id,on_hand_qty) values('30000000-0000-4000-8000-000000000001',100);
insert into app_private.inventory_cost_balances(product_id,inventory_value,avg_unit_cost) values('30000000-0000-4000-8000-000000000001',500,5) on conflict(product_id) do update set inventory_value=500,avg_unit_cost=5;
insert into app_private.product_sale_prices(product_id,sale_price,changed_by) values('30000000-0000-4000-8000-000000000001',20000,'10000000-0000-4000-8000-000000000001');
insert into app_private.document_sequences(document_type,prefix) values('SALE','HD'),('SALE_RETURN','TH');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
insert into api.customers(id,code,code_normalized,customer_type,name,name_normalized,created_by,updated_by) values
('40000000-0000-4000-8000-000000000001','KH01','kh01','INDIVIDUAL','Khách 01','khách 01','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
('40000000-0000-4000-8000-000000000002','KH02','kh02','INDIVIDUAL','Khách 02','khách 02','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
create function pg_temp.settlement_sale(cash text,bank text,at_time timestamptz,legacy boolean default false) returns uuid language plpgsql as $$
declare saved jsonb; result jsonb; sid uuid;
begin
 saved:=api.save_sale_draft(null,null,'40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','[{"productId":"30000000-0000-4000-8000-000000000001","quantity":"5","lineDiscountAmount":"0","lineOrder":0}]','0','Settlement fixture',gen_random_uuid());
 if saved->>'ok' is distinct from 'true' then raise exception 'SAVE_FAILED %',saved; end if;
 sid:=(saved#>>'{data,sale,id}')::uuid;
 if legacy then result:=api.complete_sale(sid,(saved#>>'{data,sale,version}')::bigint,case when bank='0' then 'CASH' else 'BANK_TRANSFER' end,gen_random_uuid(),null);
 else result:=api.complete_sale_with_allocations(sid,(saved#>>'{data,sale,version}')::bigint,cash,bank,gen_random_uuid(),null); end if;
 if result->>'ok' is distinct from 'true' then raise exception 'SETTLEMENT_FIXTURE_FAILED %',result; end if;
 update api.sales set completed_at=at_time where id=sid;
 update app_private.sales_financial_events set occurred_at=at_time where sale_id=sid and event_type='SALE_COMPLETED';
 return sid;
end $$;

do $$
declare sid uuid; mixed_id uuid; rid uuid; lid uuid; rlid uuid; result jsonb; debt jsonb; page jsonb; cursor jsonb; cash_before numeric;
begin
 sid:=pg_temp.settlement_sale('30000','50000','2026-10-15 17:00:00+00'); mixed_id:=sid;
 result:=api.get_sale_settlement_report('2026-10-16','2026-10-16','ALL','ALL',null,null,1);
 if result->>'ok' is distinct from 'true' or (result#>>'{data,summary,cashAmount}')::numeric<>30000 or (result#>>'{data,summary,bankTransferAmount}')::numeric<>50000 or (result#>>'{data,summary,outstandingAmount}')::numeric<>20000 then raise exception 'MIXED_TOTALS_WRONG %',result; end if;
 debt:=api.get_customer_debt('40000000-0000-4000-8000-000000000001');
 result:=api.collect_customer_debt('40000000-0000-4000-8000-000000000001',(debt#>>'{data,version}')::bigint,'10000','0','Fixture payment',gen_random_uuid());
 if result->>'ok' is distinct from 'true' then raise exception 'COLLECT_FAILED %',result; end if;
 result:=api.get_sale_settlement_report('2026-10-16','2026-10-16','ALL','DEBT',null,null,1);
 if (result#>>'{data,summary,cashAmount}')::numeric<>40000 or (result#>>'{data,summary,outstandingAmount}')::numeric<>10000 or jsonb_array_length(result#>'{data,items}')<>1 then raise exception 'REPAYMENT_NOT_REFLECTED %',result; end if;
 select id into lid from api.sale_lines where sale_id=sid;
 result:=api.create_sale_return_request(sid,'Fixture return',jsonb_build_array(jsonb_build_object('originalSaleLineId',lid,'requestedQty','1')),gen_random_uuid());
 rid:=(result#>>'{data,returnId}')::uuid;
 select id into rlid from api.sale_return_lines where sale_return_id=rid;
 result:=api.complete_sale_return(rid,(result#>>'{data,version}')::bigint,jsonb_build_array(jsonb_build_object('saleReturnLineId',rlid,'acceptedQty','1')),'CASH',gen_random_uuid(),null);
 if result->>'ok' is distinct from 'true' then raise exception 'RETURN_FAILED %',result; end if;
 result:=api.get_sale_settlement_report('2026-10-16','2026-10-16','ALL','DEBT',null,null,1);
 if (result#>>'{data,summary,cashAmount}')::numeric<>30000 or (result#>>'{data,summary,outstandingAmount}')::numeric<>0 or jsonb_array_length(result#>'{data,items}')<>0 then raise exception 'RETURN_OFFSET_WRONG %',result; end if;
 -- Boundary: prior instant is previous Vietnam day; next-day midnight excluded.
 perform pg_temp.settlement_sale('0','0','2026-10-15 16:59:59+00');
 perform pg_temp.settlement_sale('0','100000','2026-10-16 17:00:00+00',true);
 result:=api.get_sale_settlement_report('2026-10-16','2026-10-16','ALL','ALL',null,null,1);
 if jsonb_array_length(result#>'{data,items}')<>1 or (result#>>'{data,summary,bankTransferAmount}')::numeric<>50000 or (result#>>'{data,summary,outstandingAmount}')::numeric<>0 then raise exception 'VN_BOUNDARIES_WRONG %',result; end if;
 -- Cancelled payments do not contribute; legacy cash is included without allocation.
 sid:=pg_temp.settlement_sale('100000','0','2026-10-16 01:00:00+00',true);
 select version into cash_before from api.sales where id=sid;
 result:=api.cancel_sale(sid,cash_before::bigint,'Fixture cancellation',gen_random_uuid());
 if result->>'ok' is distinct from 'true' then raise exception 'CANCEL_FAILED %',result; end if;
 perform pg_temp.settlement_sale('100000','0','2026-10-16 02:00:00+00',true);
 result:=api.get_sale_settlement_report('2026-10-16','2026-10-16','ALL','CASH',null,null,1);
 if (result#>>'{data,summary,cashAmount}')::numeric<>130000 or (result#>>'{data,summary,bankTransferAmount}')::numeric<>50000 then raise exception 'LEGACY_OR_CANCEL_WRONG %',result; end if;
 cursor:=result#>'{data,nextCursor}';
 if cursor is null or cursor='null'::jsonb then raise exception 'MISSING_PAGE_CURSOR'; end if;
 page:=api.get_sale_settlement_report('2026-10-16','2026-10-16','ALL','CASH',(cursor->>'completedAt')::timestamptz,(cursor->>'id')::uuid,1);
 if (page#>>'{data,summary,cashAmount}')::numeric<>130000 or page#>>'{data,items,0,id}'=result#>>'{data,items,0,id}' then raise exception 'PAGINATION_OR_TOTAL_WRONG %',page; end if;
 -- A cash refund may exceed the original cash portion of a mixed invoice.
 select id into lid from api.sale_lines where sale_id=mixed_id;
 result:=api.create_sale_return_request(mixed_id,'Fixture final return',jsonb_build_array(jsonb_build_object('originalSaleLineId',lid,'requestedQty','4')),gen_random_uuid());
 rid:=(result#>>'{data,returnId}')::uuid;
 select id into rlid from api.sale_return_lines where sale_return_id=rid;
 result:=api.complete_sale_return(rid,(result#>>'{data,version}')::bigint,jsonb_build_array(jsonb_build_object('saleReturnLineId',rlid,'acceptedQty','4')),'CASH',gen_random_uuid(),null);
 if result->>'ok' is distinct from 'true' then raise exception 'FINAL_RETURN_FAILED %',result; end if;
 result:=api.get_sale_settlement_report('2026-10-16','2026-10-16','ALL','CASH',null,null,50);
 if not exists(select 1 from jsonb_array_elements(result#>'{data,items}') item where (item->>'id')::uuid=mixed_id and (item->>'cashAmount')::numeric=-50000) then raise exception 'NEGATIVE_METHOD_REFUND_HIDDEN %',result; end if;
 result:=api.get_sale_settlement_report('2026-09-01','2026-09-01','ALL','ALL',null,null,50);
 if (result#>>'{data,summary,cashAmount}')::numeric<>0 or jsonb_array_length(result#>'{data,items}')<>0 then raise exception 'EMPTY_TOTALS_WRONG %',result; end if;
 result:=api.get_sale_settlement_report('2026-10-17','2026-10-16','ALL','ALL',null,null,50);
 if result#>>'{error,code}' is distinct from 'REPORT_DATE_RANGE_INVALID' then raise exception 'BAD_RANGE_ALLOWED %',result; end if;
 result:=api.get_sale_settlement_report('2026-10-16','2026-10-16','ALL','BOGUS',null,null,50);
 if result#>>'{error,code}' is distinct from 'VALIDATION_FAILED' then raise exception 'BAD_METHOD_ALLOWED %',result; end if;
 raise notice 'PASS mixed allocations, repayment, return offsets, legacy/cancelled, Vietnam dates, pagination and empty ranges';
end $$;
insert into auth.users(id,email) values('10000000-0000-4000-8000-000000000002','staff@example.invalid');
insert into api.profiles(id,email,display_name,role_template,must_change_password) values('10000000-0000-4000-8000-000000000002','staff@example.invalid','Staff','BUSINESS',false);
insert into app_private.user_permission_overrides(user_id,permission_code,effect,changed_by,reason) values('10000000-0000-4000-8000-000000000002','report.own_revenue.read','GRANT','10000000-0000-4000-8000-000000000001','Local report fixture');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$ declare result jsonb; begin
 result:=api.get_sale_settlement_report('2026-10-16','2026-10-16','ALL','ALL',null,null,50);
 if result#>>'{error,code}' is distinct from 'REPORT_SCOPE_DENIED' then raise exception 'ALL_SCOPE_LEAKED %',result; end if;
 result:=api.get_sale_settlement_report('2026-10-16','2026-10-16','OWN','ALL',null,null,50);
 if result->>'ok' is distinct from 'true' or (result#>>'{data,summary,cashAmount}')::numeric<>0 or jsonb_array_length(result#>'{data,items}')<>0 then raise exception 'OTHER_STAFF_LEAKED %',result; end if;
 raise notice 'PASS OWN scope denies all-store requests and hides another staff invoices';
end $$;
select set_config('request.jwt.claim.sub','',true);
do $$ declare result jsonb; begin
 result:=api.get_sale_settlement_report('2026-10-16','2026-10-16','OWN','ALL',null,null,50);
 if result#>>'{error,code}' not in ('PERMISSION_DENIED','REPORT_SCOPE_DENIED') then raise exception 'UNAUTHENTICATED_ALLOWED %',result; end if;
end $$;
rollback;
