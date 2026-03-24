#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  Kessho Soundscapes — Emscripten → WASM build
#
#  Prerequisites:
#    source ~/emsdk/emsdk_env.sh   (or wherever your emsdk lives)
#
#  Output:
#    kessho_soundscapes.wasm  (~40-60 KB expected)
#
#  Usage:
#    ./build.sh            # optimized build
#    ./build.sh debug      # debug build with assertions
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$SCRIPT_DIR/kessho_soundscapes.cpp"
OUT="$SCRIPT_DIR/kessho_soundscapes.wasm"

# Exported functions (must match kessho_soundscapes.h extern "C" API)
EXPORTS="[
  '_water_init',
  '_water_destroy',
  '_water_get_output_ptr',
  '_water_process_block',
  '_water_set_preset',
  '_water_set_params',
  '_water_set_layer_mix',
  '_water_set_layer_density',
  '_water_start',
  '_water_stop',
  '_water_set_seed',
  '_water_get_active_voices',
  '_water_get_events_per_sec',
  '_insects_init',
  '_insects_destroy',
  '_insects_get_output_ptr',
  '_insects_process_block',
  '_insects_set_engine',
  '_insects_set_params',
  '_insects_start',
  '_insects_stop',
  '_insects_set_seed',
  '_insects_get_active_voices',
  '_insects_get_engine_type',
  '_insects2_init',
  '_insects2_destroy',
  '_insects2_get_output_ptr',
  '_insects2_process_block',
  '_insects2_set_engine',
  '_insects2_set_params',
  '_insects2_start',
  '_insects2_stop',
  '_insects2_set_seed',
  '_insects2_get_active_voices',
  '_insects2_get_engine_type',
  '_ocean_init',
  '_ocean_destroy',
  '_ocean_get_output_ptr',
  '_ocean_set_params',
  '_ocean_process_block',
  '_ocean_start',
  '_ocean_stop',
  '_ocean_set_seed',
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
    cp "$OUT" "$PUBLIC_DIR/kessho_soundscapes.wasm"
    echo "📦 Copied to $PUBLIC_DIR/kessho_soundscapes.wasm"
else
    echo "⚠️  Public worklets dir not found: $PUBLIC_DIR"
    echo "   Copy manually: cp $OUT <public>/worklets/"
fi
