import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('promo-sequencer-recapture-artifacts');
const VIDEO_DIR = path.join(OUT, 'video');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(VIDEO_DIR, { recursive: true });
const logs = [];
const timeline = [];
const t0 = Date.now();
const wait = (page, ms) => page.waitForTimeout(ms);
const mark = (name) => { const ms = Date.now() - t0; timeline.push({ name, ms }); logs.push(`[mark] ${name} ${ms}`); };

const browser = await chromium.launch({
  headless: false,
  args: [
    '--autoplay-policy=no-user-gesture-required',
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
page.setDefaultTimeout(30000);
page.on('console', (m) => logs.push(`[console:${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.stack || e.message}`));
page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} :: ${r.failure()?.errorText || ''}`));

async function shot(name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  fs.writeFileSync(path.join(OUT, `${name}.txt`), await page.locator('body').innerText().catch(() => ''));
}
async function clickVisible(locator) {
  for (let i = 0; i < await locator.count(); i++) {
    const el = locator.nth(i);
    if (await el.isVisible().catch(() => false)) { await el.click(); return el; }
  }
  return null;
}
async function loadCloudPreset() {
  await page.locator('button[title="Presets"]').first().click();
  const dialog = page.getByRole('dialog', { name: 'Snowflake preset loader' });
  await dialog.waitFor({ state: 'visible' });
  await dialog.getByPlaceholder('Search').fill('String Waves Dynamic');
  await wait(page, 1200);
  const loads = dialog.locator('button[title^="Load "]');
  let chosen = null;
  for (let i = 0; i < await loads.count(); i++) {
    const b = loads.nth(i);
    if (!(await b.isVisible().catch(() => false))) continue;
    const title = await b.getAttribute('title');
    if (/STring Waves Dynamics TEst|String Waves Dynamic/i.test(title || '')) { chosen = b; logs.push(`[preset] ${title}`); break; }
  }
  if (!chosen) throw new Error('String Waves Dynamics cloud preset not found');
  await chosen.click();
  await dialog.waitFor({ state: 'hidden', timeout: 20000 });
  await wait(page, 3000);
}
async function navigateOrbit() {
  await page.keyboard.press('2').catch(() => {});
  await wait(page, 800);
  await clickVisible(page.getByRole('button', { name: 'Synth', exact: true }));
  await wait(page, 800);
  const detail = page.locator('button.seq-view-btn').filter({ hasText: /^Detail$/i }).first();
  await detail.waitFor({ state: 'visible' });
  await detail.click();
  await page.locator('.seq-tab-bar').first().waitFor({ state: 'visible' });
  const group = page.locator('.seq-mode-segmented').first();
  await group.waitFor({ state: 'visible' });
  const orbit = group.locator('button').nth(2);
  await orbit.click();
  logs.push(`[mode] ${(await orbit.innerText()).trim()}`);
  await wait(page, 800);
  const spinOff = page.getByRole('button', { name: /SPIN:\s*OFF/i });
  if (await spinOff.count() && await spinOff.first().isVisible().catch(() => false)) {
    await spinOff.first().click();
    logs.push('[orbit] SPIN enabled');
  }
  await group.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -180));
  await wait(page, 500);
}
async function forceLocalPlay() {
  const transport = page.locator('button[data-sequencer-transport="synth"]').first();
  await transport.waitFor({ state: 'visible' });
  const isPlaying = async () => {
    const text = (await transport.innerText().catch(() => '')).trim();
    const cls = await transport.getAttribute('class');
    return text.includes('■') || (cls || '').includes('playing');
  };
  if (await isPlaying()) {
    await transport.click();
    await wait(page, 700);
    logs.push('[sequencer] forced STOP before capture');
  }
  await transport.click();
  await page.waitForFunction(() => {
    const el = document.querySelector('button[data-sequencer-transport="synth"]');
    return !!el && (((el.textContent || '').includes('■')) || el.classList.contains('playing'));
  }, null, { timeout: 15000 });
  logs.push(`[sequencer] PLAY engaged; text=${JSON.stringify((await transport.innerText()).trim())}; class=${await transport.getAttribute('class')}`);
  await wait(page, 2200);
}

try {
  await page.goto('https://kessho.vercel.app/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await wait(page, 14000);
  await loadCloudPreset();
  await navigateOrbit();
  await forceLocalPlay();
  mark('orbit-product-live-start');
  await shot('orbit-product-live-start');
  await wait(page, 12000);
  await shot('orbit-product-live-end');
  mark('orbit-product-live-end');
} catch (error) {
  logs.push(`[fatal] ${error?.stack || error}`);
  await shot('99-failure').catch(() => {});
  process.exitCode = 1;
} finally {
  await page.close().catch(() => {});
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  fs.writeFileSync(path.join(OUT, 'capture.log'), logs.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify(timeline, null, 2));
}
