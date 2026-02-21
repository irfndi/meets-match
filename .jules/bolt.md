## 2026-02-21 - Activity Tracker Bottleneck
**Learning:** `activityTrackerMiddleware` was performing a database write on *every* user interaction, creating N writes for N messages. This is inefficient for high-frequency chat usage.
**Action:** When implementing middleware that tracks frequent user activity, always apply debouncing or throttling (e.g., using an in-memory `Map` with a time window) to reduce database load.
