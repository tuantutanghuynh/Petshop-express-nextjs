# 📘 Buổi 1 — Nhật ký: Setup Express + Docker Postgres + Prisma

> Theo plan: [docs/superpowers/plans/2026-08-21-miniecom-month1-mvp.md](superpowers/plans/2026-08-21-miniecom-month1-mvp.md) — Task 1

## 1. Mục tiêu buổi học

Dựng khung tối thiểu cho backend: Express app chạy được, Postgres chạy qua Docker, Prisma
kết nối được tới Postgres đó. Chưa có model/nghiệp vụ gì — mục tiêu duy nhất là "chạy
được, kết nối được".

## 2. Kiến thức cốt lõi

### 2.1 Vì sao tách `bin/www` khỏi `app.js`?

`app.js` chỉ **định nghĩa** ứng dụng Express (routes, middleware) và `module.exports`
ra object app — nó không tự gọi `.listen()`. File `bin/www` mới thực sự khởi động HTTP
server bằng `app.listen(port)`.

Lợi ích: sau này viết test tích hợp, bạn `require('../app')` để gửi request giả lập
(qua `supertest` chẳng hạn) mà không cần mở port thật — tách "định nghĩa hành vi" khỏi
"vòng đời chạy thật". Đây đúng pattern trong dự án mẫu Coffee Shop
(`docs/01_app_and_db_setup.md` của dự án đó).

### 2.2 Vì sao Postgres chạy qua Docker Compose?

- Môi trường nhất quán, không phụ thuộc Postgres đã cài sẵn trên máy (và máy này thực
  tế **đã có sẵn Postgres khác** chiếm port mặc định — xem mục 3.1).
- Reset sạch data khi cần: `docker compose down -v` xoá luôn volume, không phải gỡ cài
  đặt gì trên hệ điều hành.
- `volumes: pgdata:` đảm bảo data KHÔNG mất khi container restart (chỉ mất khi chủ động
  `down -v`).

### 2.3 Vì sao dùng Prisma thay vì viết SQL tay?

`prisma/schema.prisma` khai báo model bằng cú pháp giống TypeScript interface → Prisma
tự sinh SQL migration (`prisma migrate dev`) + một client JS type-safe để query. Bạn vẫn
đọc được SQL thật trong `prisma/migrations/*/migration.sql`, chỉ là không phải gõ tay
`CREATE TABLE`.

### 2.4 (Kiến thức mới phát sinh) Prisma 7 — Driver Adapter là bắt buộc

Đây là điểm khác biệt lớn nhất so với hầu hết tài liệu/tutorial Prisma cũ trên mạng.
Từ Prisma 7, kiến trúc tách hẳn "engine kết nối DB" ra khỏi client core (để hỗ trợ chạy
trên edge runtime như Cloudflare Workers, Vercel Edge — nơi không có TCP socket truyền
thống). Hệ quả:

- `schema.prisma` không còn được khai báo `datasource.url` — connection URL cho **CLI**
  (migrate, studio) chuyển sang khai báo ở `prisma.config.ts`.
- `new PrismaClient()` **không có** `adapter` sẽ throw ngay khi gọi query:
  `PrismaClientInitializationError: PrismaClient was instantiated without any options.
  A driver adapter is required to connect to your database.`
- Runtime phải tự cài driver thật (`pg` cho Postgres) + gói cầu nối
  (`@prisma/adapter-pg`), rồi truyền vào constructor.

Đây là kiến thức đáng nhớ khi phỏng vấn về Prisma trong tương lai gần — nếu chỉ học
theo tài liệu cũ (pre-v7) sẽ bối rối khi thấy lỗi này lần đầu.

## 3. Sự cố gặp phải & cách xử lý (đáng học không kém phần code)

### 3.1 Port 5432 đã bị chiếm

Lỗi: `Error response from daemon: ports are not available: exposing port TCP
0.0.0.0:5432 -> 127.0.0.1:0: listen tcp 0.0.0.0:5432: bind: address already in use`.

