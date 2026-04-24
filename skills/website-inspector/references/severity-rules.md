# Severity Mapping Rules

Deterministic rules for assigning severity to findings. Apply in order — a finding gets the highest severity tier it matches.

## Critical

- Main document HTTP status in `5xx`.
- Unhandled JavaScript exception in `console.errors` (not caught/logged).
- `metrics.lcp > 6000` (ms).
- Axe violation with `impact === "critical"`.
- No `<main>` landmark and no `role="main"` in the DOM.
- Primary CTA (first `button[type=submit]` or `.cta`, `.btn-primary`) not in the viewport at any scroll position.

## High

- Main document HTTP status in `4xx`.
- ≥3 asset requests in `4xx` or `5xx`.
- Axe violation with `impact === "serious"`.
- `metrics.cls > 0.25`.
- `metrics.lcp` in `3000..6000`.
- Overlapping interactive elements (buttons/links with intersecting bounding boxes).
- Mixed content (`http://` asset on `https://` page).

## Medium

- Axe violation with `impact === "moderate"`.
- `metrics.cls` in `0.1..0.25`.
- Custom `@font-face` declared but not loaded (network 4xx on font file).
- Broken decorative `<img>` (network 4xx but `role="presentation"` or empty `alt`).
- Deprecated API usage in console warnings.
- Missing `<meta name="description">`.

## Low

- Axe violation with `impact === "minor"`.
- Missing `<meta name="theme-color">`.
- `robots.txt` or `sitemap.xml` 404.
- Non-critical deprecation warnings.
- Uncompressed text resources (no gzip/br) < 100KB.

## Ties & conflicts

If a finding matches multiple tiers, pick the highest. Example: a missing `<main>` landmark (critical rule) that also has an axe `moderate` rule associated → **critical**.

If a finding matches no rule, default to **low** and flag it in `raw.json` under `unclassified`.
