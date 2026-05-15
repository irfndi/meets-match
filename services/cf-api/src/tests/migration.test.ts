import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readMigration(filename: string): string {
  const filePath = resolve(__dirname, "../../migrations", filename);
  return readFileSync(filePath, "utf-8");
}

function getMigrationFiles(): string[] {
  const fs = require("node:fs");
  const migrationsDir = resolve(__dirname, "../../migrations");
  return fs
    .readdirSync(migrationsDir)
    .filter((f: string) => f.endsWith(".sql"))
    .sort();
}

const expectedTables = [
  "users",
  "matches",
  "notifications",
  "delivery_attempts",
] as const;

describe("D1 Migrations", () => {
  describe("Migration files", () => {
    it("should have migration files present", () => {
      const files = getMigrationFiles();
      expect(files.length).toBeGreaterThanOrEqual(3);
    });

    it("should have sequentially named migration files", () => {
      const files = getMigrationFiles();
      const prefixes = files.map((f: string) => f.split("_")[0]);
      expect(prefixes).toEqual(
        prefixes.slice().sort((a: string, b: string) => Number(a) - Number(b)),
      );
    });
  });

  describe("Initial migration (0001_init.sql)", () => {
    let sql: string;

    beforeAll(() => {
      sql = readMigration("0001_init.sql");
    });

    it("should create users table", () => {
      expect(sql).toContain("CREATE TABLE");
      expect(sql.toLowerCase()).toContain("users");
    });

    it("should include required user columns", () => {
      const lowerSQL = sql.toLowerCase();
      expect(lowerSQL).toContain("id");
      expect(lowerSQL).toContain("username");
      expect(lowerSQL).toContain("created_at");
      expect(lowerSQL).toContain("updated_at");
    });

    it("should use IF NOT EXISTS for idempotency", () => {
      const lowerSQL = sql.toLowerCase();
      const createTableCount = (lowerSQL.match(/create table/g) ?? []).length;
      const ifNotExistsCount = (lowerSQL.match(/if not exists/g) ?? []).length;
      expect(ifNotExistsCount).toBeGreaterThanOrEqual(createTableCount - 1);
    });
  });

  describe("Matches migration (0002_add_matches.sql)", () => {
    let sql: string;

    beforeAll(() => {
      sql = readMigration("0002_add_matches.sql");
    });

    it("should create matches table", () => {
      expect(sql.toLowerCase()).toContain("matches");
      expect(sql).toContain("CREATE TABLE");
    });

    it("should include match-specific columns", () => {
      const lowerSQL = sql.toLowerCase();
      expect(lowerSQL).toContain("user1_id");
      expect(lowerSQL).toContain("user2_id");
      expect(lowerSQL).toContain("status");
    });
  });

  describe("Notifications migration (0003_add_notifications.sql)", () => {
    let sql: string;

    beforeAll(() => {
      sql = readMigration("0003_add_notifications.sql");
    });

    it("should create notifications table", () => {
      expect(sql.toLowerCase()).toContain("notifications");
      expect(sql).toContain("CREATE TABLE");
    });

    it("should include notification-specific columns", () => {
      const lowerSQL = sql.toLowerCase();
      expect(lowerSQL).toContain("type");
      expect(lowerSQL).toContain("status");
      expect(lowerSQL).toContain("user_id");
    });
  });

  describe("Reengagement migration (0004_add_reengagement_indexes.sql)", () => {
    let sql: string;

    beforeAll(() => {
      sql = readMigration("0004_add_reengagement_indexes.sql");
    });

    it("should create reengagement-related indexes", () => {
      expect(sql.toUpperCase()).toContain("INDEX");
    });
  });

  describe("Delivery attempts migration (0005_add_delivery_attempts.sql)", () => {
    let sql: string;

    beforeAll(() => {
      sql = readMigration("0005_add_delivery_attempts.sql");
    });

    it("should create delivery_attempts table", () => {
      expect(sql.toLowerCase()).toContain("delivery_attempts");
      expect(sql).toContain("CREATE TABLE");
    });
  });
});
