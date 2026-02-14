## 2024-05-22 - [Testing Asynchronous Effects]
**Learning:** When testing `Effect.runPromise` (fire-and-forget), use `await Promise.resolve()` and `vi.advanceTimersByTimeAsync` to ensure the promise executes, even with fake timers.
**Action:** Use this pattern for future async effect tests.

## 2024-05-22 - [Database Throttling]
**Learning:** Frequent small writes (like `last_active`) can be safely debounced in-memory to significantly reduce DB load without impacting UX.
**Action:** Look for similar "fire-and-forget" metrics/logs that can be batched or debounced.
