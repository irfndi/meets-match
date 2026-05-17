import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getProfileMenu,
  handleProfileCallback,
  handleMediaCallback,
} from "../profile.js";
import type { MyContext } from "../../types.js";

// ---------------------------------------------------------------------------
// Helpers — same patterns used across the cf-bot test suite
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
    /** Exposed so tests can inspect stored state directly */
    _store: store,
  };
}

function mockCtx(overrides: Partial<Record<string, unknown>> = {}): MyContext {
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
 * Create an ApiService mock that maps URL patterns to Response factories.
 */
function createMockApiService(
  responseMap: Record<string, () => Response>,
): { fetch: ReturnType<typeof vi.fn> } {
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

// ---------------------------------------------------------------------------
// getProfileMenu
// ---------------------------------------------------------------------------

describe("getProfileMenu", () => {
  it("returns an InlineKeyboard with the correct button layout", () => {
    const env = {} as any;
    const keyboard = getProfileMenu(env);

    const markup = keyboard.inline_keyboard as Array<Array<{ text: string }>>;
    const texts = markup.flat().map((b) => b.text);

    expect(texts).toContain("📝 Bio");
    expect(texts).toContain("🎂 Age");
    expect(texts).toContain("👤 Name");
    expect(texts).toContain("⚧ Gender");
    expect(texts).toContain("🌟 Interests");
    expect(texts).toContain("📍 Location");
    expect(texts).toContain("❌ Close");
  });

  it("shows media count 0 in the button text by default", () => {
    const env = {} as any;
    const keyboard = getProfileMenu(env);

    const markup = keyboard.inline_keyboard as Array<Array<{ text: string }>>;
    const texts = markup.flat().map((b) => b.text);
    expect(texts).toContain("📸 Media (0/3)");
  });

  it("shows the provided media count in the button text", () => {
    const env = {} as any;
    const keyboard = getProfileMenu(env, 2);

    const markup = keyboard.inline_keyboard as Array<Array<{ text: string }>>;
    const texts = markup.flat().map((b) => b.text);
    expect(texts).toContain("📸 Media (2/3)");
  });

  it("shows max media count when 3 is provided", () => {
    const env = {} as any;
    const keyboard = getProfileMenu(env, 3);

    const markup = keyboard.inline_keyboard as Array<Array<{ text: string }>>;
    const texts = markup.flat().map((b) => b.text);
    expect(texts).toContain("📸 Media (3/3)");
  });
});

// ---------------------------------------------------------------------------
// handleProfileCallback
// ---------------------------------------------------------------------------

describe("handleProfileCallback", () => {
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
          new Response(JSON.stringify({ user: { language: "en" } }), {
            status: 200,
          }),
      }),
    };
  });

  // --- Guard / early return paths ----------------------------------------

  it("returns false when ctx.from is missing", async () => {
    (ctx as any).from = undefined;
    const result = await handleProfileCallback(ctx, env, "profile:bio");
    expect(result).toBe(false);
  });

  it("returns false for an unknown callback data", async () => {
    const result = await handleProfileCallback(ctx, env, "profile:unknown");
    expect(result).toBe(false);
  });

  // --- Language resolution -----------------------------------------------

  it("defaults language to 'en' when the API request fails", async () => {
    env.API_SERVICE = createMockApiService({
      "/users/123": () =>
        new Response(null, { status: 500 }),
    });

    const result = await handleProfileCallback(ctx, env, "profile:bio");
    expect(result).toBe(true);
    // reply was called — the bot replied in English (fallback)
    expect(ctx.reply).toHaveBeenCalled();
  });

  it("uses the language from the API when available", async () => {
    env.API_SERVICE = createMockApiService({
      "/users/123": () =>
        new Response(JSON.stringify({ user: { language: "id" } }), {
          status: 200,
        }),
    });

    const result = await handleProfileCallback(ctx, env, "profile:bio");
    expect(result).toBe(true);
    // The Indonesian bio prompt should be sent
    const replyCall = (ctx.reply as any).mock.calls[0][0];
    expect(replyCall).toContain("Ceritakan tentang dirimu");
  });

  // --- profile:bio -------------------------------------------------------

  it("starts a bio conversation and sends prompt on profile:bio", async () => {
    const result = await handleProfileCallback(ctx, env, "profile:bio");
    expect(result).toBe(true);

    // Starts conversation state in KV
    const state = await kv.get("conversation:123");
    expect(state).not.toBeNull();
    expect(JSON.parse(state!).field).toBe("bio");

    // Sends the prompt with a Cancel keyboard
    expect(ctx.reply).toHaveBeenCalled();
    const replyArg = (ctx.reply as any).mock.calls[0][0];
    expect(replyArg).toContain("Tell us about yourself");

    // Acknowledges callback query
    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
  });

  // --- profile:birthdate -------------------------------------------------

  it("starts a birthdate conversation and sends prompt on profile:birthdate", async () => {
    const result = await handleProfileCallback(ctx, env, "profile:birthdate");
    expect(result).toBe(true);

    const state = await kv.get("conversation:123");
    expect(JSON.parse(state!).field).toBe("birthdate");

    expect(ctx.reply).toHaveBeenCalled();
    const replyArg = (ctx.reply as any).mock.calls[0][0];
    expect(replyArg).toContain("When were you born");

    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
  });

  // --- profile:name ------------------------------------------------------

  it("starts a name conversation with the Use Telegram Name button on profile:name", async () => {
    const result = await handleProfileCallback(ctx, env, "profile:name");
    expect(result).toBe(true);

    const state = await kv.get("conversation:123");
    expect(JSON.parse(state!).field).toBe("name");

    expect(ctx.reply).toHaveBeenCalled();
    const replyArg = (ctx.reply as any).mock.calls[0][0];
    expect(replyArg).toContain("What should we call you");

    // The keyboard should include the "Use my Telegram name" button
    const replyOpts = (ctx.reply as any).mock.calls[0][1];
    const buttons = replyOpts.reply_markup.keyboard.flat().map(
      (b: any) => b.text,
    );
    expect(buttons).toContain("👤 Use my Telegram name");
    expect(buttons).toContain("Cancel");

    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
  });

  // --- profile:gender ----------------------------------------------------

  it("starts a gender conversation with gender keyboard on profile:gender", async () => {
    const result = await handleProfileCallback(ctx, env, "profile:gender");
    expect(result).toBe(true);

    const state = await kv.get("conversation:123");
    expect(JSON.parse(state!).field).toBe("gender");

    expect(ctx.reply).toHaveBeenCalled();
    const replyOpts = (ctx.reply as any).mock.calls[0][1];
    const buttons = replyOpts.reply_markup.keyboard.flat().map(
      (b: any) => b.text,
    );
    expect(buttons).toContain("Male");
    expect(buttons).toContain("Female");
    expect(buttons).toContain("Cancel");

    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
  });

  // --- profile:interests -------------------------------------------------

  it("starts an interests conversation on profile:interests", async () => {
    const result = await handleProfileCallback(ctx, env, "profile:interests");
    expect(result).toBe(true);

    const state = await kv.get("conversation:123");
    expect(JSON.parse(state!).field).toBe("interests");

    expect(ctx.reply).toHaveBeenCalled();
    const replyArg = (ctx.reply as any).mock.calls[0][0];
    expect(replyArg).toContain("What are you into");

    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
  });

  // --- profile:location --------------------------------------------------

  it("starts a location conversation with location keyboard on profile:location", async () => {
    const result = await handleProfileCallback(ctx, env, "profile:location");
    expect(result).toBe(true);

    const state = await kv.get("conversation:123");
    expect(JSON.parse(state!).field).toBe("location");

    expect(ctx.reply).toHaveBeenCalled();
    const replyOpts = (ctx.reply as any).mock.calls[0][1];
    const buttons = replyOpts.reply_markup.keyboard.flat().map(
      (b: any) => b.text,
    );
    expect(buttons).toContain("📍 Share my location");
    expect(buttons).toContain("⌨️ Type city & country");
    expect(buttons).toContain("Cancel");

    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
  });

  // --- profile:media (no media) ------------------------------------------

  it("shows empty media manager when user has no media", async () => {
    env.API_SERVICE = createMockApiService({
      "/users/123": () =>
        new Response(
          JSON.stringify({ user: { language: "en", mediaUrls: [] } }),
          { status: 200 },
        ),
    });

    const result = await handleProfileCallback(ctx, env, "profile:media");
    expect(result).toBe(true);

    // Uses editMessageText (inline callback — edits the message)
    expect(ctx.editMessageText).toHaveBeenCalled();
    const editTextArg = (ctx.editMessageText as any).mock.calls[0][0];
    expect(editTextArg).toContain("No media uploaded yet");

    // Shows upload and back buttons
    const editOpts = (ctx.editMessageText as any).mock.calls[0][1];
    const buttons = (editOpts.reply_markup.inline_keyboard as any[])
      .flat()
      .map((b: any) => b.text);
    expect(buttons).toContain("📤 Upload Media");
    expect(buttons).toContain("← Back to Profile");

    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
  });

  // --- profile:media (with media) ----------------------------------------

  it("shows media list with delete buttons when user has media", async () => {
    env.API_SERVICE = createMockApiService({
      "/users/123": () =>
        new Response(
          JSON.stringify({
            user: {
              language: "en",
              mediaUrls: [
                { url: "https://example.com/a.jpg", type: "image" },
                { url: "https://example.com/b.mp4", type: "video" },
              ],
            },
          }),
          { status: 200 },
        ),
    });

    const result = await handleProfileCallback(ctx, env, "profile:media");
    expect(result).toBe(true);

    expect(ctx.editMessageText).toHaveBeenCalled();
    const editTextArg = (ctx.editMessageText as any).mock.calls[0][0];
    expect(editTextArg).toContain("📷 Photo");
    expect(editTextArg).toContain("🎥 Video");
    expect(editTextArg).toContain("Tap an item to delete");

    // Has delete buttons + upload more (since count < 3) + back
    const editOpts = (ctx.editMessageText as any).mock.calls[0][1];
    const buttons = (editOpts.reply_markup.inline_keyboard as any[])
      .flat()
      .map((b: any) => b.text);
    expect(buttons).toContain("🗑 1");
    expect(buttons).toContain("🗑 2");
    expect(buttons).toContain("📤 Upload More");
    expect(buttons).toContain("← Back to Profile");

    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
  });

  it("shows media with 3 items and no Upload More button", async () => {
    env.API_SERVICE = createMockApiService({
      "/users/123": () =>
        new Response(
          JSON.stringify({
            user: {
              language: "en",
              mediaUrls: [
                { url: "https://a.jpg", type: "image" },
                { url: "https://b.jpg", type: "image" },
                { url: "https://c.jpg", type: "image" },
              ],
            },
          }),
          { status: 200 },
        ),
    });

    const result = await handleProfileCallback(ctx, env, "profile:media");
    expect(result).toBe(true);

    const editOpts = (ctx.editMessageText as any).mock.calls[0][1];
    const buttons = (editOpts.reply_markup.inline_keyboard as any[])
      .flat()
      .map((b: any) => b.text);
    expect(buttons).toContain("🗑 1");
    expect(buttons).toContain("🗑 2");
    expect(buttons).toContain("🗑 3");
    expect(buttons).not.toContain("📤 Upload More");
    expect(buttons).toContain("← Back to Profile");
  });

  // --- profile:close -----------------------------------------------------

  it("deletes message and shows main menu on profile:close", async () => {
    const result = await handleProfileCallback(ctx, env, "profile:close");
    expect(result).toBe(true);

    expect(ctx.deleteMessage).toHaveBeenCalled();

    // Shows the main menu reply keyboard
    expect(ctx.reply).toHaveBeenCalled();
    const replyOpts = (ctx.reply as any).mock.calls[0][1];
    expect(replyOpts.reply_markup).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// handleMediaCallback
// ---------------------------------------------------------------------------

describe("handleMediaCallback", () => {
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
            JSON.stringify({
              user: {
                language: "en",
                mediaUrls: [
                  { url: "https://a.jpg", type: "image", uploadedAt: "2025-01-01" },
                  { url: "https://b.mp4", type: "video", uploadedAt: "2025-01-02" },
                ],
              },
            }),
            { status: 200 },
          ),
        "/users/123/media": () =>
          new Response(
            JSON.stringify({
              mediaUrls: [
                { url: "https://b.mp4", type: "video" },
              ],
            }),
            { status: 200 },
          ),
      }),
    };
  });

  // --- Guard ---------------------------------------------------------------

  it("returns false when ctx.from is missing", async () => {
    (ctx as any).from = undefined;
    const result = await handleMediaCallback(ctx, env, "media:upload");
    expect(result).toBe(false);
  });

  it("returns false for unknown callback data", async () => {
    const result = await handleMediaCallback(ctx, env, "media:unknown");
    expect(result).toBe(false);
  });

  // --- media:upload --------------------------------------------------------

  it("starts a media conversation on media:upload", async () => {
    const result = await handleMediaCallback(ctx, env, "media:upload");
    expect(result).toBe(true);

    // Starts conversation in KV
    const state = await kv.get("conversation:123");
    expect(state).not.toBeNull();
    expect(JSON.parse(state!).field).toBe("media");

    // Sends prompt
    expect(ctx.reply).toHaveBeenCalled();
    const replyArg = (ctx.reply as any).mock.calls[0][0];
    expect(replyArg).toContain("Send me");

    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
  });

  // --- media:delete:X (successful) ----------------------------------------

  it("deletes media and refreshes the list on media:delete:0", async () => {
    const result = await handleMediaCallback(ctx, env, "media:delete:0");
    expect(result).toBe(true);

    // Called DELETE API with correct URL
    const deleteCall = (env.API_SERVICE.fetch as any).mock.calls.find(
      (c: any) =>
        (c[0] as Request).url?.includes("/media") &&
        (c[0] as Request).method === "DELETE",
    );
    expect(deleteCall).toBeDefined();

    // Refreshed the media list
    expect(ctx.editMessageText).toHaveBeenCalled();

    // Success toast
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith("✅ Deleted!");
  });

  it("deletes media and shows empty state when all media is deleted", async () => {
    // Use a sequential mock: the first GET returns user with 1 media,
    // the second GET (refresh after delete) returns empty mediaUrls.
    let userCallCount = 0;
    env.API_SERVICE = {
      fetch: vi.fn().mockImplementation((req: Request) => {
        const url =
          typeof req === "string" ? req : (req as any).url || String(req);

        if (url.includes("/media") && (req as any).method === "DELETE") {
          return Promise.resolve(
            new Response(JSON.stringify({ mediaUrls: [] }), { status: 200 }),
          );
        }

        if (url.includes("/users/123")) {
          userCallCount++;
          if (userCallCount === 1) {
            // Initial fetch: user has 1 media
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  user: {
                    language: "en",
                    mediaUrls: [
                      { url: "https://a.jpg", type: "image", uploadedAt: "2025-01-01" },
                    ],
                  },
                }),
                { status: 200 },
              ),
            );
          }
          // Refresh fetch (after delete): empty media
          return Promise.resolve(
            new Response(
              JSON.stringify({
                user: {
                  language: "en",
                  mediaUrls: [],
                },
              }),
              { status: 200 },
            ),
          );
        }

        return Promise.resolve(
          new Response(JSON.stringify({}), { status: 404 }),
        );
      }),
    };

    const result = await handleMediaCallback(ctx, env, "media:delete:0");
    expect(result).toBe(true);

    const editTextArg = (ctx.editMessageText as any).mock.calls[0][0];
    expect(editTextArg).toContain("No media uploaded yet");

    const editOpts = (ctx.editMessageText as any).mock.calls[0][1];
    const buttons = (editOpts.reply_markup.inline_keyboard as any[])
      .flat()
      .map((b: any) => b.text);
    expect(buttons).toContain("📤 Upload Media");
    expect(buttons).toContain("← Back to Profile");
  });

  // --- media:delete:X (invalid) -------------------------------------------

  it("handles non-numeric delete index gracefully", async () => {
    const result = await handleMediaCallback(ctx, env, "media:delete:abc");
    expect(result).toBe(true);
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith("Item not found");
  });

  it("handles negative delete index gracefully", async () => {
    const result = await handleMediaCallback(ctx, env, "media:delete:-1");
    expect(result).toBe(true);
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith("Item not found");
  });

  it("handles out-of-bounds delete index gracefully", async () => {
    const result = await handleMediaCallback(ctx, env, "media:delete:5");
    expect(result).toBe(true);
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith("Item not found");
  });

  // --- media:delete:X (API failure) ---------------------------------------

  it("shows error toast when the delete API call fails", async () => {
    env.API_SERVICE = createMockApiService({
      "/users/123": () =>
        new Response(
          JSON.stringify({
            user: {
              language: "en",
              mediaUrls: [
                { url: "https://a.jpg", type: "image", uploadedAt: "2025-01-01" },
              ],
            },
          }),
          { status: 200 },
        ),
      "/users/123/media": () => new Response(null, { status: 500 }),
    });

    const result = await handleMediaCallback(ctx, env, "media:delete:0");
    expect(result).toBe(true);

    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
      "❌ Failed to delete. Please try again.",
    );
  });

  // --- Language resolution in media callback -------------------------------

  it("defaults language to 'en' when user fetch fails in media callback", async () => {
    env.API_SERVICE = createMockApiService({
      "/users/123": () => new Response(null, { status: 500 }),
    });

    const result = await handleMediaCallback(ctx, env, "media:upload");
    expect(result).toBe(true);

    const replyArg = (ctx.reply as any).mock.calls[0][0];
    expect(replyArg).toContain("Send me");
  });

  it("uses user language from API in media callback", async () => {
    env.API_SERVICE = createMockApiService({
      "/users/123": () =>
        new Response(
          JSON.stringify({
            user: {
              language: "id",
              mediaUrls: [],
            },
          }),
          { status: 200 },
        ),
    });

    const result = await handleMediaCallback(ctx, env, "media:upload");
    expect(result).toBe(true);

    const replyArg = (ctx.reply as any).mock.calls[0][0];
    expect(replyArg).toContain("Kirimkan 1");
  });
});
