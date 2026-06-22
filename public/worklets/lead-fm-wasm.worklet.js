/**
 * Lead 4-op FM WASM Worklet Processor
 *
 * Thin AudioWorkletProcessor shell that loads kessho_lead_fm.wasm and delegates
 * all FM synthesis + delay to C++. Preset morphing stays in engine.ts;
 * morphed params + note triggers arrive via postMessage.
 *
 * Message types received:
 *   'wasmBinary'  – ArrayBuffer of compiled WASM module
 *   'params'      – morphed preset parameter updates
 *   'noteOn'      – { frequency, velocity, hold }
 *   'allNotesOff' – release all notes
 *   'reset'       – immediately clear notes and delay state
 *   'delay'       – delay parameter updates
 *   'enablePerf'  – toggle CPU measurement
 *   'destroy'     – cleanup
 *
 * Message types sent:
 *   'wasmReady'   – emitted once WASM is loaded and initialized
 *   'perf'        – CPU usage stats
 */

const _perfNow = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();

// Algorithm map (string → int)
const ALG_MAP = { parallel: 0, stack: 1, split: 2, cross: 3, dx17: 4 };
// Filter type map
const FILTER_MAP = { lowpass: 0, highpass: 1, bandpass: 2, notch: 3, peaking: 4 };
// Waveform map
const WAVE_MAP = { sine: 0, triangle: 1, sawtooth: 2, square: 3 };
// Pitch envelope target map
const PITCH_ENV_TARGET_MAP = { carriers: 0, carrier1: 1, carrier2: 2, all: 3 };
// LFO target map
const LFO_MAP = { all: 0, mod1: 1, mod2: 2, mod3: 3, mod4: 4, filter: 5, pitch: 6, detune: 7, none: 8, amp: 9, pan: 10 };
// Transient type map
const TRANS_MAP = { white: 0, pink: 1, brown: 2, filtered: 3 };

class LeadFMWasmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.wasm = null;
    this.heap = new Float32Array(0);
    this.outputPtr = 0;
    this.output2Ptr = 0;
    this.ready = false;

    this.perfEnabled = false;
    this.perfTotalTime = 0;
    this.perfPeakTime = 0;
    this.perfOverBudgetCount = 0;
    this.perfBlockCount = 0;
    this.perfCount = 0;
    this.perfSamplesSinceReport = 0;
    this.perfReportInterval = Math.floor(sampleRate * 0.5);

    this.pendingParams = [];
    this.pendingNotes = [];
    this.currentParams = null;
    this.currentDelay = null;

    this.port.onmessage = (event) => this.handleMessage(event.data);
  }

  async initWasm(wasmBinary) {
    const module = await WebAssembly.compile(wasmBinary);
    const wasiStubs = {
      wasi_snapshot_preview1: {
        fd_write: () => 0, fd_seek: () => 0, fd_close: () => 0,
        proc_exit: () => {}, environ_get: () => 0, environ_sizes_get: () => 0,
        clock_time_get: () => 0,
      },
      env: { emscripten_notify_memory_growth: () => {} },
    };
    const instance = await WebAssembly.instantiate(module, wasiStubs);
    this.wasm = instance.exports;

    const result = this.wasm.lead_fm_init(sampleRate);
    if (result !== 0) {
      console.error('[LeadFM-WASM] Init failed:', result);
      return;
    }

    this.outputPtr = this.wasm.lead_fm_get_output_ptr();
    this.output2Ptr = this.wasm.lead_fm_get_output2_ptr();
    this.ready = true;
    this.port.postMessage({ type: 'wasmReady' });

    for (const p of this.pendingParams) this.applyParams(p);
    this.pendingParams = [];
    for (const n of this.pendingNotes) {
      const li = n.leadIndex ?? 0;
      if (this.wasm.lead_fm_note_on_ex) {
        this.wasm.lead_fm_note_on_ex(n.frequency, n.velocity, n.hold || 1, li);
      } else {
        this.wasm.lead_fm_note_on(n.frequency, n.velocity, n.hold || 1);
      }
    }
    this.pendingNotes = [];
  }

  handleMessage(data) {
    switch (data.type) {
      case 'wasmBinary':
        this.initWasm(data.binary);
        break;
      case 'noteOn':
        if (this.ready) {
          const li = data.leadIndex ?? 0;
          if (this.wasm.lead_fm_note_on_ex) {
            this.wasm.lead_fm_note_on_ex(data.frequency, data.velocity, data.hold || 1, li);
          } else {
            this.wasm.lead_fm_note_on(data.frequency, data.velocity, data.hold || 1);
          }
        } else {
          this.pendingNotes.push(data);
        }
        break;
      case 'allNotesOff':
        if (this.ready) this.wasm.lead_fm_all_notes_off();
        break;
      case 'reset':
        this.resetLeadFm();
        break;
      case 'params':
        if (this.ready) this.applyParams(data);
        else this.pendingParams.push(data);
        break;
      case 'delay':
        if (this.ready) this.applyDelay(data);
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
          try { this.wasm.lead_fm_destroy(); } catch (e) { /* */ }
        }
        this.ready = false;
        this.wasm = null;
        break;
    }
  }

  resetLeadFm() {
    if (!this.ready || !this.wasm) return;
    if (this.wasm.lead_fm_reset) {
      this.wasm.lead_fm_reset(sampleRate);
    } else {
      try { this.wasm.lead_fm_destroy(); } catch (e) { /* */ }
      const result = this.wasm.lead_fm_init(sampleRate);
      if (result !== 0) {
        console.error('[LeadFM-WASM] Reset failed:', result);
        this.ready = false;
        return;
      }
      this.outputPtr = this.wasm.lead_fm_get_output_ptr();
      this.output2Ptr = this.wasm.lead_fm_get_output2_ptr();
      this.heap = new Float32Array(0);
    }
    this.pendingNotes = [];
    if (this.currentParams) this.applyParams({ params: this.currentParams });
    if (this.currentDelay) this.applyDelay({ params: this.currentDelay });
  }

  applyParams(data) {
    const w = this.wasm;
    const p = data.params || data;
    this.currentParams = { ...p };

    if (p.algorithm !== undefined) {
      w.lead_fm_set_algorithm(typeof p.algorithm === 'string' ? (ALG_MAP[p.algorithm] ?? 0) : p.algorithm);
    }
    if (p.beatDetune !== undefined) w.lead_fm_set_beat_detune(p.beatDetune);
    if (p.carrier2Mix !== undefined) w.lead_fm_set_carrier2_mix(p.carrier2Mix);
    if (p.carrier1Waveform !== undefined && w.lead_fm_set_carrier1_waveform) {
      w.lead_fm_set_carrier1_waveform(typeof p.carrier1Waveform === 'string' ? (WAVE_MAP[p.carrier1Waveform] ?? 0) : p.carrier1Waveform);
    }
    if (p.carrier2Waveform !== undefined && w.lead_fm_set_carrier2_waveform) {
      w.lead_fm_set_carrier2_waveform(typeof p.carrier2Waveform === 'string' ? (WAVE_MAP[p.carrier2Waveform] ?? 0) : p.carrier2Waveform);
    }
    if (p.stereoSpread !== undefined && w.lead_fm_set_stereo_spread) w.lead_fm_set_stereo_spread(p.stereoSpread);
    if (p.pitchEnvDepthCents !== undefined && w.lead_fm_set_pitch_env_depth_cents) w.lead_fm_set_pitch_env_depth_cents(p.pitchEnvDepthCents);
    if (p.pitchEnvAttack !== undefined && w.lead_fm_set_pitch_env_attack) w.lead_fm_set_pitch_env_attack(p.pitchEnvAttack);
    if (p.pitchEnvDecay !== undefined && w.lead_fm_set_pitch_env_decay) w.lead_fm_set_pitch_env_decay(p.pitchEnvDecay);
    if (p.pitchEnvTarget !== undefined && w.lead_fm_set_pitch_env_target) {
      w.lead_fm_set_pitch_env_target(typeof p.pitchEnvTarget === 'string' ? (PITCH_ENV_TARGET_MAP[p.pitchEnvTarget] ?? 0) : p.pitchEnvTarget);
    }
    if (p.pitchEnvVelocityDepth !== undefined && w.lead_fm_set_pitch_env_velocity_depth) w.lead_fm_set_pitch_env_velocity_depth(p.pitchEnvVelocityDepth);

    // Per-operator params (mod1..mod4)
    for (let i = 0; i < 4; i++) {
      const prefix = `mod${i + 1}`;
      if (p[prefix + 'Ratio'] !== undefined) w.lead_fm_set_op_ratio(i, p[prefix + 'Ratio']);
      if (p[prefix + 'Index'] !== undefined) w.lead_fm_set_op_index(i, p[prefix + 'Index']);
      if (p[prefix + 'Decay'] !== undefined) w.lead_fm_set_op_decay(i, p[prefix + 'Decay']);
      if (p[prefix + 'Sustain'] !== undefined) w.lead_fm_set_op_sustain(i, p[prefix + 'Sustain']);
      if (p[prefix + 'Level'] !== undefined) w.lead_fm_set_op_level(i, p[prefix + 'Level']);
      if (p[prefix + 'Feedback'] !== undefined) w.lead_fm_set_op_feedback(i, p[prefix + 'Feedback']);
      if (p[prefix + 'Detune'] !== undefined) w.lead_fm_set_op_detune(i, p[prefix + 'Detune']);
      if (p[prefix + 'EnvRate'] !== undefined) w.lead_fm_set_op_env_rate(i, p[prefix + 'EnvRate']);
      if (p[prefix + 'ModAttack'] !== undefined) w.lead_fm_set_op_mod_attack(i, p[prefix + 'ModAttack']);
      if (p[prefix + 'ModDelay'] !== undefined) w.lead_fm_set_op_mod_delay(i, p[prefix + 'ModDelay']);
      if (p[prefix + 'Waveform'] !== undefined && w.lead_fm_set_op_waveform) {
        w.lead_fm_set_op_waveform(i, typeof p[prefix + 'Waveform'] === 'string' ? (WAVE_MAP[p[prefix + 'Waveform']] ?? 0) : p[prefix + 'Waveform']);
      }
      if (p[prefix + 'FixedHz'] !== undefined && w.lead_fm_set_op_fixed_hz) w.lead_fm_set_op_fixed_hz(i, p[prefix + 'FixedHz']);
      if (p[prefix + 'KeyTrack'] !== undefined && w.lead_fm_set_op_key_track) w.lead_fm_set_op_key_track(i, p[prefix + 'KeyTrack']);
      if (p[prefix + 'VelocityToIndex'] !== undefined && w.lead_fm_set_op_velocity_to_index) w.lead_fm_set_op_velocity_to_index(i, p[prefix + 'VelocityToIndex']);
      if (p[prefix + 'VelocityToLevel'] !== undefined && w.lead_fm_set_op_velocity_to_level) w.lead_fm_set_op_velocity_to_level(i, p[prefix + 'VelocityToLevel']);
      if (p[prefix + 'ModRelease'] !== undefined && w.lead_fm_set_op_mod_release) w.lead_fm_set_op_mod_release(i, p[prefix + 'ModRelease']);
    }

    // Envelope
    if (p.attack !== undefined) w.lead_fm_set_attack(p.attack);
    if (p.decay !== undefined) w.lead_fm_set_decay(p.decay);
    if (p.sustain !== undefined) w.lead_fm_set_sustain(p.sustain);
    if (p.release !== undefined) w.lead_fm_set_release(p.release);

    // Filter
    if (p.filterFreq !== undefined) w.lead_fm_set_filter_freq(p.filterFreq);
    if (p.filterQ !== undefined) w.lead_fm_set_filter_q(p.filterQ);
    if (p.filterType !== undefined) {
      w.lead_fm_set_filter_type(typeof p.filterType === 'string' ? (FILTER_MAP[p.filterType] ?? 0) : p.filterType);
    }
    if (p.filterEnvAttack !== undefined) w.lead_fm_set_filter_env_attack(p.filterEnvAttack);
    if (p.filterEnvDecay !== undefined) w.lead_fm_set_filter_env_decay(p.filterEnvDecay);
    if (p.filterEnvSustain !== undefined) w.lead_fm_set_filter_env_sustain(p.filterEnvSustain);
    if (p.filterEnvRelease !== undefined) w.lead_fm_set_filter_env_release(p.filterEnvRelease);
    if (p.filterEnvDepth !== undefined) w.lead_fm_set_filter_env_depth(p.filterEnvDepth);

    // Other
    if (p.drive !== undefined) w.lead_fm_set_drive(p.drive);
    if (p.gain !== undefined) w.lead_fm_set_gain(p.gain);

    // Transient
    if (p.transientClick !== undefined) w.lead_fm_set_transient_click(p.transientClick);
    if (p.transientNoise !== undefined) w.lead_fm_set_transient_noise(p.transientNoise);
    if (p.transientDuration !== undefined) w.lead_fm_set_transient_duration_ms(p.transientDuration);
    if (p.transientDecay !== undefined) w.lead_fm_set_transient_decay(p.transientDecay);
    if (p.transientFilter !== undefined) w.lead_fm_set_transient_filter(p.transientFilter);
    if (p.transientType !== undefined) {
      w.lead_fm_set_transient_type(typeof p.transientType === 'string' ? (TRANS_MAP[p.transientType] ?? 0) : p.transientType);
    }

    // XY
    if (p.xLevel !== undefined) w.lead_fm_set_x_level(p.xLevel);
    if (p.xPan !== undefined) w.lead_fm_set_x_pan(p.xPan);
    if (p.yLevel !== undefined) w.lead_fm_set_y_level(p.yLevel);
    if (p.yPan !== undefined) w.lead_fm_set_y_pan(p.yPan);

    // LFO
    if (p.lfoRate !== undefined) w.lead_fm_set_lfo_rate(p.lfoRate);
    if (p.lfoDepth !== undefined) w.lead_fm_set_lfo_depth(p.lfoDepth);
    if (p.lfoTarget !== undefined) {
      w.lead_fm_set_lfo_target(typeof p.lfoTarget === 'string' ? (LFO_MAP[p.lfoTarget] ?? 0) : p.lfoTarget);
    }

    // Unison
    if (p.unisonVoices !== undefined) w.lead_fm_set_unison_voices(p.unisonVoices);
    if (p.unisonDetune !== undefined) w.lead_fm_set_unison_detune(p.unisonDetune);
  }

  applyDelay(data) {
    const w = this.wasm;
    const p = data.params || data;
    this.currentDelay = { ...p };
    if (p.enabled !== undefined) w.lead_fm_set_delay_enabled(p.enabled ? 1 : 0);
    if (p.timeL !== undefined) w.lead_fm_set_delay_time_l(p.timeL / 1000 * sampleRate);
    if (p.timeR !== undefined) w.lead_fm_set_delay_time_r(p.timeR / 1000 * sampleRate);
    if (p.feedback !== undefined) w.lead_fm_set_delay_feedback(p.feedback);
    if (p.filter !== undefined) w.lead_fm_set_delay_filter(p.filter);
    if (p.mix !== undefined) w.lead_fm_set_delay_mix(p.mix);
    if (p.send !== undefined) w.lead_fm_set_delay_send(p.send);
  }

  getHeapF32() {
    const buf = this.wasm.memory.buffer;
    if (this.heap.buffer !== buf) this.heap = new Float32Array(buf);
    return this.heap;
  }

  process(_inputs, outputs, _params) {
    if (!this.ready || !this.wasm) return true;

    const perfStart = this.perfEnabled ? _perfNow() : 0;
    const output = outputs[0];
    const output2 = outputs[1];
    const blockSize = output[0]?.length || 128;

    this.wasm.lead_fm_process_block(blockSize);

    const heap = this.getHeapF32();

    // Lead 1 output
    const outOffset = this.outputPtr >> 2;
    const outL = output[0];
    const outR = output[1] || outL;
    for (let i = 0; i < blockSize; i++) {
      outL[i] = heap[outOffset + i * 2];
      if (outR !== outL) outR[i] = heap[outOffset + i * 2 + 1];
    }

    // Lead 2 output
    if (output2 && output2[0]) {
      const out2Offset = this.output2Ptr >> 2;
      const out2L = output2[0];
      const out2R = output2[1] || out2L;
      for (let i = 0; i < blockSize; i++) {
        out2L[i] = heap[out2Offset + i * 2];
        if (out2R !== out2L) out2R[i] = heap[out2Offset + i * 2 + 1];
      }
    }

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
          type: 'perf', name: 'lead-fm-wasm',
          cpuPercent: (avgMs / budgetMs) * 100, peakPercent: (this.perfPeakTime / budgetMs) * 100,
          missPercent: this.perfBlockCount > 0 ? (this.perfOverBudgetCount / this.perfBlockCount) * 100 : 0,
          avgTimeMs: avgMs, peakTimeMs: this.perfPeakTime,
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

registerProcessor('lead-fm-wasm', LeadFMWasmProcessor);
