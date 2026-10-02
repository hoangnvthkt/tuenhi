-- Read-only release assertions. Behavioral synthetic cases live in isolated/.
begin read only;
do $$
declare v_definition text;
begin
  if to_regprocedure('app_private.effective_permission_for_user(uuid,text)') is null then
    raise exception 'WAREHOUSE_VIEWER_HELPER_MISSING';
  end if;
  if has_function_privilege('anon', 'app_private.effective_permission_for_user(uuid,text)', 'execute')
    or has_function_privilege('authenticated', 'app_private.effective_permission_for_user(uuid,text)', 'execute') then
    raise exception 'WAREHOUSE_VIEWER_PRIVATE_HELPER_EXPOSED';
  end if;
  if not exists (
    select 1 from pg_constraint where conrelid = 'api.profiles'::regclass
      and conname = 'profiles_role_template_check'
      and pg_get_constraintdef(oid) like '%WAREHOUSE_VIEWER%'
  ) then raise exception 'WAREHOUSE_VIEWER_PROFILE_CONSTRAINT_MISSING'; end if;
  if (select count(*) from app_private.role_default_permissions
      where role_template = 'WAREHOUSE_VIEWER' and allowed) <> 2
    or not exists(select 1 from app_private.role_default_permissions where role_template = 'WAREHOUSE_VIEWER' and permission_code = 'catalog.read' and allowed)
    or not exists(select 1 from app_private.role_default_permissions where role_template = 'WAREHOUSE_VIEWER' and permission_code = 'inventory.read' and allowed) then
    raise exception 'WAREHOUSE_VIEWER_DEFAULTS_INVALID';
  end if;
  if exists (
    select 1 from api.profiles p cross join app_private.permission_definitions d
    where p.role_template = 'WAREHOUSE_VIEWER'
      and d.code not in ('catalog.read', 'inventory.read')
      and app_private.effective_permission_for_user(p.id, d.code)
  ) then raise exception 'WAREHOUSE_VIEWER_EFFECTIVE_PERMISSION_ESCALATION'; end if;
  select pg_get_functiondef('app_private.get_product_catalog_impl(text,uuid,text,boolean,text,uuid,integer)'::regprocedure) into v_definition;
  if position('has_permission(''pricing.sale.read'')' in v_definition) = 0 then
    raise exception 'CATALOG_PRICE_GATE_MISSING';
  end if;
  select pg_get_functiondef('app_private.get_product_detail_impl(uuid)'::regprocedure) into v_definition;
  if position('has_permission(''pricing.sale.read'')' in v_definition) = 0 then
    raise exception 'PRODUCT_DETAIL_PRICE_GATE_MISSING';
  end if;
end
$$;
rollback;
