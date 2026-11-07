-- Đợt 1 audit 07/11/2026: sổ thanh toán theo phương thức, chia giảm giá đơn
-- theo đồng nguyên, nhật ký cho 4 lệnh kho và khóa sửa/xóa các sổ.

-- A1. Phiếu thu tại quầy ghi riêng tiền mặt và chuyển khoản. Thu nợ không sửa
-- phiếu này nữa: khoản thu nợ nằm trong customer_debt_entries theo phương thức.
alter table api.payments
  add column cash_amount numeric(20,2),
  add column bank_transfer_amount numeric(20,2);

update api.payments payment
set amount = plan.initial_cash_amount + plan.initial_bank_transfer_amount,
  cash_amount = plan.initial_cash_amount,
  bank_transfer_amount = plan.initial_bank_transfer_amount
from app_private.sale_payment_allocations plan
where plan.sale_id = payment.sale_id;

update api.payments
set cash_amount = case when method = 'CASH' then amount else 0 end,
  bank_transfer_amount = case when method = 'BANK_TRANSFER' then amount else 0 end
where cash_amount is null;

alter table api.payments
  alter column cash_amount set not null,
  alter column bank_transfer_amount set not null,
  add constraint payments_method_split_check check (
    cash_amount >= 0 and bank_transfer_amount >= 0
    and cash_amount + bank_transfer_amount = amount
  );

create function app_private.fill_payment_split() returns trigger
  language plpgsql set search_path to '' as $$
begin
  if new.cash_amount is null and new.bank_transfer_amount is null then
    new.cash_amount := case when new.method = 'CASH' then new.amount else 0 end;
    new.bank_transfer_amount := case when new.method = 'BANK_TRANSFER' then new.amount else 0 end;
  end if;
  return new;
end;
$$;
revoke all on function app_private.fill_payment_split() from public;
create trigger payments_fill_split before insert on api.payments
  for each row execute function app_private.fill_payment_split();

