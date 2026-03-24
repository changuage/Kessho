#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  Kessho Drum Synth — Emscripten → WASM build
#
#  Prerequisites:
#    source ~/emsdk/emsdk_env.sh   (or wherever your emsdk lives)
#
#  Output:
#    kessho_drum.wasm  (~40-60 KB expected)
#
#  Usage:
#    ./build.sh            # optimized build
#    ./build.sh debug      # debug build with assertions
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$SCRIPT_DIR/kessho_drum.cpp"
OUT="$SCRIPT_DIR/kessho_drum.wasm"

# Exported functions (must match kessho_drum.h extern "C" API)
EXPORTS="[
  '_drum_init',
  '_drum_destroy',
  '_drum_get_output_ptr',
  '_drum_get_reverb_send_ptr',
  '_drum_process_block',
  '_drum_trigger',
  '_drum_set_sub_freq',
  '_drum_set_sub_decay',
  '_drum_set_sub_level',
  '_drum_set_sub_tone',
  '_drum_set_sub_shape',
  '_drum_set_sub_pitch_env',
  '_drum_set_sub_pitch_decay',
  '_drum_set_sub_drive',
  '_drum_set_sub_sub_octave',
  '_drum_set_sub_attack',
  '_drum_set_sub_variation',
  '_drum_set_sub_distance',
  '_drum_set_kick_freq',
  '_drum_set_kick_pitch_env',
  '_drum_set_kick_pitch_decay',
  '_drum_set_kick_decay',
  '_drum_set_kick_level',
  '_drum_set_kick_click',
  '_drum_set_kick_body',
  '_drum_set_kick_punch',
  '_drum_set_kick_tail',
  '_drum_set_kick_tone',
  '_drum_set_kick_attack',
  '_drum_set_kick_variation',
  '_drum_set_kick_distance',
  '_drum_set_click_decay',
  '_drum_set_click_filter',
  '_drum_set_click_tone',
  '_drum_set_click_level',
  '_drum_set_click_resonance',
  '_drum_set_click_pitch',
  '_drum_set_click_pitch_env',
  '_drum_set_click_mode',
  '_drum_set_click_grain_count',
  '_drum_set_click_grain_spread',
  '_drum_set_click_stereo_width',
  '_drum_set_click_exciter_color',
  '_drum_set_click_attack',
  '_drum_set_click_variation',
  '_drum_set_click_distance',
  '_drum_set_beep_hi_freq',
  '_drum_set_beep_hi_attack',
  '_drum_set_beep_hi_decay',
  '_drum_set_beep_hi_level',
  '_drum_set_beep_hi_tone',
  '_drum_set_beep_hi_inharmonic',
  '_drum_set_beep_hi_partials',
  '_drum_set_beep_hi_shimmer',
  '_drum_set_beep_hi_shimmer_rate',
  '_drum_set_beep_hi_brightness',
  '_drum_set_beep_hi_feedback',
  '_drum_set_beep_hi_mod_env_decay',
  '_drum_set_beep_hi_noise_in_mod',
  '_drum_set_beep_hi_mod_ratio',
  '_drum_set_beep_hi_mod_ratio_fine',
  '_drum_set_beep_hi_mod_env_end',
  '_drum_set_beep_hi_noise_decay',
  '_drum_set_beep_hi_variation',
  '_drum_set_beep_hi_distance',
  '_drum_set_beep_lo_freq',
  '_drum_set_beep_lo_attack',
  '_drum_set_beep_lo_decay',
  '_drum_set_beep_lo_level',
  '_drum_set_beep_lo_tone',
  '_drum_set_beep_lo_pitch_env',
  '_drum_set_beep_lo_pitch_decay',
  '_drum_set_beep_lo_body',
  '_drum_set_beep_lo_pluck',
  '_drum_set_beep_lo_pluck_damp',
  '_drum_set_beep_lo_modal',
  '_drum_set_beep_lo_modal_q',
  '_drum_set_beep_lo_modal_inharmonic',
  '_drum_set_beep_lo_modal_spread',
  '_drum_set_beep_lo_modal_cut',
  '_drum_set_beep_lo_osc_gain',
  '_drum_set_beep_lo_modal_gain',
  '_drum_set_beep_lo_variation',
  '_drum_set_beep_lo_distance',
  '_drum_set_noise_freq',
  '_drum_set_noise_decay',
  '_drum_set_noise_level',
  '_drum_set_noise_q',
  '_drum_set_noise_filter_type',
  '_drum_set_noise_attack',
  '_drum_set_noise_formant',
  '_drum_set_noise_breath',
  '_drum_set_noise_filter_env_depth',
  '_drum_set_noise_filter_env_decay',
  '_drum_set_noise_density',
  '_drum_set_noise_color_lfo',
  '_drum_set_noise_variation',
  '_drum_set_noise_distance',
  '_drum_set_membrane_freq',
  '_drum_set_membrane_decay',
  '_drum_set_membrane_level',
  '_drum_set_membrane_tension',
  '_drum_set_membrane_material',
  '_drum_set_membrane_size',
  '_drum_set_membrane_damping',
  '_drum_set_membrane_strike',
  '_drum_set_membrane_wire_buzz',
  '_drum_set_membrane_attack',
  '_drum_set_membrane_variation',
  '_drum_set_membrane_distance',
  '_drum_set_delay_enabled',
  '_drum_set_delay_time_l',
  '_drum_set_delay_time_r',
  '_drum_set_delay_feedback',
  '_drum_set_delay_filter',
  '_drum_set_delay_mix',
  '_drum_set_delay_send',
  '_drum_set_trigger_morph',
  '_drum_set_trigger_distance',
  '_drum_set_trigger_pitch',
  '_drum_set_trigger_ratchet_cap',
  '_drum_clear_trigger_overrides',
  '_drum_set_master_level',
  '_drum_set_reverb_send',
  '_drum_set_rng_seed',
  '_drum_get_active_count',
  '_malloc',
  '_free'
]"

