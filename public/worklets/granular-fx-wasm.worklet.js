"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/audio/worklets/granular-fx-wasm.worklet.ts
  var _perfNow = typeof performance !== "undefined" ? () => performance.now() : () => Date.now();
  var NUM_VOICES = 4;
  var MODE_MAP = { clean: 0, granular: 1, legacy: 1 };
  var SHAPE_MAP = { triangle: 0, sawUp: 1, sawDown: 2, square: 3 };
  var QUALITY_MAP = { eco: 0, balanced: 1, hq: 2 };
  var PITCH_MODE_MAP = { fixed: 0, octaves: 1, fifths: 2, chord: 3, scale: 4, free: 5 };
  var CLOUD_STYLE_MAP = { classic: 0, mosaic: 1, bloom: 2, tide: 3, orbit: 4, stars: 5 };
  var ANCHOR_PATTERN_MAP = { forward: 0, reverse: 1, pendulum: 2, random: 3 };
  var POS_REPORT_INTERVAL = Math.floor(sampleRate / 20);
  var WAVEFORM_BINS = 512;
  var WAVEFORM_SKIP = 10;
  var WAVEFORM_SAMPLES_PER_BIN = 8;
  var VISUAL_EVENT_CAPACITY = 32;
  var VISUAL_EVENT_BYTES = 32;
  var GranularFXWasmProcessor = class extends AudioWorkletProcessor {
    constructor() {
      super();
      __publicField(this, "wasm", null);
      __publicField(this, "heap", new Float32Array(0));
      __publicField(this, "heap32", new Int32Array(0));
      __publicField(this, "inputPtr", 0);
      __publicField(this, "outputPtr", 0);
      __publicField(this, "positionsPtr", 0);
      // for voice position query (4 floats)
      __publicField(this, "visualEventsPtr", 0);
      __publicField(this, "scalePtr", 0);
      // for scale intervals (12 ints)
      __publicField(this, "chordPtr", 0);
      // for chord pitches (7 ints)
      __publicField(this, "ready", false);
      // Perf measurement
      __publicField(this, "perfEnabled", false);
      __publicField(this, "perfTotalTime", 0);
      __publicField(this, "perfCount", 0);
      __publicField(this, "perfSamplesSinceReport", 0);
      __publicField(this, "perfReportInterval", Math.floor(sampleRate * 0.5));
      // Position reporting
      __publicField(this, "posReportCounter", 0);
      __publicField(this, "waveformReportCounter", 0);
      __publicField(this, "uiActive", false);
      // Latest params received from the main thread (split by concern so we can
      // replay them after WASM init and diff them cheaply inside the worklet).
      __publicField(this, "globalParams", null);
      __publicField(this, "spaceParams", null);
      __publicField(this, "voiceParams", null);
      __publicField(this, "harmonyParams", null);
      __publicField(this, "legacyParams", null);
      // Last values actually applied to WASM setters.
      __publicField(this, "appliedGlobalParams", null);
      __publicField(this, "appliedSpaceParams", null);
      __publicField(this, "appliedVoiceParams", null);
      __publicField(this, "appliedHarmonyParams", null);
      __publicField(this, "appliedLegacyParams", null);
      // Buffered random sequence (in case it arrives before WASM is ready)
      __publicField(this, "pendingRandomSequence", null);
      __publicField(this, "latestRandomSequence", null);
      this.port.onmessage = (event) => this.handleMessage(event.data);
    }
    /**
     * Called from the main thread with the WASM binary.
     * We compile and instantiate synchronously in the worklet scope.
     */
    async initWasm(wasmBinary) {
      const module = await WebAssembly.compile(wasmBinary);
      const wasiStubs = {
        wasi_snapshot_preview1: {
          fd_write: () => 0,
          fd_seek: () => 0,
          fd_close: () => 0,
          proc_exit: () => {
          },
          environ_get: () => 0,
          environ_sizes_get: () => 0,
          clock_time_get: () => 0
        },
        env: {
          emscripten_notify_memory_growth: () => {
          }
        }
      };
      const instance = await WebAssembly.instantiate(module, wasiStubs);
      const exports = instance.exports;
      this.wasm = exports;
      const bufferSeconds = this.globalParams?.bufferSeconds ?? 16;
      const result = exports.granular_init(sampleRate, bufferSeconds);
      if (result !== 0) {
        console.error("[GranularFX-WASM] Init failed:", result);
        return;
      }
      this.inputPtr = exports.granular_get_input_ptr();
      this.outputPtr = exports.granular_get_output_ptr();
      this.positionsPtr = exports.malloc(NUM_VOICES * 4);
      this.visualEventsPtr = exports.malloc(VISUAL_EVENT_CAPACITY * VISUAL_EVENT_BYTES);
      this.scalePtr = exports.malloc(12 * 4);
      this.chordPtr = exports.malloc(7 * 4);
      this.ready = true;
      this.port.postMessage({ type: "wasmReady" });
      if (this.globalParams) this.applyGlobalParams(this.globalParams);
      if (this.spaceParams) this.applySpaceParams(this.spaceParams);
      if (this.harmonyParams) this.applyHarmonyParams(this.harmonyParams);
      if (this.voiceParams) this.applyVoiceParams(this.voiceParams);
      if (this.legacyParams) this.applyLegacyParams(this.legacyParams);
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
        console.error("[GranularFX-WASM] Reset failed:", result);
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
        case "wasmBinary":
          this.initWasm(data.binary);
          break;
        case "params": {
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
        case "globalParams":
          this.globalParams = data.params;
          if (this.ready) this.applyGlobalParams(this.globalParams);
          break;
        case "spaceParams":
          this.spaceParams = data.params;
          if (this.ready) this.applySpaceParams(this.spaceParams);
          break;
        case "voiceParams":
          this.voiceParams = data.params;
          if (this.ready) this.applyVoiceParams(this.voiceParams);
          break;
        case "harmonyParams":
          this.harmonyParams = data.params;
          if (this.ready) this.applyHarmonyParams(this.harmonyParams);
          break;
        case "legacyParams":
          this.legacyParams = data.params;
          if (this.ready) this.applyLegacyParams(this.legacyParams);
          break;
        case "randomSequence":
        case "reseed": {
          const seq = data.sequence;
          this.applyRandomSequence(seq);
          break;
        }
        case "granularTrigger": {
          if (!this.ready || !this.wasm) break;
          const voice = data.voice;
          const velocity = data.velocity;
          const sliceOverride = data.sliceOverride !== void 0 ? data.sliceOverride : -1;
          const pitchOverride = data.pitchOverride || 0;
          const hasPitch = data.pitchOverride !== void 0 ? 1 : 0;
          const reverseOverride = data.reverseOverride === true ? 1 : 0;
          const hasReverse = data.reverseOverride !== void 0 ? 1 : 0;
          this.wasm.granular_euclid_trigger(
            voice,
            velocity,
            sliceOverride,
            pitchOverride,
            hasPitch,
            reverseOverride,
            hasReverse
          );
          break;
        }
        case "enablePerf":
          this.perfEnabled = data.enabled;
          this.perfTotalTime = 0;
          this.perfCount = 0;
          this.perfSamplesSinceReport = 0;
          break;
        case "uiActive":
          this.uiActive = Boolean(data.active);
          this.posReportCounter = 0;
          break;
        case "reset":
          this.resetWasmState();
          break;
        case "destroy":
          if (this.wasm && this.ready) {
            try {
              if (this.positionsPtr) {
                this.wasm.free(this.positionsPtr);
                this.positionsPtr = 0;
              }
              if (this.visualEventsPtr) {
                this.wasm.free(this.visualEventsPtr);
                this.visualEventsPtr = 0;
              }
              if (this.scalePtr) {
                this.wasm.free(this.scalePtr);
                this.scalePtr = 0;
              }
              if (this.chordPtr) {
                this.wasm.free(this.chordPtr);
                this.chordPtr = 0;
              }
              this.wasm.granular_destroy();
            } catch {
            }
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
        grainShape: p.grainShape
      };
    }
    extractSpaceParams(p) {
      return {
        busDiffusion: p.busDiffusion,
        timingRandomness: p.timingRandomness,
        quality: p.quality ?? "balanced",
        maxGrains: p.maxGrains ?? 48,
        sprayMacro: p.sprayMacro ?? 0,
        cloudMacro: p.cloudMacro ?? 0,
        pitchMacro: p.pitchMacro ?? 0
      };
    }
    extractVoiceParams(p) {
      const numberArray = (values, fallback) => Array.from({ length: NUM_VOICES }, (_, index) => values?.[index] ?? fallback);
      const stringArray = (values, fallback) => Array.from({ length: NUM_VOICES }, (_, index) => values?.[index] ?? fallback);
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
        voicePositionSpray: numberArray(p.voicePositionSpray ?? p.voiceSpray, 0.3),
        voiceTimingSpray: numberArray(p.voiceTimingSpray, 0),
        voiceLookback: numberArray(p.voiceLookback, 0.35),
        voiceWriteGuard: numberArray(p.voiceWriteGuard, 0.3),
        voicePitchMode: stringArray(p.voicePitchMode, "fixed"),
        voicePitchSpread: numberArray(p.voicePitchSpread, 0),
        voicePitchJitter: numberArray(p.voicePitchJitter, 4),
        voicePitchQuantize: numberArray(p.voicePitchQuantize, 1),
        voiceReverseChance: numberArray(p.voiceReverseChance, 0),
        voiceBloom: numberArray(p.voiceBloom, 0),
        voiceGlide: numberArray(p.voiceGlide, 0),
        voiceCloudStyle: stringArray(p.voiceCloudStyle, "classic"),
        voiceAnchorPattern: stringArray(p.voiceAnchorPattern, "forward"),
        voiceLoopCrossfade: numberArray(p.voiceLoopCrossfade, 12),
        tempoGated: [...p.tempoGated]
      };
    }
    extractHarmonyParams(p) {
      return {
        scaleIntervals: [...p.scaleIntervals],
        chordPitches: [...p.chordPitches],
        chordBias: p.chordBias
      };
    }
    extractLegacyParams(p) {
      return {
        legacyJitter: p.legacyJitter,
        legacyProbability: p.legacyProbability,
        legacyPitchMode: p.legacyPitchMode,
        legacyPitchSpread: p.legacyPitchSpread,
        legacyMaxGrains: p.legacyMaxGrains,
        legacyFeedback: p.legacyFeedback
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
      if (!prev || prev.quality !== p.quality || prev.maxGrains !== p.maxGrains || prev.sprayMacro !== p.sprayMacro || prev.cloudMacro !== p.cloudMacro || prev.pitchMacro !== p.pitchMacro) {
        w.granular_set_quality_params(
          QUALITY_MAP[p.quality ?? "balanced"] ?? 1,
          Math.round(p.maxGrains ?? 48),
          p.sprayMacro ?? 0,
          p.cloudMacro ?? 0,
          p.pitchMacro ?? 0
        );
      }
      this.appliedSpaceParams = { ...p };
    }
    applyHarmonyParams(p) {
      const w = this.wasm;
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
      const chordChanged = !prev || prev.chordBias !== p.chordBias || !this.numberArrayEqual(prev.chordPitches, p.chordPitches);
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
        chordBias: p.chordBias
      };
    }
    applyVoiceParams(p) {
      const w = this.wasm;
      const prev = this.appliedVoiceParams;
      for (let v = 0; v < NUM_VOICES; v++) {
        const voiceMode = p.voiceMode[v] ?? "granular";
        if (!prev || prev.voiceEnabled[v] !== p.voiceEnabled[v] || prev.voiceMode[v] !== p.voiceMode[v]) {
          w.granular_set_voice_mode(v, p.voiceEnabled[v] ? 1 : 0, MODE_MAP[voiceMode] ?? 1);
        }
        if (!prev || prev.voiceSlice[v] !== p.voiceSlice[v] || prev.voiceSpeed[v] !== p.voiceSpeed[v] || prev.voiceScanRate[v] !== p.voiceScanRate[v] || prev.voiceReverse[v] !== p.voiceReverse[v] || prev.voicePitch[v] !== p.voicePitch[v] || prev.voiceWriteFollow[v] !== p.voiceWriteFollow[v]) {
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
        if (!prev || prev.voiceDensity[v] !== p.voiceDensity[v] || prev.voiceGrainSize[v] !== p.voiceGrainSize[v] || prev.voiceSpray[v] !== p.voiceSpray[v] || prev.voiceGrainOct[v] !== p.voiceGrainOct[v] || prev.voiceAttack[v] !== p.voiceAttack[v] || prev.voiceDecay[v] !== p.voiceDecay[v]) {
          w.granular_set_voice_grain(
            v,
            p.voiceDensity[v] || 20,
            p.voiceGrainSize[v] || 80,
            p.voiceSpray[v] || 0,
            p.voiceGrainOct[v] || 0,
            p.voiceAttack[v] ?? 3e-3,
            p.voiceDecay[v] ?? 0.5
          );
        }
        if (!prev || prev.voiceGain[v] !== p.voiceGain[v] || prev.voicePan[v] !== p.voicePan[v] || prev.voiceBlur[v] !== p.voiceBlur[v] || prev.voiceStereoSpread[v] !== p.voiceStereoSpread[v]) {
          w.granular_set_voice_output(
            v,
            p.voiceGain[v] ?? 0.5,
            p.voicePan[v] || 0,
            p.voiceBlur[v] || 0,
            p.voiceStereoSpread[v] ?? 0.5
          );
        }
        if (!prev || prev.voicePosLFORate[v] !== p.voicePosLFORate[v] || prev.voicePosLFODepth[v] !== p.voicePosLFODepth[v] || prev.voicePanLFORate[v] !== p.voicePanLFORate[v] || prev.voiceReverseLFORate[v] !== p.voiceReverseLFORate[v] || prev.voiceRecordLFORate[v] !== p.voiceRecordLFORate[v]) {
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
        if (!prev || prev.voicePositionSpray[v] !== p.voicePositionSpray[v] || prev.voiceTimingSpray[v] !== p.voiceTimingSpray[v] || prev.voiceLookback[v] !== p.voiceLookback[v] || prev.voiceWriteGuard[v] !== p.voiceWriteGuard[v] || prev.voicePitchMode[v] !== p.voicePitchMode[v] || prev.voicePitchSpread[v] !== p.voicePitchSpread[v] || prev.voicePitchJitter[v] !== p.voicePitchJitter[v] || prev.voicePitchQuantize[v] !== p.voicePitchQuantize[v] || prev.voiceReverseChance[v] !== p.voiceReverseChance[v] || prev.voiceBloom[v] !== p.voiceBloom[v] || prev.voiceGlide[v] !== p.voiceGlide[v] || prev.voiceCloudStyle[v] !== p.voiceCloudStyle[v] || prev.voiceAnchorPattern[v] !== p.voiceAnchorPattern[v] || prev.voiceLoopCrossfade[v] !== p.voiceLoopCrossfade[v]) {
          w.granular_set_voice_advanced(
            v,
            p.voicePositionSpray[v] ?? 0.3,
            p.voiceTimingSpray[v] ?? 0,
            p.voiceLookback[v] ?? 0.35,
            p.voiceWriteGuard[v] ?? 0.3,
            PITCH_MODE_MAP[p.voicePitchMode[v] ?? "fixed"] ?? 0,
            p.voicePitchSpread[v] ?? 0,
            p.voicePitchJitter[v] ?? 4,
            p.voicePitchQuantize[v] ?? 1,
            p.voiceReverseChance[v] ?? 0,
            p.voiceBloom[v] ?? 0,
            p.voiceGlide[v] ?? 0,
            CLOUD_STYLE_MAP[p.voiceCloudStyle[v] ?? "classic"] ?? 0,
            ANCHOR_PATTERN_MAP[p.voiceAnchorPattern[v] ?? "forward"] ?? 0,
            p.voiceLoopCrossfade[v] ?? 12
          );
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
        voicePositionSpray: [...p.voicePositionSpray],
        voiceTimingSpray: [...p.voiceTimingSpray],
        voiceLookback: [...p.voiceLookback],
        voiceWriteGuard: [...p.voiceWriteGuard],
        voicePitchMode: [...p.voicePitchMode],
        voicePitchSpread: [...p.voicePitchSpread],
        voicePitchJitter: [...p.voicePitchJitter],
        voicePitchQuantize: [...p.voicePitchQuantize],
        voiceReverseChance: [...p.voiceReverseChance],
        voiceBloom: [...p.voiceBloom],
        voiceGlide: [...p.voiceGlide],
        voiceCloudStyle: [...p.voiceCloudStyle],
        voiceAnchorPattern: [...p.voiceAnchorPattern],
        voiceLoopCrossfade: [...p.voiceLoopCrossfade],
        tempoGated: [...p.tempoGated]
      };
    }
    applyLegacyParams(p) {
      const w = this.wasm;
      const prev = this.appliedLegacyParams;
      if (!prev || prev.legacyJitter !== p.legacyJitter || prev.legacyProbability !== p.legacyProbability || prev.legacyPitchMode !== p.legacyPitchMode || prev.legacyPitchSpread !== p.legacyPitchSpread || prev.legacyMaxGrains !== p.legacyMaxGrains || prev.legacyFeedback !== p.legacyFeedback) {
        w.granular_set_legacy_params(
          p.legacyJitter,
          p.legacyProbability,
          p.legacyPitchMode === "harmonic" ? 1 : 0,
          p.legacyPitchSpread,
          p.legacyMaxGrains,
          p.legacyFeedback
        );
      }
      this.appliedLegacyParams = { ...p };
    }
    /** Get Int32Array view of WASM heap (refreshed when memory grows) */
    getHeapI32() {
      const buf = this.wasm.memory.buffer;
      if (this.heap32.buffer !== buf) {
        this.heap32 = new Int32Array(buf);
      }
      return this.heap32;
    }
    /** Get Float32Array view of WASM heap (refreshed on each access since memory can grow) */
    getHeapF32() {
      const buf = this.wasm.memory.buffer;
      if (this.heap.buffer !== buf) {
        this.heap = new Float32Array(buf);
      }
      return this.heap;
    }
    readVisualEvents() {
      if (!this.ready || !this.wasm || !this.visualEventsPtr) return void 0;
      const count = this.wasm.granular_get_visual_events(this.visualEventsPtr, VISUAL_EVENT_CAPACITY);
      if (count <= 0) return void 0;
      const view = new DataView(this.wasm.memory.buffer);
      const events = [];
      const base = this.visualEventsPtr;
      const safeCount = Math.min(count, VISUAL_EVENT_CAPACITY);
      for (let index = 0; index < safeCount; index += 1) {
        const offset = base + index * VISUAL_EVENT_BYTES;
        events.push({
          position: view.getFloat32(offset, true),
          pan: view.getFloat32(offset + 4, true),
          pitch: view.getFloat32(offset + 8, true),
          gain: view.getFloat32(offset + 12, true),
          lengthMs: view.getFloat32(offset + 16, true),
          voice: view.getInt32(offset + 20, true),
          flags: view.getInt32(offset + 24, true),
          cloudStyle: view.getInt32(offset + 28, true)
        });
      }
      return events;
    }
    process(inputs, outputs, _params) {
      if (!this.ready || !this.wasm) {
        const input2 = inputs[0];
        const output2 = outputs[0];
        if (input2 && output2) {
          for (let ch = 0; ch < output2.length; ch++) {
            const inCh = input2[ch];
            const outCh = output2[ch];
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
      const inOffset = this.inputPtr >> 2;
      const inL = input?.[0];
      const inR = input?.[1] || inL;
      if (inL) {
        for (let i = 0; i < blockSize; i++) {
          heap[inOffset + i * 2] = inL[i] ?? 0;
          heap[inOffset + i * 2 + 1] = inR?.[i] ?? 0;
        }
      }
      this.wasm.granular_process_block(blockSize);
      const outOffset = this.outputPtr >> 2;
      const outL = output?.[0];
      const outR = output?.[1] || outL;
      if (outL && outR) {
        for (let i = 0; i < blockSize; i++) {
          outL[i] = heap[outOffset + i * 2] ?? 0;
          outR[i] = heap[outOffset + i * 2 + 1] ?? 0;
        }
      }
      if (this.uiActive) {
        this.posReportCounter += blockSize;
        if (this.posReportCounter >= POS_REPORT_INTERVAL) {
          this.posReportCounter = 0;
          const freshHeap = this.getHeapF32();
          this.wasm.granular_get_voice_positions(this.positionsPtr);
          const posOffset = this.positionsPtr >> 2;
          const message = {
            type: "position",
            writeHead: this.wasm.granular_get_write_head(),
            activeGrains: this.wasm.granular_get_active_grain_count(),
            voices: [
              freshHeap[posOffset] ?? 0,
              freshHeap[posOffset + 1] ?? 0,
              freshHeap[posOffset + 2] ?? 0,
              freshHeap[posOffset + 3] ?? 0
            ]
          };
          const grainEvents = this.readVisualEvents();
          if (grainEvents?.length) {
            message.grainEvents = grainEvents;
          }
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
                    let pos = start + Math.floor((sampleIndex + 0.5) * span / WAVEFORM_SAMPLES_PER_BIN);
                    if (pos >= end) pos = end - 1;
                    const value = Math.abs(latestHeap[bufOffset + pos] ?? 0);
                    if (value > peak) peak = value;
                  }
                  waveform[bin] = peak;
                }
                message.waveform = waveform;
              }
            } catch {
            }
          }
          this.port.postMessage(message);
        }
      }
      if (this.perfEnabled) {
        const elapsed = _perfNow() - perfStart;
        this.perfTotalTime += elapsed;
        this.perfCount++;
        this.perfSamplesSinceReport += blockSize;
        if (this.perfSamplesSinceReport >= this.perfReportInterval && this.perfCount > 0) {
          const avgMs = this.perfTotalTime / this.perfCount;
          const budgetMs = blockSize / sampleRate * 1e3;
          this.port.postMessage({
            type: "perf",
            name: "granular-fx-wasm",
            cpuPercent: avgMs / budgetMs * 100,
            avgTimeMs: avgMs
          });
          this.perfTotalTime = 0;
          this.perfCount = 0;
          this.perfSamplesSinceReport = 0;
        }
      }
      return true;
    }
  };
  registerProcessor("granular-fx-wasm", GranularFXWasmProcessor);
})();
