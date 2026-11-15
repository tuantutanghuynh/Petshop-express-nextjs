# Admin Báo giá + Tin nhắn liên hệ (đợt C) — Thiết kế

Ngày: 2026-10-22 · Trạng thái: đã duyệt · Wireframe: `admin-quotes.html`, `admin-contacts.html` · Không đổi backend.

## API dùng (đã có, kiểm tra field thật trước khi viết UI)
- Báo giá (header `X-Brand-Slug`): `GET /quote-requests/admin/list?status=NEW|CONTACTED|CLOSED&page=&pageSize=` (row: `id, customerName, phone, email, address, note, items[{productName, variantLabel, sku, quantity, unitPrice, lineTotal, productSlug}], status, finalAmount, closedAt, createdAt`); `GET /quote-requests/admin/stats?from=&to=` (`totalRequests, closedCount, revenue, averageOrderValue, conversionRate`); `PATCH /quote-requests/admin/:id/status {status, finalAmount?}` (CLOSED cần số nguyên ≥ 0; trạng thái khác xoá finalAmount); `DELETE /quote-requests/admin/:id` (chỉ NEW, khác → 409 `QUOTE_NOT_DELETABLE`).
- Tin nhắn: `GET /contact/admin/list?isRead=true|false&page=&pageSize=` (row: `id, name, email, phone, subject, message, isRead, createdAt`); `PATCH /contact/admin/:id/read`; `DELETE /contact/admin/:id`.

## `/admin/bao-gia`
- Đầu trang: chọn "30 ngày qua / Tháng này" (`rangeFor`) + 4 ô (`StatCard`): Tổng yêu cầu · Đã chốt · Doanh thu chốt · Giá trị TB / tỉ lệ chốt.
- Tab (URL `?tab=new|contacted|closed|all&page=`; mặc định `new`, không ghi lên URL): Mới (N) · Đã liên hệ · Đã chốt · Tất cả. 20 / trang, `Pagination`.
- Thẻ: tên · nhãn trạng thái · `timeAgo`; ☎ SĐT (`tel:`) · email (nếu có) · địa chỉ (nếu có); bảng sản phẩm (tên · loại · SL · tạm tính) + "Giá web" = tổng `lineTotal`; ghi chú (text thuần, `whitespace-pre-line`); thẻ CLOSED: "Đã chốt: X₫ · dd/MM".
- Hành động (`quoteActions(status)`):
  - NEW: "Đã gọi" (→ CONTACTED) · "Chốt đơn…" · "Xoá (spam)" (hỏi lại).
  - CONTACTED: "Chốt đơn…" · "Đưa về Mới" (→ NEW).
  - CLOSED: "Sửa số tiền chốt" (mở hộp chốt, điền số cũ) · "Mở lại" (→ CONTACTED, hỏi lại vì xoá số tiền).
- Hộp chốt (`<dialog>` bottom sheet / giữa màn hình từ md): ô "Số tiền chốt thật (VND)" `inputMode="numeric"`, điền sẵn giá web (hoặc số đã chốt), gợi ý "Giá sau thương lượng, phí ship, giảm cho khách quen…"; `parseAmount` (bỏ dấu chấm / khoảng trắng, số nguyên 0–2 000 000 000) → lỗi dưới ô; server 400 → hiện message dưới ô; khoá nút khi gửi.
- Sau mỗi thao tác: tải lại danh sách + số liệu + số "Mới (N)"; thông báo ngắn.

## `/admin/lien-he`
- Tab (URL `?tab=unread|read|all&page=`; mặc định `unread`): Chưa đọc (N) · Đã đọc · Tất cả. 20 / trang.
- Thẻ: tên · email · `timeAgo`; SĐT; chủ đề (nếu có); nội dung (text thuần, giữ xuống dòng, `break-words`); chưa đọc → viền `brand-ink`.
- Hành động: "Trả lời qua email" (`mailtoHref(email, subject)` → `mailto:` + `subject=Re: …`, chỉ khi có email) · "☎ Gọi" (khi có SĐT) · "Đánh dấu đã đọc" (chỉ chưa đọc) · "Xoá" (hỏi lại).

## Chung
- `ADMIN_NAV`: Báo giá, Tin nhắn `ready: true`; Tổng quan: "Gọi lại ›" → `/admin/bao-gia`, "Đọc ›" → `/admin/lien-he`.
- Trạng thái: skeleton, lỗi + "Thử lại", rỗng ("Chưa có yêu cầu mới." / "Không có tin nhắn chưa đọc." …).
- Thẻ trên mọi kích thước (wireframe dùng thẻ); nút ≥ 44px; tiền `tabular-nums`; không cuộn ngang.

## Hàm thuần có test (`lib/adminQuotes.ts`, `lib/adminContacts.ts`)
`QUOTE_TABS`, `parseQuotesQuery` / `quotesHref` / `quotesApiPath`; `quoteActions(status)`; `parseAmount(text)`; `webTotal(items)`; `CONTACT_TABS`, `parseContactsQuery` / `contactsHref` / `contactsApiPath`; `mailtoHref(email, subject)`.

## Kiểm tra
Unit; lint / typecheck / build; trình duyệt trên DB local: tạo 2 yêu cầu báo giá thử (API công khai) → Đã gọi → Chốt 350.000₫ → Sửa số tiền → Mở lại; xoá 1 yêu cầu Mới; tin nhắn: đánh dấu đã đọc, xoá 1 tin thử; 390 / 768 / 1280 + zoom 200%.

## Ngoài phạm vi
Gửi email từ hệ thống, đánh dấu chưa đọc lại, tìm kiếm trong báo giá / tin nhắn, đổi backend.
