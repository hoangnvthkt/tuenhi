-- Add customer credit without changing historical settlements or business rows.
begin;

insert into app_private.permission_definitions(code,category,label,owner_only,description) values
 ('customer.debt.read','Công nợ','Xem công nợ khách hàng',false,'Xem số dư và lịch sử công nợ toàn khách hàng.'),
 ('customer.debt.collect','Công nợ','Thu nợ khách hàng',false,'Ghi nhận khách trả nợ bằng tiền mặt/chuyển khoản.'),
 ('customer.debt.adjust','Công nợ','Chỉnh số dư công nợ',true,'Nhập nợ cũ hoặc điều chỉnh số dư, bắt buộc lý do.');

alter table app_private.command_deduplication add column request_hash text;
create table app_private.customer_debt_accounts (
 customer_id uuid primary key references api.customers(id) on delete restrict,
 balance numeric(20,2) not null default 0 check(balance>=0),
 unallocated_balance numeric(20,2) not null default 0 check(unallocated_balance>=0 and unallocated_balance<=balance),
 version bigint not null default 1 check(version>0),
 updated_at timestamptz not null default now()
);
create table app_private.sale_payment_allocations (
 sale_id uuid primary key references api.sales(id) on delete restrict,
 customer_id uuid references api.customers(id) on delete restrict,
 customer_code_snapshot text,
 initial_cash_amount numeric(20,2) not null check(initial_cash_amount>=0),
 initial_bank_transfer_amount numeric(20,2) not null check(initial_bank_transfer_amount>=0),
 initial_debt_amount numeric(20,2) not null check(initial_debt_amount>=0),
 cash_amount numeric(20,2) not null check(cash_amount>=0),
 bank_transfer_amount numeric(20,2) not null check(bank_transfer_amount>=0),
 outstanding_amount numeric(20,2) not null check(outstanding_amount>=0),
 adjusted_amount numeric(20,2) not null default 0 check(adjusted_amount>=0),
 offset_amount numeric(20,2) not null default 0 check(offset_amount>=0),
 created_at timestamptz not null default now(),
 check(initial_debt_amount=0 or customer_id is not null)
);
create index sale_payment_allocations_open_idx on app_private.sale_payment_allocations(customer_id,created_at,sale_id) where outstanding_amount>0;
create table app_private.customer_debt_entries (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references api.customers(id) on delete restrict,
 kind text not null check(kind in ('SALE_CREDIT','COLLECTION','ADJUSTMENT','RETURN_OFFSET','SALE_CANCELLED')),
 delta numeric(20,2) not null,
 balance_after numeric(20,2) not null check(balance_after>=0),
 cash_amount numeric(20,2) not null default 0 check(cash_amount>=0),
 bank_transfer_amount numeric(20,2) not null default 0 check(bank_transfer_amount>=0),
 note text check(length(note)<=500),
 sale_id uuid references api.sales(id) on delete restrict,
 return_id uuid references api.sale_returns(id) on delete restrict,
 actor_id uuid not null references api.profiles(id) on delete restrict,
 occurred_at timestamptz not null default now(),
 correlation_id uuid not null,
 check(kind<>'ADJUSTMENT' or (note is not null and length(btrim(note))>0)),
 check(kind<>'COLLECTION' or (delta<0 and cash_amount+bank_transfer_amount=-delta))
);
create index customer_debt_entries_customer_cursor_idx on app_private.customer_debt_entries(customer_id,occurred_at desc,id desc);
create unique index customer_debt_entries_sale_credit_idx on app_private.customer_debt_entries(sale_id) where kind='SALE_CREDIT';
create unique index customer_debt_entries_return_idx on app_private.customer_debt_entries(return_id) where kind='RETURN_OFFSET';
create unique index customer_debt_entries_cancel_idx on app_private.customer_debt_entries(sale_id) where kind='SALE_CANCELLED';
create table app_private.customer_debt_allocations (
 entry_id uuid not null references app_private.customer_debt_entries(id) on delete restrict,
 sale_id uuid not null references api.sales(id) on delete restrict,
 amount numeric(20,2) not null check(amount>0),
 primary key(entry_id,sale_id)
);

alter table app_private.customer_debt_accounts enable row level security;
alter table app_private.customer_debt_accounts force row level security;
alter table app_private.sale_payment_allocations enable row level security;
alter table app_private.sale_payment_allocations force row level security;
alter table app_private.customer_debt_entries enable row level security;
alter table app_private.customer_debt_entries force row level security;
alter table app_private.customer_debt_allocations enable row level security;
alter table app_private.customer_debt_allocations force row level security;
revoke all on app_private.customer_debt_accounts,app_private.sale_payment_allocations,app_private.customer_debt_entries,app_private.customer_debt_allocations from public,anon,authenticated,service_role;

