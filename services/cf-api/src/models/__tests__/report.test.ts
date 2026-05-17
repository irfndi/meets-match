import { describe, it, expect } from "vitest";
import { ReportRepository } from "../report.js";
import {
  createMockD1,
  runEffect,
} from "../../../../../packages/cf-shared/src/__tests__/__helpers__/test-utils.js";

describe("ReportRepository", () => {
  function createRepo() {
    const db = createMockD1();
    return { repo: new ReportRepository(db), db };
  }

  it("creates a report with all fields", async () => {
    const { repo } = createRepo();
    const result = await runEffect(
      repo.create({
        reporterId: "u1",
        reportedId: "u2",
        reason: "Inappropriate content",
        mediaUrl: "https://example.com/evidence.jpg",
      }),
    );
    expect(result.reporterId).toBe("u1");
    expect(result.reportedId).toBe("u2");
    expect(result.reason).toBe("Inappropriate content");
    expect(result.mediaUrl).toBe("https://example.com/evidence.jpg");
    expect(result.status).toBe("pending");
    expect(result.id).toBeTruthy();
  });

  it("creates a report with defaults", async () => {
    const { repo } = createRepo();
    const result = await runEffect(
      repo.create({ reporterId: "u1", reportedId: "u2" }),
    );
    expect(result.reason).toBeNull();
    expect(result.mediaUrl).toBeNull();
    expect(result.status).toBe("pending");
  });

  it("returns DatabaseError on failure", async () => {
    const db = createMockD1(() => {
      throw new Error("DB down");
    });
    const repo = new ReportRepository(db);
    await expect(
      runEffect(repo.create({ reporterId: "u1", reportedId: "u2" })),
    ).rejects.toThrow();
  });
});
