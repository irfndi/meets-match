import { vi } from "vitest";
export function createMockD1(handler = () => ({ results: [] })) {
    const captured = [];
    function makeStmt(sql, values) {
        captured.push({ sql, values });
        return {
            run: vi.fn(async () => {
                await handler(sql, values);
                return { success: true };
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
        prepare: vi.fn((sql) => {
            const stmt = makeStmt(sql, []);
            // Support chaining without .bind()
            stmt.bind = vi.fn((...values) => makeStmt(sql, values));
            return stmt;
        }),
        batch: vi.fn(async () => ({ success: true })),
        _captured: captured,
    };
    return mockD1;
}
export function createMockKV(initial = {}) {
    const store = new Map(Object.entries(initial));
    return {
        get: vi.fn(async (key) => store.get(key) ?? null),
        put: vi.fn(async (key, value) => store.set(key, value)),
        delete: vi.fn(async (key) => store.delete(key)),
        list: vi.fn(async () => ({ keys: [] })),
        _store: store,
    };
}
export function createMockR2() {
    const objects = new Map();
    return {
        put: vi.fn(async (key, value, opts) => {
            objects.set(key, {
                body: value,
                httpMetadata: opts?.httpMetadata,
            });
        }),
        get: vi.fn(async (key) => {
            const obj = objects.get(key);
            if (!obj)
                return null;
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
        delete: vi.fn(async (key) => objects.delete(key)),
        _objects: objects,
    };
}
export function createMockQueue() {
    return {
        send: vi.fn(async () => { }),
        sendBatch: vi.fn(async () => { }),
    };
}
/**
 * Run an Effect and unwrap the result, throwing on failure.
 */
export async function runEffect(effect) {
    const { Effect, Exit, Cause } = await import("effect");
    const exit = await Effect.runPromiseExit(effect);
    if (Exit.isSuccess(exit))
        return exit.value;
    const failure = Cause.failureOption(exit.cause);
    if (failure._tag === "Some")
        throw failure.value;
    throw new Error(String(exit.cause));
}
//# sourceMappingURL=test-utils.js.map