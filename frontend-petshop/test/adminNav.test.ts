import { describe, expect, it } from 'vitest';
import { ADMIN_NAV, activeNavItem, isNavReady } from '../lib/adminNav';

// Admin sidebar (wireframe layout.js): fixed order, and the current page highlighted — /admin only
// for the dashboard itself, a section also for its sub-pages (/admin/posts/new → Bài viết).
describe('admin nav', () => {
  it('lists the wireframe sections in order', () => {
    expect(ADMIN_NAV.map((i) => i.label)).toEqual([
      'Tổng quan', 'Đơn hàng', 'Yêu cầu báo giá', 'Sản phẩm', 'Danh mục & thông số', 'Bài viết', 'Thư viện ảnh', 'Tin nhắn liên hệ', 'Cấu hình trang chủ',
    ]);
  });

  it('finds the current section', () => {
    expect(activeNavItem('/admin')?.label).toBe('Tổng quan');
    expect(activeNavItem('/admin/posts/new')?.label).toBe('Bài viết');
    expect(activeNavItem('/admin/danh-muc')?.label).toBe('Danh mục & thông số');
    expect(activeNavItem('/admin/postsx')).toBeUndefined();
  });

  it('marks pages not built yet', () => {
    expect(isNavReady('/admin/bao-gia')).toBe(false);
    expect(isNavReady('/admin/don-hang')).toBe(true); // shipped in wave B
    expect(isNavReady('/admin/cau-hinh')).toBe(true);
  });
});
