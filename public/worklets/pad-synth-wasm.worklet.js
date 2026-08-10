/**
 * Pad Synth WASM Worklet Processor
 *
 * Thin AudioWorkletProcessor shell that loads kessho_pad.wasm and delegates
 * pad synthesis to C++. Voice management and preset morphing stay in engine.ts;
 * note on/off and pre-morphed parameters arrive via postMessage.
 *
 * Message types received:
 *   'wasmBinary'  – ArrayBuffer of compiled WASM module
 *   'params'      – per-pad parameter updates { pad, params }
 *   'noteOn'      – { voiceIndex, frequency, velocity, holdSeconds? }
 *   'noteOff'     – { voiceIndex }
 *   'killVoice'   – { voiceIndex } hard-stops one stale audition voice
 *   'voicePad'    – { voiceIndex, pad } (0=pad1, 1=pad2)
 *   'enablePerf'  – toggle CPU measurement
 *   'destroy'     – cleanup
 *
 * Message types sent:
 *   'wasmReady'   – emitted once WASM is loaded and initialized
 *   'perf'        – CPU usage stats
 *   'activeCount' – number of active voices (~5 Hz)
 */

const _perfNow = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const clampNumber = (value, min, max) => Math.max(min, Math.min(max, value));
const MAX_SCHEDULED_NOTE_OFFS = 16;

// Pad 1 param name → WASM setter function name
const PAD1_PARAM_MAP = {
  // Oscillators
  padOscAWave:        'pad_set_osc_a_wave',
  padOscAWavePosition:'pad_set_osc_a_position',
  padOscAPhaseDistortion:'pad_set_osc_a_phase_distortion',
  padOscAPitch:       'pad_set_osc_a_pitch',
  padOscALinearHzOffset:'pad_set_osc_a_hz_offset',
  padOscALevel:       'pad_set_osc_a_level',
  padOscBWave:        'pad_set_osc_b_wave',
  padOscBWavePosition:'pad_set_osc_b_position',
  padOscBPhaseDistortion:'pad_set_osc_b_phase_distortion',
  padOscBPitch:       'pad_set_osc_b_pitch',
  padOscBLinearHzOffset:'pad_set_osc_b_hz_offset',
  padOscBLevel:       'pad_set_osc_b_level',
  padOscMix:          'pad_set_osc_mix',
  padDrift:           'pad_set_drift',
  padPhaseReset:      'pad_set_phase_reset',
  // Sub
  padSubEnabled:      'pad_set_sub_enabled',
  padSubOctave:       'pad_set_sub_octave',
  padSubWave:         'pad_set_sub_wave',
  padSubLevel:        'pad_set_sub_level',
  // Noise
  padNoiseType:       'pad_set_noise_type',
  padNoiseLevel:      'pad_set_noise_level',
  // Timbre
  hardness:           'pad_set_hardness',
  warmth:             'pad_set_warmth',
  presence:           'pad_set_presence',
  padFoldAmount:     'pad_set_fold_amount',
  padFoldMode:        'pad_set_fold_mode',
  // Filter A
  filterType:         'pad_set_filter_type',
  filterCutoff:       'pad_set_filter_cutoff',
  filterResonance:    'pad_set_filter_resonance',
  filterQ:            'pad_set_filter_q',
  filterSlope:        'pad_set_filter_slope',
  filterKeyTracking:  'pad_set_filter_key_tracking',
  // Filter B
  padFilterBEnabled:  'pad_set_filter_b_enabled',
  padFilterBType:     'pad_set_filter_b_type',
  padFilterBCutoff:   'pad_set_filter_b_cutoff',
  padFilterBResonance:'pad_set_filter_b_resonance',
  padFilterBQ:        'pad_set_filter_b_q',
  padFilterRouting:   'pad_set_filter_routing',
  // ADSR
  synthAttack:        'pad_set_attack',
  synthDecay:         'pad_set_decay',
  synthSustain:       'pad_set_sustain',
  synthRelease:       'pad_set_release',
  // LFO 1
  padLfo1Rate:        'pad_set_lfo1_rate',
  padLfo1Depth:       'pad_set_lfo1_depth',
  padLfo1Wave:        'pad_set_lfo1_wave',
  padLfo1Dest:        'pad_set_lfo1_dest',
  // LFO 2
  padLfo2Rate:        'pad_set_lfo2_rate',
  padLfo2Depth:       'pad_set_lfo2_depth',
  padLfo2Wave:        'pad_set_lfo2_wave',
  padLfo2Dest:        'pad_set_lfo2_dest',
  // Mod Envelope
  padModEnvEnabled:   'pad_set_mod_env_enabled',
  padModEnvAttack:    'pad_set_mod_env_attack',
  padModEnvDecay:     'pad_set_mod_env_decay',
  padModEnvSustain:   'pad_set_mod_env_sustain',
  padModEnvRelease:   'pad_set_mod_env_release',
  padModEnvDepth:     'pad_set_mod_env_depth',
  padModEnvDest:      'pad_set_mod_env_dest',
  // Final Pad output trim
  padOutputTrim:      'pad_set_level',
  // Standalone/reference host aliases retained for level routing only.
  synthLevel:         'pad_set_level',
};

