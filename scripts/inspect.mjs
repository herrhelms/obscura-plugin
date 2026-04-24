#!/usr/bin/env node
/**
 * obscura-plugin: inspect.mjs
 *
 * Spawns `~/.obscura/obscura serve` to expose a CDP endpoint, connects
 * Playwright via chromium.connectOverCDP, runs a full inspection sweep
 * (visual glitches, axe a11y, performance, console + network, DOM
 * overlays), and writes a versioned report folder under .interface/.
 *
 * Invocation:
 *   node inspect.mjs --url <url> --question <q> --cwd <dir> [--bump patch|minor|major] [--retry-cdp]
 *
 * Stdout contract (consumed by the /ui:inspect command):
 *   REPORT_PATH=<absolute path to the created folder>
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile, readdir, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, "..");
const RUNTIME_DIR = join(PLUGIN_ROOT, ".runtime");

// Resolve the Playwright + axe-core modules installed by install.sh.
async function importRuntime() {
  const nodeModules = join(RUNTIME_DIR, "node_modules");
  if (!existsSync(nodeModules)) {
    console.error(
      "[obscura-plugin] Runtime not installed. Run scripts/install.sh first."
    );
    process.exit(2);
  }
  // Dynamic import from the plugin-local node_modules.
  const playwright = await import(join(nodeModules, "playwright-core", "index.mjs"));
  const axeSource = readFileSync(
    join(nodeModules, "axe-core", "axe.min.js"),
    "utf8"
  );
  return { playwright, axeSource };
}

// ---------- arg parsing ----------

function parseArgs(argv) {
  const args = { bump: "patch", retryCdp: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") args.url = argv[++i];
    else if (a === "--question") args.question = argv[++i] ?? "";
    else if (a === "--cwd") args.cwd = argv[++i];
    else if (a === "--bump") args.bump = argv[++i];
    else if (a === "--retry-cdp") args.retryCdp = true;
    else if (a === "--viewport") args.viewport = argv[++i]; // e.g. "390x844"
  }
  if (!args.url) die("missing --url");
  if (!args.cwd) args.cwd = process.cwd();
  if (!/^https?:\/\//i.test(args.url)) args.url = "https://" + args.url;
  return args;
}

function die(msg) {
  console.error(`[obscura-plugin] ${msg}`);
  process.exit(1);
}

// ---------- folder naming ----------

function siteNameFromUrl(u) {
  const { hostname } = new URL(u);
  return hostname.replace(/^www\./, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

function hexForUrl(u) {
  // Normalize: scheme + host + pathname (ignore query/hash/trailing slash).
  const url = new URL(u);
  const norm = `${url.protocol}//${url.hostname}${url.pathname.replace(/\/$/, "")}`;
  return createHash("sha1").update(norm).digest("hex").slice(0, 6);
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function bumpSemver(current, level) {
  const [maj, min, pat] = current.split(".").map(Number);
  if (level === "major") return `${maj + 1}.0.0`;
  if (level === "minor") return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

async function nextVersion(interfaceDir, date, sitename, hex, bump) {
  if (!existsSync(interfaceDir)) return "0.1.0";
  const entries = await readdir(interfaceDir);
  const prefix = `${date}-${sitename}-${hex}-v`;
  const versions = entries
    .filter((e) => e.startsWith(prefix))
    .map((e) => e.slice(prefix.length))
    .filter((v) => /^\d+\.\d+\.\d+$/.test(v))
    .sort((a, b) => {
      const pa = a.split(".").map(Number);
      const pb = b.split(".").map(Number);
      for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
      return 0;
    });
  if (versions.length === 0) return "0.1.0";
  return bumpSemver(versions[versions.length - 1], bump);
}

// ---------- obscura serve ----------

function spawnObscura() {
  const obscuraPath = join(homedir(), ".obscura", "obscura");
  if (!existsSync(obscuraPath)) {
    die(
      `Obscura binary not found at ${obscuraPath}. Install from https://github.com/h4ckf0r0day/obscura`
    );
  }
  // `obscura serve` starts a CDP endpoint. Pass --port 0 to let it pick one,
  // then parse stdout for the ws:// URL. If --port 0 isn't supported, fall
  // back to a fixed free port.
  const port = 9222 + Math.floor(Math.random() * 500);
  const proc = spawn(obscuraPath, ["serve", "--port", String(port), "--headless"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let wsEndpoint = null;
  const ready = new Promise((resolveReady, rejectReady) => {
    const timeout = setTimeout(
      () => rejectReady(new Error("obscura serve did not become ready within 15s")),
      15000
    );
    const onData = (chunk) => {
      const s = chunk.toString();
      // Match ws://127.0.0.1:9222/devtools/browser/<uuid> or similar.
      const m = s.match(/ws:\/\/[^\s"']+/);
      if (m) {
        wsEndpoint = m[0];
        clearTimeout(timeout);
        resolveReady(wsEndpoint);
      }
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
    proc.on("exit", (code) => {
      if (!wsEndpoint) {
        clearTimeout(timeout);
        rejectReady(new Error(`obscura serve exited early with code ${code}`));
      }
    });
  });
  // Fallback: assume the HTTP endpoint exists on the chosen port.
  return { proc, ready, fallbackPort: port };
}

// ---------- inspection routines ----------

async function runInspection({ url, viewport, playwright, axeSource }, wsEndpoint) {
  const browser = await playwright.chromium.connectOverCDP(wsEndpoint);
  const context =
    browser.contexts()[0] ?? (await browser.newContext());
  const page = await context.newPage();

  const [vw, vh] = (viewport || "1440x900").split("x").map(Number);
  await page.setViewportSize({ width: vw, height: vh });

  const consoleLog = [];
  const pageErrors = [];
  const network = [];
  page.on("console", (msg) =>
    consoleLog.push({ type: msg.type(), text: msg.text(), location: msg.location() })
  );
  page.on("pageerror", (err) => pageErrors.push({ message: err.message, stack: err.stack }));
  page.on("requestfailed", (req) =>
    network.push({ url: req.url(), status: 0, failure: req.failure()?.errorText })
  );
  page.on("response", async (resp) => {
    try {
      network.push({
        url: resp.url(),
        status: resp.status(),
        resourceType: resp.request().resourceType(),
        fromCache: resp.fromServiceWorker() || (await resp.headerValue("x-cache")) || null,
      });
    } catch {}
  });

  // Navigate and measure.
  const navStart = Date.now();
  let mainStatus = null;
  const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  mainStatus = resp ? resp.status() : null;
  const navMs = Date.now() - navStart;

  // Scroll the page once top-to-bottom to force lazy-load + detect CLS.
  await page.evaluate(async () => {
    await new Promise((r) => {
      let y = 0;
      const step = 200;
      const iv = setInterval(() => {
        window.scrollBy(0, step);
        y += step;
        if (y >= document.body.scrollHeight) {
          clearInterval(iv);
          setTimeout(r, 500);
        }
      }, 80);
    });
    window.scrollTo(0, 0);
  });

  // Performance metrics via PerformanceObserver + web-vitals style manual calc.
  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] || {};
    const paints = performance.getEntriesByType("paint");
    const fcp = paints.find((p) => p.name === "first-contentful-paint")?.startTime || null;
    const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
    const lcp = lcpEntries.length ? lcpEntries[lcpEntries.length - 1].startTime : null;
    const longTasks = performance.getEntriesByType("longtask").map((t) => ({
      startTime: t.startTime,
      duration: t.duration,
    }));
    const tbt = longTasks.reduce((a, t) => a + Math.max(0, t.duration - 50), 0);
    // CLS sum.
    let cls = 0;
    performance.getEntriesByType("layout-shift").forEach((e) => {
      if (!e.hadRecentInput) cls += e.value;
    });
    return {
      ttfb: nav.responseStart ? nav.responseStart - nav.requestStart : null,
      fcp,
      lcp,
      cls,
      tbt,
      domContentLoaded: nav.domContentLoadedEventEnd || null,
      load: nav.loadEventEnd || null,
      transferSize: nav.transferSize || null,
      longTasksCount: longTasks.length,
    };
  });

  // DOM samples: headings, CTAs, forms, landmarks.
  const dom = await page.evaluate(() => {
    const txt = (el) => (el?.textContent || "").trim().slice(0, 200);
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const ctaSelectors = [
      "a.cta",
      "a.btn-primary",
      "button.cta",
      "button.btn-primary",
      "button[type=submit]",
      "a[class*='cta' i]",
      "button[class*='cta' i]",
    ].join(",");
    const cta = Array.from(document.querySelectorAll(ctaSelectors)).slice(0, 20).map((el) => ({
      tag: el.tagName.toLowerCase(),
      text: txt(el),
      rect: rect(el),
      inViewport: rect(el).y >= 0 && rect(el).y <= window.innerHeight,
    }));
    const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
      .slice(0, 30)
      .map((el) => ({ level: el.tagName, text: txt(el) }));
    const hasMain = !!document.querySelector("main, [role='main']");
    const forms = Array.from(document.querySelectorAll("form")).map((f) => ({
      id: f.id || null,
      action: f.getAttribute("action") || null,
      fields: Array.from(f.querySelectorAll("input, textarea, select")).length,
      requiredFields: Array.from(f.querySelectorAll("[required]")).length,
    }));
    // Body background for "did the bg change to yellow?" type questions.
    const bodyStyle = getComputedStyle(document.body);
    return {
      title: document.title,
      hasMain,
      lang: document.documentElement.lang || null,
      metaDescription:
        document.querySelector("meta[name='description']")?.getAttribute("content") || null,
      headings,
      ctaElements: cta,
      forms,
      computedStyles: {
        bodyBackground: bodyStyle.backgroundColor,
        bodyColor: bodyStyle.color,
        fontFamily: bodyStyle.fontFamily,
      },
    };
  });

  // Visual glitch detection.
  const glitches = await page.evaluate(() => {
    const out = { overflowingElements: [], brokenImages: [], overlaps: [] };
    // Broken images.
    Array.from(document.querySelectorAll("img")).forEach((img) => {
      if (img.complete && img.naturalWidth === 0) {
        out.brokenImages.push({
          src: img.currentSrc || img.src,
          alt: img.alt,
          selector: img.id ? `#${img.id}` : img.className ? `img.${img.className.split(" ")[0]}` : "img",
        });
      }
    });
    // Horizontal overflow on root.
    const html = document.documentElement;
    if (html.scrollWidth > html.clientWidth + 2) {
      out.overflowingElements.push({
        root: true,
        scrollWidth: html.scrollWidth,
        clientWidth: html.clientWidth,
      });
    }
    // Overlapping interactive elements (sample first 50).
    const interactive = Array.from(
      document.querySelectorAll("a, button, [role='button'], input, select, textarea")
    ).slice(0, 50);
    for (let i = 0; i < interactive.length; i++) {
      for (let j = i + 1; j < interactive.length; j++) {
        const a = interactive[i].getBoundingClientRect();
        const b = interactive[j].getBoundingClientRect();
        if (a.width === 0 || b.width === 0) continue;
        const overlap =
          a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        if (overlap) {
          out.overlaps.push({
            a: interactive[i].tagName.toLowerCase(),
            b: interactive[j].tagName.toLowerCase(),
          });
          if (out.overlaps.length >= 10) return out;
        }
      }
    }
    return out;
  });

  // DOM overlays (z-index >= 1000 elements covering viewport center).
  const overlays = await page.evaluate(() => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const stack = document.elementsFromPoint(cx, cy);
    return stack
      .filter((el) => {
        const z = parseInt(getComputedStyle(el).zIndex, 10);
        return Number.isFinite(z) && z >= 1000;
      })
      .slice(0, 5)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        className: el.className?.toString?.() || null,
        zIndex: getComputedStyle(el).zIndex,
      }));
  });

  // axe-core a11y audit.
  await page.addScriptTag({ content: axeSource });
  const a11y = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    return await axe.run(document, { resultTypes: ["violations"] });
  });

  return {
    mainStatus,
    navMs,
    consoleLog,
    pageErrors,
    network,
    metrics,
    dom,
    glitches,
    overlays,
    a11y: {
      violations: a11y.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        helpUrl: v.helpUrl,
        nodes: v.nodes.slice(0, 5).map((n) => ({
          target: n.target,
          html: n.html.slice(0, 300),
          failureSummary: n.failureSummary,
        })),
      })),
    },
    screenshots: { page, context, browser },
  };
}

// ---------- severity ----------

function classifyFindings(data) {
  const findings = [];
  const add = (severity, title, evidence) => findings.push({ severity, title, evidence });

  // Critical
  if (data.mainStatus && data.mainStatus >= 500)
    add("critical", `Main document returned ${data.mainStatus}`, { status: data.mainStatus });
  if (data.pageErrors.length)
    add("critical", `Unhandled JS exceptions: ${data.pageErrors.length}`, { sample: data.pageErrors[0] });
  if (data.metrics.lcp && data.metrics.lcp > 6000)
    add("critical", `LCP extremely slow (${Math.round(data.metrics.lcp)}ms)`, { lcp: data.metrics.lcp });
  if (!data.dom.hasMain)
    add("critical", "No <main> landmark in DOM", { hasMain: false });
  data.a11y.violations
    .filter((v) => v.impact === "critical")
    .forEach((v) => add("critical", `a11y: ${v.id}`, v));

  // High
  if (data.mainStatus && data.mainStatus >= 400 && data.mainStatus < 500)
    add("high", `Main document returned ${data.mainStatus}`, { status: data.mainStatus });
  const assetFails = data.network.filter((r) => r.status >= 400 || r.status === 0);
  if (assetFails.length >= 3)
    add("high", `${assetFails.length} asset request failures`, { sample: assetFails.slice(0, 5) });
  if (data.metrics.cls > 0.25)
    add("high", `CLS severe (${data.metrics.cls.toFixed(3)})`, { cls: data.metrics.cls });
  if (data.metrics.lcp && data.metrics.lcp >= 3000 && data.metrics.lcp <= 6000)
    add("high", `LCP slow (${Math.round(data.metrics.lcp)}ms)`, { lcp: data.metrics.lcp });
  if (data.glitches.overlaps.length)
    add("high", `Overlapping interactive elements (${data.glitches.overlaps.length})`, data.glitches.overlaps);
  data.a11y.violations
    .filter((v) => v.impact === "serious")
    .forEach((v) => add("high", `a11y: ${v.id}`, v));

  // Medium
  if (data.metrics.cls > 0.1 && data.metrics.cls <= 0.25)
    add("medium", `CLS moderate (${data.metrics.cls.toFixed(3)})`, { cls: data.metrics.cls });
  if (data.glitches.brokenImages.length)
    add("medium", `Broken images (${data.glitches.brokenImages.length})`, data.glitches.brokenImages);
  if (data.glitches.overflowingElements.length)
    add("medium", "Horizontal overflow detected", data.glitches.overflowingElements);
  if (!data.dom.metaDescription)
    add("medium", "Missing <meta name='description'>", {});
  data.a11y.violations
    .filter((v) => v.impact === "moderate")
    .forEach((v) => add("medium", `a11y: ${v.id}`, v));

  // Low
  data.a11y.violations
    .filter((v) => v.impact === "minor")
    .forEach((v) => add("low", `a11y: ${v.id}`, v));
  if (data.overlays.length)
    add("low", `DOM overlays (z-index ≥ 1000) over page center`, data.overlays);

  return findings;
}

// ---------- report writing ----------

async function writeReport(folder, meta, data, findings, question) {
  const byTier = { critical: [], high: [], medium: [], low: [] };
  for (const f of findings) byTier[f.severity].push(f);

  const fmtList = (items) =>
    items.length
      ? items
          .map((f, i) => `${i + 1}. **${f.title}**`)
          .join("\n")
      : "_none_";

  const m = data.metrics;
  const metricRow = (label, value, threshold, good) => {
    const v = value == null ? "n/a" : typeof value === "number" ? `${Math.round(value)}${label.includes("CLS") ? "" : "ms"}` : value;
    return `| ${label} | ${v} | ${threshold} | ${good} |`;
  };
  const metricStatus = (v, goodLt, okLt) =>
    v == null ? "n/a" : v < goodLt ? "good" : v < okLt ? "needs-improvement" : "poor";

  const md = `# Inspection — ${meta.sitename}

**URL**: ${meta.url}
**When**: ${meta.timestamp}
**Version**: v${meta.version}
**Viewport**: ${meta.viewport}
**User question**: ${question || "_(none)_"}

## Answer

${question ? `> Claude will fill in the direct answer to "${question}" when presenting this report. See \`raw.json\` for evidence.` : "No specific question was asked; this is a general sweep."}

## Summary

- **Critical**: ${byTier.critical.length}
- **High**: ${byTier.high.length}
- **Medium**: ${byTier.medium.length}
- **Low**: ${byTier.low.length}

## Screenshots

- Full page: \`./fullpage.png\`
- Header: \`./regions/header.png\`
- Main: \`./regions/main.png\`
- Footer: \`./regions/footer.png\`

## Findings

### Critical
${fmtList(byTier.critical)}

### High
${fmtList(byTier.high)}

### Medium
${fmtList(byTier.medium)}

### Low
${fmtList(byTier.low)}

## Metrics

| Metric | Value | Threshold | Status |
| --- | --- | --- | --- |
${metricRow("TTFB", m.ttfb, "<800ms", metricStatus(m.ttfb, 800, 1800))}
${metricRow("FCP", m.fcp, "<1800ms", metricStatus(m.fcp, 1800, 3000))}
${metricRow("LCP", m.lcp, "<2500ms", metricStatus(m.lcp, 2500, 4000))}
${metricRow("CLS", m.cls?.toFixed?.(3) ?? m.cls, "<0.1", metricStatus(m.cls, 0.1, 0.25))}
${metricRow("TBT", m.tbt, "<200ms", metricStatus(m.tbt, 200, 600))}

## Network

- Total requests: ${data.network.length}
- Failures: ${data.network.filter((r) => r.status >= 400 || r.status === 0).length}

## Console

- Errors: ${data.consoleLog.filter((c) => c.type === "error").length}
- Warnings: ${data.consoleLog.filter((c) => c.type === "warning").length}
- Page errors: ${data.pageErrors.length}

## Raw data

See \`./raw.json\`.
`;

  await writeFile(join(folder, "report.md"), md, "utf8");
}

// ---------- main ----------

async function main() {
  const args = parseArgs(process.argv);
  const { playwright, axeSource } = await importRuntime();

  const sitename = siteNameFromUrl(args.url);
  const hex = hexForUrl(args.url);
  const date = today();
  const interfaceDir = join(args.cwd, ".interface");
  const version = await nextVersion(interfaceDir, date, sitename, hex, args.bump);
  const folder = join(interfaceDir, `${date}-${sitename}-${hex}-v${version}`);
  await mkdir(join(folder, "regions"), { recursive: true });

  const meta = {
    url: args.url,
    sitename,
    hex,
    date,
    version,
    viewport: args.viewport || "1440x900",
    timestamp: new Date().toISOString(),
    obscura: join(homedir(), ".obscura", "obscura"),
  };
  await writeFile(join(folder, "meta.json"), JSON.stringify(meta, null, 2));

  // Spawn obscura serve.
  const { proc, ready, fallbackPort } = spawnObscura();
  let wsEndpoint;
  try {
    wsEndpoint = await ready;
  } catch (err) {
    proc.kill("SIGTERM");
    if (args.retryCdp) die(`obscura serve failed: ${err.message}`);
    // One retry attempt.
    await new Promise((r) => setTimeout(r, 2000));
    const retry = spawnObscura();
    try {
      wsEndpoint = await retry.ready;
    } catch (err2) {
      retry.proc.kill("SIGTERM");
      die(`obscura serve failed twice: ${err2.message}`);
    }
  }

  let data;
  try {
    data = await runInspection({ ...args, playwright, axeSource }, wsEndpoint);
  } catch (err) {
    proc.kill("SIGTERM");
    die(`inspection failed: ${err.stack || err.message}`);
  }

  // Screenshots.
  try {
    await data.screenshots.page.screenshot({
      path: join(folder, "fullpage.png"),
      fullPage: true,
    });
    // Region screenshots — only if the element exists.
    for (const region of ["header", "main", "footer"]) {
      const el = await data.screenshots.page.$(region);
      if (el) {
        await el.screenshot({ path: join(folder, "regions", `${region}.png`) });
      }
    }
    // Issue screenshots: overlapping/broken elements, flagged a11y nodes.
    let issueIdx = 0;
    for (const v of data.a11y.violations.slice(0, 10)) {
      for (const n of v.nodes.slice(0, 2)) {
        try {
          const sel = n.target[0];
          const el = await data.screenshots.page.$(sel);
          if (el) {
            issueIdx += 1;
            await el.screenshot({
              path: join(folder, "regions", `issue-${String(issueIdx).padStart(2, "0")}-${v.id}.png`),
            });
          }
        } catch {}
      }
    }
  } finally {
    await data.screenshots.browser.close().catch(() => {});
    proc.kill("SIGTERM");
  }

  // Classify + write report.
  const findings = classifyFindings(data);
  await writeFile(
    join(folder, "raw.json"),
    JSON.stringify(
      {
        meta,
        question: args.question || "",
        mainStatus: data.mainStatus,
        navMs: data.navMs,
        metrics: data.metrics,
        network: data.network,
        consoleLog: data.consoleLog,
        pageErrors: data.pageErrors,
        dom: data.dom,
        glitches: data.glitches,
        overlays: data.overlays,
        a11y: data.a11y,
        findings,
      },
      null,
      2
    )
  );
  await writeReport(folder, meta, data, findings, args.question);

  console.log(`REPORT_PATH=${folder}`);
  console.log(`VERSION=${version}`);
  console.log(
    `FINDINGS critical=${findings.filter((f) => f.severity === "critical").length} high=${findings.filter((f) => f.severity === "high").length} medium=${findings.filter((f) => f.severity === "medium").length} low=${findings.filter((f) => f.severity === "low").length}`
  );
}

main().catch((err) => {
  console.error("[obscura-plugin] fatal:", err.stack || err.message);
  process.exit(1);
});
