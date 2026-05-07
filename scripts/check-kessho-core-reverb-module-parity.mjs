import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const standaloneWasmPath = resolve(root, 'public/worklets/kessho_reverb.wasm');
const standalonePadWasmPath = resolve(root, 'public/worklets/kessho_pad.wasm');
const coreWasmPath = resolve(root, 'public/worklets/kessho_core.wasm');
const sampleRate = 48000;
const blockSize = 128;
const moduleTypeReverb = 3;
const moduleTypePad = 7;

const padCount = 2;
const voicesPerPadModule = 6;
const padParamsPerPad = 53;
const padParamReverbSend = padParamsPerPad * padCount;
const padParamOutputSelect = padParamReverbSend + 1;
const padParamCount = padParamOutputSelect + 1;

const padOscAWave = 0;
const padOscAOctave = 1;
const padOscADetune = 2;
const padOscALevel = 3;
const padOscBWave = 4;
const padOscBOctave = 5;
const padOscBDetune = 6;
const padOscBLevel = 7;
const padOscMix = 8;
const padSubEnabled = 9;
const padSubOctave = 10;
const padSubWave = 11;
const padSubLevel = 12;
const padNoiseType = 13;
const padNoiseLevel = 14;
const padHardness = 15;
const padWarmth = 16;
const padPresence = 17;
const padFoldAmount = 18;
const padFoldMode = 19;
const padFilterType = 20;
const padFilterCutoffMin = 21;
const padFilterCutoffMax = 22;
const padFilterResonance = 23;
const padFilterQ = 24;
const padFilterSlope = 25;
const padFilterKeyTracking = 26;
const padFilterBEnabled = 27;
const padFilterBType = 28;
const padFilterBCutoff = 29;
const padFilterBResonance = 30;
const padFilterBQ = 31;
const padFilterRouting = 32;
const padAttack = 33;
const padDecay = 34;
const padSustain = 35;
const padRelease = 36;
const padLfo1Rate = 37;
const padLfo1Depth = 38;
const padLfo1Wave = 39;
const padLfo1Dest = 40;
const padLfo2Rate = 41;
const padLfo2Depth = 42;
const padLfo2Wave = 43;
const padLfo2Dest = 44;
const padModEnvEnabled = 45;
const padModEnvAttack = 46;
const padModEnvDecay = 47;
const padModEnvSustain = 48;
const padModEnvRelease = 49;
const padModEnvDepth = 50;
const padModEnvDest = 51;
const padLevel = 52;

const padTapReverbSend = 1;
const padTapPrefaderPad1 = 2;
const padTapPrefaderPad2 = 3;

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

function baseReverbParams(overrides = {}) {
  return {
    type: 1,
    quality: 2,
    decay: 0.45,
    size: 0.85,
    damping: 0.5,
    diffusion: 0.62,
    modulation: 0.12,
    predelay: 0,
    width: 0.7,
    shimmerAmount: 0,
    shimmerPitch: 12,
    slowRate: 0.05,
    slowDepth: 0,
    reverseAmount: 0,
    reverseLength: 2,
    chorusRate: 0.24,
    chorusDepth: 4,
    modCharacter: 2,
    dampLow: 0.08,
    dampHigh: 0.34,
    crossover: 900,
    inputTone: 0,
    shimmerFeedback: 0,
    warp: 0,
    crossFeed: 0,
    earlyReflections: 0.45,
    airAbsorption: 0.2,
    saturationMode: 0,
    transientSmooth: 0,
    erLpFreq: 2500,
    ...overrides,
  };
}

const paramOrder = [
  'type',
  'quality',
  'decay',
  'size',
  'damping',
  'diffusion',
  'modulation',
  'predelay',
  'width',
  'shimmerAmount',
  'shimmerPitch',
  'slowRate',
  'slowDepth',
  'reverseAmount',
  'reverseLength',
  'chorusRate',
  'chorusDepth',
  'modCharacter',
  'dampLow',
  'dampHigh',
  'crossover',
  'inputTone',
  'shimmerFeedback',
  'warp',
  'crossFeed',
  'earlyReflections',
  'airAbsorption',
  'saturationMode',
  'transientSmooth',
  'erLpFreq',
];

function writeCoreParams(heap, ptr, params) {
  const offset = ptr >> 2;
  for (let i = 0; i < paramOrder.length; i += 1) {
    heap[offset + i] = Number(params[paramOrder[i]] ?? 0);
  }
}

function padBase(pad) {
  return pad * padParamsPerPad;
}

