import { vi } from "vitest";
import type { MyContext } from "../../types.js";

export function mockKV() {
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

export function mockCtx(overrides?: Partial<MyContext>): MyContext {
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
    api: {
      createInvoiceLink: vi.fn().mockResolvedValue("https://t.me/invoice/test"),
      getMe: vi.fn().mockResolvedValue({ username: "meetsmatchbot" }),
    } as any,
    ...overrides,
  } as unknown as MyContext;
}

export function createMockApiService(
  responseMap: Record<string, () => Response>,
): {
  fetch: (...args: unknown[]) => Promise<Response>;
  _requests: Array<{ url: string; method: string; body: unknown }>;
} {
  const requests: Array<{
    url: string;
    method: string;
    body: unknown;
  }> = [];

  const service = {
    fetch: vi.fn().mockImplementation(async (req: Request | string) => {
      const url =
        typeof req === "string" ? req : (req as any).url || String(req);
      const method = typeof req === "string" ? "GET" : req.method || "GET";

      let body: unknown = undefined;
      if (typeof req !== "string" && req.body) {
        try {
          const text = await req.clone().text();
          body = text ? JSON.parse(text) : undefined;
        } catch {
          body = undefined;
        }
      }
      requests.push({ url, method, body });

      const sortedPatterns = Object.entries(responseMap).sort(
        (a, b) => b[0].length - a[0].length,
      );
      for (const [pattern, factory] of sortedPatterns) {
        if (url.includes(pattern)) return Promise.resolve(factory());
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 404 }));
    }),
    _requests: requests,
  };

  return service;
}