create function app_private.valid_debt_money(p_value text) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(p_value ~ '^(0|[1-9][0-9]{0,17})(\.[0-9]{1,2})?$',false);
$$;

create function app_private.get_customer_debt_impl(p_customer_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_correlation uuid:=gen_random_uuid(); v_account app_private.customer_debt_accounts%rowtype;
begin
 if (select auth.uid()) is null or not app_private.has_permission('customer.debt.read') then
  return app_private.command_error('PERMISSION_DENIED','Bạn không có quyền xem công nợ.',v_correlation);
 end if;
 if not exists(select 1 from api.customers where id=p_customer_id) then
  return app_private.command_error('NOT_FOUND','Không tìm thấy khách hàng.',v_correlation);
 end if;
 select * into v_account from app_private.customer_debt_accounts where customer_id=p_customer_id;
 return app_private.command_success(jsonb_build_object('customerId',p_customer_id,'balance',coalesce(v_account.balance,0)::text,'version',coalesce(v_account.version,1)),v_correlation);
end $$;

create function app_private.list_customer_debt_entries_impl(p_customer_id uuid,p_cursor_at timestamptz,p_cursor_id uuid,p_limit integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_correlation uuid:=gen_random_uuid(); v_items jsonb; v_next jsonb;
begin
 if (select auth.uid()) is null or not app_private.has_permission('customer.debt.read') then
  return app_private.command_error('PERMISSION_DENIED','Bạn không có quyền xem công nợ.',v_correlation);
 end if;
 if p_customer_id is null or p_limit is null or p_limit not between 1 and 100 or (p_cursor_at is null)<>(p_cursor_id is null) then
  return app_private.command_error('VALIDATION_FAILED','Bộ lọc công nợ không hợp lệ.',v_correlation);
 end if;
 with fetched as (
  select e.*,s.sale_number,p.display_name,row_number() over(order by e.occurred_at desc,e.id desc) as rn
  from app_private.customer_debt_entries e
  join api.profiles p on p.id=e.actor_id left join api.sales s on s.id=e.sale_id
  where e.customer_id=p_customer_id and (p_cursor_at is null or (e.occurred_at,e.id)<(p_cursor_at,p_cursor_id))
  order by e.occurred_at desc,e.id desc limit p_limit+1
 ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'delta',delta::text,'balanceAfter',balance_after::text,
  'cashAmount',cash_amount::text,'bankTransferAmount',bank_transfer_amount::text,'note',note,'occurredAt',occurred_at,
  'actorName',display_name,'saleId',sale_id,'saleNumber',sale_number) order by occurred_at desc,id desc) filter(where rn<=p_limit),'[]'::jsonb),
  case when count(*)>p_limit then (select jsonb_build_object('occurredAt',occurred_at,'id',id) from fetched where rn=p_limit) end
 into v_items,v_next from fetched;
 return app_private.command_success(jsonb_build_object('items',v_items,'nextCursor',v_next),v_correlation);
end $$;

create function app_private.complete_sale_with_allocations_impl(p_sale_id uuid,p_expected_version bigint,p_cash_amount text,p_bank_transfer_amount text,p_idempotency_key uuid,p_transfer_proof_path text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid()); v_correlation uuid:=gen_random_uuid(); v_result jsonb; v_cached jsonb; v_hash text; v_existing_hash text;
 v_sale api.sales%rowtype; v_customer api.customers%rowtype; v_cash numeric(20,2); v_bank numeric(20,2); v_debt numeric(20,2); v_balance numeric(20,2);
