import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const standaloneWasmPath = resolve(root, 'public/worklets/kessho_lead_fm.wasm');
const coreWasmPath = resolve(root, 'public/worklets/kessho_core.wasm');
const sampleRate = 48000;
const blockSize = 128;
const moduleTypeLeadFm = 6;

const paramCount = 80;
const paramAlgorithm = 0;
const paramBeatDetune = 1;
const paramCarrier2Mix = 2;
const operatorParamStart = 3;
const operatorParamCount = 10;
const paramAttack = operatorParamStart + 4 * operatorParamCount;
const paramDecay = paramAttack + 1;
const paramSustain = paramAttack + 2;
const paramRelease = paramAttack + 3;
const paramFilterFreq = paramAttack + 4;
const paramFilterQ = paramAttack + 5;
const paramFilterType = paramAttack + 6;
const paramFilterEnvAttack = paramAttack + 7;
const paramFilterEnvDecay = paramAttack + 8;
const paramFilterEnvSustain = paramAttack + 9;
const paramFilterEnvRelease = paramAttack + 10;
const paramFilterEnvDepth = paramAttack + 11;
const paramDrive = paramAttack + 12;
const paramTransientClick = paramAttack + 13;
const paramTransientNoise = paramAttack + 14;
const paramTransientDuration = paramAttack + 15;
const paramTransientDecay = paramAttack + 16;
const paramTransientFilter = paramAttack + 17;
const paramTransientType = paramAttack + 18;
const paramGain = paramAttack + 19;
const paramXLevel = paramAttack + 20;
const paramXPan = paramAttack + 21;
const paramYLevel = paramAttack + 22;
const paramYPan = paramAttack + 23;
const paramLfoRate = paramAttack + 24;
const paramLfoDepth = paramAttack + 25;
const paramLfoTarget = paramAttack + 26;
const paramUnisonVoices = paramAttack + 27;
const paramUnisonDetune = paramAttack + 28;
const paramDelayEnabled = paramAttack + 29;
const paramDelayTimeL = paramAttack + 30;
const paramDelayTimeR = paramAttack + 31;
const paramDelayFeedback = paramAttack + 32;
const paramDelayFilter = paramAttack + 33;
const paramDelayMix = paramAttack + 34;
const paramDelaySend = paramAttack + 35;
const paramOutputSelect = paramAttack + 36;

const opRatio = 0;
const opIndex = 1;
const opDecay = 2;
const opSustain = 3;
const opLevel = 4;
const opFeedback = 5;
const opDetune = 6;
const opEnvRate = 7;
const opModAttack = 8;
const opModDelay = 9;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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
    throw new Error(`Missing ${path}`);
  }
  const module = await WebAssembly.compile(readFileSync(path));
  return WebAssembly.instantiate(module, wasmImports());
}

function requireExport(exports, name) {
  const fn = exports[name] || exports[`_${name}`];
  if (typeof fn !== 'function') {
    throw new Error(`Missing WASM export: ${name}`);
  }
  return fn;
}

