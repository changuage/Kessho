/**
 * Granular-FX WASM Worklet Processor
 *
 * Thin AudioWorkletProcessor shell that loads kessho_granular.wasm and delegates
 * all DSP to the C++ engine.  Presents the **exact same postMessage interface**
 * as granular-fx.worklet.js so that engine.ts can swap transparently.
 *
 * Message types received (matching granular-fx.worklet.js):
 *   'wasmBinary'      � ArrayBuffer of compiled WASM module
 *   'params'          � full GranularParams object
 *   'randomSequence'  � Float32Array of random values
 *   'reseed'          � new random sequence
 *   'euclidTrigger'   � per-voice trigger with optional overrides
 *   'enablePerf'      � toggle CPU measurement
 *
 * Message types sent:
 *   'position'        � writeHead + voice positions (~20 Hz)
 *   'perf'            � CPU usage stats
 *   'wasmReady'       � emitted once WASM is loaded and initialized
 */

// Safe performance.now() � not all AudioWorklet scopes expose `performance`
const _perfNow = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();

// --------------- Constants ---------------

const NUM_VOICES = 4;
const MODE_MAP = { clean: 0, granular: 1, legacy: 2 };
const POS_REPORT_INTERVAL = Math.floor(sampleRate / 20);

// --------------- Processor ---------------

class GranularFXWasmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.wasm = null;
    this.heap = new Float32Array(0);
    this.inputPtr = 0;
    this.outputPtr = 0;
    this.positionsPtr = 0;   // for voice position query (4 floats)
    this.scalePtr = 0;       // for scale intervals (12 ints)
    this.ready = false;

    // Perf measurement
    this.perfEnabled = false;
    this.perfTotalTime = 0;
    this.perfPeakTime = 0;
    this.perfOverBudgetCount = 0;
    this.perfBlockCount = 0;
    this.perfCount = 0;
    this.perfSamplesSinceReport = 0;
    this.perfReportInterval = Math.floor(sampleRate * 0.5);

    // Position reporting
    this.posReportCounter = 0;

    // Current params
    this.params = null;

    // Buffered random sequence (in case it arrives before WASM is ready)
    this.pendingRandomSequence = null;

    this.port.onmessage = (event) => this.handleMessage(event.data);
  }

  /**
   * Called from the main thread with the WASM binary.
   * We compile and instantiate in the worklet scope.
   */
  async initWasm(wasmBinary) {
    const module = await WebAssembly.compile(wasmBinary);
    // STANDALONE_WASM=1 produces a WASI-compatible module that expects
    // wasi_snapshot_preview1 imports. We provide no-op stubs since we
    // don't use any WASI features (no file I/O, no stdout).
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

    // Initialize engine: 16s buffer at current sample rate
    const bufferSeconds = this.params?.bufferSeconds ?? 16;
    const result = exports.granular_init(sampleRate, bufferSeconds);
    if (result !== 0) {
      console.error('[GranularFX-WASM] Init failed:', result);
      return;
    }

    // Cache buffer pointers
    this.inputPtr = exports.granular_get_input_ptr();
    this.outputPtr = exports.granular_get_output_ptr();

    // Allocate persistent heap regions for queries
    this.positionsPtr = exports.malloc(NUM_VOICES * 4); // 4 floats
    this.scalePtr = exports.malloc(12 * 4);             // 12 ints

    this.ready = true;
    this.port.postMessage({ type: 'wasmReady' });

    // Apply any params that arrived before WASM was ready
    if (this.params) {
      this.applyParams(this.params);
    }

    // Apply any random sequence that arrived before WASM was ready
    if (this.pendingRandomSequence) {
      const seq = this.pendingRandomSequence;
      this.pendingRandomSequence = null;
      const ptr = this.wasm.malloc(seq.length * 4);
      this.getHeapF32().set(seq, ptr >> 2);
      this.wasm.granular_set_random_sequence(ptr, seq.length);
      this.wasm.free(ptr);
    }
  }

  handleMessage(data) {
    switch (data.type) {
      case 'wasmBinary':
        this.initWasm(data.binary);
        break;

      case 'params':
        this.params = Object.assign(this.params || {}, data.params);
        if (this.ready) this.applyParams(this.params);
        break;

      case 'randomSequence':
      case 'reseed': {
        const seq = data.sequence;
        if (!this.ready || !this.wasm) {
          // Buffer for later � will be applied once WASM is initialized
          this.pendingRandomSequence = seq;
          break;
        }
        const ptr = this.wasm.malloc(seq.length * 4);
        this.getHeapF32().set(seq, ptr >> 2);
        this.wasm.granular_set_random_sequence(ptr, seq.length);
        this.wasm.free(ptr);
        break;
      }

      case 'euclidTrigger': {
        if (!this.ready || !this.wasm) break;
        const voice = data.voice;
        const velocity = data.velocity;
        const sliceOverride = data.sliceOverride !== undefined ? data.sliceOverride : -1;
        const pitchOverride = data.pitchOverride || 0;
        const hasPitch = data.pitchOverride !== undefined ? 1 : 0;
        const reverseOverride = data.reverseOverride === true ? 1 : 0;
        const hasReverse = data.reverseOverride !== undefined ? 1 : 0;
        this.wasm.granular_euclid_trigger(voice, velocity, sliceOverride,
          pitchOverride, hasPitch, reverseOverride, hasReverse);
        break;
      }

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
        // Free WASM heap allocations and mark as not-ready to stop processing
        if (this.wasm && this.ready) {
          try {
            if (this.positionsPtr) { this.wasm.free(this.positionsPtr); this.positionsPtr = 0; }
            if (this.scalePtr) { this.wasm.free(this.scalePtr); this.scalePtr = 0; }
            this.wasm.granular_destroy();
          } catch (e) { /* */ }
        }
        this.ready = false;
        this.wasm = null;
        break;
    }
  }

  /** Translate GranularParams ? C API calls */
  applyParams(p) {
    const w = this.wasm;

    // Global
    w.granular_set_enabled(p.enabled ? 1 : 0);
    w.granular_set_freeze(p.freeze ? 1 : 0, p.freezeWithFeedback ? 1 : 0);
    w.granular_set_dry_wet(p.dryWet);
    w.granular_set_feedback(p.feedback, p.feedbackLPF);
    w.granular_set_buffer_size(p.bufferSeconds);

    // Scale
    if (p.scaleIntervals && p.scaleIntervals.length > 0) {
      const heap32 = new Int32Array(this.wasm.memory.buffer);
      const count = Math.min(p.scaleIntervals.length, 12);
      for (let i = 0; i < count; i++) {
        heap32[(this.scalePtr >> 2) + i] = p.scaleIntervals[i];
      }
      w.granular_set_scale(this.scalePtr, count);
    } else {
      w.granular_set_scale(0, 0);
    }

    // Per-voice
    for (let v = 0; v < NUM_VOICES; v++) {
      w.granular_set_voice_mode(v,
        p.voiceEnabled[v] ? 1 : 0,
        MODE_MAP[p.voiceMode[v]] ?? 1);

      w.granular_set_voice_position(v,
        p.voiceSlice[v] || 0,
        p.voiceSpeed[v] ?? 1,
        p.voiceReverse[v] ? 1 : 0,
        p.voicePitch[v] || 0,
        p.voiceWriteFollow[v] || 0);

      w.granular_set_voice_grain(v,
        p.voiceDensity[v] || 20,
        p.voiceGrainSize[v] || 80,
        p.voiceSpray[v] || 0,
        p.voiceGrainOct[v] || 0,
        p.voiceAttack[v] ?? 0.003,
        p.voiceDecay[v] ?? 0.5);

      w.granular_set_voice_output(v,
        p.voiceGain[v] ?? 0.5,
        p.voicePan[v] || 0,
        p.voiceBlur[v] || 0,
        p.voiceStereoSpread[v] ?? 0.5);

      w.granular_set_voice_lfo(v,
        p.voicePosLFORate[v] || 0,
        p.voicePosLFODepth[v] || 0,
        p.voicePanLFORate[v] || 0,
        p.voiceReverseLFORate[v] || 0,
        p.voiceRecordLFORate[v] || 0);

      w.granular_set_voice_euclid_gated(v, p.euclidGated[v] ? 1 : 0);
      w.granular_set_voice_euclid_muted(v, p.euclidMuted[v] ? 1 : 0);
    }

    // Legacy
    w.granular_set_legacy_params(
      p.legacyJitter,
      p.legacyProbability,
      p.legacyPitchMode === 'harmonic' ? 1 : 0,
      p.legacyPitchSpread,
      p.legacyMaxGrains,
      p.legacyFeedback);
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
    const perfStart = this.perfEnabled ? _perfNow() : 0;
    const blockSize = (outputs[0] && outputs[0][0]?.length) || 128;

    if (!this.ready || !this.wasm) {
      // Passthrough until WASM is ready
      const input = inputs[0];
      const output = outputs[0];
      if (input && output) {
        for (let ch = 0; ch < output.length; ch++) {
          if (input[ch]) output[ch].set(input[ch]);
        }
      }
      // Still report perf so the overlay knows this worklet is alive
      this._reportPerf(perfStart, blockSize);
      return true;
    }

    const input = inputs[0];
    const output = outputs[0];
    const heap = this.getHeapF32();

    // -- Copy input to WASM (interleaved stereo) --
    const inOffset = this.inputPtr >> 2;
    const inL = input[0];
    const inR = input[1] || inL;
    if (inL) {
      for (let i = 0; i < blockSize; i++) {
        heap[inOffset + i * 2] = inL[i];
        heap[inOffset + i * 2 + 1] = inR[i];
      }
    }

    // -- Process --
    this.wasm.granular_process_block(blockSize);

    // -- Copy output from WASM (deinterleave) --
    const outOffset = this.outputPtr >> 2;
    const outL = output[0];
    const outR = output[1] || outL;
    for (let i = 0; i < blockSize; i++) {
      outL[i] = heap[outOffset + i * 2];
      outR[i] = heap[outOffset + i * 2 + 1];
    }

    // -- Position reporting (~20 Hz) --
    this.posReportCounter += blockSize;
    if (this.posReportCounter >= POS_REPORT_INTERVAL) {
      this.posReportCounter = 0;
      const freshHeap = this.getHeapF32();
      this.wasm.granular_get_voice_positions(this.positionsPtr);
      const posOffset = this.positionsPtr >> 2;
      this.port.postMessage({
        type: 'position',
        writeHead: this.wasm.granular_get_write_head(),
        voices: [
          freshHeap[posOffset],
          freshHeap[posOffset + 1],
          freshHeap[posOffset + 2],
          freshHeap[posOffset + 3],
        ],
      });
    }

    // -- Perf reporting --
    this._reportPerf(perfStart, blockSize);

    return true;
  }

  _reportPerf(perfStart, blockSize) {
    if (!this.perfEnabled) return;
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
        name: 'granular-fx-wasm',
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
}

registerProcessor('granular-fx-wasm', GranularFXWasmProcessor);
