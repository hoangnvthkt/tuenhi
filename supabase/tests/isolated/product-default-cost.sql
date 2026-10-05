-- Synthetic data only in a disposable local database; never run on Cloud.
\set ON_ERROR_STOP on
begin;
do $$ begin if current_database() <> 'default_cost_test' then raise exception 'ISOLATED_DATABASE_REQUIRED'; end if; end $$;
insert into app_private.permission_definitions(code,category,label,description,owner_only) values
 ('catalog.read','test','read','test',false),('catalog.basic.manage','test','manage','test',false),
 ('inventory.read','test','inventory','test',false),('pricing.sale.read','test','price','test',false),
 ('purchase.cost.read','test','cost','test',true),('purchase.cost.enter','test','enter','test',false),
 ('sale.draft.manage','test','sale','test',false),('sale.discount.apply','test','discount','test',false),('sale.all.read','test','sales','test',false)
on conflict(code) do nothing;
insert into app_private.role_default_permissions(role_template,permission_code,allowed)
select 'SALES_WAREHOUSE',code,true from app_private.permission_definitions where code in ('catalog.read','catalog.basic.manage','inventory.read','purchase.cost.enter','sale.draft.manage') on conflict do nothing;
insert into app_private.role_default_permissions(role_template,permission_code,allowed) values ('WAREHOUSE_VIEWER','catalog.read',true),('WAREHOUSE_VIEWER','inventory.read',true) on conflict do nothing;
insert into auth.users(id,email) values ('95000000-0000-4000-8000-000000000001','owner@cost.invalid'),('95000000-0000-4000-8000-000000000002','staff@cost.invalid'),('95000000-0000-4000-8000-000000000003','viewer@cost.invalid');
insert into api.profiles(id,email,display_name,role_template,is_active,must_change_password) values
 ('95000000-0000-4000-8000-000000000001','owner@cost.invalid','Owner','OWNER',true,false),
 ('95000000-0000-4000-8000-000000000002','staff@cost.invalid','Staff','SALES_WAREHOUSE',true,false),
 ('95000000-0000-4000-8000-000000000003','viewer@cost.invalid','Viewer','WAREHOUSE_VIEWER',true,false);
