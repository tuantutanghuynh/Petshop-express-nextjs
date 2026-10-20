import type { PrismaClient } from '@prisma/client';
import { PRODUCT_STATUS } from '../constants/product';
import { recordOpening } from '../services/inventory.service';
import { refreshMinPrice } from '../services/catalog.service';
import { toSearchText } from '../utils/searchText';
import { applyCategoryTree } from './categoryTree';

// Demo catalogue for LOCAL development only (run through scripts/seedPetshop.ts, which refuses any
// non-local database). Categories come from the shared tree (scripts/categoryTree.ts); products sit
// on its leaves (or on a group when no leaf fits). It gives the storefront something real to render: several variants, a real
// discount (compareAtPrice > price), an out-of-stock product and a spec table. Product names are
// generic and brand is left empty — no invented brands or claims. Every description says it is
// sample data, so a screenshot can never pass it off as the real shop.
//
// Remove it again (local DB only): delete the products, variants, images and ledger rows of the
// products below — or simply recreate the local database.

type SeedVariant = { sku: string; label: string; price: number; compareAtPrice?: number; stock: number };
type SeedProduct = { slug: string; name: string; category: string; summary: string; attributes?: Record<string, string>; variants: SeedVariant[] };

const FOOD_ATTRS = [
  { key: 'khoi_luong', label: 'Khối lượng' },
  { key: 'do_tuoi', label: 'Độ tuổi phù hợp' },
  { key: 'xuat_xu', label: 'Xuất xứ' },
];

