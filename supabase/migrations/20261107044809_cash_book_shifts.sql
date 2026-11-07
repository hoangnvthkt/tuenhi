-- Wave 3: cash book (Tiền mặt + Ngân hàng), manual vouchers, fund openings and
-- cashier shifts. Sale/collection/refund/cancel money is derived from the
-- existing append-only ledgers; only vouchers, openings and shifts are new rows.
begin;

insert into app_private.permission_definitions(code,category,label,owner_only,description) values
 ('cash.book.read','Sổ quỹ','Xem sổ quỹ',false,'Xem phiếu thu/chi, tồn quỹ và ca của mọi người.'),
 ('cash.voucher.create','Sổ quỹ','Lập phiếu thu/chi',false,'Lập và hủy phiếu thu/chi tay.'),
 ('cash.shift.manage','Sổ quỹ','Mở và đóng ca',false,'Mở ca, đếm két và đóng ca của chính mình.'),
 ('cash.opening.set','Sổ quỹ','Nhập số dư đầu quỹ',true,'Nhập số dư đầu quỹ một lần cho mỗi quỹ.');
insert into app_private.role_default_permissions(role_template,permission_code,allowed) values
 ('BUSINESS','cash.shift.manage',true),('SALES_WAREHOUSE','cash.shift.manage',true)
on conflict do nothing;

alter table app_private.document_sequences drop constraint if exists document_sequences_document_type_check;
alter table app_private.document_sequences add constraint document_sequences_document_type_check
 check (document_type = any (array['PURCHASE_RECEIPT','STOCK_COUNT','SALE','SALE_RETURN','CASH_RECEIPT','CASH_PAYMENT','CASH_SHIFT']));
insert into app_private.document_sequences(document_type,prefix) values('CASH_RECEIPT','PT'),('CASH_PAYMENT','PC'),('CASH_SHIFT','CA')
on conflict do nothing;

create table app_private.cash_fund_openings (
 fund text primary key check (fund in ('CASH','BANK')),
 as_of date not null,
 amount numeric(20,2) not null check (amount >= 0),
 actor_id uuid not null references api.profiles(id),
 created_at timestamptz not null default now(),
 correlation_id uuid not null
);

create table app_private.cash_vouchers (
 id uuid primary key default gen_random_uuid(),
 voucher_number text not null unique,
 fund text not null check (fund in ('CASH','BANK')),
 direction text not null check (direction in ('IN','OUT')),
 category text not null check (category in ('OWNER_CONTRIBUTION','EXPENSE','OWNER_WITHDRAWAL','FUND_TRANSFER','OTHER','REVERSAL')),
 amount numeric(20,2) not null check (amount > 0),
 party text check (party is null or (party = btrim(party) and length(party) between 1 and 200)),
 memo text not null check (memo = btrim(memo) and length(memo) between 1 and 500),
 transfer_group uuid,
 reverses_voucher_id uuid unique references app_private.cash_vouchers(id),
 actor_id uuid not null references api.profiles(id),
 occurred_at timestamptz not null default now(),
 correlation_id uuid not null,
 check ((category = 'REVERSAL') = (reverses_voucher_id is not null)),
 check (category <> 'OWNER_CONTRIBUTION' or direction = 'IN'),
 check (category not in ('EXPENSE','OWNER_WITHDRAWAL') or direction = 'OUT'),
 check ((category = 'FUND_TRANSFER') = (transfer_group is not null) or category = 'REVERSAL')
);
create index cash_vouchers_fund_time on app_private.cash_vouchers(fund, occurred_at);

create table app_private.cash_shifts (
 id uuid primary key default gen_random_uuid(),
 shift_number text not null unique,
 user_id uuid not null references api.profiles(id),
 status text not null default 'OPEN' check (status in ('OPEN','CLOSED')),
 opened_at timestamptz not null default now(),
 opening_cash numeric(20,2) not null check (opening_cash >= 0),
 closed_at timestamptz,
 closed_by uuid references api.profiles(id),
 cash_in numeric(20,2),
 cash_out numeric(20,2),
 bank_in numeric(20,2),
 bank_out numeric(20,2),
 expected_cash numeric(20,2),
 counted_cash numeric(20,2) check (counted_cash is null or counted_cash >= 0),
 difference numeric(20,2),
 close_note text check (close_note is null or (close_note = btrim(close_note) and length(close_note) between 1 and 500)),
 version bigint not null default 1,
 correlation_id uuid not null,
 check (
  (status = 'OPEN' and closed_at is null and closed_by is null and counted_cash is null and expected_cash is null and difference is null)
  or (status = 'CLOSED' and closed_at is not null and closed_by is not null and counted_cash is not null and expected_cash is not null
   and cash_in is not null and cash_out is not null and bank_in is not null and bank_out is not null
   and expected_cash = opening_cash + cash_in - cash_out and difference = counted_cash - expected_cash
   and (difference = 0 or close_note is not null))
 )
);
create unique index cash_shifts_one_open_per_user on app_private.cash_shifts(user_id) where status = 'OPEN';
create index cash_shifts_user_time on app_private.cash_shifts(user_id, opened_at desc);

alter table app_private.cash_fund_openings enable row level security;
alter table app_private.cash_fund_openings force row level security;
alter table app_private.cash_vouchers enable row level security;
alter table app_private.cash_vouchers force row level security;
alter table app_private.cash_shifts enable row level security;
alter table app_private.cash_shifts force row level security;
revoke all on app_private.cash_fund_openings, app_private.cash_vouchers, app_private.cash_shifts from public, anon, authenticated, service_role;

