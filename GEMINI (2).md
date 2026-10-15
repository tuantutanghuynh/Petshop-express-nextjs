# GEMINI.md — Project Rules

> File này được Gemini CLI tự động nạp vào context mỗi session.
> Đặt ở **root của project**. Có thể đặt thêm `GEMINI.md` trong thư mục con (vd `backend/`, `frontend/`) cho rule riêng từng phần.
> Dùng `/memory show` để kiểm tra rule đã được nạp, `/memory refresh` sau khi sửa file.
> Thay mọi chỗ `[...]` bằng thông tin thật của project.

---

## 0. Ưu tiên tuyệt đối (đọc trước mọi thứ)

1. **Không đoán.** Thiếu thông tin → hỏi lại, không tự bịa API, tên file, field DB hay thư viện.
2. **Plan theo mức độ task.** Phân loại task theo mục 4.1 (SMALL / MEDIUM / LARGE). Task MEDIUM trở lên → trình bày kế hoạch, **chờ tôi xác nhận** rồi mới làm.
3. **Thay đổi nhỏ, từng bước.** Mỗi bước chạy được và kiểm tra được. Không refactor lan man ngoài phạm vi task.
4. **Không phá cái đang chạy.** Không xoá / đổi tên file, không đổi schema DB, không đổi public API nếu tôi chưa đồng ý.
5. **Trả lời bằng tiếng Việt**, giữ nguyên thuật ngữ kỹ thuật tiếng Anh (vd: middleware, migration, race condition). Code, tên biến, comment trong code, commit message: **tiếng Anh**.

---

## 1. Project Context

- **Tên project:** [Tên project]
- **Mục tiêu:** [1–2 câu: app làm gì, cho ai]
- **Giai đoạn hiện tại:** [MVP / đang phát triển / production]
- **Người dùng chính:** [vd: admin, sales staff, khách hàng]
- **Tính năng cốt lõi:**
  - [Feature 1]
  - [Feature 2]
  - [Feature 3]
- **Ngoài phạm vi (KHÔNG làm):** [vd: payment thật, multi-tenant, i18n]

---

## 2. Tech Stack

> Chỉ dùng đúng stack dưới đây. Muốn thêm dependency mới → **hỏi trước**, nêu lý do + phương án thay thế.

| Layer | Công nghệ | Version |
|---|---|---|
| Runtime | [Node.js] | [22.x] |
| Backend | [Express / NestJS / Spring Boot / Django] | [...] |
| Language | [TypeScript / JavaScript / Java / Python] | [...] |
| Database | [PostgreSQL] | [16] |
| ORM / Query | [Prisma / Drizzle / Knex / JPA / Django ORM] | [...] |
| Validation | [Zod / Joi / class-validator] | [...] |
| Auth | [JWT access + refresh / session] | — |
| Frontend | [Next.js / React + Vite] | [...] |
| Styling | [Tailwind CSS] | [...] |
| State / Data fetching | [TanStack Query / Zustand] | [...] |
| Testing | [Vitest / Jest / Supertest / JUnit / pytest] | [...] |
| Package manager | [pnpm / npm] | — |

---

## 3. Cấu trúc thư mục

```
[project-root]/
├── backend/
│   ├── src/
│   │   ├── config/          # env, db config
│   │   ├── modules/         # mỗi feature 1 folder
│   │   │   └── [feature]/
│   │   │       ├── [feature].routes.ts
│   │   │       ├── [feature].controller.ts
│   │   │       ├── [feature].service.ts
│   │   │       ├── [feature].repository.ts  # tuỳ chọn, xem mục 6
│   │   │       ├── [feature].schema.ts    # validation
│   │   │       └── [feature].test.ts
│   │   ├── middlewares/
│   │   ├── utils/
│   │   └── app.ts
│   ├── migrations/
│   └── .env.example
├── frontend/
│   └── src/
│       ├── app/ | pages/
│       ├── components/
│       │   ├── ui/          # component dùng chung, không chứa logic nghiệp vụ
│       │   └── [feature]/
│       ├── hooks/
│       ├── services/        # gọi API
│       ├── types/
│       └── lib/
├── docs/
│   ├── PROGRESS.md          # nhật ký session (xem mục 12)
│   └── DECISIONS.md         # quyết định kiến trúc quan trọng
└── GEMINI.md
```

