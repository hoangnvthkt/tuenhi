-- Wave 5: supplier payables (per posted receipt, FIFO payments through the cash
-- book), partial purchase returns at the original unit cost, and stock
-- write-offs at the moving average cost. New ledgers are append-only.
begin;

insert into app_private.permission_definitions(code,category,label,owner_only,description) values
 ('supplier.debt.read','Công nợ NCC','Xem công nợ nhà cung cấp',false,'Xem số phải trả, phiếu còn nợ và lịch sử trả NCC.'),
 ('supplier.debt.pay','Công nợ NCC','Trả nợ nhà cung cấp',false,'Ghi nhận trả tiền NCC bằng tiền mặt/chuyển khoản.'),
 ('supplier.debt.adjust','Công nợ NCC','Nhập nợ đầu kỳ NCC',true,'Nhập số nợ NCC có từ trước khi dùng app.'),
 ('purchase.return.post','Nhập hàng','Trả hàng nhập',false,'Ghi sổ trả một phần hàng cho nhà cung cấp theo phiếu nhập.'),
 ('inventory.writeoff.post','Kho','Xuất hủy',false,'Ghi sổ xuất hủy hàng hết hạn, hỏng, mất.');

alter table app_private.document_sequences drop constraint if exists document_sequences_document_type_check;
alter table app_private.document_sequences add constraint document_sequences_document_type_check
 check (document_type = any (array['PURCHASE_RECEIPT','STOCK_COUNT','SALE','SALE_RETURN','CASH_RECEIPT','CASH_PAYMENT','CASH_SHIFT','PURCHASE_RETURN','WRITE_OFF']));
insert into app_private.document_sequences(document_type,prefix) values('PURCHASE_RETURN','TN'),('WRITE_OFF','XH') on conflict do nothing;

alter table api.stock_movements drop constraint stock_movements_movement_type_check;
alter table api.stock_movements add constraint stock_movements_movement_type_check
 check (movement_type = any (array['OPENING','PURCHASE_RECEIPT','PURCHASE_REVERSAL','SALE','SALE_RETURN','SALE_CANCEL','STOCK_ADJUSTMENT','PURCHASE_RETURN','WRITE_OFF']));
alter table api.stock_movements drop constraint stock_movements_reference_type_check;
alter table api.stock_movements add constraint stock_movements_reference_type_check
 check (reference_type = any (array['PURCHASE_RECEIPT','STOCK_COUNT','SALE','SALE_RETURN','PURCHASE_RETURN','WRITE_OFF']));

create table app_private.supplier_debt_accounts (
 supplier_id uuid primary key references api.suppliers(id),
 balance numeric(20,2) not null default 0 check (balance >= 0),
 version bigint not null default 1,
 updated_at timestamptz not null default now()
);
-- What is still owed per posted receipt (or the one opening balance).
create table app_private.supplier_payables (
 id uuid primary key default gen_random_uuid(),
 supplier_id uuid not null references api.suppliers(id),
 kind text not null check (kind in ('RECEIPT','OPENING')),
 purchase_receipt_id uuid unique references api.purchase_receipts(id),
 total_amount numeric(20,2) not null check (total_amount > 0),
 paid_amount numeric(20,2) not null default 0 check (paid_amount >= 0),
 returned_amount numeric(20,2) not null default 0 check (returned_amount >= 0),
 reversed_amount numeric(20,2) not null default 0 check (reversed_amount >= 0),
 outstanding_amount numeric(20,2) not null check (outstanding_amount >= 0),
 opened_at timestamptz not null,
 created_at timestamptz not null default now(),
 check ((kind = 'RECEIPT') = (purchase_receipt_id is not null)),
 check (outstanding_amount = total_amount - paid_amount - returned_amount - reversed_amount)
);
create unique index supplier_payables_one_opening on app_private.supplier_payables(supplier_id) where kind = 'OPENING';
create index supplier_payables_open on app_private.supplier_payables(supplier_id, opened_at) where outstanding_amount > 0;

create table app_private.purchase_returns (
 id uuid primary key default gen_random_uuid(),
 return_number text not null unique,
 purchase_receipt_id uuid not null references api.purchase_receipts(id),
 supplier_id uuid references api.suppliers(id),
 reason text not null check (reason = btrim(reason) and length(reason) between 1 and 500),
 total_amount numeric(20,2) not null check (total_amount > 0),
 debt_applied numeric(20,2) not null check (debt_applied >= 0),
 refund_amount numeric(20,2) not null check (refund_amount >= 0),
 refund_method text check (refund_method is null or refund_method in ('CASH','BANK_TRANSFER')),
 actor_id uuid not null references api.profiles(id),
 posted_at timestamptz not null default now(),
 correlation_id uuid not null,
 check (debt_applied + refund_amount = total_amount),
 check ((refund_amount > 0) = (refund_method is not null))
);
create table app_private.purchase_return_lines (
 id uuid primary key default gen_random_uuid(),
 purchase_return_id uuid not null references app_private.purchase_returns(id),
 purchase_receipt_line_id uuid not null references api.purchase_receipt_lines(id),
 product_id uuid not null references api.products(id),
 quantity numeric(18,0) not null check (quantity > 0),
 line_amount numeric(20,2) not null check (line_amount >= 0),
 inventory_value_out numeric(20,2) not null check (inventory_value_out >= 0),
 stock_movement_id uuid not null references api.stock_movements(id),
 unique (purchase_return_id, purchase_receipt_line_id)
);

create table app_private.supplier_debt_entries (
 id uuid primary key default gen_random_uuid(),
 supplier_id uuid not null references api.suppliers(id),
 kind text not null check (kind in ('RECEIPT_POSTED','RECEIPT_REVERSED','OPENING','PAYMENT','PURCHASE_RETURN')),
 delta numeric(20,2) not null,
 balance_after numeric(20,2) not null check (balance_after >= 0),
 -- PAYMENT: money paid out. PURCHASE_RETURN: refund the supplier paid back.
 cash_amount numeric(20,2) not null default 0 check (cash_amount >= 0),
 bank_transfer_amount numeric(20,2) not null default 0 check (bank_transfer_amount >= 0),
 note text check (note is null or (note = btrim(note) and length(note) between 1 and 500)),
 purchase_receipt_id uuid references api.purchase_receipts(id),
 purchase_return_id uuid references app_private.purchase_returns(id),
 actor_id uuid not null references api.profiles(id),
 occurred_at timestamptz not null default now(),
 correlation_id uuid not null,
 check (delta <> 0 or kind = 'PURCHASE_RETURN'),
 check (kind <> 'PAYMENT' or (delta < 0 and cash_amount + bank_transfer_amount = -delta)),
 check (kind <> 'OPENING' or (delta > 0 and note is not null))
);
create index supplier_debt_entries_supplier_time on app_private.supplier_debt_entries(supplier_id, occurred_at desc);
create table app_private.supplier_debt_allocations (
 entry_id uuid not null references app_private.supplier_debt_entries(id),
 payable_id uuid not null references app_private.supplier_payables(id),
 amount numeric(20,2) not null check (amount > 0),
 primary key (entry_id, payable_id)
);

