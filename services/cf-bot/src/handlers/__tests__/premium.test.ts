import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  premiumCommand,
  referralCommand,
  premiumCallbacks,
} from "../premium.js";
import type { MyContext } from "../../types.js";
import { mockKV } from "./test-helpers.js";

// ────────────────────────────────────────────────────────────────────────────
// Mock response helpers
// ────────────────────────────────────────────────────────────────────────────

function ok(data: Record<string, unknown>): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function err(status = 500): Response {
  return new Response("Internal Server Error", { status });
}

// ────────────────────────────────────────────────────────────────────────────
// Context builder
// ────────────────────────────────────────────────────────────────────────────

interface CtxOverrides {
  from?: Record<string, unknown> | undefined;
  reply?: ReturnType<typeof vi.fn>;
  answerCallbackQuery?: ReturnType<typeof vi.fn>;
  deleteMessage?: ReturnType<typeof vi.fn>;
  api?: Record<string, unknown>;
  me?: Record<string, unknown> | undefined;
  callbackQuery?: Record<string, unknown> | undefined;
  chat?: Record<string, unknown>;
  [key: string]: unknown;
}

function mockCtx(overrides: CtxOverrides = {}): MyContext {
  const defaults: Record<string, unknown> = {
    reply: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    from: { id: 123, first_name: "Test", is_bot: false, language_code: "en" },
    api: {
      createInvoiceLink: vi.fn().mockResolvedValue("https://t.me/invoice/mock"),
      getMe: vi.fn().mockResolvedValue({ username: "testbot" }),
    },
    me: { username: "testbot", id: 1, is_bot: true, first_name: "TestBot" },
    callbackQuery: undefined,
    chat: { id: 123, type: "private" },
  };
  const merged = { ...defaults, ...overrides };
  // Deep-merge api so partial overrides don't wipe createInvoiceLink/getMe
  if (overrides.api) {
    merged.api = {
      ...(defaults.api as Record<string, unknown>),
      ...overrides.api,
    };
  }
  return merged as unknown as MyContext;
}

// ────────────────────────────────────────────────────────────────────────────
// API service mock factory (matches existing patterns)
// ────────────────────────────────────────────────────────────────────────────

function createMockApiService(responseMap: Record<string, () => Response>) {
  return {
    fetch: vi.fn().mockImplementation((req: Request) => {
      const url =
        typeof req === "string" ? req : (req as any).url || String(req);
      const sortedPatterns = Object.entries(responseMap).sort(
        (a, b) => b[0].length - a[0].length,
      );
      for (const [pattern, factory] of sortedPatterns) {
        if (url.includes(pattern)) {
          return Promise.resolve(factory());
        }
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 404 }));
    }),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Reusable payloads
// ────────────────────────────────────────────────────────────────────────────

const existingUser = {
  id: "123",
  displayName: "Test",
  isProfileComplete: true,
  phoneNumber: "+123",
};

const interactionFree = {
  tier: "free",
  likesRemaining: 5,
  likesTotal: 15,
  dislikesRemaining: 10,
  dislikesTotal: 35,
};

const interactionPremium = {
  tier: "premium",
  likesRemaining: 999,
  likesTotal: 999,
  dislikesRemaining: 999,
  dislikesTotal: 999,
};

const interactionPremiumPlus = {
  tier: "premium_plus",
  likesRemaining: 9999,
  likesTotal: 9999,
  dislikesRemaining: 9999,
  dislikesTotal: 9999,
};

/**
 * User data with subscription expiry.
 * Use a date/time safely in the past so toLocaleDateString("en-GB")
 * is timezone-agnostic (no UTC midnight == next-day issues).
 */
const expiryDateStr = "2026-06-15T12:00:00Z"; // June 15, 2026 noon UTC

function userWithExpiry() {
  return { user: { ...existingUser, subscriptionExpiresAt: expiryDateStr } };
}

const referralUser = {
  user: {
    ...existingUser,
    referralCode: "ABC123",
    referralCount: 7,
    referralBonusSwipes: 35,
  },
};

/**
 * Handlers map with a default GET /users/123 that makes ensureUserExists
 * succeed. Extra entries typically supply interaction-status or similar.
 */
