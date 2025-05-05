import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true, // Use Vitest global APIs (describe, it, expect)
    environment: "node", // Or 'miniflare' if testing Cloudflare specifics
    coverage: {
      provider: "v8", // Use v8 for coverage
      reporter: ["text", "json", "html"], // Output formats
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"], // Files to include in coverage
      exclude: [
        "node_modules/",
        "src/index.ts", // Entry point might be hard to test directly
        "src/bot/context.ts",
        "src/locales/*",
        "**/__tests__/**/*", // Exclude test files themselves
        "**/__mocks__/**/*", // Exclude mocks
      ],
      all: true, // Ensure all included files are measured, even if untested
    },
  },
});