begin
 if v_actor is null or not app_private.has_permission('sale.complete') then return app_private.command_error('PERMISSION_DENIED','Bạn không có quyền hoàn tất hóa đơn.',v_correlation); end if;
 if p_sale_id is null or p_expected_version is null or p_idempotency_key is null or not app_private.valid_debt_money(p_cash_amount) or not app_private.valid_debt_money(p_bank_transfer_amount) then
  return app_private.command_error('VALIDATION_FAILED','Số tiền thanh toán không hợp lệ.',v_correlation);
 end if;
 v_cash:=p_cash_amount::numeric; v_bank:=p_bank_transfer_amount::numeric;
 if p_transfer_proof_path is not null and (v_bank=0 or not app_private.payment_proof_path_is_owned(p_transfer_proof_path,'sale',p_sale_id,v_actor)) then
  return app_private.command_error('TRANSFER_PROOF_INVALID','Ảnh chứng từ chuyển khoản không hợp lệ.',v_correlation);
 end if;
 v_hash:=md5(jsonb_build_object('saleId',p_sale_id,'version',p_expected_version,'cash',v_cash,'bank',v_bank,'proof',p_transfer_proof_path)::text);
 perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':sale.complete:'||p_idempotency_key::text,0));
 select response,request_hash into v_cached,v_existing_hash from app_private.command_deduplication where actor_id=v_actor and command_name='sale.complete' and idempotency_key=p_idempotency_key;
 if found then
  if v_existing_hash is distinct from v_hash then return app_private.command_error('IDEMPOTENCY_CONFLICT','Mã yêu cầu đã dùng cho nội dung khác.',v_correlation); end if;
  return v_cached;
 end if;
 select * into v_sale from api.sales where id=p_sale_id;
 if not found or v_sale.created_by<>v_actor then return app_private.command_error('PERMISSION_DENIED','Bạn không có quyền thanh toán hóa đơn này.',v_correlation); end if;
 -- All debt writers lock customer before invoice; legacy full-payment commands do not touch debt.
 if v_sale.customer_id is not null then perform pg_advisory_xact_lock(hashtextextended('customer.debt:'||v_sale.customer_id::text,0)); end if;
 select * into v_sale from api.sales where id=p_sale_id for update;
 if v_cash+v_bank>v_sale.net_total then return app_private.command_error('PAYMENT_EXCEEDS_TOTAL','Tiền thanh toán vượt tổng hóa đơn.',v_correlation); end if;
 v_debt:=v_sale.net_total-v_cash-v_bank;
 select * into v_customer from api.customers where id=v_sale.customer_id;
 if v_debt>0 and (v_sale.customer_id is null or v_customer.id is null or not v_customer.is_active or nullif(btrim(v_customer.code),'') is null) then
  return app_private.command_error('CUSTOMER_REQUIRED_FOR_CREDIT','Chọn khách hàng đang hoạt động và có mã để ghi nợ.',v_correlation);
 end if;
 if v_debt>0 and coalesce((select balance from app_private.customer_debt_accounts where customer_id=v_sale.customer_id),0)+v_debt>999999999999999999.99 then
  return app_private.command_error('VALIDATION_FAILED','Tổng nợ khách hàng vượt giới hạn số tiền cho phép.',v_correlation);
 end if;
 v_result:=app_private.complete_sale_impl(p_sale_id,p_expected_version,case when v_bank>0 then 'BANK_TRANSFER' else 'CASH' end,p_idempotency_key);
 if v_result->>'ok' is distinct from 'true' then raise sqlstate 'PT003'; end if;
 insert into app_private.sale_payment_allocations(sale_id,customer_id,customer_code_snapshot,initial_cash_amount,initial_bank_transfer_amount,initial_debt_amount,cash_amount,bank_transfer_amount,outstanding_amount)
 values(p_sale_id,v_sale.customer_id,v_customer.code,v_cash,v_bank,v_debt,v_cash,v_bank,v_debt);
 update api.payments set amount=v_cash+v_bank,transfer_proof_path=p_transfer_proof_path where sale_id=p_sale_id;
 if v_debt>0 then
  insert into app_private.customer_debt_accounts(customer_id) values(v_sale.customer_id) on conflict do nothing;
  update app_private.customer_debt_accounts set balance=balance+v_debt,version=version+1,updated_at=now() where customer_id=v_sale.customer_id returning balance into v_balance;
  insert into app_private.customer_debt_entries(customer_id,kind,delta,balance_after,note,sale_id,actor_id,correlation_id)
  values(v_sale.customer_id,'SALE_CREDIT',v_debt,v_balance,'Phần chưa thanh toán của hóa đơn',p_sale_id,v_actor,v_correlation);
 end if;
 update app_private.command_deduplication set request_hash=v_hash where actor_id=v_actor and command_name='sale.complete' and idempotency_key=p_idempotency_key;
 insert into app_private.audit_events(actor_id,action,entity_type,entity_id,after_data,correlation_id)
 values(v_actor,'sale.payment.allocated','sale',p_sale_id,jsonb_build_object('cashAmount',v_cash::text,'bankTransferAmount',v_bank::text,'debtAmount',v_debt::text),v_correlation);
 return v_result;
