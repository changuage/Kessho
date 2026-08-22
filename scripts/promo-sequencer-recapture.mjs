import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const OUT = path.resolve('promo-sequencer-recapture-artifacts');
const VIDEO_DIR = path.join(OUT, 'video');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(VIDEO_DIR, { recursive: true });
const logs = [];
const timeline = [];
const t0 = Date.now();
const wait = (p, ms) => p.waitForTimeout(ms);
const mark = (name) => { const ms = Date.now() - t0; timeline.push({ name, ms }); logs.push(`[mark] ${name} ${ms}`); };

const TARGETS = [
  { cloudName: 'Synth Seq Teset', localName: 'Promo Step - Synth Seq Teset', file: 'PromoStepSynthSeqTeset.json' },
  { cloudName: 'STring Waves Dynamics TEst', localName: 'Promo Orbit - String Waves Dynamics', file: 'PromoOrbitStringWavesDynamic.json' },
];

async function extractCloudPreset(target) {
  let manifest = null;
  const browser = await chromium.launch({ headless: true, args: ['--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'] });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('response', async (response) => {
    if (!/kessho_get_preset_latest_manifest_v2/i.test(response.url())) return;
    try {
      const parsed = JSON.parse(await response.text());
      const name = parsed?.preset?.name || parsed?.name || '';
      if (name === target.cloudName) manifest = parsed;
    } catch {}
  });
  try {
    await page.goto('https://kessho.vercel.app/', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await wait(page, 14000);
    await page.locator('button[title="Presets"]').first().click();
    const dialog = page.getByRole('dialog', { name: 'Snowflake preset loader' });
    await dialog.waitFor({ state: 'visible' });
    await dialog.getByPlaceholder('Search').fill(target.cloudName);
    await wait(page, 1000);
    const buttons = dialog.locator('button[title^="Load "]');
    let clicked = false;
    for (let i = 0; i < await buttons.count(); i++) {
      const b = buttons.nth(i);
      const title = await b.getAttribute('title');
      if (title === `Load ${target.cloudName}` && await b.isVisible().catch(() => false)) {
        await b.click(); clicked = true; break;
      }
    }
    if (!clicked) {
      const exact = dialog.getByText(target.cloudName, { exact: true }).first();
      if (!(await exact.count())) throw new Error(`Preset not found: ${target.cloudName}`);
      const button = exact.locator('xpath=ancestor::button[1]');
      if (await button.count()) await button.click(); else await exact.click();
    }
    await dialog.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
    await wait(page, 5000);
    if (!manifest) throw new Error(`No manifest captured for ${target.cloudName}`);
    const storage = await page.evaluate(() => ({ ...localStorage }));
    const resolvedHash = manifest?.preset?.latest_resolved_hash || manifest?.latest_version?.resolved_hash;
    const metadataHash = manifest?.preset?.latest_metadata_hash || manifest?.latest_version?.metadata_hash;
    const readPayload = (hash) => {
      if (!hash) return null;
      const raw = storage[`kessho:presetPayload:v2:${hash}`];
      return raw ? JSON.parse(raw).payload : null;
    };
    const statePayload = readPayload(resolvedHash);
    const metadataPayload = readPayload(metadataHash) || {};
    if (!statePayload) throw new Error(`Missing resolved state payload for ${target.cloudName}`);
    const bundled = {
      id: manifest?.preset?.id || `promo-${target.file}`,
      name: target.localName,
      timestamp: manifest?.preset?.updated_at || new Date().toISOString(),
      state: statePayload,
      ...metadataPayload,
    };
    fs.writeFileSync(`public/presets/${target.file}`, JSON.stringify(bundled, null, 2));
    logs.push(`[preset] ${target.cloudName} -> ${target.localName}; stateKeys=${Object.keys(statePayload).length}; resolved=${resolvedHash}`);
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function extractPresets() {
  for (const target of TARGETS) await extractCloudPreset(target);
  const p = 'public/presets/manifest.json';
  const m = JSON.parse(fs.readFileSync(p, 'utf8'));
  m.files = Array.from(new Set([...(m.files || []), ...TARGETS.map((x) => x.file)]));
  fs.writeFileSync(p, JSON.stringify(m, null, 2) + '\n');
}

function startVite() {
  const fd = fs.openSync(path.join(OUT, 'vite.log'), 'a');
  return spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1'], { stdio: ['ignore', fd, fd], env: { ...process.env } });
}
async function waitForVite() {
  for (let i=0;i<90;i++) { try { const r=await fetch('http://127.0.0.1:5173/'); if(r.ok) return; } catch {} await new Promise(r=>setTimeout(r,1000)); }
  throw new Error('Vite did not become ready');
}

async function capture() {
  const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required','--enable-webgl','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'] });
  const context = await browser.newContext({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1, recordVideo: { dir: VIDEO_DIR, size: { width: 2560, height: 1440 } } });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  page.on('console', m => logs.push(`[console:${m.type()}] ${m.text()}`));
  page.on('pageerror', e => logs.push(`[pageerror] ${e.stack || e.message}`));

  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); fs.writeFileSync(path.join(OUT, `${name}.txt`), await page.locator('body').innerText().catch(()=>'')); };
  const clickButton = async (name, exact=true) => { const loc=page.getByRole('button',{name,exact}); for(let i=0;i<await loc.count();i++){const e=loc.nth(i); if(await e.isVisible().catch(()=>false)){await e.click(); return true;}} return false; };
  const visibleGlyphButton = async (glyph) => { const bs=page.locator('button'); for(let i=0;i<await bs.count();i++){const b=bs.nth(i); if(await b.isVisible().catch(()=>false) && (await b.innerText().catch(()=>'' )).includes(glyph)) return b;} return null; };
  const globalPlaying = async () => { const stop=page.locator('button[title="Stop"]'); if(await stop.count() && await stop.first().isVisible().catch(()=>false)) return true; return Boolean(await visibleGlyphButton('■')); };
  const ensureGlobalPlaying = async () => { if(await globalPlaying()) return; const start=page.locator('button[title="Start"]'); if(await start.count() && await start.first().isVisible().catch(()=>false)) await start.first().click(); else { const p=await visibleGlyphButton('▶'); if(!p) throw new Error('Global play not found'); await p.click(); } await wait(page,1200); };
  const loadLocal = async (target) => {
    await page.locator('button[title="Presets"]').first().click();
    const dialog=page.getByRole('dialog',{name:'Snowflake preset loader'}); await dialog.waitFor({state:'visible'});
    await dialog.getByPlaceholder('Search').fill(target.localName); await wait(page,500);
    const load=dialog.locator(`button[title="Load ${target.localName}"]`);
    if(!(await load.count())) throw new Error(`Local preset missing: ${target.localName}`);
    await load.first().click(); await dialog.waitFor({state:'hidden',timeout:20000}); await wait(page,1800);
    logs.push(`[preset-loaded] ${target.localName}`);
  };
  const navSynth = async () => { await page.keyboard.press('2'); await wait(page,700); await clickButton('Synth').catch(()=>false); await wait(page,700); await clickButton(/DETAIL/i,false).catch(()=>false); await wait(page,700); };
  const selectMode = async (mode) => { if(!(await clickButton(mode))) { if(mode==='Step') await clickButton('Euclid').catch(()=>false); } await wait(page,700); };
  const ensureSequencerPlaying = async (label) => {
    const b=page.locator('button[data-sequencer-transport="synth"]').first();
    await b.waitFor({state:'visible'}); await b.scrollIntoViewIfNeeded();
    const before=(await b.innerText()).trim();
    const beforeClass=await b.getAttribute('class');
    const wasPlaying=before.includes('■') || (beforeClass||'').includes('playing');
    if(!wasPlaying) await b.click();
    await page.waitForFunction(() => { const el=document.querySelector('button[data-sequencer-transport="synth"]'); return !!el && (((el.textContent||'').includes('■')) || el.classList.contains('playing')); }, null, { timeout: 10000 });
    logs.push(`[sequencer] ${label} local PLAY engaged; before=${JSON.stringify(before)} after=${JSON.stringify((await b.innerText()).trim())} class=${await b.getAttribute('class')}`);
    await wait(page,900);
  };
  const stopSequencer = async () => { const b=page.locator('button[data-sequencer-transport="synth"]').first(); if(await b.count()){const text=(await b.innerText().catch(()=>'')); const cls=await b.getAttribute('class'); if(text.includes('■') || (cls||'').includes('playing')) { await b.click(); await wait(page,500); }} };
  const segment = async (name, ms) => { mark(`${name}-start`); await shot(`${name}-start`); await wait(page,ms); await shot(`${name}-end`); mark(`${name}-end`); };

  try {
    await page.goto('http://127.0.0.1:5173/?engine=web-ts', { waitUntil:'domcontentloaded', timeout:120000 });
    await wait(page,12000);

    await loadLocal(TARGETS[0]);
    await ensureGlobalPlaying();
    await navSynth();
    await selectMode('Step');
    await ensureSequencerPlaying('STEP');
    await segment('step-playing-synth-seq-teset', 9000);
    await stopSequencer();

    await loadLocal(TARGETS[1]);
    await ensureGlobalPlaying();
    await navSynth();
    await selectMode('Orbit');
    const spinOff=page.getByRole('button',{name:/SPIN.*OFF/i}); if(await spinOff.count() && await spinOff.first().isVisible().catch(()=>false)) await spinOff.first().click();
    await ensureSequencerPlaying('ORBIT');
    await segment('orbit-playing-string-waves-dynamic', 10000);
  } catch(e) { logs.push(`[fatal] ${e?.stack||e}`); await shot('99-failure').catch(()=>{}); throw e; }
  finally { await page.close().catch(()=>{}); await context.close().catch(()=>{}); await browser.close().catch(()=>{}); }
}

let vite=null;
try { await extractPresets(); vite=startVite(); await waitForVite(); logs.push('[vite] ready'); await capture(); }
catch(e){ logs.push(`[fatal-top] ${e?.stack||e}`); process.exitCode=1; }
finally { if(vite) vite.kill('SIGTERM'); fs.writeFileSync(path.join(OUT,'capture.log'),logs.join('\n')+'\n'); fs.writeFileSync(path.join(OUT,'timeline.json'),JSON.stringify(timeline,null,2)); }
