import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('promo-capture-v3-artifacts');
fs.mkdirSync(OUT, { recursive: true });

const url = 'http://127.0.0.1:5173/?engine=core-product&parity=1&capture=1';
const browser = await chromium.launch({
  headless: true,
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ],
});
const page = await browser.newPage();
page.setDefaultTimeout(90000);
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText || ''}`));

function stats(left, right) {
  let peak = 0, sum = 0;
  for (let i = 0; i < left.length; i++) {
    const l = left[i] || 0, r = right[i] || 0;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    sum += l*l + r*r;
  }
  return { peak, rms: Math.sqrt(sum / Math.max(1, left.length * 2)) };
}

function writeFloatWav(file, left, right, sampleRate) {
  const frames = Math.min(left.length, right.length);
  const channels = 2, bits = 32, blockAlign = channels * 4, byteRate = sampleRate * blockAlign;
  const dataBytes = frames * blockAlign;
  const b = Buffer.alloc(44 + dataBytes);
  b.write('RIFF', 0); b.writeUInt32LE(36 + dataBytes, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(3, 20); // IEEE float
  b.writeUInt16LE(channels, 22); b.writeUInt32LE(sampleRate, 24); b.writeUInt32LE(byteRate, 28);
  b.writeUInt16LE(blockAlign, 32); b.writeUInt16LE(bits, 34);
  b.write('data', 36); b.writeUInt32LE(dataBytes, 40);
  let o = 44;
  for (let i = 0; i < frames; i++) {
    b.writeFloatLE(Number.isFinite(left[i]) ? left[i] : 0, o); o += 4;
    b.writeFloatLE(Number.isFinite(right[i]) ? right[i] : 0, o); o += 4;
  }
  fs.writeFileSync(file, b);
}

const phrases = [
  { name: 'A', notes: [48, 55, 60, 64], lead: 72 },
  { name: 'B', notes: [50, 57, 62, 65], lead: 74 },
  { name: 'C', notes: [45, 52, 57, 60], lead: 69 },
  { name: 'D', notes: [48, 55, 59, 64], lead: 71 },
];

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => Boolean(window.__kesshoSonicParity?.capture) || Boolean(document.documentElement.dataset.coreProductRuntimeError), null, { timeout: 90000 });
  const diagnostic = await page.evaluate(() => ({
    harness: Boolean(window.__kesshoSonicParity?.capture),
    phase: document.documentElement.dataset.coreProductRuntimePhase ?? null,
    error: document.documentElement.dataset.coreProductRuntimeError ?? null,
  }));
  logs.push(`[diagnostic] ${JSON.stringify(diagnostic)}`);
  if (!diagnostic.harness) throw new Error(`Product Core parity harness unavailable: ${JSON.stringify(diagnostic)}`);

  const manifest = [];
  for (const phrase of phrases) {
    const manualNotes = [
      ...phrase.notes.map((midi, i) => ({ source: i < 2 ? 'pad1' : 'pad2', midi, velocity: i === 0 ? 0.68 : 0.57, durationMs: 6500 })),
      { source: 'lead1', midi: phrase.lead, velocity: 0.38, durationMs: 1500 },
    ];
    const capture = await page.evaluate(async ({ manualNotes }) => window.__kesshoSonicParity.capture({
      durationMs: 7500,
      settleMs: 250,
      trackId: 'mix',
      statePatch: {
        synthLevel: 0.78,
        padLevel: 0.78,
        leadLevel: 0.45,
        reverbWet: 0.42,
        reverbLevel: 0.42,
        delayWet: 0.16,
      },
      stateEvents: [],
      manualNotes,
      manualDrumTriggers: [],
      manualTriggerDelayMs: 120,
      manualWarmup: true,
    }), { manualNotes });
    const s = stats(capture.left, capture.right);
    if (!(s.rms > 0.00005)) throw new Error(`Product Core phrase ${phrase.name} is silent: ${JSON.stringify(s)}`);
    const file = path.join(OUT, `product-core-phrase-${phrase.name}.wav`);
    writeFloatWav(file, capture.left, capture.right, capture.sampleRate);
    manifest.push({ name: phrase.name, file: path.basename(file), sampleRate: capture.sampleRate, frames: capture.frames, ...s });
    logs.push(`[phrase ${phrase.name}] ${JSON.stringify(manifest.at(-1))}`);
  }
  fs.writeFileSync(path.join(OUT, 'product-core-audio-manifest.json'), JSON.stringify(manifest, null, 2));
  await page.evaluate(() => window.__kesshoSonicParity?.teardown?.()).catch(() => {});
} catch (error) {
  logs.push(`[fatal] ${error?.stack || error}`);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(OUT, 'product-core-audio.log'), logs.join('\n') + '\n');
  await browser.close().catch(() => {});
}
