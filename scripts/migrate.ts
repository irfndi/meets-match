import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  console.log("Starting migration...");

  const dbPath = path.join(__dirname, "..", "sqlite.db");
  console.log(`Using database file: ${dbPath}`);

  // Use file URL format for libsql client
  const dbUrl = `file:${dbPath}`;

  const client = createClient({ url: dbUrl });
  const db = drizzle(client);

  try {
    await migrate(db, {
      migrationsFolder: path.join(__dirname, "..", "migrations"),
    });
    console.log("Migrations applied successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    client.close();
    console.log("Database connection closed.");
  }
}

runMigration();
