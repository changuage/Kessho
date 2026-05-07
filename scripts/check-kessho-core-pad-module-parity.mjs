import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const standaloneWasmPath = resolve(root, 'public/worklets/kessho_pad.wasm');
const coreWasmPath = resolve(root, 'public/worklets/kessho_core.wasm');
const sampleRate = 48000;
const blockSize = 128;
const moduleTypePad = 7;
const residualRmsThreshold = 1.0e-7;
const residualPeakThreshold = 1.0e-6;

const padCount = 2;
const voicesPerPadModule = 6;
const paramsPerPad = 53;
const paramReverbSend = paramsPerPad * padCount;
const paramOutputSelect = paramReverbSend + 1;
const paramCount = paramOutputSelect + 1;

const oscAWave = 0;
const oscAOctave = 1;
const oscADetune = 2;
const oscALevel = 3;
const oscBWave = 4;
const oscBOctave = 5;
const oscBDetune = 6;
const oscBLevel = 7;
const oscMix = 8;
const subEnabled = 9;
const subOctave = 10;
const subWave = 11;
const subLevel = 12;
const noiseType = 13;
const noiseLevel = 14;
const hardness = 15;
const warmth = 16;
const presence = 17;
const foldAmount = 18;
const foldMode = 19;
const filterType = 20;
const filterCutoffMin = 21;
const filterCutoffMax = 22;
const filterResonance = 23;
const filterQ = 24;
const filterSlope = 25;
const filterKeyTracking = 26;
const filterBEnabled = 27;
const filterBType = 28;
const filterBCutoff = 29;
const filterBResonance = 30;
const filterBQ = 31;
const filterRouting = 32;
const attack = 33;
const decay = 34;
const sustain = 35;
const release = 36;
const lfo1Rate = 37;
const lfo1Depth = 38;
const lfo1Wave = 39;
const lfo1Dest = 40;
const lfo2Rate = 41;
const lfo2Depth = 42;
const lfo2Wave = 43;
const lfo2Dest = 44;
const modEnvEnabled = 45;
const modEnvAttack = 46;
const modEnvDecay = 47;
const modEnvSustain = 48;
const modEnvRelease = 49;
const modEnvDepth = 50;
const modEnvDest = 51;
const level = 52;

const tapNames = Object.freeze([
  'main',
  'reverb-send',
  'prefader-pad1',
  'prefader-pad2',
  'postfader-pad1',
  'postfader-pad2',
]);

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
  for (let pad = 0; pad < padCount; pad += 1) {
    const base = pad * paramsPerPad;
    params[base + oscAWave] = 1;
    params[base + oscAOctave] = 0;
    params[base + oscADetune] = 0;
    params[base + oscALevel] = 1;
    params[base + oscBWave] = 0;
    params[base + oscBOctave] = 0;
    params[base + oscBDetune] = 0;
    params[base + oscBLevel] = 1;
    params[base + oscMix] = 0.5;
    params[base + subEnabled] = 0;
    params[base + subOctave] = -1;
    params[base + subWave] = 0;
    params[base + subLevel] = 0.5;
    params[base + noiseType] = 0;
    params[base + noiseLevel] = 0;
    params[base + hardness] = 0;
    params[base + warmth] = 0.5;
    params[base + presence] = 0.5;
    params[base + foldAmount] = 0;
    params[base + foldMode] = 0;
    params[base + filterType] = 0;
    params[base + filterCutoffMin] = 200;
    params[base + filterCutoffMax] = 4000;
    params[base + filterResonance] = 0;
    params[base + filterQ] = 0.7;
    params[base + filterSlope] = 12;
    params[base + filterKeyTracking] = 0;
    params[base + filterBEnabled] = 0;
    params[base + filterBType] = 0;
    params[base + filterBCutoff] = 2000;
    params[base + filterBResonance] = 0;
    params[base + filterBQ] = 0.7;
    params[base + filterRouting] = 0;
    params[base + attack] = 0.1;
    params[base + decay] = 0.5;
    params[base + sustain] = 0.7;
    params[base + release] = 2;
    params[base + lfo1Rate] = 0;
    params[base + lfo1Depth] = 0;
    params[base + lfo1Wave] = 0;
    params[base + lfo1Dest] = 0;
    params[base + lfo2Rate] = 0;
    params[base + lfo2Depth] = 0;
    params[base + lfo2Wave] = 0;
    params[base + lfo2Dest] = 0;
    params[base + modEnvEnabled] = 0;
    params[base + modEnvAttack] = 0.5;
    params[base + modEnvDecay] = 1;
    params[base + modEnvSustain] = 0;
    params[base + modEnvRelease] = 0.5;
    params[base + modEnvDepth] = 0;
    params[base + modEnvDest] = 1;
    params[base + level] = 0.8;
  }
  params[paramReverbSend] = 0.1;
  params[paramOutputSelect] = 0;
  return params;
}

