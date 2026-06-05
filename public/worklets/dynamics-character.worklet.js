const MAX_BLOCK_SIZE = 128;
const _perfNow = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();

const PARAM_ORDER = [
  'active',
  'allpassActive',
  'dry',
  'wet',
  'degradeMix',
  'workletAlias',
  'rawDegradeGeneration',
  'rawCorrosion',
  'rawMediaWear',
  'noiseGain',
  'jitterDepth',
  'randomDriftFilterHz',
  'randomDriftDepth',
  'baseDelay',
  'spreadBaseDelay',
  'randomDrift',
  'randomHoldRateHz',
  'randomHoldLag',
  'randomDelayDepth',
  'randomSpreadDelayDepth',
  'randomFilterDepth',
  'randomSpreadFilterDepth',
  'depth',
  'rate',
  'shallowFlavor',
  'abyssFlavor',
  'stereo',
  'damage',
  'mainPan',
  'spreadPan',
  'mainDelayGain',
  'spreadDelayGain',
  'wowFrequency',
  'flutterFrequency',
  'flutterRandomDepth',
  'wowDepth',
  'flutterDepth',
  'highpassHz',
  'highpassQ',
  'allpassAFrequency',
  'allpassAQ',
  'allpassBFrequency',
  'allpassBQ',
  'headBumpFrequency',
  'headBumpQ',
  'headBumpGain',
  'dropoutFilterHz',
  'dropoutDepth',
  'dropoutGain',
  'envFilterHz',
  'envToLowpassGain',
  'envToResonanceGain',
  'envToWetGain',
  'lowpassHz',
  'lowpassQ',
  'lowpassStage2Hz',
  'lowpassStage2Q',
  'compressorThreshold',
  'compressorKnee',
  'compressorRatio',
  'compressorAttack',
  'compressorRelease',
  'compressorMakeup',
  'saturation',
  'corrosion',
  'masterSatActive',
  'masterSatMode',
  'masterSatDrive',
  'masterSatTone',
  'masterSatBias',
  'endCompActive',
  'endCompThreshold',
  'endCompKnee',
  'endCompRatio',
  'endCompAttack',
  'endCompRelease',
  'endCompMakeup',
  'endCompMix',
  'endCompDetectorHpHz',
  'endCompDetectorTilt',
  'endCompAutoMakeup',
  'endCompProgramRelease',
  'characterQuality',
  'characterAntiComb',
  'characterDiffusion',
  'degradeUiMix',
  'degradeColorInfluence',
  'degradeMotionInfluence',
  'degradeFailureInfluence',
  'degradeQuality',
  'degradeEventAmount',
  'degradeProfileAmount',
  'degradeDitherAmount',
  'endCompMode',
  'endCompPeakBlend',
  'endCompClarity',
  'endCompTwoBandAmount',
  'endCompBandSplitHz',
  'masterSatQuality',
];

const TELEMETRY_ORDER = [
  'inputPeak',
  'outputPeak',
  'wetPeak',
  'characterEnv',
  'characterReductionDb',
  'dropoutGain',
  'endInputPeak',
  'endOutputPeak',
  'endReductionDb',
  'endDetectorDb',
  'characterCombRisk',
  'characterMinDelayMs',
  'characterDiffusion',
  'degradeEventEnv',
  'degradeEventGainDb',
  'degradeProfileAmount',
  'endLowReductionDb',
  'endHighReductionDb',
  'endClarityBoostDb',
  'endBandSplitHz',
  'endCompMode',
  'masterSatOversamplingFactor',
];

class DynamicsCharacterProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.wasm = null;
    this.heap = new Float32Array(0);
    this.inputPtr = 0;
    this.outputPtr = 0;
    this.paramsPtr = 0;
    this.telemetryPtr = 0;
    this.ready = false;
    this.pendingParams = null;
    this.currentParams = null;
    this.perfEnabled = false;
    this.perfTotalTime = 0;
    this.perfPeakTime = 0;
    this.perfOverBudgetCount = 0;
    this.perfBlockCount = 0;
    this.perfCount = 0;
    this.perfSamplesSinceReport = 0;
    this.perfReportInterval = Math.floor(sampleRate * 0.5);
    this.telemetrySamplesSinceReport = 0;
    this.telemetryReportInterval = Math.max(128, Math.floor(sampleRate / 30));
    this.telemetryAccum = this.createTelemetryAccum();
    this.port.onmessage = (event) => this.handleMessage(event.data);
    this.initWasm(options?.processorOptions?.wasmBinary).catch((error) => {
      console.warn('[DynamicsCharacter-WASM] Init failed, using pass-through:', error);
    });
  }

  async initWasm(wasmBinary) {
    if (!wasmBinary) throw new Error('Missing kessho_dynamics_character.wasm binary');

    const module = await WebAssembly.compile(wasmBinary);
    const instance = await WebAssembly.instantiate(module, {
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
    });

    const exports = instance.exports;
    const result = exports.dynamics_character_init(sampleRate);
    if (result !== 0) throw new Error(`C++ init returned ${result}`);

    this.wasm = exports;
    this.inputPtr = exports.dynamics_character_get_input_ptr();
    this.outputPtr = exports.dynamics_character_get_output_ptr();
    this.paramsPtr = exports.dynamics_character_get_params_ptr();
    this.telemetryPtr = exports.dynamics_character_get_telemetry_ptr();
    this.ready = true;
    this.port.postMessage({ type: 'wasmReady' });
    if (this.pendingParams) {
      this.applyParams(this.pendingParams);
      this.pendingParams = null;
    }
  }

  handleMessage(data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'params') {
      if (this.ready) this.applyParams(data.params || {});
      else this.pendingParams = { ...(this.pendingParams || {}), ...(data.params || {}) };
      return;
    }
    if (data.type === 'reset') {
      if (this.wasm && this.ready && typeof this.wasm.dynamics_character_reset === 'function') {
        this.wasm.dynamics_character_reset(sampleRate);
        this.inputPtr = this.wasm.dynamics_character_get_input_ptr();
        this.outputPtr = this.wasm.dynamics_character_get_output_ptr();
        this.paramsPtr = this.wasm.dynamics_character_get_params_ptr();
        this.telemetryPtr = this.wasm.dynamics_character_get_telemetry_ptr();
        if (this.currentParams) this.applyParams(this.currentParams);
        this.resetTelemetryAccum();
      }
      return;
    }
    if (data.type === 'destroy') {
      if (this.wasm && this.ready) {
        try { this.wasm.dynamics_character_destroy(); } catch { /* noop */ }
      }
      this.ready = false;
      this.wasm = null;
      return;
    }
    if (data.type === 'enablePerf') {
      this.perfEnabled = !!data.enabled;
      this.perfTotalTime = 0;
      this.perfPeakTime = 0;
      this.perfOverBudgetCount = 0;
      this.perfBlockCount = 0;
      this.perfCount = 0;
      this.perfSamplesSinceReport = 0;
    }
  }

  getHeapF32() {
    const buffer = this.wasm.memory.buffer;
    if (this.heap.buffer !== buffer) {
      this.heap = new Float32Array(buffer);
    }
    return this.heap;
  }

  applyParams(params) {
    if (!this.wasm || !this.ready) return;
    this.currentParams = { ...params };
    const heap = this.getHeapF32();
    const offset = this.paramsPtr >> 2;
    for (let i = 0; i < PARAM_ORDER.length; i++) {
      const value = Number(params[PARAM_ORDER[i]]);
      heap[offset + i] = Number.isFinite(value) ? value : 0;
    }
    this.wasm.dynamics_character_commit_params();
  }

  createTelemetryAccum() {
    return {
      inputPeak: 0,
      outputPeak: 0,
      wetPeak: 0,
      characterEnv: 0,
      characterReductionDb: 0,
      dropoutGain: 1,
      endInputPeak: 0,
      endOutputPeak: 0,
      endReductionDb: 0,
      endDetectorDb: -120,
      characterCombRisk: 0,
      characterMinDelayMs: 0,
      characterDiffusion: 0,
      degradeEventEnv: 0,
      degradeEventGainDb: 0,
      degradeProfileAmount: 0,
      endLowReductionDb: 0,
      endHighReductionDb: 0,
      endClarityBoostDb: 0,
      endBandSplitHz: 170,
      endCompMode: 0,
      masterSatOversamplingFactor: 1,
    };
  }

  resetTelemetryAccum() {
    this.telemetryAccum = this.createTelemetryAccum();
  }

  accumulateTelemetry() {
    if (!this.telemetryPtr) return;
    const heap = this.getHeapF32();
    const offset = this.telemetryPtr >> 2;
    for (let i = 0; i < TELEMETRY_ORDER.length; i++) {
      const key = TELEMETRY_ORDER[i];
      const value = Number(heap[offset + i]);
      if (!Number.isFinite(value)) continue;
      if (key === 'dropoutGain') {
        this.telemetryAccum.dropoutGain = Math.min(this.telemetryAccum.dropoutGain, value);
      } else if (key === 'degradeEventGainDb') {
        this.telemetryAccum.degradeEventGainDb = Math.min(this.telemetryAccum.degradeEventGainDb, value);
      } else if (key === 'endDetectorDb') {
        this.telemetryAccum.endDetectorDb = Math.max(this.telemetryAccum.endDetectorDb, value);
      } else if (key === 'endBandSplitHz' || key === 'endCompMode') {
        this.telemetryAccum[key] = value;
      } else if (key === 'masterSatOversamplingFactor') {
        this.telemetryAccum.masterSatOversamplingFactor = Math.max(this.telemetryAccum.masterSatOversamplingFactor, value);
      } else {
        this.telemetryAccum[key] = Math.max(this.telemetryAccum[key], Math.max(0, value));
      }
    }
  }

  reportTelemetry(blockSize) {
    if (!this.telemetryPtr) return;
    this.telemetrySamplesSinceReport += blockSize;
    if (this.telemetrySamplesSinceReport < this.telemetryReportInterval) return;
    this.port.postMessage({
      type: 'dynamicsTelemetry',
      ...this.telemetryAccum,
    });
    this.telemetrySamplesSinceReport = 0;
    this.resetTelemetryAccum();
  }

  reportPerf(perfStart, blockSize) {
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
        name: 'dynamics-character',
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

  passThrough(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || output.length === 0) return;
    for (let channel = 0; channel < output.length; channel++) {
      const source = input?.[channel] ?? input?.[0];
      if (source) output[channel].set(source);
      else output[channel].fill(0);
    }
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const frameCount = output[0]?.length || 128;
    const perfStart = this.perfEnabled ? _perfNow() : 0;
    if (!this.ready || !this.wasm) {
      this.passThrough(inputs, outputs);
      this.resetTelemetryAccum();
      this.reportPerf(perfStart, frameCount);
      return true;
    }

    const input = inputs[0];
    const inL = input?.[0];
    const inR = input?.[1] ?? inL;
    const outL = output[0];
    const outR = output[1] ?? outL;
    const heap = this.getHeapF32();
    const inOffset = this.inputPtr >> 2;
    const outOffset = this.outputPtr >> 2;

    for (let offset = 0; offset < frameCount; offset += MAX_BLOCK_SIZE) {
      const blockSize = Math.min(MAX_BLOCK_SIZE, frameCount - offset);
      for (let i = 0; i < blockSize; i++) {
        const srcIndex = offset + i;
        const left = inL ? (inL[srcIndex] || 0) : 0;
        const right = inR ? (inR[srcIndex] || 0) : left;
        heap[inOffset + i * 2] = left;
        heap[inOffset + i * 2 + 1] = right;
      }

      this.wasm.dynamics_character_process_block(blockSize);
      this.accumulateTelemetry();

      for (let i = 0; i < blockSize; i++) {
        const dstIndex = offset + i;
        outL[dstIndex] = heap[outOffset + i * 2];
        if (outR !== outL) outR[dstIndex] = heap[outOffset + i * 2 + 1];
      }
    }

    this.reportTelemetry(frameCount);
    this.reportPerf(perfStart, frameCount);
    return true;
  }
}

try {
  registerProcessor('dynamics-character', DynamicsCharacterProcessor);
} catch (error) {
  if (error?.name !== 'NotSupportedError') throw error;
}
