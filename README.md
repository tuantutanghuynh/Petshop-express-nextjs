# Petshop — E-commerce & Management Platform (Express & Next.js)

Dự án nền tảng thương mại điện tử chuyên biệt cho Petshop, được xây dựng với kiến trúc Decoupled gồm **Backend REST API (Express.js / TypeScript / PostgreSQL / Prisma)** và **Frontend Storefront & Admin (Next.js / React 19 / Tailwind CSS v4)**.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend API** | Node.js, Express 5, TypeScript 5 (ES Modules) |
| **Database** | PostgreSQL 15 |
| **ORM** | Prisma 7 (`@prisma/adapter-pg`) |
| **Auth** | JWT (Access + Refresh token rotation & reuse detection), bcrypt |
| **Cloud Storage** | Cloudinary (Stream upload directly from memory buffer) |
| **Frontend** | Next.js 16 (App Router), React 19 |
| **Styling** | Tailwind CSS v4 |
| **Infrastructure** | Docker Compose (PostgreSQL 15) |

---

## 📁 Cấu trúc Thư mục

```text
├── backend/                  # REST API Express (TypeScript)
│   ├── prisma/                # Schema database & migrations
│   ├── routes/, controllers/  # HTTP layer (Auth, Products, Cart, Orders, Blog...)
│   ├── services/               # Logic nghiệp vụ (Prisma client, JWT token rotation)
│   ├── middlewares/            # Auth, Brand resolver, Rate limit, Validation
│   └── workers/                # Background worker (Release expired orders)
├── frontend-petshop/          # Next.js Storefront & Admin cho Petshop
│   ├── app/                    # Next.js App Router (Public routes & /admin)
│   ├── components/             # Reusable UI components
│   └── lib/                    # API client, Admin auth, Utils
└── project-docs/ & docs/      # Toàn bộ tài liệu kiến trúc, database & nhật ký phát triển
```

---

## 🚀 Hướng dẫn Cài đặt & Chạy Dự án

### 1. Backend API (Cổng 4000)

```bash
cd backend
npm install

# Khởi động PostgreSQL bằng Docker
docker compose up -d

# Áp dụng database schema
npx prisma migrate dev

# Khởi động server API
npm run dev
```

> **Lưu ý**: Đảm bảo tạo file `backend/.env` dựa trên `backend/.env.example` với các thông số kết nối Database và JWT secret.

### 2. Frontend Petshop (Cổng 3000)

```bash
cd frontend-petshop
npm install
npm run dev
```

Truy cập: `http://localhost:3000`

---

## 📡 API Response Envelope

Mọi phản hồi từ API đều tuân thủ cấu trúc chuẩn:

```json
// Thành công (HTTP 200/201)
{
  "data": { ... },
  "meta": null,
  "error": null
}

// Thất bại (HTTP 4xx/5xx)
{
  "data": null,
  "meta": null,
  "error": {
    "code": "ERROR_CODE",
    "message": "Chi tiết lỗi",
    "details": null
  }
}
```
