// Reasons recorded in "InventoryMovement" (ADR-007). Plain strings in the schema, so these constants
// are the only thing keeping the column consistent.
export const MOVEMENT_REASON = {
  OPENING: 'OPENING', // stock a variant was created with
  PURCHASE: 'PURCHASE', // goods received
  DAMAGED: 'DAMAGED', // broken, expired, lost
  RETURN: 'RETURN', // a customer brought goods back outside an order cancellation
  OTHER: 'OTHER', // anything else; the note says what
  STOCKTAKE: 'STOCKTAKE', // physical count minus system stock
  SALE: 'SALE', // stock left with an order (COD checkout or confirmed bank transfer)
  CANCEL_RESTOCK: 'CANCEL_RESTOCK', // a cancelled order whose stock had already left
} as const;

export type MovementReason = (typeof MOVEMENT_REASON)[keyof typeof MOVEMENT_REASON];

// Reasons an admin may pick for a manual delta. SALE, CANCEL_RESTOCK and OPENING are written only
// by the system, so a manual adjustment can never be disguised as an order movement in reports.
export const ADJUST_REASONS = [
  MOVEMENT_REASON.PURCHASE,
  MOVEMENT_REASON.DAMAGED,
  MOVEMENT_REASON.RETURN,
  MOVEMENT_REASON.OTHER,
] as const;

export const STOCK_MOVEMENT_TYPE = { ADJUST: 'ADJUST', STOCKTAKE: 'STOCKTAKE' } as const;

export default { MOVEMENT_REASON, ADJUST_REASONS, STOCK_MOVEMENT_TYPE };
