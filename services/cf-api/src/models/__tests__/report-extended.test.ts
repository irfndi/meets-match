import { describe, it, expect } from "vitest";
import { ReportRepository } from "../report.js";
import { createMockD1, runEffect } from "@meetsmatch/cf-shared/testing";

describe("ReportRepository extended", () => {
  function createRepo() {
    const db = createMockD1();
    return { repo: new ReportRepository(db), db };
  }

  it("creates report and verifies all fields", async () => {
    const { repo } = createRepo();
    const result = await runEffect(
      repo.create({
        reporterId: "u1",
        reportedId: "u2",
        reason: "Harassment",
        mediaUrl: "https://example.com/report.jpg",
      }),
    );
    expect(result.id).toBeTruthy();
    expect(result.reporterId).toBe("u1");
    expect(result.reportedId).toBe("u2");
    expect(result.reason).toBe("Harassment");
    expect(result.mediaUrl).toBe("https://example.com/report.jpg");
    expect(result.status).toBe("pending");
    expect(result.createdAt).toBeTruthy();
  });

  it("verifies report ID is a valid UUID", async () => {
    const { repo } = createRepo();
    const result = await runEffect(
      repo.create({ reporterId: "u1", reportedId: "u2" }),
    );
    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("returns DatabaseError on DB failure", async () => {
    const db = createMockD1(() => {
      throw new Error("Connection refused");
    });
    const repo = new ReportRepository(db);
    await expect(
      runEffect(repo.create({ reporterId: "u1", reportedId: "u2" })),
    ).rejects.toThrow();
  });
});