function withParams(configure) {
  const params = makeDefaultParams();
  configure(params);
  return params;
}

function padBase(pad) {
  return pad * paramsPerPad;
}

function writeCoreParams(heap, ptr, params) {
  heap.set(params, ptr >> 2);
}

function applyStandaloneParams(exports, params) {
  const call = (name, ...args) => requireExport(exports, name)(...args);
  for (let pad = 0; pad < padCount; pad += 1) {
    const base = padBase(pad);
    call('pad_set_osc_a_wave', pad, Math.round(params[base + oscAWave]));
    call('pad_set_osc_a_octave', pad, Math.round(params[base + oscAOctave]));
    call('pad_set_osc_a_detune', pad, params[base + oscADetune]);
    call('pad_set_osc_a_level', pad, params[base + oscALevel]);
    call('pad_set_osc_b_wave', pad, Math.round(params[base + oscBWave]));
    call('pad_set_osc_b_octave', pad, Math.round(params[base + oscBOctave]));
    call('pad_set_osc_b_detune', pad, params[base + oscBDetune]);
    call('pad_set_osc_b_level', pad, params[base + oscBLevel]);
    call('pad_set_osc_mix', pad, params[base + oscMix]);
    call('pad_set_sub_enabled', pad, params[base + subEnabled] > 0.5 ? 1 : 0);
    call('pad_set_sub_octave', pad, Math.round(params[base + subOctave]));
    call('pad_set_sub_wave', pad, Math.round(params[base + subWave]));
    call('pad_set_sub_level', pad, params[base + subLevel]);
    call('pad_set_noise_type', pad, Math.round(params[base + noiseType]));
    call('pad_set_noise_level', pad, params[base + noiseLevel]);
    call('pad_set_hardness', pad, params[base + hardness]);
    call('pad_set_warmth', pad, params[base + warmth]);
    call('pad_set_presence', pad, params[base + presence]);
    call('pad_set_fold_amount', pad, params[base + foldAmount]);
    call('pad_set_fold_mode', pad, Math.round(params[base + foldMode]));
    call('pad_set_filter_type', pad, Math.round(params[base + filterType]));
    call('pad_set_filter_cutoff_min', pad, params[base + filterCutoffMin]);
    call('pad_set_filter_cutoff_max', pad, params[base + filterCutoffMax]);
    call('pad_set_filter_resonance', pad, params[base + filterResonance]);
    call('pad_set_filter_q', pad, params[base + filterQ]);
    call('pad_set_filter_slope', pad, params[base + filterSlope]);
    call('pad_set_filter_key_tracking', pad, params[base + filterKeyTracking]);
    call('pad_set_filter_b_enabled', pad, params[base + filterBEnabled] > 0.5 ? 1 : 0);
    call('pad_set_filter_b_type', pad, Math.round(params[base + filterBType]));
    call('pad_set_filter_b_cutoff', pad, params[base + filterBCutoff]);
    call('pad_set_filter_b_resonance', pad, params[base + filterBResonance]);
    call('pad_set_filter_b_q', pad, params[base + filterBQ]);
    call('pad_set_filter_routing', pad, Math.round(params[base + filterRouting]));
    call('pad_set_attack', pad, params[base + attack]);
    call('pad_set_decay', pad, params[base + decay]);
    call('pad_set_sustain', pad, params[base + sustain]);
    call('pad_set_release', pad, params[base + release]);
    call('pad_set_lfo1_rate', pad, params[base + lfo1Rate]);
    call('pad_set_lfo1_depth', pad, params[base + lfo1Depth]);
    call('pad_set_lfo1_wave', pad, Math.round(params[base + lfo1Wave]));
    call('pad_set_lfo1_dest', pad, Math.round(params[base + lfo1Dest]));
    call('pad_set_lfo2_rate', pad, params[base + lfo2Rate]);
    call('pad_set_lfo2_depth', pad, params[base + lfo2Depth]);
    call('pad_set_lfo2_wave', pad, Math.round(params[base + lfo2Wave]));
    call('pad_set_lfo2_dest', pad, Math.round(params[base + lfo2Dest]));
    call('pad_set_mod_env_enabled', pad, params[base + modEnvEnabled] > 0.5 ? 1 : 0);
    call('pad_set_mod_env_attack', pad, params[base + modEnvAttack]);
    call('pad_set_mod_env_decay', pad, params[base + modEnvDecay]);
    call('pad_set_mod_env_sustain', pad, params[base + modEnvSustain]);
    call('pad_set_mod_env_release', pad, params[base + modEnvRelease]);
    call('pad_set_mod_env_depth', pad, params[base + modEnvDepth]);
    call('pad_set_mod_env_dest', pad, Math.round(params[base + modEnvDest]));
    call('pad_set_level', pad, params[base + level]);
  }
  call('pad_set_reverb_send', params[paramReverbSend]);
}

