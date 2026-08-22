import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('promo-capture-v3-artifacts');
const VIDEO_DIR = path.join(OUT, 'video');
fs.mkdirSync(VIDEO_DIR, { recursive: true });
const logs = [];
const timeline = [];
const t0 = Date.now();
const sleep = (ms) => page.waitForTimeout(ms);
const mark = (name) => { const ms = Date.now() - t0; timeline.push({ name, ms }); logs.push(`[mark] ${name} ${ms}`); };

const browser = await chromium.launch({
  headless: true,
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ],
});
const context = await browser.newContext({
  viewport: { width: 2560, height: 1440 },
  deviceScaleFactor: 1,
  recordVideo: { dir: VIDEO_DIR, size: { width: 2560, height: 1440 } },
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
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
    if (await loc.nth(i).isVisible().catch(() => false)) { await loc.nth(i).click(); return true; }
  }
  return false;
}
async function clickText(name, exact = true) {
  const loc = page.getByText(name, { exact });
  for (let i = 0; i < await loc.count(); i++) {
    if (await loc.nth(i).isVisible().catch(() => false)) { await loc.nth(i).click(); return true; }
  }
  return false;
}
async function center(locator, offset = 0) {
  if (!(await locator.count())) return false;
  const el = locator.first();
  if (!(await el.isVisible().catch(() => false))) return false;
  await el.scrollIntoViewIfNeeded();
  if (offset) await page.evaluate((dy) => window.scrollBy(0, dy), offset);
  await sleep(550);
  return true;
}
async function nav(shortcut, label) {
  await page.keyboard.press(shortcut).catch(() => {});
  await sleep(800);
  await clickButton(label).catch(() => false);
  await sleep(900);
}
async function segment(name, ms) {
  mark(`${name}-start`);
  await shot(`${name}-start`);
  await sleep(ms);
  await shot(`${name}-end`);
  mark(`${name}-end`);
}
async function isPlaying() {
  const stop = page.locator('button[title="Stop"]');
  if (await stop.count() && await stop.first().isVisible().catch(() => false)) return true;
  const buttons = page.locator('button');
  for (let i = 0; i < await buttons.count(); i++) {
    const b = buttons.nth(i);
    if (await b.isVisible().catch(() => false) && (await b.innerText().catch(() => '')).includes('■')) return true;
  }
  return false;
}
async function ensurePlaying() {
  if (await isPlaying()) return;
  const start = page.locator('button[title="Start"]');
  if (await start.count() && await start.first().isVisible().catch(() => false)) {
    await start.first().click();
  } else {
    const buttons = page.locator('button');
    let clicked = false;
    for (let i = 0; i < await buttons.count(); i++) {
      const b = buttons.nth(i);
      if (await b.isVisible().catch(() => false) && (await b.innerText().catch(() => '')).includes('▶')) { await b.click(); clicked = true; break; }
    }
    if (!clicked) throw new Error('Play transport not found');
  }
  await page.waitForFunction(() => {
    if (document.querySelector('button[title="Stop"]')) return true;
    return [...document.querySelectorAll('button')].some((b) => (b.textContent || '').includes('■'));
  }, null, { timeout: 75000 });
  logs.push(`[playback] verified running; phase=${await page.evaluate(() => document.documentElement.dataset.coreProductRuntimePhase || '')}`);
}

async function selectDynamicPreset() {
  const target = 'String Waves Dynamic';
  logs.push(`[preset] searching for ${target}`);

  // Native selects first.
  const selects = page.locator('select');
  for (let i = 0; i < await selects.count(); i++) {
    const sel = selects.nth(i);
    const options = await sel.locator('option').allTextContents().catch(() => []);
    if (options.some((x) => x.trim() === target)) {
      await sel.selectOption({ label: target });
      await sleep(1800);
      logs.push('[preset] selected through native select');
      return true;
    }
  }

  // Open likely preset/browser controls and search the rendered list.
  const buttons = page.locator('button');
  const candidateTexts = [];
  for (let i = 0; i < await buttons.count(); i++) {
    const b = buttons.nth(i);
    if (!(await b.isVisible().catch(() => false))) continue;
    const txt = (await b.innerText().catch(() => '')).trim();
    if (/preset|string waves|patch/i.test(txt)) candidateTexts.push(txt);
  }
  logs.push(`[preset] candidate buttons=${JSON.stringify(candidateTexts)}`);

  for (const pattern of [/presets?/i, /string waves/i, /patch/i]) {
    const cand = page.getByRole('button', { name: pattern });
    for (let i = 0; i < await cand.count(); i++) {
      const b = cand.nth(i);
      if (!(await b.isVisible().catch(() => false))) continue;
      await b.click().catch(() => {});
      await sleep(900);
      const exact = page.getByText(target, { exact: true });
      if (await exact.count() && await exact.first().isVisible().catch(() => false)) {
        await exact.first().click();
        await sleep(1800);
        logs.push('[preset] selected through preset browser');
        return true;
      }
    }
  }

  // ARIA combobox/listbox fallback.
  const combos = page.getByRole('combobox');
  for (let i = 0; i < await combos.count(); i++) {
    const c = combos.nth(i);
    if (!(await c.isVisible().catch(() => false))) continue;
    await c.click().catch(() => {});
    await sleep(500);
    const option = page.getByRole('option', { name: target, exact: true });
    if (await option.count() && await option.first().isVisible().catch(() => false)) {
      await option.first().click();
      await sleep(1800);
      logs.push('[preset] selected through ARIA combobox');
      return true;
    }
  }

  const allOptions = await page.locator('option').allTextContents().catch(() => []);
  logs.push(`[preset] available option sample=${JSON.stringify(allOptions.filter((x) => /string|wave/i.test(x)).slice(0, 50))}`);
  await shot('00-preset-not-found');
  return false;
}

