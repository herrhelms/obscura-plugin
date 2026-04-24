# obscura-plugin

A Claude Code / Cowork plugin that drives the [Obscura](https://github.com/h4ckf0r0day/obscura) headless browser to inspect a live website, hunt for glitches and regressions, and return a versioned report folder that answers your specific question.

## What it does

Give it a URL and (optionally) a focus question like *"did the background turn yellow?"* or *"what can improve conversion on this landing page?"*. The plugin:

1. Spawns `~/.obscura/obscura serve` to expose a Chrome DevTools Protocol endpoint.
2. Connects Playwright over CDP, navigates the page, scrolls it top-to-bottom to trigger lazy-loads, and measures CLS.
3. Runs a full sweep:
   - **Console + network** — JS errors, page errors, 4xx/5xx responses, failed requests, mixed content.
   - **Visual glitches** — broken images, horizontal overflow, overlapping interactive elements.
   - **Accessibility** — axe-core injected into the page, violations grouped by impact.
   - **Performance** — TTFB, FCP, LCP, CLS, TBT, long tasks.
   - **DOM overlays** — high z-index elements covering the page center (modals, cookie banners).
4. Captures a full-page screenshot, plus per-region screenshots for `<header>`, `<main>`, `<footer>`, and bounding-box shots of flagged elements.
5. Writes everything to `.interface/YYYY-MM-DD-SITENAME-HEX-vX.Y.Z/`.

## Commands

| Command | Purpose |
| --- | --- |
| `/ui:inspect <url> [question]` | Run the inspection. The question shapes the final summary. |
| `/ui:flush <YYYY-MM-DD \| all \| older-than:N>` | Remove `.interface/` folders to reclaim disk. Previews before deleting. |

## Versioning

The folder name ends with `vX.Y.Z`. On each repeated run for the same (date, site, url-hash), the patch digit auto-increments:

- First run today on `https://example.com` → `2026-04-24-example-com-a1b2c3-v0.1.0/`
- Second run same day, same URL → `…-v0.1.1/`
- Third run → `…-v0.1.2/`

You can bump the minor or major segment by passing `--bump minor|major` to the underlying driver. Two runs = instant visual + data diff so you can see what actually changed (see the `website-inspector` skill).

## Report folder contents

```
.interface/2026-04-24-example-com-a1b2c3-v0.1.0/
├── report.md          # Human-readable report
├── raw.json           # Machine-readable data (console, network, a11y, metrics, DOM)
├── meta.json          # URL, timestamp, viewport, Obscura version
├── fullpage.png       # Full scrolled-page screenshot
└── regions/
    ├── header.png
    ├── main.png
    ├── footer.png
    ├── issue-01-color-contrast.png
    ├── issue-02-image-alt.png
    └── ...
```

## Requirements

- **Obscura** at `~/.obscura/obscura` (executable). Install from [h4ckf0r0day/obscura](https://github.com/h4ckf0r0day/obscura). Override with `OBSCURA_BIN=/path/to/obscura` if installed elsewhere.
- **Node.js 18+** on `PATH`.
- **npm** (or pnpm/yarn) for first-run dependency install.

The first run of `/ui:inspect` will bootstrap `playwright-core` and `axe-core` into `.runtime/` inside the plugin directory — no global installs.

## Installation

### As a Cowork `.plugin` file

Double-click `obscura-plugin.plugin` — Cowork will install it into your plugins directory.

### As a git-based plugin

```bash
git clone https://github.com/herrhelms/obscura-plugin ~/.claude/plugins/obscura-plugin
```

Then Cowork / Claude Code auto-discovers it on next launch.

## Skill

The plugin ships with a `website-inspector` skill that activates on phrases like *"what's wrong with this page"*, *"compare v0.1.0 and v0.1.1"*, *"why is this slow"*, *"improve conversion on X"*. It loads the relevant `raw.json` and cross-references it against severity rules and the user's question.

See `skills/website-inspector/references/` for the methodology docs (conversion review, cross-version diff, severity mapping, report template).

## Design decisions

- **CDP over scripted `fetch`** — full click/scroll/screenshot parity with Puppeteer/Playwright is worth the extra moving part (spawning `obscura serve`).
- **Plugin-local runtime** (`.runtime/`) — no global npm pollution; users can delete the plugin and everything goes with it.
- **Auto-increment patch versioning** — lets you re-run repeatedly without thinking about naming, while preserving history for diffs.
- **`.interface/` at repo root** — mirrors how Cypress writes to `cypress/screenshots/`, so users can `.gitignore` it trivially.

## License

MIT — see [LICENSE](./LICENSE).
## 