**Quy tắc:** File mới phải đặt đúng chỗ theo cấu trúc trên. Không tạo thư mục mới ở root nếu chưa hỏi.

---

## 4. Quy trình mỗi session

### 4.1 Phân loại task

Trước khi làm, xác định task thuộc mức nào và **ghi rõ mức đó trong câu trả lời đầu tiên**.

| Mức | Tiêu chí | Cách làm |
|---|---|---|
| **SMALL** | ≤ 1 file, ≤ ~30 dòng, không đổi logic nghiệp vụ, không đụng các mục nhạy cảm bên dưới | Làm luôn → verify → báo cáo |
| **MEDIUM** | 2–3 file, hoặc thay đổi logic nghiệp vụ | Plan ngắn (các bước + file) → **chờ "go"** → làm |
| **LARGE** | > 3 file, hoặc đụng bất kỳ mục nhạy cảm nào | Plan chi tiết (bước, file, rủi ro, cách rollback) → **chờ "go"** → làm |

**Mục nhạy cảm — luôn tính là LARGE, dù chỉ sửa 1 dòng:**
DB schema / migration · public API contract · auth / authorization / security · cấu hình build, deploy, CI · thêm hoặc nâng cấp dependency · xoá / đổi tên file.

Không chắc thuộc mức nào → chọn mức **cao hơn**.

### 4.2 Khi bắt đầu session
1. Đọc `docs/PROGRESS.md` để biết đang làm tới đâu.
2. Đọc các file liên quan trực tiếp tới task trước khi sửa — **không sửa file chưa đọc**.
3. Tóm tắt lại task bằng 2–3 câu để xác nhận hiểu đúng (bỏ qua với task SMALL rõ ràng).

### 4.3 Khi làm một task
1. **Phân tích:** Nêu mức task, file sẽ tạo/sửa, lý do, rủi ro (nếu có).
2. **Plan (MEDIUM/LARGE):** Liệt kê các bước đánh số. Chờ tôi gõ "ok" / "go".
3. **Thực hiện:** Làm từng bước. Sau mỗi bước có thể chạy được → chạy lint / type-check / test để kiểm tra.
4. **Verify:** Chạy lại test liên quan. Nếu fail → sửa, không được bỏ qua hay xoá test cho pass.
5. **Review diff:** Chạy `git status` và `git diff --stat`, đối chiếu với plan:
   ```
   Files changed: 3 | Expected: 3 | Unexpected: 0
   ```
   Có file thay đổi ngoài dự kiến → giải thích lý do hoặc hoàn tác phần đó.
6. **Báo cáo:** Đi qua checklist **Definition of Done** (mục 4.5) và tóm tắt: đã làm gì, file nào thay đổi, cách test thủ công, việc còn lại.

### 4.4 Khi gặp lỗi
- Đọc kỹ error message + stack trace, nêu **nguyên nhân gốc** trước khi sửa.
- Sửa tối đa **2 lần** cùng một hướng. Vẫn lỗi → dừng lại, trình bày giả thuyết, hỏi tôi.
- Không "sửa mò" bằng cách thêm `any`, `@ts-ignore`, `try/catch` rỗng, hay tắt rule lint.

### 4.5 Definition of Done

Một task chỉ được báo **"xong"** khi tất cả mục áp dụng được đều đạt. Mục nào không áp dụng → ghi `N/A` kèm lý do.

- [ ] Implementation khớp với plan đã duyệt (hoặc đã giải thích chỗ lệch)
- [ ] Không có file thay đổi ngoài phạm vi (đã review `git diff --stat`)
- [ ] Type-check pass
- [ ] Lint pass
- [ ] Test liên quan pass; logic mới có test mới
- [ ] Build pass (khi task ảnh hưởng tới build)
- [ ] Không còn code debug, `console.log`, TODO không giải thích
- [ ] Đã xem xét ảnh hưởng security (input, quyền truy cập, dữ liệu nhạy cảm)
- [ ] Migration có cách rollback (nếu có đổi schema)
- [ ] Có hướng dẫn test thủ công
- [ ] `docs/DECISIONS.md` đã cập nhật (nếu thuộc trường hợp ở mục 12)