create table app_private.stock_write_offs (
 id uuid primary key default gen_random_uuid(),
 write_off_number text not null unique,
 reason_code text not null check (reason_code in ('EXPIRED','DAMAGED','LOST','OTHER')),
 note text check (note is null or (note = btrim(note) and length(note) between 1 and 500)),
 total_value numeric(20,2) not null check (total_value >= 0),
 actor_id uuid not null references api.profiles(id),
 posted_at timestamptz not null default now(),
 correlation_id uuid not null,
 check (reason_code <> 'OTHER' or note is not null)
);
create table app_private.stock_write_off_lines (
 id uuid primary key default gen_random_uuid(),
 write_off_id uuid not null references app_private.stock_write_offs(id),
 product_id uuid not null references api.products(id),
 quantity numeric(18,0) not null check (quantity > 0),
 unit_cost numeric(20,6) not null check (unit_cost >= 0),
 line_value numeric(20,2) not null check (line_value >= 0),
 stock_movement_id uuid not null references api.stock_movements(id),
 unique (write_off_id, product_id)
);

do $$ declare t text; begin
 foreach t in array array['supplier_debt_accounts','supplier_payables','purchase_returns','purchase_return_lines','supplier_debt_entries','supplier_debt_allocations','stock_write_offs','stock_write_off_lines'] loop
  execute format('alter table app_private.%I enable row level security', t);
  execute format('alter table app_private.%I force row level security', t);
  execute format('revoke all on app_private.%I from public, anon, authenticated, service_role', t);
 end loop;
 foreach t in array array['purchase_returns','purchase_return_lines','supplier_debt_entries','supplier_debt_allocations','stock_write_offs','stock_write_off_lines'] loop
  execute format('create trigger %I before update or delete on app_private.%I for each row execute function app_private.guard_ledger_change()', t || '_append_only', t);
 end loop;
end $$;

-- Posting a receipt with a supplier opens a payable; reversing an untouched
-- receipt closes it. The reversal wrapper below refuses paid/returned receipts.
create function app_private.purchase_receipt_payable_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_total numeric(20,2); v_balance numeric(20,2); v_payable app_private.supplier_payables%rowtype;
begin
 if new.supplier_id is null then return new; end if;
 if old.status is distinct from 'POSTED' and new.status = 'POSTED' then
  select coalesce(sum(c.line_cost), 0) into v_total
  from api.purchase_receipt_lines l join app_private.purchase_receipt_line_costs c on c.purchase_receipt_line_id = l.id
  where l.purchase_receipt_id = new.id;
  if v_total <= 0 then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('supplier.debt:' || new.supplier_id::text, 0));
  insert into app_private.supplier_debt_accounts(supplier_id) values (new.supplier_id) on conflict do nothing;
  update app_private.supplier_debt_accounts set balance = balance + v_total, version = version + 1, updated_at = now()
  where supplier_id = new.supplier_id returning balance into v_balance;
  insert into app_private.supplier_payables(supplier_id, kind, purchase_receipt_id, total_amount, outstanding_amount, opened_at)
  values (new.supplier_id, 'RECEIPT', new.id, v_total, v_total, coalesce(new.posted_at, now()));
  insert into app_private.supplier_debt_entries(supplier_id, kind, delta, balance_after, purchase_receipt_id, actor_id, occurred_at, correlation_id)
  values (new.supplier_id, 'RECEIPT_POSTED', v_total, v_balance, new.id, coalesce(new.posted_by, new.created_by),
   coalesce(new.posted_at, now()), coalesce(new.correlation_id, gen_random_uuid()));
 elsif old.status = 'POSTED' and new.status = 'REVERSED' then
  select * into v_payable from app_private.supplier_payables where purchase_receipt_id = new.id for update;
  if found and v_payable.outstanding_amount > 0 then
   if v_payable.paid_amount > 0 or v_payable.returned_amount > 0 then raise exception 'SUPPLIER_PAYABLE_SETTLED'; end if;
   perform pg_advisory_xact_lock(hashtextextended('supplier.debt:' || new.supplier_id::text, 0));
   update app_private.supplier_debt_accounts set balance = balance - v_payable.outstanding_amount, version = version + 1, updated_at = now()
   where supplier_id = new.supplier_id returning balance into v_balance;
   update app_private.supplier_payables set reversed_amount = outstanding_amount, outstanding_amount = 0 where id = v_payable.id;
   insert into app_private.supplier_debt_entries(supplier_id, kind, delta, balance_after, note, purchase_receipt_id, actor_id, occurred_at, correlation_id)
   values (new.supplier_id, 'RECEIPT_REVERSED', -v_payable.outstanding_amount, v_balance, new.reverse_reason, new.id,
    coalesce(new.reversed_by, new.created_by), coalesce(new.reversed_at, now()), gen_random_uuid());
  end if;
 end if;
 return new;
end $$;
revoke all on function app_private.purchase_receipt_payable_sync() from public, anon, authenticated, service_role;
create trigger purchase_receipts_supplier_payable after update of status on api.purchase_receipts
 for each row execute function app_private.purchase_receipt_payable_sync();

-- Existing posted receipts with a supplier become payables, unpaid (owner approved 10/11).
do $$
declare r record; v_balance numeric(20,2); v_total numeric(20,2);
begin
 for r in select * from api.purchase_receipts where status = 'POSTED' and supplier_id is not null order by posted_at, id loop
  select coalesce(sum(c.line_cost), 0) into v_total from api.purchase_receipt_lines l
  join app_private.purchase_receipt_line_costs c on c.purchase_receipt_line_id = l.id where l.purchase_receipt_id = r.id;
  continue when v_total <= 0;
  insert into app_private.supplier_debt_accounts(supplier_id) values (r.supplier_id) on conflict do nothing;
  update app_private.supplier_debt_accounts set balance = balance + v_total where supplier_id = r.supplier_id returning balance into v_balance;
  insert into app_private.supplier_payables(supplier_id, kind, purchase_receipt_id, total_amount, outstanding_amount, opened_at)
  values (r.supplier_id, 'RECEIPT', r.id, v_total, v_total, r.posted_at);
  insert into app_private.supplier_debt_entries(supplier_id, kind, delta, balance_after, purchase_receipt_id, actor_id, occurred_at, correlation_id)
  values (r.supplier_id, 'RECEIPT_POSTED', v_total, v_balance, r.id, coalesce(r.posted_by, r.created_by), r.posted_at, coalesce(r.correlation_id, gen_random_uuid()));
 end loop;
end $$;