CREATE OR REPLACE FUNCTION app_private.complete_sale_with_allocations_impl(p_sale_id uuid, p_expected_version bigint, p_cash_amount text, p_bank_transfer_amount text, p_idempotency_key uuid, p_transfer_proof_path text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
 update api.payments set amount=v_cash+v_bank,cash_amount=v_cash,bank_transfer_amount=v_bank,transfer_proof_path=p_transfer_proof_path where sale_id=p_sale_id;
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
CREATE OR REPLACE FUNCTION app_private.change_customer_debt_impl(p_customer_id uuid, p_expected_version bigint, p_cash_amount text, p_bank_transfer_amount text, p_new_balance text, p_note text, p_idempotency_key uuid, p_kind text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
CREATE OR REPLACE FUNCTION app_private.get_sale_invoice_impl(p_sale_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
  'debtOffsetAmount',coalesce(v_plan.offset_amount,0)::text,
  'capturedAmount',case when v_plan.sale_id is not null then (v_plan.cash_amount+v_plan.bank_transfer_amount)::text else v_result#>>'{data,totals,capturedAmount}' end));
 return v_result;
end $$;
-- A4. Chia giảm giá đơn theo đồng nguyên.
CREATE OR REPLACE FUNCTION app_private.recalculate_sale_draft_impl(p_sale_id uuid, p_order_discount numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_base numeric(20,2); v_unit numeric(20,2);
begin
  select coalesce(sum(gross_amount - line_discount_amount), 0) into v_base
  from api.sale_lines where sale_id = p_sale_id;
  if p_order_discount < 0 or p_order_discount > v_base or (v_base = 0 and p_order_discount <> 0) then
    raise exception 'ORDER_DISCOUNT_EXCEEDED';
  end if;
  -- Whole-dong discounts on whole-dong lines are split in whole dong; otherwise
  -- in 0.01. Largest-remainder keeps every share <= its line and the sum exact.
  v_unit := case when p_order_discount = trunc(p_order_discount) and not exists (
    select 1 from api.sale_lines where sale_id = p_sale_id
      and gross_amount - line_discount_amount <> trunc(gross_amount - line_discount_amount)
  ) then 1 else 0.01 end;
  with base as (
    select id, line_order,
      case when v_base = 0 then 0::numeric
        else p_order_discount * (gross_amount - line_discount_amount) / v_base end as exact
    from api.sale_lines where sale_id = p_sale_id
  ), floored as (
    select id, line_order, floor(exact / v_unit) * v_unit as share,
      exact - floor(exact / v_unit) * v_unit as remainder
    from base
  ), ranked as (
    select id, share, row_number() over (order by remainder desc, line_order, id) as rank
    from floored
  ), leftover as (
    select round((p_order_discount - coalesce(sum(share), 0)) / v_unit) as units from floored
  )
  update api.sale_lines line
  set allocated_order_discount = ranked.share + case when ranked.rank <= leftover.units then v_unit else 0 end,
    net_amount = line.gross_amount - line.line_discount_amount
      - (ranked.share + case when ranked.rank <= leftover.units then v_unit else 0 end)
  from ranked, leftover
  where line.id = ranked.id;
  update api.sales set subtotal = (select coalesce(sum(gross_amount), 0) from api.sale_lines where sale_id = p_sale_id),
    line_discount_total = (select coalesce(sum(line_discount_amount), 0) from api.sale_lines where sale_id = p_sale_id),
    order_discount_total = p_order_discount,
    discount_total = (select coalesce(sum(line_discount_amount), 0) from api.sale_lines where sale_id = p_sale_id) + p_order_discount,
    net_total = (select coalesce(sum(net_amount), 0) from api.sale_lines where sale_id = p_sale_id)
  where id = p_sale_id;
end;
$$;

-- Phiếu kiểm kho/mở sổ đã gửi phải hủy được và giữ lại thời điểm gửi.
alter table api.stock_counts
  drop constraint stock_counts_check1,
  add constraint stock_counts_submitted_state_check check (
    (status not in ('COUNTED', 'POSTED') or submitted_at is not null)
    and (status <> 'DRAFT' or submitted_at is null)
  );

-- L1. Nhật ký cho 4 lệnh kho còn thiếu.
CREATE OR REPLACE FUNCTION app_private.submit_opening_stock_impl(p_count_id uuid, p_expected_version bigint, p_idempotency_key uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id uuid := (select auth.uid());
  v_correlation_id uuid := gen_random_uuid();
  v_count api.stock_counts%rowtype;
  v_cached jsonb;
  v_result jsonb;
  v_version bigint;
begin
  if v_actor_id is null
    or not app_private.has_permission('inventory.adjustment.post')
  then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Chỉ chủ cửa hàng được xác nhận phiếu mở sổ.',
      v_correlation_id
    );
  end if;
  if p_count_id is null or p_expected_version is null
    or p_idempotency_key is null
  then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Thông tin xác nhận mở sổ chưa hợp lệ.',
      v_correlation_id
    );
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_actor_id::text || ':opening.submit:' || p_idempotency_key::text, 0
  ));
  v_cached := app_private.cached_command_response(
    v_actor_id, 'opening.submit', p_idempotency_key
  );
  if v_cached is not null then return v_cached; end if;
  select c.* into v_count from api.stock_counts c
  where c.id = p_count_id for update;
  if not found then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND', 'Không tìm thấy phiếu mở sổ.', v_correlation_id
    );
  end if;
  if v_count.count_type <> 'OPENING' or v_count.status <> 'DRAFT' then
    return app_private.command_error(
      'INVALID_STATE', 'Phiếu mở sổ không còn ở trạng thái nháp.',
      v_correlation_id
    );
  end if;
  if v_count.version <> p_expected_version then
    return app_private.command_error_with_details(
      'VERSION_CONFLICT',
      'Phiếu mở sổ đã được cập nhật. Vui lòng tải lại dữ liệu.',
      jsonb_build_object('currentVersion', v_count.version),
      v_correlation_id
    );
  end if;
  update api.stock_counts
  set status = 'COUNTED', submitted_by = v_actor_id, submitted_at = now(),
      version = version + 1, updated_at = now()
  where id = p_count_id returning version into v_version;
  insert into app_private.audit_events(actor_id, action, entity_type, entity_id, before_data, after_data, correlation_id)
  values (v_actor_id, 'opening_stock.submitted', 'stock_count', p_count_id, jsonb_build_object('status', v_count.status), jsonb_build_object('status', 'COUNTED', 'version', v_version), v_correlation_id);
  v_result := app_private.command_success(
    jsonb_build_object(
      'countId', p_count_id, 'status', 'COUNTED', 'version', v_version
    ),
    v_correlation_id
  );
  insert into app_private.command_deduplication(
    actor_id, command_name, idempotency_key, response
  ) values (v_actor_id, 'opening.submit', p_idempotency_key, v_result);
  return v_result;
