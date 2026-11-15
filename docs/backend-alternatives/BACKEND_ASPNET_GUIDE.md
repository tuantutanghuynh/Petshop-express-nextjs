# HƯỚNG DẪN XÂY DỰNG LẠI BACKEND DỰ ÁN PETSHOP BẰNG ASP.NET CORE (C#)
> **Dành cho dự án:** Siêu thị của chó mèo (Petshop)  
> **Tương thích:** Frontend Next.js 16 (App Router) hiện tại  
> **Công nghệ sử dụng:** .NET 8 / .NET 9 LTS, C# 12/13, ASP.NET Core Web API, Entity Framework Core (EF Core), Npgsql (PostgreSQL), JWT Bearer Authentication, BackgroundService

---

## 1. TỔNG QUAN KIẾN TRÚC & YÊU CẦU TƯƠNG THÍCH

Để Frontend Next.js kết nối mượt mà mà không phải chỉnh sửa bất kỳ dòng code nào trên giao diện, Backend ASP.NET Core cần tuân thủ 100% hợp đồng API (API Contract):

1. **Tiền tố định tuyến:** Mọi Controller đều có route prefix `/api/v1/[controller]`.
2. **Chuẩn phong bì JSON (Response Envelope):**
   ```json
   {
     "data": <object hoặc null>,
     "meta": <object phân trang hoặc null>,
     "error": null hoặc { "code": "STRING_CODE", "message": "Thông báo lỗi", "details": [] }
   }
   ```
3. **Mã trạng thái Validation:** Trả về HTTP `422 Unprocessable Entity` với error code `VALIDATION_ERROR` khi ModelState không hợp lệ.
4. **Header bắt buộc:**
   - `X-Brand-Slug`: Bắt buộc đối với `/cart`, `/orders`, `/quote-requests` (`petshop` hoặc `gomsu`).
   - `X-Internal-Secret`: Miễn trừ giới hạn Rate-limit cho các request Server-side từ Next.js.
   - `Idempotency-Key`: Khóa định danh chống đặt trùng đơn hàng.
5. **Xác thực JWT:**
   - Access Token: JWT có hạn 15 phút, claim `sub` là UserId, claim `role` là vai trò tài khoản.
   - Refresh Token: Thời hạn 7 ngày, lưu mã băm SHA-256 trong Database, hỗ trợ Rotation và Reuse Detection.
6. **Quản lý kho hàng & Sổ cái (Inventory Ledger):**
   - Trừ kho bằng câu lệnh UPDATE SQL nguyên tử có điều kiện.
   - Ghi lại biến động kho vào bảng `InventoryMovement` trong cùng Transaction.

---

## 2. CẤU TRÚC THƯ MỤC DỰ ÁN ASP.NET CORE

Cấu trúc dự án theo mô hình phân tầng chuẩn mực của ASP.NET Core Web API:

