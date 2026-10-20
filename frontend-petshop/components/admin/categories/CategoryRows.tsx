'use client';

import { MAX_CATEGORY_DEPTH, type AdminNode } from '../../../lib/adminCategories';

export type RowActions = {
  busy: boolean;
  onEdit: (node: AdminNode) => void;
  onAddChild: (node: AdminNode) => void;
  onMove: (node: AdminNode, siblings: AdminNode[], dir: -1 | 1) => void;
  onDelete: (node: AdminNode) => void;
};

const btn = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-line px-3 text-sm font-bold text-ink hover:bg-mint disabled:opacity-40';

// The tree as nested lists. Each row: name, product count, then its actions on their own line on
// phones (they wrap) and to the right from md. ↑/↓ swap with the neighbouring sibling.
export function CategoryRows({ nodes, ...actions }: { nodes: AdminNode[] } & RowActions) {
  return (
    <ul className={nodes[0]?.depth === 1 ? 'flex flex-col gap-2' : 'mt-2 flex flex-col gap-2 border-l-2 border-line pl-3'}>
      {nodes.map((n, i) => (
        <li key={n.id}>
          <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3 md:flex-row md:items-center md:justify-between">
            <p className="min-w-0 break-words">
              <span className={n.depth === 1 ? 'font-extrabold text-ink' : 'font-bold text-ink'}>{n.name}</span>{' '}
              <span className="text-sm text-muted tabular-nums">· {n._count.products} SP · /{n.slug}</span>
            </p>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button type="button" className={btn} onClick={() => actions.onEdit(n)} aria-label={`Sửa ${n.name}`}>Sửa</button>
              <button type="button" className={btn} disabled={actions.busy || i === 0} onClick={() => actions.onMove(n, nodes, -1)} aria-label={`Đưa ${n.name} lên`}>↑</button>
              <button type="button" className={btn} disabled={actions.busy || i === nodes.length - 1} onClick={() => actions.onMove(n, nodes, 1)} aria-label={`Đưa ${n.name} xuống`}>↓</button>
              {n.depth < MAX_CATEGORY_DEPTH && (
                <button type="button" className={btn} onClick={() => actions.onAddChild(n)} aria-label={`Thêm mục con vào ${n.name}`}>+ Mục con</button>
              )}
              <button type="button" className={`${btn} text-pink-ink`} disabled={actions.busy} onClick={() => actions.onDelete(n)} aria-label={`Xoá ${n.name}`}>Xoá</button>
            </div>
          </div>
          {n.children.length > 0 && <CategoryRows nodes={n.children} {...actions} />}
        </li>
      ))}
    </ul>
  );
}
