---
name: Marketing script deferral
description: Decision for balancing initial-load performance with reliable Google and Meta event tracking.
---

Queue Google and Meta browser commands immediately. Meta must load automatically about 1–2 seconds after `load` (or sooner on interaction), while Google may wait for interaction or a longer fallback. Keep Meta Conversions API requests immediate, initialize the first-party `fbp` before sending them, persist `fbc` from `fbclid` when `_fbc` is absent, and preserve the same event ID for browser/server deduplication.

**Why:** Eager vendor scripts add initial main-thread and network cost, but delaying Meta for many seconds loses landing-page and ViewContent coverage from short ad visits. Immediate CAPI events otherwise run before Pixel creates `_fbp`, and CAPI cannot reliably attribute ad visits unless it can connect `fbclid` to `_fbc`.

**How to apply:** Send browser events through the shared queues, enqueue PageView before route-specific events, keep Meta and Google load timers separate, and treat missing CAPI credentials or rejected events as readiness failures rather than successful no-ops.