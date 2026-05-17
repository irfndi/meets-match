import { describe, it, expect, vi } from "vitest";
import { profileCommand } from "../profile.js";

describe("profile handler", () => {
  function createCtx(overrides: Record<string, unknown> = {}) {
    return {
      from: { id: 123, first_name: "Test" },
      chat: { id: 123 },
      reply: vi.fn(async () => {}),
      replyWithPhoto: vi.fn(async () => {}),
      replyWithVideo: vi.fn(async () => {}),
      ...overrides,
    } as any;
  }

  function createEnv(userOverrides: Record<string, unknown> = {}) {
    return {
      API_SERVICE: {
        fetch: vi.fn(async () => ({
          ok: true,
          json: async () => ({
            user: {
              id: "123",
              displayName: "Alice",
              age: 25,
              gender: "female",
              bio: "Hello",
              location: {
                city: "NYC",
                country: "USA",
                latitude: 40.7,
                longitude: -74,
              },
              interests: ["music", "travel"],
              mediaUrls: [],
              isProfileComplete: true,
              phoneNumber: "+1234567890",
              ...userOverrides,
            },
          }),
          text: async () => "ok",
        })),
      },
      KV: {
        get: vi.fn(async () => null),
        put: vi.fn(async () => {}),
        delete: vi.fn(async () => {}),
      },
    } as any;
  }

  it("shows profile for complete user", async () => {
    const ctx = createCtx();
    const env = createEnv();

    await profileCommand(ctx, env);
    expect(ctx.reply).toHaveBeenCalled();
    const call = (ctx.reply as any).mock.calls[0];
    expect(call[0]).toContain("Alice");
    expect(call[0]).toContain("25");
  });

  it("shows incomplete profile with missing fields", async () => {
    const ctx = createCtx();
    const env = createEnv({
      age: undefined,
      gender: undefined,
      bio: undefined,
      location: undefined,
      interests: undefined,
      isProfileComplete: false,
    });

    await profileCommand(ctx, env);
    expect(ctx.reply).toHaveBeenCalled();
    const call = (ctx.reply as any).mock.calls[0];
    expect(call[0]).toContain("Incomplete");
  });

  it("shows photo when available", async () => {
    const ctx = createCtx();
    const env = createEnv({
      mediaUrls: [{ url: "https://example.com/photo.jpg", type: "image" }],
    });

    await profileCommand(ctx, env);
    expect(ctx.replyWithPhoto).toHaveBeenCalled();
  });

  it("shows video when available", async () => {
    const ctx = createCtx();
    const env = createEnv({
      mediaUrls: [{ url: "https://example.com/video.mp4", type: "video" }],
    });

    await profileCommand(ctx, env);
    expect(ctx.replyWithVideo).toHaveBeenCalled();
  });

  it("handles missing ctx.from", async () => {
    const ctx = createCtx({ from: undefined });
    const env = createEnv();

    await profileCommand(ctx, env);
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("Could not identify"),
    );
  });

  it("handles API failure gracefully", async () => {
    const ctx = createCtx();
    const env = {
      API_SERVICE: {
        fetch: vi.fn(async () => ({
          ok: false,
          status: 500,
          text: async () => "error",
        })),
      },
      KV: {
        get: vi.fn(async () => null),
        put: vi.fn(async () => {}),
        delete: vi.fn(async () => {}),
      },
    } as any;

    await profileCommand(ctx, env);
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("Sorry, something went wrong"),
    );
  });

  it("falls back to text reply on media send error", async () => {
    const ctx = createCtx({
      replyWithPhoto: vi.fn(async () => {
        throw new Error("send failed");
      }),
    });
    const env = createEnv({
      mediaUrls: [{ url: "https://example.com/photo.jpg", type: "image" }],
    });

    await profileCommand(ctx, env);
    expect(ctx.reply).toHaveBeenCalled();
  });
});
