import { vi } from "vitest";

/**
 * A barrier that allows pausing an async operation at a specific point
 * and resuming it later. Used to deterministically simulate race conditions.
 */
export interface RaceBarrier {
  promise: Promise<void>;
  resolve: () => void;
  isResolved: boolean;
}

export function createRaceBarrier(): RaceBarrier {
  let resolveFn!: () => void;
  const promise = new Promise<void>((resolve) => {
    resolveFn = resolve;
  });
  const barrier: RaceBarrier = {
    promise,
    resolve: () => {
      if (!barrier.isResolved) {
        barrier.isResolved = true;
        resolveFn();
      }
    },
    isResolved: false,
  };
  return barrier;
}

/**
 * Create a mock D1 that supports deterministic race simulation.
 *
 * The `pauseBeforeRun` callback is invoked for every `.run()` call.
 * If it returns a barrier, the `.run()` will await that barrier before
 * proceeding, allowing another concurrent operation to interleave.
 *
 * The mock also maintains in-memory state for SELECT queries so that
 * concurrent operations see (or don't see) each other's writes based on
 * when barriers are released.
 */
export function createRacingMockD1(options: {
  initialRows?: Map<string, Record<string, unknown>>;
  pauseBeforeRun?: (
    sql: string,
    values: unknown[],
  ) => Promise<void> | undefined;
  pauseBeforeFirst?: (
    sql: string,
    values: unknown[],
  ) => Promise<void> | undefined;
}) {
  const store = new Map(options.initialRows);
  const captured: Array<{ sql: string; values: unknown[] }> = [];

  function makeStmt(sql: string, values: unknown[]) {
    return {
      run: vi.fn(async () => {
        captured.push({ sql, values });
        const pause = options.pauseBeforeRun?.(sql, values);
        if (pause) await pause;

        // Simple in-memory UPDATE/INSERT tracking for race tests
        if (sql.includes("UPDATE matches SET")) {
          const id = values[values.length - 1] as string;
          const row = store.get(id) ?? {};
          // Parse simple column=value patterns
          const setClause =
            sql.match(/UPDATE matches SET (.+?) WHERE/i)?.[1] ?? "";
          const assignments = setClause.split(",").map((s) => s.trim());
          let valueIdx = 0;
          for (const assign of assignments) {
            const colMatch = assign.match(/^(\w+)\s*=\s*\?/);
            if (colMatch) {
              row[colMatch[1]] = values[valueIdx];
              valueIdx++;
            } else {
              const directMatch = assign.match(/^(\w+)\s*=\s*'(\w+)'/);
              if (directMatch) {
                row[directMatch[1]] = directMatch[2];
              }
            }
          }
          store.set(id, row);
        }
        if (sql.includes("UPDATE users SET")) {
          const id = values[values.length - 1] as string;
          const row = store.get(id) ?? {};
          const setClause =
            sql.match(/UPDATE users SET (.+?) WHERE/i)?.[1] ?? "";
          const assignments = setClause.split(",").map((s) => s.trim());
          let valueIdx = 0;
          for (const assign of assignments) {
            const colMatch = assign.match(/^(\w+)\s*=\s*\?/);
            if (colMatch) {
              row[colMatch[1]] = values[valueIdx];
              valueIdx++;
            }
          }
          store.set(id, row);
        }
        if (sql.includes("UPDATE notifications SET")) {
          const id = values[values.length - 1] as string;
          const row = store.get(id) ?? {};
          const setClause =
            sql.match(/UPDATE notifications SET (.+?) WHERE/i)?.[1] ?? "";
          const assignments = setClause.split(",").map((s) => s.trim());
          let valueIdx = 0;
          for (const assign of assignments) {
            const colMatch = assign.match(/^(\w+)\s*=\s*\?/);
            if (colMatch) {
              row[colMatch[1]] = values[valueIdx];
              valueIdx++;
            } else {
              const directMatch = assign.match(/^(\w+)\s*=\s*'(\w+)'/);
              if (directMatch) {
                row[directMatch[1]] = directMatch[2];
              }
            }
          }
          store.set(id, row);
        }
        return { success: true };
      }),
      first: vi.fn(async () => {
        captured.push({ sql, values });
        const pause = options.pauseBeforeFirst?.(sql, values);
        if (pause) await pause;

        if (sql.includes("SELECT * FROM matches WHERE id")) {
          const id = values[0] as string;
          return store.get(id) ?? null;
        }
        if (sql.includes("FROM users WHERE id")) {
          const id = values[0] as string;
          return store.get(id) ?? null;
        }
        if (sql.includes("SELECT * FROM notifications WHERE id")) {
          const id = values[0] as string;
          return store.get(id) ?? null;
        }
        return null;
      }),
      all: vi.fn(async () => {
        captured.push({ sql, values });
        return { results: [] };
      }),
      bind: vi.fn((...newValues: unknown[]) => makeStmt(sql, newValues)),
    };
  }

  const mock = {
    prepare: vi.fn((sql: string) => makeStmt(sql, [])),
    batch: vi.fn(async () => ({ success: true })),
    _store: store,
    _captured: captured,
  };

  return mock as unknown as import("@cloudflare/workers-types").D1Database & {
    _store: Map<string, Record<string, unknown>>;
    _captured: Array<{ sql: string; values: unknown[] }>;
  };
}

/**
 * Create a mock KV that supports deterministic race simulation.
 *
 * The `pauseBeforePut` and `pauseBeforeGet` callbacks allow interleaving
 * concurrent KV operations to expose check-then-set races.
 */
export function createRacingMockKV(options: {
  initial?: Map<string, string>;
  pauseBeforeGet?: (key: string) => Promise<void> | undefined;
  pauseBeforePut?: (key: string) => Promise<void> | undefined;
  pauseBeforeDelete?: (key: string) => Promise<void> | undefined;
}) {
  const store = new Map(options.initial);

  const mock = {
    get: vi.fn(async (key: string) => {
      const pause = options.pauseBeforeGet?.(key);
      if (pause) await pause;
      return store.get(key) ?? null;
    }),
    put: vi.fn(async (key: string, value: string, _opts?: unknown) => {
      const pause = options.pauseBeforePut?.(key);
      if (pause) await pause;
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      const pause = options.pauseBeforeDelete?.(key);
      if (pause) await pause;
      store.delete(key);
    }),
    list: vi.fn(async () => ({ keys: [] })),
    _store: store,
  };

  return mock as unknown as import("@cloudflare/workers-types").KVNamespace & {
    _store: Map<string, string>;
  };
}