// Pad 2 param name → same WASM setter (pad index changes)
const PAD2_PARAM_MAP = {
  pad2OscAWave:        'pad_set_osc_a_wave',
  pad2OscAWavePosition:'pad_set_osc_a_position',
  pad2OscAPhaseDistortion:'pad_set_osc_a_phase_distortion',
  pad2OscAPitch:       'pad_set_osc_a_pitch',
  pad2OscALinearHzOffset:'pad_set_osc_a_hz_offset',
  pad2OscALevel:       'pad_set_osc_a_level',
  pad2OscBWave:        'pad_set_osc_b_wave',
  pad2OscBWavePosition:'pad_set_osc_b_position',
  pad2OscBPhaseDistortion:'pad_set_osc_b_phase_distortion',
  pad2OscBPitch:       'pad_set_osc_b_pitch',
  pad2OscBLinearHzOffset:'pad_set_osc_b_hz_offset',
  pad2OscBLevel:       'pad_set_osc_b_level',
  pad2OscMix:          'pad_set_osc_mix',
  pad2Drift:           'pad_set_drift',
  pad2PhaseReset:      'pad_set_phase_reset',
  pad2SubEnabled:      'pad_set_sub_enabled',
  pad2SubOctave:       'pad_set_sub_octave',
  pad2SubWave:         'pad_set_sub_wave',
  pad2SubLevel:        'pad_set_sub_level',
  pad2NoiseType:       'pad_set_noise_type',
  pad2NoiseLevel:      'pad_set_noise_level',
  pad2Hardness:        'pad_set_hardness',
  pad2Warmth:          'pad_set_warmth',
  pad2Presence:        'pad_set_presence',
  pad2FoldAmount:     'pad_set_fold_amount',
  pad2FoldMode:        'pad_set_fold_mode',
  pad2FilterType:      'pad_set_filter_type',
  pad2FilterCutoff:    'pad_set_filter_cutoff',
  pad2FilterResonance: 'pad_set_filter_resonance',
  pad2FilterQ:         'pad_set_filter_q',
  pad2FilterSlope:     'pad_set_filter_slope',
  pad2FilterKeyTracking:'pad_set_filter_key_tracking',
  pad2FilterBEnabled:  'pad_set_filter_b_enabled',
  pad2FilterBType:     'pad_set_filter_b_type',
  pad2FilterBCutoff:   'pad_set_filter_b_cutoff',
  pad2FilterBResonance:'pad_set_filter_b_resonance',
  pad2FilterBQ:        'pad_set_filter_b_q',
  pad2FilterRouting:   'pad_set_filter_routing',
  pad2Attack:          'pad_set_attack',
  pad2Decay:           'pad_set_decay',
  pad2Sustain:         'pad_set_sustain',
  pad2Release:         'pad_set_release',
  pad2Lfo1Rate:        'pad_set_lfo1_rate',
  pad2Lfo1Depth:       'pad_set_lfo1_depth',
  pad2Lfo1Wave:        'pad_set_lfo1_wave',
  pad2Lfo1Dest:        'pad_set_lfo1_dest',
  pad2Lfo2Rate:        'pad_set_lfo2_rate',
  pad2Lfo2Depth:       'pad_set_lfo2_depth',
  pad2Lfo2Wave:        'pad_set_lfo2_wave',
  pad2Lfo2Dest:        'pad_set_lfo2_dest',
  pad2ModEnvEnabled:   'pad_set_mod_env_enabled',
  pad2ModEnvAttack:    'pad_set_mod_env_attack',
  pad2ModEnvDecay:     'pad_set_mod_env_decay',
  pad2ModEnvSustain:   'pad_set_mod_env_sustain',
  pad2ModEnvRelease:   'pad_set_mod_env_release',
  pad2ModEnvDepth:     'pad_set_mod_env_depth',
  pad2ModEnvDest:      'pad_set_mod_env_dest',
  pad2OutputTrim:      'pad_set_level',
  pad2Level:           'pad_set_level',
};