function makeDefaultPadParams() {
  const params = new Float32Array(padParamCount);
  for (let pad = 0; pad < padCount; pad += 1) {
    const base = padBase(pad);
    params[base + padOscAWave] = 1;
    params[base + padOscAOctave] = 0;
    params[base + padOscADetune] = 0;
    params[base + padOscALevel] = 1;
    params[base + padOscBWave] = 0;
    params[base + padOscBOctave] = 0;
    params[base + padOscBDetune] = 0;
    params[base + padOscBLevel] = 1;
    params[base + padOscMix] = 0.5;
    params[base + padSubEnabled] = 0;
    params[base + padSubOctave] = -1;
    params[base + padSubWave] = 0;
    params[base + padSubLevel] = 0.5;
    params[base + padNoiseType] = 0;
    params[base + padNoiseLevel] = 0;
    params[base + padHardness] = 0;
    params[base + padWarmth] = 0.5;
    params[base + padPresence] = 0.5;
    params[base + padFoldAmount] = 0;
    params[base + padFoldMode] = 0;
    params[base + padFilterType] = 0;
    params[base + padFilterCutoffMin] = 200;
    params[base + padFilterCutoffMax] = 4000;
    params[base + padFilterResonance] = 0;
    params[base + padFilterQ] = 0.7;
    params[base + padFilterSlope] = 12;
    params[base + padFilterKeyTracking] = 0;
    params[base + padFilterBEnabled] = 0;
    params[base + padFilterBType] = 0;
    params[base + padFilterBCutoff] = 2000;
    params[base + padFilterBResonance] = 0;
    params[base + padFilterBQ] = 0.7;
    params[base + padFilterRouting] = 0;
    params[base + padAttack] = 0.1;
    params[base + padDecay] = 0.5;
    params[base + padSustain] = 0.7;
    params[base + padRelease] = 2;
    params[base + padLfo1Rate] = 0;
    params[base + padLfo1Depth] = 0;
    params[base + padLfo1Wave] = 0;
    params[base + padLfo1Dest] = 0;
    params[base + padLfo2Rate] = 0;
    params[base + padLfo2Depth] = 0;
    params[base + padLfo2Wave] = 0;
    params[base + padLfo2Dest] = 0;
    params[base + padModEnvEnabled] = 0;
    params[base + padModEnvAttack] = 0.5;
    params[base + padModEnvDecay] = 1;
    params[base + padModEnvSustain] = 0;
    params[base + padModEnvRelease] = 0.5;
    params[base + padModEnvDepth] = 0;
    params[base + padModEnvDest] = 1;
    params[base + padLevel] = 0.8;
  }
  params[padParamReverbSend] = 0.1;
  params[padParamOutputSelect] = 0;
  return params;
}

function withPadParams(configure) {
  const params = makeDefaultPadParams();
  configure(params);
  return params;
}

function writeCorePadParams(heap, ptr, params) {
  heap.set(params, ptr >> 2);
}

function applyStandalonePadParams(exports, params) {
  const call = (name, ...args) => requireExport(exports, name)(...args);
  for (let pad = 0; pad < padCount; pad += 1) {
    const base = padBase(pad);
    call('pad_set_osc_a_wave', pad, Math.round(params[base + padOscAWave]));
    call('pad_set_osc_a_octave', pad, Math.round(params[base + padOscAOctave]));
    call('pad_set_osc_a_detune', pad, params[base + padOscADetune]);
    call('pad_set_osc_a_level', pad, params[base + padOscALevel]);
    call('pad_set_osc_b_wave', pad, Math.round(params[base + padOscBWave]));
    call('pad_set_osc_b_octave', pad, Math.round(params[base + padOscBOctave]));
    call('pad_set_osc_b_detune', pad, params[base + padOscBDetune]);
    call('pad_set_osc_b_level', pad, params[base + padOscBLevel]);
    call('pad_set_osc_mix', pad, params[base + padOscMix]);
    call('pad_set_sub_enabled', pad, params[base + padSubEnabled] > 0.5 ? 1 : 0);
    call('pad_set_sub_octave', pad, Math.round(params[base + padSubOctave]));
    call('pad_set_sub_wave', pad, Math.round(params[base + padSubWave]));
    call('pad_set_sub_level', pad, params[base + padSubLevel]);
    call('pad_set_noise_type', pad, Math.round(params[base + padNoiseType]));
    call('pad_set_noise_level', pad, params[base + padNoiseLevel]);
    call('pad_set_hardness', pad, params[base + padHardness]);
    call('pad_set_warmth', pad, params[base + padWarmth]);
    call('pad_set_presence', pad, params[base + padPresence]);
    call('pad_set_fold_amount', pad, params[base + padFoldAmount]);
    call('pad_set_fold_mode', pad, Math.round(params[base + padFoldMode]));
    call('pad_set_filter_type', pad, Math.round(params[base + padFilterType]));
    call('pad_set_filter_cutoff_min', pad, params[base + padFilterCutoffMin]);
    call('pad_set_filter_cutoff_max', pad, params[base + padFilterCutoffMax]);
    call('pad_set_filter_resonance', pad, params[base + padFilterResonance]);
    call('pad_set_filter_q', pad, params[base + padFilterQ]);
    call('pad_set_filter_slope', pad, params[base + padFilterSlope]);
    call('pad_set_filter_key_tracking', pad, params[base + padFilterKeyTracking]);
    call('pad_set_filter_b_enabled', pad, params[base + padFilterBEnabled] > 0.5 ? 1 : 0);
    call('pad_set_filter_b_type', pad, Math.round(params[base + padFilterBType]));
    call('pad_set_filter_b_cutoff', pad, params[base + padFilterBCutoff]);
    call('pad_set_filter_b_resonance', pad, params[base + padFilterBResonance]);
    call('pad_set_filter_b_q', pad, params[base + padFilterBQ]);
    call('pad_set_filter_routing', pad, Math.round(params[base + padFilterRouting]));
    call('pad_set_attack', pad, params[base + padAttack]);
    call('pad_set_decay', pad, params[base + padDecay]);
    call('pad_set_sustain', pad, params[base + padSustain]);
    call('pad_set_release', pad, params[base + padRelease]);
    call('pad_set_lfo1_rate', pad, params[base + padLfo1Rate]);
    call('pad_set_lfo1_depth', pad, params[base + padLfo1Depth]);
    call('pad_set_lfo1_wave', pad, Math.round(params[base + padLfo1Wave]));
    call('pad_set_lfo1_dest', pad, Math.round(params[base + padLfo1Dest]));
    call('pad_set_lfo2_rate', pad, params[base + padLfo2Rate]);
    call('pad_set_lfo2_depth', pad, params[base + padLfo2Depth]);
    call('pad_set_lfo2_wave', pad, Math.round(params[base + padLfo2Wave]));
    call('pad_set_lfo2_dest', pad, Math.round(params[base + padLfo2Dest]));
    call('pad_set_mod_env_enabled', pad, params[base + padModEnvEnabled] > 0.5 ? 1 : 0);
    call('pad_set_mod_env_attack', pad, params[base + padModEnvAttack]);
    call('pad_set_mod_env_decay', pad, params[base + padModEnvDecay]);
    call('pad_set_mod_env_sustain', pad, params[base + padModEnvSustain]);
    call('pad_set_mod_env_release', pad, params[base + padModEnvRelease]);
    call('pad_set_mod_env_depth', pad, params[base + padModEnvDepth]);
    call('pad_set_mod_env_dest', pad, Math.round(params[base + padModEnvDest]));
    call('pad_set_level', pad, params[base + padLevel]);
  }
  call('pad_set_reverb_send', params[padParamReverbSend]);
}

