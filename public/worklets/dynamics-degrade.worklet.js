const MAX_BLOCK_SIZE = 128;

class DynamicsDegradeProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'enabled', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'mix', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'alias', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'generation', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'corrosion', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'wear', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor(options) {
    super();
    this.wasm = null;
    this.heap = new Float32Array(0);
    this.inputPtr = 0;
    this.outputPtr = 0;
    this.ready = false;
    this.initWasm(options?.processorOptions?.wasmBinary).catch((error) => {
      console.warn('[DynamicsDegrade-WASM] Init failed, using pass-through:', error);
    });
  }

  async initWasm(wasmBinary) {
    if (!wasmBinary) throw new Error('Missing kessho_dynamics_degrade.wasm binary');

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
    const result = exports.dynamics_degrade_init(sampleRate);
    if (result !== 0) throw new Error(`C++ init returned ${result}`);

    this.wasm = exports;
    this.inputPtr = exports.dynamics_degrade_get_input_ptr();
    this.outputPtr = exports.dynamics_degrade_get_output_ptr();
    this.ready = true;
    this.port.postMessage({ type: 'wasmReady' });
  }

  getHeapF32() {
    const buffer = this.wasm.memory.buffer;
    if (this.heap.buffer !== buffer) {
      this.heap = new Float32Array(buffer);
    }
    return this.heap;
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

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    if (!this.ready || !this.wasm) {
      this.passThrough(inputs, outputs);
      return true;
    }

    const input = inputs[0];
    const frameCount = output[0]?.length || 128;
    const heap = this.getHeapF32();
    const inOffset = this.inputPtr >> 2;
    const outOffset = this.outputPtr >> 2;
    const inL = input?.[0];
    const inR = input?.[1] ?? inL;

    this.wasm.dynamics_degrade_set_params(
      (parameters.enabled?.[0] ?? 0) > 0.5 ? 1 : 0,
      parameters.mix?.[0] ?? 0,
      parameters.alias?.[0] ?? 0,
      parameters.generation?.[0] ?? 0,
      parameters.corrosion?.[0] ?? 0,
      parameters.wear?.[0] ?? 0,
    );

    const outL = output[0];
    const outR = output[1] ?? outL;
    for (let offset = 0; offset < frameCount; offset += MAX_BLOCK_SIZE) {
      const blockSize = Math.min(MAX_BLOCK_SIZE, frameCount - offset);
      if (inL) {
        for (let i = 0; i < blockSize; i++) {
          const srcIndex = offset + i;
          heap[inOffset + i * 2] = inL[srcIndex] || 0;
          heap[inOffset + i * 2 + 1] = inR ? (inR[srcIndex] || 0) : (inL[srcIndex] || 0);
        }
      } else {
        heap.fill(0, inOffset, inOffset + blockSize * 2);
      }

      this.wasm.dynamics_degrade_process_block(blockSize);

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
  registerProcessor('dynamics-degrade', DynamicsDegradeProcessor);
} catch (error) {
  if (error?.name !== 'NotSupportedError') throw error;
}
