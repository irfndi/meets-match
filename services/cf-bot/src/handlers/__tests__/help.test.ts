import { describe, it, expect, vi, beforeEach } from "vitest";
import { helpCommand, aboutCommand } from "../help.js";
import type { MyContext } from "../../types.js";

function mockCtx(overrides: Record<string, unknown> = {}): MyContext {
  return {
    reply: vi.fn().mockResolvedValue(undefined),
    from: { id: 123, first_name: "Test", is_bot: false, language_code: "en" },
    chat: { id: 123, type: "private" },
    ...overrides,
  } as unknown as MyContext;
}

function createMockEnv(responseOverrides: Record<string, unknown> = {}) {
  return {
    KV: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as KVNamespace,
    API_SERVICE: {
      fetch: vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(responseOverrides), {
            status: responseOverrides.user ? 200 : 404,
          }),
        ),
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
      ctx.reply = vi
        .fn()
        .mockRejectedValueOnce(new Error("Telegram API error"))
        .mockResolvedValueOnce(undefined);
      await helpCommand(ctx, env as any);
      expect(ctx.reply).toHaveBeenCalledTimes(2);
      const errorCall = (ctx.reply as any).mock.calls[1];
      expect(errorCall[0]).toContain("Trace ID:");
    });

    it("should fetch user language and show help in Indonesian", async () => {
      env = createMockEnv({ user: { language: "id" } });
      await helpCommand(ctx, env as any);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("MeetMatch Bot"),
        expect.anything(),
      );
    });

    it("should handle missing ctx.from (uses fallback en)", async () => {
      ctx = mockCtx({ from: undefined });
      await helpCommand(ctx, env as any);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("MeetMatch Bot"),
        expect.anything(),
      );
    });

    it("should handle API fetch failure (uses fallback en)", async () => {
      env = {
        KV: {
          get: vi.fn().mockResolvedValue(null),
          put: vi.fn().mockResolvedValue(undefined),
          delete: vi.fn().mockResolvedValue(undefined),
        } as unknown as KVNamespace,
        API_SERVICE: {
          fetch: vi.fn().mockRejectedValue(new Error("Network error")),
        },
      };
      await helpCommand(ctx, env as any);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("MeetMatch Bot"),
        expect.anything(),
      );
    });

    it("should include main menu keyboard in reply", async () => {
      await helpCommand(ctx, env as any);
      const call = (ctx.reply as any).mock.calls[0];
      expect(call[1]).toMatchObject({
        parse_mode: "Markdown",
        reply_markup: expect.anything(),
      });
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

    it("should fetch user language and show about in Indonesian", async () => {
      env = createMockEnv({ user: { language: "id" } });
      await aboutCommand(ctx, env as any);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Tentang"),
        expect.anything(),
      );
    });

    it("should include version and environment info", async () => {
      await aboutCommand(ctx, env as any);
      const call = (ctx.reply as any).mock.calls[0];
      expect(call[0]).toContain("Version:");
      expect(call[0]).toContain("Environment:");
    });

    it("should handle missing ctx.from (uses fallback en)", async () => {
      ctx = mockCtx({ from: undefined });
      await aboutCommand(ctx, env as any);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("About"),
        expect.anything(),
      );
    });

    it("should handle API fetch failure (uses fallback en)", async () => {
      env = {
        KV: {
          get: vi.fn().mockResolvedValue(null),
          put: vi.fn().mockResolvedValue(undefined),
          delete: vi.fn().mockResolvedValue(undefined),
        } as unknown as KVNamespace,
        API_SERVICE: {
          fetch: vi.fn().mockRejectedValue(new Error("Network error")),
        },
      };
      await aboutCommand(ctx, env as any);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("About"),
        expect.anything(),
      );
    });
  });
});