// Keep Pad 1/2 aligned with PAD_FILTER_LADDER_LP in kessho_pad.h.
const FILTER_TYPE_MAX = 4;
// Filter type string → int
const FILTER_MAP = { lowpass: 0, bandpass: 1, highpass: 2, notch: 3, ladderLP: FILTER_TYPE_MAX, ladderLp: FILTER_TYPE_MAX };
// LFO waveform string → int
const LFO_WAVE_MAP = { sine: 0, triangle: 1, sawtooth: 2, square: 3, sampleHold: 4, randomSmooth: 5, randomWalk: 6 };
// LFO/mod destination string → int
const DEST_MAP = {
  none: 0, filterCutoff: 1, filterB: 2, filterBCutoff: 2, amplitude: 3,
  pitch: 4, oscBLevel: 5, foldAmount: 6, oscAPosition: 7, oscBPosition: 8,
  oscAPhaseDistortion: 9, oscBPhaseDistortion: 10, oscBLinearHzOffset: 11,
  filterResonance: 12,
};
// Filter routing string → int
const ROUTE_MAP = { series: 0, aOnly: 1, bOnly: 2 };
const PHASE_RESET_MAP = { off: 0, on: 1, random: 2 };
// Waveform string → int
const WAVE_MAP = { sine: 0, triangle: 1, sawtooth: 2, square: 3, harmonic: 4, complexSine: 5, complexTriangle: 6 };

const BOOLEAN_PARAM_KEYS = new Set([
  'padSubEnabled', 'padFilterBEnabled', 'padModEnvEnabled',
  'pad2SubEnabled', 'pad2FilterBEnabled', 'pad2ModEnvEnabled',
]);