end;
$$;

CREATE OR REPLACE FUNCTION app_private.cancel_opening_stock_impl(p_count_id uuid, p_expected_version bigint, p_reason text, p_idempotency_key uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id uuid := (select auth.uid());
  v_correlation_id uuid := gen_random_uuid();
  v_reason text := normalize(btrim(coalesce(p_reason, '')), NFC);
  v_count api.stock_counts%rowtype;
  v_cached jsonb;
  v_result jsonb;
  v_version bigint;
begin
  if v_actor_id is null
    or not app_private.has_permission('inventory.adjustment.post')
  then
    return app_private.command_error(
      'PERMISSION_DENIED', 'Chỉ chủ cửa hàng được hủy phiếu mở sổ.',
      v_correlation_id
    );
  end if;
  if p_count_id is null or p_expected_version is null
    or p_idempotency_key is null or length(v_reason) not between 1 and 500
  then
    return app_private.command_error(
      'VALIDATION_FAILED', 'Vui lòng nhập lý do hủy phiếu mở sổ.',
      v_correlation_id
    );
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_actor_id::text || ':opening.cancel:' || p_idempotency_key::text, 0
  ));
  v_cached := app_private.cached_command_response(
    v_actor_id, 'opening.cancel', p_idempotency_key
  );
  if v_cached is not null then return v_cached; end if;
  select c.* into v_count from api.stock_counts c
  where c.id = p_count_id for update;
  if not found then
    return app_private.command_error(
      'REFERENCE_NOT_FOUND', 'Không tìm thấy phiếu mở sổ.', v_correlation_id
    );
  end if;
  if v_count.status not in ('DRAFT', 'COUNTED') then
    return app_private.command_error(
      'INVALID_STATE', 'Phiếu mở sổ này không thể hủy.', v_correlation_id
    );
  end if;
  if v_count.version <> p_expected_version then
    return app_private.command_error_with_details(
      'VERSION_CONFLICT',
      'Phiếu mở sổ đã được cập nhật. Vui lòng tải lại dữ liệu.',
      jsonb_build_object('currentVersion', v_count.version),
      v_correlation_id
    );
  end if;
  update api.stock_counts
  set status = 'CANCELLED', cancelled_by = v_actor_id, cancelled_at = now(),
      cancel_reason = v_reason, version = version + 1, updated_at = now()
  where id = p_count_id returning version into v_version;
  insert into app_private.audit_events(actor_id, action, entity_type, entity_id, before_data, after_data, correlation_id)
  values (v_actor_id, 'opening_stock.cancelled', 'stock_count', p_count_id, jsonb_build_object('status', v_count.status), jsonb_build_object('status', 'CANCELLED', 'version', v_version, 'reason', v_reason), v_correlation_id);
  v_result := app_private.command_success(
    jsonb_build_object(
      'countId', p_count_id, 'status', 'CANCELLED', 'version', v_version
    ),
    v_correlation_id
  );
  insert into app_private.command_deduplication(
    actor_id, command_name, idempotency_key, response
  ) values (v_actor_id, 'opening.cancel', p_idempotency_key, v_result);
  return v_result;
