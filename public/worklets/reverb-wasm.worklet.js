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

const TYPE_MAP = { plate: 0, hall: 1, cathedral: 2, darkHall: 3, dattorroPlate: 4, dattorroShimmer: 5 };
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
    this.missingExportWarnings = new Set();
    this.resetOnNextInput = false;

    // Perf measurement
    this.perfEnabled = false;
    this.perfTotalTime = 0;
    this.perfPeakTime = 0;
    this.perfOverBudgetCount = 0;
    this.perfBlockCount = 0;
    this.perfCount = 0;
    this.perfSamplesSinceReport = 0;
    this.perfReportInterval = Math.floor(sampleRate * 0.5);

    // Buffer params that arrive before WASM is ready
    this.pendingParams = null;
    this.lastParams = null;

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

      case 'reset':
        if (this.ready && this.wasm) {
          this.resetReverbState();
          this.resetOnNextInput = true;
        }
        break;

      case 'enablePerf':
        this.perfEnabled = data.enabled;
        this.perfTotalTime = 0;
        this.perfPeakTime = 0;
        this.perfOverBudgetCount = 0;
        this.perfBlockCount = 0;
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

  callOptionalExport(name, ...args) {
    const fn = this.wasm?.[name];
    if (typeof fn === 'function') {
      fn(...args);
      return true;
    }
    if (!this.missingExportWarnings.has(name)) {
      this.missingExportWarnings.add(name);
      console.warn(`[Reverb-WASM] Optional export missing in loaded binary: ${name}`);
    }
    return false;
  }

  resetReverbState() {
    this.wasm.reverb_init(sampleRate);
    this.inputPtr = this.wasm.reverb_get_input_ptr();
    this.outputPtr = this.wasm.reverb_get_output_ptr();
    if (this.lastParams) this.applyParams(this.lastParams);
  }

  /** Translate reverb params object → C API calls */
  applyParams(p) {
    this.lastParams = { ...(p ?? {}) };
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

    // ── v2 params ──

    // Per-line chorus modulation
    if (p.chorusRate !== undefined || p.chorusDepth !== undefined) {
      w.reverb_set_chorus(p.chorusRate ?? 0.5, p.chorusDepth ?? 12);
    }

    // Modulation character: 0=sine, 1=drift, 2=hybrid
    if (p.modCharacter !== undefined) {
      const MOD_CHAR_MAP = { sine: 0, drift: 1, hybrid: 2 };
      const mc = typeof p.modCharacter === 'string'
        ? (MOD_CHAR_MAP[p.modCharacter] ?? 2)
        : p.modCharacter;
      w.reverb_set_mod_character(mc);
    }

    // Multi-band damping
    if (p.dampLow !== undefined || p.dampHigh !== undefined || p.crossoverFreq !== undefined) {
      w.reverb_set_multiband_damp(
        p.dampLow ?? 0.1,
        p.dampHigh ?? 0.3,
        p.crossoverFreq ?? 800
      );
    }

    // Input tone shaping
    if (p.inputTone !== undefined) {
      w.reverb_set_input_tone(p.inputTone);
    }

    // Shimmer feedback (compound pitch shifting)
    if (p.shimmerFeedback !== undefined) {
      w.reverb_set_shimmer_feedback(p.shimmerFeedback);
    }

    // v3 params: Warp and Cross-feed
    if (p.warp !== undefined) {
      w.reverb_set_warp(p.warp);
    }
    if (p.crossFeed !== undefined) {
      w.reverb_set_cross_feed(p.crossFeed);
    }

    // v4 params: Early reflections, Air absorption, Saturation mode
    if (p.earlyReflections !== undefined) {
      w.reverb_set_early_reflections(p.earlyReflections);
    }
    if (p.airAbsorption !== undefined) {
      w.reverb_set_air_absorption(p.airAbsorption);
    }
    if (p.saturationMode !== undefined) {
      w.reverb_set_saturation_mode(p.saturationMode);
    }
    // v5 params: Transient smoothing
    if (p.transientSmooth !== undefined) {
      this.callOptionalExport('reverb_set_transient_smooth', p.transientSmooth);
    }
    if (p.erLpFreq !== undefined) {
      this.callOptionalExport('reverb_set_er_lp_freq', p.erLpFreq);
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
    const inL = input?.[0];
    const inR = input?.[1] || inL;
    let inputPeak = 0;
    if (inL) {
      for (let i = 0; i < blockSize; i++) {
        inputPeak = Math.max(inputPeak, Math.abs(inL[i] || 0), Math.abs(inR ? inR[i] || 0 : inL[i] || 0));
      }
    }
    if (this.resetOnNextInput && inputPeak <= 1e-7) {
      const outL = output[0];
      const outR = output[1] || outL;
      if (outL) outL.fill(0);
      if (outR && outR !== outL) outR.fill(0);
      return true;
    }
    if (this.resetOnNextInput) {
      this.resetReverbState();
      this.resetOnNextInput = false;
    }

    // ── Copy input to WASM (interleaved stereo) ──
    const inOffset = this.inputPtr >> 2;
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
      const budgetMs = (blockSize / sampleRate) * 1000;
      this.perfTotalTime += elapsed;
      this.perfPeakTime = Math.max(this.perfPeakTime, elapsed);
      if (elapsed > budgetMs) this.perfOverBudgetCount++;
      this.perfBlockCount++;
      this.perfCount++;
      this.perfSamplesSinceReport += blockSize;

      if (this.perfSamplesSinceReport >= this.perfReportInterval && this.perfCount > 0) {
        const avgMs = this.perfTotalTime / this.perfCount;
        this.port.postMessage({
          type: 'perf',
          name: 'reverb-wasm',
          cpuPercent: (avgMs / budgetMs) * 100,
          peakPercent: (this.perfPeakTime / budgetMs) * 100,
          missPercent: this.perfBlockCount > 0 ? (this.perfOverBudgetCount / this.perfBlockCount) * 100 : 0,
          avgTimeMs: avgMs,
          peakTimeMs: this.perfPeakTime,
        });
        this.perfTotalTime = 0;
        this.perfPeakTime = 0;
        this.perfOverBudgetCount = 0;
        this.perfBlockCount = 0;
        this.perfCount = 0;
        this.perfSamplesSinceReport = 0;
      }
    }

    return true;
  }
}

registerProcessor('reverb-wasm', ReverbWasmProcessor);
