-- Read-only release checks. Behavioral fixture writes live under isolated/.
begin;
set transaction read only;
do $$
begin
  if not exists(select 1 from pg_constraint
    where conrelid='api.purchase_receipts'::regclass
    and conname='purchase_receipts_submission_state_check' and convalidated)
  then raise exception 'Purchase cancellation invariant is missing/unvalidated'; end if;
  if app_private.low_stock_threshold('Hộp',0)<>50
    or app_private.low_stock_threshold('Hộp',20)<>20
    or app_private.low_stock_threshold('Thùng',0)<>0
    or app_private.low_stock_threshold('Cái',10)<>10
  then raise exception 'Low-stock unit contract is incorrect'; end if;
  if not exists(select 1 from pg_class where oid='app_private.low_stock_episodes'::regclass
    and relrowsecurity and relforcerowsecurity)
  then raise exception 'Episode state requires RLS'; end if;
  if has_table_privilege('authenticated','app_private.low_stock_episodes','SELECT,INSERT,UPDATE,DELETE')
    or has_function_privilege('authenticated','app_private.refresh_low_stock_episode(uuid)','EXECUTE')
    or has_function_privilege('anon','app_private.refresh_low_stock_episode(uuid)','EXECUTE')
  then raise exception 'Episode state must be private'; end if;
  if (select count(*) from pg_trigger where not tgisinternal and tgenabled='O'
    and tgname in ('inventory_low_stock_insert','inventory_low_stock_update','product_low_stock_update'))<>3
  then raise exception 'Low-stock triggers are missing/disabled'; end if;
end $$;
rollback;
