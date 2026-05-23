## 2026-05-16 - Array intersections in Match Scoring

**Learning:** Using `new Set([...set1].filter(x => set2.has(x)))` for calculating Jaccard similarity between two small arrays (user interests) inside a hot loop (`calculateMatchScore`) is highly inefficient due to array spreading, multiple Set creations, and filter operations per candidate.
**Action:** Replace spreading and multiple Sets with a simpler O(N) lookup (`set2.has(item)`) and size arithmetic to calculate union and intersection sizes. Same for relationship type overlap.

## 2026-05-23 - Date Parsing in Hot Loops

**Learning:** When calculating time differences for multiple items inside a hot loop (like checking candidate timestamps in match scoring), using `new Date(dateString).getTime()` causes significant unnecessary memory allocation and garbage collection for full Date objects.
**Action:** Use the much faster `Date.parse(dateString)` instead of `new Date(dateString).getTime()`. Also, hoist constant time evaluations like `new Date().getTime()` to a `nowTime` variable outside the loop to avoid redundant calls.
