import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for E2E tests.
 * Run with: bun run vitest run --config vitest.e2e.config.ts
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/e2e/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
    testTimeout: 30000,
  },
});
