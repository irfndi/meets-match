import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleProfileCallback } from "../profile.js";
import type { MyContext } from "../../types.js";

function mockKV() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
    delete: vi.fn(async (key: string) => { store.delete(key); }),
    _store: store,
  };
}

function mockCtx(): MyContext {
  return {
    reply: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    from: { id: 123, first_name: "Test", is_bot: false, language_code: "en" },
    callbackQuery: { id: "cb1", from: { id: 123, is_bot: false, first_name: "Test" }, data: "", message: { message_id: 1, chat: { id: 123, type: "private" }, date: 1 } },
    chat: { id: 123, type: "private" },
  } as unknown as MyContext;
}

function createMockApiService(responseMap: Record<string, () => Response>) {
  return {
    fetch: vi.fn().mockImplementation((req: Request) => {
      const url = typeof req === "string" ? req : (req as any).url || String(req);
      for (const [pattern, factory] of Object.entries(responseMap)) {
        if (url.includes(pattern)) return Promise.resolve(factory());
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 404 }));
    }),
  };
}

describe("Profile Menu Callbacks", () => {
  let kv: ReturnType<typeof mockKV>;
  let ctx: MyContext;
  let env: any;

  beforeEach(() => {
    kv = mockKV();
    ctx = mockCtx();
    env = {
      KV: kv as unknown as KVNamespace,
      API_SERVICE: createMockApiService({
        "/users/123": () => new Response(JSON.stringify({ user: { language: "en" } }), { status: 200 }),
      }),
    };
  });

  it("should start bio conversation on profile:bio", async () => {
    const result = await handleProfileCallback(ctx, env, "profile:bio");
    expect(result).toBe(true);
    expect(ctx.reply).toHaveBeenCalled();
    const state = await kv.get("conversation:123");
    expect(state).not.toBeNull();
    expect(JSON.parse(state!).field).toBe("bio");
  });

  it("should start birthdate conversation on profile:birthdate", async () => {
    const result = await handleProfileCallback(ctx, env, "profile:birthdate");
    expect(result).toBe(true);
    expect(ctx.reply).toHaveBeenCalled();
    const state = await kv.get("conversation:123");
    expect(JSON.parse(state!).field).toBe("birthdate");
  });

  it("should start name conversation on profile:name", async () => {
    const result = await handleProfileCallback(ctx, env, "profile:name");
    expect(result).toBe(true);
    expect(ctx.reply).toHaveBeenCalled();
    const state = await kv.get("conversation:123");
    expect(JSON.parse(state!).field).toBe("name");
  });

  it("should start gender conversation on profile:gender", async () => {
    const result = await handleProfileCallback(ctx, env, "profile:gender");
    expect(result).toBe(true);
    expect(ctx.reply).toHaveBeenCalled();
    const state = await kv.get("conversation:123");
    expect(JSON.parse(state!).field).toBe("gender");
  });

  it("should start interests conversation on profile:interests", async () => {
    const result = await handleProfileCallback(ctx, env, "profile:interests");
    expect(result).toBe(true);
    expect(ctx.reply).toHaveBeenCalled();
    const state = await kv.get("conversation:123");
    expect(JSON.parse(state!).field).toBe("interests");
  });

  it("should start location conversation on profile:location", async () => {
    const result = await handleProfileCallback(ctx, env, "profile:location");
    expect(result).toBe(true);
    expect(ctx.reply).toHaveBeenCalled();
    const state = await kv.get("conversation:123");
    expect(JSON.parse(state!).field).toBe("location");
  });

  it("should delete message on profile:close", async () => {
    const result = await handleProfileCallback(ctx, env, "profile:close");
    expect(result).toBe(true);
    expect(ctx.deleteMessage).toHaveBeenCalled();
  });

  it("should return false for unknown callback", async () => {
    const result = await handleProfileCallback(ctx, env, "profile:unknown");
    expect(result).toBe(false);
  });

  it("should return false when ctx.from is missing", async () => {
    (ctx as any).from = undefined;
    const result = await handleProfileCallback(ctx, env, "profile:bio");
    expect(result).toBe(false);
  });
});
