import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  settingsCommand,
  settingsCallbacks,
  handleAgeRangeCallback,
  handleDistanceCallback,
  handleGenderPrefCallback,
  handleSettingsLanguageCallback,
} from "../settings.js";
import type { MyContext } from "../../types.js";

// ---------------------------------------------------------------------------
// Mock helpers (following same patterns as match.test.ts and start.test.ts)
// ---------------------------------------------------------------------------

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

function mockCtx(overrides: Record<string, unknown> = {}): MyContext {
  return {
    reply: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    editMessageText: vi.fn().mockResolvedValue(undefined),
    from: { id: 123, first_name: "Test", is_bot: false, language_code: "en" },
    callbackQuery: {
      id: "cb1",
      from: { id: 123, is_bot: false, first_name: "Test" },
      data: "",
      message: { message_id: 1, chat: { id: 123, type: "private" }, date: 1 },
    },
    chat: { id: 123, type: "private" },
    ...overrides,
  } as unknown as MyContext;
}

/**
 * Creates a mock API service that routes requests based on URL patterns.
 *
 * Patterns can be:
 *   "/users/123"         – matches any method where URL includes this
 *   "PUT:/users/123"     – matches only PUT requests where URL includes "/users/123"
 */
function createMockApiService(responseMap: Record<string, () => Response>) {
  return {
    fetch: vi.fn().mockImplementation((req: Request) => {
      const url =
        typeof req === "string" ? req : (req as any).url || String(req);
      const method = (req as any).method || "GET";
      // Sort by pattern length descending so more specific patterns match first
      const sortedPatterns = Object.entries(responseMap).sort(
        (a, b) => b[0].length - a[0].length,
      );
      for (const [pattern, factory] of sortedPatterns) {
        if (pattern.includes(":")) {
          // Method-specific pattern: e.g. "PUT:/users/123"
          const colonIdx = pattern.indexOf(":");
          const patternMethod = pattern.slice(0, colonIdx);
          const patternUrl = pattern.slice(colonIdx + 1);
          if (method === patternMethod && url.includes(patternUrl)) {
            return Promise.resolve(factory());
          }
        } else if (url.includes(pattern)) {
          return Promise.resolve(factory());
        }
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 404 }));
    }),
  };
}

/**
 * Helper: build a standard user profile response for API_SERVICE.fetch.
 */
function makeUserResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({
      user: {
        id: "123",
        displayName: "Test",
        birthDate: "1999-03-15",
        age: 25,
        gender: "female",
        language: "en",
        bio: "Hello",
        location: {
          city: "NYC",
          country: "USA",
          latitude: 40.7,
          longitude: -74,
        },
        interests: ["music"],
        mediaUrls: [{ url: "https://example.com/photo.jpg", type: "image" }],
        phoneNumber: "+1234567890",
        isProfileComplete: true,
        preferences: {
          minAge: 18,
          maxAge: 35,
          maxDistance: 25,
          genderPreference: ["male"],
        },
        ...overrides,
      },
    }),
    { status: 200 },
  );
}

