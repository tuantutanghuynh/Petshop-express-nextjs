// Category plus all of its descendants. The table holds a few dozen rows, so the caller loads every
// (id, parentId) pair once and the walk happens in memory — simpler than a recursive SQL query and
// one round trip whatever the depth. `seen` guards against a parentId loop written by hand.
export function categorySubtreeIds(all: { id: string; parentId: string | null }[], rootId: string): string[] {
  const children = new Map<string, string[]>();
  for (const c of all) {
    if (c.parentId) children.set(c.parentId, [...(children.get(c.parentId) ?? []), c.id]);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  const queue = [rootId];
  for (let i = 0; i < queue.length; i += 1) {
    const id = queue[i];
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    queue.push(...(children.get(id) ?? []));
  }
  return out;
}
