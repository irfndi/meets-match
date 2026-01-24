## 2025-05-15 - [Middleware Database Thrashing]
**Learning:** Middleware in `services/bot` (like `activityTrackerMiddleware`) runs on *every* interaction. Performing direct database writes/gRPC calls here without throttling causes massive write amplification (N messages = N writes).
**Action:** Always implement in-memory debouncing (e.g., `Map` with timeout) for high-frequency updates like "last active" timestamps.