```
BackendAspNet/
├── BackendAspNet.sln
├── src/
│   ├── Common/                          # DTOs phong bì, Hằng số, Exceptions
│   │   ├── ApiResponse.cs               # Lớp phong bì { data, meta, error }
│   │   ├── ApiError.cs
│   │   ├── Constants.cs                 # OrderStatus, PaymentMethod, InventoryReason
│   │   └── Exceptions.cs
│   ├── Data/                            # Database Context & Migrations
│   │   ├── AppDbContext.cs              # EF Core DbContext, cấu hình Fluent API
│   │   └── Migrations/
│   ├── Models/                          # Entities tương ứng với Database Tables
│   │   ├── User.cs
│   │   ├── RefreshToken.cs
│   │   ├── Category.cs
│   │   ├── Product.cs
│   │   ├── ProductVariant.cs
│   │   ├── ProductImage.cs
│   │   ├── InventoryMovement.cs
│   │   ├── Cart.cs & CartItem.cs
│   │   ├── Order.cs & OrderItem.cs
│   │   └── Content.cs                   # BlogPost, GalleryItem, ContactMessage, QuoteRequest
│   ├── DTOs/                            # Data Transfer Objects cho Request/Response
│   │   ├── AuthDtos.cs
│   │   ├── ProductDtos.cs
│   │   ├── OrderDtos.cs
│   │   └── CartDtos.cs
│   ├── Middlewares/                     # Custom Middleware Pipeline
│   │   ├── ResponseEnvelopeMiddleware.cs
│   │   ├── ExceptionHandlingMiddleware.cs
│   │   └── BrandResolverMiddleware.cs
│   ├── Services/                        # Business Logic phức tạp
│   │   ├── ITokenService.cs & TokenService.cs
│   │   ├── IInventoryService.cs & InventoryService.cs
│   │   └── IOrderService.cs & OrderService.cs
│   ├── BackgroundJobs/                  # Tác vụ chạy ngầm định kỳ
│   │   └── ExpiredOrderSweeper.cs       # Quét đơn chuyển khoản quá hạn 24h
│   ├── Controllers/                     # API Controllers (/api/v1/...)
│   │   ├── AuthController.cs
│   │   ├── ProductsController.cs
│   │   ├── CategoriesController.cs
│   │   ├── CartController.cs
│   │   ├── OrdersController.cs
│   │   ├── BlogController.cs
│   │   └── ContentController.cs
│   ├── appsettings.json
│   ├── appsettings.Development.json
│   └── Program.cs                       # Khởi tạo DI, Middleware, Services
```

---

## 3. KHỞI TẠO DỰ ÁN & CÀI ĐẶT THƯ VIỆN NUGET

### 3.1. Tạo dự án:
```bash
mkdir BackendAspNet && cd BackendAspNet
dotnet new sln -n BackendAspNet
dotnet new webapi -n BackendAspNet -f net8.0
dotnet sln add BackendAspNet/BackendAspNet.csproj
cd BackendAspNet
```

### 3.2. Cài đặt các gói NuGet cần thiết:
```bash
# Entity Framework Core & PostgreSQL Driver
dotnet add package Npgsql.EntityFrameworkCore.PostgreSQL --version 8.0.4
dotnet add package Microsoft.EntityFrameworkCore.Design --version 8.0.4

# Authentication & JWT
dotnet add package Microsoft.AspNetCore.Authentication.JwtBearer --version 8.0.4
dotnet add package BCrypt.Net-Next --version 4.0.3

# Media upload (Cloudinary)
dotnet add package CloudinaryDotNet --version 1.26.2
```

---

## 4. CHUẨN HÓA DỮ LIỆU & PHONG BÌ PHẢN HỒI (COMMON)

### 4.1. File `Common/ApiResponse.cs`:
```csharp
using System.Text.Json.Serialization;

namespace BackendAspNet.Common;

public class ApiResponse<T>
{
    [JsonPropertyName("data")]
    public T? Data { get; set; }

    [JsonPropertyName("meta")]
    public object? Meta { get; set; }

    [JsonPropertyName("error")]
    public ApiErrorDetail? Error { get; set; }

    public static ApiResponse<T> Success(T data, object? meta = null) =>
        new() { Data = data, Meta = meta, Error = null };

    public static ApiResponse<T> Fail(string code, string message, object? details = null) =>
        new()
        {
            Data = default,
            Meta = null,
            Error = new ApiErrorDetail { Code = code, Message = message, Details = details ?? Array.Empty<object>() }
        };
}

public class ApiErrorDetail
{
    [JsonPropertyName("code")]
    public string Code { get; set; } = string.Empty;

    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;

    [JsonPropertyName("details")]
    public object Details { get; set; } = Array.Empty<object>();
}
```

