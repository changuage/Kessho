"""
Kessho Soundscapes - WASM build via Emscripten (Python)

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
SRC = os.path.join(SCRIPT_DIR, "kessho_soundscapes.cpp")
OUT = os.path.join(SCRIPT_DIR, "kessho_soundscapes.wasm")

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

EXPORTS = [
    "_water_init",
    "_water_destroy",
    "_water_get_output_ptr",
    "_water_process_block",
    "_water_set_preset",
    "_water_set_params",
    "_water_set_layer_detail_params",
    "_water_set_layer_mix",
    "_water_set_layer_density",
    "_water_set_density_loop_params",
    "_water_start",
    "_water_stop",
    "_water_set_seed",
    "_water_set_surf_params",
    "_water_set_channels_params",
    "_water_get_active_voices",
    "_water_get_events_per_sec",
    "_water_get_surf_trigger_serial",
    "_water_get_surf_trigger_duration_pos",
    "_water_get_surf_trigger_interval_pos",
    "_water_get_surf_trigger_foam_pos",
    "_water_get_surf_trigger_proximity_pos",
    "_water_get_surf_trigger_depth_pos",
    "_water_get_surf_trigger_body_pos",
    "_water_get_surf_trigger_spray_pos",
    "_water_get_surf_trigger_foam_bright_pos",
    "_insects_init",
    "_insects_destroy",
    "_insects_get_output_ptr",
    "_insects_process_block",
    "_insects_set_engine",
    "_insects_set_params",
    "_insects_start",
    "_insects_stop",
    "_insects_set_seed",
    "_insects_get_active_voices",
    "_insects_get_engine_type",
    "_insects2_init",
    "_insects2_destroy",
    "_insects2_get_output_ptr",
    "_insects2_process_block",
    "_insects2_set_engine",
    "_insects2_set_params",
    "_insects2_start",
    "_insects2_stop",
    "_insects2_set_seed",
    "_insects2_get_active_voices",
    "_insects2_get_engine_type",
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
    dest = os.path.join(public_dir, "kessho_soundscapes.wasm")
    shutil.copy2(OUT, dest)
    print(f"Copied to {dest}")
else:
    print(f"Public worklets dir not found: {public_dir}")
    print(f"Copy manually: copy {OUT} <public>/worklets/")

print("Done!")
