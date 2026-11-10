import sanitize from 'sanitize-html';

// The one HTML sanitiser for Markdown written in the admin (product descriptions, posts, content
// pages). sanitize-html replaced isomorphic-dompurify because DOMPurify needs jsdom on the server,
// and jsdom 30 require()s an ES-module-only package that the Vercel runtime refused to load: every
// dynamic page answered 500.
//
// An explicit allow-list: exactly what marked produces from Markdown, nothing else. No forms,
// inputs, iframes, SVG or inline styles; links and images only over http(s) (plus mailto / tel for
// links) or a site-relative path. `id` is kept on headings for the article table of contents.
const OPTIONS: sanitize.IOptions = {
  allowedTags: [
    'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 'del', 's', 'code', 'pre', 'blockquote',
    'ul', 'ol', 'li', 'a', 'img',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    a: ['href', 'title'],
    img: ['src', 'alt', 'title'],
    h2: ['id'],
    ol: ['start'],
    th: ['align'],
    td: ['align'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
  // Script / style contents are dropped together with the tag, never shown as text.
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript'],
};

export function sanitizeHtml(html: string): string {
  return sanitize(html, OPTIONS);
}