function makeDefaultParams() {
  const params = new Float32Array(paramCount);
  params[paramAlgorithm] = 0;
  params[paramBeatDetune] = 0;
  params[paramCarrier2Mix] = 0;

  for (let op = 0; op < 4; op += 1) {
    const base = operatorParamStart + op * operatorParamCount;
    params[base + opRatio] = 1;
    params[base + opIndex] = 0;
    params[base + opDecay] = 0.8;
    params[base + opSustain] = 0.1;
    params[base + opLevel] = 1;
    params[base + opFeedback] = 0;
    params[base + opDetune] = 0;
    params[base + opEnvRate] = 1;
    params[base + opModAttack] = 0;
    params[base + opModDelay] = 0;
  }

  params[paramAttack] = 0.01;
  params[paramDecay] = 0.8;
  params[paramSustain] = 0.3;
  params[paramRelease] = 2;
  params[paramFilterFreq] = 4000;
  params[paramFilterQ] = 0.7;
  params[paramFilterType] = 0;
  params[paramFilterEnvAttack] = 0;
  params[paramFilterEnvDecay] = 0;
  params[paramFilterEnvSustain] = 1;
  params[paramFilterEnvRelease] = 0;
  params[paramFilterEnvDepth] = 0;
  params[paramDrive] = 0;
  params[paramTransientClick] = 0;
  params[paramTransientNoise] = 0;
  params[paramTransientDuration] = 20;
  params[paramTransientDecay] = 50;
  params[paramTransientFilter] = 4000;
  params[paramTransientType] = 0;
  params[paramGain] = 0.34;
  params[paramXLevel] = 1;
  params[paramXPan] = -0.2;
  params[paramYLevel] = 0.9;
  params[paramYPan] = 0.2;
  params[paramLfoRate] = 0;
  params[paramLfoDepth] = 0;
  params[paramLfoTarget] = 0;
  params[paramUnisonVoices] = 1;
  params[paramUnisonDetune] = 0;
  params[paramDelayEnabled] = 0;
  params[paramDelayTimeL] = 0;
  params[paramDelayTimeR] = 0;
  params[paramDelayFeedback] = 0.4;
  params[paramDelayFilter] = 4000;
  params[paramDelayMix] = 0.3;
  params[paramDelaySend] = 0.3;
  params[paramOutputSelect] = 0;
  return params;
}

function withParams(configure) {
  const params = makeDefaultParams();
  configure(params);
  return params;
}

function setOperator(params, op, values) {
  const base = operatorParamStart + op * operatorParamCount;
  for (const [offset, value] of Object.entries(values)) {
    params[base + Number(offset)] = value;
  }
}

function writeCoreParams(heap, ptr, params) {
  heap.set(params, ptr >> 2);
}

