import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getConversationState,
  setConversationState,
  clearConversationState,
  startConversation,
  continueOnboarding,
  checkMandatoryUpdates,
  handleConversationMessage,
  handleContactMessage,
  handleLocationMessage,
  checkAndUpdateProfileComplete,
} from "../conversations.js";
import type { MyContext } from "../../types.js";
import type { Language } from "../i18n.js";

// ================================================================
// Mock helpers
// ================================================================

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

/**
 * Creates a mock Env where API_SERVICE.fetch returns the given user
 * for GET /users/*, returns 200 for PUT /users/*, and geo-data for
 * geocode endpoints.
 */
function createEnvWithUser(
  kv: ReturnType<typeof mockKV>,
  user: Record<string, unknown>,
) {
  return {
    DB: {} as D1Database,
    KV: kv as unknown as KVNamespace,
    API_SERVICE: {
      fetch: vi.fn().mockImplementation((req: Request) => {
        const url = String(req.url);
        if (url.includes("/users/") && req.method === "GET") {
          return Promise.resolve(
            new Response(JSON.stringify({ user }), { status: 200 }),
          );
        }
        if (url.includes("/users/") && req.method === "PUT") {
          return Promise.resolve(
            new Response(JSON.stringify({ ok: true }), { status: 200 }),
          );
        }
        // Geocode endpoint
        if (url.includes("/geocode")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ result: { city: "TestCity", country: "TestCountry" } }),
              { status: 200 },
            ),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({}), { status: 200 }),
        );
      }),
    } as unknown as Fetcher,
    BOT_TOKEN: "test-token",
  };
}

function createMockCtx(overrides: Partial<MyContext> = {}): MyContext {
  return {
    reply: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    from: { id: 123, first_name: "Test", is_bot: false, language_code: "en" },
    message: {
      text: undefined as string | undefined,
      message_id: 1,
      date: 1,
      chat: { id: 123, type: "private" as const },
    },
    ...overrides,
  } as unknown as MyContext;
}

// ================================================================
// 1. Conversation State Management
// ================================================================

describe("Conversation State Management", () => {
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    kv = mockKV();
  });

  describe("getConversationState", () => {
    it("returns null when no state exists", async () => {
      const state = await getConversationState(kv as any, "999");
      expect(state).toBeNull();
    });

    it("returns parsed state when state exists", async () => {
      await kv.put(
        "conversation:123",
        JSON.stringify({ userId: "123", field: "bio", step: 0 }),
      );
      const state = await getConversationState(kv as any, "123");
      expect(state).not.toBeNull();
      expect(state!.field).toBe("bio");
      expect(state!.step).toBe(0);
      expect(state!.userId).toBe("123");
    });
  });

  describe("setConversationState", () => {
    it("stores state with TTL", async () => {
      await setConversationState(kv as any, {
        userId: "123",
        field: "bio",
        step: 0,
      });
      const raw = kv._store.get("conversation:123");
      expect(raw).toBeDefined();
      const parsed = JSON.parse(raw!);
      expect(parsed.field).toBe("bio");
      // Verify TTL was passed
      expect(kv.put).toHaveBeenCalledWith(
        "conversation:123",
        expect.any(String),
        expect.objectContaining({ expirationTtl: expect.any(Number) }),
      );
    });
  });

  describe("clearConversationState", () => {
    it("deletes state from KV", async () => {
      await startConversation(kv as any, "123", "bio");
      let state = await getConversationState(kv as any, "123");
      expect(state).not.toBeNull();

      await clearConversationState(kv as any, "123");
      state = await getConversationState(kv as any, "123");
      expect(state).toBeNull();
      expect(kv.delete).toHaveBeenCalledWith("conversation:123");
    });

    it("does not throw when clearing non-existent state", async () => {
      await expect(
        clearConversationState(kv as any, "999"),
      ).resolves.toBeUndefined();
    });
  });

  describe("startConversation", () => {
    it("creates initial state with step 0", async () => {
      await startConversation(kv as any, "123", "birthdate");
      const state = await getConversationState(kv as any, "123");
      expect(state!.field).toBe("birthdate");
      expect(state!.step).toBe(0);
      expect(state!.userId).toBe("123");
    });

    it("creates initial state with optional data", async () => {
      await startConversation(kv as any, "123", "age-range", { min: 18 });
      const state = await getConversationState(kv as any, "123");
      expect(state!.field).toBe("age-range");
      expect(state!.data).toEqual({ min: 18 });
      expect(state!.step).toBe(0);
    });
  });
});

// ================================================================
// 2. continueOnboarding
// ================================================================