export const PRODUCTS: SeedProduct[] = [
  { slug: 'hat-cho-cho-truong-thanh-vi-ga', name: 'Hạt cho chó trưởng thành vị gà & gạo', category: 'hat-cho-cho',
    summary: 'Hạt khô cho chó trên 12 tháng tuổi.', attributes: { khoi_luong: '2kg / 5kg', do_tuoi: 'Trên 12 tháng', xuat_xu: 'Việt Nam' },
    variants: [{ sku: 'DEMO-HAT-CHO-2KG', label: '2kg', price: 289000, stock: 25 }, { sku: 'DEMO-HAT-CHO-5KG', label: '5kg', price: 659000, stock: 10 }] },
  { slug: 'hat-cho-meo-con', name: 'Hạt cho mèo con', category: 'thuc-an-cho-meo-con',
    summary: 'Hạt nhỏ, mềm cho mèo từ 2 đến 12 tháng tuổi.', attributes: { khoi_luong: '1.5kg', do_tuoi: '2–12 tháng', xuat_xu: 'Thái Lan' },
    variants: [{ sku: 'DEMO-HAT-MEO-CON-15', label: '1.5kg', price: 215000, compareAtPrice: 245000, stock: 18 }] },
  { slug: 'hat-cho-meo-truong-thanh', name: 'Hạt cho mèo trưởng thành vị cá hồi', category: 'hat-cho-meo',
    summary: 'Hạt khô vị cá hồi cho mèo trên 1 tuổi.', attributes: { khoi_luong: '1.2kg', do_tuoi: 'Trên 12 tháng', xuat_xu: 'Hàn Quốc' },
    variants: [{ sku: 'DEMO-HAT-MEO-12', label: '1.2kg', price: 189000, stock: 0 }] },
  { slug: 'pate-meo-ca-ngu', name: 'Pate mèo vị cá ngừ', category: 'pate-cho-meo',
    summary: 'Pate dạng mịn cho mèo mọi lứa tuổi.', attributes: { khoi_luong: '85g / 170g', do_tuoi: 'Mọi lứa tuổi', xuat_xu: 'Thái Lan' },
    variants: [{ sku: 'DEMO-PATE-MEO-85', label: 'Gói 85g', price: 18000, stock: 120 }, { sku: 'DEMO-PATE-MEO-170', label: 'Lon 170g', price: 28000, stock: 60 }] },
  { slug: 'pate-cho-vi-bo', name: 'Pate cho chó vị bò', category: 'pate-cho-cho',
    summary: 'Pate thịt bò cho chó, trộn cùng hạt hoặc ăn riêng.', attributes: { khoi_luong: '400g', do_tuoi: 'Trên 6 tháng', xuat_xu: 'Việt Nam' },
    variants: [{ sku: 'DEMO-PATE-CHO-400', label: 'Lon 400g', price: 45000, compareAtPrice: 52000, stock: 40 }] },
  { slug: 'cat-ve-sinh-cho-meo-von-cuc', name: 'Cát vệ sinh cho mèo vón cục', category: 'cat-ve-sinh',
    summary: 'Cát đất sét vón cục, ít bụi.',
    variants: [{ sku: 'DEMO-CAT-5L', label: '5L', price: 95000, stock: 30 }, { sku: 'DEMO-CAT-10L', label: '10L', price: 164000, compareAtPrice: 193000, stock: 22 }] },
  { slug: 'can-cau-do-choi-cho-meo', name: 'Cần câu đồ chơi cho mèo', category: 'do-choi-cho-meo',
    summary: 'Cần câu lông vũ giúp mèo vận động.',
    variants: [{ sku: 'DEMO-CAN-CAU', label: 'Mặc định', price: 39000, stock: 50 }] },
  { slug: 'bong-do-choi-tuong-tac-cho-cho', name: 'Bóng đồ chơi tương tác cho chó', category: 'cho-do-choi',
    summary: 'Bóng cao su có ngăn đựng bánh thưởng.',
    variants: [{ sku: 'DEMO-BONG-S', label: 'Size S', price: 89000, stock: 35 }, { sku: 'DEMO-BONG-M', label: 'Size M', price: 119000, stock: 20 }] },
  { slug: 'banh-thuong-cho-cho', name: 'Bánh thưởng cho chó vị sữa', category: 'banh-thuong-cho-cho',
    summary: 'Bánh thưởng dùng khi huấn luyện.',
    variants: [{ sku: 'DEMO-BANH-THUONG', label: 'Túi 200g', price: 65000, stock: 45 }] },
  { slug: 'day-dat-vong-co-cho-cho', name: 'Bộ dây dắt và vòng cổ cho chó', category: 'vong-co-day-dat',
    summary: 'Dây dắt dài 1.2m kèm vòng cổ điều chỉnh được.',
    variants: [{ sku: 'DEMO-DAY-DAT-S', label: 'Size S', price: 129000, stock: 15 }, { sku: 'DEMO-DAY-DAT-M', label: 'Size M', price: 149000, stock: 0 }] },
  { slug: 'dem-ngu-em-cho-cho-meo', name: 'Đệm ngủ êm cho chó mèo', category: 'nem-chuong',
    summary: 'Đệm tròn, vỏ tháo giặt được.',
    variants: [{ sku: 'DEMO-DEM-50', label: '50cm', price: 249000, stock: 8 }, { sku: 'DEMO-DEM-70', label: '70cm', price: 329000, stock: 5 }] },
  { slug: 'sua-tam-cho-cho-meo', name: 'Sữa tắm cho chó mèo da nhạy cảm', category: 'sua-tam-cho-cho',
    summary: 'Sữa tắm dịu nhẹ, mùi nhẹ.',
    variants: [{ sku: 'DEMO-SUA-TAM-300', label: 'Chai 300ml', price: 99000, stock: 26 }] },
  { slug: 'bo-cham-soc-long-5-mon', name: 'Bộ dụng cụ chải lông 5 món', category: 'cho-ve-sinh-suc-khoe',
    summary: 'Lược, kéo tỉa, bấm móng và khăn lau.',
    variants: [{ sku: 'DEMO-CHAI-LONG', label: 'Mặc định', price: 224000, stock: 0 }] },
];

const DEMO_NOTE = '> Dữ liệu mẫu cho môi trường phát triển — không phải sản phẩm đang bán.';

function descriptionOf(p: SeedProduct): string {
  return `${p.summary}\n\n${DEMO_NOTE}`;
}

