// Valid values for the Product.status column, which is a plain String in the schema rather than a
// Prisma enum. Because the database accepts any string, these constants are the only thing keeping
// the column consistent, so every read and write of a status must go through them.

// Lowercase is deliberate here: BlogPost already stores 'draft' / 'published' and changing that
// would mean migrating existing rows for no functional gain. Order and payment statuses introduced
// later use UPPERCASE because they are new tables with no legacy data to match.
export const PRODUCT_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  ARCHIVED: 'archived',
} as const;

export type ProductStatus = (typeof PRODUCT_STATUS)[keyof typeof PRODUCT_STATUS];

export const PRODUCT_STATUS_VALUES = Object.freeze(Object.values(PRODUCT_STATUS));

// Largest value the price and stock columns can hold: they are PostgreSQL `integer` (32-bit). A
// bigger number passed `isInt` and then crashed the INSERT with "value out of range" → 500, so the
// routes validate against this bound instead. 2.1 billion VND is far above any real price.
export const MAX_DB_INT = 2_147_483_647;

export default { PRODUCT_STATUS, PRODUCT_STATUS_VALUES, MAX_DB_INT };
