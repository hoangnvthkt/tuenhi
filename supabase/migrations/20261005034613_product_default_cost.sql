begin;

-- A purchasing suggestion, never an inventory valuation or opening balance.
create table app_private.product_default_costs (
  product_id uuid primary key references api.products(id) on delete cascade,
  unit_cost numeric(18,2) not null check (unit_cost > 0),
  updated_by uuid not null references api.profiles(id),
  updated_at timestamptz not null default now()
);
alter table app_private.product_default_costs enable row level security;
alter table app_private.product_default_costs force row level security;
revoke all on table app_private.product_default_costs from public, anon, authenticated;
grant all on table app_private.product_default_costs to service_role;

-- Extend the established command in place: same transaction, version lock and
-- deduplication key as the product. Omitted fields preserve older clients.
do $migration$
declare definition text; patch record;
begin
  definition := pg_get_functiondef('app_private.save_product_impl(uuid,bigint,jsonb,uuid)'::regprocedure);
  for patch in select * from (values
    ($old$  v_version bigint;$old$,
     $new$  v_version bigint;
  v_default_cost_text text;
  v_default_cost numeric(18,2);
  v_before_default_cost numeric(18,2);$new$),
    ($old$'minStockQty', 'isActive'$old$,
     $new$'minStockQty', 'isActive', 'defaultCost'$new$),
    ($old$  v_sku := normalize($old$,
     $new$  if p_product ? 'defaultCost' then
    if not app_private.has_permission('purchase.cost.read')
      or not app_private.has_permission('purchase.cost.enter') then
      return app_private.command_error('PERMISSION_DENIED',
        'Bạn không có quyền thay đổi giá vốn mặc định.', v_correlation_id);
    end if;
    v_default_cost_text := nullif(p_product ->> 'defaultCost', '');
    if jsonb_typeof(p_product -> 'defaultCost') not in ('string', 'null')
      or (v_default_cost_text is not null and (
        v_default_cost_text !~ '^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$'
        or length(split_part(v_default_cost_text, '.', 1)) > 16
      )) then
      return app_private.command_error('VALIDATION_FAILED',
        'Giá vốn mặc định chưa đúng định dạng.', v_correlation_id);
    end if;
    v_default_cost := v_default_cost_text::numeric(18,2);
    if v_default_cost is not null and v_default_cost <= 0 then
      return app_private.command_error('VALIDATION_FAILED',
        'Giá vốn mặc định phải lớn hơn 0 hoặc để trống.', v_correlation_id);
    end if;
  end if;

  v_sku := normalize($new$),
    ($old$  insert into app_private.audit_events ($old$,
     $new$  if p_product ? 'defaultCost' then
    select unit_cost into v_before_default_cost
    from app_private.product_default_costs where product_id = v_id;
    if v_default_cost is null then
      delete from app_private.product_default_costs where product_id = v_id;
    else
      insert into app_private.product_default_costs(product_id,unit_cost,updated_by)
      values(v_id,v_default_cost,v_actor_id)
      on conflict(product_id) do update set unit_cost=excluded.unit_cost,
        updated_by=excluded.updated_by, updated_at=now();
    end if;
    if v_before_default_cost is distinct from v_default_cost then
      insert into app_private.audit_events(actor_id,action,entity_type,entity_id,before_data,after_data,correlation_id)
      values(v_actor_id,'product.default_cost.updated','product',v_id,
        jsonb_build_object('hasDefaultCost',v_before_default_cost is not null),
        jsonb_build_object('hasDefaultCost',v_default_cost is not null),v_correlation_id);
    end if;
  end if;

  insert into app_private.audit_events ($new$)
  ) as changes(before_text,after_text) loop
    if position(patch.before_text in definition)=0 then raise exception 'DEFAULT_COST_SAVE_CONTRACT_CHANGED'; end if;
    definition:=replace(definition,patch.before_text,patch.after_text);
  end loop;
  execute definition;
end $migration$;

-- Keep costs out of the public catalog view and redact at the RPC boundary.
-- Entering a receipt's price does not grant access to catalog-wide costs.
do $migration$
declare target regprocedure; definition text;
begin
  foreach target in array array[
    'app_private.get_product_catalog_impl(text,uuid,text,boolean,text,uuid,integer)'::regprocedure,
    'app_private.get_product_detail_impl(uuid)'::regprocedure
  ] loop
    definition:=pg_get_functiondef(target);
    if position('''onHandQty'', coalesce(c.on_hand_qty, 0)::text' in definition)=0 then raise exception 'DEFAULT_COST_READ_CONTRACT_CHANGED'; end if;
    execute replace(definition,
      '''onHandQty'', coalesce(c.on_hand_qty, 0)::text',
      '''defaultCost'', case when app_private.has_permission(''purchase.cost.read'') then
        (select unit_cost::text from app_private.product_default_costs dc where dc.product_id=c.id) else null end,
      ''onHandQty'', coalesce(c.on_hand_qty, 0)::text');
  end loop;
end $migration$;

commit;
