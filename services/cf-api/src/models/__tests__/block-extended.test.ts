import { describe, it, expect } from "vitest";
import { BlockRepository } from "../block.js";
import { createMockD1, runEffect } from "@meetsmatch/cf-shared/testing";
import { ValidationError } from "@meetsmatch/cf-shared";

describe("BlockRepository extended", () => {
  function createRepo(rows: Array<Record<string, unknown>> = []) {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT blocked_id")) return { results: rows };
      if (sql.includes("SELECT 1 FROM blocks"))
        return { results: rows.length > 0 ? [{ c: 1 }] : [] };
      return { results: rows };
    });
    return { repo: new BlockRepository(db), db };
  }

  describe("unblock edge cases", () => {
    it("returns DatabaseError on DB failure", async () => {
      const db = createMockD1(() => {
        throw new Error("DB down");
      });
      const repo = new BlockRepository(db);
      await expect(
        runEffect(repo.unblock({ blockerId: "u1", blockedId: "u2" })),
      ).rejects.toThrow();
    });
  });

  describe("getBlockedIds edge cases", () => {
    it("returns blocked ids with additional entries", async () => {
      const { repo } = createRepo([
        { blocked_id: "u2" },
        { blocked_id: "u3" },
        { blocked_id: "u4" },
      ]);
      const result = await runEffect(repo.getBlockedIds({ blockerId: "u1" }));
      expect(result).toHaveLength(3);
      expect(result).toEqual(["u2", "u3", "u4"]);
    });

    it("handles null results from DB", async () => {
      const db = createMockD1((sql) => {
        if (sql.includes("SELECT blocked_id")) return { results: [] };
        return { results: [] };
      });
      const repo = new BlockRepository(db);
      const result = await runEffect(repo.getBlockedIds({ blockerId: "u1" }));
      expect(result).toEqual([]);
    });
  });

  describe("isBlocked edge cases", () => {
    it("checks bidirectional block", async () => {
      const { repo } = createRepo([{ c: 1 }]);
      const result = await runEffect(
        repo.isBlocked({ userId: "u1", otherUserId: "u2" }),
      );
      expect(result).toBe(true);
    });

    it("returns false for no block relationship", async () => {
      const { repo } = createRepo([]);
      const result = await runEffect(
        repo.isBlocked({ userId: "u1", otherUserId: "u2" }),
      );
      expect(result).toBe(false);
    });
  });
});
