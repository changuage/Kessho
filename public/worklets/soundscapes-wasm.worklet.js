/**
 * Kessho Soundscapes WASM AudioWorkletProcessor
 *
 * A single AudioWorklet that wraps BOTH the water and insects C++ engines.
 * Presents the same postMessage interface as the JS water.worklet.js and
 * insects.worklet.js so that soundscapes-demo.html can swap transparently.
 *
 * Message types received:
 *   'wasmBinary'       – ArrayBuffer of kessho_soundscapes.wasm
 *   'waterParams'      – water engine params (preset, intensity, rate, etc.)
 *   'waterPreset'      – { preset: number }
 *   'waterLayerMix'    – { hardDrops, waterDrops, turbulence, bubbling, roar, rivulets }
 *   'waterLayerDensity' – { hardDrops, waterDrops, turbulence, bubbling, roar, rivulets }
 *   'waterStart'       – start water playback
 *   'waterStop'        – stop water playback
 *   'waterSeed'        – { seed: number }
 *   'insectsParams'    – insects engine params
 *   'insectsEngine'    – { engine: number }
 *   'insectsStart'     – start insects playback
 *   'insectsStop'      – stop insects playback
 *   'insectsSeed'      – { seed: number }
 *   'insects2Params'   – insects engine 2 params (dual layer)
 *   'insects2Engine'   – { engine: number }
 *   'insects2Start'    – start insects layer 2
 *   'insects2Stop'     – stop insects layer 2
 *   'insects2Seed'     – { seed: number }
 *   'insects2Gain'     – { gain: number } (0-1 volume for layer 2)
 *   'insectsGain'      – { gain: number } (0-1 volume for layer 1)
 *   'oceanParams'      – ocean engine params
 *   'oceanStart'       – start ocean playback
 *   'oceanStop'        – stop ocean playback
 *   'oceanSeed'        – { seed: number }
 *   'enablePerf'       – toggle CPU measurement
 *
 * Message types sent:
 *   'wasmReady'        – module loaded and initialized
 *   'perf'             – CPU usage stats
 *   'waterStats'       – active voices / events per sec
 *   'insectsStats'     – active voices / engine type
 *   'insects2Stats'    – active voices / engine type (layer 2)
 */

// Safe performance.now()
const _perfNow =
  typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();

// ═══════════════ WASM Module Interface ═══════════════

// (Declared for documentation; accessed via instance.exports)

// ═══════════════ Processor ═══════════════

class SoundscapesWasmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._wasm = null;
    this._memory = null;
    this._heapF32 = null;
    this._waterOutPtr = 0;
    this._insectsOutPtr = 0;
    this._insects2OutPtr = 0;
    this._oceanOutPtr = 0;
    this._ready = false;
    this._waterActive = false;
    this._insectsActive = false;
    this._insects2Active = false;
    this._oceanActive = false;

    // Per-layer gain multipliers (applied in worklet when mixing)
    this._insects1Gain = 1.0;
    this._insects2Gain = 1.0;

    // Perf measurement
    this._perfEnabled = false;
    this._perfTotalTime = 0;
    this._perfPeakTime = 0;
    this._perfOverBudgetCount = 0;
    this._perfBlockCount = 0;
    this._perfCount = 0;
    this._perfSamplesSinceReport = 0;
    this._perfReportInterval = Math.floor(sampleRate * 0.5);
    this._perfWaterPeak = 0;
    this._perfInsectsPeak = 0;
    this._perfOceanPeak = 0;

    // Stats reporting (~5 Hz)
    this._statsCounter = 0;
    this._statsInterval = Math.floor(sampleRate / 5);

    // Buffered params (before WASM ready)
    this._pendingMessages = [];

    this.port.onmessage = (e) => this._handleMessage(e.data);
  }

  async _initWasm(wasmBinary) {
    const module = await WebAssembly.compile(wasmBinary);

    // WASI stubs (STANDALONE_WASM=1)
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
        emscripten_notify_memory_growth: () => {
          this._updateHeap();
        },
      },
    };

    const instance = await WebAssembly.instantiate(module, wasiStubs);
    const exports = instance.exports;
    this._wasm = exports;
    this._memory = exports.memory;

    // Initialize all engines
    exports.water_init(sampleRate);
    exports.insects_init(sampleRate);
    exports.insects2_init(sampleRate);
    exports.ocean_init(sampleRate);

    // Cache output pointers
    this._waterOutPtr = exports.water_get_output_ptr();
    this._insectsOutPtr = exports.insects_get_output_ptr();
    this._insects2OutPtr = exports.insects2_get_output_ptr();
    this._oceanOutPtr = exports.ocean_get_output_ptr();

    this._ready = true;
    this.port.postMessage({ type: 'wasmReady' });

    // Replay any messages that arrived before WASM was ready
    for (const msg of this._pendingMessages) {
      this._handleMessage(msg);
    }
    this._pendingMessages = [];
  }

  _updateHeap() {
    // Called when memory grows — invalidate cached views
    // Output pointers are stable (inside the WASM linear memory)
    this._heapF32 = null;
  }

  _getF32() {
    if (!this._memory) return null;
    if (!this._heapF32 || this._heapF32.buffer !== this._memory.buffer) {
      this._heapF32 = new Float32Array(this._memory.buffer);
    }
    return this._heapF32;
  }

  _handleMessage(data) {
    if (!data || !data.type) return;

    // Buffer messages until WASM is ready
    if (!this._ready && data.type !== 'wasmBinary') {
      this._pendingMessages.push(data);
      return;
    }

    const w = this._wasm;

    switch (data.type) {
      case 'wasmBinary':
        this._initWasm(data.binary);
        break;

      case 'waterParams': {
        const p = data.params || data;
        w.water_set_params(
          p.intensityMin ?? p.intensity ?? 0.5,
          p.intensityMax ?? p.intensity ?? 0.5,
          p.rateMin ?? p.rate ?? 0.5,
          p.rateMax ?? p.rate ?? 0.5,
          p.distanceMin ?? p.distance ?? 0.3,
          p.distanceMax ?? p.distance ?? 0.3,
          p.baseFreqMin ?? p.baseFreq ?? 2500.0,
          p.baseFreqMax ?? p.baseFreq ?? 2500.0,
          p.dropSizeMin ?? p.dropSize ?? 0.5,
          p.dropSizeMax ?? p.dropSize ?? 0.5,
          p.hardnessMin ?? p.hardness ?? 0.5,
          p.hardnessMax ?? p.hardness ?? 0.5,
          p.glassThicknessMin ?? p.glassThickness ?? 0.5,
          p.glassThicknessMax ?? p.glassThickness ?? 0.5
        );
        break;
      }

      case 'waterPreset':
        w.water_set_preset(data.preset ?? 0);
        break;

      case 'waterLayerMix': {
        const m = data;
        w.water_set_layer_mix(
          m.hardDrops ?? 0.7,
          m.waterDrops ?? 0.5,
          m.turbulence ?? 0.3,
          m.bubbling ?? 0.0,
          m.roar ?? 0.0,
          m.rivulets ?? 0.0
        );
        break;
      }

      case 'waterLayerDensity': {
        const d = data;
        w.water_set_layer_density(
          d.hardDrops ?? 1.0,
          d.waterDrops ?? 1.0,
          d.turbulence ?? 1.0,
          d.bubbling ?? 1.0,
          d.roar ?? 1.0,
          d.rivulets ?? 1.0
        );
        break;
      }

      case 'waterStart':
        w.water_start();
        this._waterActive = true;
        break;

      case 'waterStop':
        w.water_stop();
        this._waterActive = false;
        break;

      case 'waterSeed':
        w.water_set_seed(data.seed ?? 12345);
        break;

      case 'insectsParams': {
        const p = data.params || data;
        w.insects_set_params(
          p.densityMin ?? p.density ?? 0.5,
          p.densityMax ?? p.density ?? 0.5,
          p.temperatureMin ?? p.temperature ?? 0.5,
          p.temperatureMax ?? p.temperature ?? 0.5,
          p.distanceMin ?? p.distance ?? 0.3,
          p.distanceMax ?? p.distance ?? 0.3,
          p.proximityMin ?? p.proximity ?? 0.5,
          p.proximityMax ?? p.proximity ?? 0.5,
          p.antiphonyMin ?? p.antiphony ?? 0.3,
          p.antiphonyMax ?? p.antiphony ?? 0.3,
          p.clickRateMin ?? p.clickRate ?? 0.3,
          p.clickRateMax ?? p.clickRate ?? 0.3,
          p.motionMin ?? p.motion ?? 0.5,
          p.motionMax ?? p.motion ?? 0.5
        );
        break;
      }

      case 'insectsEngine':
        w.insects_set_engine(data.engine ?? 0);
        break;

      case 'insectsStart':
        w.insects_start();
        this._insectsActive = true;
        break;

      case 'insectsStop':
        w.insects_stop();
        this._insectsActive = false;
        break;

      case 'insectsSeed':
        w.insects_set_seed(data.seed ?? 12345);
        break;

      // ── Insects Layer 2 ──
      case 'insects2Params': {
        const p = data.params || data;
        w.insects2_set_params(
          p.densityMin ?? p.density ?? 0.5,
          p.densityMax ?? p.density ?? 0.5,
          p.temperatureMin ?? p.temperature ?? 0.5,
          p.temperatureMax ?? p.temperature ?? 0.5,
          p.distanceMin ?? p.distance ?? 0.3,
          p.distanceMax ?? p.distance ?? 0.3,
          p.proximityMin ?? p.proximity ?? 0.5,
          p.proximityMax ?? p.proximity ?? 0.5,
          p.antiphonyMin ?? p.antiphony ?? 0.3,
          p.antiphonyMax ?? p.antiphony ?? 0.3,
          p.clickRateMin ?? p.clickRate ?? 0.3,
          p.clickRateMax ?? p.clickRate ?? 0.3,
          p.motionMin ?? p.motion ?? 0.5,
          p.motionMax ?? p.motion ?? 0.5
        );
        break;
      }

      case 'insects2Engine':
        w.insects2_set_engine(data.engine ?? 0);
        break;

      case 'insects2Start':
        w.insects2_start();
        this._insects2Active = true;
        break;

      case 'insects2Stop':
        w.insects2_stop();
        this._insects2Active = false;
        break;

      case 'insects2Seed':
        w.insects2_set_seed(data.seed ?? 12345);
        break;

      // Per-layer gain control
      case 'insectsGain':
        this._insects1Gain = data.gain ?? 1.0;
        break;

      case 'insects2Gain':
        this._insects2Gain = data.gain ?? 1.0;
        break;

      case 'oceanParams': {
        const p = data.params || data;
        w.ocean_set_params(
          p.intensity ?? 0.5,
          p.waveDurationMin ?? 4,
          p.waveDurationMax ?? 10,
          p.waveIntervalMin ?? 5,
          p.waveIntervalMax ?? 12,
          p.wave2OffsetMin ?? 2,
          p.wave2OffsetMax ?? 6,
          p.foamMin ?? 0.2,
          p.foamMax ?? 0.5,
          p.depthMin ?? 0.3,
          p.depthMax ?? 0.7
        );
        break;
      }

      case 'oceanStart':
        w.ocean_start();
        this._oceanActive = true;
        break;

      case 'oceanStop':
        w.ocean_stop();
        this._oceanActive = false;
        break;

      case 'oceanSeed':
        w.ocean_set_seed(data.seed ?? 12345);
        break;

      case 'enablePerf':
        this._perfEnabled = !!data.enabled;
        this._perfTotalTime = 0;
        this._perfPeakTime = 0;
        this._perfOverBudgetCount = 0;
        this._perfBlockCount = 0;
        this._perfCount = 0;
        this._perfSamplesSinceReport = 0;
        this._perfWaterPeak = 0;
        this._perfInsectsPeak = 0;
        this._perfOceanPeak = 0;
        break;
    }
  }

  process(inputs, outputs, parameters) {
    if (!this._ready || !this._wasm) return true;

    const out = outputs[0];
    if (!out || out.length < 2) return true;

    const outL = out[0];
    const outR = out[1];
    const blockSize = outL.length;

    // If multiple outputs requested, route engines to separate outputs
    const hasSeparateInsectsOut = outputs.length >= 2 && outputs[1] && outputs[1].length >= 2;
    const insOutL = hasSeparateInsectsOut ? outputs[1][0] : outL;
    const insOutR = hasSeparateInsectsOut ? outputs[1][1] : outR;

    const hasSeparateOceanOut = outputs.length >= 3 && outputs[2] && outputs[2].length >= 2;
    const oceanOutL = hasSeparateOceanOut ? outputs[2][0] : outL;
    const oceanOutR = hasSeparateOceanOut ? outputs[2][1] : outR;

    const t0 = this._perfEnabled ? _perfNow() : 0;

    // ── Process water engine ──
    let waterMs = 0;
    if (this._waterActive) {
      const tw0 = this._perfEnabled ? _perfNow() : 0;
      this._wasm.water_process_block(blockSize);
      if (this._perfEnabled) waterMs = _perfNow() - tw0;
      const heap = this._getF32();
      const wOff = this._waterOutPtr >> 2;
      for (let i = 0; i < blockSize; i++) {
        outL[i] += heap[wOff + i * 2];
        outR[i] += heap[wOff + i * 2 + 1];
      }
    }

    // ── Process insects engine ──
    let insects1Ms = 0;
    if (this._insectsActive) {
      const ti0 = this._perfEnabled ? _perfNow() : 0;
      this._wasm.insects_process_block(blockSize);
      if (this._perfEnabled) insects1Ms = _perfNow() - ti0;
      const heap = this._getF32();
      const iOff = this._insectsOutPtr >> 2;
      const g1 = this._insects1Gain;
      for (let i = 0; i < blockSize; i++) {
        insOutL[i] += heap[iOff + i * 2] * g1;
        insOutR[i] += heap[iOff + i * 2 + 1] * g1;
      }
    }

    // ── Process insects engine 2 (dual layer) ──
    let insects2Ms = 0;
    if (this._insects2Active) {
      const ti20 = this._perfEnabled ? _perfNow() : 0;
      this._wasm.insects2_process_block(blockSize);
      if (this._perfEnabled) insects2Ms = _perfNow() - ti20;
      const heap = this._getF32();
      const i2Off = this._insects2OutPtr >> 2;
      const g2 = this._insects2Gain;
      for (let i = 0; i < blockSize; i++) {
        insOutL[i] += heap[i2Off + i * 2] * g2;
        insOutR[i] += heap[i2Off + i * 2 + 1] * g2;
      }
    }

    // ── Process ocean engine ──
    let oceanMs = 0;
    if (this._oceanActive) {
      const to0 = this._perfEnabled ? _perfNow() : 0;
      this._wasm.ocean_process_block(blockSize);
      if (this._perfEnabled) oceanMs = _perfNow() - to0;
      const heap = this._getF32();
      const oOff = this._oceanOutPtr >> 2;
      for (let i = 0; i < blockSize; i++) {
        oceanOutL[i] += heap[oOff + i * 2];
        oceanOutR[i] += heap[oOff + i * 2 + 1];
      }
    }

    // ── Perf reporting ──
    if (this._perfEnabled) {
      const elapsed = _perfNow() - t0;
      const budgetMs = (blockSize / sampleRate) * 1000;
      const insectsMs = insects1Ms + insects2Ms;
      this._perfTotalTime += elapsed;
      this._perfPeakTime = Math.max(this._perfPeakTime, elapsed);
      if (elapsed > budgetMs) this._perfOverBudgetCount++;
      this._perfBlockCount++;
      this._perfCount++;
      this._perfSamplesSinceReport += blockSize;

      // Accumulate per-engine totals
      this._perfWaterTotal = (this._perfWaterTotal || 0) + waterMs;
      this._perfInsects1Total = (this._perfInsects1Total || 0) + insects1Ms;
      this._perfInsects2Total = (this._perfInsects2Total || 0) + insects2Ms;
      this._perfOceanTotal = (this._perfOceanTotal || 0) + oceanMs;
      this._perfWaterPeak = Math.max(this._perfWaterPeak || 0, waterMs);
      this._perfInsectsPeak = Math.max(this._perfInsectsPeak || 0, insectsMs);
      this._perfOceanPeak = Math.max(this._perfOceanPeak || 0, oceanMs);

      if (this._perfSamplesSinceReport >= this._perfReportInterval) {
        const avgMs = this._perfTotalTime / this._perfCount;
        const cnt = this._perfCount;
        this.port.postMessage({
          type: 'perf',
          avgMs: avgMs,
          budgetMs: budgetMs,
          load: avgMs / budgetMs,
          peakMs: this._perfPeakTime,
          missPercent: this._perfBlockCount > 0 ? (this._perfOverBudgetCount / this._perfBlockCount) * 100 : 0,
          waterMs: this._perfWaterTotal / cnt,
          waterPeakMs: this._perfWaterPeak,
          insectsMs: (this._perfInsects1Total + this._perfInsects2Total) / cnt,
          insectsPeakMs: this._perfInsectsPeak,
          oceanMs: this._perfOceanTotal / cnt,
          oceanPeakMs: this._perfOceanPeak,
        });
        this._perfTotalTime = 0;
        this._perfPeakTime = 0;
        this._perfOverBudgetCount = 0;
        this._perfBlockCount = 0;
        this._perfCount = 0;
        this._perfSamplesSinceReport = 0;
        this._perfWaterTotal = 0;
        this._perfInsects1Total = 0;
        this._perfInsects2Total = 0;
        this._perfOceanTotal = 0;
        this._perfWaterPeak = 0;
        this._perfInsectsPeak = 0;
        this._perfOceanPeak = 0;
      }
    }

    // Keep stats generation disabled unless perf reporting is explicitly enabled.
    if (this._perfEnabled) {
      this._statsCounter += blockSize;
      if (this._statsCounter >= this._statsInterval) {
        this._statsCounter = 0;

        if (this._waterActive) {
          this.port.postMessage({
            type: 'waterStats',
            activeVoices: this._wasm.water_get_active_voices(),
            eventsPerSec: this._wasm.water_get_events_per_sec(),
          });
        }
        if (this._insectsActive) {
          this.port.postMessage({
            type: 'insectsStats',
            activeVoices: this._wasm.insects_get_active_voices(),
            engineType: this._wasm.insects_get_engine_type(),
          });
        }
        if (this._insects2Active) {
          this.port.postMessage({
            type: 'insects2Stats',
            activeVoices: this._wasm.insects2_get_active_voices(),
            engineType: this._wasm.insects2_get_engine_type(),
          });
        }
      }
    }

    return true;
  }
}

registerProcessor('soundscapes-wasm', SoundscapesWasmProcessor);
