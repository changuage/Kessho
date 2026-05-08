import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const coreWasmPath = resolve(root, 'public/worklets/kessho_core.wasm');
const sampleRate = 48000;
const blockSize = 128;
const moduleTypeDelayA = 10;
const paramCount = 16;
const outputTapCount = 4;
const pi = Math.PI;
const mergerDownmixGain = 0.75;
const compressorLookaheadFrames = Math.round(sampleRate * 0.006);
const rmsTolerance = 6e-6;
const peakTolerance = 2.5e-4;

// Internal module regression only. Browser sonic parity is covered by
// core:browser-sonic-parity once Playwright is installed locally.

const params = {
  enabled: 0,
  timeLeftMs: 1,
  timeRightMs: 2,
  feedback: 3,
  mix: 4,
  filterHz: 5,
  filterType: 6,
  reverbSend: 7,
  modRateHz: 8,
  modDepthMs: 9,
  pingPong: 10,
  duck: 11,
  width: 12,
  toDelayB: 13,
  crossFeedFilterHz: 14,
  granularSend: 15,
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function wasmImports() {
  return {
    env: {
      emscripten_notify_memory_growth: () => {},
      abort: () => {},
    },
    wasi_snapshot_preview1: {
      fd_write: () => 0,
      fd_seek: () => 0,
      fd_close: () => 0,
      proc_exit: () => {},
      environ_get: () => 0,
      environ_sizes_get: () => 0,
      clock_time_get: () => 0,
    },
  };
}

async function instantiateWasm(path) {
  if (!existsSync(path)) {
    throw new Error(`Missing ${path}; run npm run core:build:wasm first.`);
  }
  const module = await WebAssembly.compile(readFileSync(path));
  return WebAssembly.instantiate(module, wasmImports());
}

function requireExport(exports, name) {
  const fn = exports[name] || exports[`_${name}`];
  if (typeof fn !== 'function') throw new Error(`Missing WASM export: ${name}`);
  return fn;
}

function makeParams(overrides = {}) {
  const values = new Float32Array(paramCount);
  values[params.enabled] = 1;
  values[params.timeLeftMs] = 10;
  values[params.timeRightMs] = 17;
  values[params.feedback] = 0.38;
  values[params.mix] = 0.62;
  values[params.filterHz] = 3200;
  values[params.filterType] = 0;
  values[params.reverbSend] = 0.3;
  values[params.modRateHz] = 0;
  values[params.modDepthMs] = 0;
  values[params.pingPong] = 0;
  values[params.duck] = 0;
  values[params.width] = 0.65;
  values[params.toDelayB] = 0.2;
  values[params.crossFeedFilterHz] = 5000;
  values[params.granularSend] = 0.15;
  for (const [key, value] of Object.entries(overrides)) {
    values[params[key]] = value;
  }
  return values;
}

function generateInput(blocks, fillInput) {
  const input = new Float32Array(blocks * blockSize * 2);
  for (let block = 0; block < blocks; block += 1) {
    for (let i = 0; i < blockSize; i += 1) {
      const [left, right] = fillInput(block, i);
      const offset = (block * blockSize + i) * 2;
      input[offset] = left;
      input[offset + 1] = right;
    }
  }
  return input;
}

class RbjBiquad {
  constructor() {
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
  }

  lowpass(input, hz, q = 0.7) {
    return this.process(input, this.coefficients('lowpass', hz, q));
  }

  highpass(input, hz, q = 0.7) {
    return this.process(input, this.coefficients('highpass', hz, q));
  }

  bandpass(input, hz, q = 2) {
    return this.process(input, this.coefficients('bandpass', hz, q));
  }

  coefficients(type, hz, q) {
    const bounded = clamp(hz, 20, sampleRate * 0.45);
    const omega = 2 * pi * bounded / sampleRate;
    const sin = Math.sin(omega);
    const cos = Math.cos(omega);
    const alphaQ = sin / (2 * Math.max(0.0001, q));
    const alphaQDb = sin / (2 * Math.pow(10, q / 20));
    const alpha = type === 'bandpass' ? alphaQ : alphaQDb;
    const a0 = 1 + alpha;
    const a1 = -2 * cos;
    const a2 = 1 - alpha;
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;

    if (type === 'highpass') {
      b0 = (1 + cos) * 0.5;
      b1 = -(1 + cos);
      b2 = (1 + cos) * 0.5;
    } else if (type === 'bandpass') {
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
    } else {
      b0 = (1 - cos) * 0.5;
      b1 = 1 - cos;
      b2 = (1 - cos) * 0.5;
    }

    return {
      b0: b0 / a0,
      b1: b1 / a0,
      b2: b2 / a0,
      a1: a1 / a0,
      a2: a2 / a0,
    };
  }

  process(input, coeffs) {
    const output = coeffs.b0 * input + coeffs.b1 * this.x1 + coeffs.b2 * this.x2 - coeffs.a1 * this.y1 - coeffs.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = input;
    this.y2 = this.y1;
    this.y1 = output;
    return output;
  }
}

class DelayLine {
  constructor() {
    this.buffer = new Float32Array(Math.ceil(sampleRate * 5) + 4);
    this.writeIndex = 0;
  }

  read(delaySamples) {
    const bounded = clamp(delaySamples, 1, this.buffer.length - 3);
    let readPos = this.writeIndex - bounded;
    while (readPos < 0) readPos += this.buffer.length;
    const i0 = Math.trunc(readPos) % this.buffer.length;
    const i1 = (i0 + 1) % this.buffer.length;
    const frac = readPos - Math.floor(readPos);
    return this.buffer[i0] * (1 - frac) + this.buffer[i1] * frac;
  }

  write(sample) {
    this.buffer[this.writeIndex] = sample;
    this.writeIndex = (this.writeIndex + 1) % this.buffer.length;
  }
}

class BlockDelay {
  constructor(frames = blockSize) {
    this.buffer = new Float32Array(Math.max(1, frames));
    this.writeIndex = 0;
  }

  process(input) {
    const output = this.buffer[this.writeIndex];
    this.buffer[this.writeIndex] = input;
    this.writeIndex = (this.writeIndex + 1) % this.buffer.length;
    return output;
  }
}

class DelayAReference {
  constructor(paramValues) {
    this.paramValues = paramValues;
    this.delayL0 = new DelayLine();
    this.delayL1 = new DelayLine();
    this.delayR0 = new DelayLine();
    this.delayR1 = new DelayLine();
    this.feedbackDelayL0 = new BlockDelay();
    this.feedbackDelayL1 = new BlockDelay();
    this.feedbackDelayR0 = new BlockDelay();
    this.feedbackDelayR1 = new BlockDelay();
    this.filterL0 = new RbjBiquad();
    this.filterL1 = new RbjBiquad();
    this.filterR0 = new RbjBiquad();
    this.filterR1 = new RbjBiquad();
    this.crossFilterL = new RbjBiquad();
    this.crossFilterR = new RbjBiquad();
    this.outputLatencyL = new BlockDelay(compressorLookaheadFrames);
    this.outputLatencyR = new BlockDelay(compressorLookaheadFrames);
    this.envelope = 0;
    this.modPhase = 0;
    this.commit();
  }

  commit() {
    const p = this.paramValues;
    const enabled = p[params.enabled] > 0.5;
    const baseL = clamp(p[params.timeLeftMs] * 0.001, 0.01, 5);
    const baseR = clamp(p[params.timeRightMs] * 0.001, 0.01, 5);
    const width = clamp(p[params.width], 0, 1);
    const monoBlend = Math.max(0, 1 - width * 2);
    const avgTime = (baseL + baseR) * 0.5;
    let finalL = baseL * (1 - monoBlend) + avgTime * monoBlend;
    let finalR = baseR * (1 - monoBlend) + avgTime * monoBlend;
    if (width > 0.5) finalR = clamp(finalR + (width - 0.5) * 2 * 0.015, 0.01, 5);

    this.state = {
      enabled,
      timeL: finalL,
      timeR: finalR,
      feedback: enabled ? clamp(p[params.feedback], 0, 0.95) : 0,
      mix: enabled ? clamp(p[params.mix], 0, 1) : 0,
      filterHz: clamp(p[params.filterHz], 200, 12000),
      filterType: Math.trunc(clamp(Math.round(p[params.filterType]), 0, 2)),
      reverbSend: enabled ? clamp(p[params.reverbSend], 0, 1) : 0,
      modRateHz: Math.max(0.01, clamp(p[params.modRateHz], 0, 5)),
      modDepthL: enabled ? Math.min(finalL * 0.8, clamp(p[params.modDepthMs], 0, 50) * 0.001) : 0,
      modDepthR: enabled ? Math.min(finalR * 0.8, clamp(p[params.modDepthMs], 0, 50) * 0.001) : 0,
      pingPong: p[params.pingPong] > 0.5,
      duck: enabled ? clamp(p[params.duck], 0, 1) : 0,
      toDelayB: enabled ? clamp(p[params.toDelayB], 0, 1) : 0,
      crossFeedFilterHz: clamp(p[params.crossFeedFilterHz], 200, 12000),
      granularSend: enabled ? clamp(p[params.granularSend], 0, 1) : 0,
    };
  }

  applyFilter(input, filter) {
    if (this.state.filterType === 1) return filter.highpass(input, this.state.filterHz, 0.7);
    if (this.state.filterType === 2) return filter.bandpass(input, this.state.filterHz, 2);
    return filter.lowpass(input, this.state.filterHz, 0.7);
  }

  updateDuck(inputL, inputR) {
    const peak = Math.max(Math.abs(inputL), Math.abs(inputR));
    const normalized = clamp((peak - 0.01) * 4.5, 0, 1);
    if (normalized > this.envelope) {
      this.envelope += (normalized - this.envelope) * 0.4;
    } else {
      this.envelope = this.envelope * 0.9 + normalized * 0.1;
    }
    return 1 - clamp(this.envelope * this.state.duck, 0, 0.92);
  }

  processSample(inputL, inputR) {
    if (!this.state.enabled) {
      this.outputLatencyL.process(0);
      this.outputLatencyR.process(0);
      return [
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0],
      ];
    }

    const mod = Math.sin(this.modPhase);
    this.modPhase += 2 * pi * this.state.modRateHz / sampleRate;
    if (this.modPhase >= 2 * pi) this.modPhase -= 2 * pi;

    const delayedL0 = this.delayL0.read((this.state.timeL + mod * this.state.modDepthL) * sampleRate);
    const delayedL1 = this.delayL1.read((this.state.timeL + mod * this.state.modDepthL) * sampleRate);
    const delayedR0 = this.delayR0.read((this.state.timeR - mod * this.state.modDepthR) * sampleRate);
    const delayedR1 = this.delayR1.read((this.state.timeR - mod * this.state.modDepthR) * sampleRate);
    const filteredL0 = this.applyFilter(delayedL0, this.filterL0);
    const filteredL1 = this.applyFilter(delayedL1, this.filterL1);
    const filteredR0 = this.applyFilter(delayedR0, this.filterR0);
    const filteredR1 = this.applyFilter(delayedR1, this.filterR1);
    const feedbackL0 = this.feedbackDelayL0.process(filteredL0);
    const feedbackL1 = this.feedbackDelayL1.process(filteredL1);
    const feedbackR0 = this.feedbackDelayR0.process(filteredR0);
    const feedbackR1 = this.feedbackDelayR1.process(filteredR1);
    const selfFeedback = this.state.pingPong ? 0 : this.state.feedback;
    const crossFeedback = this.state.pingPong ? this.state.feedback : 0;
    this.delayL0.write(inputL + feedbackL0 * selfFeedback + feedbackR0 * crossFeedback);
    this.delayL1.write(inputR + feedbackL1 * selfFeedback + feedbackR1 * crossFeedback);
    this.delayR0.write(inputL + feedbackR0 * selfFeedback + feedbackL0 * crossFeedback);
    this.delayR1.write(inputR + feedbackR1 * selfFeedback + feedbackL1 * crossFeedback);

    const duckGain = this.state.duck > 0.0001 ? this.updateDuck(inputL, inputR) : 1;
    const filteredL = (filteredL0 + filteredL1) * mergerDownmixGain;
    const filteredR = (filteredR0 + filteredR1) * mergerDownmixGain;
    const limitedL = Math.tanh(filteredL * 1.4) * 0.7142857;
    const limitedR = Math.tanh(filteredR * 1.4) * 0.7142857;
    const outputL = this.outputLatencyL.process(limitedL);
    const outputR = this.outputLatencyR.process(limitedR);
    return [
      [outputL * duckGain * this.state.mix, outputR * duckGain * this.state.mix],
      [outputL * this.state.reverbSend, outputR * this.state.reverbSend],
      [
        this.crossFilterL.lowpass(outputL, this.state.crossFeedFilterHz, 0.7) * this.state.toDelayB,
        this.crossFilterR.lowpass(outputR, this.state.crossFeedFilterHz, 0.7) * this.state.toDelayB,
      ],
      [outputL * this.state.granularSend, outputR * this.state.granularSend],
    ];
  }
}

