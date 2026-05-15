import { describe, it, expect, vi, beforeEach } from "vitest";
import { getConversationState, setConversationState, clearConversationState, startConversation, handleConversationMessage } from "../lib/conversations.js";
import type { MyContext } from "../types.js";

function mockKV() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
    delete: vi.fn(async (key: string) => { store.delete(key); }),
    _store: store,
  };
}

function mockEnv(kv = mockKV()) {
  return {
    DB: {} as D1Database,
    KV: kv as unknown as KVNamespace,
    API_SERVICE: { fetch: vi.fn().mockResolvedValue(new Response(null, { status: 200 })) } as unknown as Fetcher,
    BOT_TOKEN: "test-token",
  };
}

function mockCtx(text?: string): MyContext {
  return {
    reply: vi.fn().mockResolvedValue(undefined),
    from: { id: 123, first_name: "Test", is_bot: false, language_code: "en" },
    message: text ? { text, message_id: 1, date: 1, chat: { id: 123, type: "private" } } : undefined,
  } as unknown as MyContext;
}

describe("Conversation State Management", () => {
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    kv = mockKV();
  });

  it("should set and get conversation state", async () => {
    await setConversationState(kv as unknown as KVNamespace, { userId: "123", field: "bio", step: 0 });
    const state = await getConversationState(kv as unknown as KVNamespace, "123");
    expect(state).not.toBeNull();
    expect(state!.field).toBe("bio");
  });

  it("should return null for missing state", async () => {
    const state = await getConversationState(kv as unknown as KVNamespace, "999");
    expect(state).toBeNull();
  });

  it("should clear conversation state", async () => {
    await startConversation(kv as unknown as KVNamespace, "123", "bio");
    await clearConversationState(kv as unknown as KVNamespace, "123");
    const state = await getConversationState(kv as unknown as KVNamespace, "123");
    expect(state).toBeNull();
  });

  it("should start conversation with field", async () => {
    await startConversation(kv as unknown as KVNamespace, "123", "birthdate");
    const state = await getConversationState(kv as unknown as KVNamespace, "123");
    expect(state!.field).toBe("birthdate");
    expect(state!.step).toBe(0);
  });
});

describe("Conversation Message Handling", () => {
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    kv = mockKV();
  });

  it("should return false when no conversation is active", async () => {
    const ctx = mockCtx("hello");
    const result = await handleConversationMessage(ctx, mockEnv(kv));
    expect(result).toBe(false);
  });

  it("should handle Cancel command", async () => {
    await startConversation(kv as unknown as KVNamespace, "123", "bio");
    const ctx = mockCtx("Cancel");
    const result = await handleConversationMessage(ctx, mockEnv(kv));
    expect(result).toBe(true);
    expect(ctx.reply).toHaveBeenCalledWith("Cancelled.", expect.anything());
    const state = await getConversationState(kv as unknown as KVNamespace, "123");
    expect(state).toBeNull();
  });

  it("should process bio input", async () => {
    await startConversation(kv as unknown as KVNamespace, "123", "bio");
    const ctx = mockCtx("I love hiking and coding");
    const result = await handleConversationMessage(ctx, mockEnv(kv));
    expect(result).toBe(true);
  });

  it("should process birthdate input", async () => {
    await startConversation(kv as unknown as KVNamespace, "123", "birthdate");
    const ctx = mockCtx("15.03.1995");
    const result = await handleConversationMessage(ctx, mockEnv(kv));
    expect(result).toBe(true);
  });

  it("should reject invalid birthdate", async () => {
    await startConversation(kv as unknown as KVNamespace, "123", "birthdate");
    const ctx = mockCtx("not-a-date");
    const result = await handleConversationMessage(ctx, mockEnv(kv));
    expect(result).toBe(true);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Invalid date"));
  });

  it("should process gender input", async () => {
    await startConversation(kv as unknown as KVNamespace, "123", "gender");
    const ctx = mockCtx("Male");
    const result = await handleConversationMessage(ctx, mockEnv(kv));
    expect(result).toBe(true);
  });

  it("should reject invalid gender", async () => {
    await startConversation(kv as unknown as KVNamespace, "123", "gender");
    const ctx = mockCtx("unknown");
    const result = await handleConversationMessage(ctx, mockEnv(kv));
    expect(result).toBe(true);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Male"));
  });

  it("should process name input", async () => {
    await startConversation(kv as unknown as KVNamespace, "123", "name");
    const ctx = mockCtx("John");
    const result = await handleConversationMessage(ctx, mockEnv(kv));
    expect(result).toBe(true);
  });

  it("should process interests input", async () => {
    await startConversation(kv as unknown as KVNamespace, "123", "interests");
    const ctx = mockCtx("hiking, coding, coffee");
    const result = await handleConversationMessage(ctx, mockEnv(kv));
    expect(result).toBe(true);
  });

  it("should process location input", async () => {
    await startConversation(kv as unknown as KVNamespace, "123", "location");
    const ctx = mockCtx("Jakarta, Indonesia");
    const result = await handleConversationMessage(ctx, mockEnv(kv));
    expect(result).toBe(true);
  });
});
