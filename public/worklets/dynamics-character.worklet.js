const MAX_BLOCK_SIZE = 128;

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
];

class DynamicsCharacterProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.wasm = null;
    this.heap = new Float32Array(0);
    this.inputPtr = 0;
    this.outputPtr = 0;
    this.paramsPtr = 0;
    this.ready = false;
    this.pendingParams = null;
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
    if (data.type === 'destroy') {
      if (this.wasm && this.ready) {
        try { this.wasm.dynamics_character_destroy(); } catch { /* noop */ }
      }
      this.ready = false;
      this.wasm = null;
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
    const heap = this.getHeapF32();
    const offset = this.paramsPtr >> 2;
    for (let i = 0; i < PARAM_ORDER.length; i++) {
      const value = Number(params[PARAM_ORDER[i]]);
      heap[offset + i] = Number.isFinite(value) ? value : 0;
    }
    this.wasm.dynamics_character_commit_params();
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
    if (!this.ready || !this.wasm) {
      this.passThrough(inputs, outputs);
      return true;
    }

    const input = inputs[0];
    const inL = input?.[0];
    const inR = input?.[1] ?? inL;
    const outL = output[0];
    const outR = output[1] ?? outL;
    const frameCount = outL?.length || 128;
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

      for (let i = 0; i < blockSize; i++) {
        const dstIndex = offset + i;
        outL[dstIndex] = heap[outOffset + i * 2];
        if (outR !== outL) outR[dstIndex] = heap[outOffset + i * 2 + 1];
      }
    }

    return true;
  }
}

try {
  registerProcessor('dynamics-character', DynamicsCharacterProcessor);
} catch (error) {
  if (error?.name !== 'NotSupportedError') throw error;
}
