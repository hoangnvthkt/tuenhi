-- Additive read-only reporting; existing sales, payments and debt rows are untouched.
begin;

-- Internal relational source shared by totals and keyset-paginated invoice rows.
-- It runs only in the permission-checked implementation's definer context.
create function app_private.sale_settlement_rows(p_from date,p_to date,p_actor uuid)
returns table(id uuid,sale_number text,completed_at timestamptz,customer_name text,status text,cash_amount numeric,bank_transfer_amount numeric,outstanding_amount numeric)
language sql stable security invoker set search_path='' as $$
 select s.id,s.sale_number,e.occurred_at,s.customer_name_snapshot,s.status,
  case when s.status='CANCELLED' then 0 else
   coalesce(a.cash_amount,p.cash_amount,0)-coalesce(r.cash_amount,0) end,
  case when s.status='CANCELLED' then 0 else
   coalesce(a.bank_transfer_amount,p.bank_amount,0)-coalesce(r.bank_amount,0) end,
  case when s.status='CANCELLED' then 0 else coalesce(a.outstanding_amount,0) end
 from app_private.sales_financial_events e
 join api.sales s on s.id=e.sale_id
 left join app_private.sale_payment_allocations a on a.sale_id=s.id
 left join lateral (
  select sum(payment.amount) filter(where payment.method='CASH') cash_amount,
   sum(payment.amount) filter(where payment.method='BANK_TRANSFER') bank_amount
  from api.payments payment where payment.sale_id=s.id and payment.status='CAPTURED'
 ) p on true
 left join lateral (
  select sum(payment.amount) filter(where payment.method='CASH') cash_amount,
   sum(payment.amount) filter(where payment.method='BANK_TRANSFER') bank_amount
  from api.sale_returns returned
  join api.sale_return_payments payment on payment.sale_return_id=returned.id and payment.status='REFUNDED'
  where returned.original_sale_id=s.id and returned.status='COMPLETED'
 ) r on true
 where e.event_type='SALE_COMPLETED'
  and e.occurred_at>=p_from::timestamp at time zone 'Asia/Ho_Chi_Minh'
  and e.occurred_at<(p_to+1)::timestamp at time zone 'Asia/Ho_Chi_Minh'
  and (p_actor is null or e.attributed_user_id=p_actor);
$$;
revoke all on function app_private.sale_settlement_rows(date,date,uuid) from public,anon,authenticated,service_role;

create function app_private.get_sale_settlement_report_impl(p_from date,p_to date,p_scope text,p_method text,p_cursor_completed_at timestamptz,p_cursor_id uuid,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid()); v_correlation uuid:=gen_random_uuid(); v_summary jsonb; v_items jsonb; v_next jsonb;
begin
 if v_actor is null then return app_private.command_error('PERMISSION_DENIED','Vui lòng đăng nhập để xem báo cáo.',v_correlation); end if;
 if p_scope is null or p_scope not in ('OWN','ALL')
  or (p_scope='OWN' and not app_private.has_permission('report.own_revenue.read'))
  or (p_scope='ALL' and not app_private.has_permission('report.all_revenue.read')) then
  return app_private.command_error('REPORT_SCOPE_DENIED','Bạn không có quyền xem phạm vi báo cáo này.',v_correlation);
 end if;
 if not app_private.report_period_is_valid(p_from,p_to) then
  return app_private.command_error('REPORT_DATE_RANGE_INVALID','Khoảng thời gian báo cáo chưa hợp lệ.',v_correlation);
 end if;
 if p_method is null or p_method not in ('ALL','CASH','BANK_TRANSFER','DEBT') or p_limit is null or p_limit not between 1 and 100
  or (p_cursor_completed_at is null)<>(p_cursor_id is null) then
  return app_private.command_error('VALIDATION_FAILED','Bộ lọc thanh toán chưa hợp lệ.',v_correlation);
 end if;
 -- Materialize once: totals are for the whole range, never limited to a page or method.
 with source as materialized (
  select * from app_private.sale_settlement_rows(p_from,p_to,case when p_scope='OWN' then v_actor else null end)
 ), page as (
  select source.*,row_number() over(order by completed_at desc,id desc) ordinal
  from source
  where (p_method='ALL' or (p_method='CASH' and cash_amount<>0)
   or (p_method='BANK_TRANSFER' and bank_transfer_amount<>0) or (p_method='DEBT' and outstanding_amount>0))
   and (p_cursor_completed_at is null or (completed_at,id)<(p_cursor_completed_at,p_cursor_id))
  order by completed_at desc,id desc limit p_limit+1
 )
 select
  (select jsonb_build_object('cashAmount',coalesce(sum(cash_amount),0)::text,'bankTransferAmount',coalesce(sum(bank_transfer_amount),0)::text,'outstandingAmount',coalesce(sum(outstanding_amount),0)::text) from source),
  coalesce((select jsonb_agg(jsonb_build_object('id',id,'saleNumber',sale_number,'completedAt',completed_at,'customerName',customer_name,'status',status,'cashAmount',cash_amount::text,'bankTransferAmount',bank_transfer_amount::text,'outstandingAmount',outstanding_amount::text) order by completed_at desc,id desc) from page where ordinal<=p_limit),'[]'::jsonb),
  case when (select count(*) from page)>p_limit then (select jsonb_build_object('completedAt',completed_at,'id',id) from page where ordinal=p_limit) else null end
 into v_summary,v_items,v_next;
 return app_private.command_success(jsonb_build_object('version',1,'range',jsonb_build_object('from',p_from,'to',p_to),'scope',p_scope,'summary',v_summary,'items',v_items,'nextCursor',v_next),v_correlation);
end $$;

create function api.get_sale_settlement_report(p_from date,p_to date,p_scope text default 'OWN',p_method text default 'ALL',p_cursor_completed_at timestamptz default null,p_cursor_id uuid default null,p_limit integer default 50)
returns jsonb language sql stable security invoker set search_path='' as $$
 select app_private.get_sale_settlement_report_impl(p_from,p_to,p_scope,p_method,p_cursor_completed_at,p_cursor_id,p_limit);
$$;
revoke all on function app_private.get_sale_settlement_report_impl(date,date,text,text,timestamptz,uuid,integer),api.get_sale_settlement_report(date,date,text,text,timestamptz,uuid,integer) from public,anon;
grant execute on function app_private.get_sale_settlement_report_impl(date,date,text,text,timestamptz,uuid,integer),api.get_sale_settlement_report(date,date,text,text,timestamptz,uuid,integer) to authenticated,service_role;
commit;
