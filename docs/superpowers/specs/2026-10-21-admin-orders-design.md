# Trang admin Đơn hàng (đợt B) — Thiết kế

Ngày: 2026-10-21 · Trạng thái: đã duyệt · Wireframe: `design/wireframes/admin-orders.html`

## Backend — chỉ thêm tìm kiếm
`GET /orders/admin/list` thêm `q` (tuỳ chọn): một chuỗi, trim, 2–50 ký tự; sai → 422 `VALIDATION_ERROR`. Khớp **một trong**:
- `code` chứa `q` (không phân biệt hoa thường);
- `shippingAddress.phone` chứa các chữ số của `q` (bỏ mọi ký tự không phải số; chỉ áp khi còn ≥ 3 chữ số) — JSON path filter;
- `user.fullName` hoặc `user.email` chứa `q` (không phân biệt hoa thường).
Kết hợp được với `orderStatus`, `paymentStatus`, phân trang hiện có. Không tìm theo tên người nhận trong JSON (Postgres JSON `string_contains` phân biệt hoa thường; thường trùng tên tài khoản).
Đổi trạng thái: dùng các API đã có — `PATCH /orders/admin/:id/confirm-payment`, `/cancel`, `/status {status: PROCESSING|COMPLETED}` (đã có test, chống bấm đồng thời).
Test: DB (khớp mã viết thường, khớp SĐT có dấu cách, khớp tên tài khoản, không khớp → 0, kết hợp với tab); DB-free (`q` 1 ký tự / 51 ký tự / lặp → 422).

## Frontend — `/admin/don-hang`
- **URL là nguồn sự thật:** `?tab=all|pending|confirmed|processing|completed|cancelled&q=&page=&ma=<mã đơn>`; mặc định không ghi lên URL. Tab → `orderStatus` (`pending` = `PENDING_PAYMENT`, …; `all` = không lọc).
- **Thanh lọc:** tab (cuộn ngang trên điện thoại, mỗi tab ≥ 44px; "Chờ thanh toán (N)" lấy `meta.total` riêng) + ô tìm `type="search"` debounce 300 ms (đổi từ khoá → về trang 1).
- **Danh sách** 20 đơn/trang:
  - < 768px: thẻ — mã · nhãn trạng thái · người nhận · SĐT · cách thanh toán · tổng · "còn X giờ" (đơn chờ CK) hoặc ngày đặt; cả thẻ bấm được để mở chi tiết.
  - ≥ 768px: bảng Mã đơn · Khách (tên + SĐT) · Thanh toán · Trạng thái · Tổng (`tabular-nums`, căn phải) · Ngày · nút.
  - Nút trên dòng: đơn chờ CK → "Đã nhận tiền" (mở chi tiết với hành động này); khác → "Xem".
  - Phân trang (component `Pagination` có sẵn).
  - Trạng thái: đang tải (skeleton), lỗi (kèm "Thử lại"), rỗng ("Chưa có đơn nào" / "Không tìm thấy đơn khớp «q»").
- **Nhãn trạng thái** (`orderBadge(order, now)`): Chờ thanh toán (+ "· còn X giờ" / "· quá hạn"), Đã xác nhận, Đang xử lý, Hoàn tất, Đã huỷ (+ "· quá hạn" khi `paymentStatus = EXPIRED`); màu theo tông có sẵn, luôn kèm chữ.
- **Chi tiết** (`?ma=`; `<dialog>` bottom sheet trên điện thoại, drawer phải từ `lg`, Esc / nền / ✕ đóng, focus trả về nút mở): mã + nhãn; "Giữ hàng tới HH:mm dd/MM" (giờ Việt Nam) cho đơn chờ CK; bảng sản phẩm (tên · SKU · SL · thành tiền); tạm tính · phí ship · tổng; người nhận · SĐT (`tel:`) · địa chỉ · ghi chú; email tài khoản; cách / trạng thái thanh toán; ngày đặt; ngày thanh toán. Đơn không có trong trang hiện tại → tải bằng `q=<mã>`.
- **Hành động** (`orderActions(order)`):
  - `PENDING_PAYMENT` + `BANK_TRANSFER`: "✓ Xác nhận đã nhận tiền" (confirm-payment) · "Huỷ đơn & hoàn kho".
  - `CONFIRMED`: "Đang giao" (status PROCESSING) · "Huỷ đơn & hoàn kho".
  - `PROCESSING`: "Hoàn tất" (status COMPLETED; COD → ghi chú "Đã thu tiền mặt").
  - `COMPLETED` / `CANCELLED`: không có.
  - Xác nhận tiền và huỷ đơn hỏi lại (`window.confirm`) kèm mã + tổng tiền. Đang gửi → khoá nút.
  - 409 (`ORDER_STATE_CHANGED`, `ALREADY_PAID`, `INVALID_STATE_TRANSITION`, …) → thông báo "Đơn vừa thay đổi — đã tải lại" và tải lại đơn + danh sách. Lỗi khác → hiện message của server.
  - Thành công → thông báo ngắn, tải lại danh sách + số "Chờ thanh toán".
- Mọi request admin gửi `X-Brand-Slug: BRAND_SLUG`.

## Nối với phần đã có
`ADMIN_NAV` Đơn hàng `ready: true`; Tổng quan: link "Xử lý ›" → `/admin/don-hang?tab=pending`, nút "Xác nhận" → `/admin/don-hang?tab=pending&ma=<mã>`.

## Hàm thuần có test (`lib/adminOrders.ts`)
`ORDER_TABS`, `parseOrdersQuery(searchParams)` / `ordersHref(state)`, `orderBadge(order, now)`, `orderActions(order)`, `holdUntilText(expiresAt)` (giờ Việt Nam), `paymentLabel(method, status)`.

## Kiểm tra
Unit + DB như trên; lint / typecheck / build; trình duyệt trên DB local: tạo 1 đơn CK thử (API khách) → "Đã nhận tiền" → CONFIRMED/PAID; đơn COD → Đang giao → Hoàn tất (PAID); huỷ 1 đơn; tìm theo mã viết thường và SĐT; `?ma=` mở đúng đơn; 390 / 768 / 1280 + zoom 200%; vùng bấm ≥ 44px; không cuộn ngang.

## Ngoài phạm vi
Thống kê doanh thu đơn online, in hoá đơn, sửa nội dung đơn, gửi thông báo cho khách.
