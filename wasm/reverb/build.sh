#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  Kessho Reverb — Emscripten → WASM build
#
#  Prerequisites:
#    source ~/emsdk/emsdk_env.sh   (or wherever your emsdk lives)
#
#  Output:
#    kessho_reverb.wasm  (~30-50 KB expected)
#
#  Usage:
#    ./build.sh            # optimized build
#    ./build.sh debug      # debug build with assertions
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$SCRIPT_DIR/kessho_reverb.cpp"
OUT="$SCRIPT_DIR/kessho_reverb.wasm"

# Exported functions (must match kessho_reverb.h extern "C" API)
EXPORTS="[
  '_reverb_init',
  '_reverb_destroy',
  '_reverb_get_input_ptr',
  '_reverb_get_output_ptr',
  '_reverb_process_block',
  '_reverb_process_planar_block',
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
  '_reverb_set_bloom',
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
  '_reverb_instance_process_planar_block',
  '_reverb_instance_set_bloom',
  '_reverb_instance_set_air_absorption',
  '_reverb_instance_set_saturation_mode',
  '_reverb_instance_set_transient_smooth',
  '_reverb_instance_set_er_lp_freq',
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
    cp "$OUT" "$PUBLIC_DIR/kessho_reverb.wasm"
    echo "📦 Copied to $PUBLIC_DIR/kessho_reverb.wasm"
else
    echo "⚠️  Public worklets dir not found: $PUBLIC_DIR"
    echo "   Copy manually: cp $OUT <public>/worklets/"
fi
