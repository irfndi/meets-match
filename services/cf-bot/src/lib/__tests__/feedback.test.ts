import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  startFeedbackConversation,
  handleFeedbackConversation,
} from "../conversations.js";
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
    chat: { id: 123, type: "private" },
    message: { text: "Great app!" },
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

describe("Feedback Conversation", () => {
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
          new Response(
            JSON.stringify({
              user: { id: "123", displayName: "Test", language: "en" },
            }),
            { status: 200 },
          ),
        "/feedback": () =>
          new Response(JSON.stringify({ success: true, feedbackId: "f1" }), {
            status: 200,
          }),
      }),
    };
  });

  describe("startFeedbackConversation", () => {
    it("should set conversation state and prompt user", async () => {
      await startFeedbackConversation(ctx, env);
      expect(kv.put).toHaveBeenCalledWith(
        "conversation:123",
        expect.stringContaining("feedback"),
        expect.anything(),
      );
      const call = (ctx.reply as any).mock.calls[0];
      expect(call[0]).toContain("Feedback");
    });
  });

  describe("handleFeedbackConversation", () => {
    it("should submit feedback and clear state", async () => {
      await kv.put(
        "conversation:123",
        JSON.stringify({ userId: "123", field: "feedback", step: 0 }),
      );
      const handled = await handleFeedbackConversation(
        ctx,
        env,
        "Great app!",
        "en",
      );
      expect(handled).toBe(true);
      expect(env.API_SERVICE.fetch).toHaveBeenCalled();
      expect(kv.delete).toHaveBeenCalledWith("conversation:123");
    });

    it("should return false when not in feedback conversation", async () => {
      const handled = await handleFeedbackConversation(
        ctx,
        env,
        "Great app!",
        "en",
      );
      expect(handled).toBe(false);
    });
  });
});
