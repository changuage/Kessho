/**
 * Granular-FX WASM Worklet Processor
 *
 * Thin AudioWorkletProcessor shell that loads kessho_granular.wasm and delegates
 * all DSP to the C++ engine.  Presents the **exact same postMessage interface**
 * as granular-fx.worklet.ts so that engine.ts can swap transparently.
 *
 * Message types received (matching granular-fx.worklet.ts):
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

/// <reference path="../../vite-env.d.ts" />

// Safe performance.now()
const _perfNow: () => number =
  typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();

// --------------- Types ---------------

type VoiceMode = 'clean' | 'granular' | 'legacy';
type GrainShape = 'triangle' | 'sawUp' | 'sawDown' | 'square';

interface GranularParams {
  enabled: boolean;
  freeze: boolean;
  freezeWithFeedback: boolean;
  dryWet: number;
  feedback: number;
  feedbackLPF: number;
  bufferSeconds: number;
  grainShape: GrainShape;
  busDiffusion: number;
  timingRandomness: number;

  voiceEnabled: boolean[];
  voiceMode: VoiceMode[];
  voiceSlice: number[];
  voiceSpeed: number[];
  voiceScanRate: number[];
  voiceReverse: boolean[];
  voicePitch: number[];
  voiceAttack: number[];
  voiceDecay: number[];
  voiceBlur: number[];
  voiceGrainOct: number[];
  voiceSpray: number[];
  voiceDensity: number[];
  voiceGrainSize: number[];
  voicePan: number[];
  voiceGain: number[];
  voicePosLFORate: number[];
  voicePosLFODepth: number[];
  voicePanLFORate: number[];
  voiceStereoSpread: number[];
  voiceReverseLFORate: number[];
  voiceWriteFollow: number[];
  voiceRecordLFORate: number[];
  scaleIntervals: number[];
  chordPitches: number[];
  chordBias: number;
  tempoGated: boolean[];

  legacyJitter: number;
  legacyProbability: number;
  legacyPitchMode: 'random' | 'harmonic';
  legacyPitchSpread: number;
  legacyMaxGrains: number;
  legacyFeedback: number;
}

type GranularGlobalParams = Pick<
  GranularParams,
  'enabled' | 'freeze' | 'freezeWithFeedback' | 'dryWet' | 'feedback' | 'feedbackLPF' | 'bufferSeconds' | 'grainShape'
>;

type GranularSpaceParams = Pick<GranularParams, 'busDiffusion' | 'timingRandomness'>;

type GranularVoiceParams = Pick<
  GranularParams,
  | 'voiceEnabled'
  | 'voiceMode'
  | 'voiceSlice'
  | 'voiceSpeed'
  | 'voiceScanRate'
  | 'voiceReverse'
  | 'voicePitch'
  | 'voiceAttack'
  | 'voiceDecay'
  | 'voiceBlur'
  | 'voiceGrainOct'
  | 'voiceSpray'
  | 'voiceDensity'
  | 'voiceGrainSize'
  | 'voicePan'
  | 'voiceGain'
  | 'voicePosLFORate'
  | 'voicePosLFODepth'
  | 'voicePanLFORate'
  | 'voiceStereoSpread'
  | 'voiceReverseLFORate'
  | 'voiceWriteFollow'
  | 'voiceRecordLFORate'
  | 'tempoGated'
>;

type GranularHarmonyParams = Pick<GranularParams, 'scaleIntervals' | 'chordPitches' | 'chordBias'>;

type GranularLegacyParams = Pick<
  GranularParams,
  'legacyJitter' | 'legacyProbability' | 'legacyPitchMode' | 'legacyPitchSpread' | 'legacyMaxGrains' | 'legacyFeedback'
>;

// --------------- WASM Module Interface ---------------

interface KesshoWasm {
  memory: WebAssembly.Memory;
  // Lifecycle
  granular_init(sampleRate: number, bufferSeconds: number): number;
  granular_destroy(): void;
  // Buffer access
  granular_get_input_ptr(): number;
  granular_get_output_ptr(): number;
  // Processing
  granular_process_block(blockSize: number): void;
  // Global params
  granular_set_enabled(enabled: number): void;
  granular_set_freeze(frozen: number, withFeedback: number): void;
  granular_set_dry_wet(level: number): void;
  granular_set_feedback(amount: number, lpfHz: number): void;
  granular_set_scale(ptr: number, count: number): void;
  granular_set_chord_bias(ptr: number, count: number, bias: number): void;
  granular_set_buffer_size(seconds: number): void;
  granular_set_grain_shape(shape: number): void;
  granular_set_bus_diffusion(amount: number): void;
  granular_set_timing_randomness(amount: number): void;
  // Per-voice
  granular_set_voice_mode(voice: number, enabled: number, mode: number): void;
  granular_set_voice_position(voice: number, slice: number, speed: number,
    scanRate: number, reverse: number, pitch: number, writeFollow: number): void;
  granular_set_voice_grain(voice: number, density: number, grainSize: number,
    spray: number, grainOct: number, attack: number, decay: number): void;
  granular_set_voice_output(voice: number, gain: number, pan: number,
    blur: number, stereoSpread: number): void;
  granular_set_voice_lfo(voice: number, posRate: number, posDepth: number,
    panRate: number, reverseRate: number, recordRate: number): void;
  granular_set_voice_euclid_gated(voice: number, gated: number): void;
  granular_set_voice_euclid_muted(voice: number, muted: number): void;
  // Legacy
  granular_set_legacy_params(jitter: number, probability: number, pitchMode: number,
    pitchSpread: number, maxGrains: number, feedback: number): void;
  // Triggers
  granular_euclid_trigger(voice: number, velocity: number, sliceOverride: number,
    pitchOverride: number, hasPitch: number, reverseOverride: number, hasReverse: number): void;
  granular_set_random_sequence(ptr: number, count: number): void;
  // Queries
  granular_get_write_head(): number;
  granular_get_voice_positions(outPtr: number): void;
  granular_get_active_grain_count(): number;
  granular_get_buffer_ptr_l(): number;
  granular_get_buffer_size(): number;
  // Memory management
  malloc(size: number): number;
  free(ptr: number): void;
}

// --------------- Constants ---------------

const NUM_VOICES = 4;
const MODE_MAP: Record<VoiceMode, number> = { clean: 0, granular: 1, legacy: 2 };
const SHAPE_MAP: Record<GrainShape, number> = { triangle: 0, sawUp: 1, sawDown: 2, square: 3 };
const POS_REPORT_INTERVAL = Math.floor(sampleRate / 20);
const WAVEFORM_BINS = 512;
const WAVEFORM_SKIP = 10;
const WAVEFORM_SAMPLES_PER_BIN = 8;

// --------------- Processor ---------------

class GranularFXWasmProcessor extends AudioWorkletProcessor {
  private wasm: KesshoWasm | null = null;
  private heap: Float32Array = new Float32Array(0);
  private heap32: Int32Array = new Int32Array(0);
  private inputPtr = 0;
  private outputPtr = 0;
  private positionsPtr = 0; // for voice position query (4 floats)
  private scalePtr = 0;     // for scale intervals (12 ints)
  private chordPtr = 0;     // for chord pitches (7 ints)
  private ready = false;

  // Perf measurement
  private perfEnabled = false;
  private perfTotalTime = 0;
  private perfCount = 0;
  private perfSamplesSinceReport = 0;
  private perfReportInterval = Math.floor(sampleRate * 0.5);

  // Position reporting
  private posReportCounter = 0;
  private waveformReportCounter = 0;
  private uiActive = false;

  // Latest params received from the main thread (split by concern so we can
  // replay them after WASM init and diff them cheaply inside the worklet).
  private globalParams: GranularGlobalParams | null = null;
  private spaceParams: GranularSpaceParams | null = null;
  private voiceParams: GranularVoiceParams | null = null;
  private harmonyParams: GranularHarmonyParams | null = null;
  private legacyParams: GranularLegacyParams | null = null;

  // Last values actually applied to WASM setters.
  private appliedGlobalParams: GranularGlobalParams | null = null;
  private appliedSpaceParams: GranularSpaceParams | null = null;
  private appliedVoiceParams: GranularVoiceParams | null = null;
  private appliedHarmonyParams: GranularHarmonyParams | null = null;
  private appliedLegacyParams: GranularLegacyParams | null = null;

  // Buffered random sequence (in case it arrives before WASM is ready)
  private pendingRandomSequence: Float32Array | null = null;

  constructor() {
    super();
    this.port.onmessage = (event) => this.handleMessage(event.data);
  }

  /**
   * Called from the main thread with the WASM binary.
   * We compile and instantiate synchronously in the worklet scope.
   */
  private async initWasm(wasmBinary: ArrayBuffer) {
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
    const exports = instance.exports as unknown as KesshoWasm;

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
      const ptr = this.wasm!.malloc(seq.length * 4);
      this.getHeapF32().set(seq, ptr >> 2);
      this.wasm!.granular_set_random_sequence(ptr, seq.length);
      this.wasm!.free(ptr);
    }
  }

  private handleMessage(data: { type: string; [key: string]: unknown }) {
    switch (data.type) {
      case 'wasmBinary':
        this.initWasm(data.binary as ArrayBuffer);
        break;

      case 'params': {
        const params = data.params as GranularParams;
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
        this.globalParams = data.params as GranularGlobalParams;
        if (this.ready) this.applyGlobalParams(this.globalParams);
        break;

      case 'spaceParams':
        this.spaceParams = data.params as GranularSpaceParams;
        if (this.ready) this.applySpaceParams(this.spaceParams);
        break;

      case 'voiceParams':
        this.voiceParams = data.params as GranularVoiceParams;
        if (this.ready) this.applyVoiceParams(this.voiceParams);
        break;

      case 'harmonyParams':
        this.harmonyParams = data.params as GranularHarmonyParams;
        if (this.ready) this.applyHarmonyParams(this.harmonyParams);
        break;

      case 'legacyParams':
        this.legacyParams = data.params as GranularLegacyParams;
        if (this.ready) this.applyLegacyParams(this.legacyParams);
        break;

      case 'randomSequence':
      case 'reseed': {
        const seq = data.sequence as Float32Array;
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

      case 'granularTrigger': {
        if (!this.ready || !this.wasm) break;
        const voice = data.voice as number;
        const velocity = data.velocity as number;
        const sliceOverride = data.sliceOverride !== undefined ? data.sliceOverride as number : -1;
        const pitchOverride = data.pitchOverride as number || 0;
        const hasPitch = data.pitchOverride !== undefined ? 1 : 0;
        const reverseOverride = data.reverseOverride === true ? 1 : 0;
        const hasReverse = data.reverseOverride !== undefined ? 1 : 0;
        this.wasm.granular_euclid_trigger(voice, velocity, sliceOverride,
          pitchOverride, hasPitch, reverseOverride, hasReverse);
        break;
      }

      case 'enablePerf':
        this.perfEnabled = data.enabled as boolean;
        this.perfTotalTime = 0;
        this.perfCount = 0;
        this.perfSamplesSinceReport = 0;
        break;

      case 'uiActive':
        this.uiActive = Boolean(data.active);
        this.posReportCounter = 0;
        break;

      case 'destroy':
        // Free WASM heap allocations and mark as not-ready to stop processing
        if (this.wasm && this.ready) {
          try {
            if (this.positionsPtr) { this.wasm.free(this.positionsPtr); this.positionsPtr = 0; }
            if (this.scalePtr) { this.wasm.free(this.scalePtr); this.scalePtr = 0; }
            if (this.chordPtr) { this.wasm.free(this.chordPtr); this.chordPtr = 0; }
            this.wasm.granular_destroy();
          } catch { /* */ }
        }
        this.ready = false;
        this.wasm = null;
        break;
    }
  }

  private extractGlobalParams(p: GranularParams): GranularGlobalParams {
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

  private extractSpaceParams(p: GranularParams): GranularSpaceParams {
    return {
      busDiffusion: p.busDiffusion,
      timingRandomness: p.timingRandomness,
    };
  }

  private extractVoiceParams(p: GranularParams): GranularVoiceParams {
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

  private extractHarmonyParams(p: GranularParams): GranularHarmonyParams {
    return {
      scaleIntervals: [...p.scaleIntervals],
      chordPitches: [...p.chordPitches],
      chordBias: p.chordBias,
    };
  }

  private extractLegacyParams(p: GranularParams): GranularLegacyParams {
    return {
      legacyJitter: p.legacyJitter,
      legacyProbability: p.legacyProbability,
      legacyPitchMode: p.legacyPitchMode,
      legacyPitchSpread: p.legacyPitchSpread,
      legacyMaxGrains: p.legacyMaxGrains,
      legacyFeedback: p.legacyFeedback,
    };
  }

  private numberArrayEqual(a: number[] | undefined, b: number[] | undefined): boolean {
    if (!a || !b) return a === b;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  private applyGlobalParams(p: GranularGlobalParams) {
    const w = this.wasm!;
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

  private applySpaceParams(p: GranularSpaceParams) {
    const w = this.wasm!;
    const prev = this.appliedSpaceParams;
    if (!prev || prev.busDiffusion !== p.busDiffusion) {
      w.granular_set_bus_diffusion(p.busDiffusion ?? 0);
    }
    if (!prev || prev.timingRandomness !== p.timingRandomness) {
      w.granular_set_timing_randomness(p.timingRandomness ?? 0.35);
    }
    this.appliedSpaceParams = { ...p };
  }

  private applyHarmonyParams(p: GranularHarmonyParams) {
    const w = this.wasm!;
    const prev = this.appliedHarmonyParams;
    if (!prev || !this.numberArrayEqual(prev.scaleIntervals, p.scaleIntervals)) {
      if (p.scaleIntervals && p.scaleIntervals.length > 0) {
        const heap32 = this.getHeapI32();
        const count = Math.min(p.scaleIntervals.length, 12);
        for (let i = 0; i < count; i++) {
          heap32[(this.scalePtr >> 2) + i] = p.scaleIntervals[i] ?? 0;
        }
        w.granular_set_scale(this.scalePtr, count);
      } else {
        w.granular_set_scale(0, 0);
      }
    }

    const chordChanged =
      !prev ||
      prev.chordBias !== p.chordBias ||
      !this.numberArrayEqual(prev.chordPitches, p.chordPitches);
    if (chordChanged) {
      if (p.chordPitches && p.chordPitches.length > 0 && p.chordBias > 0) {
        const heap32 = this.getHeapI32();
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

  private applyVoiceParams(p: GranularVoiceParams) {
    const w = this.wasm!;
    const prev = this.appliedVoiceParams;

    for (let v = 0; v < NUM_VOICES; v++) {
      const voiceMode = p.voiceMode[v] ?? 'granular';
      if (
        !prev ||
        prev.voiceEnabled[v] !== p.voiceEnabled[v] ||
        prev.voiceMode[v] !== p.voiceMode[v]
      ) {
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
          p.voiceWriteFollow[v] || 0,
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
          p.voiceDecay[v] ?? 0.5,
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
          p.voiceStereoSpread[v] ?? 0.5,
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
          p.voiceRecordLFORate[v] || 0,
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

  private applyLegacyParams(p: GranularLegacyParams) {
    const w = this.wasm!;
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
        p.legacyFeedback,
      );
    }
    this.appliedLegacyParams = { ...p };
  }

  /** Get Int32Array view of WASM heap (refreshed when memory grows) */
  private getHeapI32(): Int32Array {
    const buf = this.wasm!.memory.buffer;
    if (this.heap32.buffer !== buf) {
      this.heap32 = new Int32Array(buf);
    }
    return this.heap32;
  }

  /** Get Float32Array view of WASM heap (refreshed on each access since memory can grow) */
  private getHeapF32(): Float32Array {
    const buf = this.wasm!.memory.buffer;
    if (this.heap.buffer !== buf) {
      this.heap = new Float32Array(buf);
    }
    return this.heap;
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], _params: Record<string, Float32Array>) {
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
      return true;
    }

    const perfStart = this.perfEnabled ? _perfNow() : 0;
    const input = inputs[0];
    const output = outputs[0];
    const blockSize = output?.[0]?.length || 128;
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
        const message: {
          type: 'position';
          writeHead: number;
          activeGrains: number;
          voices: number[];
          waveform?: Float32Array;
        } = {
          type: 'position',
          writeHead: this.wasm.granular_get_write_head(),
          activeGrains: this.wasm.granular_get_active_grain_count(),
          voices: [
            freshHeap[posOffset] ?? 0,
            freshHeap[posOffset + 1] ?? 0,
            freshHeap[posOffset + 2] ?? 0,
            freshHeap[posOffset + 3] ?? 0,
          ],
        };

        // Keep the background waveform responsive without scanning the full
        // circular buffer on the audio thread. Eight probes per bin preserves
        // the large-scale shape while avoiding periodic CPU spikes.
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
                  let pos = start + Math.floor(((sampleIndex + 0.5) * span) / WAVEFORM_SAMPLES_PER_BIN);
                  if (pos >= end) pos = end - 1;
                  const value = Math.abs(latestHeap[bufOffset + pos] ?? 0);
                  if (value > peak) peak = value;
                }
                waveform[bin] = peak;
              }
              message.waveform = waveform;
            }
          } catch {
            // Ignore optional waveform export errors; position reporting remains useful.
          }
        }
        this.port.postMessage(message);
      }
    }

    // -- Perf reporting --
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
          name: 'granular-fx-wasm',
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

registerProcessor('granular-fx-wasm', GranularFXWasmProcessor);
