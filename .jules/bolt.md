## 2024-05-16 - Fetching iterables concurrently using Effect.all

**Learning:** When using `Effect.all` over iterables (like arrays created by `map`) to fetch multiple data items concurrently (such as user profiles from `userService`), `effect` v3 defaults to running them sequentially. The `UserService` defined in `packages/contracts` does not support batch retrieval.

**Action:** Explicitly pass `{ concurrency: 'unbounded' }` (or a specific concurrency limit) as the second argument to `Effect.all` to ensure concurrent execution of iterable effects, vastly improving performance in data-fetching loops. Also, individually catch errors on each mapped effect (`Effect.catchAll`) to prevent partial failures from rejecting the entire batch of fetched items.