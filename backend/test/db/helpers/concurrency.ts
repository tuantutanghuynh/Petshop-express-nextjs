// Tools for provoking and observing races deterministically, without `sleep`.

// How many times each stress scenario repeats. Races are probabilistic: one green run proves
// little, twenty green runs in a row are evidence. CI can raise it with RACE_ITERATIONS=100.
export const ITER = Number(process.env.RACE_ITERATIONS ?? 20);

// Starts n tasks at the same instant and waits for all of them, separating successes from
// failures instead of stopping at the first rejection (Promise.all would hide the others).
export async function runConcurrently<T>(n: number, fn: (i: number) => Promise<T>) {
  const settled = await Promise.allSettled(Array.from({ length: n }, (_, i) => fn(i)));
  return {
    ok: settled.filter((s): s is PromiseFulfilledResult<Awaited<T>> => s.status === 'fulfilled').map((s) => s.value),
    errors: settled.filter((s): s is PromiseRejectedResult => s.status === 'rejected').map((s) => s.reason as unknown),
  };
}

// Resolves to true when `p` is still pending after `ms` — i.e. the statement is waiting on a
// row lock held by another transaction. This is how a test proves a lock actually blocks.
export async function isBlocked(p: Promise<unknown>, ms = 300): Promise<boolean> {
  const timeout = Symbol('timeout');
  const winner = await Promise.race([
    p.then(() => 'done', () => 'done'),
    new Promise((resolve) => setTimeout(() => resolve(timeout), ms)),
  ]);
  return winner === timeout;
}

// Groups HTTP responses by status code, e.g. { 201: 3, 409: 7 }. Makes assertions on mixed
// outcomes of a concurrent burst readable and gives a useful diff when they fail.
export function statusHistogram(responses: { status: number }[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const r of responses) out[r.status] = (out[r.status] ?? 0) + 1;
  return out;
}

// p50 / p95 of a list of durations in ms, used to spot lock contention that grows with N.
export function percentiles(ms: number[]): { p50: number; p95: number } {
  const sorted = [...ms].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return { p50: at(0.5), p95: at(0.95) };
}