function copySelected(heap, ptrs, output, outputOffset, frames, select) {
  const sourcePtr = ptrs[Math.max(0, Math.min(5, Math.round(select)))] ?? ptrs[0];
  const sourceOffset = sourcePtr >> 2;
  output.set(heap.subarray(sourceOffset, sourceOffset + frames * 2), outputOffset);
}

function copyStandaloneTaps(heap, ptrs, outputs, outputOffset, frames) {
  for (let tap = 0; tap < ptrs.length; tap += 1) {
    const sourceOffset = ptrs[tap] >> 2;
    outputs[tap].set(heap.subarray(sourceOffset, sourceOffset + frames * 2), outputOffset);
  }
}

function triggerStandaloneNotes(exports, notes) {
  const setVoicePad = requireExport(exports, 'pad_set_voice_pad');
  const noteOn = requireExport(exports, 'pad_note_on');
  for (const note of notes) {
    setVoicePad(note.voiceIndex, note.pad);
    noteOn(note.voiceIndex, note.frequency, note.velocity);
  }
}

function runStandaloneActions(exports, actions, block) {
  if (actions.length === 0) return;
  const noteOff = requireExport(exports, 'pad_note_off');
  const killVoice = requireExport(exports, 'pad_kill_voice');
  for (const action of actions) {
    if (action.block !== block) continue;
    if (action.type === 'noteOff') {
      noteOff(action.voiceIndex);
    } else if (action.type === 'killVoice') {
      killVoice(action.voiceIndex);
    } else if (action.type === 'allNotesOff') {
      for (let voice = 0; voice < voicesPerPadModule; voice += 1) {
        noteOff(voice);
      }
    } else {
      throw new Error(`Unknown standalone pad action: ${action.type}`);
    }
  }
}

async function renderStandalone(params, notes, blocks, actions = []) {
  const { exports } = await instantiateWasm(standaloneWasmPath);
  const init = requireExport(exports, 'pad_init');
  const destroy = requireExport(exports, 'pad_destroy');
  const processBlock = requireExport(exports, 'pad_process_block');
  const activeCount = requireExport(exports, 'pad_get_active_count');

  assert(init(sampleRate) === 0, 'standalone pad init failed');
  applyStandaloneParams(exports, params);
  triggerStandaloneNotes(exports, notes);

  const ptrs = [
    requireExport(exports, 'pad_get_output_ptr')(),
    requireExport(exports, 'pad_get_reverb_send_ptr')(),
    requireExport(exports, 'pad_get_prefader_pad1_ptr')(),
    requireExport(exports, 'pad_get_prefader_pad2_ptr')(),
    requireExport(exports, 'pad_get_postfader_pad1_ptr')(),
    requireExport(exports, 'pad_get_postfader_pad2_ptr')(),
  ];

  const output = new Float32Array(blocks * blockSize * 2);
  const select = params[paramOutputSelect];
  for (let block = 0; block < blocks; block += 1) {
    runStandaloneActions(exports, actions, block);
    processBlock(blockSize);
    const heap = new Float32Array(exports.memory.buffer);
    copySelected(heap, ptrs, output, block * blockSize * 2, blockSize, select);
  }

  const finalActiveCount = activeCount();
  destroy();
  return { output, finalActiveCount };
}

