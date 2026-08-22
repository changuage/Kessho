import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('promo-capture-v3-artifacts');
fs.mkdirSync(OUT, { recursive: true });
const network = [];
let matchCount = 0;

const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'],
});
const context = await browser.newContext({ viewport: { width: 2560, height: 1440 } });
const page = await context.newPage();
page.setDefaultTimeout(25000);

page.on('response', async (response) => {
  const url = response.url();
  if (!/supabase|preset|rest\/v1|functions\/v1/i.test(url)) return;
  try {
    const ct = response.headers()['content-type'] || '';
    if (!/json|text/i.test(ct)) {
      network.push(`${response.status()} ${url} [${ct}]`);
      return;
    }
    const text = await response.text();
    network.push(`${response.status()} ${url} [${ct}] ${text.length} bytes`);
    if (/STring Waves Dynamics TEst|String Waves Dynamic/i.test(text)) {
      const safe = String(matchCount++).padStart(2, '0');
      fs.writeFileSync(path.join(OUT, `dynamic-network-${safe}.json`), text);
      fs.writeFileSync(path.join(OUT, `dynamic-network-${safe}.url.txt`), url);
    }
  } catch (error) {
    network.push(`ERR ${url} ${String(error)}`);
  }
});

try {
  await page.goto('https://kessho.vercel.app/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(14000);
  const presetButton = page.locator('button[title="Presets"]');
  await presetButton.first().click();
  const dialog = page.getByRole('dialog', { name: 'Snowflake preset loader' });
  await dialog.waitFor({ state: 'visible' });
  await dialog.getByPlaceholder('Search').fill('String Waves Dynamic');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'extract-preset-search.png') });
  const loadButtons = dialog.locator('button[title^="Load "]');
  for (let i = 0; i < await loadButtons.count(); i++) {
    const b = loadButtons.nth(i);
    if (!(await b.isVisible().catch(() => false))) continue;
    const title = await b.getAttribute('title');
    if (/string waves dynamic/i.test(title || '')) {
      await b.click();
      break;
    }
  }
  await page.waitForTimeout(4500);
  await page.screenshot({ path: path.join(OUT, 'extract-preset-loaded.png') });
  const storage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
  fs.writeFileSync(path.join(OUT, 'browser-storage.json'), JSON.stringify(storage, null, 2));
} finally {
  fs.writeFileSync(path.join(OUT, 'network.log'), network.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'extract-summary.json'), JSON.stringify({ matchCount }, null, 2));
  await browser.close();
}
