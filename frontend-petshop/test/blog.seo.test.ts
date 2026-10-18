import { describe, expect, it } from 'vitest';
import { blogPostingJsonLd } from '../lib/seo/structuredData';
import type { BlogPost } from '../lib/types';

// BlogPosting must describe the article as shown: the real author when there is one, otherwise the
// shop itself as an Organization — never the legacy "Miniecom" name.
const BASE = 'https://example.vn';
const post = (over: Partial<BlogPost>): BlogPost => ({
  id: 'p1', title: 'Bao lâu tẩy giun cho mèo một lần?', slug: 'tay-giun-cho-meo', excerpt: 'Lịch tẩy giun theo tuổi.',
  content: '# x', coverImageUrl: 'https://res.cloudinary.com/demo/a.jpg', status: 'published', seoTitle: null,
  seoDescription: null, publishedAt: '2026-10-01T00:00:00.000Z', createdAt: '2026-09-30T00:00:00.000Z',
  updatedAt: '2026-10-12T00:00:00.000Z', author: { id: 'u1', fullName: 'Trần Hà' }, ...over,
});

describe('blogPostingJsonLd', () => {
  it('describes the article with real dates, image, author and publisher', () => {
    expect(blogPostingJsonLd(BASE, post({}))).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: 'Bao lâu tẩy giun cho mèo một lần?',
      description: 'Lịch tẩy giun theo tuổi.',
      url: `${BASE}/blog/tay-giun-cho-meo`,
      mainEntityOfPage: `${BASE}/blog/tay-giun-cho-meo`,
      datePublished: '2026-10-01T00:00:00.000Z',
      dateModified: '2026-10-12T00:00:00.000Z',
      image: ['https://res.cloudinary.com/demo/a.jpg'],
      inLanguage: 'vi',
      author: { '@type': 'Person', name: 'Trần Hà' },
      publisher: { '@type': 'Organization', name: 'Siêu thị của chó mèo', url: BASE },
    });
  });

  it('falls back to the shop as author, never "Miniecom"', () => {
    const ld = blogPostingJsonLd(BASE, post({ author: undefined }));
    expect(ld.author).toEqual({ '@type': 'Organization', name: 'Siêu thị của chó mèo', url: BASE });
    expect(JSON.stringify(ld)).not.toMatch(/miniecom/i);
  });

  it('leaves out an image next/image cannot serve and a missing publish date', () => {
    const ld = blogPostingJsonLd(BASE, post({ coverImageUrl: 'https://evil.example/x.jpg', publishedAt: null }));
    expect(ld).not.toHaveProperty('image');
    expect(ld.datePublished).toBe('2026-09-30T00:00:00.000Z'); // createdAt as the fallback
  });
});