create function app_private.reverse_purchase_receipt_guarded_impl(p_receipt_id uuid, p_reason text, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_cached jsonb;
begin
 v_cached := app_private.cached_command_response((select auth.uid()), 'purchase.reverse', p_idempotency_key);
 if v_cached is not null then return v_cached; end if;
 if exists (select 1 from app_private.supplier_payables where purchase_receipt_id = p_receipt_id and (paid_amount > 0 or returned_amount > 0))
  or exists (select 1 from app_private.purchase_returns where purchase_receipt_id = p_receipt_id) then
  return app_private.command_error('PURCHASE_REVERSAL_SETTLED', 'Phiếu đã trả tiền hoặc trả hàng cho NCC: dùng trả hàng nhập thay vì đảo.', gen_random_uuid());
 end if;
 return app_private.reverse_purchase_receipt_impl(p_receipt_id, p_reason, p_idempotency_key);
end $$;
create or replace function api.reverse_purchase_receipt(p_receipt_id uuid, p_reason text, p_idempotency_key uuid)
returns jsonb language sql set search_path to '' as $$
 select app_private.reverse_purchase_receipt_guarded_impl(p_receipt_id, p_reason, p_idempotency_key);
$$;

-- Pay suppliers oldest debt first; the payment also lands in the cash book.
create function app_private.pay_supplier_debt_impl(p_supplier_id uuid, p_expected_version bigint, p_cash_amount text, p_bank_transfer_amount text,
 p_note text, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_correlation uuid := gen_random_uuid(); v_name text := 'supplier.debt.pay'; v_hash text; v_cached jsonb; v_result jsonb;
 v_cash numeric(20,2); v_bank numeric(20,2); v_total numeric(20,2); v_left numeric(20,2); v_take numeric(20,2); v_account app_private.supplier_debt_accounts%rowtype;
 v_balance numeric(20,2); v_entry uuid := gen_random_uuid(); v_line record; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
 if v_actor is null or not app_private.has_permission(v_name) then
  return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền trả nợ nhà cung cấp.', v_correlation);
 end if;
 if p_supplier_id is null or p_expected_version is null or p_idempotency_key is null or length(coalesce(v_note, '')) > 500
  or not app_private.valid_debt_money(p_cash_amount) or not app_private.valid_debt_money(p_bank_transfer_amount) then
  return app_private.command_error('VALIDATION_FAILED', 'Nhập số tiền hợp lệ.', v_correlation);
 end if;
 v_cash := p_cash_amount::numeric; v_bank := p_bank_transfer_amount::numeric; v_total := v_cash + v_bank;
 v_hash := md5(jsonb_build_object('supplierId', p_supplier_id, 'version', p_expected_version, 'cash', v_cash, 'bank', v_bank, 'note', v_note)::text);
 v_cached := app_private.cash_command_cached(v_actor, v_name, p_idempotency_key, v_hash, v_correlation);
 if v_cached is not null then return v_cached; end if;
 perform pg_advisory_xact_lock(hashtextextended('supplier.debt:' || p_supplier_id::text, 0));
 select * into v_account from app_private.supplier_debt_accounts where supplier_id = p_supplier_id for update;
 if not found then return app_private.command_error('SUPPLIER_PAYMENT_EXCEEDS_BALANCE', 'Nhà cung cấp này không có nợ.', v_correlation); end if;
 if v_account.version <> p_expected_version then return app_private.command_error('VERSION_CONFLICT', 'Công nợ đã thay đổi. Vui lòng tải lại.', v_correlation); end if;
 if v_total <= 0 or v_total > v_account.balance then
  return app_private.command_error('SUPPLIER_PAYMENT_EXCEEDS_BALANCE', 'Tiền trả phải lớn hơn 0 và không vượt số đang nợ.', v_correlation);
 end if;
 v_balance := v_account.balance - v_total;
 update app_private.supplier_debt_accounts set balance = v_balance, version = version + 1, updated_at = now() where supplier_id = p_supplier_id;
 insert into app_private.supplier_debt_entries(id, supplier_id, kind, delta, balance_after, cash_amount, bank_transfer_amount, note, actor_id, correlation_id)
 values (v_entry, p_supplier_id, 'PAYMENT', -v_total, v_balance, v_cash, v_bank, v_note, v_actor, v_correlation);
 v_left := v_total;
 for v_line in select * from app_private.supplier_payables where supplier_id = p_supplier_id and outstanding_amount > 0 order by opened_at, id for update loop
  exit when v_left = 0;
  v_take := least(v_left, v_line.outstanding_amount);
  update app_private.supplier_payables set paid_amount = paid_amount + v_take, outstanding_amount = outstanding_amount - v_take where id = v_line.id;
  insert into app_private.supplier_debt_allocations(entry_id, payable_id, amount) values (v_entry, v_line.id, v_take);
  v_left := v_left - v_take;
 end loop;
 if v_left <> 0 or (select coalesce(sum(outstanding_amount), 0) from app_private.supplier_payables where supplier_id = p_supplier_id) <> v_balance then
  raise exception 'SUPPLIER_DEBT_RECONCILIATION_FAILED';
 end if;
 v_result := app_private.command_success(jsonb_build_object('supplierId', p_supplier_id, 'balance', v_balance::text, 'version', v_account.version + 1, 'entryId', v_entry), v_correlation);
 insert into app_private.command_deduplication(actor_id, command_name, idempotency_key, response, request_hash) values (v_actor, v_name, p_idempotency_key, v_result, v_hash);
 insert into app_private.audit_events(actor_id, action, entity_type, entity_id, before_data, after_data, correlation_id)
 values (v_actor, 'supplier.debt.paid', 'supplier', p_supplier_id, jsonb_build_object('balance', v_account.balance::text),
  jsonb_build_object('balance', v_balance::text, 'cash', v_cash::text, 'bank', v_bank::text, 'entryId', v_entry, 'note', v_note), v_correlation);
 return v_result;
end $$;

create function app_private.set_supplier_opening_debt_impl(p_supplier_id uuid, p_amount text, p_note text, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_correlation uuid := gen_random_uuid(); v_name text := 'supplier.debt.opening'; v_hash text; v_cached jsonb; v_result jsonb;
 v_amount numeric(20,2); v_balance numeric(20,2); v_version bigint; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
 if v_actor is null or not app_private.has_permission('supplier.debt.adjust') then
  return app_private.command_error('PERMISSION_DENIED', 'Chỉ chủ cửa hàng được nhập nợ đầu kỳ NCC.', v_correlation);
 end if;
 if p_supplier_id is null or p_idempotency_key is null or v_note is null or length(v_note) > 500
  or not app_private.valid_debt_money(p_amount) or p_amount::numeric <= 0 then
  return app_private.command_error('VALIDATION_FAILED', 'Nhập số nợ lớn hơn 0 và lý do.', v_correlation);
 end if;
 v_amount := p_amount::numeric;
 v_hash := md5(jsonb_build_object('supplierId', p_supplier_id, 'amount', v_amount, 'note', v_note)::text);
 v_cached := app_private.cash_command_cached(v_actor, v_name, p_idempotency_key, v_hash, v_correlation);
 if v_cached is not null then return v_cached; end if;
 if not exists (select 1 from api.suppliers where id = p_supplier_id) then
  return app_private.command_error('REFERENCE_NOT_FOUND', 'Không tìm thấy nhà cung cấp.', v_correlation);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('supplier.debt:' || p_supplier_id::text, 0));
 if exists (select 1 from app_private.supplier_payables where supplier_id = p_supplier_id and kind = 'OPENING') then
  return app_private.command_error('SUPPLIER_OPENING_ALREADY_SET', 'Nhà cung cấp này đã có nợ đầu kỳ.', v_correlation);
 end if;
 insert into app_private.supplier_debt_accounts(supplier_id) values (p_supplier_id) on conflict do nothing;
 update app_private.supplier_debt_accounts set balance = balance + v_amount, version = version + 1, updated_at = now()
 where supplier_id = p_supplier_id returning balance, version into v_balance, v_version;
 insert into app_private.supplier_payables(supplier_id, kind, total_amount, outstanding_amount, opened_at) values (p_supplier_id, 'OPENING', v_amount, v_amount, now());
 insert into app_private.supplier_debt_entries(supplier_id, kind, delta, balance_after, note, actor_id, correlation_id)
 values (p_supplier_id, 'OPENING', v_amount, v_balance, v_note, v_actor, v_correlation);
 v_result := app_private.command_success(jsonb_build_object('supplierId', p_supplier_id, 'balance', v_balance::text, 'version', v_version), v_correlation);
 insert into app_private.command_deduplication(actor_id, command_name, idempotency_key, response, request_hash) values (v_actor, v_name, p_idempotency_key, v_result, v_hash);
 insert into app_private.audit_events(actor_id, action, entity_type, entity_id, after_data, correlation_id)
 values (v_actor, 'supplier.debt.opening_set', 'supplier', p_supplier_id, jsonb_build_object('amount', v_amount::text, 'balance', v_balance::text, 'note', v_note), v_correlation);
 return v_result;
end $$;

-- Return part of a posted receipt at its own unit cost. The amount first
-- reduces what is owed on that receipt; any rest is refunded by the supplier.
create function app_private.post_purchase_return_impl(p_receipt_id uuid, p_lines jsonb, p_reason text, p_refund_method text, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_correlation uuid := gen_random_uuid(); v_name text := 'purchase.return.post'; v_hash text; v_cached jsonb; v_result jsonb;
 v_reason text := nullif(btrim(coalesce(p_reason, '')), ''); v_receipt api.purchase_receipts%rowtype; v_lines jsonb; v_line record;
 v_total numeric(20,2) := 0; v_applied numeric(20,2) := 0; v_refund numeric(20,2); v_payable app_private.supplier_payables%rowtype;
 v_return uuid := gen_random_uuid(); v_number text; v_movement uuid; v_new_qty numeric(18,0); v_value_out numeric(20,2); v_new_value numeric(20,2);
 v_new_avg numeric(20,6); v_balance numeric(20,2); v_now timestamptz := now();
begin
 if v_actor is null or not app_private.has_permission(v_name) then
  return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền trả hàng nhập.', v_correlation);
 end if;
 if p_receipt_id is null or p_idempotency_key is null or v_reason is null or length(v_reason) > 500
  or jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0
  or (p_refund_method is not null and p_refund_method not in ('CASH', 'BANK_TRANSFER'))
  or exists (select 1 from jsonb_array_elements(p_lines) e where coalesce(e ->> 'quantity', '') !~ '^[1-9][0-9]{0,8}$'
   or coalesce(e ->> 'receiptLineId', '') !~ '^[0-9a-f-]{36}$')
  or (select count(*) from jsonb_array_elements(p_lines)) <> (select count(distinct e ->> 'receiptLineId') from jsonb_array_elements(p_lines) e) then
  return app_private.command_error('VALIDATION_FAILED', 'Chọn số lượng trả và nhập lý do.', v_correlation);
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('receiptLineId', e ->> 'receiptLineId', 'quantity', (e ->> 'quantity')::numeric) order by e ->> 'receiptLineId'), '[]')
 into v_lines from jsonb_array_elements(p_lines) e;
 v_hash := md5(jsonb_build_object('receiptId', p_receipt_id, 'lines', v_lines, 'reason', v_reason, 'refundMethod', p_refund_method)::text);
 v_cached := app_private.cash_command_cached(v_actor, v_name, p_idempotency_key, v_hash, v_correlation);
 if v_cached is not null then return v_cached; end if;
 select * into v_receipt from api.purchase_receipts where id = p_receipt_id for update;
 if not found then return app_private.command_error('REFERENCE_NOT_FOUND', 'Không tìm thấy phiếu nhập.', v_correlation); end if;
 if v_receipt.status <> 'POSTED' then return app_private.command_error('INVALID_STATE', 'Chỉ trả hàng từ phiếu nhập đã ghi sổ.', v_correlation); end if;
 perform 1 from api.inventory_balances b join api.purchase_receipt_lines l on l.product_id = b.product_id
 where l.purchase_receipt_id = p_receipt_id order by b.product_id for update of b;
 perform 1 from app_private.inventory_cost_balances b join api.purchase_receipt_lines l on l.product_id = b.product_id
 where l.purchase_receipt_id = p_receipt_id order by b.product_id for update of b;
 create temporary table if not exists pg_temp.purchase_return_plan(receipt_line_id uuid, product_id uuid, quantity numeric, line_amount numeric, on_hand numeric,
  inventory_value numeric) on commit drop;
 delete from pg_temp.purchase_return_plan;
 insert into pg_temp.purchase_return_plan
 select l.id, l.product_id, x.quantity,
  -- Exact cents: the last units returned take whatever is left of the line cost.
  case when coalesce(done.qty, 0) + x.quantity = l.received_qty then cost.line_cost - coalesce(done.amount, 0)
   else round(cost.line_cost * x.quantity / l.received_qty, 2) end,
  b.on_hand_qty, coalesce(cb.inventory_value, 0)
 from jsonb_to_recordset(v_lines) x("receiptLineId" uuid, quantity numeric)
 join api.purchase_receipt_lines l on l.id = x."receiptLineId" and l.purchase_receipt_id = p_receipt_id
 join app_private.purchase_receipt_line_costs cost on cost.purchase_receipt_line_id = l.id
 join api.inventory_balances b on b.product_id = l.product_id
 left join app_private.inventory_cost_balances cb on cb.product_id = l.product_id
 left join lateral (select sum(rl.quantity) qty, sum(rl.line_amount) amount from app_private.purchase_return_lines rl where rl.purchase_receipt_line_id = l.id) done on true
 where x.quantity <= l.received_qty - coalesce(done.qty, 0) and x.quantity <= b.on_hand_qty;
 if (select count(*) from pg_temp.purchase_return_plan) <> jsonb_array_length(v_lines) then
  return app_private.command_error('PURCHASE_RETURN_QTY_EXCEEDED', 'Số trả vượt số đã nhập còn lại hoặc tồn kho hiện tại.', v_correlation);
 end if;
 if exists (select 1 from pg_temp.purchase_return_plan where on_hand > quantity and inventory_value < line_amount) then
  return app_private.command_error('PURCHASE_RETURN_BLOCKED', 'Giá trị tồn không đủ để trả theo giá nhập. Kiểm tra lại giá vốn sản phẩm.', v_correlation);
 end if;
 select sum(line_amount) into v_total from pg_temp.purchase_return_plan;
 if v_receipt.supplier_id is not null then
  perform pg_advisory_xact_lock(hashtextextended('supplier.debt:' || v_receipt.supplier_id::text, 0));
  select * into v_payable from app_private.supplier_payables where purchase_receipt_id = p_receipt_id for update;
  if found then v_applied := least(v_total, v_payable.outstanding_amount); end if;
 end if;
 v_refund := v_total - v_applied;
 if v_refund > 0 and p_refund_method is null then
  return app_private.command_error('REFUND_METHOD_REQUIRED', 'Chọn cách NCC hoàn tiền.', v_correlation);
 end if;
 if v_total <= 0 then return app_private.command_error('VALIDATION_FAILED', 'Tiền hàng trả phải lớn hơn 0.', v_correlation); end if;
 v_number := app_private.next_document_number_impl('PURCHASE_RETURN');
 insert into app_private.purchase_returns(id, return_number, purchase_receipt_id, supplier_id, reason, total_amount, debt_applied, refund_amount, refund_method, actor_id, posted_at, correlation_id)
 values (v_return, v_number, p_receipt_id, v_receipt.supplier_id, v_reason, v_total, v_applied, v_refund, case when v_refund > 0 then p_refund_method end, v_actor, v_now, v_correlation);
 for v_line in select * from pg_temp.purchase_return_plan order by product_id loop
  v_new_qty := v_line.on_hand - v_line.quantity;
  v_value_out := case when v_new_qty = 0 then v_line.inventory_value else v_line.line_amount end;
  v_new_value := case when v_new_qty = 0 then 0 else v_line.inventory_value - v_value_out end;
  v_new_avg := case when v_new_qty = 0 then 0 else round(v_new_value / v_new_qty, 6) end;
  update api.inventory_balances set on_hand_qty = v_new_qty, version = version + 1, updated_at = v_now where product_id = v_line.product_id;
  update app_private.inventory_cost_balances set inventory_value = v_new_value, avg_unit_cost = v_new_avg, version = version + 1, updated_at = v_now
  where product_id = v_line.product_id;
  insert into api.stock_movements(product_id, movement_type, quantity_delta, quantity_after, reference_type, reference_id, occurred_at, actor_id, note, correlation_id)
  values (v_line.product_id, 'PURCHASE_RETURN', -v_line.quantity, v_new_qty, 'PURCHASE_RETURN', v_return, v_now, v_actor, left(v_reason, 500), v_correlation)
  returning id into v_movement;
  insert into app_private.inventory_cost_movements(stock_movement_id, inventory_value_delta, cogs_delta, inventory_value_after, avg_unit_cost_after, occurred_at)
  values (v_movement, -v_value_out, 0, v_new_value, v_new_avg, v_now);
  insert into app_private.purchase_return_lines(purchase_return_id, purchase_receipt_line_id, product_id, quantity, line_amount, inventory_value_out, stock_movement_id)
  values (v_return, v_line.receipt_line_id, v_line.product_id, v_line.quantity, v_line.line_amount, v_value_out, v_movement);
 end loop;
 if v_receipt.supplier_id is not null and v_payable.id is not null then
  if v_applied > 0 then
   update app_private.supplier_payables set returned_amount = returned_amount + v_applied, outstanding_amount = outstanding_amount - v_applied where id = v_payable.id;
   update app_private.supplier_debt_accounts set balance = balance - v_applied, version = version + 1, updated_at = now()
   where supplier_id = v_receipt.supplier_id returning balance into v_balance;
  else
   select balance into v_balance from app_private.supplier_debt_accounts where supplier_id = v_receipt.supplier_id;
  end if;
  insert into app_private.supplier_debt_entries(supplier_id, kind, delta, balance_after, cash_amount, bank_transfer_amount, note, purchase_receipt_id, purchase_return_id, actor_id, occurred_at, correlation_id)
  values (v_receipt.supplier_id, 'PURCHASE_RETURN', -v_applied, v_balance,
   case when p_refund_method = 'CASH' then v_refund else 0 end, case when p_refund_method = 'BANK_TRANSFER' then v_refund else 0 end,
   v_reason, p_receipt_id, v_return, v_actor, v_now, v_correlation);
 end if;
 v_result := app_private.command_success(jsonb_build_object('returnId', v_return, 'returnNumber', v_number, 'totalAmount', v_total::text,
  'debtApplied', v_applied::text, 'refundAmount', v_refund::text), v_correlation);
 insert into app_private.command_deduplication(actor_id, command_name, idempotency_key, response, request_hash) values (v_actor, v_name, p_idempotency_key, v_result, v_hash);
 insert into app_private.audit_events(actor_id, action, entity_type, entity_id, after_data, correlation_id)
 values (v_actor, 'purchase_return.posted', 'purchase_receipt', p_receipt_id, jsonb_build_object('returnNumber', v_number, 'lines', v_lines,
  'totalAmount', v_total::text, 'debtApplied', v_applied::text, 'refundAmount', v_refund::text, 'refundMethod', p_refund_method, 'reason', v_reason), v_correlation);
 return v_result;
end $$;

-- Write off expired, broken or lost stock at the moving average cost.
create function app_private.post_stock_write_off_impl(p_lines jsonb, p_reason_code text, p_note text, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_correlation uuid := gen_random_uuid(); v_name text := 'inventory.writeoff.post'; v_hash text; v_cached jsonb; v_result jsonb;
 v_note text := nullif(btrim(coalesce(p_note, '')), ''); v_lines jsonb; v_line record; v_id uuid := gen_random_uuid(); v_number text; v_movement uuid;
 v_new_qty numeric(18,0); v_value numeric(20,2); v_new_value numeric(20,2); v_new_avg numeric(20,6); v_total numeric(20,2) := 0; v_written numeric(20,2) := 0; v_now timestamptz := now();
begin
 if v_actor is null or not app_private.has_permission(v_name) then
  return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền xuất hủy.', v_correlation);
 end if;
 if p_idempotency_key is null or p_reason_code is null or p_reason_code not in ('EXPIRED', 'DAMAGED', 'LOST', 'OTHER')
  or (p_reason_code = 'OTHER' and v_note is null) or length(coalesce(v_note, '')) > 500
  or jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 100
  or exists (select 1 from jsonb_array_elements(p_lines) e where coalesce(e ->> 'quantity', '') !~ '^[1-9][0-9]{0,8}$'
   or coalesce(e ->> 'productId', '') !~ '^[0-9a-f-]{36}$')
  or (select count(*) from jsonb_array_elements(p_lines)) <> (select count(distinct e ->> 'productId') from jsonb_array_elements(p_lines) e) then
  return app_private.command_error('VALIDATION_FAILED', 'Chọn sản phẩm, số lượng và lý do hủy.', v_correlation);
 end if;
 select jsonb_agg(jsonb_build_object('productId', e ->> 'productId', 'quantity', (e ->> 'quantity')::numeric) order by e ->> 'productId')
 into v_lines from jsonb_array_elements(p_lines) e;
 v_hash := md5(jsonb_build_object('lines', v_lines, 'reason', p_reason_code, 'note', v_note)::text);
 v_cached := app_private.cash_command_cached(v_actor, v_name, p_idempotency_key, v_hash, v_correlation);
 if v_cached is not null then return v_cached; end if;
 perform 1 from api.inventory_balances b where b.product_id in (select (x ->> 'productId')::uuid from jsonb_array_elements(v_lines) x) order by b.product_id for update;
 perform 1 from app_private.inventory_cost_balances b where b.product_id in (select (x ->> 'productId')::uuid from jsonb_array_elements(v_lines) x) order by b.product_id for update;
 if exists (select 1 from jsonb_to_recordset(v_lines) x("productId" uuid, quantity numeric)
   left join api.inventory_balances b on b.product_id = x."productId" where b.product_id is null or b.on_hand_qty < x.quantity) then
  return app_private.command_error('WRITE_OFF_QTY_EXCEEDED', 'Số hủy vượt tồn kho hiện tại.', v_correlation);
 end if;
 -- Same rule as each line below: the last units take the whole remaining value.
 select coalesce(sum(case when b.on_hand_qty = x.quantity then coalesce(cb.inventory_value, 0)
   else least(round(coalesce(cb.avg_unit_cost, 0) * x.quantity, 2), coalesce(cb.inventory_value, 0)) end), 0)
 into v_total from jsonb_to_recordset(v_lines) x("productId" uuid, quantity numeric) join api.inventory_balances b on b.product_id = x."productId"
 left join app_private.inventory_cost_balances cb on cb.product_id = x."productId";
 v_number := app_private.next_document_number_impl('WRITE_OFF');
 insert into app_private.stock_write_offs(id, write_off_number, reason_code, note, total_value, actor_id, posted_at, correlation_id)
 values (v_id, v_number, p_reason_code, v_note, v_total, v_actor, v_now, v_correlation);
 for v_line in select x."productId" product_id, x.quantity, b.on_hand_qty, coalesce(cb.inventory_value, 0) inventory_value, coalesce(cb.avg_unit_cost, 0) avg_unit_cost
  from jsonb_to_recordset(v_lines) x("productId" uuid, quantity numeric) join api.inventory_balances b on b.product_id = x."productId"
  left join app_private.inventory_cost_balances cb on cb.product_id = x."productId" order by x."productId" loop
  v_new_qty := v_line.on_hand_qty - v_line.quantity;
  -- The last units take the whole remaining value so no cents are stranded.
  v_value := case when v_new_qty = 0 then v_line.inventory_value else least(round(v_line.avg_unit_cost * v_line.quantity, 2), v_line.inventory_value) end;
  v_new_value := v_line.inventory_value - v_value;
  v_new_avg := case when v_new_qty = 0 then 0 else round(v_new_value / v_new_qty, 6) end;
  update api.inventory_balances set on_hand_qty = v_new_qty, version = version + 1, updated_at = v_now where product_id = v_line.product_id;
  update app_private.inventory_cost_balances set inventory_value = v_new_value, avg_unit_cost = v_new_avg, version = version + 1, updated_at = v_now
  where product_id = v_line.product_id;
  insert into api.stock_movements(product_id, movement_type, quantity_delta, quantity_after, reference_type, reference_id, occurred_at, actor_id, note, correlation_id)
  values (v_line.product_id, 'WRITE_OFF', -v_line.quantity, v_new_qty, 'WRITE_OFF', v_id, v_now, v_actor, v_note, v_correlation) returning id into v_movement;
  insert into app_private.inventory_cost_movements(stock_movement_id, inventory_value_delta, cogs_delta, inventory_value_after, avg_unit_cost_after, occurred_at)
  values (v_movement, -v_value, 0, v_new_value, v_new_avg, v_now);
  insert into app_private.stock_write_off_lines(write_off_id, product_id, quantity, unit_cost, line_value, stock_movement_id)
  values (v_id, v_line.product_id, v_line.quantity, v_line.avg_unit_cost, v_value, v_movement);
  v_written := v_written + v_value;
 end loop;
 if v_written <> v_total then raise exception 'WRITE_OFF_TOTAL_MISMATCH'; end if;
 v_result := app_private.command_success(jsonb_build_object('writeOffId', v_id, 'writeOffNumber', v_number,
  'totalValue', case when app_private.has_permission('report.cost_profit.read') then v_total::text end), v_correlation);
 insert into app_private.command_deduplication(actor_id, command_name, idempotency_key, response, request_hash) values (v_actor, v_name, p_idempotency_key, v_result, v_hash);
 insert into app_private.audit_events(actor_id, action, entity_type, entity_id, after_data, correlation_id)
 values (v_actor, 'stock_write_off.posted', 'stock_write_off', v_id, jsonb_build_object('writeOffNumber', v_number, 'reason', p_reason_code,
  'note', v_note, 'lines', v_lines, 'totalValue', v_total::text), v_correlation);
 return v_result;
end $$;

create function app_private.get_supplier_debts_impl() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_correlation uuid := gen_random_uuid(); v_month timestamptz := date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh';
begin
 if (select auth.uid()) is null or not app_private.has_permission('supplier.debt.read') then
  return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền xem công nợ nhà cung cấp.', v_correlation);
 end if;
 return app_private.command_success(jsonb_build_object(
  'summary', jsonb_build_object(
   'totalPayable', (select coalesce(sum(balance), 0)::text from app_private.supplier_debt_accounts),
   'supplierCount', (select count(*) from app_private.supplier_debt_accounts where balance > 0),
   'openPayableCount', (select count(*) from app_private.supplier_payables where outstanding_amount > 0),
   'paidThisMonth', (select coalesce(sum(-delta), 0)::text from app_private.supplier_debt_entries where kind = 'PAYMENT' and occurred_at >= v_month),
   'returnedThisMonth', (select coalesce(sum(total_amount), 0)::text from app_private.purchase_returns where posted_at >= v_month),
   'returnCountThisMonth', (select count(*) from app_private.purchase_returns where posted_at >= v_month)),
  'items', coalesce((select jsonb_agg(jsonb_build_object('supplierId', s.id, 'code', s.code, 'name', s.name, 'balance', a.balance::text,
    'openCount', (select count(*) from app_private.supplier_payables p where p.supplier_id = s.id and p.outstanding_amount > 0),
    'oldestOpenAt', (select min(p.opened_at) from app_private.supplier_payables p where p.supplier_id = s.id and p.outstanding_amount > 0),
    'version', a.version) order by a.balance desc, s.name)
   from app_private.supplier_debt_accounts a join api.suppliers s on s.id = a.supplier_id), '[]'::jsonb)), v_correlation);
end $$;

create function app_private.get_supplier_debt_impl(p_supplier_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_correlation uuid := gen_random_uuid(); v_supplier api.suppliers%rowtype; v_account app_private.supplier_debt_accounts%rowtype;
begin
 if (select auth.uid()) is null or not app_private.has_permission('supplier.debt.read') then
  return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền xem công nợ nhà cung cấp.', v_correlation);
 end if;
 select * into v_supplier from api.suppliers where id = p_supplier_id;
 if not found then return app_private.command_error('REFERENCE_NOT_FOUND', 'Không tìm thấy nhà cung cấp.', v_correlation); end if;
 select * into v_account from app_private.supplier_debt_accounts where supplier_id = p_supplier_id;
 return app_private.command_success(jsonb_build_object(
  'supplier', jsonb_build_object('id', v_supplier.id, 'code', v_supplier.code, 'name', v_supplier.name),
  'balance', coalesce(v_account.balance, 0)::text, 'version', coalesce(v_account.version, 0),
  'hasOpening', exists (select 1 from app_private.supplier_payables where supplier_id = p_supplier_id and kind = 'OPENING'),
  'openPayables', coalesce((select jsonb_agg(jsonb_build_object('payableId', p.id, 'kind', p.kind, 'receiptId', p.purchase_receipt_id,
    'receiptNumber', r.receipt_number, 'openedAt', p.opened_at, 'totalAmount', p.total_amount::text, 'paidAmount', p.paid_amount::text,
    'returnedAmount', p.returned_amount::text, 'outstandingAmount', p.outstanding_amount::text) order by p.opened_at, p.id)
   from app_private.supplier_payables p left join api.purchase_receipts r on r.id = p.purchase_receipt_id
   where p.supplier_id = p_supplier_id and p.outstanding_amount > 0), '[]'::jsonb),
  'entries', coalesce((select jsonb_agg(row order by (row ->> 'occurredAt') desc, row ->> 'id' desc) from (
    select jsonb_build_object('id', e.id, 'kind', e.kind, 'delta', e.delta::text, 'balanceAfter', e.balance_after::text,
     'cashAmount', e.cash_amount::text, 'bankTransferAmount', e.bank_transfer_amount::text, 'note', e.note,
     'receiptId', e.purchase_receipt_id, 'receiptNumber', r.receipt_number, 'returnNumber', pr.return_number,
     'actorName', prof.display_name, 'occurredAt', e.occurred_at) row
    from app_private.supplier_debt_entries e
    left join api.purchase_receipts r on r.id = e.purchase_receipt_id
    left join app_private.purchase_returns pr on pr.id = e.purchase_return_id
    left join api.profiles prof on prof.id = e.actor_id
    where e.supplier_id = p_supplier_id order by e.occurred_at desc, e.id desc limit 100) latest), '[]'::jsonb)), v_correlation);
end $$;

create function app_private.get_purchase_return_options_impl(p_receipt_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_correlation uuid := gen_random_uuid(); v_receipt api.purchase_receipts%rowtype;
begin
 if (select auth.uid()) is null or not app_private.has_permission('purchase.return.post') then
  return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền trả hàng nhập.', v_correlation);
 end if;
 select * into v_receipt from api.purchase_receipts where id = p_receipt_id;
 if not found then return app_private.command_error('REFERENCE_NOT_FOUND', 'Không tìm thấy phiếu nhập.', v_correlation); end if;
 return app_private.command_success(jsonb_build_object(
  'receiptId', v_receipt.id, 'receiptNumber', v_receipt.receipt_number, 'status', v_receipt.status, 'receivedAt', v_receipt.received_at,
  'supplier', (select jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name) from api.suppliers s where s.id = v_receipt.supplier_id),
  'outstandingAmount', (select p.outstanding_amount::text from app_private.supplier_payables p where p.purchase_receipt_id = p_receipt_id),
  'lines', coalesce((select jsonb_agg(jsonb_build_object('receiptLineId', l.id, 'productId', l.product_id, 'productName', l.product_name,
    'unitName', l.unit_name, 'receivedQty', l.received_qty::text, 'returnedQty', coalesce(done.qty, 0)::text, 'onHandQty', b.on_hand_qty::text,
    'maxQty', greatest(least(l.received_qty - coalesce(done.qty, 0), b.on_hand_qty), 0)::text, 'unitCost', c.unit_cost::text,
    'lineCost', c.line_cost::text, 'returnedAmount', coalesce(done.amount, 0)::text) order by l.line_order)
   from api.purchase_receipt_lines l
   join app_private.purchase_receipt_line_costs c on c.purchase_receipt_line_id = l.id
   join api.inventory_balances b on b.product_id = l.product_id
   left join lateral (select sum(rl.quantity) qty, sum(rl.line_amount) amount from app_private.purchase_return_lines rl where rl.purchase_receipt_line_id = l.id) done on true
   where l.purchase_receipt_id = p_receipt_id), '[]'::jsonb),
  'returns', coalesce((select jsonb_agg(jsonb_build_object('returnId', r.id, 'returnNumber', r.return_number, 'postedAt', r.posted_at,
    'totalAmount', r.total_amount::text, 'debtApplied', r.debt_applied::text, 'refundAmount', r.refund_amount::text, 'reason', r.reason) order by r.posted_at)
   from app_private.purchase_returns r where r.purchase_receipt_id = p_receipt_id), '[]'::jsonb)), v_correlation);
end $$;

create function app_private.get_write_off_products_impl(p_product_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_correlation uuid := gen_random_uuid(); v_cost boolean := app_private.has_permission('report.cost_profit.read');
begin
 if (select auth.uid()) is null or not app_private.has_permission('inventory.writeoff.post') then
  return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền xuất hủy.', v_correlation);
 end if;
 if p_product_ids is null or cardinality(p_product_ids) > 100 then
  return app_private.command_error('VALIDATION_FAILED', 'Danh sách sản phẩm chưa hợp lệ.', v_correlation);
 end if;
 return app_private.command_success(jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object(
   'productId', p.id, 'name', p.name, 'sku', p.sku, 'unitName', p.unit_name, 'onHandQty', coalesce(b.on_hand_qty, 0)::text,
   'avgUnitCost', case when v_cost then coalesce(cb.avg_unit_cost, 0)::numeric(20,2)::text end,
   -- Exact inputs so the screen previews the very value the write-off posts.
   'avgUnitCostExact', case when v_cost then coalesce(cb.avg_unit_cost, 0)::text end,
   'inventoryValue', case when v_cost then coalesce(cb.inventory_value, 0)::text end) order by p.name)
  from api.products p left join api.inventory_balances b on b.product_id = p.id left join app_private.inventory_cost_balances cb on cb.product_id = p.id
  where p.id = any(p_product_ids)), '[]'::jsonb)), v_correlation);