exception when sqlstate 'PT003' then return v_result;
end $$;

create function app_private.change_customer_debt_impl(p_customer_id uuid,p_expected_version bigint,p_cash_amount text,p_bank_transfer_amount text,p_new_balance text,p_note text,p_idempotency_key uuid,p_kind text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid()); v_correlation uuid:=gen_random_uuid(); v_name text; v_hash text; v_existing_hash text; v_cached jsonb; v_result jsonb;
 v_account app_private.customer_debt_accounts%rowtype; v_cash numeric(20,2):=0; v_bank numeric(20,2):=0; v_balance numeric(20,2); v_delta numeric(20,2);
 v_remaining numeric(20,2); v_manual numeric(20,2); v_take numeric(20,2); v_cash_take numeric(20,2); v_bank_take numeric(20,2); v_cash_remaining numeric(20,2); v_entry uuid:=gen_random_uuid(); v_line record; v_note text:=nullif(btrim(p_note),'');
begin
 if p_kind is null or p_kind not in ('COLLECTION','ADJUSTMENT') then return app_private.command_error('VALIDATION_FAILED','Loại thao tác không hợp lệ.',v_correlation); end if;
 v_name:=case when p_kind='COLLECTION' then 'customer.debt.collect' else 'customer.debt.adjust' end;
 if v_actor is null or not app_private.has_permission(v_name) then return app_private.command_error('PERMISSION_DENIED','Bạn không có quyền thay đổi công nợ.',v_correlation); end if;
 if p_customer_id is null or p_expected_version is null or p_idempotency_key is null or length(coalesce(p_note,''))>500
  or (p_kind='COLLECTION' and (not app_private.valid_debt_money(p_cash_amount) or not app_private.valid_debt_money(p_bank_transfer_amount)))
  or (p_kind='ADJUSTMENT' and (not app_private.valid_debt_money(p_new_balance) or v_note is null)) then
  return app_private.command_error('VALIDATION_FAILED','Nhập số tiền hợp lệ và lý do điều chỉnh.',v_correlation);
 end if;
 if p_kind='COLLECTION' then v_cash:=p_cash_amount::numeric; v_bank:=p_bank_transfer_amount::numeric; end if;
 v_hash:=md5(jsonb_build_object('customerId',p_customer_id,'version',p_expected_version,'cash',v_cash,'bank',v_bank,'newBalance',case when p_kind='ADJUSTMENT' then p_new_balance::numeric end,'note',v_note)::text);
 perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':'||v_name||':'||p_idempotency_key::text,0));
 select response,request_hash into v_cached,v_existing_hash from app_private.command_deduplication where actor_id=v_actor and command_name=v_name and idempotency_key=p_idempotency_key;
 if found then
  if v_existing_hash is distinct from v_hash then return app_private.command_error('IDEMPOTENCY_CONFLICT','Mã yêu cầu đã dùng cho nội dung khác.',v_correlation); end if;
  return v_cached;
 end if;
 if not exists(select 1 from api.customers where id=p_customer_id and nullif(btrim(code),'') is not null) then return app_private.command_error('CUSTOMER_REQUIRED_FOR_CREDIT','Khách hàng cần có mã để quản lý công nợ.',v_correlation); end if;
 perform pg_advisory_xact_lock(hashtextextended('customer.debt:'||p_customer_id::text,0));
 insert into app_private.customer_debt_accounts(customer_id) values(p_customer_id) on conflict do nothing;
 select * into v_account from app_private.customer_debt_accounts where customer_id=p_customer_id for update;
 if v_account.version<>p_expected_version then return app_private.command_error('VERSION_CONFLICT','Công nợ đã thay đổi. Vui lòng tải lại.',v_correlation); end if;
 if p_kind='COLLECTION' then
  if v_cash+v_bank<=0 or v_cash+v_bank>v_account.balance then return app_private.command_error('DEBT_PAYMENT_EXCEEDS_BALANCE','Tiền thu phải lớn hơn 0 và không vượt số nợ hiện tại.',v_correlation); end if;
  v_balance:=v_account.balance-v_cash-v_bank;
 else v_balance:=p_new_balance::numeric; end if;
 v_delta:=v_balance-v_account.balance;
 if v_delta=0 then return app_private.command_error('NO_CHANGES','Số dư công nợ chưa thay đổi.',v_correlation); end if;
 -- Balance and manual component change together to preserve the table constraint.
 v_manual:=v_account.unallocated_balance;
 if v_delta>0 then v_manual:=v_manual+v_delta;
 elsif p_kind='ADJUSTMENT' then v_manual:=greatest(v_manual+v_delta,0);
 else v_manual:=least(v_account.unallocated_balance,v_balance); end if;
 update app_private.customer_debt_accounts set balance=v_balance,unallocated_balance=v_manual,version=version+1,updated_at=now() where customer_id=p_customer_id;
 insert into app_private.customer_debt_entries(id,customer_id,kind,delta,balance_after,cash_amount,bank_transfer_amount,note,actor_id,correlation_id)
 values(v_entry,p_customer_id,p_kind,v_delta,v_balance,v_cash,v_bank,v_note,v_actor,v_correlation);
 if v_delta<0 then
  v_remaining:=-v_delta;
  if p_kind='ADJUSTMENT' then v_remaining:=v_remaining-least(v_account.unallocated_balance,v_remaining); end if;
  v_cash_remaining:=v_cash;
  for v_line in select * from app_private.sale_payment_allocations where customer_id=p_customer_id and outstanding_amount>0 order by created_at,sale_id for update loop
   exit when v_remaining=0;
   v_take:=least(v_remaining,v_line.outstanding_amount);
   v_cash_take:=case when p_kind='COLLECTION' then least(v_take,v_cash_remaining) else 0 end;
   v_bank_take:=case when p_kind='COLLECTION' then v_take-v_cash_take else 0 end;
   update app_private.sale_payment_allocations set outstanding_amount=outstanding_amount-v_take,
    cash_amount=cash_amount+v_cash_take,bank_transfer_amount=bank_transfer_amount+v_bank_take,
    adjusted_amount=adjusted_amount+case when p_kind='ADJUSTMENT' then v_take else 0 end where sale_id=v_line.sale_id;
   insert into app_private.customer_debt_allocations(entry_id,sale_id,amount) values(v_entry,v_line.sale_id,v_take);
   if p_kind='COLLECTION' then
    update api.payments set amount=amount+v_take where sale_id=v_line.sale_id and status='CAPTURED';
   end if;
   v_cash_remaining:=v_cash_remaining-v_cash_take; v_remaining:=v_remaining-v_take;
  end loop;
 end if;
 if (select coalesce(sum(outstanding_amount),0) from app_private.sale_payment_allocations where customer_id=p_customer_id)+v_manual<>v_balance then raise exception 'CUSTOMER_DEBT_RECONCILIATION_FAILED'; end if;
 v_result:=app_private.command_success(jsonb_build_object('customerId',p_customer_id,'balance',v_balance::text,'version',v_account.version+1,'entryId',v_entry),v_correlation);
 insert into app_private.command_deduplication(actor_id,command_name,idempotency_key,response,request_hash) values(v_actor,v_name,p_idempotency_key,v_result,v_hash);
 insert into app_private.audit_events(actor_id,action,entity_type,entity_id,before_data,after_data,correlation_id)
 values(v_actor,v_name,'customer',p_customer_id,jsonb_build_object('balance',v_account.balance::text),jsonb_build_object('balance',v_balance::text,'entryId',v_entry,'reason',v_note),v_correlation);
 return v_result;
