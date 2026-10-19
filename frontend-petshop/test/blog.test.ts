import { describe, expect, it } from 'vitest';
import { postCategories, readingMinutes, renderArticle } from '../lib/blog';
import type { BlogPost } from '../lib/types';

describe('readingMinutes', () => {
  it('estimates at about 200 words a minute, never below one', () => {
    expect(readingMinutes('')).toBe(1);
    expect(readingMinutes('chó '.repeat(150))).toBe(1);
    expect(readingMinutes('mèo '.repeat(1000))).toBe(5);
  });

  it('ignores Markdown syntax when counting', () => {
    expect(readingMinutes('## ### ** __ > - '.repeat(500))).toBe(1);
  });
});

describe('renderArticle', () => {
  const md = '# Tiêu đề\n\nMở đầu.\n\n## Mèo con dưới 6 tháng?\n\nA.\n\n### Chi tiết\n\n## Dấu hiệu mèo bị giun?\n\nB.\n\n## Dấu hiệu mèo bị giun?\n\nC.';

  it('builds a table of contents from the H2 headings only, in order', () => {
    expect(renderArticle(md).toc).toEqual([
      { id: 'muc-meo-con-duoi-6-thang', text: 'Mèo con dưới 6 tháng?' },
      { id: 'muc-dau-hieu-meo-bi-giun', text: 'Dấu hiệu mèo bị giun?' },
      { id: 'muc-dau-hieu-meo-bi-giun-2', text: 'Dấu hiệu mèo bị giun?' },
    ]);
  });

  it('puts the same ids on the rendered H2 so the links land', () => {
    const { html } = renderArticle(md);
    expect(html).toContain('<h2 id="muc-meo-con-duoi-6-thang">Mèo con dưới 6 tháng?</h2>');
    expect(html).toContain('<h2 id="muc-dau-hieu-meo-bi-giun-2">');
    expect(html).toContain('<h3>Chi tiết</h3>');
  });

  it('is still sanitised', () => {
    const { html, toc } = renderArticle('## <img src=x onerror=alert(1)>Hi\n\n<script>alert(1)</script>');
    expect(html).not.toMatch(/onerror|<script/i);
    expect(toc[0].text).not.toMatch(/</);
  });
});

describe('postCategories', () => {
  const post = (id: string, category: { id: string; name: string; slug: string } | null) =>
    ({ id, category } as unknown as BlogPost);

  it('lists only categories that have posts, most used first', () => {
    const cats = postCategories([
      post('1', { id: 'a', name: 'Dinh dưỡng', slug: 'dinh-duong' }),
      post('2', { id: 'b', name: 'Sức khoẻ', slug: 'suc-khoe' }),
      post('3', { id: 'b', name: 'Sức khoẻ', slug: 'suc-khoe' }),
      post('4', null),
    ]);
    expect(cats).toEqual([
      { name: 'Sức khoẻ', slug: 'suc-khoe', count: 2 },
      { name: 'Dinh dưỡng', slug: 'dinh-duong', count: 1 },
    ]);
  });
});
