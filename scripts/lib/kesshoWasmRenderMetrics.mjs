import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
export {
  blockRms,
  maxBlockEdge,
  percentile,
  roundMetric,
  sampleStats,
} from '../product-core/lib/audioMetrics.mjs';

export const KESSHO_RENDER_SAMPLE_RATE = 48_000;
export const KESSHO_RENDER_BLOCK_FRAMES = 128;
export const KESSHO_RENDER_QUANTUM_MS =
  (KESSHO_RENDER_BLOCK_FRAMES * 1000) / KESSHO_RENDER_SAMPLE_RATE;

export function assertMetric(condition, message) {
  if (!condition) throw new Error(message);
}

function resolveWasmExport(exports, name) {
  const fn = exports[name] || exports[`_${name}`];
  assertMetric(typeof fn === 'function', `missing WASM export ${name}`);
  return fn;
}

export async function createKesshoModuleHarness(root, moduleType, options = {}) {
  const wasmPath = options.wasmPath ?? 'public/worklets/kessho_core.wasm';
  const sampleRate = options.sampleRate ?? KESSHO_RENDER_SAMPLE_RATE;
  const frames = options.frames ?? KESSHO_RENDER_BLOCK_FRAMES;
  const module = await WebAssembly.compile(readFileSync(resolve(root, wasmPath)));
  const instance = await WebAssembly.instantiate(module, {
    env: {
      emscripten_notify_memory_growth: () => {},
      abort: () => {},
    },
    wasi_snapshot_preview1: {
      fd_write: () => 0,
      fd_seek: () => 0,
      fd_close: () => 0,
      proc_exit: () => {},
      environ_get: () => 0,
      environ_sizes_get: () => 0,
      clock_time_get: () => 0,
    },
  });

  return new KesshoModuleHarness(instance.exports, moduleType, sampleRate, frames);
}

export class KesshoModuleHarness {
  constructor(exports, moduleType, sampleRate, frames) {
    this.exports = exports;
    this.sampleRate = sampleRate;
    this.frames = frames;
    this.malloc = resolveWasmExport(exports, 'malloc');
    this.free = resolveWasmExport(exports, 'free');
    this.moduleCreate = resolveWasmExport(exports, 'kessho_module_create');
    this.moduleDestroy = resolveWasmExport(exports, 'kessho_module_destroy');
    this.moduleReset = resolveWasmExport(exports, 'kessho_module_reset');
    this.moduleGetParamCount = resolveWasmExport(exports, 'kessho_module_get_param_count');
    this.moduleGetParamsPtr = resolveWasmExport(exports, 'kessho_module_get_params_ptr');
    this.moduleCommitParams = resolveWasmExport(exports, 'kessho_module_commit_params');
    this.moduleProcessInterleaved = resolveWasmExport(exports, 'kessho_module_process_interleaved');

    this.module = this.moduleCreate(moduleType, sampleRate, frames);
    assertMetric(this.module !== 0, `WASM failed to create module type ${moduleType}`);
    this.inputPtr = this.malloc(frames * 2 * Float32Array.BYTES_PER_ELEMENT);
    this.outputPtr = this.malloc(frames * 2 * Float32Array.BYTES_PER_ELEMENT);
    assertMetric(this.inputPtr !== 0 && this.outputPtr !== 0, 'WASM render buffer allocation failed');
    this.refreshMemoryViews();

    this.inputOffset = this.inputPtr >> 2;
    this.outputOffset = this.outputPtr >> 2;
    this.paramCount = this.moduleGetParamCount(this.module);
    this.paramsPtr = this.moduleGetParamsPtr(this.module);
    assertMetric(this.paramsPtr !== 0, 'WASM module params pointer was null');
    this.paramsOffset = this.paramsPtr >> 2;
  }

  refreshMemoryViews() {
    this.heap = new Float32Array(this.exports.memory.buffer);
  }

  setParam(index, value) {
    assertMetric(index >= 0 && index < this.paramCount, `param index ${index} outside count ${this.paramCount}`);
    this.heap[this.paramsOffset + index] = value;
  }

  commitParams() {
    this.moduleCommitParams(this.module);
  }

  reset() {
    this.moduleReset(this.module);
    this.refreshMemoryViews();
  }

  fillInput(fill) {
    for (let frame = 0; frame < this.frames; frame += 1) {
      const [left, right] = fill(frame);
      this.heap[this.inputOffset + frame * 2] = left;
      this.heap[this.inputOffset + frame * 2 + 1] = right;
    }
  }

  clearOutput() {
    this.heap.fill(0, this.outputOffset, this.outputOffset + this.frames * 2);
  }

  processInterleaved() {
    const startedAt = performance.now();
    const ok = this.moduleProcessInterleaved(this.module, this.inputPtr, this.outputPtr, this.frames);
    const elapsedMs = performance.now() - startedAt;
    assertMetric(ok === 1, 'WASM module interleaved process failed');
    return elapsedMs;
  }

  outputSamples() {
    return Array.from(this.heap.slice(this.outputOffset, this.outputOffset + this.frames * 2));
  }

  inputSamples() {
    return Array.from(this.heap.slice(this.inputOffset, this.inputOffset + this.frames * 2));
  }

  destroy() {
    if (this.module) {
      this.moduleDestroy(this.module);
      this.module = 0;
    }
    if (this.inputPtr) {
      this.free(this.inputPtr);
      this.inputPtr = 0;
    }
    if (this.outputPtr) {
      this.free(this.outputPtr);
      this.outputPtr = 0;
    }
  }
}
