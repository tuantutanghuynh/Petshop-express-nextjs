---
name: deep-test
description: Dùng khi cần test toàn diện một module hoặc cả dự án Express + Next.js + TypeScript. Agent tự cài thư viện test, viết file test, chạy và báo cáo, từ happy path tới tình huống xấu nhất.
disable-model-invocation: true
---

# Test toàn diện cho Express + Next.js + TypeScript

Khi skill này được gọi, agent **tự làm trọn vòng**: khảo sát → lập ma trận ca test → cài thư viện test còn thiếu → viết file test → chạy → sửa lỗi của chính file test → báo cáo, đi từ tình huống lý tưởng nhất tới xấu nhất có thể xảy ra.

Cách gọi: `/deep-test <module hoặc đường dẫn>` (vd `/deep-test order`, `/deep-test backend/src/modules/auth`) hoặc `/deep-test all`. Không có đối số thì hỏi phạm vi.

## 1. Quyền hạn khi skill chạy (đọc trước)

Việc người dùng gọi skill này là **cho phép rõ ràng** để agent làm các việc sau, kể cả khi CLAUDE.md của project đang ở "chế độ hướng dẫn":

**Được làm:**
- Tạo và sửa **file test và hạ tầng test**: `*.test.ts(x)`, `*.spec.ts`, thư mục `test/`, `e2e/`, `__tests__/`, file cấu hình test (`vitest.config.*`, `playwright.config.*`), file setup / factory / helper cho test, `.env.test.example`.
- Thêm script test vào `package.json` và cài **devDependencies** trong danh sách ở mục 5.
- Chạy lệnh test, type-check, lint, coverage; khởi động app ở chế độ test trên máy local.

**Không được làm:**
- **Sửa code sản phẩm** (mọi file ngoài phạm vi test) để test pass. Test phát hiện lỗi thì báo cáo ở mục "Lỗi tìm thấy", và hướng dẫn cách sửa theo quy tắc của CLAUDE.md.
- Xoá, `skip`, `only`, nới lỏng assertion, hay hạ ngưỡng coverage để có kết quả xanh.
- Cài thư viện ngoài danh sách mục 5, hoặc cài vào `dependencies`, khi chưa hỏi.
- Chạy test vào database không phải database test, vào staging / production, hay vào hệ thống của người khác.
- Đọc hoặc in giá trị secret thật; `git commit` / `git push`.
- Lách quyền: nếu công cụ ghi file hoặc chạy lệnh bị chặn (settings của project), **dừng lại** và nói rõ cần mở quyền gì, không tìm đường vòng.

Phải dừng và hỏi khi: không có database test; cần Docker mà máy không có; cần sửa code sản phẩm mới test được (vd `app` không export tách khỏi `listen`); hành vi đúng không rõ (xem nguyên tắc 2).

## 2. Nguyên tắc

1. **An toàn dữ liệu trước hết.** Mọi test có DB phải qua "cổng an toàn" ở mục 6 (T2). Không có cổng này thì không chạy.
2. **Kết quả mong đợi lấy từ đặc tả, không lấy từ hành vi hiện tại.** Nguồn đặc tả: CLAUDE.md, schema validate, contract API, mô tả nghiệp vụ. Không viết test chỉ để "chụp lại" điều code đang làm. Đặc tả không rõ thì ghi vào "Câu hỏi cần làm rõ" và test phần đã rõ.
3. **Dùng lại hạ tầng có sẵn.** Project đã dùng Jest thì viết Jest; không đổi test runner. Đọc phiên bản trong `package.json` và viết theo đúng phiên bản đó (API của Vitest, MSW, Playwright, Next đổi theo bản lớn).
4. **Test hành vi qua ranh giới công khai** (HTTP, hàm public của service, giao diện người dùng thấy), không test chi tiết cài đặt.
5. **Mỗi test độc lập và lặp lại được:** tự tạo dữ liệu, tự dọn, không phụ thuộc thứ tự, không phụ thuộc giờ thật hay mạng thật.
6. **Test đỏ vì lỗi sản phẩm là kết quả tốt**, không phải thứ cần che đi.
7. **Trung thực trong báo cáo:** chỉ ghi "pass" cho thứ đã chạy thật; phần chưa test được phải nêu lý do.