describe("continueOnboarding", () => {
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    kv = mockKV();
  });

  it("returns false when all steps are complete", async () => {
    await kv.put(
      "onboarding:seen:123",
      JSON.stringify(["name", "interests"]),
    );
    const env = createEnvWithUser(kv, {
      id: "123",
      displayName: "TestUser",
      birthDate: "1995-03-15",
      gender: "male",
      bio: "Hello world",
      location: { city: "Jakarta", country: "Indonesia" },
      mediaUrls: [{ url: "test.jpg", type: "image", uploadedAt: "2024-01-01" }],
      interests: ["Hiking"],
      phoneNumber: "+1234567890",
      language: "en",
    });
    const ctx = createMockCtx();

    const result = await continueOnboarding(ctx, env, "123", "en");
    expect(result).toBe(false);
    expect(ctx.reply).not.toHaveBeenCalled();
    // onboarding progress should be cleaned up
    expect(kv._store.get("onboarding:seen:123")).toBeUndefined();
  });

  it("starts with name step even when displayName is present (showOnce)", async () => {
    const env = createEnvWithUser(kv, {
      id: "123",
      displayName: "ExistingName",
      language: "en",
    });
    const ctx = createMockCtx();

    const result = await continueOnboarding(ctx, env, "123", "en");
    expect(result).toBe(true);
    const state = await getConversationState(kv as any, "123");
    expect(state!.field).toBe("name");
  });

  it("skips name when already seen in this session (showOnce)", async () => {
    await kv.put("onboarding:seen:123", JSON.stringify(["name"]));
    const env = createEnvWithUser(kv, {
      id: "123",
      displayName: "TestUser",
      language: "en",
    });
    const ctx = createMockCtx();

    const result = await continueOnboarding(ctx, env, "123", "en");
    expect(result).toBe(true);
    const state = await getConversationState(kv as any, "123");
    expect(state!.field).toBe("birthdate");
  });

  it("skips birthdate when already present (skipIfPresent)", async () => {
    await kv.put("onboarding:seen:123", JSON.stringify(["name"]));
    const env = createEnvWithUser(kv, {
      id: "123",
      displayName: "TestUser",
      birthDate: "1995-03-15",
      language: "en",
    });
    const ctx = createMockCtx();

    const result = await continueOnboarding(ctx, env, "123", "en");
    expect(result).toBe(true);
    const state = await getConversationState(kv as any, "123");
    expect(state!.field).toBe("gender");
  });

  it("skips gender when already present (skipIfPresent)", async () => {
    await kv.put("onboarding:seen:123", JSON.stringify(["name"]));
    const env = createEnvWithUser(kv, {
      id: "123",
      displayName: "TestUser",
      birthDate: "1995-03-15",
      gender: "male",
      language: "en",
    });
    const ctx = createMockCtx();

    const result = await continueOnboarding(ctx, env, "123", "en");
    expect(result).toBe(true);
    const state = await getConversationState(kv as any, "123");
    expect(state!.field).toBe("bio");
  });

  it("shows phone step with contact keyboard", async () => {
    await kv.put("onboarding:seen:123", JSON.stringify(["name", "interests"]));
    await kv.put("onboarding:interests-skipped:123", "true");
    const env = createEnvWithUser(kv, {
      id: "123",
      displayName: "TestUser",
      birthDate: "1995-03-15",
      gender: "male",
      bio: "Hello world",
      location: { city: "Jakarta", country: "Indonesia" },
      mediaUrls: [{ url: "test.jpg", type: "image", uploadedAt: "2024-01-01" }],
      interests: ["Hiking"],
      language: "en",
    });
    const ctx = createMockCtx();

    const result = await continueOnboarding(ctx, env, "123", "en");
    expect(result).toBe(true);
    const state = await getConversationState(kv as any, "123");
    expect(state!.field).toBe("phone");

    // Verify contact-sharing keyboard
    const replyCall = (ctx.reply as any).mock.calls[0];
    const keyboard = replyCall[1]?.reply_markup?.keyboard;
    expect(keyboard).toBeDefined();
    expect(keyboard[0][0].request_contact).toBe(true);
  });

  it("skips phone when already verified (skipIfVerified)", async () => {
    await kv.put("onboarding:seen:123", JSON.stringify(["name", "interests"]));
    await kv.put("onboarding:interests-skipped:123", "true");
    const env = createEnvWithUser(kv, {
      id: "123",
      displayName: "TestUser",
      birthDate: "1995-03-15",
      gender: "male",
      bio: "Hello world",
      location: { city: "Jakarta", country: "Indonesia" },
      mediaUrls: [{ url: "test.jpg", type: "image", uploadedAt: "2024-01-01" }],
      interests: ["Hiking"],
      phoneNumber: "+1234567890",
      language: "en",
    });
    const ctx = createMockCtx();

    const result = await continueOnboarding(ctx, env, "123", "en");
    expect(result).toBe(false);
    expect(kv._store.get("onboarding:seen:123")).toBeUndefined();
  });

  it("handles error gracefully when user not found", async () => {
    const env = createEnvWithUser(kv, {}); // empty user object
    // Override fetch to return 404 for GET
    (env.API_SERVICE.fetch as any).mockImplementation((req: Request) => {
      const url = String(req.url);
      if (url.includes("/users/") && req.method === "GET") {
        return Promise.resolve(new Response(null, { status: 404 }));
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });
    const ctx = createMockCtx();

    const result = await continueOnboarding(ctx, env, "123", "en");
    expect(result).toBe(true);
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("something went wrong"),
      expect.anything(),
    );
  });
});

// ================================================================
// 3. checkMandatoryUpdates
// ================================================================

