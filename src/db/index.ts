import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type Client } from "@libsql/client";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/libsql";
import { type BunSQLiteDatabase, drizzle as drizzleBun } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

// Determine the path to the database file relative to this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "..", "..", "sqlite.db"); // Adjust path to root
const dbUrl = `file:${dbPath}`;

let db: BunSQLiteDatabase<typeof schema> | ReturnType<typeof drizzle>;
let client: Client | Database;

if (process.env.VITEST === 'true') {
  console.log("[DB] VITEST environment detected. Initializing in-memory SQLite...");
  const sqlite = new Database(":memory:");
  client = sqlite; // Keep reference for closing
  db = drizzleBun(sqlite, { schema });
} else {
  console.log(`[DB] Initializing file-based client for URL: ${dbUrl}`);
  const libsqlClient = createClient({ url: dbUrl });
  client = libsqlClient; // Keep reference for closing
  db = drizzle(libsqlClient, { schema });
}

// Export the Drizzle instance (type might be different based on env)
export { db };

// Export the raw client if needed elsewhere (type might be different)
// Avoid exporting raw client directly if type varies; access via db instance if possible.
// export { client as rawDbClient }; // Commented out due to varying types

// Function to safely close the connection (useful for testing or graceful shutdown)
export async function closeDbConnection() {
  console.log("[DB] Closing database connection...");
  try {
    // client might be LibSQL Client or Bun SQLite Database
    if (client && typeof client.close === 'function') {
      client.close();
      console.log("[DB] Database connection closed.");
    } else {
      console.warn("[DB] Client instance not found or doesn't have a close method.");
    }
  } catch (error) {
    console.error("[DB] Error closing database connection:", error);
  }
}