## 3. Quy trình

1. **Khảo sát (chỉ đọc):** `package.json` (runner, script, package manager theo lockfile), cấu hình test hiện có, CLAUDE.md (mục testing, lệnh thường dùng), code của phạm vi được giao: route, schema, service, quyền truy cập, lời gọi ra ngoài.
2. **Cổng an toàn:** xác nhận có môi trường test riêng (mục 6, T2). Thiếu thì dừng và hướng dẫn tạo.
3. **Lập ma trận ca test** theo thang ở mục 4 cho từng endpoint / hàm / màn hình. In ma trận rút gọn ra chat rồi **làm tiếp luôn**, không chờ duyệt, trừ các trường hợp phải dừng ở mục 1.
4. **Cài thư viện còn thiếu** (mục 5), nêu rõ đã cài gì và vì sao.
5. **Dựng hạ tầng nếu chưa có:** cấu hình runner, setup, reset DB, factory, helper đăng nhập.
6. **Viết test theo từng bậc**, chạy ngay sau mỗi file. Test fail thì phân loại:
   - lỗi của test (sai setup, sai giả định) → sửa test;
   - lỗi của sản phẩm → **giữ nguyên test**, ghi vào danh sách lỗi, đi tiếp.
7. **Chạy toàn bộ** kèm coverage; chạy lại 2–3 lần và thử xáo thứ tự để bắt test chập chờn (flaky).
8. **Báo cáo** theo mẫu ở mục 8.

## 4. Thang tình huống: từ lý tưởng tới xấu nhất

Mỗi đối tượng test phải đi qua mọi bậc **áp dụng được**. Bậc nào bỏ qua thì ghi lý do trong báo cáo.

| Bậc | Nhóm | Câu hỏi cần trả lời | Ví dụ ca test |
|---|---|---|---|
| 0 | Happy path | Dùng đúng thì có chạy đúng không? | Tạo đơn hợp lệ → 201, dữ liệu lưu đúng, response đúng contract |
| 1 | Giá trị biên | Ở mép giới hạn thì sao? | `limit` = 1 / 100 / 101; chuỗi dài đúng max và max+1; số lượng 0; danh sách rỗng; trang cuối và trang vượt quá |
| 2 | Input sai | Sai kiểu, thiếu, thừa thì trả lỗi tử tế không? | Thiếu field bắt buộc; sai kiểu; JSON hỏng; field lạ; mảng thay vì chuỗi → 400 với mã lỗi rõ, không lộ stack trace |
| 3 | Xác thực & phân quyền | Ai được làm gì? | Không token → 401; token hết hạn / sai chữ ký → 401; sai vai trò → 403; đọc / sửa tài nguyên của người khác (IDOR) → 403 hoặc 404 |
| 4 | Trạng thái & nghiệp vụ | Sai thứ tự, trùng lặp, xung đột? | Tạo trùng → 409; huỷ đơn đã huỷ; sửa bản ghi đã xoá mềm; vi phạm quy tắc nghiệp vụ → 422 |
| 5 | Phụ thuộc hỏng | DB, Redis, API ngoài lỗi thì sao? | API ngoài trả 500 / timeout / JSON rác; DB ném lỗi giữa transaction → rollback sạch, trả 5xx gọn, không treo |
| 6 | Đồng thời | Hai việc xảy ra cùng lúc? | Gửi đúp cùng request; hai người sửa cùng bản ghi; trừ tồn kho song song không âm |
| 7 | Dữ liệu lớn & hiệu năng | Nhiều dữ liệu thì còn đúng và đủ nhanh? | 10.000 bản ghi: phân trang không lặp / sót; payload vượt giới hạn → 413; số query của một request không tăng theo số dòng |
| 8 | Lạm dụng & bảo mật | Người dùng ác ý thử gì? | Chuỗi SQL injection, XSS, path traversal; gán field cấm (`role`, `userId`); vượt rate limit → 429; upload sai loại / quá cỡ |
| 9 | Thời gian & ngôn ngữ | Lịch và ký tự đặc biệt? | Múi giờ +07 lúc 23:59; ngày 29/2; token vừa hết hạn; tiếng Việt có dấu, emoji, khoảng trắng đầu cuối |
| 10 | Giao diện xấu nhất | Người dùng thật gặp gì? | Mạng chậm, mất mạng, API 500; bấm đúp nút gửi; back / forward; tải lại giữa chừng; trạng thái loading / error / empty; bàn phím và trợ năng |

