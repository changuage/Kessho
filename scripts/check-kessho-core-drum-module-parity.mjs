import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const standaloneWasmPath = resolve(root, 'public/worklets/kessho_drum.wasm');
const coreWasmPath = resolve(root, 'public/worklets/kessho_core.wasm');
const sampleRate = 48000;
const blockSize = 128;
const moduleTypeDrum = 8;

const drumVoiceSub = 0;
const drumVoiceKick = 1;
const drumVoiceClick = 2;
const drumVoiceBeepHi = 3;
const drumVoiceBeepLo = 4;
const drumVoiceNoise = 5;
const drumVoiceMembrane = 6;
const drumNumVoiceTypes = 7;

const paramSub = 0;
const paramKick = paramSub + 12;
const paramClick = paramKick + 13;
const paramBeepHi = paramClick + 15;
const paramBeepLo = paramBeepHi + 19;
const paramNoise = paramBeepLo + 19;
const paramMembrane = paramNoise + 14;
const paramDelay = paramMembrane + 12;
const paramDelaySends = paramDelay + 6;
const paramTrigger = paramDelaySends + drumNumVoiceTypes;
const paramMasterLevel = paramTrigger + 5;
const paramReverbSend = paramMasterLevel + 1;
const paramSeed = paramMasterLevel + 2;
const paramOutputSelect = paramMasterLevel + 3;
const paramCount = paramOutputSelect + 1;

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

  params[paramSub + 0] = 60;
  params[paramSub + 1] = 200;
  params[paramSub + 2] = 0.8;
  params[paramSub + 3] = 0;
  params[paramSub + 4] = 0;
  params[paramSub + 5] = 0;
  params[paramSub + 6] = 50;
  params[paramSub + 7] = 0;
  params[paramSub + 8] = 0;
  params[paramSub + 9] = 0;
  params[paramSub + 10] = 0;
  params[paramSub + 11] = 0.5;

  params[paramKick + 0] = 55;
  params[paramKick + 1] = 24;
  params[paramKick + 2] = 60;
  params[paramKick + 3] = 300;
  params[paramKick + 4] = 0.8;
  params[paramKick + 5] = 0.3;
  params[paramKick + 6] = 0.5;
  params[paramKick + 7] = 0.5;
  params[paramKick + 8] = 0;
  params[paramKick + 9] = 0;
  params[paramKick + 10] = 0;
  params[paramKick + 11] = 0;
  params[paramKick + 12] = 0.5;

  params[paramClick + 0] = 30;
  params[paramClick + 1] = 4000;
  params[paramClick + 2] = 0.5;
  params[paramClick + 3] = 0.7;
  params[paramClick + 4] = 0.5;
  params[paramClick + 5] = 2000;
  params[paramClick + 6] = 0;
  params[paramClick + 7] = 0;
  params[paramClick + 8] = 1;
  params[paramClick + 9] = 0;
  params[paramClick + 10] = 0;
  params[paramClick + 11] = 0;
  params[paramClick + 12] = 0;
  params[paramClick + 13] = 0;
  params[paramClick + 14] = 0.5;

  params[paramBeepHi + 0] = 4000;
  params[paramBeepHi + 1] = 1;
  params[paramBeepHi + 2] = 100;
  params[paramBeepHi + 3] = 0.6;
  params[paramBeepHi + 4] = 0.3;
  params[paramBeepHi + 5] = 0;
  params[paramBeepHi + 6] = 1;
  params[paramBeepHi + 7] = 0;
  params[paramBeepHi + 8] = 4;
  params[paramBeepHi + 9] = 0.5;
  params[paramBeepHi + 10] = 0;
  params[paramBeepHi + 11] = 0;
  params[paramBeepHi + 12] = 0;
  params[paramBeepHi + 13] = 2;
  params[paramBeepHi + 14] = 0.01;
  params[paramBeepHi + 15] = 0.2;
  params[paramBeepHi + 16] = 0;
  params[paramBeepHi + 17] = 0;
  params[paramBeepHi + 18] = 0.5;

  params[paramBeepLo + 0] = 200;
  params[paramBeepLo + 1] = 1;
  params[paramBeepLo + 2] = 200;
  params[paramBeepLo + 3] = 0.7;
  params[paramBeepLo + 4] = 0;
  params[paramBeepLo + 5] = 0;
  params[paramBeepLo + 6] = 50;
  params[paramBeepLo + 7] = 0.3;
  params[paramBeepLo + 8] = 0;
  params[paramBeepLo + 9] = 0.5;
  params[paramBeepLo + 10] = 0;
  params[paramBeepLo + 11] = 10;
  params[paramBeepLo + 12] = 0;
  params[paramBeepLo + 13] = 0;
  params[paramBeepLo + 14] = 0;
  params[paramBeepLo + 15] = 1;
  params[paramBeepLo + 16] = 1;
  params[paramBeepLo + 17] = 0;
  params[paramBeepLo + 18] = 0.5;

  params[paramNoise + 0] = 2000;
  params[paramNoise + 1] = 100;
  params[paramNoise + 2] = 0.6;
  params[paramNoise + 3] = 1;
  params[paramNoise + 4] = 0;
  params[paramNoise + 5] = 1;
  params[paramNoise + 6] = 0;
  params[paramNoise + 7] = 0;
  params[paramNoise + 8] = 0;
  params[paramNoise + 9] = 100;
  params[paramNoise + 10] = 1;
  params[paramNoise + 11] = 0;
  params[paramNoise + 12] = 0;
  params[paramNoise + 13] = 0.5;

  params[paramMembrane + 0] = 150;
  params[paramMembrane + 1] = 500;
  params[paramMembrane + 2] = 0.7;
  params[paramMembrane + 3] = 0.5;
  params[paramMembrane + 4] = 0;
  params[paramMembrane + 5] = 150;
  params[paramMembrane + 6] = 0.3;
  params[paramMembrane + 7] = 0.5;
  params[paramMembrane + 8] = 0;
  params[paramMembrane + 9] = 1;
  params[paramMembrane + 10] = 0;
  params[paramMembrane + 11] = 0.5;

  params[paramDelay + 0] = 0;
  params[paramDelay + 1] = 0;
  params[paramDelay + 2] = 0;
  params[paramDelay + 3] = 0.4;
  params[paramDelay + 4] = 4000;
  params[paramDelay + 5] = 0.3;

  params[paramTrigger + 0] = -1;
  params[paramTrigger + 1] = -1;
  params[paramTrigger + 2] = 0;
  params[paramTrigger + 3] = 1.0e10;
  params[paramTrigger + 4] = 1.0e10;

  params[paramMasterLevel] = 0.8;
  params[paramReverbSend] = 0.1;
  params[paramSeed] = 42;
  params[paramOutputSelect] = 0;
  return params;
}

