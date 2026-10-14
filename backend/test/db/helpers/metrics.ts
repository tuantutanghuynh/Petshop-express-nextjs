import fs from 'node:fs';
import path from 'node:path';

// Measurements (latency percentiles, query counts) are written to test/db/.metrics/*.json
// instead of the console: Vitest hides console output of passing tests, and these numbers are
// what the final report is built from. The folder is gitignored.
const DIR = path.resolve(__dirname, '..', '.metrics');

export function writeMetric(name: string, value: unknown): void {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, `${name}.json`), JSON.stringify(value, null, 2));
}