Chẩn đoán: `docker ps -a` cho thấy máy đã có sẵn 1 container Postgres khác
(`postgres-db`, image `postgres:17`) đang map ra `5433:5432` — tức trước đó người dùng
đã né port 5432 vì có thứ khác (rất có thể Postgres.app hoặc service không hiện trong
`brew services`) chiếm sẵn port đó.

Fix: đổi port host của dự án này sang **5434** trong cả `docker-compose.yml` lẫn
`DATABASE_URL` (`.env`, `.env.example`) — không đụng tới 5432 hay 5433 đang dùng cho
project khác. Bài học: **port dev không nên hard-code 1 giá trị chung chung** khi máy
có nhiều project — luôn kiểm tra trước bằng `docker ps -a` / `lsof -iTCP:<port>`.

### 3.2 zsh không tự hiểu `#` là comment trong dòng lệnh paste

Khi paste nguyên dòng `docker compose ps          # Postgres phải đang "Up"` vào zsh
tương tác, do zsh mặc định KHÔNG bật `interactivecomments` (khác bash), toàn bộ phần sau
`#` bị truyền như tham số thật cho lệnh, gây lỗi `no such service: #`.

Bài học thao tác: khi copy lệnh có `# ghi chú` từ tài liệu, chỉ chạy phần trước dấu `#`.

### 3.3 Version lệch `prisma` CLI vs `@prisma/client`

`npm install` ban đầu ra `prisma@^6.12.0` (CLI) nhưng `@prisma/client@^7.9.1` (runtime)
— hai major khác nhau, dễ sinh lỗi khó hiểu giữa lúc `generate` (theo CLI 6.x) và lúc
import client (theo API 7.x). Fix: `npm install prisma@latest @prisma/client@latest` để
cả hai cùng về `7.9.1`. Bài học: 2 gói này luôn phải cùng version — Prisma không đảm bảo
tương thích chéo major.

### 3.4 `npm audit` báo 3 lỗ hổng "high" ở `deepmerge-ts`

Nằm trong `@prisma/config` (dependency của CLI `prisma`, dùng lúc merge config — không
nằm trong `@prisma/client` chạy ở runtime production). Khai thác cần input JSON lồng
sâu bất thường tự đưa vào config. Quyết định: **không** chạy `npm audit fix --force` vì
nó sẽ hạ `prisma` về `6.12.0`, tái tạo lại đúng lỗi 3.3. Rủi ro thực tế với dev local ≈ 0.

### 3.5 Generator mặc định của `prisma init` (Prisma 7) đổi hành vi

`prisma init` sinh sẵn `generator client { provider = "prisma-client" }` với
`output = "../generated/prisma"` — khác `require('@prisma/client')` quen thuộc, và mỗi
file import phải tự tính đường dẫn tương đối theo độ sâu thư mục (`controllers/`,
`services/`, `scripts/`... khác cấp). Quyết định: đổi lại `provider = "prisma-client-js"`
(generator "cổ điển", không set `output`) → client sinh vào `node_modules/@prisma/client`
như mọi tài liệu Prisma phổ biến vẫn dùng, `require('@prisma/client')` chạy được ở bất
kỳ file nào bất kể độ sâu thư mục — đơn giản hơn cho việc học.

## 4. Toàn bộ source code cuối buổi (đã verify chạy được)

**`backend/docker-compose.yml`**
```yaml
services:
  postgres:
    image: postgres:15
    restart: unless-stopped
    environment:
      POSTGRES_USER: miniecom
      POSTGRES_PASSWORD: miniecom
      POSTGRES_DB: miniecom
    ports:
      - "5434:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

**`backend/.env.example`**
```env
PORT=4000
DATABASE_URL="postgresql://miniecom:miniecom@localhost:5434/miniecom?schema=public"
JWT_ACCESS_SECRET=example_access_secret
JWT_REFRESH_SALT=example_refresh_salt
```
(`.env` thật giống hệt file này nhưng với secret thật — không commit.)

**`backend/config/env.js`**
```javascript
require('dotenv').config();

