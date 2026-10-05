-- Read-only structural assertions, safe for a Cloud release gate.
begin read only;
do $$ declare table_id oid; definition text; begin
 table_id:='app_private.product_default_costs'::regclass;
 if not exists(select from pg_class where oid=table_id and relrowsecurity and relforcerowsecurity) then raise exception 'DEFAULT_COST_RLS_REQUIRED'; end if;
 if has_table_privilege('authenticated',table_id,'select') or has_table_privilege('authenticated',table_id,'insert') or has_table_privilege('anon',table_id,'select') then raise exception 'DEFAULT_COST_TABLE_EXPOSED'; end if;
 definition:=pg_get_functiondef('app_private.save_product_impl(uuid,bigint,jsonb,uuid)'::regprocedure);
 if position('v_default_cost' in definition)=0 or position('purchase.cost.read' in definition)=0 then raise exception 'DEFAULT_COST_COMMAND_MISSING'; end if;
 definition:=pg_get_functiondef('app_private.get_product_catalog_impl(text,uuid,text,boolean,text,uuid,integer)'::regprocedure);
 if position('defaultCost' in definition)=0 or position('purchase.cost.read' in definition)=0 then raise exception 'DEFAULT_COST_CATALOG_MISSING'; end if;
 definition:=pg_get_functiondef('app_private.get_product_detail_impl(uuid)'::regprocedure);
 if position('defaultCost' in definition)=0 or position('purchase.cost.read' in definition)=0 then raise exception 'DEFAULT_COST_DETAIL_MISSING'; end if;
 definition:=pg_get_functiondef('app_private.save_sale_draft_impl(uuid,bigint,uuid,uuid,jsonb,text,text,uuid)'::regprocedure);
 if position('PT002' in definition)=0 or position('raise sqlstate' in definition)=0 then raise exception 'DISCOUNT_ATOMICITY_GUARD_MISSING'; end if;
end $$;
rollback;
