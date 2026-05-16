## 2024-05-16 - Array intersections in Match Scoring

**Learning:** Using `new Set([...set1].filter(x => set2.has(x)))` for calculating Jaccard similarity between two small arrays (user interests) inside a hot loop (`calculateMatchScore`) is highly inefficient due to array spreading, multiple Set creations, and filter operations per candidate.
**Action:** Replace spreading and multiple Sets with a simpler O(N) lookup (`set2.has(item)`) and size arithmetic to calculate union and intersection sizes. Same for relationship type overlap.
