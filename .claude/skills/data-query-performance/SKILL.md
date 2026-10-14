---
name: data-query-performance
description: Dùng khi viết hoặc review API danh sách, filter, sort, pagination, vòng lặp và data fetching trong Express + Next.js + TypeScript, để giảm tải server mà giao diện vẫn mượt.
---

# Tối ưu vòng lặp, truy vấn và danh sách (filter · sort · pagination) cho Express + Next.js + TypeScript

Mục tiêu kép: **server khoẻ** (ít query, ít CPU / RAM, không nghẽn event loop) và **người dùng thấy mượt** (phản hồi nhanh, không giật, không mất trạng thái lọc).

## 1. Khi nào dùng / không dùng

**Dùng khi:**
- Tạo hoặc sửa endpoint danh sách, tìm kiếm, lọc, sắp xếp, phân trang.
- Viết vòng lặp có `await`, xử lý mảng lớn, import / export, gọi API ngoài hàng loạt.
- Làm màn hình bảng / danh sách, ô tìm kiếm, bộ lọc, infinite scroll ở Next.js.
- Review hiệu năng: API chậm, DB quá tải, giao diện giật.

**Không dùng khi:** danh sách cố định vài chục dòng và không tăng; hoặc muốn "tối ưu" khi chưa có số đo nào (xem nguyên tắc 1).

## 2. Nguyên tắc

1. **Đo trước, tối ưu sau.** Không thêm cache hay thư viện khi chưa có số đo chỉ ra chỗ nghẽn. Không hứa con số cải thiện trước khi đo.
2. **Thứ tự ưu tiên, từ rẻ đến đắt:** (a) lấy ít dữ liệu hơn (`select`, `limit`) → (b) query đúng + index → (c) bỏ N+1 và vòng lặp tuần tự → (d) HTTP cache / CDN → (e) cache ứng dụng (Redis) → (f) hàng đợi / worker. Không nhảy tới (e) khi chưa làm xong (a)–(c).
3. **Lọc, sắp xếp, phân trang ở database**, không làm bằng JavaScript sau khi đã lấy hết dữ liệu. Chỉ làm phía client khi toàn bộ danh sách nhỏ, cố định (dưới vài trăm dòng) và đã tải sẵn.
4. **Mọi list endpoint có giới hạn cứng:** `limit` tối đa, whitelist trường được sort / filter.
5. **URL là nguồn sự thật** của filter / sort / page ở frontend: chia sẻ link được, back / forward đúng, render phía server được.
6. Thêm thư viện phải **hỏi trước**; thêm index là **migration** (theo CLAUDE.md của project, đây là việc nhạy cảm).
7. Nếu CLAUDE.md có "chế độ hướng dẫn" (mục 0.1): trình bày đủ 4 phần (thư mục & file → giải thích → code mẫu → test cần chạy), **không tự sửa file**, đưa lệnh đo để người dùng chạy và dán kết quả.

## 3. Quy trình mỗi task

1. **Hỏi quy mô** (thiếu thì hỏi, không đoán): số dòng hiện tại và dự kiến 1–2 năm, tần suất gọi, ai gọi (public / nội bộ), phiên bản Next / Prisma / Express.
2. **Chọn kiểu phân trang** theo mục 4.
3. **Chốt contract query** theo mục 5.
4. **Viết query + index**, kiểm tra bằng `EXPLAIN` (mục 6).
5. **Rà vòng lặp** theo mục 7.
6. **Chọn tầng cache** chỉ khi số đo yêu cầu (mục 8).
7. **Frontend:** state trên URL, giữ dữ liệu cũ khi chuyển trang, debounce, virtualize (mục 9).
8. **Đo lại**, so trước / sau (mục 11). Ghi quyết định lớn vào `DECISIONS.md`.

## 4. Offset hay cursor?

| | Offset (`page` + `limit`) | Cursor / keyset (`cursor` + `limit`) |
|---|---|---|
| Hợp với | Bảng quản trị, cần nhảy tới trang N, cần tổng số trang | Feed, infinite scroll, bảng rất lớn, dữ liệu thêm liên tục |
| Chi phí | Tăng dần theo offset (DB vẫn phải đi qua các dòng bị bỏ) | Gần như không đổi dù ở sâu tới đâu |
| Tổng số (`COUNT`) | Cần, và đắt trên bảng lớn | Không cần: lấy dư 1 dòng để biết còn trang sau |
| Dữ liệu chèn giữa chừng | Có thể lặp / sót dòng | Ổn định |
| Nhảy tới trang bất kỳ | Được | Không |

