// Topic label on post cards. The colour is fixed per topic (from its slug) so a topic always looks
// the same across pages, using the palette's badge pairs (all ≥ 4.5:1).
const TONES = ['bg-mint text-brand-deep', 'bg-yellow-bg text-yellow-ink', 'bg-lavender text-purple-ink', 'bg-pink-bg text-pink-ink'];

function toneFor(slug: string): string {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

export function TopicBadge({ name, slug }: { name: string; slug: string }) {
  return <span className={`inline-block w-fit rounded-full px-3 py-1 text-xs font-bold ${toneFor(slug)}`}>{name}</span>;
}
