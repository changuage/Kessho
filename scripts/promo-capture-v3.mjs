import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const OUT = path.resolve('promo-capture-v3-artifacts');
const VIDEO_DIR = path.join(OUT, 'video');
fs.mkdirSync(VIDEO_DIR, { recursive: true });

const logs = [];
const timeline = [];
const t0 = Date.now();
let audioRecorder = null;

function mark(name) {
  const ms = Date.now() - t0;
  timeline.push({ name, ms });
  logs.push(`[mark] ${name} ${ms}`);
}

function startPulseRecording() {
  const sinkResult = spawnSync('pactl', ['get-default-sink'], { encoding: 'utf8' });
  const sink = (sinkResult.stdout || 'kessho').trim() || 'kessho';
  const source = `${sink}.monitor`;
  const wav = path.join(OUT, 'product-core-audio.wav');
  logs.push(`[audio] recording PulseAudio source ${source}`);
  const proc = spawn('ffmpeg', [
    '-hide_banner', '-loglevel', 'warning',
    '-f', 'pulse', '-i', source,
    '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s24le',
    '-y', wav,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stderr.on('data', (d) => logs.push(`[ffmpeg] ${String(d).trim()}`));
  proc.on('error', (err) => logs.push(`[ffmpeg:error] ${err.message}`));
  audioRecorder = proc;
  return proc;
}

async function stopPulseRecording() {
  if (!audioRecorder || audioRecorder.killed) return;
  audioRecorder.kill('SIGINT');
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 5000);
    audioRecorder.once('close', () => { clearTimeout(timer); resolve(); });
  });
}

const browser = await chromium.launch({
  headless: false,
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--use-gl=swiftshader',
    '--disable-dev-shm-usage',
    '--disable-features=AudioServiceOutOfProcess',
  ],
});

const context = await browser.newContext({
  viewport: { width: 2560, height: 1440 },
  deviceScaleFactor: 1,
  recordVideo: { dir: VIDEO_DIR, size: { width: 2560, height: 1440 } },
});
const page = await context.newPage();