// Food leaves that carry demo spec values (khoi_luong, do_tuoi, xuat_xu) — local demo data only.
const DEMO_FOOD_LEAVES = ['hat-cho-cho', 'hat-cho-meo', 'thuc-an-cho-meo-con', 'pate-cho-cho', 'pate-cho-meo'];
// Flat demo categories used before the category tree; removed once nothing points at them.
export const OLD_DEMO_CATEGORY_SLUGS = ['thuc-an-hat', 'pate', 'phu-kien', 'suc-khoe'];

export async function attachDemoAttributes(db: PrismaClient): Promise<void> {
  for (const slug of DEMO_FOOD_LEAVES) {
    const cat = await db.category.findUniqueOrThrow({ where: { slug }, select: { id: true } });
    for (const a of FOOD_ATTRS) {
      const exists = await db.categoryAttribute.findFirst({ where: { categoryId: cat.id, attributeKey: a.key } });
      if (!exists) {
        await db.categoryAttribute.create({ data: { categoryId: cat.id, attributeKey: a.key, attributeLabel: a.label, attributeType: 'text' } });
      }
    }
  }
}

// A database seeded before the tree still holds demo products on the old flat categories.
export async function moveDemoProducts(db: PrismaClient): Promise<number> {
  let moved = 0;
  for (const p of PRODUCTS) {
    const cat = await db.category.findUniqueOrThrow({ where: { slug: p.category }, select: { id: true } });
    const { count } = await db.product.updateMany({ where: { slug: p.slug, categoryId: { not: cat.id } }, data: { categoryId: cat.id } });
    moved += count;
  }
  return moved;
}

// Deletes an old flat category only when no product, post or photo points at it; reports what it removed.
export async function removeOldDemoCategories(db: PrismaClient): Promise<string[]> {
  const removed: string[] = [];
  for (const slug of OLD_DEMO_CATEGORY_SLUGS) {
    const cat = await db.category.findUnique({
      where: { slug },
      select: { id: true, _count: { select: { products: true, blogPosts: true, galleryItems: true } } },
    });
    if (!cat || cat._count.products + cat._count.blogPosts + cat._count.galleryItems > 0) continue;
    await db.$transaction([db.categoryAttribute.deleteMany({ where: { categoryId: cat.id } }), db.category.delete({ where: { id: cat.id } })]);
    removed.push(slug);
  }
  return removed;
}

// Idempotent: the category tree is upserted by slug; a product whose slug already exists is skipped
// entirely, so running the seed again never resets stock that local testing has changed.
export async function seedPetshopCatalog(db: PrismaClient): Promise<{ created: number; skipped: number }> {
  await applyCategoryTree(db);
  await attachDemoAttributes(db);
  const used = await db.category.findMany({ where: { slug: { in: [...new Set(PRODUCTS.map((p) => p.category))] } }, select: { id: true, slug: true } });
  const categoryIds = new Map(used.map((c) => [c.slug, c.id]));

  let created = 0;
  let skipped = 0;
  for (const p of PRODUCTS) {
    const categoryId = categoryIds.get(p.category);
    if (!categoryId) throw new Error(`Seed data error: product ${p.slug} uses unknown category ${p.category}`);
    if (await db.product.findUnique({ where: { slug: p.slug }, select: { id: true } })) {
      skipped += 1;
      continue;
    }
    // One transaction per product: the product, its variants and their OPENING ledger rows land
    // together, keeping sum(delta) = stockQuantity for every variant.
    await db.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          slug: p.slug,
          name: p.name,
          searchName: toSearchText(p.name),
          description: descriptionOf(p),
          status: PRODUCT_STATUS.ACTIVE,
          attributes: p.attributes ?? {},
          categoryId,
        },
      });
      for (const v of p.variants) {
        const variant = await tx.productVariant.create({
          data: {
            productId: product.id,
            sku: v.sku,
            variantKey: v.sku,
            price: v.price,
            compareAtPrice: v.compareAtPrice ?? null,
            stockQuantity: v.stock,
            variantAttributes: { label: v.label },
          },
        });
        await recordOpening(tx, variant.id, null);
      }
      await refreshMinPrice(tx, product.id);
    });
    created += 1;
  }
  await moveDemoProducts(db);
  await removeOldDemoCategories(db);
  return { created, skipped };
}
