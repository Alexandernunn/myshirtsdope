---
name: Critical stylesheet loading
description: Non-blocking production CSS strategy and the race conditions it must avoid.
---

For prerendered route HTML, load the full stylesheet normally unless the visible route shell is completely covered by inline critical CSS. The current storefront meets that condition: it delivers a compact critical shell immediately, preloads the complete stylesheet without making it render-blocking, and retains a no-JavaScript stylesheet fallback.

**Why:** A deferred preload can improve a synthetic first-paint metric but causes a visible flash of browser-default styling on slow mobile connections when prerendered HTML is displayed. The critical layer prevents that flash while removing the full bundle from the render-blocking path.

**How to apply:** When changing the first viewport of the home, shop, or product pages, update the critical layer at the same time. Keep the preload-to-stylesheet handoff and no-script fallback intact, then validate both normal cold mobile loads and an intentionally delayed full-stylesheet load before shipping.