# Giỏ hàng & Thanh toán — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khách đăng nhập chọn được hàng, đặt đơn, và nhận thông tin chuyển khoản.

**Architecture:** Trạng thái giỏ đặt trong một React Context ở root layout để navbar và trang giỏ dùng chung một nguồn. Trang sản phẩm giữ nguyên Server Component, chỉ tách khối mua hàng thành client component con. Backend đã có sẵn toàn bộ API, kế hoạch này không sửa backend.

**Tech Stack:** Next.js 16 App Router (JS), Tailwind, Vitest cho hàm thuần.

**Spec:** `docs/superpowers/specs/2026-09-21-cart-checkout-design.md`

## Global Constraints

- **Không sửa backend.** Mọi API đã có và đã được kiểm chứng bằng curl.
- **Header `X-Brand-Slug` bắt buộc** cho mọi request tới `/cart` và `/orders`. Giá trị lấy từ `BRAND_CATEGORY_SLUG` trong `lib/brand.js`, hiện là `gom-su-trang-tri`. Thiếu header thì backend trả 400 `BRAND_REQUIRED`.
- **Trang `app/san-pham/[slug]/page.js` phải giữ nguyên Server Component.** Nó sinh `generateMetadata` và JSON-LD; biến thành client là mất toàn bộ rich result.
- **Mọi chữ hiển thị cho người dùng viết tiếng Việt.**
- **Commit message:** tiếng Anh, 1-2 câu, KHÔNG prefix `feat(`/`fix(`, KHÔNG bullet list, KHÔNG dòng Co-Authored-By.
- **Comment trong code:** tiếng Việt, ngắn, giải thích **vì sao** chứ không mô tả code đang làm gì.
- `docs/` nằm trong `.gitignore` — không commit file spec/plan.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `lib/apiClient.js` (sửa) | Thêm header brand mặc định |
| `lib/adminAuth.js` (sửa) | Thêm header brand vào `authFetch` |
| `lib/redirect.js` (tạo) | `isSafeRedirect` — chặn open redirect |
| `lib/vietqr.js` (tạo) | `buildVietQrUrl` — dựng URL ảnh QR |
| `lib/useCart.js` (tạo) | `CartProvider` + `useCart` |
| `app/layout.js` (sửa) | Bọc `CartProvider` |
| `components/layout/Navbar.js` (sửa) | Badge số lượng giỏ |
| `components/product/AddToCart.js` (tạo) | Chọn loại + số lượng + nút thêm |
| `app/san-pham/[slug]/page.js` (sửa) | Gắn `AddToCart`, bỏ bảng variant cũ |
| `app/auth/login/page.js` (sửa) | Đọc `?redirect=` |
| `app/gio-hang/page.js` (tạo) | Trang giỏ |
| `app/thanh-toan/page.js` (tạo) | Trang đặt hàng |
| `app/dat-hang-thanh-cong/[code]/page.js` (tạo) | Trang xác nhận |
| `app/robots.js` (sửa) | Chặn route riêng tư |

---

## Task 1: Nền — Vitest và header brand

**Files:**
- Modify: `frontend-gomsu/lib/apiClient.js`
- Modify: `frontend-gomsu/lib/adminAuth.js:59-75`
- Modify: `frontend-gomsu/lib/utils.js`
- Modify: `frontend-gomsu/app/san-pham/page.js:13`
- Modify: `frontend-gomsu/app/san-pham/[slug]/page.js:6`
- Modify: `frontend-gomsu/app/admin/products/page.js:14`
- Modify: `frontend-gomsu/package.json`
- Create: `frontend-gomsu/vitest.config.js`
- Test: `frontend-gomsu/lib/apiClient.test.js`

**Interfaces:**
- Produces: `apiFetch(path, options)` và `authFetch(path, options)` luôn gửi `X-Brand-Slug`. Mọi task sau gọi API qua hai hàm này, không tự `fetch`.
- Produces: `formatPrice(v)` export từ `@/lib/utils` — 4 task sau đều cần hiển thị giá.

- [ ] **Step 1: Cài Vitest**

```bash
cd frontend-gomsu && npm install -D vitest
```

- [ ] **Step 2: Tạo `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['lib/**/*.test.js'] },
});
```

- [ ] **Step 3: Thêm script test vào `package.json`**

Thêm vào khối `"scripts"`: `"test": "vitest run"`

- [ ] **Step 4: Viết test thất bại**

Tạo `lib/apiClient.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch } from './apiClient';

describe('apiFetch', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {}, meta: null, error: null }),
    });
  });

  it('luôn gửi header X-Brand-Slug để backend biết đây là brand nào', async () => {
    await apiFetch('/cart');
    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers['X-Brand-Slug']).toBe('gom-su-trang-tri');
  });

  it('không ghi đè header mà nơi gọi đã tự đặt', async () => {
    await apiFetch('/cart', { headers: { 'Content-Type': 'application/json' } });
    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.headers['X-Brand-Slug']).toBe('gom-su-trang-tri');
  });
});
```

- [ ] **Step 5: Chạy test, xác nhận THẤT BẠI**

Run: `cd frontend-gomsu && npm test`
Expected: FAIL — `options.headers` là `undefined`

- [ ] **Step 6: Sửa `lib/apiClient.js`**

```js
import { BRAND_CATEGORY_SLUG } from '@/lib/brand';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// Gọi API backend bằng fetch gốc (không dùng axios) để tận dụng cơ chế cache/revalidate
// tích hợp sẵn của Next.js (`next: { revalidate, tags }`) — axios không tham gia được
// cơ chế này vì nó không chạy qua hàm fetch mà Next.js đã "độ" lại.
export async function apiFetch(path, options = {}) {
  // Gắn ở một chỗ thay vì rắc ở từng lời gọi: route /cart và /orders bắt buộc có header
  // này, thiếu là 400. Route khác nhận thừa cũng không sao.
  const headers = { 'X-Brand-Slug': BRAND_CATEGORY_SLUG, ...options.headers };

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const json = await res.json();

  if (!res.ok) {
    const error = new Error(json.error?.details?.[0]?.msg || json.error?.message || 'Yêu cầu thất bại');
    error.status = res.status;
    error.code = json.error?.code;
    throw error;
  }

  return json; // { data, meta, error: null }
}
```

