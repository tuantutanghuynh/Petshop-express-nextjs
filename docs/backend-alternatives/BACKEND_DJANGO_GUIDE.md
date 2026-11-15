# HƯỚNG DẪN XÂY DỰNG LẠI BACKEND DỰ ÁN PETSHOP BẰNG DJANGO (PYTHON)
> **Dành cho dự án:** Siêu thị của chó mèo (Petshop)  
> **Tương thích:** Frontend Next.js 16 (App Router) hiện tại  
> **Công nghệ sử dụng:** Python 3.11+, Django 5+, Django REST Framework (DRF), SimpleJWT, PostgreSQL (psycopg2), APScheduler / Celery

---

## 1. TỔNG QUAN KIẾN TRÚC & YÊU CẦU TƯƠNG THÍCH

Để Frontend Next.js hiện tại hoạt động bình thường mà không cần sửa code, Backend Django phải đáp ứng 100% các tiêu chuẩn:
1. **Tiền tố API:** Tất cả endpoint nằm dưới `/api/v1/...`
2. **Chuẩn phong bì JSON (Response Envelope):**
   ```json
   {
     "data": <dữ liệu hoặc null>,
     "meta": <thông tin phân trang hoặc null>,
     "error": null hoặc { "code": "STRING_CODE", "message": "Thông báo lỗi", "details": [] }
   }
   ```
3. **Mã lỗi validation:** Trả về HTTP `422 Unprocessable Entity` khi dữ liệu đầu vào không hợp lệ (mã lỗi `VALIDATION_ERROR`).
4. **Header đặc thù:**
   - `X-Brand-Slug`: Bắt buộc cho Cart, Orders, Quote-requests (`petshop` hoặc `gomsu`).
   - `X-Internal-Secret`: Bỏ qua Rate limit cho các request Server-side từ Next.js.
   - `Idempotency-Key`: Khóa chống tạo trùng đơn hàng khi checkout.
5. **Cơ chế xác thực (Auth):**
   - Access Token: JWT có thời hạn 15 phút (`sub` là `user_id`, `role`).
   - Refresh Token: Thời hạn 7 ngày, lưu mã băm SHA-256 trong Database, hỗ trợ xoay vòng (Rotation) và phát hiện dùng lại token bị đánh cắp (Reuse Detection).
6. **Nghiệp vụ kho hàng (Sổ cái Inventory Ledger):** Trừ kho vật lý bằng câu lệnh SQL nguyên tử (Atomic update), ghi nhận lịch sử vào bảng `InventoryMovement`.

---

## 2. CẤU TRÚC THƯ MỤC DỰ ÁN DJANGO

Dự án nên được tổ chức theo mô hình App chuẩn của Django:

```
backend-django/
├── manage.py
├── requirements.txt
├── .env
├── config/                          # Project configuration
│   ├── __init__.py
│   ├── settings.py                  # Cấu hình DB, JWT, CORS, Apps
│   ├── urls.py                      # Root URL mapping (/api/v1/...)
│   ├── wsgi.py
│   └── asgi.py
├── apps/                            # Gom toàn bộ apps nghiệp vụ
│   ├── __init__.py
│   ├── core/                        # Tiện ích chung, middleware, envelope
│   │   ├── middleware.py            # Response envelope & Brand resolution
│   │   ├── exceptions.py            # Custom exception handler (422, 401, 409)
│   │   ├── pagination.py            # Chuẩn phân trang có meta
│   │   ├── ratelimit.py             # Rate limit kiểm tra X-Internal-Secret
│   │   └── permissions.py           # Phân quyền Admin / Customer
│   ├── accounts/                    # Quản lý User, JWT & Refresh Token Rotation
│   │   ├── models.py
│   │   ├── serializers.py
│   │   ├── views.py
│   │   └── urls.py
│   ├── catalog/                     # Danh mục, Sản phẩm, Biến thể, Thuộc tính
│   │   ├── models.py
│   │   ├── serializers.py
│   │   ├── views.py
│   │   └── urls.py
│   ├── inventory/                   # Sổ cái kho hàng (InventoryMovement)
│   │   ├── models.py
│   │   ├── services.py              # Logic trừ kho nguyên tử & kiểm toán
│   │   └── views.py
│   ├── cart/                        # Giỏ hàng & CartItem
│   │   ├── models.py
│   │   ├── serializers.py
│   │   ├── views.py
│   │   └── urls.py
│   ├── orders/                      # Đơn hàng, OrderItem, Checkout COD/Chuyển khoản
│   │   ├── models.py
│   │   ├── services.py              # Xử lý State Machine & Idempotency
│   │   ├── views.py
│   │   └── urls.py
│   ├── content/                     # Blog, Gallery, Contact, QuoteRequest, Settings
│   │   ├── models.py
│   │   ├── serializers.py
│   │   ├── views.py
│   │   └── urls.py
│   └── workers/                     # Background tasks
│       ├── __init__.py
│       └── expired_orders.py        # Quét đơn chuyển khoản quá hạn 24h
```

