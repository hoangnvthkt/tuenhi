-- Synthetic fixtures are allowed only in the isolated schema-only test database.
-- Never run this file against Cloud, even inside a rolled-back transaction.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if current_database() <> 'feedback_print' then
    raise exception 'ISOLATED_DATABASE_REQUIRED';
  end if;
  if to_regprocedure('api.get_sale_draft_print(uuid)') is null then
    raise exception 'Provisional print RPC missing';
  end if;
end $$;

insert into auth.users(id, email) values
 ('10000000-0000-4000-8000-000000000001', 'owner@example.invalid'),
 ('10000000-0000-4000-8000-000000000002', 'own@example.invalid'),
 ('10000000-0000-4000-8000-000000000003', 'other@example.invalid');
insert into api.profiles(id,email,display_name,role_template,must_change_password) values
 ('10000000-0000-4000-8000-000000000001', 'owner@example.invalid', 'Chủ cửa hàng', 'OWNER', false),
 ('10000000-0000-4000-8000-000000000002', 'own@example.invalid', 'Nguyễn Thị Ánh', 'BUSINESS', false),
 ('10000000-0000-4000-8000-000000000003', 'other@example.invalid', 'Nhân viên khác', 'BUSINESS', false);
insert into api.store_settings(id, display_name, address, invoice_footer) values (1,'Tuệ Nhi','Hà Nội','Cảm ơn quý khách');
insert into api.sales_channels(id,code,name,name_normalized) values
 ('20000000-0000-4000-8000-000000000001','IN_STORE','Tại quầy','tai quay');
insert into api.products(id,sku,sku_normalized,name,name_normalized,unit_name,created_by,updated_by) values
 ('30000000-0000-4000-8000-000000000001','SUA','sua','Sữa hộp','sua hop','Hộp','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
insert into api.inventory_balances(product_id,on_hand_qty) values ('30000000-0000-4000-8000-000000000001',0);
insert into app_private.product_sale_prices(product_id,sale_price,changed_by) values
 ('30000000-0000-4000-8000-000000000001',50000,'10000000-0000-4000-8000-000000000001');

create temporary table print_test_state (sale_id uuid, before_state jsonb);
do $$
declare v_saved jsonb;
begin
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
  v_saved := api.save_sale_draft(null,null,null,'20000000-0000-4000-8000-000000000001',
    '[{"productId":"30000000-0000-4000-8000-000000000001","quantity":"2","lineDiscountAmount":"0","lineOrder":0}]'::jsonb,
    '0','Giao buổi chiều',gen_random_uuid());
  if v_saved ->> 'ok' <> 'true' then raise exception 'Zero stock draft save failed: %',v_saved; end if;
  insert into print_test_state(sale_id) values ((v_saved #>> '{data,sale,id}')::uuid);
end $$;
update print_test_state set before_state = jsonb_build_object(
 'sale',(select to_jsonb(s) from api.sales s where s.id = sale_id),
 'stock',(select jsonb_agg(to_jsonb(b)) from api.inventory_balances b),
 'payments',(select count(*) from api.payments),
 'movements',(select count(*) from api.stock_movements),
 'events',(select count(*) from app_private.sales_financial_events),
 'invoiceSnapshots',(select count(*) from app_private.sale_invoice_store_snapshots),
 'sequence',(select jsonb_agg(to_jsonb(s)) from app_private.document_sequences s));

grant select on print_test_state to authenticated;
set local role authenticated;
do $$
declare v_id uuid := (select sale_id from print_test_state); v_result jsonb;
begin
  v_result := api.get_sale_draft_print(v_id);
  if v_result ->> 'ok' is distinct from 'true' or v_result #>> '{data,kind}' is distinct from 'PROVISIONAL'
    or v_result #>> '{data,draft,status}' <> 'DRAFT'
    or (v_result #>> '{data,totals,netTotal}')::numeric <> 100000
    or v_result #>> '{data,lines,0,productName}' <> 'Sữa hộp'
    or v_result #>> '{data,store,displayName}' <> 'Tuệ Nhi'
    or v_result #>> '{data,draft,staffName}' <> 'Nguyễn Thị Ánh'
    or v_result::text ~ '"(capturedAmount|paymentMethod|saleNumber|cogs|unitCost)"'
  then raise exception 'Wrong provisional DTO: %', v_result; end if;
  if api.get_sale_invoice(v_id) #>> '{error,code}' is distinct from 'PERMISSION_DENIED' then
    raise exception 'Official invoice must still reject DRAFT'; end if;
  if api.get_store_settings() #>> '{error,code}' is distinct from 'PERMISSION_DENIED' then
    raise exception 'Employee must not gain general store settings access'; end if;
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
  if api.get_sale_draft_print(v_id) #>> '{error,code}' is distinct from 'PERMISSION_DENIED' then
    raise exception 'OWN scope leaked another actor draft'; end if;
  perform set_config('request.jwt.claim.sub', '', true);
  if api.get_sale_draft_print(v_id) #>> '{error,code}' is distinct from 'PERMISSION_DENIED' then
    raise exception 'Unauthenticated draft leaked'; end if;
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
  if api.get_sale_draft_print(v_id) ->> 'ok' <> 'true' then
    raise exception 'ALL scope cannot print existing draft'; end if;
  if api.get_sale_draft_print(gen_random_uuid()) #>> '{error,code}' is distinct from 'PERMISSION_DENIED' then
    raise exception 'Missing draft must fail closed'; end if;
end $$;

reset role;
do $$
begin
  if (select before_state from print_test_state) is distinct from jsonb_build_object(
    'sale',(select to_jsonb(s) from api.sales s where s.id = (select sale_id from print_test_state)),
    'stock',(select jsonb_agg(to_jsonb(b)) from api.inventory_balances b),
    'payments',(select count(*) from api.payments),
    'movements',(select count(*) from api.stock_movements),
    'events',(select count(*) from app_private.sales_financial_events),
    'invoiceSnapshots',(select count(*) from app_private.sale_invoice_store_snapshots),
    'sequence',(select jsonb_agg(to_jsonb(s)) from app_private.document_sequences s))
  then raise exception 'Print changed document or financial state'; end if;
end $$;

-- Revoked read permission denies even the creator's own draft.
insert into app_private.user_permission_overrides(user_id,permission_code,effect,changed_by,reason)
values ('10000000-0000-4000-8000-000000000002','sale.own.read','REVOKE','10000000-0000-4000-8000-000000000001','Isolated NONE scope assertion');
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
  if api.get_sale_draft_print((select sale_id from print_test_state)) #>> '{error,code}' is distinct from 'PERMISSION_DENIED' then
    raise exception 'NONE scope leaked own draft'; end if;
  perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
end $$;
reset role;

-- A completed document must never be represented as unpaid.
update api.sales set status='COMPLETED', sale_number='HD000001',completed_at=now()
where id = (select sale_id from print_test_state);
do $$ begin
  if api.get_sale_draft_print((select sale_id from print_test_state)) #>> '{error,code}' is distinct from 'PERMISSION_DENIED' then
    raise exception 'Completed invoice accepted as unpaid draft'; end if;
end $$;
rollback;
