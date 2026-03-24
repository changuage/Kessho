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
 *   'euclidTrigger'   � per-voice trigger with optional overrides
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

interface GranularParams {
  enabled: boolean;
  freeze: boolean;
  freezeWithFeedback: boolean;
  dryWet: number;
  feedback: number;
  feedbackLPF: number;
  bufferSeconds: number;

  voiceEnabled: boolean[];
  voiceMode: VoiceMode[];
  voiceSlice: number[];
  voiceSpeed: number[];
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
  euclidGated: boolean[];
  euclidMuted: boolean[];       // true = voice silenced by Euclid mute/solo

  legacyJitter: number;
  legacyProbability: number;
  legacyPitchMode: 'random' | 'harmonic';
  legacyPitchSpread: number;
  legacyMaxGrains: number;
  legacyFeedback: number;
}

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
  // Per-voice
  granular_set_voice_mode(voice: number, enabled: number, mode: number): void;
  granular_set_voice_position(voice: number, slice: number, speed: number,
    reverse: number, pitch: number, writeFollow: number): void;
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
  // Memory management
  malloc(size: number): number;
  free(ptr: number): void;
}

// --------------- Constants ---------------

const NUM_VOICES = 4;
const MODE_MAP: Record<VoiceMode, number> = { clean: 0, granular: 1, legacy: 2 };
const POS_REPORT_INTERVAL = Math.floor(sampleRate / 20);

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

  // Current params (for message-level diffing if needed)
  private params: GranularParams | null = null;

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
    this.chordPtr = exports.malloc(7 * 4);              // 7 ints

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

      case 'params':
        this.params = Object.assign(this.params || {} as GranularParams, data.params as Partial<GranularParams>);
        if (this.ready) this.applyParams(this.params);
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

      case 'euclidTrigger': {
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

  /** Translate GranularParams ? C API calls */
  private applyParams(p: GranularParams) {
    const w = this.wasm!;

    // Global
    w.granular_set_enabled(p.enabled ? 1 : 0);
    w.granular_set_freeze(p.freeze ? 1 : 0, p.freezeWithFeedback ? 1 : 0);
    w.granular_set_dry_wet(p.dryWet);
    w.granular_set_feedback(p.feedback, p.feedbackLPF);
    w.granular_set_buffer_size(p.bufferSeconds);

    // Scale
    if (p.scaleIntervals && p.scaleIntervals.length > 0) {
      const heap32 = this.getHeapI32();
      const count = Math.min(p.scaleIntervals.length, 12);
      for (let i = 0; i < count; i++) {
        heap32[(this.scalePtr >> 2) + i] = p.scaleIntervals[i];
      }
      w.granular_set_scale(this.scalePtr, count);
    } else {
      w.granular_set_scale(0, 0);
    }

    // Chord bias
    if (p.chordPitches && p.chordPitches.length > 0 && p.chordBias > 0) {
      const heap32 = this.getHeapI32();
      const count = Math.min(p.chordPitches.length, 7);
      for (let i = 0; i < count; i++) {
        heap32[(this.chordPtr >> 2) + i] = p.chordPitches[i];
      }
      w.granular_set_chord_bias(this.chordPtr, count, p.chordBias);
    } else {
      w.granular_set_chord_bias(0, 0, 0);
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
          if (input[ch]) output[ch].set(input[ch]);
        }
      }
      return true;
    }

    const perfStart = this.perfEnabled ? _perfNow() : 0;
    const input = inputs[0];
    const output = outputs[0];
    const blockSize = output[0]?.length || 128;
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
