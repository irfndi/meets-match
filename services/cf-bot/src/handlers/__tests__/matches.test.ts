import { describe, it, expect, vi, beforeEach } from "vitest";
import { matchesCommand, matchesCallbacks } from "../matches.js";
import { addNotification } from "../../lib/notifications.js";
import type { MyContext } from "../../types.js";

function mockKV() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    _store: store,
  };
}

function mockCtx(overrides?: Partial<MyContext>): MyContext {
  return {
    reply: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    editMessageText: vi.fn().mockResolvedValue(undefined),
    replyWithPhoto: vi.fn().mockResolvedValue(undefined),
    replyWithVideo: vi.fn().mockResolvedValue(undefined),
    from: { id: 123, first_name: "Test", is_bot: false, language_code: "en" },
    callbackQuery: {
      id: "cb1",
      from: { id: 123, is_bot: false, first_name: "Test" },
      data: "",
      message: { message_id: 1, chat: { id: 123, type: "private" }, date: 1 },
    },
    chat: { id: 123, type: "private" },
    ...overrides,
  } as unknown as MyContext;
}

function createMockApiService(responseMap: Record<string, () => Response>) {
  return {
    fetch: vi.fn().mockImplementation((req: Request) => {
      const url =
        typeof req === "string" ? req : (req as any).url || String(req);
      const sortedPatterns = Object.entries(responseMap).sort(
        (a, b) => b[0].length - a[0].length,
      );
      for (const [pattern, factory] of sortedPatterns) {
        if (url.includes(pattern)) return Promise.resolve(factory());
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 404 }));
    }),
  };
}

const completeUser = {
  id: "123",
  displayName: "Test",
  birthDate: "1999-03-15",
  age: 25,
  gender: "male",
  bio: "Hello",
  location: { city: "Jakarta", country: "Indonesia" },
  interests: ["Hiking"],
  mediaUrls: [{ url: "test", type: "image", uploadedAt: "2024-01-01" }],
  phoneNumber: "+1234567890",
  isProfileComplete: true,
  language: "en",
};