function renderReference(paramValues, input, blocks, taps = false) {
  const delay = new DelayAReference(paramValues);
  const output = new Float32Array(input.length * (taps ? outputTapCount : 1));
  for (let frame = 0; frame < blocks * blockSize; frame += 1) {
    const sampleOffset = frame * 2;
    const tapFrames = delay.processSample(input[sampleOffset], input[sampleOffset + 1]);
    const buses = taps ? outputTapCount : 1;
    for (let bus = 0; bus < buses; bus += 1) {
      const outputOffset = bus * input.length + sampleOffset;
      output[outputOffset] = tapFrames[bus][0];
      output[outputOffset + 1] = tapFrames[bus][1];
    }
  }
  return output;
}

async function createCoreRenderer() {
  const { exports } = await instantiateWasm(coreWasmPath);
  return { exports };
}

async function renderCoreModule(exports, paramValues, input, blocks, taps = false) {
  const malloc = requireExport(exports, 'malloc');
  const free = requireExport(exports, 'free');
  const moduleCreate = requireExport(exports, 'kessho_module_create');
  const moduleDestroy = requireExport(exports, 'kessho_module_destroy');
  const moduleGetParamCount = requireExport(exports, 'kessho_module_get_param_count');
  const moduleGetParamsPtr = requireExport(exports, 'kessho_module_get_params_ptr');
  const moduleCommitParams = requireExport(exports, 'kessho_module_commit_params');
  const moduleGetOutputTapCount = requireExport(exports, 'kessho_module_get_output_tap_count');
  const moduleProcessInterleaved = requireExport(exports, 'kessho_module_process_interleaved');
  const moduleProcessPlanarStereoTaps = requireExport(exports, 'kessho_module_process_planar_stereo_taps');

  const module = moduleCreate(moduleTypeDelayA, sampleRate, blockSize);
  assert(module !== 0, 'core delay A module setup failed');
  assert(moduleGetParamCount(module) === paramCount, 'core delay A param count mismatch');
  assert(moduleGetOutputTapCount(module) === outputTapCount, 'core delay A output tap count mismatch');

  let heap = new Float32Array(exports.memory.buffer);
  heap.set(paramValues, moduleGetParamsPtr(module) >> 2);
  moduleCommitParams(module);

  const inputPtr = malloc(blockSize * 2 * Float32Array.BYTES_PER_ELEMENT);
  const outputPtr = malloc(blockSize * 2 * Float32Array.BYTES_PER_ELEMENT);
  const planarLPtr = malloc(blockSize * Float32Array.BYTES_PER_ELEMENT);
  const planarRPtr = malloc(blockSize * Float32Array.BYTES_PER_ELEMENT);
  const tapLPtrsPtr = malloc(outputTapCount * 4);
  const tapRPtrsPtr = malloc(outputTapCount * 4);
  const tapLPtrs = [];
  const tapRPtrs = [];
  for (let bus = 0; bus < outputTapCount; bus += 1) {
    tapLPtrs.push(malloc(blockSize * Float32Array.BYTES_PER_ELEMENT));
    tapRPtrs.push(malloc(blockSize * Float32Array.BYTES_PER_ELEMENT));
  }
  assert(inputPtr && outputPtr && planarLPtr && planarRPtr && tapLPtrsPtr && tapRPtrsPtr, 'core allocation failed');
  assert(tapLPtrs.every(Boolean) && tapRPtrs.every(Boolean), 'core tap allocation failed');

  const output = new Float32Array(input.length * (taps ? outputTapCount : 1));
  for (let block = 0; block < blocks; block += 1) {
    const blockOffset = block * blockSize * 2;
    heap = new Float32Array(exports.memory.buffer);
    if (!taps) {
      heap.set(input.subarray(blockOffset, blockOffset + blockSize * 2), inputPtr >> 2);
      assert(moduleProcessInterleaved(module, inputPtr, outputPtr, blockSize) === 1, 'delay A process failed');
      output.set(heap.subarray(outputPtr >> 2, (outputPtr >> 2) + blockSize * 2), blockOffset);
    } else {
      for (let i = 0; i < blockSize; i += 1) {
        heap[(planarLPtr >> 2) + i] = input[blockOffset + i * 2];
        heap[(planarRPtr >> 2) + i] = input[blockOffset + i * 2 + 1];
      }
      const view = new DataView(exports.memory.buffer);
      for (let bus = 0; bus < outputTapCount; bus += 1) {
        view.setUint32(tapLPtrsPtr + bus * 4, tapLPtrs[bus], true);
        view.setUint32(tapRPtrsPtr + bus * 4, tapRPtrs[bus], true);
      }
      assert(
        moduleProcessPlanarStereoTaps(
          module,
          planarLPtr,
          planarRPtr,
          tapLPtrsPtr,
          tapRPtrsPtr,
          outputTapCount,
          blockSize,
        ) === 1,
        'delay A tap process failed',
      );
      heap = new Float32Array(exports.memory.buffer);
      for (let bus = 0; bus < outputTapCount; bus += 1) {
        const busOutputOffset = bus * input.length + blockOffset;
        const tapLOffset = tapLPtrs[bus] >> 2;
        const tapROffset = tapRPtrs[bus] >> 2;
        for (let i = 0; i < blockSize; i += 1) {
          output[busOutputOffset + i * 2] = heap[tapLOffset + i];
          output[busOutputOffset + i * 2 + 1] = heap[tapROffset + i];
        }
      }
    }
  }

  moduleDestroy(module);
  for (const ptr of [inputPtr, outputPtr, planarLPtr, planarRPtr, tapLPtrsPtr, tapRPtrsPtr, ...tapLPtrs, ...tapRPtrs]) {
    free(ptr);
  }
  return output;
}

