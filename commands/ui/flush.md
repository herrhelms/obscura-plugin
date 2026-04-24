---
description: Delete all .interface/ report folders for a given date (Cypress-style cleanup). Safely removes YYYY-MM-DD-* entries after a preview + confirmation.
argument-hint: <YYYY-MM-DD | "all" | "older-than:N">
allowed-tools: Bash(bash:*), Bash(node:*), Bash(find:*), Bash(ls:*), Read
---

You are running the `/ui:flush` command from the **obscura-plugin** plugin.

## Arguments

The user invoked: `/ui:flush $ARGUMENTS`

Parse `$ARGUMENTS`:

- `YYYY-MM-DD` (e.g. `2026-04-24`) — flush only folders matching that date prefix.
- `all` — flush every folder under `.interface/`.
- `older-than:N` — flush folders whose date prefix is older than N days from today.

If `$ARGUMENTS` is empty or unparseable, ask the user which mode they want.

## Preview

Always preview before deleting. Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/flush.mjs" --mode "<MODE>" --value "<VALUE>" --cwd "$(pwd)" --dry-run
```

Where `<MODE>` is one of `date`, `all`, `older-than` and `<VALUE>` is the parsed argument (`YYYY-MM-DD`, empty, or `N`).

The script prints the matching folders and their total size. If the list is empty, report that and stop.

## Confirm

Show the user the list of folders that would be deleted and their combined size. Ask: **"Delete these N folders (XX MB)? (yes/no)"**

Wait for explicit `yes`. Anything else → abort.

## Execute

Only on explicit `yes`, rerun without `--dry-run`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/flush.mjs" --mode "<MODE>" --value "<VALUE>" --cwd "$(pwd)"
```

Report the number of folders deleted and space reclaimed.