-- Vouchers and openings never change; a wrong voucher gets a REVERSAL voucher.
create trigger cash_vouchers_append_only before update or delete on app_private.cash_vouchers
 for each row execute function app_private.guard_ledger_change();
create trigger cash_fund_openings_append_only before update or delete on app_private.cash_fund_openings
 for each row execute function app_private.guard_ledger_change();

-- A shift is written twice: opened, then closed once. Nothing else.
create function app_private.guard_cash_shift_change() returns trigger
language plpgsql set search_path to '' as $$
declare v_close text[] := array['status','closed_at','closed_by','cash_in','cash_out','bank_in','bank_out','expected_cash','counted_cash','difference','close_note','version'];
begin
 if coalesce(current_setting('app.ledger_maintenance', true), '') = 'on' then
  return case when tg_op = 'DELETE' then old else new end;
 end if;
 if tg_op = 'UPDATE' and old.status = 'OPEN' and new.status = 'CLOSED'
  and (to_jsonb(new) - v_close) = (to_jsonb(old) - v_close) then
  return new;
 end if;
 raise exception 'LEDGER_APPEND_ONLY: % on %.% is not allowed', tg_op, tg_table_schema, tg_table_name using errcode = '55000';
end $$;
revoke all on function app_private.guard_cash_shift_change() from public;
create trigger cash_shifts_guard before update or delete on app_private.cash_shifts
 for each row execute function app_private.guard_cash_shift_change();

-- Every money movement of one fund, derived from the source ledgers.
-- Cancel refunds what the sale had received (checkout + collections), which
-- sale_payment_allocations tracks; a pre-debt sale falls back to its receipts.
create function app_private.cash_book_entries(p_fund text)
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
 from app_private.cash_vouchers v where v.fund = p_fund;
$$;
revoke all on function app_private.cash_book_entries(text) from public, anon, authenticated, service_role;

create function app_private.cash_opening_start(p_fund text) returns timestamptz
language sql stable security definer set search_path = '' as $$
 select coalesce((select o.as_of::timestamp at time zone 'Asia/Ho_Chi_Minh' from app_private.cash_fund_openings o where o.fund = p_fund), '-infinity'::timestamptz);
$$;
revoke all on function app_private.cash_opening_start(text) from public, anon, authenticated, service_role;

-- Current balance of a fund: its opening plus every movement since the opening day.
create function app_private.cash_fund_balance(p_fund text) returns numeric
language sql stable security definer set search_path = '' as $$
 select coalesce((select o.amount from app_private.cash_fund_openings o where o.fund = p_fund), 0)
  + coalesce(sum(case when e.direction = 'IN' then e.amount else -e.amount end), 0)
 from app_private.cash_book_entries(p_fund) e
 where e.occurred_at >= app_private.cash_opening_start(p_fund);
$$;
revoke all on function app_private.cash_fund_balance(text) from public, anon, authenticated, service_role;

-- Money a person handled in a time window (shift totals). Inclusive end.
create function app_private.cash_shift_totals(p_user uuid, p_from timestamptz, p_to timestamptz)
returns table(cash_in numeric, cash_out numeric, cash_in_count integer, cash_out_count integer, bank_in numeric, bank_out numeric)
language sql stable security definer set search_path = '' as $$
 with c as (select * from app_private.cash_book_entries('CASH') e where e.actor_id = p_user and e.occurred_at >= p_from and e.occurred_at <= p_to),
  b as (select * from app_private.cash_book_entries('BANK') e where e.actor_id = p_user and e.occurred_at >= p_from and e.occurred_at <= p_to)
 select coalesce((select sum(amount) from c where direction = 'IN'), 0)::numeric(20,2),
  coalesce((select sum(amount) from c where direction = 'OUT'), 0)::numeric(20,2),
  (select count(*) from c where direction = 'IN')::integer,
  (select count(*) from c where direction = 'OUT')::integer,
  coalesce((select sum(amount) from b where direction = 'IN'), 0)::numeric(20,2),
  coalesce((select sum(amount) from b where direction = 'OUT'), 0)::numeric(20,2);
$$;
revoke all on function app_private.cash_shift_totals(uuid, timestamptz, timestamptz) from public, anon, authenticated, service_role;

create function app_private.cash_shift_json(p_shift app_private.cash_shifts) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_t record; v_name text; v_closed boolean := p_shift.status = 'CLOSED';
 v_cash_in numeric(20,2); v_cash_out numeric(20,2); v_bank_in numeric(20,2); v_bank_out numeric(20,2);