end;
$$;

CREATE OR REPLACE FUNCTION app_private.cancel_stock_count_impl(p_count_id uuid, p_expected_version bigint, p_reason text, p_idempotency_key uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor uuid := (select auth.uid());
  v_correlation uuid := gen_random_uuid();
  v_reason text := app_private.empty_to_null(p_reason);
  v_count api.stock_counts%rowtype;
  v_cached jsonb;
  v_result jsonb;
  v_version bigint;
begin
  if v_actor is null or not app_private.has_permission('inventory.count.draft') then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền hủy phiếu kiểm kho.', v_correlation);
  end if;
  if p_count_id is null or p_expected_version is null or p_idempotency_key is null
    or v_reason is null or length(v_reason) > 500 then
    return app_private.command_error('VALIDATION_FAILED', 'Vui lòng nhập lý do hủy phiếu kiểm kho.', v_correlation);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':stock.count.cancel:' || p_idempotency_key::text, 0));
  v_cached := app_private.cached_command_response(v_actor, 'stock.count.cancel', p_idempotency_key);
  if v_cached is not null then return v_cached; end if;
  select * into v_count from api.stock_counts where id = p_count_id for update;
  if not found or v_count.count_type <> 'PERIODIC' or v_count.status not in ('DRAFT', 'COUNTED') then
    return app_private.command_error('INVALID_STATE', 'Phiếu kiểm kho này không thể hủy.', v_correlation);
  end if;
  if v_count.created_by <> v_actor and not app_private.has_permission('inventory.adjustment.post') then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn chỉ được hủy phiếu kiểm kho do mình lập.', v_correlation);
  end if;
  if v_count.version <> p_expected_version then
    return app_private.command_error_with_details('VERSION_CONFLICT', 'Phiếu kiểm kho đã được cập nhật. Vui lòng tải lại.', jsonb_build_object('currentVersion', v_count.version), v_correlation);
  end if;
  update api.stock_counts
  set status = 'CANCELLED', cancelled_by = v_actor, cancelled_at = now(), cancel_reason = v_reason,
      version = version + 1, updated_at = now(), correlation_id = v_correlation
  where id = p_count_id returning version into v_version;
  insert into api.user_notifications(user_id, severity, category, title, message, action_route, entity_type, entity_id, dedupe_key, correlation_id)
  select v_count.created_by, 'INFO', 'INVENTORY', 'Phiếu kiểm kho đã hủy',
    'Phiếu kiểm kho của bạn đã được hủy.', '/stock-counts/' || p_count_id::text,
    'stock_count', p_count_id, 'stock-count-cancel:' || p_count_id::text, v_correlation
  where v_count.created_by <> v_actor
  on conflict do nothing;
  insert into app_private.audit_events(actor_id, action, entity_type, entity_id, before_data, after_data, correlation_id)
  values (v_actor, 'stock_count.cancelled', 'stock_count', p_count_id, jsonb_build_object('status', v_count.status), jsonb_build_object('status', 'CANCELLED', 'version', v_version, 'reason', v_reason), v_correlation);
  v_result := app_private.command_success(jsonb_build_object('countId', p_count_id, 'status', 'CANCELLED', 'version', v_version), v_correlation);
  insert into app_private.command_deduplication(actor_id, command_name, idempotency_key, response)
  values (v_actor, 'stock.count.cancel', p_idempotency_key, v_result);
  return v_result;
end;
$$;

