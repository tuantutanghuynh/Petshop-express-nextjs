import { defineConfig } from 'vitest/config';

// Suite that runs against a REAL PostgreSQL started by Testcontainers (see
// test/db/global-setup.ts). Kept separate from vitest.config.ts so `npm test` stays fast and
// DB-free, while `npm run test:db` needs Docker.
//
// - fileParallelism: false — all files share one database and every test TRUNCATEs it, so two
//   files running at once would delete each other's data mid-test.
// - Generous timeouts — the container start, `prisma db push` and the 20x-repeated stress
//   scenarios take longer than Vitest's 5 s default.
export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./test/db/global-setup.ts'],
    setupFiles: ['./test/db/setup.ts'],
    include: ['test/db/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
    env: {
      NODE_ENV: 'test',
      JWT_ACCESS_SECRET: 'test_access_secret_do_not_use_elsewhere',
      JWT_REFRESH_SALT: 'test_refresh_secret_do_not_use_elsewhere',
      FRONTEND_URLS: 'http://localhost:3000',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      // red tests here are product bugs on purpose; coverage must still be reported
      reportOnFailure: true,
      include: ['app.ts', 'controllers/**', 'middlewares/**', 'routes/**', 'services/**', 'utils/**', 'workers/**'],
    },
  },
});