async function assertDisabledDoesNotPrimeDelay(exports) {
  const malloc = requireExport(exports, 'malloc');
  const free = requireExport(exports, 'free');
  const moduleCreate = requireExport(exports, 'kessho_module_create');
  const moduleDestroy = requireExport(exports, 'kessho_module_destroy');
  const moduleReset = requireExport(exports, 'kessho_module_reset');
  const moduleGetParamsPtr = requireExport(exports, 'kessho_module_get_params_ptr');
  const moduleCommitParams = requireExport(exports, 'kessho_module_commit_params');
  const moduleProcessInterleaved = requireExport(exports, 'kessho_module_process_interleaved');

  const module = moduleCreate(moduleTypeDelayA, sampleRate, blockSize);
  assert(module !== 0, 'core delay A disabled-prime module setup failed');
  const inputPtr = malloc(blockSize * 2 * Float32Array.BYTES_PER_ELEMENT);
  const outputPtr = malloc(blockSize * 2 * Float32Array.BYTES_PER_ELEMENT);
  assert(inputPtr !== 0 && outputPtr !== 0, 'core delay A disabled-prime allocation failed');

  const commit = (values) => {
    const heap = new Float32Array(exports.memory.buffer);
    heap.set(values, moduleGetParamsPtr(module) >> 2);
    moduleCommitParams(module);
  };

  const disabledParams = makeParams({
    enabled: 0,
    timeLeftMs: 10,
    timeRightMs: 10,
    feedback: 0.8,
    mix: 1,
    reverbSend: 1,
    toDelayB: 1,
    granularSend: 1,
  });
  const enabledParams = makeParams({
    enabled: 1,
    timeLeftMs: 10,
    timeRightMs: 10,
    feedback: 0,
    mix: 1,
    reverbSend: 1,
    toDelayB: 1,
    granularSend: 1,
  });

  commit(disabledParams);
  let disabledPeak = 0;
  for (let block = 0; block < 2; block += 1) {
    let heap = new Float32Array(exports.memory.buffer);
    heap.fill(0, inputPtr >> 2, (inputPtr >> 2) + blockSize * 2);
    heap.fill(0, outputPtr >> 2, (outputPtr >> 2) + blockSize * 2);
    if (block === 0) {
      heap[inputPtr >> 2] = 0.8;
      heap[(inputPtr >> 2) + 1] = -0.4;
    }
    assert(moduleProcessInterleaved(module, inputPtr, outputPtr, blockSize) === 1, 'delay A disabled process failed');
    heap = new Float32Array(exports.memory.buffer);
    for (let i = 0; i < blockSize * 2; i += 1) {
      disabledPeak = Math.max(disabledPeak, Math.abs(heap[(outputPtr >> 2) + i]));
    }
  }
  assert(disabledPeak <= 1e-9, `disabled delay A should output silence, peak ${disabledPeak}`);

  commit(enabledParams);
  let primedPeak = 0;
  for (let block = 0; block < 8; block += 1) {
    let heap = new Float32Array(exports.memory.buffer);
    heap.fill(0, inputPtr >> 2, (inputPtr >> 2) + blockSize * 2);
    heap.fill(0, outputPtr >> 2, (outputPtr >> 2) + blockSize * 2);
    assert(moduleProcessInterleaved(module, inputPtr, outputPtr, blockSize) === 1, 'delay A post-enable process failed');
    heap = new Float32Array(exports.memory.buffer);
    for (let i = 0; i < blockSize * 2; i += 1) {
      primedPeak = Math.max(primedPeak, Math.abs(heap[(outputPtr >> 2) + i]));
    }
  }
  assert(primedPeak <= 1e-7, `disabled delay A primed hidden delay memory, peak ${primedPeak}`);

  moduleReset(module);
  let resetPeak = 0;
  for (let block = 0; block < 4; block += 1) {
    let heap = new Float32Array(exports.memory.buffer);
    heap.fill(0, inputPtr >> 2, (inputPtr >> 2) + blockSize * 2);
    heap.fill(0, outputPtr >> 2, (outputPtr >> 2) + blockSize * 2);
    assert(moduleProcessInterleaved(module, inputPtr, outputPtr, blockSize) === 1, 'delay A post-reset process failed');
    heap = new Float32Array(exports.memory.buffer);
    for (let i = 0; i < blockSize * 2; i += 1) {
      resetPeak = Math.max(resetPeak, Math.abs(heap[(outputPtr >> 2) + i]));
    }
  }
  assert(resetPeak <= 1e-7, `delay A reset should clear delay memory, peak ${resetPeak}`);

  moduleDestroy(module);
  free(inputPtr);
  free(outputPtr);
}