async function expandCard(label) {
  const text = page.getByText(label, { exact: true });
  if (!(await text.count())) return false;
  await center(text, -130);
  // Prefer the nearest button/summary; otherwise click the visible heading itself.
  const el = text.first();
  const ancestorButton = el.locator('xpath=ancestor::button[1]');
  if (await ancestorButton.count()) await ancestorButton.click().catch(() => {});
  else {
    const summary = el.locator('xpath=ancestor::summary[1]');
    if (await summary.count()) await summary.click().catch(() => {});
    else await el.click().catch(() => {});
  }
  await sleep(900);
  logs.push(`[card] attempted expansion: ${label}`);
  return true;
}

try {
  // Advanced UI: parity=1 was intentionally removed because it forces Snowflake/simple mode.
  await page.goto('http://127.0.0.1:5173/?engine=core-product', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(9000);
  await shot('00-loaded');

  await nav('1', 'Patch');
  const presetSelected = await selectDynamicPreset();
  if (!presetSelected) throw new Error('String Waves Dynamic preset was not found in the running app UI');
  await shot('00-string-waves-dynamic');

  await ensurePlaying();
  await sleep(2600);
  await shot('00-product-core-running');

  // Open and record actual engine cards before sequencer shots.
  await nav('2', 'Synth');
  await clickButton('Detail').catch(() => false);
  await sleep(900);
  for (const label of ['Pad Synth', 'Pad 2', 'Lead 1', 'Lead 2', 'Sample 1']) {
    await expandCard(label);
    await center(page.getByText(label, { exact: true }), -110);
    await segment(`engine-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, 3000);
  }

  // Step: enable a lane, then keep viewport static so real playhead/dot motion is measurable.
  await center(page.getByRole('button', { name: 'Step', exact: true }), 160);
  await clickButton('Step');
  await sleep(800);
  const off = page.getByRole('button', { name: 'Off', exact: true });
  if (await off.count() && await off.first().isVisible().catch(() => false)) await off.first().click();
  await sleep(1300);
  await center(page.getByRole('button', { name: 'Step', exact: true }), 260);
  await segment('step-live', 8500);

  // Orbit: Spin ON and static viewport; any movement is the real UI, not camera movement.
  await clickButton('Orbit');
  await sleep(1000);
  const spinOff = page.getByRole('button', { name: /SPIN.*OFF/i });
  if (await spinOff.count() && await spinOff.first().isVisible().catch(() => false)) await spinOff.first().click();
  await sleep(1300);
  await center(page.getByRole('button', { name: 'Orbit', exact: true }), 330);
  await segment('orbit-live', 9000);

  await clickButton('Walker');
  await sleep(1000);
  await center(page.getByRole('button', { name: 'Walker', exact: true }), 260);
  await segment('walker-live', 6500);

  await nav('3', 'Drums');
  await expandCard('Drums');
  await segment('drums-live', 4500);

  await nav('4', 'Earth');
  await segment('earth-live', 4000);

  await nav('5', 'Granular');
  await expandCard('Granular');
  await center(page.getByText('Granular', { exact: false }), 230);
  await segment('granular-live', 6000);

  await nav('6', 'Delay');
  await expandCard('Delay');
  await segment('delay-live', 4300);

  await nav('7', 'Reverb');
  await expandCard('Reverb');
  await segment('reverb-live', 4300);

  await nav('8', 'Texture');
  const drift = page.getByText('Degrade - Drift', { exact: false });
  if (await drift.count()) {
    await expandCard('Degrade - Drift');
    const section = drift.first().locator('xpath=ancestor::section[1]');
    const fxOff = section.getByRole('button', { name: 'FX Off', exact: true });
    if (await fxOff.count() && await fxOff.first().isVisible().catch(() => false)) await fxOff.first().click();
  }
  const erosion = page.getByText('Degrade - Erosion', { exact: false });
  if (await erosion.count()) {
    await expandCard('Degrade - Erosion');
    const section = erosion.first().locator('xpath=ancestor::section[1]');
    const fxOff = section.getByRole('button', { name: 'FX Off', exact: true });
    if (await fxOff.count() && await fxOff.first().isVisible().catch(() => false)) await fxOff.first().click();
  }
  await center(drift, 300);
  await segment('texture-live', 6500);

  await page.keyboard.press('=').catch(() => {});
  await sleep(1000);
  await clickButton('Show Visualizer').catch(() => false);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(1200);
  await segment('visualizer-live', 9500);

  logs.push(`[final] transport=${await isPlaying()}`);
} catch (error) {
  logs.push(`[fatal] ${error?.stack || error}`);
  logs.push(`[phase] ${await page.evaluate(() => document.documentElement.dataset.coreProductRuntimePhase || '').catch(() => '')}`);
  logs.push(`[runtimeError] ${await page.evaluate(() => document.documentElement.dataset.coreProductRuntimeError || '').catch(() => '')}`);
  await shot('99-failure').catch(() => {});
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(OUT, 'capture.log'), `${logs.join('\n')}\n`);
  fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify(timeline, null, 2));
  await page.close().catch(() => {});
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