function applyStandaloneParams(exports, params) {
  requireExport(exports, 'reverb_set_type')(params.type);
  requireExport(exports, 'reverb_set_quality')(params.quality);
  requireExport(exports, 'reverb_set_params')(
    params.decay,
    params.size,
    params.damping,
    params.diffusion,
    params.modulation,
    params.predelay,
    params.width,
  );
  requireExport(exports, 'reverb_set_shimmer')(params.shimmerAmount, params.shimmerPitch);
  requireExport(exports, 'reverb_set_slow_mod')(params.slowRate, params.slowDepth);
  requireExport(exports, 'reverb_set_reverse')(params.reverseAmount, params.reverseLength);
  requireExport(exports, 'reverb_set_chorus')(params.chorusRate, params.chorusDepth);
  requireExport(exports, 'reverb_set_mod_character')(params.modCharacter);
  requireExport(exports, 'reverb_set_multiband_damp')(params.dampLow, params.dampHigh, params.crossover);
  requireExport(exports, 'reverb_set_input_tone')(params.inputTone);
  requireExport(exports, 'reverb_set_shimmer_feedback')(params.shimmerFeedback);
  requireExport(exports, 'reverb_set_warp')(params.warp);
  requireExport(exports, 'reverb_set_cross_feed')(params.crossFeed);
  requireExport(exports, 'reverb_set_early_reflections')(params.earlyReflections);
  requireExport(exports, 'reverb_set_air_absorption')(params.airAbsorption);
  requireExport(exports, 'reverb_set_saturation_mode')(params.saturationMode);
  requireExport(exports, 'reverb_set_transient_smooth')(params.transientSmooth);
  requireExport(exports, 'reverb_set_er_lp_freq')(params.erLpFreq);
}

function generateInput(blocks, fillInput) {
  const input = new Float32Array(blocks * blockSize * 2);
  for (let block = 0; block < blocks; block += 1) {
    for (let i = 0; i < blockSize; i += 1) {
      const [left, right] = fillInput(block, i);
      const sampleIndex = (block * blockSize + i) * 2;
      input[sampleIndex] = left;
      input[sampleIndex + 1] = right;
    }
  }
  return input;
}

function triggerStandalonePadNotes(exports, notes) {
  const setVoicePad = requireExport(exports, 'pad_set_voice_pad');
  const noteOn = requireExport(exports, 'pad_note_on');
  for (const note of notes) {
    setVoicePad(note.voiceIndex, note.pad);
    noteOn(note.voiceIndex, note.frequency, note.velocity);
  }
}

function runStandalonePadActions(exports, actions, block) {
  if (actions.length === 0) return;
  const noteOff = requireExport(exports, 'pad_note_off');
  for (const action of actions) {
    if (action.block !== block) continue;
    if (action.type === 'noteOff') {
      noteOff(action.voiceIndex);
    } else if (action.type === 'allNotesOff') {
      for (let voice = 0; voice < voicesPerPadModule; voice += 1) {
        noteOff(voice);
      }
    } else {
      throw new Error(`Unknown standalone pad action: ${action.type}`);
    }
  }
}

function triggerCorePadNotes(module, moduleNoteOn, notes) {
  for (const note of notes) {
    const route = note.voiceIndex + note.pad * voicesPerPadModule;
    assert(
      moduleNoteOn(module, note.frequency, note.velocity, 0, route) === 1,
      'core pad note-on failed',
    );
  }
}

function runCorePadActions(module, moduleNoteOff, moduleAllNotesOff, actions, block) {
  if (actions.length === 0) return;
  for (const action of actions) {
    if (action.block !== block) continue;
    if (action.type === 'noteOff') {
      assert(moduleNoteOff(module, action.voiceIndex) === 1, 'core pad note-off failed');
    } else if (action.type === 'allNotesOff') {
      moduleAllNotesOff(module);
    } else {
      throw new Error(`Unknown core pad action: ${action.type}`);
    }
  }
}

async function renderStandalonePadReverbInput(params, notes, actions, blocks) {
  const { exports } = await instantiateWasm(standalonePadWasmPath);
  const init = requireExport(exports, 'pad_init');
  const destroy = requireExport(exports, 'pad_destroy');
  const processBlock = requireExport(exports, 'pad_process_block');
  const getReverbSendPtr = requireExport(exports, 'pad_get_reverb_send_ptr');

  assert(init(sampleRate) === 0, 'standalone pad init failed');
  applyStandalonePadParams(exports, params);
  triggerStandalonePadNotes(exports, notes);

  const reverbSendOffset = getReverbSendPtr() >> 2;
  const output = new Float32Array(blocks * blockSize * 2);
  for (let block = 0; block < blocks; block += 1) {
    runStandalonePadActions(exports, actions, block);
    processBlock(blockSize);
    const heap = new Float32Array(exports.memory.buffer);
    output.set(
      heap.subarray(reverbSendOffset, reverbSendOffset + blockSize * 2),
      block * blockSize * 2,
    );
  }

  destroy();
  return output;
}

