import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createKesshoModuleHarness } from './lib/kesshoWasmRenderMetrics.mjs';

const root = process.cwd();
const [baselinePath, currentPath = 'public/worklets/kessho_core.wasm', outputDir = `${root}/build/ambient-fx-cpu/audio`] = process.argv.slice(2);
assert(baselinePath, 'Usage: node scripts/check-ambient-fx-audio.mjs <baseline.wasm> [current.wasm] [output-dir]');
await mkdir(outputDir, { recursive: true });
const paths = [baselinePath, currentPath];
const silence = new Float32Array(256);
const scenarios = [
  ['saw-up', 4, 1, 0], ['saw-down', 4, 2, 0], ['tide', 4, 0, 3],
  ['held-freeze', 5, 0, 0], ['moving-freeze', 5, 0, 0.5], ['bloom', 4, 0, 2],
];
const input = Array.from({ length: 4500 }, (_, b) => Float32Array.from({ length: 256 }, (_, i) => {
  const t = (b * 128 + (i >> 1)) / 48000;
  const phase = t % 2;
  const pad = Math.min(t, 1) * 0.04 * (Math.sin(t * 1382.30077) + Math.sin(t * 1954.07063));
  const pluck = phase < 0.5 ? 0.12 * Math.exp(-phase * 14) * Math.sin(phase * 2764.60154) : 0;
  return (pad + pluck) * (i % 2 ? 0.8 : 1);
}));

function configureFx(h, type, shape, style) {
  if (type === 5) {
    for (const [p, v] of [[1, 2], [3, style], [5, 0.42], [6, 0], [8, 0.7], [11, 0.95]]) h.setParam(p, v);
  } else {
    for (const [p, v] of [[3, 1], [4, 0.3], [7, shape], [8, 0.5], [138, 1], [139, 48]]) h.setParam(p, v);
    for (let voice = 0; voice < 4; ++voice) {
      const base = 10 + 25 * voice;
      for (const [p, v] of [[0, 1], [1, 1], [3, 1], [4, 1], [8, 32], [9, 300],
        [12, 0.02], [13, 0.28], [14, 0.35], [16, 0.45], [17, 0.65]]) h.setParam(base + p, v);
      h.setParam(143 + voice * 14 + 9, style === 2 ? 0.8 : 0);
      h.setParam(143 + voice * 14 + 11, style);
    }
  }
  h.commitParams();
}
function renderBlock(h) {
  assert.equal(h.moduleProcessInterleaved(h.module, h.inputPtr, h.outputPtr, 128), 1);
}
function wav(pcm) {
  const out = Buffer.alloc(44 + pcm.length * 2);
  out.write('RIFF', 0); out.writeUInt32LE(out.length - 8, 4); out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22);
  out.writeUInt32LE(48000, 24); out.writeUInt32LE(192000, 28); out.writeUInt16LE(4, 32);
  out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(pcm.length * 2, 40);
  for (let i = 0; i < pcm.length; ++i) out.writeInt16LE(Math.round(pcm[i] * 32767), 44 + i * 2);
  return out;
}
function stats(pcm) {
  let energy = 0, derivativeEnergy = 0, peak = 0, maxStep = 0;
  const rmsSeconds = [];
  for (let second = 0; second < 42; ++second) {
    let windowEnergy = 0;
    for (let i = second * 96000; i < (second + 1) * 96000; ++i) {
      assert(Number.isFinite(pcm[i]));
      peak = Math.max(peak, Math.abs(pcm[i]));
      windowEnergy += pcm[i] ** 2;
      if (i >= 2) {
        const step = pcm[i] - pcm[i - 2];
        derivativeEnergy += step ** 2;
        maxStep = Math.max(maxStep, Math.abs(step));
      }
    }
    rmsSeconds.push(Math.sqrt(windowEnergy / 96000));
    energy += windowEnergy;
  }
  assert(peak > 1e-5 && peak < 1, 'silent/clipped wash');
  return { energy, derivativeEnergy, peak, maxStep, rmsSeconds };
}