**Bộ input "khó chịu" dùng lại cho bậc 1, 2, 8, 9:** chuỗi rỗng; chỉ có khoảng trắng; 10.000 ký tự; `Nguyễn Thị Ánh`; emoji; `' OR 1=1 --`; `<script>alert(1)</script>`; `../../etc/passwd`; số âm; 0; số thập phân cho trường số nguyên; số vượt `Number.MAX_SAFE_INTEGER`; `null`; kiểu sai (mảng, object); ngày không tồn tại (`2026-02-30`); ngày quá xa.

## 5. Thư viện được phép tự cài (devDependencies)

Chỉ cài cái còn thiếu, đúng package manager của project, phiên bản tương thích với runner đang có. Thứ ngoài bảng này phải hỏi trước.

| Nhu cầu | Thư viện | Ghi chú |
|---|---|---|
| Test runner | `vitest` (hoặc giữ Jest nếu project đang dùng) | Không đổi runner có sẵn |
| Coverage | provider `v8` của Vitest (`@vitest/coverage-v8` nếu runner yêu cầu) | |
| Test API Express | `supertest`, `@types/supertest` | Cần `app` export tách khỏi `listen` |
| Giả lập HTTP ra ngoài | `msw` | Cho bậc 5 |
| Dữ liệu giả | `@faker-js/faker` | Luôn đặt seed cố định |
| Property-based | `fast-check` | Sinh hàng trăm input ngẫu nhiên có thể tái hiện |
| Component React | `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`, `@vitejs/plugin-react`, `vite-tsconfig-paths` | Theo hướng dẫn của Next.js |
| E2E | `@playwright/test` (kèm tải trình duyệt bằng `playwright install`) | Cho bậc 10 và Server Component `async` |
| Trợ năng | `@axe-core/playwright` | |
| DB test tạm thời | `testcontainers`, `@testcontainers/postgresql` | Chỉ khi máy có Docker; nếu không, dùng database test riêng |
| Thử tải nhẹ | `autocannon` | Chỉ chạy trên local |

Tuỳ chọn nâng cao, **hỏi trước**: mutation testing (Stryker) để đo chất lượng bộ test.

## 6. Mẫu code (chỉnh theo phiên bản và cấu trúc thật của project)

### T1. Cấu hình Vitest cho backend

```ts
// backend/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // các file test dùng chung một database test nên không chạy song song theo file
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});
```

Ngưỡng coverage là điểm khởi đầu; nếu project đã có ngưỡng riêng thì giữ nguyên, không hạ.

### T2. Cổng an toàn và reset database

```ts
// backend/test/setup.ts
import { afterAll, beforeEach } from 'vitest';
import { prisma } from '../src/config/prisma'; // đường dẫn theo project

function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? '';
  let dbName = '';
  try {
    dbName = new URL(url).pathname;
  } catch {
    // dbName stays empty and the check below fails
  }
  if (process.env.NODE_ENV !== 'test' || !/test/i.test(dbName)) {
    throw new Error(
      'Refusing to run: NODE_ENV must be "test" and DATABASE_URL must point to a database whose name contains "test".',
    );
  }
}

assertTestDatabase();

export async function resetDb(): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  // table names come from the catalog, never from user input
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});
```

Biến môi trường test đặt trong `.env.test` (không commit); agent chỉ tạo `.env.test.example` với giá trị giả và hướng dẫn người dùng điền. Migration chạy vào database test trước khi test.

### T3. Test API: bậc 0–4 trên một endpoint

