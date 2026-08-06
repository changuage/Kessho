#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  Kessho Spectral Freeze — Emscripten → WASM build
#
#  Prerequisites:
#    source ~/emsdk/emsdk_env.sh   (or wherever your emsdk lives)
#
#  Output:
#    kessho_spectral_freeze.wasm
#
#  Usage:
#    ./build.sh            # optimized build
#    ./build.sh debug      # debug build with assertions
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$SCRIPT_DIR/kessho_spectral_freeze.wasm"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENGINE_DIR="$REPO_ROOT/cpp/KesshoCore/src/modules/spectral_freeze"
SOURCES=(
  "$SCRIPT_DIR/kessho_spectral_freeze.cpp"
  "$ENGINE_DIR/SpectralFreezeCaptureBuffer.cpp"
  "$ENGINE_DIR/SpectralFreezeEngine.cpp"
  "$ENGINE_DIR/SpectralFreezeMemory.cpp"
  "$ENGINE_DIR/SpectralFreezeScanHead.cpp"
  "$ENGINE_DIR/SpectralFreezeStft.cpp"
)
LOCAL_EMSDK="$REPO_ROOT/emsdk"
LOCAL_EMCC="$LOCAL_EMSDK/upstream/emscripten/emcc.py"
LOCAL_PY312="$REPO_ROOT/.venv312/bin/python"

if [[ -f "$LOCAL_EMCC" ]]; then
    EMCC_CMD=()
    if [[ -x "$LOCAL_PY312" ]]; then
        EMCC_CMD=("$LOCAL_PY312" "$LOCAL_EMCC")
    else
        EMCC_CMD=("python3" "$LOCAL_EMCC")
    fi
    export PATH="$LOCAL_EMSDK/upstream/emscripten:$LOCAL_EMSDK/upstream/bin:$LOCAL_EMSDK/node/22.16.0_64bit/bin:$PATH"
else
    EMCC_CMD=("emcc")
fi

# Exported functions (must match extern "C" API)
EXPORTS="[
  '_spectral_freeze_init',
  '_spectral_freeze_reset',
  '_spectral_freeze_destroy',
  '_spectral_freeze_get_input_ptr',
  '_spectral_freeze_get_output_ptr',
  '_spectral_freeze_process_block',
  '_spectral_freeze_set_freeze',
  '_spectral_freeze_set_slushy',
  '_spectral_freeze_set_speed',
  '_spectral_freeze_set_mix',
  '_spectral_freeze_set_decay',
  '_spectral_freeze_set_phase_jitter',
  '_spectral_freeze_set_mode',
  '_spectral_freeze_request_capture',
  '_spectral_freeze_set_stretch_speed',
  '_spectral_freeze_set_direction',
  '_spectral_freeze_set_position',
  '_spectral_freeze_set_refresh',
  '_spectral_freeze_set_input_sensitivity',
  '_spectral_freeze_set_diffusion',
  '_spectral_freeze_set_tone',
  '_spectral_freeze_set_width',
  '_spectral_freeze_set_sustain',
  '_spectral_freeze_instance_create',
  '_spectral_freeze_instance_destroy',
  '_spectral_freeze_instance_reset',
  '_spectral_freeze_instance_get_input_ptr',
  '_spectral_freeze_instance_get_output_ptr',
  '_spectral_freeze_instance_process_block',
  '_spectral_freeze_instance_set_freeze',
  '_spectral_freeze_instance_set_slushy',
  '_spectral_freeze_instance_set_speed',
  '_spectral_freeze_instance_set_mix',
  '_spectral_freeze_instance_set_decay',
  '_spectral_freeze_instance_set_phase_jitter',
  '_spectral_freeze_instance_set_mode',
  '_spectral_freeze_instance_request_capture',
  '_spectral_freeze_instance_set_stretch_speed',
  '_spectral_freeze_instance_set_direction',
  '_spectral_freeze_instance_set_position',
  '_spectral_freeze_instance_set_refresh',
  '_spectral_freeze_instance_set_input_sensitivity',
  '_spectral_freeze_instance_set_diffusion',
  '_spectral_freeze_instance_set_tone',
  '_spectral_freeze_instance_set_width',
  '_spectral_freeze_instance_set_sustain',
  '_malloc',
  '_free'
]"

if [[ "${1:-}" == "debug" ]]; then
    echo "Building DEBUG..."
    "${EMCC_CMD[@]}" "${SOURCES[@]}" \
        -o "$OUT" \
        -I "$ENGINE_DIR" \
        -std=c++17 \
        -O0 \
        -g \
        -msimd128 \
        -s ASSERTIONS=1 \
        -s ALLOW_MEMORY_GROWTH=1 \
        -s INITIAL_MEMORY=12582912 \
        -s MAXIMUM_MEMORY=33554432 \
        -s STANDALONE_WASM=1 \
        --no-entry \
        -s "EXPORTED_FUNCTIONS=$EXPORTS"
else
    echo "Building RELEASE..."
    "${EMCC_CMD[@]}" "${SOURCES[@]}" \
        -o "$OUT" \
        -I "$ENGINE_DIR" \
        -std=c++17 \
        -O3 \
        -flto \
        -fno-math-errno \
        -freciprocal-math \
        -fno-trapping-math \
        -msimd128 \
        -DNDEBUG \
        -s ALLOW_MEMORY_GROWTH=1 \
        -s INITIAL_MEMORY=12582912 \
        -s MAXIMUM_MEMORY=33554432 \
        -s STANDALONE_WASM=1 \
        --no-entry \
        -s "EXPORTED_FUNCTIONS=$EXPORTS"
fi

# Report size
SIZE=$(wc -c < "$OUT")
echo "Built: $OUT ($(( SIZE / 1024 )) KB)"

# Copy to public worklets directory for runtime access
PUBLIC_DIR="$SCRIPT_DIR/../../public/worklets"
if [ -d "$PUBLIC_DIR" ]; then
    cp "$OUT" "$PUBLIC_DIR/kessho_spectral_freeze.wasm"
    echo "Copied to $PUBLIC_DIR/kessho_spectral_freeze.wasm"
else
    echo "Public worklets dir not found: $PUBLIC_DIR"
    echo "  Copy manually: cp $OUT <public>/worklets/"
fi