async function renderStandaloneTaps(params, notes, blocks, actions = []) {
  const { exports } = await instantiateWasm(standaloneWasmPath);
  const init = requireExport(exports, 'pad_init');
  const destroy = requireExport(exports, 'pad_destroy');
  const processBlock = requireExport(exports, 'pad_process_block');
  const activeCount = requireExport(exports, 'pad_get_active_count');

  assert(init(sampleRate) === 0, 'standalone pad init failed');
  applyStandaloneParams(exports, params);
  triggerStandaloneNotes(exports, notes);

  const ptrs = [
    requireExport(exports, 'pad_get_output_ptr')(),
    requireExport(exports, 'pad_get_reverb_send_ptr')(),
    requireExport(exports, 'pad_get_prefader_pad1_ptr')(),
    requireExport(exports, 'pad_get_prefader_pad2_ptr')(),
    requireExport(exports, 'pad_get_postfader_pad1_ptr')(),
    requireExport(exports, 'pad_get_postfader_pad2_ptr')(),
  ];

  const outputs = ptrs.map(() => new Float32Array(blocks * blockSize * 2));
  for (let block = 0; block < blocks; block += 1) {
    runStandaloneActions(exports, actions, block);
    processBlock(blockSize);
    const heap = new Float32Array(exports.memory.buffer);
    copyStandaloneTaps(heap, ptrs, outputs, block * blockSize * 2, blockSize);
  }

  const finalActiveCount = activeCount();
  destroy();
  return { outputs, finalActiveCount };
}

function runCoreActions(module, moduleNoteOff, moduleKillVoice, moduleAllNotesOff, actions, block) {
  if (actions.length === 0) return;
  for (const action of actions) {
    if (action.block !== block) continue;
    if (action.type === 'noteOff') {
      assert(moduleNoteOff(module, action.voiceIndex) === 1, 'core pad note-off failed');
    } else if (action.type === 'killVoice') {
      assert(moduleKillVoice(module, action.voiceIndex) === 1, 'core pad kill-voice failed');
    } else if (action.type === 'allNotesOff') {
      moduleAllNotesOff(module);
    } else {
      throw new Error(`Unknown core pad action: ${action.type}`);
    }
  }
}

async function renderCoreModule(params, notes, blocks, actions = []) {
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
  const moduleKillVoice = requireExport(exports, 'kessho_module_kill_voice');
  const moduleAllNotesOff = requireExport(exports, 'kessho_module_all_notes_off');
  const moduleGetActiveVoiceCount = requireExport(exports, 'kessho_module_get_active_voice_count');
  const moduleProcessInterleaved = requireExport(exports, 'kessho_module_process_interleaved');

  const module = moduleCreate(moduleTypePad, sampleRate, blockSize);
  assert(module !== 0, 'core pad module setup failed');
  assert(moduleGetParamCount(module) === paramCount, 'core pad param count mismatch');

  let heap = new Float32Array(exports.memory.buffer);
  writeCoreParams(heap, moduleGetParamsPtr(module), params);
  moduleCommitParams(module);
  for (const note of notes) {
    const route = note.voiceIndex + note.pad * voicesPerPadModule;
    assert(
      moduleNoteOn(module, note.frequency, note.velocity, 0, route) === 1,
      'core pad note-on failed',
    );
  }

  const inputPtr = malloc(blockSize * 2 * Float32Array.BYTES_PER_ELEMENT);
  const outputPtr = malloc(blockSize * 2 * Float32Array.BYTES_PER_ELEMENT);
  assert(inputPtr !== 0 && outputPtr !== 0, 'core pad module allocation failed');
  heap = new Float32Array(exports.memory.buffer);
  const inputOffset = inputPtr >> 2;
  const outputOffset = outputPtr >> 2;
  heap.fill(0, inputOffset, inputOffset + blockSize * 2);

  const output = new Float32Array(blocks * blockSize * 2);
  for (let block = 0; block < blocks; block += 1) {
    heap = new Float32Array(exports.memory.buffer);
    heap.fill(0, outputOffset, outputOffset + blockSize * 2);
    runCoreActions(module, moduleNoteOff, moduleKillVoice, moduleAllNotesOff, actions, block);
    assert(
      moduleProcessInterleaved(module, inputPtr, outputPtr, blockSize) === 1,
      'core pad module process failed',
    );
    output.set(heap.subarray(outputOffset, outputOffset + blockSize * 2), block * blockSize * 2);
  }

  const finalActiveCount = moduleGetActiveVoiceCount(module);
  moduleDestroy(module);
  free(inputPtr);
  free(outputPtr);
  return { output, finalActiveCount };
}