Mặc định: bảng quản trị dưới vài trăm nghìn dòng dùng **offset**; danh sách public dạng cuộn và bảng lớn dùng **cursor**. Với offset trên bảng lớn: giới hạn số trang tối đa, hoặc bỏ `total` chính xác (đếm ước lượng / cache `total` vài phút).

## 5. Contract query (thống nhất giữa backend và frontend)

```
GET /api/v1/products?page=2&limit=20&sort=-createdAt&status=active&q=gom&minPrice=100000
GET /api/v1/products?cursor=<id>&limit=20&sort=-createdAt
```

- `limit`: mặc định 20, **tối đa 100**. `page` ≥ 1.
- `sort`: `field` = tăng dần, `-field` = giảm dần; chỉ nhận field trong **whitelist** (các cột đã có index phù hợp).
- Luôn thêm `id` làm **tie-breaker** để thứ tự ổn định giữa các trang.
- Filter: chỉ nhận field đã khai báo; kiểu dữ liệu được ép và kiểm tra bằng schema.
- `q`: cắt khoảng trắng, tối thiểu 2 ký tự, tối đa 100.
- Response: `{ success, data: [...], meta }` với `meta = { page, limit, total, totalPages }` (offset) hoặc `{ limit, hasNext, nextCursor }` (cursor).

## 6. Backend (Express + Prisma + PostgreSQL)

### B1. Schema validate + whitelist sort

```ts
// backend/src/modules/product/product.schema.ts
import { z } from 'zod';

export const SORTABLE_FIELDS = ['createdAt', 'price', 'name'] as const;
export type SortField = (typeof SORTABLE_FIELDS)[number];

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().default('-createdAt'),
  q: z.string().trim().min(2).max(100).optional(),
  status: z.enum(['active', 'draft', 'archived']).optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

export function parseSort(sort: string): { field: SortField; direction: 'asc' | 'desc' } {
  const direction = sort.startsWith('-') ? 'desc' : 'asc';
  const raw = sort.replace(/^-/, '');
  // unknown field falls back to the default instead of reaching the database
  const field = (SORTABLE_FIELDS as readonly string[]).includes(raw) ? (raw as SortField) : 'createdAt';
  return { field, direction };
}
```

Trong controller: `const query = listProductsQuerySchema.parse(req.query);` rồi truyền `query` xuống service. Express 5 coi `req.query` là chỉ đọc, nên **không gán ngược** kết quả vào `req.query`.

### B2. Phân trang offset: chỉ lấy cột cần, đếm song song

```ts
// backend/src/modules/product/product.service.ts
import { Prisma } from '@prisma/client'; // đường dẫn import tuỳ phiên bản Prisma

const ORDER_BY: Record<SortField, (d: Prisma.SortOrder) => Prisma.ProductOrderByWithRelationInput> = {
  createdAt: (d) => ({ createdAt: d }),
  price: (d) => ({ price: d }),
  name: (d) => ({ name: d }),
};

export async function listProducts(query: ListProductsQuery) {
  const { page, limit, q, status, minPrice, maxPrice } = query;
  const { field, direction } = parseSort(query.sort);

  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    ...(status && { status }),
    ...(q && { name: { contains: q, mode: 'insensitive' } }),
    ...((minPrice !== undefined || maxPrice !== undefined) && {
      price: { gte: minPrice, lte: maxPrice },
    }),
  };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [ORDER_BY[field](direction), { id: direction }], // id = tie-breaker
      skip: (page - 1) * limit,
      take: limit,
      // list view: only the columns the table shows, never the whole row
      select: { id: true, name: true, slug: true, price: true, status: true, createdAt: true },
    }),
    prisma.product.count({ where }),
  ]);

  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}
```

### B3. Phân trang cursor: không cần `COUNT`

```ts
export async function listProductsByCursor(params: { cursor?: string; limit: number }) {
  const { cursor, limit } = params;

  const rows = await prisma.product.findMany({
    where: { deletedAt: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1, // one extra row tells us whether a next page exists
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    select: { id: true, name: true, slug: true, price: true, createdAt: true },
  });

  const hasNext = rows.length > limit;
  const items = hasNext ? rows.slice(0, limit) : rows;
  const nextCursor = hasNext ? items[items.length - 1].id : null;

  return { items, meta: { limit, hasNext, nextCursor } };
}
```

