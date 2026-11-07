import type { FieldErrors } from './forms';

// Stock adjustments in the product form (spec 2026-11-07 D2, test/adminStock.test.ts). The stock
// ledger is the backend's (POST /products/variants/:id/stock-movements, ADR-007): it refuses stock
// below the reserved units with 409 and only accepts these reasons from an admin. These rules catch
// mistakes before the round trip and turn the form into the request body.

export type Direction = 'in' | 'out';
export type AdjustInput = { quantity: string; reason: string; note: string };
export type StocktakeInput = { counted: string; note: string };

const MAX_DB_INT = 2_147_483_647; // Postgres INT, the stock column
const MAX_NOTE = 500;

// Every reason the ledger can hold, including those only the system writes.
export const REASON_LABELS: Record<string, string> = {
  OPENING: 'Tồn đầu',
  PURCHASE: 'Nhập hàng',
  DAMAGED: 'Hỏng / hết hạn / thất lạc',
  RETURN: 'Khách trả hàng',
  OTHER: 'Khác',
  STOCKTAKE: 'Kiểm kê',
  SALE: 'Bán hàng',
  CANCEL_RESTOCK: 'Hoàn kho do huỷ đơn',
};

const REASONS_BY_DIRECTION: Record<Direction, string[]> = { in: ['PURCHASE', 'RETURN', 'OTHER'], out: ['DAMAGED', 'OTHER'] };

export function reasonsFor(direction: Direction): { value: string; label: string }[] {
  return REASONS_BY_DIRECTION[direction].map((value) => ({ value, label: REASON_LABELS[value] }));
}

// A plain non-negative integer that fits the stock column, or null.
export function parseCount(text: string): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n <= MAX_DB_INT ? n : null;
}

const noteError = (note: string) => (note.length > MAX_NOTE ? 'Ghi chú tối đa 500 ký tự' : undefined);

export function validateAdjust(v: AdjustInput): FieldErrors {
  const errors: FieldErrors = {};
  const quantity = parseCount(v.quantity);
  if (quantity === null || quantity === 0) errors.quantity = 'Nhập số lượng lớn hơn 0';
  if (!v.reason) errors.reason = 'Chọn lý do';
  // Without a note an "OTHER" line in the history explains nothing.
  if (v.reason === 'OTHER' && !v.note.trim()) errors.note = 'Ghi rõ lý do khi chọn “Khác”';
  const tooLong = noteError(v.note);
  if (tooLong) errors.note = tooLong;
  return errors;
}

export function validateStocktake(v: StocktakeInput, reserved: number): FieldErrors {
  const errors: FieldErrors = {};
  const counted = parseCount(v.counted);
  if (counted === null) errors.counted = 'Nhập số đếm được (0 trở lên)';
  else if (counted < reserved) errors.counted = `Không thể thấp hơn ${reserved} đang giữ cho đơn chờ thanh toán`;
  const tooLong = noteError(v.note);
  if (tooLong) errors.note = tooLong;
  return errors;
}

const cleanNote = (note: string) => note.trim() || null;

export function adjustBody(direction: Direction, v: AdjustInput) {
  const quantity = parseCount(v.quantity) ?? 0;
  return { type: 'ADJUST' as const, delta: direction === 'in' ? quantity : -quantity, reason: v.reason, note: cleanNote(v.note) };
}

export function stocktakeBody(v: StocktakeInput) {
  return { type: 'STOCKTAKE' as const, countedQuantity: parseCount(v.counted) ?? 0, note: cleanNote(v.note) };
}

export type Change = { kind: 'adjust'; direction: Direction; quantity: string } | { kind: 'stocktake'; counted: string };

// The stock the change would leave, for the preview line; null while the input is not a number.
export function previewAfter(stock: number, change: Change): number | null {
  if (change.kind === 'stocktake') return parseCount(change.counted);
  const quantity = parseCount(change.quantity);
  if (quantity === null) return null;
  return change.direction === 'in' ? stock + quantity : stock - quantity;
}
