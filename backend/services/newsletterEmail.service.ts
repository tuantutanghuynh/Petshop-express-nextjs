import { marked } from 'marked';
import sanitize from 'sanitize-html';
import { ADVERTISING_PREFIX, TEST_SEND_PREFIX } from '../constants/newsletter';
import { SHOP_NAME, escapeHtml } from './email.service';

// The HTML and text of one campaign email (spec 2026-11-10, ADR-025). Pure functions: the sending
// service gathers the data, this only builds the message.
//
// Mail clients are not browsers: Gmail strips <style>, nothing resolves relative URLs, and SVG is
// not shown. So every tag gets its style inline, links and images are made absolute, the layout is
// tables 600px wide, and the logo is the PNG. Content goes through the same allow-list as the
// storefront (frontend-petshop/lib/sanitize.ts) — anything the admin typed as raw HTML, inline
// styles included, is dropped or replaced.

export type CampaignCard = { kind: 'post' | 'product'; title: string; url: string; imageUrl: string | null; summary?: string | null; price?: number | null };
export type ShopContact = { address?: string; phone?: string; email?: string };
export type CampaignEmailInput = {
  subject: string;
  preheader?: string | null;
  content: string;
  isAdvertising: boolean;
  cards: CampaignCard[];
  shop: ShopContact;
  siteUrl: string;
  unsubscribeUrl: string;
  isTest?: boolean;
};

const FONT = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK = '#0B1B2B';
const MUTED = '#4A5563';
const LINK = '#087878'; // brand teal ink, 5.29:1 on white
const LINE = '#D8EBEB';
const BACKGROUND = '#F6F6F6';

const STYLES: Record<string, string> = {
  p: `margin:0 0 16px;font-size:16px;line-height:1.6;color:${INK}`,
  h2: `margin:24px 0 8px;font-size:22px;line-height:1.3;font-weight:800;color:${INK}`,
  h3: `margin:20px 0 8px;font-size:18px;line-height:1.3;font-weight:700;color:${INK}`,
  h4: `margin:16px 0 8px;font-size:16px;line-height:1.3;font-weight:700;color:${INK}`,
  ul: `margin:0 0 16px;padding-left:24px;font-size:16px;line-height:1.6;color:${INK}`,
  ol: `margin:0 0 16px;padding-left:24px;font-size:16px;line-height:1.6;color:${INK}`,
  li: 'margin:0 0 4px',
  blockquote: `margin:0 0 16px;padding:4px 0 4px 12px;border-left:4px solid ${LINE};color:${MUTED}`,
  a: `color:${LINK};text-decoration:underline`,
  img: 'display:block;max-width:100%;height:auto;border:0;border-radius:12px;margin:0 0 16px',
  hr: `border:0;border-top:1px solid ${LINE};margin:24px 0`,
  table: `border-collapse:collapse;width:100%;margin:0 0 16px;font-size:15px;color:${INK}`,
  th: `border:1px solid ${LINE};padding:6px 8px;text-align:left;background:${BACKGROUND}`,
  td: `border:1px solid ${LINE};padding:6px 8px`,
  code: `font-family:Menlo,Consolas,monospace;font-size:14px;background:${BACKGROUND};padding:1px 4px;border-radius:4px`,
  pre: `font-family:Menlo,Consolas,monospace;font-size:14px;background:${BACKGROUND};padding:12px;border-radius:8px;white-space:pre-wrap;margin:0 0 16px`,
};

const absolute = (url: string, siteUrl: string) => (url.startsWith('/') && !url.startsWith('//') ? `${siteUrl}${url}` : url);

function emailSanitizeOptions(siteUrl: string): sanitize.IOptions {
  // Each transform replaces the attributes with an explicit set, so a style or handler written by
  // hand never survives; the allow-list below then checks what is left.
  const styled = (tag: string): sanitize.Transformer => (_name, attribs) => {
    const out: sanitize.Attributes = {};
    if (tag === 'a' && attribs.href) out.href = absolute(attribs.href, siteUrl);
    if (tag === 'a' && attribs.title) out.title = attribs.title;
    if (tag === 'ol' && attribs.start) out.start = attribs.start;
    if ((tag === 'th' || tag === 'td') && attribs.align) out.align = attribs.align;
    return { tagName: tag, attribs: { ...out, style: STYLES[tag] } };
  };
  const image: sanitize.Transformer = (_name, attribs) => {
    const src = absolute(attribs.src ?? '', siteUrl);
    // Not https → not an image at all (a <span> that is not allowed, so it disappears).
    const none: sanitize.Attributes = {};
    if (!src.startsWith('https://')) return { tagName: 'span', attribs: none };
    return { tagName: 'img', attribs: { src, alt: attribs.alt ?? '', style: STYLES.img } };
  };
  const transformTags: Record<string, sanitize.Transformer> = { img: image, h1: styled('h2') };
  for (const tag of Object.keys(STYLES)) if (tag !== 'img') transformTags[tag] = styled(tag);

  return {
    allowedTags: ['p', 'br', 'hr', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'del', 's', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    allowedAttributes: {
      '*': ['style'],
      a: ['href', 'title', 'style'],
      img: ['src', 'alt', 'style'],
      ol: ['start', 'style'],
      th: ['align', 'style'],
      td: ['align', 'style'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['https'] },
    allowProtocolRelative: false,
    nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe'],
    transformTags,
  };
}

export function markdownToEmailHtml(markdown: string, siteUrl: string): string {
  const html = marked.parse(markdown, { async: false });
  return sanitize(html, emailSanitizeOptions(siteUrl));
}

// Markdown already reads well as plain text; only link / image syntax, emphasis marks, heading
// hashes and stray HTML tags are turned into words.
function markdownToText(markdown: string, siteUrl: string): string {
  return markdown
    .replace(/!\[([^\]]*)\]\(\s*([^)\s]+)[^)]*\)/g, (_m, alt: string, url: string) => `${alt} (${absolute(url, siteUrl)})`)
    .replace(/\[([^\]]+)\]\(\s*([^)\s]+)[^)]*\)/g, (_m, label: string, url: string) => `${label} (${absolute(url, siteUrl)})`)
    .replace(/<[^>]+>/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(\*\*|__|~~)/g, '')
    .trim();
}

