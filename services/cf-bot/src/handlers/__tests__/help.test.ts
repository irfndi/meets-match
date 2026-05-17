import { describe, it, expect, vi, beforeEach } from "vitest";
import { helpCommand, aboutCommand } from "../help.js";
import type { MyContext } from "../../types.js";

function mockCtx(): MyContext {
  return {
    reply: vi.fn().mockResolvedValue(undefined),
    from: { id: 123, first_name: "Test", is_bot: false, language_code: "en" },
    chat: { id: 123, type: "private" },
  } as unknown as MyContext;
}

function createMockEnv() {
  return {
    KV: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as KVNamespace,
    API_SERVICE: {
      fetch: vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({}), { status: 404 })),
    },
  };
}

describe("Help Handlers", () => {
  let ctx: MyContext;
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    ctx = mockCtx();
    env = createMockEnv();
  });

  describe("helpCommand", () => {
    it("should send help message", async () => {
      await helpCommand(ctx, env as any);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("MeetMatch Bot"),
        expect.anything(),
      );
    });

    it("should show error with trace ID when reply fails", async () => {
      // First call (help message) fails, second call (error message) succeeds
      ctx.reply = vi
        .fn()
        .mockRejectedValueOnce(new Error("Telegram API error"))
        .mockResolvedValueOnce(undefined);
      await helpCommand(ctx, env as any);
      // replyWithError should be called on second attempt
      expect(ctx.reply).toHaveBeenCalledTimes(2);
      const errorCall = (ctx.reply as any).mock.calls[1];
      expect(errorCall[0]).toContain("Trace ID:");
    });
  });

  describe("aboutCommand", () => {
    it("should send about message", async () => {
      await aboutCommand(ctx, env as any);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("About"),
        expect.anything(),
      );
    });

    it("should show error with trace ID when reply fails", async () => {
      ctx.reply = vi
        .fn()
        .mockRejectedValueOnce(new Error("Telegram API error"))
        .mockResolvedValueOnce(undefined);
      await aboutCommand(ctx, env as any);
      expect(ctx.reply).toHaveBeenCalledTimes(2);
      const errorCall = (ctx.reply as any).mock.calls[1];
      expect(errorCall[0]).toContain("Trace ID:");
    });
  });
});
