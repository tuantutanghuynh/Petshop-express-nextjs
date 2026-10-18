import type { CategoryAttribute } from '../../lib/types';

type Props = { attributes: CategoryAttribute[]; values: Record<string, unknown> };

// Spec rows: labels from the category's attributes (A→Z from the API), values from the product.
// Rows without a value are left out rather than shown as "—".
export function SpecTable({ attributes, values }: Props) {
  const rows = attributes.flatMap((a) => {
    const v = values[a.attributeKey];
    return typeof v === 'string' || typeof v === 'number' ? [{ label: a.attributeLabel, value: String(v) }] : [];
  });
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="spec-title">
      <h2 id="spec-title" className="mb-3 text-lg font-extrabold">Thông số</h2>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-line">
              <th scope="row" className="w-2/5 py-2 pr-4 text-left font-normal text-muted">{r.label}</th>
              <td className="py-2 text-ink">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