### 4.2. Middleware Xử lý Ngoại lệ & Validation 422 (`Middlewares/ExceptionHandlingMiddleware.cs`):
```csharp
using System.Net;
using System.Text.Json;
using BackendAspNet.Common;

namespace BackendAspNet.Middlewares;

public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate _next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        this._next = _next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);

            // Bắt lỗi 401 Unauthenticated
            if (context.Response.StatusCode == (int)HttpStatusCode.Unauthorized && !context.Response.HasStarted)
            {
                context.Response.ContentType = "application/json";
                var response = ApiResponse<object>.Fail("UNAUTHENTICATED", "Access token is invalid or expired");
                await context.Response.WriteAsync(JsonSerializer.Serialize(response));
            }
            // Bắt lỗi 403 Forbidden
            else if (context.Response.StatusCode == (int)HttpStatusCode.Forbidden && !context.Response.HasStarted)
            {
                context.Response.ContentType = "application/json";
                var response = ApiResponse<object>.Fail("FORBIDDEN", "Bạn không có quyền thực hiện thao tác này");
                await context.Response.WriteAsync(JsonSerializer.Serialize(response));
            }
        }
        catch (BadHttpRequestException ex)
        {
            context.Response.StatusCode = 422;
            context.Response.ContentType = "application/json";
            var response = ApiResponse<object>.Fail("VALIDATION_ERROR", ex.Message);
            await context.Response.WriteAsync(JsonSerializer.Serialize(response));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi không xác định xảy ra");
            context.Response.StatusCode = (int)HttpStatusCode.InternalServerError;
            context.Response.ContentType = "application/json";
            var response = ApiResponse<object>.Fail("SERVER_ERROR", "Đã xảy ra lỗi nội bộ máy chủ");
            await context.Response.WriteAsync(JsonSerializer.Serialize(response));
        }
    }
}
```

### 4.3. Middleware Phân giải Thương hiệu (`Middlewares/BrandResolverMiddleware.cs`):
```csharp
using System.Text.Json;
using BackendAspNet.Common;
using BackendAspNet.Data;
using Microsoft.EntityFrameworkCore;

namespace BackendAspNet.Middlewares;

public class BrandResolverMiddleware
{
    private readonly RequestDelegate _next;

    public BrandResolverMiddleware(RequestDelegate _next) => this._next = _next;

    public async Task InvokeAsync(HttpContext context, AppDbContext db)
    {
        var path = context.Request.Path.Value ?? "";
        if (path.StartsWith("/api/v1/cart") || path.StartsWith("/api/v1/orders") || path.StartsWith("/api/v1/quote-requests"))
        {
            if (!context.Request.Headers.TryGetValue("X-Brand-Slug", out var slugValue) || string.IsNullOrWhiteSpace(slugValue))
            {
                context.Response.StatusCode = 400;
                context.Response.ContentType = "application/json";
                await context.Response.WriteAsync(JsonSerializer.Serialize(
                    ApiResponse<object>.Fail("BRAND_REQUIRED", "Thiếu header X-Brand-Slug")));
                return;
            }

            var slug = slugValue.ToString();
            var category = await db.Categories.AsNoTracking().FirstOrDefaultAsync(c => c.Slug == slug && c.ParentId == null);
            if (category == null)
            {
                context.Response.StatusCode = 404;
                context.Response.ContentType = "application/json";
                await context.Response.WriteAsync(JsonSerializer.Serialize(
                    ApiResponse<object>.Fail("BRAND_NOT_FOUND", "Không tìm thấy thương hiệu")));
                return;
            }

            var childIds = await db.Categories.AsNoTracking()
                .Where(c => c.ParentId == category.Id)
                .Select(c => c.Id)
                .ToListAsync();

            childIds.Add(category.Id);
            context.Items["BrandSlug"] = category.Slug;
            context.Items["BrandCategoryIds"] = childIds;
        }

        await _next(context);
    }
}
```

---

## 5. MÔ HÌNH DỮ LIỆU & ENTITY FRAMEWORK CORE

### 5.1. Các Entities chính (`Models/`):

#### `Models/User.cs`:
```csharp
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BackendAspNet.Models;

[Table("User")]
public class User
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required]
    public string PasswordHash { get; set; } = string.Empty;

    public string? FullName { get; set; }
    public string Role { get; set; } = "customer";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();
}
```

