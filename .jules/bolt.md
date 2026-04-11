## 2025-02-23 - Concurrent Batched Effect Execution
**Learning:** In Effect v3, `Effect.all` runs sequentially by default for iterables. Furthermore, standard `try/catch` inside `Effect.gen` does not catch yielded Effect failures, which can inadvertently halt generator execution and abort the entire batch.
**Action:** Always explicitly provide `{ concurrency: 'unbounded' }` (or a specific limit) to `Effect.all` for concurrent execution, and apply `Effect.catchAll` on individual elements to gracefully handle partial failures without breaking the entire operation.
