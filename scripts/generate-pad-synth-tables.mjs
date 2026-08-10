#!/usr/bin/env node

/**
 * Generate the immutable Pad oscillator/fold tables used by the native/WASM
 * renderer and the lightweight UI preview. Keep this file dependency-free and
 * deterministic: it is deliberately an offline build step, never an audio
 * callback dependency.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const AUDIO_OUT = path.join(ROOT, 'wasm/pad/generated/pad_synth_tables.generated.h');
const UI_OUT = path.join(ROOT, 'src/ui/synth/generated/padSynthPreviewTables.generated.ts');

const TRAJECTORIES = 3;
const POSITION_FRAMES = 32;
const MIP_LEVELS = 8;
const AUDIO_SAMPLES = 257;
const UI_SAMPLES = 129;
const FOLD_MODES = 3;
const FOLD_AMOUNT_FRAMES = 33;
const FOLD_AUDIO_SAMPLES = 257;
const FOLD_UI_SAMPLES = 65;
const Q15 = 32767;

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const wrap01 = (x) => {
  x -= Math.floor(x);
  return x < 0 ? x + 1 : x;
};

function positionFrame(trajectory, frame) {
  const t = frame / (POSITION_FRAMES - 1);
  // Complex sources change fastest at their first fold thresholds. Keep the
  // public Position range linear while spending extra frames near the clean
  // end of the trajectory; classic Harmonic remains evenly spaced.
  return trajectory === 0 ? t : Math.pow(t, 1.35);
}

function sourceSample(trajectory, phase, position) {
  const p = wrap01(phase);
  if (trajectory === 0) {
    // Harmonic: a stable, deterministic fundamental-to-rich spectrum.
    const harmonics = Math.max(1, Math.round(1 + position * 31));
    let out = 0;
    let norm = 0;
    for (let k = 1; k <= harmonics; k += 1) {
      const amp = 1 / Math.pow(k, 0.72);
      out += amp * Math.sin(2 * Math.PI * p * k);
      norm += amp;
    }
    return out / Math.max(1, norm);
  }

  const triangle = 1 - 4 * Math.abs(Math.round(p - 0.25) - (p - 0.25));
  const base = trajectory === 1 ? Math.sin(2 * Math.PI * p) : triangle;
  // The amount curve spends more frames near the first fold thresholds. This
  // keeps equal Position movement perceptually useful without runtime work.
  const drive = 1 + 7 * position;
  if (trajectory === 1) return Math.sin(base * drive * Math.PI * 0.5);
  const x = base * drive;
  return 4 * Math.abs(0.25 * x - Math.floor(0.25 * x + 0.5)) - 1;
}

function removeDcAndNormalize(samples) {
  let mean = 0;
  for (const value of samples) mean += value;
  mean /= samples.length;
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] -= mean;
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  if (peak > 1e-9) {
    const scale = 0.96 / peak;
    for (let i = 0; i < samples.length; i += 1) samples[i] *= scale;
  }
  return samples;
}

function dftMip(trajectory, position, sampleCount, mip) {
  const raw = Array.from({ length: sampleCount }, (_, i) => sourceSample(trajectory, i / (sampleCount - 1), position));
  removeDcAndNormalize(raw);

  // Real DFT analysis/reconstruction is intentionally offline. Limiting the
  // retained bins gives deterministic mip levels without runtime FFT/code.
  const n = sampleCount - 1;
  const bins = Math.max(1, Math.floor((n * 0.5) / Math.pow(2, mip)));
  const real = new Float64Array(bins + 1);
  const imag = new Float64Array(bins + 1);
  for (let k = 1; k <= bins; k += 1) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i += 1) {
      const angle = 2 * Math.PI * k * i / n;
      re += raw[i] * Math.cos(angle);
      im -= raw[i] * Math.sin(angle);
    }
    real[k] = (2 * re) / n;
    imag[k] = (2 * im) / n;
  }

  const out = new Array(sampleCount);
  for (let i = 0; i < n; i += 1) {
    let value = 0;
    for (let k = 1; k <= bins; k += 1) {
      const angle = 2 * Math.PI * k * i / n;
      value += real[k] * Math.cos(angle) - imag[k] * Math.sin(angle);
    }
    out[i] = clamp(value, -1, 1);
  }
  out[n] = out[0];
  return out;
}

function foldSample(mode, amount, input) {
  const gain = 1 + amount * 7;
  const x = input * gain;
  if (mode === 1) return Math.sin(x * Math.PI * 0.5);
  if (mode === 2) {
    let value = Math.tanh(x);
    value = Math.tanh(value * gain * 0.5);
    return Math.tanh(value * gain * 0.25);
  }
  return 4 * Math.abs(0.25 * x - Math.floor(0.25 * x + 0.5)) - 1;
}

function quantize(values) {
  return values.map((value) => clamp(Math.round(clamp(value, -1, 1) * Q15), -Q15, Q15));
}

function buildTables() {
  const audioOsc = [];
  const uiOsc = [];
  for (let trajectory = 0; trajectory < TRAJECTORIES; trajectory += 1) {
    const audioFrames = [];
    const uiFrames = [];
    for (let frame = 0; frame < POSITION_FRAMES; frame += 1) {
      const position = positionFrame(trajectory, frame);
      audioFrames.push([]);
      for (let mip = 0; mip < MIP_LEVELS; mip += 1) audioFrames[frame].push(quantize(dftMip(trajectory, position, AUDIO_SAMPLES, mip)));
      uiFrames.push(quantize(dftMip(trajectory, position, UI_SAMPLES, 0)));
    }
    audioOsc.push(audioFrames);
    uiOsc.push(uiFrames);
  }

  const foldAudio = [];
  const foldUi = [];
  for (let mode = 0; mode < FOLD_MODES; mode += 1) {
    const audioAmounts = [];
    const uiAmounts = [];
    for (let amountFrame = 0; amountFrame < FOLD_AMOUNT_FRAMES; amountFrame += 1) {
      const amount = amountFrame / (FOLD_AMOUNT_FRAMES - 1);
      audioAmounts.push(quantize(Array.from({ length: FOLD_AUDIO_SAMPLES }, (_, i) => foldSample(mode, amount, i / (FOLD_AUDIO_SAMPLES - 1) * 2 - 1))));
      uiAmounts.push(quantize(Array.from({ length: FOLD_UI_SAMPLES }, (_, i) => foldSample(mode, amount, i / (FOLD_UI_SAMPLES - 1) * 2 - 1))));
    }
    foldAudio.push(audioAmounts);
    foldUi.push(uiAmounts);
  }
  return { audioOsc, uiOsc, foldAudio, foldUi };
}

function validateTables(tables) {
  const fail = (message) => { throw new Error(`Pad synth table integrity failure: ${message}`); };
  const checkGrid = (grid, expectedOuter, expectedMiddle, expectedInner, label, guard = true) => {
    if (grid.length !== expectedOuter) fail(`${label} outer dimension`);
    for (const [i, middle] of grid.entries()) {
      if (middle.length !== expectedMiddle) fail(`${label}[${i}] middle dimension`);
      for (const [j, row] of middle.entries()) {
        if (row.length !== expectedInner) fail(`${label}[${i}][${j}] sample dimension`);
        for (const value of row) if (!Number.isInteger(value) || value < -Q15 || value > Q15) fail(`${label}[${i}][${j}] out-of-range value`);
        if (guard && row[0] !== row[row.length - 1]) fail(`${label}[${i}][${j}] guard sample`);
      }
    }
  };
  if (tables.audioOsc.length !== TRAJECTORIES) fail('audio oscillator trajectory dimension');
  for (const trajectory of tables.audioOsc) {
    if (trajectory.length !== POSITION_FRAMES) fail('audio oscillator position dimension');
    for (const frame of trajectory) {
      if (frame.length !== MIP_LEVELS) fail('audio oscillator mip dimension');
      for (const row of frame) {
        if (row.length !== AUDIO_SAMPLES) fail('audio oscillator sample dimension');
        for (const value of row) if (!Number.isInteger(value) || value < -Q15 || value > Q15) fail('audio oscillator out-of-range value');
        if (row[0] !== row[row.length - 1]) fail('audio oscillator guard sample');
      }
    }
  }
  checkGrid(tables.foldAudio, FOLD_MODES, FOLD_AMOUNT_FRAMES, FOLD_AUDIO_SAMPLES, 'audio fold', false);
  checkGrid(tables.uiOsc, TRAJECTORIES, POSITION_FRAMES, UI_SAMPLES, 'UI oscillator');
  checkGrid(tables.foldUi, FOLD_MODES, FOLD_AMOUNT_FRAMES, FOLD_UI_SAMPLES, 'UI fold', false);
  for (let trajectory = 0; trajectory < TRAJECTORIES; trajectory += 1) {
    const spacing = [];
    let changedFrames = 0;
    for (let frame = 1; frame < POSITION_FRAMES; frame += 1) {
      const delta = positionFrame(trajectory, frame) - positionFrame(trajectory, frame - 1);
      if (!(delta > 0)) fail(`trajectory ${trajectory} Position spacing is not monotonic`);
      spacing.push(delta);
      const previous = tables.audioOsc[trajectory][frame - 1][0];
      const current = tables.audioOsc[trajectory][frame][0];
      let sumSquared = 0;
      let maxDelta = 0;
      for (let i = 0; i < AUDIO_SAMPLES - 1; i += 1) {
        const difference = Math.abs(current[i] - previous[i]) / Q15;
        sumSquared += difference * difference;
        maxDelta = Math.max(maxDelta, difference);
      }
      const rmsDelta = Math.sqrt(sumSquared / (AUDIO_SAMPLES - 1));
      if (rmsDelta > 0.45 || maxDelta > 1.0) fail(`trajectory ${trajectory} adjacent Position jump is too large`);
      if (rmsDelta > 0.000001) changedFrames += 1;
    }
    const minSpacing = Math.min(...spacing);
    const maxSpacing = Math.max(...spacing);
    if (maxSpacing / Math.max(1e-9, minSpacing) > 8.0) fail(`trajectory ${trajectory} Position spacing is too uneven`);
    if (changedFrames < 4) fail(`trajectory ${trajectory} Position frames are not distinct`);
    let trajectoryDelta = 0;
    const first = tables.audioOsc[trajectory][0][0];
    const last = tables.audioOsc[trajectory][POSITION_FRAMES - 1][0];
    for (let i = 0; i < AUDIO_SAMPLES - 1; i += 1) trajectoryDelta += Math.abs(last[i] - first[i]);
    if (trajectoryDelta / ((AUDIO_SAMPLES - 1) * Q15) < 0.01) fail(`trajectory ${trajectory} has no usable Position trajectory`);
  }
  const audioBytes = (TRAJECTORIES * POSITION_FRAMES * MIP_LEVELS * AUDIO_SAMPLES + FOLD_MODES * FOLD_AMOUNT_FRAMES * FOLD_AUDIO_SAMPLES) * 2;
  const uiBytes = (TRAJECTORIES * POSITION_FRAMES * UI_SAMPLES + FOLD_MODES * FOLD_AMOUNT_FRAMES * FOLD_UI_SAMPLES) * 2;
  if (audioBytes >= 0.85 * 1024 * 1024) fail(`audio decoded bytes ${audioBytes} exceed budget`);
  if (uiBytes >= 96 * 1024) fail(`UI decoded bytes ${uiBytes} exceed budget`);
  if (audioBytes + uiBytes >= 1.0 * 1024 * 1024) fail(`combined decoded bytes ${audioBytes + uiBytes} exceed budget`);
  return { audioBytes, uiBytes };
}

const format = (values, indent = '') => {
  const chunks = [];
  for (let i = 0; i < values.length; i += 16) chunks.push(`${indent}${values.slice(i, i + 16).join(', ')}`);
  return chunks.join(',\n');
};

function cArray(values, depth = 0) {
  if (!Array.isArray(values[0])) return `{\n${format(values, '  '.repeat(depth + 1))}\n${'  '.repeat(depth)}}`;
  return `{\n${values.map((value) => `${'  '.repeat(depth + 1)}${cArray(value, depth + 1)}`).join(',\n')}\n${'  '.repeat(depth)}}`;
}

function tsArray(values) {
  if (!Array.isArray(values[0])) return `[${values.join(',')}]`;
  return `[${values.map(tsArray).join(',')}]`;
}

function renderHeader(tables) {
  return `// Generated by scripts/generate-pad-synth-tables.mjs; do not edit.\n#pragma once\n#include <cstdint>\n\nnamespace kessho_pad_tables {\n\ninline constexpr int kTrajectoryCount = ${TRAJECTORIES};\ninline constexpr int kPositionFrames = ${POSITION_FRAMES};\ninline constexpr int kMipLevels = ${MIP_LEVELS};\ninline constexpr int kAudioSamples = ${AUDIO_SAMPLES};\ninline constexpr int kFoldModes = ${FOLD_MODES};\ninline constexpr int kFoldAmountFrames = ${FOLD_AMOUNT_FRAMES};\ninline constexpr int kFoldAudioSamples = ${FOLD_AUDIO_SAMPLES};\ninline constexpr float kQ15Scale = 1.0f / ${Q15}.0f;\n\ninline constexpr int16_t kOscillatorTables[kTrajectoryCount][kPositionFrames][kMipLevels][kAudioSamples] = ${cArray(tables.audioOsc)};\ninline constexpr int16_t kFoldTables[kFoldModes][kFoldAmountFrames][kFoldAudioSamples] = ${cArray(tables.foldAudio)};\n\n} // namespace kessho_pad_tables\n`;
}

function renderUi(tables) {
  return `// Generated by scripts/generate-pad-synth-tables.mjs; do not edit.\n\nexport const PAD_SYNTH_PREVIEW_VERSION = 1 as const;\nexport const PAD_PREVIEW_POSITION_FRAMES = ${POSITION_FRAMES} as const;\nexport const PAD_PREVIEW_SAMPLES = ${UI_SAMPLES} as const;\nexport const PAD_PREVIEW_FOLD_MODES = ${FOLD_MODES} as const;\nexport const PAD_PREVIEW_FOLD_AMOUNT_FRAMES = ${FOLD_AMOUNT_FRAMES} as const;\nexport const PAD_PREVIEW_FOLD_SAMPLES = ${FOLD_UI_SAMPLES} as const;\nexport const PAD_SYNTH_PREVIEW_Q15_SCALE = 1 / ${Q15};\n\nexport const padSynthPreviewOscillatorTables = ${tsArray(tables.uiOsc)} as const;\nexport const padSynthPreviewFoldTables = ${tsArray(tables.foldUi)} as const;\n`;
}

function writeOrCheck(file, content, check) {
  if (check) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (current !== content) {
      console.error(`Generated file is stale: ${path.relative(ROOT, file)}`);
      return false;
    }
    return true;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
}

const check = process.argv.includes('--check');
const tables = buildTables();
validateTables(tables);
const ok = writeOrCheck(AUDIO_OUT, renderHeader(tables), check)
  && writeOrCheck(UI_OUT, renderUi(tables), check);
if (!ok) process.exit(1);
if (!check) console.log(`Generated ${path.relative(ROOT, AUDIO_OUT)} and ${path.relative(ROOT, UI_OUT)}`);
