begin read only;
do $$
declare exposed regprocedure:='api.get_staff_reactivation_recovery(uuid,uuid)'::regprocedure; implementation regprocedure:='app_private.get_staff_reactivation_recovery_impl(uuid,uuid)'::regprocedure;
begin
 if (select prosecdef from pg_proc where oid=exposed) or not (select prosecdef from pg_proc where oid=implementation) then raise exception 'STAFF_RECOVERY_SECURITY_BOUNDARY'; end if;
 if has_function_privilege('anon',exposed,'execute') or has_function_privilege('anon',implementation,'execute') then raise exception 'ANON_STAFF_RECOVERY_ACCESS'; end if;
 if not has_function_privilege('authenticated',exposed,'execute') or not has_function_privilege('authenticated',implementation,'execute') then raise exception 'STAFF_RECOVERY_GRANT_MISSING'; end if;
end $$;
rollback;