describe("Matches Handlers", () => {
  let kv: ReturnType<typeof mockKV>;
  let ctx: MyContext;
  let env: any;

  beforeEach(() => {
    kv = mockKV();
    ctx = mockCtx();
    env = {
      KV: kv as unknown as KVNamespace,
      API_SERVICE: createMockApiService({
        "/users/123": () =>
          new Response(JSON.stringify({ user: completeUser }), { status: 200 }),
        "/matches?userId=123": () =>
          new Response(JSON.stringify({ matches: [] }), { status: 200 }),
        "/users/123/pending-likes": () =>
          new Response(JSON.stringify({ pendingLikes: [] }), { status: 200 }),
      }),
    };
  });

  describe("matchesCommand", () => {
    it("should show no matches for empty state", async () => {
      await matchesCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("No matches"),
        expect.anything(),
      );
    });

    it("should show mutual matches when they exist", async () => {
      env.API_SERVICE = createMockApiService({
        "/users/123": () =>
          new Response(JSON.stringify({ user: completeUser }), { status: 200 }),
        "/matches?userId=123": () =>
          new Response(
            JSON.stringify({
              matches: [
                {
                  id: "m1",
                  user1Id: "123",
                  user2Id: "456",
                  status: "MATCHED",
                  matched_at: "2024-01-01",
                },
              ],
            }),
            { status: 200 },
          ),
        "/users/123/pending-likes": () =>
          new Response(JSON.stringify({ pendingLikes: [] }), { status: 200 }),
        "/users/456": () =>
          new Response(
            JSON.stringify({
              user: { id: "456", displayName: "Alice", age: 24 },
            }),
            { status: 200 },
          ),
      });
      await matchesCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledTimes(3);
    });

    it("should show pending likes when they exist", async () => {
      env.API_SERVICE = createMockApiService({
        "/users/123/pending-likes": () =>
          new Response(
            JSON.stringify({
              pendingLikes: [{ id: "456", displayName: "Alice", age: 24 }],
            }),
            { status: 200 },
          ),
        "/users/123": () =>
          new Response(JSON.stringify({ user: completeUser }), { status: 200 }),
        "/matches?userId=123": () =>
          new Response(JSON.stringify({ matches: [] }), { status: 200 }),
      });
      await matchesCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("liked"),
        expect.anything(),
      );
    });

    it("should show incomplete profile warning when profile is incomplete", async () => {
      env.API_SERVICE = createMockApiService({
        "/users/123": () =>
          new Response(
            JSON.stringify({
              user: {
                id: "123",
                displayName: "Test",
                isProfileComplete: false,
              },
            }),
            { status: 200 },
          ),
      });
      await matchesCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Almost there"),
        expect.anything(),
      );
    });

    it("should prompt phone verification when phone is not set", async () => {
      env.API_SERVICE = createMockApiService({
        "/users/123": () =>
          new Response(
            JSON.stringify({
              user: {
                id: "123",
                displayName: "Test",
                birthDate: "1999-03-15",
                gender: "male",
                bio: "Hello",
                location: { city: "Jakarta", country: "Indonesia" },
                interests: ["Hiking"],
                mediaUrls: [{ url: "test", type: "image" }],
                phoneNumber: "",
                isProfileComplete: true,
                language: "en",
              },
            }),
            { status: 200 },
          ),
      });
      await matchesCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("verify your phone"),
        expect.any(Object),
      );
    });

    it("should handle API failure in ensureUserExists", async () => {
      env.API_SERVICE = createMockApiService({
        "/users/123": () =>
          new Response(JSON.stringify({ error: "fail" }), { status: 500 }),
      });
      await matchesCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Sorry, something went wrong"),
      );
    });

    it("should handle missing ctx.from", async () => {
      (ctx as any).from = undefined;
      await matchesCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Could not identify"),
      );
    });

    it("should show mutual match notification when present", async () => {
      await addNotification(env, "123", {
        type: "mutual_match",
        matchId: "m99",
        otherUserId: "999",
        otherDisplayName: "Bob",
        otherUsername: "bob_telegram",
        timestamp: "t1",
      });
      env.API_SERVICE = createMockApiService({
        "/users/123": () =>
          new Response(JSON.stringify({ user: completeUser }), { status: 200 }),
        "/matches?userId=123": () =>
          new Response(JSON.stringify({ matches: [] }), { status: 200 }),
        "/users/123/pending-likes": () =>
          new Response(JSON.stringify({ pendingLikes: [] }), { status: 200 }),
      });
      await matchesCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("new mutual match"),
      );
    });

    it("should show like notification when present", async () => {
      await addNotification(env, "123", {
        type: "like",
        fromUserId: "888",
        fromDisplayName: "Charlie",
        timestamp: "t1",
      });
      env.API_SERVICE = createMockApiService({
        "/users/123": () =>
          new Response(JSON.stringify({ user: completeUser }), { status: 200 }),
        "/matches?userId=123": () =>
          new Response(JSON.stringify({ matches: [] }), { status: 200 }),
        "/users/123/pending-likes": () =>
          new Response(JSON.stringify({ pendingLikes: [] }), { status: 200 }),
      });
      await matchesCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("liked your profile"),
        expect.anything(),
      );
    });

    it("should handle fetchMutualMatches failure gracefully", async () => {
      env.API_SERVICE = createMockApiService({
        "/users/123": () =>
          new Response(JSON.stringify({ user: completeUser }), { status: 200 }),
        "/matches?userId=123": () =>
          new Response(JSON.stringify({ error: "fail" }), { status: 500 }),
        "/users/123/pending-likes": () =>
          new Response(JSON.stringify({ pendingLikes: [] }), { status: 200 }),
      });
      await matchesCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("No matches"),
        expect.anything(),
      );
    });

    it("should handle fetchPendingLikes failure gracefully", async () => {
      env.API_SERVICE = createMockApiService({
        "/users/123": () =>
          new Response(JSON.stringify({ user: completeUser }), { status: 200 }),
        "/matches?userId=123": () =>
          new Response(JSON.stringify({ matches: [] }), { status: 200 }),
        "/users/123/pending-likes": () =>
          new Response(JSON.stringify({ error: "fail" }), { status: 500 }),
      });
      await matchesCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("No matches"),
        expect.anything(),
      );
    });

    it("should handle user fetch failure for mutual match gracefully", async () => {
      env.API_SERVICE = createMockApiService({
        "/users/123": () =>
          new Response(JSON.stringify({ user: completeUser }), { status: 200 }),
        "/matches?userId=123": () =>
          new Response(
            JSON.stringify({
              matches: [
                {
                  id: "m1",
                  user1Id: "123",
                  user2Id: "999",
                  status: "MATCHED",
                  matched_at: "2024-01-01",
                },
              ],
            }),
            { status: 200 },
          ),
        "/users/123/pending-likes": () =>
          new Response(JSON.stringify({ pendingLikes: [] }), { status: 200 }),
        "/users/999": () =>
          new Response(JSON.stringify({ error: "fail" }), { status: 500 }),
      });
      await matchesCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalled();
    });

    it("should handle reply error and show trace ID", async () => {
      ctx.reply = vi
        .fn()
        .mockRejectedValueOnce(new Error("telegram error"))
        .mockResolvedValue(undefined);
      env.API_SERVICE = createMockApiService({
        "/users/123": () =>
          new Response(JSON.stringify({ user: completeUser }), { status: 200 }),
        "/matches?userId=123": () =>
          new Response(JSON.stringify({ matches: [] }), { status: 200 }),
        "/users/123/pending-likes": () =>
          new Response(JSON.stringify({ pendingLikes: [] }), { status: 200 }),
      });
      await matchesCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Trace ID:"),
        expect.anything(),
      );
    });

    it("should show mutual match with photo when user has image media", async () => {
      env.API_SERVICE = createMockApiService({
        "/users/123": () =>
          new Response(JSON.stringify({ user: completeUser }), { status: 200 }),
        "/matches?userId=123": () =>
          new Response(
            JSON.stringify({
              matches: [
                {
                  id: "m1",
                  user1Id: "123",
                  user2Id: "456",
                  status: "MATCHED",
                  matched_at: "2024-01-01",
                },
              ],
            }),
            { status: 200 },
          ),
        "/users/123/pending-likes": () =>
          new Response(JSON.stringify({ pendingLikes: [] }), { status: 200 }),
        "/users/456": () =>
          new Response(
            JSON.stringify({
              user: {
                id: "456",
                displayName: "Alice",
                age: 24,
                bio: "Hi",
                mediaUrls: [
                  { url: "https://example.com/pic.jpg", type: "image" },
                ],
              },
            }),
            { status: 200 },
          ),
      });
      await matchesCommand(ctx, env);
      expect(ctx.replyWithPhoto).toHaveBeenCalledWith(
        expect.stringContaining("pic.jpg"),
        expect.objectContaining({
          caption: expect.stringContaining("Alice"),
          parse_mode: "Markdown",
        }),
      );
    });

    it("should show mutual match with video when user has video media", async () => {
      env.API_SERVICE = createMockApiService({
        "/users/123": () =>
          new Response(JSON.stringify({ user: completeUser }), { status: 200 }),
        "/matches?userId=123": () =>
          new Response(
            JSON.stringify({
              matches: [
                {
                  id: "m1",
                  user1Id: "123",
                  user2Id: "456",
                  status: "MATCHED",
                  matched_at: "2024-01-01",
                },
              ],
            }),
            { status: 200 },
          ),
        "/users/123/pending-likes": () =>
          new Response(JSON.stringify({ pendingLikes: [] }), { status: 200 }),
        "/users/456": () =>
          new Response(
            JSON.stringify({
              user: {
                id: "456",
                displayName: "Alice",
                age: 24,
                mediaUrls: [
                  { url: "https://example.com/vid.mp4", type: "video" },
                ],
              },
            }),
            { status: 200 },
          ),
      });
      await matchesCommand(ctx, env);
      expect(ctx.replyWithVideo).toHaveBeenCalledWith(
        expect.stringContaining("vid.mp4"),
        expect.objectContaining({
          caption: expect.stringContaining("Alice"),
        }),
      );
    });
  });

  describe("matchesCallbacks", () => {
    it("should dismiss all like notifications", async () => {
      ctx.callbackQuery!.data = "likes:dismiss";
      await addNotification(env, "123", {
        type: "like",
        fromUserId: "456",
        fromDisplayName: "Alice",
        timestamp: "t1",
      });
      await addNotification(env, "123", {
        type: "like",
        fromUserId: "789",
        fromDisplayName: "Bob",
        timestamp: "t2",
      });
      await matchesCallbacks(ctx, env);
      expect(ctx.editMessageText).toHaveBeenCalled();
      const remaining = await kv.get("notifications:123");
      expect(remaining).toBeNull();
    });

    it("should handle likes:view callback", async () => {
      ctx.callbackQuery!.data = "likes:view:456";
      env.API_SERVICE = createMockApiService({
        "/users/456": () =>
          new Response(
            JSON.stringify({
              user: {
                id: "456",
                displayName: "Alice",
                age: 24,
                bio: "Hello",
                interests: ["Reading"],
              },
            }),
            { status: 200 },
          ),
      });
      await matchesCallbacks(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Alice"),
        expect.objectContaining({ reply_markup: expect.anything() }),
      );
    });

    it("should handle likes:view with user fetch failure", async () => {
      ctx.callbackQuery!.data = "likes:view:456";
      env.API_SERVICE = createMockApiService({
        "/users/456": () =>
          new Response(JSON.stringify({ error: "fail" }), { status: 500 }),
      });
      await matchesCallbacks(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Could not load profile"),
      );
    });

    it("should show like back and pass keyboard for likes:view", async () => {
      ctx.callbackQuery!.data = "likes:view:456";
      env.API_SERVICE = createMockApiService({
        "/users/456": () =>
          new Response(
            JSON.stringify({
              user: {
                id: "456",
                displayName: "Alice",
                age: 24,
              },
            }),
            { status: 200 },
          ),
      });
      await matchesCallbacks(ctx, env);
      const call = (ctx.reply as any).mock.calls[0];
      const kb = (call[1]?.reply_markup as any)?.inline_keyboard?.flat() ?? [];
      expect(kb.some((b: any) => b.text?.includes("Like back"))).toBe(true);
      expect(kb.some((b: any) => b.text?.includes("Pass"))).toBe(true);
    });

    it("should answer with unknown action for unrecognized data", async () => {
      ctx.callbackQuery!.data = "bogus:action";
      await matchesCallbacks(ctx, env);
      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
        expect.stringContaining("Unknown action"),
      );
    });

    it("should return early when callbackQuery data is empty", async () => {
      ctx.callbackQuery!.data = "";
      await matchesCallbacks(ctx, env);
      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    });

    it("should return early when ctx.from is missing", async () => {
      (ctx as any).from = undefined;
      ctx.callbackQuery!.data = "likes:dismiss";
      await matchesCallbacks(ctx, env);
      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    });

    it("should handle unhandled error and reply with trace ID", async () => {
      ctx.callbackQuery!.data = "likes:view:456";
      ctx.reply = vi
        .fn()
        .mockRejectedValueOnce(new Error("inner fail"))
        .mockResolvedValue(undefined);
      env.API_SERVICE = {
        fetch: vi.fn().mockRejectedValue(new Error("Network failure")),
      };
      await matchesCallbacks(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Trace ID:"),
        expect.anything(),
      );
    });

    it("should remove like notification after viewing profile", async () => {
      await addNotification(env, "123", {
        type: "like",
        fromUserId: "456",
        fromDisplayName: "Alice",
        timestamp: "t1",
      });
      ctx.callbackQuery!.data = "likes:view:456";
      env.API_SERVICE = createMockApiService({
        "/users/456": () =>
          new Response(
            JSON.stringify({
              user: {
                id: "456",
                displayName: "Alice",
                age: 24,
              },
            }),
            { status: 200 },
          ),
      });
      await matchesCallbacks(ctx, env);
      const notificationsRaw = await kv.get("notifications:123");
      const ids = notificationsRaw ? JSON.parse(notificationsRaw) : [];
      expect(ids.length).toBe(0);
    });
  });

  describe("buildChatLink and formatMatch (via matchesCommand)", () => {
    it("shows chat link with username when present", async () => {
      env.API_SERVICE = createMockApiService({
        "/users/123": () =>
          new Response(JSON.stringify({ user: completeUser }), { status: 200 }),
        "/matches?userId=123": () =>
          new Response(
            JSON.stringify({
              matches: [
                {
                  id: "m1",
                  user1Id: "123",
                  user2Id: "456",
                  status: "MATCHED",
                  matched_at: "2024-01-01",
                },
              ],
            }),
            { status: 200 },
          ),
        "/users/123/pending-likes": () =>
          new Response(JSON.stringify({ pendingLikes: [] }), { status: 200 }),
        "/users/456": () =>
          new Response(
            JSON.stringify({
              user: {
                id: "456",
                displayName: "Alice",
                username: "alice_tg",
                age: 24,
              },
            }),
            { status: 200 },
          ),
      });
      await matchesCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Chat with Alice"),
        expect.any(Object),
      );
    });

    it("shows no-username message when username is missing", async () => {
      env.API_SERVICE = createMockApiService({
        "/users/123": () =>
          new Response(JSON.stringify({ user: completeUser }), { status: 200 }),
        "/matches?userId=123": () =>
          new Response(
            JSON.stringify({
              matches: [
                {
                  id: "m1",
                  user1Id: "123",
                  user2Id: "456",
                  status: "MATCHED",
                  matched_at: "2024-01-01",
                },
              ],
            }),
            { status: 200 },
          ),
        "/users/123/pending-likes": () =>
          new Response(JSON.stringify({ pendingLikes: [] }), { status: 200 }),
        "/users/456": () =>
          new Response(
            JSON.stringify({
              user: { id: "456", displayName: "Alice", age: 24 },
            }),
            { status: 200 },
          ),
      });
      await matchesCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("no username"),
        expect.any(Object),
      );
    });
  });
});
