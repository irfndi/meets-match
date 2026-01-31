## 2026-01-31 - Debouncing User Activity Tracking
**Learning:** High-frequency bot interactions caused excessive database writes for `last_active` timestamp updates (1 write per message).
**Action:** Implemented a 5-minute debounce using an in-memory `Map` with LRU eviction. This significantly reduces database load without sacrificing the utility of "last seen" data.
