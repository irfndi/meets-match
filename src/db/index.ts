import BetterSqlite3 from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Client, createClient } from "@libsql/client";
import { drizzle as drizzleBetterSqlite3, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzleLibSQL, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

// Determine the path to the database file relative to this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "..", "..", "sqlite.db"); // Adjust path to root
const dbUrl = `file:${dbPath}`;

// Define more specific types for db based on the environment
export type AppDb = LibSQLDatabase<typeof schema> | BetterSQLite3Database<typeof schema>;

let db: AppDb;
let client: Client | BetterSqlite3;

if (process.env.VITEST === "true") {
  console.log(
    "[DB] VITEST environment detected. Initializing in-memory better-sqlite3..."
  );
  const sqlite = new BetterSqlite3(":memory:");
  client = sqlite; // Keep reference for closing
  db = drizzleBetterSqlite3(sqlite, { schema });
} else if (process.env.NODE_ENV === 'production' || process.env.CF_WORKER) {
  // This block is a placeholder for Cloudflare D1 integration in a worker
  // In a real worker, you'd get the D1 binding from env
  // const d1 = env.DB; 
  // db = drizzleD1(d1, { schema });
  // For now, to make it runnable outside worker but not in VITEST, let's use LibSQL file
  console.log(`[DB] Production-like (Non-VITEST, Non-WORKER) env. Initializing file-based LibSQL client for URL: ${dbUrl}`);
  const libsqlClient = createClient({ url: dbUrl });
  client = libsqlClient;
  db = drizzleLibSQL(libsqlClient, { schema });
} else {
  // Default development environment (non-VITEST, non-production-like worker)
  console.log(`[DB] Development env. Initializing file-based LibSQL client for URL: ${dbUrl}`);
  const libsqlClient = createClient({ url: dbUrl });
  client = libsqlClient;
  db = drizzleLibSQL(libsqlClient, { schema });
}

// Export the Drizzle instance
export { db };

// Export the raw client if needed elsewhere (type might be different)
// Avoid exporting raw client directly if type varies; access via db instance if possible.
// export { client as rawDbClient }; // Commented out due to varying types

// Function to safely close the connection (useful for testing or graceful shutdown)
export async function closeDbConnection() {
  console.log("[DB] Closing database connection...");
  try {
    if (client && typeof client.close === "function") {
      client.close();
      console.log("[DB] Database connection closed.");
    } else {
      console.warn(
        "[DB] Client instance not found or doesn't have a close method."
      );
    }
  } catch (error) {
    console.error("[DB] Error closing database connection:", error);
  }
}