### B4. Index khớp với filter + sort, và cách kiểm tra

```sql
-- khớp truy vấn hay dùng nhất: WHERE status = ? ORDER BY created_at DESC, id DESC
CREATE INDEX idx_products_status_created
  ON products (status, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

-- tìm kiếm kiểu ILIKE '%tu khoa%': index btree không dùng được, cần pg_trgm
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_products_name_trgm ON products USING gin (name gin_trgm_ops);

-- kiểm tra kế hoạch thực thi (chạy trên DB dev có lượng dữ liệu gần thật)
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, name, price FROM products
WHERE status = 'active' AND deleted_at IS NULL
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

Đọc kết quả: `Seq Scan` trên bảng lớn, nút `Sort` tốn nhiều bộ nhớ, hoặc `Rows Removed by Filter` rất lớn là dấu hiệu thiếu index phù hợp. Mỗi index làm chậm thao tác ghi, nên chỉ tạo cho truy vấn thật sự hay dùng. Bảng lớn đang chạy thật: dùng `CREATE INDEX CONCURRENTLY` (không chạy trong transaction) và hỏi người dùng trước.

Tìm kiếm: cần xếp hạng theo độ liên quan thì dùng full-text của PostgreSQL (`tsvector` + GIN). Chỉ cân nhắc engine riêng (Meilisearch, Typesense, Elasticsearch) khi cần gõ sai vẫn tìm ra, gợi ý, hoặc dữ liệu rất lớn.

## 7. Vòng lặp: các lỗi tốn tài nguyên nhất

| Lỗi | Vì sao tốn | Cách sửa |
|---|---|---|
| Query trong vòng lặp (N+1) | 1 request thành N+1 query | Gom id, 1 query `IN`, ghép bằng `Map` |
| `await` tuần tự cho việc độc lập | Thời gian cộng dồn | `Promise.all`, có giới hạn đồng thời |
| `Promise.all` trên hàng nghìn phần tử | Cạn connection pool, bị API ngoài chặn | `p-limit` hoặc chia lô |
| `array.find` / `includes` lồng trong vòng lặp | O(n²) | Dựng `Map` / `Set` một lần |
| Ghi từng dòng | N lần round-trip | `createMany` / `updateMany` / transaction theo lô |
| Nạp cả bảng vào RAM | Tốn bộ nhớ, dễ sập | Duyệt theo lô bằng cursor, hoặc stream |
| Tính toán nặng trên luồng chính | Nghẽn event loop, mọi request khác phải chờ | `worker_threads` / hàng đợi |
| `.filter().map().sort()` trên dữ liệu lẽ ra DB xử lý | Kéo thừa dữ liệu về | Đẩy điều kiện xuống query |

```ts
// SAI: N+1
for (const order of orders) {
  order.customer = await prisma.customer.findUnique({ where: { id: order.customerId } });
}

// ĐÚNG: 1 query + Map
const customerIds = [...new Set(orders.map((o) => o.customerId))];
const customers = await prisma.customer.findMany({
  where: { id: { in: customerIds } },
  select: { id: true, name: true },
});
const customerById = new Map(customers.map((c) => [c.id, c]));
const result = orders.map((o) => ({ ...o, customer: customerById.get(o.customerId) ?? null }));
```

Nếu quan hệ đã khai báo trong schema, dùng `include` / `select` lồng nhau để Prisma tự gom, không cần tự ghép.

```ts
// gọi API ngoài với tối đa 5 request cùng lúc (p-limit là gói ESM-only)
import pLimit from 'p-limit';

