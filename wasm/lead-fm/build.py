"""
Kessho Lead 4-op FM - WASM build via Emscripten (Python/Windows)

Sets EMCC_CORES=1 to prevent MemoryError during system library compilation.

Usage:
    python build.py           # optimized release build (no LTO)
    python build.py debug     # debug build with assertions
"""

import subprocess
import sys
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(SCRIPT_DIR, "kessho_lead_fm.cpp")
OUT = os.path.join(SCRIPT_DIR, "kessho_lead_fm.wasm")
COMMON_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "common"))

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
# CRITICAL: limit cores to prevent MemoryError during system library compilation
env["EMCC_CORES"] = "1"

# Add LLVM + node + emsdk python to PATH
llvm_bin = os.path.normpath(os.path.join(EMSDK_ROOT, "upstream", "bin"))
node_bin = os.path.join(EMSDK_ROOT, "node")
python_bin = os.path.join(EMSDK_ROOT, "python")
if os.path.isdir(python_bin):
    for d in os.listdir(python_bin):
        python_full = os.path.join(python_bin, d, "bin")
        if os.path.isdir(python_full):
            env["PATH"] = python_full + os.pathsep + env.get("PATH", "")
            break
if os.path.isdir(node_bin):
    for d in os.listdir(node_bin):
        node_full = os.path.join(node_bin, d, "bin")
        if os.path.isdir(node_full):
            env["PATH"] = node_full + os.pathsep + env.get("PATH", "")
            break
env["PATH"] = llvm_bin + os.pathsep + env.get("PATH", "")

