import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

// Determine the path to the database file relative to this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "..", "..", "sqlite.db"); // Adjust path to root
const dbUrl = `file:${dbPath}`;

console.log(`[DB] Initializing client for URL: ${dbUrl}`);

const client = createClient({ url: dbUrl });

// Export the Drizzle instance with the full schema
export const db = drizzle(client, { schema });

// Optional: Export the raw client if needed elsewhere
export { client as rawDbClient };

// Function to safely close the connection (useful for testing or graceful shutdown)
export async function closeDbConnection() {
  console.log("[DB] Closing database connection...");
  try {
    client.close();
    console.log("[DB] Database connection closed.");
  } catch (error) {
    console.error("[DB] Error closing database connection:", error);
  }
}