const limit = pLimit(5);
const results = await Promise.all(items.map((item) => limit(() => callExternalApi(item))));
```

```ts
// duyệt bảng lớn theo lô, không nạp hết vào RAM
let cursor: string | undefined;
for (;;) {
  const batch = await prisma.order.findMany({
    take: 1000,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    orderBy: { id: 'asc' },
    select: { id: true, total: true },
  });
  if (batch.length === 0) break;
  await handleBatch(batch);
  cursor = batch[batch.length - 1].id;
}
```

Việc mất quá vài giây (xuất báo cáo, import file, gửi email hàng loạt) không nên chạy trong request: đưa vào hàng đợi, trả ngay mã theo dõi, cho client hỏi lại trạng thái.

## 8. Cache và bảo vệ server

| Tầng | Dùng khi | Công cụ | Lưu ý |
|---|---|---|---|
| HTTP cache / CDN | `GET` công khai, giống nhau cho mọi người | `Cache-Control` (`s-maxage`, `stale-while-revalidate`), ETag | Không dùng cho dữ liệu theo người dùng |
| Cache của Next.js | Trang / dữ liệu public | `fetch` với `next: { revalidate, tags }`, `revalidateTag` | Cú pháp đổi theo phiên bản Next |
| Cache phía client | Điều hướng qua lại giữa các trang danh sách | TanStack Query (`staleTime`) | Không thay cho cache server |
| Cache trong tiến trình | Dữ liệu nhỏ, ít đổi (cấu hình, danh mục), chạy 1 instance | `lru-cache` | Nhiều instance thì mỗi cái một bản |
| Redis | Query đắt, nhiều instance, đã đo thấy cần | `ioredis` | Phải có TTL và cách xoá khi dữ liệu đổi |

```ts
// backend/src/utils/cache.ts — cache-aside tối giản
import type { Redis } from 'ioredis';

