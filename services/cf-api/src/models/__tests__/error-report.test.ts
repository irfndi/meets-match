import { describe, it, expect } from "vitest";
import { ErrorReportRepository } from "../error-report.js";
import { createMockD1, runEffect } from "@meetsmatch/cf-shared/testing";

describe("ErrorReportRepository", () => {
  function createRepo(handler?: Parameters<typeof createMockD1>[0]) {
    const db = createMockD1(handler);
    return { repo: new ErrorReportRepository(db), db };
  }

  it("creates error report with all fields", async () => {
    const { repo } = createRepo();
    const result = await runEffect(
      repo.create({
        reporterId: "u1",
        traceId: "trace-123",
        message: "Something broke",
        journey: "match:like",
        severity: "high",
        source: "bot",
        botVersion: "1.0.0",
        apiVersion: "1.0.0",
        workerVersion: "1.0.0",
        errorStack: "at foo.ts:1",
        userLanguage: "en",
        userTier: "premium",
        triggerInput: "/match",
        kvSession: "{}",
        cfMetadata: "{}",
      }),
    );
    expect(result.reporterId).toBe("u1");
    expect(result.traceId).toBe("trace-123");
    expect(result.message).toBe("Something broke");
    expect(result.journey).toBe("match:like");
    expect(result.status).toBe("pending");
    expect(result.severity).toBe("high");
    expect(result.source).toBe("bot");
    expect(result.botVersion).toBe("1.0.0");
    expect(result.alertSent).toBe(0);
    expect(result.id).toBeTruthy();
  });

  it("creates error report with defaults", async () => {
    const { repo } = createRepo();
    const result = await runEffect(repo.create({ reporterId: "u1" }));
    expect(result.severity).toBe("low");
    expect(result.traceId).toBeNull();
    expect(result.message).toBeNull();
    expect(result.journey).toBeNull();
    expect(result.source).toBeNull();
    expect(result.status).toBe("pending");
  });

  it("finds unsent low severity reports", async () => {
    const { repo, db } = createRepo();
    await runEffect(repo.create({ reporterId: "u1", severity: "low" }));
    const reports = await runEffect(repo.findUnsentLowSeverity(10));
    expect(reports.length).toBeGreaterThanOrEqual(0);
    expect(db._captured.length).toBeGreaterThan(0);
  });

  it("marks alerts sent", async () => {
    const { repo, db } = createRepo();
    await runEffect(repo.markAlertsSent(["id1", "id2"]));
    expect(
      db._captured.some((q) => q.sql.includes("UPDATE error_reports")),
    ).toBe(true);
  });

  it("skips markAlertsSent when ids empty", async () => {
    const { repo, db } = createRepo();
    await runEffect(repo.markAlertsSent([]));
    expect(db._captured.length).toBe(0);
  });

  it("returns alert summary", async () => {
    const { repo, db } = createRepo(() => ({
      results: [
        { severity: "low", count: 3, latestAt: "2025-01-01T00:00:00Z" },
        { severity: "high", count: 1, latestAt: "2025-01-01T00:00:00Z" },
      ],
    }));
    const summary = await runEffect(repo.getAlertSummary(6));
    expect(summary.severity).toBe("low");
    expect(summary.count).toBe(3);
    expect(db._captured.length).toBeGreaterThan(0);
  });

  it("returns zero summary when no low rows", async () => {
    const { repo } = createRepo(() => ({ results: [] }));
    const summary = await runEffect(repo.getAlertSummary(6));
    expect(summary.count).toBe(0);
    expect(summary.sources).toEqual([]);
  });

  it("returns DatabaseError on create failure", async () => {
    const { repo } = createRepo(() => {
      throw new Error("DB down");
    });
    await expect(
      runEffect(repo.create({ reporterId: "u1" })),
    ).rejects.toThrow();
  });

  it("finds error report by id", async () => {
    const { repo, db } = createRepo(() => ({
      results: [
        {
          id: "r1",
          reporterId: "u1",
          traceId: "t1",
          message: "msg",
          journey: "j1",
          status: "pending",
          severity: "low",
          alertSent: 0,
          source: "bot",
          botVersion: "1.0.0",
          apiVersion: "1.0.0",
          workerVersion: "1.0.0",
          errorStack: null,
          userLanguage: null,
          userTier: null,
          triggerInput: null,
          kvSession: null,
          cfMetadata: null,
          createdAt: "2025-01-01T00:00:00Z",
        },
      ],
    }));
    const result = await runEffect(repo.findById("r1"));
    expect(result).not.toBeNull();
    expect(result?.id).toBe("r1");
    expect(result?.status).toBe("pending");
    expect(db._captured.length).toBeGreaterThan(0);
  });

  it("returns null when error report not found", async () => {
    const { repo } = createRepo(() => ({ results: [] }));
    const result = await runEffect(repo.findById("nonexistent"));
    expect(result).toBeNull();
  });

  it("updates error report status", async () => {
    const { repo, db } = createRepo(() => ({
      results: [
        {
          id: "r1",
          reporterId: "u1",
          traceId: "t1",
          message: "msg",
          journey: "j1",
          status: "reviewed",
          severity: "low",
          alertSent: 0,
          source: "bot",
          botVersion: "1.0.0",
          apiVersion: "1.0.0",
          workerVersion: "1.0.0",
          errorStack: null,
          userLanguage: null,
          userTier: null,
          triggerInput: null,
          kvSession: null,
          cfMetadata: null,
          createdAt: "2025-01-01T00:00:00Z",
        },
      ],
    }));
    const result = await runEffect(repo.updateStatus("r1", "reviewed"));
    expect(result.status).toBe("reviewed");
    expect(result.id).toBe("r1");
    expect(
      db._captured.some((q) =>
        q.sql.includes("UPDATE error_reports SET status = ?"),
      ),
    ).toBe(true);
  });

  it("throws NotFoundError when updating nonexistent report", async () => {
    const { repo } = createRepo(() => ({ results: [] }));
    await expect(
      runEffect(repo.updateStatus("nonexistent", "reviewed")),
    ).rejects.toThrow();
  });
});
