import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  startGiftPremiumSelection,
  handleGiftPremiumCallback,
  handleGiftPremiumPayment,
} from "../match.js";
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
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    from: { id: 123, first_name: "Test", is_bot: false, language_code: "en" },
    callbackQuery: {
      id: "cb1",
      from: { id: 123, is_bot: false, first_name: "Test" },
      data: "",
      message: { message_id: 1, chat: { id: 123, type: "private" }, date: 1 },
    },
    chat: { id: 123, type: "private" },
    api: {
      createInvoiceLink: vi.fn().mockResolvedValue("https://t.me/invoice/test"),
    } as any,
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

describe("Gift Premium", () => {
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
              user: {
                id: "123",
                displayName: "Buyer",
                subscriptionTier: "premium",
              },
            }),
            { status: 200 },
          ),
        "/users/456": () =>
          new Response(
            JSON.stringify({
              user: {
                id: "456",
                displayName: "Target",
                subscriptionTier: "free",
              },
            }),
            { status: 200 },
          ),
      }),
    };
  });

  describe("startGiftPremiumSelection", () => {
    it("should show premium gift options", async () => {
      await startGiftPremiumSelection(ctx, env, "456");
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Gift Premium"),
        expect.objectContaining({ parse_mode: "Markdown" }),
      );
    });
  });

  describe("handleGiftPremiumCallback", () => {
    it("should create invoice for premium gift", async () => {
      ctx.callbackQuery!.data = "gift_premium:buy:premium:456";
      const handled = await handleGiftPremiumCallback(
        ctx,
        env,
        ctx.callbackQuery!.data,
      );
      expect(handled).toBe(true);
      expect(ctx.api.createInvoiceLink).toHaveBeenCalledWith(
        "Gift Premium",
        expect.any(String),
        "gift_premium_123_456_premium",
        "",
        "XTR",
        [{ label: "Premium", amount: 500 }],
      );
    });

    it("should create invoice for premium_plus gift", async () => {
      ctx.callbackQuery!.data = "gift_premium:buy:premium_plus:456";
      const handled = await handleGiftPremiumCallback(
        ctx,
        env,
        ctx.callbackQuery!.data,
      );
      expect(handled).toBe(true);
      expect(ctx.api.createInvoiceLink).toHaveBeenCalledWith(
        "Gift Premium+",
        expect.any(String),
        "gift_premium_123_456_premium_plus",
        "",
        "XTR",
        [{ label: "Premium+", amount: 1000 }],
      );
    });

    it("should handle cancel", async () => {
      ctx.callbackQuery!.data = "gift_premium:cancel";
      const handled = await handleGiftPremiumCallback(
        ctx,
        env,
        ctx.callbackQuery!.data,
      );
      expect(handled).toBe(true);
      expect(ctx.deleteMessage).toHaveBeenCalled();
    });
  });

  describe("handleGiftPremiumPayment", () => {
    it("should activate premium for target user", async () => {
      env.API_SERVICE = createMockApiService({
        "/users/123": () =>
          new Response(
            JSON.stringify({ user: { id: "123", displayName: "Buyer" } }),
            { status: 200 },
          ),
        "/users/456": () =>
          new Response(
            JSON.stringify({
              user: {
                id: "456",
                displayName: "Target",
                subscriptionTier: "premium",
              },
            }),
            { status: 200 },
          ),
      });

      await handleGiftPremiumPayment(ctx, env, "gift_premium_123_456_premium");
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("gifted"),
        expect.anything(),
      );
    });

    it("should ignore invalid payload", async () => {
      await handleGiftPremiumPayment(ctx, env, "invalid");
      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it("should ignore mismatched buyer", async () => {
      await handleGiftPremiumPayment(ctx, env, "gift_premium_999_456_premium");
      expect(ctx.reply).not.toHaveBeenCalled();
    });
  });
});
