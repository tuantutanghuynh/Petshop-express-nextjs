import { describe, expect, it } from 'vitest';
import { markdownToEmailHtml, renderCampaignEmail, type CampaignEmailInput } from '../services/newsletterEmail.service';

const SITE = 'https://shop.example';
const base: CampaignEmailInput = {
  subject: 'Mẹo tẩy giun tháng 11',
  preheader: 'Lịch tẩy giun cho chó mèo theo tuổi',
  content: '## Lịch tẩy giun\n\nMèo con **2 tuần** một lần.',
  isAdvertising: true,
  cards: [],
  shop: { address: '12 Lê Lợi, Q1', phone: '0901 234 567', email: 'shop@example.com' },
  siteUrl: SITE,
  unsubscribeUrl: `${SITE}/huy-dang-ky?token=abc123`,
};

describe('markdownToEmailHtml', () => {
  it('turns Markdown into HTML with inline styles (Gmail drops <style>)', () => {
    const html = markdownToEmailHtml('## Mục\n\nĐoạn **đậm** và [link](https://x.test).', SITE);
    expect(html).toMatch(/<h2 style="[^"]+">Mục<\/h2>/);
    expect(html).toMatch(/<p style="[^"]+">Đoạn <strong>đậm<\/strong> và <a href="https:\/\/x.test" style="[^"]+">link<\/a>\.<\/p>/);
  });

  it('removes scripts, event handlers, javascript: links and inline styles written by hand', () => {
    const html = markdownToEmailHtml('<script>alert(1)</script>\n\n<p style="display:none" onclick="x()">hi</p>\n\n[x](javascript:alert(1))\n\n<iframe src="https://evil.test"></iframe>', SITE);
    expect(html).not.toMatch(/script|onclick|javascript:|iframe|display:none/i);
    expect(html).toContain('hi');
  });

  it('makes site-relative links and images absolute (mail clients have no base URL)', () => {
    const html = markdownToEmailHtml('[Pate](/danh-muc/pate)\n\n![Mèo](https://img.test/a.jpg)', SITE);
    expect(html).toContain(`href="${SITE}/danh-muc/pate"`);
    expect(html).toMatch(/<img src="https:\/\/img.test\/a.jpg" alt="Mèo" style="[^"]*max-width:100%/);
  });

  it('refuses protocol-relative and non-https images', () => {
    const html = markdownToEmailHtml('![a](http://img.test/a.jpg) ![b](//img.test/b.jpg)', SITE);
    expect(html).not.toContain('<img');
  });
});

describe('renderCampaignEmail', () => {
  it('prefixes "[QC] " when the campaign is advertising, and not otherwise', () => {
    expect(renderCampaignEmail(base).subject).toBe('[QC] Mẹo tẩy giun tháng 11');
    expect(renderCampaignEmail({ ...base, isAdvertising: false }).subject).toBe('Mẹo tẩy giun tháng 11');
  });

  it('prefixes a test send with "[Thử] " before the advertising label', () => {
    expect(renderCampaignEmail({ ...base, isTest: true }).subject).toBe('[Thử] [QC] Mẹo tẩy giun tháng 11');
  });

  it('puts the preheader in a hidden block at the top', () => {
    const { html } = renderCampaignEmail(base);
    expect(html).toMatch(/<div style="display:none[^"]*">Lịch tẩy giun cho chó mèo theo tuổi/);
    expect(html.indexOf('Lịch tẩy giun cho chó mèo theo tuổi')).toBeLessThan(html.indexOf('<h2'));
  });

  it('escapes the subject, preheader and shop details', () => {
    const { html } = renderCampaignEmail({ ...base, subject: 'Ưu đãi <b>"lớn"</b>', preheader: '<img src=x onerror=alert(1)>', shop: { address: '<script>x</script>' } });
    expect(html).not.toMatch(/<b>"lớn"|<img src=x|<script>x/);
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
  });

  it('has the unsubscribe link in the HTML and the text part, and the shop name and address', () => {
    const { html, text } = renderCampaignEmail(base);
    expect(html).toContain('href="https://shop.example/huy-dang-ky?token=abc123"');
    expect(text).toContain('https://shop.example/huy-dang-ky?token=abc123');
    for (const part of [html, text]) {
      expect(part).toContain('12 Lê Lợi, Q1');
      expect(part).toContain('0901 234 567');
    }
    expect(html).toContain('Woofle &amp; Meowcaron');
    expect(text).toContain('Woofle & Meowcaron');
  });

  it('renders featured posts and products as linked cards, prices in VND', () => {
    const { html, text } = renderCampaignEmail({
      ...base,
      cards: [
        { kind: 'post', title: 'Bao lâu tẩy giun cho mèo?', url: `${SITE}/blog/tay-giun-meo`, imageUrl: 'https://img.test/p.jpg', summary: 'Lịch theo tuổi.' },
        { kind: 'product', title: 'Pate mèo 85g', url: `${SITE}/san-pham/pate-meo`, imageUrl: null, price: 25000 },
      ],
    });
    expect(html).toContain(`href="${SITE}/blog/tay-giun-meo"`);
    expect(html).toContain('src="https://img.test/p.jpg"');
    expect(html).toMatch(/25\.000\s₫/);
    expect(text).toContain(`Pate mèo 85g`);
    expect(text).toContain(`${SITE}/san-pham/pate-meo`);
  });

  it('keeps the text part readable: links and images become "text (url)"', () => {
    const { text } = renderCampaignEmail({ ...base, content: 'Xem [bảng giá](https://x.test/gia).\n\n![Mèo con](https://img.test/a.jpg)' });
    expect(text).toContain('Xem bảng giá (https://x.test/gia).');
    expect(text).toContain('Mèo con (https://img.test/a.jpg)');
    expect(text).not.toContain('](');
  });

  it('uses the PNG logo (Gmail does not show SVG)', () => {
    expect(renderCampaignEmail(base).html).toContain(`src="${SITE}/brand/logo-icon-512.png"`);
  });
});
