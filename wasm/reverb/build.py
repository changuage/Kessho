"""
Kessho Reverb - WASM build via Emscripten (Python)

Equivalent to build.sh but runs on Windows via Python + emcc.py
Usage:
    python build.py           # optimized release build
    python build.py debug     # debug build with assertions
"""

import subprocess
import sys
import os
import shutil

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(SCRIPT_DIR, "kessho_reverb.cpp")
OUT = os.path.join(SCRIPT_DIR, "kessho_reverb.wasm")

# Find emcc — look for local emsdk first, then PATH
# Normalize path fully to avoid Emscripten cache invalidation from path differences
EMSDK_ROOT = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "..", "emsdk"))
EMCC_PY = os.path.join(EMSDK_ROOT, "upstream", "emscripten", "emcc.py")

if os.path.exists(EMCC_PY):
    EMCC = [sys.executable, EMCC_PY]
    print(f"Using emcc.py: {EMCC_PY}")
else:
    # Fallback to PATH
    EMCC = ["emcc"]
    print("Using emcc from PATH")

# Set required env for emcc.py
env = os.environ.copy()
env["EMSDK"] = EMSDK_ROOT
env["EM_CONFIG"] = os.path.normpath(os.path.join(EMSDK_ROOT, ".emscripten"))
# Skip sanity check to avoid cache invalidation from path format differences
env["EMCC_SKIP_SANITY_CHECK"] = "1"
# Add LLVM + node + emsdk python to PATH
llvm_bin = os.path.normpath(os.path.join(EMSDK_ROOT, "upstream", "bin"))
node_bin = os.path.join(EMSDK_ROOT, "node")
python_bin = os.path.join(EMSDK_ROOT, "python")
# Find actual python dir (version-named) so nested emcc invocations do not fall back
# to an older system python.
if os.path.isdir(python_bin):
    for d in os.listdir(python_bin):
        python_full = os.path.join(python_bin, d, "bin")
        if os.path.isdir(python_full):
            env["PATH"] = python_full + os.pathsep + env.get("PATH", "")
            break
# Find actual node dir (version-named)
if os.path.isdir(node_bin):
    for d in os.listdir(node_bin):
        node_full = os.path.join(node_bin, d, "bin")
        if os.path.isdir(node_full):
            env["PATH"] = node_full + os.pathsep + env.get("PATH", "")
            break
env["PATH"] = llvm_bin + os.pathsep + env.get("PATH", "")

# Exported functions (must match kessho_reverb.h extern "C" API)
EXPORTS = [
    "_reverb_init",
    "_reverb_destroy",
    "_reverb_get_input_ptr",
    "_reverb_get_output_ptr",
    "_reverb_process_block",
    "_reverb_process_planar_block",
    "_reverb_set_type",
    "_reverb_set_quality",
    "_reverb_set_params",
    "_reverb_set_shimmer",
    "_reverb_set_slow_mod",
    "_reverb_set_reverse",
    # v2 additions
    "_reverb_set_chorus",
    "_reverb_set_mod_character",
    "_reverb_set_multiband_damp",
    "_reverb_set_input_tone",
    "_reverb_set_shimmer_feedback",
    # v3 additions
    "_reverb_set_warp",
    "_reverb_set_cross_feed",
    # v4 additions
    "_reverb_set_early_reflections",
    "_reverb_set_air_absorption",
    "_reverb_set_saturation_mode",
    "_reverb_set_transient_smooth",
    "_reverb_set_er_lp_freq",
    "_reverb_set_bloom",
    "_reverb_instance_create",
    "_reverb_instance_destroy",
    "_reverb_instance_reset",
    "_reverb_instance_get_input_ptr",
    "_reverb_instance_get_output_ptr",
    "_reverb_instance_process_block",
    "_reverb_instance_process_planar_block",
    "_reverb_instance_set_type",
    "_reverb_instance_set_quality",
    "_reverb_instance_set_params",
    "_reverb_instance_set_shimmer",
    "_reverb_instance_set_slow_mod",
    "_reverb_instance_set_reverse",
    "_reverb_instance_set_chorus",
    "_reverb_instance_set_mod_character",
    "_reverb_instance_set_multiband_damp",
    "_reverb_instance_set_input_tone",
    "_reverb_instance_set_shimmer_feedback",
    "_reverb_instance_set_warp",
    "_reverb_instance_set_cross_feed",
    "_reverb_instance_set_early_reflections",
    "_reverb_instance_set_bloom",
    "_reverb_instance_set_air_absorption",
    "_reverb_instance_set_saturation_mode",
    "_reverb_instance_set_transient_smooth",
    "_reverb_instance_set_er_lp_freq",
    "_malloc",
    "_free",
]

EXPORTS_STR = "[" + ",".join(f"'{e}'" for e in EXPORTS) + "]"

debug = len(sys.argv) > 1 and sys.argv[1] == "debug"

if debug:
    print("Building DEBUG...")
    cmd = EMCC + [
        SRC, "-o", OUT,
        "-std=c++17",
        "-O0", "-g",
        "-msimd128",
        "-sASSERTIONS=1",
        "-sALLOW_MEMORY_GROWTH=1",
        "-sINITIAL_MEMORY=16777216",
        "-sMAXIMUM_MEMORY=67108864",
        "-sSTANDALONE_WASM=1",
        "--no-entry",
        f"-sEXPORTED_FUNCTIONS={EXPORTS_STR}",
    ]
else:
    print("Building RELEASE...")
    cmd = EMCC + [
        SRC, "-o", OUT,
        "-std=c++17",
        "-O3", "-flto",
        "-fno-math-errno",
        "-freciprocal-math",
        "-fno-trapping-math",
        "-msimd128",
        "-DNDEBUG",
        "-sALLOW_MEMORY_GROWTH=1",
        "-sINITIAL_MEMORY=16777216",
        "-sMAXIMUM_MEMORY=67108864",
        "-sSTANDALONE_WASM=1",
        "--no-entry",
        f"-sEXPORTED_FUNCTIONS={EXPORTS_STR}",
    ]

print("Running:", " ".join(cmd[:4]), "...")
result = subprocess.run(cmd, env=env, cwd=SCRIPT_DIR)

if result.returncode != 0:
    print(f"Build FAILED (exit code {result.returncode})")
    sys.exit(result.returncode)

size = os.path.getsize(OUT)
print(f"Built: {OUT} ({size // 1024} KB)")

# Copy to public worklets directory
public_dir = os.path.join(SCRIPT_DIR, "..", "..", "public", "worklets")
if os.path.isdir(public_dir):
    dest = os.path.join(public_dir, "kessho_reverb.wasm")
    shutil.copy2(OUT, dest)
    print(f"Copied to {dest}")
else:
    print(f"Public worklets dir not found: {public_dir}")
    print(f"Copy manually: copy {OUT} <public>/worklets/")

print("Done!")