select set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000001',true);
-- Restore the API schema grants omitted by the local schema-only dump.
grant usage on schema api,app_private to authenticated;
set local role authenticated;
do $$ declare r jsonb; replay jsonb; p uuid; k uuid:=gen_random_uuid(); input jsonb; version bigint; bad text; begin
 input:='{"sku":"COST-TEST","name":"Cost test","unitName":"Hộp","minStockQty":"0","defaultCost":"30000.50"}';
 r:=api.save_product(null,null,input,k);
 if r->>'ok' <> 'true' then raise exception 'DEFAULT_COST_CREATE_FAILED: %',r; end if;
 p:=(r#>>'{data,productId}')::uuid;
 replay:=api.save_product(null,null,input,k);
 if replay<>r then raise exception 'DEFAULT_COST_RETRY_DUPLICATED'; end if;
 r:=api.get_product_detail(p);
 if (r#>>'{data,defaultCost}')::numeric is distinct from 30000.50 then raise exception 'OWNER_COST_ROUNDTRIP_FAILED: %',r; end if;
 r:=api.get_product_catalog(p_search=>'COST-TEST');
 if (r#>>'{data,items,0,defaultCost}')::numeric is distinct from 30000.50 then raise exception 'OWNER_COST_CATALOG_FAILED'; end if;
 -- Old clients omit the new field and must preserve it.
 r:=api.save_product(p,1,input-'defaultCost',gen_random_uuid());
 if r->>'ok'<>'true' then raise exception 'LEGACY_EDIT_FAILED: %',r; end if;
 r:=api.get_product_detail(p);
 if (r#>>'{data,defaultCost}')::numeric is distinct from 30000.50 then raise exception 'LEGACY_EDIT_CLEARED_COST'; end if;
 foreach bad in array array['0','-1','1.234','NaN','10000000000000000'] loop
   r:=api.save_product(null,null,jsonb_set(input,'{sku}',to_jsonb('BAD-'||bad))||jsonb_build_object('defaultCost',bad),gen_random_uuid());
   if r#>>'{error,code}' is distinct from 'VALIDATION_FAILED' then raise exception 'INVALID_COST_ACCEPTED: % %',bad,r; end if;
 end loop;
 perform set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000002',true);
 r:=api.get_product_detail(p);
 if r->>'ok'<>'true' or r#>'{data,defaultCost}' is distinct from 'null'::jsonb then raise exception 'STAFF_COST_LEAK: %',r; end if;
 r:=api.get_product_catalog(p_search=>'COST-TEST');
 if r#>'{data,items,0,defaultCost}' is distinct from 'null'::jsonb then raise exception 'STAFF_CATALOG_COST_LEAK'; end if;
 r:=api.save_product(p,2,input,gen_random_uuid());
 if r#>>'{error,code}' is distinct from 'PERMISSION_DENIED' then raise exception 'STAFF_COST_WRITE_ALLOWED: %',r; end if;
 -- Product editors without financial permission may still change ordinary fields.
 r:=api.save_product(p,2,input-'defaultCost',gen_random_uuid());
 if r->>'ok'<>'true' then raise exception 'STAFF_BASIC_EDIT_FAILED: %',r; end if;
 perform set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000003',true);
 r:=api.get_product_detail(p);
 if r->>'ok'<>'true' or r#>'{data,defaultCost}' is distinct from 'null'::jsonb then raise exception 'VIEWER_COST_LEAK: %',r; end if;
 perform set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000001',true);
 r:=api.save_product(p,1,input||'{"defaultCost":"40000"}',gen_random_uuid());
 if r#>>'{error,code}' is distinct from 'VERSION_CONFLICT' then raise exception 'STALE_COST_EDIT_ACCEPTED'; end if;
 r:=api.save_product(p,3,input||'{"defaultCost":"40000"}',gen_random_uuid());
 if r->>'ok'<>'true' then raise exception 'COST_EDIT_FAILED: %',r; end if;
 r:=api.get_product_detail(p);
 if (r#>>'{data,defaultCost}')::numeric is distinct from 40000 then raise exception 'COST_EDIT_ROUNDTRIP'; end if;
 r:=api.save_product(p,4,input||'{"defaultCost":""}',gen_random_uuid());
 if r->>'ok'<>'true' then raise exception 'COST_CLEAR_FAILED'; end if;
 r:=api.get_product_detail(p);
 if r#>'{data,defaultCost}' is distinct from 'null'::jsonb then raise exception 'COST_CLEAR_ROUNDTRIP'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from api.products)<>1 then raise exception 'INVALID_OR_RETRY_CREATED_PRODUCT'; end if;
 if exists(select from api.inventory_balances where on_hand_qty<>0) or exists(select from app_private.inventory_cost_balances where inventory_value<>0 or avg_unit_cost<>0) or exists(select from api.stock_movements) then raise exception 'DEFAULT_COST_CHANGED_STOCK'; end if;
 if not exists(select from app_private.audit_events where action='product.default_cost.updated') then raise exception 'COST_AUDIT_MISSING'; end if;
 if has_table_privilege('authenticated','app_private.product_default_costs','select') or has_table_privilege('anon','app_private.product_default_costs','select') then raise exception 'COST_TABLE_EXPOSED'; end if;
 raise notice 'PASS default cost roundtrip, permissions, retries, validation, versions, no inventory mutation';
end $$;
-- Verify the reported discount against the actual SQL draft calculation.
insert into api.sales_channels(id,code,name,name_normalized) values('95000000-0000-4000-8000-000000000004','IN_STORE','Local test','local test');
insert into app_private.product_sale_prices(product_id,sale_price,changed_by)
select id,55000,'95000000-0000-4000-8000-000000000001' from api.products where sku='COST-TEST';
set local role authenticated;
do $$ declare r jsonb; p uuid; draft uuid; original jsonb; begin
 r:=api.get_product_catalog(p_search=>'COST-TEST'); p:=(r#>>'{data,items,0,id}')::uuid;
 r:=api.save_sale_draft(null,null,null,'95000000-0000-4000-8000-000000000004',jsonb_build_array(jsonb_build_object('productId',p,'quantity','1','lineDiscountAmount','1000','lineOrder',0)),'0','Local discount regression',gen_random_uuid());
 if (r#>>'{data,sale,netTotal}')::numeric is distinct from 54000 then raise exception 'LINE_DISCOUNT_1000_FAILED: %',r; end if;
 r:=api.save_sale_draft(null,null,null,'95000000-0000-4000-8000-000000000004',jsonb_build_array(jsonb_build_object('productId',p,'quantity','2','lineDiscountAmount','1000','lineOrder',0)),'500','Local combined discount regression',gen_random_uuid());
 if (r#>>'{data,sale,netTotal}')::numeric is distinct from 108500 then raise exception 'ROW_DISCOUNT_TOTAL_FAILED: %',r; end if;
 draft:=(r#>>'{data,sale,id}')::uuid; original:=r#>'{data,sale}';
 r:=api.save_sale_draft(null,null,null,'95000000-0000-4000-8000-000000000004',jsonb_build_array(jsonb_build_object('productId',p,'quantity','1','lineDiscountAmount','55001','lineOrder',0)),'0','Local invalid discount regression',gen_random_uuid());
 if r#>>'{error,code}' is distinct from 'LINE_DISCOUNT_EXCEEDED' then raise exception 'EXCESS_DISCOUNT_ALLOWED: %',r; end if;
 r:=api.save_sale_draft(draft,(original->>'version')::bigint,null,'95000000-0000-4000-8000-000000000004',jsonb_build_array(jsonb_build_object('productId',p,'quantity','1','lineDiscountAmount','1000','lineOrder',0)),'55000','Must not overwrite',gen_random_uuid());
 if r#>>'{error,code}' is distinct from 'ORDER_DISCOUNT_EXCEEDED' then raise exception 'EXCESS_ORDER_DISCOUNT_ALLOWED: %',r; end if;
 if app_private.sale_draft_json(draft) is distinct from original then raise exception 'REJECTED_DISCOUNT_MUTATED_DRAFT'; end if;
 perform set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000002',true);
 r:=api.save_sale_draft(null,null,null,'95000000-0000-4000-8000-000000000004',jsonb_build_array(jsonb_build_object('productId',p,'quantity','1','lineDiscountAmount','1000','lineOrder',0)),'0','Forbidden discount',gen_random_uuid());
 if r#>>'{error,code}' is distinct from 'PERMISSION_DENIED' then raise exception 'DISCOUNT_PERMISSION_BYPASS: %',r; end if;
 raise notice 'PASS exact reported discount and combined row/order totals; excess discount rejected';
end $$;
reset role;
do $$ begin if (select count(*) from api.sales)<>2 then raise exception 'REJECTED_DISCOUNT_CREATED_DRAFT'; end if; end $$;
rollback;
