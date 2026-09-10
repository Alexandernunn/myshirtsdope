---
name: Catalog build entrypoint
description: Records why the Netlify catalog build uses an isolated builder instead of the legacy cache script.
---

Use the isolated catalog build entrypoint configured in the package scripts. The legacy cache script was repaired to one program copy, but it remains outside the production build path.

**Why:** The merged baseline contained many concatenated copies of the legacy cache program. Replacing that file directly appeared successful, but the duplicated baseline content returned during the build and caused repeated-declaration transform failures.

**How to apply:** Extend the configured isolated builder for catalog fields and prerender inputs. If merge reconciliation touches the legacy cache script, confirm it still contains exactly one program copy before using or committing it.