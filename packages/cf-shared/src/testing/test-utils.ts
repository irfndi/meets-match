import { Cause, Effect, Exit } from "effect";
import { vi } from "vitest";

/**
 * Shared test utilities for mocking Cloudflare Workers primitives.
 */

export interface MockD1Result {
  results?: Array<MockValueMap>;
  success?: boolean;
  meta?: MockValueMap;
}

export type MockValue = string | number | boolean | null;
export interface MockValueMap {
  [key: string]: MockValue;
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

  type Stmt = {
    _sql: string;
    _values: unknown[];
    run: ReturnType<typeof vi.fn>;
    first: ReturnType<typeof vi.fn>;
    all: ReturnType<typeof vi.fn>;
    bind: ReturnType<typeof vi.fn>;
  };

  function makeStmt(sql: string, values: unknown[]): Stmt {
    captured.push({ sql, values });
    return {
      _sql: sql,
      _values: values,
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
      bind: vi.fn((...newValues: unknown[]) => makeStmt(sql, newValues)),
    };
  }

  const mockD1 = {
    prepare: vi.fn((sql: string) => makeStmt(sql, [])),
    batch: vi.fn(async (statements: Stmt[]) => {
      const results = [];
      for (const stmt of statements) {
        const result = await handler(stmt._sql, stmt._values);
        results.push({
          success: result.success ?? true,
          meta: result.meta ?? {},
          results: result.results ?? [],
        });
      }
      return results;
    }),
    _captured: captured,
  };

  return castForTest<import("@cloudflare/workers-types").D1Database & {
    _captured: typeof captured;
  }>(mockD1);
}

export function createMockKV(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return castForTest<import("@cloudflare/workers-types").KVNamespace & {
  }>(
    {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      put: vi.fn(async (key: string, value: string) => store.set(key, value)),
      delete: vi.fn(async (key: string) => store.delete(key)),
      list: vi.fn(async () => ({
        keys: Array.from(store.keys()).map((name) => ({ name })),
      })),
      _store: store,
    },
  );
}

export function createMockR2() {
  const objects = new Map<
    string,
    { body: ReadableStream; httpMetadata?: { contentType?: string } }
  >();
  return castForTest<import("@cloudflare/workers-types").R2Bucket & {
  }>(
    {
      put: vi.fn(
        async (
          key: string,
          value: ReadableStream | ArrayBuffer,
          opts?: { httpMetadata?: { contentType?: string } },
        ) => {
          const body =
            value instanceof ReadableStream ? value : new Blob([value]).stream();
          objects.set(key, { body, httpMetadata: opts?.httpMetadata });
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
    },
  );
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