end $$;

-- Preserve the proven business implementations; add debt effects in the same transaction.
alter function app_private.complete_sale_return_impl(uuid,bigint,jsonb,text,uuid) rename to complete_sale_return_before_debt_impl;
create function app_private.complete_sale_return_impl(p_return_id uuid,p_expected_version bigint,p_lines jsonb,p_refund_method text,p_idempotency_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_cached jsonb; v_actor uuid:=(select auth.uid()); v_correlation uuid:=gen_random_uuid(); v_customer uuid; v_sale_id uuid;
 v_plan app_private.sale_payment_allocations%rowtype; v_refund numeric(20,2); v_non_cash numeric(20,2); v_debt_take numeric(20,2); v_balance numeric(20,2);
begin
 if v_actor is null or not app_private.has_permission('return.complete') then return app_private.command_error('PERMISSION_DENIED','Bạn không có quyền hoàn tất trả hàng.',v_correlation); end if;
 perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':sale.return.complete:'||p_idempotency_key::text,0));
 v_cached:=app_private.cached_command_response(v_actor,'sale.return.complete',p_idempotency_key);
 if v_cached is not null then return v_cached; end if;
 select s.id,s.customer_id into v_sale_id,v_customer from api.sale_returns r join api.sales s on s.id=r.original_sale_id where r.id=p_return_id;
 if v_customer is not null then perform pg_advisory_xact_lock(hashtextextended('customer.debt:'||v_customer::text,0)); end if;
 v_result:=app_private.complete_sale_return_before_debt_impl(p_return_id,p_expected_version,p_lines,p_refund_method,p_idempotency_key);
 if v_result->>'ok' is distinct from 'true' then raise sqlstate 'PT003'; end if;
 select * into v_plan from app_private.sale_payment_allocations where sale_id=v_sale_id for update;
 if found then
  select refund_total into v_refund from api.sale_returns where id=p_return_id;
  v_non_cash:=least(v_refund,v_plan.outstanding_amount+v_plan.adjusted_amount);
  v_debt_take:=least(v_non_cash,v_plan.outstanding_amount);
  if v_non_cash>0 then
   update app_private.sale_payment_allocations set outstanding_amount=outstanding_amount-v_debt_take,
    adjusted_amount=adjusted_amount-(v_non_cash-v_debt_take),offset_amount=offset_amount+v_non_cash where sale_id=v_sale_id;
   update api.sale_return_payments set amount=v_refund-v_non_cash where sale_return_id=p_return_id;
   if v_debt_take>0 then
    update app_private.customer_debt_accounts set balance=balance-v_debt_take,version=version+1,updated_at=now() where customer_id=v_customer returning balance into v_balance;
   else select balance into v_balance from app_private.customer_debt_accounts where customer_id=v_customer; end if;
   insert into app_private.customer_debt_entries(customer_id,kind,delta,balance_after,note,sale_id,return_id,actor_id,correlation_id)
   values(v_customer,'RETURN_OFFSET',-v_debt_take,v_balance,'Cấn trừ phần chưa thanh toán/đã chỉnh giảm khi trả hàng',v_sale_id,p_return_id,v_actor,v_correlation);
  end if;
  v_result:=jsonb_set(v_result,'{data}',(v_result->'data')||jsonb_build_object('cashRefundAmount',(v_refund-v_non_cash)::text,'debtOffsetAmount',v_non_cash::text));
  update app_private.command_deduplication set response=v_result where actor_id=v_actor and command_name='sale.return.complete' and idempotency_key=p_idempotency_key;
 end if;
 return v_result;
