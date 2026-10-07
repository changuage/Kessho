#!/usr/bin/env node
// Focused current-source comparison; no checkout, production flags, or report writer.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import vm from 'node:vm';
import { kesshoCoreIncludeArgs, resolveKesshoCoreSources } from './kessho-core-build-manifest.mjs';

const root = process.cwd();
const trials = Number(process.env.CPU_TRIALS ?? 3);
const blocks = Number(process.env.CPU_BLOCKS ?? 1500);
const warmup = Number(process.env.CPU_WARMUP_BLOCKS ?? 4096);
assert(Number.isInteger(trials) && trials >= 3);
assert(Number.isInteger(blocks) && blocks > 0 && Number.isInteger(warmup) && warmup > 0);
const only = process.argv[2];
assert(!only || ['--native', '--capture'].includes(only));
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const run = (command, args) => execFileSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
function summarize(name, rows) {
  const medians = Object.fromEntries(['baseline', 'current'].map(mode => [mode,
    median(rows.filter(row => row.mode === mode).map(row => row.cpuPercent))]));
  console.log(JSON.stringify({ name, trials, blocks, warmup, rows, medianCpuPercent: medians,
    relativeReductionPercent: 100 * (medians.baseline - medians.current) / medians.baseline }));
}

async function captureComparison() {
  // Reuses check-kessho-product-wasm's VM fixture with the real committed WASM
  // and generated matching worklet source. This measures synchronous callback CPU,
  // not browser scheduling, page CPU, host preview work, or physical devices.
  const bytes = readFileSync(resolve(root, 'public/worklets/kessho_core.wasm'));
  const source = readFileSync(resolve(root, 'public/worklets/kessho-core-product.worklet.js'), 'utf8');
  const rows = [];
  let expectedBehavior;
  for (let trial = 0; trial < trials; trial++) {
    for (const mode of trial % 2 ? ['current', 'baseline'] : ['baseline', 'current']) {
      let Processor;
      const messages = [];
      const sandbox = { AudioWorkletProcessor: class { constructor() { this.port = { postMessage: message => messages.push(message) }; } },
        registerProcessor: (_, value) => { Processor = value; }, sampleRate: 48000,
        WebAssembly, ArrayBuffer, Uint8Array, Float32Array, DataView, Map, Error, Math, Number, console };
      vm.createContext(sandbox);
      vm.runInContext(source, sandbox);
      const processor = new Processor({ processorOptions: { wasmBinary: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } });
      for (let attempt = 0; !processor.ready && attempt < 500; attempt++) await new Promise(resolveWait => setTimeout(resolveWait, 10));
      assert(processor.ready, JSON.stringify(messages));
      assert.equal(processor.perfEnabled, false);
      // Validate the same real APIs outside timing in both modes.
      assert.equal(processor.api.refreshTelemetry(processor.engine), 1);
      assert.equal(processor.api.copyTelemetry(processor.engine, processor.telemetryPtr), 1);
      processor.handleMessage({ type: 'event', event: { eventKind: 3 } });
      processor.handleMessage({ type: 'recorded-capture-control', request: { action: 'start', enabled: true,
        sessionToken: 'cpu-capture', sourceLaneIndex: 0, targetLaneIndex: 0, source: 'keyboard', durationBeats: 16, gridSteps: 16 } });
      let clockReads = 0;
      const readClock = processor.readCaptureClock.bind(processor);
      processor.readCaptureClock = () => {
        clockReads++;
        // Legacy-equivalent caller work: two full refresh/copies per quantum,
        // retaining the same compact clock and pre/post-render boundaries.
        if (mode === 'baseline') {
          processor.api.refreshTelemetry(processor.engine);
          processor.api.copyTelemetry(processor.engine, processor.telemetryPtr);
        }
        return readClock();
      };
      const output = [[new Float32Array(128), new Float32Array(128)]];
      for (let block = 0; block < warmup; block++) processor.process([], output);
      assert(processor.recordedCapture, 'capture must remain armed through warmup');
      messages.length = 0;
      const refreshCount = () => processor.exports.kessho_product_get_telemetry_refresh_count(processor.engine);
      const beforeRefresh = refreshCount();
      const beforeReads = clockReads;
      const start = process.cpuUsage();
      for (let block = 0; block < blocks; block++) processor.process([], output);
      const cpu = process.cpuUsage(start);
      const refreshes = Number(refreshCount() - beforeRefresh);
      assert.equal(clockReads - beforeReads, 2 * blocks);
      assert.equal(refreshes, mode === 'baseline' ? 2 * blocks : 0);
      assert(processor.recordedCapture, 'capture must remain armed throughout measurement');
      assert(!messages.some(message => message.type === 'error'), JSON.stringify(messages));
      assert.equal(processor.api.refreshTelemetry(processor.engine), 1);
      assert.equal(processor.api.copyTelemetry(processor.engine, processor.telemetryPtr), 1);
      // Compare capture publication/clock behavior and the final output block
      // outside timing; this silent fixture does not establish nonzero PCM parity.
      const behavior = JSON.stringify({ clock: processor.captureClock,
        batches: messages.filter(message => message.type === 'recorded-capture-batch'),
        finalOutput: output[0].map(channel => Array.from(channel)) });
      if (expectedBehavior === undefined) expectedBehavior = behavior;
      else assert.equal(behavior, expectedBehavior, 'capture behavior or final PCM differs');
      const cpuMs = (cpu.user + cpu.system) / 1000;
      rows.push({ mode, trial: trial + 1, cpuMs, cpuPercent: cpuMs / (blocks * 128 / 48) * 100,
        fullTelemetryRefreshCopies: refreshes, compactClockReads: clockReads - beforeReads });
      console.error(`capture ${mode} trial ${trial + 1} complete`);
    }
  }
  summarize('R1 WASM capture-on synchronous callback microbenchmark (silent keyboard capture, diagnostics off)', rows);
}

