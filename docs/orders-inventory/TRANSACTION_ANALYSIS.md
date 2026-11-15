# Báo Cáo Phân Tích Toàn Diện Kiến Trúc & Các Transaction Trong Dự Án (Transaction Architecture & Concurrency Analysis)

> **Dự án:** Petshop E-Commerce (Express 5 + PostgreSQL 15+ / Prisma 7 + Next.js 14)  
> **Tài liệu tham chiếu liên quan:** `CONCURRENCY_AND_STOCK_CONTROL.md`, `INVENTORY_LEDGER.md`, `ORDER_IDEMPOTENCY.md`, `SESSION_SECURITY_AND_RTR.md`  
> **Thời điểm lập báo cáo:** Tháng 11/2026

---

## Mục Lục
1. [Tổng Quan Kiến Trúc Transaction & Kiểm Soát Tranh Chấp](#1-tổng-quan-kiến-trúc-transaction--kiểm-soát-tranh-chấp)
2. [Bảng Phân Loại Toàn Bộ Transaction Trong Mã Nguồn](#2-bảng-phân-loại-toàn-bộ-transaction-trong-mã-nguồn)
3. [Phân Tích Chuyên Sâu Từng Mô Hình Transaction](#3-phân-tích-chuyên-sâu-từng-mô-hình-transaction)
   - [3.1. Interactive Transactions kết hợp Pessimistic Row Locking (`FOR UPDATE`)](#31-interactive-transactions-kết-hợp-pessimistic-row-locking-for-update)
   - [3.2. Atomic Conditional Updates (Optimistic Concurrency Control)](#32-atomic-conditional-updates-optimistic-concurrency-control)
   - [3.3. Double-Entry Immutable Inventory Ledger (Sổ cái kế toán kho kép)](#33-double-entry-immutable-inventory-ledger-sổ-cái-kế-toán-kho-kép)
   - [3.4. Idempotency Key Transaction (Chống tạo đơn trùng lặp)](#34-idempotency-key-transaction-chống-tạo-đơn-trùng-lặp)
   - [3.5. Batch Array Transactions (`prisma.$transaction([...])`)](#35-batch-array-transactions-prismatransaction)
   - [3.6. Background Worker Transactions (Claim Pattern & Multi-instance Safety)](#36-background-worker-transactions-claim-pattern--multi-instance-safety)
4. [Các Lỗ Hổng & Điểm Cần Cải Thiện (Gaps & Edge Cases)](#4-các-lỗ-hổng--điểm-cần-cải-thiện-gaps--edge-cases)
   - [4.1. `addItem` trong `cart.controller.ts` thiếu Transaction và Lock giỏ hàng](#41-additem-trong-cartcontrollerts-thiếu-transaction-và-lock-giỏ-hàng)
   - [4.2. `rotateRefreshToken` trong `token.service.ts` chưa nguyên tử](#42-rotaterefreshtoken-trong-tokenservicets-chưa-nguyên-tử)
   - [4.3. Hiệu năng của `reorderShopCategories` và `updateSettings`](#43-hiệu-năng-của-reordershopcategories-và-updatesettings)
   - [4.4. Nguy cơ phình Transaction trong `claimDueCampaigns`](#44-nguy-cơ-phình-transaction-trong-claimduecampaigns)
   - [4.5. Thiếu cơ chế Auto-Retry khi gặp Deadlock hoặc Serialization Failure](#45-thiếu-cơ-chế-auto-retry-khi-gặp-deadlock-hoặc-serialization-failure)
   - [4.6. Chuẩn bị kiến trúc Transaction cho Cổng thanh toán Online](#46-chuẩn-bị-kiến-trúc-transaction-cho-cổng-thanh-toán-online)
5. [Hướng Dẫn & Mã Nguồn Cải Thiện Cụ Thể](#5-hướng-dẫn--mã-nguồn-cải-thiện-cụ-thể)
6. [Tổng Kết Đánh Giá](#6-tổng-kết-đánh-giá)

---

## 1. Tổng Quan Kiến Trúc Transaction & Kiểm Soát Tranh Chấp

Trong hệ thống thương mại điện tử **Petshop-express-nextjs**, việc bảo đảm tính toàn vẹn dữ liệu (ACID: Atomicity, Consistency, Isolation, Durability) là tôn chỉ cốt lõi. Dự án vận hành trên cơ sở dữ liệu **PostgreSQL** kết hợp với **Prisma ORM 7** qua driver `@prisma/adapter-pg`.

### Các nguyên tắc kỹ thuật xuyên suốt:
1. **Mức độ cô lập mặc định (Isolation Level):** Sử dụng mức `Read Committed` mặc định của PostgreSQL nhưng kết hợp khóa bi quan tường minh (`FOR UPDATE`) và cập nhật có điều kiện (`Conditional Updates`) để loại bỏ hoàn toàn các lỗi `Lost Update` và `Non-repeatable Read`.
2. **Triệt tiêu Deadlock bằng Thứ tự ID xác định (Deterministic Ordering):** Khi một transaction tác động lên nhiều dòng dữ liệu cùng loại (ví dụ: các biến thể sản phẩm trong đơn hàng), các dòng luôn được sắp xếp theo thứ tự `id` tăng dần trước khi thực hiện khóa hoặc ghi.
3. **Phân tách nhiệm vụ giữa Tiền mặt (COD) và Chuyển khoản (Bank Transfer):**
   - Đơn COD: Trừ trực tiếp `stockQuantity` ngay tại thời điểm checkout và ghi nhận dòng sổ cái `SALE`.
   - Đơn Chuyển khoản: Tăng `reservedQuantity` (giữ chỗ tạm thời trong 24 giờ). Khi admin xác nhận thanh toán mới chính thức trừ kho vật lý.
4. **Bất biến sổ cái kho (ADR-007):** Không bao giờ ghi đè số lượng tồn kho tùy tiện. Mọi biến động vật lý đều được ghi thành một dòng mới trong sổ cái `InventoryMovement` trong cùng một transaction.

---

## 2. Bảng Phân Loại Toàn Bộ Transaction Trong Mã Nguồn

| STT | Nhóm Nghiệp Vụ | Vị Trí Mã Nguồn | Loại Kỹ Thuật | Tác Vụ Cụ Thể & Khóa Dữ Liệu |
| :--- | :--- | :--- | :--- | :--- |
| **1** | Đặt hàng | `backend/controllers/order.controller.ts:82` | Interactive Tx + Pessimistic Lock | Khóa giỏ hàng `FOR UPDATE`, kiểm tra Idempotency Replay, sắp xếp biến thể, khấu trừ tồn kho có điều kiện, tạo đơn hàng snapshot, xóa giỏ hàng, ghi sổ cái kho. |
| **2** | Xác nhận thanh toán | `backend/controllers/order.controller.ts:310` | Interactive Tx + Conditional Update | Đổi trạng thái `CONFIRMED` có điều kiện, giảm `reservedQuantity` và `stockQuantity`, ghi sổ cái kho `SALE`. |
| **3** | Hủy đơn hàng | `backend/controllers/order.controller.ts:354` | Interactive Tx + Conditional Update | Đổi trạng thái `CANCELLED` có điều kiện, hoàn trả `reservedQuantity` hoặc hồi kho `stockQuantity` kèm ghi sổ cái `CANCEL_RESTOCK`. |
| **4** | Cập nhật giao hàng | `backend/controllers/order.controller.ts:405` | Interactive Tx + Conditional Update | Cập nhật tiến độ `PROCESSING` / `COMPLETED`, đánh dấu thu tiền mặt COD (`PAID`). |
| **5** | Dọn đơn quá hạn | `backend/workers/releaseExpiredOrders.ts:38` | Interactive Tx + Conditional Claim | Quét các đơn chuyển khoản quá 24h chưa trả tiền, claim đơn bằng conditional UPDATE, giảm `reservedQuantity`. Chạy an toàn đa worker. |
| **6** | Quản lý kho Admin | `backend/services/inventory.service.ts:82` | Interactive Tx + Pessimistic Lock | Admin điều chỉnh kho (`ADJUST`) hoặc kiểm kê (`STOCKTAKE`). Khóa biến thể `FOR UPDATE`, từ chối nếu thấp hơn `reservedQuantity`, cập nhật kho và ghi sổ cái. |
| **7** | Tạo sản phẩm | `backend/controllers/product.controller.ts:181` | Interactive Tx | Tạo `Product`, tạo danh sách `ProductVariant`, ghi số dư mở sổ cái `OPENING`, tính toán lại `minPrice`, tạo `ProductImage`. |
| **8** | Đổi slug sản phẩm | `backend/controllers/product.controller.ts:274` | Interactive Tx | Cập nhật slug mới và lưu slug cũ vào `ProductSlugRedirect` để chuyển hướng 308 SEO. |
| **9** | Cập nhật giá biến thể | `backend/controllers/product.controller.ts:304` | Interactive Tx + Pessimistic Lock | Khóa dòng `Product` cha `FOR UPDATE`, cập nhật `ProductVariant`, tính và lưu lại `Product.minPrice`. |
| **10** | Xóa sản phẩm | `backend/controllers/product.controller.ts:411` | Batch Array Tx | Xóa đồng loạt `ProductImage`, `ProductVariant` và `Product` cha. |
| **11** | Thêm biến thể | `backend/controllers/product.controller.ts:432` | Interactive Tx + Pessimistic Lock | Khóa `Product` cha `FOR UPDATE`, tạo `ProductVariant`, ghi sổ cái `OPENING`, cập nhật `minPrice`. |
| **12** | Xóa biến thể | `backend/controllers/product.controller.ts:461` | Interactive Tx + Pessimistic Lock | Khóa `Product` cha `FOR UPDATE`, kiểm tra không xóa biến thể cuối cùng, xóa biến thể và cập nhật lại `minPrice`. |
| **13** | Sản phẩm mua kèm | `backend/services/productRelated.service.ts:33` | Batch Array Tx | Xóa danh sách gợi ý cũ và thêm danh sách `ProductRelated` mới theo thứ tự `position`. |
| **14** | Đổi slug danh mục | `backend/services/categoryAdmin.service.ts:83` | Interactive Tx | Cập nhật slug danh mục và lưu `CategorySlugRedirect`. |
| **15** | Xóa danh mục | `backend/services/categoryAdmin.service.ts:100` | Batch Array Tx | Xóa các `CategoryAttribute` và xóa `Category`. |
| **16** | Sắp xếp danh mục | `backend/services/categoryAdmin.service.ts:112` | Batch Array Tx | Cập nhật lại chỉ số `sortOrder` cho danh sách ID danh mục cùng cấp. |
| **17** | Sửa giỏ hàng | `backend/controllers/cart.controller.ts:156` | Interactive Tx + Pessimistic Lock | Khóa dòng `Cart` cha `FOR UPDATE`, cập nhật số lượng `CartItem`. |
| **18** | Xóa khỏi giỏ hàng | `backend/controllers/cart.controller.ts:187` | Interactive Tx + Pessimistic Lock | Khóa dòng `Cart` cha `FOR UPDATE`, xóa dòng `CartItem`. |
| **19** | Đặt lại mật khẩu | `backend/controllers/auth.controller.ts:120` | Interactive Tx + Conditional Delete | Xóa token reset một lần (`count === 1`), cập nhật mật khẩu, thu hồi toàn bộ Refresh Token của user. |
| **20** | Sửa đánh giá | `backend/services/review.service.ts:72` | Interactive Tx + Conditional Update | Chuyển đánh giá về `PENDING`, đồng thời trừ `reviewCount` và `ratingSum` trên `Product` nếu bài đánh giá trước đó đã duyệt. |
| **21** | Duyệt/Ẩn đánh giá | `backend/services/reviewModeration.service.ts:26` | Interactive Tx + Conditional Update | Cập nhật trạng thái review (`APPROVED`/`HIDDEN`), đồng thời tăng/giảm số sao và lượt đánh giá trên `Product`. |
| **22** | Hủy đăng ký tin | `backend/services/newsletter.service.ts:84` | Interactive Tx | Cập nhật người đăng ký `UNSUBSCRIBED`, đánh dấu delivery, tăng `unsubscribeCount` trên chiến dịch. |
| **23** | Hủy gửi chiến dịch | `backend/services/newsletterCampaign.service.ts:144` | Interactive Tx | Dừng chiến dịch đang gửi hoặc đưa chiến dịch đã lên lịch về `DRAFT`. |
| **24** | Quét email bị kẹt | `backend/services/newsletterSend.service.ts:107` | Interactive Tx | Đánh dấu delivery thất bại quá số lần cho phép sang `FAILED` và tăng `failedCount` của chiến dịch. |
| **25** | Worker nhận chiến dịch | `backend/services/newsletterSend.service.ts:124` | Interactive Tx | Claim chiến dịch đến hạn sang `SENDING`, snapshot toàn bộ subscriber sang `NewsletterDelivery`, cập nhật `recipientCount`. |
| **26** | Cập nhật kết quả gửi email | `backend/services/newsletterSend.service.ts:186, 197` | Interactive Tx | Ghi nhận delivery thành công (`SENT`) hoặc thất bại (`FAILED`) và cập nhật bộ đếm trên `NewsletterCampaign`. |
| **27** | Cập nhật cài đặt CMS | `backend/controllers/setting.controller.ts:42` | Batch Array Tx | Thực hiện hàng loạt thao tác upsert các key-value `SiteSetting`. |
| **28** | Đồng bộ cây danh mục | `backend/scripts/categoryTree.ts:95` | Interactive Tx | Seed cây danh mục cha - con theo thứ tự phân cấp. |
| **29** | Seed dữ liệu mẫu | `backend/scripts/petshopCatalog.ts:112, 137` | Interactive / Batch Tx | Xóa danh mục cũ, tạo sản phẩm mẫu kèm biến thể và số dư sổ cái kho ban đầu. |

---

## 3. Phân Tích Chuyên Sâu Từng Mô Hình Transaction

### 3.1. Interactive Transactions kết hợp Pessimistic Row Locking (`FOR UPDATE`)
* **Vị trí tiêu biểu:** `order.controller.ts` (Checkout), `cart.controller.ts` (Update/Remove Item), `catalog.service.ts:lockProduct`.
* **Cơ chế hoạt động:** 
  Mở giao dịch tương tác và thực hiện câu lệnh SQL:
  ```sql
  SELECT "id" FROM "Cart" WHERE "userId" = $1 AND "brandSlug" = $2 FOR UPDATE;
  ```
  PostgreSQL sẽ áp dụng khóa độc quyền cấp dòng (*Row Exclusive Lock*) trên bản ghi giỏ hàng cho đến khi transaction hoàn tất (COMMIT hoặc ROLLBACK).
* **Ưu điểm:**
  * **Tuần tự hóa tuyệt đối (Serialization):** Ngăn chặn triệt để xung đột giữa các hành động đối kháng. Ví dụ: Người dùng không thể vừa sửa số lượng giỏ hàng ở Tab 1 trong khi Tab 2 đang tiến hành tạo đơn hàng.
  * **Giải quyết bài toán biến thể cha - con:** Khóa dòng `Product` cha khi cập nhật giá biến thể con giúp việc tính toán `minPrice` luôn chính xác, không bị đè bởi 2 admin sửa giá cùng lúc.
* **Nhược điểm:**
  * Nếu transaction giữ khóa lâu (ví dụ do xử lý logic tính toán phức tạp hoặc timeout cấu hình cao 15s), sẽ gây tắc nghẽn hàng đợi kết nối (Connection Pool Exhaustion).
  * Tiềm ẩn nguy cơ Deadlock nếu các tài nguyên bị khóa không theo một trật tự cố định. *(Rất may mắn dự án đã phòng thủ bằng việc sắp xếp tăng dần ID biến thể).*

---

### 3.2. Atomic Conditional Updates (Optimistic Concurrency Control)
* **Vị trí tiêu biểu:** Trừ kho COD (`inventory.service.ts:claimForSale`), giữ kho Bank Transfer, chuyển trạng thái đơn hàng (`confirmPayment`, `cancelOrder`).
* **Cơ chế hoạt động:** 
  Không dùng câu lệnh `SELECT` để đọc rồi kiểm tra trong RAM ứng dụng, mà đẩy toàn bộ điều kiện kiểm tra vào mệnh đề `WHERE` của lệnh `UPDATE`:
  ```sql
  UPDATE "ProductVariant"
  SET "stockQuantity" = "stockQuantity" - $quantity
  WHERE "id" = $variantId AND ("stockQuantity" - "reservedQuantity") >= $quantity;
  ```
* **Ưu điểm:**
  * **Hiệu năng cực cao:** Không tốn chi phí khóa trước (no upfront lock). Engine cơ sở dữ liệu khóa dòng ở cấp độ vi giây trong khi thực thi lệnh.
  * **Ngăn chặn bán khống (Anti-Overselling) tuyệt đối:** Trong kịch bản Flash Sale, 100 request cùng tranh mua 1 sản phẩm cuối cùng thì duy nhất 1 câu lệnh trả về `rows affected = 1`, 99 câu còn lại trả về `0` và ném lỗi `OUT_OF_STOCK` an toàn.
  * **Đa tiến trình an toàn (Multi-worker resilience):** Giúp các tiến trình ngầm như `releaseExpiredOrders` có thể chạy song song trên nhiều node/container mà không bao giờ nhả kho 2 lần cho 1 đơn hàng.
* **Nhược điểm:**
  * Khi thất bại (0 dòng cập nhật), câu lệnh không trả về nguyên nhân cụ thể (thiếu hàng do bán hết hay do bị giữ chỗ) mà mã nguồn phải suy luận gián tiếp.

---

### 3.3. Double-Entry Immutable Inventory Ledger (Sổ cái kế toán kho kép)
* **Vị trí tiêu biểu:** [`backend/services/inventory.service.ts`](file:///Users/tanghuynhtuantu/Programming/Project/Petshop-express-nextjs/backend/services/inventory.service.ts).
* **Cơ chế hoạt động:**
  Tách biệt giữa kho vật lý (`stockQuantity`) và kho cam kết (`reservedQuantity`). Mỗi khi thay đổi kho vật lý, transaction bắt buộc phải thực hiện 2 thao tác song hành:
  1. Thay đổi số lượng trên `ProductVariant`.
  2. Ghi một bản ghi bất biến vào `InventoryMovement` mang theo `delta` âm/dương, `quantityAfter` và lý do (`reason`).
* **Ưu điểm:**
  * **Tính toàn vẹn kế toán:** `sum(delta) == stockQuantity` luôn đúng trên từng biến thể tại mọi thời điểm.
  * **Dấu vết kiểm toán (Audit Trail) bất tử:** Dù đơn hàng, người dùng hoặc biến thể bị xóa, bản ghi sổ cái vẫn được giữ nguyên (`ON DELETE SET NULL`) cùng SKU snapshot.
* **Nhược điểm:**
  * Bảng `InventoryMovement` sẽ phình to rất nhanh khi có số lượng đơn hàng lớn, đòi hỏi phải có chính sách lưu trữ phân vùng sau này.

---

### 3.4. Idempotency Key Transaction (Chống tạo đơn trùng lặp)
* **Vị trí tiêu biểu:** [`backend/controllers/order.controller.ts:80-103`](file:///Users/tanghuynhtuantu/Programming/Project/Petshop-express-nextjs/backend/controllers/order.controller.ts#L80-L103).
* **Cơ chế hoạt động:**
  Client gửi kèm header `Idempotency-Key`. Bên trong transaction, ngay sau khi khóa giỏ hàng, hệ thống kiểm tra sự tồn tại của cặp `(userId, idempotencyKey)`. Nếu đã có đơn hàng được tạo trước đó với key này, trả về ngay đơn hàng cũ kèm mã trạng thái HTTP 200 (Replay).
* **Ưu điểm:**
  * Giải quyết dứt điểm các tình huống: người dùng nhấn liên tiếp vào nút Đặt hàng (double click), thiết bị giật lag, hoặc rớt mạng khi response chưa kịp về đến client.
  * Tránh trường hợp khách hàng bị trừ kho và tạo 2 đơn hàng giống hệt nhau.
* **Nhược điểm:**
  * Hiện chỉ mới được áp dụng tại cổng thanh toán đơn hàng, chưa có ở các API nhạy cảm khác.

---

### 3.5. Batch Array Transactions (`prisma.$transaction([...])`)
* **Vị trí tiêu biểu:** `setting.controller.ts`, `categoryAdmin.service.ts:reorderShopCategories`, `productRelated.service.ts:setRelated`.
* **Cơ chế hoạt động:** Truyền một danh sách các câu lệnh Prisma vào mảng.
* **Ưu điểm:**
  * Cú pháp ngắn gọn, dễ đọc, tự động rollback tất cả nếu một lệnh thất bại.
* **Nhược điểm:**
  * **Độ trễ mạng tích lũy (Sequential round-trips):** Prisma thực thi tuần tự từng câu lệnh trong mảng qua giao thức mạng tới PostgreSQL. Nếu danh sách có 100 bản ghi cần cập nhật, kết nối database sẽ bị giữ mở qua 100 chặng round-trip, làm chậm pool.

---

### 3.6. Background Worker Transactions (Claim Pattern & Multi-instance Safety)
* **Vị trí tiêu biểu:** `releaseExpiredOrders.ts`, `newsletterSend.service.ts`.
* **Cơ chế hoạt động:**
  Không gom toàn bộ các đơn hết hạn vào một transaction lớn. Thay vào đó, worker lặp qua từng phần tử và mở **mỗi phần tử một transaction riêng biệt**.
* **Ưu điểm:**
  * **Lỗi cô lập (Fault Isolation):** Một đơn hàng bị lỗi dữ liệu sẽ không chặn các đơn hàng hợp lệ khác được hoàn kho.
  * **Không giữ lock lâu:** Transaction mở ra và commit ngay trong vài miligiây.
* **Nhược điểm:**
  * Nhiều transaction nhỏ chạy liên tục sẽ tạo ra tải I/O ghi log (WAL) liên tục cho PostgreSQL nếu tần suất worker quá dày.

---

## 4. Các Lỗ Hổng & Điểm Cần Cải Thiện (Gaps & Edge Cases)

Dưới đây là các điểm rủi ro kỹ thuật được phát hiện trong mã nguồn cần được xem xét và khắc phục:

### 4.1. `addItem` trong `cart.controller.ts` thiếu Transaction và Lock giỏ hàng
* **Vị trí:** [`backend/controllers/cart.controller.ts:117-130`](file:///Users/tanghuynhtuantu/Programming/Project/Petshop-express-nextjs/backend/controllers/cart.controller.ts#L117-L130).
* **Vấn đề:** Thao tác thêm vào giỏ chạy 2 câu lệnh SQL riêng biệt: tạo `Cart` rồi tạo `CartItem`. Không có transaction và cũng không có `lockCart`.
* **Kịch bản lỗi:** Nếu người dùng vừa bấm checkout ở Tab 1 (`createOrder`), vừa bấm thêm sản phẩm ở Tab 2 (`addItem`), dòng hàng mới có thể được chèn vào giỏ đúng vào thời điểm `createOrder` vừa đọc xong giỏ hàng và chuẩn bị xóa giỏ hàng (`deleteMany`). Hậu quả là món hàng mới thêm bị xóa trắng mà không hề có trong đơn hàng.

---

### 4.2. `rotateRefreshToken` trong `token.service.ts` chưa nguyên tử
* **Vị trí:** [`backend/services/token.service.ts:74-87`](file:///Users/tanghuynhtuantu/Programming/Project/Petshop-express-nextjs/backend/services/token.service.ts#L74-L87).
* **Vấn đề:** 
  1. Bước 1: `updateMany` để đánh dấu `revokedAt = now()` cho token cũ.
  2. Bước 2: Gọi `issueRefreshToken` bên ngoài để tạo token mới.
* **Kịch bản lỗi:** Nếu tiến trình Node.js bị restart hoặc database bị ngắt kết nối ngay sau Bước 1, token cũ đã bị thu hồi nhưng token mới chưa được cấp. Người dùng bị đăng xuất bất đắc dĩ. Khi trình duyệt tự động gửi lại token cũ để thử lại, hệ thống nhận diện đây là hành vi **Tấn công Replay** và thu hồi toàn bộ các phiên đăng nhập khác của người dùng đó.

---

### 4.3. Hiệu năng của `reorderShopCategories` và `updateSettings`
* **Vị trí:** `backend/services/categoryAdmin.service.ts:112` và `backend/controllers/setting.controller.ts:42`.
* **Vấn đề:** Dùng mảng Promise `prisma.$transaction(ids.map(...))` khiến Prisma phải gửi N câu lệnh cập nhật tuần tự.
* **Rủi ro:** Khi danh sách danh mục hoặc cấu hình tăng lên, thời gian chiếm giữ transaction kéo dài không đáng có.

---

### 4.4. Nguy cơ phình Transaction trong `claimDueCampaigns`
* **Vị trí:** [`backend/services/newsletterSend.service.ts:124-134`](file:///Users/tanghuynhtuantu/Programming/Project/Petshop-express-nextjs/backend/services/newsletterSend.service.ts#L124-L134).
* **Vấn đề:** Transaction claim chiến dịch thực hiện đọc toàn bộ subscriber ở trạng thái `CONFIRMED` và thực hiện `createMany` vào bảng `NewsletterDelivery`.
* **Rủi ro:** Khi danh sách người đăng ký lên tới hàng chục nghìn người, việc tải toàn bộ vào RAM và insert hàng loạt trong một transaction sẽ làm transaction bị quá thời gian timeout (thường mặc định 5s của Prisma) và gây áp lực lớn lên bộ nhớ database.

---

### 4.5. Thiếu cơ chế Auto-Retry khi gặp Deadlock hoặc Serialization Failure
* **Vấn đề:** Trong môi trường có độ tranh chấp cao, PostgreSQL có thể hủy một transaction với lỗi `40P01` (deadlock detected) hoặc `40001` (serialization failure). Hiện tại backend chưa có middleware hay helper tự động retry các transaction thoáng qua này mà ném thẳng lỗi 500 ra client.

---

### 4.6. Chuẩn bị kiến trúc Transaction cho Cổng thanh toán Online
* **Vấn đề:** Hiện tại dự án mới hỗ trợ COD và Chuyển khoản ngân hàng thủ công.
* **Khuyến nghị:** Khi tích hợp cổng thanh toán trực tuyến (VNPay, MoMo, ZaloPay, Stripe), cần thiết kế cơ chế **Webhook Idempotency Transaction** để bảo vệ hệ thống trước tình huống Gateway gửi IPN trùng lặp.

---

## 5. Hướng Dẫn & Mã Nguồn Cải Thiện Cụ Thể

### 5.1. Bọc `addItem` vào Transaction và tích hợp Lock giỏ hàng
Chỉnh sửa file `backend/controllers/cart.controller.ts`:

```typescript
export const addItem = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !req.brand) throw new ApiError(401, 'UNAUTHENTICATED', 'Chưa xác thực');
  const { variantId } = req.body;
  const quantity = Number(req.body.quantity ?? 1);

  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: { product: true },
  });
  if (!variant) throw new ApiError(404, 'VARIANT_NOT_FOUND', 'Không tìm thấy biến thể sản phẩm');
  if (variant.product.status !== PRODUCT_STATUS.ACTIVE) {
    throw new ApiError(409, 'PRODUCT_UNAVAILABLE', 'Sản phẩm hiện không bán');
  }
  if (!req.brand.categoryIds.includes(variant.product.categoryId)) {
    throw new ApiError(404, 'VARIANT_NOT_FOUND', 'Không tìm thấy biến thể sản phẩm');
  }

  // ✅ BỌC TRONG TRANSACTION VÀ KHÓA CART ROW ĐỂ ĐỒNG BỘ VỚI CHECKOUT
  const item = await prisma.$transaction(async (tx) => {
    const [cart] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO "Cart" ("id", "userId", "brandSlug", "updatedAt")
      VALUES (${crypto.randomUUID()}, ${req.user.id}, ${req.brand.slug}, now())
      ON CONFLICT ("userId", "brandSlug") DO UPDATE SET "updatedAt" = now()
      RETURNING "id"`;

    // Khóa dòng giỏ hàng
    await tx.$queryRaw`SELECT "id" FROM "Cart" WHERE "id" = ${cart.id} FOR UPDATE`;

    const [cartItem] = await tx.$queryRaw<{ id: string; quantity: number }[]>`
      INSERT INTO "CartItem" ("id", "cartId", "variantId", "quantity")
      VALUES (${crypto.randomUUID()}, ${cart.id}, ${variantId}, ${quantity})
      ON CONFLICT ("cartId", "variantId")
        DO UPDATE SET "quantity" = LEAST("CartItem"."quantity" + EXCLUDED."quantity", ${MAX_LINE_QUANTITY})
      RETURNING "id", "quantity"`;

    return cartItem;
  });

  const available = variant.stockQuantity - variant.reservedQuantity;
  const warning = item.quantity > available ? 'INSUFFICIENT_STOCK' : null;

  sendSuccess(res, { id: item.id, quantity: item.quantity, available, warning }, null, 201);
});
```

---

### 5.2. Nguyên tử hóa vòng đời Refresh Token trong `token.service.ts`
Chỉnh sửa hàm `rotateRefreshToken` trong `backend/services/token.service.ts`:

```typescript
export async function rotateRefreshToken(rawToken: string): Promise<{ userId: string; rawToken: string } | null> {
  const tokenHash = hashToken(rawToken);

  const record = await prisma.refreshToken.findFirst({
    where: { tokenHash }
  });

  if (!record) return null;

  if (record.revokedAt !== null) {
    await prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    return null;
  }

  if (new Date() > record.expiresAt) return null;

  // ✅ THỰC HIỆN THU HỒI VÀ CẤP PHÁT TOKEN MỚI TRONG CÙNG 1 TRANSACTION NGUYÊN TỬ
  return await prisma.$transaction(async (tx) => {
    const { count } = await tx.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (count !== 1) {
      await tx.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() }
      });
      return null;
    }

    const newRawToken = crypto.randomBytes(40).toString('hex');
    await tx.refreshToken.create({
      data: {
        userId: record.userId,
        tokenHash: hashToken(newRawToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS)
      }
    });

    return { userId: record.userId, rawToken: newRawToken };
  });
}
```

---

### 5.3. Tối ưu Bulk Reorder bằng Single PostgreSQL Query
Chỉnh sửa hàm `reorderShopCategories` trong `backend/services/categoryAdmin.service.ts`:

```typescript
export async function reorderShopCategories(s: Scope, parentId: string, ids: string[]): Promise<void> {
  if (!s.shopIds.includes(parentId)) throw notFound();
  const siblings = await prisma.category.findMany({ where: { parentId }, select: { id: true } });
  if (!sameMembers(ids, siblings.map((c) => c.id))) {
    throw new ApiError(422, 'REORDER_MISMATCH', 'Danh sách sắp xếp không khớp các danh mục cùng cấp');
  }

  // ✅ DÙNG 1 CÂU LỆNH DUY NHẤT THAY VÌ MẢNG NHIỀU PROMISE TUẦN TỰ
  const values = ids.map((id, index) => Prisma.sql`(${id}::text, ${index}::int)`);
  await prisma.$executeRaw`
    UPDATE "Category" AS c
    SET "sortOrder" = v.sort_order
    FROM (VALUES ${Prisma.join(values)}) AS v(id, sort_order)
    WHERE c.id = v.id`;
}
```

---

### 5.4. Xây dựng Helper tự động Retry khi gặp xung đột Transaction
Tạo file tiện ích `backend/utils/transactionRetry.ts`:

```typescript
import type { Prisma } from '@prisma/client';
import prisma from '../services/prisma';

export async function runWithTransactionRetry<T>(
  action: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { maxRetries?: number; delayMs?: number; timeoutMs?: number } = {}
): Promise<T> {
  const { maxRetries = 3, delayMs = 50, timeoutMs = 10000 } = options;
  let attempt = 0;

  while (true) {
    try {
      return await prisma.$transaction(action, { timeout: timeoutMs });
    } catch (error: any) {
      attempt++;
      // Mã lỗi Postgres: 40P01 = Deadlock detected, 40001 = Serialization failure
      const isTransient =
        error.code === 'P2034' || // Prisma transaction conflict
        error.message?.includes('deadlock') ||
        error.message?.includes('could not serialize');

      if (!isTransient || attempt >= maxRetries) {
        throw error;
      }

      // Exponential backoff có jitter ngẫu nhiên
      const backoff = delayMs * Math.pow(2, attempt) + Math.random() * 20;
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
}
```

---

## 6. Tổng Kết Đánh Giá

Kiến trúc quản lý giao dịch của dự án **Petshop E-Commerce** được xây dựng với độ hoàn thiện cao, thể hiện tư duy thiết kế bài bản:
* **Điểm sáng lớn nhất:** Việc ứng dụng linh hoạt giữa **Pessimistic Locking (`FOR UPDATE`)** cho các đối tượng phiên giỏ hàng và **Atomic Conditional Updates** cho dòng tồn kho vật lý. Điều này giúp hệ thống đạt được cả hai mục tiêu: an toàn dữ liệu tuyệt đối trước các đợt bão request (Flash Sale) và giữ cho cơ sở dữ liệu hoạt động nhẹ nhàng, không bị treo lock.
* **Điểm cần lưu ý duy nhất:** Cần chuẩn hóa tính nguyên tử cho các API phụ trợ (như `addItem` và `rotateRefreshToken`) và chuyển đổi các tác vụ ghi mảng (bulk updates) sang câu lệnh SQL gộp để tối ưu hóa triệt để tài nguyên kết nối cơ sở dữ liệu khi hệ thống mở rộng quy mô.