export async function cached<T>(
  redis: Redis,
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<T> {
  const hit = await redis.get(key);
  if (hit !== null) return JSON.parse(hit) as T;

  const value = await load();
  await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  return value;
}
```

Quy tắc cache: key dựng từ tham số **đã chuẩn hoá và sắp xếp**; không dùng chung key cho dữ liệu theo người dùng; TTL ngắn (30–300 giây) cho danh sách; xoá key khi ghi; nhớ rằng `Date` / `Decimal` thành chuỗi sau `JSON.parse`; Redis lỗi thì đi thẳng xuống DB, không làm sập request.

**Bảo vệ server (rẻ, nên có sớm):**
- `express-rate-limit` cho endpoint tìm kiếm và endpoint công khai (nhiều instance thì dùng store Redis).
- `express.json({ limit: '100kb' })`; giới hạn độ dài `q`; `limit` tối đa 100.
- Timeout cho request và cho query (`statement_timeout` của PostgreSQL); mọi lời gọi API ngoài đều có timeout.
- Kích thước connection pool hợp lý; nhiều instance thì cân nhắc PgBouncer.
- Nén response bằng `compression` hoặc để reverse proxy / CDN làm (không nén hai lần).

## 9. Frontend (Next.js App Router)

### F1. Lần tải đầu: Server Component đọc URL và lấy đúng một trang

```tsx
// frontend/src/app/products/page.tsx
// Next 15+: searchParams là Promise. Next 14: object thường, bỏ await.
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ProductsPage({ searchParams }: Props) {
  const params = productListParamsSchema.parse(await searchParams); // cùng quy tắc với backend
  const { items, meta } = await getProducts(params); // services/products.ts gọi Express

  return (
    <>
      <ProductFilters />
      <ProductTable items={items} />
      <Pagination meta={meta} />
    </>
  );
}
```

Các lời gọi độc lập trong cùng trang: chạy song song bằng `Promise.all`, không `await` lần lượt (tránh "thác nước" request).

### F2. Filter / sort / page nằm trên URL, có debounce

```tsx
// frontend/src/components/products/ProductFilters.tsx
'use client';

import { useTransition } from 'react';
import { debounce, parseAsInteger, parseAsString, useQueryStates } from 'nuqs';

export function ProductFilters() {
  const [isPending, startTransition] = useTransition();
  const [filters, setFilters] = useQueryStates(
    {
      q: parseAsString.withDefault(''),
      status: parseAsString.withDefault(''),
      page: parseAsInteger.withDefault(1),
    },
    // shallow: false => Server Component chạy lại với URL mới
    { shallow: false, startTransition },
  );

  return (
    <input
      type="search"
      value={filters.q}
      aria-busy={isPending}
      onChange={(e) =>
        // đổi từ khoá thì quay về trang 1; chỉ cập nhật URL sau khi ngừng gõ 300ms
        setFilters({ q: e.target.value, page: 1 }, { limitUrlUpdates: debounce(300) })
      }
    />
  );
}
```

Cần bọc ứng dụng bằng `NuqsAdapter` (`nuqs/adapters/next/app`) trong root layout. `limitUrlUpdates` có từ nuqs 2.5; bản cũ hơn dùng `throttleMs`. Kiểm tra phiên bản trước khi đưa code.

### F3. Bảng tương tác phía client: giữ trang cũ, huỷ request cũ, tải trước trang sau

```tsx
'use client';

import { useEffect } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';

const { data, isFetching, isPlaceholderData } = useQuery({
  queryKey: ['products', params], // params: object đã chuẩn hoá
  queryFn: ({ signal }) => fetchProducts(params, signal), // signal: huỷ request cũ khi params đổi
  placeholderData: keepPreviousData, // giữ dữ liệu trang cũ trên màn hình trong lúc tải trang mới
  staleTime: 30_000, // quay lại trang vừa xem trong 30 giây thì không gọi lại
});

const queryClient = useQueryClient();
useEffect(() => {
  if (data && params.page < data.meta.totalPages) {
    const next = { ...params, page: params.page + 1 };
    void queryClient.prefetchQuery({
      queryKey: ['products', next],
      queryFn: ({ signal }) => fetchProducts(next, signal),
      staleTime: 30_000,
    });
  }
}, [data, params, queryClient]);
```

Dùng `isPlaceholderData` để làm mờ bảng và khoá nút "trang sau" trong lúc chờ. Bảng có sort / filter phía server dùng `@tanstack/react-table` thì bật `manualPagination`, `manualSorting`, `manualFiltering`.

### F4. Infinite scroll với cursor

```tsx
const query = useInfiniteQuery({
  queryKey: ['products', 'infinite', filters],
  queryFn: ({ pageParam, signal }) => fetchProductsByCursor({ ...filters, cursor: pageParam }, signal),
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (lastPage) => lastPage.meta.nextCursor ?? undefined,
});
```

### F5. Danh sách dài: chỉ vẽ các dòng đang nhìn thấy

```tsx
const parentRef = useRef<HTMLDivElement>(null);
const virtualizer = useVirtualizer({
  count: rows.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 48, // chiều cao ước lượng của một dòng (px)
  overscan: 8,
});

return (
  <div ref={parentRef} style={{ height: 600, overflow: 'auto' }}>
    <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
      {virtualizer.getVirtualItems().map((v) => (
        <div
          key={v.key}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: v.size, transform: `translateY(${v.start}px)` }}
        >
          <Row item={rows[v.index]} />
        </div>
      ))}
    </div>
  </div>
);
```

Virtualize và infinite scroll **không hợp với trang public cần SEO**: nội dung ngoài vùng nhìn không có trong HTML. Danh sách public dùng phân trang bằng URL thật.

### F6. Vòng lặp trong React

- Không lọc / sắp xếp mảng lớn ngay trong thân component ở mỗi lần render: đẩy xuống server, hoặc `useMemo` với dependency đúng.
- `key` ổn định bằng `id`, không dùng index của mảng cho danh sách có thêm / xoá / sắp xếp.
- Tách dòng thành component riêng để chỉ dòng thay đổi mới render lại; không tạo object / hàm mới làm props cho hàng trăm dòng nếu không cần.
- Ô tìm kiếm lọc trên dữ liệu đã có sẵn ở client: dùng `useDeferredValue` để gõ không bị khựng.
- Mỗi màn hình danh sách xử lý đủ: loading (skeleton), error, empty, success.

## 10. Thư viện theo nhu cầu

| Nhu cầu | Thư viện | Khi nào mới cần |
|---|---|---|
| Validate query | `zod` | Luôn |
| ORM / query | Prisma (theo stack project) | Luôn |
| Tìm kiếm | `pg_trgm`, full-text của PostgreSQL | Khi có ô tìm kiếm trên bảng lớn |
| State trên URL | `nuqs` | Màn hình có filter / sort / page |
| Data fetching phía client | `@tanstack/react-query` | Bảng tương tác, infinite scroll, khu vực sau đăng nhập |
| Bảng | `@tanstack/react-table` | Bảng nhiều cột, sort / filter phức tạp |
| Danh sách rất dài | `@tanstack/react-virtual` | Hơn vài trăm dòng hiển thị cùng lúc |
| Debounce | `use-debounce`, hoặc `useDeferredValue` có sẵn | Ô nhập gây gọi API |
| Giới hạn đồng thời | `p-limit` | Gọi hàng loạt API / query |
| Gom truy vấn theo id | `dataloader` | N+1 khó gom bằng `include` |
| Cache | `lru-cache`, `ioredis` | Đã đo thấy query đắt lặp lại |
| Hàng đợi | `bullmq` (cần Redis) | Việc dài hơn vài giây |
| Tính toán nặng | `worker_threads`, `piscina` | CPU làm nghẽn event loop |
| Chặn lạm dụng | `express-rate-limit` | Endpoint công khai, tìm kiếm |
| Log / metrics | `pino`, `pino-http`, `prom-client` | Cần đo thời gian từng request |
| Thử tải | `autocannon`, `k6` | Trước và sau khi tối ưu |
| Kích thước bundle | `@next/bundle-analyzer` | Trang tải JS nặng |

**Bộ tối thiểu cho hầu hết dự án:** `zod` + Prisma + index đúng + `nuqs` + `@tanstack/react-query`. Những thứ còn lại chỉ thêm khi có số đo chứng minh cần. Mỗi thư viện thêm vào đều phải được người dùng đồng ý trước.

## 11. Đo lường (người dùng chạy, dán kết quả)

```bash
# thử tải một endpoint danh sách: 50 kết nối trong 20 giây (CHỈ chạy trên máy local / staging của mình)
npx autocannon -c 50 -d 20 "http://localhost:4000/api/v1/products?page=1&limit=20&sort=-createdAt"
```

- Xem độ trễ ở các phân vị cao (97.5%, 99%), số request / giây, số lỗi và timeout. Chạy trước và sau khi sửa, cùng dữ liệu, cùng máy.
- Đếm số query của một request: bật log query của Prisma ở môi trường dev. Một list endpoint thường chỉ nên có 2–3 query.
- Từng query: `EXPLAIN (ANALYZE, BUFFERS)`; toàn hệ thống: `pg_stat_statements`.
- Event loop: `monitorEventLoopDelay` từ `node:perf_hooks`; độ trễ tăng cao khi tải là dấu hiệu có việc nặng chạy trên luồng chính.
- Frontend: tab Network (số request, kích thước payload), React DevTools Profiler (component render lại thừa), Lighthouse trên production build.

Mốc tham khảo để bắt đầu (chỉnh theo project, không phải cam kết): list endpoint p95 dưới khoảng 300ms ở mức tải dự kiến; payload một trang dưới khoảng 100KB; giao diện phản hồi thao tác lọc trong khoảng 100ms (hiện trạng thái đang tải ngay, dữ liệu về sau).

## 12. Lỗi hay gặp

- Lấy hết bảng rồi `filter` / `sort` / `slice` bằng JavaScript.
- Không giới hạn `limit`; nhận tên cột sort trực tiếp từ client.
- Sort theo cột không có index; sort không có tie-breaker nên dòng nhảy giữa các trang.
- `SELECT *` / trả cả object lồng nhau cho màn hình danh sách.
- `COUNT(*)` chính xác trên bảng hàng triệu dòng ở mỗi request.
- `ILIKE '%...%'` trên bảng lớn mà không có index trigram.
- `await` trong vòng lặp; `Promise.all` không giới hạn trên mảng lớn.
- Thêm Redis trước khi sửa query và index.
- Cache dữ liệu theo người dùng bằng key dùng chung; cache không có TTL hay cách xoá.
- Gọi API ở mỗi ký tự gõ; không huỷ request cũ nên kết quả cũ đè kết quả mới.
- Giữ filter trong `useState` thay vì URL (mất khi tải lại, không chia sẻ được).
- Xoá trắng bảng mỗi lần đổi trang thay vì giữ dữ liệu cũ.
- Dùng infinite scroll / virtualize cho trang public cần SEO.
- Chạy thử tải vào production hoặc hệ thống của người khác.

## 13. Checklist trước khi báo xong

- [ ] Đã biết quy mô dữ liệu và chọn offset / cursor có lý do.
- [ ] Query được validate; `limit` có trần; sort / filter theo whitelist; có tie-breaker.
- [ ] Chỉ `select` cột cần; không còn N+1; không còn `await` tuần tự cho việc độc lập.
- [ ] Index khớp filter + sort chính; đã xem `EXPLAIN` (hoặc ghi "chưa kiểm chứng").
- [ ] Filter / sort / page nằm trên URL; đổi filter thì về trang 1; có debounce; request cũ bị huỷ.
- [ ] Chuyển trang vẫn giữ dữ liệu cũ; đủ trạng thái loading / error / empty.
- [ ] Cache (nếu có) có TTL, có cách xoá, không lẫn dữ liệu giữa người dùng.
- [ ] Có số đo trước / sau do người dùng chạy; thư viện mới đã được đồng ý; quyết định lớn đã ghi `DECISIONS.md`.
