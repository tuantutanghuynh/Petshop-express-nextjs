# Phase 4 — Giỏ hàng & Thanh toán (frontend-gomsu)

Ngày chốt: 2026-09-21
Nhánh: `feature/ecommerce-cart`

## Mục tiêu

Khách đăng nhập chọn được hàng, đặt đơn, và nhận thông tin thanh toán. Lát cắt nhỏ nhất
mà việc mua bán diễn ra thật: thêm vào giỏ → trang giỏ → trang thanh toán → trang xác nhận.

**Ngoài phạm vi:** lịch sử đơn hàng của khách, màn admin duyệt đơn, VNPay. Backend đã có
sẵn API cho hai việc đầu, làm sau trong phase riêng.

## Ràng buộc từ backend (đã có, không sửa)

| Điều | Hệ quả lên frontend |
|---|---|
| `cart.route.js` và `order.route.js` dùng `authenticate` | Không có mua hàng kiểu khách vãng lai. Chưa đăng nhập phải đẩy sang login. |
| Hai route đó dùng `resolveBrand`, đọc header `X-Brand-Slug`, **không có giá trị mặc định** | Mọi request giỏ/đơn phải gửi header. Thiếu là 400 `BRAND_REQUIRED`. Slug của bản này là `gom-su-trang-tri`. Route sản phẩm KHÔNG cần header. |
| Giỏ không lưu giá, đọc lại từ database mỗi lần | Client không được tự cộng tiền. Luôn hiển thị số từ API. |
| Mỗi dòng giỏ có mảng `warnings` và giỏ có cờ `hasIssues` | Hiện cảnh báo từng dòng; `hasIssues` bật thì khoá nút thanh toán. |
| `SHIPPING_FEE_NOT_CALCULATED = 0`, nghĩa là "chưa tính" chứ không phải "miễn phí" | Không hiện "0 ₫". Ghi rõ phí ship báo sau khi xác nhận đơn. |
| `createOrder` xoá sạch `cartItem` trong cùng transaction | Đặt hàng xong phải reset state giỏ ở client, nếu không badge navbar hiện số cũ. |
| Đơn `BANK_TRANSFER` có `expiresAt` = 24h; worker tự nhả hàng | Trang xác nhận phải nói rõ hạn 24h. |
| Số lượng mỗi dòng tối đa 99 | Ô nhập số lượng chặn ở 99. |

## Kiến trúc

### 1. Gửi `X-Brand-Slug` tập trung

Thêm header vào `apiFetch` và `authFetch` thay vì rắc ở từng lời gọi. Gắn ở một chỗ thì
không thể quên, và route nào không cần header cũng không sao khi nhận thừa.

Giá trị lấy từ `BRAND_CATEGORY_SLUG` trong `lib/brand.js` — đã có sẵn, đang dùng để lọc
gallery và blog. Không viết chuỗi cứng lần hai.

### 2. `CartProvider` (`lib/useCart.js`)

Đặt ở root layout, bên trong `AuthProvider` (vì cần biết đã đăng nhập chưa).

Giữ: `items`, `subtotal`, `hasIssues`, `isLoading`.
Hàm: `addItem(variantId, quantity)`, `updateItem(itemId, quantity)`, `removeItem(itemId)`,
`reload()`, `reset()`.

Chỉ gọi `GET /cart` khi `user` khác null. Đăng xuất thì `reset()`.

**Vì sao dùng Context chứ không để mỗi trang tự fetch:** hôm nay vừa sửa đúng lớp lỗi này ở
phần đăng nhập — mỗi component gọi hook riêng tạo state riêng, thêm hàng ở trang sản phẩm
mà navbar không biết. Badge số lượng và trang giỏ phải đọc chung một nguồn.

### 3. Khối mua hàng ở trang chi tiết sản phẩm

`app/san-pham/[slug]/page.js` **giữ nguyên là Server Component** — nó đang sinh
`generateMetadata` và JSON-LD cho SEO, không được biến thành client.

Tách khối mua thành `components/product/AddToCart.js` (client), nhận `variants` qua props:

- Danh sách loại bấm chọn được; chọn loại nào thì giá và tồn kho hiển thị theo loại đó
- Loại hết hàng (`stockQuantity - reservedQuantity <= 0`) thì vô hiệu hoá, không cho chọn
- Sản phẩm chỉ có một loại thì bỏ phần chọn, chỉ còn số lượng và nút
- Ô số lượng: tối thiểu 1, tối đa là min(99, tồn khả dụng)
- Chưa đăng nhập: đẩy sang `/auth/login?redirect=/san-pham/<slug>`

### 4. Chuyển hướng sau đăng nhập

`app/auth/login/page.js` đọc query `redirect`. Thứ tự ưu tiên:

1. `redirect` hợp lệ → đi tới đó (kể cả tài khoản admin — họ đang định mua hàng, không phải
   vào quản trị)
