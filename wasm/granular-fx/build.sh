#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  Kessho Granular-FX — Emscripten → WASM build
#
#  Prerequisites:
#    source ~/emsdk/emsdk_env.sh   (or wherever your emsdk lives)
#
#  Output:
#    kessho_granular.wasm  (~20-30 KB expected)
#
#  Usage:
#    ./build.sh            # optimized build
#    ./build.sh debug      # debug build with assertions
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$SCRIPT_DIR/kessho_granular.cpp"
OUT="$SCRIPT_DIR/kessho_granular.wasm"

# Exported functions (must match kessho_granular.h extern "C" API)
EXPORTS="[
  '_granular_init',
  '_granular_destroy',
  '_granular_get_input_ptr',
  '_granular_get_output_ptr',
  '_granular_process_block',
  '_granular_set_enabled',
  '_granular_set_freeze',
  '_granular_set_dry_wet',
  '_granular_set_feedback',
  '_granular_set_scale',
  '_granular_set_buffer_size',
  '_granular_set_voice_mode',
  '_granular_set_voice_position',
  '_granular_set_voice_grain',
  '_granular_set_voice_output',
  '_granular_set_voice_lfo',
  '_granular_set_voice_euclid_gated',
  '_granular_set_voice_euclid_muted',
  '_granular_set_legacy_params',
  '_granular_euclid_trigger',
  '_granular_set_random_sequence',
  '_granular_get_write_head',
  '_granular_get_voice_positions',
  '_granular_get_active_grain_count',
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
    cp "$OUT" "$PUBLIC_DIR/kessho_granular.wasm"
    echo "📦 Copied to $PUBLIC_DIR/kessho_granular.wasm"
else
    echo "⚠️  Public worklets dir not found: $PUBLIC_DIR"
    echo "   Copy manually: cp $OUT <public>/worklets/"
fi
