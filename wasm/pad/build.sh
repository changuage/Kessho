#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  Kessho Pad Synth — Emscripten → WASM build
#
#  Prerequisites:
#    source ~/emsdk/emsdk_env.sh
#
#  Output:
#    kessho_pad.wasm  (~20-35 KB expected)
#
#  Usage:
#    ./build.sh            # optimized build
#    ./build.sh debug      # debug build with assertions
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SRC="$SCRIPT_DIR/kessho_pad.cpp"
OUT="$SCRIPT_DIR/kessho_pad.wasm"
PUBLIC_DIR="$ROOT_DIR/public/worklets"
PUBLIC_OUT="$PUBLIC_DIR/kessho_pad.wasm"
MANIFEST="$SCRIPT_DIR/kessho_pad.wasm.manifest.json"
MANIFEST_INPUTS=(
    "$SCRIPT_DIR/build.sh"
    "$SCRIPT_DIR/kessho_pad.cpp"
    "$SCRIPT_DIR/kessho_pad.h"
    "$SCRIPT_DIR/../common/kessho_dsp.h"
)
LOCAL_EMSDK="$ROOT_DIR/emsdk"
LOCAL_EMCC="$LOCAL_EMSDK/upstream/emscripten/emcc.py"
LOCAL_EMSDK_PY="$LOCAL_EMSDK/python/3.13.3_64bit/bin/python3.13"
LOCAL_EMSDK_PY_COMPAT="$LOCAL_EMSDK/python/3.13.3_64bit/bin/python3"
LOCAL_PY312="$ROOT_DIR/.venv312/bin/python"

validate_checked_in_wasm() {
    [[ -f "$PUBLIC_OUT" && -f "$MANIFEST" ]] || return 1
    command -v node >/dev/null 2>&1 || return 1

    node - "$ROOT_DIR" "$MANIFEST" "$PUBLIC_OUT" "${MANIFEST_INPUTS[@]}" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const [, , root, manifestPath, artifactPath, ...sourcePaths] = process.argv;
const rel = (file) => path.relative(root, file).split(path.sep).join('/');
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const failures = [];

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (error) {
  console.error(`Pad WASM manifest is unreadable: ${error.message}`);
  process.exit(1);
}

if (manifest.artifact !== rel(artifactPath)) {
  failures.push(`artifact path mismatch: expected ${rel(artifactPath)}, found ${manifest.artifact || '<missing>'}`);
}

const artifactHash = sha256(artifactPath);
if (manifest.artifactSha256 !== artifactHash) {
  failures.push(`artifact hash mismatch for ${rel(artifactPath)}`);
}

for (const sourcePath of sourcePaths) {
  const sourceRel = rel(sourcePath);
  const expectedHash = sha256(sourcePath);
  if (manifest.sources?.[sourceRel] !== expectedHash) {
    failures.push(`source hash mismatch for ${sourceRel}`);
  }
}

try {
  new WebAssembly.Module(fs.readFileSync(artifactPath));
} catch (error) {
  failures.push(`artifact is not valid WebAssembly: ${error.message}`);
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`Pad WASM validation failed: ${failure}`);
  }
  process.exit(1);
}
NODE
}

write_manifest() {
    command -v node >/dev/null 2>&1 || return 0

    node - "$ROOT_DIR" "$MANIFEST" "$PUBLIC_OUT" "${MANIFEST_INPUTS[@]}" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const [, , root, manifestPath, artifactPath, ...sourcePaths] = process.argv;
const rel = (file) => path.relative(root, file).split(path.sep).join('/');
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const manifest = {
  artifact: rel(artifactPath),
  artifactSha256: sha256(artifactPath),
  sources: Object.fromEntries(sourcePaths.map((sourcePath) => [rel(sourcePath), sha256(sourcePath)])),
};

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
}

if [[ -f "$LOCAL_EMCC" ]]; then
    if [[ -x "$LOCAL_EMSDK_PY" ]]; then
        EMCC_CMD=("$LOCAL_EMSDK_PY" "$LOCAL_EMCC")
    elif [[ -x "$LOCAL_EMSDK_PY_COMPAT" ]]; then
        EMCC_CMD=("$LOCAL_EMSDK_PY_COMPAT" "$LOCAL_EMCC")
    elif [[ -x "$LOCAL_PY312" ]]; then
        EMCC_CMD=("$LOCAL_PY312" "$LOCAL_EMCC")
    elif command -v python3 >/dev/null 2>&1; then
        EMCC_CMD=("python3" "$LOCAL_EMCC")
    else
        echo "Error: found local Emscripten at $LOCAL_EMSDK, but no Python runtime is available to launch emcc.py." >&2
        exit 127
    fi

    export EMSDK="$LOCAL_EMSDK"
    export EM_CONFIG="$LOCAL_EMSDK/.emscripten"
    export PATH="$LOCAL_EMSDK/upstream/emscripten:$LOCAL_EMSDK/upstream/bin:$LOCAL_EMSDK/node/22.16.0_64bit/bin:$PATH"
