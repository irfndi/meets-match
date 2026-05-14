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

describe("Bot Handlers", () => {
  describe("startCommand", () => {
    it("should send welcome message", async () => {
      const ctx = mockCtx();
      const env = { API_SERVICE: { fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ user: { id: "123" } }), { status: 201 })) } } as any;
      await startCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalled();
      const message = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(message).toContain("Welcome");
      expect(message).toContain("/profile");
      expect(message).toContain("/match");
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

    it("should use Markdown parse mode", async () => {
      const ctx = mockCtx();
      await helpCommand(ctx);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.any(String),
        { parse_mode: "Markdown" },
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
    it("should reply with finding matches message", async () => {
      const ctx = mockCtx();
      await matchCommand(ctx, { API_SERVICE: { fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ potentialMatches: [] }))) } } as any);
      expect(ctx.reply).toHaveBeenCalled();
    });
  });

  describe("matchesCommand", () => {
    it("should reply with no matches message when empty", async () => {
      const ctx = mockCtx();
      await matchesCommand(ctx, { API_SERVICE: { fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ potentialMatches: [] }))) } } as any);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("No matches"),
      );
    });
  });

  describe("settingsCommand", () => {
    it("should show settings menu", async () => {
      const ctx = mockCtx();
      await settingsCommand(ctx, { KV: {} } as any);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Settings"),
        expect.any(Object),
      );
    });
  });
});