function diffStats(a, b) {
  assert(a.length === b.length, 'render lengths differ');
  let sumSq = 0;
  let peak = 0;
  let signalPeak = 0;
  for (let i = 0; i < a.length; i += 1) {
    assert(Number.isFinite(a[i]) && Number.isFinite(b[i]), 'render produced non-finite samples');
    const diff = a[i] - b[i];
    sumSq += diff * diff;
    peak = Math.max(peak, Math.abs(diff));
    signalPeak = Math.max(signalPeak, Math.abs(a[i]), Math.abs(b[i]));
  }
  return { rms: Math.sqrt(sumSq / Math.max(1, a.length)), peak, signalPeak };
}

const cases = [
  {
    name: 'lowpass-stereo-impulse',
    params: makeParams(),
    blocks: 36,
    taps: true,
    input: generateInput(36, (block, i) => block === 0 && i === 0 ? [0.8, -0.35] : [0, 0]),
  },
  {
    name: 'pingpong-modulated-ducked',
    params: makeParams({
      feedback: 0.62,
      pingPong: 1,
      modRateHz: 0.7,
      modDepthMs: 1.5,
      duck: 0.45,
      width: 0.9,
      filterType: 0,
    }),
    blocks: 44,
    taps: false,
    input: generateInput(44, (block, i) => {
      const frame = block * blockSize + i;
      if (frame % 480 === 0) return [0.55, 0.2];
      return [Math.sin(frame * 0.017) * 0.01, Math.sin(frame * 0.013) * 0.008];
    }),
  },
  {
    name: 'highpass-ringing',
    params: makeParams({
      timeLeftMs: 8,
      timeRightMs: 13,
      filterType: 1,
      filterHz: 900,
      feedback: 0.5,
      width: 0.25,
      reverbSend: 0.4,
      toDelayB: 0.35,
      granularSend: 0.3,
    }),
    blocks: 32,
    taps: true,
    input: generateInput(32, (block, i) => {
      const frame = block * blockSize + i;
      return frame < 96 ? [0.25, 0.25] : [0, 0];
    }),
  },
  {
    name: 'send-taps-independent-of-main-mix',
    params: makeParams({
      timeLeftMs: 10,
      timeRightMs: 14,
      feedback: 0.24,
      mix: 0,
      reverbSend: 0.72,
      toDelayB: 0.58,
      granularSend: 0.46,
      crossFeedFilterHz: 4200,
    }),
    blocks: 28,
    taps: true,
    input: generateInput(28, (block, i) => block === 0 && i === 0 ? [0.62, -0.28] : [0, 0]),
  },
  {
    name: 'disabled-silence',
    params: makeParams({ enabled: 0, mix: 1, feedback: 0.8, reverbSend: 1, toDelayB: 1, granularSend: 1 }),
    blocks: 8,
    taps: true,
    input: generateInput(8, (_block, i) => [i % 7 === 0 ? 0.5 : 0, i % 11 === 0 ? -0.3 : 0]),
  },
];

const renderer = await createCoreRenderer();
const moduleSelfCheck = requireExport(renderer.exports, 'kessho_module_self_check');
assert(moduleSelfCheck(moduleTypeDelayA, sampleRate, blockSize) === 1, 'delay A module self-check failed');
await assertDisabledDoesNotPrimeDelay(renderer.exports);
for (const testCase of cases) {
  const expected = renderReference(testCase.params, testCase.input, testCase.blocks, testCase.taps);
  const actual = await renderCoreModule(renderer.exports, testCase.params, testCase.input, testCase.blocks, testCase.taps);
  const stats = diffStats(expected, actual);
  assert(stats.signalPeak > 1e-6 || testCase.name === 'disabled-silence', `${testCase.name} did not produce signal`);
  assert(stats.rms <= rmsTolerance, `${testCase.name} RMS diff too high: ${stats.rms}`);
  assert(stats.peak <= peakTolerance, `${testCase.name} peak diff too high: ${stats.peak}`);
  console.log(
    `${testCase.name}: rms=${stats.rms.toExponential(3)} peak=${stats.peak.toExponential(3)} signal=${stats.signalPeak.toExponential(3)}`,
  );
}

console.log('Delay A module regression passed.');
