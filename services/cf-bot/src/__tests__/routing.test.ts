import { describe, it, expect, vi, beforeEach } from "vitest";

const mockBotInstance = {
  init: vi.fn().mockResolvedValue(undefined),
  handleUpdate: vi.fn().mockResolvedValue(undefined),
  api: {
    sendMessage: vi.fn().mockResolvedValue({}),
    deleteMessage: vi.fn().mockResolvedValue({}),
  },
  use: vi.fn().mockReturnThis(),
  command: vi.fn().mockReturnThis(),
  on: vi.fn().mockReturnThis(),
};

vi.mock("grammy", () => ({
  Bot: vi.fn(() => mockBotInstance),
  session: vi.fn(() => vi.fn()),
  InlineKeyboard: class {
    text() {
      return this;
    }
    row() {
      return this;
    }
  },
}));

function createEnv(overrides: Record<string, unknown> = {}) {
  return {
    DB: {} as D1Database,
    KV: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as KVNamespace,
    API_SERVICE: {
      fetch: vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    } as unknown as Fetcher,
    BOT_TOKEN: "test-token",
    ...overrides,
  };
}

describe("Fetch Handler Routing", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("GET /health returns ok with service name", async () => {
    const mod = await import("../index.js");
    const res = await mod.default.fetch(
      new Request("http://localhost/health"),
      createEnv(),
      {} as ExecutionContext,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, string>;
    expect(body.status).toBe("ok");
    expect(body.service).toBe("cf-bot");
  });

  it("GET / returns ok", async () => {
    const mod = await import("../index.js");
    const res = await mod.default.fetch(
      new Request("http://localhost/"),
      createEnv(),
      {} as ExecutionContext,
    );
    expect(res.status).toBe(200);
  });

  it("GET /webhook returns 405 (only POST allowed)", async () => {
    const mod = await import("../index.js");
    const res = await mod.default.fetch(
      new Request("http://localhost/webhook", { method: "GET" }),
      createEnv(),
      {} as ExecutionContext,
    );
    expect(res.status).toBe(405);
  });

  it("unknown route returns 404", async () => {
    const mod = await import("../index.js");
    const res = await mod.default.fetch(
      new Request("http://localhost/unknown"),
      createEnv(),
      {} as ExecutionContext,
    );
    expect(res.status).toBe(404);
  });
});
