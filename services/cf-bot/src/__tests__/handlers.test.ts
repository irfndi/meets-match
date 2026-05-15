import { describe, it, expect, vi } from "vitest";
import { startCommand } from "../handlers/start.js";
import { helpCommand, aboutCommand } from "../handlers/help.js";
import { matchCommand } from "../handlers/match.js";
import { matchesCommand } from "../handlers/matches.js";
import { settingsCommand } from "../handlers/settings.js";
import type { MyContext } from "../types.js";

function mockCtx(text?: string): MyContext {
  return {
    reply: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    from: { id: 123, first_name: "Test", is_bot: false, language_code: "en" },
    message: text ? { text, message_id: 1, date: 1, chat: { id: 123, type: "private" as const } } : undefined,
    callbackQuery: undefined,
    chat: { id: 123, type: "private" as const },
  } as unknown as MyContext;
}

function createMockApiService(responseMap: Record<string, () => Response>) {
  return {
    fetch: vi.fn().mockImplementation((req: Request) => {
      const url = typeof req === 'string' ? req : (req as any).url || String(req);
      for (const [pattern, factory] of Object.entries(responseMap)) {
        if (url.includes(pattern)) {
          return Promise.resolve(factory());
        }
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 404 }));
    }),
  };
}

function createMockKV() {
  return {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
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
};

const incompleteUser = {
  id: "123",
  displayName: "Test",
};

describe("Bot Handlers", () => {
  describe("startCommand", () => {
    it("should send language selection for new user", async () => {
      const ctx = mockCtx();
      const env = {
        API_SERVICE: createMockApiService({
          "/users/123": () => new Response(JSON.stringify({ error: "not found" }), { status: 404 }),
          "/users": () => new Response(JSON.stringify({ user: completeUser }), { status: 201 }),
        }),
      } as any;
      await startCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalled();
      const message = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(message).toContain("Choose your language");
    });

    it("should send welcome back for existing complete user", async () => {
      const ctx = mockCtx();
      const env = {
        API_SERVICE: createMockApiService({
          "/users/123": () => new Response(JSON.stringify({ user: completeUser }), { status: 200 }),
        }),
      } as any;
      await startCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalled();
      const message = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(message).toContain("Welcome back");
    });

    it("should prompt incomplete existing user to complete profile", async () => {
      const ctx = mockCtx();
      const env = {
        API_SERVICE: createMockApiService({
          "/users/123": () => new Response(JSON.stringify({ user: incompleteUser }), { status: 200 }),
        }),
      } as any;
      await startCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalled();
      const message = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(message).toContain("Welcome back");
      expect(message).toContain("incomplete");
    });
  });

  describe("helpCommand", () => {
    it("should send help message with all commands listed", async () => {
      const ctx = mockCtx();
      await helpCommand(ctx);
      expect(ctx.reply).toHaveBeenCalled();
      const message = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(message).toContain("/start");
      expect(message).toContain("/profile");
      expect(message).toContain("/match");
      expect(message).toContain("/settings");
      expect(message).toContain("/about");
    });

    it("should use Markdown parse mode with main menu keyboard", async () => {
      const ctx = mockCtx();
      await helpCommand(ctx);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ parse_mode: "Markdown" }),
      );
    });
  });

  describe("aboutCommand", () => {
    it("should send about message", async () => {
      const ctx = mockCtx();
      await aboutCommand(ctx);
      expect(ctx.reply).toHaveBeenCalled();
      const message = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(message).toContain("MeetMatch");
    });
  });

  describe("matchCommand", () => {
    it("should redirect incomplete user to profile", async () => {
      const ctx = mockCtx();
      const env = {
        API_SERVICE: createMockApiService({
          "/users/123": () => new Response(JSON.stringify({ user: incompleteUser }), { status: 200 }),
        }),
        KV: createMockKV(),
      } as any;
      await matchCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Almost there"));
    });

    it("should reply with finding matches message for complete user", async () => {
      const ctx = mockCtx();
      const env = {
        API_SERVICE: createMockApiService({
          "/users/123": () => new Response(JSON.stringify({ user: completeUser }), { status: 200 }),
          "/potential-matches": () => new Response(JSON.stringify({ potentialMatches: [] }), { status: 200 }),
        }),
        KV: createMockKV(),
      } as any;
      await matchCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalled();
    });
  });

  describe("matchesCommand", () => {
    it("should redirect incomplete user to profile", async () => {
      const ctx = mockCtx();
      const env = {
        API_SERVICE: createMockApiService({
          "/users/123": () => new Response(JSON.stringify({ user: incompleteUser }), { status: 200 }),
        }),
        KV: createMockKV(),
      } as any;
      await matchesCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Almost there"),
        expect.any(Object),
      );
    });

    it("should reply with no matches message when empty for complete user", async () => {
      const ctx = mockCtx();
      const env = {
        API_SERVICE: createMockApiService({
          "/users/123": () => new Response(JSON.stringify({ user: completeUser }), { status: 200 }),
          "/matches": () => new Response(JSON.stringify({ matches: [] }), { status: 200 }),
          "/pending-likes": () => new Response(JSON.stringify({ pendingLikes: [] }), { status: 200 }),
        }),
        KV: createMockKV(),
      } as any;
      await matchesCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("No matches yet"),
        expect.any(Object),
      );
    });
  });

  describe("settingsCommand", () => {
    it("should show settings menu for existing user", async () => {
      const ctx = mockCtx();
      const env = {
        API_SERVICE: createMockApiService({
          "/users/123": () => new Response(JSON.stringify({ user: completeUser }), { status: 200 }),
        }),
        KV: {},
      } as any;
      await settingsCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Settings"),
        expect.any(Object),
      );
    });
  });
});