begin
 select display_name into v_name from api.profiles where id = p_shift.user_id;
 select * into v_t from app_private.cash_shift_totals(p_shift.user_id, p_shift.opened_at, coalesce(p_shift.closed_at, now()));
 -- A closed shift keeps the totals it was closed with.
 v_cash_in := case when v_closed then p_shift.cash_in else v_t.cash_in end;
 v_cash_out := case when v_closed then p_shift.cash_out else v_t.cash_out end;
 v_bank_in := case when v_closed then p_shift.bank_in else v_t.bank_in end;
 v_bank_out := case when v_closed then p_shift.bank_out else v_t.bank_out end;
 return jsonb_build_object(
  'id', p_shift.id, 'shiftNumber', p_shift.shift_number, 'userId', p_shift.user_id, 'userName', v_name,
  'status', p_shift.status, 'openedAt', p_shift.opened_at, 'closedAt', p_shift.closed_at,
  'openingCash', p_shift.opening_cash::text, 'cashIn', v_cash_in::text, 'cashOut', v_cash_out::text,
  'cashInCount', v_t.cash_in_count, 'cashOutCount', v_t.cash_out_count,
  'bankIn', v_bank_in::text, 'bankOut', v_bank_out::text,
  'expectedCash', (p_shift.opening_cash + v_cash_in - v_cash_out)::numeric(20,2)::text,
  'countedCash', p_shift.counted_cash::text, 'difference', p_shift.difference::text,
  'closeNote', p_shift.close_note, 'version', p_shift.version);
end $$;
revoke all on function app_private.cash_shift_json(app_private.cash_shifts) from public, anon, authenticated, service_role;