module.exports = {
  port: process.env.PORT || 4000,
  databaseUrl: process.env.DATABASE_URL,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtRefreshSalt: process.env.JWT_REFRESH_SALT,
};
```

**`backend/app.js`**
```javascript
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const logger = require('morgan');

const app = express();

app.use(logger('dev'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

module.exports = app;
```

**`backend/bin/www`**
```javascript
#!/usr/bin/env node
const app = require('../app');
const { port } = require('../config/env');

app.listen(port, () => {
  console.log(`Server đang chạy tại http://localhost:${port}`);
});
```

**`backend/prisma/schema.prisma`**
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}
```
(Không có `url` trong `datasource` — xem mục 2.4. Connection URL cho CLI nằm ở
`prisma.config.ts`, đã tự sinh sẵn đúng, không cần sửa.)

**`backend/package.json`** (phần liên quan)
```json
"scripts": {
  "start": "node ./bin/www",
  "dev": "nodemon ./bin/www"
},
"dependencies": {
  "@prisma/adapter-pg": "^7.9.1",
  "@prisma/client": "^7.9.1",
  "cookie-parser": "^1.4.7",
  "cors": "^2.8.6",
  "dotenv": "^17.4.2",
  "express": "^5.2.1",
  "http-errors": "^2.0.1",
  "morgan": "^1.11.0",
  "pg": "^8.x"
},
"devDependencies": {
  "nodemon": "^3.1.14",
  "prisma": "^7.9.1"
}
```

**`services/prisma.js`** — chưa tạo trong buổi 1 theo đúng phạm vi plan (Task 2 mới tạo
file này), nhưng pattern bắt buộc cho Prisma 7 đã chốt sẵn và ghi vào Global Constraints
của plan để Buổi 2 dùng ngay, không phải dò lại lỗi:
```javascript
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { databaseUrl } = require('../config/env');

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

module.exports = prisma;
```

## 5. Verify cuối buổi (đã chạy thật, có kết quả)

```bash
$ docker compose ps
NAME                 IMAGE         ... PORTS                                         STATUS
backend-postgres-1   postgres:15   ... 0.0.0.0:5434->5432/tcp, [::]:5434->5432/tcp   Up

$ curl -s http://localhost:4000/health
{"status":"ok"}

$ npx prisma validate
The schema at prisma/schema.prisma is valid 🚀

$ npx prisma migrate status
Datasource "db": PostgreSQL database "miniecom", schema "public" at "localhost:5434"
No migration found in prisma/migrations
The current database is not managed by Prisma Migrate.   ← bình thường, vì chưa có model (việc của Buổi 2)

# Test tay adapter (không nằm trong plan, chỉ để xác nhận trước khi giao Buổi 2):
$ node -e "... new PrismaPg({connectionString}) ... \$queryRaw\`SELECT 1\` ..."
OK [ { ok: 1 } ]
```

## 6. Quiz tự ôn (đối chiếu tinh thần `PROJECT_QUIZ_AND_INTERVIEW_QUESTIONS.md` của dự án mẫu)

1. `app.js` và `bin/www` khác nhau về trách nhiệm như thế nào? Nếu gộp chung 1 file thì
   mất lợi ích gì khi viết test?
2. Vì sao Docker volume (`pgdata:`) giúp data không mất khi container restart, nhưng
   `docker compose down -v` thì lại mất?
3. Prisma 7 bắt buộc driver adapter để giải quyết vấn đề gì ở môi trường edge runtime mà
   kiến trúc Prisma cũ (kết nối trực tiếp qua engine binary) không giải quyết được?
4. Vì sao `prisma` (CLI) và `@prisma/client` (runtime) luôn phải cùng version?
5. zsh và bash khác nhau thế nào về cách xử lý `#` trong dòng lệnh tương tác? Việc này
   liên quan gì đến khái niệm "interactive shell" vs "script/non-interactive shell"?

---
*Buổi tiếp theo: [Buổi 2 — Schema Prisma rút gọn & migrate](superpowers/plans/2026-08-21-miniecom-month1-mvp.md#task-2-buổi-2-schema-prisma-rút-gọn--migrate)*
