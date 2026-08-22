import fs from 'node:fs';
import { spawn } from 'node:child_process';

const enginePath = 'src/audio/reference/webTs/engine.ts';
const capturePath = 'scripts/promo-visual-capture-final.mjs';

let engine = fs.readFileSync(enginePath, 'utf8');
const startAnchor = `    this.ensureTransportAnchors();\n\n    // iOS audio unlock with silent buffer`;
const startPatch = `    this.ensureTransportAnchors();\n\n    // Temporary promo capture mode: keep Kessho's real transport, harmony,\n    // random-walk, and sequencer schedulers active while bypassing DSP worklets.\n    // This branch is never committed to the product runtime.\n    const promoVisualOnly = typeof window !== 'undefined'\n      && new URLSearchParams(window.location.search).get('promoVisual') === '1';\n    if (promoVisualOnly) {\n      console.log('[promoVisual] starting scheduler-only Web TS runtime');\n      this.initializeHarmony();\n      this.isRunning = true;\n      this.isStarting = false;\n      this.schedulePhraseUpdates();\n      this.syncLeadMorphRandomWalk();\n      this.syncRuntimeRandomWalk();\n      this.syncRuntimeAutoMorph();\n      this.stopSynthEuclidScheduler();\n      if (this.sliderState?.synthEuclideanMasterEnabled) {\n        this.startSynthEuclidScheduler();\n      }\n      this.notifyStateChange();\n      return;\n    }\n\n    // iOS audio unlock with silent buffer`;
if (!engine.includes(startAnchor)) throw new Error('Could not locate Web TS start anchor');
engine = engine.replace(startAnchor, startPatch);

const updateAnchor = `    // If engine is in the middle of starting, skip all audio operations.\n    // start() will apply params with the final sliderState when ready.`;
const updatePatch = `    const promoVisualOnlyUpdate = typeof window !== 'undefined'\n      && new URLSearchParams(window.location.search).get('promoVisual') === '1';\n    if (promoVisualOnlyUpdate) {\n      // Preserve the real Step/Euclid scheduler and all runtime walk/auto-morph\n      // updates above, but do not construct or mutate the DSP graph.\n      if (effectiveState.synthEuclideanMasterEnabled && !this.synthEuclidScheduleTimer && !this.synthEuclidStarting) {\n        this.startSynthEuclidScheduler();\n      } else if (!effectiveState.synthEuclideanMasterEnabled && (this.synthEuclidScheduleTimer || this.synthEuclidStarting)) {\n        this.stopSynthEuclidScheduler();\n      }\n      this.notifyStateChange();\n      return;\n    }\n\n    // If engine is in the middle of starting, skip all audio operations.\n    // start() will apply params with the final sliderState when ready.`;
if (!engine.includes(updateAnchor)) throw new Error('Could not locate Web TS updateParams anchor');
engine = engine.replace(updateAnchor, updatePatch);
fs.writeFileSync(enginePath, engine);

let capture = fs.readFileSync(capturePath, 'utf8');
capture = capture.replace(
  'http://127.0.0.1:5173/?engine=web-ts',
  'http://127.0.0.1:5173/?engine=web-ts&promoVisual=1',
);

// Current SynthPage labels the Step engine "Euclid" and renders the view-mode
// buttons in uppercase. Make the automation follow the current real UI.
capture = capture.replace(
  "await clickButton('Detail').catch(() => false);",
  "await clickButton(/DETAIL/i, false).catch(() => false);",
);
capture = capture.replace(
  "    await clickButton('Step').catch(() => false);\n    await sleep(page, 800);\n    const off = page.getByRole('button', { name: 'Off', exact: true });\n    if (await off.count() && await off.first().isVisible().catch(() => false)) await off.first().click();\n    await sleep(page, 1000);\n    await center(page.getByRole('button', { name: 'Step', exact: true }), 300);\n    await segment('step-live', 9000);",
  "    await clickButton('Euclid').catch(() => false);\n    await sleep(page, 700);\n    const seqPlay = page.getByRole('button', { name: '▶', exact: true });\n    if (await seqPlay.count() && await seqPlay.first().isVisible().catch(() => false)) {\n      await seqPlay.first().click();\n      logs.push('[sequencer] synth transport started');\n    }\n    await sleep(page, 1200);\n    await center(page.getByRole('button', { name: 'Euclid', exact: true }), 300);\n    await segment('step-live', 9000);",
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
