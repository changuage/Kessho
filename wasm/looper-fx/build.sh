#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  Kessho Looper-FX — Emscripten → WASM build
#
#  Prerequisites:
#    source ~/emsdk/emsdk_env.sh   (or wherever your emsdk lives)
#
#  Output:
#    kessho_looper.wasm  (~20-30 KB expected)
#
#  Usage:
#    ./build.sh            # optimized build
#    ./build.sh debug      # debug build with assertions
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$SCRIPT_DIR/kessho_looper.cpp"
OUT="$SCRIPT_DIR/kessho_looper.wasm"

# Exported functions (must match kessho_looper.h extern "C" API)
EXPORTS="[
  '_looper_init',
  '_looper_destroy',
  '_looper_get_input_ptr',
  '_looper_get_output_ptr',
  '_looper_process_block',
  '_looper_set_enabled',
  '_looper_set_freeze',
  '_looper_set_dry_wet',
  '_looper_set_feedback',
  '_looper_set_scale',
  '_looper_set_buffer_size',
  '_looper_set_voice_mode',
  '_looper_set_voice_position',
  '_looper_set_voice_grain',
  '_looper_set_voice_output',
  '_looper_set_voice_lfo',
  '_looper_set_voice_euclid_gated',
  '_looper_set_voice_euclid_muted',
  '_looper_set_legacy_params',
  '_looper_euclid_trigger',
  '_looper_set_random_sequence',
  '_looper_get_write_head',
  '_looper_get_voice_positions',
  '_looper_get_active_grain_count',
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
PUBLIC_DIR="$SCRIPT_DIR/../../public/ARCHIVE/worklets"
if [ -d "$PUBLIC_DIR" ]; then
    cp "$OUT" "$PUBLIC_DIR/kessho_looper.wasm"
    echo "📦 Copied to $PUBLIC_DIR/kessho_looper.wasm"
else
    echo "⚠️  Public worklets dir not found: $PUBLIC_DIR"
    echo "   Copy manually: cp $OUT <public>/ARCHIVE/worklets/"
fi
