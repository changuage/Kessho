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
 *   'granularTrigger'   � per-voice trigger with optional overrides
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
const SHAPE_MAP = { triangle: 0, sawUp: 1, sawDown: 2, square: 3 };
const POS_REPORT_INTERVAL = Math.floor(sampleRate / 20);
const WAVEFORM_BINS = 512;         // downsample buffer to this many points
const WAVEFORM_SKIP = 10;          // send waveform every Nth position report (~2Hz)
const WAVEFORM_SAMPLES_PER_BIN = 8;

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
    this.chordPtr = 0;       // for chord pitches (7 ints)
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
    this.waveformReportCounter = 0;
    this.uiActive = false;

    // Latest params received from the main thread (split by concern so we can
    // replay them after WASM init and diff them cheaply inside the worklet).
    this.globalParams = null;
    this.spaceParams = null;
    this.voiceParams = null;
    this.harmonyParams = null;
    this.legacyParams = null;

    // Last values actually applied to WASM setters.
    this.appliedGlobalParams = null;
    this.appliedSpaceParams = null;
    this.appliedVoiceParams = null;
    this.appliedHarmonyParams = null;
    this.appliedLegacyParams = null;

    // Buffered random sequence (in case it arrives before WASM is ready)
    this.pendingRandomSequence = null;
    this.latestRandomSequence = null;

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
    const bufferSeconds = this.globalParams?.bufferSeconds ?? 16;
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
    this.chordPtr = exports.malloc(7 * 4);              // 7 ints

    this.ready = true;
    this.port.postMessage({ type: 'wasmReady' });

    // Apply any params that arrived before WASM was ready
    if (this.globalParams) this.applyGlobalParams(this.globalParams);
    if (this.spaceParams) this.applySpaceParams(this.spaceParams);
    if (this.harmonyParams) this.applyHarmonyParams(this.harmonyParams);
    if (this.voiceParams) this.applyVoiceParams(this.voiceParams);
    if (this.legacyParams) this.applyLegacyParams(this.legacyParams);

    // Apply any random sequence that arrived before WASM was ready
    if (this.pendingRandomSequence) {
      const seq = this.pendingRandomSequence;
      this.pendingRandomSequence = null;
      this.applyRandomSequence(seq);
    }
  }

  resetWasmState() {
    if (!this.ready || !this.wasm) return;
    const bufferSeconds = this.globalParams?.bufferSeconds ?? 16;
    const result = this.wasm.granular_init(sampleRate, bufferSeconds);
    if (result !== 0) {
      console.error('[GranularFX-WASM] Reset failed:', result);
      return;
    }
    this.inputPtr = this.wasm.granular_get_input_ptr();
    this.outputPtr = this.wasm.granular_get_output_ptr();
    this.appliedGlobalParams = null;
    this.appliedSpaceParams = null;
    this.appliedVoiceParams = null;
    this.appliedHarmonyParams = null;
    this.appliedLegacyParams = null;
    if (this.globalParams) this.applyGlobalParams(this.globalParams);
    if (this.spaceParams) this.applySpaceParams(this.spaceParams);
    if (this.harmonyParams) this.applyHarmonyParams(this.harmonyParams);
    if (this.voiceParams) this.applyVoiceParams(this.voiceParams);
    if (this.legacyParams) this.applyLegacyParams(this.legacyParams);
    if (this.latestRandomSequence) this.applyRandomSequence(this.latestRandomSequence);
  }

  applyRandomSequence(seq) {
    if (!this.ready || !this.wasm) {
      this.pendingRandomSequence = seq;
      return;
    }
    this.latestRandomSequence = seq;
    const ptr = this.wasm.malloc(seq.length * 4);
    this.getHeapF32().set(seq, ptr >> 2);
    this.wasm.granular_set_random_sequence(ptr, seq.length);
    this.wasm.free(ptr);
  }

  handleMessage(data) {
    switch (data.type) {
      case 'wasmBinary':
        this.initWasm(data.binary);
        break;

      case 'params': {
        const params = data.params;
        this.globalParams = this.extractGlobalParams(params);
        this.spaceParams = this.extractSpaceParams(params);
        this.voiceParams = this.extractVoiceParams(params);
        this.harmonyParams = this.extractHarmonyParams(params);
        this.legacyParams = this.extractLegacyParams(params);
        if (this.ready) {
          this.applyGlobalParams(this.globalParams);
          this.applySpaceParams(this.spaceParams);
          this.applyHarmonyParams(this.harmonyParams);
          this.applyVoiceParams(this.voiceParams);
          this.applyLegacyParams(this.legacyParams);
        }
        break;
      }

      case 'globalParams':
        this.globalParams = data.params;
        if (this.ready) this.applyGlobalParams(this.globalParams);
        break;

      case 'spaceParams':
        this.spaceParams = data.params;
        if (this.ready) this.applySpaceParams(this.spaceParams);
        break;

      case 'voiceParams':
        this.voiceParams = data.params;
        if (this.ready) this.applyVoiceParams(this.voiceParams);
        break;

      case 'harmonyParams':
        this.harmonyParams = data.params;
        if (this.ready) this.applyHarmonyParams(this.harmonyParams);
        break;

      case 'legacyParams':
        this.legacyParams = data.params;
        if (this.ready) this.applyLegacyParams(this.legacyParams);
        break;

      case 'randomSequence':
      case 'reseed': {
        const seq = data.sequence;
        this.applyRandomSequence(seq);
        break;
      }

      case 'granularTrigger': {
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

      case 'uiActive':
        this.uiActive = Boolean(data.active);
        this.posReportCounter = 0;
        break;

      case 'reset':
        this.resetWasmState();
        break;

      case 'destroy':
        // Free WASM heap allocations and mark as not-ready to stop processing
        if (this.wasm && this.ready) {
          try {
            if (this.positionsPtr) { this.wasm.free(this.positionsPtr); this.positionsPtr = 0; }
            if (this.scalePtr) { this.wasm.free(this.scalePtr); this.scalePtr = 0; }
            if (this.chordPtr) { this.wasm.free(this.chordPtr); this.chordPtr = 0; }
            this.wasm.granular_destroy();
          } catch (e) { /* */ }
        }
        this.ready = false;
        this.wasm = null;
        break;
    }
  }

  extractGlobalParams(p) {
    return {
      enabled: p.enabled,
      freeze: p.freeze,
      freezeWithFeedback: p.freezeWithFeedback,
      dryWet: p.dryWet,
      feedback: p.feedback,
      feedbackLPF: p.feedbackLPF,
      bufferSeconds: p.bufferSeconds,
      grainShape: p.grainShape,
    };
  }

  extractSpaceParams(p) {
    return {
      busDiffusion: p.busDiffusion,
      timingRandomness: p.timingRandomness,
    };
  }

  extractVoiceParams(p) {
    return {
      voiceEnabled: [...p.voiceEnabled],
      voiceMode: [...p.voiceMode],
      voiceSlice: [...p.voiceSlice],
      voiceSpeed: [...p.voiceSpeed],
      voiceScanRate: [...p.voiceScanRate],
      voiceReverse: [...p.voiceReverse],
      voicePitch: [...p.voicePitch],
      voiceAttack: [...p.voiceAttack],
      voiceDecay: [...p.voiceDecay],
      voiceBlur: [...p.voiceBlur],
      voiceGrainOct: [...p.voiceGrainOct],
      voiceSpray: [...p.voiceSpray],
      voiceDensity: [...p.voiceDensity],
      voiceGrainSize: [...p.voiceGrainSize],
      voicePan: [...p.voicePan],
      voiceGain: [...p.voiceGain],
      voicePosLFORate: [...p.voicePosLFORate],
      voicePosLFODepth: [...p.voicePosLFODepth],
      voicePanLFORate: [...p.voicePanLFORate],
      voiceStereoSpread: [...p.voiceStereoSpread],
      voiceReverseLFORate: [...p.voiceReverseLFORate],
      voiceWriteFollow: [...p.voiceWriteFollow],
      voiceRecordLFORate: [...p.voiceRecordLFORate],
      tempoGated: [...p.tempoGated],
    };
  }

  extractHarmonyParams(p) {
    return {
      scaleIntervals: [...p.scaleIntervals],
      chordPitches: [...p.chordPitches],
      chordBias: p.chordBias,
    };
  }

  extractLegacyParams(p) {
    return {
      legacyJitter: p.legacyJitter,
      legacyProbability: p.legacyProbability,
      legacyPitchMode: p.legacyPitchMode,
      legacyPitchSpread: p.legacyPitchSpread,
      legacyMaxGrains: p.legacyMaxGrains,
      legacyFeedback: p.legacyFeedback,
    };
  }

  numberArrayEqual(a, b) {
    if (!a || !b) return a === b;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  applyGlobalParams(p) {
    const w = this.wasm;
    const prev = this.appliedGlobalParams;
    if (!prev || prev.enabled !== p.enabled) w.granular_set_enabled(p.enabled ? 1 : 0);
    if (!prev || prev.freeze !== p.freeze || prev.freezeWithFeedback !== p.freezeWithFeedback) {
      w.granular_set_freeze(p.freeze ? 1 : 0, p.freezeWithFeedback ? 1 : 0);
    }
    if (!prev || prev.dryWet !== p.dryWet) w.granular_set_dry_wet(p.dryWet);
    if (!prev || prev.feedback !== p.feedback || prev.feedbackLPF !== p.feedbackLPF) {
      w.granular_set_feedback(p.feedback, p.feedbackLPF);
    }
    if (!prev || prev.bufferSeconds !== p.bufferSeconds) w.granular_set_buffer_size(p.bufferSeconds);
    if (!prev || prev.grainShape !== p.grainShape) {
      w.granular_set_grain_shape(SHAPE_MAP[p.grainShape] ?? SHAPE_MAP.triangle);
    }
    this.appliedGlobalParams = { ...p };
  }

  applySpaceParams(p) {
    const w = this.wasm;
    const prev = this.appliedSpaceParams;
    if (!prev || prev.busDiffusion !== p.busDiffusion) {
      w.granular_set_bus_diffusion(p.busDiffusion ?? 0);
    }
    if (!prev || prev.timingRandomness !== p.timingRandomness) {
      w.granular_set_timing_randomness(p.timingRandomness ?? 0.35);
    }
    this.appliedSpaceParams = { ...p };
  }

  applyHarmonyParams(p) {
    const w = this.wasm;
    const prev = this.appliedHarmonyParams;
    if (!prev || !this.numberArrayEqual(prev.scaleIntervals, p.scaleIntervals)) {
      if (p.scaleIntervals && p.scaleIntervals.length > 0) {
        const heap32 = new Int32Array(this.wasm.memory.buffer);
        const count = Math.min(p.scaleIntervals.length, 12);
        for (let i = 0; i < count; i++) {
          heap32[(this.scalePtr >> 2) + i] = p.scaleIntervals[i] ?? 0;
        }
        w.granular_set_scale(this.scalePtr, count);
      } else {
        w.granular_set_scale(0, 0);
      }
    }

    const chordChanged = !prev || prev.chordBias !== p.chordBias || !this.numberArrayEqual(prev.chordPitches, p.chordPitches);
    if (chordChanged) {
      if (p.chordPitches && p.chordPitches.length > 0 && p.chordBias > 0) {
        const heap32 = new Int32Array(this.wasm.memory.buffer);
        const count = Math.min(p.chordPitches.length, 7);
        for (let i = 0; i < count; i++) {
          heap32[(this.chordPtr >> 2) + i] = p.chordPitches[i] ?? 0;
        }
        w.granular_set_chord_bias(this.chordPtr, count, p.chordBias);
      } else {
        w.granular_set_chord_bias(0, 0, 0);
      }
    }

    this.appliedHarmonyParams = {
      scaleIntervals: [...p.scaleIntervals],
      chordPitches: [...p.chordPitches],
      chordBias: p.chordBias,
    };
  }

  applyVoiceParams(p) {
    const w = this.wasm;
    const prev = this.appliedVoiceParams;
    for (let v = 0; v < NUM_VOICES; v++) {
      const voiceMode = p.voiceMode[v] ?? 'granular';
      if (!prev || prev.voiceEnabled[v] !== p.voiceEnabled[v] || prev.voiceMode[v] !== p.voiceMode[v]) {
        w.granular_set_voice_mode(v, p.voiceEnabled[v] ? 1 : 0, MODE_MAP[voiceMode] ?? 1);
      }
      if (
        !prev ||
        prev.voiceSlice[v] !== p.voiceSlice[v] ||
        prev.voiceSpeed[v] !== p.voiceSpeed[v] ||
        prev.voiceScanRate[v] !== p.voiceScanRate[v] ||
        prev.voiceReverse[v] !== p.voiceReverse[v] ||
        prev.voicePitch[v] !== p.voicePitch[v] ||
        prev.voiceWriteFollow[v] !== p.voiceWriteFollow[v]
      ) {
        w.granular_set_voice_position(
          v,
          p.voiceSlice[v] || 0,
          p.voiceSpeed[v] ?? 1,
          p.voiceScanRate[v] ?? 1,
          p.voiceReverse[v] ? 1 : 0,
          p.voicePitch[v] || 0,
          p.voiceWriteFollow[v] || 0
        );
      }
      if (
        !prev ||
        prev.voiceDensity[v] !== p.voiceDensity[v] ||
        prev.voiceGrainSize[v] !== p.voiceGrainSize[v] ||
        prev.voiceSpray[v] !== p.voiceSpray[v] ||
        prev.voiceGrainOct[v] !== p.voiceGrainOct[v] ||
        prev.voiceAttack[v] !== p.voiceAttack[v] ||
        prev.voiceDecay[v] !== p.voiceDecay[v]
      ) {
        w.granular_set_voice_grain(
          v,
          p.voiceDensity[v] || 20,
          p.voiceGrainSize[v] || 80,
          p.voiceSpray[v] || 0,
          p.voiceGrainOct[v] || 0,
          p.voiceAttack[v] ?? 0.003,
          p.voiceDecay[v] ?? 0.5
        );
      }
      if (
        !prev ||
        prev.voiceGain[v] !== p.voiceGain[v] ||
        prev.voicePan[v] !== p.voicePan[v] ||
        prev.voiceBlur[v] !== p.voiceBlur[v] ||
        prev.voiceStereoSpread[v] !== p.voiceStereoSpread[v]
      ) {
        w.granular_set_voice_output(
          v,
          p.voiceGain[v] ?? 0.5,
          p.voicePan[v] || 0,
          p.voiceBlur[v] || 0,
          p.voiceStereoSpread[v] ?? 0.5
        );
      }
      if (
        !prev ||
        prev.voicePosLFORate[v] !== p.voicePosLFORate[v] ||
        prev.voicePosLFODepth[v] !== p.voicePosLFODepth[v] ||
        prev.voicePanLFORate[v] !== p.voicePanLFORate[v] ||
        prev.voiceReverseLFORate[v] !== p.voiceReverseLFORate[v] ||
        prev.voiceRecordLFORate[v] !== p.voiceRecordLFORate[v]
      ) {
        w.granular_set_voice_lfo(
          v,
          p.voicePosLFORate[v] || 0,
          p.voicePosLFODepth[v] || 0,
          p.voicePanLFORate[v] || 0,
          p.voiceReverseLFORate[v] || 0,
          p.voiceRecordLFORate[v] || 0
        );
      }
      if (!prev || prev.tempoGated[v] !== p.tempoGated[v]) {
        w.granular_set_voice_euclid_gated(v, p.tempoGated[v] ? 1 : 0);
      }
      if (!prev) {
        w.granular_set_voice_euclid_muted(v, 0);
      }
    }
    this.appliedVoiceParams = {
      voiceEnabled: [...p.voiceEnabled],
      voiceMode: [...p.voiceMode],
      voiceSlice: [...p.voiceSlice],
      voiceSpeed: [...p.voiceSpeed],
      voiceScanRate: [...p.voiceScanRate],
      voiceReverse: [...p.voiceReverse],
      voicePitch: [...p.voicePitch],
      voiceAttack: [...p.voiceAttack],
      voiceDecay: [...p.voiceDecay],
      voiceBlur: [...p.voiceBlur],
      voiceGrainOct: [...p.voiceGrainOct],
      voiceSpray: [...p.voiceSpray],
      voiceDensity: [...p.voiceDensity],
      voiceGrainSize: [...p.voiceGrainSize],
      voicePan: [...p.voicePan],
      voiceGain: [...p.voiceGain],
      voicePosLFORate: [...p.voicePosLFORate],
      voicePosLFODepth: [...p.voicePosLFODepth],
      voicePanLFORate: [...p.voicePanLFORate],
      voiceStereoSpread: [...p.voiceStereoSpread],
      voiceReverseLFORate: [...p.voiceReverseLFORate],
      voiceWriteFollow: [...p.voiceWriteFollow],
      voiceRecordLFORate: [...p.voiceRecordLFORate],
      tempoGated: [...p.tempoGated],
    };
  }

  applyLegacyParams(p) {
    const w = this.wasm;
    const prev = this.appliedLegacyParams;
    if (
      !prev ||
      prev.legacyJitter !== p.legacyJitter ||
      prev.legacyProbability !== p.legacyProbability ||
      prev.legacyPitchMode !== p.legacyPitchMode ||
      prev.legacyPitchSpread !== p.legacyPitchSpread ||
      prev.legacyMaxGrains !== p.legacyMaxGrains ||
      prev.legacyFeedback !== p.legacyFeedback
    ) {
      w.granular_set_legacy_params(
        p.legacyJitter,
        p.legacyProbability,
        p.legacyPitchMode === 'harmonic' ? 1 : 0,
        p.legacyPitchSpread,
        p.legacyMaxGrains,
        p.legacyFeedback
      );
    }
    this.appliedLegacyParams = { ...p };
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
          const inCh = input[ch];
          const outCh = output[ch];
          if (inCh && outCh) outCh.set(inCh);
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
    const inL = input?.[0];
    const inR = input?.[1] || inL;
    if (inL) {
      for (let i = 0; i < blockSize; i++) {
        heap[inOffset + i * 2] = inL[i] ?? 0;
        heap[inOffset + i * 2 + 1] = inR?.[i] ?? 0;
      }
    }

    // -- Process --
    this.wasm.granular_process_block(blockSize);

    // -- Copy output from WASM (deinterleave) --
    const outOffset = this.outputPtr >> 2;
    const outL = output?.[0];
    const outR = output?.[1] || outL;
    if (outL && outR) {
      for (let i = 0; i < blockSize; i++) {
        outL[i] = heap[outOffset + i * 2] ?? 0;
        outR[i] = heap[outOffset + i * 2 + 1] ?? 0;
      }
    }

    // -- Position reporting (~20 Hz while the granular UI is visible) --
    if (this.uiActive) {
      this.posReportCounter += blockSize;
      if (this.posReportCounter >= POS_REPORT_INTERVAL) {
        this.posReportCounter = 0;
        const freshHeap = this.getHeapF32();
        this.wasm.granular_get_voice_positions(this.positionsPtr);
        const posOffset = this.positionsPtr >> 2;

        const msg = {
          type: 'position',
          writeHead: this.wasm.granular_get_write_head(),
          activeGrains: this.wasm.granular_get_active_grain_count(),
          voices: [
            freshHeap[posOffset],
            freshHeap[posOffset + 1],
            freshHeap[posOffset + 2],
            freshHeap[posOffset + 3],
          ],
        };

        // Waveform snapshot (~2 Hz): sparse peak probes across the left buffer.
        // This keeps the UI background readable without walking the entire
        // circular buffer on the audio thread.
        this.waveformReportCounter++;
        if (this.waveformReportCounter >= WAVEFORM_SKIP) {
          this.waveformReportCounter = 0;
          try {
            const bufPtr = this.wasm.granular_get_buffer_ptr_l();
            const bufSize = this.wasm.granular_get_buffer_size();
            if (bufPtr && bufSize > 0) {
              const latestHeap = this.getHeapF32();
              const bufOffset = bufPtr >> 2;
              const waveform = new Float32Array(WAVEFORM_BINS);
              const samplesPerBin = bufSize / WAVEFORM_BINS;
              for (let bin = 0; bin < WAVEFORM_BINS; bin++) {
                const start = Math.floor(bin * samplesPerBin);
                const end = Math.max(start + 1, Math.floor((bin + 1) * samplesPerBin));
                const span = end - start;
                let peak = 0;
                for (let sampleIndex = 0; sampleIndex < WAVEFORM_SAMPLES_PER_BIN; sampleIndex++) {
                  let s = start + Math.floor(((sampleIndex + 0.5) * span) / WAVEFORM_SAMPLES_PER_BIN);
                  if (s >= end) s = end - 1;
                  const v = Math.abs(latestHeap[bufOffset + s] ?? 0);
                  if (v > peak) peak = v;
                }
                waveform[bin] = peak;
              }
              msg.waveform = waveform;
            }
          } catch (_) { /* wasm exports not yet available */ }
        }

        this.port.postMessage(msg);
      }
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