function withUser(
  extra: Record<string, () => Response> = {},
): Record<string, () => Response> {
  return {
    "/users/123": () => ok({ user: existingUser }),
    ...extra,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Keyboard helpers
// ────────────────────────────────────────────────────────────────────────────

/** Flatten all inline keyboard rows into a single array of buttons. */
function flatButtons(replyCall: any): any[] {
  const opts = replyCall.mock.calls[0]?.[1];
  const kb = opts?.reply_markup as any;
  return (kb?.inline_keyboard ?? []).flat();
}

// ────────────────────────────────────────────────────────────────────────────
// premiumCommand
// ────────────────────────────────────────────────────────────────────────────

describe("premiumCommand", () => {
  describe("guard clauses", () => {
    it("returns early if ctx.from is missing", async () => {
      const ctx = mockCtx({ from: undefined });
      const env = {
        KV: mockKV() as unknown as KVNamespace,
        API_SERVICE: createMockApiService({}),
      } as any;

      await premiumCommand(ctx, env);

      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it("shows error when ensureUserExists fails", async () => {
      const ctx = mockCtx();
      const env = {
        API_SERVICE: createMockApiService({
          "/users/123": () => err(404),
          "/users": () => err(500),
        }),
      } as any;

      await premiumCommand(ctx, env);

      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Sorry"));
    });
  });

  // ── free tier ──────────────────────────────────────────────────────────

  describe("free tier", () => {
    it("displays Free plan with interaction limits and no expiry", async () => {
      const ctx = mockCtx();
      const env = {
        KV: mockKV() as unknown as KVNamespace,
        API_SERVICE: createMockApiService(
          withUser({
            "/users/123/interaction-status": () => ok(interactionFree),
          }),
        ),
      } as any;

      await premiumCommand(ctx, env);

      const msg: string = (ctx.reply as any).mock.calls[0][0];
      expect(msg).toContain("*Current plan:* Free");
      expect(msg).toContain("5/15 likes");
      expect(msg).toContain("10/35 dislikes");
      expect(msg).not.toContain("📅 Expires:");
      expect(msg).toContain("*Premium 👑");
      expect(msg).toContain("*Premium+ 💎");
    });

    it("creates invoice links for both Premium and Premium+", async () => {
      const ctx = mockCtx();
      const env = {
        API_SERVICE: createMockApiService(
          withUser({
            "/users/123/interaction-status": () => ok(interactionFree),
          }),
        ),
      } as any;

      await premiumCommand(ctx, env);

      expect(ctx.api.createInvoiceLink).toHaveBeenCalledTimes(2);

      expect(ctx.api.createInvoiceLink).toHaveBeenCalledWith(
        "MeetMatch Premium",
        expect.stringContaining("unlimited likes"),
        "premium_123_premium",
        "",
        "XTR",
        [{ label: "Premium", amount: 500 }],
      );

      expect(ctx.api.createInvoiceLink).toHaveBeenCalledWith(
        "MeetMatch Premium+",
        expect.stringContaining("unlimited DMs"),
        "premium_123_premium_plus",
        "",
        "XTR",
        [{ label: "Premium+", amount: 1000 }],
      );
    });

    it("includes Premium and Premium+ URL buttons in keyboard", async () => {
      const ctx = mockCtx();
      const env = {
        API_SERVICE: createMockApiService(
          withUser({
            "/users/123/interaction-status": () => ok(interactionFree),
          }),
        ),
      } as any;

      await premiumCommand(ctx, env);

      const buttons = flatButtons(ctx.reply);
      const urlButtons = buttons.filter((b: any) => b.url);
      expect(urlButtons).toHaveLength(2);
      expect(urlButtons[0].text).toContain("Buy Premium");
      expect(urlButtons[1].text).toContain("Buy Premium+");
    });

    it("always includes Share-for-Bonus and Close buttons", async () => {
      const ctx = mockCtx();
      const env = {
        API_SERVICE: createMockApiService(
          withUser({
            "/users/123/interaction-status": () => ok(interactionFree),
          }),
        ),
      } as any;

      await premiumCommand(ctx, env);

      const buttons = flatButtons(ctx.reply);
      const cbButtons = buttons.filter((b: any) => b.callback_data);
      expect(
        cbButtons.some((b: any) => b.callback_data === "referral:show"),
      ).toBe(true);
      expect(
        cbButtons.some((b: any) => b.callback_data === "premium:close"),
      ).toBe(true);
    });
  });

  // ── premium tier ───────────────────────────────────────────────────────

  describe("premium tier", () => {
    it("displays Premium plan (standalone, no custom expiry data)", async () => {
      const ctx = mockCtx();
      const env = {
        API_SERVICE: createMockApiService(
          withUser({
            "/users/123/interaction-status": () => ok(interactionPremium),
          }),
        ),
      } as any;

      // Fallback user data has no subscriptionExpiresAt → no expiry line.
      await premiumCommand(ctx, env);

      const msg: string = (ctx.reply as any).mock.calls[0][0];
      expect(msg).toContain("*Current plan:* Premium 👑");
    });

    it("shows expiry date when user data has subscriptionExpiresAt", async () => {
      const ctx = mockCtx();
      const env = {
        API_SERVICE: createMockApiService({
          "/users/123/interaction-status": () => ok(interactionPremium),
          // This one-liner returns expiry data for both ensureUserExists AND
          // the expiry look-up (they share the same URL pattern).
          "/users/123": () => ok(userWithExpiry()),
        }),
      } as any;

      await premiumCommand(ctx, env);

      const msg: string = (ctx.reply as any).mock.calls[0][0];
      expect(msg).toContain("📅 Expires:");
      // 2026-06-15 noon UTC → toLocaleDateString("en-GB") → "15/06/2026"
      expect(msg).toContain("15/06/2026");
    });

    it("creates only Premium+ invoice (no Premium button for premium users)", async () => {
      const ctx = mockCtx();
      const env = {
        API_SERVICE: createMockApiService(
          withUser({
            "/users/123/interaction-status": () => ok(interactionPremium),
          }),
        ),
      } as any;

      await premiumCommand(ctx, env);

      // Only one invoice: Premium+
      expect(ctx.api.createInvoiceLink).toHaveBeenCalledTimes(1);
      expect(ctx.api.createInvoiceLink).toHaveBeenCalledWith(
        expect.stringContaining("MeetMatch Premium+"),
        expect.any(String),
        "premium_123_premium_plus",
        expect.any(String),
        expect.any(String),
        expect.any(Array),
      );

      // URL button is Premium+ only (the text "Buy Premium+" naturally
      // includes "Buy Premium" as a substring, so we verify the exact label).
      const buttons = flatButtons(ctx.reply);
      const urlButtons = buttons.filter((b: any) => b.url);
      expect(urlButtons).toHaveLength(1);
      // The button says "💎 Buy Premium+ (1000 Stars)"
      expect(urlButtons[0].text).toBe(`💎 Buy Premium+ (1000 Stars)`);
    });
  });

  // ── premium_plus tier ──────────────────────────────────────────────────

  describe("premium_plus tier", () => {
    it("displays Premium+ plan with expiry and zero buy buttons", async () => {
      const ctx = mockCtx();
      const env = {
        API_SERVICE: createMockApiService({
          "/users/123/interaction-status": () => ok(interactionPremiumPlus),
          "/users/123": () => ok(userWithExpiry()),
        }),
      } as any;

      await premiumCommand(ctx, env);

      const msg: string = (ctx.reply as any).mock.calls[0][0];
      expect(msg).toContain("*Current plan:* Premium+ 💎");
      expect(msg).toContain("📅 Expires:");

      // No invoice links at all
      expect(ctx.api.createInvoiceLink).not.toHaveBeenCalled();

      // No URL buttons (no buy buttons)
      const buttons = flatButtons(ctx.reply);
      const urlButtons = buttons.filter((b: any) => b.url);
      expect(urlButtons).toHaveLength(0);

      // Still has referral and close text buttons
      const textButtons = buttons.filter((b: any) => b.callback_data);
      expect(
        textButtons.some((b: any) => b.callback_data === "referral:show"),
      ).toBe(true);
      expect(
        textButtons.some((b: any) => b.callback_data === "premium:close"),
      ).toBe(true);
    });
  });

  // ── error paths ────────────────────────────────────────────────────────

  describe("error handling", () => {
    it("handles getInteractionStatus failure — no interaction line, still shows plans", async () => {
      const ctx = mockCtx();
      const env = {
        API_SERVICE: createMockApiService(
          withUser({
            "/users/123/interaction-status": () => err(500),
          }),
        ),
      } as any;

      await premiumCommand(ctx, env);

      const msg: string = (ctx.reply as any).mock.calls[0][0];
      expect(msg).toContain("*Current plan:* Free");
      expect(msg).not.toContain("/15 likes");
      expect(msg).not.toContain("/35 dislikes");
      expect(msg).toContain("*Free Plan:");
      expect(msg).toContain("*Premium 👑");
    });

    it("handles Premium invoice failure — Premium+ button still created", async () => {
      const ctx = mockCtx();
      const customInvoice = vi
        .fn()
        .mockRejectedValueOnce(new Error("invoice err"))
        .mockResolvedValueOnce("https://t.me/plus-link");
      (ctx as any).api = {
        createInvoiceLink: customInvoice,
        getMe: vi.fn().mockResolvedValue({ username: "testbot" }),
      };

      const env = {
        API_SERVICE: createMockApiService(
          withUser({
            "/users/123/interaction-status": () => ok(interactionFree),
          }),
        ),
      } as any;

      await premiumCommand(ctx, env);

      const buttons = flatButtons(ctx.reply);
      const urlButtons = buttons.filter((b: any) => b.url);
      expect(urlButtons).toHaveLength(1);
      // Only the Premium+ button survives; its exact text should contain "Buy Premium+"
      expect(urlButtons[0].text).toContain("Buy Premium+");
      // But we must NOT see "Buy Premium (" which is the Premium tier button
      expect(urlButtons[0].text).not.toMatch(/Buy Premium\s*\(/);
    });

    it("handles Premium+ invoice failure — Premium button still created", async () => {
      const ctx = mockCtx();
      const customInvoice = vi
        .fn()
        .mockResolvedValueOnce("https://t.me/prem-link")
        .mockRejectedValueOnce(new Error("invoice err"));
      (ctx as any).api = {
        createInvoiceLink: customInvoice,
        getMe: vi.fn().mockResolvedValue({ username: "testbot" }),
      };

      const env = {
        API_SERVICE: createMockApiService(
          withUser({
            "/users/123/interaction-status": () => ok(interactionFree),
          }),
        ),
      } as any;

      await premiumCommand(ctx, env);

      const buttons = flatButtons(ctx.reply);
      const urlButtons = buttons.filter((b: any) => b.url);
      expect(urlButtons).toHaveLength(1);
      expect(urlButtons[0].text).toContain("Buy Premium");
      expect(urlButtons[0].text).not.toContain("Buy Premium+");
    });

    it("handles both invoice links failing — no URL buttons, Share+Close remain", async () => {
      const ctx = mockCtx();
      (ctx as any).api = {
        createInvoiceLink: vi.fn().mockRejectedValue(new Error("fail")),
        getMe: vi.fn().mockResolvedValue({ username: "testbot" }),
      };

      const env = {
        API_SERVICE: createMockApiService(
          withUser({
            "/users/123/interaction-status": () => ok(interactionFree),
          }),
        ),
      } as any;

      await premiumCommand(ctx, env);

      const buttons = flatButtons(ctx.reply);
      const urlButtons = buttons.filter((b: any) => b.url);
      expect(urlButtons).toHaveLength(0);

      const cbButtons = buttons.filter((b: any) => b.callback_data);
      expect(
        cbButtons.some((b: any) => b.callback_data === "referral:show"),
      ).toBe(true);
      expect(
        cbButtons.some((b: any) => b.callback_data === "premium:close"),
      ).toBe(true);
    });

    it("catches unhandled errors and replies with generic message", async () => {
      const ctx = mockCtx();
      // First reply throws — caught by premiumCommand's try/catch.
      // The catch-block also calls reply, which must succeed so we chain.
      ctx.reply = vi
        .fn()
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValue(undefined);

      const env = {
        KV: mockKV() as unknown as KVNamespace,
        API_SERVICE: createMockApiService(
          withUser({
            "/users/123/interaction-status": () => ok(interactionFree),
          }),
        ),
      } as any;

      await premiumCommand(ctx, env);

      // The catch handler calls replyWithError which replies with trace ID
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Trace ID:"),
        expect.anything(),
      );
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// referralCommand
// ────────────────────────────────────────────────────────────────────────────

describe("referralCommand", () => {
  describe("guard clauses", () => {
    it("returns early if ctx.from is missing", async () => {
      const ctx = mockCtx({ from: undefined });
      const env = {
        KV: mockKV() as unknown as KVNamespace,
        API_SERVICE: createMockApiService({}),
      } as any;

      await referralCommand(ctx, env);

      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it("shows error when ensureUserExists fails", async () => {
      const ctx = mockCtx();
      const env = {
        API_SERVICE: createMockApiService({
          "/users/123": () => err(404),
          "/users": () => err(500),
        }),
      } as any;

      await referralCommand(ctx, env);

      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Sorry"));
    });
  });

  describe("success path", () => {
    it("displays referral code, referral count, and bonus", async () => {
      const ctx = mockCtx();
      const env = {
        KV: mockKV() as unknown as KVNamespace,
        API_SERVICE: createMockApiService({
          "/users/123": () => ok(referralUser),
        }),
      } as any;

      await referralCommand(ctx, env);

      const msg: string = (ctx.reply as any).mock.calls[0][0];
      expect(msg).toContain("ABC123");
      expect(msg).toContain("7");
      expect(msg).toContain("+35");
      expect(msg).toContain("*Friends invited:*");
      expect(msg).toContain("*Bonus earned:*");
    });

    it("generates share link and share/copy/close buttons", async () => {
      const ctx = mockCtx();
      const env = {
        API_SERVICE: createMockApiService({
          "/users/123": () => ok(referralUser),
        }),
      } as any;

      await referralCommand(ctx, env);

      const msg: string = (ctx.reply as any).mock.calls[0][0];
      expect(msg).toContain("https://t.me/testbot?start=ref\\_ABC123");

      const buttons = flatButtons(ctx.reply);
      // Share-on-Telegram URL button
      expect(
        buttons.some((b: any) => b.url && b.text.includes("Share on Telegram")),
      ).toBe(true);
      // Copy-link button
      expect(
        buttons.some((b: any) => b.copy_text && b.text.includes("Copy Link")),
      ).toBe(true);
      // Close button
      expect(
        buttons.some((b: any) => b.callback_data === "referral:close"),
      ).toBe(true);
    });

    it("falls back to getMe() when ctx.me is missing", async () => {
      const ctx = mockCtx({ me: undefined });
      ctx.api.getMe = vi.fn().mockResolvedValue({ username: "fallbackbot" });
      const env = {
        API_SERVICE: createMockApiService({
          "/users/123": () => ok(referralUser),
        }),
      } as any;

      await referralCommand(ctx, env);

      expect(ctx.api.getMe).toHaveBeenCalled();
      const msg: string = (ctx.reply as any).mock.calls[0][0];
      expect(msg).toContain("https://t.me/fallbackbot");
    });

    it("handles missing bot username — no link, no share/copy buttons", async () => {
      const ctx = mockCtx({ me: undefined });
      ctx.api.getMe = vi.fn().mockResolvedValue({}); // no username
      const env = {
        API_SERVICE: createMockApiService({
          "/users/123": () => ok(referralUser),
        }),
      } as any;

      await referralCommand(ctx, env);

      const msg: string = (ctx.reply as any).mock.calls[0][0];
      expect(msg).not.toContain("https://t.me/");

      const buttons = flatButtons(ctx.reply);
      expect(buttons.some((b: any) => b.url)).toBe(false);
      expect(buttons.some((b: any) => b.copy_text)).toBe(false);
      expect(
        buttons.some((b: any) => b.callback_data === "referral:close"),
      ).toBe(true);
    });

    it("handles getMe rejection — falls back, no link generated", async () => {
      const ctx = mockCtx({ me: undefined });
      ctx.api.getMe = vi.fn().mockRejectedValue(new Error("getMe fail"));
      const env = {
        API_SERVICE: createMockApiService({
          "/users/123": () => ok(referralUser),
        }),
      } as any;

      await referralCommand(ctx, env);

      const msg: string = (ctx.reply as any).mock.calls[0][0];
      expect(msg).not.toContain("https://t.me/");

      const buttons = flatButtons(ctx.reply);
      expect(buttons.some((b: any) => b.url)).toBe(false);
    });

    it("handles missing referral code — shows N/A, no link, no share/copy buttons", async () => {
      const ctx = mockCtx();
      const env = {
        API_SERVICE: createMockApiService({
          "/users/123": () =>
            ok({
              user: {
                ...existingUser,
                referralCount: 0,
                referralBonusSwipes: 0,
              },
            }),
          "/users/123/referral": () => err(500),
        }),
      } as any;

      await referralCommand(ctx, env);

      const msg: string = (ctx.reply as any).mock.calls[0][0];
      expect(msg).toContain("N/A");
      expect(msg).not.toContain("https://t.me/");

      const buttons = flatButtons(ctx.reply);
      expect(buttons.some((b: any) => b.url)).toBe(false);
      expect(buttons.some((b: any) => b.copy_text)).toBe(false);
    });
  });

  describe("error handling", () => {
    it("handles getReferralInfo fetch failure — shows stats with zero values", async () => {
      const ctx = mockCtx();
      // The user-data fetch succeeds (user data exists), but the referral-code
      // endpoint fails. getReferralInfo still returns { code: null, count: 0, bonus: 0 }.
      const env = {
        API_SERVICE: createMockApiService({
          "/users/123": () =>
            ok({
              user: {
                ...existingUser,
                referralCount: 0,
                referralBonusSwipes: 0,
              },
            }),
          "/users/123/referral": () => err(500),
        }),
      } as any;

      await referralCommand(ctx, env);

      const msg: string = (ctx.reply as any).mock.calls[0][0];
      expect(msg).toContain("N/A");
      // With count=0, bonus=0 the stats lines are still rendered
      expect(msg).toContain("*Friends invited:* 0");
      expect(msg).toContain("*Bonus earned:* +0");
    });

    it("catches unhandled errors and replies with generic message", async () => {
      const ctx = mockCtx();
      ctx.reply = vi
        .fn()
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValue(undefined);

      const env = {
        KV: mockKV() as unknown as KVNamespace,
        API_SERVICE: createMockApiService({
          "/users/123": () => ok(referralUser),
        }),
      } as any;

      await referralCommand(ctx, env);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Trace ID:"),
        expect.anything(),
      );
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// premiumCallbacks
// ────────────────────────────────────────────────────────────────────────────

describe("premiumCallbacks", () => {
  describe("guard clauses", () => {
    it("returns early when ctx.from is missing", async () => {
      const ctx = mockCtx({
        from: undefined,
        callbackQuery: { id: "cb1", data: "premium:show" },
      });
      const env = {
        KV: mockKV() as unknown as KVNamespace,
        API_SERVICE: createMockApiService({}),
      } as any;

      await premiumCallbacks(ctx, env);

      expect(ctx.answerCallbackQuery).not.toHaveBeenCalled();
      expect(ctx.deleteMessage).not.toHaveBeenCalled();
    });

    it("returns early when callbackQuery.data is empty string", async () => {
      const ctx = mockCtx({
        callbackQuery: { id: "cb1", data: "" },
      });
      const env = {
        KV: mockKV() as unknown as KVNamespace,
        API_SERVICE: createMockApiService({}),
      } as any;

      await premiumCallbacks(ctx, env);

      expect(ctx.answerCallbackQuery).not.toHaveBeenCalled();
      expect(ctx.deleteMessage).not.toHaveBeenCalled();
    });

    it("returns early when callbackQuery is undefined", async () => {
      const ctx = mockCtx({ callbackQuery: undefined });
      const env = {
        KV: mockKV() as unknown as KVNamespace,
        API_SERVICE: createMockApiService({}),
      } as any;

      await premiumCallbacks(ctx, env);

      expect(ctx.answerCallbackQuery).not.toHaveBeenCalled();
      expect(ctx.deleteMessage).not.toHaveBeenCalled();
    });
  });

  describe('data = "premium:show"', () => {
    it("calls premiumCommand and answers callback query", async () => {
      const ctx = mockCtx({
        callbackQuery: { id: "cb1", data: "premium:show" },
      });
      const env = {
        KV: mockKV() as unknown as KVNamespace,
        API_SERVICE: createMockApiService(
          withUser({
            "/users/123/interaction-status": () => ok(interactionFree),
          }),
        ),
      } as any;

      await premiumCallbacks(ctx, env);

      expect(ctx.reply).toHaveBeenCalled();
      const msg: string = (ctx.reply as any).mock.calls[0][0];
      expect(msg).toContain("*Current plan:* Free");
      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    });

    it("handles premiumCommand crash and still answers callback", async () => {
      const ctx = mockCtx({
        callbackQuery: { id: "cb1", data: "premium:show" },
      });
      ctx.reply = vi
        .fn()
        .mockRejectedValueOnce(new Error("reply crash"))
        .mockResolvedValue(undefined);
      const env = {
        KV: mockKV() as unknown as KVNamespace,
        API_SERVICE: createMockApiService(
          withUser({
            "/users/123/interaction-status": () => ok(interactionFree),
          }),
        ),
      } as any;

      await premiumCallbacks(ctx, env);

      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Trace ID:"),
        expect.anything(),
      );
    });
  });

  describe('data = "premium:close"', () => {
    it("deletes message and answers callback query", async () => {
      const ctx = mockCtx({
        callbackQuery: { id: "cb1", data: "premium:close" },
      });
      const env = {
        KV: mockKV() as unknown as KVNamespace,
        API_SERVICE: createMockApiService({}),
      } as any;

      await premiumCallbacks(ctx, env);

      expect(ctx.deleteMessage).toHaveBeenCalled();
      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it("handles deleteMessage failure gracefully (answers callback)", async () => {
      const ctx = mockCtx({
        callbackQuery: { id: "cb1", data: "premium:close" },
      });
      ctx.deleteMessage = vi.fn().mockRejectedValue(new Error("delete err"));
      const env = {
        KV: mockKV() as unknown as KVNamespace,
        API_SERVICE: createMockApiService({}),
      } as any;

      await premiumCallbacks(ctx, env);

      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    });
  });

  describe('data = "referral:show"', () => {
    it("calls referralCommand and answers callback query", async () => {
      const ctx = mockCtx({
        callbackQuery: { id: "cb1", data: "referral:show" },
      });
      const env = {
        API_SERVICE: createMockApiService({
          "/users/123": () => ok(referralUser),
        }),
      } as any;

      await premiumCallbacks(ctx, env);

      expect(ctx.reply).toHaveBeenCalled();
      const msg: string = (ctx.reply as any).mock.calls[0][0];
      expect(msg).toContain("ABC123");
      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    });
  });

  describe('data = "referral:close"', () => {
    it("deletes message and answers callback query", async () => {
      const ctx = mockCtx({
        callbackQuery: { id: "cb1", data: "referral:close" },
      });
      const env = {
        KV: mockKV() as unknown as KVNamespace,
        API_SERVICE: createMockApiService({}),
      } as any;

      await premiumCallbacks(ctx, env);

      expect(ctx.deleteMessage).toHaveBeenCalled();
      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
      expect(ctx.reply).not.toHaveBeenCalled();
    });
  });

  describe('data = "referral:dismiss"', () => {
    it("deletes message and answers callback query", async () => {
      const ctx = mockCtx({
        callbackQuery: { id: "cb1", data: "referral:dismiss" },
      });
      const env = {
        KV: mockKV() as unknown as KVNamespace,
        API_SERVICE: createMockApiService({}),
      } as any;

      await premiumCallbacks(ctx, env);

      expect(ctx.deleteMessage).toHaveBeenCalled();
      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
      expect(ctx.reply).not.toHaveBeenCalled();
    });
  });

  describe('data = "premium_ad:dismiss"', () => {
    it("deletes message and answers callback query", async () => {
      const ctx = mockCtx({
        callbackQuery: { id: "cb1", data: "premium_ad:dismiss" },
      });
      const env = {
        KV: mockKV() as unknown as KVNamespace,
        API_SERVICE: createMockApiService({}),
      } as any;

      await premiumCallbacks(ctx, env);

      expect(ctx.deleteMessage).toHaveBeenCalled();
      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
      expect(ctx.reply).not.toHaveBeenCalled();
    });
  });

  describe("unknown callback data", () => {
    it("does nothing for unrecognised callback data", async () => {
      const ctx = mockCtx({
        callbackQuery: { id: "cb1", data: "unknown:action" },
      });
      const env = {
        KV: mockKV() as unknown as KVNamespace,
        API_SERVICE: createMockApiService({}),
      } as any;

      await premiumCallbacks(ctx, env);

      expect(ctx.answerCallbackQuery).not.toHaveBeenCalled();
      expect(ctx.deleteMessage).not.toHaveBeenCalled();
      expect(ctx.reply).not.toHaveBeenCalled();
    });
  });
});
