# Customer feedback fixes implementation plan

> **For agentic workers:** Use test-driven development and independent task ownership. The user approved the concrete in-chat design on 2026-10-02. Execute the authorized work without another scope approval.

**Goal:** Deliver provisional printing, reliable purchase editing/cancellation, supplier editing in context, inventory-only access, and low-stock notifications.

**Architecture:** Extend the existing React features and private Supabase commands. Keep official invoices and stock mutations separate from provisional documents. Ship additive migration contracts and retain the existing transaction and permission boundaries.

**Tech stack:** React, TypeScript, Vitest, PostgreSQL/Supabase, pdfmake.

**Spec:** The five proposals approved in this task; preserved below.

## Approved behavior

- Print a saved sales draft as “PHIẾU TẠM TÍNH — CHƯA THANH TOÁN”, including when stock is insufficient; do not complete sales, allocate official invoice numbers, take payment, or change inventory. Preserve server-calculated totals and scope access. Fix real PDF font loading and asynchronous error handling.
- Allow cancelling DRAFT/AWAITING_COST purchase receipts while preserving submission history. Keep the POSTED reversal guard; explain blocked reversal. Prevent posting unsaved edits; refresh all authoritative values after mutation. Convert received date correctly between UTC and local time. Provide a replacement draft from a reversed receipt, with explicit user action, never auto-post.
- Search suppliers beyond the first page, distinguish loading/empty/error states, keep the selected supplier visible, and allow authorized create/edit without losing the purchase draft.
- Add WAREHOUSE_VIEWER with only catalog/inventory read access. Enforce the allowlist server-side even with stale overrides. Route the account to products and hide financial/navigation/write actions. Gate prices independently; no revenue or costs to this role.
- Notify active owners and users with effective inventory.read in the existing in-app feed when stock is below the configured minimum (default 50 for box-unit products without a configured threshold). Compare in the product's stored unit; do not assume a conversion between boxes and cases. Include zero. Create one notification per low-stock episode, regardless of whether previous notifications were read. Recovery to the threshold resets the episode. Existing low stock gets seeded once on rollout without changing stock.

## Global constraints

- Worktree branch: codex/tuenhi-feedback-fixes. Do not edit the main checkout.
- No synthetic transactions/users or cleanup on the current Cloud project. No cloud mutations until the implementation and migrations are concrete and verified for release review.
- Use existing libraries, UI conventions, private function/public invoker wrappers, and idempotency machinery.
- Keep secrets outside tracked files. The main checkout .env may only be loaded by trusted CLI processes, never printed.
- Parent owns generated database types, shared error mappings, integration checks and release review. Each worker owns its task files and its own CLI-created migration.

## Review focus

1. Low stock at 50/49/0, read notifications followed by further reductions, and concurrent/rolled-back changes.
2. Existing custom GRANT overrides when changing a user to inventory-only.
3. Editing purchase fields immediately before posting, with slow cost/detail responses.
4. Printing a large Vietnamese receipt, blocked popups, and failed asynchronous downloads.
5. Supplier outside the first 100 results and selected supplier missing from search results.

## Task 1: Sales draft printing and PDF

Files: src/features/sales/**; own Supabase migration and SQL assertions.
Interfaces: new read-only draft-print RPC returns a separate draft DTO with scoped store branding, draft lines/totals; official Invoice remains unchanged.
- [x] Write failing tests for print with zero stock, no complete call, scoped DTO and PDF generation/error propagation.
- [x] Implement saved-draft print view and reusable PDF font setup using existing pdfmake.
- [x] Run sales tests; report RED/GREEN commands and new RPC type contract to parent.

## Task 2: Purchase and supplier frontend

Files: src/features/inventory/purchase/**; focused reusable supplier picker; shared local-datetime helper if needed.
Interfaces: existing save/post/detail APIs; existing supplier read/save APIs. Parent supplies cancellation constraint and error mappings.
- [x] Reproduce dirty-post, date round-trip, missing selected supplier and supplier load failures with failing tests.
- [x] Implement explicit save-before-post, complete refresh, supplier search/create/edit, reversal reason/confirmation and replacement draft flow.
- [x] Run purchase/directory/date tests and report RED/GREEN evidence.

## Task 3: Inventory viewer authorization

Files: auth/staff/navigation/dashboard/catalog permission rendering; Edge staff creation role validation; own additive migration/assertions.
Interfaces: WAREHOUSE_VIEWER role; hard server allowlist catalog.read/inventory.read; compatible nullable prices. Preserve all existing role behavior.
- [x] Add failing role, landing/navigation, no-revenue-fetch and price visibility tests.
- [x] Add role at all validators/constraints; enforce allowlist including stale overrides; redact price DTOs without permission; update UI.
- [x] Run affected tests and provide SQL permission assertions and type changes to parent.

## Task 4: Purchase cancellation and stock alerts

Files: own additive migration; shared error mapping; SQL behavior assertions; low-stock display/filter alignment; rollout documentation.
Interfaces: private low_stock episode state with no client access; transactional inventory/product triggers write existing user_notifications rows. Keep quantity/cost commands unchanged.
- [x] Verify cancellation CHECK failure and alert boundaries against isolated fixture tables/functions, never production rows.
- [x] Fix cancellation invariant preserving submitted_at; map blocked reversal errors to actionable messages.
- [x] Implement alerts, effective recipients, episode deduplication, initial seeding and strict threshold display semantics.
- [x] Add read-only Cloud assertions and rollout/rollback notes.

## Integration and release

- [x] Run format, lint, typecheck, full tests, template verification and production build.
- [x] Review SQL scopes/grants, duplicate notification behavior, financial no-op printing and receipt state transitions.
- [x] Fresh independent review; fix important findings with regression tests.
- [x] Commit complete branch and present release-ready changes, with concrete migration review if Cloud deployment needs approval.

## Final evidence

- Full quality gate: 109 files, 509 tests passed; build assets 4,127,643 bytes under 4 MiB.
- All three ordered migrations and read-only assertions passed on isolated PostgreSQL 17. Behavioral fixtures and concurrent decrements passed. Existing zero-stock backfill was verified without inventory changes.
- Independent review found and resolved configured/effective threshold round-trip and customer prefill during print/save; no remaining Important/Critical findings.
- Cloud release and physical printer UAT remain separate release steps, documented in the customer-feedback runbook.
