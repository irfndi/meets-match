import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for Handler Integration tests.
 * Run with: bun run vitest run --config vitest.handler-integration.config.ts
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/handler-integration/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
    testTimeout: 30000,
  },
});