const vnd = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });

function cardHtml(card: CampaignCard): string {
  const href = escapeHtml(card.url);
  const image = card.imageUrl?.startsWith('https://')
    ? `<a href="${href}"><img src="${escapeHtml(card.imageUrl)}" alt="${escapeHtml(card.title)}" width="552" style="display:block;width:100%;max-width:552px;height:auto;border:0;border-radius:12px 12px 0 0"></a>`
    : '';
  const summary = card.summary ? `<p style="margin:4px 0 0;font-size:15px;line-height:1.5;color:${MUTED}">${escapeHtml(card.summary)}</p>` : '';
  const price = typeof card.price === 'number' ? `<p style="margin:6px 0 0;font-size:16px;font-weight:700;color:${INK}">${escapeHtml(vnd.format(card.price))}</p>` : '';
  const cta = card.kind === 'post' ? 'Đọc bài' : 'Xem sản phẩm';
  return `<tr><td style="padding:0 24px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:12px">
<tr><td>${image}</td></tr>
<tr><td style="padding:12px 16px 16px;${FONT}"><a href="${href}" style="font-size:17px;line-height:1.35;font-weight:700;color:${INK};text-decoration:none">${escapeHtml(card.title)}</a>${summary}${price}
<p style="margin:10px 0 0"><a href="${href}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:${LINK};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none">${cta}</a></p></td></tr>
</table></td></tr>`;
}

const contactLines = (shop: ShopContact) => [shop.address, shop.phone, shop.email].filter((v): v is string => Boolean(v?.trim()));

export function renderCampaignEmail(input: CampaignEmailInput): { subject: string; html: string; text: string } {
  const subject = `${input.isTest ? TEST_SEND_PREFIX : ''}${input.isAdvertising ? ADVERTISING_PREFIX : ''}${input.subject}`;
  const site = escapeHtml(input.siteUrl);
  const unsubscribe = escapeHtml(input.unsubscribeUrl);
  const contacts = contactLines(input.shop);
  const shopName = escapeHtml(SHOP_NAME);
  const preheader = input.preheader?.trim()
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(input.preheader.trim())}</div>`
    : '';

  const html = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${BACKGROUND}">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BACKGROUND}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px">
<tr><td style="padding:24px 24px 8px;${FONT}"><a href="${site}" style="text-decoration:none;color:${INK}"><img src="${site}/brand/logo-icon-512.png" width="48" height="48" alt="${shopName}" style="display:inline-block;vertical-align:middle;border:0;border-radius:12px"> <span style="vertical-align:middle;font-size:18px;font-weight:800;color:${INK}">${shopName}</span></a></td></tr>
<tr><td style="padding:8px 24px 8px;${FONT}">${markdownToEmailHtml(input.content, input.siteUrl)}</td></tr>
${input.cards.map(cardHtml).join('\n')}
<tr><td style="padding:16px 24px 24px;border-top:1px solid ${LINE};${FONT};font-size:13px;line-height:1.6;color:${MUTED}">
<p style="margin:0 0 8px">Bạn nhận email này vì đã đăng ký nhận tin tại ${shopName}.</p>
${contacts.length ? `<p style="margin:0 0 8px">${contacts.map(escapeHtml).join(' · ')}</p>` : ''}
<p style="margin:0"><a href="${unsubscribe}" style="color:${LINK};text-decoration:underline">Huỷ nhận tin</a></p>
</td></tr>
</table></td></tr></table>
</body></html>`;

  const text = [
    input.preheader?.trim(),
    markdownToText(input.content, input.siteUrl),
    ...input.cards.map((c) => `- ${c.title}${typeof c.price === 'number' ? ` — ${vnd.format(c.price)}` : ''}: ${c.url}`),
    '',
    '—',
    `Bạn nhận email này vì đã đăng ký nhận tin tại ${SHOP_NAME}.`,
    ...contacts,
    `Huỷ nhận tin: ${input.unsubscribeUrl}`,
  ]
    .filter((line) => line !== undefined)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n');
  return { subject, html, text };
}