describe("checkMandatoryUpdates", () => {
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    kv = mockKV();
  });

  it("returns false when ctx.from is not defined", async () => {
    const env = createEnvWithUser(kv, { id: "123" });
    const ctx = createMockCtx({ from: undefined } as any);

    const result = await checkMandatoryUpdates(ctx, env);
    expect(result).toBe(false);
  });

  it("returns false when API returns non-ok response", async () => {
    const env = {
      DB: {} as D1Database,
      KV: kv as unknown as KVNamespace,
      API_SERVICE: {
        fetch: vi.fn().mockResolvedValue(
          new Response(null, { status: 500 }),
        ),
      } as unknown as Fetcher,
      BOT_TOKEN: "test-token",
    };
    const ctx = createMockCtx();

    const result = await checkMandatoryUpdates(ctx, env);
    expect(result).toBe(false);
  });

  it("returns false when user is not found in API response", async () => {
    const env = {
      DB: {} as D1Database,
      KV: kv as unknown as KVNamespace,
      API_SERVICE: {
        fetch: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({}), { status: 200 }),
        ),
      } as unknown as Fetcher,
      BOT_TOKEN: "test-token",
    };
    const ctx = createMockCtx();

    const result = await checkMandatoryUpdates(ctx, env);
    expect(result).toBe(false);
  });

  it("triggers birthdate update for age-only profiles", async () => {
    const env = createEnvWithUser(kv, {
      id: "123",
      displayName: "TestUser",
      age: 25,
      // no birthDate
      language: "en",
    });
    const ctx = createMockCtx();

    const result = await checkMandatoryUpdates(ctx, env);
    expect(result).toBe(true);
    // Should have started a birthdate conversation
    const state = await getConversationState(kv as any, "123");
    expect(state!.field).toBe("birthdate");
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("birthdate"),
      expect.anything(),
    );
  });

  it("triggers onboarding for incomplete profiles", async () => {
    // User has birthDate but missing other fields
    const env = createEnvWithUser(kv, {
      id: "123",
      displayName: "TestUser",
      birthDate: "1995-03-15",
      language: "en",
    });
    const ctx = createMockCtx();

    const result = await checkMandatoryUpdates(ctx, env);
    expect(result).toBe(true);
    // Should have started a conversation (gender step since name showOnce and birthdate present)
    const state = await getConversationState(kv as any, "123");
    expect(state).not.toBeNull();
  });

  it("triggers phone verification for complete profile without phone", async () => {
    const env = createEnvWithUser(kv, {
      id: "123",
      displayName: "TestUser",
      birthDate: "1995-03-15",
      gender: "male",
      bio: "Hello",
      location: { city: "Jakarta", country: "Indonesia" },
      interests: ["Hiking"],
      mediaUrls: [{ url: "test.jpg", type: "image", uploadedAt: "2024-01-01" }],
      // no phoneNumber
      language: "en",
    });
    const ctx = createMockCtx();

    const result = await checkMandatoryUpdates(ctx, env);
    expect(result).toBe(true);
    // Should have prompted phone verification
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("verify your phone"),
      expect.anything(),
    );
  });

  it("returns false when profile is complete and phone is verified", async () => {
    const env = createEnvWithUser(kv, {
      id: "123",
      displayName: "TestUser",
      birthDate: "1995-03-15",
      gender: "male",
      bio: "Hello",
      location: { city: "Jakarta", country: "Indonesia" },
      interests: ["Hiking"],
      mediaUrls: [{ url: "test.jpg", type: "image", uploadedAt: "2024-01-01" }],
      phoneNumber: "+1234567890",
      language: "en",
    });
    const ctx = createMockCtx();

    const result = await checkMandatoryUpdates(ctx, env);
    expect(result).toBe(false);
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("handles errors gracefully (returns false on thrown exception)", async () => {
    const env = {
      DB: {} as D1Database,
      KV: kv as unknown as KVNamespace,
      API_SERVICE: {
        fetch: vi.fn().mockRejectedValue(new Error("Network failure")),
      } as unknown as Fetcher,
      BOT_TOKEN: "test-token",
    };
    const ctx = createMockCtx();

    const result = await checkMandatoryUpdates(ctx, env);
    expect(result).toBe(false);
  });
});

// ================================================================
// 4. handleConversationMessage
// ================================================================

