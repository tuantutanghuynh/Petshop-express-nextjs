# D2 — Stock adjustments and history in the product form — design

Date: 2026-11-07 · Level: MEDIUM-LARGE (frontend; one additive field in an admin API response)

## Goal

From the product edit page, the admin records deliveries, damage, returns and stocktakes for each
saved variant, and sees that variant's stock history. The backend ledger already exists (ADR-007):
`POST /products/variants/:id/stock-movements` (`ADJUST` with `delta`, `reason`, `note` · `STOCKTAKE`
with `countedQuantity`, `note`) and `GET /products/variants/:id/stock-movements` (newest first,
paginated). It refuses stock below the reserved quantity (409).

## Decisions (agreed 2026-11-07)

- In the product form now; a separate all-variants stock page only if bulk stocktakes are needed later.
- Reasons stay as they are: Nhập hàng (+), Hỏng / hết hạn / thất lạc (−), Khách trả hàng (+), Khác (±, note required in the UI).

## Backend (additive)

`listStockMovements` also selects `order: { select: { code: true } }`, so a SALE / CANCEL_RESTOCK row
can link to `/admin/don-hang?ma=<code>` (the orders page opens an order by its code). DB test: after a
COD checkout, the newest movement is `SALE` with `order.code` equal to the order's code.

## Frontend

- `VariantRows`: a saved variant shows "Tồn kho **N** (giữ R)" and an **Điều chỉnh** button (≥ 44px)
  that opens `StockDialog`. The note "Điều chỉnh tồn kho sẽ có ở bước sau" is removed.
- `StockDialog` (`components/admin/products/StockDialog.tsx`): `<dialog>`, bottom sheet on phones,
  centred from md, as `CloseQuoteDialog` (✕ / Escape / backdrop close, focus back to the opener).
  - Header: label + SKU; "Tồn N · Đang giữ R · Bán được N−R".
  - Tab "Nhập / xuất kho": direction **Nhập (+)** / **Xuất (−)**; quantity (positive integer,
    `inputMode="numeric"`); reason filtered by direction (Nhập → PURCHASE, RETURN, OTHER; Xuất →
    DAMAGED, OTHER); note (≤ 500, required for OTHER); preview "Tồn sau điều chỉnh: N → M".
  - Tab "Kiểm kê": counted quantity (integer ≥ 0) and note; preview "Chênh lệch: ±d (N → M)"; a count
    below the reserved quantity is refused in the form (same rule as the backend 409).
  - "Lưu điều chỉnh" disabled while sending. Success: the variant's stock in the form updates in
    place (no reload), a status message shows, history reloads. 409 / 422 messages show in the form.
  - History below the form: 10 per page, "Xem thêm" appends. Each row: date-time, reason in
    Vietnamese (also OPENING "Tồn đầu", SALE "Bán hàng", CANCEL_RESTOCK "Hoàn kho do huỷ đơn",
    STOCKTAKE "Kiểm kê"), delta (+ green / − pink), stock after, who, order link, note.
- `lib/adminStock.ts` (pure, tested): `REASON_LABELS`, `reasonsFor(direction)`, `validateAdjust`,
  `validateStocktake`, `adjustBody`, `stocktakeBody`, `previewAfter`.
- The stock number in the product form (`VariantForm.stock` / `reserved`) is updated through a new
  `onStockChange(id, stock, reserved)` from `VariantRows` to the form state; the product save never
  sends stock (already true: `variantChanges` ignores it).

## Testing

- Vitest for `lib/adminStock.ts`; DB test for `order.code`.
- Browser: Nhập 5 (PURCHASE), Xuất 2 (DAMAGED), Kiểm kê; history matches; count below reserved is
  refused; 390 / 768 / 1024 px, no horizontal overflow.
