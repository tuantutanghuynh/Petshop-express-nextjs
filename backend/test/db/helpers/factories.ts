import bcrypt from 'bcryptjs';
import prisma from '../../../services/prisma';
import { signAccessToken } from '../../../services/jwt.service';
import { PRODUCT_STATUS } from '../../../constants/product';
import { recordOpening } from '../../../services/inventory.service';

// Test data builders. Each one creates the smallest valid row and lets a test override only
// the fields it cares about, so a test reads as "a product with 3 in stock" rather than a
// wall of setup. Counters make every slug / email / SKU unique within a test run.

let seq = 0;
const next = () => ++seq;

// The storefront the app serves. resolveBrand accepts a ROOT category (parentId = null) whose
// slug matches the X-Brand-Slug header; its children are the categories products live in.
export const BRAND = 'petshop';

// Idempotent: stress tests build a fresh product in every iteration of a loop, and all of them
// belong to the same storefront, so the brand is created once and reused afterwards.
export async function createBrand(slug = BRAND) {
  const root = await prisma.category.upsert({
    where: { slug },
    create: { name: `Brand ${slug}`, slug },
    update: {},
  });
  const child = await prisma.category.upsert({
    where: { slug: `${slug}-thuc-an` },
    create: { name: `Thức ăn ${slug}`, slug: `${slug}-thuc-an`, parentId: root.id },
    update: {},
  });
  return { root, child };
}

// Low bcrypt cost: only the comparison has to work, and cost 10 would add ~70 ms per user.
export async function createUser(overrides: { email?: string; password?: string; role?: string; fullName?: string } = {}) {
  const n = next();
  const password = overrides.password ?? 'Secret#123';
  const user = await prisma.user.create({
    data: {
      email: overrides.email ?? `user${n}@example.com`,
      passwordHash: await bcrypt.hash(password, 4),
      fullName: overrides.fullName ?? `User ${n}`,
      role: overrides.role ?? 'customer',
    },
  });
  return { ...user, password, token: signAccessToken({ sub: user.id, role: user.role }) };
}

export const createAdmin = () => createUser({ role: 'admin' });

type VariantInput = { price?: number; stock?: number; reserved?: number; sku?: string };

// A product with one or more variants. Prices are integers in VND, as in the schema.
export async function createProduct(
  categoryId: string,
  opts: { status?: string; name?: string; slug?: string; variants?: VariantInput[]; createdAt?: Date } = {},
) {
  const n = next();
  const variants = opts.variants ?? [{}];
  const product = await prisma.product.create({
    data: {
      categoryId,
      name: opts.name ?? `Pate mèo ${n}`,
      slug: opts.slug ?? `pate-meo-${n}`,
      status: opts.status ?? PRODUCT_STATUS.ACTIVE,
      ...(opts.createdAt && { createdAt: opts.createdAt }),
      variants: {
        create: variants.map((v, i) => ({
          sku: v.sku ?? `SKU-${n}-${i}`,
          variantKey: v.sku ?? `SKU-${n}-${i}`,
          price: v.price ?? 50_000,
          stockQuantity: v.stock ?? 10,
          reservedQuantity: v.reserved ?? 0,
        })),
      },
    },
    include: { variants: { orderBy: { sku: 'asc' } } },
  });
  // Same opening balance the API writes on creation (ADR-007), so ledger invariants hold for
  // factory-made products too.
  await prisma.$transaction(async (tx) => {
    for (const v of product.variants) await recordOpening(tx, v.id, null);
  });
  return product;
}

// Puts lines straight into a user's cart, bypassing the HTTP layer, for tests whose subject is
// checkout rather than the cart API itself.
export async function fillCart(userId: string, lines: { variantId: string; quantity: number }[], brandSlug = BRAND) {
  const cart = await prisma.cart.upsert({
    where: { userId_brandSlug: { userId, brandSlug } },
    create: { userId, brandSlug },
    update: {},
  });
  for (const line of lines) {
    await prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId: line.variantId } },
      create: { cartId: cart.id, variantId: line.variantId, quantity: line.quantity },
      update: { quantity: line.quantity },
    });
  }
  return cart;
}

export const validShipping = {
  fullName: 'Nguyễn Thị Ánh',
  phone: '0901234567',
  addressLine: '12 Lê Lợi, Phường Bến Nghé',
  city: 'TP. Hồ Chí Minh',
};

export function orderBody(paymentMethod: 'COD' | 'BANK_TRANSFER' = 'COD') {
  return { paymentMethod, shippingAddress: validShipping };
}
