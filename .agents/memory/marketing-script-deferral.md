---
name: Marketing script deferral
description: Decision for balancing initial-load performance with reliable Google and Meta event tracking.
---

Queue Google and Meta browser commands immediately, but load their external vendor scripts only after intentional user interaction. Keep Meta Conversions API requests immediate and preserve the same event ID for browser/server deduplication.

**Why:** Eager vendor scripts add initial main-thread and network cost. Deferring only the downloads preserves early event intent without delaying server-side measurement, while bounded retries prevent blocked scripts from growing browser queues indefinitely.

**How to apply:** Send all browser marketing events through the shared deferred queues, enqueue route PageView before route-specific events, and never reintroduce Google or Meta vendor URLs directly into the base HTML.