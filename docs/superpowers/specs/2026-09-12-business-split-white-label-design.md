# Thiết kế: Tách 2 Business (Gốm sứ & Petshop) — White-label Template Clone

Ngày: 2026-09-12
Trạng thái: Đã duyệt, chuyển sang cập nhật plan triển khai

## Bối cảnh

Dự án ban đầu nhắm 1 nền tảng ecommerce đa ngành generic (theo tài liệu gốc). Sau khi
xong Blog & Gallery (Buổi 1-12), người học quyết định: bộ code này sẽ phục vụ **2 business
thật hoàn toàn khác biệt** — Gốm sứ trang trí và Petshop — thay vì 1 site demo chung.

## Quyết định kiến trúc: Kịch bản 1 (White-label/Template clone)

**Không chọn** multi-tenant SaaS (1 DB dùng chung + cột `storeId` khắp nơi). Lý do: chỉ có
2 business cố định đã biết trước (không phải nền tảng SaaS bán cho khách hàng tương lai
chưa xác định), thẩm mỹ 2 ngành khác biệt quá lớn (Gốm sứ: trầm/tinh tế/font Serif; Petshop:
vui nhộn/font bo tròn/màu sáng) khiến theme động phức tạp hơn hẳn 2 bản tĩnh riêng.

- **Backend (Express + Prisma)**: KHÔNG tách code. Nhờ thiết kế dynamic attributes
  (`category_attributes` + JSONB, đã có từ Buổi 2) — 1 bộ backend phục vụ được nhiều ngành
  hàng khác nhau. Sẽ deploy thành 2 instance riêng (2 database riêng) khi tới lúc deploy —
  chưa cần tách database ngay bây giờ (xem mục "Database" bên dưới).
- **Frontend (Next.js)**: TÁCH ngay thành 2 thư mục trong CÙNG 1 repo hiện tại (không tạo
  repo GitHub mới, giữ đơn giản cho việc học từng buổi):
  - `frontend-petshop/` — đổi tên từ `frontend/` hiện tại (giữ nguyên nội dung/code, coi
    như bản Petshop, tạm dừng phát triển).
  - `frontend-gomsu/` — bản sao mới, ưu tiên phát triển trước (theo yêu cầu người học).

## Điểm căng thẳng đã giải quyết: SEO-sớm vs "freeze rồi mới tách"

Đề xuất gốc (nguồn tư vấn khác) gợi ý hoàn thiện xong ecommerce core (product/cart/checkout)
rồi mới tách+theme. Nhưng Blog & Gallery đã xong VÀ nội dung vốn đặc thù theo từng ngành
ngay từ đầu (không như ecommerce logic là generic) — nên **quyết định**: tách + viết nội
dung thật + deploy Blog & Gallery NGAY cho từng business, giữ đúng lợi thế SEO sớm (lý do
ban đầu chọn làm Blog & Gallery trước ecommerce, spec 2026-08-22). Ecommerce core (Giai
đoạn 2 archive) vẫn theo chiến lược "Base Template → Freeze → Clone & Theme" của đề xuất
gốc — xây 1 lần trên 1 nhánh, port sang cả 2 sau khi ổn định.

## Database (giai đoạn hiện tại)

**Chưa tách database ngay** — cả `frontend-petshop/` và `frontend-gomsu/` (khi phát triển
local) tiếp tục dùng chung 1 Postgres local hiện có, phân biệt bằng `Category` khác nhau
(vd "Petshop" categories vs "Gốm sứ trang trí" categories) — đây vẫn là dữ liệu test/seed,
chưa phải production. **Sẽ tách thành 2 database riêng biệt thật** đúng lúc deploy từng
business (khớp Kịch bản 1) — quyết định này hoãn tới khi thực sự deploy, không cần làm bây
giờ.

## Ưu tiên: Gốm sứ trước

Theo yêu cầu người học — tiếp theo sẽ: (1) tạo `frontend-gomsu/`, (2) theme lại
(Tailwind: font Serif — vd Playfair Display, bảng màu đất nung/be/pastel trầm), (3) viết
nội dung blog/gallery THẬT cho ngành gốm sứ (thay test data "hạt cho chó" hiện tại), (4)
deploy domain thật cho Gốm sứ trước (Buổi deploy — nội dung Buổi 13-14 cũ được áp dụng lại
cho `frontend-gomsu/` cụ thể, không còn generic nữa).

## Buổi 13-14 cũ (deploy generic) — HOÃN, thay bằng lộ trình mới

| Buổi | Nội dung |
|---|---|
| 13 (mới) | Đổi tên `frontend/` → `frontend-petshop/`, tạo `frontend-gomsu/` (bản sao), điều chỉnh `package.json`/`.env.local` cho từng bản phân biệt |
| 14 (mới) | Theme Tailwind cho Gốm sứ: `tailwind.config`, font Serif, bảng màu, chỉnh `layout.js`/component cho tông trầm/tinh tế |
| 15 (mới) | Viết nội dung blog/gallery thật cho Gốm sứ (xoá/thay test data), category/attribute riêng cho ngành gốm |
| 16 (mới) | Deploy `frontend-gomsu/` + backend instance riêng lên domain thật (nội dung cũ của Buổi 13-14 gốc, áp dụng cụ thể) |
| 17 (mới) | Tổng kết Giai đoạn 1 (Blog & Gallery x2 business), quiz, log |

**Giai đoạn 2 (archive, không đổi vị trí)**: vẫn là ecommerce core — khi bắt đầu, áp dụng
đúng chiến lược "Base Template tối giản trên `frontend-gomsu/` (hoặc nhánh riêng) → freeze
→ port logic sang cả `frontend-petshop/`" thay vì viết code giỏ hàng/checkout 2 lần.

## Ngoài phạm vi (chưa quyết định, để sau)

- Theme cụ thể cho Petshop (màu/font chính xác) — chưa cần tới khi quay lại phát triển
  nhánh Petshop.
- Domain thật cho cả 2 business — dùng subdomain miễn phí Vercel/Render khi deploy (Buổi 16),
  mua domain thật để sau như quyết định gốc.
- Tách database production thật — hoãn tới lúc deploy.