```ts
// backend/src/modules/order/order.api.test.ts
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../app';
import { createUser, loginAs } from '../../../test/helpers/auth';
import { createProduct } from '../../../test/factories/product';

describe('POST /api/v1/orders', () => {
  it('creates an order for a valid request (happy path)', async () => {
    const user = await createUser();
    const product = await createProduct({ price: 100_000, stock: 5 });

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${await loginAs(user)}`)
      .send({ items: [{ productId: product.id, quantity: 2 }] });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true, data: { total: '200000', status: 'pending' } });
  });

  // boundary + invalid input in one table
  it.each([
    ['quantity is 0', { quantity: 0 }],
    ['quantity is negative', { quantity: -1 }],
    ['quantity is a decimal', { quantity: 1.5 }],
    ['quantity is a string', { quantity: 'two' }],
    ['quantity is huge', { quantity: Number.MAX_SAFE_INTEGER }],
  ])('rejects the order when %s', async (_name, override) => {
    const user = await createUser();
    const product = await createProduct({ stock: 5 });

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${await loginAs(user)}`)
      .send({ items: [{ productId: product.id, ...override }] });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(/prisma|stack|at \w+ \(/i); // no internals leaked
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/v1/orders').send({ items: [] });
    expect(res.status).toBe(401);
  });

  it("does not expose another user's order (IDOR)", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const order = await createOrderFor(owner);

    const res = await request(app)
      .get(`/api/v1/orders/${order.id}`)
      .set('Authorization', `Bearer ${await loginAs(stranger)}`);

    expect([403, 404]).toContain(res.status);
  });

  it('ignores fields the client must not set (mass assignment)', async () => {
    const user = await createUser();
    const product = await createProduct({ price: 100_000, stock: 5 });

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${await loginAs(user)}`)
      .send({ items: [{ productId: product.id, quantity: 1 }], total: 1, status: 'paid', userId: 'someone-else' });

    // either rejected outright or accepted with server-computed values
    if (res.status === 201) {
      expect(res.body.data).toMatchObject({ total: '100000', status: 'pending' });
    } else {
      expect(res.status).toBe(400);
    }
  });
});
```

Giá trị mong đợi trong mẫu (mã trạng thái, định dạng `total`) phải thay bằng **contract thật** của project.

### T4. Bậc 5: phụ thuộc hỏng

```ts
import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';

const RATES_URL = 'https://api.example.com/rates';
const server = setupServer(http.get(RATES_URL, () => HttpResponse.json({ vnd: 25000 })));

beforeAll(() =>
  server.listen({
    // supertest gọi vào 127.0.0.1: cho qua; mọi request ra ngoài chưa khai báo thì báo lỗi.
    // Tên option theo MSW hiện hành; bản cũ hơn dùng onUnhandledRequest(request, print).
    onUnhandledFrame({ frame, defaults }) {
      if (frame.protocol === 'http' && new URL(frame.data.request.url).hostname === '127.0.0.1') return;
      defaults.error();
    },
  }),
);
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

it('returns 502/503 and does not hang when the rates API fails', async () => {
  server.use(http.get(RATES_URL, () => new HttpResponse(null, { status: 500 })));
  const res = await request(app).get('/api/v1/quotes').set(auth);
  expect([502, 503]).toContain(res.status);
});

it('gives up after the configured timeout when the rates API never answers', async () => {
  server.use(http.get(RATES_URL, async () => { await delay('infinite'); return HttpResponse.json({}); }));
  const res = await request(app).get('/api/v1/quotes').set(auth);
  expect([503, 504]).toContain(res.status);
});

it('rolls back when the database fails mid-transaction', async () => {
  // mock ở ranh giới do project tự viết (repository / service); spy thẳng lên Prisma client có thể không được
  vi.spyOn(orderRepository, 'insertItems').mockRejectedValueOnce(new Error('db down'));
  const res = await request(app).post('/api/v1/orders').set(auth).send(validPayload);
  expect(res.status).toBe(500);
  expect(await prisma.order.count()).toBe(0); // nothing half-written
});
```

### T5. Bậc 6: đồng thời

```ts
it('creates only one order when the same request is sent twice at once', async () => {
  const send = () =>
    request(app).post('/api/v1/orders').set(auth).set('Idempotency-Key', 'key-1').send(validPayload);

  const responses = await Promise.all([send(), send()]);

  expect(await prisma.order.count()).toBe(1);
  expect(responses.every((r) => r.status < 500)).toBe(true);
});

