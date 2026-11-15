# Danh Mục Toàn Bộ Các Luồng Nghiệp Vụ & Chức Năng Trong Dự Án (System Flows Catalog - Excluding Authentication)

> **Dự án:** Petshop E-Commerce (Next.js 14 App Router + Express 5 + PostgreSQL 15+ / Prisma 7)  
> **Phạm vi tài liệu:** Toàn bộ các luồng chức năng, nghiệp vụ và tiến trình ngầm trong hệ thống, ngoại trừ phân hệ Xác thực (Authentication).  
> **Tổng số luồng:** **47 Flows** được chia thành **10 nhóm nghiệp vụ**.

---

## Mục Lục
1. [Ma Trận Tổng Quan 10 Nhóm Nghiệp Vụ](#1-ma-trận-tổng-quan-10-nhóm-nghiệp-vụ)
2. [Nhóm I: Mua Sắm & Đơn Hàng Khách Hàng (Storefront) - 6 Flows](#nhóm-i-mua-sắm--đơn-hàng-khách-hàng-storefront---6-flows)
3. [Nhóm II: Bán Hàng Tư Vấn & Khách Hàng Tiềm Năng (Inquiries & Leads) - 3 Flows](#nhóm-ii-bán-hàng-tư-vấn--khách-hàng-tiềm-năng-inquiries--leads---3-flows)
4. [Nhóm III: Đánh Giá & Nhận Xét Sản Phẩm (Reviews & Ratings) - 5 Flows](#nhóm-iii-đánh-giá--nhận-xét-sản-phẩm-reviews--ratings---5-flows)
5. [Nhóm IV: Bản Tin Email & Tiếp Thị (Newsletter Double Opt-in) - 3 Flows](#nhóm-iv-bản-tin-email--tiếp-thị-newsletter-double-opt-in---3-flows)
6. [Nhóm V: Quản Trị Đơn Hàng & Kho Hàng (Admin Fulfilment & Stock) - 7 Flows](#nhóm-v-quản-trị-đơn-hàng--kho-hàng-admin-fulfilment--stock---7-flows)
7. [Nhóm VI: Quản Trị Danh Mục & Sản Phẩm (Admin Catalog Management) - 8 Flows](#nhóm-vi-quản-trị-danh-mục--sản-phẩm-admin-catalog-management---8-flows)
8. [Nhóm VII: Quản Trị Khách Hàng & Tư Vấn (Admin CRM & Deals) - 3 Flows](#nhóm-vii-quản-trị-khách-hàng--tư-vấn-admin-crm--deals---3-flows)
9. [Nhóm VIII: Quản Trị Nội Dung & CMS (Admin Content & Site Settings) - 3 Flows](#nhóm-viii-quản-trị-nội-dung--cms-admin-content--site-settings---3-flows)
10. [Nhóm IX: Quản Trị Chiến Dịch Tiếp Thị Email (Admin Campaigns) - 3 Flows](#nhóm-ix-quản-trị-chiến-dịch-tiếp-thị-email-admin-campaigns---3-flows)
11. [Nhóm X: Tiến Trình Ngầm & Tự Động Hóa (Background Workers) - 6 Flows](#nhóm-x-tiến-trình-ngầm--tự-động-hóa-background-workers---6-flows)
12. [Các Cơ Chế Nền Tảng Bổ Trợ Xuyên Suốt (Cross-cutting Concerns)](#12-các-cơ-chế-nền-tảng-bổ-trợ-xuyên-suốt-cross-cutting-concerns)

---

## 1. Ma Trận Tổng Quan 10 Nhóm Nghiệp Vụ

| Nhóm | Tên Phân Hệ | Tác Nhân (Actor) | Số Flow | Trọng Tâm Kỹ Thuật |
| :---: | :--- | :--- | :---: | :--- |
| **I** | Mua sắm & Đơn hàng | Khách mua hàng | **6** | Lọc cây danh mục, giỏ hàng session, checkout chống bán khống, snapshot đơn hàng. |
| **II** | Bán hàng tư vấn & Liên hệ | Khách vãng lai & Thành viên | **3** | Optional auth, snapshot báo giá dạng JSON, CRM lead collection. |
| **III** | Đánh giá & Nhận xét | Khách đã nhận hàng | **5** | Ràng buộc người mua thật, upload ảnh Cloudinary, tính toán trước số sao trung bình. |
| **IV** | Đăng ký bản tin | Khách truy cập web | **3** | Double opt-in, token SHA-256 một lần, tuân thủ Nghị định 13/2023. |
| **V** | Quản trị đơn & Kho hàng | Quản trị viên (Admin) | **7** | Máy trạng thái đơn hàng (State machine), kiểm kê kho, sổ cái kế toán kho kép. |
| **VI** | Quản trị Catalog & Sản phẩm | Quản trị viên (Admin) | **8** | Cây danh mục cha - con, chuyển hướng SEO 308, đồng bộ minPrice, upsell mua kèm. |
| **VII** | Quản trị CRM & Khách hàng | Quản trị viên (Admin) | **3** | Chốt doanh thu thực tế đơn tư vấn, duyệt đánh giá, trả lời khách hàng. |
| **VIII** | Quản trị Nội dung CMS | Quản trị viên (Admin) | **3** | Soạn thảo Rich Text Tiptap, thư viện ảnh Gallery, cấu hình SiteSetting động. |
| **IX** | Quản trị Chiến dịch Email | Quản trị viên (Admin) | **3** | Soạn thảo bản tin Markdown, gửi thử nghiệm, lên lịch phát tán hàng loạt. |
| **X** | Tiến trình ngầm tự động | Hệ thống (Workers / Cron) | **6** | Hoàn kho đơn quá hạn, phát tán email Brevo SMTP, dọn dẹp ảnh mồ côi, purge ISR cache. |
| **TỔNG** | **Toàn bộ hệ thống** | | **47 Flows** | *(Đã loại trừ toàn bộ phân hệ Authentication)* |

---

## Nhóm I: Mua Sắm & Đơn Hàng Khách Hàng (Storefront) - 6 Flows

### Flow 1: Tìm kiếm & Lọc sản phẩm đa tiêu chí
* **Tác nhân:** Khách mua hàng (Khách vãng lai hoặc đã đăng nhập).
* **Màn hình / Điểm vào:** `/san-pham`, `/danh-muc/[slug]`, `/tim-kiem`.
* **Thành phần phụ trách:** `backend/controllers/product.controller.ts:list`.
* **Quy trình hoạt động:**
  1. Khách nhập từ khóa, chọn danh mục, khoảng giá, hoặc các thuộc tính lọc (kích thước, loại hạt, độ tuổi).
  2. Frontend Next.js gọi `GET /api/v1/products` với các query params: `q`, `categoryId`, `minPrice`, `maxPrice`, `sort`, `page`.
  3. Backend chuẩn hóa từ khóa thành tiếng Việt không dấu (`toSearchText`) và truy vấn trên cột dẫn xuất `searchName`.
  4. Lọc theo danh mục: Tự động gom toàn bộ các danh mục con trong cây phân cấp (`categoryScope.service.ts`).
  5. Sắp xếp tối ưu theo index composite `(status, minPrice, id)` hoặc `(status, createdAt, id)`.

---

### Flow 2: Xem chi tiết sản phẩm & Gợi ý mua kèm (Upsell)
* **Tác nhân:** Khách mua hàng.
* **Màn hình / Điểm vào:** `/san-pham/[slug]`.
* **Thành phần phụ trách:** `backend/controllers/product.controller.ts:getBySlug`.
* **Quy trình hoạt động:**
  1. Khách truy cập đường dẫn sản phẩm theo slug.
  2. NẾU slug thuộc về slug cũ đã đổi tên: Hệ thống tự động tra cứu bảng `ProductSlugRedirect` và trả về mã HTTP 308 chuyển hướng vĩnh viễn (giữ nguyên thứ hạng SEO).
  3. Truy vấn sản phẩm kèm danh sách biến thể, hình ảnh gallery đã sắp xếp theo `position`.
  4. Tải danh sách sản phẩm "Thường mua kèm" (`ProductRelated`) do admin cấu hình sẵn để kích cầu mua thêm.
  5. Tính toán số lượng tồn kho khả dụng cho từng biến thể: `available = stockQuantity - reservedQuantity`.

---

### Flow 3: Quản lý giỏ hàng (Cart Lifecycle)
* **Tác nhân:** Khách mua hàng.
* **Màn hình / Điểm vào:** Icon giỏ hàng, Drawer giỏ hàng, trang `/gio-hang`.
* **Thành phần phụ trách:** `backend/controllers/cart.controller.ts` (`addItem`, `updateItem`, `removeItem`, `getCart`).
* **Quy trình hoạt động:**
  1. **Thêm vào giỏ (`addItem`):** Dùng câu lệnh `INSERT ... ON CONFLICT ("userId", "brandSlug")` tạo giỏ và `INSERT ... ON CONFLICT ("cartId", "variantId")` cộng dồn số lượng mặt hàng (giới hạn tối đa 99 cái/dòng).
  2. **Cập nhật số lượng (`updateItem`):** Khóa dòng giỏ hàng `SELECT id FROM "Cart" FOR UPDATE` để tránh xung đột với tiến trình checkout. Kiểm tra cảnh báo nếu số lượng yêu cầu vượt quá tồn kho khả dụng (`INSUFFICIENT_STOCK`).
  3. **Xóa khỏi giỏ (`removeItem`):** Khóa giỏ hàng `FOR UPDATE`, xóa dòng `CartItem` an toàn.

---

### Flow 4: Đặt hàng & Checkout chống bán khống
* **Tác nhân:** Khách mua hàng.
* **Màn hình / Điểm vào:** Trang thanh toán `/dat-hang`.
* **Thành phần phụ trách:** `backend/controllers/order.controller.ts:createOrder`.
* **Quy trình hoạt động:**
  1. Client gửi yêu cầu tạo đơn kèm header `Idempotency-Key` và phương thức thanh toán (`COD` hoặc `BANK_TRANSFER`).
  2. Mở Interactive Transaction:
     - Khóa dòng giỏ hàng `FOR UPDATE`.
     - Kiểm tra nếu `Idempotency-Key` đã tồn tại cho user này $\rightarrow$ Trả về ngay đơn hàng cũ (Replay HTTP 200).
     - Đọc các dòng giỏ hàng. Nếu giỏ rỗng, ném lỗi 422 `CART_EMPTY`.
     - Sắp xếp các biến thể theo `variantId` tăng dần (Deterministic Ordering) để triệt tiêu Deadlock.
     - Khấu trừ tồn kho bằng câu lệnh có điều kiện nguyên tử:
       - Đơn COD: Giảm trực tiếp `stockQuantity` (`claimForSale`) với điều kiện `stock - reserved >= qty`.
       - Đơn Chuyển khoản: Tăng `reservedQuantity` giữ chỗ tạm thời (hạn 24h).
     - Snapshot toàn bộ thông tin giá bán, SKU, tên sản phẩm vào bảng `OrderItem`.
     - Ghi nhận biến động vào sổ cái `InventoryMovement` nếu là đơn COD.
     - Xóa toàn bộ các mặt hàng trong giỏ hàng.
  3. Trả về mã đơn hàng `code` dạng `NP-YYMMDD-XXXXXX`.

---

### Flow 5: Khách tra cứu lịch sử đơn hàng của tôi
* **Tác nhân:** Khách có tài khoản.
* **Màn hình / Điểm vào:** `/tai-khoan/don-hang`, `/tai-khoan/don-hang/[code]`.
* **Thành phần phụ trách:** `backend/controllers/order.controller.ts:listMyOrders`, `getMyOrder`.
* **Quy trình hoạt động:**
  1. Khách xem danh sách đơn hàng đã đặt phân trang, sắp xếp mới nhất lên đầu.
  2. Tra cứu chi tiết đơn hàng: Kiểm tra bắt buộc cả `code` và `userId` để ngăn chặn lỗ hổng Broken Object Level Authorization (BOLA).
  3. Trả về thông tin trạng thái đơn, trạng thái thanh toán, thời hạn giữ hàng (`expiresAt` đối với chuyển khoản), và snapshot các mặt hàng đã mua.

---

### Flow 6: Khách hàng tự hủy đơn hàng
* **Tác nhân:** Khách mua hàng.
* **Màn hình / Điểm vào:** Chi tiết đơn hàng trong trang cá nhân.
* **Thành phần phụ trách:** `backend/controllers/order.controller.ts:cancelOrder`.
* **Quy trình hoạt động:**
  1. Khách gửi yêu cầu hủy đơn hàng.
  2. Kiểm tra điều kiện máy trạng thái: Chỉ cho phép hủy khi đơn còn ở `PENDING_PAYMENT` hoặc `CONFIRMED` (chưa chuyển sang `PROCESSING` đóng gói).
  3. Chạy Transaction:
     - Conditional UPDATE chuyển trạng thái sang `CANCELLED`.
     - NẾU đơn đang giữ chỗ (`PENDING_PAYMENT`): Giảm `reservedQuantity` tương ứng.
     - NẾU đơn đã trừ kho (`CONFIRMED`): Tăng lại `stockQuantity` và ghi dòng sổ cái hoàn kho `CANCEL_RESTOCK`.

---

## Nhóm II: Bán Hàng Tư Vấn & Khách Hàng Tiềm Năng (Inquiries & Leads) - 3 Flows

### Flow 7: Khách gửi Yêu cầu tư vấn / Báo giá (Quote Request)
* **Tác nhân:** Khách vãng lai hoặc Khách có tài khoản.
* **Màn hình / Điểm vào:** `/tu-van-bao-gia`, Pop-up "Nhờ tư vấn".
* **Thành phần phụ trách:** `backend/controllers/quoteRequest.controller.ts:create`.
* **Quy trình hoạt động:**
  1. Khách chọn danh sách các sản phẩm quan tâm, điền họ tên, số điện thoại, địa chỉ, ghi chú.
  2. Middleware `optionalAuthenticate`: Khách chưa đăng nhập vẫn gửi thành công; nếu khách đang đăng nhập thì tự động gán `userId` vào bản ghi.
  3. Snapshot toàn bộ thông tin sản phẩm vào trường JSON `items` (phục vụ nhân viên bán hàng gọi điện chốt đơn, không trừ kho).
  4. Lưu bản ghi trạng thái `NEW`.

---

### Flow 8: Khách xem lại Yêu cầu tư vấn của mình
* **Tác nhân:** Khách có tài khoản.
* **Màn hình / Điểm vào:** Mục "Yêu cầu tư vấn" trong trang `/tai-khoan`.
* **Thành phần phụ trách:** `backend/controllers/quoteRequest.controller.ts:listMine`.
* **Quy trình hoạt động:**
  1. Lấy danh sách các yêu cầu báo giá của `userId` hiện tại.
  2. Hiển thị thông tin sản phẩm đã hỏi, ngày gửi và trạng thái xử lý của shop.

---

### Flow 9: Gửi tin nhắn liên hệ
* **Tác nhân:** Khách truy cập web.
* **Màn hình / Điểm vào:** Trang `/lien-he`.
* **Thành phần phụ trách:** `backend/controllers/contact.controller.ts:create`.
* **Quy trình hoạt động:**
  1. Khách điền form gồm tên, email, số điện thoại, tiêu đề và nội dung tin nhắn.
  2. Backend kiểm tra tính hợp lệ của email và độ dài văn bản.
  3. Lưu thông tin vào bảng `ContactMessage` với cờ `isRead = false`.

---

## Nhóm III: Đánh Giá & Nhận Xét Sản Phẩm (Reviews & Ratings) - 5 Flows

### Flow 10: Kiểm tra điều kiện đánh giá (Review Eligibility Check)
* **Tác nhân:** Khách có tài khoản.
* **Màn hình / Điểm vào:** Nút "Viết đánh giá" trên trang chi tiết sản phẩm hoặc đơn hàng.
* **Thành phần phụ trách:** `backend/services/review.service.ts:eligibility`.
* **Quy trình hoạt động:**
  1. Hệ thống kiểm tra xem `userId` có đơn hàng nào ở trạng thái `COMPLETED` chứa bất kỳ biến thể nào của sản phẩm đó hay chưa (ADR-027).
  2. Trả về `canReview = true/false` và bản ghi đánh giá cũ (nếu khách đã từng đánh giá trước đó).

---

### Flow 11: Tải ảnh đánh giá lên Cloudinary
* **Tác nhân:** Khách có tài khoản hợp lệ.
* **Màn hình / Điểm vào:** Form viết đánh giá.
* **Thành phần phụ trách:** `backend/controllers/upload.controller.ts`.
* **Quy trình hoạt động:**
  1. Khách chọn tối đa 3 ảnh (hóa đơn hoặc sản phẩm trên tay).
  2. Multer kiểm tra MIME type (chỉ nhận JPG, PNG, WEBP), kích thước tối đa 5MB.
  3. Upload luồng stream trực tiếp lên Cloudinary và trả về danh sách URL ảnh bảo mật (HTTPS).

---

### Flow 12: Khách gửi đánh giá mới
* **Tác nhân:** Khách hàng đủ điều kiện.
* **Màn hình / Điểm vào:** Form viết đánh giá.
* **Thành phần phụ trách:** `backend/services/review.service.ts:createReview`.
* **Quy trình hoạt động:**
  1. Nhận số sao (1-5), nội dung chữ và mảng URL ảnh.
  2. Tạo bản ghi trong `ProductReview` với trạng thái `PENDING`.
  3. Ràng buộc `UNIQUE(productId, userId)` chống việc một người gửi nhiều đánh giá trùng lặp.
  4. Đánh giá chưa được duyệt nên **chưa** cộng điểm sao vào sản phẩm và chưa hiển thị công khai.

---

### Flow 13: Khách chỉnh sửa đánh giá
* **Tác nhân:** Khách hàng là chủ sở hữu bài đánh giá.
* **Màn hình / Điểm vào:** Form chỉnh sửa đánh giá tại trang cá nhân.
* **Thành phần phụ trách:** `backend/services/review.service.ts:editReview`.
* **Quy trình hoạt động:**
  1. Khách cập nhật lại nội dung hoặc số sao.
  2. Chạy Transaction:
     - Chuyển trạng thái bài đánh giá về lại `PENDING` (chờ kiểm duyệt lại).
     - NẾU bài đánh giá trước đó đang ở trạng thái `APPROVED`: Tạm thời trừ điểm số sao và số lượt đánh giá ra khỏi bản ghi `Product` (`reviewCount -= 1`, `ratingSum -= oldRating`).

---

### Flow 14: Khách xem danh sách đánh giá của tôi
* **Tác nhân:** Khách có tài khoản.
* **Màn hình / Điểm vào:** Mục "Đánh giá của tôi" trong `/tai-khoan`.
* **Thành phần phụ trách:** `backend/services/review.service.ts:myReviews`.
* **Quy trình hoạt động:**
  1. Tải toàn bộ các bài đánh giá do tài khoản hiện tại viết.
  2. Hiển thị trạng thái duyệt (`PENDING`, `APPROVED`, `HIDDEN`) và câu trả lời phản hồi từ cửa hàng (Admin Reply).

---

## Nhóm IV: Bản Tin Email & Tiếp Thị (Newsletter Double Opt-in) - 3 Flows

### Flow 15: Đăng ký nhận tin xác thực 2 bước (Double Opt-in)
* **Tác nhân:** Khách truy cập web.
* **Màn hình / Điểm vào:** Form đăng ký nhận tin tại Footer.
* **Thành phần phụ trách:** `backend/services/newsletter.service.ts:subscribe`.
* **Quy trình hoạt động:**
  1. Khách nhập email và tích chọn đồng ý điều khoản.
  2. Tạo bản ghi `NewsletterSubscriber` với trạng thái `PENDING`, lưu bằng chứng đồng thuận (`consentText`, `consentAt`).
  3. Tạo token ngẫu nhiên, băm SHA-256 lưu vào DB.
  4. Gửi email kích hoạt chứa liên kết `/xac-nhan-dang-ky?token=...` (hạn dùng 7 ngày).

---

### Flow 16: Xác nhận đăng ký nhận tin
* **Tác nhân:** Khách truy cập nhấn link từ email.
* **Màn hình / Điểm vào:** Trang `/xac-nhan-dang-ky`.
* **Thành phần phụ trách:** `backend/services/newsletter.service.ts:confirm`.
* **Quy trình hoạt động:**
  1. Kiểm tra hash của token; nếu hợp lệ và chưa hết hạn:
  2. Cập nhật trạng thái người đăng ký sang `CONFIRMED`.
  3. Phát hành token hủy đăng ký bí mật (`unsubscribeTokenHash`).
  4. Gửi email chào mừng chính thức kèm liên kết hủy đăng ký.

---

### Flow 17: Hủy đăng ký nhận tin (Unsubscribe)
* **Tác nhân:** Người đăng ký.
* **Màn hình / Điểm vào:** Trang `/huy-dang-ky?token=...`.
* **Thành phần phụ trách:** `backend/services/newsletter.service.ts:unsubscribe`.
* **Quy trình hoạt động:**
  1. Người dùng nhấn nút hủy đăng ký từ email nhận được.
  2. Hệ thống kiểm tra token:
     - NẾU là token cá nhân: Cập nhật `status = UNSUBSCRIBED`.
     - NẾU là token từ một email chiến dịch cụ thể: Cập nhật subscriber sang `UNSUBSCRIBED`, đánh dấu delivery và đồng thời tăng bộ đếm `unsubscribeCount` trên chiến dịch gửi đó trong một transaction.

---

## Nhóm V: Quản Trị Đơn Hàng & Kho Hàng (Admin Fulfilment & Stock) - 7 Flows

### Flow 18: Quản trị danh sách & Chi tiết đơn hàng
* **Tác nhân:** Quản trị viên (Admin).
* **Màn hình / Điểm vào:** `/admin/don-hang`.
* **Thành phần phụ trách:** `backend/controllers/order.controller.ts:adminList`.
* **Quy trình hoạt động:**
  1. Lọc đơn theo thương hiệu (`brandSlug`), theo trạng thái đơn hàng (`PENDING_PAYMENT`, `CONFIRMED`, `PROCESSING`, `COMPLETED`, `CANCELLED`).
  2. Lọc theo trạng thái thanh toán (`PENDING`, `UNPAID`, `PAID`, `FAILED`, `EXPIRED`).
  3. Tìm kiếm theo mã đơn hoặc số điện thoại khách hàng.

---

### Flow 19: Admin xác nhận thanh toán chuyển khoản
* **Tác nhân:** Quản trị viên (Admin).
* **Màn hình / Điểm vào:** Nút "Xác nhận đã thanh toán" trong chi tiết đơn hàng.
* **Thành phần phụ trách:** `backend/controllers/order.controller.ts:confirmPayment`.
* **Quy trình hoạt động:**
  1. Admin kiểm tra sao kê ngân hàng và bấm xác nhận đơn hàng chuyển khoản.
  2. Chạy Transaction nguyên tử:
     - Khóa và cập nhật có điều kiện: `orderStatus = CONFIRMED`, `paymentStatus = PAID`, `paidAt = now()`.
     - Với mỗi mặt hàng: Giảm đồng thời `reservedQuantity` và `stockQuantity` (`sellReserved`).
     - Ghi nhận dòng biến động xuất kho bán hàng `SALE` vào sổ cái `InventoryMovement`.

---

### Flow 20: Admin hủy đơn hàng & Hoàn kho
* **Tác nhân:** Quản trị viên (Admin).
* **Màn hình / Điểm vào:** Nút "Hủy đơn hàng" trong chi tiết đơn hàng.
* **Thành phần phụ trách:** `backend/controllers/order.controller.ts:cancelOrder`.
* **Quy trình hoạt động:**
  1. Admin hủy đơn hàng do khách đổi ý hoặc thông tin sai.
  2. Chạy Transaction:
     - Conditional UPDATE chuyển trạng thái sang `CANCELLED`.
     - NẾU đơn ở trạng thái `PENDING_PAYMENT`: Giảm `reservedQuantity` (nhả hàng giữ chỗ).
     - NẾU đơn ở trạng thái `CONFIRMED`: Cộng lại số lượng vào `stockQuantity` trên kệ và ghi dòng sổ cái `CANCEL_RESTOCK`.

---

### Flow 21: Admin cập nhật tiến độ giao hàng (Fulfilment)
* **Tác nhân:** Quản trị viên (Admin).
* **Màn hình / Điểm vào:** Chi tiết đơn hàng.
* **Thành phần phụ trách:** `backend/controllers/order.controller.ts:updateFulfilmentStatus`.
* **Quy trình hoạt động:**
  1. Chuyển trạng thái đơn hàng theo luồng chuẩn: `CONFIRMED` $\rightarrow$ `PROCESSING` (đã bàn giao cho shipper) $\rightarrow$ `COMPLETED` (đã giao thành công).
  2. Khi hoàn tất đơn COD (`COMPLETED`): Hệ thống tự động đánh dấu `paymentStatus = PAID` và ghi nhận `paidAt = now()` (ghi nhận tiền thu hộ từ shipper).

---

### Flow 22: Admin điều chỉnh kho hàng (Delta Adjustment)
* **Tác nhân:** Quản trị viên (Admin).
* **Màn hình / Điểm vào:** Tab "Kho hàng" trong chi tiết sản phẩm.
* **Thành phần phụ trách:** `backend/controllers/product.controller.ts:createStockMovement`.
* **Quy trình hoạt động:**
  1. Admin chọn loại biến động (`ADJUST`), nhập `delta` (âm hoặc dương), lý do (`PURCHASE` nhập thêm, `DAMAGED` hàng hỏng, `RETURN` hàng trả về, `OTHER`).
  2. Khóa dòng biến thể `SELECT ... FOR UPDATE`.
  3. Kiểm tra số lượng tồn mới không được thấp hơn lượng hàng đang giữ cho khách (`reservedQuantity`).
  4. Cập nhật `stockQuantity = stockQuantity + delta` và ghi nhận dòng sổ cái `InventoryMovement`.

---

### Flow 23: Admin kiểm kê kho thực tế (Stocktake)
* **Tác nhân:** Quản trị viên (Admin).
* **Màn hình / Điểm vào:** Form kiểm kê kho.
* **Thành phần phụ trách:** `backend/services/inventory.service.ts:adjustStockByAdmin`.
* **Quy trình hoạt động:**
  1. Admin đếm số lượng thực tế ngoài kệ và nhập `countedQuantity`.
  2. Khóa dòng biến thể `FOR UPDATE`, tự động tính `delta = countedQuantity - stockQuantity hiện tại`.
  3. Kiểm tra tính hợp lệ: Tồn mới không được nhỏ hơn số lượng giữ chỗ.
  4. Cập nhật tồn kho mới và ghi nhận sổ cái với lý do `STOCKTAKE`.

---

### Flow 24: Tra cứu sổ cái biến động kho (Audit Trail)
* **Tác nhân:** Quản trị viên (Admin).
* **Màn hình / Điểm vào:** Lịch sử kho trong admin.
* **Thành phần phụ trách:** `backend/controllers/product.controller.ts:listStockMovements`.
* **Quy trình hoạt động:**
  1. Truy vấn lịch sử sổ cái `InventoryMovement` của một biến thể, sắp xếp theo số thứ tự chèn `seq` giảm dần.
  2. Hiển thị chi tiết: số lượng thay đổi (`delta`), số lượng sau thay đổi (`quantityAfter`), lý do, mã đơn hàng liên quan, nhân viên thực hiện.

---

## Nhóm VI: Quản Trị Danh Mục & Sản Phẩm (Admin Catalog Management) - 8 Flows

### Flow 25: Quản trị cây danh mục đa tầng
* **Tác nhân:** Quản trị viên (Admin).
* **Màn hình / Điểm vào:** `/admin/danh-muc`.
* **Thành phần phụ trách:** `backend/services/categoryAdmin.service.ts`.
* **Quy trình hoạt động:**
  1. **Thêm/Sửa danh mục:** Tạo danh mục cha - con. Nếu đổi slug, tự động tạo bản ghi `CategorySlugRedirect` để bảo vệ liên kết cũ (HTTP 308).
  2. **Sắp xếp thứ tự:** Cập nhật lại trường `sortOrder` của danh sách danh mục cùng cấp.
  3. **Xóa danh mục:** Kiểm tra nếu danh mục còn chứa sản phẩm, bài viết hoặc danh mục con thì từ chối với lỗi 409 `CATEGORY_NOT_EMPTY`.

---

### Flow 26: Quản trị thuộc tính lọc động theo danh mục
* **Tác nhân:** Quản trị viên (Admin).
* **Màn hình / Điểm vào:** Quản lý thuộc tính danh mục.
* **Thành phần phụ trách:** `backend/controllers/category.controller.ts`.
* **Quy trình hoạt động:**
  1. Định nghĩa các trường thuộc tính lọc (như size, màu, hạn dùng, giống thú cưng) gắn với một danh mục.
  2. Cấu hình kiểu dữ liệu (chữ, số, danh sách lựa chọn `options`), trạng thái bắt buộc (`isRequired`), và cho phép lọc (`isFilterable`).

---

### Flow 27: Admin tạo sản phẩm mới & biến thể
* **Tác nhân:** Quản trị viên (Admin).
* **Màn hình / Điểm vào:** `/admin/san-pham/moi`.
* **Thành phần phụ trách:** `backend/controllers/product.controller.ts:create`.
* **Quy trình hoạt động:**
  1. Admin nhập thông tin chung (tên, slug, danh mục, mô tả, thương hiệu) và danh sách biến thể (SKU, giá, tồn kho khởi tạo).
  2. Chạy Transaction:
     - Tạo bản ghi `Product`.
     - Tạo danh sách `ProductVariant`.
     - Tự động ghi nhận số dư đầu kỳ `OPENING` vào sổ cái kho cho từng biến thể.
     - Tính toán và gán giá thấp nhất `minPrice` cho sản phẩm.
     - Lưu danh sách hình ảnh vào `ProductImage`.

---

### Flow 28: Admin cập nhật thông tin chung sản phẩm
* **Tác nhân:** Quản trị viên (Admin).
* **Màn hình / Điểm vào:** `/admin/san-pham/[id]`.
* **Thành phần phụ trách:** `backend/controllers/product.controller.ts:update`.
* **Quy trình hoạt động:**
  1. Cập nhật thông tin mô tả, trạng thái (`draft` / `active`), thuộc tính JSON.
  2. NẾU đổi slug sản phẩm: Chạy transaction cập nhật slug mới và lưu slug cũ vào `ProductSlugRedirect` để giữ SEO 308.

---

### Flow 29: Quản trị vòng đời biến thể sản phẩm
* **Tác nhân:** Quản trị viên (Admin).
* **Màn hình / Điểm vào:** Quản lý biến thể trong chi tiết sản phẩm.
* **Thành phần phụ trách:** `backend/controllers/product.controller.ts:addVariant`, `updateVariant`, `removeVariant`.
* **Quy trình hoạt động:**
  1. **Thêm biến thể:** Khóa sản phẩm `Product` cha `FOR UPDATE`, tạo biến thể mới, ghi sổ cái `OPENING`, tính lại `minPrice`.
  2. **Đổi giá biến thể:** Khóa `Product` cha, cập nhật giá biến thể, tính toán lại `minPrice`.
  3. **Xóa biến thể:** Khóa `Product` cha, kiểm tra sản phẩm phải có ít nhất 1 biến thể (từ chối xóa nếu là biến thể cuối cùng), xóa biến thể và tính lại `minPrice`.

---

### Flow 30: Quản trị hình ảnh sản phẩm
* **Tác nhân:** Quản trị viên (Admin).
* **Màn hình / Điểm vào:** Quản lý ảnh sản phẩm.
* **Thành phần phụ trách:** `backend/controllers/product.controller.ts:updateImage`, `removeImage`.
* **Quy trình hoạt động:**
  1. Tải ảnh lên Cloudinary và gắn vào bảng `ProductImage`.
  2. Điều chỉnh vị trí hiển thị (`position`) và văn bản thay thế (`altText`).
  3. Xóa ảnh khỏi sản phẩm.

---

### Flow 31: Cấu hình sản phẩm "Thường mua kèm" (Upsell)
* **Tác nhân:** Quản trị viên (Admin).
* **Màn hình / Điểm vào:** Tab "Sản phẩm mua kèm" trong trang sửa sản phẩm.
* **Thành phần phụ trách:** `backend/services/productRelated.service.ts:setRelated`.
* **Quy trình hoạt động:**
  1. Admin chọn tối đa 4 sản phẩm liên quan trong cùng thương hiệu.
  2. Chạy Batch Transaction: Xóa toàn bộ liên kết cũ và tạo mới danh sách `ProductRelated` theo thứ tự vị trí `position`.

---

### Flow 32: Xóa vĩnh viễn sản phẩm
* **Tác nhân:** Quản trị viên (Admin).
* **Màn hình / Điểm vào:** Nút "Xóa sản phẩm" trong admin.
* **Thành phần phụ trách:** `backend/controllers/product.controller.ts:remove`.
* **Quy trình hoạt động:**
  1. Admin xác nhận xóa vĩnh viễn sản phẩm.
  2. Chạy Batch Transaction: Xóa hình ảnh `ProductImage`, xóa biến thể `ProductVariant` và xóa bản ghi `Product` cha.

---

## Nhóm VII: Quản Trị Khách Hàng & Tư Vấn (Admin CRM & Deals) - 3 Flows

### Flow 33: Xử lý & Chốt đơn yêu cầu báo giá
* **Tác nhân:** Quản trị viên (Admin).
* **Màn hình / Điểm vào:** `/admin/bao-gia`.
* **Thành phần phụ trách:** `backend/controllers/quoteRequest.controller.ts:updateStatus`.
* **Quy trình hoạt động:**
  1. Admin lọc các yêu cầu mới `NEW`, gọi điện thoại tư vấn cho khách.
  2. Khi chốt đơn: Nhập số tiền chốt thực tế (`finalAmount` - có thể khác giá niêm yết do thỏa thuận phí ship/giảm giá), ghi chú và đánh dấu hoàn thành (`closedAt = now()`, `status = CLOSED`).
  3. Thống kê tổng doanh thu chốt được theo khoảng thời gian.

---

### Flow 34: Quản trị tin nhắn liên hệ
* **Tác nhân:** Quản trị viên (Admin).
* **Màn hình / Điểm vào:** `/admin/lien-he`.
* **Thành phần phụ trách:** `backend/controllers/contact.controller.ts`.
* **Quy trình hoạt động:**
  1. Xem danh sách tin nhắn khách gửi từ trang liên hệ, lọc theo trạng thái `isRead`.
  2. Đánh dấu đã đọc hoặc xóa các tin nhắn rác.

---

### Flow 35: Kiểm duyệt & Phản hồi đánh giá sản phẩm
* **Tác nhân:** Quản trị viên (Admin).
* **Màn hình / Điểm vào:** `/admin/danh-gia`.
* **Thành phần phụ trách:** `backend/services/reviewModeration.service.ts`.
* **Quy trình hoạt động:**
  1. **Kiểm duyệt bài viết:**
     - Duyệt bài (`APPROVED`): Transaction cập nhật trạng thái và đồng thời cộng số sao vào `Product` (`reviewCount += 1`, `ratingSum += rating`).
     - Ẩn bài (`HIDDEN`): Nếu bài trước đó đã duyệt thì trừ sao ra khỏi `Product`.
  2. **Phản hồi đánh giá (Admin Reply):** Admin viết lời phản hồi công khai hiển thị ngay dưới đánh giá của khách trên web.

---

## Nhóm VIII: Quản Trị Nội Dung & CMS (Admin Content & Site Settings) - 3 Flows

### Flow 36: Quản trị bài viết kiến thức (Blog CMS)
* **Tác nhân:** Quản trị viên (Admin).
* **Màn hình / Điểm vào:** `/admin/posts`, `/admin/posts/moi`, `/admin/posts/[id]`.
* **Thành phần phụ trách:** `backend/controllers/blog.controller.ts`.
* **Quy trình hoạt động:**
  1. Admin viết bài qua trình soạn thảo Rich Text Tiptap.
  2. Backend nhận nội dung HTML, chạy bộ lọc `sanitize-html` để loại bỏ mã độc XSS, và lưu dưới dạng Markdown an toàn.
  3. Quản lý trạng thái xuất bản (`draft` / `published`), thời gian xuất bản (`publishedAt`), và ảnh bìa bài viết.

---

### Flow 37: Quản trị thư viện ảnh (Gallery CMS)
* **Tác nhân:** Quản trị viên (Admin).
* **Màn hình / Điểm vào:** `/admin/gallery`.
* **Thành phần phụ trách:** `backend/controllers/gallery.controller.ts`.
* **Quy trình hoạt động:**
  1. Tải ảnh lên thư viện, đặt tiêu đề, alt text và gán danh mục tương ứng.
  2. Chỉnh sửa thứ tự sắp xếp `position` hoặc xóa ảnh.

---

### Flow 38: Cấu hình giao diện trang web (Site Settings)
* **Tác nhân:** Quản trị viên (Admin).
* **Màn hình / Điểm vào:** `/admin/cau-hinh`.
* **Thành phần phụ trách:** `backend/controllers/setting.controller.ts:updateSettings`.
* **Quy trình hoạt động:**
  1. Admin chỉnh sửa các cấu hình động như: ảnh banner hero trang chủ, slogan, thông tin hotline, chính sách vận chuyển/đổi trả.
  2. Chạy Batch Transaction upsert hàng loạt các cặp key-value vào bảng `SiteSetting`.

---

## Nhóm IX: Quản Trị Chiến Dịch Tiếp Thị Email (Admin Campaigns) - 3 Flows

### Flow 39: Soạn thảo & Quản lý chiến dịch bản tin
* **Tác nhân:** Quản trị viên (Admin).
* **Màn hình / Điểm vào:** `/admin/ban-tin`, `/admin/ban-tin/moi`.
* **Thành phần phụ trách:** `backend/services/newsletterCampaign.service.ts`.
* **Quy trình hoạt động:**
  1. Admin nhập tiêu đề, nội dung Markdown, chọn tối đa 6 sản phẩm/bài viết nổi bật để tự động sinh các card giới thiệu trong email.
  2. Bật/tắt cờ quảng cáo (nếu có, tiêu đề tự động đính kèm tiền tố `[QC]`).
  3. Xem thống kê báo cáo của chiến dịch: số người nhận, số gửi thành công, số gửi thất bại, số người nhấn hủy đăng ký.

---

### Flow 40: Lên lịch & Gửi email thử nghiệm
* **Tác nhân:** Quản trị viên (Admin).
* **Màn hình / Điểm vào:** Chi tiết chiến dịch bản tin.
* **Thành phần phụ trách:** `backend/services/newsletterCampaign.service.ts:sendTestCampaign`.
* **Quy trình hoạt động:**
  1. **Gửi thử nghiệm:** Gửi một email mẫu dán nhãn `[Thử]` tới chính hộp thư của admin đang đăng nhập để kiểm tra hiển thị trước khi phát tán.
  2. **Lên lịch gửi (`SCHEDULED`):** Hẹn giờ phát tán theo ngày giờ định trước hoặc chọn gửi ngay.
  3. **Hủy chiến dịch:** Dừng khẩn cấp chiến dịch đang gửi (`SENDING` sang `CANCELLED`) hoặc đưa chiến dịch đã lên lịch về `DRAFT`.

---

### Flow 41: Quản lý danh bạ người đăng ký nhận tin
* **Tác nhân:** Quản trị viên (Admin).
* **Màn hình / Điểm vào:** `/admin/dang-ky-nhan-tin`.
* **Thành phần phụ trách:** `backend/services/newsletter.service.ts:listSubscribers`.
* **Quy trình hoạt động:**
  1. Tra cứu danh bạ người đăng ký, tìm kiếm theo email, lọc theo trạng thái (`CONFIRMED`, `PENDING`, `UNSUBSCRIBED`).
  2. Xem ngày khách đồng thuận và thời điểm xác nhận.

---

## Nhóm X: Tiến Trình Ngầm & Tự Động Hóa (Background Workers) - 6 Flows

### Flow 42: Tự động dọn đơn quá hạn & Hoàn kho (Sweeper Worker)
* **Tác nhân:** Hệ thống chạy định kỳ (mỗi 15 phút).
* **Thành phần phụ trách:** `backend/workers/releaseExpiredOrders.ts`.
* **Quy trình hoạt động:**
  1. Quét các đơn chuyển khoản `PENDING_PAYMENT` có `expiresAt < now()`.
  2. Với từng đơn hàng (chạy transaction riêng):
     - Conditional UPDATE chuyển trạng thái sang `CANCELLED` và `paymentStatus = EXPIRED`.
     - Giảm `reservedQuantity` trên các biến thể để giải phóng tồn kho cho khách khác mua.
     - An toàn tuyệt đối khi chạy trên nhiều container/server song song (chỉ 1 tiến trình claim được đơn).

---

### Flow 43: Tự động gửi email chiến dịch hàng loạt
* **Tác nhân:** Hệ thống chạy định kỳ (mỗi 1 phút).
* **Thành phần phụ trách:** `backend/workers/sendNewsletters.ts`, `newsletterSend.service.ts`.
* **Quy trình hoạt động:**
  1. Claim các chiến dịch `SCHEDULED` đã đến hạn sang trạng thái `SENDING`.
  2. Snapshot toàn bộ danh sách subscriber `CONFIRMED` vào bảng `NewsletterDelivery`.
  3. Chia mảng theo batch size (tối đa 50 email/lần) và hạn mức quota ngày.
  4. Tạo token hủy đăng ký riêng cho từng email, kết xuất mã HTML từ template và gửi qua Brevo SMTP.
  5. Cập nhật trạng thái `SENT` hoặc `FAILED` kèm tăng bộ đếm trên chiến dịch.
  6. Khi gửi xong toàn bộ, tự động chuyển trạng thái chiến dịch sang `SENT`.

---

### Flow 44: Tự động giải cứu email bị kẹt (Stuck Deliveries Sweep)
* **Tác nhân:** Hệ thống chạy trong worker gửi email.
* **Thành phần phụ trách:** `backend/services/newsletterSend.service.ts:sweepStuckDeliveries`.
* **Quy trình hoạt động:**
  1. Quét các bản ghi `NewsletterDelivery` ở trạng thái `SENDING` bị kẹt quá 15 phút (do server bị crash hoặc SMTP timeout giữa chừng).
  2. Nếu số lần thử chưa vượt quá giới hạn: Đưa về lại `PENDING` để retry.
  3. Nếu đã thử quá số lần quy định: Chuyển sang `FAILED` và tăng `failedCount` trên chiến dịch.

---

### Flow 45: Tự động xóa người đăng ký chưa xác nhận quá 7 ngày
* **Tác nhân:** Hệ thống chạy định kỳ hằng ngày.
* **Thành phần phụ trách:** `backend/workers/purgePendingSubscribers.ts`.
* **Quy trình hoạt động:**
  1. Quét bảng `NewsletterSubscriber` tìm các bản ghi `PENDING` có `consentAt` quá 7 ngày.
  2. Xóa vĩnh viễn các dòng này khỏi database nhằm giữ sạch dữ liệu và tuân thủ quy định bảo vệ dữ liệu cá nhân (Decree 13/2023).

---

### Flow 46: Tự động dọn dẹp ảnh mồ côi trên Cloudinary
* **Tác nhân:** Hệ thống chạy hằng ngày trên môi trường Production (ADR-028).
* **Thành phần phụ trách:** `backend/workers/cleanupReviewImages.ts`.
* **Quy trình hoạt động:**
  1. Quét các hình ảnh được tải lên thư mục tạm của Cloudinary qua form đánh giá nhưng không gắn với bất kỳ bản ghi `ProductReview` nào sau 24 giờ.
  2. Gọi Cloudinary API xóa bỏ các file ảnh mồ côi này để tiết kiệm dung lượng lưu trữ.

---

### Flow 47: Tự động làm mới bộ nhớ đệm trang tĩnh (On-Demand ISR Revalidation)
* **Tác nhân:** Hệ thống Next.js BFF.
* **Thành phần phụ trách:** `frontend-petshop/lib/bff/revalidate.ts`, `frontend-petshop/app/api/revalidate/route.ts`.
* **Quy trình hoạt động:**
  1. Khi admin thực hiện lưu/sửa sản phẩm, danh mục hoặc bài viết trên trang quản trị.
  2. Hệ thống tự động gửi yêu cầu nội bộ tới endpoint `/api/revalidate` kèm thẻ tag liên quan (ví dụ: `products`, `categories`, `posts`).
  3. Next.js làm mới lại bộ nhớ cache tĩnh (Incremental Static Regeneration) của các trang công khai để khách mua hàng nhìn thấy dữ liệu mới ngay lập tức mà không cần build lại web.

---

## 12. Các Cơ Chế Nền Tảng Bổ Trợ Xuyên Suốt (Cross-cutting Concerns)

Bên cạnh 47 luồng nghiệp vụ trên, hệ thống được vận hành trên 4 cơ chế bảo vệ cốt lõi:

1. **Phân lập thương hiệu đa chi nhánh (Multi-Tenant Brand Isolation):**
   - Middleware `resolveBrand.ts` bóc tách header `X-Brand-Slug`. Toàn bộ dữ liệu danh mục, sản phẩm, giỏ hàng và đơn hàng đều được gắn với một thương hiệu cụ thể, cô lập dữ liệu hoàn toàn giữa các storefront.
2. **Kiến trúc Sổ cái kế toán kho kép (ADR-007):**
   - Mọi thay đổi tồn kho vật lý (`stockQuantity`) trong Flow 4, Flow 19, Flow 20, Flow 22, Flow 23 đều được ràng buộc nguyên tử với bảng `InventoryMovement`, bảo đảm bất biến kế toán: `sum(delta) == stockQuantity` luôn đúng.
3. **Bảo vệ toàn vẹn SEO bằng Chuyển hướng HTTP 308 (ADR-017 & ADR-018):**
   - Mọi thao tác đổi URL danh mục hoặc sản phẩm đều lưu lại lịch sử trong `CategorySlugRedirect` và `ProductSlugRedirect`, tự động chuyển hướng vĩnh viễn khách hàng và các bot tìm kiếm.
4. **Phòng thủ tranh chấp đồng thời (Concurrency & Anti-Overselling):**
   - Kết hợp nhịp nhàng giữa khóa dòng bi quan (`SELECT ... FOR UPDATE`) cho phiên giỏ hàng và cập nhật có điều kiện ở cấp độ vi giây cho tồn kho hàng hóa.