- [ ] **Step 7: Sửa `lib/adminAuth.js`**

Trong `authFetch`, đổi khối `customHeaders`:

```js
  const customHeaders = {
    Authorization: `Bearer ${token}`,
    'X-Brand-Slug': BRAND_CATEGORY_SLUG,
    ...options.headers,
  };
```

Thêm import ở đầu file: `import { BRAND_CATEGORY_SLUG } from '@/lib/brand';`

- [ ] **Step 8: Chạy test, xác nhận ĐẠT**

Run: `cd frontend-gomsu && npm test`
Expected: 2 passed

- [ ] **Step 9: Gom `formatPrice` về `lib/utils.js`**

Hiện nó bị chép y hệt ở 3 file (`app/san-pham/page.js:13`, `app/san-pham/[slug]/page.js:6`,
`app/admin/products/page.js:14`). Bốn task sau cũng cần, để nguyên là thành 7 bản.

Thêm vào cuối `lib/utils.js`:

```js
export function formatPrice(v) {
  return v.toLocaleString('vi-VN') + 'đ';
}
```

Trong cả 3 file trên: xoá dòng `const formatPrice = ...` và thêm `formatPrice` vào lệnh
import sẵn có từ `@/lib/utils`. File `app/admin/products/page.js` nếu chưa import gì từ đó
thì thêm mới: `import { formatPrice } from '@/lib/utils';`

- [ ] **Step 10: Kiểm tra 3 trang cũ không vỡ**

```bash
for p in /san-pham /admin/products; do
  printf "%-18s " "$p"; curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3001$p"
done
```
Expected: cả hai trả 200

Mở thêm một trang chi tiết bất kỳ lấy từ danh sách:

```bash
SLUG=$(curl -s "http://localhost:4000/api/v1/products?pageSize=1" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).data[0].slug))")
curl -s -o /dev/null -w "chi tiet: %{http_code}\n" "http://localhost:3001/san-pham/$SLUG"
```
Expected: 200

- [ ] **Step 11: Commit**

```bash
git add frontend-gomsu/lib/apiClient.js frontend-gomsu/lib/adminAuth.js frontend-gomsu/lib/utils.js frontend-gomsu/lib/apiClient.test.js frontend-gomsu/vitest.config.js frontend-gomsu/package.json frontend-gomsu/package-lock.json frontend-gomsu/app/san-pham "frontend-gomsu/app/admin/products/page.js"
git commit -m "Send brand slug header on every API call and share the price formatter"
```

---

## Task 2: Chặn Google lập chỉ mục trang riêng tư

**Files:**
- Modify: `frontend-gomsu/app/robots.js`

**Interfaces:**
- Produces: không có gì cho task sau. Task này độc lập, làm sớm để không quên.

- [ ] **Step 1: Sửa `app/robots.js`**

```js
export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Trang cá nhân hoá và trang riêng tư. Trang xác nhận đơn chứa họ tên, số điện
      // thoại và địa chỉ khách — lọt lên Google là rò rỉ dữ liệu cá nhân.
      disallow: [
        '/admin/', '/admin/*',
        '/auth/', '/auth/*',
        '/user',
        '/gio-hang',
        '/thanh-toan',
        '/dat-hang-thanh-cong/', '/dat-hang-thanh-cong/*',
      ],
    },
    sitemap: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/sitemap.xml`,
  }
}
```

- [ ] **Step 2: Kiểm tra kết quả**

Run: `curl -s http://localhost:3001/robots.txt`
Expected: thấy đủ các dòng `Disallow:` ở trên

- [ ] **Step 3: Xác nhận sitemap không chứa route riêng tư**

Run: `curl -s http://localhost:3001/sitemap.xml | grep -c "gio-hang\|thanh-toan\|dat-hang"`
Expected: `0`

- [ ] **Step 4: Commit**

```bash
git add frontend-gomsu/app/robots.js
git commit -m "Keep auth, account and checkout pages out of search results"
```

---

## Task 3: CartProvider và badge trên navbar

**Files:**
- Create: `frontend-gomsu/lib/useCart.js`
- Modify: `frontend-gomsu/app/layout.js`
- Modify: `frontend-gomsu/components/layout/Navbar.js`

**Interfaces:**
- Consumes: `authFetch` từ Task 1.
- Produces: `useCart()` trả về `{ items, subtotal, hasIssues, count, isLoading, addItem, updateItem, removeItem, reload, reset }`.
  - `count` = tổng `quantity` của mọi dòng, dùng cho badge navbar
  - `items[]` mỗi phần tử: `{ id, quantity, unitPrice, lineTotal, available, warnings[], variant: { id, sku, variantAttributes, imageUrl }, product: { id, name, slug } }`
  - `addItem(variantId, quantity)` → Promise, ném Error khi thất bại thật
  - `updateItem(itemId, quantity)` → Promise
  - `removeItem(itemId)` → Promise
  - `reset()` → xoá state tại chỗ, không gọi API

- [ ] **Step 1: Tạo `lib/useCart.js`**

