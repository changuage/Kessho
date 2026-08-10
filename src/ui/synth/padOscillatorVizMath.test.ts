import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  applyPreviewPhaseDistortion,
  PAD_PREVIEW_CYCLES,
  PAD_WAVE_SOURCES,
  resolveMixProminence,
  resolvePreviewFrequency,
  resolveVisualizerCycleCount,
  sampleBasicWave,
  sampleGeneratedFoldTransfer,
  sampleGeneratedPreview,
  samplePadWave,
  wrap01,
} from './padOscillatorVizMath';

// Keep the reachable web-ts fallback honest: one A node, one B node, one Sub
// node. This catches a regression to the old duplicated-A/B-as-Sub layout
// without requiring a browser AudioContext in the focused math suite.
const webTsPadVoice = readFileSync(new URL('../../audio/reference/webTs/engine.ts', import.meta.url), 'utf8');
const padOscillatorViz = readFileSync(new URL('./PadOscillatorViz.tsx', import.meta.url), 'utf8');
assert.match(webTsPadVoice, /oscA:\s*OscillatorNode/);
assert.match(webTsPadVoice, /oscB:\s*OscillatorNode/);
assert.match(webTsPadVoice, /subOsc:\s*OscillatorNode/);
assert.match(webTsPadVoice, /const subTarget = p\.subEnabled \? p\.subLevel : 0/);
assert.doesNotMatch(webTsPadVoice, /\bosc[1-4](?:Gain)?\b/);
assert.doesNotMatch(padOscillatorViz, /requestAnimationFrame|createPadOscillatorVizScheduler/);

test('preview math keeps phase wrapped and PD zero transparent', () => {
  assert.equal(wrap01(-0.25), 0.75);
  for (const phase of [0, 0.1, 0.5, 0.999]) {
    assert.ok(Math.abs(applyPreviewPhaseDistortion(phase, 0) - phase) < 1e-9);
  }
});

test('static preview shows two complete repeating cycles', () => {
  assert.equal(PAD_PREVIEW_CYCLES, 2);
});

test('visible waveform density follows oscillator speed', () => {
  const base = resolvePreviewFrequency(110, 0, 0);
  const octaveUp = resolvePreviewFrequency(110, 12, 0);
  const offsetUp = resolvePreviewFrequency(110, 0, 20);
  assert.equal(resolveVisualizerCycleCount(base), 2);
  assert.equal(resolveVisualizerCycleCount(octaveUp), 4);
  assert.ok(resolveVisualizerCycleCount(offsetUp) > resolveVisualizerCycleCount(base));
});

test('mix prominence follows both-full-center law and keeps quiet trace visible', () => {
  const center = resolveMixProminence(0.5, 0.6, 0.4);
  assert.equal(center.aGain, 0.6);
  assert.equal(center.bGain, 0.4);
  assert.ok(center.bOpacity >= 0.1);
  const hardLeft = resolveMixProminence(0, 1, 1);
  assert.equal(hardLeft.aGain, 1);
  assert.equal(hardLeft.bGain, 0);
  assert.equal(hardLeft.aOpacity, 1);
  assert.equal(hardLeft.bOpacity, 0.1);
  assert.equal(hardLeft.first, 'b');

  const hardRight = resolveMixProminence(1, 1, 1);
  assert.equal(hardRight.aOpacity, 0.1);
  assert.equal(hardRight.bOpacity, 1);
  assert.equal(hardRight.first, 'a');

  const bothFull = resolveMixProminence(0.5, 1, 1);
  assert.equal(bothFull.aGain, 1);
  assert.equal(bothFull.bGain, 1);
  assert.equal(bothFull.aOpacity, bothFull.bOpacity);
  assert.equal(bothFull.aOpacity, 1);
});

test('classic wave samples are recognizable', () => {
  assert.ok(Math.abs(sampleBasicWave('sine', 0.25) - 1) < 1e-9);
  assert.equal(sampleBasicWave('triangle', 0), 1);
  assert.equal(sampleBasicWave('triangle', 0.25), 0);
  assert.equal(sampleBasicWave('triangle', 0.5), -1);
  assert.equal(sampleBasicWave('sawtooth', 0), -1);
  assert.equal(sampleBasicWave('sawtooth', 0.5), 0);
  assert.equal(sampleBasicWave('square', 0.25), 1);
  assert.equal(sampleBasicWave('square', 0.75), -1);
  assert.notEqual(
    sampleBasicWave('square', applyPreviewPhaseDistortion(0.25, -1)),
    sampleBasicWave('square', applyPreviewPhaseDistortion(0.25, 1)),
  );
  assert.equal(sampleBasicWave('square', applyPreviewPhaseDistortion(0.75, 0)), -1);
  assert.equal(sampleBasicWave('square', applyPreviewPhaseDistortion(0.75, 1)), 1);
});

test('every Pad waveform repeats exactly at the cycle boundary', () => {
  for (const wave of PAD_WAVE_SOURCES) {
    for (const phase of [0.11, 0.37, 0.89]) {
      const first = samplePadWave(wave, 0.63, applyPreviewPhaseDistortion(phase, 0.41));
      const repeated = samplePadWave(wave, 0.63, applyPreviewPhaseDistortion(phase + 1, 0.41));
      assert.ok(Math.abs(first - repeated) < 1e-9, `${wave} must repeat after one cycle`);
    }
  }
});

test('generated Position interpolation stays finite, bounded, and local to each source', () => {
  const harmonicAtStart = sampleGeneratedPreview(0, 0, 0.123);
  const harmonicAtEnd = sampleGeneratedPreview(0, 1, 0.123);
  assert.ok(Number.isFinite(harmonicAtStart));
  assert.ok(Number.isFinite(harmonicAtEnd));
  assert.ok(Math.abs(harmonicAtStart) <= 1.01);
  assert.ok(Math.abs(harmonicAtEnd) <= 1.01);
  assert.notEqual(harmonicAtStart, harmonicAtEnd);

  const a = samplePadWave('harmonic', 0.2, 0.37);
  const b = samplePadWave('complexSine', 0.8, 0.37);
  assert.ok(Number.isFinite(a) && Number.isFinite(b));
  assert.ok(Math.abs(a) <= 1.01 && Math.abs(b) <= 1.01);
});

test('generated Fold transfer remains finite and bounded', () => {
  for (const mode of [0, 1, 2] as const) {
    for (const amount of [0, 0.45, 1]) {
      const output = sampleGeneratedFoldTransfer(mode, amount, 0.3);
      assert.ok(Number.isFinite(output));
      assert.ok(output >= -1.01 && output <= 1.01);
    }
  }
});