#### `Models/Product.cs` & `Models/ProductVariant.cs`:
```csharp
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BackendAspNet.Models;

[Table("Product")]
public class Product
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid CategoryId { get; set; }
    public Category Category { get; set; } = null!;

    [Required]
    public string Name { get; set; } = string.Empty;

    [Required]
    public string Slug { get; set; } = string.Empty;

    public string? Description { get; set; }
    public string? Brand { get; set; }
    public string Status { get; set; } = "draft";

    [Column(TypeName = "jsonb")]
    public string Attributes { get; set; } = "{}";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<ProductVariant> Variants { get; set; } = new List<ProductVariant>();
}

[Table("ProductVariant")]
public class ProductVariant
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid ProductId { get; set; }
    public Product Product { get; set; } = null!;

    [Required]
    public string Sku { get; set; } = string.Empty;

    public int Price { get; set; }
    public int? CompareAtPrice { get; set; }

    public int StockQuantity { get; set; } = 0;
    public int ReservedQuantity { get; set; } = 0;

    [Column(TypeName = "jsonb")]
    public string VariantAttributes { get; set; } = "{}";

    public string VariantKey { get; set; } = string.Empty;
    public string? ImageUrl { get; set; }
}
```

#### `Models/InventoryMovement.cs`:
```csharp
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BackendAspNet.Models;

[Table("InventoryMovement")]
public class InventoryMovement
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long Seq { get; set; }

    public Guid? VariantId { get; set; }
    public ProductVariant? Variant { get; set; }

    [Required]
    public string Sku { get; set; } = string.Empty;

    public int Delta { get; set; }
    public int QuantityAfter { get; set; }

    [Required]
    public string Reason { get; set; } = string.Empty; // OPENING, SALE, CANCEL_RESTOCK...

    public string? Note { get; set; }
    public Guid? UserId { get; set; }
    public Guid? OrderId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
```

#### `Models/Order.cs`:
```csharp
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BackendAspNet.Models;

[Table("Order")]
public class Order
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public string Code { get; set; } = string.Empty;

    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public string BrandSlug { get; set; } = string.Empty;
    public string OrderStatus { get; set; } = "PENDING_PAYMENT";
    public string PaymentMethod { get; set; } = string.Empty;
    public string PaymentStatus { get; set; } = "PENDING";

    public int Subtotal { get; set; }
    public int ShippingFee { get; set; } = 0;
    public int GrandTotal { get; set; }

    [Column(TypeName = "jsonb")]
    public string ShippingAddress { get; set; } = "{}";

    public string? Note { get; set; }
    public string? IdempotencyKey { get; set; }

    public DateTime? ExpiresAt { get; set; }
    public DateTime? PaidAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<OrderItem> Items { get; set; } = new List<OrderItem>();
}
```

### 5.2. Cấu hình DbContext & CHECK Constraints (`Data/AppDbContext.cs`):
```csharp
using BackendAspNet.Models;
using Microsoft.EntityFrameworkCore;

namespace BackendAspNet.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<ProductVariant> ProductVariants => Set<ProductVariant>();
    public DbSet<InventoryMovement> InventoryMovements => Set<InventoryMovement>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // CHECK constraints cho tồn kho
        modelBuilder.Entity<ProductVariant>(entity =>
        {
            entity.ToTable(t => t.HasCheckConstraint("CK_ProductVariant_Stock_NonNegative", "\"StockQuantity\" >= 0"));
            entity.ToTable(t => t.HasCheckConstraint("CK_ProductVariant_Reserved_NonNegative", "\"ReservedQuantity\" >= 0"));
            entity.ToTable(t => t.HasCheckConstraint("CK_ProductVariant_Reserved_Lte_Stock", "\"ReservedQuantity\" <= \"StockQuantity\""));
            entity.HasIndex(v => new { v.ProductId, v.VariantKey }).IsUnique();
        });

        // Unique & Indexes cho Order và Idempotency
        modelBuilder.Entity<Order>(entity =>
        {
            entity.HasIndex(o => new { o.UserId, o.IdempotencyKey }).IsUnique();
            entity.HasIndex(o => new { o.BrandSlug, o.OrderStatus });
            entity.HasIndex(o => new { o.UserId, o.CreatedAt });
        });

        // Composite Index cho Storefront Catalog & Blog
        modelBuilder.Entity<Product>()
            .HasIndex(p => new { p.Status, p.CreatedAt, p.Id });
    }
}
```