2. Không có `redirect`, role admin → `/admin/posts`
3. Còn lại → `/`

**Bắt buộc kiểm tra `redirect` trước khi dùng:**

```js
function isSafeRedirect(url) {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//');
}
```

Nếu đẩy thẳng giá trị từ query vào `router.push` thì thành lỗ open redirect: kẻ xấu gửi link
`/auth/login?redirect=https://trang-gia-mao.com`, khách đăng nhập xong bị ném sang đó mà vừa
đi ra từ site thật nên rất dễ tin. Dạng `//evil.com` cũng ra ngoài được nên phải chặn riêng.

### 5. `/gio-hang`

- Mỗi dòng: ảnh, tên sản phẩm, tên loại, đơn giá, ô số lượng, thành tiền, nút xoá
- Cảnh báo theo `warnings` của từng dòng:
  - `OUT_OF_STOCK` → "Sản phẩm đã hết hàng"
  - `INSUFFICIENT_STOCK` → "Chỉ còn N sản phẩm, vui lòng giảm số lượng"
  - `UNAVAILABLE` → "Sản phẩm đã ngừng bán"
- `hasIssues` bật → nút "Tiến hành đặt hàng" bị khoá, kèm câu giải thích vì sao
- Giỏ rỗng → màn trống có nút về `/san-pham`
- Tổng tiền lấy `subtotal` từ API

Sửa số lượng thì gọi API rồi đọc lại giỏ, **không** dùng cập nhật lạc quan. Lý do: `warnings`,
`lineTotal`, `subtotal` và `hasIssues` đều do server tính. Muốn lạc quan thì client phải tự
đoán lại cả bốn thứ đó — đoán sai là hiện "còn hàng" cho món vừa hết, tệ hơn hẳn việc nút
khựng vài trăm mili giây. Trong lúc chờ thì vô hiệu hoá đúng dòng đang sửa để khách không
bấm chồng.

### 6. `/thanh-toan`

Một trang duy nhất. Với bốn trường địa chỉ thì chia nhiều bước chỉ thêm thao tác.

- Địa chỉ giao: `fullName`, `phone`, `addressLine`, `city` — cả bốn bắt buộc, đánh dấu `*`
  (backend validate từng trường vì địa chỉ được chụp lại vào đơn, sau không sửa được)
- Ghi chú: tuỳ chọn, tối đa 500 ký tự
- Phương thức: `COD` hoặc `BANK_TRANSFER`. Chọn chuyển khoản thì hiện trước cảnh báo giữ
  hàng 24h.
- Tóm tắt đơn: các dòng, tạm tính, và dòng "Phí vận chuyển: báo sau khi xác nhận đơn"
- Vào trang khi giỏ rỗng hoặc `hasIssues` → đẩy về `/gio-hang`
- Đặt thành công → `reset()` state giỏ rồi sang trang xác nhận

Lỗi trả về từ `POST /orders` phải đọc `error.details[0].msg` trước `error.message`, giống
cách đã sửa ở `useAuth` — nếu không khách chỉ thấy "Dữ liệu không hợp lệ".

### 7. `/dat-hang-thanh-cong/[code]`

Lấy đơn qua `GET /orders/:code`.

Chung: mã đơn, danh sách hàng, tổng tiền, địa chỉ giao.

`COD`: câu cảm ơn, nhắc chuẩn bị tiền mặt khi nhận.

`BANK_TRANSFER`: thêm
- Mã QR VietQR đã điền sẵn số tiền và nội dung chuyển khoản (nội dung = mã đơn)
- Ngân hàng, số tài khoản, chủ tài khoản dạng chữ kèm nút sao chép, cho người không quét được
- Hạn chuyển khoản tính từ `expiresAt`, nói rõ quá hạn thì đơn tự huỷ và hàng được trả lại kho

**Dùng thẻ `<img>` thường, không dùng `next/image`.** URL VietQR chứa số tiền và mã đơn nên
mỗi đơn là một URL khác nhau, qua `next/image` thì luôn cache miss và mỗi đơn đốt một lượt
image optimization của Vercel cho tấm ảnh chỉ xem một lần. Dùng `<img>` cũng khỏi phải thêm
`img.vietqr.io` vào `next.config.mjs`.

### 8. Thông tin ngân hàng

Ba key trong `SiteSetting`, admin tự sửa, không viết cứng:

- `bank_id` — mã ngân hàng theo VietQR (ví dụ `970436` cho Vietcombank)
- `bank_account_no`
- `bank_account_name`

Thiếu cấu hình thì trang xác nhận ẩn phần QR và hiện lời nhắc liên hệ shop, không vỡ trang.

## Xử lý lỗi

