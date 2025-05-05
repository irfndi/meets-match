import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./migrations",
  dialect: "sqlite", // Keep SQLite dialect for D1 compatibility
  // driver field removed as it's causing type errors for local file generation
  dbCredentials: {
    url: "./sqlite.db", // Local file for generating migrations
  },
  verbose: true,
  strict: true,
} satisfies Config;
