import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  kesshoCoreIncludeArgs,
  resolveKesshoCoreSources,
} from './kessho-core-build-manifest.mjs';

const root = process.cwd();
const buildDir = resolve(root, 'build/kessho-core/parity');
const nativeBinary = resolve(buildDir, 'kessho_core_render_fixture');
const wasmPath = resolve(root, 'public/worklets/kessho_core.wasm');
const sources = resolveKesshoCoreSources(root);
const fixtureSource = resolve(root, 'cpp/KesshoCore/tests/kessho_core_render_fixture.cpp');

const sampleRate = 48000;
const blockSize = 128;
const totalFrames = 4096;
const totalSamples = totalFrames * 2;

function run(command, args, options = {}) {
  console.log(`> ${[command, ...args].join(' ')}`);
  return execFileSync(command, args, { cwd: root, ...options });
}

function requireExport(exports, name) {
  const fn = exports[name] || exports[`_${name}`];
  if (typeof fn !== 'function') {
    throw new Error(`Missing WASM export: ${name}`);
  }

  return fn;
}

function floatsFromBuffer(buffer) {
  if (buffer.byteLength !== totalSamples * Float32Array.BYTES_PER_ELEMENT) {
    throw new Error(`Unexpected native render size: ${buffer.byteLength}`);
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const floats = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i += 1) {
    floats[i] = view.getFloat32(i * Float32Array.BYTES_PER_ELEMENT, true);
  }

  return floats;
}

function stats(signal) {
  let sumSq = 0;
  let peak = 0;
  for (const sample of signal) {
    if (!Number.isFinite(sample)) {
      throw new Error('Render produced a non-finite sample');
    }

    peak = Math.max(peak, Math.abs(sample));
    sumSq += sample * sample;
  }

  return { peak, rms: Math.sqrt(sumSq / Math.max(1, signal.length)) };
}

function diffStats(a, b) {
  if (a.length !== b.length) {
    throw new Error('Render lengths differ');
  }

  let sumSq = 0;
  let peak = 0;
  for (let i = 0; i < a.length; i += 1) {
    const diff = a[i] - b[i];
    peak = Math.max(peak, Math.abs(diff));
    sumSq += diff * diff;
  }

  return { peak, rms: Math.sqrt(sumSq / Math.max(1, a.length)) };
}

function compileNativeFixture() {
  rmSync(buildDir, { recursive: true, force: true });
  mkdirSync(buildDir, { recursive: true });
  run('/usr/bin/clang++', [
    '-std=c++17',
    '-O2',
    '-Wall',
    '-Wextra',
    '-Werror',
    ...kesshoCoreIncludeArgs(root),
    ...sources,
    fixtureSource,
    '-o',
    nativeBinary,
  ], { stdio: 'inherit' });
}

async function renderWasm() {
  if (!existsSync(wasmPath)) {
    throw new Error('Missing public/worklets/kessho_core.wasm. Run `npm run core:build:wasm` first.');
  }

  const module = await WebAssembly.compile(readFileSync(wasmPath));
  const instance = await WebAssembly.instantiate(module, {
    env: {
      emscripten_notify_memory_growth: () => {},
      abort: () => {},
    },
    wasi_snapshot_preview1: {
      fd_write: () => 0,
      fd_seek: () => 0,
      fd_close: () => 0,
      proc_exit: () => 0,
      environ_get: () => 0,
      environ_sizes_get: () => 0,
      clock_time_get: () => 0,
    },
  });
  const wasm = instance.exports;
  const malloc = requireExport(wasm, 'malloc');
  const free = requireExport(wasm, 'free');
  const create = requireExport(wasm, 'kessho_create');
  const destroy = requireExport(wasm, 'kessho_destroy');
  const start = requireExport(wasm, 'kessho_start');
  const render = requireExport(wasm, 'kessho_render');
  const setRenderMode = requireExport(wasm, 'kessho_set_render_mode');
  const setSmokeTone = requireExport(wasm, 'kessho_set_smoke_tone');

  const leftPtr = malloc(blockSize * Float32Array.BYTES_PER_ELEMENT);
  const rightPtr = malloc(blockSize * Float32Array.BYTES_PER_ELEMENT);
  const engine = create(sampleRate, blockSize);
  if (!leftPtr || !rightPtr || !engine) {
    throw new Error('Failed to allocate WASM render state');
  }

  const output = new Float32Array(totalSamples);
  const heap = new Float32Array(wasm.memory.buffer);
  const leftOffset = leftPtr >> 2;
  const rightOffset = rightPtr >> 2;

  if (setRenderMode(engine, 1) !== 1) {
    throw new Error('Failed to set WASM smoke render mode');
  }
  setSmokeTone(engine, 440, 0.2);
  start(engine);

  let written = 0;
  while (written < totalFrames) {
    const frames = Math.min(blockSize, totalFrames - written);
    render(engine, leftPtr, rightPtr, frames);
    for (let i = 0; i < frames; i += 1) {
      output[(written + i) * 2] = heap[leftOffset + i];
      output[(written + i) * 2 + 1] = heap[rightOffset + i];
    }
    written += frames;
  }

  destroy(engine);
  free(leftPtr);
  free(rightPtr);
  return output;
}

compileNativeFixture();
const native = floatsFromBuffer(run(nativeBinary, []));
const wasm = await renderWasm();
const nativeStats = stats(native);
const wasmStats = stats(wasm);
const residual = diffStats(native, wasm);

if (nativeStats.peak <= 0.05 || wasmStats.peak <= 0.05) {
  throw new Error('Smoke render was unexpectedly quiet');
}
if (nativeStats.peak > 0.201 || wasmStats.peak > 0.201) {
  throw new Error(`Smoke render exceeded expected amplitude: native ${nativeStats.peak}, wasm ${wasmStats.peak}`);
}
if (residual.rms > 1.0e-5 || residual.peak > 1.0e-4) {
  throw new Error(`Native/WASM render drift too high: RMS ${residual.rms}, peak ${residual.peak}`);
}

console.log(
  `KesshoCore native/WASM smoke parity passed: residual RMS ${residual.rms.toExponential(3)}, peak ${residual.peak.toExponential(3)}`
);
