# Pseudo-Code Chi Tiết: Flow 1 - Tìm Kiếm & Lọc Danh Mục Sản Phẩm (Search & Catalog Filtering)

> **Mã luồng:** `FLOW-01`  
> **Dự án:** Petshop E-Commerce (Next.js 14 App Router + Express 5 + PostgreSQL 15 / Prisma 7)  
> **Tài liệu liên quan:** `ADR-009`, `ADR-011`, `ADR-012`, `ADR-016`, `ADR-018`  
> **Tệp mã nguồn chính:**  
> - Frontend: `frontend-petshop/app/san-pham/page.tsx`, `frontend-petshop/app/danh-muc/[slug]/page.tsx`, `frontend-petshop/app/tim-kiem/page.tsx`  
> - Backend: `backend/routes/product.route.ts`, `backend/controllers/product.controller.ts:list`, `backend/services/categoryScope.service.ts`, `backend/utils/searchText.ts`, `backend/utils/pagination.ts`

---

## Mục Lục
1. [Sơ Đồ Kiến Trúc Luồng Dữ Liệu](#1-sơ-đồ-kiến-trúc-luồng-dữ-liệu)
2. [Tầng 1: Frontend Server Component & Xử Lý URL SearchParams](#2-tầng-1-frontend-server-component--xử-lý-url-searchparams)
3. [Tầng 2: Express Route Validation & Chống DoS / Injection](#3-tầng-2-express-route-validation--chống-dos--injection)
4. [Tầng 3: Chuẩn Hóa Tiếng Việt Không Dấu & Escape LIKE](#4-tầng-3-chuẩn-hóa-tiếng-việt-không-dấu--escape-like)
5. [Tầng 4: Mở Rộng Cây Danh Mục Cha - Con (Recursive Subtree Scope)](#5-tầng-4-mở-rộng-cây-danh-mục-cha---con-recursive-subtree-scope)
6. [Tầng 5: Sắp Xếp Dựa Trên Cột Dẫn Xuất Giá Thấp Nhất (`minPrice`)](#6-tầng-5-sắp-xếp-dựa-trên-cột-dẫn-xuất-giá-thấp-nhất-minprice)
7. [Tầng 6: Phân Trang Chống Lỗi Âm (`parsePagination`)](#7-tầng-6-phân-trang-chống-lỗi-âm-parsepagination)
8. [Tầng 7: Thực Thi Truy Vấn Song Song Tại PostgreSQL](#8-tầng-7-thực-thi-truy-vấn-song-song-tại-postgresql)
9. [Toàn Bộ Luồng Tổng Hợp (End-to-End Master Pseudo-Code)](#9-toàn-bộ-luồng-tổng-hợp-end-to-end-master-pseudo-code)
10. [Chiến Lược Tối Ưu Hóa Index & Phòng Vệ Bảo Mật](#10-chiến-lược-tối-ưu-hóa-index--phòng-vệ-bảo-mật)

---

## 1. Sơ Đồ Kiến Trúc Luồng Dữ Liệu

```
[ NGƯỜI DÙNG ]
    │  Nhập "pate meo", chọn danh mục "Chó", chọn sắp xếp "Giá tăng dần", Trang 2
    ▼
[ BROWSER URL ]  ───>  /tim-kiem?q=pate+meo&danh-muc=cho&sort=price&page=2
    │
    ▼
[ NEXT.JS 14 (App Router Server Component) ]
    │  - Bóc tách & Chuẩn hóa SearchParams
    │  - Xử lý Canonical URL & Thẻ Robots (noindex, follow trên trang lọc)
    │  - Gọi API nội bộ qua fetch cached/revalidated
    ▼
[ EXPRESS 5 API - GET /api/v1/products ]
    │
    ├─► 1. VALIDATION: Kiểm tra độ dài q (2-100 ký tự), whitelist sort, max pageSize 50
    │
    ├─► 2. TÌM KIẾM KHÔNG DẤU: toSearchText("pate meo") -> "pate meo"
    │      Escape ký tự đặc biệt LIKE SQL: escapeLike() -> chống `%` và `_`
    │
    ├─► 3. CÂY DANH MỤC ĐA TẦNG: categoryScopeIds("cho")
    │      Đệ quy tìm tất cả danh mục con: ["id-cho", "id-hat-cho", "id-pate-cho", ...]
    │
    ├─► 4. SẮP XẾP GIÁ NHANH: productOrderBy("price")
    │      Dùng cột tính sẵn Product.minPrice (tránh quét JOIN bảng biến thể)
    │
    ├─► 5. PHÂN TRANG AN TOÀN: parsePagination()
    │      page = 2, take = 12, skip = 12 (chống số âm, chống ép tải DB)
    │
    ▼
[ POSTGRESQL ENGINE ]
    │  Chạy song song:
    │  - SELECT products ... WHERE ... ORDER BY minPrice ASC, id ASC LIMIT 12 OFFSET 12
    │  - SELECT COUNT(*) FROM Product WHERE ...
    ▼
[ KẾT QUẢ JSON ] ───> Render ProductGrid + Pagination + Breadcrumb
```

---

## 2. Tầng 1: Frontend Server Component & Xử Lý URL SearchParams

### Trách nhiệm:
Bóc tách query string từ URL người dùng, ngăn chặn các tham số rác, thiết lập thẻ SEO chuẩn (tránh trùng lặp nội dung duplicate content) và gọi dữ liệu.

```python
FUNCTION RenderSearchOrCategoryPage(searchParams):
    INPUT: raw_q, raw_category, raw_sort, raw_page

    # --- 1. CHUẨN HÓA THAM SỐ TỪ URL ---
    # Đề phòng client truyền mảng: "?q=a&q=b" -> lấy giá trị đầu tiên hợp lệ
    q = parseSearchQuery(raw_q)               # Cắt khoảng trắng thừa, null nếu rỗng
    categorySlug = parseCategoryParam(raw_category)
    sort = parseSortParam(raw_sort)           # Whitelist: 'price', '-price', mặc định '-createdAt'
    page = parsePageParam(raw_page)           # Số nguyên dương >= 1, mặc định 1

    NẾU (sort == INVALID) HOẶC (page == INVALID):
        TRẢ VỀ HTTP 404 (notFound)

    # --- 2. XỬ LÝ CHUYỂN HƯỚNG SEO 308 (NẾU DANH MỤC BỊ ĐỔI TÊN - ADR-017) ---
    NẾU categorySlug ĐƯỢC CHỈ ĐỊNH:
        category = DB.findCategoryBySlug(categorySlug)
        NẾU KHÔNG TÌM THẤY category:
            # Tra cứu bảng chuyển hướng lịch sử URL cũ
            currentSlug = DB.resolveCategorySlugRedirect(categorySlug)
            NẾU CÓ currentSlug:
                CHUYỂN HƯỚNG VĨNH VIỄN 308 (permanentRedirect) tới URL mới giữ nguyên params
            NGƯỢC LẠI:
                TRẢ VỀ HTTP 404

    # --- 3. BẢO VỆ CHỈ MỤC SEO (ROBOTS TAG) ---
    # Trang gốc danh mục: index, follow
    # Trang có lọc (sort, brand) hoặc từ trang 2 trở đi: noindex, follow (tránh loãng SEO)
    NẾU page > 1 HOẶC sort != DEFAULT_SORT:
        metadata.robots = { index: False, follow: True }
        metadata.canonical = URL_GỐC_KHÔNG_KÈM_FILTER

    # --- 4. GỌI API BACKEND ---
    result = API.get("/api/v1/products", {
        q: q,
        categorySlug: categorySlug,
        sort: sort,
        page: page,
        pageSize: 12
    })

    totalPages = Math.ceil(result.total / 12)
    NẾU result.total > 0 VÀ page > totalPages:
        TRẢ VỀ HTTP 404

    RENDER Giao diện:
        - Breadcrumb đường dẫn cây danh mục
        - Form tìm kiếm + Thanh bộ lọc SortLinks
        - Danh sách ProductGrid (hoặc EmptyState nếu 0 kết quả)
        - Thanh phân trang Pagination
```

---

## 3. Tầng 2: Express Route Validation & Chống DoS / Injection

### Trách nhiệm:
Kiểm tra tính hợp lệ của request trước khi chạm vào Controller; Express 5 bảo vệ `req.query` ở chế độ read-only.

```python
FUNCTION validateProductListQuery(request):
    # Ràng buộc từ khóa tìm kiếm `q`
    NẾU request.query.q TỒN TẠI:
        KIỂM TRA q phải là chuỗi (string)
        KIỂM TRA độ dài chuỗi: 2 <= length(q) <= 100
        # Nếu nhập toàn dấu cách "   " -> toSearchText(q).length < 2 -> TỪ CHỐI
        NẾU toSearchText(request.query.q).length < 2:
            TRẢ VỀ LỖI 422 ("Từ khoá tìm kiếm phải có từ 2 đến 100 ký tự")

    # Ràng buộc kiểu sắp xếp `sort` (Whitelist hoàn toàn)
    NẾU request.query.sort TỒN TẠI:
        HỢP_LỆ = ['-createdAt', 'price', '-price']
        NẾU request.query.sort KHÔNG NẰM TRONG HỢP_LỆ:
            TRẢ VỀ LỖI 422 ("Kiểu sắp xếp không hợp lệ")

    # Ràng buộc thương hiệu `brand`
    NẾU request.query.brand TỒN TẠI:
        KIỂM TRA độ dài: 1 <= length(trim(brand)) <= 100

    CHO PHÉP ĐI TIẾP VÀO CONTROLLER
```

---

## 4. Tầng 3: Chuẩn Hóa Tiếng Việt Không Dấu & Escape LIKE

### Trách nhiệm:
Khách hàng gõ tiếng Việt thường không dấu ("pate meo"), có dấu ("pate mèo"), hoặc lẫn lộn chữ hoa/thường ("PATE Meo"). Cả hai bên (từ khóa và tên sản phẩm trong DB) đều được chuyển về dạng chuẩn tắc (canonical representation) để so sánh khớp 100%.

```python
FUNCTION toSearchText(inputString):
    """
    Chuyển đổi chuỗi tiếng Việt có dấu thành chuỗi không dấu, chữ thường, chuẩn hóa khoảng trắng.
    Ví dụ: '  Pâté MÈO Đẹp   ' -> 'pate meo dep'
    """
    # 1. Tách các ký tự tổ hợp Unicode (Canonical Decomposition)
    decomposed = inputString.normalize("NFD")

    # 2. Xóa bỏ toàn bộ các dấu thanh/dấu phụ (Unicode Combining Diacritical Marks)
    withoutAccents = regexReplace(decomposed, pattern=r"\p{M}", replacement="")

    # 3. Ký tự 'đ'/'Đ' trong tiếng Việt không phải là combining mark nên phải thay thế thủ công
    withoutD = regexReplace(withoutAccents, pattern=r"[đĐ]", replacement="d")

    # 4. Chuyển toàn bộ về chữ thường
    lowercased = withoutD.toLowerCase()

    # 5. Gộp nhiều khoảng trắng liên tiếp thành 1 dấu cách đơn và cắt khoảng trắng đầu/cuối
    normalized = regexReplace(lowercased, pattern=r"\s+", replacement=" ").trim()

    TRẢ VỀ normalized


FUNCTION escapeLike(rawSearchText):
    """
    Chống lỗi SQL LIKE Wildcard Injection trong Prisma/PostgreSQL.
    Mặc định '%' khớp mọi chuỗi, '_' khớp ký tự bất kỳ. Cần thêm escape ký tự '\'.
    """
    # Thay thế '\' thành '\\', '%' thành '\%', '_' thành '\_'
    TRẢ VỀ regexReplace(rawSearchText, pattern=r"[\\%_]", replacement=r"\$0")
```

---

## 5. Tầng 4: Mở Rộng Cây Danh Mục Cha - Con (Recursive Subtree Scope)

### Trách nhiệm:
Trong thương mại điện tử, danh mục được thiết kế theo cấu trúc cây (Tree Hierarchy).
- Khi khách xem danh mục cha **"Chó"**, hệ thống **phải hiển thị toàn bộ** sản phẩm nằm trong: "Chó" $\rightarrow$ "Thức ăn cho chó" $\rightarrow$ "Hạt khô cho chó", "Pate cho chó", v.v.
- Hệ thống tải toàn bộ cây danh mục vào RAM (do cây danh mục nhỏ, chỉ vài chục node) và đệ quy tìm ID để chỉ tốn **1 lần gọi Database**.

```python
FUNCTION categoryScopeIds(categorySlug):
    # 1. Tải toàn bộ cây danh mục (chỉ lấy id, slug, parentId để siêu nhẹ)
    allCategories = DB.Category.findMany(select: ["id", "slug", "parentId"])

    # 2. Tìm danh mục mục tiêu theo slug
    targetCategory = allCategories.find(c => c.slug == categorySlug)
    NẾU KHÔNG CÓ targetCategory:
        TRẢ VỀ LỖI 404 ("CATEGORY_NOT_FOUND")

    # 3. Đệ quy thu thập ID của danh mục này và TẤT CẢ các danh mục con cháu
    FUNCTION collectSubtreeIds(categoriesList, rootId):
        collectedIds = [rootId]
        children = categoriesList.filter(c => c.parentId == rootId)
        CHO MỖI child TRONG children:
            # Gọi đệ quy cho từng nhánh con
            collectedIds = collectedIds + collectSubtreeIds(categoriesList, child.id)
        TRẢ VỀ collectedIds

    matchingCategoryIds = collectSubtreeIds(allCategories, targetCategory.id)

    TRẢ VỀ matchingCategoryIds
    # Kết quả trả về: ["id-cho", "id-thuc-an-cho", "id-pate-cho", "id-hat-cho", ...]
```

---

## 6. Tầng 5: Sắp Xếp Dựa Trên Cột Dẫn Xuất Giá Thấp Nhất (`minPrice`)

### Trách nhiệm:
Một sản phẩm có nhiều biến thể (ví dụ: Gói 500g giá 50.000đ, Gói 2kg giá 180.000đ).
- **Vấn đề hiệu năng:** Nếu mỗi lần sắp xếp theo giá đều phải chạy câu lệnh `JOIN ProductVariant` và `MIN(price)` trên toàn bộ bảng, cơ sở dữ liệu sẽ bị quá tải (N+1 và table scan).
- **Giải pháp của dự án (ADR-011):** Bảng `Product` lưu sẵn một cột tính trước `minPrice`. Mỗi khi admin thêm/sửa/xóa biến thể, hệ thống cập nhật `minPrice` trong cùng transaction. Khi khách lọc sắp xếp, chỉ cần sắp xếp trên cột `minPrice` này kèm index.

```python
FUNCTION productOrderBy(sortParam):
    """
    Sinh mệnh đề ORDER BY cho Prisma.
    Luôn luôn thêm tie-breaker là `id` để đảm bảo kết quả phân trang có tính xác định (Deterministic),
    tránh hiện tượng cùng 1 sản phẩm xuất hiện ở cả Trang 1 và Trang 2.
    """
    SWITCH (sortParam):
        CASE 'price':
            # Giá tăng dần: Sản phẩm rẻ nhất lên đầu; sản phẩm chưa có giá đẩy xuống cuối
            TRẢ VỀ [
                { minPrice: { sort: 'asc', nulls: 'last' } },
                { id: 'asc' }
            ]

        CASE '-price':
            # Giá giảm dần: Sản phẩm đắt nhất lên đầu; sản phẩm chưa có giá đẩy xuống cuối
            TRẢ VỀ [
                { minPrice: { sort: 'desc', nulls: 'last' } },
                { id: 'desc' }
            ]

        DEFAULT ('-createdAt'):
            # Mới nhất: Sản phẩm mới đăng lên đầu
            TRẢ VỀ [
                { createdAt: 'desc' },
                { id: 'desc' }
            ]
```

---

## 7. Tầng 6: Phân Trang Chống Lỗi Âm (`parsePagination`)

### Trách nhiệm:
Bảo vệ backend trước các request cố tình gửi `page=-1` hoặc `pageSize=1000000` làm tràn RAM hoặc đảo chiều truy vấn Prisma.

```python
FUNCTION parsePagination(query, defaultPageSize=12, maxPageSize=50):
    INPUT: query.page, query.pageSize

    # 1. Chuẩn hóa số trang (page)
    rawPage = Number(query.page)
    NẾU rawPage là số nguyên VÀ rawPage >= 1:
        page = rawPage
    NGƯỢC LẠI:
        page = 1 # Mặc định về trang 1

    # 2. Chuẩn hóa kích thước trang (take / limit)
    rawPageSize = Number(query.pageSize)
    NẾU rawPageSize là số nguyên VÀ rawPageSize >= 1:
        validSize = rawPageSize
    NGƯỢC LẠI:
        validSize = defaultPageSize

    # Giới hạn trần tối đa không vượt quá maxPageSize (50)
    take = Math.min(validSize, maxPageSize)

    # 3. Tính toán vị trí bỏ qua (skip / offset)
    skip = (page - 1) * take

    TRẢ VỀ { page: page, take: take, skip: skip }
```

---

## 8. Tầng 7: Thực Thi Truy Vấn Song Song Tại PostgreSQL

### Trách nhiệm:
Chạy đồng thời lệnh lấy dữ liệu trang hiện tại (`findMany`) và đếm tổng số kết quả (`count`) bằng `Promise.all` để giảm một nửa thời gian chờ (I/O latency).

```python
FUNCTION executeDatabaseQuery(whereConditions, orderConditions, skip, take):
    # Khởi chạy 2 Promise song song trong PostgreSQL connection pool
    [items, totalCount] = CHẠY_SONG_SONG (
        # LỆNH 1: Lấy danh sách sản phẩm thuộc trang hiện tại
        DB.Product.findMany({
            where: whereConditions,
            orderBy: orderConditions,
            include: {
                category: True,
                images: { orderBy: { position: 'asc' } },
                variants: { orderBy: { price: 'asc' } }
            },
            skip: skip,
            take: take
        }),

        # LỆNH 2: Đếm tổng số sản phẩm khớp bộ lọc (để vẽ thanh phân trang)
        DB.Product.count({
            where: whereConditions
        })
    )

    TRẢ VỀ { items, totalCount }
```

---

## 9. Toàn Bộ Luồng Tổng Hợp (End-to-End Master Pseudo-Code)

Đây là toàn bộ logic thực thi hoàn chỉnh bên trong controller [`product.controller.ts:list`](file:///Users/tanghuynhtuantu/Programming/Project/Petshop-express-nextjs/backend/controllers/product.controller.ts#L37):

```python
FUNCTION handlePublicProductList(request, response):
    """
    Điểm tiếp nhận HTTP GET /api/v1/products
    """
    BẮT ĐẦU:
        # BƯỚC 1: ĐỌC VÀ PHÂN TRANG THAM SỐ
        { categorySlug, q, sort, brand } = request.query
        { page, take, skip } = parsePagination(request.query, defaultPageSize=12, maxPageSize=50)

        # BƯỚC 2: KHỞI TẠO ĐIỀU KIỆN LỌC (WHERE CLAUSE)
        # Bất biến an toàn: Khách công khai CHỈ ĐƯỢC THẤY sản phẩm ACTIVE
        whereClause = {
            status: "active"
        }

        # BƯỚC 3: XỬ LÝ TÌM KIẾM THEO TỪ KHÓA KHÔNG DẤU (NẾU CÓ)
        NẾU q CÓ GIÁ TRỊ VÀ LÀ CHUỖI:
            searchNormalized = toSearchText(q)           # "Pate Mèo" -> "pate meo"
            searchEscaped = escapeLike(searchNormalized) # Chống injection ký tự % _ \
            
            # So khớp trên cột dẫn xuất searchName
            whereClause.searchName = {
                contains: searchEscaped
            }

        # BƯỚC 4: XỬ LÝ LỌC THEO THƯƠNG HIỆU (NẾU CÓ)
        NẾU brand CÓ GIÁ TRỊ VÀ LÀ CHUỖI:
            # So khớp không phân biệt chữ hoa thường (Case-insensitive)
            whereClause.brand = {
                equals: brand.trim(),
                mode: "insensitive"
            }

        # BƯỚC 5: XỬ LÝ LỌC CÂY DANH MỤC CHA - CON (NẾU CÓ)
        NẾU categorySlug CÓ GIÁ TRỊ VÀ LÀ CHUỖI:
            # Lấy toàn bộ ID của danh mục này và các danh mục con cháu của nó
            descendantCategoryIds = AWAIT categoryScopeIds(categorySlug)
            
            # Điều kiện SQL: WHERE "categoryId" IN ('id-1', 'id-2', 'id-3', ...)
            whereClause.categoryId = {
                in: descendantCategoryIds
            }

        # BƯỚC 6: XÁC ĐỊNH THỨ TỰ SẮP XẾP (ORDER BY)
        sortKey = sort NẾU HỢP LỆ NGƯỢC LẠI '-createdAt'
        orderByClause = productOrderBy(sortKey)

        # BƯỚC 7: THỰC THI TRUY VẤN SONG SONG TẠI CƠ SỞ DỮ LIỆU
        [productList, totalRecords] = CHẠY_ĐỒNG_THỜI (
            DB.Product.findMany(
                where: whereClause,
                orderBy: orderByClause,
                include: {
                    category: True,
                    images: { orderBy: { position: 'asc' } },
                    variants: { orderBy: { price: 'asc' } }
                },
                skip: skip,
                take: take
            ),
            DB.Product.count(where: whereClause)
        )

        # BƯỚC 8: TRẢ VỀ PHẢN HỒI ENVELOPE CHUẨN
        sendSuccess(response, data = productList, meta = {
            page: page,
            pageSize: take,
            total: totalRecords
        })
    KẾT THÚC
```

---

## 10. Chiến Lược Tối Ưu Hóa Index & Phòng Vệ Bảo Mật

### 10.1. Tận dụng tối đa Composite Index của PostgreSQL
Trong `backend/prisma/schema.prisma`, bảng `Product` được định nghĩa sẵn 3 index chiến lược phục vụ trực tiếp cho Flow này:

1. **`@@index([status, createdAt, id])`**:
   - Tối ưu cho chế độ xem mặc định: `WHERE status = 'active' ORDER BY createdAt DESC, id DESC`.
   - Engine chỉ cần quét index xuôi từ trên xuống (Index Scan), không cần tốn chi phí Disk Sort.
2. **`@@index([status, minPrice, id])`**:
   - Tối ưu cho chế độ lọc giá tăng/giảm: `WHERE status = 'active' ORDER BY minPrice ASC/DESC, id`.
   - Nhờ cột `minPrice` được tính toán sẵn từ trước, không cần join bảng `ProductVariant`.
3. **`@@index([categoryId])`**:
   - Tối ưu cho mệnh đề `WHERE categoryId IN (...)`.

### 10.2. Các cơ chế phòng vệ bảo mật tích hợp
* **Chống ReDoS & Buffer Exhaustion:** Giới hạn độ dài từ khóa $2 \le \text{length}(q) \le 100$. Ngăn chặn chuỗi tìm kiếm dài bất thường gây treo Event Loop của Node.js.
* **Chống SQL Wildcard Injection:** Hàm `escapeLike` ngăn kẻ tấn công gửi từ khóa `%%%%%` khiến database phải thực hiện full-table regex match.
* **Chống rò rỉ sản phẩm ẩn:** Luôn ép cứng điều kiện `{ status: 'active' }` ngay tại controller công khai, đảm bảo dù client có can thiệp query params cũng không bao giờ xem được sản phẩm nháp (`draft`) hay lưu trữ (`archived`).
* **Bảo vệ chỉ mục tìm kiếm (SEO Canonical):** Phía Next.js gán nhãn `canonical` về trang gốc và kích hoạt cờ `robots: { index: false, follow: true }` trên các trang có tham số `sort` hoặc `page > 1`, giúp Googlebot thu thập dữ liệu sản phẩm mà không làm loãng xếp hạng SEO của trang web.