### 4.6 Khi kết thúc session
- Cập nhật `docs/PROGRESS.md` (mục 12).
- Đề xuất commit message theo chuẩn ở mục 10.

---

## 5. Code Style & Conventions

### Chung
- Ưu tiên **dễ đọc > ngắn gọn > thông minh**. Code phải đọc hiểu được bởi junior dev.
- Function ngắn, làm 1 việc. Quá ~40 dòng → cân nhắc tách.
- Không duplicate logic: lặp lại lần thứ 3 → tách hàm dùng chung.
- Không để lại `console.log` debug, code comment-out, hay `TODO` không kèm giải thích.
- Comment giải thích **tại sao**, không giải thích **cái gì** (code đã tự nói).
- Không hardcode: URL, secret, port, magic number → đưa vào config / constant.

### Đặt tên
| Loại | Quy ước | Ví dụ |
|---|---|---|
| Biến, function | camelCase | `getUserById` |
| Class, Type, Interface, Component | PascalCase | `OrderService`, `UserCard` |
| Constant | UPPER_SNAKE_CASE | `MAX_PAGE_SIZE` |
| File (backend) | kebab-case hoặc `feature.layer.ts` | `order.service.ts` |
| File component (frontend) | PascalCase | `OrderTable.tsx` |
| Bảng DB | snake_case, số nhiều | `order_items` |
| Cột DB | snake_case | `created_at` |
| Boolean | tiền tố `is/has/can/should` | `isActive`, `hasPermission` |

### TypeScript (nếu dùng)
- `strict: true`. **Cấm `any`** — dùng `unknown` + type guard nếu thật sự cần.
- Khai báo type cho input/output của mọi function public.
- Type dùng chung giữa FE/BE đặt ở một nơi duy nhất, không định nghĩa lại.

---

## 6. Backend Rules

### Kiến trúc layer
```
Route → Controller → Service → Repository → Database
```
- **Controller:** nhận request, validate, gọi service, trả response. **Không chứa business logic.**
- **Service:** toàn bộ business logic. Không biết gì về `req`/`res`.
- **Repository:** chỉ truy vấn DB. Không chứa business logic.

**Repository là tuỳ chọn, không bắt buộc cho mọi feature.** Với ORM như Prisma, service có thể gọi ORM trực tiếp cho query đơn giản. Chỉ tạo repository khi có ít nhất một lý do sau:
- query phức tạp (nhiều join, raw SQL, aggregation) cần gom vào một chỗ;
- cùng query được dùng lại ở nhiều service;
- cần ranh giới rõ để mock DB khi test;
- cần nhiều implementation hoặc che giấu chi tiết ORM.

Không tạo repository chỉ để bọc `prisma.x.findUnique(...)` một dòng. Trong cùng một feature, chọn **một** cách và giữ nhất quán.

### API Design
- RESTful, danh từ số nhiều: `GET /api/v1/orders`, `POST /api/v1/orders/:id/cancel`.
- Versioning qua prefix `/api/v1`.
- HTTP status đúng nghĩa: `200` OK, `201` Created, `204` No Content, `400` Validation, `401` Unauthenticated, `403` Forbidden, `404` Not Found, `409` Conflict, `422` Business rule, `500` Server error.
- Response format thống nhất:

```json
// Thành công
{ "success": true, "data": { }, "meta": { "page": 1, "limit": 20, "total": 135 } }

// Lỗi
{ "success": false, "error": { "code": "ORDER_NOT_FOUND", "message": "Order not found", "details": [] } }
```

- List endpoint **luôn có pagination** (mặc định `limit=20`, tối đa `100`), hỗ trợ `sort` và filter cơ bản.

### Validation & Error Handling
- **Validate mọi input** (body, params, query) ở tầng đầu vào bằng schema.
- Dùng custom error class (vd `AppError(code, message, status)`), ném lỗi từ service, xử lý tập trung bằng **1 error-handling middleware**.
- Không trả stack trace hay lỗi DB thô cho client. Log chi tiết ở server.
- Async handler phải bắt lỗi (wrapper hoặc framework hỗ trợ sẵn) — không để unhandled promise rejection.