elif command -v emcc >/dev/null 2>&1; then
    EMCC_CMD=("emcc")
else
    if [[ "${1:-}" != "debug" ]] && validate_checked_in_wasm; then
        echo "ℹ️  emcc not found; using current checked-in Pad WASM artifact: $PUBLIC_OUT"
        exit 0
    fi

    cat >&2 <<EOF
Error: emcc was not found.

Install or activate Emscripten before building Pad WASM:
  git clone https://github.com/emscripten-core/emsdk.git emsdk
  ./emsdk/emsdk install latest
  ./emsdk/emsdk activate latest

Or source an existing SDK:
  source /path/to/emsdk/emsdk_env.sh
EOF
    exit 127
fi

EXPORTS="[
  '_pad_init',
  '_pad_destroy',
  '_pad_get_output_ptr',
  '_pad_get_reverb_send_ptr',
  '_pad_get_prefader_pad1_ptr',
  '_pad_get_prefader_pad2_ptr',
  '_pad_get_postfader_pad1_ptr',
  '_pad_get_postfader_pad2_ptr',
  '_pad_process_block',
  '_pad_note_on',
  '_pad_note_off',
  '_pad_kill_voice',
  '_pad_set_voice_pad',
  '_pad_set_osc_a_wave',
  '_pad_set_osc_a_octave',
  '_pad_set_osc_a_detune',
  '_pad_set_osc_a_level',
  '_pad_set_osc_b_wave',
  '_pad_set_osc_b_octave',
  '_pad_set_osc_b_detune',
  '_pad_set_osc_b_level',
  '_pad_set_osc_mix',
  '_pad_set_sub_enabled',
  '_pad_set_sub_octave',
  '_pad_set_sub_wave',
  '_pad_set_sub_level',
  '_pad_set_noise_type',
  '_pad_set_noise_level',
  '_pad_set_hardness',
  '_pad_set_warmth',
  '_pad_set_presence',
  '_pad_set_fold_amount',
  '_pad_set_fold_mode',
  '_pad_set_filter_type',
  '_pad_set_filter_cutoff_min',
  '_pad_set_filter_cutoff_max',
  '_pad_set_filter_resonance',
  '_pad_set_filter_q',
  '_pad_set_filter_slope',
  '_pad_set_filter_key_tracking',
  '_pad_set_filter_b_enabled',
  '_pad_set_filter_b_type',
  '_pad_set_filter_b_cutoff',
  '_pad_set_filter_b_resonance',
  '_pad_set_filter_b_q',
  '_pad_set_filter_routing',
  '_pad_set_attack',
  '_pad_set_decay',
  '_pad_set_sustain',
  '_pad_set_release',
  '_pad_set_lfo1_rate',
  '_pad_set_lfo1_depth',
  '_pad_set_lfo1_wave',
  '_pad_set_lfo1_dest',
  '_pad_set_lfo2_rate',
  '_pad_set_lfo2_depth',
  '_pad_set_lfo2_wave',
  '_pad_set_lfo2_dest',
  '_pad_set_mod_env_enabled',
  '_pad_set_mod_env_attack',
  '_pad_set_mod_env_decay',
  '_pad_set_mod_env_sustain',
  '_pad_set_mod_env_release',
  '_pad_set_mod_env_depth',
  '_pad_set_mod_env_dest',
  '_pad_set_level',
  '_pad_set_reverb_send',
  '_pad_get_active_count',
  '_malloc',
  '_free'
]"

if [[ "${1:-}" == "debug" ]]; then
    echo "🔧 Building DEBUG..."
    "${EMCC_CMD[@]}" "$SRC" \
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
    "${EMCC_CMD[@]}" "$SRC" \
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

if [ -d "$PUBLIC_DIR" ]; then
    cp "$OUT" "$PUBLIC_OUT"
    write_manifest
    echo "📦 Copied to $PUBLIC_OUT"
else
    echo "⚠️  Public worklets dir not found: $PUBLIC_DIR"
fi
