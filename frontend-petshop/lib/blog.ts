import DOMPurify from 'isomorphic-dompurify';
import { Marked, type Tokens } from 'marked';
import type { BlogPost } from './types';

// Article helpers for the blog pages (test/blog.test.ts).

const WORDS_PER_MINUTE = 200;

// "x phút đọc": words of the text without Markdown syntax, about 200 a minute, at least 1.
export function readingMinutes(content: string | null | undefined): number {
  const words = (content ?? '').replace(/[#*_`>~[\]()|-]/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

export type TocItem = { id: string; text: string };

// Accent-free id for a heading. Prefixed so an id can never shadow a DOM property ("name", "forms").
function headingSlug(text: string): string {
  const base = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base ? `muc-${base}` : 'muc';
}

const plainText = (raw: string) => raw.replace(/<[^>]*>/g, '').replace(/[*_`]/g, '').trim();

// Article HTML with an id on every H2, plus the matching table of contents. A fresh Marked instance
// per call keeps the id counter (for repeated headings) local to one article. The HTML still goes
// through DOMPurify, exactly like renderMarkdown.
export function renderArticle(content: string | null | undefined): { html: string; toc: TocItem[] } {
  const toc: TocItem[] = [];
  const seen = new Map<string, number>();
  const marked = new Marked({
    renderer: {
      heading(this: { parser: { parseInline(tokens: Tokens.Heading['tokens']): string } }, { tokens, depth, text }: Tokens.Heading) {
        const inner = this.parser.parseInline(tokens);
        if (depth !== 2) return `<h${depth}>${inner}</h${depth}>\n`;
        const label = plainText(text);
        const base = headingSlug(label);
        const n = (seen.get(base) ?? 0) + 1;
        seen.set(base, n);
        const id = n === 1 ? base : `${base}-${n}`;
        toc.push({ id, text: label });
        return `<h2 id="${id}">${inner}</h2>\n`;
      },
    },
  });
  const html = DOMPurify.sanitize(marked.parse(content || '', { async: false }));
  return { html, toc };
}

export type PostCategory = { name: string; slug: string; count: number };

// Topic chips for /blog: only categories that actually have posts, most used first — never an
// empty chip leading to an empty page.
export function postCategories(posts: BlogPost[]): PostCategory[] {
  const bySlug = new Map<string, PostCategory>();
  for (const p of posts) {
    if (!p.category) continue;
    const entry = bySlug.get(p.category.slug) ?? { name: p.category.name, slug: p.category.slug, count: 0 };
    entry.count += 1;
    bySlug.set(p.category.slug, entry);
  }
  return [...bySlug.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi'));
}

const DATE = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });

export function formatDate(iso: string): string {
  return DATE.format(new Date(iso));
}

export function blogListHref(state: { topic?: string; page?: number }): string {
  const params = new URLSearchParams();
  if (state.topic) params.set('chu-de', state.topic);
  if (state.page && state.page > 1) params.set('page', String(state.page));
  const query = params.toString();
  return query ? `/blog?${query}` : '/blog';
}

// Topic slugs come from the URL (?chu-de=); anything that is not a plain slug is a 404.
export function parseTopicParam(raw: string | string[] | undefined): string | null | undefined {
  if (raw === undefined) return undefined;
  return typeof raw === 'string' && /^[a-z0-9-]{1,80}$/.test(raw) ? raw : null;
}
