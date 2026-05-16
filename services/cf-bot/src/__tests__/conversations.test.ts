import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getConversationState,
  setConversationState,
  clearConversationState,
  startConversation,
  handleConversationMessage,
  continueOnboarding,
} from "../lib/conversations.js";
import type { MyContext } from "../types.js";
import type { Language } from "../lib/i18n.js";

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

function mockEnv(kv = mockKV()) {
  return {
    DB: {} as D1Database,
    KV: kv as unknown as KVNamespace,
    API_SERVICE: {
      fetch: vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    } as unknown as Fetcher,
    BOT_TOKEN: "test-token",
  };
}

function mockCtx(text?: string): MyContext {
  return {
    reply: vi.fn().mockResolvedValue(undefined),
    from: { id: 123, first_name: "Test", is_bot: false, language_code: "en" },
    message: text
      ? { text, message_id: 1, date: 1, chat: { id: 123, type: "private" } }
      : undefined,
  } as unknown as MyContext;
}

describe("Conversation State Management", () => {
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    kv = mockKV();
  });

  it("should set and get conversation state", async () => {
    await setConversationState(kv as unknown as KVNamespace, {
      userId: "123",
      field: "bio",
      step: 0,
    });
    const state = await getConversationState(
      kv as unknown as KVNamespace,
      "123",
    );
    expect(state).not.toBeNull();
    expect(state!.field).toBe("bio");
  });

  it("should return null for missing state", async () => {
    const state = await getConversationState(
      kv as unknown as KVNamespace,
      "999",
    );
    expect(state).toBeNull();
  });

  it("should clear conversation state", async () => {
    await startConversation(kv as unknown as KVNamespace, "123", "bio");
    await clearConversationState(kv as unknown as KVNamespace, "123");
    const state = await getConversationState(
      kv as unknown as KVNamespace,
      "123",
    );
    expect(state).toBeNull();
  });

  it("should start conversation with field", async () => {
    await startConversation(kv as unknown as KVNamespace, "123", "birthdate");
    const state = await getConversationState(
      kv as unknown as KVNamespace,
      "123",
    );
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
    const state = await getConversationState(
      kv as unknown as KVNamespace,
      "123",
    );
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
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("Invalid date"),
    );
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

// ─────────────────────────────────────────────────────────────
// Regression tests: continueOnboarding explicit step sequence
// ─────────────────────────────────────────────────────────────

describe("continueOnboarding — explicit step sequence regression", () => {
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    kv = mockKV();
    vi.resetModules();
  });

  function createEnvWithUser(user: Record<string, unknown>) {
    return {
      DB: {} as D1Database,
      KV: kv as unknown as KVNamespace,
      API_SERVICE: {
        fetch: vi.fn().mockImplementation((req: Request) => {
          const url = String(req.url);
          if (url.includes("/users/123")) {
            return Promise.resolve(
              new Response(JSON.stringify({ user }), { status: 200 }),
            );
          }
          return Promise.resolve(
            new Response(JSON.stringify({}), { status: 404 }),
          );
        }),
      } as unknown as Fetcher,
      BOT_TOKEN: "test-token",
    };
  }

  function mockCtxLang(lang: Language): MyContext {
    return {
      reply: vi.fn().mockResolvedValue(undefined),
      from: {
        id: 123,
        first_name: "TestUser",
        is_bot: false,
        language_code: lang,
      },
      message: undefined,
    } as unknown as MyContext;
  }

  // ── Step 1: Name shows once ──
  it.each<Language>(["en", "id"])(
    "[%s] starts with name even when displayName is pre-filled",
    async (lang) => {
      const env = createEnvWithUser({
        id: "123",
        displayName: "TestUser",
        language: lang,
      });
      const ctx = mockCtxLang(lang);
      const result = await continueOnboarding(ctx, env, "123", lang);

      expect(result).toBe(true);
      const state = await getConversationState(
        kv as unknown as KVNamespace,
        "123",
      );
      expect(state!.field).toBe("name");

      // Should have "Use my Telegram name" button
      const replyCall = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
      const keyboard = replyCall[1]?.reply_markup?.keyboard;
      expect(keyboard).toBeDefined();
      const buttonTexts = keyboard.flatMap((row: Array<{ text: string }>) =>
        row.map((b) => b.text),
      );
      expect(buttonTexts.length).toBeGreaterThanOrEqual(1);
    },
  );

  // ── Step 1b: Name skips if already seen ──
  it.each<Language>(["en", "id"])(
    "[%s] skips name when already seen in this session",
    async (lang) => {
      await kv.put(`onboarding:seen:123`, JSON.stringify(["name"]));
      const env = createEnvWithUser({
        id: "123",
        displayName: "TestUser",
        language: lang,
      });
      const ctx = mockCtxLang(lang);
      const result = await continueOnboarding(ctx, env, "123", lang);

      expect(result).toBe(true);
      const state = await getConversationState(
        kv as unknown as KVNamespace,
        "123",
      );
      expect(state!.field).toBe("birthdate");
    },
  );

  // ── Step 2: Birthdate skips if present ──
  it.each<Language>(["en", "id"])(
    "[%s] skips birthdate when already present",
    async (lang) => {
      await kv.put(`onboarding:seen:123`, JSON.stringify(["name"]));
      const env = createEnvWithUser({
        id: "123",
        displayName: "TestUser",
        birthDate: "1995-03-15",
        language: lang,
      });
      const ctx = mockCtxLang(lang);
      const result = await continueOnboarding(ctx, env, "123", lang);

      expect(result).toBe(true);
      const state = await getConversationState(
        kv as unknown as KVNamespace,
        "123",
      );
      expect(state!.field).toBe("gender");
    },
  );

  // ── Step 3: Gender skips if present ──
  it.each<Language>(["en", "id"])(
    "[%s] skips gender when already present",
    async (lang) => {
      await kv.put(`onboarding:seen:123`, JSON.stringify(["name"]));
      const env = createEnvWithUser({
        id: "123",
        displayName: "TestUser",
        birthDate: "1995-03-15",
        gender: "male",
        language: lang,
      });
      const ctx = mockCtxLang(lang);
      const result = await continueOnboarding(ctx, env, "123", lang);

      expect(result).toBe(true);
      const state = await getConversationState(
        kv as unknown as KVNamespace,
        "123",
      );
      expect(state!.field).toBe("bio");
    },
  );

  // ── Step 4: Bio skips if present ──
  it.each<Language>(["en", "id"])(
    "[%s] skips bio when already present",
    async (lang) => {
      await kv.put(`onboarding:seen:123`, JSON.stringify(["name"]));
      const env = createEnvWithUser({
        id: "123",
        displayName: "TestUser",
        birthDate: "1995-03-15",
        gender: "male",
        bio: "Hello world",
        language: lang,
      });
      const ctx = mockCtxLang(lang);
      const result = await continueOnboarding(ctx, env, "123", lang);

      expect(result).toBe(true);
      const state = await getConversationState(
        kv as unknown as KVNamespace,
        "123",
      );
      expect(state!.field).toBe("location");
    },
  );

  // ── Step 5: Location skips if present ──
  it.each<Language>(["en", "id"])(
    "[%s] skips location when already present",
    async (lang) => {
      await kv.put(`onboarding:seen:123`, JSON.stringify(["name"]));
      const env = createEnvWithUser({
        id: "123",
        displayName: "TestUser",
        birthDate: "1995-03-15",
        gender: "male",
        bio: "Hello world",
        location: { city: "Jakarta", country: "Indonesia" },
        language: lang,
      });
      const ctx = mockCtxLang(lang);
      const result = await continueOnboarding(ctx, env, "123", lang);

      expect(result).toBe(true);
      const state = await getConversationState(
        kv as unknown as KVNamespace,
        "123",
      );
      expect(state!.field).toBe("media");
    },
  );

  // ── Step 6: Media skips if present ──
  it.each<Language>(["en", "id"])(
    "[%s] skips media when already present",
    async (lang) => {
      await kv.put(`onboarding:seen:123`, JSON.stringify(["name"]));
      const env = createEnvWithUser({
        id: "123",
        displayName: "TestUser",
        birthDate: "1995-03-15",
        gender: "male",
        bio: "Hello world",
        location: { city: "Jakarta", country: "Indonesia" },
        mediaUrls: [
          { url: "test.jpg", type: "image", uploadedAt: "2024-01-01" },
        ],
        language: lang,
      });
      const ctx = mockCtxLang(lang);
      const result = await continueOnboarding(ctx, env, "123", lang);

      expect(result).toBe(true);
      const state = await getConversationState(
        kv as unknown as KVNamespace,
        "123",
      );
      // Should skip to interests (interests showOnce but not yet seen)
      expect(state!.field).toBe("interests");
    },
  );

  // ── Step 7: Interests shows once ──
  it.each<Language>(["en", "id"])(
    "[%s] shows interests even when already filled (showOnce, not yet seen)",
    async (lang) => {
      await kv.put(`onboarding:seen:123`, JSON.stringify(["name"]));
      const env = createEnvWithUser({
        id: "123",
        displayName: "TestUser",
        birthDate: "1995-03-15",
        gender: "male",
        bio: "Hello world",
        location: { city: "Jakarta", country: "Indonesia" },
        mediaUrls: [
          { url: "test.jpg", type: "image", uploadedAt: "2024-01-01" },
        ],
        interests: ["Hiking", "Coding"],
        language: lang,
      });
      const ctx = mockCtxLang(lang);
      const result = await continueOnboarding(ctx, env, "123", lang);

      expect(result).toBe(true);
      const state = await getConversationState(
        kv as unknown as KVNamespace,
        "123",
      );
      expect(state!.field).toBe("interests");

      // Should have Skip button
      const replyCall = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
      const keyboard = replyCall[1]?.reply_markup?.keyboard;
      const buttonTexts = keyboard.flatMap((row: Array<{ text: string }>) =>
        row.map((b) => b.text),
      );
      expect(buttonTexts.length).toBeGreaterThanOrEqual(1);
    },
  );

  // ── Step 7b: Interests skips if already seen ──
  it.each<Language>(["en", "id"])(
    "[%s] skips interests when already seen",
    async (lang) => {
      await kv.put(
        `onboarding:seen:123`,
        JSON.stringify(["name", "interests"]),
      );
      await kv.put(`onboarding:interests-skipped:123`, "true");
      const env = createEnvWithUser({
        id: "123",
        displayName: "TestUser",
        birthDate: "1995-03-15",
        gender: "male",
        bio: "Hello world",
        location: { city: "Jakarta", country: "Indonesia" },
        mediaUrls: [
          { url: "test.jpg", type: "image", uploadedAt: "2024-01-01" },
        ],
        interests: ["Hiking", "Coding"],
        language: lang,
      });
      const ctx = mockCtxLang(lang);
      const result = await continueOnboarding(ctx, env, "123", lang);

      expect(result).toBe(true);
      const state = await getConversationState(
        kv as unknown as KVNamespace,
        "123",
      );
      expect(state!.field).toBe("phone");
    },
  );

  // ── Step 8: Phone appears if not verified ──
  it.each<Language>(["en", "id"])(
    "[%s] shows phone verification after interests when phone missing",
    async (lang) => {
      await kv.put(
        `onboarding:seen:123`,
        JSON.stringify(["name", "interests"]),
      );
      await kv.put(`onboarding:interests-skipped:123`, "true");
      const env = createEnvWithUser({
        id: "123",
        displayName: "TestUser",
        birthDate: "1995-03-15",
        gender: "male",
        bio: "Hello world",
        location: { city: "Jakarta", country: "Indonesia" },
        mediaUrls: [
          { url: "test.jpg", type: "image", uploadedAt: "2024-01-01" },
        ],
        interests: ["Hiking"],
        language: lang,
      });
      const ctx = mockCtxLang(lang);

      const result = await continueOnboarding(ctx, env, "123", lang);

      expect(result).toBe(true);
      const state = await getConversationState(
        kv as unknown as KVNamespace,
        "123",
      );
      expect(state!.field).toBe("phone");

      // Should have contact-sharing button
      const replyCall = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
      const keyboard = replyCall[1]?.reply_markup?.keyboard;
      expect(keyboard).toBeDefined();
      expect(keyboard[0][0].request_contact).toBe(true);
    },
  );

  // ── Complete: all done ──
  it.each<Language>(["en", "id"])(
    "[%s] returns false when all steps complete including phone",
    async (lang) => {
      await kv.put(
        `onboarding:seen:123`,
        JSON.stringify(["name", "interests"]),
      );
      const env = createEnvWithUser({
        id: "123",
        displayName: "TestUser",
        birthDate: "1995-03-15",
        gender: "male",
        bio: "Hello world",
        location: { city: "Jakarta", country: "Indonesia" },
        mediaUrls: [
          { url: "test.jpg", type: "image", uploadedAt: "2024-01-01" },
        ],
        interests: ["Hiking"],
        phoneNumber: "+1234567890",
        language: lang,
      });
      const ctx = mockCtxLang(lang);
      const result = await continueOnboarding(ctx, env, "123", lang);

      expect(result).toBe(false);
      expect(ctx.reply).not.toHaveBeenCalled();
      // Should clean up onboarding progress
      const seenRaw = await kv.get(`onboarding:seen:123`);
      expect(seenRaw).toBeNull();
    },
  );

  // ── Full flow simulation: empty profile ──
  it.each<Language>(["en", "id"])(
    "[%s] full flow: empty profile → name → birthdate → gender → bio → location → media → interests → phone",
    async (lang) => {
      const profile: Record<string, unknown> = {
        id: "123",
        displayName: "TestUser",
        language: lang,
      };
      const env = createEnvWithUser(profile);
      const ctx = mockCtxLang(lang);

      // 1. Should start with name
      let result = await continueOnboarding(ctx, env, "123", lang);
      expect(result).toBe(true);
      let state = await getConversationState(
        kv as unknown as KVNamespace,
        "123",
      );
      expect(state!.field).toBe("name");

      // 2. After name is shown, next call goes to birthdate
      result = await continueOnboarding(ctx, env, "123", lang);
      expect(result).toBe(true);
      state = await getConversationState(kv as unknown as KVNamespace, "123");
      expect(state!.field).toBe("birthdate");

      // 3. After birthdate is filled, next call goes to gender
      profile.birthDate = "1995-03-15";
      result = await continueOnboarding(ctx, env, "123", lang);
      expect(result).toBe(true);
      state = await getConversationState(kv as unknown as KVNamespace, "123");
      expect(state!.field).toBe("gender");

      // 4. After gender is filled, next call goes to bio
      profile.gender = "male";
      result = await continueOnboarding(ctx, env, "123", lang);
      expect(result).toBe(true);
      state = await getConversationState(kv as unknown as KVNamespace, "123");
      expect(state!.field).toBe("bio");

      // 5. After bio is filled, next call goes to location
      profile.bio = "Hello world";
      result = await continueOnboarding(ctx, env, "123", lang);
      expect(result).toBe(true);
      state = await getConversationState(kv as unknown as KVNamespace, "123");
      expect(state!.field).toBe("location");

      // 6. After location is filled, next call goes to media
      profile.location = { city: "Jakarta", country: "Indonesia" };
      result = await continueOnboarding(ctx, env, "123", lang);
      expect(result).toBe(true);
      state = await getConversationState(kv as unknown as KVNamespace, "123");
      expect(state!.field).toBe("media");

      // 7. After media is filled, next call goes to interests (showOnce)
      profile.mediaUrls = [
        { url: "test.jpg", type: "image", uploadedAt: "2024-01-01" },
      ];
      result = await continueOnboarding(ctx, env, "123", lang);
      expect(result).toBe(true);
      state = await getConversationState(kv as unknown as KVNamespace, "123");
      expect(state!.field).toBe("interests");

      // 8. After interests is shown, next call goes to phone
      await kv.put(`onboarding:interests-skipped:123`, "true");
      result = await continueOnboarding(ctx, env, "123", lang);
      expect(result).toBe(true);
      state = await getConversationState(kv as unknown as KVNamespace, "123");
      expect(state!.field).toBe("phone");

      // 9. After phone is filled, onboarding is complete
      profile.phoneNumber = "+1234567890";
      result = await continueOnboarding(ctx, env, "123", lang);
      expect(result).toBe(false);
      // Progress should be cleaned up
      const seenRaw = await kv.get(`onboarding:seen:123`);
      expect(seenRaw).toBeNull();
    },
  );
});
