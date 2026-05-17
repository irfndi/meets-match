import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isBotBlockedError,
  replyWithError,
  handleErrorReportCallback,
  recordCommandJourney,
  recordActionJourney,
} from "../error-feedback.js";
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
    api: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
    } as any,
    from: { id: 123, first_name: "Test", is_bot: false, language_code: "en" },
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

describe("Error Feedback", () => {
  let kv: ReturnType<typeof mockKV>;
  let ctx: MyContext;
  let env: any;

  beforeEach(() => {
    kv = mockKV();
    ctx = mockCtx();
    env = {
      KV: kv as unknown as KVNamespace,
      API_SERVICE: createMockApiService({
        "/error-reports": () =>
          new Response(JSON.stringify({ id: "r1" }), { status: 201 }),
        "/health": () =>
          new Response(JSON.stringify({ version: "1.2.3" }), { status: 200 }),
      }),
    };
  });

  describe("isBotBlockedError", () => {
    it("returns true for 403: Forbidden: bot was blocked by the user", () => {
      const err = new Error("403: Forbidden: bot was blocked by the user");
      expect(isBotBlockedError(err)).toBe(true);
    });

    it("returns true for Forbidden: bot was blocked by the user", () => {
      const err = new Error("Forbidden: bot was blocked by the user");
      expect(isBotBlockedError(err)).toBe(true);
    });

    it("returns false for unrelated errors", () => {
      expect(isBotBlockedError(new Error("Network timeout"))).toBe(false);
      expect(isBotBlockedError(new Error("404 Not Found"))).toBe(false);
      expect(isBotBlockedError(null)).toBe(false);
      expect(isBotBlockedError("string error")).toBe(false);
    });
  });

  describe("replyWithError", () => {
    it("sends error message with trace ID and report button", async () => {
      await replyWithError(ctx, env, "en", { command: "match" });
      expect(ctx.reply).toHaveBeenCalledTimes(1);
      const call = (ctx.reply as any).mock.calls[0];
      const text = call[0] as string;
      expect(text).toContain("Trace ID:");
      expect(text).toContain("Command: /match");

      const keyboard = call[1].reply_markup;
      expect(keyboard).toBeDefined();
    });

    it("sends error message with action context", async () => {
      await replyWithError(ctx, env, "en", {
        action: "send_dm",
        targetUserId: "456",
      });
      expect(ctx.reply).toHaveBeenCalledTimes(1);
      const text = (ctx.reply as any).mock.calls[0][0] as string;
      expect(text).toContain("Action: send\\_dm");
    });

    it("records error in journey", async () => {
      await replyWithError(ctx, env, "en", { command: "match" });
      const journeyKey = Array.from(kv._store.keys()).find((k) =>
        k.startsWith("journey:"),
      );
      expect(journeyKey).toBeDefined();
      const journey = JSON.parse(kv._store.get(journeyKey!)!);
      expect(journey.lastErrorTrace).toBeDefined();
      expect(journey.lastErrorAt).toBeDefined();
    });

    it("generates unique trace IDs", async () => {
      await replyWithError(ctx, env, "en");
      await replyWithError(ctx, env, "en");
      const calls = (ctx.reply as any).mock.calls;
      const text1 = calls[0][0] as string;
      const text2 = calls[1][0] as string;
      const traceId1 = text1.match(/Trace ID: `([A-F0-9]+)`/)?.[1];
      const traceId2 = text2.match(/Trace ID: `([A-F0-9]+)`/)?.[1];
      expect(traceId1).toBeDefined();
      expect(traceId2).toBeDefined();
      expect(traceId1).not.toBe(traceId2);
    });

    it("silently returns on 403 bot blocked error", async () => {
      ctx = mockCtx({
        reply: vi
          .fn()
          .mockRejectedValue(
            new Error("403: Forbidden: bot was blocked by the user"),
          ),
      });
      await expect(replyWithError(ctx, env, "en")).resolves.toBeUndefined();
    });

    it("rethrows non-403 errors from ctx.reply", async () => {
      ctx = mockCtx({
        reply: vi.fn().mockRejectedValue(new Error("Network error")),
      });
      await expect(replyWithError(ctx, env, "en")).rejects.toThrow(
        "Network error",
      );
    });
  });

  describe("handleErrorReportCallback", () => {
    it("persists report to API and acknowledges user", async () => {
      await kv.put(
        "journey:123",
        JSON.stringify({
          events: [{ ts: "2024-01-01T10:00:00Z", action: "like" }],
        }),
      );

      await handleErrorReportCallback(ctx, env, "TRACE001");

      expect(env.API_SERVICE.fetch).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining("error-reports"),
        }),
      );
      // Find the error-reports call (health check may also be called)
      const reportCall = env.API_SERVICE.fetch.mock.calls.find((call: any) =>
        String(call[0].url ?? call[0]).includes("error-reports"),
      );
      expect(reportCall).toBeDefined();
      const req = reportCall![0] as Request;
      const body = JSON.parse(await req.text());
      expect(body.reporterId).toBe("123");
      expect(body.traceId).toBe("TRACE001");
      expect(body.message).toContain("TRACE001");
      expect(body.journey).toContain("like");

      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
        "Report sent. Thank you!",
      );
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Report sent"),
        expect.anything(),
      );
    });

    it("notifies admin when ADMIN_CHAT_ID is set", async () => {
      env.ADMIN_CHAT_ID = "999";
      await handleErrorReportCallback(ctx, env, "TRACE002");
      expect(ctx.api.sendMessage).toHaveBeenCalledWith(
        "999",
        expect.stringContaining("TRACE002"),
      );
    });

    it("does not notify admin when ADMIN_CHAT_ID is not set", async () => {
      env.ADMIN_CHAT_ID = undefined;
      await handleErrorReportCallback(ctx, env, "TRACE003");
      expect(ctx.api.sendMessage).not.toHaveBeenCalled();
    });

    it("handles API failure gracefully", async () => {
      env.API_SERVICE = createMockApiService({
        "/error-reports": () =>
          new Response(JSON.stringify({ error: "fail" }), { status: 500 }),
      });
      await handleErrorReportCallback(ctx, env, "TRACE004");
      // Should inform user that the report failed to send
      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
        "❌ Could not send report. Please try again.",
      );
      expect(ctx.reply).toHaveBeenCalledWith(
        "❌ Could not send report. Please try again.",
        expect.any(Object),
      );
    });

    it("handles total failure gracefully", async () => {
      env.API_SERVICE = createMockApiService({});
      ctx.reply = vi.fn().mockRejectedValue(new Error("Network error"));
      await handleErrorReportCallback(ctx, env, "TRACE005");
      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
        "❌ Could not send report. Please try again.",
      );
    });

    it("returns early when ctx.from is missing", async () => {
      ctx = mockCtx({ from: undefined });
      await handleErrorReportCallback(ctx, env, "TRACE006");
      expect(env.API_SERVICE.fetch).not.toHaveBeenCalled();
    });
  });

  describe("recordCommandJourney", () => {
    it("records command journey event", async () => {
      await recordCommandJourney(ctx, env, "match");
      const journey = JSON.parse(kv._store.get("journey:123")!);
      expect(journey.events).toHaveLength(1);
      expect(journey.events[0].action).toBe("cmd/match");
    });

    it("records command with detail", async () => {
      await recordCommandJourney(ctx, env, "start", "ref_abc");
      const journey = JSON.parse(kv._store.get("journey:123")!);
      expect(journey.events[0].detail).toBe("ref_abc");
    });

    it("does nothing when ctx.from is missing", async () => {
      ctx = mockCtx({ from: undefined });
      await recordCommandJourney(ctx, env, "match");
      expect(kv.put).not.toHaveBeenCalled();
    });
  });

  describe("recordActionJourney", () => {
    it("records action journey event", async () => {
      await recordActionJourney(ctx, env, "like", "456");
      const journey = JSON.parse(kv._store.get("journey:123")!);
      expect(journey.events).toHaveLength(1);
      expect(journey.events[0].action).toBe("like");
      expect(journey.events[0].targetId).toBe("456");
    });

    it("does nothing when ctx.from is missing", async () => {
      ctx = mockCtx({ from: undefined });
      await recordActionJourney(ctx, env, "like");
      expect(kv.put).not.toHaveBeenCalled();
    });
  });
});
