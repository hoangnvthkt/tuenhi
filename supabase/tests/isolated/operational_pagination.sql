\set ON_ERROR_STOP on
begin;
do $$ begin if current_database()<>'audit_remediation' or inet_server_addr() is not null then raise exception 'ISOLATED_DATABASE_REQUIRED'; end if; end $$;
insert into app_private.permission_definitions(code,category,label,description)
select p,'audit',p,'Local pagination fixture' from unnest(array['sale.own.read','sale.all.read','return.request.create','return.complete','inventory.count.draft','inventory.adjustment.post','purchase.operational.read','purchase.draft.manage','purchase.cost.read']) p;
insert into auth.users(id,email) select ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'audit'||n||'@example.invalid' from generate_series(1,3)n;
insert into api.profiles(id,email,display_name,role_template,must_change_password) select id,email,email,case when email='audit1@example.invalid' then 'OWNER' else 'BUSINESS' end,false from auth.users;
insert into app_private.user_permission_overrides(user_id,permission_code,effect,changed_by,reason)
select '10000000-0000-4000-8000-000000000002',p,'GRANT','10000000-0000-4000-8000-000000000001','Local fixture' from unnest(array['sale.own.read','return.request.create','inventory.count.draft']) p;
insert into api.sales_channels(id,code,name,name_normalized) values('20000000-0000-4000-8000-000000000001','IN_STORE','Local','local');
insert into api.sales(id,sales_channel_id,created_by,updated_at)
select ('30000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'20000000-0000-4000-8000-000000000001',case when n=52 then '10000000-0000-4000-8000-000000000002'::uuid else '10000000-0000-4000-8000-000000000001'::uuid end,'2026-10-01T00:00:00Z' from generate_series(1,52)n;
insert into api.sale_returns(original_sale_id,status,reason,created_by,updated_at)
select id,'DRAFT','Local',created_by,updated_at from api.sales;
insert into api.stock_counts(count_type,created_by,updated_at)
select kind,case when n=102 then '10000000-0000-4000-8000-000000000002'::uuid else '10000000-0000-4000-8000-000000000001'::uuid end,'2026-10-01T00:00:00Z' from unnest(array['OPENING','PERIODIC'])kind cross join generate_series(1,102)n;
insert into api.purchase_receipts(status,received_at,created_by,cancelled_at,cancelled_by,cancel_reason,updated_at)
select case when n<=50 then 'CANCELLED' else 'DRAFT' end,now(),'10000000-0000-4000-8000-000000000001',case when n<=50 then now() end,case when n<=50 then '10000000-0000-4000-8000-000000000001'::uuid end,case when n<=50 then 'Local' end,case when n<=50 then '2026-10-02T00:00:00Z'::timestamptz else '2026-10-01T00:00:00Z'::timestamptz end from generate_series(1,101)n;
insert into api.import_runs(actor_id,target_type,template_version,file_name,file_sha256,mode,idempotency_key,created_at)
select '10000000-0000-4000-8000-000000000001','PRODUCTS',1,'local.xlsx',repeat('a',64),'CREATE_ONLY',gen_random_uuid(),'2026-10-01T00:00:00Z' from generate_series(1,31);
insert into api.user_notifications(user_id,severity,category,title,message,created_at,read_at)
select '10000000-0000-4000-8000-000000000001','INFO','audit','Local','Local', '2026-10-01T00:00:00Z',case when n=51 then now() end from generate_series(1,51)n;
create function pg_temp.assert_pages(fn text, expected integer, page_limit integer, filters jsonb default '{}', unread boolean default false) returns void language plpgsql as $$
declare result jsonb; cursor jsonb; ids text[]:='{}'; id text; pages integer:=0; field text; at_time timestamptz; cursor_id uuid;
begin
 field:=case when fn='list_sales_v2' then 'sortAt' when fn in ('list_import_runs','get_my_notifications') then 'createdAt' else 'updatedAt' end;
 loop
  at_time:=(cursor->>field)::timestamptz;cursor_id:=(cursor->>'id')::uuid;
  if fn='list_opening_stock_documents' then execute format('select api.%I($1,$2,$3)',fn) into result using at_time,cursor_id,page_limit;
  elsif fn='list_import_runs' then execute format('select api.%I($1,$2,$3,$4,$5)',fn) into result using null::text,null::text,at_time,cursor_id,page_limit;
  elsif fn='get_my_notifications' then execute format('select api.%I($1,$2,$3,$4)',fn) into result using unread,at_time,cursor_id,page_limit;
  else execute format('select api.%I($1,$2,$3,$4)',fn) into result using filters,at_time,cursor_id,page_limit;
  end if;
  if result->>'ok' is distinct from 'true' then raise exception '% failed: %',fn,result; end if;
  for id in select coalesce(value->>'id',value->>'importRunId') from jsonb_array_elements(result#>'{data,items}') loop
   if id=any(ids) then raise exception '% duplicate %',fn,id; end if;
   ids:=array_append(ids,id);
  end loop;
  pages:=pages+1;
  cursor:=result#>'{data,nextCursor}';
  if cursor='null'::jsonb then exit; end if;
  if cardinality(ids)>=expected then raise exception '% has spurious last cursor at % rows',fn,cardinality(ids); end if;
  if pages>10 then raise exception '% cursor did not terminate',fn; end if;
 end loop;
 if cardinality(ids)<>expected then raise exception '% expected %, got %',fn,expected,cardinality(ids); end if;
 raise notice 'PASS %: % rows in % pages',fn,expected,pages;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_pages('list_sales_v2',52,50);
select pg_temp.assert_pages('list_sale_returns_v2',52,50);
select pg_temp.assert_pages('list_stock_counts_v2',102,100);
select pg_temp.assert_pages('list_opening_stock_documents',102,100);
select pg_temp.assert_pages('list_purchase_receipts',101,100);
select pg_temp.assert_pages('list_purchase_receipts',50,50,'{"status":"CANCELLED"}');
select pg_temp.assert_pages('list_import_runs',31,30);
select pg_temp.assert_pages('get_my_notifications',51,50);
select pg_temp.assert_pages('get_my_notifications',50,50,'{}',true);
do $$ begin
 if api.list_sales('{}',null,null,50)#>'{data,nextCursor}' <> 'null'::jsonb or api.list_sale_returns('{}',null,null,50)#>'{data,nextCursor}' <> 'null'::jsonb or api.list_stock_counts('{}',null,null,100)#>'{data,nextCursor}' <> 'null'::jsonb then raise exception 'Old parser compatibility changed'; end if;
 if api.list_sales_v2('{}',now(),null,50)#>>'{error,code}' is distinct from 'VALIDATION_FAILED' then raise exception 'Partial cursor accepted'; end if;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_pages('list_sales_v2',1,50);
select pg_temp.assert_pages('list_sale_returns_v2',1,50);
select pg_temp.assert_pages('list_stock_counts_v2',1,100);
select pg_temp.assert_pages('list_import_runs',0,30);
select pg_temp.assert_pages('get_my_notifications',0,50);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
do $$ declare fn text;result jsonb; begin
 foreach fn in array array['list_sales_v2','list_sale_returns_v2','list_stock_counts_v2'] loop
 execute format('select api.%I($1,$2,$3,$4)',fn) into result using '{}'::jsonb,null::timestamptz,null::uuid,50;
 if result#>>'{error,code}' is distinct from 'PERMISSION_DENIED' then raise exception '% scope NONE leak',fn; end if;
 end loop;
end $$;
-- Inspect a tied-timestamp page using the existing creator/sort index at small-shop scale.
explain (analyze,buffers) select id from api.sales where created_by='10000000-0000-4000-8000-000000000001' and (coalesce(completed_at,updated_at),id)<('2026-10-01T00:00:00Z','ffffffff-ffff-ffff-ffff-ffffffffffff') order by coalesce(completed_at,updated_at) desc,id desc limit 51;
rollback;
