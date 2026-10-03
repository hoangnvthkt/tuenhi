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

- Scoped provisional printing, insufficient stock, official-state rejection,
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
