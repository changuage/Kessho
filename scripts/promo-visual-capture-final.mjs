import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('promo-capture-v3-artifacts');
const VIDEO_DIR = path.join(OUT, 'video');
fs.mkdirSync(VIDEO_DIR, { recursive: true });
const logs = [];
const timeline = [];
const t0 = Date.now();
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
const sleep = (ms) => page.waitForTimeout(ms);
const mark = (name) => {
  const ms = Date.now() - t0;
  timeline.push({ name, ms });
  logs.push(`[mark] ${name} ${ms}`);
};
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
  await sleep(500);
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
  await page.waitForFunction(() => {
    if (document.querySelector('button[title="Stop"]')) return true;
    return [...document.querySelectorAll('button')].some((b) => (b.textContent || '').includes('■'));
  }, null, { timeout: 75000 });
  logs.push(`[playback] verified running; phase=${await page.evaluate(() => document.documentElement.dataset.coreProductRuntimePhase || '')}`);
}
async function loadStringWavesDynamics() {
  const presetButton = page.locator('button[title="Presets"]');
  await presetButton.first().click();
  const dialog = page.getByRole('dialog', { name: 'Snowflake preset loader' });
  await dialog.waitFor({ state: 'visible' });
  await dialog.getByPlaceholder('Search').fill('String Waves Dynamic');
  await sleep(900);
  await shot('00-preset-search');

  // Production currently stores this family as "STring Waves Dynamics TEst".
  // Load the primary family state using the real loader arrow, rather than a child variant.
  const loadButtons = dialog.locator('button[title^="Load "]');
  let selected = false;
  for (let i = 0; i < await loadButtons.count(); i++) {
    const b = loadButtons.nth(i);
    if (!(await b.isVisible().catch(() => false))) continue;
    const title = await b.getAttribute('title');
    if (/string waves dynamic/i.test(title || '')) {
      logs.push(`[preset] loading primary=${title}`);
      await b.click();
      selected = true;
      break;
    }
  }
  if (!selected) throw new Error(`String Waves Dynamics primary load control not found; dialog=${(await dialog.innerText()).slice(0, 3000)}`);
  await dialog.waitFor({ state: 'hidden', timeout: 20000 });
  await sleep(2200);
  await shot('00-string-waves-dynamics-loaded');
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
    await sleep(900);
    logs.push(`[card] opened=${label}`);
    return true;
  }
  logs.push(`[card] not-found=${label}`);
  return false;
}

try {
  await page.goto('https://kessho.vercel.app/?engine=core-product', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(14000);
  await shot('00-snowflake');
  await loadStringWavesDynamics();
  await ensurePlaying();
  await sleep(2600);
  await shot('00-running');

  // Enter advanced editor after the requested preset is live.
  await nav('1', 'Patch');
  await shot('01-advanced');

  await nav('2', 'Synth');
  await clickButton('Detail').catch(() => false);
  await sleep(1000);
  await shot('02-synth-detail');

  // Engine cards: explicitly open and frame the real modules.
  for (const label of ['Pad 1', 'Pad 2', 'Lead 1', 'Lead 2', 'Sample 1', 'Sample 2']) {
    await expandCard(label);
    await center(page.getByText(label, { exact: true }), -140);
    await segment(`engine-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, 2800);
  }

  // Step: raw viewport remains static so motion can be verified as app motion.
  await clickButton('Step').catch(() => false);
  await sleep(900);
  const off = page.getByRole('button', { name: 'Off', exact: true });
  if (await off.count() && await off.first().isVisible().catch(() => false)) await off.first().click();
  await sleep(1300);
  await center(page.getByRole('button', { name: 'Step', exact: true }), 300);
  await segment('step-live', 8500);

  // Orbit: enable real SPIN and capture without camera movement.
  await clickButton('Orbit').catch(() => false);
  await sleep(1000);
  const spinOff = page.getByRole('button', { name: /SPIN.*OFF/i });
  if (await spinOff.count() && await spinOff.first().isVisible().catch(() => false)) await spinOff.first().click();
  await sleep(1300);
  await center(page.getByRole('button', { name: 'Orbit', exact: true }), 360);
  await segment('orbit-live', 9000);

  await clickButton('Walker').catch(() => false);
  await sleep(1000);
  await center(page.getByRole('button', { name: 'Walker', exact: true }), 300);
  await segment('walker-live', 6500);

  await nav('3', 'Drums');
  await segment('drums-live', 4500);

  await nav('4', 'Earth');
  await segment('earth-live', 4200);

  await nav('5', 'Granular');
  await center(page.getByText('Granular', { exact: false }), 280);
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
  await center(drift, 330);
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