// Exact Clean scan comparison while editing lookback, buffer size and direction.
for (const sampleRate of [44100, 48000]) {
  for (const follow of [0, 1]) {
    const pair = [];
    for (const wasmPath of paths) {
      const h = await createKesshoModuleHarness(root, 4, { wasmPath, sampleRate });
      configureFx(h, 4, 0, 0);
      for (let v = 0; v < 4; ++v) {
        const base = 10 + v * 25;
        for (const [p, value] of [[1, 0], [3, 0], [7, follow], [18, 0.2], [19, 0.4]]) h.setParam(base + p, value);
        h.setParam(143 + v * 14 + 2, 0);
      }
      h.commitParams();
      pair.push(h);
    }
    let peak = 0;
    for (let b = 0; b < 2200; ++b) {
      for (const h of pair) {
        if (b === 600 || b === 1600) {
          for (let v = 0; v < 4; ++v) h.setParam(143 + v * 14 + 2, b === 600 ? 1 : 0.02);
          h.commitParams();
        }
        if (b === 1000 || b === 1800) {
          h.setParam(6, b === 1000 ? 1 : 2);
          for (let v = 0; v < 4; ++v) h.setParam(10 + v * 25 + 5, b === 1000 ? 1 : 0);
          h.commitParams(); h.refreshMemoryViews();
        }
        h.heap.set(input[b], h.inputOffset); renderBlock(h);
      }
      for (let i = 0; i < 256; ++i) {
        const a = pair[0].heap[pair[0].outputOffset + i];
        const b = pair[1].heap[pair[1].outputOffset + i];
        assert(Number.isFinite(a) && a === b, 'Clean transition changed PCM');
        peak = Math.max(peak, Math.abs(a));
      }
    }
    assert(peak > 1e-5, 'silent Clean comparison');
    pair.forEach(h => h.destroy());
    console.log(JSON.stringify({ name: 'clean-transitions', sampleRate, follow, maxDifference: 0, peak }));
  }
}

for (const [name, type, shape, style] of scenarios) {
  const outputs = [];
  for (let variant = 0; variant < 2; ++variant) {
    const fx = await createKesshoModuleHarness(root, type, { wasmPath: paths[variant] });
    const reverb = await createKesshoModuleHarness(root, 3, { wasmPath: paths[variant] });
    configureFx(fx, type, shape, style);
    for (const [p, v] of [[0, 1], [1, 1], [2, 0.96], [3, 4], [4, 0.25], [5, 0.9],
      [6, 0.45], [7, 20], [8, 0.95], [11, 0.04], [12, 0.3], [17, 2], [30, 0.4]]) reverb.setParam(p, v);
    reverb.commitParams();
    const pcm = new Float32Array(42 * 96000);
    for (let b = 0; b < 15750; ++b) {
      if (type === 5 && b === 1125) { fx.setParam(0, 1); fx.setParam(2, 1); fx.commitParams(); }
      if (type === 5 && b === 3000) { fx.setParam(5, 0.9); fx.setParam(3, 0); fx.commitParams(); }
      if (type === 5 && b === 3375) { fx.setParam(2, 2); fx.commitParams(); }
      if (type === 5 && b === 4125) { fx.setParam(0, 0); fx.commitParams(); }
      if (type === 4 && b === 1875) { fx.setParam(1, 1); fx.commitParams(); }
      if (type === 4 && b === 2625) { fx.setParam(1, 0); fx.commitParams(); }
      fx.heap.set(b < 4500 ? input[b] : silence, fx.inputOffset);
      renderBlock(fx);
      reverb.heap.set(b < 4500 ? fx.heap.subarray(fx.outputOffset, fx.outputOffset + 256) : silence, reverb.inputOffset);
      renderBlock(reverb);
      pcm.set(reverb.heap.subarray(reverb.outputOffset, reverb.outputOffset + 256), b * 256);
    }
    fx.destroy(); reverb.destroy();
    const summary = stats(pcm);
    await writeFile(`${outputDir}/${name}-${variant ? 'current' : 'baseline'}.wav`, wav(pcm));
    outputs.push({ pcm, summary });
  }
  let errorEnergy = 0, maxDifference = 0;
  for (let i = 0; i < outputs[0].pcm.length; ++i) {
    const error = outputs[1].pcm[i] - outputs[0].pcm[i];
    errorEnergy += error ** 2; maxDifference = Math.max(maxDifference, Math.abs(error));
  }
  const relativeRmsError = Math.sqrt(errorEnergy / outputs[0].summary.energy);
  const levelRatio = Math.sqrt(outputs[1].summary.energy / outputs[0].summary.energy);
  const slopeRatio = Math.sqrt(outputs[1].summary.derivativeEnergy / outputs[0].summary.derivativeEnergy);
  const tailRmsRelativeDifference = Math.max(...outputs[0].summary.rmsSeconds.slice(12).map((rms, i) =>
    Math.abs(outputs[1].summary.rmsSeconds[i + 12] - rms) / Math.max(rms, 1e-8)));
  const approximate = name.startsWith('saw') || name === 'tide';
  assert(approximate ? relativeRmsError <= 1e-3 && maxDifference <= 1e-4 : maxDifference === 0);
  assert(Math.abs(levelRatio - 1) <= 1e-3 && Math.abs(slopeRatio - 1) <= 1e-3 && tailRmsRelativeDifference <= 1e-3);
  console.log(JSON.stringify({ name, relativeRmsError, maxDifference, levelRatio, slopeRatio,
    tailRmsRelativeDifference, baseline: outputs[0].summary, current: outputs[1].summary }));
}