function applyStandaloneParams(exports, params) {
  requireExport(exports, 'lead_fm_set_algorithm')(Math.round(params[paramAlgorithm]));
  requireExport(exports, 'lead_fm_set_beat_detune')(params[paramBeatDetune]);
  requireExport(exports, 'lead_fm_set_carrier2_mix')(params[paramCarrier2Mix]);

  for (let op = 0; op < 4; op += 1) {
    const base = operatorParamStart + op * operatorParamCount;
    requireExport(exports, 'lead_fm_set_op_ratio')(op, params[base + opRatio]);
    requireExport(exports, 'lead_fm_set_op_index')(op, params[base + opIndex]);
    requireExport(exports, 'lead_fm_set_op_decay')(op, params[base + opDecay]);
    requireExport(exports, 'lead_fm_set_op_sustain')(op, params[base + opSustain]);
    requireExport(exports, 'lead_fm_set_op_level')(op, params[base + opLevel]);
    requireExport(exports, 'lead_fm_set_op_feedback')(op, params[base + opFeedback]);
    requireExport(exports, 'lead_fm_set_op_detune')(op, params[base + opDetune]);
    requireExport(exports, 'lead_fm_set_op_env_rate')(op, params[base + opEnvRate]);
    requireExport(exports, 'lead_fm_set_op_mod_attack')(op, params[base + opModAttack]);
    requireExport(exports, 'lead_fm_set_op_mod_delay')(op, params[base + opModDelay]);
  }

  requireExport(exports, 'lead_fm_set_attack')(params[paramAttack]);
  requireExport(exports, 'lead_fm_set_decay')(params[paramDecay]);
  requireExport(exports, 'lead_fm_set_sustain')(params[paramSustain]);
  requireExport(exports, 'lead_fm_set_release')(params[paramRelease]);
  requireExport(exports, 'lead_fm_set_filter_freq')(params[paramFilterFreq]);
  requireExport(exports, 'lead_fm_set_filter_q')(params[paramFilterQ]);
  requireExport(exports, 'lead_fm_set_filter_type')(Math.round(params[paramFilterType]));
  requireExport(exports, 'lead_fm_set_filter_env_attack')(params[paramFilterEnvAttack]);
  requireExport(exports, 'lead_fm_set_filter_env_decay')(params[paramFilterEnvDecay]);
  requireExport(exports, 'lead_fm_set_filter_env_sustain')(params[paramFilterEnvSustain]);
  requireExport(exports, 'lead_fm_set_filter_env_release')(params[paramFilterEnvRelease]);
  requireExport(exports, 'lead_fm_set_filter_env_depth')(params[paramFilterEnvDepth]);
  requireExport(exports, 'lead_fm_set_drive')(params[paramDrive]);
  requireExport(exports, 'lead_fm_set_transient_click')(params[paramTransientClick]);
  requireExport(exports, 'lead_fm_set_transient_noise')(params[paramTransientNoise]);
  requireExport(exports, 'lead_fm_set_transient_duration_ms')(params[paramTransientDuration]);
  requireExport(exports, 'lead_fm_set_transient_decay')(params[paramTransientDecay]);
  requireExport(exports, 'lead_fm_set_transient_filter')(params[paramTransientFilter]);
  requireExport(exports, 'lead_fm_set_transient_type')(Math.round(params[paramTransientType]));
  requireExport(exports, 'lead_fm_set_gain')(params[paramGain]);
  requireExport(exports, 'lead_fm_set_x_level')(params[paramXLevel]);
  requireExport(exports, 'lead_fm_set_x_pan')(params[paramXPan]);
  requireExport(exports, 'lead_fm_set_y_level')(params[paramYLevel]);
  requireExport(exports, 'lead_fm_set_y_pan')(params[paramYPan]);
  requireExport(exports, 'lead_fm_set_lfo_rate')(params[paramLfoRate]);
  requireExport(exports, 'lead_fm_set_lfo_depth')(params[paramLfoDepth]);
  requireExport(exports, 'lead_fm_set_lfo_target')(Math.round(params[paramLfoTarget]));
  requireExport(exports, 'lead_fm_set_unison_voices')(Math.round(params[paramUnisonVoices]));
  requireExport(exports, 'lead_fm_set_unison_detune')(params[paramUnisonDetune]);
  requireExport(exports, 'lead_fm_set_delay_enabled')(params[paramDelayEnabled] > 0.5 ? 1 : 0);
  requireExport(exports, 'lead_fm_set_delay_time_l')(params[paramDelayTimeL]);
  requireExport(exports, 'lead_fm_set_delay_time_r')(params[paramDelayTimeR]);
  requireExport(exports, 'lead_fm_set_delay_feedback')(params[paramDelayFeedback]);
  requireExport(exports, 'lead_fm_set_delay_filter')(params[paramDelayFilter]);
  requireExport(exports, 'lead_fm_set_delay_mix')(params[paramDelayMix]);
  requireExport(exports, 'lead_fm_set_delay_send')(params[paramDelaySend]);
}

function copySelected(heap, lead1Offset, lead2Offset, output, outputOffset, frames, select) {
  for (let i = 0; i < frames * 2; i += 1) {
    if (select === 1) {
      output[outputOffset + i] = heap[lead2Offset + i];
    } else if (select === 2) {
      output[outputOffset + i] = heap[lead1Offset + i] + heap[lead2Offset + i];
    } else {
      output[outputOffset + i] = heap[lead1Offset + i];
    }
  }
}