function withParams(configure) {
  const params = makeDefaultParams();
  configure(params);
  return params;
}

function writeCoreParams(heap, ptr, params) {
  heap.set(params, ptr >> 2);
}

function applyStandaloneParams(exports, params) {
  const call = (name, ...args) => requireExport(exports, name)(...args);

  call('drum_set_sub_freq', params[paramSub + 0]);
  call('drum_set_sub_decay', params[paramSub + 1]);
  call('drum_set_sub_level', params[paramSub + 2]);
  call('drum_set_sub_tone', params[paramSub + 3]);
  call('drum_set_sub_shape', params[paramSub + 4]);
  call('drum_set_sub_pitch_env', params[paramSub + 5]);
  call('drum_set_sub_pitch_decay', params[paramSub + 6]);
  call('drum_set_sub_drive', params[paramSub + 7]);
  call('drum_set_sub_sub_octave', params[paramSub + 8]);
  call('drum_set_sub_attack', params[paramSub + 9]);
  call('drum_set_sub_variation', params[paramSub + 10]);
  call('drum_set_sub_distance', params[paramSub + 11]);

  call('drum_set_kick_freq', params[paramKick + 0]);
  call('drum_set_kick_pitch_env', params[paramKick + 1]);
  call('drum_set_kick_pitch_decay', params[paramKick + 2]);
  call('drum_set_kick_decay', params[paramKick + 3]);
  call('drum_set_kick_level', params[paramKick + 4]);
  call('drum_set_kick_click', params[paramKick + 5]);
  call('drum_set_kick_body', params[paramKick + 6]);
  call('drum_set_kick_punch', params[paramKick + 7]);
  call('drum_set_kick_tail', params[paramKick + 8]);
  call('drum_set_kick_tone', params[paramKick + 9]);
  call('drum_set_kick_attack', params[paramKick + 10]);
  call('drum_set_kick_variation', params[paramKick + 11]);
  call('drum_set_kick_distance', params[paramKick + 12]);

  call('drum_set_click_decay', params[paramClick + 0]);
  call('drum_set_click_filter', params[paramClick + 1]);
  call('drum_set_click_tone', params[paramClick + 2]);
  call('drum_set_click_level', params[paramClick + 3]);
  call('drum_set_click_resonance', params[paramClick + 4]);
  call('drum_set_click_pitch', params[paramClick + 5]);
  call('drum_set_click_pitch_env', params[paramClick + 6]);
  call('drum_set_click_mode', Math.round(params[paramClick + 7]));
  call('drum_set_click_grain_count', Math.round(params[paramClick + 8]));
  call('drum_set_click_grain_spread', params[paramClick + 9]);
  call('drum_set_click_stereo_width', params[paramClick + 10]);
  call('drum_set_click_exciter_color', params[paramClick + 11]);
  call('drum_set_click_attack', params[paramClick + 12]);
  call('drum_set_click_variation', params[paramClick + 13]);
  call('drum_set_click_distance', params[paramClick + 14]);

  call('drum_set_beep_hi_freq', params[paramBeepHi + 0]);
  call('drum_set_beep_hi_attack', params[paramBeepHi + 1]);
  call('drum_set_beep_hi_decay', params[paramBeepHi + 2]);
  call('drum_set_beep_hi_level', params[paramBeepHi + 3]);
  call('drum_set_beep_hi_tone', params[paramBeepHi + 4]);
  call('drum_set_beep_hi_inharmonic', params[paramBeepHi + 5]);
  call('drum_set_beep_hi_partials', Math.round(params[paramBeepHi + 6]));
  call('drum_set_beep_hi_shimmer', params[paramBeepHi + 7]);
  call('drum_set_beep_hi_shimmer_rate', params[paramBeepHi + 8]);
  call('drum_set_beep_hi_brightness', params[paramBeepHi + 9]);
  call('drum_set_beep_hi_feedback', params[paramBeepHi + 10]);
  call('drum_set_beep_hi_mod_env_decay', params[paramBeepHi + 11]);
  call('drum_set_beep_hi_noise_in_mod', params[paramBeepHi + 12]);
  call('drum_set_beep_hi_mod_ratio', params[paramBeepHi + 13]);
  call('drum_set_beep_hi_mod_ratio_fine', params[paramBeepHi + 14]);
  call('drum_set_beep_hi_mod_env_end', params[paramBeepHi + 15]);
  call('drum_set_beep_hi_noise_decay', params[paramBeepHi + 16]);
  call('drum_set_beep_hi_variation', params[paramBeepHi + 17]);
  call('drum_set_beep_hi_distance', params[paramBeepHi + 18]);

  call('drum_set_beep_lo_freq', params[paramBeepLo + 0]);
  call('drum_set_beep_lo_attack', params[paramBeepLo + 1]);
  call('drum_set_beep_lo_decay', params[paramBeepLo + 2]);
  call('drum_set_beep_lo_level', params[paramBeepLo + 3]);
  call('drum_set_beep_lo_tone', params[paramBeepLo + 4]);
  call('drum_set_beep_lo_pitch_env', params[paramBeepLo + 5]);
  call('drum_set_beep_lo_pitch_decay', params[paramBeepLo + 6]);
  call('drum_set_beep_lo_body', params[paramBeepLo + 7]);
  call('drum_set_beep_lo_pluck', params[paramBeepLo + 8]);
  call('drum_set_beep_lo_pluck_damp', params[paramBeepLo + 9]);
  call('drum_set_beep_lo_modal', params[paramBeepLo + 10]);
  call('drum_set_beep_lo_modal_q', params[paramBeepLo + 11]);
  call('drum_set_beep_lo_modal_inharmonic', params[paramBeepLo + 12]);
  call('drum_set_beep_lo_modal_spread', params[paramBeepLo + 13]);
  call('drum_set_beep_lo_modal_cut', params[paramBeepLo + 14]);
  call('drum_set_beep_lo_osc_gain', params[paramBeepLo + 15]);
  call('drum_set_beep_lo_modal_gain', params[paramBeepLo + 16]);
  call('drum_set_beep_lo_variation', params[paramBeepLo + 17]);
  call('drum_set_beep_lo_distance', params[paramBeepLo + 18]);

  call('drum_set_noise_freq', params[paramNoise + 0]);
  call('drum_set_noise_decay', params[paramNoise + 1]);
  call('drum_set_noise_level', params[paramNoise + 2]);
  call('drum_set_noise_q', params[paramNoise + 3]);
  call('drum_set_noise_filter_type', Math.round(params[paramNoise + 4]));
  call('drum_set_noise_attack', params[paramNoise + 5]);
  call('drum_set_noise_formant', params[paramNoise + 6]);
  call('drum_set_noise_breath', params[paramNoise + 7]);
  call('drum_set_noise_filter_env_depth', params[paramNoise + 8]);
  call('drum_set_noise_filter_env_decay', params[paramNoise + 9]);
  call('drum_set_noise_density', params[paramNoise + 10]);
  call('drum_set_noise_color_lfo', params[paramNoise + 11]);
  call('drum_set_noise_variation', params[paramNoise + 12]);
  call('drum_set_noise_distance', params[paramNoise + 13]);

  call('drum_set_membrane_freq', params[paramMembrane + 0]);
  call('drum_set_membrane_decay', params[paramMembrane + 1]);
  call('drum_set_membrane_level', params[paramMembrane + 2]);
  call('drum_set_membrane_tension', params[paramMembrane + 3]);
  call('drum_set_membrane_material', params[paramMembrane + 4]);
  call('drum_set_membrane_size', params[paramMembrane + 5]);
  call('drum_set_membrane_damping', params[paramMembrane + 6]);
  call('drum_set_membrane_strike', params[paramMembrane + 7]);
  call('drum_set_membrane_wire_buzz', params[paramMembrane + 8]);
  call('drum_set_membrane_attack', params[paramMembrane + 9]);
  call('drum_set_membrane_variation', params[paramMembrane + 10]);
  call('drum_set_membrane_distance', params[paramMembrane + 11]);

  call('drum_set_delay_enabled', params[paramDelay + 0] > 0.5 ? 1 : 0);
  call('drum_set_delay_time_l', params[paramDelay + 1]);
  call('drum_set_delay_time_r', params[paramDelay + 2]);
  call('drum_set_delay_feedback', params[paramDelay + 3]);
  call('drum_set_delay_filter', params[paramDelay + 4]);
  call('drum_set_delay_mix', params[paramDelay + 5]);
  for (let voice = 0; voice < drumNumVoiceTypes; voice += 1) {
    call('drum_set_delay_send', voice, params[paramDelaySends + voice]);
  }

  if (params[paramTrigger + 0] >= 0) {
    call('drum_set_trigger_morph', params[paramTrigger + 0]);
  }
  if (params[paramTrigger + 1] >= 0) {
    call('drum_set_trigger_distance', params[paramTrigger + 1]);
  }
  call('drum_set_trigger_pitch', params[paramTrigger + 2]);
  call('drum_set_trigger_ratchet_cap', params[paramTrigger + 3], params[paramTrigger + 4]);
  call('drum_set_master_level', params[paramMasterLevel]);
  call('drum_set_reverb_send', params[paramReverbSend]);
  call('drum_set_rng_seed', Math.max(0, Math.round(params[paramSeed])));
}