async function renderCoreModuleTaps(params, notes, blocks, actions = []) {
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
  const moduleKillVoice = requireExport(exports, 'kessho_module_kill_voice');
  const moduleAllNotesOff = requireExport(exports, 'kessho_module_all_notes_off');
  const moduleGetActiveVoiceCount = requireExport(exports, 'kessho_module_get_active_voice_count');
  const moduleGetOutputTapCount = requireExport(exports, 'kessho_module_get_output_tap_count');
  const moduleProcessPlanarStereoTaps = requireExport(exports, 'kessho_module_process_planar_stereo_taps');

  const module = moduleCreate(moduleTypePad, sampleRate, blockSize);
  assert(module !== 0, 'core pad module setup failed');
  assert(moduleGetParamCount(module) === paramCount, 'core pad param count mismatch');
  const tapCount = moduleGetOutputTapCount(module);
  assert(tapCount === tapNames.length, `core pad output tap count mismatch: ${tapCount}`);

  let heap = new Float32Array(exports.memory.buffer);
  writeCoreParams(heap, moduleGetParamsPtr(module), params);
  moduleCommitParams(module);
  for (const note of notes) {
    const route = note.voiceIndex + note.pad * voicesPerPadModule;
    assert(
      moduleNoteOn(module, note.frequency, note.velocity, 0, route) === 1,
      'core pad note-on failed',
    );
  }

  const channelBytes = blockSize * Float32Array.BYTES_PER_ELEMENT;
  const inputLPtr = malloc(channelBytes);
  const inputRPtr = malloc(channelBytes);
  const outputLPtrs = Array.from({ length: tapCount }, () => malloc(channelBytes));
  const outputRPtrs = Array.from({ length: tapCount }, () => malloc(channelBytes));
  const outputLPtrArray = malloc(tapCount * Uint32Array.BYTES_PER_ELEMENT);
  const outputRPtrArray = malloc(tapCount * Uint32Array.BYTES_PER_ELEMENT);
  assert(
    inputLPtr !== 0 &&
      inputRPtr !== 0 &&
      outputLPtrArray !== 0 &&
      outputRPtrArray !== 0 &&
      outputLPtrs.every((ptr) => ptr !== 0) &&
      outputRPtrs.every((ptr) => ptr !== 0),
    'core pad module tap allocation failed',
  );

  heap = new Float32Array(exports.memory.buffer);
  let pointerHeap = new Uint32Array(exports.memory.buffer);
  heap.fill(0, inputLPtr >> 2, (inputLPtr >> 2) + blockSize);
  heap.fill(0, inputRPtr >> 2, (inputRPtr >> 2) + blockSize);
  pointerHeap.set(outputLPtrs, outputLPtrArray >> 2);
  pointerHeap.set(outputRPtrs, outputRPtrArray >> 2);

  const outputs = Array.from({ length: tapCount }, () => new Float32Array(blocks * blockSize * 2));
  for (let block = 0; block < blocks; block += 1) {
    heap = new Float32Array(exports.memory.buffer);
    pointerHeap = new Uint32Array(exports.memory.buffer);
    pointerHeap.set(outputLPtrs, outputLPtrArray >> 2);
    pointerHeap.set(outputRPtrs, outputRPtrArray >> 2);
    for (let tap = 0; tap < tapCount; tap += 1) {
      heap.fill(0, outputLPtrs[tap] >> 2, (outputLPtrs[tap] >> 2) + blockSize);
      heap.fill(0, outputRPtrs[tap] >> 2, (outputRPtrs[tap] >> 2) + blockSize);
    }
    runCoreActions(module, moduleNoteOff, moduleKillVoice, moduleAllNotesOff, actions, block);
    assert(
      moduleProcessPlanarStereoTaps(
        module,
        inputLPtr,
        inputRPtr,
        outputLPtrArray,
        outputRPtrArray,
        tapCount,
        blockSize,
      ) === 1,
      'core pad module tap process failed',
    );
    heap = new Float32Array(exports.memory.buffer);
    const outputOffset = block * blockSize * 2;
    for (let tap = 0; tap < tapCount; tap += 1) {
      const output = outputs[tap];
      const leftOffset = outputLPtrs[tap] >> 2;
      const rightOffset = outputRPtrs[tap] >> 2;
      for (let frame = 0; frame < blockSize; frame += 1) {
        output[outputOffset + frame * 2] = heap[leftOffset + frame];
        output[outputOffset + frame * 2 + 1] = heap[rightOffset + frame];
      }
    }
  }

  const finalActiveCount = moduleGetActiveVoiceCount(module);
  moduleDestroy(module);
  free(inputLPtr);
  free(inputRPtr);
  for (const ptr of outputLPtrs) free(ptr);
  for (const ptr of outputRPtrs) free(ptr);
  free(outputLPtrArray);
  free(outputRPtrArray);
  return { outputs, finalActiveCount };
}

