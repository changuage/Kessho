#!/usr/bin/env node
// M1 UI screenshot baselines. Usage: node scripts/m1/capture-ui-baselines.mjs
// Set KESSHO_BASE_URL to use an already running dev server. Audio is never started.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = process.cwd();
const PORT = Number(process.env.KESSHO_PORT || 4198);
const outDir = resolve(root, 'docs/ui/harmony-handoff/m1-baselines');
const VIEWPORTS = [
  { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { width: 1280, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
];
const PAGES = [
  { id: 'global', label: 'Global', views: [] },
  { id: 'synth', label: 'Synth', views: ['Simple', 'Detail', 'Overview'] },
  { id: 'drums', label: 'Drums', views: ['Overview', 'Detail', 'Scatter'] },
];

async function waitForHttp(url, timeoutMs, out) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return; } catch { /* retry */ }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}\n${out()}`);
}

async function startServer() {
  if (process.env.KESSHO_BASE_URL) return { url: process.env.KESSHO_BASE_URL, stop: async () => {} };
  const url = `http://127.0.0.1:${PORT}/`;
  const cacheDir = await mkdtemp(join(tmpdir(), 'kessho-m1-vite-cache-'));
  const child = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: root,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, VITE_CACHE_DIR: cacheDir },
  });
  let output = '';
  const append = (c) => { output = `${output}${c}`.slice(-20000); };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  const exited = new Promise((r) => child.once('exit', r));
  const kill = (sig) => { try { process.kill(-child.pid, sig); } catch { try { child.kill(sig); } catch { /* gone */ } } };
  try {
    await waitForHttp(url, 120000, () => output);
  } catch (e) {
    kill('SIGKILL');
    await rm(cacheDir, { recursive: true, force: true });
    throw e;
  }
  return {
    url,
    stop: async () => {
      kill('SIGTERM');
      await Promise.race([exited, delay(1500)]);
      kill('SIGKILL');
      await rm(cacheDir, { recursive: true, force: true });
    },
  };
}

async function openPage(browser, baseUrl, vp) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.deviceScaleFactor,
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  // The app opens in the snowflake view; Advanced Mode exposes the tab bar. This does not start audio.
  await page.waitForSelector('button[title="Advanced Mode"]', { timeout: 60000 });
  await page.click('button[title="Advanced Mode"]');
  await page.waitForSelector('.app-tab-bar', { timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  return { context, page };
}

async function settle(page) {
  await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, { timeout: 15000 }).catch(() => {});
  await delay(1200);
}

const { chromium } = await import('playwright');
const server = await startServer();
const browser = await chromium.launch();
const captured = [];
const failures = [];
try {
  await mkdir(outDir, { recursive: true });
  for (const vp of VIEWPORTS) {
    const { context, page } = await openPage(browser, server.url, vp);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    for (const def of PAGES) {
      try {
        const tab = page.locator('.app-tab-bar button', { hasText: new RegExp(`^\\s*\\S*\\s*${def.label}\\s*$`) }).first();
        if (!(await tab.count())) throw new Error(`nav button "${def.label}" not found`);
        await tab.click();
        await settle(page);
        const views = def.views.length ? def.views : [null];
        for (const view of views) {
          let viewName = 'default';
          if (view) {
            const btn = page.locator('.seq-view-btn', { hasText: new RegExp(`^${view}$`) }).first();
            if (!(await btn.count())) { console.warn(`skip ${def.id}/${view}: button missing`); continue; }
            await btn.scrollIntoViewIfNeeded().catch(() => {});
            await btn.click();
            await settle(page);
            viewName = view.toLowerCase();
          }
          await page.evaluate(() => window.scrollTo(0, 0));
          const file = `${def.id}-${viewName}-${vp.width}.jpg`;
          await page.screenshot({ path: join(outDir, file), type: 'jpeg', quality: 70, fullPage: true });
          const { size } = await stat(join(outDir, file));
          captured.push({ file, page: def.label, view: viewName, width: vp.width, size });
          console.log(`captured ${file} (${(size / 1024).toFixed(0)} KB)`);
        }
      } catch (e) {
        failures.push(`${def.label} @ ${vp.width}: ${e.message}`);
      }
    }
    if (errors.length) console.warn(`page errors @ ${vp.width}: ${errors.slice(0, 3).join(' | ')}`);
    await context.close();
  }
} finally {
  await browser.close();
  await server.stop();
}

if (failures.length) {
  console.error(`Could not reach pages:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}

const date = new Date().toISOString().slice(0, 10);
const lines = [
  '# M1 UI baselines',
  '',
  `Captured ${date}. Regenerate with \`node scripts/m1/capture-ui-baselines.mjs\` (set KESSHO_BASE_URL to reuse a running dev server).`,
  '',
];
for (const c of captured) {
  lines.push(`### ${c.page}, ${c.view} view, ${c.width}px`, '', `![${c.page} ${c.view} ${c.width}](${c.file})`, '', `${c.page} page, ${c.view} view, ${c.width}px wide.`, '');
}
await writeFile(join(outDir, 'index.md'), lines.join('\n'));
const total = captured.reduce((n, c) => n + c.size, 0);
console.log(`Wrote ${captured.length} images, total ${(total / 1024).toFixed(0)} KB`);
