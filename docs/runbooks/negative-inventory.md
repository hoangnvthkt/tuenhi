# Negative inventory and deferred costing

Checkout may take recorded stock below zero. Known units use the current weighted
average; selling all known units consumes the exact remaining asset value, including
rounding cents. Uncovered units initially have **zero provisional COGS**. Their
profit remains provisional until the missing stock is recorded. The product's
configured default purchase cost is a purchase-entry suggestion, not proof of cost.

Later posted purchases allocate their actual cost to the oldest outstanding sale
shortages for that product, then value any units left in stock. Partial receipts
recognize only the replenished quantity. Each allocation records its source stock
movement, quantity and cost in a private table. Original sale cost snapshots and
the original `SALE_COMPLETED` financial event increase by that cost, so the original
sale period's profit is corrected. Revenue, customer payments and debt remain as
recorded. The replenishment stock-cost movement carries the same COGS correction;
its inventory value delta excludes units already sold. Asset value and average cost
stay zero while recorded stock is zero or negative.

Returns release that sale's still-uncosted units first. Returning recognized units
reverses their remaining recognized cost; a final return consumes the exact cent
remainder. A cancellation releases all its open shortage and restores its recognized
cost. Returned or cancelled known-cost goods can fill newer sale shortages before
adding asset value. Cancelling a purchase that funded a shortage remains blocked by
the existing receipt reversal guards. Record legitimate subsequent stock changes
through their normal documents.

Periodic stock counts accept signed system snapshots and nonnegative physical
counts. An increase from zero or negative stock requires the owner's explicit cost
estimate. This estimate first recognizes outstanding sale cost and then values
positive stock. A stale count still requires refreshing and counting again. Opening
stock/import retain their existing pristine-product restrictions.

All inventory writers retain ordered product locks, document/version guards,
permissions and command idempotency. New cost tables have forced RLS and no direct
`anon`/`authenticated` grants. New allocation/release helpers cannot be called
directly by these roles. No historical documents are rewritten by the migration;
only future replenishments adjust the cost of new shortages.

## Local verification

Use synthetic data in a disposable PostgreSQL 17 cluster with a Unix socket and
`listen_addresses=''`. Restore a schema-only application fixture, required Supabase
roles/functions, and all repository migrations. Preserve function grants, or restore
them as documented in the isolated test README. Never copy production business rows.
Clone this pristine schema into **`pos_negative_stock`**. The SQL fixture rejects a
different database name or a TCP connection.

```bash
psql -X -h /absolute/disposable/socket -p 55441 -d pos_negative_stock \
  -v ON_ERROR_STOP=1 -f supabase/tests/isolated/negative_inventory.sql

TUENHI_ISOLATED_PG_HOST=/absolute/disposable/socket \
TUENHI_ISOLATED_PG_PORT=55441 \
TUENHI_PSQL=/absolute/path/to/psql \
node supabase/tests/isolated/negative_inventory_concurrency.mjs
```

The SQL fixture rolls back. Run the concurrency test alone against that database;
it requires empty Auth tables, commits synthetic fixtures and removes them in
`finally`. It checks simultaneous oversales, replenishments, returns and cancellations
with a ten-second statement timeout. The ordinary SQL suite also covers zero and
negative stock, FIFO partial/full restocks, cent rounding, private privileges,
authenticated checkout, counts, retries, signed catalog filters and ledger identities.

For a release, apply `20261015103004_negative_inventory_deferred_costing.sql` through
the normal approved migration process after all preceding migrations. The sibling
`supabase/tests/negative_inventory_assertions.sql` contains read-only structural and
live-invariant checks suitable for an approved release verification. Do not run
isolated fixture scripts against Cloud. This implementation has no cloud-side job
or external service dependency. To roll back after negative-stock documents exist,
first reconcile stock and costs through normal business documents; restoring the
old nonnegative constraints directly would reject valid signed balances.
