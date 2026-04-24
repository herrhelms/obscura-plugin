---
description: Headless-browser inspection of a live website — full-page + region screenshots, visual glitches, axe a11y, performance metrics, console/network errors. Writes a versioned report folder under .interface/.
argument-hint: <url> [your question or focus — e.g. "did the bg turn yellow?" or "what can improve conversion on this landing page?"]
allowed-tools: Bash(bash:*), Bash(node:*), Bash(mkdir:*), Bash(ls:*), Bash(cat:*), Read, Glob
---

You are running the `/ui:inspect` command from the **obscura-plugin** plugin.

## Arguments

The user invoked: `/ui:inspect $ARGUMENTS`

Parse `$ARGUMENTS` into:

1. `URL` — first whitespace-separated token. If it has no scheme, prepend `https://`.
2. `QUESTION` — everything after the URL (may be empty). This is the user's *focus question*; the final report must answer it directly.

If `URL` is missing or not a valid hostname/URL, STOP and ask the user for a URL.

## Preflight

Before running, verify the Obscura binary and the Node runtime:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/install.sh"
```

This is idempotent — it installs Node dependencies into `${CLAUDE_PLUGIN_ROOT}/.runtime/` on first run and exits quickly on subsequent runs. If the script reports that `~/.obscura/obscura` is missing, relay its error message to the user and stop.

## Execute the inspection

Invoke the driver with the parsed arguments. The driver spawns `obscura serve`, connects Playwright over CDP, runs the full sweep, and writes the report folder. It prints the final report folder path on stdout as `REPORT_PATH=<path>`.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/inspect.mjs" \
  --url "<URL>" \
  --question "<QUESTION>" \
  --cwd "$(pwd)"
```

Replace `<URL>` and `<QUESTION>` with the parsed values. If `<QUESTION>` is empty, pass `--question ""`.

## After the driver returns

1. Capture the `REPORT_PATH` from stdout.
2. Read the generated `report.md` inside that folder.
3. Invoke the `website-inspector` skill mentally (its guidance lives in `skills/website-inspector/SKILL.md`) to interpret findings and produce a final summary that **directly answers the user's question** (`<QUESTION>`) based on the report data.
4. Reply to the user with:
   - A one-sentence verdict answering their question.
   - The top 3–5 findings by severity (from `report.md`).
   - The report folder path as a clickable link: `[Open report](<REPORT_PATH>)`.
   - The full-page screenshot path: `[Full-page screenshot](<REPORT_PATH>/fullpage.png)`.

Do NOT dump the entire `report.md` into chat — link to it.

## Failure modes

- Obscura fails to start → print the error from the driver and stop. Do not fall back to plain Chrome.
- Playwright cannot connect to CDP → re-run once with `--retry-cdp`; if still failing, report and stop.
- Target URL returns non-2xx → still produce the report (the non-2xx *is* the finding) but flag it in the summary.