---

## 6. NGHIỆP VỤ KHO HÀNG NGUYÊN TỬ (ATOMIC INVENTORY SERVICE)

File `Services/InventoryService.cs` thực thi câu lệnh SQL UPDATE nguyên tử trong Transaction:

```csharp
using BackendAspNet.Data;
using BackendAspNet.Models;
using Microsoft.EntityFrameworkCore;

namespace BackendAspNet.Services;

public interface IInventoryService
{
    Task<bool> ClaimForSaleCodAsync(Guid variantId, int quantity, Guid orderId);
}

public class InventoryService : IInventoryService
{
    private readonly AppDbContext _db;

    public InventoryService(AppDbContext db) => _db = db;

    public async Task<bool> ClaimForSaleCodAsync(Guid variantId, int quantity, Guid orderId)
    {
        await using var tx = await _db.Database.BeginTransactionAsync();

        // 1. UPDATE nguyên tử có điều kiện (chỉ trừ khi còn đủ hàng tự do)
        var affected = await _db.Database.ExecuteSqlInterpolatedAsync($@"
            UPDATE ""ProductVariant""
            SET ""StockQuantity"" = ""StockQuantity"" - {quantity}
            WHERE ""Id"" = {variantId} AND (""StockQuantity"" - ""ReservedQuantity"") >= {quantity}");

        if (affected != 1)
        {
            await tx.RollbackAsync();
            return false; // Hết hàng
        }

        var variant = await _db.ProductVariants.AsNoTracking().FirstAsync(v => v.Id == variantId);

        // 2. Ghi một dòng vào sổ cái kiểm toán kho
        var movement = new InventoryMovement
        {
            VariantId = variant.Id,
            Sku = variant.Sku,
            Delta = -quantity,
            QuantityAfter = variant.StockQuantity,
            Reason = "SALE",
            OrderId = orderId,
            CreatedAt = DateTime.UtcNow
        };

        _db.InventoryMovements.Add(movement);
        await _db.SaveChangesAsync();

        await tx.CommitAsync();
        return true;
    }
}
```

---

## 7. BACKGROUND WORKER QUÉT ĐƠN QUÁ HẠN 24H

File `BackgroundJobs/ExpiredOrderSweeper.cs` định kỳ 15 phút giải phóng hàng giữ chỗ:

```csharp
using BackendAspNet.Data;
using Microsoft.EntityFrameworkCore;

namespace BackendAspNet.BackgroundJobs;

public class ExpiredOrderSweeper : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<ExpiredOrderSweeper> _logger;

    public ExpiredOrderSweeper(IServiceProvider serviceProvider, ILogger<ExpiredOrderSweeper> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(15));

        while (!stoppingToken.IsCancellationRequested && await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

                var now = DateTime.UtcNow;
                var expiredOrders = await db.Orders
                    .Where(o => o.OrderStatus == "PENDING_PAYMENT" && o.ExpiresAt < now)
                    .Include(o => o.Items)
                    .ToListAsync(stoppingToken);

                foreach (var order in expiredOrders)
                {
                    await using var tx = await db.Database.BeginTransactionAsync(stoppingToken);

                    // Conditional update để tránh 2 instance cùng huỷ 1 đơn
                    var claimed = await db.Database.ExecuteSqlInterpolatedAsync($@"
                        UPDATE ""Order""
                        SET ""OrderStatus"" = 'CANCELLED',
                            ""PaymentStatus"" = 'EXPIRED',
                            ""ExpiresAt"" = NULL,
                            ""UpdatedAt"" = NOW()
                        WHERE ""Id"" = {order.Id} AND ""OrderStatus"" = 'PENDING_PAYMENT'", stoppingToken);

                    if (claimed != 1) continue;

                    // Nhả reservedQuantity về lại cho kho
                    foreach (var item in order.Items)
                    {
                        if (item.VariantId.HasValue)
                        {
                            await db.Database.ExecuteSqlInterpolatedAsync($@"
                                UPDATE ""ProductVariant""
                                SET ""ReservedQuantity"" = ""ReservedQuantity"" - {item.Quantity}
                                WHERE ""Id"" = {item.VariantId.Value}", stoppingToken);
                        }
                    }

                    await tx.CommitAsync(stoppingToken);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Lỗi xảy ra trong quá trình quét đơn hàng hết hạn");
            }
        }
    }
}
```

