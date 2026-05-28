import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildLanguageKeyboard,
  startCommand,
  languageCallback,
} from "../start.js";

describe("start handler", () => {
  describe("buildLanguageKeyboard", () => {
    it("returns an InlineKeyboard with language options", () => {
      const keyboard = buildLanguageKeyboard();
      expect(keyboard).toBeDefined();
      // InlineKeyboard has inline_keyboard property
      expect((keyboard as any).inline_keyboard).toBeDefined();
      expect((keyboard as any).inline_keyboard.length).toBeGreaterThan(0);
    });
  });

  function createCtx(overrides: Record<string, unknown> = {}) {
    return {
      from: { id: 123, first_name: "Test" },
      message: { text: "/start" },
      chat: { id: 123 },
      reply: vi.fn(async () => {}),
      answerCallbackQuery: vi.fn(async () => {}),
      editMessageText: vi.fn(async () => {}),
      callbackQuery: undefined,
      ...overrides,
    } as any;
  }

  function createEnv(overrides: Record<string, unknown> = {}) {
    return {
      API_SERVICE: {
        fetch: vi.fn(async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            user: {
              id: "123",
              displayName: "Test",
              language: "en",
              isProfileComplete: true,
              phoneNumber: "+123",
            },
          }),
          text: async () => "ok",
        })),
      },
      KV: {
        get: vi.fn(async () => null),
        put: vi.fn(async () => {}),
        delete: vi.fn(async () => {}),
      },
      ...overrides,
    } as any;
  }

  describe("startCommand", () => {
    it("welcomes new user with language picker", async () => {
      const ctx = createCtx();
      const env = createEnv({
        API_SERVICE: {
          fetch: vi.fn(async (req: Request) => {
            if (req.url.includes("/users/123")) {
              return {
                ok: true,
                json: async () => ({
                  user: {
                    id: "123",
                    displayName: "Test",
                    language: "en",
                    isProfileComplete: false,
                  },
                }),
                text: async () => "ok",
              };
            }
            return { ok: true, json: async () => ({}), text: async () => "ok" };
          }),
        },
      });

      await startCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Choose your language"),
        expect.any(Object),
      );
    });

    it("welcomes back complete user", async () => {
      const ctx = createCtx();
      const env = createEnv({
        API_SERVICE: {
          fetch: vi.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => ({
              user: {
                id: "123",
                displayName: "Test",
                birthDate: "1990-01-01",
                gender: "female",
                bio: "Hello",
                location: {
                  city: "NYC",
                  country: "USA",
                  latitude: 40.7,
                  longitude: -74,
                },
                interests: ["music"],
                mediaUrls: [
                  { url: "https://example.com/photo.jpg", type: "image" },
                ],
                language: "en",
                isProfileComplete: true,
                phoneNumber: "+1234567890",
              },
            }),
            text: async () => "ok",
          })),
        },
      });

      await startCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Welcome back"),
        expect.any(Object),
      );
    });

    it("handles missing ctx.from", async () => {
      const ctx = createCtx({ from: undefined });
      const env = createEnv();

      await startCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Welcome"),
      );
    });

    it("handles API failure gracefully", async () => {
      const ctx = createCtx();
      const env = createEnv({
        API_SERVICE: {
          fetch: vi.fn(async () => ({
            ok: false,
            status: 500,
            text: async () => "error",
          })),
        },
      });

      await startCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Sorry"));
    });

    it("handles referral code from deep link", async () => {
      const ctx = createCtx({ message: { text: "/start ref_ABC123" } });
      const env = createEnv();

      await startCommand(ctx, env);
      expect(env.API_SERVICE.fetch).toHaveBeenCalled();
    });
  });

  describe("languageCallback", () => {
    it("sets language and starts onboarding for incomplete profile", async () => {
      const ctx = createCtx({ callbackQuery: { data: "lang:id" } });
      const env = createEnv({
        API_SERVICE: {
          fetch: vi.fn(async (req: Request) => {
            if (req.url.includes("/users/123") && req.method === "PUT") {
              return {
                ok: true,
                json: async () => ({}),
                text: async () => "ok",
              };
            }
            if (req.url.includes("/users/123") && req.method === "GET") {
              return {
                ok: true,
                json: async () => ({
                  user: {
                    id: "123",
                    displayName: "Test",
                    language: "id",
                    isProfileComplete: false,
                  },
                }),
                text: async () => "ok",
              };
            }
            return { ok: true, json: async () => ({}), text: async () => "ok" };
          }),
        },
      });

      const result = await languageCallback(ctx, env, "lang:id");
      expect(result).toBe(true);
      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    });

    it("returns false for invalid callback data", async () => {
      const ctx = createCtx();
      const env = createEnv();

      const result = await languageCallback(ctx, env, "invalid");
      expect(result).toBe(false);
    });

    it("returns false when ctx.from is missing", async () => {
      const ctx = createCtx({ from: undefined });
      const env = createEnv();

      const result = await languageCallback(ctx, env, "lang:en");
      expect(result).toBe(false);
    });

    it("handles API failure when setting language", async () => {
      const ctx = createCtx({ callbackQuery: { data: "lang:en" } });
      const env = createEnv({
        API_SERVICE: {
          fetch: vi.fn(async () => ({
            ok: false,
            status: 500,
            text: async () => "error",
          })),
        },
      });

      const result = await languageCallback(ctx, env, "lang:en");
      expect(result).toBe(true);
    });

    it("sets language and shows menu for complete phone-verified user", async () => {
      const ctx = createCtx({ callbackQuery: { data: "lang:en" } });
      const env = createEnv({
        API_SERVICE: {
          fetch: vi.fn(async (req: Request) => {
            if (req.url.includes("/users/123") && req.method === "PUT") {
              return {
                ok: true,
                json: async () => ({}),
                text: async () => "ok",
              };
            }
            if (req.url.includes("/users/123") && req.method === "GET") {
              return {
                ok: true,
                json: async () => ({
                  user: {
                    id: "123",
                    displayName: "Test",
                    birthDate: "1990-01-01",
                    gender: "female",
                    bio: "Hello",
                    location: {
                      city: "NYC",
                      country: "USA",
                    },
                    interests: ["music"],
                    mediaUrls: [
                      { url: "https://example.com/photo.jpg", type: "image" },
                    ],
                    language: "en",
                    isProfileComplete: true,
                    phoneNumber: "+1234567890",
                  },
                }),
                text: async () => "ok",
              };
            }
            return { ok: true, json: async () => ({}), text: async () => "ok" };
          }),
        },
      });

      const result = await languageCallback(ctx, env, "lang:en");
      expect(result).toBe(true);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Use the menu"),
        expect.any(Object),
      );
    });

    it("falls back to DEFAULT_LANGUAGE for unsupported lang code", async () => {
      const ctx = createCtx({ callbackQuery: { data: "lang:fr" } });
      const env = createEnv();

      const result = await languageCallback(ctx, env, "lang:fr");
      expect(result).toBe(true);

      const putCall = (
        env.API_SERVICE.fetch as ReturnType<typeof vi.fn>
      ).mock.calls.find((c: unknown[]) => (c[0] as Request)?.method === "PUT");
      expect(putCall).toBeDefined();
      const body = JSON.parse(await (putCall![0] as Request).text());
      expect(["en", "id"]).toContain(body.user.language);
      expect(body.user.language).not.toBe("fr");
    });

    it("handles user fetch failure after language set", async () => {
      const ctx = createCtx({ callbackQuery: { data: "lang:id" } });
      const env = createEnv({
        API_SERVICE: {
          fetch: vi.fn(async (req: Request) => {
            if (req.url.includes("/users/123") && req.method === "PUT") {
              return {
                ok: true,
                json: async () => ({}),
                text: async () => "ok",
              };
            }
            if (req.url.includes("/users/123") && req.method === "GET") {
              return {
                ok: false,
                status: 500,
                json: async () => ({}),
                text: async () => "error",
              };
            }
            return { ok: true, json: async () => ({}), text: async () => "ok" };
          }),
        },
      });

      const result = await languageCallback(ctx, env, "lang:id");
      expect(result).toBe(true);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Maaf"));
    });

    it("handles missing user payload after language update", async () => {
      const ctx = createCtx({ callbackQuery: { data: "lang:id" } });
      const env = createEnv({
        API_SERVICE: {
          fetch: vi.fn(async (req: Request) => {
            if (req.url.includes("/users/123") && req.method === "PUT") {
              return {
                ok: true,
                json: async () => ({}),
                text: async () => "ok",
              };
            }
            if (req.url.includes("/users/123") && req.method === "GET") {
              return {
                ok: true,
                json: async () => ({}),
                text: async () => "ok",
              };
            }
            return { ok: true, json: async () => ({}), text: async () => "ok" };
          }),
        },
      });

      const result = await languageCallback(ctx, env, "lang:id");
      expect(result).toBe(true);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Maaf"));
    });

    it("catches unhandled errors and replies with trace ID", async () => {
      const ctx = createCtx({ callbackQuery: { data: "lang:en" } });
      ctx.reply = vi
        .fn()
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValue(undefined);
      const env = createEnv();

      const result = await languageCallback(ctx, env, "lang:en");
      expect(result).toBe(false);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Trace ID:"),
        expect.anything(),
      );
    });
  });

  describe("startCommand edge cases", () => {
    it("prompts phone verification for complete user without phone", async () => {
      const ctx = createCtx();
      const env = createEnv({
        API_SERVICE: {
          fetch: vi.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => ({
              user: {
                id: "123",
                displayName: "Test",
                birthDate: "1990-01-01",
                gender: "female",
                bio: "Hello",
                location: {
                  city: "NYC",
                  country: "USA",
                },
                interests: ["music"],
                mediaUrls: [
                  { url: "https://example.com/photo.jpg", type: "image" },
                ],
                language: "en",
                isProfileComplete: true,
                phoneNumber: "",
              },
            }),
            text: async () => "ok",
          })),
        },
      });

      await startCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("verify your phone"),
        expect.any(Object),
      );
    });

    it("shows language picker for new user without referral", async () => {
      const ctx = createCtx({ message: { text: "/start" } });
      const env = createEnv({
        API_SERVICE: {
          fetch: vi.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => ({
              user: {
                id: "123",
                displayName: "Test",
                language: "en",
                isProfileComplete: false,
              },
            }),
            text: async () => "ok",
          })),
        },
      });

      await startCommand(ctx, env);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Choose your language"),
        expect.any(Object),
      );
    });
  });

  describe("buildLanguageKeyboard", () => {
    it("returns keyboard with supported language options", () => {
      const keyboard = buildLanguageKeyboard();
      const kb = keyboard as any;
      const buttons = (kb.inline_keyboard ?? []).flat();
      expect(buttons.some((b: any) => b.callback_data === "lang:en")).toBe(
        true,
      );
      expect(buttons.some((b: any) => b.callback_data === "lang:id")).toBe(
        true,
      );
    });
  });
});
