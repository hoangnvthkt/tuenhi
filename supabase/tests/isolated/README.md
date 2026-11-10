# Customer feedback fixtures — local PostgreSQL only

These tests write synthetic rows. Never run them against Supabase Cloud.
Each SQL fixture rejects unexpected database names and rolls its transaction
back. The runner additionally requires an absolute local Unix socket directory,
refuses TCP, and removes its exact concurrent-test fixture IDs in `finally`.

Prepare a disposable PostgreSQL 17 cluster with no TCP listener. Restore a
schema-only snapshot of `api`, `app_private`, `auth`, `storage`, and `extensions`
with required extensions/roles, plus the repository's permission definitions
and role defaults. Do not copy production rows. Preserve schema/function grants
(or recreate the authenticated API grants if the snapshot uses `--no-acl`).
Apply the three `20261002*` migrations in timestamp order, then clone the empty
schema into databases `feedback_print`, `feedback_access`, and `feedback_alerts`.
This is plain isolated PostgreSQL, not a Supabase local/Docker stack.

Run from the repository root:

```bash
TUENHI_ISOLATED_PG_HOST=/absolute/path/to/disposable/socket \
TUENHI_ISOLATED_PG_PORT=55439 \
TUENHI_PSQL=/absolute/path/to/psql \
pnpm test:feedback:isolated
```

Coverage:

- Scoped provisional printing with zero stock, official-state rejection,
  and no stock/payment/numbering mutations.
- Inventory viewer permissions, stale overrides, price redaction, role change
  cleanup, creation and password gate; existing roles retain prior behavior.
- Cancellation of submitted and draft purchase receipts, preserved provenance,
  idempotent replay and unchanged stock.
- Low-stock boundaries, effective recipients, read-state-independent episodes,
  recovery, rollback, threshold/unit changes and configured-minimum round trips.
- Two simultaneous committed decrements serialize and produce one episode.

For an approved Cloud release, use only the sibling read-only assertion files
through `pnpm cloud:verify:feedback`; these fixtures are not part of that command.
Stop and discard the disposable cluster when finished.

## Negative inventory and deferred costs

After applying migrations through `20261015103004_negative_inventory_deferred_costing.sql`,
clone the pristine schema into `pos_negative_stock`. Run `negative_inventory.sql`
using `psql -X -v ON_ERROR_STOP=1`, then run `negative_inventory_concurrency.mjs`
with the same Unix-socket environment variables (default port `55441`).
The SQL fixture rolls back; the concurrency runner requires empty Auth tables,
commits synthetic fixtures and removes them in `finally`. Do not run it in parallel
with another test against that database.

Coverage includes sales below zero, FIFO partial/full cost correction, cost and
rounding conservation, returns/cancellations before and after replenishment,
signed stock-count snapshots, explicit decimal cost estimates, catalog/dashboard
out-of-stock filters, and concurrent sale/restock/return/cancel commands.
`checkout_confirmation_guards.sql` now verifies that zero-stock checkout succeeds
while price/version guards still reject stale drafts. See
[the accounting policy and local verification runbook](../../../docs/runbooks/negative-inventory.md).

## Ledger integrity (audit wave 1, 07/11/2026)

After applying `20261107013956_ledger_integrity_wave1.sql`, clone the schema into
`ledger_integrity_test` and run `ledger_integrity.sql` with `psql -X -v ON_ERROR_STOP=1`.
The fixture rolls back. It checks the cash/bank split on checkout receipts, that debt
collections no longer rewrite receipts, append-only ledgers (update/delete need
`app.ledger_maintenance`), whole-dong order-discount splits, audit events for stock
count/opening commands, and cancelling submitted counts. After a Cloud release run the
read-only `supabase/tests/ledger_integrity_assertions.sql`.

## Dashboard pie charts (audit wave 2b, 07/11/2026)

After applying `20261107033254_dashboard_pie_drilldowns.sql`, clone the schema into
`dashboard_pie_test` and run `dashboard_pie.sql` with `psql -X -v ON_ERROR_STOP=1`.
The fixture rolls back. It checks that the four stock states are disjoint, add up to
the active product count and match the new catalog filters (`RUNNING_LOW`,
`ZERO_STOCK`, `NEGATIVE_STOCK`; legacy filters unchanged), that revenue by product
(sale, order discount, cancellation, return) reconciles exactly with the revenue
report's net revenue as top three plus "Khác", the settlement product filter, and the
returns-list completion date filter.

## Cash book and shifts (audit wave 3, 07/11/2026)

After applying `20261107044809_cash_book_shifts.sql`, clone the schema into
`cash_book_test` and run `cash_book.sql` with `psql -X -v ON_ERROR_STOP=1`. The fixture
rolls back. It checks owner-only fund openings, one open shift per cashier, idempotent
replays and key reuse, manual vouchers (expense, fund transfer pair, reversal), that the
cash and bank books reconcile with an independent sum of payments, collections, refunds,
cancellations and vouchers (running balance included), keyset pagination, that a cashier
sees only their own money, shift close with the exact expected cash and a required note
when short, outcome lookup for the new commands, append-only guards and audit events.

## Supplier debt, purchase returns and write-offs (audit wave 5, 10/11/2026)

After applying `20261110123829_supplier_debt_returns_writeoffs.sql`, clone the schema into
`supplier_debt_test` and run `supplier_debt.sql` with `psql -X -v ON_ERROR_STOP=1`. The
fixture rolls back. It checks that posted receipts with a supplier open payables (none
without a supplier), the once-only opening debt with a reason, oldest-first payments with
version checks, replay and key reuse, that reversal is refused once money or goods moved
and closes an untouched payable, write-offs at the moving average never above stock,
purchase returns at the receipt cost (debt first, refund with a required method), the cash
book entries for supplier payments and refunds, stock/cost/debt reconciliation after every
step, append-only guards, audit events and outcome lookup.
