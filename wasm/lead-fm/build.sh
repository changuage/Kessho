#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  Kessho Lead 4-op FM — Emscripten → WASM build
#
#  Prerequisites:
#    source ~/emsdk/emsdk_env.sh
#
#  Output:
#    kessho_lead_fm.wasm  (~25-40 KB expected)
#
#  Usage:
#    ./build.sh            # optimized build
#    ./build.sh debug      # debug build with assertions
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$SCRIPT_DIR/kessho_lead_fm.cpp"
OUT="$SCRIPT_DIR/kessho_lead_fm.wasm"

EXPORTS="[
  '_lead_fm_init',
  '_lead_fm_destroy',
  '_lead_fm_get_output_ptr',
  '_lead_fm_get_output2_ptr',
  '_lead_fm_process_block',
  '_lead_fm_note_on',
  '_lead_fm_note_on_ex',
  '_lead_fm_all_notes_off',
  '_lead_fm_set_algorithm',
  '_lead_fm_set_beat_detune',
  '_lead_fm_set_carrier2_mix',
  '_lead_fm_set_op_ratio',
  '_lead_fm_set_op_index',
  '_lead_fm_set_op_decay',
  '_lead_fm_set_op_sustain',
  '_lead_fm_set_op_level',
  '_lead_fm_set_op_feedback',
  '_lead_fm_set_op_detune',
  '_lead_fm_set_op_env_rate',
  '_lead_fm_set_op_mod_attack',
  '_lead_fm_set_op_mod_delay',
  '_lead_fm_set_attack',
  '_lead_fm_set_decay',
  '_lead_fm_set_sustain',
  '_lead_fm_set_release',
  '_lead_fm_set_filter_freq',
  '_lead_fm_set_filter_q',
  '_lead_fm_set_filter_type',
  '_lead_fm_set_filter_env_attack',
  '_lead_fm_set_filter_env_decay',
  '_lead_fm_set_filter_env_sustain',
  '_lead_fm_set_filter_env_release',
  '_lead_fm_set_filter_env_depth',
  '_lead_fm_set_drive',
  '_lead_fm_set_transient_click',
  '_lead_fm_set_transient_noise',
  '_lead_fm_set_transient_duration_ms',
  '_lead_fm_set_transient_decay',
  '_lead_fm_set_transient_filter',
  '_lead_fm_set_transient_type',
  '_lead_fm_set_gain',
  '_lead_fm_set_x_level',
  '_lead_fm_set_x_pan',
  '_lead_fm_set_y_level',
  '_lead_fm_set_y_pan',
  '_lead_fm_set_lfo_rate',
  '_lead_fm_set_lfo_depth',
  '_lead_fm_set_lfo_target',
  '_lead_fm_set_unison_voices',
  '_lead_fm_set_unison_detune',
  '_lead_fm_set_delay_enabled',
  '_lead_fm_set_delay_time_l',
  '_lead_fm_set_delay_time_r',
  '_lead_fm_set_delay_feedback',
  '_lead_fm_set_delay_filter',
  '_lead_fm_set_delay_mix',
  '_lead_fm_set_delay_send',
  '_lead_fm_get_active_count',
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

SIZE=$(wc -c < "$OUT")
echo "✅ Built: $OUT ($(( SIZE / 1024 )) KB)"

PUBLIC_DIR="$SCRIPT_DIR/../../public/worklets"
if [ -d "$PUBLIC_DIR" ]; then
    cp "$OUT" "$PUBLIC_DIR/kessho_lead_fm.wasm"
    echo "📦 Copied to $PUBLIC_DIR/kessho_lead_fm.wasm"
else
    echo "⚠️  Public worklets dir not found: $PUBLIC_DIR"
fi
