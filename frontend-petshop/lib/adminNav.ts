// Admin sidebar, in the wireframe's order (design/wireframes/layout.js). `ready: false` marks a page
// still to be built (spec 2026-10-21 admin shell, waves B–D): it shows as "Sắp có" and is not a
// link, so the admin never lands on a 404. Flip it when the page ships.
export type AdminNavItem = { href: string; label: string; icon: string; ready: boolean };

export const ADMIN_NAV: AdminNavItem[] = [
  { href: '/admin', label: 'Tổng quan', icon: '◧', ready: true },
  { href: '/admin/don-hang', label: 'Đơn hàng', icon: '🧾', ready: true },
  { href: '/admin/bao-gia', label: 'Yêu cầu báo giá', icon: '☎', ready: true },
  { href: '/admin/san-pham', label: 'Sản phẩm', icon: '📦', ready: false },
  { href: '/admin/danh-muc', label: 'Danh mục & thông số', icon: '🗂', ready: true },
  { href: '/admin/posts', label: 'Bài viết', icon: '📝', ready: true },
  { href: '/admin/gallery', label: 'Thư viện ảnh', icon: '🖼', ready: true },
  { href: '/admin/lien-he', label: 'Tin nhắn liên hệ', icon: '✉', ready: true },
  { href: '/admin/cau-hinh', label: 'Cấu hình trang chủ', icon: '⚙', ready: true },
];

// /admin matches only itself; a section also owns its sub-pages (/admin/posts/new → Bài viết).
export function activeNavItem(pathname: string): AdminNavItem | undefined {
  return ADMIN_NAV.find((i) => (i.href === '/admin' ? pathname === '/admin' : pathname === i.href || pathname.startsWith(`${i.href}/`)));
}

export const isNavReady = (href: string) => ADMIN_NAV.some((i) => i.href === href && i.ready);
