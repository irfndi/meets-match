import { describe, it, expect } from "vitest";
import { NotificationRepository } from "../notification.js";
import { createMockD1, runEffect } from "@meetsmatch/cf-shared/testing";

describe("NotificationRepository extended", () => {
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
      scheduled_at: "2026-02-01T00:00:00Z",
      delivered_at: null,
      failed_at: null,
      last_error: null,
      ...overrides,
    };
  }

  describe("toNotification conversion", () => {
    it("converts all fields including optional dates", async () => {
      const { repo } = createRepo([
        makeRow({
          scheduled_at: "2026-02-01T00:00:00Z",
          delivered_at: "2026-02-02T00:00:00Z",
          failed_at: "2026-02-03T00:00:00Z",
          last_error: "timeout",
          attempt_count: 3,
          max_attempts: 10,
        }),
      ]);
      const result = await runEffect(repo.getById({ notificationId: "n1" }));
      expect(result.id).toBe("n1");
      expect(result.userId).toBe("u1");
      expect(result.type).toBe("NEW_LIKE");
      expect(result.channel).toBe("TELEGRAM");
      expect(result.status).toBe("PENDING");
      expect(result.scheduledAt).toBe("2026-02-01T00:00:00Z");
      expect(result.deliveredAt).toBe("2026-02-02T00:00:00Z");
      expect(result.failedAt).toBe("2026-02-03T00:00:00Z");
      expect(result.errorMessage).toBe("timeout");
      expect(result.retryCount).toBe(3);
      expect(result.maxRetries).toBe(10);
    });
  });

  describe("getDLQStats defaults", () => {
    it("returns zero when DLQ is empty", async () => {
      const { repo } = createRepo([makeRow({ status: "pending" })]);
      const result = await runEffect(repo.getDLQStats());
      expect(result.totalMessages).toBe(0);
    });
  });

  describe("replayDLQ with default limit", () => {
    it("replays all DLQ when no limit specified", async () => {
      const { repo } = createRepo([
        makeRow({ status: "dlq", id: "d1" }),
        makeRow({ status: "dlq", id: "d2" }),
      ]);
      const result = await runEffect(repo.replayDLQ({}));
      expect(result).toBe(2);
    });
  });

  describe("createAttempt with all optional fields", () => {
    it("records attempt with error details", async () => {
      const { repo } = createRepo();
      const result = await runEffect(
        repo.createAttempt("n1", "failed", "timeout", "TIMEOUT", 5000),
      );
      expect(result).toBe(true);
    });

    it("records attempt with only required fields", async () => {
      const { repo } = createRepo();
      const result = await runEffect(repo.createAttempt("n1", "success"));
      expect(result).toBe(true);
    });
  });
});