async function assertCorePadResetClearsVoices() {
  const { exports } = await instantiateWasm(coreWasmPath);
  const malloc = requireExport(exports, 'malloc');
  const free = requireExport(exports, 'free');
  const moduleCreate = requireExport(exports, 'kessho_module_create');
  const moduleDestroy = requireExport(exports, 'kessho_module_destroy');
  const moduleReset = requireExport(exports, 'kessho_module_reset');
  const moduleGetParamsPtr = requireExport(exports, 'kessho_module_get_params_ptr');
  const moduleCommitParams = requireExport(exports, 'kessho_module_commit_params');
  const moduleNoteOn = requireExport(exports, 'kessho_module_note_on');
  const moduleGetActiveVoiceCount = requireExport(exports, 'kessho_module_get_active_voice_count');
  const moduleProcessInterleaved = requireExport(exports, 'kessho_module_process_interleaved');

  const module = moduleCreate(moduleTypePad, sampleRate, blockSize);
  assert(module !== 0, 'core pad reset module setup failed');
  const params = withParams((values) => {
    const base = padBase(1);
    values[base + oscAWave] = 2;
    values[base + oscBWave] = 3;
    values[base + oscBDetune] = 4;
    values[base + attack] = 0.004;
    values[base + release] = 0.08;
    values[base + level] = 0.57;
    values[paramOutputSelect] = 5;
  });

  let heap = new Float32Array(exports.memory.buffer);
  writeCoreParams(heap, moduleGetParamsPtr(module), params);
  moduleCommitParams(module);

  const inputPtr = malloc(blockSize * 2 * Float32Array.BYTES_PER_ELEMENT);
  const outputPtr = malloc(blockSize * 2 * Float32Array.BYTES_PER_ELEMENT);
  assert(inputPtr !== 0 && outputPtr !== 0, 'core pad reset allocation failed');

  const renderPeak = (blocks) => {
    let peak = 0;
    for (let block = 0; block < blocks; block += 1) {
      heap = new Float32Array(exports.memory.buffer);
      heap.fill(0, inputPtr >> 2, (inputPtr >> 2) + blockSize * 2);
      heap.fill(0, outputPtr >> 2, (outputPtr >> 2) + blockSize * 2);
      assert(moduleProcessInterleaved(module, inputPtr, outputPtr, blockSize) === 1, 'core pad reset render failed');
      heap = new Float32Array(exports.memory.buffer);
      for (let i = 0; i < blockSize * 2; i += 1) {
        peak = Math.max(peak, Math.abs(heap[(outputPtr >> 2) + i]));
      }
    }
    return peak;
  };

  assert(moduleNoteOn(module, 220, 0.76, 0, voicesPerPadModule) === 1, 'core pad reset note-on failed');
  assert(moduleGetActiveVoiceCount(module) === 1, 'core pad reset active count after note-on mismatch');
  assert(renderPeak(6) > 1e-5, 'core pad reset pre-reset note should render signal');
  moduleReset(module);
  assert(moduleGetActiveVoiceCount(module) === 0, 'core pad reset should clear active voices');
  assert(renderPeak(6) <= 1e-7, 'core pad reset should clear post-reset output');
  assert(moduleNoteOn(module, 220, 0.76, 0, voicesPerPadModule) === 1, 'core pad reset second note-on failed');
  assert(renderPeak(6) > 1e-5, 'core pad reset should preserve params for a second note');

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
    name: 'main-basic',
    params: withParams((params) => {
      params[padBase(0) + attack] = 0.01;
      params[padBase(0) + release] = 0.08;
      params[padBase(0) + level] = 0.55;
      params[paramOutputSelect] = 0;
    }),
    notes: [{ voiceIndex: 0, pad: 0, frequency: 220, velocity: 0.8 }],
    blocks: 12,
  },
  {
    name: 'reverb-send',
    params: withParams((params) => {
      params[padBase(0) + attack] = 0.01;
      params[padBase(0) + release] = 0.08;
      params[paramReverbSend] = 0.35;
      params[paramOutputSelect] = 1;
    }),
    notes: [{ voiceIndex: 1, pad: 0, frequency: 277.183, velocity: 0.72 }],
    blocks: 12,
  },
  {
    name: 'pad2-prefader',
    params: withParams((params) => {
      const base = padBase(1);
      params[base + oscAWave] = 2;
      params[base + oscBWave] = 1;
      params[base + oscBDetune] = 7;
      params[base + attack] = 0.02;
      params[base + release] = 0.1;
      params[paramOutputSelect] = 3;
    }),
    notes: [{ voiceIndex: 0, pad: 1, frequency: 330, velocity: 0.76 }],
    blocks: 12,
  },
  {
    name: 'filter-fold-lfo',
    params: withParams((params) => {
      const base = padBase(0);
      params[base + oscAWave] = 2;
      params[base + oscBWave] = 3;
      params[base + oscMix] = 0.38;
      params[base + hardness] = 0.42;
      params[base + foldAmount] = 0.27;
      params[base + foldMode] = 1;
      params[base + filterCutoffMin] = 180;
      params[base + filterCutoffMax] = 1800;
      params[base + filterResonance] = 0.22;
      params[base + filterBEnabled] = 1;
      params[base + filterBType] = 2;
      params[base + filterBCutoff] = 140;
      params[base + filterRouting] = 0;
      params[base + lfo1Rate] = 0.6;
      params[base + lfo1Depth] = 0.25;
      params[base + lfo1Dest] = 1;
      params[base + attack] = 0.01;
      params[base + release] = 0.08;
      params[paramOutputSelect] = 0;
    }),
    notes: [{ voiceIndex: 2, pad: 0, frequency: 246.942, velocity: 0.82 }],
    blocks: 14,
  },
  {
    name: 'pad2-postfader',
    params: withParams((params) => {
      const base = padBase(1);
      params[base + subEnabled] = 1;
      params[base + subLevel] = 0.35;
      params[base + noiseLevel] = 0.08;
      params[base + attack] = 0.01;
      params[base + release] = 0.12;
      params[base + level] = 0.44;
      params[paramOutputSelect] = 5;
    }),
    notes: [{ voiceIndex: 3, pad: 1, frequency: 196, velocity: 0.7 }],
    blocks: 14,
  },
  {
    name: 'note-off-release',
    params: withParams((params) => {
      const base = padBase(0);
      params[base + attack] = 0.005;
      params[base + release] = 0.03;
      params[base + level] = 0.62;
      params[paramOutputSelect] = 0;
    }),
    notes: [{ voiceIndex: 4, pad: 0, frequency: 261.626, velocity: 0.74 }],
    actions: [{ block: 4, type: 'noteOff', voiceIndex: 4 }],
    blocks: 28,
    expectedFinalActiveCount: 0,
  },
  {
    name: 'pad2-note-off-release',
    params: withParams((params) => {
      const base = padBase(1);
      params[base + oscAWave] = 3;
      params[base + oscBWave] = 1;
      params[base + oscBDetune] = -9;
      params[base + attack] = 0.006;
      params[base + release] = 0.035;
      params[base + level] = 0.58;
      params[paramOutputSelect] = 5;
    }),
    notes: [{ voiceIndex: 2, pad: 1, frequency: 220, velocity: 0.76 }],
    actions: [{ block: 5, type: 'noteOff', voiceIndex: 2 }],
    blocks: 38,
    expectedFinalActiveCount: 0,
  },
  {
    name: 'all-notes-off-release-drain',
    params: withParams((params) => {
      const pad1 = padBase(0);
      params[pad1 + attack] = 0.004;
      params[pad1 + release] = 0.03;
      params[pad1 + level] = 0.5;

      const pad2 = padBase(1);
      params[pad2 + oscAWave] = 2;
      params[pad2 + attack] = 0.004;
      params[pad2 + release] = 0.04;
      params[pad2 + level] = 0.46;
      params[paramOutputSelect] = 0;
    }),
    notes: [
      { voiceIndex: 0, pad: 0, frequency: 261.626, velocity: 0.74 },
      { voiceIndex: 1, pad: 1, frequency: 329.628, velocity: 0.69 },
    ],
    actions: [{ block: 5, type: 'allNotesOff' }],
    blocks: 42,
    expectedFinalActiveCount: 0,
  },
  {
    name: 'kill-voice-hard-stop',
    params: withParams((params) => {
      const base = padBase(1);
      params[base + attack] = 0.005;
      params[base + release] = 0.25;
      params[base + level] = 0.7;
      params[paramOutputSelect] = 5;
    }),
    notes: [{ voiceIndex: 5, pad: 1, frequency: 174.614, velocity: 0.8 }],
    actions: [{ block: 3, type: 'killVoice', voiceIndex: 5 }],
    blocks: 10,
  },
];

