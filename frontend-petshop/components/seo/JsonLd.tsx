import { serializeJsonLd } from '../../lib/jsonLd';

// The only place pages should emit structured data. It always goes through serializeJsonLd, so a
// value taken from the database (title, product name, author) can never close the <script> tag and
// inject markup — the XSS that a hand-written JSON.stringify inside dangerouslySetInnerHTML allows.
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}

export default JsonLd;