---

## 8. CẤU HÌNH PIPELINE TOÀN CỤC (`Program.cs`)

File `Program.cs` thiết lập toàn bộ middleware theo đúng thứ tự bảo mật:

```csharp
using System.Text;
using BackendAspNet.BackgroundJobs;
using BackendAspNet.Data;
using BackendAspNet.Middlewares;
using BackendAspNet.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// Cấu hình Kestrel lắng nghe port 4000
builder.WebHost.ConfigureKestrel(options =>
{
    options.ListenLocalhost(4000);
});

// 1. Đăng ký Database
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

// 2. Đăng ký Services & Background Worker
builder.Services.AddScoped<IInventoryService, InventoryService>();
builder.Services.AddHostedService<ExpiredOrderSweeper>();

// 3. Cấu hình JWT Authentication
var jwtSecret = builder.Configuration["Jwt:AccessSecret"] ?? "default_very_long_secret_key_123456789";
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = false,
            ValidateAudience = false,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
            ClockSkew = TimeSpan.Zero
        };
    });

// 4. Cấu hình CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendPolicy", policy =>
    {
        policy.WithOrigins("http://localhost:3000", "http://127.0.0.1:3000")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

builder.Services.AddControllers()
    .ConfigureApiBehaviorOptions(options =>
    {
        // Tuỳ biến trả về mã 422 khi model state không hợp lệ
        options.InvalidModelStateResponseFactory = context =>
        {
            var errors = context.ModelState
                .Where(e => e.Value?.Errors.Count > 0)
                .Select(e => new { field = e.Key, error = e.Value?.Errors.First().ErrorMessage });
            
            return new Microsoft.AspNetCore.Mvc.UnprocessableEntityObjectResult(
                BackendAspNet.Common.ApiResponse<object>.Fail("VALIDATION_ERROR", "Dữ liệu không hợp lệ", errors));
        };
    });

var app = builder.Build();

// Thứ tự Middleware Pipeline:
app.UseMiddleware<ExceptionHandlingMiddleware>();
app.UseCors("FrontendPolicy");

app.UseAuthentication();
app.UseAuthorization();

app.UseMiddleware<BrandResolverMiddleware>();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapControllers();

app.Run();
```

---

## 9. QUY TRÌNH DI MIGRATION VÀ KẾT NỐI FRONTEND

1. **Cấu hình chuỗi kết nối trong `appsettings.json`:**
   ```json
   {
     "ConnectionStrings": {
       "DefaultConnection": "Host=localhost;Port=5434;Database=petshop;Username=postgres;Password=postgres"
     },
     "Jwt": {
       "AccessSecret": "your_access_token_secret_min_32_chars_long"
     }
   }
   ```

2. **Tạo và thực thi Migration:**
   ```bash
   dotnet ef migrations add InitialCreate
   dotnet ef database update
   ```

3. **Chạy server Backend ASP.NET Core:**
   ```bash
   dotnet run
   ```
   Server sẽ mở cổng tại: `http://localhost:4000`.

4. **Kiểm tra với Frontend Next.js:**
   - Chạy Frontend: `cd frontend-petshop && npm run dev`.
   - Vào trình duyệt tại `http://localhost:3000` để trải nghiệm giao diện được phục vụ trực tiếp từ Backend ASP.NET Core hiệu năng cao!
