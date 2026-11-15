# Toàn Bộ Luồng Authentication Bằng Pseudo-Code (Dễ Đọc Hiểu)

> **Dự án:** Petshop E-Commerce (Next.js 14 App Router + Express 5 + PostgreSQL 15 / Prisma 7)  
> **Mô hình kiến trúc:** Hybrid Token (Stateless Access Token JWT + Stateful Opaque Refresh Token băm SHA-256), Next.js BFF trung gian Cookie HttpOnly, Web Locks API khử trùng lặp đa tab, Refresh Token Rotation (RTR) và Tự động phát hiện tái sử dụng (Reuse Detection).

---

## Mục Lục
1. [Mô Hình Kiến Trúc Tổng Thể](#1-mô-hình-kiến-trúc-tổng-thể)
2. [Luồng 1: Đăng Ký Tài Khoản (Register)](#luồng-1-đăng-ký-tài-khoản-register)
3. [Luồng 2: Đăng Nhập (Login)](#luồng-2-đăng-nhập-login)
4. [Luồng 3: Gửi Request Cần Xác Thực & Middleware (Access Verification)](#luồng-3-gửi-request-cần-xác-thực--middleware-access-verification)
5. [Luồng 4: Tự Động Làm Mới Token & Xoay Vòng (Silent Refresh & RTR)](#luồng-4-tự-động-làm-mới-token--xoay-vòng-silent-refresh--rtr)
   - [4.1. Phía Client: Khử trùng lặp đa tab với Web Locks API](#41-phía-client-khử-trùng-lặp-đa-tab-với-web-locks-api)
   - [4.2. Phía Next.js BFF: Kiểm tra phiên song song](#42-phía-nextjs-bff-kiểm-tra-phiên-song-song)
   - [4.3. Phía Express Backend: Xoay vòng RTR & Phát hiện tái sử dụng](#43-phía-express-backend-xoay-vòng-rtr--phát-hiện-tái-sử-dụng)
6. [Luồng 5: Đăng Xuất (Logout)](#luồng-5-đăng-xuất-logout)
7. [Luồng 6: Quên Mật Khẩu & Đặt Lại Mật Khẩu (Password Reset Flow)](#luồng-6-quên-mật-khẩu--đặt-lại-mật-khẩu-password-reset-flow)
   - [6.1. Yêu cầu link đặt lại mật khẩu (Phòng chống Timing Attack)](#61-yêu-cầu-link-đặt-lại-mật-khẩu-phòng-chống-timing-attack)
   - [6.2. Xác nhận đổi mật khẩu (Transaction nguyên tử & Hủy phiên cũ)](#62-xác-nhận-đổi-mật-khẩu-transaction-nguyên-tử--hủy-phiên-cũ)
8. [Luồng 7: Xác Thực Tùy Chọn (Optional Authentication)](#luồng-7-xác-thực-tùy-chọn-optional-authentication)

---

## 1. Mô Hình Kiến Trúc Tổng Thể

```
+-----------------------------------------------------------------------------------+
| TRÌNH DUYỆT (BROWSER CLIENT)                                                      |
| - JavaScript KHÔNG BAO GIỜ chạm trực tiếp vào Access Token & Refresh Token        |
| - Tự động đính kèm Cookie an toàn: `__Host-sc_at` (15m), `__Host-sc_rt` (7d)      |
+-----------------------------------------+-----------------------------------------+
                                          |
                      (HTTP Cookie HttpOnly, SameSite=Lax)
                                          v
+-----------------------------------------------------------------------------------+
| NEXT.JS BFF (Backend-For-Frontend) - `/api/auth/*`                                |
| - Bóc tách Cookie từ Client                                                       |
| - Chuyển tiếp tới Express Core với Header: `Authorization: Bearer <accessToken>`   |
| - Gắn Header định danh nội bộ: `X-Internal-Secret`, `X-Client-IP`, `X-Request-Id` |
+-----------------------------------------+-----------------------------------------+
                                          |
                        (HTTP Bearer Token nội bộ)
                                          v
+-----------------------------------------------------------------------------------+
| CORE API (EXPRESS 5 + POSTGRESQL / PRISMA 7)                                      |
| - Middleware `authenticate`: Giải mã & kiểm tra chữ ký JWT trong RAM (Cực nhanh)  |
| - Quản lý Refresh Token trong DB: Băm SHA-256, chỉ dùng 1 lần (Single-use)         |
+-----------------------------------------------------------------------------------+
```

---

## 2. Luồng 1: Đăng Ký Tài Khoản (Register)

### Mục tiêu:
Người dùng nhập email, mật khẩu, họ tên. Hệ thống kiểm tra trùng lặp, mã hóa mật khẩu, lưu tài khoản, cấp phát cặp token và lưu vào Cookie HttpOnly.

```python
FUNCTION handleRegister(request):
    INPUT: email, password, fullName

    # --- BƯỚC 1: CLIENT GỌI NEXT.JS BFF ---
    GỬI POST tới "/api/auth/register" với { email, password, fullName }

    # --- BƯỚC 2: NEXT.JS BFF CHUYỂN TIẾP CHO EXPRESS BACKEND ---
    BFF gửi POST tới "EXPRESS_API/auth/register" kèm Header nội bộ

    # --- BƯỚC 3: EXPRESS BACKEND XỬ LÝ DỮ LIỆU ---
    KIỂM TRA email đã tồn tại trong Database chưa:
        NẾU đã tồn tại:
            TRẢ VỀ LỖI 409 ("Email này đã được đăng ký")

    BĂM MẬT KHẨU bằng bcrypt với salt rounds = 10:
        passwordHash = bcrypt.hash(password, 10)

    TẠO USER MỚI trong Database:
        user = DB.User.create({
            email: email,
            passwordHash: passwordHash,
            fullName: fullName,
            role: "customer"
        })

    # --- BƯỚC 4: PHÁT HÀNH CẶP TOKEN LAI (HYBRID TOKENS) ---
    # 4.1. Access Token: Ký JWT ngắn hạn (15 phút), không lưu DB
    accessToken = JWT.sign(
        payload: { sub: user.id, role: user.role },
        secret: JWT_ACCESS_SECRET,
        expiresIn: "15m"
    )

    # 4.2. Refresh Token: Chuỗi ngẫu nhiên bí mật (40 bytes hex), băm SHA-256 lưu DB
    rawRefreshToken = crypto.randomBytes(40).toHex()
    tokenHash = sha256(rawRefreshToken)

    DB.RefreshToken.create({
        userId: user.id,
        tokenHash: tokenHash,
        expiresAt: NOW + 7_NGÀY,
        revokedAt: NULL
    })

    TRẢ VỀ CHO BFF: { user, accessToken, rawRefreshToken }

    # --- BƯỚC 5: BFF GẮN COOKIE VÀ TRẢ VỀ CHO TRÌNH DUYỆT ---
    BFF thiết lập 2 Cookie bảo mật cao vào HTTP Response:
        Set-Cookie: __Host-sc_at = accessToken; Max-Age = 15m; HttpOnly; Secure; SameSite=Lax
        Set-Cookie: __Host-sc_rt = rawRefreshToken; Max-Age = 7d; HttpOnly; Secure; SameSite=Lax

    BFF chỉ trả về thông tin User cho React (KHÔNG trả token):
        TRẢ VỀ HTTP 201: { data: { user: { id, email, fullName, role } } }
```

---

## 3. Luồng 2: Đăng Nhập (Login)

### Mục tiêu:
Xác minh thông tin tài khoản người dùng, chống lộ mật khẩu, cấp phiên làm việc mới.

```python
FUNCTION handleLogin(request):
    INPUT: email, password

    # --- BƯỚC 1: CLIENT GỌI NEXT.JS BFF ---
    GỬI POST tới "/api/auth/login" với { email, password }

    # --- BƯỚC 2: EXPRESS BACKEND XÁC THỰC THÔNG TIN ---
    user = DB.User.findByEmail(email)
    NẾU KHÔNG TÌM THẤY user:
        TRẢ VỀ LỖI 401 ("Email hoặc mật khẩu không đúng")  # Thông báo chung để chống dò email

    isPasswordMatch = bcrypt.compare(password, user.passwordHash)
    NẾU isPasswordMatch == FALSE:
        TRẢ VỀ LỖI 401 ("Email hoặc mật khẩu không đúng")

    # --- BƯỚC 3: CẤP TOKEN PHIÊN MỚI ---
    accessToken = JWT.sign(
        payload: { sub: user.id, role: user.role },
        secret: JWT_ACCESS_SECRET,
        expiresIn: "15m"
    )

    rawRefreshToken = crypto.randomBytes(40).toHex()
    DB.RefreshToken.create({
        userId: user.id,
        tokenHash: sha256(rawRefreshToken),
        expiresAt: NOW + 7_NGÀY,
        revokedAt: NULL
    })

    # --- BƯỚC 4: BFF LƯU COOKIE & PHẢN HỒI ---
    BFF lưu accessToken và rawRefreshToken vào Cookie HttpOnly
    TRẢ VỀ HTTP 200: { data: { user: { id, email, fullName, role } } }
```

---

## 4. Luồng 3: Gửi Request Cần Xác Thực & Middleware (Access Verification)

### Mục tiêu:
Client gửi request tới các tài nguyên được bảo vệ (ví dụ: Xem giỏ hàng, Đặt hàng, Trang Admin).

```python
FUNCTION handleAuthenticatedRequest(request):

    # =========================================================================
    # TẦNG 1: BROWSER CLIENT (bffFetch)
    # =========================================================================
    GỬI request tới Next.js BFF (Cookie tự động đính kèm theo origin)

    # =========================================================================
    # TẦNG 2: NEXT.JS BFF (Proxy Handler)
    # =========================================================================
    accessToken = đọc từ Cookie "__Host-sc_at"
    refreshToken = đọc từ Cookie "__Host-sc_rt"

    NẾU KHÔNG CÓ accessToken:
        NẾU CÓ refreshToken:
            TRẢ VỀ LỖI 401 { code: "ACCESS_EXPIRED" }  # Báo hiệu client cần refresh
        NGƯỢC LẠI:
            TRẢ VỀ LỖI 401 { code: "UNAUTHENTICATED" } # Bắt buộc đăng nhập

    CHUYỂN TIẾP request sang Express Backend kèm Header:
        Header: "Authorization: Bearer " + accessToken
        Header: "X-Client-IP: " + IP_Người_Dùng
        Header: "X-Internal-Secret: " + SECRET_NỘI_BỘ

    # =========================================================================
    # TẦNG 3: EXPRESS MIDDLEWARE (authenticate.ts)
    # =========================================================================
    FUNCTION authenticateMiddleware(req, res, next):
        header = req.headers["authorization"]
        NẾU KHÔNG CÓ header HOẶC không bắt đầu bằng "Bearer ":
            TRẢ VỀ LỖI 401 ("Missing access token")

        token = lấy phần chuỗi sau "Bearer "

        THỬ (TRY):
            # Kiểm tra chữ ký & hạn dùng hoàn toàn trong RAM (không chạm DB)
            payload = JWT.verify(token, JWT_ACCESS_SECRET)

            # Gắn danh tính người dùng vào request context
            req.user = { id: payload.sub, role: payload.role }
            GỌI next() # Cho phép đi tiếp vào Controller
        BẮT LỖI (CATCH):
            # Dù token hết hạn hay bị giả mạo đều trả cùng 1 mã lỗi để bảo mật
            TRẢ VỀ LỖI 401 ("Access token is invalid or expired")

    # =========================================================================
    # TẦNG 4: PHÂN QUYỀN VAI TRÒ (requireRole.ts - Nếu là route Admin)
    # =========================================================================
    FUNCTION requireRoleMiddleware("admin"):
        NẾU req.user.role != "admin":
            TRẢ VỀ LỖI 403 ("Không đủ quyền truy cập")
        GỌI next()
```

---

## 5. Luồng 4: Tự Động Làm Mới Token & Xoay Vòng (Silent Refresh & RTR)

> [!IMPORTANT]
> **Điểm mấu chốt của kiến trúc:** Refresh Token chỉ được dùng **1 lần duy nhất (Single-Use)**. Nếu có 2 request dùng cùng 1 token để refresh, hệ thống sẽ coi đó là **Hành vi đánh cắp phiên** và lập tức thu hồi toàn bộ phiên của người dùng. Do đó, tầng Client và BFF phải có cơ chế **khử trùng lặp (Deduplication)** tuyệt đối.

### 5.1. Phía Client: Khử trùng lặp đa tab với Web Locks API

```python
# Biến dùng chung trong 1 Tab trình duyệt
biến_toàn_cục sharedRefreshPromise = NULL

FUNCTION bffFetch(path, options):
    res = fetch(path, options)

    # NẾU Access Token đã hết hạn
    NẾU res.status == 401 VÀ res.error.code == "ACCESS_EXPIRED":
        
        # BƯỚC 1: DÙNG CHUNG 1 PROMISE CHO MỌI REQUEST ĐANG CHỜ TRONG CÙNG 1 TAB
        NẾU sharedRefreshPromise == NULL:
            sharedRefreshPromise = thực_hiện_refresh_an_toàn()
            GIẢI PHÓNG sharedRefreshPromise khi hoàn thành

        thànhCông = ĐỢI (sharedRefreshPromise)

        NẾU thànhCông == TRUE:
            # BƯỚC 2: RETRY LẠI REQUEST BAN ĐẦU VỚI TOKEN MỚI TRONG COOKIE
            TRẢ VỀ fetch(path, options)
        NGƯỢC LẠI:
            TRẢ VỀ LỖI 401 ("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại")

FUNCTION thực_hiện_refresh_an_toàn():
    # BƯỚC 3: DÙNG WEB LOCKS API ĐỂ ĐỒNG BỘ GIỮA CÁC TAB KHÁC NHAU
    NẾU trình duyệt hỗ trợ navigator.locks:
        TRẢ VỀ navigator.locks.request("bff-refresh", async () => {
            return POST tới "/api/auth/refresh"
        })
    NGƯỢC LẠI:
        TRẢ VỀ POST tới "/api/auth/refresh"
```

### 5.2. Phía Next.js BFF: Kiểm tra phiên song song

```python
FUNCTION bffHandleRefresh(request):
    # NẾU trong Cookie ĐÃ CÓ sẵn access token còn hạn
    # (Do Tab bên cạnh vừa chạy refresh thành công trước đó vài mili-giây)
    NẾU Cookie.get("__Host-sc_at") != NULL:
        # Không cần xoay vòng thêm lần nữa (tránh làm mất token vừa cấp)
        TRẢ VỀ HTTP 200: { refreshed: false }

    refreshToken = Cookie.get("__Host-sc_rt")
    NẾU KHÔNG CÓ refreshToken:
        TRẢ VỀ LỖI 401 ("UNAUTHENTICATED")

    # GỌI SANG EXPRESS CORE ĐỂ XOAY VÒNG TOKEN
    res = POST "EXPRESS_API/auth/refresh" với { refreshToken }

    NẾU res.thấtBại:
        XÓA TOÀN BỘ COOKIE (__Host-sc_at, __Host-sc_rt)
        TRẢ VỀ LỖI 401 ("UNAUTHENTICATED")

    # LƯU CẶP TOKEN MỚI VÀO COOKIE
    Cookie.set("__Host-sc_at", res.accessToken, maxAge = 15m)
    Cookie.set("__Host-sc_rt", res.refreshToken, maxAge = 7d)

    TRẢ VỀ HTTP 200: { refreshed: true }
```

### 5.3. Phía Express Backend: Xoay vòng RTR & Phát hiện tái sử dụng

```python
FUNCTION expressRotateRefreshToken(rawToken):
    tokenHash = sha256(rawToken)

    # BƯỚC 1: TÌM BẢN GHI THEO HASH
    record = DB.RefreshToken.findFirst(where: { tokenHash: tokenHash })
    NẾU KHÔNG TÌM THẤY record:
        TRẢ VỀ NULL # Token ma, không hợp lệ

    # =========================================================================
    # BƯỚC 2: PHÁT HIỆN TÁI SỬ DỤNG TRÁI PHÉP (AUTOMATIC REUSE DETECTION)
    # =========================================================================
    # NẾU TOKEN NÀY ĐÃ TỪNG BỊ THU HỒI TRƯỚC ĐÂY (revokedAt != NULL)
    # Nghĩa là: Có kẻ gian đã giữ lại 1 bản copy của token cũ để sử dụng lại!
    NẾU record.revokedAt != NULL:
        GHI LOG CẢNH BÁO: "Phát hiện tấn công Replay Attack!"
        # KÍCH HOẠT CÔNG TẮC HỦY DIỆT: Thu hồi TOÀN BỘ phiên của user này trên mọi thiết bị
        DB.RefreshToken.updateMany(
            where: { userId: record.userId, revokedAt: NULL },
            data: { revokedAt: NOW }
        )
        TRẢ VỀ NULL

    # BƯỚC 3: KIỂM TRA HẾT HẠN (TTL 7 NGÀY)
    NẾU NOW > record.expiresAt:
        TRẢ VỀ NULL

    # =========================================================================
    # BƯỚC 4: THU HỒI TOKEN CŨ BẰNG CẬP NHẬT CÓ ĐIỀU KIỆN (CHỐNG RACE CONDITION)
    # =========================================================================
    # Đảm bảo chỉ duy nhất 1 request đổi được trạng thái từ NULL -> NOW
    affectedRows = DB.RefreshToken.updateMany(
        where: { id: record.id, revokedAt: NULL },
        data: { revokedAt: NOW }
    )

    # NẾU có 2 request ập vào cùng tích tắc và request này thua cuộc:
    NẾU affectedRows.count != 1:
        # Xử lý như hành vi Replay Attack: Thu hồi toàn bộ session
        DB.RefreshToken.updateMany(
            where: { userId: record.userId, revokedAt: NULL },
            data: { revokedAt: NOW }
        )
        TRẢ VỀ NULL

    # =========================================================================
    # BƯỚC 5: CẤP PHÁT REFRESH TOKEN MỚI (XOAY VÒNG THÀNH CÔNG)
    # =========================================================================
    newRawToken = crypto.randomBytes(40).toHex()
    DB.RefreshToken.create({
        userId: record.userId,
        tokenHash: sha256(newRawToken),
        expiresAt: NOW + 7_NGÀY
    })

    TRẢ VỀ { userId: record.userId, rawToken: newRawToken }
```

---

## 6. Luồng 5: Đăng Xuất (Logout)

### Mục tiêu:
Hủy phiên làm việc ngay lập tức ở cả 2 phía: thu hồi token trong cơ sở dữ liệu và xóa sạch Cookie trên trình duyệt.

```python
FUNCTION handleLogout(request):
    # --- BƯỚC 1: CLIENT GỌI BFF ---
    GỬI POST tới "/api/auth/logout"

    # --- BƯỚC 2: BFF THÔNG BÁO CHO BACKEND THU HỒI PHIÊN ---
    refreshToken = Cookie.get("__Host-sc_rt")
    NẾU CÓ refreshToken:
        BFF gọi POST "EXPRESS_API/auth/logout" với { refreshToken }

    # --- BƯỚC 3: EXPRESS THU HỒI TOKEN TRONG CSDL ---
    FUNCTION expressRevokeToken(rawToken):
        tokenHash = sha256(rawToken)
        # Đánh dấu revokedAt cho token này (chỉ thu hồi nếu chưa bị thu hồi)
        DB.RefreshToken.updateMany(
            where: { tokenHash: tokenHash, revokedAt: NULL },
            data: { revokedAt: NOW }
        )

    # --- BƯỚC 4: BFF XÓA COOKIE TRÊN TRÌNH DUYỆT AN TOÀN ---
    # Lưu ý: Không dùng cookies().delete() vì Next.js thiếu cờ Secure,
    # thay vào đó dùng set rỗng với Max-Age = 0:
    Set-Cookie: __Host-sc_at = ""; Max-Age = 0; HttpOnly; Secure; SameSite=Lax
    Set-Cookie: __Host-sc_rt = ""; Max-Age = 0; HttpOnly; Secure; SameSite=Lax

    TRẢ VỀ HTTP 200: { data: { loggedOut: true } }
```

---

## 7. Luồng 6: Quên Mật Khẩu & Đặt Lại Mật Khẩu (Password Reset Flow)

### 7.1. Yêu cầu link đặt lại mật khẩu (Phòng chống Timing Attack)

```python
FUNCTION handleRequestPasswordReset(request):
    INPUT: email

    user = DB.User.findByEmail(email)

    # =========================================================================
    # PHÒNG CHỐNG TIMING ATTACK & DÒ TÌM EMAIL:
    # Bất kể email có tồn tại hay không, hệ thống LUÔN trả về cùng một thông báo
    # =========================================================================
    MESSAGE_CHUẨN = "Nếu email tồn tại, link reset sẽ được gửi."

    NẾU KHÔNG TÌM THẤY user:
        TRẢ VỀ HTTP 200: { message: MESSAGE_CHUẨN }

    # Xóa các token reset cũ chưa dùng của user này
    DB.PasswordResetToken.deleteMany(where: { userId: user.id })

    # Tạo token ngẫu nhiên bảo mật 32 bytes (64 hex characters)
    rawResetToken = crypto.randomBytes(32).toHex()
    resetTokenHash = sha256(rawResetToken)

    # Lưu token có thời hạn 1 giờ
    DB.PasswordResetToken.create({
        userId: user.id,
        tokenHash: resetTokenHash,
        expiresAt: NOW + 1_GIỜ
    })

    resetLink = "https://shop.vn/dat-lai-mat-khau?token=" + rawResetToken + "&email=" + email

    # Gửi email bất đồng bộ (không chờ kết quả để tránh chênh lệch thời gian phản hồi)
    CHẠY_NGẦM_KHÔNG_CHỜ:
        sendEmailResetPassword(to: email, link: resetLink)

    TRẢ VỀ HTTP 200: { message: MESSAGE_CHUẨN }
```

### 7.2. Xác nhận đổi mật khẩu (Transaction nguyên tử & Hủy phiên cũ)

```python
FUNCTION handleResetPassword(request):
    INPUT: email, token, newPassword

    user = DB.User.findByEmail(email)
    NẾU KHÔNG CÓ user:
        TRẢ VỀ LỖI 400 ("Email không hợp lệ")

    tokenHash = sha256(token)
    resetToken = DB.PasswordResetToken.findUnique(where: { tokenHash })

    NẾU KHÔNG CÓ resetToken HOẶC resetToken.userId != user.id:
        TRẢ VỀ LỖI 400 ("Token reset không hợp lệ")

    NẾU NOW > resetToken.expiresAt:
        TRẢ VỀ LỖI 400 ("Token reset đã hết hạn")

    newPasswordHash = bcrypt.hash(newPassword, 10)

    # =========================================================================
    # THỰC THI TRONG TRANSACTION NGUYÊN TỬ (PRISMA $TRANSACTION)
    # =========================================================================
    DB.transaction(async (tx) => {
        # BƯỚC 1: TIÊU DÙNG TOKEN NGAY LẬP TỨC VỚI ĐIỀU KIỆN COUNT == 1
        # Chống tình huống bấm liên tiếp nhiều lần cùng 1 link
        deleted = tx.PasswordResetToken.deleteMany(where: { id: resetToken.id })
        NẾU deleted.count != 1:
            TRẢ VỀ LỖI 400 ("Token reset không hợp lệ")

        # BƯỚC 2: CẬP NHẬT MẬT KHẨU MỚI
        tx.User.update(
            where: { id: user.id },
            data: { passwordHash: newPasswordHash }
        )

        # BƯỚC 3: HỦY TOÀN BỘ PHIÊN ĐĂNG NHẬP CŨ CỦA TÀI KHOẢN (KILL-SWITCH)
        # Phòng trường hợp tài khoản bị hacker chiếm đoạt, khi chủ sở hữu lấy lại
        # mật khẩu thì toàn bộ thiết bị khác đều bị đăng xuất ngay lập tức
        tx.RefreshToken.updateMany(
            where: { userId: user.id, revokedAt: NULL },
            data: { revokedAt: NOW }
        )
    })

    TRẢ VỀ HTTP 200: { message: "Mật khẩu đã được đặt lại thành công" }
```

---

## 8. Luồng 7: Xác Thực Tùy Chọn (Optional Authentication)

### Mục tiêu:
Dành cho các màn hình công khai như **Yêu cầu tư vấn (Quote Request)** hoặc **Form liên hệ**. Khách vãng lai vẫn gửi được bình thường, nhưng nếu khách đang đăng nhập thì tự động gán vào tài khoản để khách xem lại lịch sử trong trang cá nhân.

```python
FUNCTION optionalAuthenticateMiddleware(req, res, next):
    header = req.headers["authorization"]

    NẾU CÓ header VÀ bắt đầu bằng "Bearer ":
        token = lấy phần chuỗi sau "Bearer "
        THỬ (TRY):
            payload = JWT.verify(token, JWT_ACCESS_SECRET)
            req.user = { id: payload.sub, role: payload.role }
        BẮT LỖI (CATCH):
            # CỐ Ý NUỐT LỖI: Token hỏng hoặc hết hạn cũng KHÔNG trả về 401
            # Coi người dùng như một khách vãng lai hợp lệ
            req.user = NULL
    NGƯỢC LẠI:
        req.user = NULL

    GỌI next() # Luôn luôn cho phép đi tiếp
```

---

## Bảng Tóm Tắt Các Mã Lỗi Chuẩn Trong Hệ Thống Xác Thực

| Mã Lỗi (Code) | HTTP Status | Ý Nghĩa Kỹ Thuật | Hành Động Phía Frontend |
| :--- | :--- | :--- | :--- |
| `ACCESS_EXPIRED` | `401` | Access Token JWT trong Cookie đã hết hạn (sau 15 phút). | Kích hoạt `sharedRefresh()` gọi `/api/auth/refresh` và retry request. |
| `UNAUTHENTICATED` | `401` | Không có token hoặc Refresh Token bị từ chối/hết hạn. | Chuyển hướng người dùng về trang Đăng nhập (`/dang-nhap`). |
| `FORBIDDEN` | `403` | Người dùng đã đăng nhập nhưng không đủ quyền (Role mismatch). | Hiển thị thông báo "Không đủ quyền truy cập" (không logout). |
| `INVALID_CREDENTIALS`| `401` | Sai email hoặc mật khẩu khi đăng nhập. | Báo lỗi màu đỏ trên form đăng nhập. |
| `EMAIL_TAKEN` | `409` | Email đã có người khác đăng ký. | Yêu cầu đổi email hoặc dùng chức năng quên mật khẩu. |
| `INVALID_TOKEN` | `400` | Token reset password sai hoặc đã bị dùng rồi. | Yêu cầu người dùng yêu cầu lại link mới. |
