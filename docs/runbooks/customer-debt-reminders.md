# In-app customer debt reminders

Migration: `20261015102749_customer_debt_reminders.sql`.

The existing notification feed reconciles debt warnings when a signed-in user
reads it. NotificationCenter refreshes that feed every 60 seconds while mounted.
This catches debt reaching seven days even when no sale or collection occurs.
No cron, external messaging service, or browser push subscription is needed.
Offline/background browser throttling delays the refresh until the application
can request the feed again.

Each user with the existing `customer.debt.read` permission gets at most one
warning per overdue customer. The warning shows total remaining debt and the
portion outstanding for at least seven full days, with a link to the customer.
Read warnings stay acknowledged for the current Vietnam date (UTC+7); the next
feed refresh on a later date makes the same warning unread again. Refreshing an
unchanged warning does not write a notification, avoiding Realtime loops.
The daily rearmed warning moves to the top of the feed with its renewed date.

Invoice age comes from each open payment allocation, so paying the oldest
invoice stops that warning if the remaining invoices are younger than seven
days. Later purchases do not reset the age of older unpaid invoices. Manual
opening debt starts aging at its recorded positive adjustment time; it has no
separate historical due-date field. Reductions consume the oldest surviving
manual increases first, preserving the newer increases' own age.

A deferred trigger on debt ledger inserts reconciles notifications at transaction
completion, after account and invoice allocation changes agree. Partial payments
update the warning amount. Full payment, write-off, cancellation or return offsets
that clear the overdue portion remove the active warning, including its read
copy. Later new debt starts its own aging period. Operational command completion
also refreshes the frontend notification cache; the 60-second refresh recovers
from missed Realtime events. Revoked permissions are enforced by notification
RLS and feed reconciliation.

## Local verification

Use a disposable Unix-socket-only PostgreSQL database named
`pos_debt_reminders`, with a schema-only baseline, required permission definitions
and current repository migrations applied. Never run the fixture on Cloud.
The fixture checks the database name/socket and rolls back synthetic rows.

```sh
psql -X -h /absolute/disposable/socket -p 55441 -d pos_debt_reminders \
  -v ON_ERROR_STOP=1 -f supabase/tests/isolated/customer_debt_reminders.sql
```

`supabase/tests/customer_debt_reminder_assertions.sql` is the separate read-only
release check for private helpers, grants, RLS, uniqueness and deferred trigger.
No production migration or data change is performed by this runbook.