{
  const { exports } = await instantiateWasm(coreWasmPath);
  const moduleSelfCheck = requireExport(exports, 'kessho_module_self_check');
  assert(moduleSelfCheck(moduleTypePad, sampleRate, blockSize) === 1, 'core pad module self-check failed');
}

await assertCorePadResetClearsVoices();

const results = [];
for (const testCase of cases) {
  const standalone = await renderStandalone(
    testCase.params,
    testCase.notes,
    testCase.blocks,
    testCase.actions ?? [],
  );
  const core = await renderCoreModule(
    testCase.params,
    testCase.notes,
    testCase.blocks,
    testCase.actions ?? [],
  );
  const residual = diffStats(standalone.output, core.output);
  assert(
    residual.rms <= residualRmsThreshold && residual.peak <= residualPeakThreshold,
    `${testCase.name} pad module parity drift too high: RMS ${residual.rms}, peak ${residual.peak}`,
  );
  assert(residual.signalPeak > 1.0e-5, `${testCase.name} produced no pad signal`);
  assert(
    standalone.finalActiveCount === core.finalActiveCount,
    `${testCase.name} active count mismatch: standalone ${standalone.finalActiveCount}, core ${core.finalActiveCount}`,
  );
  if (typeof testCase.expectedFinalActiveCount === 'number') {
    assert(
      core.finalActiveCount === testCase.expectedFinalActiveCount,
      `${testCase.name} expected ${testCase.expectedFinalActiveCount} active voices, got ${core.finalActiveCount}`,
    );
  }
  results.push(
    `${testCase.name}: RMS ${residual.rms.toExponential(3)}, peak ${residual.peak.toExponential(3)}`,
  );
}