async function renderStandalone(params, notes, blocks) {
  const { exports } = await instantiateWasm(standaloneWasmPath);
  const init = requireExport(exports, 'lead_fm_init');
  const destroy = requireExport(exports, 'lead_fm_destroy');
  const getOutputPtr = requireExport(exports, 'lead_fm_get_output_ptr');
  const getOutput2Ptr = requireExport(exports, 'lead_fm_get_output2_ptr');
  const noteOn = requireExport(exports, 'lead_fm_note_on_ex');
  const processBlock = requireExport(exports, 'lead_fm_process_block');
  const activeCount = requireExport(exports, 'lead_fm_get_active_count');

  assert(init(sampleRate) === 0, 'standalone lead-fm init failed');
  applyStandaloneParams(exports, params);
  for (const note of notes) {
    noteOn(note.frequency, note.velocity, note.hold, note.leadIndex);
  }

  const output = new Float32Array(blocks * blockSize * 2);
  const select = Math.round(params[paramOutputSelect]);
  const lead1Offset = getOutputPtr() >> 2;
  const lead2Offset = getOutput2Ptr() >> 2;
  for (let block = 0; block < blocks; block += 1) {
    processBlock(blockSize);
    const heap = new Float32Array(exports.memory.buffer);
    copySelected(heap, lead1Offset, lead2Offset, output, block * blockSize * 2, blockSize, select);
  }

  const finalActiveCount = activeCount();
  destroy();
  return { output, finalActiveCount };
}

