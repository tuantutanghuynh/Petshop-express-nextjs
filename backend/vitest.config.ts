import { defineConfig } from 'vitest/config';

// DB-free suite: DATABASE_URL points at an unreachable "petshop_test" database on purpose, so a
// test that accidentally reaches Prisma fails fast instead of touching a real database. These
// values are injected before `dotenv.config()` runs in config/env.ts, and dotenv never
// overrides variables that already exist, so backend/.env (the dev database) is never used.
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/petshop_test',
      JWT_ACCESS_SECRET: 'test_access_secret_do_not_use_elsewhere',
      JWT_REFRESH_SALT: 'test_refresh_secret_do_not_use_elsewhere',
      FRONTEND_URLS: 'http://localhost:3000',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['app.ts', 'middlewares/**', 'routes/**', 'services/jwt.service.ts', 'utils/**'],
    },
  },
});