```jsx
'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authFetch } from '@/lib/adminAuth';
import { useAuth } from '@/lib/useAuth';

const CartContext = createContext();

const EMPTY = { items: [], subtotal: 0, hasIssues: false };

export function CartProvider({ children }) {
  const { user, isLoading: authLoading } = useAuth();
  const [cart, setCart] = useState(EMPTY);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    const json = await authFetch('/cart');
    if (json.data) setCart({ items: json.data.items, subtotal: json.data.subtotal, hasIssues: json.data.hasIssues });
  }, []);

  const reset = useCallback(() => setCart(EMPTY), []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setCart(EMPTY);
      setIsLoading(false);
      return;
    }
    reload().catch(() => setCart(EMPTY)).finally(() => setIsLoading(false));
  }, [user, authLoading, reload]);

  async function addItem(variantId, quantity = 1) {
    await authFetch('/cart/items', {
      method: 'POST',
      body: JSON.stringify({ variantId, quantity }),
    });
    await reload();
  }

  async function updateItem(itemId, quantity) {
    await authFetch(`/cart/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    });
    await reload();
  }

  async function removeItem(itemId) {
    await authFetch(`/cart/items/${itemId}`, { method: 'DELETE' });
    await reload();
  }

  const count = cart.items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{ ...cart, count, isLoading, addItem, updateItem, removeItem, reload, reset }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
```

- [ ] **Step 2: Bọc `CartProvider` trong `app/layout.js`**

Đặt BÊN TRONG `AuthProvider` vì `useCart` gọi `useAuth`:

```jsx
        <AuthProvider>
          <CartProvider>
            <Navbar />
            <main className="min-h-screen">{children}</main>
          </CartProvider>
        </AuthProvider>