EXPORTS = [
    "_lead_fm_init",
    "_lead_fm_destroy",
    "_lead_fm_get_output_ptr",
    "_lead_fm_get_output2_ptr",
    "_lead_fm_process_block",
    "_lead_fm_note_on",
    "_lead_fm_note_on_ex",
    "_lead_fm_all_notes_off",
    "_lead_fm_set_algorithm",
    "_lead_fm_set_beat_detune",
    "_lead_fm_set_carrier2_mix",
    "_lead_fm_set_op_ratio",
    "_lead_fm_set_op_index",
    "_lead_fm_set_op_decay",
    "_lead_fm_set_op_sustain",
    "_lead_fm_set_op_level",
    "_lead_fm_set_op_feedback",
    "_lead_fm_set_op_detune",
    "_lead_fm_set_op_env_rate",
    "_lead_fm_set_op_mod_attack",
    "_lead_fm_set_op_mod_delay",
    "_lead_fm_set_attack",
    "_lead_fm_set_decay",
    "_lead_fm_set_sustain",
    "_lead_fm_set_release",
    "_lead_fm_set_filter_freq",
    "_lead_fm_set_filter_q",
    "_lead_fm_set_filter_type",
    "_lead_fm_set_filter_env_attack",
    "_lead_fm_set_filter_env_decay",
    "_lead_fm_set_filter_env_sustain",
    "_lead_fm_set_filter_env_release",
    "_lead_fm_set_filter_env_depth",
    "_lead_fm_set_drive",
    "_lead_fm_set_transient_click",
    "_lead_fm_set_transient_noise",
    "_lead_fm_set_transient_duration_ms",
    "_lead_fm_set_transient_decay",
    "_lead_fm_set_transient_filter",
    "_lead_fm_set_transient_type",
    "_lead_fm_set_gain",
    "_lead_fm_set_x_level",
    "_lead_fm_set_x_pan",
    "_lead_fm_set_y_level",
    "_lead_fm_set_y_pan",
    "_lead_fm_set_lfo_rate",
    "_lead_fm_set_lfo_depth",
    "_lead_fm_set_lfo_target",
    "_lead_fm_set_unison_voices",
    "_lead_fm_set_unison_detune",
    "_lead_fm_set_delay_enabled",
    "_lead_fm_set_delay_time_l",
    "_lead_fm_set_delay_time_r",
    "_lead_fm_set_delay_feedback",
    "_lead_fm_set_delay_filter",
    "_lead_fm_set_delay_mix",
    "_lead_fm_set_delay_send",
    "_lead_fm_get_active_count",
    "_lead_fm_instance_create",
    "_lead_fm_instance_destroy",
    "_lead_fm_instance_reset",
    "_lead_fm_instance_get_output_ptr",
    "_lead_fm_instance_get_output2_ptr",
    "_lead_fm_instance_process_block",
    "_lead_fm_instance_note_on",
    "_lead_fm_instance_note_on_ex",
    "_lead_fm_instance_all_notes_off",
    "_lead_fm_instance_set_algorithm",
    "_lead_fm_instance_set_beat_detune",
    "_lead_fm_instance_set_carrier2_mix",
    "_lead_fm_instance_set_op_ratio",
    "_lead_fm_instance_set_op_index",
    "_lead_fm_instance_set_op_decay",
    "_lead_fm_instance_set_op_sustain",
    "_lead_fm_instance_set_op_level",
    "_lead_fm_instance_set_op_feedback",
    "_lead_fm_instance_set_op_detune",
    "_lead_fm_instance_set_op_env_rate",
    "_lead_fm_instance_set_op_mod_attack",
    "_lead_fm_instance_set_op_mod_delay",
    "_lead_fm_instance_set_attack",
    "_lead_fm_instance_set_decay",
    "_lead_fm_instance_set_sustain",
    "_lead_fm_instance_set_release",
    "_lead_fm_instance_set_filter_freq",
    "_lead_fm_instance_set_filter_q",
    "_lead_fm_instance_set_filter_type",
    "_lead_fm_instance_set_filter_env_attack",
    "_lead_fm_instance_set_filter_env_decay",
    "_lead_fm_instance_set_filter_env_sustain",
    "_lead_fm_instance_set_filter_env_release",
    "_lead_fm_instance_set_filter_env_depth",
    "_lead_fm_instance_set_drive",
    "_lead_fm_instance_set_transient_click",
    "_lead_fm_instance_set_transient_noise",
    "_lead_fm_instance_set_transient_duration_ms",
    "_lead_fm_instance_set_transient_decay",
    "_lead_fm_instance_set_transient_filter",
    "_lead_fm_instance_set_transient_type",
    "_lead_fm_instance_set_gain",
    "_lead_fm_instance_set_x_level",
    "_lead_fm_instance_set_x_pan",
    "_lead_fm_instance_set_y_level",
    "_lead_fm_instance_set_y_pan",
    "_lead_fm_instance_set_lfo_rate",
    "_lead_fm_instance_set_lfo_depth",
    "_lead_fm_instance_set_lfo_target",
    "_lead_fm_instance_set_unison_voices",
    "_lead_fm_instance_set_unison_detune",
    "_lead_fm_instance_set_delay_enabled",
    "_lead_fm_instance_set_delay_time_l",
    "_lead_fm_instance_set_delay_time_r",
    "_lead_fm_instance_set_delay_feedback",
    "_lead_fm_instance_set_delay_filter",
    "_lead_fm_instance_set_delay_mix",
    "_lead_fm_instance_set_delay_send",
    "_lead_fm_instance_get_active_count",
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
        f"-I{COMMON_DIR}",
        "-sASSERTIONS=1",
        "-sALLOW_MEMORY_GROWTH=1",
        "-sINITIAL_MEMORY=16777216",
        "-sMAXIMUM_MEMORY=67108864",
        "-sSTANDALONE_WASM=1",
        "--no-entry",
        f"-sEXPORTED_FUNCTIONS={EXPORTS_STR}",
    ]
else:
    print("Building RELEASE (O2, no LTO)...")
    cmd = EMCC + [
        SRC, "-o", OUT,
        "-std=c++17",
        "-O2",
        "-fno-exceptions",
        "-fno-rtti",
        "-fno-math-errno",
        f"-I{COMMON_DIR}",
        "-DNDEBUG",
        "-sALLOW_MEMORY_GROWTH=1",
        "-sINITIAL_MEMORY=16777216",
        "-sMAXIMUM_MEMORY=67108864",
        "-sSTANDALONE_WASM=1",
        "--no-entry",
        f"-sEXPORTED_FUNCTIONS={EXPORTS_STR}",
    ]

print(f"EMCC_CORES={env.get('EMCC_CORES', 'default')}")
print("Running:", " ".join(cmd[:6]), "...")
print()

result = subprocess.run(cmd, env=env, cwd=SCRIPT_DIR)

if result.returncode != 0:
    print(f"\nFAILED with exit code {result.returncode}")
    sys.exit(result.returncode)

import shutil
size = os.path.getsize(OUT)
print(f"\nSUCCESS: {OUT}")
print(f"Size: {size} bytes ({size/1024:.1f} KB)")

# Copy to public worklets directory
public_dir = os.path.join(SCRIPT_DIR, "..", "..", "public", "worklets")
if os.path.isdir(public_dir):
    dest = os.path.join(public_dir, "kessho_lead_fm.wasm")
    shutil.copy2(OUT, dest)
    print(f"Copied to {dest}")

sys.exit(0)