it('never lets stock go negative under parallel purchases', async () => {
  const product = await createProduct({ stock: 3 });
  const buy = () =>
    request(app).post('/api/v1/orders').set(auth).send({ items: [{ productId: product.id, quantity: 1 }] });

  const responses = await Promise.all(Array.from({ length: 10 }, buy));

  const succeeded = responses.filter((r) => r.status === 201).length;
  const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
  expect(succeeded).toBe(3);
  expect(after.stock).toBe(0);
});
```

Nếu project chưa có cơ chế chống gửi đúp (idempotency) hay khoá tồn kho, các test này sẽ đỏ: đó là **lỗi sản phẩm cần báo cáo**, không phải lý do để bỏ test.

### T6. Property-based: bất biến đúng với mọi input

```ts
import fc from 'fast-check';

it('parseSort never returns a field outside the whitelist', () => {
  fc.assert(
    fc.property(fc.string(), (input) => {
      const { field, direction } = parseSort(input);
      return SORTABLE_FIELDS.includes(field) && ['asc', 'desc'].includes(direction);
    }),
  );
});

it('pagination returns every row exactly once', async () => {
  await createProducts(57);
  const seen = new Set<string>();
  for (let page = 1; page <= 3; page += 1) {
    const { items } = await listProducts({ page, limit: 20, sort: '-createdAt' });
    for (const item of items) {
      expect(seen.has(item.id)).toBe(false);
      seen.add(item.id);
    }
  }
  expect(seen.size).toBe(57);
});
```

### T7. Bậc 9: thời gian

```ts
afterEach(() => {
  vi.useRealTimers();
});

it('rejects a token one second after it expires', async () => {
  const token = await loginAs(user); // giả sử hết hạn sau 15 phút
  // chỉ giả lập đồng hồ hệ thống; không bật fake timers để supertest không bị treo
  // (hành vi của vi.setSystemTime khi không bật fake timers: kiểm tra docs đúng phiên bản Vitest)
  vi.setSystemTime(new Date(Date.now() + 15 * 60 * 1000 + 1000));
  const res = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(401);
});
```

### T8. Component React: loading, error, empty, thao tác

```tsx
// frontend/src/components/products/ProductTable.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { ProductTable } from './ProductTable';

it('shows an empty state when there are no products', () => {
  render(<ProductTable items={[]} onDelete={vi.fn()} />);
  expect(screen.getByText(/chưa có sản phẩm/i)).toBeDefined();
});

it('asks for confirmation once even if delete is double-clicked', async () => {
  const onDelete = vi.fn();
  const user = userEvent.setup();
  render(<ProductTable items={[{ id: '1', name: 'Bình gốm' }]} onDelete={onDelete} />);

  await user.dblClick(screen.getByRole('button', { name: /xoá/i }));

  expect(onDelete).toHaveBeenCalledTimes(1);
});
```

Cấu hình frontend theo hướng dẫn của Next.js: `environment: 'jsdom'`, plugin `@vitejs/plugin-react` và `vite-tsconfig-paths`. Vitest **chưa hỗ trợ Server Component `async`**: các trang đó test bằng E2E.

### T9. E2E Playwright: bậc 10

```ts
// frontend/e2e/products.spec.ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('user can filter products and the filter survives a reload', async ({ page }) => {
  await page.goto('/products');
  await page.getByRole('searchbox').fill('gốm');
  await expect(page).toHaveURL(/q=g/);
  await page.reload();
  await expect(page.getByRole('searchbox')).toHaveValue('gốm');
});

test('shows an error state when the API fails', async ({ page }) => {
  // page.route chỉ chặn request từ trình duyệt, không chặn fetch chạy trong Server Component
  await page.route('**/api/v1/products*', (route) => route.fulfill({ status: 500, body: '{}' }));
  await page.goto('/dashboard/products');
  await expect(page.getByRole('alert')).toBeVisible();
});

test('submit button cannot create duplicates on a slow network', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/v1/orders', async (route) => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await route.continue();
  });
  await page.goto('/checkout');
  const submit = page.getByRole('button', { name: /đặt hàng/i });
  await submit.click();
  await submit.click({ force: true });
  await expect.poll(() => calls).toBe(1);
});

test('shows an error state when the connection drops', async ({ page, context }) => {
  await page.goto('/dashboard/products');
  await context.setOffline(true);
  await page.getByRole('button', { name: /tải lại/i }).click();
  await expect(page.getByRole('alert')).toBeVisible();
});

