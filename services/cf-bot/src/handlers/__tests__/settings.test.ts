import { describe, it, expect, vi, beforeEach } from "vitest";
import { settingsCommand, settingsCallbacks } from "../settings.js";
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

describe("Settings Handlers", () => {
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
            JSON.stringify({ user: { id: "123", displayName: "Test" } }),
            { status: 200 },
          ),
      }),
    };
  });

  describe("settingsCommand", () => {
    it("should show settings menu for existing user", async () => {
      await settingsCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Settings"),
        expect.objectContaining({ parse_mode: "Markdown" }),
      );
    });

    it("should do nothing when ctx.from is missing", async () => {
      (ctx as any).from = undefined;
      await settingsCommand(ctx, env);
      expect(ctx.reply).not.toHaveBeenCalled();
    });
  });

  describe("settingsCallbacks", () => {
    it("should start age-range conversation with grid", async () => {
      ctx.callbackQuery!.data = "settings:age-range";
      await settingsCallbacks(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("minimum"),
        expect.anything(),
      );
      const state = await kv.get("conversation:123");
      expect(JSON.parse(state!).field).toBe("age-range");
    });

    it("should start distance conversation", async () => {
      ctx.callbackQuery!.data = "settings:distance";
      await settingsCallbacks(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("distance"),
        expect.anything(),
      );
      const state = await kv.get("conversation:123");
      expect(JSON.parse(state!).field).toBe("distance");
    });

    it("should start gender-pref conversation", async () => {
      ctx.callbackQuery!.data = "settings:gender-pref";
      await settingsCallbacks(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("gender"),
        expect.anything(),
      );
      const state = await kv.get("conversation:123");
      expect(JSON.parse(state!).field).toBe("gender-pref");
    });

    it("should delete message on settings:close", async () => {
      ctx.callbackQuery!.data = "settings:close";
      await settingsCallbacks(ctx, env);
      expect(ctx.deleteMessage).toHaveBeenCalled();
    });

    it("should answer unknown setting", async () => {
      ctx.callbackQuery!.data = "settings:unknown";
      await settingsCallbacks(ctx, env);
      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith("Unknown setting.");
    });

    it("should do nothing when callbackQuery is missing", async () => {
      (ctx as any).callbackQuery = undefined;
      await settingsCallbacks(ctx, env);
      expect(ctx.reply).not.toHaveBeenCalled();
    });
  });
});
