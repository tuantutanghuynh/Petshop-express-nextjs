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
  ])('strips %s from the output', (_name, input, forbidden) => {
    expect(renderMarkdown(input)).not.toMatch(forbidden);
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
