import { describe, it, expect, vi, beforeEach } from "vitest";
import { matchesCommand, matchesCallbacks } from "../matches.js";
import type { MyContext } from "../../types.js";

function mockKV() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
    delete: vi.fn(async (key: string) => { store.delete(key); }),
    _store: store,
  };
}

function mockCtx(): MyContext {
  return {
    reply: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    editMessageText: vi.fn().mockResolvedValue(undefined),
    from: { id: 123, first_name: "Test", is_bot: false, language_code: "en" },
    callbackQuery: { id: "cb1", from: { id: 123, is_bot: false, first_name: "Test" }, data: "", message: { message_id: 1, chat: { id: 123, type: "private" }, date: 1 } },
    chat: { id: 123, type: "private" },
  } as unknown as MyContext;
}

function createMockApiService(responseMap: Record<string, () => Response>) {
  return {
    fetch: vi.fn().mockImplementation((req: Request) => {
      const url = typeof req === "string" ? req : (req as any).url || String(req);
      for (const [pattern, factory] of Object.entries(responseMap)) {
        if (url.includes(pattern)) return Promise.resolve(factory());
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 404 }));
    }),
  };
}

const completeUser = {
  id: "123",
  displayName: "Test",
  age: 25,
  gender: "male",
  bio: "Hello",
  location: { city: "Jakarta", country: "Indonesia" },
  interests: ["Hiking"],
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
        "/users/123": () => new Response(JSON.stringify({ user: completeUser }), { status: 200 }),
        "/matches?userId=123": () => new Response(JSON.stringify({ matches: [] }), { status: 200 }),
        "/users/123/pending-likes": () => new Response(JSON.stringify({ pendingLikes: [] }), { status: 200 }),
      }),
    };
  });

  describe("matchesCommand", () => {
    it("should show no matches for empty state", async () => {
      await matchesCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("No matches"), expect.anything());
    });

    it("should show mutual matches when they exist", async () => {
      env.API_SERVICE = createMockApiService({
        "/users/123": () => new Response(JSON.stringify({ user: completeUser }), { status: 200 }),
        "/matches?userId=123": () => new Response(JSON.stringify({ matches: [
          { id: "m1", user1Id: "123", user2Id: "456", status: "MATCHED", matched_at: "2024-01-01" },
        ] }), { status: 200 }),
        "/users/123/pending-likes": () => new Response(JSON.stringify({ pendingLikes: [] }), { status: 200 }),
        "/users/456": () => new Response(JSON.stringify({ user: { id: "456", displayName: "Alice", age: 24 } }), { status: 200 }),
      });
      await matchesCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledTimes(2); // title + match card
    });

    it("should show pending likes when they exist", async () => {
      env.API_SERVICE = createMockApiService({
        "/users/123/pending-likes": () => new Response(JSON.stringify({ pendingLikes: [
          { id: "456", displayName: "Alice", age: 24 },
        ] }), { status: 200 }),
        "/users/123": () => new Response(JSON.stringify({ user: completeUser }), { status: 200 }),
        "/matches?userId=123": () => new Response(JSON.stringify({ matches: [] }), { status: 200 }),
      });
      await matchesCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("liked"), expect.anything());
    });
  });

  describe("matchesCallbacks", () => {
    it("should dismiss all like notifications", async () => {
      ctx.callbackQuery!.data = "likes:dismiss";
      await kv.put("notifications:123", JSON.stringify([
        { type: "like", fromUserId: "456", fromDisplayName: "Alice", timestamp: "t1" },
        { type: "like", fromUserId: "789", fromDisplayName: "Bob", timestamp: "t2" },
      ]));
      await matchesCallbacks(ctx, env);
      expect(ctx.editMessageText).toHaveBeenCalled();
      const remaining = await kv.get("notifications:123");
      expect(remaining).toBeNull();
    });

    it("should handle likes:view callback", async () => {
      ctx.callbackQuery!.data = "likes:view:456";
      env.API_SERVICE = createMockApiService({
        "/users/456": () => new Response(JSON.stringify({ user: { id: "456", displayName: "Alice", age: 24, bio: "Hello", interests: ["Reading"] } }), { status: 200 }),
      });
      await matchesCallbacks(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Alice"),
        expect.objectContaining({ reply_markup: expect.anything() }),
      );
    });
  });
});
