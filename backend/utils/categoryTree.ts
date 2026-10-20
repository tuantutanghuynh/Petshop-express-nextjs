// Category plus all of its descendants. The table holds a few dozen rows, so the caller loads every
// (id, parentId) pair once and the walk happens in memory — simpler than a recursive SQL query and
// one round trip whatever the depth. `seen` guards against a parentId loop written by hand.
export type Link = { id: string; parentId: string | null };

export function categorySubtreeIds(all: Link[], rootId: string): string[] {
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

// Menus show three levels below the brand root (species → group → leaf), so the tree may not grow
// deeper (ADR-017).
export const MAX_CATEGORY_DEPTH = 3;

// Levels between the root and `id` (root 0); -1 when `id` is not below `rootId`. The walk is capped
// by the row count, so a parentId loop ends as -1 instead of hanging.
export function categoryDepth(all: Link[], id: string, rootId: string): number {
  const parentOf = new Map(all.map((c) => [c.id, c.parentId]));
  let current: string | null | undefined = id;
  for (let depth = 0; depth <= all.length; depth += 1) {
    if (current === rootId) return depth;
    if (!current) return -1;
    current = parentOf.get(current);
  }
  return -1;
}

// Levels hanging below `id` (a leaf is 0). Only called on rows already checked with categoryDepth,
// so it never meets a loop.
export function subtreeHeight(all: Link[], id: string): number {
  const children = all.filter((c) => c.parentId === id);
  return children.length === 0 ? 0 : 1 + Math.max(...children.map((c) => subtreeHeight(all, c.id)));
}

// True when `ids` lists exactly the members of `expected`, each once (order ignored).
export function sameMembers(ids: string[], expected: string[]): boolean {
  const set = new Set(ids);
  return set.size === ids.length && ids.length === expected.length && expected.every((id) => set.has(id));
}
