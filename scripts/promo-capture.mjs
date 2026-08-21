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

async function settle(ms = 2500) {
  await page.waitForTimeout(ms);
}

async function capture(name, fullPage = false) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage });
  const text = await page.locator('body').innerText().catch(() => '');
  const buttons = await page.locator('button').evaluateAll((nodes) => nodes.map((node) => ({
    text: (node.textContent || '').trim(),
    aria: node.getAttribute('aria-label'),
    title: node.getAttribute('title'),
    disabled: node.disabled,
  })));
  fs.writeFileSync(path.join(OUT, `${name}.txt`), `${text}\n\nBUTTONS\n${JSON.stringify(buttons, null, 2)}\n`);
}

async function clickButtonExact(label) {
  const byRole = page.getByRole('button', { name: label, exact: true });
  if (await byRole.count()) {
    const first = byRole.first();
    if (await first.isVisible().catch(() => false)) {
      await first.click({ timeout: 5000 });
      return true;
    }
  }
  const byText = page.locator('button').filter({ hasText: label });
  for (let i = 0; i < await byText.count(); i += 1) {
    const candidate = byText.nth(i);
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click({ timeout: 5000 });
      return true;
    }
  }
  return false;
}

async function clickAny(labels) {
  for (const label of labels) {
    if (await clickButtonExact(label)) return label;
  }
  return null;
}

async function tryStartPlayback() {
  const candidates = page.locator('button');
  const count = await candidates.count();
  for (let i = 0; i < count; i += 1) {
    const button = candidates.nth(i);
    if (!(await button.isVisible().catch(() => false))) continue;
    const meta = await button.evaluate((node) => `${node.getAttribute('aria-label') || ''} ${node.getAttribute('title') || ''} ${node.textContent || ''}`.trim());
    if (/stop/i.test(meta)) continue;
    if (/(^|\s)(start|play|begin)(\s|$)|▶|►/i.test(meta)) {
      await button.click({ timeout: 5000 }).catch(() => {});
      logs.push(`[capture] clicked playback candidate: ${meta}`);
      await settle(5000);
      return true;
    }
  }
  logs.push('[capture] no playback button candidate found');
  return false;
}

async function openAdvancedTab(shortcut, label, name, hold = 3500) {
  await page.keyboard.press(shortcut).catch(() => {});
  await settle(1200);
  await clickButtonExact(label).catch(() => false);
  await settle(hold);
  await capture(name);
}

try {
  await page.goto('https://kessho.vercel.app', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await settle(10000);
  await capture('00-home');

  await page.mouse.click(960, 540).catch(() => {});
  await tryStartPlayback();
  await capture('01-playing-home');

  await openAdvancedTab('2', 'Synth', '02-synth', 4500);

  if (await clickButtonExact('Step')) {
    await settle(4500);
    await capture('03-sequencer-step');
  }
  if (await clickButtonExact('Orbit')) {
    await settle(8000);
    await capture('04-sequencer-orbit');
  }
  if (await clickButtonExact('Walker')) {
    await settle(6500);
    await capture('05-sequencer-walker');
  }
  await clickButtonExact('Step').catch(() => false);
  await settle(2500);

  await openAdvancedTab('3', 'Drums', '06-drums', 4500);
  await openAdvancedTab('4', 'Earth', '07-earth', 4500);
  await openAdvancedTab('5', 'Granular', '08-granular', 6500);
  await openAdvancedTab('6', 'Delay', '09-delay', 5000);
  await openAdvancedTab('7', 'Reverb', '10-reverb', 5000);
  await openAdvancedTab('8', 'Texture', '11-texture', 5000);
  await openAdvancedTab('1', 'Patch', '12-patch', 3500);

  await page.keyboard.press('=').catch(() => {});
  await settle(1500);
  await clickAny(['Visualizer', 'Visualiser']).catch(() => null);
  await settle(12000);
  await capture('13-reactive-visualizer');

  await openAdvancedTab('2', 'Synth', '14-synth-final', 5000);
  await clickButtonExact('Orbit').catch(() => false);
  await settle(7000);
  await capture('15-orbit-final');
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
