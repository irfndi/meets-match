## 2025-02-18 - Uncached Activity Tracking
**Learning:** The `activityTrackerMiddleware` was updating the database on every single user interaction, causing massive redundant writes for active users. Simple in-memory debouncing (5m window) reduces this by >99% for active sessions.
**Action:** Always check high-frequency event handlers (like middleware) for potential N+1 or redundant write issues. Use simple in-memory caches for non-critical, eventually consistent data.
