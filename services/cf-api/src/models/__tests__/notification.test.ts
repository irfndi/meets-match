import { describe, it, expect, vi } from "vitest";
import { NotificationRepository } from "../notification.js";
import { createMockD1, runEffect } from "@meetsmatch/cf-shared/testing";
import { NotFoundError } from "@meetsmatch/cf-shared";

describe("NotificationRepository", () => {
  function createRepo(rows: Array<Record<string, unknown>> = []) {
    const db = createMockD1((sql, values) => {
      if (sql.includes("SELECT * FROM notifications WHERE id")) {
        return { results: rows };
      }
      if (sql.includes("COUNT(*)")) {
        const statusMatch = sql.match(/status = '(\w+)'/);
        const status = statusMatch ? statusMatch[1] : null;
        const count = status
          ? rows.filter(
              (r) => String(r.status).toLowerCase() === status.toLowerCase(),
            ).length
          : rows.length;
        return { results: [{ c: count }] };
      }
      if (sql.includes("SELECT id FROM notifications WHERE status = 'dlq'")) {
        const dlqRows = rows.filter((r) => r.status === "dlq");
        const limit = values[0] ? Number(values[0]) : dlqRows.length;
        return { results: dlqRows.slice(0, limit) };
      }
      return { results: rows };
    });
    return { repo: new NotificationRepository(db), db };
  }

  function makeRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "n1",
      user_id: "u1",
      type: "NEW_LIKE",
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
      expect(result.pendingCount).toBe(2);
      expect(result.processingCount).toBe(0);
      expect(result.deliveredCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.dlqCount).toBe(1);
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
      expect(result).toBe(2);
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
