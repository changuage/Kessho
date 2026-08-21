import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('promo-capture-artifacts');
const VIDEO_DIR = path.join(OUT, 'video');
fs.mkdirSync(VIDEO_DIR, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--enable-unsafe-swiftshader',
    '--use-gl=swiftshader',
    '--disable-dev-shm-usage',
  ],
});

const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  recordVideo: { dir: VIDEO_DIR, size: { width: 1920, height: 1080 } },
});

const page = await context.newPage();
const logs = [];
page.on('console', (msg) => logs.push(`[console:${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => logs.push(`[pageerror] ${err.stack || err.message}`));
page.on('requestfailed', (req) => logs.push(`[requestfailed] ${req.url()} :: ${req.failure()?.errorText || ''}`));

const settle = (ms = 2500) => page.waitForTimeout(ms);

async function capture(name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  const text = await page.locator('body').innerText().catch(() => '');
  const buttons = await page.locator('button').evaluateAll((nodes) => nodes.map((node) => ({
    text: (node.textContent || '').trim(),
    aria: node.getAttribute('aria-label'),
    title: node.getAttribute('title'),
    disabled: node.disabled,
  })));
  fs.writeFileSync(path.join(OUT, `${name}.txt`), `${text}\n\nBUTTONS\n${JSON.stringify(buttons, null, 2)}\n`);
}

async function clickExact(label) {
  const role = page.getByRole('button', { name: label, exact: true });
  for (let i = 0; i < await role.count(); i += 1) {
    const button = role.nth(i);
    if (await button.isVisible().catch(() => false)) {
      await button.scrollIntoViewIfNeeded().catch(() => {});
      await button.click({ timeout: 8000 });
      return true;
    }
  }
  const textButtons = page.locator('button').filter({ hasText: label });
  for (let i = 0; i < await textButtons.count(); i += 1) {
    const button = textButtons.nth(i);
    if (await button.isVisible().catch(() => false)) {
      await button.scrollIntoViewIfNeeded().catch(() => {});
      await button.click({ timeout: 8000 });
      return true;
    }
  }
  return false;
}

async function ensurePlayback() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const stop = page.locator('button[title="Stop"]');
    if (await stop.count() && await stop.first().isVisible().catch(() => false)) {
      logs.push('[capture] playback already running');
      return true;
    }
    const start = page.locator('button[title="Start"]');
    if (await start.count() && await start.first().isVisible().catch(() => false)) {
      await start.first().click({ timeout: 8000 });
      logs.push(`[capture] clicked Start attempt ${attempt + 1}`);
      await settle(10000);
      continue;
    }
    const playGlyph = page.locator('button').filter({ hasText: '▶' }).first();
    if (await playGlyph.isVisible().catch(() => false)) {
      await playGlyph.click({ timeout: 8000 }).catch(() => {});
      logs.push(`[capture] clicked play glyph attempt ${attempt + 1}`);
      await settle(10000);
    }
  }
  const running = await page.locator('button[title="Stop"]').count() > 0;
  logs.push(`[capture] playback running: ${running}`);
  return running;
}

async function goSynth() {
  await page.keyboard.press('2').catch(() => {});
  await settle(1200);
  await clickExact('Synth').catch(() => false);
  await settle(5000);
}

try {
  await page.goto('https://kessho.vercel.app', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await settle(16000); // allow cloud auto-start preset to finish loading before playback

  await page.mouse.click(960, 540).catch(() => {});
  await goSynth();
  await capture('00-synth-loaded');

  await ensurePlayback();
  await settle(7000);
  await capture('01-synth-playing');

  // The Step / Walker / Orbit type selector is exposed in Detail view.
  await clickExact('Detail').catch(() => false);
  await settle(5000);
  await capture('02-synth-detail');

  if (await clickExact('Step')) {
    await settle(7000);
    await capture('03-sequencer-step');
  } else {
    logs.push('[capture] Step button not found');
  }

  if (await clickExact('Orbit')) {
    await settle(10000);
    await capture('04-sequencer-orbit');
  } else {
    logs.push('[capture] Orbit button not found');
  }

  if (await clickExact('Walker')) {
    await settle(9000);
    await capture('05-sequencer-walker');
  } else {
    logs.push('[capture] Walker button not found');
  }

  // Return to Orbit for a longer clean moving take.
  if (await clickExact('Orbit')) {
    await settle(12000);
    await capture('06-orbit-hero');
  }

  // Reactive visualizer through the same production UI.
  const vizMode = page.locator('button[aria-label="Visualizer Mode"]');
  if (await vizMode.count() && await vizMode.first().isVisible().catch(() => false)) {
    await vizMode.first().click({ timeout: 8000 });
  } else {
    await page.keyboard.press('=').catch(() => {});
  }
  await settle(4000);

  if (await clickExact('Enable Visualizer')) {
    logs.push('[capture] enabled reactive visualizer');
    await settle(18000);
  } else {
    logs.push('[capture] visualizer enable button not present (possibly already enabled)');
    await settle(12000);
  }
  await capture('07-reactive-visualizer-enabled');

  // Hold the visualizer for an additional edit-safe segment.
  await settle(15000);
  await capture('08-reactive-visualizer-hero');
} catch (error) {
  logs.push(`[fatal] ${error?.stack || error}`);
  await capture('99-failure').catch(() => {});
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(OUT, 'capture.log'), `${logs.join('\n')}\n`);
  await page.close().catch(() => {});
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
