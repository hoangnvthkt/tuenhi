\set ON_ERROR_STOP on
begin;
do $$ begin
 if current_database()<>'pos_debt_reminders' or inet_server_addr() is not null then raise exception 'ISOLATED_DATABASE_REQUIRED'; end if;
end $$;
-- Schema-only fixture: no production identities or financial rows are copied.
insert into app_private.permission_definitions(code,category,label,description)
select permission,'audit',permission,'Synthetic reminder audit' from unnest(array['sale.draft.manage','sale.complete','sale.cancel','sale.discount.apply','sale.own.read','sale.all.read']) permission on conflict do nothing;
insert into auth.users(id,email)
select ('11000000-0000-4000-8000-00000000000'||n)::uuid,'debt-reminder-'||n||'@example.invalid' from generate_series(1,5) n;
insert into api.profiles(id,email,display_name,role_template,is_active,must_change_password)
select ('11000000-0000-4000-8000-00000000000'||n)::uuid,'debt-reminder-'||n||'@example.invalid','Reminder fixture '||n,
 case when n in (2,3) then 'BUSINESS' else 'OWNER' end,n<>4,n=5 from generate_series(1,5) n;
insert into app_private.user_permission_overrides(user_id,permission_code,effect,changed_by,reason)
values('11000000-0000-4000-8000-000000000002','customer.debt.read','GRANT','11000000-0000-4000-8000-000000000001','Fixture debt access');
insert into api.store_settings(id,display_name) values(1,'Reminder fixture');
insert into api.sales_channels(id,code,name,name_normalized) values('21000000-0000-4000-8000-000000000001','IN_STORE','Reminder fixture','reminder fixture');
insert into api.products(id,sku,sku_normalized,name,name_normalized,unit_name,created_by,updated_by)
values('31000000-0000-4000-8000-000000000001','REMINDER','reminder','Reminder item','reminder item','Thùng','11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001');
insert into api.inventory_balances(product_id,on_hand_qty) values('31000000-0000-4000-8000-000000000001',100);
insert into app_private.inventory_cost_balances(product_id,inventory_value,avg_unit_cost) values('31000000-0000-4000-8000-000000000001',500,5) on conflict(product_id) do update set inventory_value=500,avg_unit_cost=5;
insert into app_private.product_sale_prices(product_id,sale_price,changed_by) values('31000000-0000-4000-8000-000000000001',20000,'11000000-0000-4000-8000-000000000001');
insert into app_private.document_sequences(document_type,prefix) values('SALE','HD');
insert into api.customers(id,code,code_normalized,customer_type,name,name_normalized,created_by,updated_by)
select ('41000000-0000-4000-8000-00000000000'||n)::uuid,'REM0'||n,'rem0'||n,'INDIVIDUAL','Khách nhắc nợ '||n,'khách nhắc nợ '||n,
'11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001' from generate_series(1,3) n;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
create function pg_temp.credit_sale(p_customer uuid,p_age interval) returns uuid language plpgsql as $$
declare saved jsonb; result jsonb; sid uuid;
begin
 saved:=api.save_sale_draft(null,null,p_customer,'21000000-0000-4000-8000-000000000001','[{"productId":"31000000-0000-4000-8000-000000000001","quantity":"5","lineDiscountAmount":"0","lineOrder":0}]','0','Reminder fixture',gen_random_uuid());
 if saved->>'ok' is distinct from 'true' then raise exception 'SALE_FIXTURE_FAILED %',saved; end if;
 sid:=(saved#>>'{data,sale,id}')::uuid;
 result:=api.complete_sale_with_allocations(sid,(saved#>>'{data,sale,version}')::bigint,'0','0',gen_random_uuid(),null);
 if result->>'ok' is distinct from 'true' then raise exception 'CREDIT_FIXTURE_FAILED %',result; end if;
 update app_private.sale_payment_allocations set created_at=now()-p_age where sale_id=sid;
 return sid;
end $$;
create function pg_temp.flush_reminders() returns void language plpgsql as $$ begin
 set constraints all immediate;
 set constraints all deferred;
end $$;

do $$
declare c uuid:='41000000-0000-4000-8000-000000000001'; old_sale uuid; new_sale uuid; result jsonb; debt jsonb; notification_id uuid; tuple_before text;
begin
 old_sale:=pg_temp.credit_sale(c,interval '7 days' - interval '1 second');
 perform pg_temp.flush_reminders();
 result:=api.get_my_notifications();
 if exists(select 1 from api.user_notifications where entity_type='customer_debt') then raise exception 'EARLY_DEBT_REMINDER'; end if;
 update app_private.sale_payment_allocations set created_at=now()-interval '7 days' where sale_id=old_sale;
 result:=api.get_my_notifications();
 if (select count(*) from api.user_notifications where user_id='11000000-0000-4000-8000-000000000001' and entity_type='customer_debt' and entity_id=c)<>1 then raise exception 'MISSING_SEVEN_DAY_REMINDER %',result; end if;
 select id into notification_id from api.user_notifications where user_id='11000000-0000-4000-8000-000000000001' and entity_type='customer_debt' and entity_id=c;
 if not exists(select 1 from jsonb_array_elements(result#>'{data,items}') item where item->>'id'=notification_id::text and item->>'actionRoute'='/customers/'||c::text) then raise exception 'REMINDER_NOT_IN_FEED'; end if;
 update api.customers set code=null,code_normalized=null where id=c;
 result:=api.get_my_notifications();
 if result->>'ok' is distinct from 'true' or not exists(select 1 from api.user_notifications where id=notification_id and message like '%Không có mã%') then raise exception 'CLEARED_CUSTOMER_CODE_BREAKS_REMINDER %',result; end if;
 update api.customers set code='REM01',code_normalized='rem01' where id=c;
 perform api.get_my_notifications();
 result:=api.mark_notification_read(notification_id);
 select ctid::text into tuple_before from api.user_notifications where id=notification_id;
 perform api.get_my_notifications(); perform api.get_my_notifications();
 if (select ctid::text from api.user_notifications where id=notification_id) is distinct from tuple_before then raise exception 'UNCHANGED_FEED_REWRITES_NOTIFICATION'; end if;
 if (select count(*) from api.user_notifications where user_id='11000000-0000-4000-8000-000000000001' and entity_type='customer_debt' and entity_id=c)<>1 or (select read_at from api.user_notifications where id=notification_id) is null then raise exception 'SAME_DAY_READ_REMINDER_REPEATED'; end if;
 update api.user_notifications set created_at=now()-interval '2 days',
  metadata=jsonb_set(metadata,'{reminderDate}',to_jsonb(((now() at time zone interval '+07:00')::date-1)::text)) where id=notification_id;
 insert into api.user_notifications(user_id,severity,category,title,message,created_at)
 values('11000000-0000-4000-8000-000000000001','INFO','Audit','Newer notification','Fixture ordering',now()-interval '1 day');
 result:=api.get_my_notifications(p_limit=>1);
 if result#>>'{data,items,0,id}' is distinct from notification_id::text then raise exception 'DAILY_REMINDER_BURIED_IN_FEED %',result; end if;
 if (select read_at from api.user_notifications where id=notification_id) is not null then raise exception 'NEXT_DAY_REMINDER_NOT_REARMED'; end if;
 new_sale:=pg_temp.credit_sale(c,interval '1 day');
 perform pg_temp.flush_reminders();
 if (select count(*) from api.user_notifications where entity_type='customer_debt' and entity_id=c)<>2 then raise exception 'WRONG_DEBT_RECIPIENTS'; end if;
 if exists(select 1 from api.user_notifications where entity_type='customer_debt' and user_id in ('11000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000004','11000000-0000-4000-8000-000000000005')) then raise exception 'UNAUTHORIZED_DEBT_RECIPIENT'; end if;
 debt:=api.get_customer_debt(c);
 result:=api.collect_customer_debt(c,(debt#>>'{data,version}')::bigint,'50000','0','Partial payment',gen_random_uuid());
 if result->>'ok' is distinct from 'true' then raise exception 'PARTIAL_PAYMENT_FAILED %',result; end if;
 perform pg_temp.flush_reminders();
 if not exists(select 1 from api.user_notifications where id=notification_id and metadata->>'balance'='150000.00' and metadata->>'overdueAmount'='50000.00') then raise exception 'PARTIAL_PAYMENT_REMINDER_STALE'; end if;
 result:=api.collect_customer_debt(c,(result#>>'{data,version}')::bigint,'50000','0','Old invoice paid',gen_random_uuid());
 perform pg_temp.flush_reminders();
 if exists(select 1 from api.user_notifications where entity_type='customer_debt' and entity_id=c) then raise exception 'PAID_OLD_INVOICE_AGES_NEW_DEBT'; end if;
 update app_private.sale_payment_allocations set created_at=now()-interval '8 days' where sale_id=new_sale;
 perform api.get_my_notifications();
 if not exists(select 1 from api.user_notifications where entity_type='customer_debt' and entity_id=c) then raise exception 'NEW_INVOICE_NEVER_AGES'; end if;
 result:=api.collect_customer_debt(c,(result#>>'{data,version}')::bigint,'100000','0','Full payment',gen_random_uuid());
 perform pg_temp.flush_reminders();
 if exists(select 1 from api.user_notifications where entity_type='customer_debt' and entity_id=c) then raise exception 'PAID_DEBT_REMINDER_REMAINS'; end if;
 perform api.get_my_notifications();
 if exists(select 1 from api.user_notifications where entity_type='customer_debt' and entity_id=c) then raise exception 'PAID_DEBT_REMINDER_RECREATED'; end if;
 raise notice 'PASS seven-day boundary, recipient permissions, daily dedupe, partial/full collection and invoice aging';
end $$;

do $$
declare c uuid:='41000000-0000-4000-8000-000000000002'; result jsonb; debt jsonb;
begin
 result:=api.adjust_customer_debt(c,1,'100000','Opening debt',gen_random_uuid());
 if result->>'ok' is distinct from 'true' then raise exception 'MANUAL_FIXTURE_FAILED %',result; end if;
 update app_private.customer_debt_entries set occurred_at=now()-interval '10 days' where customer_id=c;
 perform pg_temp.flush_reminders();
 if not exists(select 1 from api.user_notifications where entity_id=c and metadata->>'overdueAmount'='100000.00') then raise exception 'MANUAL_DEBT_AGE_IGNORED'; end if;
 result:=api.adjust_customer_debt(c,(result#>>'{data,version}')::bigint,'150000','New manual debt',gen_random_uuid());
 perform pg_temp.flush_reminders();
 if not exists(select 1 from api.user_notifications where entity_id=c and metadata->>'overdueAmount'='100000.00' and metadata->>'balance'='150000.00') then raise exception 'NEW_MANUAL_DEBT_BACKDATED'; end if;
 result:=api.collect_customer_debt(c,(result#>>'{data,version}')::bigint,'100000','0','Old manual debt paid',gen_random_uuid());
 perform pg_temp.flush_reminders();
 if exists(select 1 from api.user_notifications where entity_type='customer_debt' and entity_id=c) then raise exception 'MANUAL_FIFO_AGE_NOT_CLEARED'; end if;
 update app_private.customer_debt_entries set occurred_at=now()-interval '8 days' where customer_id=c and delta=50000;
 perform api.get_my_notifications();
 if not exists(select 1 from api.user_notifications where entity_id=c and metadata->>'overdueAmount'='50000.00') then raise exception 'REMAINING_MANUAL_LOT_NOT_AGED'; end if;
 result:=api.adjust_customer_debt(c,(result#>>'{data,version}')::bigint,'0','Write off debt',gen_random_uuid());
 perform pg_temp.flush_reminders();
 if exists(select 1 from api.user_notifications where entity_type='customer_debt' and entity_id=c) then raise exception 'WRITTEN_OFF_REMINDER_REMAINS'; end if;
 raise notice 'PASS manual debt FIFO aging, later increases and write-off resolution';
end $$;

-- Cancellation must resolve warnings at transaction completion as well.
do $$
declare c uuid:='41000000-0000-4000-8000-000000000001'; sid uuid; result jsonb; version bigint;
begin
 sid:=pg_temp.credit_sale(c,interval '8 days');
 perform pg_temp.flush_reminders();
 if not exists(select 1 from api.user_notifications where entity_type='customer_debt' and entity_id=c) then raise exception 'CANCEL_REMINDER_FIXTURE_MISSING'; end if;
 select s.version into version from api.sales s where id=sid;
 result:=api.cancel_sale(sid,version,'Cancel reminder fixture',gen_random_uuid());
 if result->>'ok' is distinct from 'true' then raise exception 'CANCEL_FAILED %',result; end if;
 perform pg_temp.flush_reminders();
 if exists(select 1 from api.user_notifications where entity_type='customer_debt' and entity_id=c) then raise exception 'CANCELLED_DEBT_REMINDER_REMAINS'; end if;
 raise notice 'PASS cancellation resolves warning';
end $$;

-- A failed financial transaction must not leave a notification behind.
savepoint rollback_reminder;
do $$ begin perform pg_temp.credit_sale('41000000-0000-4000-8000-000000000001',interval '8 days'); perform pg_temp.flush_reminders(); end $$;
rollback to rollback_reminder;
do $$ begin
 if exists(select 1 from api.user_notifications where entity_type='customer_debt' and entity_id='41000000-0000-4000-8000-000000000001') then raise exception 'ROLLED_BACK_DEBT_REMINDER_REMAINS'; end if;
end $$;

-- The real authenticated RPC must enforce revoked access in the feed and RLS.
do $$ begin perform pg_temp.credit_sale('41000000-0000-4000-8000-000000000003',interval '8 days'); perform pg_temp.flush_reminders(); end $$;
grant usage on schema api,app_private to authenticated;
grant execute on function api.get_my_notifications(boolean,timestamptz,uuid,integer),app_private.get_my_notifications_impl(boolean,timestamptz,uuid,integer),app_private.has_active_profile(boolean),app_private.has_permission(text) to authenticated;
grant select on api.user_notifications to authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ declare result jsonb; begin
 result:=api.get_my_notifications();
 if jsonb_array_length(result#>'{data,items}')<>1 then raise exception 'AUTHORIZED_READER_FEED_FAILED %',result; end if;
end $$;
reset role;
update app_private.user_permission_overrides set effect='REVOKE' where user_id='11000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ declare result jsonb; begin
 if exists(select 1 from api.user_notifications where entity_type='customer_debt') then raise exception 'REVOKED_READER_DIRECT_DATA_LEAK'; end if;
 result:=api.get_my_notifications();
 if jsonb_array_length(result#>'{data,items}')<>0 then raise exception 'REVOKED_READER_FEED_LEAK'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
do $$ declare result jsonb; begin
 result:=api.get_my_notifications();
 if result#>>'{error,code}' is distinct from 'AUTH_REQUIRED' then raise exception 'ANONYMOUS_NOTIFICATION_FEED_ALLOWED'; end if;
 if has_function_privilege('authenticated','app_private.refresh_customer_debt_reminders(uuid,uuid)','EXECUTE') then raise exception 'PRIVATE_REFRESH_EXPOSED'; end if;
 raise notice 'PASS authenticated feed, revoked RLS access and private refresh privileges';
end $$;
rollback;