### Database
- **Mọi thay đổi schema phải qua migration.** Không sửa DB bằng tay, không sửa migration đã chạy.
- Bảng nghiệp vụ thông thường nên có `id`, `created_at`, `updated_at`. Cân nhắc `deleted_at` (soft delete) cho dữ liệu nghiệp vụ.
- Bảng junction / association (vd `user_roles`, `product_tags`) có thể dùng **composite primary key** (`PRIMARY KEY (user_id, role_id)`) thay vì `id` riêng khi phù hợp.
- Tiền tệ: dùng `NUMERIC/DECIMAL` hoặc lưu số nguyên đơn vị nhỏ nhất. **Không dùng float.**
- Thời gian lưu **UTC** (`timestamptz`), convert múi giờ ở tầng hiển thị.
- Thêm index cho cột dùng trong `WHERE`, `JOIN`, `ORDER BY` thường xuyên; foreign key luôn có index.
- Thao tác ghi nhiều bảng liên quan → bọc trong **transaction**.
- Tránh N+1 query: dùng join / eager loading / batch.
- Chỉ dùng parameterized query. **Cấm** nối chuỗi SQL với input người dùng.

### Migration: an toàn & rollback
- Mỗi migration làm **một việc**, đặt tên mô tả rõ (vd `add_status_to_orders`).
- Trong plan của task có migration phải nêu: **migration làm gì, có mất dữ liệu không, rollback thế nào**.
- Ưu tiên thay đổi **an toàn, tương thích ngược** (expand → migrate → contract):
  1. Thêm cột / bảng mới (nullable hoặc có default).
  2. Cập nhật code dùng cấu trúc mới, backfill dữ liệu nếu cần.
  3. Chỉ xoá cột / bảng cũ ở migration **sau**, khi chắc chắn không còn dùng.
- Thao tác phá huỷ (`DROP`, xoá cột, đổi kiểu dữ liệu, `NOT NULL` trên bảng có dữ liệu) → **luôn hỏi trước**, và nhắc tôi **backup DB** trước khi chạy ở môi trường có dữ liệu thật.
- Nếu tool migration không tự sinh down migration, ghi rõ cách rollback thủ công trong plan hoặc trong `DECISIONS.md`.

### Logging & Observability
- Dùng logger có level (`debug`, `info`, `warn`, `error`) và **structured logging** (JSON) — vd [pino / winston]. Không dùng `console.log` ở production code.
- Mỗi request có **request ID**:
  - Lấy từ header `X-Request-Id` nếu client gửi, không có thì tự sinh (UUID).
  - Gắn vào mọi log trong vòng đời request và trả lại qua response header `X-Request-Id`.
- Log tối thiểu cho mỗi request: method, path, status, thời gian xử lý (ms), request ID, user ID (nếu đã đăng nhập).
- Lỗi `5xx` log kèm stack trace ở server; response cho client chỉ chứa `error.code`, `message` và request ID để tra cứu.
- Có endpoint health check (vd `GET /health`) kiểm tra app và kết nối DB.
- Không log password, token, cookie, header `Authorization`, hay dữ liệu cá nhân nhạy cảm.

---

## 7. Frontend Rules

- Component nhỏ, tái sử dụng được. Component > ~150 dòng → tách.
- Tách rõ: **UI component** (chỉ nhận props, hiển thị) vs **container/page** (lấy data, xử lý logic).
- Gọi API qua lớp `services/`, không `fetch` trực tiếp trong component.
- Mỗi màn hình có data phải xử lý đủ 4 trạng thái: **loading, error, empty, success**.
- Form: validate phía client (cùng schema với backend nếu được), hiển thị lỗi theo từng field, disable nút submit khi đang gửi.
- Responsive mobile-first. Dùng HTML semantic, có `alt` cho ảnh, `label` cho input.
- Không lưu token nhạy cảm vào `localStorage` nếu có thể dùng httpOnly cookie.
- Không dùng inline style trừ giá trị động; style theo [Tailwind / CSS modules].

---

## 8. Security (bắt buộc)