exception when sqlstate 'PT003' then return v_result;
end $$;

alter function app_private.cancel_sale_impl(uuid,bigint,text,uuid) rename to cancel_sale_before_debt_impl;
create function app_private.cancel_sale_impl(p_sale_id uuid,p_expected_version bigint,p_reason text,p_idempotency_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_cached jsonb; v_actor uuid:=(select auth.uid()); v_correlation uuid:=gen_random_uuid(); v_customer uuid; v_plan app_private.sale_payment_allocations%rowtype; v_balance numeric(20,2);
begin
 if v_actor is null or not app_private.has_permission('sale.cancel') then return app_private.command_error('PERMISSION_DENIED','Bạn không có quyền hủy hóa đơn.',v_correlation); end if;
 perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':sale.cancel:'||p_idempotency_key::text,0));
 v_cached:=app_private.cached_command_response(v_actor,'sale.cancel',p_idempotency_key);
 if v_cached is not null then return v_cached; end if;
 select customer_id into v_customer from api.sales where id=p_sale_id;
 if v_customer is not null then perform pg_advisory_xact_lock(hashtextextended('customer.debt:'||v_customer::text,0)); end if;
 v_result:=app_private.cancel_sale_before_debt_impl(p_sale_id,p_expected_version,p_reason,p_idempotency_key);
 if v_result->>'ok' is distinct from 'true' then raise sqlstate 'PT003'; end if;
 select * into v_plan from app_private.sale_payment_allocations where sale_id=p_sale_id for update;
 if found and v_plan.outstanding_amount>0 then
  update app_private.customer_debt_accounts set balance=balance-v_plan.outstanding_amount,version=version+1,updated_at=now() where customer_id=v_customer returning balance into v_balance;
  update app_private.sale_payment_allocations set offset_amount=offset_amount+outstanding_amount,outstanding_amount=0 where sale_id=p_sale_id;
  insert into app_private.customer_debt_entries(customer_id,kind,delta,balance_after,note,sale_id,actor_id,correlation_id)
  values(v_customer,'SALE_CANCELLED',-v_plan.outstanding_amount,v_balance,p_reason,p_sale_id,v_actor,v_correlation);
 end if;
 return v_result;