async function renderStandalone(params, input, blocks) {
  const { exports } = await instantiateWasm(standaloneWasmPath);
  const init = requireExport(exports, 'reverb_init');
  const getInputPtr = requireExport(exports, 'reverb_get_input_ptr');
  const getOutputPtr = requireExport(exports, 'reverb_get_output_ptr');
  const processBlock = requireExport(exports, 'reverb_process_block');
  const destroy = requireExport(exports, 'reverb_destroy');

  assert(init(sampleRate) === 0, 'standalone reverb init failed');
  let heap = new Float32Array(exports.memory.buffer);
  applyStandaloneParams(exports, params);

  const inputPtr = getInputPtr() >> 2;
  const outputPtr = getOutputPtr() >> 2;
  const output = new Float32Array(input.length);

  for (let block = 0; block < blocks; block += 1) {
    const blockOffset = block * blockSize * 2;
    heap = new Float32Array(exports.memory.buffer);
    heap.set(input.subarray(blockOffset, blockOffset + blockSize * 2), inputPtr);
    processBlock(blockSize);
    output.set(heap.subarray(outputPtr, outputPtr + blockSize * 2), blockOffset);
  }

  destroy();
  return output;
}

async function renderCoreModule(params, input, blocks) {
  const { exports } = await instantiateWasm(coreWasmPath);
  const malloc = requireExport(exports, 'malloc');
  const free = requireExport(exports, 'free');
  const moduleCreate = requireExport(exports, 'kessho_module_create');
  const moduleDestroy = requireExport(exports, 'kessho_module_destroy');
  const moduleGetParamCount = requireExport(exports, 'kessho_module_get_param_count');
  const moduleGetParamsPtr = requireExport(exports, 'kessho_module_get_params_ptr');
  const moduleCommitParams = requireExport(exports, 'kessho_module_commit_params');
  const moduleProcessInterleaved = requireExport(exports, 'kessho_module_process_interleaved');

  const module = moduleCreate(moduleTypeReverb, sampleRate, blockSize);
  assert(module !== 0, 'core reverb module setup failed');
  assert(moduleGetParamCount(module) === paramOrder.length, 'core reverb param count mismatch');

  let heap = new Float32Array(exports.memory.buffer);
  writeCoreParams(heap, moduleGetParamsPtr(module), params);
  moduleCommitParams(module);

  const inputPtr = malloc(blockSize * 2 * Float32Array.BYTES_PER_ELEMENT);
  const outputPtr = malloc(blockSize * 2 * Float32Array.BYTES_PER_ELEMENT);
  assert(inputPtr !== 0 && outputPtr !== 0, 'core reverb module allocation failed');
  heap = new Float32Array(exports.memory.buffer);

  const inputOffset = inputPtr >> 2;
  const outputOffset = outputPtr >> 2;
  const output = new Float32Array(input.length);

  for (let block = 0; block < blocks; block += 1) {
    const blockOffset = block * blockSize * 2;
    heap = new Float32Array(exports.memory.buffer);
    heap.set(input.subarray(blockOffset, blockOffset + blockSize * 2), inputOffset);
    assert(
      moduleProcessInterleaved(module, inputPtr, outputPtr, blockSize) === 1,
      'core reverb module process failed',
    );
    output.set(heap.subarray(outputOffset, outputOffset + blockSize * 2), blockOffset);
  }

  moduleDestroy(module);
  free(inputPtr);
  free(outputPtr);
  return output;
}

async function renderCoreModulePlanar(params, input, blocks) {
  const { exports } = await instantiateWasm(coreWasmPath);
  const malloc = requireExport(exports, 'malloc');
  const free = requireExport(exports, 'free');
  const moduleCreate = requireExport(exports, 'kessho_module_create');
  const moduleDestroy = requireExport(exports, 'kessho_module_destroy');
  const moduleGetParamCount = requireExport(exports, 'kessho_module_get_param_count');
  const moduleGetParamsPtr = requireExport(exports, 'kessho_module_get_params_ptr');
  const moduleCommitParams = requireExport(exports, 'kessho_module_commit_params');
  const moduleProcessPlanarStereo = requireExport(exports, 'kessho_module_process_planar_stereo');

  const module = moduleCreate(moduleTypeReverb, sampleRate, blockSize);
  assert(module !== 0, 'core reverb planar module setup failed');
  assert(moduleGetParamCount(module) === paramOrder.length, 'core reverb planar param count mismatch');

  let heap = new Float32Array(exports.memory.buffer);
  writeCoreParams(heap, moduleGetParamsPtr(module), params);
  moduleCommitParams(module);

  const channelBytes = blockSize * Float32Array.BYTES_PER_ELEMENT;
  const inputLPtr = malloc(channelBytes);
  const inputRPtr = malloc(channelBytes);
  const outputLPtr = malloc(channelBytes);
  const outputRPtr = malloc(channelBytes);
  assert(
    inputLPtr !== 0 && inputRPtr !== 0 && outputLPtr !== 0 && outputRPtr !== 0,
    'core reverb planar module allocation failed',
  );

  const output = new Float32Array(input.length);
  for (let block = 0; block < blocks; block += 1) {
    const blockOffset = block * blockSize * 2;
    heap = new Float32Array(exports.memory.buffer);
    for (let i = 0; i < blockSize; i += 1) {
      heap[(inputLPtr >> 2) + i] = input[blockOffset + i * 2];
      heap[(inputRPtr >> 2) + i] = input[blockOffset + i * 2 + 1];
      heap[(outputLPtr >> 2) + i] = 0;
      heap[(outputRPtr >> 2) + i] = 0;
    }
    assert(
      moduleProcessPlanarStereo(module, inputLPtr, inputRPtr, outputLPtr, outputRPtr, blockSize) === 1,
      'core reverb planar module process failed',
    );
    heap = new Float32Array(exports.memory.buffer);
    for (let i = 0; i < blockSize; i += 1) {
      output[blockOffset + i * 2] = heap[(outputLPtr >> 2) + i];
      output[blockOffset + i * 2 + 1] = heap[(outputRPtr >> 2) + i];
    }
  }

  moduleDestroy(module);
  free(inputLPtr);
  free(inputRPtr);
  free(outputLPtr);
  free(outputRPtr);
  return output;
}

