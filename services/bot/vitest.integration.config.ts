import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for integration tests.
 * Run with: INTEGRATION_TEST_API_URL=http://localhost:8080 bun run vitest run --config vitest.integration.config.ts
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/integration/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
    testTimeout: 30000,
  },
});
