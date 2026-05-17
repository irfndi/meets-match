import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  startGiftPremiumSelection,
  handleGiftPremiumCallback,
  handleGiftPremiumPayment,
} from "../match.js";
import type { MyContext } from "../../types.js";
import { mockKV, mockCtx, createMockApiService } from "./test-helpers.js";

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
    it("should handle show callback", async () => {
      ctx.callbackQuery!.data = "gift_premium:show:456";
      const handled = await handleGiftPremiumCallback(
        ctx,
        env,
        ctx.callbackQuery!.data,
      );
      expect(handled).toBe(true);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Gift Premium"),
        expect.anything(),
      );
    });

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
                subscriptionTier: "free",
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

      // Verify the PUT request to update the target user
      const requests = (env.API_SERVICE as any)._requests;
      const putReq = requests.find(
        (r: any) => r.url.includes("/users/456") && r.method === "PUT",
      );
      expect(putReq).toBeDefined();
      expect(putReq.body.user.subscriptionTier).toBe("premium");
      expect(
        new Date(putReq.body.user.subscriptionExpiresAt).getTime(),
      ).toBeGreaterThan(Date.now());
    });

    it("should preserve higher tier and extend from current expiry", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 60);

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
                subscriptionTier: "premium_plus",
                subscriptionExpiresAt: futureDate.toISOString(),
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

      const requests = (env.API_SERVICE as any)._requests;
      const putReq = requests.find(
        (r: any) => r.url.includes("/users/456") && r.method === "PUT",
      );
      expect(putReq).toBeDefined();
      // Should preserve premium_plus (higher tier)
      expect(putReq.body.user.subscriptionTier).toBe("premium_plus");
      // Should extend from the future expiry date, not from now
      const newExpiry = new Date(putReq.body.user.subscriptionExpiresAt);
      expect(newExpiry.getTime()).toBeGreaterThan(futureDate.getTime());
    });

    it("should ignore invalid payload", async () => {
      await handleGiftPremiumPayment(ctx, env, "invalid");
      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it("should still fulfill gift when payer differs from payload buyer", async () => {
      await handleGiftPremiumPayment(ctx, env, "gift_premium_999_456_premium");
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Premium 👑"),
        expect.any(Object),
      );
    });
  });
});
