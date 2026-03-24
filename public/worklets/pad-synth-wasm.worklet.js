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
 *   'noteOn'      – { voiceIndex, frequency, velocity }
 *   'noteOff'     – { voiceIndex }
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

// Pad 1 param name → WASM setter function name
const PAD1_PARAM_MAP = {
  // Oscillators
  padOscAWave:        'pad_set_osc_a_wave',
  padOscAOctave:      'pad_set_osc_a_octave',
  padOscADetune:      'pad_set_osc_a_detune',
  padOscALevel:       'pad_set_osc_a_level',
  padOscBWave:        'pad_set_osc_b_wave',
  padOscBOctave:      'pad_set_osc_b_octave',
  padOscBDetune:      'pad_set_osc_b_detune',
  padOscBLevel:       'pad_set_osc_b_level',
  padOscMix:          'pad_set_osc_mix',
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
  filterCutoffMin:    'pad_set_filter_cutoff_min',
  filterCutoffMax:    'pad_set_filter_cutoff_max',
  filterResonance:    'pad_set_filter_resonance',
  filterQ:            'pad_set_filter_q',
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
  // Level (synthLevel maps to pad_set_level for pad 1)
  synthLevel:         'pad_set_level',
};

// Pad 2 param name → same WASM setter (pad index changes)
const PAD2_PARAM_MAP = {
  pad2OscAWave:        'pad_set_osc_a_wave',
  pad2OscAOctave:      'pad_set_osc_a_octave',
  pad2OscADetune:      'pad_set_osc_a_detune',
  pad2OscALevel:       'pad_set_osc_a_level',
  pad2OscBWave:        'pad_set_osc_b_wave',
  pad2OscBOctave:      'pad_set_osc_b_octave',
  pad2OscBDetune:      'pad_set_osc_b_detune',
  pad2OscBLevel:       'pad_set_osc_b_level',
  pad2OscMix:          'pad_set_osc_mix',
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
  pad2FilterCutoffMin: 'pad_set_filter_cutoff_min',
  pad2FilterCutoffMax: 'pad_set_filter_cutoff_max',
  pad2FilterResonance: 'pad_set_filter_resonance',
  pad2FilterQ:         'pad_set_filter_q',
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
  pad2Level:           'pad_set_level',
};

// Filter type string → int
const FILTER_MAP = { lowpass: 0, bandpass: 1, highpass: 2, notch: 3 };
// LFO waveform string → int
const LFO_WAVE_MAP = { sine: 0, triangle: 1, sawtooth: 2, square: 3, sampleHold: 4, randomSmooth: 5, randomWalk: 6 };
// LFO/mod destination string → int
const DEST_MAP = { none: 0, filterCutoff: 1, filterB: 2, amplitude: 3, pitch: 4, oscBLevel: 5, foldAmount: 6 };
// Filter routing string → int
const ROUTE_MAP = { series: 0, aOnly: 1, bOnly: 2 };
// Waveform string → int
const WAVE_MAP = { sine: 0, triangle: 1, sawtooth: 2, square: 3 };

const BOOLEAN_PARAM_KEYS = new Set([
  'padSubEnabled', 'padFilterBEnabled', 'padModEnvEnabled',
  'pad2SubEnabled', 'pad2FilterBEnabled', 'pad2ModEnvEnabled',
]);

