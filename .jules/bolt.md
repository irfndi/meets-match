## 2024-03-24 - [N+1 API Problem]
**Learning:** The /matches command iterates over an array of matching users and sequentially queries user API for each individual profile. This leads to slow execution times on long matched users lists.
**Action:** Use an Effect.all with concurrency to run multiple fetch operations in parallel
