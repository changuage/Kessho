#!/usr/bin/env node
// M1 UI screenshot baselines. Usage: node scripts/m1/capture-ui-baselines.mjs
// Set KESSHO_BASE_URL to use an already running dev server. Audio is never started.
// KESSHO_SCREENSHOT_DIR overrides the output folder (default: the M1 baselines).
// KESSHO_NOTES_EDITOR=1 also opens the Synth Detail view's first Notes cell and captures the editor.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = process.cwd();
const PORT = Number(process.env.KESSHO_PORT || 4198);
const outDir = resolve(root, process.env.KESSHO_SCREENSHOT_DIR || 'docs/ui/harmony-handoff/m1-baselines');
// KESSHO_PROGRESSION_EDITOR=1 also edits a progression event in Global's Harmony Overview (Auto to Chord,
// Save to the Palette) and captures the card, then the Synth Notes cell editor with the Palette row.
const captureProgressionEditor = process.env.KESSHO_PROGRESSION_EDITOR === '1';
const captureNotesEditor = process.env.KESSHO_NOTES_EDITOR === '1';
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

async function shoot(page, vp, name, locator) {
  const file = `${name}-${vp.width}.jpg`;
  const options = { path: join(outDir, file), type: 'jpeg', quality: 80 };
  if (locator) await locator.screenshot(options); else await page.screenshot({ ...options, fullPage: true });
  console.log(`captured ${file}`);
  return file;
}

// Select the first Notes cell and capture the inline editor: a Follow chord, the same
// chord pinned to Fixed, the lane settings and the trigger lane's cell labels.
async function captureNotesEditorStates(page, vp) {
  const lane = page.locator('[data-testid="notes-lane"]').first();
  await lane.scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: /^Notes cell 1,/ }).click();
  await page.getByRole('group', { name: 'Cell kind' }).getByRole('button', { name: 'Chord', exact: true }).click();
  await delay(300);
  await shoot(page, vp, 'synth-detail-notes-editor-follow');
  await shoot(page, vp, 'synth-notes-lane-follow', lane);
  await page.getByRole('group', { name: 'Chord behaviour' }).getByRole('button', { name: 'Fixed', exact: true }).click();
  await delay(300);
  await shoot(page, vp, 'synth-notes-lane-fixed', lane);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await delay(300);
  await shoot(page, vp, 'synth-notes-lane-settings', lane);
  await shoot(page, vp, 'synth-trigger-lane-labels', page.locator('.seq-trigger-always').first());
}

async function captureProgressionEditorStates(page, vp) {
  const overview = page.getByRole('tab', { name: 'Overview', exact: true }).first();
  await overview.scrollIntoViewIfNeeded();
  await overview.click();
  await delay(400);
  const surface = page.locator('.harmony-overview-surface').first();
  await surface.waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'Add event' }).click();
  await page.getByRole('button', { name: /^Select E2,/ }).click();
  await page.getByRole('combobox', { name: 'E2 chord source' }).selectOption('chord');
  await delay(300);
  await page.getByRole('group', { name: 'Degree' }).getByRole('button').nth(4).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: /^Palette chord/ }).first().click();
  await delay(300);
  await surface.scrollIntoViewIfNeeded();
  await shoot(page, vp, 'global-harmony-progression-editor', surface);
  await shoot(page, vp, 'global-harmony-card-progression-editor');
}

async function captureNotesPalette(page, vp) {
  const lane = page.locator('[data-testid="notes-lane"]').first();
  await lane.scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: /^Notes cell 2,/ }).click();
  await page.getByRole('group', { name: 'Cell kind' }).getByRole('button', { name: 'Chord', exact: true }).click();
  await page.getByRole('button', { name: /^Palette chord/ }).first().click();
  await delay(300);
  await shoot(page, vp, 'synth-notes-editor-palette', lane);
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
          if (captureProgressionEditor && def.id === 'global') {
            try { await captureProgressionEditorStates(page, vp); } catch (e) { failures.push(`Progression editor @ ${vp.width}: ${e.message}`); }
          }
          await page.evaluate(() => window.scrollTo(0, 0));
          const file = `${def.id}-${viewName}-${vp.width}.jpg`;
          await page.screenshot({ path: join(outDir, file), type: 'jpeg', quality: 70, fullPage: true });
          const { size } = await stat(join(outDir, file));
          captured.push({ file, page: def.label, view: viewName, width: vp.width, size });
          console.log(`captured ${file} (${(size / 1024).toFixed(0)} KB)`);
          if (captureProgressionEditor && def.id === 'synth' && view === 'Detail') {
            try { await captureNotesPalette(page, vp); } catch (e) { failures.push(`Notes Palette @ ${vp.width}: ${e.message}`); }
          }
          if (captureNotesEditor && def.id === 'synth' && view === 'Detail') {
            try { await captureNotesEditorStates(page, vp); } catch (e) { failures.push(`Notes editor @ ${vp.width}: ${e.message}`); }
          }
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
