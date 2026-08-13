import { vi } from "vitest";
import type { MyContext } from "../../types.js";

/**
 * Single-assertion boundary helpers for test mocks that cannot structurally
 * satisfy the target Worker interface. Each performs exactly one assertion at
 * the mock boundary instead of laundering the value through `unknown`.
 */
export function asKVNamespace<T>(kv: T): KVNamespace {
  return kv as KVNamespace;
}

export function asMyContext<T>(ctx: T): MyContext {
  return ctx as MyContext;
}

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
  return asMyContext({
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
    },
    ...overrides,
  });
}

interface MockApiService {
  fetch: (...args: unknown[]) => Promise<Response>;
  _requests: Array<{ url: string; method: string; body: unknown }>;
}

export function createMockApiService(
  responseMap: Record<string, () => Response>,
): MockApiService {
  const requests: Array<{
    url: string;
    method: string;
    body: unknown;
  }> = [];

  const service = {
    fetch: vi.fn().mockImplementation(async (req: Request | string) => {
      const url = req instanceof Request ? req.url : req;

      const method =
        req instanceof Request && req.method ? req.method : "GET";

      let body: unknown;
      if (req instanceof Request && req.body) {
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
