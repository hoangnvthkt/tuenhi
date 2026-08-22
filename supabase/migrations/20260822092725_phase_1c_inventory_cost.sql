create table app_private.document_sequences (
  document_type text primary key check (
    document_type in ('PURCHASE_RECEIPT', 'STOCK_COUNT')
  ),
  prefix text not null check (prefix ~ '^[A-Z]{2,5}$'),
  last_value bigint not null default 0 check (last_value >= 0),
  updated_at timestamptz not null default now()
);

insert into app_private.document_sequences (document_type, prefix)
values ('PURCHASE_RECEIPT', 'PN'), ('STOCK_COUNT', 'KK');

create table api.purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number text unique,
  status text not null default 'DRAFT' check (
    status in ('DRAFT', 'AWAITING_COST', 'POSTED', 'REVERSED', 'CANCELLED')
  ),
  supplier_id uuid references api.suppliers(id) on delete restrict,
  received_at timestamptz not null,
  note text check (
    note is null or (note = btrim(note) and length(note) between 1 and 1000)
  ),
  created_by uuid not null references api.profiles(id) on delete restrict,
  submitted_by uuid references api.profiles(id) on delete restrict,
  posted_by uuid references api.profiles(id) on delete restrict,
  reversed_by uuid references api.profiles(id) on delete restrict,
  cancelled_by uuid references api.profiles(id) on delete restrict,
  submitted_at timestamptz,
  posted_at timestamptz,
  reversed_at timestamptz,
  cancelled_at timestamptz,
  reverse_reason text check (
    reverse_reason is null
    or (reverse_reason = btrim(reverse_reason) and length(reverse_reason) between 1 and 500)
  ),
  cancel_reason text check (
    cancel_reason is null
    or (cancel_reason = btrim(cancel_reason) and length(cancel_reason) between 1 and 500)
  ),
  version bigint not null default 1 check (version >= 1),
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status in ('POSTED', 'REVERSED')) = (receipt_number is not null)),
  check ((status in ('AWAITING_COST', 'POSTED', 'REVERSED')) = (submitted_at is not null)),
  check ((status in ('POSTED', 'REVERSED')) = (posted_at is not null)),
  check ((status = 'REVERSED') = (reversed_at is not null)),
  check ((status = 'CANCELLED') = (cancelled_at is not null))
);

create index purchase_receipts_status_updated_idx
  on api.purchase_receipts(status, updated_at desc, id desc);
create index purchase_receipts_created_by_idx
  on api.purchase_receipts(created_by, updated_at desc, id desc);
create index purchase_receipts_supplier_idx
  on api.purchase_receipts(supplier_id, updated_at desc, id desc)
  where supplier_id is not null;
create index purchase_receipts_submitted_by_idx
  on api.purchase_receipts(submitted_by) where submitted_by is not null;
create index purchase_receipts_posted_by_idx
  on api.purchase_receipts(posted_by) where posted_by is not null;
create index purchase_receipts_reversed_by_idx
  on api.purchase_receipts(reversed_by) where reversed_by is not null;
create index purchase_receipts_cancelled_by_idx
  on api.purchase_receipts(cancelled_by) where cancelled_by is not null;

create table api.purchase_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_receipt_id uuid not null
    references api.purchase_receipts(id) on delete cascade,
  product_id uuid not null references api.products(id) on delete restrict,
  product_name text not null check (length(product_name) between 1 and 200),
  sku text not null check (length(sku) between 1 and 64),
  unit_name text not null check (length(unit_name) between 1 and 50),
  received_qty numeric(18,3) not null check (received_qty > 0),
  line_order integer not null check (line_order >= 0),
  created_at timestamptz not null default now(),
  unique(purchase_receipt_id, product_id),
  unique(purchase_receipt_id, line_order)
);

create index purchase_receipt_lines_product_idx
  on api.purchase_receipt_lines(product_id, purchase_receipt_id);

create table api.stock_counts (
  id uuid primary key default gen_random_uuid(),
  count_number text unique,
  count_type text not null default 'OPENING' check (count_type = 'OPENING'),
  status text not null default 'DRAFT' check (
    status in ('DRAFT', 'COUNTED', 'POSTED', 'CANCELLED')
  ),
  note text check (
    note is null or (note = btrim(note) and length(note) between 1 and 1000)
  ),
  created_by uuid not null references api.profiles(id) on delete restrict,
  submitted_by uuid references api.profiles(id) on delete restrict,
  posted_by uuid references api.profiles(id) on delete restrict,
  cancelled_by uuid references api.profiles(id) on delete restrict,
  submitted_at timestamptz,
  posted_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text check (
    cancel_reason is null
    or (cancel_reason = btrim(cancel_reason) and length(cancel_reason) between 1 and 500)
  ),
  version bigint not null default 1 check (version >= 1),
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'POSTED') = (count_number is not null)),
  check ((status in ('COUNTED', 'POSTED')) = (submitted_at is not null)),
  check ((status = 'POSTED') = (posted_at is not null)),
  check ((status = 'CANCELLED') = (cancelled_at is not null))
);

