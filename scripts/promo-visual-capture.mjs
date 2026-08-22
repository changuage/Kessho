import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('promo-capture-v3-artifacts');
const VIDEO_DIR = path.join(OUT, 'video');
fs.mkdirSync(VIDEO_DIR, { recursive: true });

const logs = [];
const timeline = [];
const t0 = Date.now();
const sleep = (page, ms) => page.waitForTimeout(ms);
function mark(name) {
  const ms = Date.now() - t0;
  timeline.push({ name, ms });
  logs.push(`[mark] ${name} ${ms}`);
}

const browser = await chromium.launch({
  headless: false,
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--use-gl=swiftshader',
    '--disable-dev-shm-usage',
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
page.on('console', (msg) => logs.push(`[console:${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => logs.push(`[pageerror] ${err.stack || err.message}`));
page.on('requestfailed', (req) => logs.push(`[requestfailed] ${req.url()} :: ${req.failure()?.errorText || ''}`));

async function shot(name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  fs.writeFileSync(path.join(OUT, `${name}.txt`), await page.locator('body').innerText().catch(() => ''));
}
async function clickButton(label, exact = true) {
  const loc = page.getByRole('button', { name: label, exact });
  const count = await loc.count();
  for (let i = 0; i < count; i++) {
    const el = loc.nth(i);
    if (await el.isVisible().catch(() => false)) {
      await el.click({ timeout: 10000 }).catch(() => {});
      return true;
    }
  }
  return false;
}
async function visibleGlyphButton(glyph) {
  const buttons = page.locator('button');
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i);
    if (!(await button.isVisible().catch(() => false))) continue;
    const text = (await button.innerText().catch(() => '')).trim();
    if (text.includes(glyph)) return button;
  }
  return null;
}
async function isTransportRunning() {
  const advancedStop = page.locator('button[title="Stop"]');
  if (await advancedStop.count() && await advancedStop.first().isVisible().catch(() => false)) return true;
  return Boolean(await visibleGlyphButton('■'));
}
async function ensurePlaying() {
  if (await isTransportRunning()) return;

  const advancedStart = page.locator('button[title="Start"]');
  if (await advancedStart.count() && await advancedStart.first().isVisible().catch(() => false)) {
    await advancedStart.first().click({ timeout: 10000 });
  } else {
    const simplePlay = await visibleGlyphButton('▶');
    if (!simplePlay) {
      const texts = await page.locator('button').allInnerTexts().catch(() => []);
      throw new Error(`Global play control not found; visible button texts=${JSON.stringify(texts)}`);
    }
    await simplePlay.click({ timeout: 10000 });
  }

  await page.waitForFunction(() => {
    const advanced = document.querySelector('button[title="Stop"]');
    if (advanced) return true;
    return Array.from(document.querySelectorAll('button')).some((button) => (button.textContent || '').includes('■'));
  }, null, { timeout: 75000 });
  logs.push(`[playback] verified running; phase=${await page.evaluate(() => document.documentElement.dataset.coreProductRuntimePhase || '')}`);
}
async function nav(shortcut, label) {
  await page.keyboard.press(shortcut).catch(() => {});
  await sleep(page, 900);
  await clickButton(label).catch(() => false);
  await sleep(page, 900);
}
async function center(locator, offset = 0) {
  if (!(await locator.count())) return;
  await locator.first().scrollIntoViewIfNeeded().catch(() => {});
  if (offset) await page.evaluate((dy) => window.scrollBy(0, dy), offset).catch(() => {});
  await sleep(page, 500);
}
async function segment(name, ms, screenshotName = name) {
  mark(`${name}-start`);
  await shot(screenshotName);
  await sleep(page, ms);
  mark(`${name}-end`);
}

try {
  await page.goto('http://127.0.0.1:5173/?engine=core-product&parity=1', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(page, 4500);
  await ensurePlaying();
  await sleep(page, 2500);
  await shot('00-product-core-running');

  await nav('2', 'Synth');
  await clickButton('Detail').catch(() => false);
  await sleep(page, 1000);
  await clickButton('Step').catch(() => false);
  await sleep(page, 700);
  const offButtons = page.getByRole('button', { name: 'Off', exact: true });
  if (await offButtons.count()) await offButtons.first().click().catch(() => {});
  await sleep(page, 1200);
  await center(page.getByRole('button', { name: 'Step', exact: true }), 140);
  await segment('step-live', 7000, '01-step-live');

  await clickButton('Orbit').catch(() => false);
  await sleep(page, 1200);
  const spinOff = page.getByRole('button', { name: /SPIN.*OFF/i });
  if (await spinOff.count()) await spinOff.first().click().catch(() => {});
  await sleep(page, 1200);
  await center(page.getByRole('button', { name: 'Orbit', exact: true }), 190);
  await segment('orbit-live', 8500, '02-orbit-live');

  await clickButton('Walker').catch(() => false);
  await sleep(page, 1200);
  await center(page.getByRole('button', { name: 'Walker', exact: true }), 190);
  await segment('walker-live', 7000, '03-walker-live');

  await nav('3', 'Drums');
  await segment('drums-live', 5000, '04-drums-live');

  await nav('4', 'Earth');
  await segment('earth-live', 4500, '05-earth-live');

  await nav('5', 'Granular');
  await center(page.getByText('Granular', { exact: false }), 220);
  await segment('granular-live', 6500, '06-granular-live');

  await nav('6', 'Delay');
  await segment('delay-live', 4500, '07-delay-live');

  await nav('7', 'Reverb');
  await segment('reverb-live', 4500, '08-reverb-live');

  await nav('8', 'Texture');
  const drift = page.getByText('Degrade - Drift', { exact: false });
  if (await drift.count()) {
    const section = drift.first().locator('xpath=ancestor::section[1]');
    const off = section.getByRole('button', { name: 'FX Off', exact: true });
    if (await off.count()) await off.first().click().catch(() => {});
  }
  const erosion = page.getByText('Degrade - Erosion', { exact: false });
  if (await erosion.count()) {
    const section = erosion.first().locator('xpath=ancestor::section[1]');
    const off = section.getByRole('button', { name: 'FX Off', exact: true });
    if (await off.count()) await off.first().click().catch(() => {});
  }
  await center(drift, 250);
  await segment('texture-live', 7000, '09-texture-live');

  await page.keyboard.press('=').catch(() => {});
  await sleep(page, 1500);
  await clickButton('Show Visualizer').catch(() => false);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(page, 1200);
  await segment('visualizer-live', 10000, '10-visualizer-live');

  fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify(timeline, null, 2));
} catch (error) {
  logs.push(`[fatal] ${error?.stack || error}`);
  logs.push(`[phase] ${await page.evaluate(() => document.documentElement.dataset.coreProductRuntimePhase || '').catch(() => '')}`);
  logs.push(`[runtimeError] ${await page.evaluate(() => document.documentElement.dataset.coreProductRuntimeError || '').catch(() => '')}`);
  await shot('99-failure').catch(() => {});
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(OUT, 'capture.log'), `${logs.join('\n')}\n`);
  if (!fs.existsSync(path.join(OUT, 'timeline.json'))) fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify(timeline, null, 2));
  await page.close().catch(() => {});
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
