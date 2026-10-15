-- Read-only post-release structural and live-invariant checks. No synthetic writes.
\set ON_ERROR_STOP on
begin read only;
do $$ begin
 if to_regclass('app_private.sale_inventory_shortages') is null
 or to_regclass('app_private.sale_inventory_cost_allocations') is null then raise exception 'DEFERRED_COST_TABLES_MISSING'; end if;
 if exists(select 1 from pg_class where oid in ('app_private.sale_inventory_shortages'::regclass,'app_private.sale_inventory_cost_allocations'::regclass) and (not relrowsecurity or not relforcerowsecurity)) then raise exception 'PRIVATE_COST_RLS_MISSING'; end if;
 if has_table_privilege('authenticated','app_private.sale_inventory_shortages','SELECT')
 or has_table_privilege('anon','app_private.sale_inventory_shortages','SELECT')
 or has_table_privilege('authenticated','app_private.sale_inventory_cost_allocations','SELECT')
 or has_table_privilege('anon','app_private.sale_inventory_cost_allocations','SELECT') then raise exception 'PRIVATE_COST_TABLE_EXPOSED'; end if;
 if has_function_privilege('authenticated','app_private.allocate_inbound_inventory_cost(uuid,numeric,numeric,uuid)','EXECUTE')
 or has_function_privilege('anon','app_private.allocate_inbound_inventory_cost(uuid,numeric,numeric,uuid)','EXECUTE')
 or has_function_privilege('authenticated','app_private.release_sale_inventory_shortage(uuid,numeric,numeric,numeric)','EXECUTE')
 or has_function_privilege('anon','app_private.release_sale_inventory_shortage(uuid,numeric,numeric,numeric)','EXECUTE') then raise exception 'PRIVATE_COST_HELPER_EXPOSED'; end if;
 if exists(select 1 from api.inventory_balances b left join lateral (
   select coalesce(sum(d.remaining_qty),0) as remaining from app_private.sale_inventory_shortages d where d.product_id=b.product_id
 ) d on true where d.remaining<>greatest(-b.on_hand_qty,0)) then raise exception 'SIGNED_STOCK_SHORTAGE_RECONCILIATION_FAILED'; end if;
 if exists(select 1 from api.inventory_balances b join app_private.inventory_cost_balances c using(product_id)
  where b.on_hand_qty<=0 and (c.inventory_value<>0 or c.avg_unit_cost<>0)) then raise exception 'NONPOSITIVE_STOCK_HAS_ASSET_VALUE'; end if;
 raise notice 'PASS deferred-cost structure, RLS, private privileges, signed stock and cost reconciliation';
end $$;
rollback;
