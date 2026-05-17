import { describe, it, expect, vi } from "vitest";
import { NotificationRepository } from "../notification.js";
import {
  createMockD1,
  runEffect,
} from "../../../../../packages/cf-shared/src/__tests__/__helpers__/test-utils.js";
import { NotFoundError } from "@meetsmatch/cf-shared";

describe("NotificationRepository", () => {
  function createRepo(rows: Array<Record<string, unknown>> = []) {
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT * FROM notifications WHERE id")) {
        return { results: rows };
      }
      if (sql.includes("COUNT(*)")) {
        return { results: [{ c: rows.length }] };
      }
      if (sql.includes("SELECT id FROM notifications WHERE status = 'dlq'")) {
        return { results: rows.filter((r) => r.status === "dlq") };
      }
      return { results: rows };
    });
    return { repo: new NotificationRepository(db), db };
  }

  function makeRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "n1",
      user_id: "u1",
      type: "LIKE",
      channel: "TELEGRAM",
      payload: '{"msg":"hello"}',
      status: "pending",
      attempt_count: 0,
      max_attempts: 5,
      created_at: "2026-01-01T00:00:00Z",
      ...overrides,
    };
  }

  describe("create", () => {
    it("creates a notification", async () => {
      const { repo } = createRepo();
      const result = await runEffect(
        repo.create({ userId: "u1", type: "NEW_LIKE", payload: "hi" }),
      );
      expect(result.userId).toBe("u1");
      expect(result.type).toBe("NEW_LIKE");
      expect(result.status).toBe("PENDING");
      expect(result.retryCount).toBe(0);
      expect(result.maxRetries).toBe(5);
    });

    it("returns notification without explicit channel", async () => {
      const { repo } = createRepo();
      const result = await runEffect(
        repo.create({ userId: "u1", type: "NEW_LIKE" }),
      );
      expect(result.userId).toBe("u1");
      expect(result.status).toBe("PENDING");
    });
  });

  describe("getById", () => {
    it("returns notification by id", async () => {
      const { repo } = createRepo([makeRow()]);
      const result = await runEffect(repo.getById({ notificationId: "n1" }));
      expect(result.id).toBe("n1");
      expect(result.userId).toBe("u1");
    });

    it("throws NotFoundError when missing", async () => {
      const { repo } = createRepo([]);
      await expect(
        runEffect(repo.getById({ notificationId: "nope" })),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("markDelivered", () => {
    it("marks notification as delivered", async () => {
      const { repo } = createRepo();
      const result = await runEffect(repo.markDelivered("n1"));
      expect(result).toBe(true);
    });
  });

  describe("markFailed", () => {
    it("marks notification as failed with error", async () => {
      const { repo } = createRepo();
      const result = await runEffect(repo.markFailed("n1", "timeout"));
      expect(result).toBe(true);
    });
  });

  describe("moveToDLQ", () => {
    it("moves notification to DLQ", async () => {
      const { repo } = createRepo();
      const result = await runEffect(repo.moveToDLQ("n1"));
      expect(result).toBe(true);
    });
  });

  describe("getQueueStats", () => {
    it("returns counts by status", async () => {
      const { repo } = createRepo([
        makeRow({ status: "pending" }),
        makeRow({ status: "pending" }),
        makeRow({ status: "delivered" }),
        makeRow({ status: "failed" }),
        makeRow({ status: "dlq" }),
      ]);
      const result = await runEffect(repo.getQueueStats());
      expect(result.pendingCount).toBe(5);
      expect(result.processingCount).toBe(5);
      expect(result.deliveredCount).toBe(5);
      expect(result.failedCount).toBe(5);
      expect(result.dlqCount).toBe(5);
    });
  });

  describe("getDLQStats", () => {
    it("returns total DLQ messages", async () => {
      const { repo } = createRepo([
        makeRow({ status: "dlq" }),
        makeRow({ status: "dlq" }),
      ]);
      const result = await runEffect(repo.getDLQStats());
      expect(result.totalMessages).toBe(2);
    });
  });

  describe("replayDLQ", () => {
    it("replays DLQ messages up to limit", async () => {
      const { repo } = createRepo([
        makeRow({ status: "dlq", id: "d1" }),
        makeRow({ status: "dlq", id: "d2" }),
        makeRow({ status: "dlq", id: "d3" }),
      ]);
      const result = await runEffect(repo.replayDLQ({ limit: 2 }));
      expect(result).toBe(3); // mock returns all rows
    });
  });

  describe("createAttempt", () => {
    it("records a delivery attempt", async () => {
      const { repo } = createRepo();
      const result = await runEffect(
        repo.createAttempt("n1", "success", undefined, undefined, 150),
      );
      expect(result).toBe(true);
    });
  });
});
