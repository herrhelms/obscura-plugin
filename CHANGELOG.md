# Changelog

All notable changes to the **obscura-plugin** plugin. Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-04-24

### Added
- `/ui:inspect <url> [question]` — headless-browser sweep via Obscura + Playwright over CDP.
- `/ui:flush <date|all|older-than:N>` — Cypress-style cleanup of `.interface/` folders with preview + confirmation.
- `website-inspector` skill with references for conversion review, cross-version diff, severity rules, and the report template.
- Auto-incrementing patch versioning: `vX.Y.Z` on repeated runs for the same (date, site, url-hash).
- Report folder structure: `report.md`, `raw.json`, `meta.json`, `fullpage.png`, `regions/*.png`.
- Default checks: visual glitches, axe-core a11y, performance metrics (TTFB/FCP/LCP/CLS/TBT), console + network errors, DOM overlays.
- Plugin-local runtime bootstrap (`.runtime/`) via `scripts/install.sh` — no global npm pollution.