page.on('console', (msg) => logs.push(`[console:${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => logs.push(`[pageerror] ${err.stack || err.message}`));
page.on('requestfailed', (req) => logs.push(`[requestfailed] ${req.url()} :: ${req.failure()?.errorText || ''}`));
page.on('dialog', async (dialog) => {
  logs.push(`[dialog:${dialog.type()}] ${dialog.message()}`);
  await dialog.dismiss().catch(() => {});
});

const sleep = (ms) => page.waitForTimeout(ms);
async function screenshot(name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  fs.writeFileSync(path.join(OUT, `${name}.txt`), await page.locator('body').innerText().catch(() => ''));
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
  const stop = page.locator('button[title="Stop"]');
  if (await stop.count() && await stop.first().isVisible().catch(() => false)) return true;
  const start = page.locator('button[title="Start"]');
  if (!(await start.count())) throw new Error('Global Start button not found');
  await start.first().click({ timeout: 10000 });
  await page.waitForFunction(() => Boolean(document.querySelector('button[title="Stop"]')), null, { timeout: 45000 });
  logs.push('[playback] verified Product Core transport running');
  return true;
}
async function nav(shortcut, label) {
  await page.keyboard.press(shortcut).catch(() => {});
  await sleep(900);
  await clickButton(label).catch(() => false);
  await sleep(900);
  await ensurePlaying();
}
async function centerElement(locator, offset = 0) {
  if (!(await locator.count())) return;
  await locator.first().scrollIntoViewIfNeeded().catch(() => {});
  if (offset) await page.evaluate((dy) => window.scrollBy(0, dy), offset).catch(() => {});
  await sleep(500);
}

try {
  await page.goto('https://kessho.vercel.app', { waitUntil: 'domcontentloaded', timeout: 120000 });
  // Let bundled presets and Product Core assets finish their automatic startup/load cycle.
  await sleep(20000);
  await page.mouse.click(1280, 180).catch(() => {});
  startPulseRecording();
  mark('audio-recording-start');

  await page.keyboard.press('2').catch(() => {});
  await sleep(1500);
  await ensurePlaying();
  await sleep(3500);
  mark('synth-live-start');
  await screenshot('00-synth-live');
  await sleep(5000);
  mark('synth-live-end');

  await clickButton('Detail').catch(() => false);
  await sleep(1300);
  await clickButton('Step').catch(() => false);
  await sleep(700);
  const laneOff = page.getByRole('button', { name: 'Off', exact: true });
  if (await laneOff.count() && await laneOff.first().isVisible().catch(() => false)) {
    await laneOff.first().click().catch(() => {});
    await sleep(900);
  }
  await ensurePlaying();
  await centerElement(page.getByRole('button', { name: 'Step', exact: true }), 140);
  mark('step-live-start');
  await screenshot('01-step-live');
  await sleep(7000);
  mark('step-live-end');

  await clickButton('Orbit').catch(() => false);
  await sleep(1300);
  const spinOff = page.getByRole('button', { name: /SPIN.*OFF/i });
  if (await spinOff.count() && await spinOff.first().isVisible().catch(() => false)) {
    await spinOff.first().click().catch(() => {});
    await sleep(900);
  }
  await ensurePlaying();
  await centerElement(page.getByRole('button', { name: 'Orbit', exact: true }), 190);
  mark('orbit-live-start');
  await screenshot('02-orbit-live');
  await sleep(9000);
  mark('orbit-live-end');

  await clickButton('Walker').catch(() => false);
  await sleep(1300);
  await ensurePlaying();
  await centerElement(page.getByRole('button', { name: 'Walker', exact: true }), 190);
  mark('walker-live-start');
  await screenshot('03-walker-live');
  await sleep(7000);
  mark('walker-live-end');

  await nav('3', 'Drums');
  mark('drums-live-start');
  await screenshot('04-drums-live');
  await sleep(5000);
  mark('drums-live-end');

  await nav('4', 'Earth');
  mark('earth-live-start');
  await screenshot('05-earth-live');
  await sleep(5000);
  mark('earth-live-end');

  await nav('5', 'Granular');
  await centerElement(page.getByText('Granular', { exact: false }), 220);
  mark('granular-live-start');
  await screenshot('06-granular-live');
  await sleep(6500);
  mark('granular-live-end');

  await nav('6', 'Delay');
  mark('delay-live-start');
  await screenshot('07-delay-live');
  await sleep(5000);
  mark('delay-live-end');

  await nav('7', 'Reverb');
  mark('reverb-live-start');
  await screenshot('08-reverb-live');
  await sleep(5000);
  mark('reverb-live-end');

  await nav('8', 'Texture');
  const driftTitle = page.getByText('Degrade - Drift', { exact: false });
  if (await driftTitle.count()) {
    const section = driftTitle.first().locator('xpath=ancestor::section[1]');
    const toggle = section.getByRole('button', { name: 'FX Off', exact: true });
    if (await toggle.count()) await toggle.first().click().catch(() => {});
  }
  await sleep(1000);
  const erosionTitle = page.getByText('Degrade - Erosion', { exact: false });
  if (await erosionTitle.count()) {
    const section = erosionTitle.first().locator('xpath=ancestor::section[1]');
    const toggle = section.getByRole('button', { name: 'FX Off', exact: true });
    if (await toggle.count()) await toggle.first().click().catch(() => {});
  }
  await ensurePlaying();
  await centerElement(driftTitle, 250);
  mark('texture-live-start');
  await screenshot('09-texture-live');
  await sleep(8000);
  mark('texture-live-end');

  await page.keyboard.press('=').catch(() => {});
  await sleep(1500);
  if (await page.getByRole('button', { name: 'Show Visualizer', exact: true }).count()) {
    await clickButton('Show Visualizer').catch(() => false);
  }
  await ensurePlaying();
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(1300);
  mark('visualizer-live-start');
  await screenshot('10-visualizer-live');
  await sleep(12000);
  mark('visualizer-live-end');

  fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify(timeline, null, 2));
} catch (error) {
  logs.push(`[fatal] ${error?.stack || error}`);
  await screenshot('99-failure').catch(() => {});
  process.exitCode = 1;
} finally {
  mark('audio-recording-end');
  await stopPulseRecording().catch(() => {});
  fs.writeFileSync(path.join(OUT, 'capture.log'), `${logs.join('\n')}\n`);
  if (!fs.existsSync(path.join(OUT, 'timeline.json'))) fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify(timeline, null, 2));
  await page.close().catch(() => {});
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