end $$;

create function app_private.list_stock_write_offs_impl(p_limit integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_correlation uuid := gen_random_uuid(); v_cost boolean := app_private.has_permission('report.cost_profit.read');
begin
 if (select auth.uid()) is null or not app_private.has_permission('inventory.writeoff.post') then
  return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền xem xuất hủy.', v_correlation);
 end if;
 if p_limit is null or p_limit not between 1 and 100 then return app_private.command_error('VALIDATION_FAILED', 'Giới hạn chưa hợp lệ.', v_correlation); end if;
 return app_private.command_success(jsonb_build_object('items', coalesce((select jsonb_agg(row order by (row ->> 'postedAt') desc) from (
   select jsonb_build_object('id', w.id, 'writeOffNumber', w.write_off_number, 'reasonCode', w.reason_code, 'note', w.note,
    'postedAt', w.posted_at, 'actorName', prof.display_name, 'totalValue', case when v_cost then w.total_value::text end,
    'lines', (select jsonb_agg(jsonb_build_object('productName', p.name, 'unitName', p.unit_name, 'quantity', l.quantity::text,
      'lineValue', case when v_cost then l.line_value::text end) order by p.name)
     from app_private.stock_write_off_lines l join api.products p on p.id = l.product_id where l.write_off_id = w.id)) row
   from app_private.stock_write_offs w left join api.profiles prof on prof.id = w.actor_id
   order by w.posted_at desc limit p_limit) latest), '[]'::jsonb)), v_correlation);
end $$;

create function api.pay_supplier_debt(p_supplier_id uuid, p_expected_version bigint, p_cash_amount text, p_bank_transfer_amount text, p_note text, p_idempotency_key uuid)
returns jsonb language sql security invoker set search_path = '' as $$ select app_private.pay_supplier_debt_impl(p_supplier_id, p_expected_version, p_cash_amount, p_bank_transfer_amount, p_note, p_idempotency_key); $$;
create function api.set_supplier_opening_debt(p_supplier_id uuid, p_amount text, p_note text, p_idempotency_key uuid)
returns jsonb language sql security invoker set search_path = '' as $$ select app_private.set_supplier_opening_debt_impl(p_supplier_id, p_amount, p_note, p_idempotency_key); $$;
create function api.post_purchase_return(p_receipt_id uuid, p_lines jsonb, p_reason text, p_refund_method text, p_idempotency_key uuid)
returns jsonb language sql security invoker set search_path = '' as $$ select app_private.post_purchase_return_impl(p_receipt_id, p_lines, p_reason, p_refund_method, p_idempotency_key); $$;
create function api.post_stock_write_off(p_lines jsonb, p_reason_code text, p_note text, p_idempotency_key uuid)
returns jsonb language sql security invoker set search_path = '' as $$ select app_private.post_stock_write_off_impl(p_lines, p_reason_code, p_note, p_idempotency_key); $$;
create function api.get_supplier_debts() returns jsonb language sql stable security invoker set search_path = '' as $$ select app_private.get_supplier_debts_impl(); $$;
create function api.get_supplier_debt(p_supplier_id uuid) returns jsonb language sql stable security invoker set search_path = '' as $$ select app_private.get_supplier_debt_impl(p_supplier_id); $$;
create function api.get_purchase_return_options(p_receipt_id uuid) returns jsonb language sql stable security invoker set search_path = '' as $$ select app_private.get_purchase_return_options_impl(p_receipt_id); $$;
create function api.get_write_off_products(p_product_ids uuid[]) returns jsonb language sql stable security invoker set search_path = '' as $$ select app_private.get_write_off_products_impl(p_product_ids); $$;
create function api.list_stock_write_offs(p_limit integer default 30) returns jsonb language sql stable security invoker set search_path = '' as $$ select app_private.list_stock_write_offs_impl(p_limit); $$;

do $$ declare f text; begin
 foreach f in array array[
  'app_private.reverse_purchase_receipt_guarded_impl(uuid,text,uuid)',
  'app_private.pay_supplier_debt_impl(uuid,bigint,text,text,text,uuid)', 'api.pay_supplier_debt(uuid,bigint,text,text,text,uuid)',
  'app_private.set_supplier_opening_debt_impl(uuid,text,text,uuid)', 'api.set_supplier_opening_debt(uuid,text,text,uuid)',
  'app_private.post_purchase_return_impl(uuid,jsonb,text,text,uuid)', 'api.post_purchase_return(uuid,jsonb,text,text,uuid)',
  'app_private.post_stock_write_off_impl(jsonb,text,text,uuid)', 'api.post_stock_write_off(jsonb,text,text,uuid)',
  'app_private.get_supplier_debts_impl()', 'api.get_supplier_debts()',
  'app_private.get_supplier_debt_impl(uuid)', 'api.get_supplier_debt(uuid)',
  'app_private.get_purchase_return_options_impl(uuid)', 'api.get_purchase_return_options(uuid)',
  'app_private.get_write_off_products_impl(uuid[])', 'api.get_write_off_products(uuid[])',
  'app_private.list_stock_write_offs_impl(integer)', 'api.list_stock_write_offs(integer)'] loop
  execute format('revoke all on function %s from public, anon', f);
  execute format('grant execute on function %s to authenticated, service_role', f);
 end loop;
end $$;

create or replace function app_private.cash_book_entries(p_fund text)
returns table(entry_key text, occurred_at timestamptz, direction text, source text, amount numeric, document_type text,
 document_id uuid, document_number text, party text, memo text, actor_id uuid, voucher_id uuid, voucher_category text)
language sql stable security invoker set search_path = '' as $$
 select 'p:' || p.id::text, p.paid_at, 'IN', 'SALE_RECEIPT',
  case when p_fund = 'CASH' then p.cash_amount else p.bank_transfer_amount end,
  'SALE', s.id, s.sale_number, coalesce(s.customer_name_snapshot, 'Khách lẻ'), null::text, p.captured_by, null::uuid, null::text
 from api.payments p join api.sales s on s.id = p.sale_id
 where (case when p_fund = 'CASH' then p.cash_amount else p.bank_transfer_amount end) > 0
 union all
 select 'x:' || s.id::text, s.cancelled_at, 'OUT', 'SALE_CANCEL', refund.amount,
  'SALE', s.id, s.sale_number, coalesce(s.customer_name_snapshot, 'Khách lẻ'), s.cancel_reason, s.cancelled_by, null, null
 from api.sales s
 left join app_private.sale_payment_allocations a on a.sale_id = s.id
 cross join lateral (
  select case when p_fund = 'CASH'
   then coalesce(a.cash_amount, (select sum(p.cash_amount) from api.payments p where p.sale_id = s.id), 0)
   else coalesce(a.bank_transfer_amount, (select sum(p.bank_transfer_amount) from api.payments p where p.sale_id = s.id), 0) end amount
 ) refund
 where s.status = 'CANCELLED' and s.cancelled_at is not null and refund.amount > 0
 union all
 select 'r:' || rp.id::text, rp.refunded_at, 'OUT', 'RETURN_REFUND', rp.amount,
  'RETURN', r.id, r.return_number, coalesce(s.customer_name_snapshot, 'Khách lẻ'), null, rp.refunded_by, null, null
 from api.sale_return_payments rp
 join api.sale_returns r on r.id = rp.sale_return_id
 join api.sales s on s.id = r.original_sale_id
 where rp.status = 'REFUNDED' and rp.amount > 0 and rp.method = case when p_fund = 'CASH' then 'CASH' else 'BANK_TRANSFER' end
 union all
 select 'c:' || e.id::text, e.occurred_at, 'IN', 'DEBT_COLLECTION',
  case when p_fund = 'CASH' then e.cash_amount else e.bank_transfer_amount end,
  'CUSTOMER', c.id, c.code, c.name, e.note, e.actor_id, null, null
 from app_private.customer_debt_entries e join api.customers c on c.id = e.customer_id
 where e.kind = 'COLLECTION' and (case when p_fund = 'CASH' then e.cash_amount else e.bank_transfer_amount end) > 0
 union all
 select 'v:' || v.id::text, v.occurred_at, v.direction, 'VOUCHER', v.amount,
  'VOUCHER', v.id, v.voucher_number, v.party, v.memo, v.actor_id, v.id, v.category
 from app_private.cash_vouchers v where v.fund = p_fund
 union all
 -- Wave 5: paying suppliers and refunds they send back for returned goods.
 select 'sp:' || e.id::text, e.occurred_at, 'OUT', 'SUPPLIER_PAYMENT',
  case when p_fund = 'CASH' then e.cash_amount else e.bank_transfer_amount end,
  'SUPPLIER', s.id, s.code, s.name, e.note, e.actor_id, null, null
 from app_private.supplier_debt_entries e join api.suppliers s on s.id = e.supplier_id
 where e.kind = 'PAYMENT' and (case when p_fund = 'CASH' then e.cash_amount else e.bank_transfer_amount end) > 0
 union all
 select 'pr:' || r.id::text, r.posted_at, 'IN', 'SUPPLIER_REFUND', r.refund_amount,
  'PURCHASE_RECEIPT', r.purchase_receipt_id, r.return_number, coalesce(s.name, 'Nhà cung cấp'), r.reason, r.actor_id, null, null
 from app_private.purchase_returns r left join api.suppliers s on s.id = r.supplier_id
 where r.refund_amount > 0 and r.refund_method = case when p_fund = 'CASH' then 'CASH' else 'BANK_TRANSFER' end;
$$;

-- New supplier and stock commands can be reconciled after a lost response.
CREATE OR REPLACE FUNCTION app_private.get_my_command_outcome_impl(p_command_name text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_correlation_id uuid := gen_random_uuid();
  v_command_name text := btrim(coalesce(p_command_name, ''));
  v_response jsonb;
begin
  if v_actor_id is null or not app_private.has_active_profile() then
    return app_private.command_error(
      'AUTH_REQUIRED',
      'Vui lòng đăng nhập để kiểm tra kết quả giao dịch.',
      v_correlation_id
    );
  end if;

  if p_idempotency_key is null
    or v_command_name not in (
      'sale.complete',
      'sale.cancel',
      'sale.return.complete',
      'purchase.post',
      'purchase.reverse',
      'stock.count.post',
      'opening.post', 'customer.debt.collect', 'customer.debt.adjust',
      'cash.voucher.create', 'cash.voucher.cancel', 'cash.opening.set', 'cash.shift.open', 'cash.shift.close',
      'supplier.debt.pay', 'supplier.debt.opening', 'purchase.return.post', 'inventory.writeoff.post'
    ) then
    return app_private.command_error(
      'VALIDATION_ERROR',
      'Mã yêu cầu hoặc loại giao dịch chưa hợp lệ.',
      v_correlation_id
    );
  end if;

  select d.response
  into v_response
  from app_private.command_deduplication as d
  where d.actor_id = v_actor_id
    and d.command_name = v_command_name
    and d.idempotency_key = p_idempotency_key;

  if v_response is null then
    return app_private.command_success(
      jsonb_build_object('status', 'NOT_FOUND', 'response', null),
      v_correlation_id
    );
  end if;

  return app_private.command_success(
    jsonb_build_object('status', 'RESOLVED', 'response', v_response),
    v_correlation_id
  );
end;
$function$;

notify pgrst, 'reload schema';
commit;
