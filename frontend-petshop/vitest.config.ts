import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
    env: { NEXT_PUBLIC_API_URL: 'http://api.test/api/v1' },
    coverage: { provider: 'v8', reporter: ['text'], include: ['lib/**'] },
  },
});