function makePutOkResponse(): Response {
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

function makeErrorResponse(status = 500): Response {
  return new Response(JSON.stringify({ error: "Internal Server Error" }), {
    status,
  });
}

/**
 * Helper to extract PUT request body from mock API fetch calls.
 * The mock receives a Request object; we await .text() to get the body.
 */
async function getPutRequestBody(
  fetchMock: ReturnType<typeof vi.fn>,
): Promise<Record<string, unknown> | null> {
  const calls = (fetchMock as any).mock.calls as any[];
  for (const call of calls) {
    const req = call[0] as Request;
    if ((req as any).method === "PUT") {
      const text = await req.text();
      return JSON.parse(text);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Settings Handlers", () => {
  let kv: ReturnType<typeof mockKV>;
  let ctx: MyContext;
  let env: any;

  function makeEnvForCommand(apiExtra: Record<string, () => Response> = {}) {
    return {
      KV: kv as unknown as KVNamespace,
      API_SERVICE: createMockApiService({
        "/users/123": () => makeUserResponse(),
        ...apiExtra,
      }),
    };
  }

  beforeEach(() => {
    kv = mockKV();
    ctx = mockCtx();
    env = makeEnvForCommand();
  });

  // =========================================================================
  // settingsCommand
  // =========================================================================
  describe("settingsCommand", () => {
    it("returns early when ctx.from is missing", async () => {
      (ctx as any).from = undefined;
      await settingsCommand(ctx, env);
      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it("shows error when ensureUserExists fails", async () => {
      env = {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: createMockApiService({
          "/users/123": () => makeErrorResponse(500),
          "POST:/users": () => makeErrorResponse(500),
        }),
      };

      await settingsCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        "❌ Sorry, there was an error. Please try /start first.",
      );
    });

    it("displays current preferences with age range and distance", async () => {
      env = makeEnvForCommand();

      await settingsCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Settings"),
        expect.objectContaining({ parse_mode: "Markdown" }),
      );
      const callArg = (ctx.reply as any).mock.calls[0][0];
      expect(callArg).toContain("18–35");
      expect(callArg).toContain("25 km");
      expect(callArg).toContain("Male");
    });

    it("handles partially set preferences", async () => {
      // Full user with birthDate=1999-03-15 and age=25, gender=female
      // getDefaultPreferences now trusts age column first: minAge=18, maxAge=32, maxDistance=25, genderPref=["male"]
      // We set prefs to { maxDistance: 10 }, so result merges defaults + rawPrefs
      env = {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: createMockApiService({
          "/users/123": () =>
            makeUserResponse({
              preferences: { maxDistance: 10 },
            }),
        }),
      };

      await settingsCommand(ctx, env);
      const callArg = (ctx.reply as any).mock.calls[0][0];
      // Defaults: age=25 → minAge=18, maxAge=32, gender=female → ["male"]
      expect(callArg).toContain("18");
      expect(callArg).toContain("32");
      expect(callArg).toContain("10 km");
      expect(callArg).toContain("Male");
    });

    it("handles missing preferences gracefully (shows 'Not set')", async () => {
      env = {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: createMockApiService({
          "/users/123": () =>
            makeUserResponse({
              preferences: undefined,
              birthDate: undefined,
              age: undefined,
              gender: undefined,
            }),
        }),
      };

      await settingsCommand(ctx, env);
      const callArg = (ctx.reply as any).mock.calls[0][0];
      expect(callArg).toContain("Not set");
    });

    it("handles API error in fetchUserPreferences gracefully", async () => {
      // When fetch rejects, ensureUserExists also fails (returns null),
      // so the handler shows the "try /start" message
      env = {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: {
          fetch: vi.fn().mockRejectedValue(new Error("Network failure")),
        },
      };

      await settingsCommand(ctx, env);
      // ensureUserExists returns null => shows "try /start" message
      expect(ctx.reply).toHaveBeenCalledWith(
        "❌ Sorry, there was an error. Please try /start first.",
      );
    });

    it("handles catch-block error from reply failure", async () => {
      env = makeEnvForCommand();
      // Make reply throw so the catch block is exercised
      (ctx.reply as any).mockRejectedValueOnce(new Error("send failed"));

      await settingsCommand(ctx, env);
      // catch block calls ctx.reply again with genericError
      expect(ctx.reply).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // settingsCallbacks
  // =========================================================================
  describe("settingsCallbacks", () => {
    function makeEnvForCallback(userOverrides: Record<string, unknown> = {}) {
      return {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: createMockApiService({
          "/users/123": () => makeUserResponse(userOverrides),
        }),
      };
    }

    beforeEach(() => {
      env = makeEnvForCallback();
    });

    it("returns early when ctx.from is missing", async () => {
      (ctx as any).from = undefined;
      ctx.callbackQuery!.data = "settings:age-range";
      await settingsCallbacks(ctx, env);
      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it("returns early when ctx.callbackQuery.data is null", async () => {
      (ctx as any).callbackQuery = { id: "cb1", data: null };
      await settingsCallbacks(ctx, env);
      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it("returns early when callbackQuery is undefined", async () => {
      (ctx as any).callbackQuery = undefined;
      await settingsCallbacks(ctx, env);
      expect(ctx.reply).not.toHaveBeenCalled();
    });

    describe("settings:age-range", () => {
      it("starts conversation and shows age grid", async () => {
        ctx.callbackQuery!.data = "settings:age-range";
        await settingsCallbacks(ctx, env);

        expect(ctx.reply).toHaveBeenCalledWith(
          expect.stringContaining("Select *minimum* age"),
          expect.objectContaining({ reply_markup: expect.anything() }),
        );

        const stateRaw = await kv.get("conversation:123");
        const state = JSON.parse(stateRaw!);
        expect(state.field).toBe("age-range");
      });

      it("fetches user for language (Indonesian)", async () => {
        env = makeEnvForCallback({ language: "id" });
        ctx.callbackQuery!.data = "settings:age-range";
        await settingsCallbacks(ctx, env);

        expect(ctx.reply).toHaveBeenCalledWith(
          expect.stringContaining("Pilih usia *minimum*"),
          expect.any(Object),
        );
      });

      it("falls back to default age 25 when user has no age data", async () => {
        env = makeEnvForCallback({
          birthDate: undefined,
          age: undefined,
        });
        ctx.callbackQuery!.data = "settings:age-range";
        await settingsCallbacks(ctx, env);

        expect(ctx.reply).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ reply_markup: expect.anything() }),
        );
      });

      it("handles API error gracefully during user fetch", async () => {
        env = {
          KV: kv as unknown as KVNamespace,
          API_SERVICE: createMockApiService({
            "/users/123": () => makeErrorResponse(500),
          }),
        };
        ctx.callbackQuery!.data = "settings:age-range";
        await settingsCallbacks(ctx, env);

        expect(ctx.reply).toHaveBeenCalledWith(
          expect.stringContaining("Select"),
          expect.objectContaining({ reply_markup: expect.anything() }),
        );
      });
    });

    describe("settings:distance", () => {
      it("shows distance keyboard", async () => {
        ctx.callbackQuery!.data = "settings:distance";
        await settingsCallbacks(ctx, env);

        expect(ctx.reply).toHaveBeenCalledWith(
          expect.stringContaining("Select max distance"),
          expect.objectContaining({ reply_markup: expect.anything() }),
        );
        expect(ctx.answerCallbackQuery).toHaveBeenCalled();
      });

      it("does not start a conversation", async () => {
        ctx.callbackQuery!.data = "settings:distance";
        await settingsCallbacks(ctx, env);

        const state = await kv.get("conversation:123");
        expect(state).toBeNull();
      });
    });

    describe("settings:gender-pref", () => {
      it("shows gender preference keyboard", async () => {
        ctx.callbackQuery!.data = "settings:gender-pref";
        await settingsCallbacks(ctx, env);

        expect(ctx.reply).toHaveBeenCalledWith(
          expect.stringContaining("Select gender preference"),
          expect.objectContaining({ reply_markup: expect.anything() }),
        );
        expect(ctx.answerCallbackQuery).toHaveBeenCalled();
      });
    });

    describe("settings:close", () => {
      it("deletes message and shows main menu", async () => {
        ctx.callbackQuery!.data = "settings:close";
        await settingsCallbacks(ctx, env);

        expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
          "Settings closed.",
        );
        expect(ctx.deleteMessage).toHaveBeenCalled();
        expect(ctx.reply).toHaveBeenCalledWith(
          "👇 Use the menu below to navigate:",
          expect.objectContaining({ reply_markup: expect.anything() }),
        );
      });

      it("handles deleteMessage failure gracefully", async () => {
        (ctx.deleteMessage as any).mockRejectedValue(
          new Error("delete failed"),
        );
        ctx.callbackQuery!.data = "settings:close";
        await settingsCallbacks(ctx, env);

        expect(ctx.reply).toHaveBeenCalledWith(
          "👇 Use the menu below to navigate:",
          expect.any(Object),
        );
      });
    });

    describe("unknown callback data", () => {
      it("answers with unknown setting message", async () => {
        ctx.callbackQuery!.data = "settings:bogus";
        await settingsCallbacks(ctx, env);

        expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
          "Unknown setting.",
        );
      });
    });

    it("handles unhandled error in catch block", async () => {
      env = {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: {
          fetch: vi.fn().mockRejectedValue(new Error("Network failure")),
        },
      };
      ctx.callbackQuery!.data = "settings:age-range";
      await settingsCallbacks(ctx, env);

      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Trace ID:"),
        expect.anything(),
      );
    });
  });

  // =========================================================================
  // handleAgeRangeCallback
  // =========================================================================
  describe("handleAgeRangeCallback", () => {
    function makeEnvForAge(
      userOverrides: Record<string, unknown> = {},
      putResponseOverride?: Response,
    ) {
      const responses: Record<string, () => Response> = {
        "/users/123": () => makeUserResponse(userOverrides),
      };
      if (putResponseOverride) {
        responses["PUT:/users/123"] = () => putResponseOverride;
      }
      return {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: createMockApiService(responses),
      };
    }

    beforeEach(() => {
      kv = mockKV();
      ctx = mockCtx({ editMessageText: vi.fn().mockResolvedValue(undefined) });
      env = makeEnvForAge();
    });

    it("returns false when ctx.from is missing", async () => {
      (ctx as any).from = undefined;
      const result = await handleAgeRangeCallback(ctx, env, "agerange:min:25");
      expect(result).toBe(false);
    });

    describe("agerange:manual:min", () => {
      it("starts conversation and asks for manual entry", async () => {
        const result = await handleAgeRangeCallback(
          ctx,
          env,
          "agerange:manual:min",
        );
        expect(result).toBe(true);
        expect(ctx.reply).toHaveBeenCalledWith(
          expect.stringContaining("Enter minimum age"),
          expect.any(Object),
        );
        const stateRaw = await kv.get("conversation:123");
        const state = JSON.parse(stateRaw!);
        expect(state.field).toBe("age-range");
        expect(state.step).toBe(0);
      });
    });

    describe("agerange:manual:max", () => {
      it("sets state with existing min and asks for max entry", async () => {
        await kv.put(
          "conversation:123",
          JSON.stringify({
            userId: "123",
            field: "age-range",
            step: 1,
            data: { min: 20 },
          }),
        );

        const result = await handleAgeRangeCallback(
          ctx,
          env,
          "agerange:manual:max",
        );
        expect(result).toBe(true);
        expect(ctx.reply).toHaveBeenCalledWith(
          expect.stringContaining("Enter maximum age"),
          expect.any(Object),
        );
        const stateRaw = await kv.get("conversation:123");
        const state = JSON.parse(stateRaw!);
        expect(state.data.min).toBe(20);
      });

      it("defaults min to 12 when no conversation state exists", async () => {
        const result = await handleAgeRangeCallback(
          ctx,
          env,
          "agerange:manual:max",
        );
        expect(result).toBe(true);
        const stateRaw = await kv.get("conversation:123");
        const state = JSON.parse(stateRaw!);
        expect(state.data.min).toBe(12);
      });
    });

    describe("agerange:min:X", () => {
      it("sets conversation state and shows max grid", async () => {
        const result = await handleAgeRangeCallback(
          ctx,
          env,
          "agerange:min:22",
        );
        expect(result).toBe(true);

        const stateRaw = await kv.get("conversation:123");
        const state = JSON.parse(stateRaw!);
        expect(state.data.min).toBe(22);
        expect(state.step).toBe(1);

        expect(ctx.editMessageText).toHaveBeenCalledWith(
          expect.stringContaining("Select *maximum* age"),
          expect.objectContaining({
            parse_mode: "Markdown",
            reply_markup: expect.anything(),
          }),
        );
        expect(ctx.answerCallbackQuery).toHaveBeenCalled();
      });

      it("edits message with correct i18n key and min parameter", async () => {
        const result = await handleAgeRangeCallback(
          ctx,
          env,
          "agerange:min:18",
        );
        expect(result).toBe(true);
        expect(ctx.editMessageText).toHaveBeenCalledWith(
          expect.stringContaining("must be ≥ 18"),
          expect.any(Object),
        );
      });
    });

    describe("agerange:min:X with NaN", () => {
      it("returns true with invalid selection message for non-numeric", async () => {
        const result = await handleAgeRangeCallback(
          ctx,
          env,
          "agerange:min:abc",
        );
        expect(result).toBe(true);
        expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
          "Invalid selection.",
        );
      });
    });

    describe("agerange:max:X", () => {
      it("validates max >= min and updates preferences on success", async () => {
        await kv.put(
          "conversation:123",
          JSON.stringify({
            userId: "123",
            field: "age-range",
            step: 1,
            data: { min: 20 },
          }),
        );
        env = makeEnvForAge({}, makePutOkResponse());

        const result = await handleAgeRangeCallback(
          ctx,
          env,
          "agerange:max:30",
        );
        expect(result).toBe(true);

        expect(ctx.editMessageText).toHaveBeenCalledWith(
          expect.stringContaining("20–30"),
          expect.any(Object),
        );
        expect(ctx.reply).toHaveBeenCalledWith(
          "👇 Use the menu below to navigate:",
          expect.any(Object),
        );
        const stateAfter = await kv.get("conversation:123");
        expect(stateAfter).toBeNull();
      });

      it("shows error when max < min", async () => {
        await kv.put(
          "conversation:123",
          JSON.stringify({
            userId: "123",
            field: "age-range",
            step: 1,
            data: { min: 35 },
          }),
        );

        const result = await handleAgeRangeCallback(
          ctx,
          env,
          "agerange:max:30",
        );
        expect(result).toBe(true);
        expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
          "Max must be ≥ 35",
        );
        expect(ctx.editMessageText).not.toHaveBeenCalled();
      });

      it("handles invalid selection (NaN max)", async () => {
        const result = await handleAgeRangeCallback(
          ctx,
          env,
          "agerange:max:xyz",
        );
        expect(result).toBe(true);
        expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
          "Invalid selection.",
        );
      });

      it("handles update failure (PUT returns error)", async () => {
        await kv.put(
          "conversation:123",
          JSON.stringify({
            userId: "123",
            field: "age-range",
            step: 1,
            data: { min: 18 },
          }),
        );
        env = makeEnvForAge({}, makeErrorResponse(500));

        const result = await handleAgeRangeCallback(
          ctx,
          env,
          "agerange:max:30",
        );
        expect(result).toBe(true);
        // On update failure: genericError reply with main menu
        expect(ctx.reply).toHaveBeenCalledWith(
          expect.stringContaining("❌ Sorry, something went wrong"),
          expect.objectContaining({ reply_markup: expect.anything() }),
        );
        expect(ctx.editMessageText).not.toHaveBeenCalled();
      });

      it("defaults min to 12 when conversation state is missing", async () => {
        env = makeEnvForAge({}, makePutOkResponse());
        const result = await handleAgeRangeCallback(
          ctx,
          env,
          "agerange:max:25",
        );
        expect(result).toBe(true);
        expect(ctx.editMessageText).toHaveBeenCalledWith(
          expect.stringContaining("12–25"),
          expect.any(Object),
        );
      });

      it("uses existing preferences when merging updates", async () => {
        await kv.put(
          "conversation:123",
          JSON.stringify({
            userId: "123",
            field: "age-range",
            step: 1,
            data: { min: 18 },
          }),
        );
        env = makeEnvForAge(
          {
            preferences: {
              minAge: 18,
              maxAge: 40,
              maxDistance: 50,
              genderPreference: ["female"],
            },
          },
          makePutOkResponse(),
        );

        const result = await handleAgeRangeCallback(
          ctx,
          env,
          "agerange:max:30",
        );
        expect(result).toBe(true);

        // Verify the PUT body preserves existing prefs + updates age range
        const body = await getPutRequestBody(env.API_SERVICE.fetch);
        expect(body).not.toBeNull();
        expect((body! as any).user.preferences).toMatchObject({
          minAge: 18,
          maxAge: 30,
          maxDistance: 50,
          genderPreference: ["female"],
        });
      });
    });

    it("returns false for unknown callback data", async () => {
      const result = await handleAgeRangeCallback(ctx, env, "something:else");
      expect(result).toBe(false);
    });

    it("handles unhandled error in catch block", async () => {
      env = {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: {
          fetch: vi.fn().mockRejectedValue(new Error("Network failure")),
        },
      };
      const result = await handleAgeRangeCallback(ctx, env, "agerange:max:30");
      expect(result).toBe(false);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Trace ID:"),
        expect.anything(),
      );
    });

    it("handles editMessageText error gracefully", async () => {
      (ctx.editMessageText as any).mockRejectedValue(new Error("edit failed"));
      await kv.put(
        "conversation:123",
        JSON.stringify({
          userId: "123",
          field: "age-range",
          step: 1,
          data: { min: 18 },
        }),
      );
      env = makeEnvForAge({}, makePutOkResponse());

      const result = await handleAgeRangeCallback(ctx, env, "agerange:max:30");
      expect(result).toBe(true);
      expect(ctx.reply).toHaveBeenCalledWith(
        "👇 Use the menu below to navigate:",
        expect.any(Object),
      );
    });
  });

  // =========================================================================
  // handleDistanceCallback
  // =========================================================================
  describe("handleDistanceCallback", () => {
    function makeEnvForDistance(
      userOverrides: Record<string, unknown> = {},
      putResponseOverride?: Response,
    ) {
      const responses: Record<string, () => Response> = {
        "/users/123": () => makeUserResponse(userOverrides),
      };
      if (putResponseOverride) {
        responses["PUT:/users/123"] = () => putResponseOverride;
      }
      return {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: createMockApiService(responses),
      };
    }

    beforeEach(() => {
      kv = mockKV();
      ctx = mockCtx({ editMessageText: vi.fn().mockResolvedValue(undefined) });
      env = makeEnvForDistance();
    });

    it("returns false when ctx.from is missing", async () => {
      (ctx as any).from = undefined;
      const result = await handleDistanceCallback(ctx, env, "distance:10");
      expect(result).toBe(false);
    });

    describe("distance:manual", () => {
      it("starts conversation and prompts for manual entry", async () => {
        const result = await handleDistanceCallback(
          ctx,
          env,
          "distance:manual",
        );
        expect(result).toBe(true);
        expect(ctx.reply).toHaveBeenCalledWith(
          expect.stringContaining("Enter max distance"),
          expect.any(Object),
        );
        const stateRaw = await kv.get("conversation:123");
        const state = JSON.parse(stateRaw!);
        expect(state.field).toBe("distance");
      });
    });

    describe("distance:X", () => {
      it("validates and updates preferences for valid distance", async () => {
        env = makeEnvForDistance({}, makePutOkResponse());
        const result = await handleDistanceCallback(ctx, env, "distance:50");
        expect(result).toBe(true);

        expect(ctx.editMessageText).toHaveBeenCalledWith(
          expect.stringContaining("50 km"),
          expect.any(Object),
        );
        expect(ctx.reply).toHaveBeenCalledWith(
          "👇 Use the menu below to navigate:",
          expect.any(Object),
        );
        expect(ctx.answerCallbackQuery).toHaveBeenCalled();
      });

      it("rejects distance < 1", async () => {
        const result = await handleDistanceCallback(ctx, env, "distance:0");
        expect(result).toBe(true);
        expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
          "Invalid distance.",
        );
        expect(ctx.editMessageText).not.toHaveBeenCalled();
      });

      it("rejects distance > 500", async () => {
        const result = await handleDistanceCallback(ctx, env, "distance:501");
        expect(result).toBe(true);
        expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
          "Invalid distance.",
        );
      });

      it("rejects non-numeric distance", async () => {
        const result = await handleDistanceCallback(ctx, env, "distance:abc");
        expect(result).toBe(true);
        expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
          "Invalid distance.",
        );
      });

      it("handles update failure (PUT returns error)", async () => {
        env = makeEnvForDistance({}, makeErrorResponse(500));
        const result = await handleDistanceCallback(ctx, env, "distance:25");
        expect(result).toBe(true);

        expect(ctx.reply).toHaveBeenCalledWith(
          expect.stringContaining("❌ Sorry, something went wrong"),
          expect.objectContaining({ reply_markup: expect.anything() }),
        );
        expect(ctx.editMessageText).not.toHaveBeenCalled();
      });

      it("merges with existing preferences on update", async () => {
        env = makeEnvForDistance(
          {
            preferences: {
              minAge: 20,
              maxAge: 40,
              maxDistance: 50,
              genderPreference: ["female"],
            },
          },
          makePutOkResponse(),
        );
        const result = await handleDistanceCallback(ctx, env, "distance:100");
        expect(result).toBe(true);

        const body = await getPutRequestBody(env.API_SERVICE.fetch);
        expect(body).not.toBeNull();
        expect((body! as any).user.preferences.maxDistance).toBe(100);
        expect((body! as any).user.preferences.minAge).toBe(20);

        expect(ctx.editMessageText).toHaveBeenCalledWith(
          expect.stringContaining("100 km"),
          expect.any(Object),
        );
      });

      it("handles editMessageText error gracefully", async () => {
        (ctx.editMessageText as any).mockRejectedValue(
          new Error("edit failed"),
        );
        env = makeEnvForDistance({}, makePutOkResponse());
        const result = await handleDistanceCallback(ctx, env, "distance:10");
        expect(result).toBe(true);

        expect(ctx.reply).toHaveBeenCalledWith(
          "👇 Use the menu below to navigate:",
          expect.any(Object),
        );
      });
    });

    it("returns false for unrecognised data prefix", async () => {
      const result = await handleDistanceCallback(ctx, env, "bogus:data");
      expect(result).toBe(false);
    });

    it("uses fallback language en when user has no language set", async () => {
      env = makeEnvForDistance({ language: undefined }, makePutOkResponse());
      const result = await handleDistanceCallback(ctx, env, "distance:5");
      expect(result).toBe(true);
      expect(ctx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining("5 km"),
        expect.any(Object),
      );
    });

    it("handles unhandled error in catch block", async () => {
      env = {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: {
          fetch: vi.fn().mockRejectedValue(new Error("Network failure")),
        },
      };
      const result = await handleDistanceCallback(ctx, env, "distance:10");
      expect(result).toBe(false);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Trace ID:"),
        expect.anything(),
      );
    });
  });

  // =========================================================================
  // handleGenderPrefCallback
  // =========================================================================
  describe("handleGenderPrefCallback", () => {
    function makeEnvForGender(
      userOverrides: Record<string, unknown> = {},
      putResponseOverride?: Response,
    ) {
      const responses: Record<string, () => Response> = {
        "/users/123": () => makeUserResponse(userOverrides),
      };
      if (putResponseOverride) {
        responses["PUT:/users/123"] = () => putResponseOverride;
      }
      return {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: createMockApiService(responses),
      };
    }

    beforeEach(() => {
      kv = mockKV();
      ctx = mockCtx({ editMessageText: vi.fn().mockResolvedValue(undefined) });
      env = makeEnvForGender({}, makePutOkResponse());
    });

    it("returns false when ctx.from is missing", async () => {
      (ctx as any).from = undefined;
      const result = await handleGenderPrefCallback(
        ctx,
        env,
        "genderpref:male",
      );
      expect(result).toBe(false);
    });

    describe("genderpref:male", () => {
      it("updates preferences to male", async () => {
        const result = await handleGenderPrefCallback(
          ctx,
          env,
          "genderpref:male",
        );
        expect(result).toBe(true);

        expect(ctx.editMessageText).toHaveBeenCalledWith(
          expect.stringContaining("Gender preference set to"),
          expect.any(Object),
        );
        expect(ctx.reply).toHaveBeenCalledWith(
          "👇 Use the menu below to navigate:",
          expect.any(Object),
        );

        const body = await getPutRequestBody(env.API_SERVICE.fetch);
        expect(body).not.toBeNull();
        expect((body! as any).user.preferences.genderPreference).toEqual([
          "male",
        ]);
      });
    });

    describe("genderpref:female", () => {
      it("updates preferences to female", async () => {
        const result = await handleGenderPrefCallback(
          ctx,
          env,
          "genderpref:female",
        );
        expect(result).toBe(true);
        const body = await getPutRequestBody(env.API_SERVICE.fetch);
        expect((body! as any).user.preferences.genderPreference).toEqual([
          "female",
        ]);
      });
    });

    describe("genderpref:other", () => {
      it("updates preferences to other", async () => {
        const result = await handleGenderPrefCallback(
          ctx,
          env,
          "genderpref:other",
        );
        expect(result).toBe(true);
        const body = await getPutRequestBody(env.API_SERVICE.fetch);
        expect((body! as any).user.preferences.genderPreference).toEqual([
          "other",
        ]);
      });
    });

    describe("genderpref:prefer_not_to_say", () => {
      it("updates preferences to prefer_not_to_say", async () => {
        const result = await handleGenderPrefCallback(
          ctx,
          env,
          "genderpref:prefer_not_to_say",
        );
        expect(result).toBe(true);
        const body = await getPutRequestBody(env.API_SERVICE.fetch);
        expect((body! as any).user.preferences.genderPreference).toEqual([
          "prefer_not_to_say",
        ]);
      });
    });

    describe("genderpref:all", () => {
      it("updates preferences to all genders", async () => {
        const result = await handleGenderPrefCallback(
          ctx,
          env,
          "genderpref:all",
        );
        expect(result).toBe(true);
        const body = await getPutRequestBody(env.API_SERVICE.fetch);
        expect((body! as any).user.preferences.genderPreference).toEqual([
          "male",
          "female",
          "other",
          "prefer_not_to_say",
        ]);
      });
    });

    describe("update failure", () => {
      it("shows error when PUT fails", async () => {
        env = makeEnvForGender({}, makeErrorResponse(500));
        const result = await handleGenderPrefCallback(
          ctx,
          env,
          "genderpref:male",
        );
        expect(result).toBe(true);

        expect(ctx.reply).toHaveBeenCalledWith(
          expect.stringContaining("❌ Sorry, something went wrong"),
          expect.objectContaining({ reply_markup: expect.anything() }),
        );
        expect(ctx.editMessageText).not.toHaveBeenCalled();
      });
    });

    describe("unknown callback data", () => {
      it("returns false for unrecognised prefix", async () => {
        const result = await handleGenderPrefCallback(
          ctx,
          env,
          "genderpref:unknown",
        );
        expect(result).toBe(false);
      });

      it("returns false for completely unrelated data", async () => {
        const result = await handleGenderPrefCallback(
          ctx,
          env,
          "something:random",
        );
        expect(result).toBe(false);
      });
    });

    it("merges with existing preferences on update", async () => {
      env = makeEnvForGender(
        {
          preferences: {
            minAge: 20,
            maxAge: 35,
            maxDistance: 50,
            genderPreference: ["male"],
          },
        },
        makePutOkResponse(),
      );
      const result = await handleGenderPrefCallback(
        ctx,
        env,
        "genderpref:female",
      );
      expect(result).toBe(true);

      const body = await getPutRequestBody(env.API_SERVICE.fetch);
      expect((body! as any).user.preferences.genderPreference).toEqual([
        "female",
      ]);
      expect((body! as any).user.preferences.minAge).toBe(20);
      expect((body! as any).user.preferences.maxDistance).toBe(50);
    });

    it("handles editMessageText error gracefully", async () => {
      (ctx.editMessageText as any).mockRejectedValue(new Error("edit failed"));
      const result = await handleGenderPrefCallback(
        ctx,
        env,
        "genderpref:female",
      );
      expect(result).toBe(true);
      expect(ctx.reply).toHaveBeenCalledWith(
        "👇 Use the menu below to navigate:",
        expect.any(Object),
      );
    });

    it("handles unhandled error in catch block", async () => {
      env = {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: {
          fetch: vi.fn().mockRejectedValue(new Error("Network failure")),
        },
      };
      const result = await handleGenderPrefCallback(
        ctx,
        env,
        "genderpref:male",
      );
      expect(result).toBe(false);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Trace ID:"),
        expect.anything(),
      );
    });

    it("uses correct language and escaped text in success message", async () => {
      env = makeEnvForGender({ language: "en" }, makePutOkResponse());
      const result = await handleGenderPrefCallback(ctx, env, "genderpref:all");
      expect(result).toBe(true);
      // escapeMd escapes underscores: prefer_not_to_say → prefer\_not\_to\_say
      expect(ctx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining("Gender preference set to"),
        expect.any(Object),
      );
      // Verify the edit message text contains the escaped underscore string
      const editCall = (ctx.editMessageText as any).mock.calls[0][0];
      expect(editCall).toContain("prefer\\_not\\_to\\_say");
    });
  });

  // =========================================================================
  // Full settings flow (callback chain)
  // =========================================================================
  describe("full settings flow (callback chain)", () => {
    it("handles age-range → min selection → max selection flow", async () => {
      ctx.callbackQuery!.data = "settings:age-range";
      await settingsCallbacks(ctx, env);

      const stateAfterOpen = await kv.get("conversation:123");
      expect(JSON.parse(stateAfterOpen!).field).toBe("age-range");

      const resultMin = await handleAgeRangeCallback(
        ctx,
        env,
        "agerange:min:20",
      );
      expect(resultMin).toBe(true);
      const stateAfterMin = await kv.get("conversation:123");
      const parsedMin = JSON.parse(stateAfterMin!);
      expect(parsedMin.data.min).toBe(20);
      expect(parsedMin.step).toBe(1);

      env = {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: createMockApiService({
          "/users/123": () => makeUserResponse(),
          "PUT:/users/123": () => makePutOkResponse(),
        }),
      };
      const resultMax = await handleAgeRangeCallback(
        ctx,
        env,
        "agerange:max:35",
      );
      expect(resultMax).toBe(true);

      const stateAfterMax = await kv.get("conversation:123");
      expect(stateAfterMax).toBeNull();

      expect(ctx.reply).toHaveBeenCalledWith(
        "👇 Use the menu below to navigate:",
        expect.any(Object),
      );
    });
  });

  describe("settingsCommand error path", () => {
    it("should show error with trace ID when an unexpected error occurs", async () => {
      env.API_SERVICE = createMockApiService({
        "/users/123": () =>
          new Response(
            JSON.stringify({ user: { id: "123", displayName: "Test" } }),
            { status: 200 },
          ),
      });
      ctx.reply = vi
        .fn()
        .mockRejectedValueOnce(new Error("Telegram API error"))
        .mockResolvedValue(undefined);
      await settingsCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Trace ID:"),
        expect.anything(),
      );
    });
  });

  // =========================================================================
  // settingsCallbacks — settings:language case
  // =========================================================================
  describe("settingsCallbacks — settings:language", () => {
    beforeEach(() => {
      kv = mockKV();
      ctx = mockCtx({ editMessageText: vi.fn().mockResolvedValue(undefined) });
    });

    it("edits message to language picker with keyboard", async () => {
      env = {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: createMockApiService({
          "/users/123": () => makeUserResponse(),
        }),
      };
      ctx.callbackQuery!.data = "settings:language";
      await settingsCallbacks(ctx, env);

      expect(ctx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining("Select Language"),
        expect.objectContaining({
          parse_mode: "MarkdownV2",
          reply_markup: expect.anything(),
        }),
      );
      expect(ctx.answerCallbackQuery).toHaveBeenCalled();

      // Verify keyboard has language buttons
      const editCall = (ctx.editMessageText as any).mock.calls[0];
      const replyMarkup = editCall[1]?.reply_markup as any;
      const buttons = (replyMarkup?.inline_keyboard ?? []).flat();
      expect(buttons.length).toBeGreaterThanOrEqual(2); // EN, ID + Back
      expect(
        buttons.some((b: any) => b.callback_data === "settings:back"),
      ).toBe(true);
    });

    it("shows language picker in Indonesian when user lang is id", async () => {
      env = {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: createMockApiService({
          "/users/123": () => makeUserResponse({ language: "id" }),
        }),
      };
      ctx.callbackQuery!.data = "settings:language";
      await settingsCallbacks(ctx, env);

      expect(ctx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining("Pilih Bahasa"),
        expect.any(Object),
      );
    });

    it("falls back to en when user API fails for language picker", async () => {
      env = {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: createMockApiService({
          "/users/123": () => makeErrorResponse(500),
        }),
      };
      ctx.callbackQuery!.data = "settings:language";
      await settingsCallbacks(ctx, env);

      expect(ctx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining("Select Language"),
        expect.any(Object),
      );
    });
  });

  // =========================================================================
  // handleSettingsLanguageCallback
  // =========================================================================
  describe("handleSettingsLanguageCallback", () => {
    beforeEach(() => {
      kv = mockKV();
      ctx = mockCtx({
        reply: vi.fn().mockResolvedValue(undefined),
        answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
        editMessageText: vi.fn().mockResolvedValue(undefined),
      });
    });

    it("returns false when ctx.from is missing", async () => {
      (ctx as any).from = undefined;
      const result = await handleSettingsLanguageCallback(
        ctx,
        env,
        "settings-lang:en",
      );
      expect(result).toBe(false);
    });

    it("returns false for non-settings-lang callback data", async () => {
      const result = await handleSettingsLanguageCallback(
        ctx,
        env,
        "random:data",
      );
      expect(result).toBe(false);
    });

    it("updates language when API succeeds and re-renders settings", async () => {
      env = {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: createMockApiService({
          "/users/123": () => makeUserResponse({ language: "id" }),
          "PUT:/users/123": () => makePutOkResponse(),
        }),
      };
      const result = await handleSettingsLanguageCallback(
        ctx,
        env,
        "settings-lang:id",
      );
      expect(result).toBe(true);
      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
        expect.stringContaining("Indonesia"),
      );
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Pengaturan"),
        expect.any(Object),
      );
    });

    it("falls back to DEFAULT_LANGUAGE for invalid language code", async () => {
      env = {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: createMockApiService({
          "/users/123": () => makeUserResponse(),
          "PUT:/users/123": () => makePutOkResponse(),
        }),
      };
      const result = await handleSettingsLanguageCallback(
        ctx,
        env,
        "settings-lang:fr",
      );
      expect(result).toBe(true);
      // Falls back to English
      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
        expect.stringContaining("English"),
      );
    });

    it("shows error when PUT API returns non-ok status", async () => {
      env = {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: createMockApiService({
          "PUT:/users/123": () => makeErrorResponse(500),
        }),
      };
      const result = await handleSettingsLanguageCallback(
        ctx,
        env,
        "settings-lang:id",
      );
      expect(result).toBe(true);
      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
        expect.stringContaining("Failed to change language"),
      );
    });

    it("handles API fetch rejection in catch block", async () => {
      env = {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: {
          fetch: vi.fn().mockRejectedValue(new Error("Network failure")),
        },
      };
      const result = await handleSettingsLanguageCallback(
        ctx,
        env,
        "settings-lang:en",
      );
      expect(result).toBe(true);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Trace ID:"),
        expect.anything(),
      );
    });

    it("handles answerCallbackQuery failure gracefully", async () => {
      (ctx.answerCallbackQuery as any).mockRejectedValue(
        new Error("callback failed"),
      );
      env = {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: createMockApiService({
          "/users/123": () => makeUserResponse(),
          "PUT:/users/123": () => makePutOkResponse(),
        }),
      };
      const result = await handleSettingsLanguageCallback(
        ctx,
        env,
        "settings-lang:id",
      );
      expect(result).toBe(true);
    });
  });

  // =========================================================================
  // Pure function coverage via exported handlers — formatGenderPreference
  // =========================================================================
  describe("formatGenderPreference (via settingsCommand)", () => {
    it("shows 'All genders' when all four prefs are set", async () => {
      env = {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: createMockApiService({
          "/users/123": () =>
            makeUserResponse({
              preferences: {
                minAge: 18,
                maxAge: 35,
                maxDistance: 25,
                genderPreference: [
                  "male",
                  "female",
                  "other",
                  "prefer_not_to_say",
                ],
              },
            }),
        }),
      };
      await settingsCommand(ctx, env);
      const callArg = (ctx.reply as any).mock.calls[0][0];
      expect(callArg).toContain("All genders");
    });

    it("shows comma-separated display when partial prefs set", async () => {
      env = {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: createMockApiService({
          "/users/123": () =>
            makeUserResponse({
              preferences: {
                minAge: 18,
                maxAge: 35,
                maxDistance: 25,
                genderPreference: ["female", "other"],
              },
            }),
        }),
      };
      await settingsCommand(ctx, env);
      const callArg = (ctx.reply as any).mock.calls[0][0];
      expect(callArg).toContain("Female, Other");
    });

    it("shows 'Not set' for empty gender preference array", async () => {
      env = {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: createMockApiService({
          "/users/123": () =>
            makeUserResponse({
              preferences: {
                minAge: 18,
                maxAge: 35,
                maxDistance: 25,
                genderPreference: [],
              },
            }),
        }),
      };
      await settingsCommand(ctx, env);
      const callArg = (ctx.reply as any).mock.calls[0][0];
      expect(callArg).toContain("Not set");
    });

    it("handles unknown gender value gracefully (uses raw value)", async () => {
      env = {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: createMockApiService({
          "/users/123": () =>
            makeUserResponse({
              preferences: {
                minAge: 18,
                maxAge: 35,
                maxDistance: 25,
                genderPreference: ["male", "unknown_value"],
              },
            }),
        }),
      };
      await settingsCommand(ctx, env);
      const callArg = (ctx.reply as any).mock.calls[0][0];
      expect(callArg).toContain("Male, unknown\\_value");
    });
  });

  // =========================================================================
  // Pure function coverage via exported handlers — buildAgeGridKeyboard
  // =========================================================================
  describe("buildAgeGridKeyboard (via handleAgeRangeCallback)", () => {
    beforeEach(() => {
      kv = mockKV();
      ctx = mockCtx({ editMessageText: vi.fn().mockResolvedValue(undefined) });
    });

    it("generates grid for very young user (age 12)", async () => {
      env = {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: createMockApiService({
          "/users/123": () =>
            makeUserResponse({ age: 12, birthDate: undefined }),
        }),
      };
      await handleAgeRangeCallback(ctx, env, "agerange:min:12");
      // gridStart = max(12, 12-13) = 12, gridEnd = min(80, 12+15) = 27
      const editCall = (ctx.editMessageText as any).mock.calls[0];
      const replyMarkup = editCall[1]?.reply_markup as any;
      const buttons = (replyMarkup?.inline_keyboard ?? []).flat();
      // Should have ages 12-27 plus manual button
      const ageButtons = buttons.filter(
        (b: any) => b.callback_data && b.callback_data.startsWith("agerange:"),
      );
      expect(ageButtons.length).toBeGreaterThan(16); // 12-27 = 16 ages + manual
      expect(ageButtons[0].text).toBe("12");
    });

    it("generates grid for older user (age 65)", async () => {
      env = {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: createMockApiService({
          "/users/123": () =>
            makeUserResponse({ age: 65, birthDate: undefined }),
        }),
      };
      await handleAgeRangeCallback(ctx, env, "agerange:min:52");
      const editCall = (ctx.editMessageText as any).mock.calls[0];
      const replyMarkup = editCall[1]?.reply_markup as any;
      const buttons = (replyMarkup?.inline_keyboard ?? []).flat();
      const ageButtons = buttons.filter(
        (b: any) => b.callback_data && b.callback_data.startsWith("agerange:"),
      );
      // gridStart = max(12, 65-13) = 52, gridEnd = min(80, 65+15) = 80
      expect(ageButtons[0].text).toBe("52");
      expect(ageButtons[ageButtons.length - 2].text).toBe("80");
    });

    it("generates max grid with selectedMin filtering (skips ages below min)", async () => {
      await kv.put(
        "conversation:123",
        JSON.stringify({
          userId: "123",
          field: "age-range",
          step: 1,
          data: { min: 25 },
        }),
      );
      env = {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: createMockApiService({
          "/users/123": () =>
            makeUserResponse({ age: 25, birthDate: undefined }),
        }),
      };
      await handleAgeRangeCallback(ctx, env, "agerange:min:25");
      const editCall = (ctx.editMessageText as any).mock.calls[0];
      const replyMarkup = editCall[1]?.reply_markup as any;
      const buttons = (replyMarkup?.inline_keyboard ?? []).flat();
      const ageButtons = buttons.filter(
        (b: any) =>
          b.callback_data && b.callback_data.startsWith("agerange:max:"),
      );
      // Should start at 25 (the selected min), not at gridStart
      expect(ageButtons[0].text).toBe("25");
    });

    it("includes manual entry button in both min and max grids", async () => {
      env = {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: createMockApiService({
          "/users/123": () => makeUserResponse(),
        }),
      };
      await handleAgeRangeCallback(ctx, env, "agerange:min:20");
      const editCall = (ctx.editMessageText as any).mock.calls[0];
      const replyMarkup = editCall[1]?.reply_markup as any;
      const buttons = (replyMarkup?.inline_keyboard ?? []).flat();
      expect(buttons.some((b: any) => b.text === "✏️ Type manually")).toBe(
        true,
      );
    });
  });

  // =========================================================================
  // Pure function coverage via exported handlers — buildDistanceKeyboard
  // =========================================================================
  describe("buildDistanceKeyboard (via settingsCallbacks)", () => {
    it("builds distance keyboard with 5,10,25,50,100,200 km options plus manual", async () => {
      ctx.callbackQuery!.data = "settings:distance";
      await settingsCallbacks(ctx, env);

      const replyCall = (ctx.reply as any).mock.calls[0];
      const replyMarkup = replyCall[1]?.reply_markup as any;
      const buttons = (replyMarkup?.inline_keyboard ?? []).flat();
      const distanceButtons = buttons.filter(
        (b: any) => b.callback_data && b.callback_data.startsWith("distance:"),
      );
      expect(distanceButtons).toHaveLength(7); // 6 values + manual
      expect(distanceButtons[0].text).toBe("5 km");
      expect(distanceButtons[1].text).toBe("10 km");
      expect(distanceButtons[5].text).toBe("200 km");
      expect(distanceButtons[6].text).toBe("✏️ Type manually");

      // Verify Back button
      expect(
        buttons.some((b: any) => b.callback_data === "settings:back"),
      ).toBe(true);
    });
  });

  // =========================================================================
  // Pure function coverage via exported handlers — buildGenderPrefKeyboard
  // =========================================================================
  describe("buildGenderPrefKeyboard (via settingsCallbacks)", () => {
    it("builds gender pref keyboard with all options", async () => {
      ctx.callbackQuery!.data = "settings:gender-pref";
      await settingsCallbacks(ctx, env);

      const replyCall = (ctx.reply as any).mock.calls[0];
      const replyMarkup = replyCall[1]?.reply_markup as any;
      const buttons = (replyMarkup?.inline_keyboard ?? []).flat();
      expect(
        buttons.some((b: any) => b.callback_data === "genderpref:male"),
      ).toBe(true);
      expect(
        buttons.some((b: any) => b.callback_data === "genderpref:female"),
      ).toBe(true);
      expect(
        buttons.some((b: any) => b.callback_data === "genderpref:other"),
      ).toBe(true);
      expect(
        buttons.some(
          (b: any) => b.callback_data === "genderpref:prefer_not_to_say",
        ),
      ).toBe(true);
      expect(
        buttons.some((b: any) => b.callback_data === "genderpref:all"),
      ).toBe(true);
      expect(
        buttons.some((b: any) => b.callback_data === "settings:back"),
      ).toBe(true);
    });
  });

  // =========================================================================
  // Pure function coverage via exported handlers — getSettingsKeyboard
  // =========================================================================
  describe("getSettingsKeyboard (via settingsCommand)", () => {
    it("returns keyboard with all four setting fields plus close", async () => {
      await settingsCommand(ctx, env);

      const replyCall = (ctx.reply as any).mock.calls[0];
      const replyMarkup = replyCall[1]?.reply_markup as any;
      const buttons = (replyMarkup?.inline_keyboard ?? []).flat();
      expect(
        buttons.some((b: any) => b.callback_data === "settings:age-range"),
      ).toBe(true);
      expect(
        buttons.some((b: any) => b.callback_data === "settings:distance"),
      ).toBe(true);
      expect(
        buttons.some((b: any) => b.callback_data === "settings:gender-pref"),
      ).toBe(true);
      expect(
        buttons.some((b: any) => b.callback_data === "settings:language"),
      ).toBe(true);
      expect(
        buttons.some((b: any) => b.callback_data === "settings:close"),
      ).toBe(true);
    });
  });

  // =========================================================================
  // Pure function coverage — getLanguageLabel (via settingsCommand)
  // =========================================================================
  describe("getLanguageLabel (via settingsCommand)", () => {
    it("shows English flag+label for en user", async () => {
      env = {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: createMockApiService({
          "/users/123": () => makeUserResponse({ language: "en" }),
        }),
      };
      await settingsCommand(ctx, env);
      const callArg = (ctx.reply as any).mock.calls[0][0];
      expect(callArg).toContain("English");
    });

    it("shows Indonesian flag+label for id user", async () => {
      env = {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: createMockApiService({
          "/users/123": () => makeUserResponse({ language: "id" }),
        }),
      };
      await settingsCommand(ctx, env);
      const callArg = (ctx.reply as any).mock.calls[0][0];
      expect(callArg).toContain("Indonesia");
    });
  });

  // =========================================================================
  // handleDistanceCallback — edge case: distance:manual with unknown user
  // =========================================================================
  describe("handleDistanceCallback — manual edge cases", () => {
    it("handles distance:manual with API failure (still starts conversation)", async () => {
      env = {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: createMockApiService({
          "/users/123": () => makeErrorResponse(500),
        }),
      };
      const result = await handleDistanceCallback(ctx, env, "distance:manual");
      expect(result).toBe(true);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Enter max distance"),
        expect.any(Object),
      );
    });
  });

  // =========================================================================
  // handleAgeRangeCallback — edge cases for age extremes
  // =========================================================================
  describe("handleAgeRangeCallback — age extremes", () => {
    beforeEach(() => {
      kv = mockKV();
      ctx = mockCtx({ editMessageText: vi.fn().mockResolvedValue(undefined) });
    });

    it("handles user with no API response (uses default age 25)", async () => {
      env = {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: createMockApiService({
          "/users/123": () => makeErrorResponse(404),
        }),
      };
      const result = await handleAgeRangeCallback(ctx, env, "agerange:min:18");
      expect(result).toBe(true);
      // Should still work with fallback age 25
      const stateRaw = await kv.get("conversation:123");
      const state = JSON.parse(stateRaw!);
      expect(state.data.min).toBe(18);
    });

    it("computes age from birthDate when age column is missing", async () => {
      // birthDate "1990-01-01" → age ~35 (year dependent)
      env = {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: createMockApiService({
          "/users/123": () =>
            makeUserResponse({
              birthDate: "1990-01-01",
              age: undefined,
            }),
        }),
      };
      const result = await handleAgeRangeCallback(ctx, env, "agerange:min:18");
      expect(result).toBe(true);
      const stateRaw = await kv.get("conversation:123");
      const state = JSON.parse(stateRaw!);
      expect(state.data.min).toBe(18);
    });

    it("falls back to age 25 when user has no birthDate and no age column", async () => {
      env = {
        KV: kv as unknown as KVNamespace,
        API_SERVICE: createMockApiService({
          "/users/123": () =>
            makeUserResponse({
              birthDate: undefined,
              age: undefined,
            }),
        }),
      };
      const result = await handleAgeRangeCallback(ctx, env, "agerange:min:18");
      expect(result).toBe(true);
      const stateRaw = await kv.get("conversation:123");
      const state = JSON.parse(stateRaw!);
      expect(state.data.min).toBe(18);
    });
  });
});
