-- A cancelled receipt may retain its submission provenance. Other state
-- invariants and all existing posting/reversal guards remain in force.
alter table api.purchase_receipts drop constraint purchase_receipts_check1;
alter table api.purchase_receipts add constraint purchase_receipts_submission_state_check
check (status = 'CANCELLED' or
  ((status in ('AWAITING_COST','POSTED','REVERSED')) = (submitted_at is not null)));

create function app_private.low_stock_threshold(p_unit_name text, p_minimum numeric)
returns numeric language sql immutable set search_path = '' as $$
  select case when p_minimum > 0 then p_minimum
    when lower(normalize(btrim(coalesce(p_unit_name,'')), NFC)) in ('hộp','hop') then 50
    else 0 end;
$$;
revoke all on function app_private.low_stock_threshold(text,numeric) from public,anon,authenticated;

-- This is an episode marker, independent of notification read/expiry state.
-- All quantities stay authoritative in inventory_balances.
create table app_private.low_stock_episodes (
  product_id uuid primary key references api.products(id) on delete cascade,
  episode_id uuid not null default gen_random_uuid(),
  is_low boolean not null default false,
  on_hand_qty numeric(18,0) not null,
  threshold numeric(18,0) not null,
  updated_at timestamptz not null default now()
);
alter table app_private.low_stock_episodes enable row level security;
alter table app_private.low_stock_episodes force row level security;
revoke all on table app_private.low_stock_episodes from public,anon,authenticated;

create function app_private.refresh_low_stock_episode(p_product_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_qty numeric;
  v_product api.products%rowtype;
  v_threshold numeric;
  v_is_low boolean;
  v_previous app_private.low_stock_episodes%rowtype;
  v_episode uuid;
begin
  -- Serialize with every stock command, including threshold edits/seeding.
  select on_hand_qty into v_qty from api.inventory_balances
  where product_id=p_product_id for update;
  if not found then return; end if;
  select * into v_product from api.products where id=p_product_id;
  if not found then return; end if;
  v_threshold := app_private.low_stock_threshold(v_product.unit_name,v_product.min_stock_qty);
  v_is_low := v_product.is_active and v_threshold > 0 and v_qty < v_threshold;
  insert into app_private.low_stock_episodes(product_id,is_low,on_hand_qty,threshold)
  values (p_product_id,false,v_qty,v_threshold) on conflict (product_id) do nothing;
  select * into v_previous from app_private.low_stock_episodes
  where product_id=p_product_id for update;
  v_episode := case when v_is_low and not v_previous.is_low then gen_random_uuid() else v_previous.episode_id end;
  update app_private.low_stock_episodes set episode_id=v_episode,is_low=v_is_low,
    on_hand_qty=v_qty,threshold=v_threshold,updated_at=now() where product_id=p_product_id;
  if not v_is_low or v_previous.is_low then return; end if;
  insert into api.user_notifications(user_id,severity,category,title,message,action_route,
    entity_type,entity_id,dedupe_key,metadata)
  select profile.id,'WARNING','Tồn kho','Hàng dưới ngưỡng tồn',
    v_product.name || ' (' || v_product.sku || '): tồn ghi nhận ' || v_qty::text || ' ' || v_product.unit_name ||
      ', dưới ngưỡng ' || v_threshold::text || ' ' || v_product.unit_name || '.',
    '/products/'||p_product_id::text,'product',p_product_id,'stock.low:'||v_episode::text,
    jsonb_build_object('episodeId',v_episode,'sku',v_product.sku,'onHandQty',v_qty::text,
      'threshold',v_threshold::text,'unitName',v_product.unit_name)
  from api.profiles profile
  where app_private.effective_permission_for_user(profile.id,'inventory.read')
  on conflict (user_id,dedupe_key) where dedupe_key is not null and read_at is null do nothing;
end;
$$;
revoke all on function app_private.refresh_low_stock_episode(uuid) from public,anon,authenticated;

create function app_private.notify_inventory_low_stock()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.refresh_low_stock_episode(new.product_id);
  return new;
end;
$$;
revoke all on function app_private.notify_inventory_low_stock() from public,anon,authenticated;
create trigger inventory_low_stock_insert after insert on api.inventory_balances
for each row execute function app_private.notify_inventory_low_stock();
create trigger inventory_low_stock_update after update of on_hand_qty on api.inventory_balances
for each row when (old.on_hand_qty is distinct from new.on_hand_qty)
execute function app_private.notify_inventory_low_stock();

create function app_private.notify_product_low_stock()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.refresh_low_stock_episode(new.id);
  return new;
end;
$$;
revoke all on function app_private.notify_product_low_stock() from public,anon,authenticated;
create trigger product_low_stock_update after update of min_stock_qty,unit_name,is_active on api.products
for each row when (old.min_stock_qty is distinct from new.min_stock_qty
  or old.unit_name is distinct from new.unit_name or old.is_active is distinct from new.is_active)
execute function app_private.notify_product_low_stock();

-- Update existing DTO/filter bodies in place, preserving the preceding price
-- permission fix and the established signatures/grants.
do $$
declare target regprocedure; definition text;
begin
  foreach target in array array[
    'app_private.get_product_catalog_impl(text,uuid,text,boolean,text,uuid,integer)'::regprocedure,
    'app_private.get_product_detail_impl(uuid)'::regprocedure
  ] loop
    definition := pg_get_functiondef(target);
    if position('c.min_stock_qty::text' in definition)=0 then
      raise exception 'LOW_STOCK_CATALOG_CONTRACT_CHANGED';
    end if;
    definition := replace(definition,'c.min_stock_qty::text',
      'c.min_stock_qty::text, ''effectiveMinStockQty'', app_private.low_stock_threshold(c.unit_name,c.min_stock_qty)::text');
    definition := replace(definition,
      'and coalesce(catalog.on_hand_qty, 0) > 0' || chr(10) || '          and coalesce(catalog.on_hand_qty, 0) <= catalog.min_stock_qty',
      'and coalesce(catalog.on_hand_qty, 0) < app_private.low_stock_threshold(catalog.unit_name,catalog.min_stock_qty)');
    definition := replace(definition,
      'and coalesce(catalog.on_hand_qty, 0) > catalog.min_stock_qty',
      'and coalesce(catalog.on_hand_qty, 0) > 0 and coalesce(catalog.on_hand_qty, 0) >= app_private.low_stock_threshold(catalog.unit_name,catalog.min_stock_qty)');
    execute definition;
  end loop;
  definition := pg_get_functiondef('app_private.get_operational_dashboard_impl(date,date)'::regprocedure);
  if position('balance.on_hand_qty > 0 and balance.on_hand_qty <= product.min_stock_qty' in definition)=0 then
    raise exception 'LOW_STOCK_DASHBOARD_CONTRACT_CHANGED';
  end if;
  definition := replace(definition,
    'balance.on_hand_qty > 0 and balance.on_hand_qty <= product.min_stock_qty',
    'balance.on_hand_qty < app_private.low_stock_threshold(product.unit_name,product.min_stock_qty)');
  execute definition;
end $$;

-- Seed one episode for existing low stock without changing product, quantity,
-- cost, or financial records. Rerunning reconciliation never duplicates it.
do $$ declare item record; begin
  for item in select product_id from api.inventory_balances order by product_id loop
    perform app_private.refresh_low_stock_episode(item.product_id);
  end loop;
end $$;
