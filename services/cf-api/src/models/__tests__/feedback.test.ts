import { describe, it, expect, vi } from "vitest";
import { FeedbackRepository } from "../feedback.js";
import {
  createMockD1,
  runEffect,
} from "../../../../../packages/cf-shared/src/__tests__/__helpers__/test-utils.js";

describe("FeedbackRepository", () => {
  function createRepo() {
    const db = createMockD1();
    return { repo: new FeedbackRepository(db), db };
  }

  it("creates feedback with all fields", async () => {
    const { repo } = createRepo();
    const result = await runEffect(
      repo.create({
        userId: "u1",
        type: "bug",
        message: "Something broke",
        mediaUrl: "https://example.com/img.jpg",
      }),
    );
    expect(result.userId).toBe("u1");
    expect(result.type).toBe("bug");
    expect(result.message).toBe("Something broke");
    expect(result.mediaUrl).toBe("https://example.com/img.jpg");
    expect(result.status).toBe("open");
    expect(result.id).toBeTruthy();
  });

  it("creates feedback with defaults", async () => {
    const { repo } = createRepo();
    const result = await runEffect(repo.create({ userId: "u1" }));
    expect(result.type).toBe("bug");
    expect(result.message).toBeNull();
    expect(result.mediaUrl).toBeNull();
  });

  it("returns DatabaseError on failure", async () => {
    const db = createMockD1(() => {
      throw new Error("DB down");
    });
    const repo = new FeedbackRepository(db);
    await expect(runEffect(repo.create({ userId: "u1" }))).rejects.toThrow();
  });
});
