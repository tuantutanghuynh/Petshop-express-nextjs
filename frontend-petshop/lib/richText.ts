import { Editor, type Extensions } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { renderMarkdown } from './markdown';

// The admin rich text editor (ADR-024). Content is still stored as Markdown, so the extension set
// is limited to what Markdown can hold and what the public renderer (lib/sanitize.ts) lets through:
// no underline, no H1 (the page title is the only H1; H2s feed the post's table of contents).
const LINK_PROTOCOLS = ['http', 'https', 'mailto', 'tel'];

export function richTextExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      underline: false,
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        protocols: LINK_PROTOCOLS,
        isAllowedUri: (url) => safeLinkHref(url) !== null,
      },
    }),
    Image.configure({ inline: false, allowBase64: false }),
    Markdown,
  ];
}

// Whether opening `markdown` in the editor would keep it: the page rendered from the editor's
// output must match the page rendered from the original. A table or raw HTML fails this, and the
// field then opens in Markdown mode so a save cannot silently drop it.
export function keepsMarkdown(markdown: string): boolean {
  if (!markdown.trim()) return true;
  const editor = new Editor({ extensions: richTextExtensions(), content: markdown, contentType: 'markdown' });
  try {
    return renderMarkdown(editor.getMarkdown()) === renderMarkdown(markdown);
  } finally {
    editor.destroy();
  }
}

const SCHEME =/^([a-z][a-z0-9+.-]*):/i;
const BARE_DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i;

// What the admin typed in the link box, made safe: http(s) / mailto / tel, a site path ("/blog/x"),
// or a bare domain (gets https://). Anything else, javascript: and protocol-relative included, is null.
export function safeLinkHref(raw: string): string | null {
  const href = raw.trim();
  if (!href || /\s/.test(href)) return null;
  if (href.startsWith('/')) return href.startsWith('//') ? null : href;
  const scheme = SCHEME.exec(href)?.[1]?.toLowerCase();
  if (scheme) return LINK_PROTOCOLS.includes(scheme) ? href : null;
  return BARE_DOMAIN.test(href) ? `https://${href}` : null;
}

// Attributes for an inserted image: https only (what uploads return and the public renderer
// accepts), and alt text is required. Brackets would break the ![alt](url) syntax, so they go.
export function markdownImage(alt: string, src: string): { src: string; alt: string } | null {
  const text = alt.replace(/[[\]]/g, '').trim();
  if (!text || !src.startsWith('https://')) return null;
  return { src, alt: text };
}
