import { describe, it, expect } from "vitest";
import { ErrorReportRepository } from "../error-report.js";
import { createMockD1, runEffect } from "@meetsmatch/cf-shared/testing";
import { NotFoundError } from "@meetsmatch/cf-shared";

describe("ErrorReportRepository extended", () => {
  function createRepo(handler?: Parameters<typeof createMockD1>[0]) {
    const db = createMockD1(handler);
    return { repo: new ErrorReportRepository(db), db };
  }

  it("finds unsent low severity reports with data", async () => {
    const { repo } = createRepo((sql) => {
      if (sql.includes("SELECT id, reporter_id as reporterId")) {
        return {
          results: [
            {
              id: "r1",
              reporterId: "u1",
              traceId: "t1",
              message: "error 1",
              journey: null,
              status: "pending",
              severity: "low",
              alertSent: 0,
              source: "bot",
              botVersion: "1.0",
              apiVersion: "1.0",
              workerVersion: "1.0",
              errorStack: null,
              userLanguage: "en",
              userTier: "free",
              triggerInput: null,
              kvSession: null,
              cfMetadata: null,
              createdAt: "2025-01-01",
              updatedAt: null,
            },
            {
              id: "r2",
              reporterId: "u2",
              traceId: "t2",
              message: "error 2",
              journey: null,
              status: "pending",
              severity: "low",
              alertSent: 0,
              source: "api",
              botVersion: "1.0",
              apiVersion: "1.0",
              workerVersion: "1.0",
              errorStack: null,
              userLanguage: null,
              userTier: null,
              triggerInput: null,
              kvSession: null,
              cfMetadata: null,
              createdAt: "2025-01-02",
              updatedAt: null,
            },
          ],
        };
      }
      return { results: [] };
    });
    const reports = await runEffect(repo.findUnsentLowSeverity(10));
    expect(reports).toHaveLength(2);
    expect(reports[0].id).toBe("r1");
    expect(reports[1].id).toBe("r2");
  });

  it("updates status to dismissed", async () => {
    const { repo, db } = createRepo((sql) => {
      if (sql.includes("UPDATE error_reports SET status")) {
        return {
          results: [
            {
              id: "r1",
              reporterId: "u1",
              traceId: null,
              message: null,
              journey: null,
              status: "dismissed",
              severity: "low",
              alertSent: 0,
              source: null,
              botVersion: null,
              apiVersion: null,
              workerVersion: null,
              errorStack: null,
              userLanguage: null,
              userTier: null,
              triggerInput: null,
              kvSession: null,
              cfMetadata: null,
              createdAt: "2025-01-01",
              updatedAt: "2025-01-02",
            },
          ],
          success: true,
          meta: { changes: 1 },
        };
      }
      return { results: [] };
    });
    const result = await runEffect(repo.updateStatus("r1", "dismissed"));
    expect(result.status).toBe("dismissed");
    expect(result.id).toBe("r1");
    expect(
      db._captured.some((q) =>
        q.sql.includes("UPDATE error_reports SET status = ?"),
      ),
    ).toBe(true);
  });

  it("returns appropriate fields for create with all fields set", async () => {
    const { repo } = createRepo();
    const dateBefore = new Date().toISOString();
    const result = await runEffect(
      repo.create({
        reporterId: "u1",
        traceId: "trace-123",
        message: "Something went wrong",
        journey: "match:like",
        severity: "high",
        source: "api",
        botVersion: "2.0.0",
        apiVersion: "1.5.0",
        workerVersion: "1.2.0",
        errorStack: "Error: test\n  at foo:1:2",
        userLanguage: "en",
        userTier: "free",
        triggerInput: "/start",
        kvSession: '{"state":"active"}',
        cfMetadata: '{"country":"US"}',
      }),
    );
    const dateAfter = new Date().toISOString();
    expect(result.id).toBeTruthy();
    expect(result.reporterId).toBe("u1");
    expect(result.traceId).toBe("trace-123");
    expect(result.message).toBe("Something went wrong");
    expect(result.journey).toBe("match:like");
    expect(result.status).toBe("pending");
    expect(result.severity).toBe("high");
    expect(result.alertSent).toBe(0);
    expect(result.source).toBe("api");
    expect(result.botVersion).toBe("2.0.0");
    expect(result.apiVersion).toBe("1.5.0");
    expect(result.workerVersion).toBe("1.2.0");
    expect(result.errorStack).toBe("Error: test\n  at foo:1:2");
    expect(result.userLanguage).toBe("en");
    expect(result.userTier).toBe("free");
    expect(result.triggerInput).toBe("/start");
    expect(result.kvSession).toBe('{"state":"active"}');
    expect(result.cfMetadata).toBe('{"country":"US"}');
    expect(
      result.createdAt >= dateBefore && result.createdAt <= dateAfter,
    ).toBe(true);
  });
});
