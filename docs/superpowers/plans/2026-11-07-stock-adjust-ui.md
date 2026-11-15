# D2 Stock Adjust UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Adjust stock and see stock history per variant from the product edit page.
**Architecture:** Pure rules in `frontend-petshop/lib/adminStock.ts`; one dialog component calling the existing ledger API through `productApi`; one additive field in the backend history response.
**Tech Stack:** Next.js 16 / React 19 / Tailwind 4, Express 5 + Prisma 7, Vitest.
Spec: `docs/superpowers/specs/2026-11-07-stock-adjust-ui-design.md`.

## Global Constraints
- No new dependency; no schema change. Code / comments in English; UI text Vietnamese.
- Touch targets ≥ 44px, inputs 16px, no horizontal overflow at 320–1024px.
- No `any`, no `eslint-disable`. Commits one short line, no attribution, after the user's "ok".

### Task 1: `order.code` in the stock history (backend)
**Files:** `backend/controllers/product.controller.ts` (`listStockMovements` select), `backend/test/db/inventory.test.ts` (append in the history describe).
- [ ] Test: COD checkout of one unit → `GET …/stock-movements` → `data[0]` is `{ reason: 'SALE', order: { code: <order code> } }`; an admin ADJUST row has `order: null`. Run `npm run test:db -- test/db/inventory.test.ts` → FAIL.
- [ ] Add `order: { select: { code: true } }` to the select. Run → PASS; `npm run typecheck`.

### Task 2: `lib/adminStock.ts` + tests (frontend)
**Files:** create `frontend-petshop/lib/adminStock.ts`, `frontend-petshop/test/adminStock.test.ts`; add `StockMovement` to `lib/types.ts`.
Interfaces: `type Direction = 'in' | 'out'`; `REASON_LABELS: Record<string, string>`; `reasonsFor(d): { value, label }[]`;
`validateAdjust({ quantity, reason, note }): FieldErrors`; `validateStocktake({ counted, note }, reserved): FieldErrors`;
`adjustBody(d, { quantity, reason, note })`; `stocktakeBody({ counted, note })`; `previewAfter(stock, change): number`;
`StockMovement = { id; delta; quantityAfter; reason; note; orderId; order: { code } | null; createdAt; user: { id; fullName; email } | null }`.
- [ ] Tests first (labels for all 8 reasons, direction filter, quantity must be a positive integer ≤ 2147483647, OTHER needs a note, counted ≥ reserved, body shapes with signed delta and trimmed / null note). Run → FAIL. Implement. Run → PASS.

### Task 3: `StockDialog` + wiring
**Files:** create `frontend-petshop/components/admin/products/StockDialog.tsx`; modify `VariantRows.tsx` (button, dialog state, `onStockChange` prop), `ProductForm.tsx` (pass `onStockChange` updating `values.variants`).
- [ ] Implement per spec; typecheck, lint, test.

### Task 4: Verify + docs
- [ ] Backend typecheck / test / test:db; frontend typecheck / lint / test / build.
- [ ] Browser (CDP script): adjust +5, −2, stocktake; history; count below reserved refused; 390 / 768 / 1024 px.
- [ ] PROGRESS entry; propose commits `show the order code in stock history`, `add stock adjustments to the product form`.