async function renderCoreModule(params, notes, blocks) {
  const { exports } = await instantiateWasm(coreWasmPath);
  const malloc = requireExport(exports, 'malloc');
  const free = requireExport(exports, 'free');
  const moduleCreate = requireExport(exports, 'kessho_module_create');
  const moduleDestroy = requireExport(exports, 'kessho_module_destroy');
  const moduleGetParamCount = requireExport(exports, 'kessho_module_get_param_count');
  const moduleGetParamsPtr = requireExport(exports, 'kessho_module_get_params_ptr');
  const moduleCommitParams = requireExport(exports, 'kessho_module_commit_params');
  const moduleNoteOn = requireExport(exports, 'kessho_module_note_on');
  const moduleGetActiveVoiceCount = requireExport(exports, 'kessho_module_get_active_voice_count');
  const moduleProcessInterleaved = requireExport(exports, 'kessho_module_process_interleaved');

  const module = moduleCreate(moduleTypeLeadFm, sampleRate, blockSize);
  assert(module !== 0, 'core lead-fm module setup failed');
  assert(moduleGetParamCount(module) === paramCount, 'core lead-fm param count mismatch');

  let heap = new Float32Array(exports.memory.buffer);
  writeCoreParams(heap, moduleGetParamsPtr(module), params);
  moduleCommitParams(module);
  for (const note of notes) {
    assert(
      moduleNoteOn(module, note.frequency, note.velocity, note.hold, note.leadIndex) === 1,
      'core lead-fm note-on failed',
    );
  }

  const inputPtr = malloc(blockSize * 2 * Float32Array.BYTES_PER_ELEMENT);
  const outputPtr = malloc(blockSize * 2 * Float32Array.BYTES_PER_ELEMENT);
  assert(inputPtr !== 0 && outputPtr !== 0, 'core lead-fm module allocation failed');
  heap = new Float32Array(exports.memory.buffer);
  const inputOffset = inputPtr >> 2;
  const outputOffset = outputPtr >> 2;
  heap.fill(0, inputOffset, inputOffset + blockSize * 2);

  const output = new Float32Array(blocks * blockSize * 2);
  for (let block = 0; block < blocks; block += 1) {
    heap = new Float32Array(exports.memory.buffer);
    heap.fill(0, outputOffset, outputOffset + blockSize * 2);
    assert(
      moduleProcessInterleaved(module, inputPtr, outputPtr, blockSize) === 1,
      'core lead-fm module process failed',
    );
    output.set(heap.subarray(outputOffset, outputOffset + blockSize * 2), block * blockSize * 2);
  }

  const finalActiveCount = moduleGetActiveVoiceCount(module);
  moduleDestroy(module);
  free(inputPtr);
  free(outputPtr);
  return { output, finalActiveCount };
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

const basicTone = () => withParams((params) => {
  params[paramRelease] = 0.08;
});

const cases = [
  {
    name: 'lead1-basic',
    params: basicTone(),
    notes: [{ frequency: 440, velocity: 0.8, hold: 0.2, leadIndex: 0 }],
    blocks: 24,
  },
  {
    name: 'lead2-basic',
    params: withParams((params) => {
      params[paramOutputSelect] = 1;
      params[paramRelease] = 0.08;
    }),
    notes: [{ frequency: 330, velocity: 0.75, hold: 0.2, leadIndex: 1 }],
    blocks: 24,
  },
  {
    name: 'sum-routing',
    params: withParams((params) => {
      params[paramOutputSelect] = 2;
      params[paramRelease] = 0.08;
      params[paramCarrier2Mix] = 0.3;
    }),
    notes: [
      { frequency: 440, velocity: 0.72, hold: 0.2, leadIndex: 0 },
      { frequency: 554.365, velocity: 0.58, hold: 0.2, leadIndex: 1 },
    ],
    blocks: 24,
  },
  {
    name: 'short-hold-release',
    params: withParams((params) => {
      params[paramRelease] = 0.01;
    }),
    notes: [{ frequency: 392, velocity: 0.82, hold: 0.02, leadIndex: 0 }],
    blocks: 72,
    finalActiveCount: 0,
  },
  {
    name: 'delay-enabled-isolated',
    params: withParams((params) => {
      params[paramOutputSelect] = 1;
      params[paramDelayEnabled] = 1;
      params[paramDelayTimeL] = 240;
      params[paramDelayTimeR] = 360;
      params[paramDelayFeedback] = 0.45;
      params[paramDelayMix] = 0.6;
      params[paramDelaySend] = 0.75;
    }),
    notes: [{ frequency: 440, velocity: 0.8, hold: 0.2, leadIndex: 0 }],
    blocks: 32,
    expectSilent: true,
  },
  {
    name: 'dx17-unison-transient-lfo',
    params: withParams((params) => {
      params[paramAlgorithm] = 4;
      params[paramCarrier2Mix] = 0.35;
      params[paramDrive] = 0.18;
      params[paramTransientClick] = 0.2;
      params[paramTransientNoise] = 0.12;
      params[paramTransientType] = 1;
      params[paramLfoRate] = 2.7;
      params[paramLfoDepth] = 0.22;
      params[paramLfoTarget] = 5;
      params[paramUnisonVoices] = 3;
      params[paramUnisonDetune] = 9;
      params[paramRelease] = 0.08;
      setOperator(params, 0, { [opIndex]: 0.9, [opLevel]: 0.85, [opFeedback]: 0.05 });
      setOperator(params, 1, { [opRatio]: 2, [opIndex]: 0.45, [opLevel]: 0.65 });
      setOperator(params, 2, { [opRatio]: 3, [opIndex]: 0.25, [opLevel]: 0.5 });
    }),
    notes: [{ frequency: 261.626, velocity: 0.9, hold: 0.18, leadIndex: 0 }],
    blocks: 32,
  },
];

const results = [];
for (const testCase of cases) {
  const standalone = await renderStandalone(testCase.params, testCase.notes, testCase.blocks);
  const core = await renderCoreModule(testCase.params, testCase.notes, testCase.blocks);
  const residual = diffStats(standalone.output, core.output);
  assert(
    residual.rms <= 1.0e-7 && residual.peak <= 1.0e-6,
    `${testCase.name} lead-fm module parity drift too high: RMS ${residual.rms}, peak ${residual.peak}`,
  );
  if (testCase.expectSilent) {
    assert(residual.signalPeak <= 1.0e-8, `${testCase.name} should be silent but peaked ${residual.signalPeak}`);
  } else {
    assert(residual.signalPeak > 1.0e-5, `${testCase.name} produced no lead-fm signal`);
  }
  if (testCase.finalActiveCount !== undefined) {
    assert(
      standalone.finalActiveCount === testCase.finalActiveCount,
      `${testCase.name} standalone active count mismatch`,
    );
    assert(core.finalActiveCount === testCase.finalActiveCount, `${testCase.name} core active count mismatch`);
  }
  results.push(
    `${testCase.name}: RMS ${residual.rms.toExponential(3)}, peak ${residual.peak.toExponential(3)}`,
  );
}

console.log(`KesshoCore lead-fm module parity passed: ${results.join('; ')}`);
