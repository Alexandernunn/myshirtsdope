---
name: Critical stylesheet loading
description: Non-blocking production CSS strategy and the race conditions it must avoid.
---

For prerendered route HTML, load the full stylesheet normally unless the visible route shell is completely covered by inline critical CSS. Do not expose unstyled prerendered markup while a deferred stylesheet is loading.

**Why:** A deferred preload can improve a synthetic first-paint metric but causes a visible flash of browser-default styling on slow mobile connections when prerendered HTML is displayed. A small render-blocking stylesheet is preferable to an unstyled storefront.

**How to apply:** Keep the generated CSS as `<link rel="stylesheet">` for prerendered pages. If deferral is reconsidered, first inline enough route-specific CSS to style every visible prerendered element and validate a cold mobile load with deliberately delayed CSS.