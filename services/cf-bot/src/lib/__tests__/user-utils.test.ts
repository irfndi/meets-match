import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getProfileCompleteness,
  getMissingFieldsDisplay,
  ensureUserExists,
} from "../user-utils.js";
import type { MyContext } from "../../types.js";

function mockCtx(overrides: Partial<MyContext> = {}): MyContext {
  return {
    from: { id: 123, first_name: "Test", username: "testuser" },
    reply: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as MyContext;
}

function createMockApiService(responseMap: Record<string, () => Response>) {
  const sortedPatterns = Object.entries(responseMap).sort(
    (a, b) => b[0].length - a[0].length,
  );
  return {
    fetch: vi.fn().mockImplementation((req: Request | string) => {
      const url = typeof req === "string" ? req : req.url;
      for (const [pattern, factory] of sortedPatterns) {
        if (url.includes(pattern)) {
          return Promise.resolve(factory());
        }
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 404 }));
    }),
  };
}

describe("getProfileCompleteness", () => {
  it("returns complete for fully filled profile", () => {
    const user = {
      id: "1",
      displayName: "Test",
      birthDate: "1999-03-15",
      gender: "male",
      bio: "Hello",
      location: { city: "Jakarta", country: "Indonesia" },
      interests: ["Hiking"],
      mediaUrls: [{ url: "test", type: "image", uploadedAt: "2024-01-01" }],
    };
    const result = getProfileCompleteness(user as any);
    expect(result.complete).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("returns missing fields for empty profile", () => {
    const user = { id: "1" };
    const result = getProfileCompleteness(user as any);
    expect(result.complete).toBe(false);
    expect(result.missing).toEqual([
      "displayName",
      "birthDate",
      "gender",
      "bio",
      "location",
      "mediaUrls",
    ]);
  });

  it("detects missing location when only country is provided", () => {
    const user = {
      id: "1",
      displayName: "Test",
      birthDate: "1999-03-15",
      gender: "male",
      bio: "Hello",
      location: { country: "Indonesia" },
      interests: ["Hiking"],
      mediaUrls: [{ url: "test", type: "image", uploadedAt: "2024-01-01" }],
    };
    const result = getProfileCompleteness(user as any);
    expect(result.complete).toBe(false);
    expect(result.missing).toContain("location");
  });

  it("accepts GPS coordinates as valid location", () => {
    const user = {
      id: "1",
      displayName: "Test",
      birthDate: "1999-03-15",
      gender: "male",
      bio: "Hello",
      location: { latitude: -6.2, longitude: 106.8 },
      interests: ["Hiking"],
      mediaUrls: [{ url: "test", type: "image", uploadedAt: "2024-01-01" }],
    };
    const result = getProfileCompleteness(user as any);
    expect(result.complete).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("allows empty interests array (optional field)", () => {
    const user = {
      id: "1",
      displayName: "Test",
      birthDate: "1999-03-15",
      gender: "male",
      bio: "Hello",
      location: { city: "Jakarta", country: "Indonesia" },
      interests: [],
      mediaUrls: [{ url: "test", type: "image", uploadedAt: "2024-01-01" }],
    };
    const result = getProfileCompleteness(user as any);
    expect(result.complete).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("detects empty displayName", () => {
    const user = {
      id: "1",
      displayName: "   ",
      birthDate: "1999-03-15",
      gender: "male",
      bio: "Hello",
      location: { city: "Jakarta", country: "Indonesia" },
      interests: ["Hiking"],
      mediaUrls: [{ url: "test", type: "image", uploadedAt: "2024-01-01" }],
    };
    const result = getProfileCompleteness(user as any);
    expect(result.complete).toBe(false);
    expect(result.missing).toContain("displayName");
  });

  it("detects empty bio", () => {
    const user = {
      id: "1",
      displayName: "Test",
      birthDate: "1999-03-15",
      gender: "male",
      bio: "",
      location: { city: "Jakarta", country: "Indonesia" },
      interests: ["Hiking"],
      mediaUrls: [{ url: "test", type: "image", uploadedAt: "2024-01-01" }],
    };
    const result = getProfileCompleteness(user as any);
    expect(result.complete).toBe(false);
    expect(result.missing).toContain("bio");
  });
});

describe("getMissingFieldsDisplay", () => {
  it("formats missing fields with emojis", () => {
    const result = getMissingFieldsDisplay([
      "displayName",
      "birthDate",
      "interests",
    ]);
    expect(result).toContain("👤 Name");
    expect(result).toContain("🎂 Age");
    expect(result).toContain("🌟 Interests");
  });

  it("returns empty string for no missing fields", () => {
    const result = getMissingFieldsDisplay([]);
    expect(result).toBe("");
  });
});

describe("ensureUserExists", () => {
  const consoleErrorSpy = vi
    .spyOn(console, "error")
    .mockImplementation(() => {});
  const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

  beforeEach(() => {
    consoleErrorSpy.mockClear();
    consoleLogSpy.mockClear();
  });

  afterEach(() => {
    consoleErrorSpy.mockClear();
    consoleLogSpy.mockClear();
  });

  it("returns existing user when found", async () => {
    const ctx = mockCtx();
    const env = {
      API_SERVICE: createMockApiService({
        "/users/123": () =>
          new Response(
            JSON.stringify({ user: { id: "123", displayName: "Test" } }),
            {
              status: 200,
            },
          ),
      }),
    } as any;

    const result = await ensureUserExists(ctx, env);

    expect(result).not.toBeNull();
    expect(result!.user.id).toBe("123");
    expect(result!.created).toBe(false);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it("creates user and logs info when 404 (new user)", async () => {
    const ctx = mockCtx();
    const env = {
      API_SERVICE: createMockApiService({
        "/users/123": () =>
          new Response(JSON.stringify({ error: "Not found" }), { status: 404 }),
        "/users": () =>
          new Response(
            JSON.stringify({ user: { id: "123", displayName: "Test" } }),
            {
              status: 200,
            },
          ),
      }),
    } as any;

    const result = await ensureUserExists(ctx, env);

    expect(result).not.toBeNull();
    expect(result!.user.id).toBe("123");
    expect(result!.created).toBe(true);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("User not found, will create"),
    );
  });

  it("logs error for non-404 API failures", async () => {
    const ctx = mockCtx();
    const env = {
      API_SERVICE: createMockApiService({
        "/users/123": () =>
          new Response(JSON.stringify({ error: "DB down" }), { status: 500 }),
        "/users": () =>
          new Response(
            JSON.stringify({ user: { id: "123", displayName: "Test" } }),
            {
              status: 200,
            },
          ),
      }),
    } as any;

    const result = await ensureUserExists(ctx, env);

    // createUser succeeds, so result is not null
    expect(result).not.toBeNull();
    expect(result!.created).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to fetch existing user, will try create"),
    );
  });

  it("returns null when both getUser and createUser fail", async () => {
    const ctx = mockCtx();
    const env = {
      API_SERVICE: createMockApiService({
        "/users/123": () =>
          new Response(JSON.stringify({ error: "DB down" }), { status: 500 }),
        "/users": () =>
          new Response(JSON.stringify({ error: "DB down" }), { status: 500 }),
      }),
    } as any;

    const result = await ensureUserExists(ctx, env);

    expect(result).toBeNull();
    // One error log from getUser failure, one console.error from createUser failure
    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
  });

  it("returns null when ctx.from is missing", async () => {
    const ctx = mockCtx({ from: undefined });
    const env = { API_SERVICE: createMockApiService({}) } as any;

    const result = await ensureUserExists(ctx, env);

    expect(result).toBeNull();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });
});
