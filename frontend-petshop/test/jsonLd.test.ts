import { describe, expect, it } from 'vitest';
import { serializeJsonLd } from '../lib/jsonLd';

// JSON-LD is written into a <script type="application/ld+json"> tag with dangerouslySetInnerHTML.
// The HTML parser ends that script at the first "</script" it sees — it does not know about JSON
// strings — so any text that came from the database (a post title, a product name) can close the
// tag early and inject markup. These tests pin down the escaping that prevents it.

describe('serializeJsonLd', () => {
  it('cannot be broken out of by a closing script tag in a value', () => {
    const out = serializeJsonLd({ headline: '</script><script>alert(1)</script>' });
    expect(out).not.toMatch(/<\/script/i);
    expect(out).not.toContain('<');
  });

  it('escapes every character that is special inside an HTML script element', () => {
    const out = serializeJsonLd({ a: '<!-- x -->', b: 'Tom & Jerry', c: 'a > b', d: 'line\u2028sep\u2029end' });
    for (const ch of ['<', '>', '&', '\u2028', '\u2029']) expect(out).not.toContain(ch);
    expect(out).toContain('\\u003c');
    expect(out).toContain('\\u0026');
  });

  it('still produces valid JSON that parses back to the exact same data', () => {
    const data = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: 'Bao lâu tẩy giun cho mèo? <b>Lịch</b> & liều — 2026',
      author: { '@type': 'Person', name: 'Nguyễn Thị Ánh 🐶' },
    };
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });

  it.each([
    '</script>',
    '</SCRIPT >',
    '<!--',
    ']]>',
    '"quoted" \\ backslash',
    'emoji 🐶🐱 and Vietnamese: Đặng Thị Ổn',
    '\u2028\u2029',
    "' OR 1=1 --",
    '',
  ])('round-trips %j unchanged and stays tag-safe', (value) => {
    const out = serializeJsonLd({ value });
    expect(JSON.parse(out).value).toBe(value);
    expect(out).not.toMatch(/[<>&\u2028\u2029]/);
  });
});