```

Thêm import: `import { CartProvider } from '@/lib/useCart';`

- [ ] **Step 3: Thêm badge vào `components/layout/Navbar.js`**

Thêm import `import { useCart } from '@/lib/useCart';` và trong component: `const { count } = useCart();`

Chèn ngay TRƯỚC khối `{user ? (` trong phần "Right side":

```jsx
        {user && (
          <Link href="/gio-hang" className="relative text-xs uppercase tracking-widest text-gomsu-text-muted hover:text-gomsu-primary transition-colors">
            Giỏ hàng
            {count > 0 && (
              <span className="absolute -top-2 -right-4 bg-gomsu-primary text-black rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold">
                {count}
              </span>
            )}
          </Link>
        )}
```

- [ ] **Step 4: Kiểm tra trang vẫn dựng được**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/`
Expected: 200

- [ ] **Step 5: Kiểm tay trên trình duyệt**

1. Mở `http://localhost:3001` khi CHƯA đăng nhập → navbar không có chữ "Giỏ hàng"
2. Đăng nhập → navbar hiện "Giỏ hàng", chưa có số
3. Mở tab Network, xác nhận có đúng **một** request `GET /cart` kèm header `X-Brand-Slug`

- [ ] **Step 6: Commit**

```bash
git add frontend-gomsu/lib/useCart.js frontend-gomsu/app/layout.js frontend-gomsu/components/layout/Navbar.js
git commit -m "Add shared cart state and navbar cart link"
```

---

## Task 4: Chặn open redirect và quay lại trang cũ sau đăng nhập

**Files:**
- Create: `frontend-gomsu/lib/redirect.js`
- Test: `frontend-gomsu/lib/redirect.test.js`
- Modify: `frontend-gomsu/app/auth/login/page.js`

**Interfaces:**
- Produces: `isSafeRedirect(url)` → boolean. Task 5 dùng để dựng link `/auth/login?redirect=...`.

- [ ] **Step 1: Viết test thất bại**

Tạo `lib/redirect.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { isSafeRedirect } from './redirect';

describe('isSafeRedirect', () => {
  it('nhận đường dẫn nội bộ', () => {
    expect(isSafeRedirect('/gio-hang')).toBe(true);
    expect(isSafeRedirect('/san-pham/binh-gom')).toBe(true);
  });

  it('từ chối URL tuyệt đối ra ngoài', () => {
    expect(isSafeRedirect('https://trang-gia-mao.com')).toBe(false);
    expect(isSafeRedirect('http://trang-gia-mao.com')).toBe(false);
  });

  it('từ chối dạng //host vì trình duyệt hiểu là ra ngoài', () => {
    expect(isSafeRedirect('//trang-gia-mao.com')).toBe(false);
  });

  it('từ chối giá trị rỗng hoặc không phải chuỗi', () => {
    expect(isSafeRedirect('')).toBe(false);
    expect(isSafeRedirect(null)).toBe(false);
    expect(isSafeRedirect(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận THẤT BẠI**

Run: `cd frontend-gomsu && npm test`
Expected: FAIL — không tìm thấy module `./redirect`

- [ ] **Step 3: Tạo `lib/redirect.js`**

```js
// Không bao giờ đẩy thẳng giá trị từ query vào router.push. Kẻ xấu gửi link
// /auth/login?redirect=https://trang-gia-mao.com thì khách đăng nhập xong bị ném sang đó,
// mà vừa đi ra từ site thật nên rất dễ tin. Dạng //host cũng ra ngoài được nên chặn riêng.
export function isSafeRedirect(url) {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//');
}
```

- [ ] **Step 4: Chạy test, xác nhận ĐẠT**

Run: `cd frontend-gomsu && npm test`
Expected: 6 passed (2 của Task 1 + 4 của task này)

- [ ] **Step 5: Sửa `app/auth/login/page.js`**

Thêm import:

```js
import { useSearchParams } from 'next/navigation';
import { isSafeRedirect } from '@/lib/redirect';
```

Trong component, thêm sau `const router = useRouter();`:

```js
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect');

  // Khách đang giữa chừng mua hàng thì đưa họ về đúng chỗ đang dở, kể cả tài khoản admin —
  // họ bấm "thêm vào giỏ" chứ không phải muốn vào trang quản trị.
  function destinationFor(role) {
    if (isSafeRedirect(redirectTo)) return redirectTo;
    return role === 'admin' ? '/admin/posts' : '/';
  }
```

Đổi `useEffect` chuyển hướng khi đã đăng nhập:

```js
  useEffect(() => {
    if (!isLoading && user) router.push(destinationFor(user.role));
  }, [user, isLoading, router]);
```

Đổi trong `handleSubmit`:

```js
      const result = await login(email, password);
      router.push(destinationFor(result.user.role));
```

- [ ] **Step 6: Kiểm tay**

1. Mở `http://localhost:3001/auth/login?redirect=/gio-hang` → đăng nhập → phải về `/gio-hang`
2. Mở `http://localhost:3001/auth/login?redirect=https://example.com` → đăng nhập → phải về `/` (hoặc `/admin/posts` nếu là admin), TUYỆT ĐỐI không sang example.com
3. Mở `http://localhost:3001/auth/login` không kèm query → admin về `/admin/posts`, khách về `/`

- [ ] **Step 7: Commit**

```bash
git add frontend-gomsu/lib/redirect.js frontend-gomsu/lib/redirect.test.js frontend-gomsu/app/auth/login/page.js
git commit -m "Return users to where they were after logging in"
```

---

## Task 5: Khối mua hàng trên trang sản phẩm

**Files:**
- Create: `frontend-gomsu/components/product/AddToCart.js`
- Modify: `frontend-gomsu/app/san-pham/[slug]/page.js:176-209`

**Interfaces:**
- Consumes: `useCart().addItem` (Task 3), `isSafeRedirect` không dùng ở đây nhưng link login phải trỏ `/auth/login?redirect=/san-pham/<slug>`.
- Produces: `<AddToCart variants={...} slug={...} />`

- [ ] **Step 1: Tạo `components/product/AddToCart.js`**

```jsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';
import { useCart } from '@/lib/useCart';
import { formatPrice } from '@/lib/utils';

export default function AddToCart({ variants, slug }) {
  const router = useRouter();
  const { user } = useAuth();
  const { addItem } = useCart();

  const sellable = variants.filter((v) => v.stockQuantity - v.reservedQuantity > 0);
  const [variantId, setVariantId] = useState(sellable[0]?.id || null);
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState({ busy: false, error: '', done: false });

  const selected = variants.find((v) => v.id === variantId);
  const available = selected ? selected.stockQuantity - selected.reservedQuantity : 0;
  const maxQuantity = Math.min(99, available); // backend chặn cứng 99 mỗi dòng

  if (sellable.length === 0) {
    return <p className="text-sm text-gomsu-text-muted uppercase tracking-widest">Tạm hết hàng</p>;
  }

  async function handleAdd() {
    if (!user) {
      router.push(`/auth/login?redirect=/san-pham/${slug}`);
      return;
    }
    setStatus({ busy: true, error: '', done: false });
    try {
      await addItem(variantId, quantity);
      setStatus({ busy: false, error: '', done: true });
    } catch (err) {
      setStatus({ busy: false, error: err.message, done: false });
    }
  }

  return (
    <div className="space-y-5 border-t border-gomsu-border pt-6">
      {variants.length > 1 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-gomsu-text-muted mb-3">Chọn phiên bản</p>
          <div className="space-y-2">
            {variants.map((v) => {
              const left = v.stockQuantity - v.reservedQuantity;
              const disabled = left <= 0;
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => { setVariantId(v.id); setQuantity(1); }}
                  className={`w-full flex justify-between items-center px-4 py-3 border text-sm transition-colors ${
                    v.id === variantId ? 'border-gomsu-primary text-gomsu-primary' : 'border-gomsu-border text-gomsu-text'
                  } ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:border-gomsu-primary'}`}
                >
                  <span>{v.variantAttributes?.label || v.sku}</span>
                  <span>{disabled ? 'Hết hàng' : formatPrice(v.price)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4">
        <span className="text-xs uppercase tracking-widest text-gomsu-text-muted">Số lượng</span>
        <div className="flex items-center border border-gomsu-border">
          <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="px-4 py-2 hover:text-gomsu-primary">−</button>
          <span className="px-4 py-2 min-w-[3rem] text-center">{quantity}</span>
          <button type="button" onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))} className="px-4 py-2 hover:text-gomsu-primary">+</button>
        </div>
        <span className="text-xs text-gomsu-text-muted">Còn {available}</span>
      </div>

      {status.error && <p className="text-sm text-red-400">{status.error}</p>}
      {status.done && <p className="text-sm text-gomsu-primary">Đã thêm vào giỏ hàng.</p>}

      <button
        type="button"
        onClick={handleAdd}
        disabled={status.busy}
        className="w-full bg-gomsu-primary text-black py-4 text-xs uppercase tracking-widest font-bold hover:bg-white transition-colors disabled:opacity-50"
      >
        {status.busy ? 'Đang thêm...' : 'Thêm vào giỏ hàng'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Gắn vào trang sản phẩm**

Trong `app/san-pham/[slug]/page.js`, thay TOÀN BỘ khối `{product.variants.length > 1 && (...)}` (bảng "Các phiên bản", dòng 176-209) bằng:

```jsx
          <AddToCart variants={product.variants} slug={product.slug} />
```

Thêm import ở đầu file: `import AddToCart from '@/components/product/AddToCart';`

Giữ nguyên `generateMetadata` và khối JSON-LD — đây là ràng buộc SEO.

- [ ] **Step 3: Kiểm tra SEO không vỡ**

```bash
SLUG=$(curl -s "http://localhost:4000/api/v1/products?pageSize=1" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).data[0].slug))")
curl -s "http://localhost:3001/san-pham/$SLUG" | grep -c "application/ld+json"
```
Expected: `2` trở lên (Product + BreadcrumbList vẫn còn). Nếu ra `0` thì trang đã bị biến
thành client component — quay lại sửa, đây là ràng buộc SEO không được vi phạm.

- [ ] **Step 4: Kiểm tay**

1. Chưa đăng nhập, bấm "Thêm vào giỏ hàng" → chuyển sang `/auth/login?redirect=/san-pham/<slug>`
2. Đăng nhập xong → quay về đúng trang sản phẩm
3. Bấm thêm → hiện "Đã thêm vào giỏ hàng", badge trên navbar **tăng ngay** không cần F5
4. Sản phẩm nhiều phiên bản: bấm đổi phiên bản → giá và số "Còn N" đổi theo
5. Phiên bản hết hàng → nút mờ, không bấm được

- [ ] **Step 5: Commit**

```bash
git add frontend-gomsu/components/product/AddToCart.js "frontend-gomsu/app/san-pham/[slug]/page.js"
git commit -m "Let customers pick a variant and add it to the cart"
```

---

## Task 6: Trang giỏ hàng

**Files:**
- Create: `frontend-gomsu/app/gio-hang/page.js`
- Create: `frontend-gomsu/app/gio-hang/layout.js`

**Interfaces:**
- Consumes: `useCart()` (Task 3).
- Produces: route `/gio-hang`, có nút dẫn sang `/thanh-toan`.

- [ ] **Step 1: Tạo `app/gio-hang/layout.js`**

Trang là client component nên không export được `metadata`; đặt ở layout:

```jsx
export const metadata = {
  title: 'Giỏ hàng',
  robots: { index: false, follow: false },
};

export default function CartLayout({ children }) {
  return children;
}
```

- [ ] **Step 2: Tạo `app/gio-hang/page.js`**

```jsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/lib/useCart';
import { useAuth } from '@/lib/useAuth';
import { formatPrice, getImageUrl } from '@/lib/utils';

const WARNING_TEXT = {
  OUT_OF_STOCK: 'Sản phẩm đã hết hàng',
  INSUFFICIENT_STOCK: 'Không đủ số lượng, vui lòng giảm bớt',
  UNAVAILABLE: 'Sản phẩm đã ngừng bán',
};

export default function CartPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { items, subtotal, hasIssues, isLoading, updateItem, removeItem } = useCart();
  const [busyId, setBusyId] = useState(null);

  if (authLoading || isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Đang tải...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6">
        <p className="text-gomsu-text-muted">Vui lòng đăng nhập để xem giỏ hàng.</p>
        <Link href="/auth/login?redirect=/gio-hang" className="text-gomsu-primary hover:underline">Đăng nhập</Link>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6">
        <h1 className="font-serif text-3xl">Giỏ hàng trống</h1>
        <Link href="/san-pham" className="text-gomsu-primary hover:underline">Xem sản phẩm</Link>
      </div>
    );
  }

  async function change(itemId, quantity) {
    setBusyId(itemId);
    try {
      if (quantity <= 0) await removeItem(itemId);
      else await updateItem(itemId, quantity);
    } catch (err) {
      alert('Không cập nhật được: ' + err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen max-w-5xl mx-auto px-6 py-16">
      <h1 className="font-serif text-4xl mb-10">Giỏ hàng</h1>

      <div className="space-y-6">
        {items.map((item) => (
          <div key={item.id} className="flex gap-6 border-b border-gomsu-border pb-6">
            {item.variant.imageUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={getImageUrl(item.variant.imageUrl)} alt={item.product.name} className="w-24 h-24 object-cover" />
            )}
            <div className="flex-1">
              <Link href={`/san-pham/${item.product.slug}`} className="font-serif text-lg hover:text-gomsu-primary">
                {item.product.name}
              </Link>
              <p className="text-xs text-gomsu-text-muted mt-1">
                {item.variant.variantAttributes?.label || item.variant.sku}
              </p>
              <p className="text-sm mt-2">{formatPrice(item.unitPrice)}</p>

              {item.warnings.map((w) => (
                <p key={w} className="text-xs text-red-400 mt-2">{WARNING_TEXT[w] || w}</p>
              ))}

              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center border border-gomsu-border">
                  <button onClick={() => change(item.id, item.quantity - 1)} disabled={busyId === item.id} className="px-3 py-1 hover:text-gomsu-primary">−</button>
                  <span className="px-3 py-1 min-w-[2.5rem] text-center">{item.quantity}</span>
                  <button onClick={() => change(item.id, item.quantity + 1)} disabled={busyId === item.id || item.quantity >= 99} className="px-3 py-1 hover:text-gomsu-primary">+</button>
                </div>
                <button onClick={() => change(item.id, 0)} disabled={busyId === item.id} className="text-xs uppercase tracking-widest text-gomsu-text-muted hover:text-red-400">
                  Xoá
                </button>
              </div>
            </div>
            <div className="font-serif text-lg text-gomsu-primary">{formatPrice(item.lineTotal)}</div>
          </div>
        ))}
      </div>

      <div className="mt-10 flex flex-col items-end gap-4">
        <div className="flex gap-8 items-baseline">
          <span className="text-xs uppercase tracking-widest text-gomsu-text-muted">Tạm tính</span>
          <span className="font-serif text-3xl text-gomsu-primary">{formatPrice(subtotal)}</span>
        </div>
        <p className="text-xs text-gomsu-text-muted">Phí vận chuyển sẽ được báo sau khi xác nhận đơn.</p>

        {hasIssues && (
          <p className="text-sm text-red-400">Vui lòng xử lý các sản phẩm được đánh dấu ở trên trước khi đặt hàng.</p>
        )}

        {/* Dùng button chứ không phải Link bị vô hiệu hoá bằng pointer-events-none: cách đó
            chỉ chặn chuột, người dùng bàn phím vẫn tab tới và Enter được. */}
        <button
          type="button"
          disabled={hasIssues}
          onClick={() => router.push('/thanh-toan')}
          className={`px-10 py-4 text-xs uppercase tracking-widest font-bold transition-colors ${
            hasIssues ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-gomsu-primary text-black hover:bg-white'
          }`}
        >
          Tiến hành đặt hàng
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Kiểm tra noindex**

Run: `curl -s http://localhost:3001/gio-hang | grep -o 'name="robots" content="[^"]*"'`
Expected: chứa `noindex`

- [ ] **Step 4: Kiểm tay**

1. Chưa đăng nhập vào `/gio-hang` → hiện lời mời đăng nhập
2. Giỏ rỗng → hiện màn trống có nút "Xem sản phẩm"
3. Tăng/giảm số lượng → tổng tiền đổi theo
4. Giảm về 0 → dòng biến mất, badge navbar giảm
5. Thêm số lượng vượt tồn kho (qua trang sản phẩm) → dòng hiện cảnh báo đỏ và nút "Tiến hành đặt hàng" bị khoá

- [ ] **Step 5: Commit**

```bash
git add frontend-gomsu/app/gio-hang
git commit -m "Add cart page with stock warnings and quantity editing"
```

---

## Task 7: Trang thanh toán

**Files:**
- Create: `frontend-gomsu/app/thanh-toan/page.js`
- Create: `frontend-gomsu/app/thanh-toan/layout.js`

**Interfaces:**
- Consumes: `useCart()` (Task 3).
- Produces: gọi `POST /orders`, chuyển sang `/dat-hang-thanh-cong/<code>`.

- [ ] **Step 1: Tạo `app/thanh-toan/layout.js`**

```jsx
export const metadata = {
  title: 'Thanh toán',
  robots: { index: false, follow: false },
};

export default function CheckoutLayout({ children }) {
  return children;
}
```

- [ ] **Step 2: Tạo `app/thanh-toan/page.js`**

```jsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch } from '@/lib/adminAuth';
import { useCart } from '@/lib/useCart';
import { useAuth } from '@/lib/useAuth';
import { formatPrice } from '@/lib/utils';

export default function CheckoutPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { items, subtotal, hasIssues, isLoading, reset } = useCart();

  const [form, setForm] = useState({ fullName: '', phone: '', addressLine: '', city: '' });
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('COD');
  const [status, setStatus] = useState({ busy: false, error: '' });

  useEffect(() => {
    if (authLoading || isLoading) return;
    if (!user) router.push('/auth/login?redirect=/thanh-toan');
    else if (items.length === 0 || hasIssues) router.push('/gio-hang');
  }, [user, authLoading, isLoading, items.length, hasIssues, router]);

  if (authLoading || isLoading || !user || items.length === 0) {
    return <div className="min-h-screen flex items-center justify-center">Đang tải...</div>;
  }

  function change(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus({ busy: true, error: '' });
    try {
      const json = await authFetch('/orders', {
        method: 'POST',
        body: JSON.stringify({ paymentMethod, shippingAddress: form, note: note || null }),
      });
      if (!json.data) throw new Error('Đặt hàng thất bại');
      // Backend xoá sạch cartItem trong cùng transaction, nên phải dọn state ở đây,
      // nếu không badge trên navbar vẫn hiện số cũ.
      reset();
      router.push(`/dat-hang-thanh-cong/${json.data.code}`);
    } catch (err) {
      setStatus({ busy: false, error: err.message });
    }
  }

  const field = 'w-full bg-transparent border border-gray-600 px-4 py-3 text-gomsu-text placeholder:text-gray-500 focus:outline-none focus:border-gomsu-primary transition-colors';

  return (
    <div className="min-h-screen max-w-5xl mx-auto px-6 py-16">
      <h1 className="font-serif text-4xl mb-10">Thanh toán</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <form onSubmit={handleSubmit} className="space-y-5">
          <h2 className="font-serif text-xl">Địa chỉ giao hàng</h2>

          {[
            { name: 'fullName', label: 'Họ tên người nhận', placeholder: 'Nguyễn Văn A' },
            { name: 'phone', label: 'Số điện thoại', placeholder: '0987 654 321' },
            { name: 'addressLine', label: 'Địa chỉ', placeholder: 'Số nhà, đường, phường/xã' },
            { name: 'city', label: 'Tỉnh/Thành phố', placeholder: 'Hà Nội' },
          ].map((f) => (
            <div key={f.name}>
              <label className="block text-xs uppercase tracking-widest text-gomsu-text-muted mb-2">
                {f.label} <span className="text-red-500">*</span>
              </label>
              <input name={f.name} value={form[f.name]} onChange={change} placeholder={f.placeholder} required className={field} />
            </div>
          ))}

          <div>
            <label className="block text-xs uppercase tracking-widest text-gomsu-text-muted mb-2">Ghi chú</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows="3" maxLength={500} className={`${field} resize-none`} />
          </div>

          <div>
            <h2 className="font-serif text-xl mb-3">Phương thức thanh toán</h2>
            <label className="flex items-center gap-3 py-2 cursor-pointer">
              <input type="radio" name="pm" value="COD" checked={paymentMethod === 'COD'} onChange={() => setPaymentMethod('COD')} />
              <span className="text-sm">Trả tiền mặt khi nhận hàng</span>
            </label>
            <label className="flex items-center gap-3 py-2 cursor-pointer">
              <input type="radio" name="pm" value="BANK_TRANSFER" checked={paymentMethod === 'BANK_TRANSFER'} onChange={() => setPaymentMethod('BANK_TRANSFER')} />
              <span className="text-sm">Chuyển khoản ngân hàng</span>
            </label>
            {paymentMethod === 'BANK_TRANSFER' && (
              <p className="text-xs text-gomsu-text-muted mt-2">
                Hàng được giữ trong 24 giờ. Quá hạn chưa chuyển khoản thì đơn tự huỷ và hàng trả lại kho.
              </p>
            )}
          </div>

          {status.error && <p className="text-sm text-red-400">{status.error}</p>}

          <button type="submit" disabled={status.busy} className="w-full bg-gomsu-primary text-black py-4 text-xs uppercase tracking-widest font-bold hover:bg-white transition-colors disabled:opacity-50">
            {status.busy ? 'Đang đặt hàng...' : 'Đặt hàng'}
          </button>
        </form>

        <div className="border border-gomsu-border p-6 h-fit">
          <h2 className="font-serif text-xl mb-5">Đơn hàng</h2>
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-gomsu-text-muted">
                  {item.product.name} × {item.quantity}
                </span>
                <span>{formatPrice(item.lineTotal)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-gomsu-border mt-5 pt-5 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gomsu-text-muted">Tạm tính</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gomsu-text-muted">Phí vận chuyển</span>
              <span className="text-xs text-gomsu-text-muted">Báo sau khi xác nhận đơn</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Kiểm tay**

1. Giỏ rỗng vào `/thanh-toan` → bị đẩy về `/gio-hang`
2. Bỏ trống một trường bắt buộc → trình duyệt chặn gửi
3. Đặt đơn COD → chuyển sang `/dat-hang-thanh-cong/<mã>`, badge navbar về 0
4. Kiểm tra phần tóm tắt **không** hiện "0 ₫" ở dòng phí vận chuyển

- [ ] **Step 4: Commit**

```bash
git add frontend-gomsu/app/thanh-toan
git commit -m "Add checkout page with address form and payment choice"
```

---

## Task 8: Trang xác nhận và mã QR chuyển khoản

**Files:**
- Create: `frontend-gomsu/lib/vietqr.js`
- Test: `frontend-gomsu/lib/vietqr.test.js`
- Create: `frontend-gomsu/app/dat-hang-thanh-cong/[code]/page.js`
- Create: `frontend-gomsu/app/dat-hang-thanh-cong/layout.js`

**Interfaces:**
- Consumes: `authFetch` (Task 1), `apiFetch` (Task 1) để lấy 3 key ngân hàng.
- Produces: `buildVietQrUrl({ bankId, accountNo, accountName, amount, addInfo })` → string URL.

- [ ] **Step 1: Viết test thất bại**

Tạo `lib/vietqr.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildVietQrUrl } from './vietqr';

