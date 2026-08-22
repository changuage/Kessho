import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const OUT = path.resolve('promo-capture-v3-artifacts');
const VIDEO_DIR = path.join(OUT, 'video');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(VIDEO_DIR, { recursive: true });
const logs = [];
const timeline = [];
const t0 = Date.now();
const sleep = (page, ms) => page.waitForTimeout(ms);
const mark = (name) => { const ms = Date.now() - t0; timeline.push({ name, ms }); logs.push(`[mark] ${name} ${ms}`); };

async function extractDynamicPreset() {
  let manifest = null;
  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'],
  });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  page.on('response', async (response) => {
    if (!/kessho_get_preset_latest_manifest_v2/i.test(response.url())) return;
    try {
      const text = await response.text();
      if (/STring Waves Dynamics TEst|String Waves Dynamic/i.test(text)) manifest = JSON.parse(text);
    } catch {}
  });
  try {
    await page.goto('https://kessho.vercel.app/', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await sleep(page, 14000);
    await page.locator('button[title="Presets"]').first().click();
    const dialog = page.getByRole('dialog', { name: 'Snowflake preset loader' });
    await dialog.waitFor({ state: 'visible' });
    await dialog.getByPlaceholder('Search').fill('String Waves Dynamic');
    await sleep(page, 1000);
    const loadButtons = dialog.locator('button[title^="Load "]');
    let loaded = false;
    for (let i = 0; i < await loadButtons.count(); i++) {
      const b = loadButtons.nth(i);
      if (!(await b.isVisible().catch(() => false))) continue;
      const title = await b.getAttribute('title');
      if (/string waves dynamic/i.test(title || '')) {
        logs.push(`[preset-extract] production primary=${title}`);
        await b.click();
        loaded = true;
        break;
      }
    }
    if (!loaded) throw new Error('Production Dynamic preset load control not found');
    await sleep(page, 4500);
    const storage = await page.evaluate(() => ({ ...localStorage }));
    const presetName = manifest?.preset?.name || 'STring Waves Dynamics TEst';
    const resolvedHash = manifest?.preset?.latest_resolved_hash || manifest?.latest_version?.resolved_hash;
    const metadataHash = manifest?.preset?.latest_metadata_hash || manifest?.latest_version?.metadata_hash;
    let statePayload = null;
    let metadataPayload = null;
    if (resolvedHash) {
      const raw = storage[`kessho:presetPayload:v2:${resolvedHash}`];
      if (raw) statePayload = JSON.parse(raw).payload;
    }
    if (metadataHash) {
      const raw = storage[`kessho:presetPayload:v2:${metadataHash}`];
      if (raw) metadataPayload = JSON.parse(raw).payload;
    }
    if (!statePayload || !metadataPayload) {
      for (const [key, raw] of Object.entries(storage)) {
        if (!key.startsWith('kessho:presetPayload:v2:')) continue;
        try {
          const payload = JSON.parse(raw).payload;
          if (!metadataPayload && payload && typeof payload === 'object' && payload.dualRanges && payload.sliderModes) metadataPayload = payload;
          if (!statePayload && payload && typeof payload === 'object' && Object.keys(payload).length > 700 && ('synthEuclid1Enabled' in payload || 'granularEnabled' in payload)) statePayload = payload;
        } catch {}
      }
    }
    if (!statePayload || !metadataPayload) throw new Error(`Could not resolve production preset payloads; resolved=${resolvedHash} metadata=${metadataHash}`);
    const bundled = {
      id: manifest?.preset?.id || 'promo-string-waves-dynamic',
      name: 'String Waves Dynamic',
      timestamp: manifest?.preset?.updated_at || new Date().toISOString(),
      state: statePayload,
      ...metadataPayload,
    };
    fs.writeFileSync('public/presets/StringWavesDynamicPromo.json', JSON.stringify(bundled, null, 2));
    const manifestPath = 'public/presets/manifest.json';
    const bundledManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    bundledManifest.files = Array.from(new Set([...(bundledManifest.files || []), 'StringWavesDynamicPromo.json']));
    fs.writeFileSync(manifestPath, JSON.stringify(bundledManifest, null, 2) + '\n');
    fs.writeFileSync(path.join(OUT, 'extracted-preset-summary.json'), JSON.stringify({ presetName, resolvedHash, metadataHash, stateKeys: Object.keys(statePayload).length, sliderModes: Object.keys(metadataPayload.sliderModes || {}).length, dualRanges: Object.keys(metadataPayload.dualRanges || {}).length }, null, 2));
    logs.push(`[preset-extract] stateKeys=${Object.keys(statePayload).length} sliderModes=${Object.keys(metadataPayload.sliderModes || {}).length} dualRanges=${Object.keys(metadataPayload.dualRanges || {}).length}`);
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

function startVite() {
  const log = fs.openSync(path.join(OUT, 'vite.log'), 'a');
  return spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1'], { stdio: ['ignore', log, log], env: { ...process.env } });
}

async function waitForVite() {
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch('http://127.0.0.1:5173/'); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Vite did not become ready');
}

async function captureLocal() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required','--enable-webgl','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'],
  });
  const context = await browser.newContext({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1, recordVideo: { dir: VIDEO_DIR, size: { width: 2560, height: 1440 } } });
  const page = await context.newPage();
  page.setDefaultTimeout(22000);
  page.on('console', (m) => logs.push(`[console:${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.stack || e.message}`));
  page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} :: ${r.failure()?.errorText || ''}`));

  async function shot(name) {
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    fs.writeFileSync(path.join(OUT, `${name}.txt`), await page.locator('body').innerText().catch(() => ''));
  }
  async function clickButton(name, exact = true) {
    const loc = page.getByRole('button', { name, exact });
    for (let i = 0; i < await loc.count(); i++) {
      const el = loc.nth(i);
      if (await el.isVisible().catch(() => false)) { await el.click().catch(() => {}); return true; }
    }
    return false;
  }
  async function center(locator, offset = 0) {
    if (!(await locator.count())) return false;
    const el = locator.first();
    if (!(await el.isVisible().catch(() => false))) return false;
    await el.scrollIntoViewIfNeeded().catch(() => {});
    if (offset) await page.evaluate((dy) => window.scrollBy(0, dy), offset).catch(() => {});
    await sleep(page, 500);
    return true;
  }
  async function nav(shortcut, label) {
    await page.keyboard.press(shortcut).catch(() => {});
    await sleep(page, 800);
    await clickButton(label).catch(() => false);
    await sleep(page, 800);
  }
  async function segment(name, ms) {
    mark(`${name}-start`);
    await shot(`${name}-start`);
    await sleep(page, ms);
    await shot(`${name}-end`);
    mark(`${name}-end`);
  }
  async function visibleGlyphButton(glyph) {
    const buttons = page.locator('button');
    for (let i = 0; i < await buttons.count(); i++) {
      const b = buttons.nth(i);
      if (!(await b.isVisible().catch(() => false))) continue;
      if ((await b.innerText().catch(() => '')).includes(glyph)) return b;
    }
    return null;
  }
  async function isPlaying() {
    const advancedStop = page.locator('button[title="Stop"]');
    if (await advancedStop.count() && await advancedStop.first().isVisible().catch(() => false)) return true;
    return Boolean(await visibleGlyphButton('■'));
  }
  async function ensurePlaying() {
    if (await isPlaying()) return;
    const start = page.locator('button[title="Start"]');
    if (await start.count() && await start.first().isVisible().catch(() => false)) await start.first().click();
    else {
      const play = await visibleGlyphButton('▶');
      if (!play) throw new Error('Play transport not found');
      await play.click();
    }
    await page.waitForFunction(() => document.querySelector('button[title="Stop"]') || [...document.querySelectorAll('button')].some((b) => (b.textContent || '').includes('■')), null, { timeout: 45000 });
    logs.push(`[playback] verified running engine=${new URL(page.url()).searchParams.get('engine')}`);
  }
  async function loadDynamic() {
    await page.locator('button[title="Presets"]').first().click();
    const dialog = page.getByRole('dialog', { name: 'Snowflake preset loader' });
    await dialog.waitFor({ state: 'visible' });
    await dialog.getByPlaceholder('Search').fill('String Waves Dynamic');
    await sleep(page, 700);
    await shot('00-local-preset-search');
    const load = dialog.locator('button[title="Load String Waves Dynamic"]');
    if (!(await load.count())) throw new Error(`Local Dynamic preset missing; dialog=${(await dialog.innerText()).slice(0, 2500)}`);
    await load.first().click();
    await dialog.waitFor({ state: 'hidden', timeout: 20000 });
    await sleep(page, 1800);
    await shot('00-local-dynamic-loaded');
  }
  async function expandCard(label) {
    const candidates = page.getByText(label, { exact: true });
    for (let i = 0; i < await candidates.count(); i++) {
      const el = candidates.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      await el.scrollIntoViewIfNeeded().catch(() => {});
      const button = el.locator('xpath=ancestor::button[1]');
      const summary = el.locator('xpath=ancestor::summary[1]');
      if (await button.count()) await button.click().catch(() => {});
      else if (await summary.count()) await summary.click().catch(() => {});
      else await el.click().catch(() => {});
      await sleep(page, 650);
      return true;
    }
    return false;
  }

  try {
    await page.goto('http://127.0.0.1:5173/?engine=web-ts', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await sleep(page, 14000);
    await shot('00-local-snowflake');
    await loadDynamic();
    await ensurePlaying();
    await sleep(page, 2200);
    await segment('snowflake-live', 5200);

    await nav('1', 'Patch');
    await shot('01-advanced');
    await nav('2', 'Synth');
    await clickButton('Detail').catch(() => false);
    await sleep(page, 900);

    for (const label of ['Pad 1', 'Pad 2', 'Lead 1', 'Lead 2', 'Sample 1', 'Sample 2']) {
      await expandCard(label);
      await center(page.getByText(label, { exact: true }), -140);
      await segment(`engine-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, 2200);
    }

    await clickButton('Step').catch(() => false);
    await sleep(page, 800);
    const off = page.getByRole('button', { name: 'Off', exact: true });
    if (await off.count() && await off.first().isVisible().catch(() => false)) await off.first().click();
    await sleep(page, 1000);
    await center(page.getByRole('button', { name: 'Step', exact: true }), 300);
    await segment('step-live', 9000);

    await clickButton('Orbit').catch(() => false);
    await sleep(page, 900);
    const spinOff = page.getByRole('button', { name: /SPIN.*OFF/i });
    if (await spinOff.count() && await spinOff.first().isVisible().catch(() => false)) await spinOff.first().click();
    await sleep(page, 1100);
    await center(page.getByRole('button', { name: 'Orbit', exact: true }), 360);
    await segment('orbit-live', 9500);

    await clickButton('Walker').catch(() => false);
    await sleep(page, 900);
    await center(page.getByRole('button', { name: 'Walker', exact: true }), 300);
    await segment('walker-live', 7500);

    await nav('3', 'Drums');
    await segment('drums-live', 5000);
    await nav('4', 'Earth');
    await segment('earth-live', 4500);
    await nav('5', 'Granular');
    await center(page.getByText('Granular', { exact: false }), 280);
    await segment('granular-live', 6500);
    await nav('6', 'Delay');
    await segment('delay-live', 4800);
    await nav('7', 'Reverb');
    await segment('reverb-live', 4800);
    await nav('8', 'Texture');
    const drift = page.getByText('Degrade - Drift', { exact: false });
    if (await drift.count()) await center(drift, 330);
    await segment('texture-live', 6500);

    await page.keyboard.press('=').catch(() => {});
    await sleep(page, 1000);
    await clickButton('Show Visualizer').catch(() => false);
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(page, 1200);
    await segment('visualizer-live', 10000);
    logs.push(`[final] transport=${await isPlaying()}`);
  } catch (error) {
    logs.push(`[fatal] ${error?.stack || error}`);
    await shot('99-failure').catch(() => {});
    throw error;
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

let vite = null;
try {
  await extractDynamicPreset();
  vite = startVite();
  await waitForVite();
  logs.push('[vite] ready');
  await captureLocal();
} catch (error) {
  logs.push(`[fatal-top] ${error?.stack || error}`);
  process.exitCode = 1;
} finally {
  if (vite) vite.kill('SIGTERM');
  fs.writeFileSync(path.join(OUT, 'capture.log'), logs.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify(timeline, null, 2));
}
