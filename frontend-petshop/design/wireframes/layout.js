// Injects the shared chrome so each wireframe file only contains its own page content.
//   <body data-layout="store" data-nav="home">  → announcement bar, header, nav, footer, bottom tabs
//   <body data-layout="admin" data-nav="orders"> → admin sidebar + top bar
// Also adds a floating toolbar: back to index, and a toggle to hide the yellow API notes.
(function () {
  const body = document.body;
  const layout = body.dataset.layout;
  const nav = body.dataset.nav || '';
  const on = (key) => (key === nav ? ' class="active" aria-current="page"' : '');

  const storeHeader = `
  <div class="announce"><div class="container">
    <span>🚚 Giao hàng toàn quốc · Thanh toán khi nhận hàng (COD)</span>
    <span class="hide-mobile">🏦 Chuyển khoản: giữ hàng 24 giờ</span>
    <span class="hide-mobile">💬 Tư vấn miễn phí qua điện thoại / Zalo</span>
  </div></div>
  <header class="site-header">
    <div class="container main">
      <button class="icon-btn only-mobile" aria-label="Mở menu">☰</button>
      <a class="logo" href="home.html"><span class="paw">🐾</span><span>Siêu thị của chó mèo<small>Yêu thương từng bé cưng</small></span></a>
      <form class="search" role="search"><input type="search" placeholder="Tìm sản phẩm…" aria-label="Tìm sản phẩm"><select aria-label="Danh mục"><option>Tất cả danh mục</option></select><button aria-label="Tìm">⌕</button></form>
      <div class="header-actions">
        <button class="icon-btn only-mobile" aria-label="Tìm kiếm">⌕</button>
        <a href="account.html" class="hide-mobile"><span class="icon-btn" aria-hidden="true">👤</span><span class="lbl">Tài khoản</span></a>
        <a href="cart.html"><span class="icon-btn" aria-hidden="true">🛒<span class="count">2</span></span><span class="lbl">Giỏ hàng</span></a>
      </div>
    </div>
    <nav class="nav-row" aria-label="Điều hướng chính"><div class="container">
      <a class="cat-btn" href="category.html">☰ Danh mục sản phẩm ▾</a>
      <a href="home.html"${on('home')}>Trang chủ</a>
      <a href="category.html"${on('category')}>Sản phẩm</a>
      <a href="category.html">Cho chó</a>
      <a href="category.html">Cho mèo</a>
      <a href="blog.html"${on('blog')}>Kiến thức</a>
      <a href="gallery.html"${on('gallery')}>Thư viện ảnh</a>
      <a href="quote.html"${on('quote')}>Tư vấn báo giá</a>
      <a href="contact.html"${on('contact')}>Liên hệ</a>
      <span style="margin-left:auto;font-weight:700;color:var(--ink)">☎ Hotline</span>
    </div></nav>
  </header>`;

  const storeFooter = `
  <footer class="site-footer"><div class="container">
    <div class="newsletter">
      <div class="img sq hide-mobile" style="background:#ffffff33"><span>Ảnh cún</span></div>
      <div><h3>Gia nhập cộng đồng yêu thú cưng!</h3><p style="margin:0;opacity:.95">Nhận mẹo chăm sóc và ưu đãi mới nhất.</p></div>
      <form class="row" style="flex-wrap:nowrap"><input type="email" placeholder="Email của bạn" aria-label="Email"><button class="btn btn-yellow">Đăng ký</button></form>
    </div>
    <div class="note gap"><b>⚠ Chưa có API newsletter.</b> Ẩn khối này, hoặc đổi thành "Kết bạn Zalo / theo dõi Facebook" (link tĩnh) cho tới khi có backend.</div>
    <div class="footer-cols">
      <div style="grid-column:1/-1" class="stack"><a class="logo" href="home.html"><span class="paw">🐾</span><span>Siêu thị của chó mèo<small>Yêu thương từng bé cưng</small></span></a>
        <p class="muted">Thức ăn, pate, phụ kiện và kiến thức chăm sóc chó mèo.</p><p class="muted">📍 Địa chỉ cửa hàng · ☎ Hotline · ✉ Email</p></div>
      <div><h4>Mua sắm</h4><ul><li><a href="category.html">Cho chó</a></li><li><a href="category.html">Cho mèo</a></li><li><a href="category.html">Thức ăn &amp; pate</a></li><li><a href="category.html">Phụ kiện</a></li></ul></div>
      <div><h4>Hỗ trợ khách hàng</h4><ul><li><a href="account.html">Tài khoản của tôi</a></li><li><a href="account.html">Đơn hàng của tôi</a></li><li><a href="quote.html">Tư vấn báo giá</a></li><li><a href="contact.html">Liên hệ</a></li></ul></div>
      <div><h4>Thông tin</h4><ul><li><a href="about.html">Giới thiệu</a></li><li><a href="blog.html">Kiến thức</a></li><li><a href="policy.html">Giao hàng &amp; đổi trả</a></li><li><a href="policy.html">Chính sách bảo mật</a></li></ul></div>
      <div><h4>Thanh toán</h4><div class="row"><span class="badge b-teal">COD</span><span class="badge b-purple">Chuyển khoản</span></div></div>
    </div>
    <div class="note">Mock-up có logo Visa / Mastercard — backend chỉ có <code>COD</code> và <code>BANK_TRANSFER</code> (<code>constants/order.ts</code>), nên chỉ hiện 2 phương thức này. Thông tin liên hệ: <code>GET /api/v1/settings</code>.</div>
  </div><div class="copyright">© Siêu thị của chó mèo</div></footer>`;

  const tab = (key, href, ico, label) =>
    `<li><a href="${href}"${key === nav ? ' aria-current="page"' : ''}><span class="ico" aria-hidden="true">${ico}</span>${label}</a></li>`;
  const bottomNav = `<nav class="bottom-nav" aria-label="Điều hướng chính"><ul>
    ${tab('home', 'home.html', '🏠', 'Trang chủ')}${tab('category', 'category.html', '▦', 'Danh mục')}${tab('blog', 'blog.html', '📖', 'Kiến thức')}${tab('cart', 'cart.html', '🛒', 'Giỏ hàng')}${tab('account', 'account.html', '👤', 'Tài khoản')}
  </ul></nav>`;

  const side = (key, href, ico, label) => `<a href="${href}"${key === nav ? ' class="on"' : ''}><span aria-hidden="true">${ico}</span>${label}</a>`;
  const adminSide = `<aside class="admin-side"><div class="logo"><span class="paw">🐾</span><span>Quản trị<small>Siêu thị của chó mèo</small></span></div>
    ${side('dashboard', 'admin-dashboard.html', '◧', 'Tổng quan')}
    ${side('orders', 'admin-orders.html', '🧾', 'Đơn hàng')}
    ${side('quotes', 'admin-quotes.html', '☎', 'Yêu cầu báo giá')}
    ${side('products', 'admin-products.html', '📦', 'Sản phẩm')}
    ${side('categories', 'admin-categories.html', '🗂', 'Danh mục &amp; thông số')}
    ${side('blog', 'admin-blog.html', '📝', 'Bài viết')}
    ${side('gallery', 'admin-gallery.html', '🖼', 'Thư viện ảnh')}
    ${side('contacts', 'admin-contacts.html', '✉', 'Tin nhắn liên hệ')}
    ${side('settings', 'admin-settings.html', '⚙', 'Cấu hình trang chủ')}
  </aside>`;

  if (layout === 'store') {
    body.insertAdjacentHTML('afterbegin', storeHeader);
    body.insertAdjacentHTML('beforeend', storeFooter + bottomNav);
  } else if (layout === 'admin') {
    const main = document.querySelector('main');
    const shell = document.createElement('div');
    shell.className = 'admin';
    shell.innerHTML = adminSide + '<div><div class="admin-top"><button class="icon-btn admin-menu" aria-label="Mở menu quản trị">☰</button><strong style="color:var(--ink)">' + (document.title.split('·')[0] || '') + '</strong><span class="badge" style="margin-left:auto">admin@…</span></div></div>';
    main.classList.add('admin-main');
    shell.lastElementChild.appendChild(main);
    body.prepend(shell);
  }

  body.insertAdjacentHTML('beforeend', `<div class="wf-toolbar"><a href="../index.html">← Mục lục</a><button type="button" id="toggle-notes">Ẩn ghi chú</button></div>`);
  document.getElementById('toggle-notes').addEventListener('click', (e) => {
    body.classList.toggle('hide-notes');
    e.currentTarget.textContent = body.classList.contains('hide-notes') ? 'Hiện ghi chú' : 'Ẩn ghi chú';
  });
})();
