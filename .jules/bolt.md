## 2024-05-24 - Effect.all Concurrency in v3
**Learning:** In Effect v3, `Effect.all` runs sequentially by default for iterables. If you use it to solve an N+1 query problem, it will still execute sequentially unless concurrency is explicitly configured.
**Action:** Always provide `{ concurrency: 'unbounded' }` (or a specific number) when using `Effect.all` to fetch multiple items concurrently, and use `Effect.catchAll` on individual effects to prevent partial failures from rejecting the entire batch.