function copySelected(heap, ptrs, output, outputOffset, frames, select) {
  const sourcePtr = ptrs[Math.max(0, Math.min(1, Math.round(select)))] ?? ptrs[0];
  const sourceOffset = sourcePtr >> 2;
  output.set(heap.subarray(sourceOffset, sourceOffset + frames * 2), outputOffset);
}

function triggerStandalone(exports, triggers) {
  const trigger = requireExport(exports, 'drum_trigger');
  for (const event of triggers) {
    trigger(event.voiceType, event.velocity, event.sampleOffset ?? 0);
  }
}

async function renderStandalone(params, triggers, blocks) {
  const { exports } = await instantiateWasm(standaloneWasmPath);
  const init = requireExport(exports, 'drum_init');
  const destroy = requireExport(exports, 'drum_destroy');
  const processBlock = requireExport(exports, 'drum_process_block');
  const activeCount = requireExport(exports, 'drum_get_active_count');

  assert(init(sampleRate) === 0, 'standalone drum init failed');
  applyStandaloneParams(exports, params);
  triggerStandalone(exports, triggers);

  const ptrs = [
    requireExport(exports, 'drum_get_output_ptr')(),
    requireExport(exports, 'drum_get_reverb_send_ptr')(),
  ];

  const output = new Float32Array(blocks * blockSize * 2);
  for (let block = 0; block < blocks; block += 1) {
    processBlock(blockSize);
    const heap = new Float32Array(exports.memory.buffer);
    copySelected(heap, ptrs, output, block * blockSize * 2, blockSize, params[paramOutputSelect]);
  }

  const finalActiveCount = activeCount();
  destroy();
  return { output, finalActiveCount };
}

