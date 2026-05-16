import { describe, it, expect, vi, beforeEach } from "vitest";
import { matchCommand, matchCallbacks } from "../match.js";
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

function mockCtx(): MyContext {
  return {
    reply: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    from: { id: 123, first_name: "Test", is_bot: false, language_code: "en" },
    callbackQuery: {
      id: "cb1",
      from: { id: 123, is_bot: false, first_name: "Test" },
      data: "",
      message: { message_id: 1, chat: { id: 123, type: "private" }, date: 1 },
    },
    chat: { id: 123, type: "private" },
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
  location: {
    city: "Jakarta",
    country: "Indonesia",
    latitude: -6.2,
    longitude: 106.8,
  },
  interests: ["Hiking"],
  mediaUrls: [{ url: "test", type: "image", uploadedAt: "2024-01-01" }],
  phoneNumber: "+1234567890",
  isProfileComplete: true,
  language: "en",
};

const incompleteUser = {
  id: "123",
  displayName: "Test",
};

describe("Match Handlers", () => {
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
      }),
    };
  });

  describe("matchCommand", () => {
    it("should show finding matches for complete user", async () => {
      env.API_SERVICE = createMockApiService({
        "/users/123": () =>
          new Response(JSON.stringify({ user: completeUser }), { status: 200 }),
        "/potential-matches": () =>
          new Response(JSON.stringify({ potentialMatches: [] }), {
            status: 200,
          }),
      });
      await matchCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Finding"),
        expect.anything(),
      );
    });

    it("should show no matches when potential matches is empty", async () => {
      env.API_SERVICE = createMockApiService({
        "/users/123": () =>
          new Response(JSON.stringify({ user: completeUser }), { status: 200 }),
        "/potential-matches": () =>
          new Response(JSON.stringify({ potentialMatches: [] }), {
            status: 200,
          }),
      });
      await matchCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("No potential matches found"),
        expect.anything(),
      );
    });

    it("should show match cards when potential matches exist", async () => {
      env.API_SERVICE = createMockApiService({
        "/users/123": () =>
          new Response(JSON.stringify({ user: completeUser }), { status: 200 }),
        "/potential-matches": () =>
          new Response(
            JSON.stringify({
              potentialMatches: [
                {
                  id: "456",
                  displayName: "Alice",
                  age: 24,
                  bio: "Hello",
                  gender: "female",
                  interests: ["Reading"],
                  location: { city: "Jakarta", country: "Indonesia" },
                },
              ],
            }),
            { status: 200 },
          ),
      });
      await matchCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledTimes(2); // finding + match card
    });

    it("should prompt phone verification for unverified user", async () => {
      const userWithoutPhone = { ...completeUser, phoneNumber: null };
      env.API_SERVICE = createMockApiService({
        "/users/123": () =>
          new Response(JSON.stringify({ user: userWithoutPhone }), {
            status: 200,
          }),
      });
      await matchCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("phone"),
        expect.anything(),
      );
    });
  });

  describe("matchCallbacks", () => {
    it("should handle match:like callback", async () => {
      ctx.callbackQuery!.data = "match:like:456";
      (ctx as any).editMessageReplyMarkup = vi
        .fn()
        .mockResolvedValue(undefined);
      await env.KV.put(
        "match_queue:123",
        JSON.stringify({
          matches: [{ id: "456", displayName: "Alice", age: 24 }],
          index: 0,
        }),
      );
      env.API_SERVICE = createMockApiService({
        "/users/123": () =>
          new Response(JSON.stringify({ user: completeUser }), { status: 200 }),
        "/matches": () =>
          new Response(
            JSON.stringify({
              match: {
                id: "m1",
                user1Id: "123",
                user2Id: "456",
                status: "PENDING",
              },
            }),
            { status: 201 },
          ),
        "/matches/m1/like": () =>
          new Response(
            JSON.stringify({ isMutual: false, match: { id: "m1" } }),
            { status: 200 },
          ),
      });
      await matchCallbacks(ctx, env);
      // Should advance queue and show "no more matches" since queue only had 1 item
      expect(ctx.reply).toHaveBeenCalled();
    });

    it("should handle match:dislike callback", async () => {
      ctx.callbackQuery!.data = "match:dislike:456";
      (ctx as any).editMessageReplyMarkup = vi
        .fn()
        .mockResolvedValue(undefined);
      await env.KV.put(
        "match_queue:123",
        JSON.stringify({
          matches: [{ id: "456", displayName: "Alice", age: 24 }],
          index: 0,
        }),
      );
      env.API_SERVICE = createMockApiService({
        "/users/123": () =>
          new Response(JSON.stringify({ user: completeUser }), { status: 200 }),
        "/matches": () =>
          new Response(
            JSON.stringify({
              match: {
                id: "m1",
                user1Id: "123",
                user2Id: "456",
                status: "PENDING",
              },
            }),
            { status: 201 },
          ),
        "/matches/m1/dislike": () =>
          new Response(JSON.stringify({ id: "m1", status: "REJECTED" }), {
            status: 200,
          }),
      });
      await matchCallbacks(ctx, env);
      expect(ctx.reply).toHaveBeenCalled();
    });

    it("should handle match:skip callback", async () => {
      ctx.callbackQuery!.data = "match:skip:456";
      (ctx as any).editMessageReplyMarkup = vi
        .fn()
        .mockResolvedValue(undefined);
      await env.KV.put(
        "match_queue:123",
        JSON.stringify({
          matches: [{ id: "456", displayName: "Alice", age: 24 }],
          index: 0,
        }),
      );
      env.API_SERVICE = createMockApiService({
        "/users/123": () =>
          new Response(JSON.stringify({ user: completeUser }), { status: 200 }),
        "/matches": () =>
          new Response(
            JSON.stringify({
              match: {
                id: "m1",
                user1Id: "123",
                user2Id: "456",
                status: "PENDING",
              },
            }),
            { status: 201 },
          ),
        "/matches/m1/skip": () =>
          new Response(JSON.stringify({ id: "m1", status: "PENDING" }), {
            status: 200,
          }),
      });
      await matchCallbacks(ctx, env);
      expect(ctx.reply).toHaveBeenCalled();
    });

    it("should handle unknown match action", async () => {
      ctx.callbackQuery!.data = "match:unknown:456";
      await matchCallbacks(ctx, env);
      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith("Unknown action.");
    });
  });
});