---

## 3. THIẾT LẬP MÔI TRƯỜNG & DEPENDENCIES

### File `requirements.txt`:
```txt
django>=5.1,<6.0
djangorestframework>=3.15.0
djangorestframework-simplejwt>=5.3.1
django-cors-headers>=4.4.0
psycopg2-binary>=2.9.9
django-environ>=0.11.2
cloudinary>=1.41.0
django-apscheduler>=0.6.2
bcrypt>=4.2.0
```

### Cài đặt:
```bash
python -m venv venv
source venv/bin/activate  # Trên Windows: venv\Scripts\activate
pip install -r requirements.txt
```

---

## 4. CẤU HÌNH HỆ THỐNG (`config/settings.py`)

Cấu hình các thành phần trọng yếu:
```python
import os
from pathlib import Path
from datetime import timedelta
import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(
    DEBUG=(bool, False),
    PORT=(int, 4000)
)
environ.Env.read_env(os.path.join(BASE_DIR, '.env'))

SECRET_KEY = env('SECRET_KEY', default='django-insecure-petshop-key')
DEBUG = env('DEBUG')
INTERNAL_API_SECRET = env('INTERNAL_API_SECRET', default=None)

ALLOWED_HOSTS = ['*']

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # 3rd Party
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'django_apscheduler',

    # Local Apps
    'apps.core',
    'apps.accounts',
    'apps.catalog',
    'apps.inventory',
    'apps.cart',
    'apps.orders',
    'apps.content',
]

AUTH_USER_MODEL = 'accounts.User'

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',  # Phải nằm trên cùng
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    
    # Custom Middlewares
    'apps.core.middleware.BrandResolverMiddleware',
    'apps.core.middleware.ResponseEnvelopeMiddleware',
]

# Database kết nối PostgreSQL cổng 5434 của Docker hiện tại
DATABASES = {
    'default': env.db('DATABASE_URL', default='postgresql://postgres:postgres@localhost:5434/petshop')
}

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'EXCEPTION_HANDLER': 'apps.core.exceptions.custom_exception_handler',
    'DEFAULT_PAGINATION_CLASS': 'apps.core.pagination.StandardPagination',
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=15),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'SIGNING_KEY': env('JWT_ACCESS_SECRET', default='secret-key'),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'sub',
}

CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
    'x-brand-slug',
    'x-internal-secret',
    'idempotency-key',
]
```

---

## 5. XÂY DỰNG TẦNG CORE: RESPONSE ENVELOPE & EXCEPTIONS

### 5.1. Chuẩn hóa Exception Handler (`apps/core/exceptions.py`):
Bảo đảm mọi lỗi validation của Django/DRF đều biến thành format `{ data: null, meta: null, error: { code: 'VALIDATION_ERROR', message, details } }` với status code **422**:

