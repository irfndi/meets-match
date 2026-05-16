import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  premiumCommand,
  referralCommand,
  premiumCallbacks,
} from "../premium.js";
import type { MyContext } from "../../types.js";
import { mockKV, mockCtx, createMockApiService } from "./test-helpers.js";

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
  subscriptionTier: "free",
  referralCode: "ABC123",
  referralCount: 2,
  referralBonusSwipes: 10,
};

describe("Premium Handlers", () => {
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
        "/interaction-status": () =>
          new Response(
            JSON.stringify({
              likesRemaining: 10,
              likesTotal: 15,
              dislikesRemaining: 30,
              dislikesTotal: 35,
              tier: "free",
            }),
            { status: 200 },
          ),
      }),
    };
  });

  describe("premiumCommand", () => {
    it("should show premium plans for free user", async () => {
      await premiumCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Premium Plans"),
        expect.anything(),
      );
    });

    it("should include invoice buttons for free user", async () => {
      await premiumCommand(ctx, env);
      const call = (ctx.reply as any).mock.calls[0];
      expect(call[1].reply_markup.inline_keyboard.length).toBeGreaterThan(0);
    });
  });

  describe("referralCommand", () => {
    it("should show referral info with code and link", async () => {
      await referralCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Invite Friends"),
        expect.objectContaining({ parse_mode: "Markdown" }),
      );
    });

    it("should include share and copy buttons", async () => {
      await referralCommand(ctx, env);
      const call = (ctx.reply as any).mock.calls[0];
      const keyboard = call[1].reply_markup.inline_keyboard;
      expect(keyboard.some((row: any) => row[0].text.includes("Share"))).toBe(
        true,
      );
    });
  });

  describe("premiumCallbacks", () => {
    it("should handle premium:show callback", async () => {
      ctx.callbackQuery!.data = "premium:show";
      await premiumCallbacks(ctx, env);
      expect(ctx.reply).toHaveBeenCalled();
    });

    it("should handle referral:show callback", async () => {
      ctx.callbackQuery!.data = "referral:show";
      await premiumCallbacks(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Invite Friends"),
        expect.anything(),
      );
    });

    it("should handle premium:close callback", async () => {
      ctx.callbackQuery!.data = "premium:close";
      await premiumCallbacks(ctx, env);
      expect(ctx.deleteMessage).toHaveBeenCalled();
    });
  });
});