async function renderCoreModule(params, triggers, blocks) {
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

  const module = moduleCreate(moduleTypeDrum, sampleRate, blockSize);
  assert(module !== 0, 'core drum module setup failed');
  assert(moduleGetParamCount(module) === paramCount, 'core drum param count mismatch');

  let heap = new Float32Array(exports.memory.buffer);
  writeCoreParams(heap, moduleGetParamsPtr(module), params);
  moduleCommitParams(module);
  for (const event of triggers) {
    assert(
      moduleNoteOn(module, 0, event.velocity, event.sampleOffset ?? 0, event.voiceType) === 1,
      'core drum note-on failed',
    );
  }

  const inputPtr = malloc(blockSize * 2 * Float32Array.BYTES_PER_ELEMENT);
  const outputPtr = malloc(blockSize * 2 * Float32Array.BYTES_PER_ELEMENT);
  assert(inputPtr !== 0 && outputPtr !== 0, 'core drum module allocation failed');
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
      'core drum module process failed',
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

const cases = [
  {
    name: 'kick-main',
    params: withParams((params) => {
      params[paramKick + 3] = 160;
      params[paramKick + 4] = 0.72;
      params[paramKick + 5] = 0.45;
      params[paramOutputSelect] = 0;
    }),
    triggers: [{ voiceType: drumVoiceKick, velocity: 0.84 }],
    blocks: 8,
  },
  {
    name: 'click-impulse',
    params: withParams((params) => {
      params[paramClick + 3] = 0.82;
      params[paramClick + 7] = 0;
      params[paramClick + 11] = 0.0;
      params[paramOutputSelect] = 0;
    }),
    triggers: [{ voiceType: drumVoiceClick, velocity: 0.78 }],
    blocks: 8,
  },
  {
    name: 'beep-hi-basic',
    params: withParams((params) => {
      params[paramBeepHi + 3] = 0.74;
      params[paramBeepHi + 4] = 0.45;
      params[paramOutputSelect] = 0;
    }),
    triggers: [{ voiceType: drumVoiceBeepHi, velocity: 0.74 }],
    blocks: 10,
  },
  {
    name: 'kick-reverb',
    params: withParams((params) => {
      params[paramKick + 3] = 180;
      params[paramKick + 4] = 0.7;
      params[paramReverbSend] = 0.36;
      params[paramOutputSelect] = 1;
    }),
    triggers: [{ voiceType: drumVoiceKick, velocity: 0.8 }],
    blocks: 8,
  },
  {
    name: 'delay-kick',
    params: withParams((params) => {
      params[paramDelay + 0] = 1;
      params[paramDelay + 1] = 48;
      params[paramDelay + 2] = 96;
      params[paramDelay + 3] = 0.28;
      params[paramDelay + 5] = 0.42;
      params[paramDelaySends + drumVoiceKick] = 0.55;
      params[paramKick + 3] = 90;
      params[paramOutputSelect] = 0;
    }),
    triggers: [{ voiceType: drumVoiceKick, velocity: 0.76 }],
    blocks: 12,
  },
  {
    name: 'sub-membrane-layer',
    params: withParams((params) => {
      params[paramSub + 1] = 180;
      params[paramSub + 2] = 0.5;
      params[paramMembrane + 1] = 260;
      params[paramMembrane + 2] = 0.44;
      params[paramMembrane + 8] = 0.18;
      params[paramOutputSelect] = 0;
    }),
    triggers: [
      { voiceType: drumVoiceSub, velocity: 0.62 },
      { voiceType: drumVoiceMembrane, velocity: 0.68 },
    ],
    blocks: 10,
  },
  {
    name: 'beep-lo-modal',
    params: withParams((params) => {
      params[paramBeepLo + 3] = 0.68;
      params[paramBeepLo + 8] = 0.2;
      params[paramBeepLo + 10] = 0.55;
      params[paramBeepLo + 11] = 16;
      params[paramBeepLo + 16] = 0.75;
      params[paramOutputSelect] = 0;
    }),
    triggers: [{ voiceType: drumVoiceBeepLo, velocity: 0.7 }],
    blocks: 10,
  },
];

const results = [];
for (const testCase of cases) {
  const standalone = await renderStandalone(testCase.params, testCase.triggers, testCase.blocks);
  const core = await renderCoreModule(testCase.params, testCase.triggers, testCase.blocks);
  const residual = diffStats(standalone.output, core.output);
  assert(
    residual.rms <= 1.0e-7 && residual.peak <= 1.0e-6,
    `${testCase.name} drum module parity drift too high: RMS ${residual.rms}, peak ${residual.peak}`,
  );
  assert(residual.signalPeak > 1.0e-5, `${testCase.name} produced no drum signal`);
  assert(
    standalone.finalActiveCount === core.finalActiveCount,
    `${testCase.name} active count mismatch: standalone ${standalone.finalActiveCount}, core ${core.finalActiveCount}`,
  );
  results.push(
    `${testCase.name}: RMS ${residual.rms.toExponential(3)}, peak ${residual.peak.toExponential(3)}`,
  );
}

console.log(`KesshoCore drum module parity passed: ${results.join('; ')}`);