async function renderCorePadToReverbChain({
  padParams,
  reverbParams,
  notes,
  actions,
  blocks,
  pad1SendGain,
  pad2SendGain,
}) {
  const { exports } = await instantiateWasm(coreWasmPath);
  const malloc = requireExport(exports, 'malloc');
  const free = requireExport(exports, 'free');
  const moduleCreate = requireExport(exports, 'kessho_module_create');
  const moduleDestroy = requireExport(exports, 'kessho_module_destroy');
  const moduleGetParamCount = requireExport(exports, 'kessho_module_get_param_count');
  const moduleGetParamsPtr = requireExport(exports, 'kessho_module_get_params_ptr');
  const moduleCommitParams = requireExport(exports, 'kessho_module_commit_params');
  const moduleNoteOn = requireExport(exports, 'kessho_module_note_on');
  const moduleNoteOff = requireExport(exports, 'kessho_module_note_off');
  const moduleAllNotesOff = requireExport(exports, 'kessho_module_all_notes_off');
  const moduleGetOutputTapCount = requireExport(exports, 'kessho_module_get_output_tap_count');
  const moduleProcessPlanarStereoTaps = requireExport(exports, 'kessho_module_process_planar_stereo_taps');
  const moduleProcessPlanarStereo = requireExport(exports, 'kessho_module_process_planar_stereo');

  const padModule = moduleCreate(moduleTypePad, sampleRate, blockSize);
  const reverbModule = moduleCreate(moduleTypeReverb, sampleRate, blockSize);
  assert(padModule !== 0, 'core pad chain module setup failed');
  assert(reverbModule !== 0, 'core reverb chain module setup failed');
  assert(moduleGetParamCount(padModule) === padParamCount, 'core pad chain param count mismatch');
  assert(moduleGetParamCount(reverbModule) === paramOrder.length, 'core reverb chain param count mismatch');
  assert(
    moduleGetOutputTapCount(padModule) > padTapPrefaderPad2,
    'core pad chain output tap count too small',
  );

  let heap = new Float32Array(exports.memory.buffer);
  writeCorePadParams(heap, moduleGetParamsPtr(padModule), padParams);
  moduleCommitParams(padModule);
  writeCoreParams(heap, moduleGetParamsPtr(reverbModule), reverbParams);
  moduleCommitParams(reverbModule);
  triggerCorePadNotes(padModule, moduleNoteOn, notes);

  const channelBytes = blockSize * Float32Array.BYTES_PER_ELEMENT;
  const padInputLPtr = malloc(channelBytes);
  const padInputRPtr = malloc(channelBytes);
  const padTapBusCount = padTapPrefaderPad2 + 1;
  const padTapLPtrs = Array.from({ length: padTapBusCount }, () => malloc(channelBytes));
  const padTapRPtrs = Array.from({ length: padTapBusCount }, () => malloc(channelBytes));
  const padTapLPtrArray = malloc(padTapBusCount * Uint32Array.BYTES_PER_ELEMENT);
  const padTapRPtrArray = malloc(padTapBusCount * Uint32Array.BYTES_PER_ELEMENT);
  const reverbInputLPtr = malloc(channelBytes);
  const reverbInputRPtr = malloc(channelBytes);
  const reverbOutputLPtr = malloc(channelBytes);
  const reverbOutputRPtr = malloc(channelBytes);
  assert(
    padInputLPtr !== 0 &&
      padInputRPtr !== 0 &&
      padTapLPtrArray !== 0 &&
      padTapRPtrArray !== 0 &&
      reverbInputLPtr !== 0 &&
      reverbInputRPtr !== 0 &&
      reverbOutputLPtr !== 0 &&
      reverbOutputRPtr !== 0 &&
      padTapLPtrs.every((ptr) => ptr !== 0) &&
      padTapRPtrs.every((ptr) => ptr !== 0),
    'core pad->reverb chain allocation failed',
  );

  heap = new Float32Array(exports.memory.buffer);
  let pointerHeap = new Uint32Array(exports.memory.buffer);
  pointerHeap.set(padTapLPtrs, padTapLPtrArray >> 2);
  pointerHeap.set(padTapRPtrs, padTapRPtrArray >> 2);
  heap.fill(0, padInputLPtr >> 2, (padInputLPtr >> 2) + blockSize);
  heap.fill(0, padInputRPtr >> 2, (padInputRPtr >> 2) + blockSize);

  const input = new Float32Array(blocks * blockSize * 2);
  const reverbSendTap = new Float32Array(blocks * blockSize * 2);
  const output = new Float32Array(blocks * blockSize * 2);
  for (let block = 0; block < blocks; block += 1) {
    heap = new Float32Array(exports.memory.buffer);
    pointerHeap = new Uint32Array(exports.memory.buffer);
    pointerHeap.set(padTapLPtrs, padTapLPtrArray >> 2);
    pointerHeap.set(padTapRPtrs, padTapRPtrArray >> 2);
    for (let tap = 0; tap < padTapBusCount; tap += 1) {
      heap.fill(0, padTapLPtrs[tap] >> 2, (padTapLPtrs[tap] >> 2) + blockSize);
      heap.fill(0, padTapRPtrs[tap] >> 2, (padTapRPtrs[tap] >> 2) + blockSize);
    }
    heap.fill(0, reverbInputLPtr >> 2, (reverbInputLPtr >> 2) + blockSize);
    heap.fill(0, reverbInputRPtr >> 2, (reverbInputRPtr >> 2) + blockSize);
    heap.fill(0, reverbOutputLPtr >> 2, (reverbOutputLPtr >> 2) + blockSize);
    heap.fill(0, reverbOutputRPtr >> 2, (reverbOutputRPtr >> 2) + blockSize);

    runCorePadActions(padModule, moduleNoteOff, moduleAllNotesOff, actions, block);
    assert(
      moduleProcessPlanarStereoTaps(
        padModule,
        padInputLPtr,
        padInputRPtr,
        padTapLPtrArray,
        padTapRPtrArray,
        padTapBusCount,
        blockSize,
      ) === 1,
      'core pad chain tap process failed',
    );

    heap = new Float32Array(exports.memory.buffer);
    const pad1LeftOffset = padTapLPtrs[padTapPrefaderPad1] >> 2;
    const pad1RightOffset = padTapRPtrs[padTapPrefaderPad1] >> 2;
    const pad2LeftOffset = padTapLPtrs[padTapPrefaderPad2] >> 2;
    const pad2RightOffset = padTapRPtrs[padTapPrefaderPad2] >> 2;
    const sendLeftOffset = padTapLPtrs[padTapReverbSend] >> 2;
    const sendRightOffset = padTapRPtrs[padTapReverbSend] >> 2;
    const reverbInputLeftOffset = reverbInputLPtr >> 2;
    const reverbInputRightOffset = reverbInputRPtr >> 2;
    const outputOffset = block * blockSize * 2;
    for (let i = 0; i < blockSize; i += 1) {
      const left = heap[pad1LeftOffset + i] * pad1SendGain + heap[pad2LeftOffset + i] * pad2SendGain;
      const right = heap[pad1RightOffset + i] * pad1SendGain + heap[pad2RightOffset + i] * pad2SendGain;
      heap[reverbInputLeftOffset + i] = left;
      heap[reverbInputRightOffset + i] = right;
      input[outputOffset + i * 2] = left;
      input[outputOffset + i * 2 + 1] = right;
      reverbSendTap[outputOffset + i * 2] = heap[sendLeftOffset + i];
      reverbSendTap[outputOffset + i * 2 + 1] = heap[sendRightOffset + i];
    }

    assert(
      moduleProcessPlanarStereo(
        reverbModule,
        reverbInputLPtr,
        reverbInputRPtr,
        reverbOutputLPtr,
        reverbOutputRPtr,
        blockSize,
      ) === 1,
      'core pad->reverb chain reverb process failed',
    );

    heap = new Float32Array(exports.memory.buffer);
    const reverbOutputLeftOffset = reverbOutputLPtr >> 2;
    const reverbOutputRightOffset = reverbOutputRPtr >> 2;
    for (let i = 0; i < blockSize; i += 1) {
      output[outputOffset + i * 2] = heap[reverbOutputLeftOffset + i];
      output[outputOffset + i * 2 + 1] = heap[reverbOutputRightOffset + i];
    }
  }

  moduleDestroy(padModule);
  moduleDestroy(reverbModule);
  free(padInputLPtr);
  free(padInputRPtr);
  for (const ptr of padTapLPtrs) free(ptr);
  for (const ptr of padTapRPtrs) free(ptr);
  free(padTapLPtrArray);
  free(padTapRPtrArray);
  free(reverbInputLPtr);
  free(reverbInputRPtr);
  free(reverbOutputLPtr);
  free(reverbOutputRPtr);

  return { input, reverbSendTap, output };
}

