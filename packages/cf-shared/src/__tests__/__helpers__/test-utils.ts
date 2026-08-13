import { Cause, Effect, Exit } from "effect";
import { vi } from "vitest";

/**
 * Shared test utilities for mocking Cloudflare Workers primitives.
 */

interface MockValueMap {
  [key: string]: string | number | boolean | null;
}

export interface MockD1Result {
  results?: Array<MockValueMap>;
  success?: boolean;
  meta?: MockValueMap;
}

interface TestCastInput {}

function castForTest<T>(value: TestCastInput): T {
  return value as T;
}

export type MockD1QueryHandler = (
  sql: string,
  values: unknown[],
) => MockD1Result | Promise<MockD1Result>;

export function createMockD1(
  handler: MockD1QueryHandler = () => ({ results: [] }),
) {
  const captured: Array<{ sql: string; values: unknown[] }> = [];

  function makeStmt(sql: string, values: unknown[]) {
    captured.push({ sql, values });
    return {
      run: vi.fn(async () => {
        const result = await handler(sql, values);
        return {
          success: result.success ?? true,
          meta: result.meta ?? {},
        };
      }),
      first: vi.fn(async () => {
        const result = await handler(sql, values);
        return result.results?.[0] ?? null;
      }),
      all: vi.fn(async () => {
        const result = await handler(sql, values);
        return { results: result.results ?? [] };
      }),
    };
  }

  const mockD1 = {
    prepare: vi.fn((sql: string) => {
      const stmt = makeStmt(sql, []);
      // Support chaining without .bind()
      (stmt as any).bind = vi.fn((...values: unknown[]) =>
        makeStmt(sql, values),
      );
      return stmt;
    }),
    batch: vi.fn(async () => ({ success: true })),
    _captured: captured,
  };

  return castForTest<import("@cloudflare/workers-types").D1Database & {
    _captured: typeof captured;
  }>(mockD1);
}

export function createMockKV(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return castForTest<import("@cloudflare/workers-types").KVNamespace & {
    _store: Map<string, string>;
  }>({
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => store.set(key, value)),
    delete: vi.fn(async (key: string) => store.delete(key)),
    list: vi.fn(async () => ({
      keys: Array.from(store.keys()).map((name) => ({ name })),
    })),
    _store: store,
  });
}

export function createMockR2() {
  const objects = new Map<
    string,
    { body: ReadableStream; httpMetadata?: { contentType?: string } }
  >();
  return castForTest<import("@cloudflare/workers-types").R2Bucket & {
    _objects: Map<string, unknown>;
  }>({
    put: vi.fn(
      async (
        key: string,
        value: ReadableStream | ArrayBuffer,
        opts?: { httpMetadata?: { contentType?: string } },
      ) => {
        const body =
          value instanceof ReadableStream ? value : new Blob([value]).stream();
        objects.set(key, {
          body,
          httpMetadata: opts?.httpMetadata,
        });
      },
    ),
    get: vi.fn(async (key: string) => {
      const obj = objects.get(key);
      if (!obj) return null;
      return {
        body: obj.body,
        httpMetadata: obj.httpMetadata,
        writeHttpMetadata: vi.fn(),
        httpEtag: `"${key}"`,
        size: 0,
        uploaded: new Date(),
        checksums: {},
      };
    }),
    delete: vi.fn(async (key: string) => objects.delete(key)),
    _objects: objects,
  });
}

export function createMockQueue() {
  return castForTest<import("@cloudflare/workers-types").Queue>({
    send: vi.fn(async () => {}),
    sendBatch: vi.fn(async () => {}),
  });
}

/**
 * Run an Effect and unwrap the result, throwing on failure.
 */
export async function runEffect<A, E>(
  effect: Effect.Effect<A, E, never>,
): Promise<A> {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  const failure = Cause.findErrorOption(exit.cause);
  if (failure._tag === "Some") throw failure.value;
  throw new Error(String(exit.cause));
}