- **Không bao giờ** commit `.env`, secret, API key. Luôn cập nhật `.env.example` khi thêm biến môi trường mới.
- Hash password bằng `bcrypt` / `argon2`. Không tự viết crypto.
- Mọi endpoint mặc định **cần auth**, trừ khi được ghi rõ là public.
- Kiểm tra **authorization** ở service (user có quyền với resource này không?), không chỉ kiểm tra đã đăng nhập.
- Bật: CORS whitelist, helmet / security headers, rate limit cho login & endpoint nhạy cảm.
- Sanitize output để chống XSS; validate file upload (loại, kích thước).
- Không trả về field nhạy cảm (`password_hash`, token...) trong response — dùng DTO / select field rõ ràng.

---

## 9. Testing

| Loại | Phạm vi | Công cụ | Bắt buộc khi |
|---|---|---|---|
| **Unit** | Service, util, business rule | [Vitest / Jest] | Mọi business logic mới hoặc sửa |
| **Integration** | Endpoint + DB test | [Supertest] | Mọi endpoint mới: happy path + ≥ 1 case lỗi |
| **Security** | Quyền truy cập, input độc hại | [Supertest] | Endpoint có auth hoặc thao tác dữ liệu của user |
| **E2E** | Luồng người dùng trọn vẹn qua UI | [Playwright] | Các critical flow liệt kê bên dưới |

**Security test tối thiểu** cho endpoint có bảo vệ:
- Không có token → `401`.
- Có token nhưng truy cập resource của người khác (IDOR) → `403` hoặc `404`.
- Input sai / độc hại → `400`, không lộ lỗi DB.
- Endpoint có rate limit → vượt ngưỡng trả `429`.

**Critical flows cần E2E** (cập nhật theo project):
- [Đăng ký → đăng nhập → đăng xuất]
- [Tạo đơn hàng → xem chi tiết đơn]
- [Flow quan trọng nhất của app]

Sửa code ảnh hưởng tới một critical flow → chạy lại E2E của flow đó.

- Tên test mô tả hành vi: `should return 404 when order does not exist`.
- Test dùng DB riêng / mock — không chạm DB dev thật.
- **Cấm** xoá, skip, hoặc sửa assertion chỉ để test pass. Test fail → sửa code, hoặc giải thích vì sao test sai và hỏi tôi.

---

## 10. Git

- **Không tự chạy** `git commit`, `git push`, `git reset --hard`, `git rebase`, `git checkout -- .`, force push. Chỉ đề xuất lệnh, tôi tự chạy.
- **Được phép và nên chạy** các lệnh chỉ đọc: `git status`, `git diff`, `git diff --stat`, `git log --oneline -n 10`.
- Commit message theo **Conventional Commits**, tiếng Anh:
  ```
  feat(order): add cancel order endpoint
  fix(auth): handle expired refresh token
  refactor(user): extract validation schema
  docs: update API section in README
  test(order): add integration tests for create order
  chore: bump dependencies
  ```
- 1 commit = 1 thay đổi có ý nghĩa. Không gộp feature + refactor + fix vào chung.
- Branch: `feature/[ten-ngan]`, `fix/[ten-ngan]`.

---

## 11. Những điều CẤM ❌

- ❌ Tự ý cài thêm thư viện.
- ❌ Xoá / đổi tên file, folder, function đang được dùng mà không hỏi.
- ❌ Viết lại toàn bộ file khi chỉ cần sửa vài dòng.
- ❌ Sửa code ngoài phạm vi task ("tiện tay" refactor).
- ❌ Dùng `any`, `@ts-ignore`, `eslint-disable` để né lỗi.
- ❌ `catch (e) {}` rỗng, nuốt lỗi.
- ❌ Hardcode secret, URL, credentials.
- ❌ Mock data / placeholder trong code production mà không đánh dấu rõ.
- ❌ Chạy lệnh nguy hiểm: `rm -rf`, `DROP TABLE`, `prisma migrate reset`, xoá DB… khi chưa được xác nhận.
- ❌ Bịa API, method, option của thư viện. Không chắc → nói "không chắc" và đề xuất cách kiểm tra.
- ❌ Báo "đã xong" khi chưa đi qua Definition of Done và chưa review `git diff`.