async function assertCoreReverbReset(params, input, blocks) {
  const { exports } = await instantiateWasm(coreWasmPath);
  const malloc = requireExport(exports, 'malloc');
  const free = requireExport(exports, 'free');
  const moduleCreate = requireExport(exports, 'kessho_module_create');
  const moduleDestroy = requireExport(exports, 'kessho_module_destroy');
  const moduleReset = requireExport(exports, 'kessho_module_reset');
  const moduleGetParamsPtr = requireExport(exports, 'kessho_module_get_params_ptr');
  const moduleCommitParams = requireExport(exports, 'kessho_module_commit_params');
  const moduleProcessInterleaved = requireExport(exports, 'kessho_module_process_interleaved');

  const module = moduleCreate(moduleTypeReverb, sampleRate, blockSize);
  assert(module !== 0, 'core reverb reset module setup failed');
  let heap = new Float32Array(exports.memory.buffer);
  writeCoreParams(heap, moduleGetParamsPtr(module), params);
  moduleCommitParams(module);

  const inputPtr = malloc(blockSize * 2 * Float32Array.BYTES_PER_ELEMENT);
  const outputPtr = malloc(blockSize * 2 * Float32Array.BYTES_PER_ELEMENT);
  assert(inputPtr !== 0 && outputPtr !== 0, 'core reverb reset module allocation failed');

  const render = (source) => {
    const output = new Float32Array(source.length);
    for (let block = 0; block < blocks; block += 1) {
      const blockOffset = block * blockSize * 2;
      heap = new Float32Array(exports.memory.buffer);
      heap.set(source.subarray(blockOffset, blockOffset + blockSize * 2), inputPtr >> 2);
      heap.fill(0, outputPtr >> 2, (outputPtr >> 2) + blockSize * 2);
      assert(
        moduleProcessInterleaved(module, inputPtr, outputPtr, blockSize) === 1,
        'core reverb reset render failed',
      );
      heap = new Float32Array(exports.memory.buffer);
      output.set(heap.subarray(outputPtr >> 2, (outputPtr >> 2) + blockSize * 2), blockOffset);
    }
    return output;
  };

  const first = render(input);
  moduleReset(module);
  const resetSilence = render(new Float32Array(input.length));
  const resetPeak = maxAbs(resetSilence);
  assert(resetPeak <= 1e-8, `core reverb reset should clear tail, peak ${resetPeak}`);
  moduleReset(module);
  const second = render(input);
  const resetResidual = diffStats(first, second);
  assert(
    resetResidual.rms <= 1e-7 && resetResidual.peak <= 1e-6,
    `core reverb reset did not preserve deterministic rerender: RMS ${resetResidual.rms}, peak ${resetResidual.peak}`,
  );

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

function maxAbs(values) {
  let peak = 0;
  for (let i = 0; i < values.length; i += 1) {
    assert(Number.isFinite(values[i]), 'render produced non-finite samples');
    peak = Math.max(peak, Math.abs(values[i]));
  }
  return peak;
}

function maxAbsFromBlock(values, block) {
  let peak = 0;
  for (let i = block * blockSize * 2; i < values.length; i += 1) {
    assert(Number.isFinite(values[i]), 'render produced non-finite samples');
    peak = Math.max(peak, Math.abs(values[i]));
  }
  return peak;
}

const cases = [
  {
    name: 'hall-lite-impulse',
    params: baseReverbParams(),
    blocks: 96,
    input: generateInput(96, (block, i) => {
      if (block === 0 && i === 0) return [0.8, 0.45];
      return [0, 0];
    }),
  },
  {
    name: 'plate-balanced-tone',
    params: baseReverbParams({
      type: 0,
      quality: 1,
      decay: 0.62,
      size: 1.15,
      diffusion: 0.76,
      modulation: 0.18,
      width: 0.92,
      chorusRate: 0.38,
      chorusDepth: 8,
      inputTone: 0.22,
      crossFeed: 0.18,
      earlyReflections: 0.32,
      airAbsorption: 0.12,
    }),
    blocks: 96,
    input: generateInput(96, (block, i) => {
      const t = (block * blockSize + i) / sampleRate;
      const env = block < 16 ? 1 : 0;
      const left = env * (Math.sin(2 * Math.PI * 220 * t) * 0.22 + Math.sin(2 * Math.PI * 880 * t) * 0.04);
      const right = env * (Math.sin(2 * Math.PI * 277 * t) * 0.18);
      return [left, right];
    }),
  },
  {
    name: 'dattorro-wide',
    params: baseReverbParams({
      type: 4,
      quality: 2,
      decay: 0.58,
      size: 0.95,
      diffusion: 0.7,
      modulation: 0.16,
      width: 0.88,
      dampHigh: 0.42,
      saturationMode: 1,
      transientSmooth: 0.12,
      erLpFreq: 3800,
    }),
    blocks: 96,
    input: generateInput(96, (block, i) => {
      if (block > 8) return [0, 0];
      const t = (block * blockSize + i) / sampleRate;
      const left = Math.sin(2 * Math.PI * 330 * t) * 0.24;
      const right = Math.sin(2 * Math.PI * 495 * t) * 0.16;
      return [left, right];
    }),
  },
  {
    name: 'cathedral-host-tail',
    params: baseReverbParams({
      type: 2,
      quality: 1,
      decay: 0.88,
      size: 2.4,
      diffusion: 0.9,
      modulation: 0.25,
      predelay: 30,
      width: 0.86,
      chorusRate: 0.32,
      chorusDepth: 10,
      dampLow: 0.08,
      dampHigh: 0.26,
      crossover: 760,
      earlyReflections: 0.38,
      airAbsorption: 0.18,
      transientSmooth: 0.18,
    }),
    blocks: 160,
    input: generateInput(160, (block, i) => {
      if (block > 54) return [0, 0];
      const frame = block * blockSize + i;
      const t = frame / sampleRate;
      const fade = Math.min(1, frame / (sampleRate * 0.02)) *
        Math.max(0, Math.min(1, (55 * blockSize - frame) / (sampleRate * 0.12)));
      const left = fade * (
        Math.sin(2 * Math.PI * 130.813 * t) * 0.23 +
        Math.sin(2 * Math.PI * 195.998 * t) * 0.18 +
        Math.sin(2 * Math.PI * 293.665 * t) * 0.13
      );
      const right = fade * (
        Math.sin(2 * Math.PI * 164.814 * t) * 0.2 +
        Math.sin(2 * Math.PI * 246.942 * t) * 0.15 +
        Math.sin(2 * Math.PI * 329.628 * t) * 0.1
      );
      return [left, right];
    }),
  },
];

const padReverbChainCase = {
  name: 'pad-reverb-chain-tail',
  blocks: 144,
  tailStartBlock: 92,
  pad1SendGain: 0.82,
  pad2SendGain: 0,
  padParams: withPadParams((params) => {
    const pad1 = padBase(0);
    params[pad1 + padOscAWave] = 1;
    params[pad1 + padOscBWave] = 0;
    params[pad1 + padOscBDetune] = 3.5;
    params[pad1 + padOscMix] = 0.46;
    params[pad1 + padFilterCutoffMin] = 260;
    params[pad1 + padFilterCutoffMax] = 2600;
    params[pad1 + padAttack] = 0.008;
    params[pad1 + padSustain] = 0.78;
    params[pad1 + padRelease] = 0.035;
    params[pad1 + padLevel] = 0.62;
    params[padParamReverbSend] = 0.82;
  }),
  reverbParams: baseReverbParams({
    type: 2,
    quality: 1,
    decay: 0.88,
    size: 2.4,
    diffusion: 0.9,
    modulation: 0.25,
    predelay: 30,
    width: 0.86,
    chorusRate: 0.32,
    chorusDepth: 10,
    dampLow: 0.08,
    dampHigh: 0.26,
    crossover: 760,
    earlyReflections: 0.38,
    airAbsorption: 0.18,
    transientSmooth: 0.18,
  }),
  notes: [
    { voiceIndex: 0, pad: 0, frequency: 130.813, velocity: 0.8 },
    { voiceIndex: 1, pad: 0, frequency: 195.998, velocity: 0.64 },
    { voiceIndex: 2, pad: 0, frequency: 293.665, velocity: 0.52 },
  ],
  actions: [{ block: 24, type: 'allNotesOff' }],
};

{
  const { exports } = await instantiateWasm(coreWasmPath);
  const moduleSelfCheck = requireExport(exports, 'kessho_module_self_check');
  assert(moduleSelfCheck(moduleTypeReverb, sampleRate, blockSize) === 1, 'core reverb module self-check failed');
}

const results = [];
for (const testCase of cases) {
  const standalone = await renderStandalone(testCase.params, testCase.input, testCase.blocks);
  const core = await renderCoreModule(testCase.params, testCase.input, testCase.blocks);
  const residual = diffStats(standalone, core);
  assert(residual.signalPeak > 1.0e-5, `${testCase.name} produced no reverb signal`);
  assert(
    residual.rms <= 1.0e-7 && residual.peak <= 1.0e-6,
    `${testCase.name} reverb module parity drift too high: RMS ${residual.rms}, peak ${residual.peak}`,
  );
  results.push(
    `${testCase.name}: RMS ${residual.rms.toExponential(3)}, peak ${residual.peak.toExponential(3)}`,
  );

  const planar = await renderCoreModulePlanar(testCase.params, testCase.input, testCase.blocks);
  const planarResidual = diffStats(standalone, planar);
  assert(
    planarResidual.rms <= 1.0e-7 && planarResidual.peak <= 1.0e-6,
    `${testCase.name} planar reverb module parity drift too high: RMS ${planarResidual.rms}, peak ${planarResidual.peak}`,
  );
}

await assertCoreReverbReset(cases.at(-1).params, cases.at(-1).input, cases.at(-1).blocks);

{
  const standaloneInput = await renderStandalonePadReverbInput(
    padReverbChainCase.padParams,
    padReverbChainCase.notes,
    padReverbChainCase.actions,
    padReverbChainCase.blocks,
  );
  const standaloneOutput = await renderStandalone(
    padReverbChainCase.reverbParams,
    standaloneInput,
    padReverbChainCase.blocks,
  );
  const coreChain = await renderCorePadToReverbChain(padReverbChainCase);
  const inputResidual = diffStats(standaloneInput, coreChain.input);
  assert(
    inputResidual.rms <= 1.0e-7 && inputResidual.peak <= 1.0e-6,
    `${padReverbChainCase.name} pad send input parity drift too high: RMS ${inputResidual.rms}, peak ${inputResidual.peak}`,
  );
  assert(inputResidual.signalPeak > 1.0e-5, `${padReverbChainCase.name} produced no pad reverb-send signal`);

  const sendTapResidual = diffStats(standaloneInput, coreChain.reverbSendTap);
  assert(
    sendTapResidual.rms <= 1.0e-7 && sendTapResidual.peak <= 1.0e-6,
    `${padReverbChainCase.name} core reverb-send tap drift too high: RMS ${sendTapResidual.rms}, peak ${sendTapResidual.peak}`,
  );

  const outputResidual = diffStats(standaloneOutput, coreChain.output);
  assert(
    outputResidual.rms <= 1.0e-7 && outputResidual.peak <= 1.0e-6,
    `${padReverbChainCase.name} pad->reverb output parity drift too high: RMS ${outputResidual.rms}, peak ${outputResidual.peak}`,
  );
  const lateInputPeak = maxAbsFromBlock(coreChain.input, padReverbChainCase.tailStartBlock);
  assert(
    lateInputPeak <= 1.0e-7,
    `${padReverbChainCase.name} pad input should be drained before tail probe, peak ${lateInputPeak}`,
  );
  const lateTailPeak = maxAbsFromBlock(coreChain.output, padReverbChainCase.tailStartBlock);
  assert(
    lateTailPeak > 1.0e-6,
    `${padReverbChainCase.name} expected a measurable reverb tail after pad input drained`,
  );
  results.push(
    `${padReverbChainCase.name}: input RMS ${inputResidual.rms.toExponential(3)}, output RMS ${outputResidual.rms.toExponential(3)}, late tail ${lateTailPeak.toExponential(3)}`,
  );
}

console.log(`KesshoCore reverb module parity passed: ${results.join('; ')}`);