CREATE OR REPLACE FUNCTION app_private.refresh_stock_count_snapshot_impl(p_count_id uuid, p_expected_version bigint, p_idempotency_key uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor uuid := (select auth.uid());
  v_correlation uuid := gen_random_uuid();
  v_count api.stock_counts%rowtype;
  v_cached jsonb;
  v_result jsonb;
  v_version bigint;
begin
  if v_actor is null or not app_private.has_permission('inventory.count.draft') then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền cập nhật phiếu kiểm kho.', v_correlation);
  end if;
  if p_count_id is null or p_expected_version is null or p_idempotency_key is null then
    return app_private.command_error('VALIDATION_FAILED', 'Thông tin cập nhật phiếu kiểm kho chưa hợp lệ.', v_correlation);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':stock.count.refresh:' || p_idempotency_key::text, 0));
  v_cached := app_private.cached_command_response(v_actor, 'stock.count.refresh', p_idempotency_key);
  if v_cached is not null then return v_cached; end if;
  select * into v_count from api.stock_counts where id = p_count_id for update;
  if not found or v_count.count_type <> 'PERIODIC' or v_count.status not in ('DRAFT', 'COUNTED') then
    return app_private.command_error('INVALID_STATE', 'Phiếu kiểm kho này không thể cập nhật lại tồn hệ thống.', v_correlation);
  end if;
  if v_count.created_by <> v_actor and not app_private.has_permission('inventory.adjustment.post') then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn chỉ được cập nhật phiếu kiểm kho do mình lập.', v_correlation);
  end if;
  if v_count.version <> p_expected_version then
    return app_private.command_error_with_details('VERSION_CONFLICT', 'Phiếu kiểm kho đã được cập nhật. Vui lòng tải lại.', jsonb_build_object('currentVersion', v_count.version), v_correlation);
  end if;
  update api.stock_count_lines line
  set system_qty_snapshot = balance.on_hand_qty, inventory_version_snapshot = balance.version,
      counted_qty = null, difference_qty = null
  from api.inventory_balances balance
  where line.stock_count_id = p_count_id and balance.product_id = line.product_id;
  update api.stock_counts
  set status = 'DRAFT', submitted_by = null, submitted_at = null, version = version + 1,
      updated_at = now(), correlation_id = v_correlation
  where id = p_count_id returning version into v_version;
  insert into app_private.audit_events(actor_id, action, entity_type, entity_id, before_data, after_data, correlation_id)
  values (v_actor, 'stock_count.snapshot_refreshed', 'stock_count', p_count_id, jsonb_build_object('status', v_count.status), jsonb_build_object('status', 'DRAFT', 'version', v_version), v_correlation);
  v_result := app_private.command_success(jsonb_build_object('countId', p_count_id, 'status', 'DRAFT', 'version', v_version), v_correlation);
  insert into app_private.command_deduplication(actor_id, command_name, idempotency_key, response)
  values (v_actor, 'stock.count.refresh', p_idempotency_key, v_result);
  return v_result;
end;
$$;

-- L2. Sổ chỉ ghi thêm. Được sửa: dòng vừa tạo trong cùng giao dịch (lệnh đang
-- hoàn tất), đảo phiếu thu khi hủy, gắn ảnh chứng từ lần đầu. Công cụ dọn dữ
-- liệu thử phải bật app.ledger_maintenance trong giao dịch.
create function app_private.guard_ledger_change() returns trigger
  language plpgsql set search_path to '' as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb;