const multiTapCase = {
  name: 'multi-tap',
  params: withParams((params) => {
    const pad1 = padBase(0);
    params[pad1 + oscAWave] = 2;
    params[pad1 + oscBWave] = 1;
    params[pad1 + oscBDetune] = -5;
    params[pad1 + oscMix] = 0.42;
    params[pad1 + attack] = 0.008;
    params[pad1 + release] = 0.11;
    params[pad1 + level] = 0.63;

    const pad2 = padBase(1);
    params[pad2 + oscAWave] = 3;
    params[pad2 + oscBWave] = 0;
    params[pad2 + oscBDetune] = 6;
    params[pad2 + subEnabled] = 1;
    params[pad2 + subLevel] = 0.28;
    params[pad2 + attack] = 0.012;
    params[pad2 + release] = 0.14;
    params[pad2 + level] = 0.48;

    params[paramReverbSend] = 0.31;
    params[paramOutputSelect] = 0;
  }),
  notes: [
    { voiceIndex: 0, pad: 0, frequency: 220, velocity: 0.78 },
    { voiceIndex: 1, pad: 1, frequency: 329.628, velocity: 0.71 },
  ],
  blocks: 16,
};

const standaloneTaps = await renderStandaloneTaps(
  multiTapCase.params,
  multiTapCase.notes,
  multiTapCase.blocks,
  multiTapCase.actions ?? [],
);
const coreTaps = await renderCoreModuleTaps(
  multiTapCase.params,
  multiTapCase.notes,
  multiTapCase.blocks,
  multiTapCase.actions ?? [],
);
assert(
  standaloneTaps.finalActiveCount === coreTaps.finalActiveCount,
  `${multiTapCase.name} active count mismatch: standalone ${standaloneTaps.finalActiveCount}, core ${coreTaps.finalActiveCount}`,
);
for (let tap = 0; tap < tapNames.length; tap += 1) {
  const tapName = tapNames[tap];
  const residual = diffStats(standaloneTaps.outputs[tap], coreTaps.outputs[tap]);
  assert(
    residual.rms <= residualRmsThreshold && residual.peak <= residualPeakThreshold,
    `${multiTapCase.name} ${tapName} pad module parity drift too high: RMS ${residual.rms}, peak ${residual.peak}`,
  );
  assert(residual.signalPeak > 1.0e-5, `${multiTapCase.name} ${tapName} produced no pad signal`);
  results.push(
    `${multiTapCase.name}/${tapName}: RMS ${residual.rms.toExponential(3)}, peak ${residual.peak.toExponential(3)}`,
  );
}

console.log(`KesshoCore pad module parity passed: ${results.join('; ')}`);
