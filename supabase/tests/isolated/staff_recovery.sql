\set ON_ERROR_STOP on
begin;
do $$ begin if current_database()<>'audit_remediation' or inet_server_addr() is not null then raise exception 'ISOLATED_DATABASE_REQUIRED'; end if; end $$;
insert into app_private.permission_definitions(code,category,label,description,owner_only) values('staff.manage','audit','Staff','Local fixture',true);
insert into auth.users(id,email) select ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'staff-audit'||n||'@example.invalid' from generate_series(1,3)n;
insert into api.profiles(id,email,display_name,role_template,must_change_password) select id,email,email,case when email='staff-audit1@example.invalid' then 'OWNER' else 'BUSINESS' end,false from auth.users;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$
declare target uuid:='10000000-0000-4000-8000-000000000002'; op uuid:=gen_random_uuid(); result jsonb; before_count integer;
begin
 result:=api.set_staff_active('10000000-0000-4000-8000-000000000001',false,'last owner',gen_random_uuid());
 if result#>>'{error,code}' is distinct from 'LAST_ACTIVE_OWNER' then raise exception 'Last Owner guard changed'; end if;
 result:=api.get_staff_reactivation_recovery(target,op);
 if result#>>'{error,code}' is distinct from 'STAFF_OPERATION_UNKNOWN' then raise exception 'Unknown command not blocked'; end if;
 result:=api.set_staff_active(target,false,'local lock',gen_random_uuid());
 result:=api.set_staff_active(target,true,'local reopen',op);
 if result->>'ok' is distinct from 'true' then raise exception 'Seed reopen failed: %',result; end if;
 select count(*) into before_count from app_private.audit_events;
 result:=api.get_staff_reactivation_recovery(target,op);
 if result#>>'{data,isActive}' is distinct from 'true' then raise exception 'Recovery failed: %',result; end if;
 perform api.set_staff_active(target,true,'local reopen',op);
 if (select count(*) from app_private.audit_events)<>before_count then raise exception 'Replay duplicated audit'; end if;
 result:=api.get_staff_reactivation_recovery('10000000-0000-4000-8000-000000000003',op);
 if result#>>'{error,code}' is distinct from 'STAFF_RECOVERY_STALE' then raise exception 'Target swap allowed'; end if;
 update app_private.command_deduplication set created_at=now()-interval '1 second' where idempotency_key=op;
 result:=api.get_staff_reactivation_recovery(target,op);
 if result#>>'{error,code}' is distinct from 'STAFF_RECOVERY_STALE' then raise exception 'Superseded operation allowed'; end if;
 perform set_config('request.jwt.claim.sub',target::text,true);
 result:=api.get_staff_reactivation_recovery(target,op);
 if result#>>'{error,code}' is distinct from 'PERMISSION_DENIED' then raise exception 'Non-owner access'; end if;
 perform set_config('request.jwt.claim.sub','',true);
 result:=api.get_staff_reactivation_recovery(target,op);
 if result#>>'{error,code}' is distinct from 'PERMISSION_DENIED' then raise exception 'Anonymous access'; end if;
end $$;
rollback;
