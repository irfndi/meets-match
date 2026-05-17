import { describe, it, expect } from "vitest";
import { BlockRepository } from "../block.js";
import { createMockD1, runEffect } from "@meetsmatch/cf-shared/testing";
import { ValidationError } from "@meetsmatch/cf-shared";

describe("BlockRepository", () => {
  function createRepo(rows: Array<Record<string, unknown>> = []) {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT blocked_id")) return { results: rows };
      if (sql.includes("SELECT 1 FROM blocks"))
        return { results: rows.length > 0 ? [{ c: 1 }] : [] };
      if (sql.includes("COUNT(*)")) return { results: [{ c: rows.length }] };
      return { results: rows };
    });
    return { repo: new BlockRepository(db), db };
  }

  describe("block", () => {
    it("blocks a user successfully", async () => {
      const { repo } = createRepo();
      const result = await runEffect(
        repo.block({ blockerId: "u1", blockedId: "u2" }),
      );
      expect(result.success).toBe(true);
    });

    it("prevents self-blocking", async () => {
      const { repo } = createRepo();
      await expect(
        runEffect(repo.block({ blockerId: "u1", blockedId: "u1" })),
      ).rejects.toThrow(ValidationError);
    });

    it("returns DatabaseError on DB failure", async () => {
      const db = createMockD1(() => {
        throw new Error("DB down");
      });
      const repo = new BlockRepository(db);
      await expect(
        runEffect(repo.block({ blockerId: "u1", blockedId: "u2" })),
      ).rejects.toThrow();
    });
  });

  describe("unblock", () => {
    it("unblocks a user successfully", async () => {
      const { repo } = createRepo();
      const result = await runEffect(
        repo.unblock({ blockerId: "u1", blockedId: "u2" }),
      );
      expect(result.success).toBe(true);
    });

    it("prevents self-unblocking", async () => {
      const { repo } = createRepo();
      await expect(
        runEffect(repo.unblock({ blockerId: "u1", blockedId: "u1" })),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("getBlockedIds", () => {
    it("returns list of blocked ids", async () => {
      const { repo } = createRepo([{ blocked_id: "u2" }, { blocked_id: "u3" }]);
      const result = await runEffect(repo.getBlockedIds({ blockerId: "u1" }));
      expect(result).toEqual(["u2", "u3"]);
    });

    it("returns empty array when no blocks", async () => {
      const { repo } = createRepo([]);
      const result = await runEffect(repo.getBlockedIds({ blockerId: "u1" }));
      expect(result).toEqual([]);
    });
  });

  describe("isBlocked", () => {
    it("returns true when users have blocked each other", async () => {
      const { repo } = createRepo([{ c: 1 }]);
      const result = await runEffect(
        repo.isBlocked({ userId: "u1", otherUserId: "u2" }),
      );
      expect(result).toBe(true);
    });

    it("returns false when no block exists", async () => {
      const { repo } = createRepo([]);
      const result = await runEffect(
        repo.isBlocked({ userId: "u1", otherUserId: "u2" }),
      );
      expect(result).toBe(false);
    });
  });
});
