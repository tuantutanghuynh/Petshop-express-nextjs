import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { renderMarkdown } from '../lib/markdown';
import { keepsMarkdown, markdownImage, richTextExtensions, safeLinkHref } from '../lib/richText';

const editors: Editor[] = [];
function load(markdown: string): Editor {
  const editor = new Editor({ extensions: richTextExtensions(), content: markdown, contentType: 'markdown' });
  editors.push(editor);
  return editor;
}
afterEach(() => editors.splice(0).forEach((e) => e.destroy()));

describe('rich text editor keeps content as Markdown', () => {
  const sample = [
    '## Lịch tẩy giun',
    '',
    'Mèo con **2 tuần** một lần, *sau đó* mỗi tháng. ~~Không~~ dùng thuốc người.',
    '',
    '### Mèo trưởng thành',
    '',
    '- Ba tháng một lần',
    '- Theo hướng dẫn bác sĩ',
    '',
    '1. Cân mèo',
    '2. Chọn liều',
    '',
    '> Thông tin tham khảo.',
    '',
    'Xem [bảng giá](https://example.com/gia).',
    '',
    '![Mèo con đang ăn](https://res.cloudinary.com/demo/image/upload/sample.jpg)',
  ].join('\n');

  it('renders the same page after a round trip through the editor', () => {
    const out = load(sample).getMarkdown();
    expect(renderMarkdown(out)).toBe(renderMarkdown(sample));
  });

  it('turns the loaded markdown into headings, lists, quote, link and image nodes', () => {
    const types = new Set<string>();
    load(sample).state.doc.descendants((node) => {
      types.add(node.type.name);
      node.marks.forEach((m) => types.add(m.type.name));
    });
    for (const t of ['heading', 'bold', 'italic', 'strike', 'bulletList', 'orderedList', 'blockquote', 'link', 'image']) expect(types).toContain(t);
  });

  it('offers only H2 and H3: a level-1 heading is not allowed by the editor', () => {
    const editor = load('Đoạn văn');
    expect(editor.can().toggleHeading({ level: 2 })).toBe(true);
    expect(editor.can().toggleHeading({ level: 1 })).toBe(false);
  });

  it('has no underline, which Markdown cannot store', () => {
    expect(load('x').schema.marks.underline).toBeUndefined();
  });

  it('returns an empty string for an empty editor', () => {
    expect(load('').getMarkdown().trim()).toBe('');
  });
});

describe('keepsMarkdown', () => {
  it('is true for content the editor holds without loss', () => {
    expect(keepsMarkdown('## Mục\n\n- một\n- **hai**\n')).toBe(true);
    expect(keepsMarkdown('')).toBe(true);
  });
  it('is false for a table, which the editor would drop', () => {
    expect(keepsMarkdown('| Tuổi | Lịch |\n| --- | --- |\n| 2 tháng | 2 tuần |\n')).toBe(false);
  });
});

describe('safeLinkHref', () => {
  it.each([
    ['https://example.com/a', 'https://example.com/a'],
    ['  http://example.com  ', 'http://example.com'],
    ['mailto:shop@example.com', 'mailto:shop@example.com'],
    ['tel:0901234567', 'tel:0901234567'],
    ['example.com/gia', 'https://example.com/gia'],
    ['/danh-muc/meo', '/danh-muc/meo'],
  ])('accepts %s', (raw, expected) => expect(safeLinkHref(raw)).toBe(expected));

  it.each(['', '   ', 'javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,x', 'vbscript:x', '//evil.com', 'ftp://x.com', 'xin chào'])(
    'refuses %j',
    (raw) => expect(safeLinkHref(raw)).toBeNull(),
  );
});

describe('markdownImage', () => {
  it('escapes brackets in the alt text and keeps the url', () => {
    expect(markdownImage('Mèo [con]', 'https://x.test/a.jpg')).toEqual({ src: 'https://x.test/a.jpg', alt: 'Mèo con' });
  });
  it('refuses a non-https url', () => {
    expect(markdownImage('Mèo', 'javascript:alert(1)')).toBeNull();
    expect(markdownImage('Mèo', 'http://x.test/a.jpg')).toBeNull();
  });
  it('refuses an empty alt', () => {
    expect(markdownImage('  ', 'https://x.test/a.jpg')).toBeNull();
  });
});
