---
name: website-inspector
description: Interpret obscura-plugin inspection reports. Use when the user asks about site glitches, UI regressions, accessibility problems, performance issues, conversion blockers, or any follow-up on a `/ui:inspect` run. Triggers include "what's wrong with this page", "why is this slow", "compare v0.1.0 and v0.1.1", "did X actually change", "improve conversion on <page>".
---

# Website Inspector

This skill turns raw inspection data (console logs, network events, axe violations, performance metrics, DOM snapshots, overlay detection, screenshots) into a **direct answer to the user's question** plus an actionable report.

## When this skill applies

- Right after `/ui:inspect` finishes — synthesize the data in `raw.json` and `report.md` into a focused answer.
- Comparing two runs of the same domain on the same day: `v0.1.0` vs `v0.1.1` — diff the findings, call out what got fixed and what regressed.
- Reading a saved report folder the user points at: `.interface/2026-04-24-example-com-a1b2c3-v0.1.0/`.

## Inputs you work from

Every inspection produces a folder at `.interface/YYYY-MM-DD-SITENAME-HEX-vX.Y.Z/` containing:

| File                      | Contents                                                                  |
| ------------------------- | ------------------------------------------------------------------------- |
| `report.md`               | Human-readable report: summary, findings by severity, recommendations.    |
| `raw.json`                | Machine-readable: console, network, axe violations, metrics, DOM samples. |
| `fullpage.png`            | Full scrolled-page screenshot.                                            |
| `regions/header.png`      | Header region screenshot (if `<header>` detected).                        |
| `regions/main.png`        | Main content region screenshot.                                           |
| `regions/footer.png`      | Footer region screenshot (if `<footer>` detected).                        |
| `regions/issue-*.png`     | Bounding-box screenshot of each element flagged as problematic.           |
| `meta.json`               | URL, timestamp, viewport, user-agent, git-style SHA of the DOM.           |

Load `raw.json` first — it's the ground truth. `report.md` is a pre-written summary; treat it as a starting draft, not gospel.

## Severity taxonomy

When ranking findings, use this scale consistently across all reports:

- **critical** — page is broken for the user: unhandled JS exception, 5xx on the main document, a11y blocker (e.g., no `<main>`, empty `alt` on a CTA image), LCP > 6s.
- **high** — significant degradation: multiple 4xx on assets, overlapping interactive elements, axe serious/critical violations, CLS > 0.25.
- **medium** — noticeable but non-blocking: mixed content warnings, unloaded custom fonts, axe moderate violations, LCP 3–6s.
- **low** — polish: axe minor violations, deprecated API warnings, missing `meta description`, single broken decorative image.

## Answering the user's question

The user's `<QUESTION>` (passed to `/ui:inspect`) is the most important thing. Always lead with a direct answer before the findings.

Question-to-evidence mapping:

| Question shape                                         | Load from `raw.json`                                 | Answer form                                                                     |
| ------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| "Did X change?" (visual)                               | `dom.computedStyles` for the element + `fullpage.png` screenshot crop | "Yes — `body` background is now `rgb(255, 255, 0)` (previously `rgb(255,255,255)` in v0.1.0)." |
| "Why is this slow?"                                    | `metrics`, `network` slowest 5, `longTasks`          | Rank bottlenecks by contribution to LCP/TBT.                                    |
| "What could improve conversion?"                       | `dom.ctaElements`, `a11y`, `metrics.cls`, `regions/` | Conversion-focused review — see `references/conversion-review.md`.              |
| "Any glitches?"                                        | `visualGlitches`, `overlays`, `network` failures     | Ordered list by severity with screenshot references.                            |
| "Is it accessible?"                                    | `a11y.violations`                                    | Axe summary grouped by impact + WCAG rule.                                      |
| "Did the fix work?" (repeated run on same domain/date) | diff current `raw.json` against the previous v       | "Fixed: N. New regressions: M. Unchanged: K." with per-issue list.              |

If the question is vague or missing, default to a severity-ordered tour: critical → high → medium → low.

## Output shape

When replying in chat, structure as:

1. **Verdict** — one sentence answering the user's question.
2. **Evidence** — 2–3 bullets with specific data points (computed style, metric value, axe rule id, network status). Reference the screenshot paths inline.
3. **Top findings** — 3–5 items ranked by severity; each ≤ 2 lines.
4. **Links** — the report folder, `fullpage.png`, and the most relevant region screenshot.

Never paste `report.md` verbatim — it already exists at the linked path. Summarize.

## Cross-version comparison

When the user asks "compare v0.1.0 and v0.1.1" (or the driver auto-increments on a second run):

1. Glob `.interface/YYYY-MM-DD-SITENAME-HEX-v*` for the same date + hex prefix.
2. Load `raw.json` from each.
3. Produce a diff table: fixed, new, unchanged, regressed.
4. Call out metric deltas (LCP −420ms, CLS +0.08, etc.) with arrows.

Detailed diff methodology is in `references/cross-version-diff.md`.

## Writing the report.md (when the driver asks)

The driver shells out to generate a draft report — if you're asked to fill in the narrative sections, follow the template in `references/report-template.md`. Keep it factual, cite evidence, avoid hedging language ("might", "possibly") unless evidence is genuinely ambiguous.

## Reference files

- `references/conversion-review.md` — heuristics for landing-page conversion analysis.
- `references/cross-version-diff.md` — how to diff two inspections.
- `references/report-template.md` — canonical structure for `report.md`.
- `references/severity-rules.md` — mapping specific findings to the severity taxonomy.
