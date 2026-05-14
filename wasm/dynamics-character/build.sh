#!/bin/bash
# Kessho Dynamics Character — Emscripten → WASM build

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$SCRIPT_DIR/kessho_dynamics_character.cpp"
OUT="$SCRIPT_DIR/kessho_dynamics_character.wasm"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
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

EXPORTS="[
  '_dynamics_character_init',
  '_dynamics_character_reset',
  '_dynamics_character_destroy',
  '_dynamics_character_get_input_ptr',
  '_dynamics_character_get_output_ptr',
  '_dynamics_character_get_params_ptr',
  '_dynamics_character_get_telemetry_ptr',
  '_dynamics_character_commit_params',
  '_dynamics_character_process_block',
  '_malloc',
  '_free'
]"

if [[ "${1:-}" == "debug" ]]; then
    echo "Building Dynamics Character DEBUG..."
    "${EMCC_CMD[@]}" "$SRC" \
        -o "$OUT" \
        -std=c++17 \
        -O0 \
        -g \
        -s ASSERTIONS=1 \
        -s ALLOW_MEMORY_GROWTH=1 \
        -s INITIAL_MEMORY=16777216 \
        -s MAXIMUM_MEMORY=67108864 \
        -s STANDALONE_WASM=1 \
        --no-entry \
        -s "EXPORTED_FUNCTIONS=$EXPORTS"
else
    echo "Building Dynamics Character RELEASE..."
    "${EMCC_CMD[@]}" "$SRC" \
        -o "$OUT" \
        -std=c++17 \
        -O3 \
        -flto \
        -fno-math-errno \
        -freciprocal-math \
        -fno-trapping-math \
        -DNDEBUG \
        -s ALLOW_MEMORY_GROWTH=1 \
        -s INITIAL_MEMORY=16777216 \
        -s MAXIMUM_MEMORY=67108864 \
        -s STANDALONE_WASM=1 \
        --no-entry \
        -s "EXPORTED_FUNCTIONS=$EXPORTS"
fi

SIZE=$(wc -c < "$OUT")
echo "Built: $OUT ($(( SIZE / 1024 )) KB)"

PUBLIC_DIR="$SCRIPT_DIR/../../public/worklets"
if [ -d "$PUBLIC_DIR" ]; then
    cp "$OUT" "$PUBLIC_DIR/kessho_dynamics_character.wasm"
    echo "Copied to $PUBLIC_DIR/kessho_dynamics_character.wasm"
else
    echo "Public worklets dir not found: $PUBLIC_DIR"
fi
