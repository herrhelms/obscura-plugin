# Conversion Review Heuristics

When the user asks "what can improve conversion on this landing page?" or similar, walk through the page with this checklist, using the inspection data as evidence.

## Above-the-fold (regions/main.png top 100vh crop)

- **Value proposition in first 2 seconds**: is there an H1 within the initial viewport? Extract from `dom.headings[0]`. If it's missing, vague, or below the fold, that's a high-priority finding.
- **Primary CTA visible**: count `dom.ctaElements` with `inViewport === true`. If zero, critical conversion blocker.
- **CTA contrast**: check `a11y.violations` for `color-contrast` on button elements. Low-contrast CTAs directly reduce click-through.
- **Hero image weight**: `network` entries where `resourceType === "image"` and `transferSize > 500KB` above the fold — these delay LCP and push CTA below the fold on slow connections.

## Trust signals

- Social proof (logos, testimonials, reviews, star ratings) — grep `dom.textContent` for patterns like "customers", "reviews", star glyphs.
- Security indicators on forms: HTTPS icon, trust badges near payment/email inputs.
- About/team links present in nav or footer.

## Friction

- **Form fields**: `dom.forms[].fields.length` — every extra required field drops conversion ~5-10%. Flag any form with >4 required fields.
- **Popup modals / cookie banners covering CTAs**: check `overlays` for elements with `z-index >= 1000` intersecting CTAs.
- **Slow LCP blocks engagement**: `metrics.lcp > 2500` is a known conversion drag.
- **CLS during interaction**: `metrics.cls > 0.1` causes mis-clicks.

## Mobile considerations

Unless the user specified a viewport, the driver runs at 1440×900 desktop. If the question mentions mobile or the site looks responsive, recommend re-running at 390×844 (iPhone 13) and compare.

## Output format for conversion questions

1. **Verdict**: "Top 3 conversion blockers are: [a], [b], [c]." — be specific.
2. **Evidence per blocker**: screenshot reference + metric + recommendation.
3. **Quick wins** (< 1 hour dev work) vs **structural changes** (needs design review) — separate buckets.
4. Cite the region screenshot that shows each issue.

Never recommend generic advice ("add more CTAs", "improve copy") without pointing at specific evidence from the report.
