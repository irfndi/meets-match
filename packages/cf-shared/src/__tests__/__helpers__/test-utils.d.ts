/**
 * Shared test utilities for mocking Cloudflare Workers primitives.
 */
export interface MockD1Result {
  results?: Array<Record<string, unknown>>;
  success?: boolean;
  meta?: Record<string, unknown>;
}
export type MockD1QueryHandler = (
  sql: string,
  values: unknown[],
) => MockD1Result | Promise<MockD1Result>;
export declare function createMockD1(
  handler?: MockD1QueryHandler,
): import("@cloudflare/workers-types").D1Database & {
  _captured: {
    sql: string;
    values: unknown[];
  }[];
};
export declare function createMockKV(
  initial?: Record<string, string>,
): import("@cloudflare/workers-types").KVNamespace & {
  _store: Map<string, string>;
};
export declare function createMockR2(): import("@cloudflare/workers-types").R2Bucket & {
  _objects: Map<string, unknown>;
};
export declare function createMockQueue(): import("@cloudflare/workers-types").Queue;
/**
 * Run an Effect and unwrap the result, throwing on failure.
 */
export declare function runEffect<A, E>(
  effect: import("effect").Effect.Effect<A, E, never>,
): Promise<A>;
//# sourceMappingURL=test-utils.d.ts.map
