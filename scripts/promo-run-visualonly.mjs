import fs from 'node:fs';
import { spawn } from 'node:child_process';

const enginePath = 'src/audio/reference/webTs/engine.ts';
const capturePath = 'scripts/promo-sequencer-recapture.mjs';
const orbitCanvasPath = 'src/ui/sequencer/OrbitSequencerCanvas.tsx';

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

// Capture-only fallback for Web TS: animate the real Orbit canvas with the same
// orbit speed/direction math whenever local sequencer Play is active and native
// runtime telemetry is unavailable. This is UI/runtime motion, not a video overlay.
let orbitCanvas = fs.readFileSync(orbitCanvasPath, 'utf8');
const importNeedle = `  ORBIT_RADIUS_SCALE,\n  cartesianToPolar,`;
const importPatch = `  ORBIT_RADIUS_SCALE,\n  adjustedOrbitSpeedValue,\n  cartesianToPolar,\n  directionSign,\n  effectiveOrbitDirection,\n  orbitSpeedOffsetStats,\n  resolveAngularSpeed,`;
if (!orbitCanvas.includes(importNeedle)) throw new Error('Orbit math import anchor missing');
orbitCanvas = orbitCanvas.replace(importNeedle, importPatch);
const effectNeedle = `  useEffect(() => {\n    drawStaticOrbit();\n  }, [active, canAnimate, config, drawStaticOrbit, playbackEditActive, runtimeVisualState, selectedNoteId]);\n\n  useEffect(() => {\n    const canvas = canvasRef.current;`;
const effectPatch = `  useEffect(() => {\n    drawStaticOrbit();\n  }, [active, canAnimate, config, drawStaticOrbit, playbackEditActive, runtimeVisualState, selectedNoteId]);\n\n  useEffect(() => {\n    const promoVisualOnly = typeof window !== 'undefined'\n      && new URLSearchParams(window.location.search).get('promoVisual') === '1';\n    if (!promoVisualOnly || !canAnimate || !active || runtimeVisualState) return;\n    let raf = 0;\n    let last = performance.now();\n    const tick = (now: number) => {\n      if (!activeRef.current || runtimeVisualStateRef.current) return;\n      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));\n      last = now;\n      const configNow = configRef.current;\n      const stats = orbitSpeedOffsetStats(configNow.notes);\n      for (let index = 0; index < configNow.notes.length; index += 1) {\n        const note = configNow.notes[index];\n        if (!note || !note.enabled) continue;\n        const runtime = runtimeRef.current.get(note.id);\n        if (!runtime) continue;\n        const adjusted = adjustedOrbitSpeedValue(\n          note.speedMode, note.speedValue, note.radiusNorm, configNow.speedOffset, stats,\n        );\n        const speed = resolveAngularSpeed(note.speedMode, adjusted, configNow.bpmPercent, 60);\n        const direction = effectiveOrbitDirection(note.direction, index, configNow);\n        const nextAngle = runtime.angle + directionSign(direction) * speed * dt;\n        const tau = Math.PI * 2;\n        runtime.angle = ((nextAngle % tau) + tau) % tau;\n      }\n      drawStaticOrbit();\n      raf = requestAnimationFrame(tick);\n    };\n    raf = requestAnimationFrame(tick);\n    return () => cancelAnimationFrame(raf);\n  }, [active, canAnimate, drawStaticOrbit, runtimeVisualState]);\n\n  useEffect(() => {\n    const canvas = canvasRef.current;`;
if (!orbitCanvas.includes(effectNeedle)) throw new Error('Orbit animation effect anchor missing');
orbitCanvas = orbitCanvas.replace(effectNeedle, effectPatch);
fs.writeFileSync(orbitCanvasPath, orbitCanvas);

let capture = fs.readFileSync(capturePath, 'utf8');
capture = capture.replaceAll(
  'http://127.0.0.1:5173/?engine=web-ts',
  'http://127.0.0.1:5173/?engine=web-ts&promoVisual=1',
);
const oldNav = `  const navSynth = async () => { await page.keyboard.press('2'); await wait(page,700); await clickButton('Synth').catch(()=>false); await wait(page,700); await clickButton(/DETAIL/i,false).catch(()=>false); await wait(page,700); };\n  const selectMode = async (mode) => { if(!(await clickButton(mode))) { if(mode==='Step') await clickButton('Euclid').catch(()=>false); } await wait(page,700); };`;
const newNav = `  const navSynth = async () => {\n    await page.keyboard.press('2'); await wait(page,700);\n    await clickButton('Synth').catch(()=>false); await wait(page,700);\n    const detail = page.locator('button.seq-view-btn').filter({ hasText: /^Detail$/i }).first();\n    await detail.waitFor({ state: 'visible' });\n    await detail.click();\n    await page.locator('.seq-tab-bar').first().waitFor({ state: 'visible' });\n    logs.push('[view] Synth DETAIL visible');\n    await wait(page,700);\n  };\n  const selectMode = async (mode) => {\n    const group = page.locator('.seq-mode-segmented').first();\n    await group.waitFor({ state: 'visible' });\n    await group.scrollIntoViewIfNeeded();\n    const targetIndex = mode === 'Step' ? 0 : mode === 'Walker' ? 1 : 2;\n    const button = group.locator('button').nth(targetIndex);\n    await button.click();\n    logs.push(\`[mode] selected \${mode}; text=\${JSON.stringify((await button.innerText()).trim())}\`);\n    await wait(page,700);\n  };`;
if (!capture.includes(oldNav)) throw new Error('Could not locate recapture navigation helpers');
capture = capture.replace(oldNav, newNav);
capture = capture.replace(
  `    await ensureSequencerPlaying('STEP');\n    await segment('step-playing-synth-seq-teset', 9000);`,
  `    await ensureSequencerPlaying('STEP');\n    await page.locator('.seq-mode-segmented').first().scrollIntoViewIfNeeded();\n    await page.evaluate(() => window.scrollBy(0, -180));\n    await wait(page,700);\n    await segment('step-playing-synth-seq-teset', 9000);`,
);
capture = capture.replace(
  `    await ensureSequencerPlaying('ORBIT');\n    await segment('orbit-playing-string-waves-dynamic', 10000);`,
  `    await ensureSequencerPlaying('ORBIT');\n    await page.locator('.seq-mode-segmented').first().scrollIntoViewIfNeeded();\n    await page.evaluate(() => window.scrollBy(0, -180));\n    await wait(page,700);\n    await segment('orbit-playing-string-waves-dynamic', 10000);`,
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