| Tình huống | Cách xử lý |
|---|---|
| Thêm hàng đúng lúc vừa hết kho | `addItem` **cố tình không từ chối** — thêm vẫn thành công, chỉ sinh `warnings` để trang giỏ hiển thị. Lý do ghi ở `cart.controller.js:76-82`: chặn lúc này vừa quá nghiêm (hàng có thể nhập lại trước khi khách trả tiền) vừa không đủ nghiêm (vẫn có thể hết giữa lúc này và lúc đặt), nên chỉ tin được phép kiểm tra lúc đặt hàng. Nút "thêm vào giỏ" chỉ báo lỗi khi thất bại thật: mất mạng, hết phiên, variant không tồn tại. |
| Hai tab cùng mua món cuối | Backend trừ kho atomic, chỉ một đơn qua; đơn kia báo hết hàng |
| Giá đổi lúc hàng đang nằm trong giỏ | Giỏ đọc giá mới mỗi lần hiển thị, khách thấy giá hiện tại |
| Token hết hạn giữa chừng | `authFetch` tự refresh, đã có sẵn |
| Thiếu header brand | Không xảy ra nếu gắn ở `apiFetch`/`authFetch` như mục 1 |

## SEO

Nguyên tắc: **ba trang mới của phase này phải chặn lập chỉ mục, không phải tối ưu để lên
top.** Giỏ hàng và thanh toán là nội dung mỏng và riêng tư; trang xác nhận đơn còn chứa họ
tên, số điện thoại và địa chỉ của khách — lọt lên Google là rò rỉ dữ liệu cá nhân, không
phải chuyện thứ hạng. Trang cá nhân hoá lọt vào chỉ mục cũng làm loãng chất lượng tên miền.

### Chặn ở hai lớp

**Lớp 1 — `app/robots.js`**, bổ sung vào `disallow`:

```
/gio-hang
/thanh-toan
/dat-hang-thanh-cong/
/auth/
/user
```

`/auth/` và `/user` là **lỗ đang tồn tại sẵn**, không phải do phase này sinh ra — hiện
Google được phép lập chỉ mục trang đăng nhập và trang cá nhân. Sửa luôn thể.

**Lớp 2 — `metadata` của từng trang mới:**

```js
export const metadata = { robots: { index: false, follow: false } };
```

Cần cả hai vì chúng chặn hai việc khác nhau: `robots.txt` ngăn bot **bò vào**, thẻ meta
ngăn **lập chỉ mục**. Một URL bị chặn bởi robots.txt nhưng có trang khác trỏ link tới vẫn
có thể xuất hiện trong kết quả tìm kiếm (Google hiển thị URL trần vì không đọc được nội
dung để biết là đừng index). Trang xác nhận đơn quan trọng tới mức phải chặn cả hai lớp.

`/gio-hang` và `/thanh-toan` là client component nên không export được `metadata` —
đặt `robots` vào `layout.js` của route đó, hoặc giữ page là server component mỏng bọc
client component con như cách đã làm với `/contact`.

### Giữ nguyên phần đang tốt

- `sitemap.js` là danh sách trắng liệt kê tay, trang mới không tự lọt vào — **không thêm** ba
  route này vào đó
- Trang chi tiết sản phẩm đã có `generateMetadata`, JSON-LD `Product` + `BreadcrumbList` +
  `AggregateOffer` kèm `availability`. Không đụng vào khi thêm nút mua hàng.
- **Trang sản phẩm phải giữ nguyên Server Component.** Đây là ràng buộc SEO chứ không phải
  sở thích kiến trúc: biến nó thành client là mất `generateMetadata` và JSON-LD, tức mất
  toàn bộ rich result của sản phẩm. Khối chọn loại tách thành component con.

### Việc SEO cần kiểm lại khi có nút mua hàng

`availability` trong JSON-LD tính từ tổng tồn khả dụng của mọi biến thể. Khi khách đặt hàng
chuyển khoản, `reservedQuantity` tăng lên làm tồn khả dụng giảm — nên sản phẩm có thể chuyển
sang `OutOfStock` trong lúc đơn chưa thanh toán. Đó là hành vi đúng (không nên rao bán hàng
đang giữ cho người khác), nhưng cần biết để không tưởng là lỗi khi thấy rich result đổi
trạng thái.

## Thứ tự làm

1. Gắn `X-Brand-Slug` vào `apiFetch`/`authFetch` — nền của mọi thứ còn lại
2. Vá `robots.js` cho `/auth/` và `/user` — lỗ đang tồn tại, tách khỏi phase này được
3. `CartProvider` + badge số lượng trên navbar
4. `AddToCart` ở trang sản phẩm + `?redirect=` ở trang đăng nhập
5. `/gio-hang`
6. `/thanh-toan`
7. `/dat-hang-thanh-cong/[code]` + ba key ngân hàng

Mỗi trang mới gắn `robots: { index: false, follow: false }` ngay lúc tạo, đừng để dọn sau —
trang xác nhận đơn chứa địa chỉ khách, lỡ bị bò vào một lần là gỡ khỏi Google rất mất công.

Sau bước 4 là đã kiểm tra được đầu-cuối phần thêm hàng; không cần chờ xong hết mới chạy thử.
