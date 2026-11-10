import { describe, expect, it } from 'vitest';
import { excerptFromContent, renderMarkdown } from '../lib/markdown';

describe('renderMarkdown', () => {
  it('renders basic markdown to HTML', () => {
    expect(renderMarkdown('# Xin chào\n\n**đậm**')).toContain('<h1>Xin chào</h1>');
  });

  it.each([null, undefined, ''])('returns an empty string for %s', (input) => {
    expect(renderMarkdown(input)).toBe('');
  });

  it.each([
    ['script tag', '<script>alert(1)</script>hi', /<script/i],
    ['inline handler', '<img src=x onerror=alert(1)>', /onerror/i],
    ['javascript: link', '[x](javascript:alert(1))', /javascript:/i],
    ['iframe', '<iframe src="https://evil.example"></iframe>', /<iframe/i],
    ['svg onload', '<svg onload=alert(1)><circle/></svg>', /onload|<svg/i],
    ['mixed-case javascript: href', '<a href="JaVaScRiPt:alert(1)">x</a>', /javascript:/i],
    ['entity-encoded javascript: link', '[x](&#106;avascript:alert(1))', /javascript:|&#106;avascript/i],
    ['object tag', '<object data="https://evil.example/x.swf"></object>', /<object/i],
    ['form tag', '<form action="https://evil.example"><input name="p"></form>', /<form|<input/i],
    ['style tag', '<style>body{display:none}</style>hi', /<style/i],
  ])('strips %s from the output', (_name, input, forbidden) => {
    expect(renderMarkdown(input)).not.toMatch(forbidden);
  });

  // What admins write in product descriptions and posts must survive the sanitiser. Void elements
  // are matched without their closing ("<hr>" and "<hr />" are the same HTML).
  it.each([
    ['links', '[Pate](https://example.vn/pate) [nội bộ](/san-pham) [mail](mailto:a@b.vn)',
      ['<a href="https://example.vn/pate">Pate</a>', '<a href="/san-pham">nội bộ</a>', '<a href="mailto:a@b.vn">mail</a>']],
    ['images', '![Mèo con](https://res.cloudinary.com/x/meo.jpg "Mèo")', ['<img src="https://res.cloudinary.com/x/meo.jpg" alt="Mèo con" title="Mèo"']],
    ['lists', '- một\n- hai\n\n1. ba', ['<ul>', '<li>một</li>', '<ol>']],
    ['emphasis', '**đậm** *nghiêng* ~~gạch~~', ['<strong>đậm</strong>', '<em>nghiêng</em>', '<del>gạch</del>']],
    ['quotes and rules', '> trích dẫn\n\n---', ['<blockquote>', '<hr']],
    ['code', '`a < b`\n\n```\nx = 1\n```', ['<code>a &lt; b</code>', '<pre><code>x = 1']],
    ['tables', '| Cỡ | Giá |\n|---|---|\n| 70g | 25.000 |', ['<table>', '<th>Cỡ</th>', '<td>25.000</td>']],
    ['headings', '## Hai\n\n### Ba', ['<h2>Hai</h2>', '<h3>Ba</h3>']],
  ])('keeps %s', (_name, input, expected) => {
    const html = renderMarkdown(input);
    for (const part of expected) expect(html).toContain(part);
  });
});

describe('excerptFromContent', () => {
  it('removes markdown syntax characters and collapses whitespace', () => {
    expect(excerptFromContent('# Tiêu đề\n\n**đậm**   và `code`')).toBe('Tiêu đề đậm và code');
  });

  it('keeps text of exactly maxLength untouched and truncates at maxLength + 1', () => {
    expect(excerptFromContent('a'.repeat(155))).toHaveLength(155);
    expect(excerptFromContent('a'.repeat(156))).toBe(`${'a'.repeat(155)}...`);
  });

  it.each([null, undefined, '', '   '])('returns an empty string for %j', (input) => {
    expect(excerptFromContent(input)).toBe('');
  });

  it('keeps Vietnamese diacritics and emoji intact', () => {
    expect(excerptFromContent('Nguyễn Thị Ánh 🐶')).toBe('Nguyễn Thị Ánh 🐶');
  });
});
