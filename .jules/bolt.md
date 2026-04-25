## 2024-04-25 - N+1 Query Problem in Matches Command
**Learning:** Found an N+1 API call pattern in `matchesCommand` where it fetches user details for each match sequentially in a loop using `userService.getUser`.
**Action:** Replace the sequential `userService.getUser` calls inside the `for` loop with a single concurrent batch using `Effect.all(..., { concurrency: 'unbounded' })` and handle individual failures gracefully without failing the entire batch.
