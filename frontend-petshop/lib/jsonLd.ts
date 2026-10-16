// Serialises structured data (schema.org JSON-LD) for a <script type="application/ld+json"> tag.
//
// JSON.stringify alone is not safe here. The HTML parser ends a script element at the first
// "</script" it meets, without knowing it sits inside a JSON string, so a post title such as
// "</script><script>alert(1)</script>" would close the tag and run attacker-controlled script.
// Escaping <, > and & as \uXXXX removes every way to form a tag or comment, and U+2028 / U+2029
// are escaped because some parsers treat them as line breaks. All of these are valid JSON escapes,
// so search engines read exactly the same data.
const UNSAFE = /[<>&\u2028\u2029]/g;

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(UNSAFE, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
