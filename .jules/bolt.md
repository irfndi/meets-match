## 2026-04-04 - [Optimize Sequential Fetching via Effect.all]
**Learning:** In `effect` v3, `Effect.all` runs sequentially by default for iterables, leading to N+1 query performance bottlenecks during batch operations.
**Action:** Use `Effect.all(..., { concurrency: 'unbounded' })` combined with `Effect.catchAll` for resilient concurrent batch fetching.
