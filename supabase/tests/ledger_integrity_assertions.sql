-- Read-only release checks for 20261107013956_ledger_integrity_wave1.
-- Safe on Cloud: no writes; raises on the first broken invariant.
do $$
declare
  v_missing text;
begin
  -- Checkout receipts carry an exact cash/bank split.
  if exists (
    select 1 from api.payments
    where cash_amount + bank_transfer_amount <> amount
  ) then
    raise exception 'PAYMENT_SPLIT_SUM_MISMATCH';
  end if;
  if exists (
    select 1 from api.payments payment
    join app_private.sale_payment_allocations plan on plan.sale_id = payment.sale_id
    where payment.cash_amount <> plan.initial_cash_amount
      or payment.bank_transfer_amount <> plan.initial_bank_transfer_amount
  ) then
    raise exception 'PAYMENT_SPLIT_ALLOCATION_MISMATCH';
  end if;

  -- Every ledger table rejects update/delete outside maintenance.
  select string_agg(required.table_name, ', ') into v_missing
  from (values
    ('api.stock_movements'), ('api.payments'), ('api.sale_return_payments'),
    ('app_private.customer_debt_entries'), ('app_private.customer_debt_allocations'),
    ('app_private.audit_events'), ('app_private.inventory_cost_movements')
  ) required(table_name)
  where not exists (
    select 1 from pg_trigger trigger_row
    where trigger_row.tgrelid = required.table_name::regclass
      and trigger_row.tgfoid = 'app_private.guard_ledger_change()'::regprocedure
      and not trigger_row.tgisinternal
  );
  if v_missing is not null then
    raise exception 'LEDGER_GUARD_MISSING: %', v_missing;
  end if;

  -- Collections no longer rewrite checkout receipts.
  if position('update api.payments' in pg_get_functiondef(
    'app_private.change_customer_debt_impl(uuid,bigint,text,text,text,text,uuid,text)'::regprocedure
  )) > 0 then
    raise exception 'COLLECTION_STILL_UPDATES_PAYMENTS';
  end if;
end;
$$;
select 'ledger_integrity_assertions: PASS' as result;