---

## 12. Session Log — `docs/PROGRESS.md`

Cuối mỗi session (hoặc khi tôi gõ `/wrap`), cập nhật file theo mẫu, **mới nhất ở trên cùng**:

```markdown
## [YYYY-MM-DD] — [Tiêu đề ngắn]
**Đã làm:**
- ...
**File thay đổi:**
- `path/to/file` — mô tả ngắn
**Còn dang dở / Bug đã biết:**
- ...
**Bước tiếp theo:**
- ...
```

### `docs/DECISIONS.md` — khi nào phải ghi

**Bắt buộc** thêm một mục mới khi:
- thêm, thay thế hoặc bỏ một dependency chính (framework, ORM, auth library, UI library…);
- thay đổi DB schema theo cách không thêm đơn thuần (đổi quan hệ, đổi kiểu dữ liệu, xoá bảng/cột, soft delete vs hard delete);
- thay đổi cơ chế auth / authorization / session / token;
- thay đổi public API contract (format response, versioning, breaking change);
- chọn pattern kiến trúc khác với rule trong file này (vd bỏ repository cho một module);
- chấp nhận một trade-off có chủ đích (vd tạm bỏ test, tạm hardcode có lý do).

**Không cần** ghi cho: bug fix thông thường, thêm endpoint theo đúng pattern có sẵn, đổi UI.

Mẫu:

```markdown
## ADR-[số thứ tự]: [Tiêu đề] — [YYYY-MM-DD]
**Bối cảnh:** vấn đề / yêu cầu dẫn tới quyết định
**Quyết định:** chọn gì
**Lý do:** tại sao
**Phương án đã loại:** cái gì, vì sao không chọn
**Hệ quả:** ảnh hưởng, rủi ro, cách rollback (nếu có)
```

---

## 13. Format trả lời

- Ngắn gọn, đi thẳng vào vấn đề. Không mở đầu kiểu "Chắc chắn rồi! Đây là...".
- Khi sửa code: chỉ đưa **phần thay đổi** kèm đường dẫn file, trừ khi tôi yêu cầu toàn bộ file.
- Khi có nhiều cách làm: nêu tối đa 2–3 phương án, ưu/nhược mỗi cái, **đề xuất 1 cái** và lý do.
- Khi giải thích khái niệm: giải thích bằng tiếng Việt trước, sau đó mới nêu thuật ngữ / ví dụ tiếng Anh.
- Cuối mỗi task, ghi rõ: **cách test thủ công** (lệnh `curl` / bước trên UI).

---

## 14. Lệnh thường dùng

```bash
# Backend
cd backend
[pnpm install]
[pnpm dev]              # chạy dev server
[pnpm test]             # unit + integration test
[pnpm lint]             # lint
[pnpm build]            # build
[pnpm db:migrate]       # chạy migration
[pnpm db:seed]          # seed data

# Frontend
cd frontend
[pnpm dev]
[pnpm build]
[pnpm lint]
[pnpm test:e2e]         # E2E cho critical flows
```

Sau khi sửa code, tối thiểu chạy: **lint → type-check → test liên quan**.

---

## 15. Phím tắt cho tôi (custom commands)

Khi tôi gõ:
- `/plan [task]` → chỉ phân tích + lập kế hoạch, **không viết code**.
- `/go` → thực hiện plan vừa được duyệt.
- `/review` → chạy `git diff`, review thay đổi: bug, security, performance, naming, thiếu test, file ngoài phạm vi.
- `/done` → đi qua checklist Definition of Done (mục 4.5), báo mục nào đạt / chưa đạt / N/A.
- `/explain [file/khái niệm]` → giải thích bằng tiếng Việt, dễ hiểu, có ví dụ.
- `/fix` → phân tích lỗi gần nhất, nêu nguyên nhân gốc rồi mới sửa.
- `/wrap` → tổng kết session + cập nhật `docs/PROGRESS.md` + đề xuất commit message.

---

<!--
Có thể tách rule dài sang file riêng rồi import:
@./docs/api-conventions.md
@./docs/db-conventions.md
-->