exception when sqlstate 'PT003' then return v_result;
end $$;

alter function app_private.get_sale_invoice_impl(uuid) rename to get_sale_invoice_before_debt_impl;
create function app_private.get_sale_invoice_impl(p_sale_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb; v_plan app_private.sale_payment_allocations%rowtype; v_customer uuid; v_payment api.payments%rowtype;
begin
 v_result:=app_private.get_sale_invoice_before_debt_impl(p_sale_id);
 if v_result->>'ok' is distinct from 'true' then return v_result; end if;
 select * into v_plan from app_private.sale_payment_allocations where sale_id=p_sale_id;
 select customer_id into v_customer from api.sales where id=p_sale_id;
 select * into v_payment from api.payments where sale_id=p_sale_id;
 v_result:=jsonb_set(v_result,'{data,sale}',(v_result#>'{data,sale}')||jsonb_build_object('customerId',v_customer,'customerCode',coalesce(v_plan.customer_code_snapshot,(select code from api.customers where id=v_customer))));
 v_result:=jsonb_set(v_result,'{data,totals}',(v_result#>'{data,totals}')||jsonb_build_object(
  'cashAmount',coalesce(v_plan.cash_amount,case when v_payment.method='CASH' then v_payment.amount else 0 end)::text,
  'bankTransferAmount',coalesce(v_plan.bank_transfer_amount,case when v_payment.method='BANK_TRANSFER' then v_payment.amount else 0 end)::text,
  'initialDebtAmount',coalesce(v_plan.initial_debt_amount,0)::text,
  'outstandingAmount',coalesce(v_plan.outstanding_amount,0)::text,
  'adjustedDebtAmount',coalesce(v_plan.adjusted_amount,0)::text,
  'debtOffsetAmount',coalesce(v_plan.offset_amount,0)::text));
 return v_result;
end $$;

alter function app_private.get_sale_return_impl(uuid) rename to get_sale_return_before_debt_impl;
create function app_private.get_sale_return_impl(p_return_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb; v_cash numeric(20,2); v_total numeric(20,2);
begin
 v_result:=app_private.get_sale_return_before_debt_impl(p_return_id);
 if v_result->>'ok' is distinct from 'true' then return v_result; end if;
 select p.amount,r.refund_total into v_cash,v_total from api.sale_returns r left join api.sale_return_payments p on p.sale_return_id=r.id where r.id=p_return_id;
 return jsonb_set(v_result,'{data}',(v_result->'data')||jsonb_build_object('cashRefundAmount',coalesce(v_cash,0)::text,'debtOffsetAmount',(v_total-coalesce(v_cash,0))::text));
end $$;

create function app_private.sale_payment_method_impl(p_sale_id uuid) returns text
language sql stable set search_path='' as $$
 select case when a.initial_cash_amount>0 and a.initial_bank_transfer_amount>0 then 'MIXED'
  when a.initial_debt_amount>0 then 'CREDIT' else p.method end
 from api.payments p left join app_private.sale_payment_allocations a on a.sale_id=p.sale_id where p.sale_id=p_sale_id;
$$;

-- Classify new payment allocations for revenue reports and customer purchase history.
-- Revenue remains the sold/returned amount; a subsequent debt collection creates no revenue event.
do $$
declare v_signature text; v_definition text; v_new text; v_fragment text;
begin
 foreach v_signature in array array[
  'app_private.revenue_report_data(date,date,uuid)',
  'app_private.get_profit_report_impl(date,date,timestamptz,uuid,integer)',
  'app_private.list_customer_sales_impl(uuid,date,date,timestamptz,uuid,integer)'
 ] loop
  v_definition:=pg_get_functiondef(v_signature::regprocedure);
  if v_signature like '%list_customer_sales%' then
   v_new:=replace(v_definition,'payment.method as payment_method','app_private.sale_payment_method_impl(sale.id) as payment_method');
  else
   v_new:=replace(v_definition,'select payment.method from api.payments payment','select app_private.sale_payment_method_impl(payment.sale_id) from api.payments payment');
  end if;
  if v_new=v_definition then raise exception 'PAYMENT_METHOD_PATCH_TARGET_MISSING: %',v_signature; end if;
  execute v_new;
 end loop;
 -- Outcome resolver retains actor-only lookup, adding the two protected debt commands.
 v_definition:=pg_get_functiondef('app_private.get_my_command_outcome_impl(text,uuid)'::regprocedure);
 v_new:=replace(v_definition,'''opening.post''','''opening.post'', ''customer.debt.collect'', ''customer.debt.adjust''');
 if v_new=v_definition then raise exception 'COMMAND_OUTCOME_PATCH_TARGET_MISSING'; end if;
 execute v_new;
end $$;

create function api.complete_sale_with_allocations(p_sale_id uuid,p_expected_version bigint,p_cash_amount text,p_bank_transfer_amount text,p_idempotency_key uuid,p_transfer_proof_path text default null) returns jsonb
language sql security invoker set search_path='' as $$ select app_private.complete_sale_with_allocations_impl(p_sale_id,p_expected_version,p_cash_amount,p_bank_transfer_amount,p_idempotency_key,p_transfer_proof_path); $$;
create function api.get_customer_debt(p_customer_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select app_private.get_customer_debt_impl(p_customer_id); $$;
create function api.list_customer_debt_entries(p_customer_id uuid,p_cursor_at timestamptz default null,p_cursor_id uuid default null,p_limit integer default 30) returns jsonb
language sql stable security invoker set search_path='' as $$ select app_private.list_customer_debt_entries_impl(p_customer_id,p_cursor_at,p_cursor_id,p_limit); $$;
create function api.collect_customer_debt(p_customer_id uuid,p_expected_version bigint,p_cash_amount text,p_bank_transfer_amount text,p_note text,p_idempotency_key uuid) returns jsonb
language sql security invoker set search_path='' as $$ select app_private.change_customer_debt_impl(p_customer_id,p_expected_version,p_cash_amount,p_bank_transfer_amount,null,p_note,p_idempotency_key,'COLLECTION'); $$;
create function api.adjust_customer_debt(p_customer_id uuid,p_expected_version bigint,p_new_balance text,p_reason text,p_idempotency_key uuid) returns jsonb
language sql security invoker set search_path='' as $$ select app_private.change_customer_debt_impl(p_customer_id,p_expected_version,null,null,p_new_balance,p_reason,p_idempotency_key,'ADJUSTMENT'); $$;

-- Grant only protected invoker entry points and the implementations they require.
revoke all on function app_private.valid_debt_money(text),app_private.sale_payment_method_impl(uuid) from public,anon,authenticated,service_role;
revoke all on function
 app_private.get_customer_debt_impl(uuid),
 app_private.list_customer_debt_entries_impl(uuid,timestamptz,uuid,integer),
 app_private.complete_sale_with_allocations_impl(uuid,bigint,text,text,uuid,text),
 app_private.change_customer_debt_impl(uuid,bigint,text,text,text,text,uuid,text),
 app_private.complete_sale_return_impl(uuid,bigint,jsonb,text,uuid),
 app_private.cancel_sale_impl(uuid,bigint,text,uuid),
 app_private.get_sale_invoice_impl(uuid),
 app_private.complete_sale_return_before_debt_impl(uuid,bigint,jsonb,text,uuid),
 app_private.cancel_sale_before_debt_impl(uuid,bigint,text,uuid),
 app_private.get_sale_invoice_before_debt_impl(uuid),
 app_private.get_sale_return_before_debt_impl(uuid),
 app_private.get_sale_return_impl(uuid),
 api.complete_sale_with_allocations(uuid,bigint,text,text,uuid,text),
 api.get_customer_debt(uuid),
 api.list_customer_debt_entries(uuid,timestamptz,uuid,integer),
 api.collect_customer_debt(uuid,bigint,text,text,text,uuid),
 api.adjust_customer_debt(uuid,bigint,text,text,uuid)
from public,anon,authenticated,service_role;
grant execute on function
 app_private.get_customer_debt_impl(uuid),
 app_private.list_customer_debt_entries_impl(uuid,timestamptz,uuid,integer),
 app_private.complete_sale_with_allocations_impl(uuid,bigint,text,text,uuid,text),
 app_private.change_customer_debt_impl(uuid,bigint,text,text,text,text,uuid,text),
 app_private.get_sale_invoice_impl(uuid),
 app_private.cancel_sale_impl(uuid,bigint,text,uuid),
 app_private.get_sale_return_impl(uuid),
 api.complete_sale_with_allocations(uuid,bigint,text,text,uuid,text),
 api.get_customer_debt(uuid),
 api.list_customer_debt_entries(uuid,timestamptz,uuid,integer),
 api.collect_customer_debt(uuid,bigint,text,text,text,uuid),
 api.adjust_customer_debt(uuid,bigint,text,text,uuid)
to authenticated;

notify pgrst,'reload schema';
commit;
