import fs from 'node:fs';
import { spawn } from 'node:child_process';

const enginePath = 'src/audio/reference/webTs/engine.ts';
const capturePath = 'scripts/promo-sequencer-recapture.mjs';

let engine = fs.readFileSync(enginePath, 'utf8');
const startAnchor = `    this.ensureTransportAnchors();\n\n    // iOS audio unlock with silent buffer`;
const startPatch = `    this.ensureTransportAnchors();\n\n    // Temporary promo capture mode: keep Kessho's real transport, harmony,\n    // random-walk, and sequencer schedulers active while bypassing DSP worklets.\n    const promoVisualOnly = typeof window !== 'undefined'\n      && new URLSearchParams(window.location.search).get('promoVisual') === '1';\n    if (promoVisualOnly) {\n      console.log('[promoVisual] starting scheduler-only Web TS runtime');\n      this.initializeHarmony();\n      this.isRunning = true;\n      this.isStarting = false;\n      this.schedulePhraseUpdates();\n      this.syncLeadMorphRandomWalk();\n      this.syncRuntimeRandomWalk();\n      this.syncRuntimeAutoMorph();\n      this.stopSynthEuclidScheduler();\n      if (this.sliderState?.synthEuclideanMasterEnabled) this.startSynthEuclidScheduler();\n      this.notifyStateChange();\n      return;\n    }\n\n    // iOS audio unlock with silent buffer`;
if (!engine.includes(startAnchor)) throw new Error('Could not locate Web TS start anchor');
engine = engine.replace(startAnchor, startPatch);

const updateAnchor = `    // If engine is in the middle of starting, skip all audio operations.\n    // start() will apply params with the final sliderState when ready.`;
const updatePatch = `    const promoVisualOnlyUpdate = typeof window !== 'undefined'\n      && new URLSearchParams(window.location.search).get('promoVisual') === '1';\n    if (promoVisualOnlyUpdate) {\n      if (effectiveState.synthEuclideanMasterEnabled && !this.synthEuclidScheduleTimer && !this.synthEuclidStarting) {\n        this.startSynthEuclidScheduler();\n      } else if (!effectiveState.synthEuclideanMasterEnabled && (this.synthEuclidScheduleTimer || this.synthEuclidStarting)) {\n        this.stopSynthEuclidScheduler();\n      }\n      this.notifyStateChange();\n      return;\n    }\n\n    // If engine is in the middle of starting, skip all audio operations.\n    // start() will apply params with the final sliderState when ready.`;
if (!engine.includes(updateAnchor)) throw new Error('Could not locate Web TS updateParams anchor');
engine = engine.replace(updateAnchor, updatePatch);
fs.writeFileSync(enginePath, engine);

let capture = fs.readFileSync(capturePath, 'utf8');
capture = capture.replaceAll(
  'http://127.0.0.1:5173/?engine=web-ts',
  'http://127.0.0.1:5173/?engine=web-ts&promoVisual=1',
);
const oldNav = `  const navSynth = async () => { await page.keyboard.press('2'); await wait(page,700); await clickButton('Synth').catch(()=>false); await wait(page,700); await clickButton(/DETAIL/i,false).catch(()=>false); await wait(page,700); };\n  const selectMode = async (mode) => { if(!(await clickButton(mode))) { if(mode==='Step') await clickButton('Euclid').catch(()=>false); } await wait(page,700); };`;
const newNav = `  const navSynth = async () => {\n    await page.keyboard.press('2'); await wait(page,700);\n    await clickButton('Synth').catch(()=>false); await wait(page,700);\n    const detail = page.locator('button.seq-view-btn').filter({ hasText: /^Detail$/i }).first();\n    await detail.waitFor({ state: 'visible' });\n    await detail.click();\n    await page.locator('.seq-tab-bar').first().waitFor({ state: 'visible' });\n    logs.push('[view] Synth DETAIL visible');\n    await wait(page,700);\n  };\n  const selectMode = async (mode) => {\n    const group = page.getByRole('group', { name: /Seq \\d+ type/i }).first();\n    await group.waitFor({ state: 'visible' });\n    await group.scrollIntoViewIfNeeded();\n    const button = group.getByRole('button', { name: mode, exact: true });\n    await button.click();\n    logs.push(\`[mode] selected \${mode}\`);\n    await wait(page,700);\n  };`;
if (!capture.includes(oldNav)) throw new Error('Could not locate recapture navigation helpers');
capture = capture.replace(oldNav, newNav);
capture = capture.replace(
  `    await ensureSequencerPlaying('STEP');\n    await segment('step-playing-synth-seq-teset', 9000);`,
  `    await ensureSequencerPlaying('STEP');\n    await page.getByRole('group', { name: /Seq \\d+ type/i }).first().scrollIntoViewIfNeeded();\n    await page.evaluate(() => window.scrollBy(0, -180));\n    await wait(page,700);\n    await segment('step-playing-synth-seq-teset', 9000);`,
);
capture = capture.replace(
  `    await ensureSequencerPlaying('ORBIT');\n    await segment('orbit-playing-string-waves-dynamic', 10000);`,
  `    await ensureSequencerPlaying('ORBIT');\n    await page.getByRole('group', { name: /Seq \\d+ type/i }).first().scrollIntoViewIfNeeded();\n    await page.evaluate(() => window.scrollBy(0, -180));\n    await wait(page,700);\n    await segment('orbit-playing-string-waves-dynamic', 10000);`,
);
fs.writeFileSync(capturePath, capture);

const child = spawn(process.execPath, [capturePath], { stdio: 'inherit' });
child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`capture terminated by ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