test('has no detectable accessibility violations', async ({ page }) => {
  await page.goto('/products');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
```

Selector và đường dẫn trong mẫu là ví dụ: thay bằng giao diện thật. E2E chạy với app đã build ở chế độ test và database test.

## 7. Lệnh chạy (thay bằng script thật của project)

```bash
# backend
NODE_ENV=test pnpm vitest run                       # toàn bộ
NODE_ENV=test pnpm vitest run src/modules/order     # một module
NODE_ENV=test pnpm vitest run --coverage            # kèm coverage
NODE_ENV=test pnpm vitest run --sequence.shuffle    # xáo thứ tự để bắt test phụ thuộc nhau

# frontend
pnpm vitest run
pnpm playwright test
```

Sau khi xong: type-check và lint cho các file test vừa viết.

## 8. Mẫu báo cáo cuối

```markdown
## Kết quả deep-test: <phạm vi>

**Tóm tắt:** X file test, Y ca test — pass A, fail B (lỗi sản phẩm), chưa chạy được C.
**Coverage:** lines …%, branches …% (trước: …%).
**Đã cài:** <thư viện> — <lý do>.

### Ma trận phủ theo bậc
| Đối tượng | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| POST /orders | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ lỗi | – | ✓ | ✓ | n/a |

### Lỗi tìm thấy (xếp theo mức nghiêm trọng)
| # | Mức | Mô tả | Test tái hiện | Vị trí nghi ngờ |
|---|---|---|---|---|
| 1 | Cao | Gửi đúp tạo 2 đơn | `order.api.test.ts` › creates only one order… | `order.service.ts:42` |

### Chưa test và lý do
- …

### Câu hỏi cần làm rõ
- …

### Cách chạy lại
- …
```

Ký hiệu: ✓ đã test và pass · ✗ test đỏ do lỗi sản phẩm · – bỏ qua có lý do · n/a không áp dụng.
Sau báo cáo: hướng dẫn sửa từng lỗi theo quy tắc của CLAUDE.md (không tự sửa code sản phẩm), và soạn sẵn nội dung cho `docs/PROGRESS.md` nếu project dùng.

## 9. Lỗi hay gặp của chính bộ test

- Test "chụp lại" hành vi hiện tại nên lỗi có sẵn trở thành kết quả mong đợi.
- Chỉ test happy path; coverage cao nhưng không có assertion có nghĩa.
- Test phụ thuộc thứ tự chạy, dữ liệu của test trước, giờ thật, mạng thật, hoặc `sleep` cố định.
- Mock quá sâu (mock luôn thứ đang cần test); mock Prisma cho mọi thứ nên không bắt được lỗi query.
- Dùng chung một database cho dev và test; quên reset giữa các test.
- Dữ liệu giả không có seed nên lỗi không tái hiện được.
- Snapshot khổng lồ không ai đọc.
- `it.skip` / `it.only` bị bỏ quên; sửa assertion cho khớp kết quả sai.
- Bật fake timers toàn bộ làm treo request HTTP trong test.
- E2E dùng selector theo class CSS thay vì role / nhãn; phụ thuộc dữ liệu có sẵn trên máy.

## 10. Checklist trước khi kết thúc

- [ ] Cổng an toàn database test đang bật; không lệnh nào chạm DB dev / production.
- [ ] Mỗi đối tượng đã đi qua mọi bậc áp dụng được; bậc bỏ qua có lý do.
- [ ] Kết quả mong đợi dựa trên đặc tả; chỗ không rõ đã đưa vào "Câu hỏi cần làm rõ".
- [ ] Không sửa code sản phẩm; không `skip` / `only`; không hạ ngưỡng.
- [ ] Toàn bộ suite đã chạy thật ít nhất 2 lần, có thử xáo thứ tự; không có test chập chờn.
- [ ] Type-check và lint pass cho file test.
- [ ] Báo cáo đủ: tóm tắt, coverage, ma trận, lỗi tìm thấy kèm test tái hiện, phần chưa test, cách chạy lại.
- [ ] Thư viện đã cài đều nằm trong danh sách cho phép và được liệt kê trong báo cáo.