const PARAM_CLAMPS = {
  padOscAWave: [0, 6], padOscAWavePosition: [0, 1], padOscAPhaseDistortion: [-1, 1], padOscAPitch: [-24, 24], padOscALinearHzOffset: [-50, 50], padOscALevel: [0, 1],
  padOscBWave: [0, 6], padOscBWavePosition: [0, 1], padOscBPhaseDistortion: [-1, 1], padOscBPitch: [-24, 24], padOscBLinearHzOffset: [-50, 50], padOscBLevel: [0, 1],
  padOscMix: [0, 1], padDrift: [0, 1], padPhaseReset: [0, 2], padOutputTrim: [0, 1], synthLevel: [0, 1], padSubOctave: [-4, 1], padSubWave: [0, 3], padSubLevel: [0, 1],
  padNoiseType: [0, 1], padNoiseLevel: [0, 1], hardness: [0, 1], warmth: [0, 1], presence: [0, 1],
  padFoldAmount: [0, 1], padFoldMode: [0, 2], filterType: [0, FILTER_TYPE_MAX],
  filterCutoff: [20, 18000], filterResonance: [0, 1], filterQ: [0.01, 20], filterSlope: [12, 48], filterKeyTracking: [0, 1],
  padFilterBType: [0, 3], padFilterBCutoff: [20, 18000], padFilterBResonance: [0, 1], padFilterBQ: [0.01, 20],
  padFilterRouting: [0, 2], synthAttack: [0.001, 20], synthDecay: [0.001, 20], synthSustain: [0, 1], synthRelease: [0.001, 30],
  padLfo1Rate: [0, 40], padLfo1Depth: [0, 1], padLfo1Wave: [0, 6], padLfo1Dest: [0, 12],
  padLfo2Rate: [0, 40], padLfo2Depth: [0, 1], padLfo2Wave: [0, 6], padLfo2Dest: [0, 12],
  padModEnvAttack: [0.001, 20], padModEnvDecay: [0.001, 20], padModEnvSustain: [0, 1], padModEnvRelease: [0.001, 30],
  padModEnvDepth: [-1, 1], padModEnvDest: [0, 12],
  pad2OscAWave: [0, 6], pad2OscAWavePosition: [0, 1], pad2OscAPhaseDistortion: [-1, 1], pad2OscAPitch: [-24, 24], pad2OscALinearHzOffset: [-50, 50], pad2OscALevel: [0, 1],
  pad2OscBWave: [0, 6], pad2OscBWavePosition: [0, 1], pad2OscBPhaseDistortion: [-1, 1], pad2OscBPitch: [-24, 24], pad2OscBLinearHzOffset: [-50, 50], pad2OscBLevel: [0, 1],
  pad2OscMix: [0, 1], pad2Drift: [0, 1], pad2PhaseReset: [0, 2], pad2OutputTrim: [0, 1], pad2Level: [0, 1], pad2SubOctave: [-4, 1], pad2SubWave: [0, 3], pad2SubLevel: [0, 1],
  pad2NoiseType: [0, 1], pad2NoiseLevel: [0, 1], pad2Hardness: [0, 1], pad2Warmth: [0, 1], pad2Presence: [0, 1],
  pad2FoldAmount: [0, 1], pad2FoldMode: [0, 2], pad2FilterType: [0, FILTER_TYPE_MAX],
  pad2FilterCutoff: [20, 18000], pad2FilterResonance: [0, 1], pad2FilterQ: [0.01, 20], pad2FilterSlope: [12, 48], pad2FilterKeyTracking: [0, 1],
  pad2FilterBType: [0, 3], pad2FilterBCutoff: [20, 18000], pad2FilterBResonance: [0, 1], pad2FilterBQ: [0.01, 20],
  pad2FilterRouting: [0, 2], pad2Attack: [0.001, 20], pad2Decay: [0.001, 20], pad2Sustain: [0, 1], pad2Release: [0.001, 30],
  pad2Lfo1Rate: [0, 40], pad2Lfo1Depth: [0, 1], pad2Lfo1Wave: [0, 6], pad2Lfo1Dest: [0, 12],
  pad2Lfo2Rate: [0, 40], pad2Lfo2Depth: [0, 1], pad2Lfo2Wave: [0, 6], pad2Lfo2Dest: [0, 12],
  pad2ModEnvAttack: [0.001, 20], pad2ModEnvDecay: [0.001, 20], pad2ModEnvSustain: [0, 1], pad2ModEnvRelease: [0.001, 30],
  pad2ModEnvDepth: [-1, 1], pad2ModEnvDest: [0, 12], pad2OutputTrim: [0, 1], synthReverbSend: [0, 1],
};

class PadSynthWasmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.wasm = null;
    this.heap = new Float32Array(0);
    this.outputPtr = 0;
    this.reverbPtr = 0;
    this.prefaderPad1Ptr = 0;
    this.prefaderPad2Ptr = 0;
    this.postfaderPad1Ptr = 0;
    this.postfaderPad2Ptr = 0;
    this.ready = false;

    this.perfEnabled = false;
    this.perfTotalTime = 0;
    this.perfPeakTime = 0;
    this.perfOverBudgetCount = 0;
    this.perfBlockCount = 0;
    this.perfCount = 0;
    this.perfSamplesSinceReport = 0;
    this.perfReportInterval = Math.floor(sampleRate * 0.5);

    this.activeCountMessage = { type: 'activeCount', count: 0 };
    this.perfMessage = {
      type: 'perf', name: 'pad-wasm', cpuPercent: 0, peakPercent: 0, missPercent: 0,
      avgTimeMs: 0, peakTimeMs: 0,
    };
    this.errorMessage = { type: 'error', stage: '', message: '' };

    this.activeCountEnabled = false;
    this.activeCountSamples = 0;
    this.activeCountInterval = Math.floor(sampleRate * 0.2);

    this.pendingParams = [];
    this.pendingNotes = [];
    // One fixed timer slot per native voice. The process callback only updates
    // typed-array values in place; it never creates/filter/pushes arrays.
    this.pendingNoteOffActive = new Uint8Array(MAX_SCHEDULED_NOTE_OFFS);
    this.pendingNoteOffSamples = new Int32Array(MAX_SCHEDULED_NOTE_OFFS);
    this.pendingNoteOffCount = 0;
    this.pendingVoicePads = new Map();
    this.lastNonFiniteReportTime = 0;

    this.port.onmessage = (event) => this.handleMessage(event.data);
  }

  reportNonFinite(stage, value) {
    const now = _perfNow();
    if (now - this.lastNonFiniteReportTime < 10000) return;
    this.lastNonFiniteReportTime = now;
    this.errorMessage.stage = stage;
    this.errorMessage.message = `Non-finite sample detected: ${String(value)}`;
    this.port.postMessage(this.errorMessage);
  }

  sanitizeSample(stage, value) {
    if (Number.isFinite(value)) return value;
    this.reportNonFinite(stage, value);
    return 0;
  }

  async initWasm(wasmBinary) {
    try {
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
      this.wasm = instance.exports;

      const result = this.wasm.pad_init(sampleRate);
      if (result !== 0) {
        console.error('[PadSynth-WASM] Init failed:', result);
        this.port.postMessage({ type: 'error', stage: 'init', message: `pad_init failed: ${result}` });
        return;
      }

      this.outputPtr = this.wasm.pad_get_output_ptr();
      this.reverbPtr = this.wasm.pad_get_reverb_send_ptr();
      this.prefaderPad1Ptr = this.wasm.pad_get_prefader_pad1_ptr();
      this.prefaderPad2Ptr = this.wasm.pad_get_prefader_pad2_ptr();
      this.postfaderPad1Ptr = this.wasm.pad_get_postfader_pad1_ptr();
      this.postfaderPad2Ptr = this.wasm.pad_get_postfader_pad2_ptr();

      this.ready = true;
      this.port.postMessage({ type: 'wasmReady' });

      for (const p of this.pendingParams) this.applyParams(p);
      this.pendingParams = [];
      for (const [voiceIndex, pad] of this.pendingVoicePads) {
        this.wasm.pad_set_voice_pad(voiceIndex, pad);
      }
      this.pendingVoicePads.clear();
      for (const n of this.pendingNotes) {
        this.wasm.pad_note_on(n.voiceIndex, n.frequency, n.velocity);
        this.scheduleNoteOff(n.voiceIndex, n.holdSeconds);
      }
      this.pendingNotes = [];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[PadSynth-WASM] Init exception:', error);
      this.port.postMessage({ type: 'error', stage: 'init', message });
      this.ready = false;
      this.wasm = null;
    }
  }

  handleMessage(data) {
    try {
      switch (data.type) {
        case 'wasmBinary':
          this.initWasm(data.binary);
          break;

        case 'noteOn': {
          const voiceIndex = Number.isInteger(data.voiceIndex) ? data.voiceIndex : -1;
          const frequency = isFiniteNumber(data.frequency) ? Math.max(0, data.frequency) : NaN;
          const velocity = isFiniteNumber(data.velocity) ? Math.max(0, Math.min(1, data.velocity)) : NaN;
          const holdSeconds = isFiniteNumber(data.holdSeconds) ? Math.max(0, data.holdSeconds) : 0;
          if (voiceIndex < 0 || !Number.isFinite(frequency) || !Number.isFinite(velocity)) {
            this.port.postMessage({ type: 'error', stage: 'noteOn', message: `Invalid noteOn payload: ${JSON.stringify(data)}` });
            break;
          }
          if (this.ready) {
            this.wasm.pad_note_on(voiceIndex, frequency, velocity);
            this.scheduleNoteOff(voiceIndex, holdSeconds);
          } else {
            this.pendingNotes = this.pendingNotes.filter((note) => note.voiceIndex !== voiceIndex);
            this.pendingNotes.push({ ...data, voiceIndex, frequency, velocity, holdSeconds });
          }
          break;
        }

        case 'noteOff':
          if (Number.isInteger(data.voiceIndex)) {
            this.clearScheduledNoteOff(data.voiceIndex);
            if (this.ready) this.wasm.pad_note_off(data.voiceIndex);
            else this.pendingNotes = this.pendingNotes.filter((note) => note.voiceIndex !== data.voiceIndex);
          }
          break;

        case 'killVoice':
          if (Number.isInteger(data.voiceIndex)) {
            this.clearScheduledNoteOff(data.voiceIndex);
            if (this.ready && typeof this.wasm.pad_kill_voice === 'function') {
              this.wasm.pad_kill_voice(data.voiceIndex);
            } else {
              this.pendingNotes = this.pendingNotes.filter((note) => note.voiceIndex !== data.voiceIndex);
              this.pendingVoicePads.delete(data.voiceIndex);
            }
          }
          break;

        case 'voicePad':
          if (Number.isInteger(data.voiceIndex) && Number.isInteger(data.pad)) {
            if (this.ready) this.wasm.pad_set_voice_pad(data.voiceIndex, data.pad);
            else this.pendingVoicePads.set(data.voiceIndex, data.pad);
          }
          break;

        case 'params':
          if (this.ready) this.applyParams(data);
          else this.pendingParams.push(data);
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

        case 'enableActiveCount':
          this.activeCountEnabled = !!data.enabled;
          this.activeCountSamples = 0;
          break;

        case 'destroy':
          if (this.wasm && this.ready) {
            try { this.wasm.pad_destroy(); } catch (e) { /* */ }
          }
          this.ready = false;
          this.wasm = null;
          this.pendingParams = [];
          this.pendingNotes = [];
          this.pendingNoteOffActive.fill(0);
          this.pendingNoteOffSamples.fill(0);
          this.pendingNoteOffCount = 0;
          this.pendingVoicePads.clear();
          break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[PadSynth-WASM] Message exception:', error, data);
      this.port.postMessage({ type: 'error', stage: 'message', message });
    }
  }

  resolveValue(key, value) {
    if (BOOLEAN_PARAM_KEYS.has(key)) {
      return value ? 1 : 0;
    }

    let resolved = value;
    // Convert string enum values to integers
    if (key.includes('Wave') || key.includes('wave')) {
      if (key.includes('Lfo') || key.includes('lfo')) resolved = typeof value === 'string' ? (LFO_WAVE_MAP[value] ?? 0) : resolved;
      else resolved = typeof value === 'string' ? (WAVE_MAP[value] ?? 0) : resolved;
    }
    if (key.includes('FilterType') || key === 'filterType' || key.includes('FilterBType')) {
      resolved = typeof value === 'string' ? (FILTER_MAP[value] ?? 0) : resolved;
    }
    if (key.includes('Dest') || key.includes('dest')) {
      resolved = typeof value === 'string' ? (DEST_MAP[value] ?? 0) : resolved;
    }
    if (key.includes('Routing') || key.includes('routing')) {
      resolved = typeof value === 'string' ? (ROUTE_MAP[value] ?? 0) : resolved;
    }
    if (key.includes('PhaseReset')) {
      resolved = typeof value === 'string' ? (PHASE_RESET_MAP[value] ?? 2) : resolved;
    }
    if (typeof resolved === 'number') {
      const finite = Number.isFinite(resolved) ? resolved : 0;
      const range = PARAM_CLAMPS[key];
      return range ? clampNumber(finite, range[0], range[1]) : finite;
    }
    return resolved;
  }

  applyParams(data) {
    const w = this.wasm;
    const p = { ...(data.params || data) };

    const migrateLegacyCutoff = (minKey, maxKey, cutoffKey) => {
      if (p[cutoffKey] !== undefined || p[minKey] === undefined || p[maxKey] === undefined) return;
      const min = this.resolveValue(minKey, p[minKey]);
      const max = this.resolveValue(maxKey, p[maxKey]);
      if (!Number.isFinite(min) || !Number.isFinite(max)) return;
      p[cutoffKey] = (min + max) * 0.5;
    };
    migrateLegacyCutoff('filterCutoffMin', 'filterCutoffMax', 'filterCutoff');
    migrateLegacyCutoff('pad2FilterCutoffMin', 'pad2FilterCutoffMax', 'pad2FilterCutoff');

    // Reverb send (global, not per-pad)
    if (p.synthReverbSend !== undefined) w.pad_set_reverb_send(this.resolveValue('synthReverbSend', p.synthReverbSend));

    // Apply Pad 1 params
    for (const [key, fnName] of Object.entries(PAD1_PARAM_MAP)) {
      if (p[key] !== undefined) {
        const fn = w[fnName];
        if (typeof fn === 'function') {
          fn(0, this.resolveValue(key, p[key]));
        }
      }
    }

    // Apply Pad 2 params
    for (const [key, fnName] of Object.entries(PAD2_PARAM_MAP)) {
      if (p[key] !== undefined) {
        const fn = w[fnName];
        if (typeof fn === 'function') {
          fn(1, this.resolveValue(key, p[key]));
        }
      }
    }
  }

  getHeapF32() {
    const buf = this.wasm.memory.buffer;
    if (this.heap.buffer !== buf) {
      this.heap = new Float32Array(buf);
    }
    return this.heap;
  }

  scheduleNoteOff(voiceIndex, holdSeconds) {
    this.clearScheduledNoteOff(voiceIndex);
    const holdSamples = Math.max(0, Math.floor((Number(holdSeconds) || 0) * sampleRate));
    if (holdSamples <= 0 || voiceIndex < 0 || voiceIndex >= MAX_SCHEDULED_NOTE_OFFS) return;
    this.pendingNoteOffActive[voiceIndex] = 1;
    this.pendingNoteOffSamples[voiceIndex] = Math.min(0x7fffffff, holdSamples);
    this.pendingNoteOffCount += 1;
  }

  clearScheduledNoteOff(voiceIndex) {
    if (voiceIndex < 0 || voiceIndex >= MAX_SCHEDULED_NOTE_OFFS || !this.pendingNoteOffActive[voiceIndex]) return;
    this.pendingNoteOffActive[voiceIndex] = 0;
    this.pendingNoteOffSamples[voiceIndex] = 0;
    this.pendingNoteOffCount -= 1;
  }

  advanceScheduledNoteOffs(frames) {
    if (!this.ready || !this.wasm || this.pendingNoteOffCount === 0) return;
    for (let voiceIndex = 0; voiceIndex < MAX_SCHEDULED_NOTE_OFFS; voiceIndex += 1) {
      if (!this.pendingNoteOffActive[voiceIndex]) continue;
      const remaining = this.pendingNoteOffSamples[voiceIndex] - frames;
      if (remaining <= 0) {
        this.pendingNoteOffActive[voiceIndex] = 0;
        this.pendingNoteOffSamples[voiceIndex] = 0;
        this.pendingNoteOffCount -= 1;
        this.wasm.pad_note_off(voiceIndex);
      } else {
        this.pendingNoteOffSamples[voiceIndex] = remaining;
      }
    }
  }

  process(_inputs, outputs, _params) {
    if (!this.ready || !this.wasm) return true;

    try {
      const perfStart = this.perfEnabled ? _perfNow() : 0;
      const output = outputs[0];            // main stereo
      const reverbOut = outputs[1];         // reverb send stereo
      const prefaderPad1Out = outputs[2];   // Pad 1 pre-fader stereo
      const prefaderPad2Out = outputs[3];   // Pad 2 pre-fader stereo
      const postfaderPad1Out = outputs[4];  // Pad 1 post-level stereo
      const postfaderPad2Out = outputs[5];  // Pad 2 post-level stereo
      const blockSize = output[0]?.length || 128;

      this.advanceScheduledNoteOffs(blockSize);
      this.wasm.pad_process_block(blockSize);

      const heap = this.getHeapF32();

      // Main output (deinterleave)
      const outOffset = this.outputPtr >> 2;
      const outL = output[0];
      const outR = output[1] || outL;
      for (let i = 0; i < blockSize; i++) {
        outL[i] = this.sanitizeSample('process-main', heap[outOffset + i * 2]);
        if (outR !== outL) outR[i] = this.sanitizeSample('process-main', heap[outOffset + i * 2 + 1]);
      }

      // Reverb send
      if (reverbOut && reverbOut[0]) {
        const revOffset = this.reverbPtr >> 2;
        const revL = reverbOut[0];
        const revR = reverbOut[1] || revL;
        for (let i = 0; i < blockSize; i++) {
          revL[i] = this.sanitizeSample('process-reverb', heap[revOffset + i * 2]);
          if (revR !== revL) revR[i] = this.sanitizeSample('process-reverb', heap[revOffset + i * 2 + 1]);
        }
      }

      // Pad 1 pre-fader (for per-pad FX routing)
      if (prefaderPad1Out && prefaderPad1Out[0]) {
        const pfOffset = this.prefaderPad1Ptr >> 2;
        const pfL = prefaderPad1Out[0];
        const pfR = prefaderPad1Out[1] || pfL;
        for (let i = 0; i < blockSize; i++) {
          pfL[i] = this.sanitizeSample('process-prefader-pad1', heap[pfOffset + i * 2]);
          if (pfR !== pfL) pfR[i] = this.sanitizeSample('process-prefader-pad1', heap[pfOffset + i * 2 + 1]);
        }
      }

      // Pad 2 pre-fader (for per-pad FX routing)
      if (prefaderPad2Out && prefaderPad2Out[0]) {
        const pfOffset = this.prefaderPad2Ptr >> 2;
        const pfL = prefaderPad2Out[0];
        const pfR = prefaderPad2Out[1] || pfL;
        for (let i = 0; i < blockSize; i++) {
          pfL[i] = this.sanitizeSample('process-prefader-pad2', heap[pfOffset + i * 2]);
          if (pfR !== pfL) pfR[i] = this.sanitizeSample('process-prefader-pad2', heap[pfOffset + i * 2 + 1]);
        }
      }

      if (postfaderPad1Out && postfaderPad1Out[0]) {
        const postOffset = this.postfaderPad1Ptr >> 2;
        const postL = postfaderPad1Out[0];
        const postR = postfaderPad1Out[1] || postL;
        for (let i = 0; i < blockSize; i++) {
          postL[i] = this.sanitizeSample('process-postfader-pad1', heap[postOffset + i * 2]);
          if (postR !== postL) postR[i] = this.sanitizeSample('process-postfader-pad1', heap[postOffset + i * 2 + 1]);
        }
      }

      if (postfaderPad2Out && postfaderPad2Out[0]) {
        const postOffset = this.postfaderPad2Ptr >> 2;
        const postL = postfaderPad2Out[0];
        const postR = postfaderPad2Out[1] || postL;
        for (let i = 0; i < blockSize; i++) {
          postL[i] = this.sanitizeSample('process-postfader-pad2', heap[postOffset + i * 2]);
          if (postR !== postL) postR[i] = this.sanitizeSample('process-postfader-pad2', heap[postOffset + i * 2 + 1]);
        }
      }

      if (this.activeCountEnabled) {
        this.activeCountSamples += blockSize;
        if (this.activeCountSamples >= this.activeCountInterval) {
          this.activeCountMessage.count = this.wasm.pad_get_active_count();
          this.port.postMessage(this.activeCountMessage);
          this.activeCountSamples = 0;
        }
      }

      // Perf reporting
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
          this.perfMessage.cpuPercent = (avgMs / budgetMs) * 100;
          this.perfMessage.peakPercent = (this.perfPeakTime / budgetMs) * 100;
          this.perfMessage.missPercent = this.perfBlockCount > 0 ? (this.perfOverBudgetCount / this.perfBlockCount) * 100 : 0;
          this.perfMessage.avgTimeMs = avgMs;
          this.perfMessage.peakTimeMs = this.perfPeakTime;
          this.port.postMessage(this.perfMessage);
          this.perfTotalTime = 0;
          this.perfPeakTime = 0;
          this.perfOverBudgetCount = 0;
          this.perfBlockCount = 0;
          this.perfCount = 0;
          this.perfSamplesSinceReport = 0;
        }
      }

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[PadSynth-WASM] Process exception:', error);
      this.errorMessage.stage = 'process';
      this.errorMessage.message = message;
      this.port.postMessage(this.errorMessage);
      return true;
    }
  }
}

registerProcessor('pad-synth-wasm', PadSynthWasmProcessor);
