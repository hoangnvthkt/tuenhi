-- Only for the disposable schema-only PostgreSQL fixture, never Cloud.
do $$ begin
  if current_database() <> 'feedback_alerts' then
    raise exception 'ISOLATED_TEST_DATABASE_REQUIRED';
  end if;
end $$;
begin;
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000001');
insert into api.profiles(id,email,display_name,role_template,is_active,must_change_password)
values ('10000000-0000-4000-8000-000000000001','fixture-owner@example.invalid','Fixture owner','OWNER',true,false);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
insert into api.purchase_receipts(id,status,received_at,created_by,submitted_by,submitted_at)
values ('10000000-0000-4000-8000-000000000002','AWAITING_COST',now(),
 '10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','2026-10-02 08:16:00+00');
insert into api.purchase_receipts(id,status,received_at,created_by)
values ('10000000-0000-4000-8000-000000000003','DRAFT',now(),'10000000-0000-4000-8000-000000000001');
do $$
declare result jsonb; replay jsonb; before_moves bigint;
begin
  select count(*) into before_moves from api.stock_movements;
  result := api.cancel_purchase_receipt('10000000-0000-4000-8000-000000000002',1,'Nhập nhầm',
    '10000000-0000-4000-8000-000000000004');
  if not (result->>'ok')::boolean then raise exception 'Cancel awaiting cost failed: %',result; end if;
  if not exists (select 1 from api.purchase_receipts where id='10000000-0000-4000-8000-000000000002'
    and status='CANCELLED' and submitted_at='2026-10-02 08:16:00+00' and cancelled_at is not null)
  then raise exception 'Cancellation must retain submitted provenance'; end if;
  replay := api.cancel_purchase_receipt('10000000-0000-4000-8000-000000000002',1,'Nhập nhầm',
    '10000000-0000-4000-8000-000000000004');
  if replay is distinct from result then raise exception 'Cancel replay is not idempotent'; end if;
  result := api.cancel_purchase_receipt('10000000-0000-4000-8000-000000000003',1,'Nhập nhầm',
    '10000000-0000-4000-8000-000000000005');
  if not (result->>'ok')::boolean then raise exception 'Cancel draft failed: %',result; end if;
  if (select count(*) from api.stock_movements) <> before_moves then raise exception 'Cancel moved stock'; end if;
  if (select count(*) from app_private.audit_events where action='purchase_receipt.cancelled') <> 2
  then raise exception 'Expected one audit event per cancellation'; end if;
end $$;
rollback;
