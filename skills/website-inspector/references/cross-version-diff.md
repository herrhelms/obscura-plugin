# Cross-Version Diff Methodology

When two or more inspection folders exist for the same `YYYY-MM-DD-SITENAME-HEX` prefix, produce a diff.

## Identification

The `HEX` portion of the folder name is a stable hash of the normalized URL. Same HEX = same target. Versions are auto-incremented on the patch digit: `v0.1.0`, `v0.1.1`, `v0.1.2`, …

The user can manually bump the minor/major by passing `--bump minor|major` to the driver — the skill should respect whatever sequence exists on disk.

## Load order

Always load versions in ascending semver order. The **later** version is the "current" state; the **earlier** version is the baseline.

## Diff dimensions

### a11y violations

- Key each violation by `rule.id` + the CSS selector of the affected node.
- `fixed` = in baseline, not in current.
- `new` = in current, not in baseline.
- `persisted` = in both.

### Console + network

- Console messages keyed by `(level, text[0..120])`.
- Network failures keyed by `(url, status)`.
- Same fixed/new/persisted logic.

### Metrics deltas

Show absolute and % change for: `lcp`, `cls`, `tbt`, `fcp`, `ttfb`, `transferSize`.

Flag any metric that:

- Regressed by > 10%.
- Crossed a threshold (e.g. CLS went from 0.09 → 0.12 — moved from "good" to "needs improvement").

### Visual diff

Do not attempt pixel diffing unless the user asks. Instead, compare the `dom.computedStyles` of any flagged elements between versions to tell the user *what* changed, e.g. "`body` background-color: `rgb(255,255,255)` → `rgb(255,255,0)`".

## Output shape

```
## v0.1.0 → v0.1.1

**Fixed (3)**
- color-contrast on `a.cta-primary`
- 404 on /static/hero.webp
- LCP 4.2s → 2.1s ✓

**New (1)**
- cls value 0.04 → 0.18 on scroll (layout shift from late-loaded ad slot)

**Unchanged (5)**
- <collapsed>
```

If no diff is meaningful (identical findings), say so concisely.
