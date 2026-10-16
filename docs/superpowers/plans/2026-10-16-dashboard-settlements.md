# Dashboard Settlement Drilldown Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task with a final independent review.

**Goal:** Show cash, bank transfer and remaining debt for invoices sold in the selected Vietnam date range, with related data accessible from every dashboard card.

**Architecture:** A permission-scoped, read-only settlement RPC derives current invoice payments from existing allocation ledgers (with legacy payment fallback), subtracts actual refunds and excludes cancelled invoices from balances. It returns full-range totals plus independently paginated invoice rows filtered by cash/bank/debt. Existing report pages serve financial metric links; operational pages honor status links.

**Tech Stack:** React, React Router, TanStack Query, Zod, Supabase Postgres.

**Spec:** User request in this chat, including explicit choice: debt means the remaining debt of invoices sold in the day after customer payments.

## Global Constraints

- Preserve existing business rows; additive read-only functions only, no financial test data on production.
- Match report OWN/ALL permissions and Asia/Ho_Chi_Minh inclusive date range semantics.
- Aggregate all matching records server-side, independently of the displayed page.
- Cash/bank refer to current amounts allocated to invoices sold in the selected period, including later repayments against those invoices; exclude debts from older invoices outside that period.
- Deduct actual cash/bank refunds for those invoices, allow negative per-method net refund amounts; debt is current outstanding and never negative.
- Preserve three existing modified user plan documents.

## Review Focus

- Mixed payment must split amounts, not assign the entire invoice to one method.
- Repayments and returns must reduce outstanding debt without counting older sales in this period.
- Vietnam midnight boundaries, empty sets, cancelled invoices and pagination totals must remain correct.
- OWN report access must not expose another staff member's invoices or costs.
- Card destinations must honor filters and selected dates, including browser navigation.

### Task 1: Read-only settlement data

**Files:** new Supabase migration, `supabase/tests/isolated/dashboard_settlements.sql`, `supabase/tests/dashboard_settlements_assertions.sql`.
**Interfaces:** `api.get_sale_settlement_report(date,date,text,text,timestamptz,uuid,integer)` returns version, range, scope, summary {cashAmount,bankTransferAmount,outstandingAmount}, items {id,saleNumber,completedAt,customerName,status,cashAmount,bankTransferAmount,outstandingAmount}, nextCursor {completedAt,id}.
- [x] Write and run failing isolated SQL tests for mixed tender, debt repayment, returns, dates, cancelled/legacy payments, scope and pagination.
- [x] Implement private scoped rows helper, permission-checked report implementation, invoker API wrapper and least privilege grants.
- [x] Run isolated behavior and read-only security assertions; review explain plan.

### Task 2: Dashboard and linked settlement list

**Files:** dashboard page/hook/tests; new settlement report API/schema/page/tests; report routes/index; operational list pages/tests; financial event links.
**Interfaces:** settlement API mirrors Task 1; `/reports/settlements?period&from&to&scope&method=ALL|CASH|BANK_TRANSFER|DEBT`.
- [x] Write failing UI tests for exact money display, method/date destinations, permissions, invoice navigation and status initialization.
- [x] Add three linked cards, semantic keyboard-accessible links on every existing card, settlement detail pagination and visible filter context.
- [x] Wire operational pending links to existing server status filters; preserve scope/date on report links and link report event documents to detail.
- [x] Run focused tests then full suite and mobile UI checks.

### Task 3: Release

- [x] Independent code review; fix verified findings.
- [x] Run quality, browser, local SQL and read-only Cloud gates.
- [x] Back up before additive migration; verify business table digests unchanged after application.
- [ ] Commit only task files and deploy under existing production authorization.
- [ ] Verify CI, deployment checks, domain version, new cards and navigation on the authenticated user tab without financial writes.

## Verification notes

- Isolated SQL exercises actual sale completion, collection, return and cancellation commands and rolls back every fixture. The bundled local Postgres lacks its IANA timezone directory, so the local deployment uses the equivalent Vietnam fixed UTC+7 timezone (`UTC-7` POSIX spelling). The shipped migration uses `Asia/Ho_Chi_Minh`; read-only authenticated Cloud assertions verify that exact implementation.
- Review fixes: settlement queries participate in financial invalidation; report fragment links scroll after asynchronous sections render. Both regressions were observed failing, then passed with fixes.
- New settlement screens add roughly 8 KiB to total assets; total allowance is 42 KiB above 4 MiB. Startup JavaScript/CSS budgets remain unchanged.
