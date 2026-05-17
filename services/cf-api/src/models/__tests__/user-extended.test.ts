import { describe, it, expect, vi } from "vitest";
import { UserRepository } from "../user.js";
import { createMockD1, runEffect } from "@meetsmatch/cf-shared/testing";
import { NotFoundError } from "@meetsmatch/cf-shared";

describe("UserRepository extended", () => {
  function createRepo(rows: Array<Record<string, unknown>> = []) {
    const db = createMockD1((sql, values) => {
      if (sql.includes("SELECT * FROM users WHERE id")) {
        return { results: rows };
      }
      if (sql.includes("SELECT id FROM users WHERE id")) {
        return { results: rows.length > 0 ? [{ id: values[0] }] : [] };
      }
      if (sql.includes("COUNT(*)")) {
        return { results: [{ c: rows.length }] };
      }
      if (sql.includes("INSERT INTO")) {
        return { results: [], success: true };
      }
      if (sql.includes("UPDATE")) {
        return { results: [], success: true };
      }
      return { results: rows };
    });
    return { repo: new UserRepository(db), db };
  }

  function makeUserRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "u1",
      username: "test",
      first_name: "Test",
      last_name: "User",
      bio: "Hello",
      age: 25,
      birth_date: "1999-01-01",
      gender: "female",
      interests: '["music"]',
      media_urls: '[{"url":"https://example.com/photo.jpg","type":"image"}]',
      location: '{"city":"NYC","country":"USA"}',
      preferences: '{"maxDistance":50}',
      is_active: 1,
      is_sleeping: 0,
      is_profile_complete: 1,
      phone_number: "+1234567890",
      language: "en",
      subscription_tier: "free",
      referral_code: "REF123",
      dm_credits: 0,
      ...overrides,
    };
  }

  describe("getById", () => {
    it("returns user by id", async () => {
      const { repo } = createRepo([makeUserRow()]);
      const user = await runEffect(repo.getById({ userId: "u1" }));
      expect(user.id).toBe("u1");
      expect(user.displayName).toBe("Test");
      expect(user.age).toBe(25);
    });

    it("throws NotFoundError for missing user", async () => {
      const { repo } = createRepo([]);
      await expect(runEffect(repo.getById({ userId: "nope" }))).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe("create", () => {
    it("creates a new user", async () => {
      const { repo } = createRepo([]);
      const user = await runEffect(
        repo.create({
          user: {
            id: "u2",
            displayName: "New",
            age: 30,
            gender: "male",
          } as any,
        }),
      );
      expect(user.id).toBe("u2");
    });

    it("returns existing user without duplicate insert", async () => {
      const { repo } = createRepo([makeUserRow({ id: "u1" })]);
      const user = await runEffect(
        repo.create({
          user: { id: "u1", displayName: "Existing" } as any,
        }),
      );
      expect(user.id).toBe("u1");
    });

    it("computes age from birthDate when age is missing", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-01-01"));
      const { repo, db } = createRepo([]);
      await runEffect(
        repo.create({
          user: {
            id: "u3",
            displayName: "Baby",
            birthDate: "2000-06-01",
          } as any,
        }),
      );
      const insert = db._captured.findLast((c) =>
        c.sql.includes("INSERT INTO users"),
      );
      expect(insert?.values[5]).toBe(23);
      vi.useRealTimers();
    });
  });
});
