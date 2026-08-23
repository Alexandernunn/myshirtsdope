---
name: Critical stylesheet loading
description: Non-blocking production CSS strategy and the race conditions it must avoid.
---

Inline only the small dark first-paint shell. Preload the generated full stylesheet, then activate it from the self-hosted entry module only after the preload completes; retain a normal stylesheet inside `<noscript>`.

**Why:** An inline `onload` swap couples styling to permissive script CSP. Switching a still-downloading preload to `rel="stylesheet"` can reintroduce render blocking. The entry module must also handle the race where the preload finishes before its listener is attached.

**How to apply:** Mark generated CSS preloads with a data attribute, attach a one-shot load listener in the entry module, use completed same-origin resource timing as the fast-cache check, and reuse the same link so activation does not cause a second request. Validate with deliberately delayed CSS.