create function app_private.get_cash_book_impl(p_fund text, p_from date, p_to date, p_scope text, p_shift_id uuid,
 p_cursor_occurred_at timestamptz, p_cursor_key text, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_correlation uuid := gen_random_uuid(); v_all boolean; v_user uuid;
 v_start timestamptz; v_end timestamptz; v_balances boolean; v_shift app_private.cash_shifts%rowtype;
 v_open app_private.cash_fund_openings%rowtype; v_base timestamptz; v_opening numeric; v_summary jsonb; v_items jsonb; v_next jsonb;
 v_can_cancel boolean;
begin
 if v_actor is null then return app_private.command_error('PERMISSION_DENIED', 'Vui lòng đăng nhập để xem sổ quỹ.', v_correlation); end if;
 if p_fund is null or p_fund not in ('CASH', 'BANK') or p_limit is null or p_limit not between 1 and 100
  or (p_cursor_occurred_at is null) <> (p_cursor_key is null) then
  return app_private.command_error('VALIDATION_FAILED', 'Bộ lọc sổ quỹ chưa hợp lệ.', v_correlation);
 end if;
 v_all := app_private.has_permission('cash.book.read');
 v_can_cancel := app_private.has_permission('cash.voucher.create');
 if p_shift_id is not null then
  select * into v_shift from app_private.cash_shifts where id = p_shift_id;
  if not found or (v_shift.user_id <> v_actor and not v_all) or not (v_all or app_private.has_permission('cash.shift.manage')) then
   return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền xem ca này.', v_correlation);
  end if;
  v_user := v_shift.user_id; v_start := v_shift.opened_at; v_end := coalesce(v_shift.closed_at, now()); v_balances := false;
 else
  if p_scope is null or p_scope not in ('OWN', 'ALL') or (p_scope = 'ALL' and not v_all)
   or (p_scope = 'OWN' and not (v_all or app_private.has_permission('cash.shift.manage'))) then
   return app_private.command_error('REPORT_SCOPE_DENIED', 'Bạn không có quyền xem sổ quỹ này.', v_correlation);
  end if;
  if not app_private.report_period_is_valid(p_from, p_to) then
   return app_private.command_error('REPORT_DATE_RANGE_INVALID', 'Khoảng thời gian chưa hợp lệ.', v_correlation);
  end if;
  v_user := case when p_scope = 'OWN' then v_actor end;
  v_start := p_from::timestamp at time zone 'Asia/Ho_Chi_Minh';
  -- Inclusive end keeps one comparison for both modes.
  v_end := (p_to + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh' - interval '1 microsecond';
  v_balances := p_scope = 'ALL';
 end if;
 select * into v_open from app_private.cash_fund_openings where fund = p_fund;
 v_base := app_private.cash_opening_start(p_fund);
 with source as materialized (
  select e.*, case when e.direction = 'IN' then e.amount else -e.amount end signed
  from app_private.cash_book_entries(p_fund) e
  where v_user is null or e.actor_id = v_user
 ), ledger as (
  select source.*,
   case when v_balances and source.occurred_at >= v_base then
    coalesce(v_open.amount, 0) + sum(case when source.occurred_at >= v_base then source.signed else 0 end)
     over (order by source.occurred_at, source.entry_key rows between unbounded preceding and current row)
   end balance_after
  from source
 ), period as materialized (
  select * from ledger where occurred_at >= v_start and occurred_at <= v_end
 ), page as (
  select period.*, row_number() over (order by occurred_at desc, entry_key desc) ordinal
  from period
  where p_cursor_occurred_at is null or (occurred_at, entry_key) < (p_cursor_occurred_at, p_cursor_key)
  order by occurred_at desc, entry_key desc limit p_limit + 1
 )
 select
  (select case when v_balances and v_start >= v_base then
    coalesce(v_open.amount, 0) + coalesce(sum(signed) filter (where occurred_at >= v_base and occurred_at < v_start), 0) end from ledger),
  (select jsonb_build_object(
    'totalIn', coalesce(sum(amount) filter (where direction = 'IN'), 0)::numeric(20,2)::text,
    'totalOut', coalesce(sum(amount) filter (where direction = 'OUT'), 0)::numeric(20,2)::text,
    'inCount', count(*) filter (where direction = 'IN'),
    'outCount', count(*) filter (where direction = 'OUT')) from period),
  coalesce((select jsonb_agg(jsonb_build_object(
    'entryKey', page.entry_key, 'occurredAt', page.occurred_at, 'direction', page.direction, 'source', page.source,
    'category', page.voucher_category, 'amount', page.amount::numeric(20,2)::text,
    'documentType', page.document_type, 'documentId', page.document_id, 'documentNumber', page.document_number,
    'party', page.party, 'memo', page.memo, 'actorName', profile.display_name,
    'balanceAfter', page.balance_after::numeric(20,2)::text,
    'canCancel', page.voucher_id is not null and v_can_cancel and page.voucher_category <> 'REVERSAL'
     and (v_all or page.actor_id = v_actor)
     and not exists (select 1 from app_private.cash_vouchers r where r.reverses_voucher_id = page.voucher_id)
   ) order by page.occurred_at desc, page.entry_key desc)
   from page left join api.profiles profile on profile.id = page.actor_id where page.ordinal <= p_limit), '[]'::jsonb),
  case when (select count(*) from page) > p_limit then
   (select jsonb_build_object('occurredAt', occurred_at, 'key', entry_key) from page where ordinal = p_limit) end
 into v_opening, v_summary, v_items, v_next;
 v_summary := v_summary || jsonb_build_object(
  'openingBalance', v_opening::numeric(20,2)::text,
  'closingBalance', case when v_opening is null then null else
   (v_opening + (v_summary ->> 'totalIn')::numeric - (v_summary ->> 'totalOut')::numeric)::numeric(20,2)::text end);
 return app_private.command_success(jsonb_build_object(
  'version', 1, 'fund', p_fund, 'scope', case when p_shift_id is null then p_scope else 'SHIFT' end,
  'range', jsonb_build_object('from', v_start, 'to', v_end),
  'opening', case when v_open.fund is null then null else jsonb_build_object('asOf', v_open.as_of, 'amount', v_open.amount::text) end,
  'fundBalances', case when v_all and p_shift_id is null then jsonb_build_object(
    'CASH', app_private.cash_fund_balance('CASH')::numeric(20,2)::text,
    'BANK', app_private.cash_fund_balance('BANK')::numeric(20,2)::text) end,
  'openings', case when v_all then jsonb_build_object(
    'CASH', exists (select 1 from app_private.cash_fund_openings where fund = 'CASH'),
    'BANK', exists (select 1 from app_private.cash_fund_openings where fund = 'BANK')) end,
  'shift', case when p_shift_id is null then null else app_private.cash_shift_json(v_shift) end,
  'summary', v_summary, 'items', v_items, 'nextCursor', v_next), v_correlation);
end $$;

create function app_private.cash_command_cached(p_actor uuid, p_name text, p_key uuid, p_hash text, p_correlation uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_cached jsonb; v_hash text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text || ':' || p_name || ':' || p_key::text, 0));
 select response, request_hash into v_cached, v_hash from app_private.command_deduplication
 where actor_id = p_actor and command_name = p_name and idempotency_key = p_key;
 if not found then return null; end if;
 if v_hash is distinct from p_hash then
  return app_private.command_error('IDEMPOTENCY_CONFLICT', 'Mã yêu cầu đã dùng cho nội dung khác.', p_correlation);
 end if;
 return v_cached;
end $$;
revoke all on function app_private.cash_command_cached(uuid, text, uuid, text, uuid) from public, anon, authenticated, service_role;

create function app_private.create_cash_voucher_impl(p_fund text, p_direction text, p_category text, p_amount text,
 p_party text, p_memo text, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_correlation uuid := gen_random_uuid(); v_name text := 'cash.voucher.create';
 v_hash text; v_cached jsonb; v_result jsonb; v_party text := nullif(btrim(coalesce(p_party, '')), ''); v_memo text := nullif(btrim(coalesce(p_memo, '')), '');
 v_id uuid := gen_random_uuid(); v_pair uuid; v_group uuid; v_number text; v_pair_number text; v_other text;
begin
 if v_actor is null or not app_private.has_permission(v_name) then
  return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền lập phiếu thu/chi.', v_correlation);
 end if;
 if p_idempotency_key is null or p_fund is null or p_fund not in ('CASH', 'BANK') or p_direction is null or p_direction not in ('IN', 'OUT')
  or p_category is null or p_category not in ('OWNER_CONTRIBUTION', 'EXPENSE', 'OWNER_WITHDRAWAL', 'FUND_TRANSFER', 'OTHER')
  or (p_category = 'OWNER_CONTRIBUTION' and p_direction <> 'IN') or (p_category in ('EXPENSE', 'OWNER_WITHDRAWAL', 'FUND_TRANSFER') and p_direction <> 'OUT')
  or not app_private.valid_debt_money(p_amount) or p_amount::numeric <= 0
  or v_memo is null or length(v_memo) > 500 or length(coalesce(v_party, '')) > 200 then
  return app_private.command_error('VALIDATION_FAILED', 'Nhập số tiền lớn hơn 0 và nội dung phiếu.', v_correlation);
 end if;
 v_hash := md5(jsonb_build_object('fund', p_fund, 'direction', p_direction, 'category', p_category, 'amount', p_amount::numeric, 'party', v_party, 'memo', v_memo)::text);
 v_cached := app_private.cash_command_cached(v_actor, v_name, p_idempotency_key, v_hash, v_correlation);
 if v_cached is not null then return v_cached; end if;
 v_number := app_private.next_document_number_impl(case when p_direction = 'IN' then 'CASH_RECEIPT' else 'CASH_PAYMENT' end);
 if p_category = 'FUND_TRANSFER' then
  -- Moving money between funds: out of this fund, into the other one.
  v_group := gen_random_uuid(); v_pair := gen_random_uuid(); v_other := case when p_fund = 'CASH' then 'BANK' else 'CASH' end;
  v_pair_number := app_private.next_document_number_impl('CASH_RECEIPT');
 end if;
 insert into app_private.cash_vouchers(id, voucher_number, fund, direction, category, amount, party, memo, transfer_group, actor_id, correlation_id)
 values (v_id, v_number, p_fund, p_direction, p_category, p_amount::numeric, v_party, v_memo, v_group, v_actor, v_correlation);
 if v_pair is not null then
  insert into app_private.cash_vouchers(id, voucher_number, fund, direction, category, amount, party, memo, transfer_group, actor_id, correlation_id)
  values (v_pair, v_pair_number, v_other, 'IN', 'FUND_TRANSFER', p_amount::numeric, v_party, v_memo, v_group, v_actor, v_correlation);
 end if;
 v_result := app_private.command_success(jsonb_build_object('voucherId', v_id, 'voucherNumber', v_number,
  'transferVoucherId', v_pair, 'transferVoucherNumber', v_pair_number), v_correlation);
 insert into app_private.command_deduplication(actor_id, command_name, idempotency_key, response, request_hash) values (v_actor, v_name, p_idempotency_key, v_result, v_hash);
 insert into app_private.audit_events(actor_id, action, entity_type, entity_id, after_data, correlation_id)
 values (v_actor, 'cash.voucher.created', 'cash_voucher', v_id, jsonb_build_object('voucherNumber', v_number, 'fund', p_fund, 'direction', p_direction,
  'category', p_category, 'amount', p_amount::numeric::text, 'party', v_party, 'memo', v_memo, 'transferVoucherNumber', v_pair_number), v_correlation);
 return v_result;
end $$;

create function app_private.cancel_cash_voucher_impl(p_voucher_id uuid, p_reason text, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_correlation uuid := gen_random_uuid(); v_name text := 'cash.voucher.cancel';
 v_hash text; v_cached jsonb; v_result jsonb; v_reason text := nullif(btrim(coalesce(p_reason, '')), ''); v_voucher app_private.cash_vouchers%rowtype;
 v_row record; v_numbers jsonb := '[]'::jsonb; v_number text; v_reversal uuid;
begin
 if v_actor is null or not app_private.has_permission('cash.voucher.create') then
  return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền hủy phiếu thu/chi.', v_correlation);
 end if;
 if p_voucher_id is null or p_idempotency_key is null or v_reason is null or length(v_reason) > 400 then
  return app_private.command_error('VALIDATION_FAILED', 'Nhập lý do hủy phiếu.', v_correlation);
 end if;
 v_hash := md5(jsonb_build_object('voucherId', p_voucher_id, 'reason', v_reason)::text);
 v_cached := app_private.cash_command_cached(v_actor, v_name, p_idempotency_key, v_hash, v_correlation);
 if v_cached is not null then return v_cached; end if;
 perform pg_advisory_xact_lock(hashtextextended('cash.voucher:' || p_voucher_id::text, 0));
 select * into v_voucher from app_private.cash_vouchers where id = p_voucher_id;
 if not found or (v_voucher.actor_id <> v_actor and not app_private.has_permission('cash.book.read')) then
  return app_private.command_error('NOT_FOUND', 'Không tìm thấy phiếu.', v_correlation);
 end if;
 if v_voucher.category = 'REVERSAL' then
  return app_private.command_error('VALIDATION_FAILED', 'Phiếu hủy không thể hủy tiếp.', v_correlation);
 end if;
 if exists (select 1 from app_private.cash_vouchers r where r.reverses_voucher_id = p_voucher_id) then
  return app_private.command_error('CASH_VOUCHER_ALREADY_CANCELLED', 'Phiếu đã được hủy.', v_correlation);
 end if;
 -- A fund transfer is cancelled as a pair.
 for v_row in select * from app_private.cash_vouchers v
  where v.id = p_voucher_id or (v_voucher.transfer_group is not null and v.transfer_group = v_voucher.transfer_group and v.category = 'FUND_TRANSFER')
  order by v.voucher_number loop
  v_number := app_private.next_document_number_impl(case when v_row.direction = 'OUT' then 'CASH_RECEIPT' else 'CASH_PAYMENT' end);
  v_reversal := gen_random_uuid();
  insert into app_private.cash_vouchers(id, voucher_number, fund, direction, category, amount, party, memo, reverses_voucher_id, actor_id, correlation_id)
  values (v_reversal, v_number, v_row.fund, case when v_row.direction = 'IN' then 'OUT' else 'IN' end, 'REVERSAL', v_row.amount, v_row.party,
   left('Hủy ' || v_row.voucher_number || ': ' || v_reason, 500), v_row.id, v_actor, v_correlation);
  v_numbers := v_numbers || jsonb_build_object('voucherId', v_row.id, 'voucherNumber', v_row.voucher_number, 'reversalId', v_reversal, 'reversalNumber', v_number);
 end loop;
 v_result := app_private.command_success(jsonb_build_object('voucherId', p_voucher_id, 'reversals', v_numbers), v_correlation);
 insert into app_private.command_deduplication(actor_id, command_name, idempotency_key, response, request_hash) values (v_actor, v_name, p_idempotency_key, v_result, v_hash);
 insert into app_private.audit_events(actor_id, action, entity_type, entity_id, after_data, correlation_id)
 values (v_actor, 'cash.voucher.cancelled', 'cash_voucher', p_voucher_id, jsonb_build_object('reason', v_reason, 'reversals', v_numbers), v_correlation);
 return v_result;
end $$;

create function app_private.set_cash_fund_opening_impl(p_fund text, p_as_of date, p_amount text, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_correlation uuid := gen_random_uuid(); v_name text := 'cash.opening.set'; v_hash text; v_cached jsonb; v_result jsonb;
begin
 if v_actor is null or not app_private.has_permission(v_name) then
  return app_private.command_error('PERMISSION_DENIED', 'Chỉ chủ cửa hàng được nhập số dư đầu quỹ.', v_correlation);
 end if;
 if p_idempotency_key is null or p_fund is null or p_fund not in ('CASH', 'BANK') or p_as_of is null
  or p_as_of > (now() at time zone 'Asia/Ho_Chi_Minh')::date or p_as_of < date '2020-01-01' or not app_private.valid_debt_money(p_amount) then
  return app_private.command_error('VALIDATION_FAILED', 'Nhập ngày không quá hôm nay và số tiền hợp lệ.', v_correlation);
 end if;
 v_hash := md5(jsonb_build_object('fund', p_fund, 'asOf', p_as_of, 'amount', p_amount::numeric)::text);
 v_cached := app_private.cash_command_cached(v_actor, v_name, p_idempotency_key, v_hash, v_correlation);
 if v_cached is not null then return v_cached; end if;
 perform pg_advisory_xact_lock(hashtextextended('cash.opening:' || p_fund, 0));
 if exists (select 1 from app_private.cash_fund_openings where fund = p_fund) then
  return app_private.command_error('CASH_OPENING_ALREADY_SET', 'Quỹ này đã có số dư đầu.', v_correlation);
 end if;
 insert into app_private.cash_fund_openings(fund, as_of, amount, actor_id, correlation_id) values (p_fund, p_as_of, p_amount::numeric, v_actor, v_correlation);
 v_result := app_private.command_success(jsonb_build_object('fund', p_fund, 'asOf', p_as_of, 'amount', p_amount::numeric::text), v_correlation);
 insert into app_private.command_deduplication(actor_id, command_name, idempotency_key, response, request_hash) values (v_actor, v_name, p_idempotency_key, v_result, v_hash);
 insert into app_private.audit_events(actor_id, action, entity_type, entity_id, after_data, correlation_id)
 values (v_actor, v_name, 'cash_fund', null, jsonb_build_object('fund', p_fund, 'asOf', p_as_of, 'amount', p_amount::numeric::text), v_correlation);
 return v_result;
end $$;

create function app_private.open_cash_shift_impl(p_opening_cash text, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_correlation uuid := gen_random_uuid(); v_name text := 'cash.shift.open'; v_hash text; v_cached jsonb; v_result jsonb;
 v_shift app_private.cash_shifts%rowtype;
begin
 if v_actor is null or not app_private.has_permission('cash.shift.manage') then
  return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền mở ca.', v_correlation);
 end if;
 if p_idempotency_key is null or not app_private.valid_debt_money(p_opening_cash) then
  return app_private.command_error('VALIDATION_FAILED', 'Nhập tiền đầu ca hợp lệ.', v_correlation);
 end if;
 v_hash := md5(jsonb_build_object('openingCash', p_opening_cash::numeric)::text);
 v_cached := app_private.cash_command_cached(v_actor, v_name, p_idempotency_key, v_hash, v_correlation);
 if v_cached is not null then return v_cached; end if;
 perform pg_advisory_xact_lock(hashtextextended('cash.shift.user:' || v_actor::text, 0));
 if exists (select 1 from app_private.cash_shifts where user_id = v_actor and status = 'OPEN') then
  return app_private.command_error('CASH_SHIFT_ALREADY_OPEN', 'Bạn đang có ca chưa đóng.', v_correlation);
 end if;
 insert into app_private.cash_shifts(shift_number, user_id, opening_cash, correlation_id)
 values (app_private.next_document_number_impl('CASH_SHIFT'), v_actor, p_opening_cash::numeric, v_correlation)
 returning * into v_shift;
 v_result := app_private.command_success(app_private.cash_shift_json(v_shift), v_correlation);
 insert into app_private.command_deduplication(actor_id, command_name, idempotency_key, response, request_hash) values (v_actor, v_name, p_idempotency_key, v_result, v_hash);
 insert into app_private.audit_events(actor_id, action, entity_type, entity_id, after_data, correlation_id)
 values (v_actor, 'cash.shift.opened', 'cash_shift', v_shift.id, jsonb_build_object('shiftNumber', v_shift.shift_number, 'openingCash', v_shift.opening_cash::text), v_correlation);
 return v_result;
end $$;

create function app_private.close_cash_shift_impl(p_shift_id uuid, p_expected_version bigint, p_counted_cash text, p_note text, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_correlation uuid := gen_random_uuid(); v_name text := 'cash.shift.close'; v_hash text; v_cached jsonb; v_result jsonb;
 v_shift app_private.cash_shifts%rowtype; v_t record; v_expected numeric(20,2); v_note text := nullif(btrim(coalesce(p_note, '')), ''); v_now timestamptz := now();
begin
 if v_actor is null or not app_private.has_permission('cash.shift.manage') then
  return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền đóng ca.', v_correlation);
 end if;
 if p_shift_id is null or p_expected_version is null or p_idempotency_key is null or not app_private.valid_debt_money(p_counted_cash) or length(coalesce(v_note, '')) > 500 then
  return app_private.command_error('VALIDATION_FAILED', 'Nhập tiền mặt đếm được hợp lệ.', v_correlation);
 end if;
 v_hash := md5(jsonb_build_object('shiftId', p_shift_id, 'version', p_expected_version, 'counted', p_counted_cash::numeric, 'note', v_note)::text);
 v_cached := app_private.cash_command_cached(v_actor, v_name, p_idempotency_key, v_hash, v_correlation);
 if v_cached is not null then return v_cached; end if;
 select * into v_shift from app_private.cash_shifts where id = p_shift_id for update;
 if not found or (v_shift.user_id <> v_actor and not app_private.has_permission('cash.book.read')) then
  return app_private.command_error('NOT_FOUND', 'Không tìm thấy ca.', v_correlation);
 end if;
 if v_shift.status <> 'OPEN' then return app_private.command_error('CASH_SHIFT_ALREADY_CLOSED', 'Ca đã đóng.', v_correlation); end if;
 if v_shift.version <> p_expected_version then return app_private.command_error('VERSION_CONFLICT', 'Ca đã thay đổi. Vui lòng tải lại.', v_correlation); end if;
 select * into v_t from app_private.cash_shift_totals(v_shift.user_id, v_shift.opened_at, v_now);
 v_expected := v_shift.opening_cash + v_t.cash_in - v_t.cash_out;
 if p_counted_cash::numeric <> v_expected and v_note is null then
  return app_private.command_error('CASH_SHIFT_NOTE_REQUIRED', 'Tiền đếm lệch: nhập ghi chú lý do.', v_correlation);
 end if;
 update app_private.cash_shifts set status = 'CLOSED', closed_at = v_now, closed_by = v_actor,
  cash_in = v_t.cash_in, cash_out = v_t.cash_out, bank_in = v_t.bank_in, bank_out = v_t.bank_out,
  expected_cash = v_expected, counted_cash = p_counted_cash::numeric, difference = p_counted_cash::numeric - v_expected,
  close_note = v_note, version = version + 1
 where id = p_shift_id returning * into v_shift;
 v_result := app_private.command_success(app_private.cash_shift_json(v_shift), v_correlation);
 insert into app_private.command_deduplication(actor_id, command_name, idempotency_key, response, request_hash) values (v_actor, v_name, p_idempotency_key, v_result, v_hash);
 insert into app_private.audit_events(actor_id, action, entity_type, entity_id, after_data, correlation_id)
 values (v_actor, 'cash.shift.closed', 'cash_shift', v_shift.id, jsonb_build_object('shiftNumber', v_shift.shift_number,
  'expectedCash', v_shift.expected_cash::text, 'countedCash', v_shift.counted_cash::text, 'difference', v_shift.difference::text, 'note', v_note), v_correlation);
 return v_result;
end $$;

create function app_private.get_my_cash_shift_impl() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_correlation uuid := gen_random_uuid(); v_shift app_private.cash_shifts%rowtype;
begin
 if v_actor is null or not (app_private.has_permission('cash.shift.manage') or app_private.has_permission('cash.book.read')) then
  return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền xem ca.', v_correlation);
 end if;
 select * into v_shift from app_private.cash_shifts where user_id = v_actor and status = 'OPEN';
 return app_private.command_success(jsonb_build_object('shift', case when found then app_private.cash_shift_json(v_shift) end), v_correlation);
end $$;

create function app_private.list_cash_shifts_impl(p_scope text, p_cursor_opened_at timestamptz, p_cursor_id uuid, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_correlation uuid := gen_random_uuid(); v_items jsonb; v_next jsonb;
begin
 if v_actor is null or p_scope is null or p_scope not in ('OWN', 'ALL')
  or (p_scope = 'ALL' and not app_private.has_permission('cash.book.read'))
  or (p_scope = 'OWN' and not (app_private.has_permission('cash.shift.manage') or app_private.has_permission('cash.book.read'))) then
  return app_private.command_error('REPORT_SCOPE_DENIED', 'Bạn không có quyền xem danh sách ca.', v_correlation);
 end if;
 if p_limit is null or p_limit not between 1 and 100 or (p_cursor_opened_at is null) <> (p_cursor_id is null) then
  return app_private.command_error('VALIDATION_FAILED', 'Phân trang chưa hợp lệ.', v_correlation);
 end if;
 with page as (
  select s, row_number() over (order by s.opened_at desc, s.id desc) ordinal
  from app_private.cash_shifts s
  where (p_scope = 'ALL' or s.user_id = v_actor)
   and (p_cursor_opened_at is null or (s.opened_at, s.id) < (p_cursor_opened_at, p_cursor_id))
  order by s.opened_at desc, s.id desc limit p_limit + 1
 )
 select coalesce(jsonb_agg(app_private.cash_shift_json((page.s)::app_private.cash_shifts) order by (page.s).opened_at desc, (page.s).id desc) filter (where ordinal <= p_limit), '[]'::jsonb),
  (select jsonb_build_object('openedAt', (p.s).opened_at, 'id', (p.s).id) from page p where p.ordinal = p_limit and (select count(*) from page) > p_limit)
 into v_items, v_next from page;
 return app_private.command_success(jsonb_build_object('items', v_items, 'nextCursor', v_next), v_correlation);
end $$;

create function api.get_cash_book(p_fund text, p_from date default null, p_to date default null, p_scope text default 'OWN', p_shift_id uuid default null,
 p_cursor_occurred_at timestamptz default null, p_cursor_key text default null, p_limit integer default 50)
returns jsonb language sql stable security invoker set search_path = '' as $$
 select app_private.get_cash_book_impl(p_fund, p_from, p_to, p_scope, p_shift_id, p_cursor_occurred_at, p_cursor_key, p_limit);
$$;
create function api.create_cash_voucher(p_fund text, p_direction text, p_category text, p_amount text, p_party text, p_memo text, p_idempotency_key uuid)
returns jsonb language sql security invoker set search_path = '' as $$
 select app_private.create_cash_voucher_impl(p_fund, p_direction, p_category, p_amount, p_party, p_memo, p_idempotency_key);
$$;
create function api.cancel_cash_voucher(p_voucher_id uuid, p_reason text, p_idempotency_key uuid)
returns jsonb language sql security invoker set search_path = '' as $$
 select app_private.cancel_cash_voucher_impl(p_voucher_id, p_reason, p_idempotency_key);
$$;
create function api.set_cash_fund_opening(p_fund text, p_as_of date, p_amount text, p_idempotency_key uuid)
returns jsonb language sql security invoker set search_path = '' as $$
 select app_private.set_cash_fund_opening_impl(p_fund, p_as_of, p_amount, p_idempotency_key);
$$;
create function api.open_cash_shift(p_opening_cash text, p_idempotency_key uuid)
returns jsonb language sql security invoker set search_path = '' as $$
 select app_private.open_cash_shift_impl(p_opening_cash, p_idempotency_key);
$$;
create function api.close_cash_shift(p_shift_id uuid, p_expected_version bigint, p_counted_cash text, p_note text, p_idempotency_key uuid)
returns jsonb language sql security invoker set search_path = '' as $$
 select app_private.close_cash_shift_impl(p_shift_id, p_expected_version, p_counted_cash, p_note, p_idempotency_key);
$$;
create function api.get_my_cash_shift()
returns jsonb language sql stable security invoker set search_path = '' as $$
 select app_private.get_my_cash_shift_impl();
$$;
create function api.list_cash_shifts(p_scope text default 'OWN', p_cursor_opened_at timestamptz default null, p_cursor_id uuid default null, p_limit integer default 30)
returns jsonb language sql stable security invoker set search_path = '' as $$
 select app_private.list_cash_shifts_impl(p_scope, p_cursor_opened_at, p_cursor_id, p_limit);
$$;

revoke all on function
 app_private.get_cash_book_impl(text, date, date, text, uuid, timestamptz, text, integer),
 app_private.create_cash_voucher_impl(text, text, text, text, text, text, uuid),
 app_private.cancel_cash_voucher_impl(uuid, text, uuid),
 app_private.set_cash_fund_opening_impl(text, date, text, uuid),
 app_private.open_cash_shift_impl(text, uuid),
 app_private.close_cash_shift_impl(uuid, bigint, text, text, uuid),
 app_private.get_my_cash_shift_impl(),
 app_private.list_cash_shifts_impl(text, timestamptz, uuid, integer),
 api.get_cash_book(text, date, date, text, uuid, timestamptz, text, integer),
 api.create_cash_voucher(text, text, text, text, text, text, uuid),
 api.cancel_cash_voucher(uuid, text, uuid),
 api.set_cash_fund_opening(text, date, text, uuid),
 api.open_cash_shift(text, uuid),
 api.close_cash_shift(uuid, bigint, text, text, uuid),
 api.get_my_cash_shift(),
 api.list_cash_shifts(text, timestamptz, uuid, integer)
from public, anon;
grant execute on function
 app_private.get_cash_book_impl(text, date, date, text, uuid, timestamptz, text, integer),
 app_private.create_cash_voucher_impl(text, text, text, text, text, text, uuid),
 app_private.cancel_cash_voucher_impl(uuid, text, uuid),
 app_private.set_cash_fund_opening_impl(text, date, text, uuid),
 app_private.open_cash_shift_impl(text, uuid),
 app_private.close_cash_shift_impl(uuid, bigint, text, text, uuid),
 app_private.get_my_cash_shift_impl(),
 app_private.list_cash_shifts_impl(text, timestamptz, uuid, integer),
 api.get_cash_book(text, date, date, text, uuid, timestamptz, text, integer),
 api.create_cash_voucher(text, text, text, text, text, text, uuid),
 api.cancel_cash_voucher(uuid, text, uuid),
 api.set_cash_fund_opening(text, date, text, uuid),
 api.open_cash_shift(text, uuid),
 api.close_cash_shift(uuid, bigint, text, text, uuid),
 api.get_my_cash_shift(),
 api.list_cash_shifts(text, timestamptz, uuid, integer)
to authenticated, service_role;

-- Cash commands can be reconciled after a lost response, like other money commands.
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
      'cash.voucher.create', 'cash.voucher.cancel', 'cash.opening.set', 'cash.shift.open', 'cash.shift.close'
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
