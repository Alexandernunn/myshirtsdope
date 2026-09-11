---
name: Portable npm lockfiles
description: Keep npm lockfiles deployable outside Replit's private package mirror.
---

Generate the npm lockfile without registry-specific `resolved` URLs when the same repository builds on Netlify or another external CI provider.

**Why:** Replit package installation can write `package-firewall.replit.internal` tarball URLs into the lockfile. External builders cannot resolve that private hostname and fail during dependency installation before the application build starts.

**How to apply:** After dependency changes, confirm the lockfile contains no Replit-internal hosts and validate with a clean locked install against the public npm registry.