if [[ "${1:-}" == "debug" ]]; then
    echo "🔧 Building DEBUG..."
    emcc "$SRC" \
        -o "$OUT" \
        -std=c++17 \
        -O0 \
        -g \
        -msimd128 \
        -I"$SCRIPT_DIR/../common" \
        -s ASSERTIONS=1 \
        -s ALLOW_MEMORY_GROWTH=1 \
        -s INITIAL_MEMORY=16777216 \
        -s MAXIMUM_MEMORY=67108864 \
        -s STANDALONE_WASM=1 \
        --no-entry \
        -s "EXPORTED_FUNCTIONS=$EXPORTS"
else
    echo "🚀 Building RELEASE..."
    emcc "$SRC" \
        -o "$OUT" \
        -std=c++17 \
        -O3 \
        -flto \
        -fno-math-errno \
        -freciprocal-math \
        -fno-trapping-math \
        -msimd128 \
        -I"$SCRIPT_DIR/../common" \
        -DNDEBUG \
        -s ALLOW_MEMORY_GROWTH=1 \
        -s INITIAL_MEMORY=16777216 \
        -s MAXIMUM_MEMORY=67108864 \
        -s STANDALONE_WASM=1 \
        --no-entry \
        -s "EXPORTED_FUNCTIONS=$EXPORTS"
fi

# Report size
SIZE=$(wc -c < "$OUT")
echo "✅ Built: $OUT ($(( SIZE / 1024 )) KB)"

# Copy to public worklets directory for runtime access
PUBLIC_DIR="$SCRIPT_DIR/../../public/worklets"
if [ -d "$PUBLIC_DIR" ]; then
    cp "$OUT" "$PUBLIC_DIR/kessho_drum.wasm"
    echo "📦 Copied to $PUBLIC_DIR/kessho_drum.wasm"
else
    echo "⚠️  Public worklets dir not found: $PUBLIC_DIR"
    echo "   Copy manually: cp $OUT <public>/worklets/"
fi
