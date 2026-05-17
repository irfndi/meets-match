import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    exclude: ["**/node_modules/**", "**/.deepsec/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      thresholds: {
        statements: 45,
        branches: 40,
        functions: 45,
        lines: 45,
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
      ],
    },
  },
});