const PARAM_CLAMPS = {
  padOscAWave: [0, 3], padOscAOctave: [-4, 4], padOscADetune: [-100, 100], padOscALevel: [0, 1],
  padOscBWave: [0, 3], padOscBOctave: [-4, 4], padOscBDetune: [-100, 100], padOscBLevel: [0, 1],
  padOscMix: [0, 1], padSubOctave: [-4, 1], padSubWave: [0, 3], padSubLevel: [0, 1],
  padNoiseType: [0, 1], padNoiseLevel: [0, 1], hardness: [0, 1], warmth: [0, 1], presence: [0, 1],
  padFoldAmount: [0, 1], padFoldMode: [0, 2], filterType: [0, 3],
  filterCutoffMin: [20, 18000], filterCutoffMax: [20, 18000], filterResonance: [0, 1], filterQ: [0.01, 20],
  padFilterBType: [0, 3], padFilterBCutoff: [20, 18000], padFilterBResonance: [0, 1], padFilterBQ: [0.01, 20],
  padFilterRouting: [0, 2], synthAttack: [0.001, 20], synthDecay: [0.001, 20], synthSustain: [0, 1], synthRelease: [0.001, 30],
  padLfo1Rate: [0, 40], padLfo1Depth: [0, 1], padLfo1Wave: [0, 6], padLfo1Dest: [0, 6],
  padLfo2Rate: [0, 40], padLfo2Depth: [0, 1], padLfo2Wave: [0, 6], padLfo2Dest: [0, 6],
  padModEnvAttack: [0.001, 20], padModEnvDecay: [0.001, 20], padModEnvSustain: [0, 1], padModEnvRelease: [0.001, 30],
  padModEnvDepth: [-1, 1], padModEnvDest: [0, 6], synthLevel: [0, 2],
  pad2OscAWave: [0, 3], pad2OscAOctave: [-4, 4], pad2OscADetune: [-100, 100], pad2OscALevel: [0, 1],
  pad2OscBWave: [0, 3], pad2OscBOctave: [-4, 4], pad2OscBDetune: [-100, 100], pad2OscBLevel: [0, 1],
  pad2OscMix: [0, 1], pad2SubOctave: [-4, 1], pad2SubWave: [0, 3], pad2SubLevel: [0, 1],
  pad2NoiseType: [0, 1], pad2NoiseLevel: [0, 1], pad2Hardness: [0, 1], pad2Warmth: [0, 1], pad2Presence: [0, 1],
  pad2FoldAmount: [0, 1], pad2FoldMode: [0, 2], pad2FilterType: [0, 3],
  pad2FilterCutoffMin: [20, 18000], pad2FilterCutoffMax: [20, 18000], pad2FilterResonance: [0, 1], pad2FilterQ: [0.01, 20],
  pad2FilterBType: [0, 3], pad2FilterBCutoff: [20, 18000], pad2FilterBResonance: [0, 1], pad2FilterBQ: [0.01, 20],
  pad2FilterRouting: [0, 2], pad2Attack: [0.001, 20], pad2Decay: [0.001, 20], pad2Sustain: [0, 1], pad2Release: [0.001, 30],
  pad2Lfo1Rate: [0, 40], pad2Lfo1Depth: [0, 1], pad2Lfo1Wave: [0, 6], pad2Lfo1Dest: [0, 6],
  pad2Lfo2Rate: [0, 40], pad2Lfo2Depth: [0, 1], pad2Lfo2Wave: [0, 6], pad2Lfo2Dest: [0, 6],
  pad2ModEnvAttack: [0.001, 20], pad2ModEnvDecay: [0.001, 20], pad2ModEnvSustain: [0, 1], pad2ModEnvRelease: [0.001, 30],
  pad2ModEnvDepth: [-1, 1], pad2ModEnvDest: [0, 6], pad2Level: [0, 2], synthReverbSend: [0, 1],
};

class PadSynthWasmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.wasm = null;
    this.heap = new Float32Array(0);
    this.outputPtr = 0;
    this.reverbPtr = 0;
    this.prefaderPtr = 0;
    this.ready = false;

    this.perfEnabled = false;
    this.perfTotalTime = 0;
    this.perfPeakTime = 0;
    this.perfOverBudgetCount = 0;
    this.perfBlockCount = 0;
    this.perfCount = 0;
    this.perfSamplesSinceReport = 0;
    this.perfReportInterval = Math.floor(sampleRate * 0.5);

    this.activeCountSamples = 0;
    this.activeCountInterval = Math.floor(sampleRate * 0.2);

    this.pendingParams = [];
    this.pendingNotes = [];
    this.lastNonFiniteReportTime = 0;

    this.port.onmessage = (event) => this.handleMessage(event.data);
  }

  reportNonFinite(stage, value) {
    const now = _perfNow();
    if (now - this.lastNonFiniteReportTime < 10000) return;
    this.lastNonFiniteReportTime = now;
    this.port.postMessage({ type: 'error', stage, message: `Non-finite sample detected: ${String(value)}` });
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
      this.prefaderPtr = this.wasm.pad_get_prefader_ptr();

      this.ready = true;
      this.port.postMessage({ type: 'wasmReady' });

      for (const p of this.pendingParams) this.applyParams(p);
      this.pendingParams = [];
      for (const n of this.pendingNotes) {
        this.wasm.pad_note_on(n.voiceIndex, n.frequency, n.velocity);
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
          if (voiceIndex < 0 || !Number.isFinite(frequency) || !Number.isFinite(velocity)) {
            this.port.postMessage({ type: 'error', stage: 'noteOn', message: `Invalid noteOn payload: ${JSON.stringify(data)}` });
            break;
          }
          if (this.ready) {
            this.wasm.pad_note_on(voiceIndex, frequency, velocity);
          } else {
            this.pendingNotes.push({ ...data, voiceIndex, frequency, velocity });
          }
          break;
        }

        case 'noteOff':
          if (this.ready && Number.isInteger(data.voiceIndex)) this.wasm.pad_note_off(data.voiceIndex);
          break;

        case 'voicePad':
          if (this.ready && Number.isInteger(data.voiceIndex) && Number.isInteger(data.pad)) {
            this.wasm.pad_set_voice_pad(data.voiceIndex, data.pad);
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

        case 'destroy':
          if (this.wasm && this.ready) {
            try { this.wasm.pad_destroy(); } catch (e) { /* */ }
          }
          this.ready = false;
          this.wasm = null;
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
    if (typeof resolved === 'number') {
      const finite = Number.isFinite(resolved) ? resolved : 0;
      const range = PARAM_CLAMPS[key];
      return range ? clampNumber(finite, range[0], range[1]) : finite;
    }
    return resolved;
  }

  applyParams(data) {
    const w = this.wasm;
    const p = data.params || data;

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

  process(_inputs, outputs, _params) {
    if (!this.ready || !this.wasm) return true;

    try {
      const perfStart = this.perfEnabled ? _perfNow() : 0;
      const output = outputs[0];        // main stereo
      const reverbOut = outputs[1];     // reverb send stereo
      const prefaderOut = outputs[2];   // pre-fader stereo (for granular)
      const blockSize = output[0]?.length || 128;

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

      // Pre-fader (for granular FX)
      if (prefaderOut && prefaderOut[0]) {
        const pfOffset = this.prefaderPtr >> 2;
        const pfL = prefaderOut[0];
        const pfR = prefaderOut[1] || pfL;
        for (let i = 0; i < blockSize; i++) {
          pfL[i] = this.sanitizeSample('process-prefader', heap[pfOffset + i * 2]);
          if (pfR !== pfL) pfR[i] = this.sanitizeSample('process-prefader', heap[pfOffset + i * 2 + 1]);
        }
      }

      // Active count reporting
      this.activeCountSamples += blockSize;
      if (this.activeCountSamples >= this.activeCountInterval) {
        this.port.postMessage({
          type: 'activeCount',
          count: this.wasm.pad_get_active_count(),
        });
        this.activeCountSamples = 0;
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
          this.port.postMessage({
            type: 'perf',
            name: 'pad-wasm',
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[PadSynth-WASM] Process exception:', error);
      this.port.postMessage({ type: 'error', stage: 'process', message });
      return true;
    }
  }
}

registerProcessor('pad-synth-wasm', PadSynthWasmProcessor);
