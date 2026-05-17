import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    exclude: [
      "**/node_modules/**",
      "**/.clawpatch/**",
      "**/dist/**",
      "services/cf-bot/**",
      "services/cf-api/**",
      "services/cf-worker/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      thresholds: {
        statements: 60,
        branches: 60,
        functions: 60,
        lines: 60,
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
