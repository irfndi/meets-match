import { describe, it, expect, vi, beforeEach } from "vitest";
import { matchCommand, matchCallbacks, showNextMatch } from "../match.js";
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
  const requests: Array<{ url: string; method: string }> = [];
  return {
    fetch: vi.fn().mockImplementation((req: Request) => {
      const url =
        typeof req === "string" ? req : (req as any).url || String(req);
      const method = (req as any).method || "GET";
      requests.push({ url, method });
      const sortedPatterns = Object.entries(responseMap).sort(
        (a, b) => b[0].length - a[0].length,
      );
      for (const [pattern, factory] of sortedPatterns) {
        if (pattern.includes(":")) {
          // Method-specific pattern: e.g. "PUT:/users/123"
          const colonIdx = pattern.indexOf(":");
          const patternMethod = pattern.slice(0, colonIdx);
          const patternUrl = pattern.slice(colonIdx + 1);
          if (method === patternMethod && url.includes(patternUrl)) {
            return Promise.resolve(factory());
          }
        } else if (url.includes(pattern)) {
          return Promise.resolve(factory());
        }
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 404 }));
    }),
    _requests: requests,
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

    it("should show error with trace ID when an unexpected error occurs", async () => {
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
        "/users/123/interaction-status": () =>
          new Response(
            JSON.stringify({
              likesRemaining: 10,
              dislikesRemaining: 10,
              tier: "free",
            }),
            { status: 200 },
          ),
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
            {
              status: 200,
            },
          ),
      });
      // Simulate an unexpected error during the success reply
      ctx.reply = vi
        .fn()
        .mockRejectedValueOnce(new Error("Telegram API error"))
        .mockResolvedValue(undefined);
      await matchCallbacks(ctx, env);
      // replyWithError should be called after the unexpected error
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Trace ID:"),
        expect.anything(),
      );
    });
  });

  describe("matchCommand edge cases", () => {
    it("returns early when ctx.from is missing", async () => {
      (ctx as any).from = undefined;
      await matchCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Could not identify you"),
      );
    });

    it("shows incomplete profile message for incomplete user", async () => {
      env.API_SERVICE = createMockApiService({
        "/users/123": () =>
          new Response(JSON.stringify({ user: incompleteUser }), {
            status: 200,
          }),
      });
      await matchCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Complete your profile"),
      );
    });
  });

  describe("matchCallbacks mutual like", () => {
    it("shows 'It is a Match!' when like is mutual", async () => {
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
        "/users/123/interaction-status": () =>
          new Response(
            JSON.stringify({
              likesRemaining: 10,
              dislikesRemaining: 10,
              tier: "free",
            }),
            { status: 200 },
          ),
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
            JSON.stringify({ isMutual: true, match: { id: "m1" } }),
            { status: 200 },
          ),
        "/users/456": () =>
          new Response(
            JSON.stringify({
              user: { id: "456", displayName: "Alice", mediaUrls: [] },
            }),
            { status: 200 },
          ),
      });
      await matchCallbacks(ctx, env);
      const replies = (ctx.reply as any).mock.calls;
      const matchMsg = replies.find((call: any[]) =>
        String(call[0]).toLowerCase().includes("match"),
      );
      expect(matchMsg).toBeDefined();
    });
  });

  describe("matchCallbacks free tier limits", () => {
    it("shows limit reached for likes when likesRemaining is 0", async () => {
      ctx.callbackQuery!.data = "match:like:456";
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
        "/users/123/interaction-status": () =>
          new Response(
            JSON.stringify({
              likesRemaining: 0,
              likesTotal: 15,
              dislikesRemaining: 10,
              tier: "free",
            }),
            { status: 200 },
          ),
      });
      await matchCallbacks(ctx, env);
      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    });

    it("shows limit reached for dislikes when dislikesRemaining is 0", async () => {
      ctx.callbackQuery!.data = "match:dislike:456";
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
        "/users/123/interaction-status": () =>
          new Response(
            JSON.stringify({
              likesRemaining: 10,
              dislikesRemaining: 0,
              dislikesTotal: 35,
              tier: "free",
            }),
            { status: 200 },
          ),
      });
      await matchCallbacks(ctx, env);
      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    });
  });

  describe("matchCallbacks action lock", () => {
    it("returns 'Processing...' when action lock is already held", async () => {
      ctx.callbackQuery!.data = "match:like:456";
      await env.KV.put("action_lock:123", "1");
      await matchCallbacks(ctx, env);
      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
        expect.stringContaining("Processing"),
      );
    });
  });

  describe("matchCommand error paths", () => {
    it("should show error with trace ID when an unexpected error occurs", async () => {
      env.API_SERVICE = createMockApiService({
        "/users/123": () =>
          new Response(JSON.stringify({ user: completeUser }), { status: 200 }),
        "/potential-matches": () =>
          new Response(JSON.stringify({ potentialMatches: [] }), {
            status: 200,
          }),
      });
      ctx.reply = vi
        .fn()
        .mockRejectedValueOnce(new Error("Telegram API error"))
        .mockResolvedValue(undefined);
      await matchCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Trace ID:"),
        expect.anything(),
      );
    });

    it("still proceeds to find matches when default preference PUT fails", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      env.API_SERVICE = createMockApiService({
        "/users/123": () =>
          new Response(JSON.stringify({ user: completeUser }), { status: 200 }),
        "PUT:/users/123": () =>
          new Response(JSON.stringify({ error: "DB error" }), { status: 500 }),
        "/potential-matches": () =>
          new Response(JSON.stringify({ potentialMatches: [] }), {
            status: 200,
          }),
      });
      await matchCommand(ctx, env);
      // Should still show "finding" and then "no matches"
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Finding"),
        expect.anything(),
      );
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("No potential matches found"),
        expect.anything(),
      );
      consoleErrorSpy.mockRestore();
    });
  });

  describe("showNextMatch", () => {
    beforeEach(() => {
      (ctx as any).replyWithPhoto = vi.fn().mockResolvedValue(undefined);
    });

    it("sends match card before premium ad for free tier users", async () => {
      await env.KV.put(
        "match_queue:123",
        JSON.stringify({
          matches: [
            { id: "456", displayName: "Alice", age: 24 },
            { id: "789", displayName: "Bob", age: 25 },
          ],
          index: 1,
          tier: "free",
          myLocation: undefined,
        }),
      );
      await showNextMatch(ctx, env, "123", "en");
      const replies = (ctx.reply as any).mock.calls;
      const matchCardIndex = replies.findIndex((call: any[]) =>
        String(call[0]).includes("Bob"),
      );
      const adIndex = replies.findIndex((call: any[]) =>
        String(call[0]).includes("Unlock Premium"),
      );
      expect(matchCardIndex).toBeGreaterThanOrEqual(0);
      expect(adIndex).toBeGreaterThanOrEqual(0);
      expect(matchCardIndex).toBeLessThan(adIndex);
    });

    it("sends match card before referral prompt at index 2", async () => {
      await env.KV.put(
        "match_queue:123",
        JSON.stringify({
          matches: [
            { id: "456", displayName: "Alice", age: 24 },
            { id: "789", displayName: "Bob", age: 25 },
            { id: "999", displayName: "Carol", age: 26 },
          ],
          index: 2,
          tier: "free",
          myLocation: undefined,
          referralCode: "ABC123",
        }),
      );
      await showNextMatch(ctx, env, "123", "en");
      const replies = (ctx.reply as any).mock.calls;
      const matchCardIndex = replies.findIndex((call: any[]) =>
        String(call[0]).includes("Carol"),
      );
      const referralIndex = replies.findIndex((call: any[]) =>
        String(call[0]).includes("Share MeetMatch"),
      );
      expect(matchCardIndex).toBeGreaterThanOrEqual(0);
      expect(referralIndex).toBeGreaterThanOrEqual(0);
      expect(matchCardIndex).toBeLessThan(referralIndex);
    });

    it("does not show premium ad for premium tier users", async () => {
      await env.KV.put(
        "match_queue:123",
        JSON.stringify({
          matches: [
            { id: "456", displayName: "Alice", age: 24 },
            { id: "789", displayName: "Bob", age: 25 },
          ],
          index: 1,
          tier: "premium",
          myLocation: undefined,
        }),
      );
      await showNextMatch(ctx, env, "123", "en");
      const replies = (ctx.reply as any).mock.calls;
      const adIndex = replies.findIndex((call: any[]) =>
        String(call[0]).includes("Unlock Premium"),
      );
      expect(adIndex).toBe(-1);
    });

    it("does not show premium ad when queue index is 0", async () => {
      await env.KV.put(
        "match_queue:123",
        JSON.stringify({
          matches: [
            { id: "456", displayName: "Alice", age: 24 },
            { id: "789", displayName: "Bob", age: 25 },
          ],
          index: 0,
          tier: "free",
          myLocation: undefined,
        }),
      );
      await showNextMatch(ctx, env, "123", "en");
      const replies = (ctx.reply as any).mock.calls;
      const adIndex = replies.findIndex((call: any[]) =>
        String(call[0]).includes("Unlock Premium"),
      );
      expect(adIndex).toBe(-1);
    });
  });
});
