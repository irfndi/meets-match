## 2026-05-16 - Array intersections in Match Scoring

**Learning:** Using `new Set([...set1].filter(x => set2.has(x)))` for calculating Jaccard similarity between two small arrays (user interests) inside a hot loop (`calculateMatchScore`) is highly inefficient due to array spreading, multiple Set creations, and filter operations per candidate.
**Action:** Replace spreading and multiple Sets with a simpler O(N) lookup (`set2.has(item)`) and size arithmetic to calculate union and intersection sizes. Same for relationship type overlap.

**Correction (2026-05-24):** A small-array direct-iteration optimization (bypassing Sets for arrays ≤ 10 items) was attempted but reverted because it breaks Jaccard correctness when interests contain duplicates. Sets naturally deduplicate, which the raw-array path could not guarantee. For small collections, modern engines optimize Set allocation well enough that the safety/correctness trade-off favors always using Sets.

## 2026-05-23 - Date Parsing in Hot Loops

**Learning:** When calculating time differences for multiple items inside a hot loop (like checking candidate timestamps in match scoring), using `new Date(dateString).getTime()` causes significant unnecessary memory allocation and garbage collection for full Date objects.
**Action:** Use the much faster `Date.parse(dateString)` instead of `new Date(dateString).getTime()`. Also, hoist constant time evaluations like `new Date().getTime()` to a `nowTime` variable outside the loop to avoid redundant calls.

## 2026-05-30 - Haversine Distance and Set Allocation Optimization in Hot Loop

**Learning:** Within the hot loop `getPotentialMatches` scoring logic, `haversine` distance was calculated multiple times (up to 3 times per candidate) due to duplicate coordinate checks across strict and soft constraint filtering, as well as final scoring. Furthermore, a new `Set` was being instantiated inside `calculateMatchScore` for the current user's interests during _every_ candidate evaluation. Additionally, `Math.PI / 180.0` was calculated dynamically in `haversine`.
**Action:**

1. Precompute `currentUserInterestsSet` outside the loop and pass it in as an option to `calculateMatchScore`.
2. Precompute the `haversine` distance for the candidate once, avoiding duplicate calculations.
3. Replace dynamic calculation of `Math.PI / 180.0` with a precomputed `TO_RAD` constant outside `haversine`.

## 2026-06-06 - Date Parsing in Hot Loops

**Learning:** Creating a full `Date` object just to extract its timestamp (e.g., `new Date(isoString).getTime()`) adds unnecessary memory allocation and garbage collection overhead, which can add up in job worker loops.
**Action:** Use `Date.parse(isoString)` instead when you only need the timestamp number, as it bypasses the object allocation while remaining functionally identical (including returning `NaN` for invalid dates).

## 2026-06-13 - Deferred Parsing in getPotentialMatches

**Learning:** Within the hot loop of `getPotentialMatches`, fully parsing every candidate using `this.rowToUser(row)` (which decodes `JSON.parse` for interests, media_urls, etc.) and executing strict timestamp parsing before preliminary filtering causes significant overhead. Many profiles are filtered out by basic checks (distance, age, gender) and cooldowns, making the parsing work redundant.
**Action:** Defer all per-candidate JSON parsing and timestamp parsing until after the hard exclusion / cooldown checks have passed, so only surviving candidates pay the parsing cost.

**Refinement (2026-06-15, PR review):** The first attempt introduced three per-row closure helpers (`getMatchUpdatedTime`, `getMatchedTime`, `getViewedTime`) and parsed `candidateLocation` / `candidatePrefs` / `candidateAge` / `candidateGender` eagerly. Both added measurable overhead in the hot `.map` loop. The follow-up changes:

1. **No closure allocation in the hot loop.** `matchUpdatedTime` is a single lazy `let` shared across its 4 cooldown/expiry use sites; first use initializes it via `if (matchUpdatedTime === undefined) { matchUpdatedTime = ... }`, subsequent uses just check `!== null`. `matchedTime` and `viewedTime` are used in a single branch each, so they're parsed inline at the use site (no lazy state at all).
2. **Remove dead code.** `candidateAge` and `candidateGender` were parsed for every row but never read; SQL already filters on age/gender. Removed.
3. **Defer `candidateLocation` parsing.** Only `JSON.parse(row.location)` when `currentUser.location` is valid for a distance check; otherwise skip the parse entirely.
4. **Defer `candidatePrefs` parsing.** Only `JSON.parse(row.preferences)` inside the `if (!relaxFilters)` bidirectional preference block — when `relaxFilters` is true the JSON.parse is skipped entirely.
5. **Avoid double-parsing in `rowToUser`.** `rowToUser` now accepts optional pre-parsed `location` and `preferences`; the hot loop passes the values it already parsed during filtering, so surviving candidates are parsed exactly once for those two fields.

## 2026-06-27 - Redundant JSON parsing in Job Worker Loops

**Learning:** Calling `JSON.parse` multiple times for the same data (like `user.preferences`) inside a worker job loop (`processCandidate` in `reengagement.ts`) causes redundant string-to-object conversions and memory allocations for every candidate.
**Action:** Always parse JSON fields once per entity iteration, cache the result in a local variable, and reuse it across helper functions.
