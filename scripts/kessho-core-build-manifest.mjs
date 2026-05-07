import { resolve } from 'node:path';

export const kesshoCoreSourceFiles = Object.freeze([
  'cpp/KesshoCore/src/KesshoEngine.cpp',
  'cpp/KesshoCore/src/KesshoTransport.cpp',
  'cpp/KesshoCore/src/KesshoParams.cpp',
  'cpp/KesshoCore/src/KesshoEvents.cpp',
  'cpp/KesshoCore/src/KesshoRender.cpp',
  'cpp/KesshoCore/src/KesshoMidi.cpp',
  'cpp/KesshoCore/src/KesshoMixer.cpp',
  'cpp/KesshoCore/src/modules/KesshoModules.cpp',
  'cpp/KesshoCore/src/modules/KesshoDynamicsCharacterModule.cpp',
  'cpp/KesshoCore/src/modules/KesshoDynamicsDegradeModule.cpp',
  'cpp/KesshoCore/src/modules/KesshoReverbModule.cpp',
  'cpp/KesshoCore/src/modules/KesshoGranularModule.cpp',
  'cpp/KesshoCore/src/modules/KesshoSpectralFreezeModule.cpp',
  'cpp/KesshoCore/src/modules/KesshoLeadFmModule.cpp',
  'cpp/KesshoCore/src/modules/KesshoPadModule.cpp',
  'cpp/KesshoCore/src/modules/KesshoDrumModule.cpp',
  'cpp/KesshoCore/src/modules/KesshoSoundscapesModule.cpp',
  'cpp/KesshoCore/src/modules/KesshoDelayAModule.cpp',
  'cpp/KesshoCore/src/modules/KesshoDelayBModule.cpp',
  'wasm/dynamics-character/kessho_dynamics_character.cpp',
  'wasm/dynamics-degrade/kessho_dynamics_degrade.cpp',
  'wasm/reverb/kessho_reverb.cpp',
  'wasm/granular-fx/kessho_granular.cpp',
  'wasm/spectral-freeze/kessho_spectral_freeze.cpp',
  'wasm/lead-fm/kessho_lead_fm.cpp',
  'wasm/pad/kessho_pad.cpp',
  'wasm/drum/kessho_drum.cpp',
  'wasm/soundscapes/kessho_soundscapes.cpp',
]);

export const kesshoCoreIncludeDirs = Object.freeze([
  'cpp/KesshoCore/include',
  'wasm/dynamics-character',
  'wasm/dynamics-degrade',
  'wasm/reverb',
  'wasm/granular-fx',
  'wasm/spectral-freeze',
  'wasm/lead-fm',
  'wasm/pad',
  'wasm/drum',
  'wasm/soundscapes',
]);

export const kesshoCoreWasmExportedFunctions = Object.freeze([
  'malloc',
  'free',
  'kessho_get_abi_version',
  'kessho_create',
  'kessho_destroy',
  'kessho_reset',
  'kessho_start',
  'kessho_stop',
  'kessho_is_running',
  'kessho_set_render_mode',
  'kessho_set_smoke_tone',
  'kessho_apply_snapshot_v1',
  'kessho_set_transport_signature',
  'kessho_push_param_event',
  'kessho_push_midi_event',
  'kessho_push_transport_event',
  'kessho_get_event_queue_depth',
  'kessho_get_midi_events_processed',
  'kessho_set_seed',
  'kessho_get_seed',
  'kessho_next_random_float',
  'kessho_render',
  'kessho_get_sample_frame',
  'kessho_get_sample_rate',
  'kessho_get_max_block_size',
  'kessho_get_stats',
  'kessho_get_transport_info',
  'kessho_module_create',
  'kessho_module_destroy',
  'kessho_module_reset',
  'kessho_module_self_check',
  'kessho_module_get_param_count',
  'kessho_module_get_params_ptr',
  'kessho_module_commit_params',
  'kessho_module_note_on',
  'kessho_module_note_off',
  'kessho_module_kill_voice',
  'kessho_module_all_notes_off',
  'kessho_module_get_active_voice_count',
  'kessho_module_get_output_tap_count',
  'kessho_module_process_interleaved',
  'kessho_module_process_planar_stereo',
  'kessho_module_process_planar_stereo_taps',
  'kessho_mixer_create',
  'kessho_mixer_destroy',
  'kessho_mixer_clear_routes',
  'kessho_mixer_set_route',
  'kessho_mixer_get_route',
  'kessho_mixer_get_stats',
  'kessho_mixer_process_planar_stereo',
]);

export function resolveKesshoCoreSources(root) {
  return kesshoCoreSourceFiles.map((file) => resolve(root, file));
}

export function resolveKesshoCoreIncludeDirs(root) {
  return kesshoCoreIncludeDirs.map((dir) => resolve(root, dir));
}

export function kesshoCoreIncludeArgs(root) {
  return resolveKesshoCoreIncludeDirs(root).map((dir) => `-I${dir}`);
}

export function formatEmscriptenExportedFunctions() {
  const exports = kesshoCoreWasmExportedFunctions.map((name) => `'_${name}'`).join(',');
  return `-sEXPORTED_FUNCTIONS=[${exports}]`;
}