create index stock_counts_status_updated_idx
  on api.stock_counts(status, updated_at desc, id desc);
create index stock_counts_created_by_idx
  on api.stock_counts(created_by, updated_at desc, id desc);
create index stock_counts_submitted_by_idx
  on api.stock_counts(submitted_by) where submitted_by is not null;
create index stock_counts_posted_by_idx
  on api.stock_counts(posted_by) where posted_by is not null;
create index stock_counts_cancelled_by_idx
  on api.stock_counts(cancelled_by) where cancelled_by is not null;

create table api.stock_count_lines (
  id uuid primary key default gen_random_uuid(),
  stock_count_id uuid not null references api.stock_counts(id) on delete cascade,
  product_id uuid not null references api.products(id) on delete restrict,
  product_name text not null check (length(product_name) between 1 and 200),
  sku text not null check (length(sku) between 1 and 64),
  unit_name text not null check (length(unit_name) between 1 and 50),
  system_qty_snapshot numeric(18,3) not null check (system_qty_snapshot >= 0),
  inventory_version_snapshot bigint not null check (inventory_version_snapshot >= 0),
  counted_qty numeric(18,3) not null check (counted_qty > 0),
  line_order integer not null check (line_order >= 0),
  created_at timestamptz not null default now(),
  unique(stock_count_id, product_id),
  unique(stock_count_id, line_order)
);

create index stock_count_lines_product_idx
  on api.stock_count_lines(product_id, stock_count_id);

create table api.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references api.products(id) on delete restrict,
  movement_type text not null check (
    movement_type in ('OPENING', 'PURCHASE_RECEIPT', 'PURCHASE_REVERSAL')
  ),
  quantity_delta numeric(18,3) not null check (quantity_delta <> 0),
  quantity_after numeric(18,3) not null check (quantity_after >= 0),
  reference_type text not null check (
    reference_type in ('PURCHASE_RECEIPT', 'STOCK_COUNT')
  ),
  reference_id uuid not null,
  occurred_at timestamptz not null default now(),
  actor_id uuid not null references api.profiles(id) on delete restrict,
  note text check (
    note is null or (note = btrim(note) and length(note) between 1 and 500)
  ),
  correlation_id uuid not null,
  unique(reference_type, reference_id, product_id, movement_type)
);

create index stock_movements_product_occurred_idx
  on api.stock_movements(product_id, occurred_at desc, id desc);
create index stock_movements_reference_idx
  on api.stock_movements(reference_type, reference_id, id);
create index stock_movements_actor_idx
  on api.stock_movements(actor_id, occurred_at desc, id desc);

create unique index stock_movements_opening_product_uidx
  on api.stock_movements(product_id) where movement_type = 'OPENING';

create table app_private.inventory_cost_balances (
  product_id uuid primary key references api.products(id) on delete cascade,
  inventory_value numeric(20,2) not null default 0 check (inventory_value >= 0),
  avg_unit_cost numeric(20,6) not null default 0 check (avg_unit_cost >= 0),
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now(),
  check (
    (inventory_value = 0 and avg_unit_cost >= 0)
    or inventory_value > 0
  )
);

insert into app_private.inventory_cost_balances(product_id)
select p.id from api.products p
on conflict (product_id) do nothing;

create function app_private.ensure_product_cost_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into app_private.inventory_cost_balances(product_id)
  values (new.id)
  on conflict (product_id) do nothing;
  return new;
end;
$$;

create trigger products_ensure_cost_balance
after insert on api.products
for each row execute function app_private.ensure_product_cost_balance();