begin
  if coalesce(current_setting('app.ledger_maintenance', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and tg_table_name in ('payments', 'sale_return_payments') then
    v_new := to_jsonb(new);
    if (v_old ->> case when tg_table_name = 'payments' then 'paid_at' else 'refunded_at' end)::timestamptz = now() then
      return new;
    end if;
    if v_old ->> 'transfer_proof_path' is null and v_new ->> 'transfer_proof_path' is not null
      and (v_new - 'transfer_proof_path') = (v_old - 'transfer_proof_path') then
      return new;
    end if;
    if tg_table_name = 'payments' and v_old ->> 'status' = 'CAPTURED' and v_new ->> 'status' = 'REVERSED'
      and (v_new - array['status', 'reversed_at', 'reversed_by', 'reversal_reason'])
        = (v_old - array['status', 'reversed_at', 'reversed_by', 'reversal_reason']) then
      return new;
    end if;
  end if;
  raise exception 'LEDGER_APPEND_ONLY: % on %.% is not allowed', tg_op, tg_table_schema, tg_table_name
    using errcode = '55000';
end;
$$;
revoke all on function app_private.guard_ledger_change() from public;

create trigger stock_movements_append_only before update or delete on api.stock_movements
  for each row execute function app_private.guard_ledger_change();
create trigger payments_append_only before update or delete on api.payments
  for each row execute function app_private.guard_ledger_change();
create trigger sale_return_payments_append_only before update or delete on api.sale_return_payments
  for each row execute function app_private.guard_ledger_change();
create trigger customer_debt_entries_append_only before update or delete on app_private.customer_debt_entries
  for each row execute function app_private.guard_ledger_change();
create trigger customer_debt_allocations_append_only before update or delete on app_private.customer_debt_allocations
  for each row execute function app_private.guard_ledger_change();
create trigger audit_events_append_only before update or delete on app_private.audit_events
  for each row execute function app_private.guard_ledger_change();
create trigger inventory_cost_movements_append_only before update or delete on app_private.inventory_cost_movements
  for each row execute function app_private.guard_ledger_change();

-- Công cụ dọn dữ liệu thử cũ vẫn chạy được, nhưng phải đi qua cờ bảo trì.
CREATE OR REPLACE FUNCTION api.cleanup_phase1a_test_users(p_user_ids uuid[]) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  select set_config('app.ledger_maintenance', 'on', true);
  select app_private.cleanup_phase1a_test_users_impl(p_user_ids);
$$;
CREATE OR REPLACE FUNCTION api.cleanup_phase1b_test_users(p_user_ids uuid[]) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  select set_config('app.ledger_maintenance', 'on', true);
  select app_private.cleanup_phase1b_test_users_impl(p_user_ids);
$$;
CREATE OR REPLACE FUNCTION api.cleanup_phase1c_test_users(p_user_ids uuid[]) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  select set_config('app.ledger_maintenance', 'on', true);
  select app_private.cleanup_phase1c_test_users_impl(p_user_ids);
$$;
CREATE OR REPLACE FUNCTION api.cleanup_phase1e_test_users(p_user_ids uuid[]) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  select set_config('app.ledger_maintenance', 'on', true);
  select app_private.cleanup_phase1e_test_users_impl(p_user_ids);
$$;
CREATE OR REPLACE FUNCTION api.cleanup_phase1f_test_users(p_user_ids uuid[]) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  select set_config('app.ledger_maintenance', 'on', true);
  select app_private.cleanup_phase1f_test_users_impl(p_user_ids);
$$;
CREATE OR REPLACE FUNCTION api.dispose_owner_pilot_mock_data(p_manifest_sha256 text, p_keep_store_settings boolean, p_keep_sales_channels boolean) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  select set_config('app.ledger_maintenance', 'on', true);
  select app_private.dispose_owner_pilot_mock_data_impl(
    p_manifest_sha256,
    p_keep_store_settings,
    p_keep_sales_channels
  );
$$;

-- Sau khi chuyển: phiếu thu tại quầy khớp đúng phần thu ban đầu theo phương thức.
do $$
begin
  if exists (
    select 1 from api.payments payment
    join app_private.sale_payment_allocations plan on plan.sale_id = payment.sale_id
    where payment.cash_amount <> plan.initial_cash_amount
      or payment.bank_transfer_amount <> plan.initial_bank_transfer_amount
  ) then
    raise exception 'PAYMENT_SPLIT_BACKFILL_MISMATCH';
  end if;
end;
$$;