describe("handleConversationMessage", () => {
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    kv = mockKV();
  });

  // --- Core routing tests ---

  it("returns false when no conversation is active", async () => {
    const ctx = createMockCtx({ message: { text: "hello", message_id: 1, date: 1, chat: { id: 123, type: "private" } } } as any);
    const env = createEnvWithUser(kv, { id: "123", language: "en" });

    const result = await handleConversationMessage(ctx, env);
    expect(result).toBe(false);
  });

  it("returns false when ctx.from is undefined", async () => {
    const ctx = createMockCtx({ from: undefined } as any);
    const env = createEnvWithUser(kv, { id: "123", language: "en" });

    const result = await handleConversationMessage(ctx, env);
    expect(result).toBe(false);
  });

  it("returns false when message has no text", async () => {
    await startConversation(kv as any, "123", "bio");
    const ctx = createMockCtx({
      message: { text: undefined, message_id: 1, date: 1, chat: { id: 123, type: "private" } },
    } as any);
    const env = createEnvWithUser(kv, { id: "123", language: "en" });

    const result = await handleConversationMessage(ctx, env);
    expect(result).toBe(false);
  });

  // --- Cancel button ---

  it("handles Cancel command", async () => {
    await startConversation(kv as any, "123", "bio");
    const ctx = createMockCtx({
      message: { text: "Cancel", message_id: 1, date: 1, chat: { id: 123, type: "private" } },
    } as any);
    const env = createEnvWithUser(kv, { id: "123", language: "en" });

    const result = await handleConversationMessage(ctx, env);
    expect(result).toBe(true);
    expect(ctx.reply).toHaveBeenCalledWith("Cancelled.", expect.anything());
    // State should be cleared
    const state = await getConversationState(kv as any, "123");
    expect(state).toBeNull();
  });

  // --- Bio conversation ---

  it("handles bio too long", async () => {
    await startConversation(kv as any, "123", "bio");
    const ctx = createMockCtx({
      message: { text: "A".repeat(301), message_id: 1, date: 1, chat: { id: 123, type: "private" } },
    } as any);
    const env = createEnvWithUser(kv, { id: "123", language: "en" });

    const result = await handleConversationMessage(ctx, env);
    expect(result).toBe(true);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("too long"));
  });

  it("handles valid bio", async () => {
    await startConversation(kv as any, "123", "bio");
    // Override fetch to return user for continueOnboarding
    const env = createEnvWithUser(kv, {
      id: "123",
      displayName: "TestUser",
      birthDate: "1995-03-15",
      gender: "male",
      bio: "I love hiking",
      location: { city: "Jakarta", country: "Indonesia" },
      mediaUrls: [{ url: "test.jpg", type: "image", uploadedAt: "2024-01-01" }],
      interests: ["Hiking"],
      phoneNumber: "+1234567890",
      language: "en",
    });
    const ctx = createMockCtx({
      message: { text: "I love hiking and coding", message_id: 1, date: 1, chat: { id: 123, type: "private" } },
    } as any);

    const result = await handleConversationMessage(ctx, env);
    expect(result).toBe(true);
    // PUT should have been called
    expect(env.API_SERVICE.fetch).toHaveBeenCalledWith(
      expect.objectContaining({ method: "PUT" }),
    );
  });

  // --- Birthdate conversation ---

  it("rejects invalid birthdate", async () => {
    await startConversation(kv as any, "123", "birthdate");
    const ctx = createMockCtx({
      message: { text: "not-a-date", message_id: 1, date: 1, chat: { id: 123, type: "private" } },
    } as any);
    const env = createEnvWithUser(kv, { id: "123", language: "en" });

    const result = await handleConversationMessage(ctx, env);
    expect(result).toBe(true);
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("Invalid date"),
    );
  });

  it("accepts valid birthdate", async () => {
    await startConversation(kv as any, "123", "birthdate");
    const env = createEnvWithUser(kv, {
      id: "123",
      displayName: "TestUser",
      birthDate: "1995-03-15",
      gender: "male",
      bio: "Hello",
      location: { city: "Jakarta", country: "Indonesia" },
      mediaUrls: [{ url: "test.jpg", type: "image", uploadedAt: "2024-01-01" }],
      interests: ["Hiking"],
      phoneNumber: "+1234567890",
      language: "en",
    });
    const ctx = createMockCtx({
      message: { text: "15.03.1995", message_id: 1, date: 1, chat: { id: 123, type: "private" } },
    } as any);

    const result = await handleConversationMessage(ctx, env);
    expect(result).toBe(true);
    expect(env.API_SERVICE.fetch).toHaveBeenCalledWith(
      expect.objectContaining({ method: "PUT" }),
    );
  });

  // --- Name conversation ---

  it("handles 'Use my Telegram name' button", async () => {
    await startConversation(kv as any, "123", "name");
    const env = createEnvWithUser(kv, {
      id: "123",
      displayName: "Test",
      birthDate: "1995-03-15",
      gender: "male",
      bio: "Hello",
      location: { city: "Jakarta", country: "Indonesia" },
      mediaUrls: [{ url: "test.jpg", type: "image", uploadedAt: "2024-01-01" }],
      interests: ["Hiking"],
      phoneNumber: "+1234567890",
      language: "en",
    });
    const ctx = createMockCtx({
      message: { text: "👤 Use my Telegram name", message_id: 1, date: 1, chat: { id: 123, type: "private" } },
    } as any);

    const result = await handleConversationMessage(ctx, env);
    expect(result).toBe(true);
    // Should call updateUser with the Telegram first_name
    expect(env.API_SERVICE.fetch).toHaveBeenCalledWith(
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("rejects invalid name (too short)", async () => {
    await startConversation(kv as any, "123", "name");
    const ctx = createMockCtx({
      message: { text: " " , message_id: 1, date: 1, chat: { id: 123, type: "private" } },
    } as any);
    const env = createEnvWithUser(kv, { id: "123", language: "en" });

    const result = await handleConversationMessage(ctx, env);
    expect(result).toBe(true);
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("1–50"),
    );
  });

  it("accepts valid name", async () => {
    await startConversation(kv as any, "123", "name");
    const env = createEnvWithUser(kv, {
      id: "123",
      displayName: "John",
      birthDate: "1995-03-15",
      gender: "male",
      bio: "Hello",
      location: { city: "Jakarta", country: "Indonesia" },
      mediaUrls: [{ url: "test.jpg", type: "image", uploadedAt: "2024-01-01" }],
      interests: ["Hiking"],
      phoneNumber: "+1234567890",
      language: "en",
    });
    const ctx = createMockCtx({
      message: { text: "John", message_id: 1, date: 1, chat: { id: 123, type: "private" } },
    } as any);

    const result = await handleConversationMessage(ctx, env);
    expect(result).toBe(true);
    expect(env.API_SERVICE.fetch).toHaveBeenCalledWith(
      expect.objectContaining({ method: "PUT" }),
    );
  });

  // --- Gender conversation ---

  it("rejects invalid gender", async () => {
    await startConversation(kv as any, "123", "gender");
    const ctx = createMockCtx({
      message: { text: "unknown", message_id: 1, date: 1, chat: { id: 123, type: "private" } },
    } as any);
    const env = createEnvWithUser(kv, { id: "123", language: "en" });

    const result = await handleConversationMessage(ctx, env);
    expect(result).toBe(true);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Male"));
  });

  it("accepts valid gender (Male)", async () => {
    await startConversation(kv as any, "123", "gender");
    const env = createEnvWithUser(kv, {
      id: "123",
      displayName: "TestUser",
      birthDate: "1995-03-15",
      gender: "male",
      bio: "Hello",
      location: { city: "Jakarta", country: "Indonesia" },
      mediaUrls: [{ url: "test.jpg", type: "image", uploadedAt: "2024-01-01" }],
      interests: ["Hiking"],
      phoneNumber: "+1234567890",
      language: "en",
    });
    const ctx = createMockCtx({
      message: { text: "Male", message_id: 1, date: 1, chat: { id: 123, type: "private" } },
    } as any);

    const result = await handleConversationMessage(ctx, env);
    expect(result).toBe(true);
    expect(env.API_SERVICE.fetch).toHaveBeenCalledWith(
      expect.objectContaining({ method: "PUT" }),
    );
  });

  // --- Interests conversation ---

  it("rejects empty interests", async () => {
    await startConversation(kv as any, "123", "interests");
    const ctx = createMockCtx({
      message: { text: "," , message_id: 1, date: 1, chat: { id: 123, type: "private" } },
    } as any);
    const env = createEnvWithUser(kv, { id: "123", language: "en" });

    const result = await handleConversationMessage(ctx, env);
    expect(result).toBe(true);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("enter at least"));
  });

  it("rejects too many interests (>10)", async () => {
    await startConversation(kv as any, "123", "interests");
    const ctx = createMockCtx({
      message: { text: "a,b,c,d,e,f,g,h,i,j,k", message_id: 1, date: 1, chat: { id: 123, type: "private" } },
    } as any);
    const env = createEnvWithUser(kv, { id: "123", language: "en" });

    const result = await handleConversationMessage(ctx, env);
    expect(result).toBe(true);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("enter at least"));
  });

  it("accepts valid interests", async () => {
    await startConversation(kv as any, "123", "interests");
    const env = createEnvWithUser(kv, {
      id: "123",
      displayName: "TestUser",
      birthDate: "1995-03-15",
      gender: "male",
      bio: "Hello",
      location: { city: "Jakarta", country: "Indonesia" },
      mediaUrls: [{ url: "test.jpg", type: "image", uploadedAt: "2024-01-01" }],
      interests: ["Hiking", "Coding"],
      phoneNumber: "+1234567890",
      language: "en",
    });
    const ctx = createMockCtx({
      message: { text: "hiking, coding", message_id: 1, date: 1, chat: { id: 123, type: "private" } },
    } as any);

    const result = await handleConversationMessage(ctx, env);
    expect(result).toBe(true);
    expect(env.API_SERVICE.fetch).toHaveBeenCalledWith(
      expect.objectContaining({ method: "PUT" }),
    );
  });

  // --- Interests Skip button ---

  it("handles interests Skip button", async () => {
    await startConversation(kv as any, "123", "interests");
    const env = createEnvWithUser(kv, {
      id: "123",
      displayName: "TestUser",
      birthDate: "1995-03-15",
      gender: "male",
      bio: "Hello",
      location: { city: "Jakarta", country: "Indonesia" },
      mediaUrls: [{ url: "test.jpg", type: "image", uploadedAt: "2024-01-01" }],
      interests: ["Hiking"],
      language: "en",
    });
    const ctx = createMockCtx({
      message: { text: "⏭️ Skip", message_id: 1, date: 1, chat: { id: 123, type: "private" } },
    } as any);

    const result = await handleConversationMessage(ctx, env);
    expect(result).toBe(true);
    // Should have marked interests as skipped in KV
    expect(kv._store.get("onboarding:interests-skipped:123")).toBe("1");
  });

  // --- Media Done button ---

  it("handles media Done button", async () => {
    await startConversation(kv as any, "123", "media");
    const env = createEnvWithUser(kv, {
      id: "123",
      displayName: "TestUser",
      birthDate: "1995-03-15",
      gender: "male",
      bio: "Hello",
      location: { city: "Jakarta", country: "Indonesia" },
      mediaUrls: [{ url: "test.jpg", type: "image", uploadedAt: "2024-01-01" }],
      interests: ["Hiking"],
      phoneNumber: "+1234567890",
      language: "en",
      isProfileComplete: false,
    });
    const ctx = createMockCtx({
      message: { text: "✅ Done", message_id: 1, date: 1, chat: { id: 123, type: "private" } },
    } as any);

    const result = await handleConversationMessage(ctx, env);
    expect(result).toBe(true);
  });

  // --- Location text conversation ---

  it("rejects location without comma (invalid format)", async () => {
    await startConversation(kv as any, "123", "location");
    const ctx = createMockCtx({
      message: { text: "Jakarta", message_id: 1, date: 1, chat: { id: 123, type: "private" } },
    } as any);
    const env = createEnvWithUser(kv, { id: "123", language: "en" });

    const result = await handleConversationMessage(ctx, env);
    expect(result).toBe(true);
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("city and country"),
    );
  });

  it("handles location text with geocoding success", async () => {
    // Mock global fetch for Nominatim geocoding
    const originalFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            lat: "-6.2",
            lon: "106.8",
            display_name: "Jakarta, Indonesia",
            address: { city: "Jakarta", country: "Indonesia" },
          },
        ]),
        { status: 200 },
      ),
    ) as any;

    try {
      await startConversation(kv as any, "123", "location");
      const env = createEnvWithUser(kv, {
        id: "123",
        displayName: "TestUser",
        birthDate: "1995-03-15",
        gender: "male",
        bio: "Hello",
        location: { city: "Jakarta", country: "Indonesia" },
        mediaUrls: [{ url: "test.jpg", type: "image", uploadedAt: "2024-01-01" }],
        interests: ["Hiking"],
        phoneNumber: "+1234567890",
        language: "en",
      });
      const ctx = createMockCtx({
        message: { text: "Jakarta, Indonesia", message_id: 1, date: 1, chat: { id: 123, type: "private" } },
      } as any);

      const result = await handleConversationMessage(ctx, env);
      expect(result).toBe(true);
      expect(env.API_SERVICE.fetch).toHaveBeenCalledWith(
        expect.objectContaining({ method: "PUT" }),
      );
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  });

  it("handles location text with geocoding failure (falls back gracefully)", async () => {
    // Mock global fetch to fail for geocoding
    const originalFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = vi.fn().mockRejectedValue(new Error("Network error")) as any;

    try {
      await startConversation(kv as any, "123", "location");
      const env = createEnvWithUser(kv, {
        id: "123",
        displayName: "TestUser",
        birthDate: "1995-03-15",
        gender: "male",
        bio: "Hello",
        location: { city: "Bogor", country: "Indonesia" },
        mediaUrls: [{ url: "test.jpg", type: "image", uploadedAt: "2024-01-01" }],
        interests: ["Hiking"],
        phoneNumber: "+1234567890",
        language: "en",
      });
      const ctx = createMockCtx({
        message: { text: "Bogor, Indonesia", message_id: 1, date: 1, chat: { id: 123, type: "private" } },
      } as any);

      const result = await handleConversationMessage(ctx, env);
      expect(result).toBe(true);
      // Should still attempt to update user with city/country (no lat/lon)
      expect(env.API_SERVICE.fetch).toHaveBeenCalledWith(
        expect.objectContaining({ method: "PUT" }),
      );
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  });

  // --- Age-range conversation ---

  it("handles age range format (e.g. 18-25)", async () => {
    await startConversation(kv as any, "123", "age-range");
    const env = createEnvWithUser(kv, { id: "123", language: "en" });
    const ctx = createMockCtx({
      message: { text: "18-25", message_id: 1, date: 1, chat: { id: 123, type: "private" } },
    } as any);

    const result = await handleConversationMessage(ctx, env);
    expect(result).toBe(true);
    expect(env.API_SERVICE.fetch).toHaveBeenCalledWith(
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("rejects invalid age range (min > max)", async () => {
    await startConversation(kv as any, "123", "age-range");
    const env = createEnvWithUser(kv, { id: "123", language: "en" });
    const ctx = createMockCtx({
      message: { text: "50-20", message_id: 1, date: 1, chat: { id: 123, type: "private" } },
    } as any);

    const result = await handleConversationMessage(ctx, env);
    expect(result).toBe(true);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Invalid"));
  });

  it("handles single min age and prompts for max", async () => {
    await startConversation(kv as any, "123", "age-range");
    const env = createEnvWithUser(kv, { id: "123", language: "en" });
    const ctx = createMockCtx({
      message: { text: "18", message_id: 1, date: 1, chat: { id: 123, type: "private" } },
    } as any);

    const result = await handleConversationMessage(ctx, env);
    expect(result).toBe(true);
    // Should advance to step 1 with min stored
    const state = await getConversationState(kv as any, "123");
    expect(state!.step).toBe(1);
    expect(state!.data).toEqual({ min: 18 });
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("maximum"),
      expect.anything(),
    );
  });

  it("handles second step (max) in age-range", async () => {
    await setConversationState(kv as any, {
      userId: "123",
      field: "age-range",
      step: 1,
      data: { min: 18 },
    });
    const env = createEnvWithUser(kv, { id: "123", language: "en" });
    const ctx = createMockCtx({
      message: { text: "25", message_id: 1, date: 1, chat: { id: 123, type: "private" } },
    } as any);

    const result = await handleConversationMessage(ctx, env);
    expect(result).toBe(true);
    expect(env.API_SERVICE.fetch).toHaveBeenCalledWith(
      expect.objectContaining({ method: "PUT" }),
    );
  });

  // --- Distance conversation ---

  it("rejects invalid distance (non-numeric)", async () => {
    await startConversation(kv as any, "123", "distance");
    const env = createEnvWithUser(kv, { id: "123", language: "en" });
    const ctx = createMockCtx({
      message: { text: "abc", message_id: 1, date: 1, chat: { id: 123, type: "private" } },
    } as any);

    const result = await handleConversationMessage(ctx, env);
    expect(result).toBe(true);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("valid"));
  });

  it("accepts valid distance", async () => {
    await startConversation(kv as any, "123", "distance");
    const env = createEnvWithUser(kv, { id: "123", language: "en" });
    const ctx = createMockCtx({
      message: { text: "25", message_id: 1, date: 1, chat: { id: 123, type: "private" } },
    } as any);

    const result = await handleConversationMessage(ctx, env);
    expect(result).toBe(true);
    expect(env.API_SERVICE.fetch).toHaveBeenCalledWith(
      expect.objectContaining({ method: "PUT" }),
    );
  });

  // --- Gender-pref conversation ---

  it("rejects invalid gender preference", async () => {
    await startConversation(kv as any, "123", "gender-pref");
    const env = createEnvWithUser(kv, { id: "123", language: "en" });
    const ctx = createMockCtx({
      message: { text: "alien", message_id: 1, date: 1, chat: { id: 123, type: "private" } },
    } as any);

    const result = await handleConversationMessage(ctx, env);
    expect(result).toBe(true);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("valid genders"));
  });

  it("accepts valid gender preference", async () => {
    await startConversation(kv as any, "123", "gender-pref");
    const env = createEnvWithUser(kv, { id: "123", language: "en" });
    const ctx = createMockCtx({
      message: { text: "female", message_id: 1, date: 1, chat: { id: 123, type: "private" } },
    } as any);

    const result = await handleConversationMessage(ctx, env);
    expect(result).toBe(true);
    expect(env.API_SERVICE.fetch).toHaveBeenCalledWith(
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("accepts multiple gender preferences", async () => {
    await startConversation(kv as any, "123", "gender-pref");
    const env = createEnvWithUser(kv, { id: "123", language: "en" });
    const ctx = createMockCtx({
      message: { text: "male, female", message_id: 1, date: 1, chat: { id: 123, type: "private" } },
    } as any);

    const result = await handleConversationMessage(ctx, env);
    expect(result).toBe(true);
    expect(env.API_SERVICE.fetch).toHaveBeenCalledWith(
      expect.objectContaining({ method: "PUT" }),
    );
  });

  // --- Edge case: default/unrecognized field ---

  it("returns false and clears state for unrecognized field", async () => {
    await setConversationState(kv as any, {
      userId: "123",
      field: "unknown-field",
      step: 0,
    });
    const env = createEnvWithUser(kv, { id: "123", language: "en" });
    const ctx = createMockCtx({
      message: { text: "anything", message_id: 1, date: 1, chat: { id: 123, type: "private" } },
    } as any);

    const result = await handleConversationMessage(ctx, env);
    expect(result).toBe(false);
    // State should be cleared
    const state = await getConversationState(kv as any, "123");
    expect(state).toBeNull();
  });
});

// ================================================================
// 5. handleContactMessage
// ================================================================

describe("handleContactMessage", () => {
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    kv = mockKV();
  });

  it("returns false when ctx.from is undefined", async () => {
    const env = createEnvWithUser(kv, { id: "123", language: "en" });
    const ctx = createMockCtx({ from: undefined } as any);

    const result = await handleContactMessage(ctx, env);
    expect(result).toBe(false);
  });

  it("returns false when no contact in message", async () => {
    const env = createEnvWithUser(kv, { id: "123", language: "en" });
    const ctx = createMockCtx({
      message: { text: "hello", message_id: 1, date: 1, chat: { id: 123, type: "private" } },
    } as any);

    const result = await handleContactMessage(ctx, env);
    expect(result).toBe(false);
  });

  it("rejects contact from another user", async () => {
    const env = createEnvWithUser(kv, { id: "123", language: "en" });
    const ctx = createMockCtx({
      message: {
        contact: { user_id: 999, phone_number: "+1234567890", first_name: "Other" },
        message_id: 1,
        date: 1,
        chat: { id: 123, type: "private" },
      },
    } as any);

    const result = await handleContactMessage(ctx, env);
    expect(result).toBe(true);
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("own contact"),
      expect.anything(),
    );
  });

  it("handles missing phone number in contact", async () => {
    const env = createEnvWithUser(kv, { id: "123", language: "en" });
    const ctx = createMockCtx({
      message: {
        contact: { user_id: 123, phone_number: "", first_name: "Test" },
        message_id: 1,
        date: 1,
        chat: { id: 123, type: "private" },
      },
    } as any);

    const result = await handleContactMessage(ctx, env);
    // phone_number is falsy (empty string), so it should fail
    expect(result).toBe(true);
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("Could not get"),
      expect.anything(),
    );
  });

  it("updates phone number successfully", async () => {
    const env = createEnvWithUser(kv, { id: "123", language: "en" });
    // Set up a conversation state to verify it gets cleared
    await startConversation(kv as any, "123", "phone");

    const ctx = createMockCtx({
      message: {
        contact: { user_id: 123, phone_number: "+1234567890", first_name: "Test" },
        message_id: 1,
        date: 1,
        chat: { id: 123, type: "private" },
      },
    } as any);

    const result = await handleContactMessage(ctx, env);
    expect(result).toBe(true);
    // Should have called updateUser with phoneNumber
    expect(env.API_SERVICE.fetch).toHaveBeenCalledWith(
      expect.objectContaining({ method: "PUT" }),
    );
    // Should reply with success
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("verified"),
      expect.anything(),
    );
    // Phone conversation should be cleared
    const state = await getConversationState(kv as any, "123");
    expect(state).toBeNull();
  });

  it("handles API error during phone update", async () => {
    const env = {
      DB: {} as D1Database,
      KV: kv as unknown as KVNamespace,
      API_SERVICE: {
        fetch: vi.fn().mockImplementation((req: Request) => {
          const url = String(req.url);
          if (url.includes("/users/") && req.method === "GET") {
            return Promise.resolve(
              new Response(JSON.stringify({ user: { id: "123", language: "en" } }), { status: 200 }),
            );
          }
          if (url.includes("/users/") && req.method === "PUT") {
            return Promise.resolve(new Response(null, { status: 500 }));
          }
          return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
        }),
      } as unknown as Fetcher,
      BOT_TOKEN: "test-token",
    };

    const ctx = createMockCtx({
      message: {
        contact: { user_id: 123, phone_number: "+1234567890", first_name: "Test" },
        message_id: 1,
        date: 1,
        chat: { id: 123, type: "private" },
      },
    } as any);

    const result = await handleContactMessage(ctx, env);
    expect(result).toBe(true);
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("something went wrong"),
      expect.anything(),
    );
  });
});