```python
from rest_framework.views import exception_handler
from rest_framework.exceptions import ValidationError, AuthenticationFailed, NotAuthenticated, PermissionDenied
from rest_framework.response import Response
from rest_framework import status

def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is not None:
        error_code = "SERVER_ERROR"
        message = "Đã có lỗi xảy ra"
        details = []

        if isinstance(exc, ValidationError):
            response.status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
            error_code = "VALIDATION_ERROR"
            message = "Dữ liệu không hợp lệ"
            details = response.data
        elif isinstance(exc, (NotAuthenticated, AuthenticationFailed)):
            response.status_code = status.HTTP_401_UNAUTHORIZED
            error_code = "UNAUTHENTICATED"
            message = "Access token is invalid or expired"
        elif isinstance(exc, PermissionDenied):
            response.status_code = status.HTTP_403_FORBIDDEN
            error_code = "FORBIDDEN"
            message = "Bạn không có quyền thực hiện thao tác này"
        else:
            if hasattr(exc, 'default_code'):
                error_code = str(exc.default_code).upper()
            if isinstance(response.data, dict) and 'detail' in response.data:
                message = str(response.data['detail'])

        response.data = {
            "data": None,
            "meta": None,
            "error": {
                "code": error_code,
                "message": message,
                "details": details
            }
        }

    return response
```

### 5.2. Chuẩn hóa Response Envelope Middleware (`apps/core/middleware.py`):
Tự động đóng gói response thành công vào envelope `{ data: ..., meta: ..., error: null }`:

```python
import json
from django.utils.deprecation import MiddlewareMixin

class ResponseEnvelopeMiddleware(MiddlewareMixin):
    def process_response(self, request, response):
        if not request.path.startswith('/api/v1/'):
            return response

        # Nếu là JSON response và là mã 2xx
        if 200 <= response.status_code < 300 and response.get('Content-Type', '').startswith('application/json'):
            try:
                content = json.loads(response.content)
                # Nếu chưa được bọc envelope
                if not (isinstance(content, dict) and 'data' in content and 'error' in content):
                    meta = None
                    data = content
                    if isinstance(content, dict) and 'results' in content:
                        data = content['results']
                        meta = {
                            "page": content.get('page', 1),
                            "pageSize": content.get('pageSize', len(data)),
                            "total": content.get('total', len(data))
                        }
                    
                    envelope = {
                        "data": data,
                        "meta": meta,
                        "error": None
                    }
                    response.content = json.dumps(envelope)
            except Exception:
                pass

        return response
```

### 5.3. Phân giải thương hiệu (`apps/core/middleware.py`):
```python
from django.http import JsonResponse
from apps.catalog.models import Category

class BrandResolverMiddleware(MiddlewareMixin):
    def process_request(self, request):
        if any(request.path.startswith(p) for p in ['/api/v1/cart', '/api/v1/orders', '/api/v1/quote-requests']):
            slug = request.headers.get('X-Brand-Slug')
            if not slug:
                return JsonResponse({
                    "data": None,
                    "meta": None,
                    "error": {
                        "code": "BRAND_REQUIRED",
                        "message": "Thiếu header X-Brand-Slug",
                        "details": []
                    }
                }, status=400)

            try:
                brand = Category.objects.get(slug=slug, parent__isnull=True)
                children_ids = list(brand.children.values_list('id', flat=True))
                request.brand_slug = brand.slug
                request.category_ids = [str(brand.id)] + [str(cid) for cid in children_ids]
            except Category.DoesNotExist:
                return JsonResponse({
                    "data": None,
                    "meta": None,
                    "error": {
                        "code": "BRAND_NOT_FOUND",
                        "message": "Không tìm thấy thương hiệu",
                        "details": []
                    }
                }, status=404)
        return None
```

---

## 6. MÔ HÌNH DỮ LIỆU CHÍNH (MODELS)

Ánh xạ từ `schema.prisma` sang Django ORM:

