/**
 * Drum Synth WASM Worklet Processor
 *
 * Thin AudioWorkletProcessor shell that loads kessho_drum.wasm and delegates
 * all drum synthesis + delay to C++. Euclidean scheduling stays in engine.ts;
 * triggers arrive via postMessage.
 *
 * Message types received:
 *   'wasmBinary'  – ArrayBuffer of compiled WASM module
 *   'params'      – per-voice parameter updates
 *   'trigger'     – voice trigger { voiceType, velocity, sampleOffset }
 *   'delay'       – delay parameter updates
 *   'overrides'   – per-trigger overrides (morph, distance, pitch, ratchet caps)
 *   'enablePerf'  – toggle CPU measurement
 *   'destroy'     – cleanup
 *
 * Message types sent:
 *   'wasmReady'   – emitted once WASM is loaded and initialized
 *   'perf'        – CPU usage stats
 *   'activeCount' – number of active voices (~5 Hz)
 */

const _perfNow = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();

class DrumSynthWasmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.wasm = null;
    this.heap = new Float32Array(0);
    this.outputPtr = 0;
    this.reverbPtr = 0;
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

    // Active count reporting
    this.activeCountSamples = 0;
    this.activeCountInterval = Math.floor(sampleRate * 0.2); // ~5 Hz

    // Buffer params/triggers that arrive before WASM is ready
    this.pendingParams = [];
    this.pendingTriggers = [];

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
    this.wasm = instance.exports;

    const result = this.wasm.drum_init(sampleRate);
    if (result !== 0) {
      console.error('[DrumSynth-WASM] Init failed:', result);
      return;
    }

    this.outputPtr = this.wasm.drum_get_output_ptr();
    this.reverbPtr = this.wasm.drum_get_reverb_send_ptr();

    this.ready = true;
    this.port.postMessage({ type: 'wasmReady' });

    // Apply any buffered params
    for (const p of this.pendingParams) {
      this.applyParams(p);
    }
    this.pendingParams = [];

    // Fire any buffered triggers
    for (const t of this.pendingTriggers) {
      this.wasm.drum_trigger(t.voiceType, t.velocity, t.sampleOffset || 0);
    }
    this.pendingTriggers = [];
  }

  handleMessage(data) {
    switch (data.type) {
      case 'wasmBinary':
        this.initWasm(data.binary);
        break;

      case 'trigger':
        if (this.ready) {
          this.wasm.drum_trigger(data.voiceType, data.velocity, data.sampleOffset || 0);
        } else {
          this.pendingTriggers.push(data);
        }
        break;

      case 'params':
        if (this.ready) {
          this.applyParams(data);
        } else {
          this.pendingParams.push(data);
        }
        break;

      case 'delay':
        if (this.ready) this.applyDelay(data);
        break;

      case 'overrides':
        if (this.ready) this.applyOverrides(data);
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
          try { this.wasm.drum_destroy(); } catch (e) { /* */ }
        }
        this.ready = false;
        this.wasm = null;
        break;
    }
  }

  /** Translate per-voice params to C API calls */
  applyParams(data) {
    const w = this.wasm;
    const voice = data.voice;
    const p = data.params || data;

    // Map voice name → setter prefix
    const SETTER_MAP = {
      sub: 'drum_set_sub_',
      kick: 'drum_set_kick_',
      click: 'drum_set_click_',
      beepHi: 'drum_set_beep_hi_',
      beepLo: 'drum_set_beep_lo_',
      noise: 'drum_set_noise_',
      membrane: 'drum_set_membrane_',
    };

    // snake_case conversion for param keys
    const toSnake = (s) => s.replace(/([A-Z])/g, '_$1').toLowerCase();

    if (voice && SETTER_MAP[voice]) {
      const prefix = SETTER_MAP[voice];
      for (const [key, value] of Object.entries(p)) {
        if (key === 'type' || key === 'voice') continue;
        const fnName = prefix + toSnake(key);
        if (typeof w[fnName] === 'function') {
          w[fnName](value);
        }
      }
    }

    // Global params
    if (p.masterLevel !== undefined) w.drum_set_master_level(p.masterLevel);
    if (p.reverbSend !== undefined) w.drum_set_reverb_send(p.reverbSend);
    if (p.rngSeed !== undefined) w.drum_set_rng_seed(p.rngSeed);
  }

  /** Apply delay parameters */
  applyDelay(data) {
    const w = this.wasm;
    const p = data.params || data;

    if (p.enabled !== undefined) w.drum_set_delay_enabled(p.enabled ? 1 : 0);
    if (p.timeL !== undefined) w.drum_set_delay_time_l(p.timeL * sampleRate);
    if (p.timeR !== undefined) w.drum_set_delay_time_r(p.timeR * sampleRate);
    if (p.feedback !== undefined) w.drum_set_delay_feedback(p.feedback);
    if (p.filter !== undefined) w.drum_set_delay_filter(p.filter);
    if (p.mix !== undefined) w.drum_set_delay_mix(p.mix);

    // Per-voice sends: { sends: { sub: 0.3, kick: 0.1, ... } }
    if (p.sends) {
      const TYPE_MAP = { sub: 0, kick: 1, click: 2, beepHi: 3, beepLo: 4, noise: 5, membrane: 6 };
      for (const [name, level] of Object.entries(p.sends)) {
        const idx = TYPE_MAP[name];
        if (idx !== undefined) w.drum_set_delay_send(idx, level);
      }
    }
  }

  /** Apply per-trigger overrides */
  applyOverrides(data) {
    const w = this.wasm;
    if (data.clear) {
      w.drum_clear_trigger_overrides();
      return;
    }
    if (data.morph !== undefined) w.drum_set_trigger_morph(data.morph);
    if (data.distance !== undefined) w.drum_set_trigger_distance(data.distance);
    if (data.pitch !== undefined) w.drum_set_trigger_pitch(data.pitch);
    if (data.ratchetDecayCap !== undefined || data.ratchetAttackCap !== undefined) {
      w.drum_set_trigger_ratchet_cap(
        data.ratchetDecayCap ?? 1e10,
        data.ratchetAttackCap ?? 1e10
      );
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
    if (!this.ready || !this.wasm) {
      return true;
    }

    const perfStart = this.perfEnabled ? _perfNow() : 0;
    const output = outputs[0];
    const reverbOutput = outputs[1]; // second output bus for reverb send
    const blockSize = output[0]?.length || 128;

    // Process drum synthesis
    this.wasm.drum_process_block(blockSize);

    // Copy output from WASM (deinterleave)
    const heap = this.getHeapF32();
    const outOffset = this.outputPtr >> 2;
    const outL = output[0];
    const outR = output[1] || outL;
    for (let i = 0; i < blockSize; i++) {
      const val_l = heap[outOffset + i * 2];
      const val_r = heap[outOffset + i * 2 + 1];
      outL[i] = val_l;
      if (outR !== outL) outR[i] = val_r;
    }

    // Copy reverb send output
    if (reverbOutput && reverbOutput[0]) {
      const revOffset = this.reverbPtr >> 2;
      const revL = reverbOutput[0];
      const revR = reverbOutput[1] || revL;
      for (let i = 0; i < blockSize; i++) {
        revL[i] = heap[revOffset + i * 2];
        if (revR !== revL) revR[i] = heap[revOffset + i * 2 + 1];
      }
    }

    // Active count reporting
    this.activeCountSamples += blockSize;
    if (this.activeCountSamples >= this.activeCountInterval) {
      this.port.postMessage({
        type: 'activeCount',
        count: this.wasm.drum_get_active_count(),
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
          name: 'drum-wasm',
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

registerProcessor('drum-synth-wasm', DrumSynthWasmProcessor);