// ================================================================
// 6. handleLocationMessage
// ================================================================

describe("handleLocationMessage", () => {
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    kv = mockKV();
  });

  it("returns false when ctx.from is undefined", async () => {
    const env = createEnvWithUser(kv, { id: "123", language: "en" });
    const ctx = createMockCtx({ from: undefined } as any);

    const result = await handleLocationMessage(ctx, env);
    expect(result).toBe(false);
  });

  it("returns false when no location in message", async () => {
    const env = createEnvWithUser(kv, { id: "123", language: "en" });
    const ctx = createMockCtx({
      message: { text: "hello", message_id: 1, date: 1, chat: { id: 123, type: "private" } },
    } as any);

    const result = await handleLocationMessage(ctx, env);
    expect(result).toBe(false);
  });

  it("updates location without active conversation (spontaneous share)", async () => {
    const env = createEnvWithUser(kv, { id: "123", language: "en" });
    const ctx = createMockCtx({
      message: {
        location: { latitude: -6.2, longitude: 106.8 },
        message_id: 1,
        date: 1,
        chat: { id: 123, type: "private" },
      },
    } as any);

    const result = await handleLocationMessage(ctx, env);
    expect(result).toBe(true);
    expect(env.API_SERVICE.fetch).toHaveBeenCalledWith(
      expect.objectContaining({ method: "PUT" }),
    );
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("Location updated"),
    );
  });

  it("handles location in conversation with onboarding continuation", async () => {
    await startConversation(kv as any, "123", "location");
    const env = createEnvWithUser(kv, {
      id: "123",
      displayName: "TestUser",
      birthDate: "1995-03-15",
      gender: "male",
      bio: "Hello",
      location: { city: "Jakarta", country: "Indonesia" },
      mediaUrls: [{ url: "test.jpg", type: "image", uploadedAt: "2024-01-01" }],
      interests: ["Hiking"],
      phoneNumber: "+1234567890",
      language: "en",
    });
    const ctx = createMockCtx({
      message: {
        location: { latitude: -6.2, longitude: 106.8 },
        message_id: 1,
        date: 1,
        chat: { id: 123, type: "private" },
      },
    } as any);

    const result = await handleLocationMessage(ctx, env);
    expect(result).toBe(true);
    expect(env.API_SERVICE.fetch).toHaveBeenCalledWith(
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("handles reverse geocoding success", async () => {
    // Create env with geocoding support
    const env = createEnvWithUser(kv, { id: "123", language: "en" });
    const ctx = createMockCtx({
      message: {
        location: { latitude: -6.2, longitude: 106.8 },
        message_id: 1,
        date: 1,
        chat: { id: 123, type: "private" },
      },
    } as any);

    const result = await handleLocationMessage(ctx, env);
    expect(result).toBe(true);
    // Geocode endpoint should have been called
    const fetchCalls = (env.API_SERVICE.fetch as any).mock.calls;
    const geocodeCall = fetchCalls.find((call: any) =>
      String(call[0].url).includes("/geocode"),
    );
    expect(geocodeCall).toBeDefined();
  });

  it("handles reverse geocoding failure gracefully", async () => {
    const env = {
      DB: {} as D1Database,
      KV: kv as unknown as KVNamespace,
      API_SERVICE: {
        fetch: vi.fn().mockImplementation((req: Request) => {
          const url = String(req.url);
          if (url.includes("/geocode")) {
            return Promise.resolve(new Response(null, { status: 500 }));
          }
          if (url.includes("/users/") && req.method === "GET") {
            return Promise.resolve(
              new Response(JSON.stringify({ user: { id: "123", language: "en" } }), { status: 200 }),
            );
          }
          if (url.includes("/users/") && req.method === "PUT") {
            return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
          }
          return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
        }),
      } as unknown as Fetcher,
      BOT_TOKEN: "test-token",
    };

    const ctx = createMockCtx({
      message: {
        location: { latitude: -6.2, longitude: 106.8 },
        message_id: 1,
        date: 1,
        chat: { id: 123, type: "private" },
      },
    } as any);

    const result = await handleLocationMessage(ctx, env);
    expect(result).toBe(true);
    // Should still update user with raw lat/lon
    expect(env.API_SERVICE.fetch).toHaveBeenCalledWith(
      expect.objectContaining({ method: "PUT" }),
    );
  });
});

// ================================================================
// 7. checkAndUpdateProfileComplete
// ================================================================

describe("checkAndUpdateProfileComplete", () => {
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    kv = mockKV();
  });

  it("returns true when profile becomes complete (was not complete before)", async () => {
    const env = createEnvWithUser(kv, {
      id: "123",
      displayName: "TestUser",
      birthDate: "1995-03-15",
      gender: "male",
      bio: "Hello world",
      location: { city: "Jakarta", country: "Indonesia" },
      interests: ["Hiking"],
      mediaUrls: [{ url: "test.jpg", type: "image", uploadedAt: "2024-01-01" }],
      isProfileComplete: false,
    });

    const result = await checkAndUpdateProfileComplete(env, "123");
    expect(result).toBe(true);
    // Should have called PUT to set isProfileComplete = true
    const putCalls = (env.API_SERVICE.fetch as any).mock.calls.filter(
      (call: any) => call[0] instanceof Request && call[0].method === "PUT",
    );
    expect(putCalls.length).toBeGreaterThanOrEqual(1);
    const putBody = await putCalls[putCalls.length - 1][0].text();
    expect(putBody).toContain('"isProfileComplete":true');
  });

  it("returns false when profile is already marked complete", async () => {
    const env = createEnvWithUser(kv, {
      id: "123",
      displayName: "TestUser",
      birthDate: "1995-03-15",
      gender: "male",
      bio: "Hello world",
      location: { city: "Jakarta", country: "Indonesia" },
      interests: ["Hiking"],
      mediaUrls: [{ url: "test.jpg", type: "image", uploadedAt: "2024-01-01" }],
      isProfileComplete: true,
    });

    const result = await checkAndUpdateProfileComplete(env, "123");
    expect(result).toBe(false);
  });

  it("returns false when profile is incomplete", async () => {
    const env = createEnvWithUser(kv, {
      id: "123",
      displayName: "TestUser",
      // missing many fields
      isProfileComplete: false,
    });

    const result = await checkAndUpdateProfileComplete(env, "123");
    expect(result).toBe(false);
  });

  it("returns false when user is not found", async () => {
    const env = {
      DB: {} as D1Database,
      KV: kv as unknown as KVNamespace,
      API_SERVICE: {
        fetch: vi.fn().mockResolvedValue(
          new Response(null, { status: 404 }),
        ),
      } as unknown as Fetcher,
      BOT_TOKEN: "test-token",
    };

    const result = await checkAndUpdateProfileComplete(env, "123");
    expect(result).toBe(false);
  });

  it("returns false on API error", async () => {
    const env = {
      DB: {} as D1Database,
      KV: kv as unknown as KVNamespace,
      API_SERVICE: {
        fetch: vi.fn().mockRejectedValue(new Error("Network error")),
      } as unknown as Fetcher,
      BOT_TOKEN: "test-token",
    };

    const result = await checkAndUpdateProfileComplete(env, "123");
    expect(result).toBe(false);
  });

  it("returns false when profile is complete but missing fields exist (edge case)", async () => {
    // This shouldn't normally happen, but test resilience
    const env = createEnvWithUser(kv, {
      id: "123",
      displayName: "TestUser",
      birthDate: "1995-03-15",
      gender: "male",
      bio: "Hello world",
      location: { city: "Jakarta", country: "Indonesia" },
      interests: ["Hiking"],
      // intentionally missing mediaUrls
      isProfileComplete: false,
    });

    const result = await checkAndUpdateProfileComplete(env, "123");
    expect(result).toBe(false);
  });
});
