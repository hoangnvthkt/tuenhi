-- In-app debt warnings are reconciled on feed reads and after debt commands.
-- No scheduler or external messaging service is required.
begin;

-- Read state must not permit duplicate warnings for the same customer.
create unique index user_notifications_customer_debt_idx
 on api.user_notifications(user_id,entity_id) where entity_type='customer_debt';

create function app_private.refresh_customer_debt_reminders(p_customer_id uuid,p_user_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare
 v_account app_private.customer_debt_accounts%rowtype;
 v_customer api.customers%rowtype;
 v_overdue numeric(20,2);
 v_oldest timestamptz;
 v_day text:=(now() at time zone interval '+07:00')::date::text;
begin
 -- Match all financial debt writers' lock order, including a concurrent feed read.
 perform pg_advisory_xact_lock(hashtextextended('customer.debt:'||p_customer_id::text,0));
 select * into v_account from app_private.customer_debt_accounts where customer_id=p_customer_id;
 select * into v_customer from api.customers where id=p_customer_id;
 if coalesce(v_account.balance,0)>0 then
  -- Collections consume oldest invoice debt before manual debt. Manual reductions
  -- consume oldest positive adjustments first; select the surviving tail of those
  -- increases instead of aging the entire balance from account.updated_at.
  with manual_increases as (
   select delta,occurred_at,
    sum(delta) over(order by occurred_at desc,id desc rows unbounded preceding) as newer_total
   from app_private.customer_debt_entries
   where customer_id=p_customer_id and kind='ADJUSTMENT' and delta>0
  ), open_lots as (
   select outstanding_amount as remaining,created_at as since
   from app_private.sale_payment_allocations
   where customer_id=p_customer_id and outstanding_amount>0
   union all
   select least(delta,greatest(v_account.unallocated_balance-(newer_total-delta),0)),occurred_at
   from manual_increases
  )
  select coalesce(sum(remaining),0),min(since) into v_overdue,v_oldest
  from open_lots where remaining>0 and since<=now()-interval '7 days';
 end if;

 -- Remove resolved warnings, including already-read rows, and revoked recipients.
 delete from api.user_notifications n
 where n.entity_type='customer_debt' and n.entity_id=p_customer_id
  and (p_user_id is null or n.user_id=p_user_id)
  and (coalesce(v_overdue,0)<=0 or not app_private.effective_permission_for_user(n.user_id,'customer.debt.read'));
 if coalesce(v_overdue,0)<=0 then return; end if;

 insert into api.user_notifications(user_id,severity,category,title,message,action_route,
  entity_type,entity_id,dedupe_key,metadata)
 select profile.id,'WARNING','Công nợ','Khách còn nợ từ 7 ngày',
  left(v_customer.name,300)||' ('||left(coalesce(nullif(btrim(v_customer.code),''),'Không có mã'),100)||'): còn nợ '||v_account.balance::text||
   ' đ, trong đó '||v_overdue::text||' đ đã từ 7 ngày. Mở công nợ để thu tiền.',
  '/customers/'||p_customer_id::text,'customer_debt',p_customer_id,
  'customer.debt.overdue:'||p_customer_id::text,
  jsonb_build_object('balance',v_account.balance::text,'overdueAmount',v_overdue::text,
   'oldestOutstandingAt',v_oldest,'reminderDate',v_day)
 from api.profiles profile
 where (p_user_id is null or profile.id=p_user_id)
  and app_private.effective_permission_for_user(profile.id,'customer.debt.read')
 on conflict(user_id,entity_id) where entity_type='customer_debt' do update
 set message=excluded.message,metadata=excluded.metadata,
  -- Acknowledging today's warning suppresses it until the next local day.
  read_at=case when api.user_notifications.metadata->>'reminderDate' is distinct from v_day
   then null else api.user_notifications.read_at end,
  created_at=case when api.user_notifications.metadata->>'reminderDate' is distinct from v_day
   then now() else api.user_notifications.created_at end,
  expires_at=now()+interval '365 days'
 where api.user_notifications.message is distinct from excluded.message
  or api.user_notifications.metadata is distinct from excluded.metadata
  or api.user_notifications.expires_at<=now();
end $$;
revoke all on function app_private.refresh_customer_debt_reminders(uuid,uuid) from public,anon,authenticated,service_role;

create function app_private.refresh_my_customer_debt_reminders()
returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid()); v_customer uuid;
begin
 if v_actor is null or not app_private.has_active_profile(false) then return; end if;
 if not app_private.has_permission('customer.debt.read') then
  delete from api.user_notifications where user_id=v_actor and entity_type='customer_debt';
  return;
 end if;
 for v_customer in
  select customer_id from app_private.customer_debt_accounts where balance>0
  union select entity_id from api.user_notifications where user_id=v_actor and entity_type='customer_debt'
  order by 1
 loop
  perform app_private.refresh_customer_debt_reminders(v_customer,v_actor);
 end loop;
end $$;
revoke all on function app_private.refresh_my_customer_debt_reminders() from public,anon,authenticated,service_role;

create function app_private.customer_debt_reminders_after_entry()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform app_private.refresh_customer_debt_reminders(new.customer_id);
 return new;
end $$;
revoke all on function app_private.customer_debt_reminders_after_entry() from public,anon,authenticated,service_role;
-- Debt commands update account, ledger and invoice allocations in different
-- statement orders. Reconcile only their final transaction state.
create constraint trigger customer_debt_reminders_after_entry
 after insert on app_private.customer_debt_entries
 deferrable initially deferred for each row
 execute function app_private.customer_debt_reminders_after_entry();

-- Direct table/Realtime reads must also obey current debt permissions.
create policy user_notifications_customer_debt_permission
 on api.user_notifications as restrictive for select to authenticated
 using (entity_type is distinct from 'customer_debt' or app_private.has_permission('customer.debt.read'));

-- Keep the existing feed DTO, exact paging and authorization validation intact.
-- Refresh immediately before its first query, after authentication/cursor checks.
do $$
declare definition text; anchor text:='  select count(*)::integer';
begin
 definition:=pg_get_functiondef('app_private.get_my_notifications_impl(boolean,timestamptz,uuid,integer)'::regprocedure);
 if position(anchor in definition)=0 or position('refresh_my_customer_debt_reminders' in definition)>0 then
  raise exception 'NOTIFICATION_FEED_CONTRACT_CHANGED';
 end if;
 definition:=replace(definition,anchor,'  perform app_private.refresh_my_customer_debt_reminders();'||chr(10)||chr(10)||anchor);
 execute definition;
end $$;
alter function app_private.get_my_notifications_impl(boolean,timestamptz,uuid,integer) volatile;
alter function api.get_my_notifications(boolean,timestamptz,uuid,integer) volatile;
commit;
