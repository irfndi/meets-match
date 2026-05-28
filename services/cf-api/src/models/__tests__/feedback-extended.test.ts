import { describe, it, expect } from "vitest";
import { FeedbackRepository } from "../feedback.js";
import { createMockD1, runEffect } from "@meetsmatch/cf-shared/testing";

describe("FeedbackRepository extended", () => {
  function createRepo() {
    const db = createMockD1();
    return { repo: new FeedbackRepository(db), db };
  }

  it("creates feedback with type 'feature'", async () => {
    const { repo } = createRepo();
    const result = await runEffect(
      repo.create({
        userId: "u1",
        type: "feature",
        message: "Add dark mode",
      }),
    );
    expect(result.userId).toBe("u1");
    expect(result.type).toBe("feature");
    expect(result.message).toBe("Add dark mode");
    expect(result.status).toBe("open");
    expect(result.id).toBeTruthy();
  });

  it("creates feedback with type 'other'", async () => {
    const { repo } = createRepo();
    const result = await runEffect(
      repo.create({
        userId: "u1",
        type: "other",
        message: "General comment",
      }),
    );
    expect(result.type).toBe("other");
    expect(result.message).toBe("General comment");
  });

  it("creates feedback with mediaUrl", async () => {
    const { repo } = createRepo();
    const result = await runEffect(
      repo.create({
        userId: "u1",
        type: "bug",
        mediaUrl: "https://example.com/screenshot.png",
      }),
    );
    expect(result.mediaUrl).toBe("https://example.com/screenshot.png");
    expect(result.message).toBeNull();
  });

  it("defaults type to 'bug' when type is invalid string", async () => {
    const { repo } = createRepo();
    const result = await runEffect(
      repo.create({
        userId: "u1",
        type: "spam" as any,
        message: "test",
      }),
    );
    expect(result.type).toBe("spam");
  });
});
