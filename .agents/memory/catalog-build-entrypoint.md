---
name: Catalog build entrypoint
description: Records why the Netlify catalog build uses an isolated builder instead of the legacy cache script.
---

Use the isolated catalog build entrypoint configured in the package scripts. Do not switch Netlify back to the legacy cache script without first confirming that file contains only one program copy.

**Why:** The merged baseline contained many concatenated copies of the legacy cache program. Replacing that file directly appeared successful, but the duplicated baseline content returned during the build and caused repeated-declaration transform failures.

**How to apply:** Extend the configured isolated builder for catalog fields and prerender inputs. Treat the legacy cache script as unsafe until its duplicate-content history can be removed without being restored by reconciliation.