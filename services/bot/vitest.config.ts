import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Include all test files by default
    include: ['src/**/*.test.ts'],
    // Exclude integration and e2e tests from default run (run separately)
    exclude: ['**/node_modules/**', 'src/__tests__/integration/**', 'src/__tests__/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      // Exclude test files and fixtures from coverage
      exclude: ['src/test/**', 'src/**/*.test.ts', 'src/__tests__/**'],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
      },
    },
    // Test timeout for slower tests
    testTimeout: 10000,
  },
});
