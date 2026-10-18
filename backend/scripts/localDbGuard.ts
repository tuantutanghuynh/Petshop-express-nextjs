// Gate for scripts that write demo data. Production is a real shop with real orders, and its
// connection string sits in backend/.env.supabase next to the local one, so copying the wrong
// line is one keystroke away. Only this machine's database passes: the hostname must be exactly
// localhost or 127.0.0.1 (not merely start with it — "localhost.evil.com" is a remote host).
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

export function assertLocalDatabase(url: string | undefined): void {
  let host: string;
  try {
    host = new URL(url ?? '').hostname;
  } catch {
    throw new Error('Refusing to seed: DATABASE_URL is missing or not a valid URL.');
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Refusing to seed: DATABASE_URL must point at a local database (localhost / 127.0.0.1), got host "${host}".`);
  }
}