function nativeComparison() {
  const dir = mkdtempSync(join(tmpdir(), 'mobile-cpu-matched-'));
  try {
    // Reuse the established Product CPU stress snapshot, not a second fixture.
    const harness = join(dir, 'comparison.cpp');
    writeFileSync(harness, `#define main existing_cpu_budget_main
#include "${resolve(root, 'cpp/KesshoCore/tests/ProductCpuBudgetTests.cpp')}"
#undef main
#include <fstream>
int main(int argc, char** argv) {
  require(argc == 2, "PCM destination missing");
  constexpr uint32_t frames = 128;
  auto snapshot = makeSnapshot();
  enableFxStress(snapshot);
  snapshot.fx.spectral_freeze_mode = 2u;
  snapshot.fx.spectral_freeze_stretch_speed = 0.0f;
  snapshot.fx.spectral_freeze_refresh = 0.0f;
  auto* engine = kessho_product_create(48000.0, frames, 0);
  require(engine != nullptr, "create failed");
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "load failed");
  float left[frames]{}, right[frames]{};
  // Fill capture history with nonzero source audio before freezing it.
  for (uint32_t i = 0; i < 1024; ++i) kessho_product_render(engine, left, right, frames);
  triggerSpectralFreezeCapture(engine);
  for (uint32_t i = 0; i < ${warmup}; ++i) kessho_product_render(engine, left, right, frames);
  std::vector<float> pcm(${blocks} * frames * 2);
  double elapsed_ms = 0;
  double energy = 0;
  for (uint32_t block = 0; block < ${blocks}; ++block) {
    const auto start = std::clock();
    kessho_product_render(engine, left, right, frames);
    elapsed_ms += 1000.0 * (std::clock() - start) / CLOCKS_PER_SEC;
    for (uint32_t i = 0; i < frames; ++i) {
      require(std::isfinite(left[i]) && std::isfinite(right[i]), "nonfinite PCM");
      pcm[(block * frames + i) * 2] = left[i];
      pcm[(block * frames + i) * 2 + 1] = right[i];
      energy += left[i] * left[i] + right[i] * right[i];
    }
  }
  require(energy > 0, "silent workload");
  std::ofstream file(argv[1], std::ios::binary);
  file.write(reinterpret_cast<const char*>(pcm.data()), pcm.size() * sizeof(float));
  std::cout << elapsed_ms << " " << elapsed_ms / (${blocks} * frames / 48.0) * 100.0 << "\\n";
  kessho_product_destroy(engine);
}
`);
    const replacements = new Map();
    for (const [path, from, to] of [
      ['cpp/KesshoCore/src/modules/KesshoDynamicsDriftModule.cpp', 'master_only_ ? 1 : 0', '0'],
      ['cpp/KesshoCore/src/modules/spectral_freeze/SpectralFreezeEngine.cpp', 'constexpr bool cache_enabled = true;', 'constexpr bool cache_enabled = false;'],
    ]) {
      const original = resolve(root, path);
      const source = readFileSync(original, 'utf8');
      assert.equal(source.split(from).length, 2, `baseline substitution changed: ${path}`);
      const copy = join(dir, path.split('/').at(-1));
      writeFileSync(copy, source.replace(from, to));
      replacements.set(original, copy);
    }
    const sources = resolveKesshoCoreSources(root, { includeDebugApi: true });
    for (const mode of ['baseline', 'current']) {
      console.error(`compiling ${mode} native comparison`);
      run('/usr/bin/clang++', ['-std=c++17', '-O2', '-DKESSHO_PRODUCT_ENABLE_DEBUG_API=1',
        ...kesshoCoreIncludeArgs(root), ...[...replacements.keys()].flatMap(path => ['-I', dirname(path)]),
        ...sources.map(path => mode === 'baseline' ? replacements.get(path) ?? path : path), harness, '-o', join(dir, mode)]);
    }
    const rows = [];
    let expectedPcm;
    for (let trial = 0; trial < trials; trial++) {
      for (const mode of trial % 2 ? ['current', 'baseline'] : ['baseline', 'current']) {
        const pcmPath = join(dir, `${mode}.f32`);
        const [cpuMs, cpuPercent] = run(join(dir, mode), [pcmPath]).trim().split(/\s+/).map(Number);
        assert(Number.isFinite(cpuMs) && Number.isFinite(cpuPercent));
        const pcm = readFileSync(pcmPath);
        if (expectedPcm) assert(pcm.equals(expectedPcm), 'matched native PCM differs');
        else expectedPcm = pcm;
        rows.push({ mode, trial: trial + 1, cpuMs, cpuPercent });
        console.error(`native ${mode} trial ${trial + 1} complete`);
      }
    }
    summarize('Product active-FX stationary frozen stretch; baseline restores A full-master + D uncached; C/B unchanged; exact PCM', rows);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

if (only !== '--native') await captureComparison();
if (only !== '--capture') nativeComparison();
