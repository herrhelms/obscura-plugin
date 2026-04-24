#!/usr/bin/env node
/**
 * obscura-plugin: flush.mjs
 *
 * Safely deletes .interface/YYYY-MM-DD-* folders. Three modes:
 *   --mode date --value 2026-04-24
 *   --mode all
 *   --mode older-than --value 7
 *
 * Use --dry-run to preview. Without --dry-run, deletes and reports
 * folders removed + bytes reclaimed.
 */

import { readdir, stat, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

function parseArgs(argv) {
  const args = { dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--mode") args.mode = argv[++i];
    else if (a === "--value") args.value = argv[++i];
    else if (a === "--cwd") args.cwd = argv[++i];
    else if (a === "--dry-run") args.dryRun = true;
  }
  if (!args.cwd) args.cwd = process.cwd();
  if (!args.mode) die("missing --mode");
  return args;
}

function die(msg) {
  console.error(`[obscura-plugin flush] ${msg}`);
  process.exit(1);
}

async function dirSize(p) {
  let total = 0;
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else {
        const s = await stat(full);
        total += s.size;
      }
    }
  }
  await walk(p);
  return total;
}

function humanBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

function parseFolderDate(name) {
  const m = name.match(/^(\d{4})-(\d{2})-(\d{2})-/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

async function selectFolders(interfaceDir, mode, value) {
  if (!existsSync(interfaceDir)) return [];
  const entries = await readdir(interfaceDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  if (mode === "all") return dirs;

  if (mode === "date") {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value))
      die(`--mode date needs --value YYYY-MM-DD, got "${value}"`);
    return dirs.filter((d) => d.startsWith(`${value}-`));
  }

  if (mode === "older-than") {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) die(`--mode older-than needs --value N (days)`);
    const cutoff = Date.now() - n * 24 * 60 * 60 * 1000;
    return dirs.filter((d) => {
      const dt = parseFolderDate(d);
      return dt && dt.getTime() < cutoff;
    });
  }

  die(`unknown mode "${mode}"`);
}

async function main() {
  const args = parseArgs(process.argv);
  const interfaceDir = resolve(args.cwd, ".interface");

  const folders = await selectFolders(interfaceDir, args.mode, args.value);
  if (folders.length === 0) {
    console.log("No matching folders.");
    return;
  }

  // Size each folder.
  const sized = [];
  let total = 0;
  for (const f of folders) {
    const full = join(interfaceDir, f);
    const size = await dirSize(full).catch(() => 0);
    sized.push({ name: f, full, size });
    total += size;
  }

  console.log(`Matched ${sized.length} folder(s), total ${humanBytes(total)}:`);
  for (const s of sized) {
    console.log(`  ${s.name}  (${humanBytes(s.size)})`);
  }

  if (args.dryRun) {
    console.log("\n(dry run — nothing deleted)");
    return;
  }

  // Delete.
  let deleted = 0;
  for (const s of sized) {
    try {
      await rm(s.full, { recursive: true, force: true });
      deleted += 1;
    } catch (err) {
      console.error(`  failed: ${s.name} (${err.message})`);
    }
  }
  console.log(`\nDeleted ${deleted} folder(s), reclaimed ${humanBytes(total)}.`);
}

main().catch((err) => {
  console.error("[obscura-plugin flush] fatal:", err.stack || err.message);
  process.exit(1);
});
