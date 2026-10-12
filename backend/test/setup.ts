// Safety gate: refuse to run unless the process is clearly pointed at a throwaway test database.
// Besides the name check, the host must be loopback, so a copied production URL that happens to
// contain "test" in its name still cannot pass.
function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? '';
  let dbName = '';
  let host = '';
  try {
    const parsed = new URL(url);
    dbName = parsed.pathname;
    host = parsed.hostname;
  } catch {
    // dbName stays empty and the check below fails
  }
  const isLoopback = host === '127.0.0.1' || host === 'localhost';
  if (process.env.NODE_ENV !== 'test' || !/test/i.test(dbName) || !isLoopback) {
    throw new Error(
      'Refusing to run: NODE_ENV must be "test" and DATABASE_URL must be a loopback database whose name contains "test".',
    );
  }
}

assertTestDatabase();