const base = { bankId: '970436', accountNo: '1234567890', accountName: 'NGUYEN DUC NGHIA', amount: 1800000, addInfo: 'NP12345' };

describe('buildVietQrUrl', () => {
  it('dựng URL có mã ngân hàng và số tài khoản', () => {
    expect(buildVietQrUrl(base)).toContain('https://img.vietqr.io/image/970436-1234567890-compact2.png');
  });

  it('điền sẵn số tiền và nội dung chuyển khoản', () => {
    const url = buildVietQrUrl(base);
    expect(url).toContain('amount=1800000');
    expect(url).toContain('addInfo=NP12345');
  });

  it('mã hoá ký tự đặc biệt trong tên chủ tài khoản', () => {
    const url = buildVietQrUrl({ ...base, accountName: 'NGUYEN DUC NGHIA' });
    expect(url).toContain('accountName=NGUYEN%20DUC%20NGHIA');
  });

  it('trả null khi thiếu cấu hình ngân hàng', () => {
    expect(buildVietQrUrl({ ...base, bankId: '' })).toBe(null);
    expect(buildVietQrUrl({ ...base, accountNo: undefined })).toBe(null);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận THẤT BẠI**

Run: `cd frontend-gomsu && npm test`
Expected: FAIL — không tìm thấy module `./vietqr`

- [ ] **Step 3: Tạo `lib/vietqr.js`**

```js
// Ảnh QR miễn phí của VietQR, không cần đăng ký cổng thanh toán. Điền sẵn số tiền và nội
// dung để khách khỏi gõ tay — gõ sai nội dung là đơn không tự khớp được, phải dò thủ công.
export function buildVietQrUrl({ bankId, accountNo, accountName, amount, addInfo }) {
  if (!bankId || !accountNo) return null;

  const params = new URLSearchParams({
    amount: String(amount),
    addInfo,
    accountName: accountName || '',
  });
  // URLSearchParams mã hoá dấu cách thành '+', nhưng VietQR đọc đúng dạng %20.
  const query = params.toString().replace(/\+/g, '%20');

  return `https://img.vietqr.io/image/${bankId}-${accountNo}-compact2.png?${query}`;
}
```

- [ ] **Step 4: Chạy test, xác nhận ĐẠT**

Run: `cd frontend-gomsu && npm test`
Expected: 10 passed

- [ ] **Step 5: Tạo `app/dat-hang-thanh-cong/layout.js`**

```jsx
export const metadata = {
  title: 'Đặt hàng thành công',
  robots: { index: false, follow: false },
};

export default function OrderDoneLayout({ children }) {
  return children;
}
```

- [ ] **Step 6: Tạo `app/dat-hang-thanh-cong/[code]/page.js`**

```jsx
'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch } from '@/lib/adminAuth';
import { apiFetch } from '@/lib/apiClient';
import { buildVietQrUrl } from '@/lib/vietqr';
import { formatPrice } from '@/lib/utils';

export default function OrderDonePage({ params }) {
  const { code } = use(params); // Next.js 16: params là Promise
  const [order, setOrder] = useState(null);
  const [bank, setBank] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      authFetch(`/orders/${code}`),
      apiFetch('/settings?keys=bank_id,bank_account_no,bank_account_name'),
    ])
      .then(([orderRes, settingsRes]) => {
        if (!orderRes.data) throw new Error('Không tìm thấy đơn hàng');
        setOrder(orderRes.data);
        setBank(settingsRes?.data || {});
      })
      .catch((err) => setError(err.message));
  }, [code]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6">
        <p className="text-red-400">{error}</p>
        <Link href="/san-pham" className="text-gomsu-primary hover:underline">Về trang sản phẩm</Link>
      </div>
    );
  }

  if (!order) return <div className="min-h-screen flex items-center justify-center">Đang tải...</div>;

  const isBankTransfer = order.paymentMethod === 'BANK_TRANSFER';
  const qrUrl = isBankTransfer
    ? buildVietQrUrl({
        bankId: bank.bank_id,
        accountNo: bank.bank_account_no,
        accountName: bank.bank_account_name,
        amount: order.grandTotal,
        addInfo: order.code,
      })
    : null;

  return (
    <div className="min-h-screen max-w-3xl mx-auto px-6 py-16">
      <h1 className="font-serif text-4xl mb-3">Đặt hàng thành công</h1>
      <p className="text-gomsu-text-muted mb-10">
        Mã đơn hàng của bạn: <span className="text-gomsu-primary font-medium">{order.code}</span>
      </p>

      {isBankTransfer && (
        <div className="border border-gomsu-primary/40 p-6 mb-10">
          <h2 className="font-serif text-xl mb-4">Thông tin chuyển khoản</h2>

          {qrUrl ? (
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              {/* Dùng <img> thường chứ không phải next/image: mỗi đơn một URL khác nhau nên
                  qua next/image là luôn cache miss và đốt quota tối ưu ảnh của Vercel. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrUrl} alt={`Mã QR chuyển khoản đơn ${order.code}`} className="w-56 h-56 bg-white p-2" />
              <dl className="text-sm space-y-2">
                <div><dt className="text-gomsu-text-muted text-xs uppercase tracking-widest">Chủ tài khoản</dt><dd>{bank.bank_account_name}</dd></div>
                <div><dt className="text-gomsu-text-muted text-xs uppercase tracking-widest">Số tài khoản</dt><dd>{bank.bank_account_no}</dd></div>
                <div><dt className="text-gomsu-text-muted text-xs uppercase tracking-widest">Số tiền</dt><dd className="text-gomsu-primary">{formatPrice(order.grandTotal)}</dd></div>
                <div><dt className="text-gomsu-text-muted text-xs uppercase tracking-widest">Nội dung</dt><dd>{order.code}</dd></div>
              </dl>
            </div>
          ) : (
            <p className="text-sm text-gomsu-text-muted">
              Cửa hàng chưa cấu hình tài khoản nhận tiền. Vui lòng liên hệ để được hướng dẫn thanh toán.
            </p>
          )}

          {order.expiresAt && (
            <p className="text-xs text-red-400 mt-5">
              Vui lòng chuyển khoản trước {new Date(order.expiresAt).toLocaleString('vi-VN')}.
              Quá hạn đơn sẽ tự huỷ và hàng được trả lại kho.
            </p>
          )}
        </div>
      )}

      {!isBankTransfer && (
        <p className="text-gomsu-text-muted mb-10">
          Bạn thanh toán bằng tiền mặt khi nhận hàng. Vui lòng chuẩn bị {formatPrice(order.grandTotal)}.
        </p>
      )}

      <div className="border-t border-gomsu-border pt-6 space-y-3">
        <h2 className="font-serif text-xl mb-3">Chi tiết đơn</h2>
        {order.items.map((item) => (
          <div key={item.id} className="flex justify-between text-sm">
            <span className="text-gomsu-text-muted">{item.productName} × {item.quantity}</span>
            <span>{formatPrice(item.lineTotal)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-gomsu-border pt-3 mt-3">
          <span className="text-xs uppercase tracking-widest text-gomsu-text-muted">Tổng cộng</span>
          <span className="font-serif text-xl text-gomsu-primary">{formatPrice(order.grandTotal)}</span>
        </div>
        <p className="text-xs text-gomsu-text-muted">Phí vận chuyển sẽ được báo riêng sau khi xác nhận đơn.</p>
      </div>

      <div className="mt-10">
        <Link href="/san-pham" className="text-sm text-gomsu-primary hover:underline">Tiếp tục mua sắm</Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Đặt 3 key ngân hàng**

Thay email/mật khẩu admin và thông tin ngân hàng thật vào đoạn dưới rồi chạy nguyên khối —
nó tự lấy access token nên không phải chép tay:

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"EMAIL_ADMIN","password":"MAT_KHAU_ADMIN"}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).data.accessToken))")

curl -s -X PATCH http://localhost:4000/api/v1/settings \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"settings":{"bank_id":"970436","bank_account_no":"1234567890","bank_account_name":"NGUYEN DUC NGHIA"}}'
```

`bank_id` là mã ngân hàng theo chuẩn VietQR (`970436` = Vietcombank, `970415` = VietinBank,
`970422` = MB Bank). Route `/settings` không dùng `resolveBrand` nên không cần header brand.

- [ ] **Step 8: Kiểm tay**

1. Đặt đơn COD → trang hiện lời nhắc chuẩn bị tiền mặt, KHÔNG hiện QR
2. Đặt đơn chuyển khoản → hiện QR, số tài khoản, và hạn 24 giờ
3. Quét thử QR bằng app ngân hàng → số tiền và nội dung phải tự điền sẵn đúng
4. Xoá 3 key ngân hàng → trang vẫn hiện bình thường, chỉ thay QR bằng lời nhắc liên hệ
5. Sửa URL sang mã đơn của người khác → hiện "Không tìm thấy đơn hàng"

- [ ] **Step 9: Commit**

```bash
git add frontend-gomsu/lib/vietqr.js frontend-gomsu/lib/vietqr.test.js frontend-gomsu/app/dat-hang-thanh-cong
git commit -m "Show order confirmation with VietQR transfer details"
```

---

## Kiểm tra cuối

- [ ] `cd frontend-gomsu && npm test` → 10 passed
- [ ] Đi trọn luồng: xem sản phẩm → thêm vào giỏ → sửa số lượng → đặt hàng chuyển khoản → quét QR
- [ ] `curl -s http://localhost:3001/robots.txt` chứa đủ 6 nhóm `Disallow`
- [ ] `curl -s http://localhost:3001/sitemap.xml | grep -c "gio-hang\|thanh-toan\|dat-hang"` trả `0`
- [ ] Trang sản phẩm vẫn còn JSON-LD (dùng lại đoạn lấy `$SLUG` ở Task 1 Step 10) ≥ 2
- [ ] Xoá tài khoản thử `claude-test-delete-me@example.com` khỏi database
