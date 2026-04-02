"""Build lead-fm WASM using emscripten python API."""
import subprocess, sys, os

BASE = r"c:\Users\chpa9007\Downloads\generativemusic"
EMCC = os.path.join(BASE, "emsdk", "upstream", "emscripten", "emcc.py")
PYTHON = os.path.join(BASE, "emsdk", "python", "3.13.3_64bit", "python.exe")
SRC = os.path.join(BASE, "wasm", "lead-fm", "kessho_lead_fm.cpp")
OUT = os.path.join(BASE, "wasm", "lead-fm", "kessho_lead_fm.wasm")
INC = os.path.join(BASE, "wasm", "common")

EXPORTS = [
    '_lead_fm_init', '_lead_fm_destroy',
    '_lead_fm_get_output_ptr', '_lead_fm_get_output2_ptr',
    '_lead_fm_process_block',
    '_lead_fm_note_on', '_lead_fm_note_on_ex', '_lead_fm_all_notes_off',
    '_lead_fm_set_algorithm', '_lead_fm_set_beat_detune', '_lead_fm_set_carrier2_mix',
    '_lead_fm_set_op_ratio', '_lead_fm_set_op_index', '_lead_fm_set_op_decay',
    '_lead_fm_set_op_sustain', '_lead_fm_set_op_level', '_lead_fm_set_op_feedback',
    '_lead_fm_set_op_detune', '_lead_fm_set_op_env_rate',
    '_lead_fm_set_op_mod_attack', '_lead_fm_set_op_mod_delay',
    '_lead_fm_set_attack', '_lead_fm_set_decay', '_lead_fm_set_sustain', '_lead_fm_set_release',
    '_lead_fm_set_filter_freq', '_lead_fm_set_filter_q', '_lead_fm_set_filter_type',
    '_lead_fm_set_filter_env_attack', '_lead_fm_set_filter_env_decay',
    '_lead_fm_set_filter_env_sustain', '_lead_fm_set_filter_env_release',
    '_lead_fm_set_filter_env_depth',
    '_lead_fm_set_drive',
    '_lead_fm_set_transient_click', '_lead_fm_set_transient_noise',
    '_lead_fm_set_transient_duration_ms', '_lead_fm_set_transient_decay',
    '_lead_fm_set_transient_filter', '_lead_fm_set_transient_type',
    '_lead_fm_set_gain',
    '_lead_fm_set_x_level', '_lead_fm_set_x_pan',
    '_lead_fm_set_y_level', '_lead_fm_set_y_pan',
    '_lead_fm_set_lfo_rate', '_lead_fm_set_lfo_depth', '_lead_fm_set_lfo_target',
    '_lead_fm_set_unison_voices', '_lead_fm_set_unison_detune',
    '_lead_fm_set_delay_enabled', '_lead_fm_set_delay_time_l', '_lead_fm_set_delay_time_r',
    '_lead_fm_set_delay_feedback', '_lead_fm_set_delay_filter',
    '_lead_fm_set_delay_mix', '_lead_fm_set_delay_send',
    '_lead_fm_get_active_count',
    '_malloc', '_free',
]

exports_str = "[" + ",".join(f"'{e}'" for e in EXPORTS) + "]"

cmd = [
    PYTHON, EMCC, SRC,
    '-o', OUT,
    '-std=c++17',
    '-O2',
    '-fno-math-errno', '-freciprocal-math', '-fno-trapping-math',
    '-msimd128',
    f'-I{INC}',
    '-DNDEBUG',
    '-sALLOW_MEMORY_GROWTH=1',
    '-sINITIAL_MEMORY=16777216',
    '-sMAXIMUM_MEMORY=67108864',
    '-sSTANDALONE_WASM=1',
    '--no-entry',
    f'-sEXPORTED_FUNCTIONS={exports_str}',
]

log_path = os.path.join(BASE, "wasm_build_log.txt")

# Set EMSDK environment variables
env = os.environ.copy()
env['EMSDK'] = os.path.join(BASE, 'emsdk')
env['EM_CONFIG'] = os.path.join(BASE, 'emsdk', '.emscripten')
env['EMSDK_NODE'] = os.path.join(BASE, 'emsdk', 'node', '22.16.0_64bit', 'bin', 'node.exe')
# Add emsdk and emscripten to PATH
env['PATH'] = os.path.join(BASE, 'emsdk') + ';' + os.path.join(BASE, 'emsdk', 'upstream', 'emscripten') + ';' + env.get('PATH', '')

with open(log_path, 'w') as log:
    log.write("CMD: " + " ".join(cmd[:6]) + " ...\n")
    log.flush()
    result = subprocess.run(cmd, capture_output=True, text=True, env=env)
    log.write(f"STDOUT: {result.stdout}\n")
    log.write(f"STDERR: {result.stderr}\n")
    log.write(f"RETURN_CODE: {result.returncode}\n")
    if result.returncode == 0 and os.path.exists(OUT):
        size = os.path.getsize(OUT)
        data = open(OUT, 'rb').read()
        log.write(f"WASM_SIZE: {size}\n")
        log.write(f"HAS_NOTE_ON_EX: {b'lead_fm_note_on_ex' in data}\n")
        log.write(f"HAS_OUTPUT2_PTR: {b'lead_fm_get_output2_ptr' in data}\n")
    else:
        log.write("BUILD FAILED or output not found\n")
print(f"Build log written to {log_path}")