create table app_private.purchase_receipt_line_costs (
  purchase_receipt_line_id uuid primary key
    references api.purchase_receipt_lines(id) on delete cascade,
  unit_cost numeric(18,2) not null check (unit_cost >= 0),
  line_cost numeric(20,2) not null check (line_cost >= 0),
  entered_by uuid not null references api.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index purchase_receipt_line_costs_entered_by_idx
  on app_private.purchase_receipt_line_costs(entered_by, created_at desc);

create table app_private.stock_count_line_costs (
  stock_count_line_id uuid primary key
    references api.stock_count_lines(id) on delete cascade,
  opening_unit_cost numeric(18,2) not null check (opening_unit_cost >= 0),
  opening_value numeric(20,2) not null check (opening_value >= 0),
  source_suggestion_id uuid references
    app_private.legacy_opening_balance_suggestions(id) on delete restrict,
  unverified_source_confirmed boolean not null default false,
  entered_by uuid not null references api.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (source_suggestion_id is null or unverified_source_confirmed)
);

create index stock_count_line_costs_entered_by_idx
  on app_private.stock_count_line_costs(entered_by, created_at desc);
create index stock_count_line_costs_suggestion_idx
  on app_private.stock_count_line_costs(source_suggestion_id)
  where source_suggestion_id is not null;

create table app_private.inventory_cost_movements (
  stock_movement_id uuid primary key
    references api.stock_movements(id) on delete restrict,
  inventory_value_delta numeric(20,2) not null,
  cogs_delta numeric(20,2) not null default 0,
  inventory_value_after numeric(20,2) not null check (inventory_value_after >= 0),
  avg_unit_cost_after numeric(20,6) not null check (avg_unit_cost_after >= 0),
  occurred_at timestamptz not null
);

create index inventory_cost_movements_occurred_idx
  on app_private.inventory_cost_movements(occurred_at desc, stock_movement_id);

alter table api.purchase_receipts enable row level security;
alter table api.purchase_receipts force row level security;
alter table api.purchase_receipt_lines enable row level security;
alter table api.purchase_receipt_lines force row level security;
alter table api.stock_counts enable row level security;
alter table api.stock_counts force row level security;
alter table api.stock_count_lines enable row level security;
alter table api.stock_count_lines force row level security;
alter table api.stock_movements enable row level security;
alter table api.stock_movements force row level security;
alter table app_private.document_sequences enable row level security;
alter table app_private.document_sequences force row level security;
alter table app_private.inventory_cost_balances enable row level security;
alter table app_private.inventory_cost_balances force row level security;
alter table app_private.purchase_receipt_line_costs enable row level security;
alter table app_private.purchase_receipt_line_costs force row level security;
alter table app_private.stock_count_line_costs enable row level security;
alter table app_private.stock_count_line_costs force row level security;
alter table app_private.inventory_cost_movements enable row level security;
alter table app_private.inventory_cost_movements force row level security;

create policy purchase_receipts_operational_read
on api.purchase_receipts for select to authenticated
using (
  (select app_private.has_permission('purchase.operational.read'))
  or (select app_private.has_permission('purchase.draft.manage'))
  or (select app_private.has_permission('purchase.cost.read'))
);

create policy purchase_receipt_lines_operational_read
on api.purchase_receipt_lines for select to authenticated
using (
  exists (
    select 1 from api.purchase_receipts r
    where r.id = purchase_receipt_id
  )
);

create policy stock_counts_owner_read
on api.stock_counts for select to authenticated
using ((select app_private.has_permission('inventory.adjustment.post')));

create policy stock_count_lines_owner_read
on api.stock_count_lines for select to authenticated
using (
  (select app_private.has_permission('inventory.adjustment.post'))
  and exists (
    select 1 from api.stock_counts c where c.id = stock_count_id
  )
);

create policy stock_movements_quantity_read
on api.stock_movements for select to authenticated
using ((select app_private.has_permission('inventory.read')));

revoke all on table api.purchase_receipts from public, anon, authenticated;
revoke all on table api.purchase_receipt_lines from public, anon, authenticated;
revoke all on table api.stock_counts from public, anon, authenticated;
revoke all on table api.stock_count_lines from public, anon, authenticated;
revoke all on table api.stock_movements from public, anon, authenticated;
grant select on table api.purchase_receipts to authenticated;
grant select on table api.purchase_receipt_lines to authenticated;
grant select on table api.stock_counts to authenticated;
grant select on table api.stock_count_lines to authenticated;
grant select on table api.stock_movements to authenticated;

revoke all on table app_private.document_sequences
from public, anon, authenticated;
revoke all on table app_private.inventory_cost_balances
from public, anon, authenticated;
revoke all on table app_private.purchase_receipt_line_costs
from public, anon, authenticated;
revoke all on table app_private.stock_count_line_costs
from public, anon, authenticated;
revoke all on table app_private.inventory_cost_movements
from public, anon, authenticated;
revoke execute on function app_private.ensure_product_cost_balance()
from public, anon, authenticated;

grant all on table api.purchase_receipts to service_role;
grant all on table api.purchase_receipt_lines to service_role;
grant all on table api.stock_counts to service_role;
grant all on table api.stock_count_lines to service_role;
grant all on table api.stock_movements to service_role;
grant all on table app_private.document_sequences to service_role;
grant all on table app_private.inventory_cost_balances to service_role;
grant all on table app_private.purchase_receipt_line_costs to service_role;
grant all on table app_private.stock_count_line_costs to service_role;
grant all on table app_private.inventory_cost_movements to service_role;
grant execute on function app_private.ensure_product_cost_balance()
to service_role;
