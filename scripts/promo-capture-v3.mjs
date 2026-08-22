import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('promo-capture-v3-artifacts');
const VIDEO_DIR = path.join(OUT, 'video');
fs.mkdirSync(VIDEO_DIR, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--use-gl=swiftshader',
    '--disable-dev-shm-usage',
  ],
});

const context = await browser.newContext({
  viewport: { width: 2560, height: 1440 },
  deviceScaleFactor: 1,
  recordVideo: { dir: VIDEO_DIR, size: { width: 2560, height: 1440 } },
});
const page = await context.newPage();
const logs = [];
const timeline = [];
const t0 = Date.now();

page.on('console', (msg) => logs.push(`[console:${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => logs.push(`[pageerror] ${err.stack || err.message}`));
page.on('requestfailed', (req) => logs.push(`[requestfailed] ${req.url()} :: ${req.failure()?.errorText || ''}`));

const sleep = (ms) => page.waitForTimeout(ms);
function mark(name) {
  const ms = Date.now() - t0;
  timeline.push({ name, ms });
  logs.push(`[mark] ${name} ${ms}`);
}

async function bodyText() {
  return page.locator('body').innerText().catch(() => '');
}

async function screenshot(name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  fs.writeFileSync(path.join(OUT, `${name}.txt`), await bodyText());
}

async function clickVisibleByText(label, exact = true) {
  const loc = page.getByText(label, { exact });
  for (let i = 0; i < await loc.count(); i++) {
    const el = loc.nth(i);
    if (await el.isVisible().catch(() => false)) {
      await el.click({ timeout: 7000 }).catch(() => {});
      return true;
    }
  }
  return false;
}

async function clickButton(label, exact = true) {
  const loc = page.getByRole('button', { name: label, exact });
  for (let i = 0; i < await loc.count(); i++) {
    const el = loc.nth(i);
    if (await el.isVisible().catch(() => false)) {
      await el.click({ timeout: 7000 }).catch(() => {});
      return true;
    }
  }
  return false;
}

async function ensurePlaying() {
  for (let attempt = 0; attempt < 4; attempt++) {
    const stop = page.locator('button[title="Stop"]');
    if (await stop.count() && await stop.first().isVisible().catch(() => false)) {
      logs.push('[playback] verified running');
      return true;
    }
    const start = page.locator('button[title="Start"]');
    if (await start.count() && await start.first().isVisible().catch(() => false)) {
      await start.first().click({ timeout: 7000 }).catch(() => {});
      await sleep(3000);
    } else {
      await page.mouse.click(1280, 180).catch(() => {});
      await sleep(1200);
    }
  }
  logs.push('[playback] failed to verify running');
  return false;
}

async function nav(shortcut, label) {
  await page.keyboard.press(shortcut).catch(() => {});
  await sleep(1200);
  await clickButton(label).catch(() => false);
  await sleep(1800);
  await ensurePlaying();
}

async function centerElement(locator, offset = 0) {
  if (!(await locator.count())) return;
  const el = locator.first();
  await el.scrollIntoViewIfNeeded().catch(() => {});
  if (offset) await page.evaluate((dy) => window.scrollBy(0, dy), offset).catch(() => {});
  await sleep(800);
}

try {
  await page.goto('https://kessho.vercel.app', { waitUntil: 'domcontentloaded', timeout: 120000 });
  // Let bundled/cloud preset loading finish completely before touching transport.
  await sleep(26000);
  await page.mouse.click(1280, 180).catch(() => {});
  await sleep(1000);
  await page.keyboard.press('2').catch(() => {});
  await sleep(3000);
  await ensurePlaying();
  await sleep(5000);
  mark('synth-live-start');
  await screenshot('00-synth-live');
  await sleep(6000);
  mark('synth-live-end');

  // Detailed sequencer; explicitly enable the Step lane itself.
  await clickButton('Detail').catch(() => false);
  await sleep(2200);
  await clickButton('Step').catch(() => false);
  await sleep(1200);
  const laneOff = page.getByRole('button', { name: 'Off', exact: true });
  if (await laneOff.count() && await laneOff.first().isVisible().catch(() => false)) {
    await laneOff.first().click().catch(() => {});
    await sleep(1500);
  }
  await ensurePlaying();
  const stepBtn = page.getByRole('button', { name: 'Step', exact: true });
  await centerElement(stepBtn, 130);
  mark('step-live-start');
  await screenshot('01-step-live');
  await sleep(8000);
  mark('step-live-end');

  // Orbit: keep lane enabled, enable spin, and verify transport is still live.
  await clickButton('Orbit').catch(() => false);
  await sleep(2000);
  await clickButton('SPIN: OFF').catch(() => false);
  await ensurePlaying();
  const orbitBtn = page.getByRole('button', { name: 'Orbit', exact: true });
  await centerElement(orbitBtn, 180);
  mark('orbit-live-start');
  await screenshot('02-orbit-live');
  await sleep(10000);
  mark('orbit-live-end');

  // Walker: turn on an ensemble preset to make the generated motion legible.
  await clickButton('Walker').catch(() => false);
  await sleep(2200);
  await clickButton('Diatonic').catch(() => false);
  await ensurePlaying();
  const walkerBtn = page.getByRole('button', { name: 'Walker', exact: true });
  await centerElement(walkerBtn, 180);
  mark('walker-live-start');
  await screenshot('03-walker-live');
  await sleep(8500);
  mark('walker-live-end');

  // Granular: already on in Point Clouds; live transport makes heads/grains animate.
  await nav('5', 'Granular');
  const granularHeading = page.getByText('Granular FX', { exact: false });
  await centerElement(granularHeading, 220);
  mark('granular-live-start');
  await screenshot('04-granular-live');
  await sleep(8000);
  mark('granular-live-end');

  // Delay and reverb: hold only while transport is verified live.
  await nav('6', 'Delay');
  mark('delay-live-start');
  await screenshot('05-delay-live');
  await sleep(6000);
  mark('delay-live-end');

  await nav('7', 'Reverb');
  mark('reverb-live-start');
  await screenshot('06-reverb-live');
  await sleep(6500);
  mark('reverb-live-end');

  // Texture: explicitly activate Drift and Erosion so the visual telemetry has motion.
  await nav('8', 'Texture');
  const driftTitle = page.getByText('Degrade - Drift', { exact: false });
  if (await driftTitle.count()) {
    const section = driftTitle.first().locator('xpath=ancestor::section[1]');
    const toggle = section.getByRole('button', { name: 'FX Off', exact: true });
    if (await toggle.count()) await toggle.first().click().catch(() => {});
  }
  await sleep(1800);
  const erosionTitle = page.getByText('Degrade - Erosion', { exact: false });
  if (await erosionTitle.count()) {
    const section = erosionTitle.first().locator('xpath=ancestor::section[1]');
    const toggle = section.getByRole('button', { name: 'FX Off', exact: true });
    if (await toggle.count()) await toggle.first().click().catch(() => {});
  }
  await ensurePlaying();
  await centerElement(driftTitle, 260);
  mark('texture-live-start');
  await screenshot('07-texture-live');
  await sleep(9500);
  mark('texture-live-end');

  // Reactive visualizer: make sure it is shown while the music is actually running.
  await page.keyboard.press('=').catch(() => {});
  await sleep(2200);
  if (await page.getByRole('button', { name: 'Show Visualizer', exact: true }).count()) {
    await clickButton('Show Visualizer').catch(() => false);
  }
  await ensurePlaying();
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await sleep(2000);
  mark('visualizer-live-start');
  await screenshot('08-visualizer-live');
  await sleep(14000);
  mark('visualizer-live-end');

  fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify(timeline, null, 2));
} catch (error) {
  logs.push(`[fatal] ${error?.stack || error}`);
  await screenshot('99-failure').catch(() => {});
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(OUT, 'capture.log'), `${logs.join('\n')}\n`);
  if (!fs.existsSync(path.join(OUT, 'timeline.json'))) {
    fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify(timeline, null, 2));
  }
  await page.close().catch(() => {});
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
