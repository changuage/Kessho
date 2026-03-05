/**
 * Reverb WASM Worklet Processor
 *
 * Thin AudioWorkletProcessor shell that loads kessho_reverb.wasm and delegates
 * all DSP to the C++ engine.  Same postMessage interface as reverb.worklet.js
 * so engine.ts works without changes.
 *
 * Message types received:
 *   'wasmBinary' – ArrayBuffer of compiled WASM module
 *   'params'     – reverb parameter object
 *   'enablePerf' – toggle CPU measurement
 *
 * Message types sent:
 *   'perf'       – CPU usage stats
 *   'wasmReady'  – emitted once WASM is loaded and initialized
 */

const _perfNow = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();

// ═══════════════ Type/Quality maps ═══════════════

const TYPE_MAP = { plate: 0, hall: 1, cathedral: 2, darkHall: 3 };
const QUALITY_MAP = { ultra: 0, balanced: 1, lite: 2 };

// ═══════════════ Processor ═══════════════

class ReverbWasmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.wasm = null;
    this.heap = new Float32Array(0);
    this.inputPtr = 0;
    this.outputPtr = 0;
    this.ready = false;

    // Perf measurement
    this.perfEnabled = false;
    this.perfTotalTime = 0;
    this.perfCount = 0;
    this.perfSamplesSinceReport = 0;
    this.perfReportInterval = Math.floor(sampleRate * 0.5);

    // Buffer params that arrive before WASM is ready
    this.pendingParams = null;

    this.port.onmessage = (event) => this.handleMessage(event.data);
  }

  async initWasm(wasmBinary) {
    const module = await WebAssembly.compile(wasmBinary);
    const wasiStubs = {
      wasi_snapshot_preview1: {
        fd_write: () => 0,
        fd_seek: () => 0,
        fd_close: () => 0,
        proc_exit: () => {},
        environ_get: () => 0,
        environ_sizes_get: () => 0,
        clock_time_get: () => 0,
      },
      env: {
        emscripten_notify_memory_growth: () => {},
      },
    };
    const instance = await WebAssembly.instantiate(module, wasiStubs);
    const exports = instance.exports;
    this.wasm = exports;

    // Initialize reverb engine at current sample rate
    const result = exports.reverb_init(sampleRate);
    if (result !== 0) {
      console.error('[Reverb-WASM] Init failed:', result);
      return;
    }

    // Cache buffer pointers
    this.inputPtr = exports.reverb_get_input_ptr();
    this.outputPtr = exports.reverb_get_output_ptr();

    this.ready = true;
    this.port.postMessage({ type: 'wasmReady' });

    // Apply any params that arrived before WASM was ready
    if (this.pendingParams) {
      this.applyParams(this.pendingParams);
      this.pendingParams = null;
    }
  }

  handleMessage(data) {
    switch (data.type) {
      case 'wasmBinary':
        this.initWasm(data.binary);
        break;

      case 'params':
        if (this.ready) {
          this.applyParams(data.params);
        } else {
          this.pendingParams = Object.assign(this.pendingParams || {}, data.params);
        }
        break;

      case 'enablePerf':
        this.perfEnabled = data.enabled;
        this.perfTotalTime = 0;
        this.perfCount = 0;
        this.perfSamplesSinceReport = 0;
        break;

      case 'destroy':
        if (this.wasm && this.ready) {
          try { this.wasm.reverb_destroy(); } catch (e) { /* */ }
        }
        this.ready = false;
        this.wasm = null;
        break;
    }
  }

  /** Translate reverb params object → C API calls */
  applyParams(p) {
    const w = this.wasm;

    // Type
    if (p.type !== undefined) {
      const t = typeof p.type === 'string' ? (TYPE_MAP[p.type] ?? 1) : p.type;
      w.reverb_set_type(t);
    }

    // Quality
    if (p.quality !== undefined) {
      const q = typeof p.quality === 'string' ? (QUALITY_MAP[p.quality] ?? 1) : p.quality;
      w.reverb_set_quality(q);
    }

    // Core params
    w.reverb_set_params(
      p.decay ?? 0.8,
      p.size ?? 1.5,
      p.damping ?? 0.5,
      p.diffusion ?? 0.8,
      p.modulation ?? 0.3,
      p.predelay ?? 20,
      p.width ?? 0.8
    );

    // Freeze
    w.reverb_set_freeze((p.freeze || p.infinite) ? 1 : 0);

    // Shimmer
    if (p.shimmer !== undefined || p.shimmerPitch !== undefined) {
      w.reverb_set_shimmer(p.shimmer ?? 0, p.shimmerPitch ?? 12);
    }

    // Slow modulation
    if (p.slowModRate !== undefined || p.slowModDepth !== undefined) {
      w.reverb_set_slow_mod(p.slowModRate ?? 0.05, p.slowModDepth ?? 0);
    }

    // Reverse
    if (p.reverse !== undefined || p.reverseLength !== undefined) {
      w.reverb_set_reverse(p.reverse ?? 0, p.reverseLength ?? 2);
    }
  }

  /** Get Float32Array view of WASM heap (refreshed on each access since memory can grow) */
  getHeapF32() {
    const buf = this.wasm.memory.buffer;
    if (this.heap.buffer !== buf) {
      this.heap = new Float32Array(buf);
    }
    return this.heap;
  }

  process(inputs, outputs, _params) {
    if (!this.ready || !this.wasm) {
      // Silence until WASM is ready (reverb has no dry signal)
      return true;
    }

    const perfStart = this.perfEnabled ? _perfNow() : 0;
    const input = inputs[0];
    const output = outputs[0];
    const blockSize = output[0]?.length || 128;
    const heap = this.getHeapF32();

    // ── Copy input to WASM (interleaved stereo) ──
    const inOffset = this.inputPtr >> 2;
    const inL = input?.[0];
    const inR = input?.[1] || inL;
    if (inL) {
      for (let i = 0; i < blockSize; i++) {
        heap[inOffset + i * 2] = inL[i];
        heap[inOffset + i * 2 + 1] = inR ? inR[i] : inL[i];
      }
    } else {
      // No input — zero the buffer
      for (let i = 0; i < blockSize * 2; i++) {
        heap[inOffset + i] = 0;
      }
    }

    // ── Process ──
    this.wasm.reverb_process_block(blockSize);

    // ── Copy output from WASM (deinterleave) ──
    const outOffset = this.outputPtr >> 2;
    const outL = output[0];
    const outR = output[1] || outL;
    for (let i = 0; i < blockSize; i++) {
      outL[i] = heap[outOffset + i * 2];
      if (outR !== outL) outR[i] = heap[outOffset + i * 2 + 1];
    }

    // ── Perf reporting ──
    if (this.perfEnabled) {
      const elapsed = _perfNow() - perfStart;
      this.perfTotalTime += elapsed;
      this.perfCount++;
      this.perfSamplesSinceReport += blockSize;

      if (this.perfSamplesSinceReport >= this.perfReportInterval && this.perfCount > 0) {
        const avgMs = this.perfTotalTime / this.perfCount;
        const budgetMs = (blockSize / sampleRate) * 1000;
        this.port.postMessage({
          type: 'perf',
          name: 'reverb-wasm',
          cpuPercent: (avgMs / budgetMs) * 100,
          avgTimeMs: avgMs,
        });
        this.perfTotalTime = 0;
        this.perfCount = 0;
        this.perfSamplesSinceReport = 0;
      }
    }

    return true;
  }
}

registerProcessor('reverb-wasm', ReverbWasmProcessor);
