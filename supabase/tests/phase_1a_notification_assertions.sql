begin;

do $$
begin
  if to_regclass('api.user_notifications') is null then
    raise exception 'api.user_notifications missing';
  end if;

  if not exists (
    select 1
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'api'
      and c.relname = 'user_notifications'
      and c.relrowsecurity
      and c.relforcerowsecurity
  ) then
    raise exception 'user_notifications RLS not enabled and forced';
  end if;

  if to_regclass('api.user_notifications_feed_idx') is null then
    raise exception 'notification feed index missing';
  end if;

  if to_regclass('api.user_notifications_unread_dedupe_idx') is null then
    raise exception 'notification unread dedupe index missing';
  end if;

  if to_regprocedure(
    'api.get_my_notifications(boolean,timestamp with time zone,uuid,integer)'
  ) is null then
    raise exception 'get_my_notifications missing';
  end if;

  if to_regprocedure('api.mark_notification_read(uuid)') is null then
    raise exception 'mark_notification_read missing';
  end if;

  if to_regprocedure('api.mark_all_notifications_read()') is null then
    raise exception 'mark_all_notifications_read missing';
  end if;

  if position(
    'api.user_notifications'
    in pg_get_functiondef(
      'app_private.complete_initial_password_change_impl(uuid)'::regprocedure
    )
  ) = 0 then
    raise exception 'initial password notification missing';
  end if;

  if has_table_privilege('anon', 'api.user_notifications', 'select') then
    raise exception 'anon must not read notifications';
  end if;

  if not has_table_privilege(
    'authenticated',
    'api.user_notifications',
    'select'
  ) then
    raise exception 'authenticated cannot read own notifications';
  end if;

  if has_table_privilege(
    'authenticated',
    'api.user_notifications',
    'insert,update,delete'
  ) then
    raise exception 'authenticated must not write notifications directly';
  end if;
end
$$;

rollback;
