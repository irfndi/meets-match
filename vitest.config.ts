import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    exclude: ["**/node_modules/**", "**/.clawpatch/**", "**/dist/**"],
    testTimeout: 15000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 76,
        lines: 80,
      },
      include: ["packages/**/src/**/*.ts", "services/**/src/**/*.ts"],
      exclude: [
        "**/node_modules/**",
        "**/__tests__/**",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/*.d.ts",
        "**/dist/**",
        "**/index.ts",
        "**/lib/version.ts",
        "**/testing/**",
        "**/types.ts",
      ],
    },
  },
});
