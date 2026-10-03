-- Synthetic fixtures are restricted to the isolated, schema-only audit database.
begin;
do $$ begin
  if current_database() <> 'feedback_access' then
    raise exception 'ISOLATED_DATABASE_REQUIRED';
  end if;
end $$;
insert into auth.users(id, email) values
 ('10000000-0000-4000-8000-000000000001', 'owner@example.invalid'),
 ('10000000-0000-4000-8000-000000000002', 'viewer@example.invalid'),
 ('10000000-0000-4000-8000-000000000003', 'sales@example.invalid');
insert into api.profiles(id,email,display_name,role_template,is_active,must_change_password) values
 ('10000000-0000-4000-8000-000000000001','owner@example.invalid','Owner','OWNER',true,false),
 ('10000000-0000-4000-8000-000000000002','viewer@example.invalid','Viewer','SALES_WAREHOUSE',true,false),
 ('10000000-0000-4000-8000-000000000003','sales@example.invalid','Sales','SALES_WAREHOUSE',true,false);
-- This grant predates the role change and must never escalate the viewer.
insert into app_private.user_permission_overrides(user_id,permission_code,effect,changed_by,reason) values
 ('10000000-0000-4000-8000-000000000002','sale.complete','GRANT','10000000-0000-4000-8000-000000000001','Old grant'),
 ('10000000-0000-4000-8000-000000000003','sale.complete','GRANT','10000000-0000-4000-8000-000000000001','Old grant'),
 ('10000000-0000-4000-8000-000000000003','inventory.read','REVOKE','10000000-0000-4000-8000-000000000001','Old revoke'),
 ('10000000-0000-4000-8000-000000000003','catalog.read','REVOKE','10000000-0000-4000-8000-000000000001','Old revoke');
