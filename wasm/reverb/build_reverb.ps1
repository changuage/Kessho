$exports = @(
  '_reverb_init',
  '_reverb_destroy',
  '_reverb_get_input_ptr',
  '_reverb_get_output_ptr',
  '_reverb_process_block',
  '_reverb_set_type',
  '_reverb_set_quality',
  '_reverb_set_params',
  '_reverb_set_shimmer',
  '_reverb_set_slow_mod',
  '_reverb_set_reverse',
  '_reverb_set_chorus',
  '_reverb_set_mod_character',
  '_reverb_set_multiband_damp',
  '_reverb_set_input_tone',
  '_reverb_set_shimmer_feedback',
  '_reverb_set_warp',
  '_reverb_set_cross_feed',
  '_reverb_set_early_reflections',
  '_reverb_set_air_absorption',
  '_reverb_set_saturation_mode',
  '_reverb_set_transient_smooth',
  '_reverb_set_er_lp_freq',
  '_reverb_instance_create',
  '_reverb_instance_destroy',
  '_reverb_instance_reset',
  '_reverb_instance_get_input_ptr',
  '_reverb_instance_get_output_ptr',
  '_reverb_instance_process_block',
  '_reverb_instance_set_type',
  '_reverb_instance_set_quality',
  '_reverb_instance_set_params',
  '_reverb_instance_set_shimmer',
  '_reverb_instance_set_slow_mod',
  '_reverb_instance_set_reverse',
  '_reverb_instance_set_chorus',
  '_reverb_instance_set_mod_character',
  '_reverb_instance_set_multiband_damp',
  '_reverb_instance_set_input_tone',
  '_reverb_instance_set_shimmer_feedback',
  '_reverb_instance_set_warp',
  '_reverb_instance_set_cross_feed',
  '_reverb_instance_set_early_reflections',
  '_reverb_instance_set_air_absorption',
  '_reverb_instance_set_saturation_mode',
  '_reverb_instance_set_transient_smooth',
  '_reverb_instance_set_er_lp_freq',
  '_malloc',
  '_free'
) -join ','

emcc kessho_reverb.cpp `
  -o kessho_reverb.wasm `
  -std=c++17 `
  -O3 `
  -flto `
  -fno-math-errno `
  -freciprocal-math `
  -fno-trapping-math `
  -msimd128 `
  -DNDEBUG `
  -sALLOW_MEMORY_GROWTH=1 `
  -sINITIAL_MEMORY=16777216 `
  -sMAXIMUM_MEMORY=67108864 `
  -sSTANDALONE_WASM=1 `
  --no-entry `
  "-sEXPORTED_FUNCTIONS=[$exports]"
