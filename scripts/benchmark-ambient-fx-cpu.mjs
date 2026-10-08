// Matched effect-only rendering; input generation and audio comparison are outside timing.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createKesshoModuleHarness, percentile } from './lib/kesshoWasmRenderMetrics.mjs';

const [baselinePath, currentPath = 'public/worklets/kessho_core.wasm'] = process.argv.slice(2);
assert(baselinePath, 'Usage: node scripts/benchmark-ambient-fx-cpu.mjs <baseline.wasm> [current.wasm]');
const trials = Number(process.env.AMBIENT_CPU_TRIALS ?? 5);
const blocks = Number(process.env.AMBIENT_CPU_BLOCKS ?? 4096);
const warmup = Number(process.env.AMBIENT_CPU_WARMUP ?? 4096);
assert(trials >= 3 && Number.isInteger(trials));
assert(blocks > 0 && warmup > 0 && Number.isInteger(blocks) && Number.isInteger(warmup));
const selected = process.env.AMBIENT_CPU_CASE;
const inputs = Array.from({ length: 375 }, (_, block) => Float32Array.from({ length: 256 }, (_, i) => {
  const t = (block * 128 + (i >> 1)) / 48000;
  return i % 2
    ? 0.13 * Math.sin(2 * Math.PI * 173 * t) + 0.04 * Math.cos(2 * Math.PI * 311 * t)
    : 0.16 * Math.sin(2 * Math.PI * 220 * t) + 0.07 * Math.sin(2 * Math.PI * 311 * t);
}));

function granular(h, { shape = 0, style = 0, bloom = 0, clean = false, follow = 0, quality = 1, pitch = 0 } = {}) {
  h.setParam(3, 1);
  h.setParam(4, 0); // Isolate curve error from feedback accumulation.
  h.setParam(7, shape);
  h.setParam(8, 0.25);
  h.setParam(138, quality);
  h.setParam(139, 48);
  for (let v = 0; v < 4; v++) {
    const base = 10 + 25 * v;
    const ext = 143 + 14 * v;
    for (const [offset, value] of [[0, 1], [1, clean ? 0 : 1], [3, clean ? 0 : 1],
      [4, 1], [6, pitch], [7, follow], [8, 32], [9, 300], [12, 0.02], [13, 0.28],
      [14, 0.35], [16, 0.25], [17, 0.65], [18, clean ? 0.2 : 0], [19, clean ? 0.4 : 0]]) {
      h.setParam(base + offset, value);
    }
    h.setParam(ext + 9, bloom);
    h.setParam(ext + 11, style);
  }
}