### 6.1. Tài khoản & Token (`apps/accounts/models.py`):
```python
import uuid
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin

class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email là bắt buộc')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('role', 'admin')
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        return self.create_user(email, password, **extra_fields)

class User(AbstractBaseUser, PermissionsMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=255, null=True, blank=True)
    role = models.CharField(max_length=20, default='customer')
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = UserManager()
    USERNAME_FIELD = 'email'

class RefreshTokenRecord(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='refresh_tokens')
    token_hash = models.CharField(max_length=64, db_index=True)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
```

### 6.2. Catalog Sản phẩm (`apps/catalog/models.py`):
```python
import uuid
from django.db import models

class Category(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL, related_name='children')
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)
    description = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

class Product(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='products')
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)
    description = models.TextField(null=True, blank=True)
    brand = models.CharField(max_length=100, null=True, blank=True)
    status = models.CharField(max_length=20, default='draft')
    attributes = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['status', 'created_at', 'id']),
        ]

class ProductVariant(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='variants')
    sku = models.CharField(max_length=100, unique=True)
    price = models.IntegerField()
    compare_at_price = models.IntegerField(null=True, blank=True)
    stock_quantity = models.IntegerField(default=0)
    reserved_quantity = models.IntegerField(default=0)
    variant_attributes = models.JSONField(default=dict)
    variant_key = models.CharField(max_length=255)
    image_url = models.URLField(max_length=500, null=True, blank=True)

    class Meta:
        unique_together = ('product', 'variant_key')
        constraints = [
            models.CheckConstraint(check=models.Q(stock_quantity__gte=0), name='stock_quantity_non_negative'),
            models.CheckConstraint(check=models.Q(reserved_quantity__gte=0), name='reserved_quantity_non_negative'),
            models.CheckConstraint(check=models.Q(reserved_quantity__lte=models.F('stock_quantity')), name='reserved_lte_stock'),
        ]
```

### 6.3. Sổ cái kho hàng (`apps/inventory/models.py`):
```python
import uuid
from django.db import models
from apps.catalog.models import ProductVariant
from apps.accounts.models import User

class InventoryMovement(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    seq = models.BigAutoField(unique=True)
    variant = models.ForeignKey(ProductVariant, null=True, on_delete=models.SET_NULL, related_name='movements')
    sku = models.CharField(max_length=100)
    delta = models.IntegerField()
    quantity_after = models.IntegerField()
    reason = models.CharField(max_length=50)  # OPENING, SALE, CANCEL_RESTOCK, PURCHASE, etc.
    note = models.TextField(null=True, blank=True)
    user = models.ForeignKey(User, null=True, on_delete=models.SET_NULL)
    order_id = models.CharField(max_length=100, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
```

### 6.4. Đơn hàng (`apps/orders/models.py`):
```python
import uuid
from django.db import models
from apps.accounts.models import User
from apps.catalog.models import ProductVariant

class Order(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=50, unique=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='orders')
    brand_slug = models.CharField(max_length=100)
    order_status = models.CharField(max_length=30, default='PENDING_PAYMENT')
    payment_method = models.CharField(max_length=30)  # COD, BANK_TRANSFER
    payment_status = models.CharField(max_length=30, default='PENDING')
    
    subtotal = models.IntegerField()
    shipping_fee = models.IntegerField(default=0)
    grand_total = models.IntegerField()
    shipping_address = models.JSONField()
    note = models.TextField(null=True, blank=True)
    idempotency_key = models.CharField(max_length=255, null=True, blank=True)

    expires_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('user', 'idempotency_key')
        indexes = [
            models.Index(fields=['user', 'created_at']),
            models.Index(fields=['brand_slug', 'order_status']),
        ]
```

---

## 7. NGHIỆP VỤ CỐT LÕI: TRỪ KHO NGUYÊN TỬ & CHECKOUT

Để tránh lỗi bán vượt tồn kho (race condition), sử dụng `F()` expressions và transaction trong Django (`apps/inventory/services.py`):

