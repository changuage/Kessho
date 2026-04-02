$env:EMSDK = "c:\Users\chpa9007\Downloads\generativemusic\emsdk"
$env:EM_CONFIG = "$env:EMSDK\.emscripten"
$env:PATH = "$env:EMSDK\upstream\emscripten;$env:EMSDK\node\22.16.0_64bit\bin;$env:EMSDK;$env:PATH"

$SRC = "c:\Users\chpa9007\Downloads\generativemusic\wasm\pad\kessho_pad.cpp"
$OUT = "c:\Users\chpa9007\Downloads\generativemusic\wasm\pad\kessho_pad.wasm"
$INC = "c:\Users\chpa9007\Downloads\generativemusic\wasm\common"

$EXPORTS = @(
  '_pad_init','_pad_destroy','_pad_get_output_ptr','_pad_get_reverb_send_ptr',
  '_pad_get_prefader_pad1_ptr','_pad_get_prefader_pad2_ptr','_pad_process_block','_pad_note_on','_pad_note_off',
  '_pad_set_voice_pad','_pad_set_osc_a_wave','_pad_set_osc_a_octave',
  '_pad_set_osc_a_detune','_pad_set_osc_a_level','_pad_set_osc_b_wave',
  '_pad_set_osc_b_octave','_pad_set_osc_b_detune','_pad_set_osc_b_level',
  '_pad_set_osc_mix','_pad_set_sub_enabled','_pad_set_sub_octave',
  '_pad_set_sub_wave','_pad_set_sub_level','_pad_set_noise_type',
  '_pad_set_noise_level','_pad_set_hardness','_pad_set_warmth',
  '_pad_set_presence','_pad_set_fold_amount',
  '_pad_set_fold_mode','_pad_set_filter_type','_pad_set_filter_cutoff_min',
  '_pad_set_filter_cutoff_max','_pad_set_filter_resonance','_pad_set_filter_q',
  '_pad_set_filter_b_enabled','_pad_set_filter_b_type','_pad_set_filter_b_cutoff',
  '_pad_set_filter_b_resonance','_pad_set_filter_b_q','_pad_set_filter_routing',
  '_pad_set_attack','_pad_set_decay','_pad_set_sustain','_pad_set_release',
  '_pad_set_lfo1_rate','_pad_set_lfo1_depth','_pad_set_lfo1_wave','_pad_set_lfo1_dest',
  '_pad_set_lfo2_rate','_pad_set_lfo2_depth','_pad_set_lfo2_wave','_pad_set_lfo2_dest',
  '_pad_set_mod_env_enabled','_pad_set_mod_env_attack','_pad_set_mod_env_decay',
  '_pad_set_mod_env_sustain','_pad_set_mod_env_release','_pad_set_mod_env_depth',
  '_pad_set_mod_env_dest','_pad_set_level','_pad_set_reverb_send',
  '_pad_get_active_count','_malloc','_free'
) -join "','"

$EXPORT_STR = "['" + $EXPORTS + "']"

emcc $SRC -o $OUT -std=c++17 -O3 -flto -fno-math-errno -freciprocal-math -fno-trapping-math -msimd128 "-I$INC" -DNDEBUG -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=16777216 -s MAXIMUM_MEMORY=67108864 -s STANDALONE_WASM=1 --no-entry -s "EXPORTED_FUNCTIONS=$EXPORT_STR"

if ($LASTEXITCODE -eq 0) {
    $size = (Get-Item $OUT).Length
    Write-Output "BUILD_SUCCESS: $([int]($size/1024)) KB"
    Copy-Item $OUT "c:\Users\chpa9007\Downloads\generativemusic\public\worklets\kessho_pad.wasm" -Force
    Write-Output "DEPLOYED to public/worklets/"
} else {
    Write-Output "BUILD_FAILED (exit code $LASTEXITCODE)"
}
