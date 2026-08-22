import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('promo-capture-v3-artifacts');
const VIDEO_DIR = path.join(OUT, 'video');
fs.mkdirSync(VIDEO_DIR, { recursive: true });
const logs = [];
const timeline = [];
const t0 = Date.now();
let page;
const sleep = (ms) => page.waitForTimeout(ms);
const mark = (name) => {
  const ms = Date.now() - t0;
  timeline.push({ name, ms });
  logs.push(`[mark] ${name} ${ms}`);
};

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
page = await context.newPage();
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
    if (await loc.nth(i).isVisible().catch(() => false)) {
      await loc.nth(i).click();
      return true;
    }
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
  await sleep(900);
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
      if (await b.isVisible().catch(() => false) && (await b.innerText().catch(() => '')).includes('▶')) {
        await b.click();
        clicked = true;
        break;
      }
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
  const presetButton = page.locator('button[title="Presets"]');
  if (!(await presetButton.count())) throw new Error('Snowflake Presets button not found');
  await presetButton.first().click();
  await sleep(700);

  const dialog = page.getByRole('dialog', { name: 'Snowflake preset loader' });
  await dialog.waitFor({ state: 'visible', timeout: 10000 });
  const search = dialog.getByPlaceholder('Search');
  await search.fill(target);
  await sleep(900);
  await shot('00-preset-search');

  const matches = dialog.locator('button').filter({ hasText: target });
  let selected = false;
  for (let i = 0; i < await matches.count(); i++) {
    const b = matches.nth(i);
    const text = (await b.innerText().catch(() => '')).trim();
    if (await b.isVisible().catch(() => false) && text.includes(target)) {
      logs.push(`[preset] clicking=${JSON.stringify(text)}`);
      await b.click();
      selected = true;
      break;
    }
  }
  if (!selected) {
    const dialogText = await dialog.innerText().catch(() => '');
    logs.push(`[preset] search results=${JSON.stringify(dialogText.slice(0, 3000))}`);
    throw new Error(`${target} was not found in Snowflake preset loader`);
  }

  await dialog.waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
  await sleep(2200);
  logs.push(`[preset] loaded ${target}`);
  await shot('00-string-waves-dynamic');
}

async function expandCard(label) {
  const text = page.getByText(label, { exact: true });
  if (!(await text.count())) {
    logs.push(`[card] missing=${label}`);
    return false;
  }
  await center(text, -140);
  const el = text.first();
  const button = el.locator('xpath=ancestor::button[1]');
  if (await button.count()) await button.click().catch(() => {});
  else {
    const summary = el.locator('xpath=ancestor::summary[1]');
    if (await summary.count()) await summary.click().catch(() => {});
    else await el.click().catch(() => {});
  }
  await sleep(900);
  logs.push(`[card] opened=${label}`);
  return true;
}

try {
  await page.goto('http://127.0.0.1:5173/?engine=core-product', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(14000);
  await shot('00-snowflake-loaded');

  // Select the requested child preset in the real Snowflake state-preset loader.
  await selectDynamicPreset();

  // Start Product Core while still in the simple UI, then enter advanced UI.
  await ensurePlaying();
  await sleep(2500);
  await shot('00-product-core-running');
  await nav('1', 'Patch');
  await shot('00-advanced-running');

  // Synth engine cards — open them and hold each framing long enough for editorial push-ins.
  await nav('2', 'Synth');
  await clickButton('Detail').catch(() => false);
  await sleep(900);
  for (const label of ['Pad 1', 'Pad 2', 'Lead 1', 'Lead 2', 'Sample 1']) {
    await expandCard(label);
    await center(page.getByText(label, { exact: true }), -110);
    await segment(`engine-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, 3000);
  }

  // Step: viewport stays static during this raw segment; motion must come from Kessho.
  await clickButton('Step').catch(() => false);
  await sleep(900);
  const off = page.getByRole('button', { name: 'Off', exact: true });
  if (await off.count() && await off.first().isVisible().catch(() => false)) await off.first().click();
  await sleep(1300);
  await center(page.getByRole('button', { name: 'Step', exact: true }), 280);
  await segment('step-live', 8500);

  // Orbit: enable the real Spin control, then keep viewport static for motion verification.
  await clickButton('Orbit').catch(() => false);
  await sleep(1000);
  const spinOff = page.getByRole('button', { name: /SPIN.*OFF/i });
  if (await spinOff.count() && await spinOff.first().isVisible().catch(() => false)) await spinOff.first().click();
  await sleep(1300);
  await center(page.getByRole('button', { name: 'Orbit', exact: true }), 350);
  await segment('orbit-live', 9000);

  await clickButton('Walker').catch(() => false);
  await sleep(1000);
  await center(page.getByRole('button', { name: 'Walker', exact: true }), 280);
  await segment('walker-live', 6500);

  await nav('3', 'Drums');
  await segment('drums-live', 4500);

  await nav('4', 'Earth');
  await segment('earth-live', 4000);

  await nav('5', 'Granular');
  await center(page.getByText('Granular', { exact: false }), 260);
  await segment('granular-live', 6000);

  await nav('6', 'Delay');
  await segment('delay-live', 4300);

  await nav('7', 'Reverb');
  await segment('reverb-live', 4300);

  await nav('8', 'Texture');
  const drift = page.getByText('Degrade - Drift', { exact: false });
  if (await drift.count()) {
    const section = drift.first().locator('xpath=ancestor::section[1]');
    const fxOff = section.getByRole('button', { name: 'FX Off', exact: true });
    if (await fxOff.count() && await fxOff.first().isVisible().catch(() => false)) await fxOff.first().click();
  }
  const erosion = page.getByText('Degrade - Erosion', { exact: false });
  if (await erosion.count()) {
    const section = erosion.first().locator('xpath=ancestor::section[1]');
    const fxOff = section.getByRole('button', { name: 'FX Off', exact: true });
    if (await fxOff.count() && await fxOff.first().isVisible().catch(() => false)) await fxOff.first().click();
  }
  await center(drift, 320);
  await segment('texture-live', 6500);

  await page.keyboard.press('=').catch(() => {});
  await sleep(1200);
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
