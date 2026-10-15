-- Read-only release verification; never creates test or financial rows.
begin read only;
do $$
declare function_id oid;
begin
 foreach function_id in array array[
  'app_private.refresh_customer_debt_reminders(uuid,uuid)'::regprocedure::oid,
  'app_private.refresh_my_customer_debt_reminders()'::regprocedure::oid,
  'app_private.customer_debt_reminders_after_entry()'::regprocedure::oid
 ] loop
  if not exists(select 1 from pg_proc where oid=function_id and prosecdef and proconfig @> array['search_path=""']) then raise exception 'DEBT_REMINDER_SECURITY_INVALID'; end if;
  if has_function_privilege('anon',function_id,'EXECUTE') or has_function_privilege('authenticated',function_id,'EXECUTE') or has_function_privilege('service_role',function_id,'EXECUTE') then raise exception 'DEBT_REMINDER_HELPER_EXPOSED'; end if;
 end loop;
 if not exists(select 1 from pg_trigger where tgrelid='app_private.customer_debt_entries'::regclass and tgname='customer_debt_reminders_after_entry' and tgdeferrable and tginitdeferred and tgenabled='O') then raise exception 'DEBT_REMINDER_COMMIT_TRIGGER_MISSING'; end if;
 if not exists(select 1 from pg_policy where polrelid='api.user_notifications'::regclass and polname='user_notifications_customer_debt_permission' and not polpermissive) then raise exception 'DEBT_REMINDER_PERMISSION_POLICY_MISSING'; end if;
 if not exists(select 1 from pg_index where indexrelid='api.user_notifications_customer_debt_idx'::regclass and indisunique and indisvalid) then raise exception 'DEBT_REMINDER_DEDUPLICATION_MISSING'; end if;
 if exists(select 1 from pg_proc where oid in ('app_private.get_my_notifications_impl(boolean,timestamptz,uuid,integer)'::regprocedure,'api.get_my_notifications(boolean,timestamptz,uuid,integer)'::regprocedure) and provolatile<>'v') then raise exception 'DEBT_REMINDER_FEED_MUST_BE_VOLATILE'; end if;
 if position('perform app_private.refresh_my_customer_debt_reminders();' in pg_get_functiondef('app_private.get_my_notifications_impl(boolean,timestamptz,uuid,integer)'::regprocedure))=0 then raise exception 'DEBT_REMINDER_FEED_REFRESH_MISSING'; end if;
end $$;
rollback;