```python
from django.db import transaction
from django.db.models import F
from apps.catalog.models import ProductVariant
from apps.inventory.models import InventoryMovement

def claim_for_sale_cod(variant_id: str, quantity: int, order_id: str) -> bool:
    """
    Trừ kho COD nguyên tử: chỉ trừ khi (stock_quantity - reserved_quantity) >= quantity
    """
    with transaction.atomic():
        # Câu lệnh SQL UPDATE nguyên tử có điều kiện
        updated_rows = ProductVariant.objects.filter(
            id=variant_id,
            stock_quantity__gte=F('reserved_quantity') + quantity
        ).update(stock_quantity=F('stock_quantity') - quantity)

        if updated_rows != 1:
            return False  # Hết hàng

        variant = ProductVariant.objects.get(id=variant_id)
        
        # Ghi sổ cái InventoryMovement ngay trong cùng transaction
        InventoryMovement.objects.create(
            variant=variant,
            sku=variant.sku,
            delta=-quantity,
            quantity_after=variant.stock_quantity,
            reason="SALE",
            order_id=order_id
        )
        return True
```

---

## 8. BACKGROUND TASK QUÉT ĐƠN QUÁ HẠN 24H (`apps/workers/expired_orders.py`)

Sử dụng thư viện `django-apscheduler` để chạy sweeper mỗi 15 phút:

```python
from datetime import datetime, timezone
from django.db import transaction
from django.db.models import F
from apps.orders.models import Order
from apps.catalog.models import ProductVariant
from apscheduler.schedulers.background import BackgroundScheduler

def release_expired_orders():
    now = datetime.now(timezone.utc)
    expired_orders = Order.objects.filter(
        order_status='PENDING_PAYMENT',
        expires_at__lt=now
    ).prefetch_related('items')

    for order in expired_orders:
        with transaction.atomic():
            # Conditional update: chỉ huỷ nếu trạng thái vẫn còn là PENDING_PAYMENT
            claimed = Order.objects.filter(
                id=order.id,
                order_status='PENDING_PAYMENT'
            ).update(
                order_status='CANCELLED',
                payment_status='EXPIRED',
                expires_at=None
            )

            if claimed != 1:
                continue

            # Hoàn trả reserved_quantity
            for item in order.items.all():
                if item.variant_id:
                    ProductVariant.objects.filter(id=item.variant_id).update(
                        reserved_quantity=F('reserved_quantity') - item.quantity
                    )

def start_sweeper():
    scheduler = BackgroundScheduler()
    scheduler.add_job(release_expired_orders, 'interval', minutes=15, id='order_sweeper', replace_existing=True)
    scheduler.start()
```

Kích hoạt trong `apps/core/apps.py`:
```python
from django.apps import AppConfig

class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.core'

    def ready(self):
        import os
        if os.environ.get('RUN_MAIN'):  # Tránh chạy 2 lần khi dev server reload
            from apps.workers.expired_orders import start_sweeper
            start_sweeper()
```

---

## 9. QUY TRÌNH DI MIGRATION VÀ CHẠY THỬ NGHIỆM

1. **Tạo migrations và cập nhật database:**
   ```bash
   python manage.py makemigrations accounts catalog inventory cart orders content
   python manage.py migrate
   ```

2. **Tạo tài khoản Admin đầu tiên:**
   ```bash
   python manage.py createsuperuser
   ```

3. **Chạy server trên cổng 4000 (để khớp với biến môi trường của Frontend):**
   ```bash
   python manage.py runserver 4000
   ```

4. **Kiểm tra kết nối với Frontend Next.js:**
   - Mở terminal frontend: `cd frontend-petshop && npm run dev`.
   - Mở trình duyệt `http://localhost:3000`, click xem trang chủ, blog, danh mục sản phẩm. Toàn bộ request sẽ đi qua Django Backend mượt mà!