const cases = [
  ...[['triangle', {}], ['saw-up', { shape: 1 }], ['saw-down', { shape: 2 }],
    ['tide', { style: 3 }], ['clean-follow', { clean: true, follow: 1 }],
    ['clean-no-follow', { clean: true }], ['bloom', { style: 2, bloom: 0.8 }],
    ['bloom-hq', { style: 2, bloom: 0.8, quality: 2, pitch: 7 }]].map(([name, config]) => ({
    name, type: 4, approximate: name.startsWith('saw') || name === 'tide', configure: h => granular(h, config),
  })),
  ...[['solid', 0, 0.5], ['held-stretch', 2, 0], ['moving-stretch', 2, 0.5],
    ['living-stretch', 3, 0.5], ['slushy', 1, 0.5]].map(([name, mode, speed]) => ({
    name, type: 5, approximate: false, configure: h => {
      h.setParam(1, mode);
      h.setParam(3, speed);
      h.setParam(5, 0.42);
      h.setParam(6, mode === 1 || mode === 3 ? 0.5 : 0);
    },
  })),
].filter(c => !selected || selected.split(',').includes(c.name));
assert(cases.length, 'No matching scenario');
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function render(c, wasmPath, collectAudio) {
  const h = await createKesshoModuleHarness(process.cwd(), c.type, { wasmPath });
  try {
    c.configure(h);
    h.commitParams();
    let inputBlock = 0;
    const process = () => h.moduleProcessInterleaved(h.module, h.inputPtr, h.outputPtr, 128);
    const fill = () => h.heap.set(inputs[inputBlock++ % inputs.length], h.inputOffset);
    if (c.type === 5) {
      for (let b = 0; b < 512; b++) { fill(); assert.equal(process(), 1); }
      h.setParam(0, 1);
      h.setParam(2, 1);
      h.commitParams();
    }
    for (let b = 0; b < warmup; b++) { fill(); assert.equal(process(), 1); }
    const times = [];
    const pcm = collectAudio ? new Float32Array(blocks * 256) : null;
    let elapsed = 0;
    for (let b = 0; b < blocks; b++) {
      fill();
      const start = performance.now();
      const ok = process();
      const ms = performance.now() - start;
      assert.equal(ok, 1);
      elapsed += ms;
      times.push(ms * 1000);
      if (pcm) pcm.set(h.heap.subarray(h.outputOffset, h.outputOffset + 256), b * 256);
    }
    if (c.type === 5) {
      // A captured freeze must outlast live-input latency; silence cannot validate it.
      let heldPeak = 0;
      for (let b = 0; b < 96; ++b) {
        h.heap.fill(0, h.inputOffset, h.inputOffset + 256);
        assert.equal(process(), 1);
        if (b >= 64) {
          for (const sample of h.heap.subarray(h.outputOffset, h.outputOffset + 256)) {
            assert(Number.isFinite(sample));
            heldPeak = Math.max(heldPeak, Math.abs(sample));
          }
        }
      }
      assert(heldPeak > 1e-5, `${c.name}: captured freeze did not survive silent input`);
    }
    return { averageUs: elapsed * 1000 / blocks, p95Us: percentile(times, 0.95), p99Us: percentile(times, 0.99), pcm };
  } finally { h.destroy(); }
}

for (const c of cases) {
  const rows = { baseline: [], current: [] };
  let baselineAudio;
  let currentAudio;
  for (let trial = 0; trial < trials; trial++) {
    for (const variant of trial % 2 ? ['current', 'baseline'] : ['baseline', 'current']) {
      const result = await render(c, variant === 'baseline' ? baselinePath : currentPath, trial === 0);
      if (result.pcm) {
        if (variant === 'baseline') baselineAudio = result.pcm;
        else currentAudio = result.pcm;
      }
      rows[variant].push({ averageUs: result.averageUs, p95Us: result.p95Us, p99Us: result.p99Us });
    }
  }
  let energy = 0, differenceEnergy = 0, maxDifference = 0, peak = 0;
  for (let i = 0; i < baselineAudio.length; i++) {
    assert(Number.isFinite(baselineAudio[i]) && Number.isFinite(currentAudio[i]), `${c.name}: nonfinite output`);
    const difference = currentAudio[i] - baselineAudio[i];
    energy += baselineAudio[i] ** 2;
    differenceEnergy += difference ** 2;
    peak = Math.max(peak, Math.abs(baselineAudio[i]));
    maxDifference = Math.max(maxDifference, Math.abs(difference));
  }
  assert(peak > 1e-5, `${c.name}: silent workload`);
  const relativeRmsError = Math.sqrt(differenceEnergy / energy);
  assert(c.approximate ? maxDifference <= 1e-4 && relativeRmsError <= 1e-3 : maxDifference === 0,
    `${c.name}: audio mismatch max=${maxDifference} relativeRms=${relativeRmsError}`);
  const baselineUs = median(rows.baseline.map(r => r.averageUs));
  const currentUs = median(rows.current.map(r => r.averageUs));
  console.log(JSON.stringify({ name: c.name, baselineUs, currentUs,
    reductionPercent: 100 * (baselineUs - currentUs) / baselineUs,
    maxDifference, relativeRmsError, peak, trials: rows }));
}
