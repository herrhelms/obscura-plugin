# report.md Template

The driver writes this file automatically. This is the canonical structure. If you're regenerating or editing one, follow this shape.

```markdown
# Inspection — <SITENAME>

**URL**: <full URL>
**When**: <ISO timestamp>
**Version**: <vX.Y.Z>
**Viewport**: <width>×<height>
**Obscura**: <obscura --version output>
**User question**: <QUESTION or "—">

## Answer

<One-paragraph direct response to the user's question. If no question, a one-paragraph overall verdict.>

## Summary

- **Critical**: N
- **High**: N
- **Medium**: N
- **Low**: N

## Screenshots

- Full page: `./fullpage.png`
- Header: `./regions/header.png`
- Main: `./regions/main.png`
- Footer: `./regions/footer.png`

## Findings

### Critical

1. **<short title>** — <one-line description>. Evidence: <selector or log excerpt>. See `./regions/issue-01.png`.
...

### High
...

### Medium
...

### Low
...

## Metrics

| Metric        | Value   | Threshold | Status        |
| ------------- | ------- | --------- | ------------- |
| LCP           | 2.1s    | <2.5s     | good          |
| CLS           | 0.08    | <0.1      | good          |
| TBT           | 120ms   | <200ms    | good          |
| FCP           | 0.9s    | <1.8s     | good          |
| TTFB          | 180ms   | <800ms    | good          |

## Network

- Total requests: N
- Failures: N (listed below)
- Total transfer: <size>

## Console

- Errors: N
- Warnings: N
- Infos: <collapsed>

## Recommendations

1. <specific, actionable, cites evidence>
2. ...

## Raw data

See `./raw.json` for machine-readable output.
```

## Style rules

- Use **short imperatives** in recommendations ("Add `alt` to hero image", not "You might want to consider…").
- Cite selectors and rule ids verbatim — never paraphrase them.
- If a finding references a screenshot, link the exact filename under `regions/`.