update api.profiles set role_template='WAREHOUSE_VIEWER' where id='10000000-0000-4000-8000-000000000002';
insert into api.products(id,sku,sku_normalized,name,name_normalized,unit_name,created_by,updated_by) values
 ('10000000-0000-4000-8000-000000000004','VIEWER-SKU','viewer-sku','Test product','test product','Hộp','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
insert into app_private.product_sale_prices(product_id,sale_price,changed_by) values
 ('10000000-0000-4000-8000-000000000004',25000,'10000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ declare v jsonb; begin
  v := api.get_my_session_context();
  if v #> '{data,permissions}' <> '["catalog.read","inventory.read"]'::jsonb then raise exception 'VIEWER_SESSION_PERMISSION_ESCALATION: %',v; end if;
  if app_private.has_permission('sale.complete') or app_private.has_permission('report.own_revenue.read') or app_private.has_permission('pricing.sale.read') then raise exception 'VIEWER_PERMISSION_ESCALATION'; end if;
  if not app_private.has_permission('catalog.read') or not app_private.has_permission('inventory.read') then raise exception 'VIEWER_READ_DENIED'; end if;
  v := api.get_product_detail('10000000-0000-4000-8000-000000000004');
  if v ->> 'ok' <> 'true' or v #> '{data,currentSalePrice}' <> 'null'::jsonb or v #> '{data,salePriceValidFrom}' <> 'null'::jsonb then raise exception 'VIEWER_DETAIL_PRICE_LEAK: %',v; end if;
  v := api.get_product_catalog();
  if v ->> 'ok' <> 'true' or v #> '{data,items,0,currentSalePrice}' <> 'null'::jsonb then raise exception 'VIEWER_LIST_PRICE_LEAK: %',v; end if;
  v := api.get_my_sales_summary(current_date,current_date);
  if v #>> '{error,code}' <> 'PERMISSION_DENIED' then raise exception 'VIEWER_REVENUE_ALLOWED: %',v; end if;
  v := api.save_product(null,null,'{}'::jsonb,gen_random_uuid());
  if v #>> '{error,code}' <> 'PERMISSION_DENIED' then raise exception 'VIEWER_WRITE_ALLOWED: %',v; end if;
  if has_function_privilege('authenticated','app_private.effective_permission_for_user(uuid,text)','execute') then raise exception 'PRIVATE_HELPER_EXPOSED'; end if;
end $$;
reset role;
do $$ begin
  if app_private.effective_permissions_for('10000000-0000-4000-8000-000000000002') <> '["catalog.read","inventory.read"]'::jsonb then raise exception 'STAFF_PERMISSION_REPORT_ESCALATION'; end if;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ declare v jsonb; begin
  v := api.set_staff_permission_override('10000000-0000-4000-8000-000000000002','report.all_revenue.read','GRANT','Escalation attempt',gen_random_uuid());
  if v #>> '{error,code}' <> 'PERMISSION_DENIED' then raise exception 'VIEWER_GRANT_ACCEPTED: %',v; end if;
  v := api.set_staff_role('10000000-0000-4000-8000-000000000003','WAREHOUSE_VIEWER','Read only',gen_random_uuid());
  if v ->> 'ok' <> 'true' then raise exception 'VIEWER_ROLE_CHANGE_DENIED: %',v; end if;
  v := api.get_product_detail('10000000-0000-4000-8000-000000000004');
  if (v #>> '{data,currentSalePrice}')::numeric <> 25000 then raise exception 'OWNER_PRICE_REGRESSION: %',v; end if;
  v := api.list_staff();
  if not exists(select from jsonb_array_elements(v #> '{data,items}') item where item->>'id'='10000000-0000-4000-8000-000000000003' and item->'overrides'='[]'::jsonb) then raise exception 'VIEWER_ROLE_RETAINED_OLD_OVERRIDES'; end if;
  if not exists(select from jsonb_array_elements(v #> '{data,permissionDefinitions}') d where d ->> 'code'='inventory.read' and d ->> 'warehouseViewerDefault'='true') then raise exception 'VIEWER_DEFAULT_MISSING: %',v; end if;
end $$;
reset role;
do $$ begin
  if app_private.effective_permissions_for('10000000-0000-4000-8000-000000000003') <> '["catalog.read","inventory.read"]'::jsonb then raise exception 'ROLE_CHANGE_RETAINED_READ_REVOCATION'; end if;
end $$;
update api.profiles set role_template='SALES_WAREHOUSE' where id='10000000-0000-4000-8000-000000000003';
insert into app_private.user_permission_overrides(user_id,permission_code,effect,changed_by,reason) values
 ('10000000-0000-4000-8000-000000000003','pricing.sale.read','REVOKE','10000000-0000-4000-8000-000000000001','No prices');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
set local role authenticated;
do $$ declare v jsonb; begin
  if not app_private.has_permission('sale.complete') then raise exception 'EXISTING_SALES_ROLE_REGRESSION'; end if;
  v := api.get_product_detail('10000000-0000-4000-8000-000000000004');
  if v #> '{data,currentSalePrice}' <> 'null'::jsonb then raise exception 'REVOKED_PRICE_LEAK'; end if;
end $$;
reset role;
update api.profiles set is_active=false where id='10000000-0000-4000-8000-000000000002';
do $$ begin
  if app_private.effective_permission_for_user('10000000-0000-4000-8000-000000000002','inventory.read') then raise exception 'INACTIVE_VIEWER_PERMISSION'; end if;
end $$;
insert into auth.users(id,email) values ('10000000-0000-4000-8000-000000000005','new-viewer@example.invalid');
do $$ declare v jsonb; begin
  v := app_private.finalize_staff_profile_impl('10000000-0000-4000-8000-000000000005','new-viewer@example.invalid','New viewer','WAREHOUSE_VIEWER','10000000-0000-4000-8000-000000000001',gen_random_uuid());
  if v ->> 'ok' <> 'true' then raise exception 'CREATE_VIEWER_ROLE_DENIED: %',v; end if;
  if not exists(select from api.profiles where id='10000000-0000-4000-8000-000000000005' and role_template='WAREHOUSE_VIEWER' and must_change_password) then raise exception 'CREATE_VIEWER_PASSWORD_GATE_MISSING'; end if;
  if app_private.effective_permission_for_user('10000000-0000-4000-8000-000000000005','inventory.read') then raise exception 'VIEWER_BYPASSED_PASSWORD_GATE'; end if;
end $$;
rollback;
