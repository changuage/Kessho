"""
Kessho Spectral Freeze - WASM build via Emscripten (Python)

Usage:
    python build.py           # optimized release build
    python build.py debug     # debug build with assertions
"""

import subprocess
import sys
import os
import shutil

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(SCRIPT_DIR, "kessho_spectral_freeze.cpp")
OUT = os.path.join(SCRIPT_DIR, "kessho_spectral_freeze.wasm")

# Find emcc
EMSDK_ROOT = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "..", "emsdk"))
EMCC_PY = os.path.join(EMSDK_ROOT, "upstream", "emscripten", "emcc.py")

if os.path.exists(EMCC_PY):
    EMCC = [sys.executable, EMCC_PY]
    print(f"Using emcc.py: {EMCC_PY}")
else:
    EMCC = ["emcc"]
    print("Using emcc from PATH")

# Set required env for emcc.py
env = os.environ.copy()
env["EMSDK"] = EMSDK_ROOT
env["EM_CONFIG"] = os.path.normpath(os.path.join(EMSDK_ROOT, ".emscripten"))
env["EMCC_SKIP_SANITY_CHECK"] = "1"
llvm_bin = os.path.normpath(os.path.join(EMSDK_ROOT, "upstream", "bin"))
node_bin = os.path.join(EMSDK_ROOT, "node")
if os.path.isdir(node_bin):
    for d in os.listdir(node_bin):
        node_full = os.path.join(node_bin, d, "bin")
        if os.path.isdir(node_full):
            env["PATH"] = node_full + os.pathsep + env.get("PATH", "")
            break
env["PATH"] = llvm_bin + os.pathsep + env.get("PATH", "")

EXPORTS = [
    "_spectral_freeze_init",
    "_spectral_freeze_destroy",
    "_spectral_freeze_get_input_ptr",
    "_spectral_freeze_get_output_ptr",
    "_spectral_freeze_process_block",
    "_spectral_freeze_set_freeze",
    "_spectral_freeze_set_slushy",
    "_spectral_freeze_set_speed",
    "_spectral_freeze_set_mix",
    "_spectral_freeze_set_decay",
    "_spectral_freeze_set_phase_jitter",
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
        "-sINITIAL_MEMORY=4194304",
        "-sMAXIMUM_MEMORY=16777216",
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
        "-sINITIAL_MEMORY=4194304",
        "-sMAXIMUM_MEMORY=16777216",
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
    dest = os.path.join(public_dir, "kessho_spectral_freeze.wasm")
    shutil.copy2(OUT, dest)
    print(f"Copied to {dest}")
else:
    print(f"Public worklets dir not found: {public_dir}")

print("Done!")
