#!/usr/bin/env python3
"""
ZOIA Patch Binary Parser
========================
Decodes Empress ZOIA .bin preset files into human-readable module + cable lists.
Based on the open-source zoia_lib (meanmedianmoge/zoia_lib) binary format.

Usage:
    python parse_zoia.py <patch.bin>
"""

import struct
import sys
import json
from pathlib import Path

# ─── Module name lookup (from ModuleIndex.json, indices 0–107) ───
MODULE_NAMES = {
    0: "SV Filter", 1: "Audio Input", 2: "Audio Output", 3: "Aliaser",
    4: "Sequencer", 5: "LFO", 6: "ADSR", 7: "VCA", 8: "Audio Multiply",
    9: "Bit Crusher", 10: "Sample and Hold", 11: "OD & Distortion",
    12: "Env Follower", 13: "Delay Line", 14: "Oscillator", 15: "Pushbutton",
    16: "Keyboard", 17: "CV Invert", 18: "Steps", 19: "Slew Limiter",
    20: "Midi Notes In", 21: "Midi CC In", 22: "Multiplier", 23: "Compressor",
    24: "Multi Filter", 25: "Plate Reverb", 26: "Buffer Delay",
    27: "All Pass Filter", 28: "Quantizer", 29: "Phaser", 30: "Looper",
    31: "In Switch", 32: "Out Switch", 33: "Audio In Switch",
    34: "Audio Out Switch", 35: "Midi Pressure", 36: "Onset Detector",
    37: "Rhythm", 38: "Noise", 39: "Random", 40: "Gate", 41: "Tremolo",
    42: "Tone Control", 43: "Delay w/Mod", 44: "Stompswitch", 45: "Value",
    46: "CV Delay", 47: "CV Loop", 48: "CV Filter", 49: "Clock Divider",
    50: "Comparator", 51: "CV Rectify", 52: "Trigger", 53: "Stereo Spread",
    54: "Cport Exp/CV In", 55: "Cport CV Out", 56: "UI Button",
    57: "Audio Panner", 58: "Pitch Detector", 59: "Pitch Shifter",
    60: "Midi Note Out", 61: "Midi CC Out", 62: "Midi PC Out",
    63: "Bit Modulator", 64: "Audio Balance", 65: "Inverter", 66: "Fuzz",
    67: "Ghostverb", 68: "Cabinet Sim", 69: "Flanger", 70: "Chorus",
    71: "Vibrato", 72: "Env Filter", 73: "Ring Modulator", 74: "Hall Reverb",
    75: "Ping Pong Delay", 76: "Audio Mixer", 77: "CV Flip Flop",
    78: "Diffuser", 79: "Reverb Lite", 80: "Room Reverb", 81: "Pixel",
    82: "Midi Clock In", 83: "Granular", 84: "Midi Clock Out",
    85: "Tap to CV", 86: "Midi Pitch Bend", 87: "Euro CV Out 4",
    88: "Euro CV In 1", 89: "Euro CV In 2", 90: "Euro CV In 3",
    91: "Euro CV In 4", 92: "Euro Headphone Amp", 93: "Euro Audio Input 1",
    94: "Euro Audio Input 2", 95: "Euro Audio Output 1",
    96: "Euro Audio Output 2", 97: "Euro Pushbutton 1",
    98: "Euro Pushbutton 2", 99: "Euro CV Out 1", 100: "Euro CV Out 2",
    101: "Euro CV Out 3", 102: "Sampler", 103: "Device Control",
    104: "CV Mixer", 105: "Logic Gate", 106: "Reverse Delay", 107: "Univibe",
}

# Module categories for grouping
MODULE_CATEGORIES = {
    0: "Audio", 1: "Interface", 2: "Interface", 3: "Audio", 4: "CV", 5: "CV",
    6: "CV", 7: "Audio", 8: "Audio", 9: "Audio", 10: "CV", 11: "Effect",
    12: "Analysis", 13: "Audio", 14: "Audio", 15: "Interface", 16: "Interface",
    17: "CV", 18: "CV", 19: "CV", 20: "Interface", 21: "Interface", 22: "CV",
    23: "Effect", 24: "Audio", 25: "Effect", 26: "Audio", 27: "Audio",
    28: "CV", 29: "Effect", 30: "Audio", 31: "CV", 32: "CV", 33: "Audio",
    34: "Audio", 35: "Interface", 36: "Analysis", 37: "CV", 38: "Audio",
    39: "CV", 40: "Effect", 41: "Effect", 42: "Effect", 43: "Effect",
    44: "Interface", 45: "CV", 46: "CV", 47: "CV", 48: "CV", 49: "CV",
    50: "CV", 51: "CV", 52: "CV", 53: "Audio", 54: "Interface",
    55: "Interface", 56: "Interface", 57: "Audio", 58: "Analysis",
    59: "Audio", 60: "Interface", 61: "Interface", 62: "Interface",
    63: "Audio", 64: "Audio", 65: "Audio", 66: "Effect", 67: "Effect",
    68: "Effect", 69: "Effect", 70: "Effect", 71: "Effect", 72: "Effect",
    73: "Effect", 74: "Effect", 75: "Effect", 76: "Audio", 77: "CV",
    78: "Audio", 79: "Effect", 80: "Effect", 81: "Interface", 82: "Interface",
    83: "Audio", 84: "Interface", 85: "CV", 86: "Interface", 87: "Interface",
    88: "Interface", 89: "Interface", 90: "Interface", 91: "Interface",
    92: "Interface", 93: "Interface", 94: "Interface", 95: "Interface",
    96: "Interface", 97: "Interface", 98: "Interface", 99: "Interface",
    100: "Interface", 101: "Interface", 102: "Audio", 103: "Interface",
    104: "CV", 105: "CV", 106: "Effect", 107: "Effect",
}

# Block definitions for key modules (name -> {position: block_name})
# This maps block positions to human-readable names for the most important modules
MODULE_BLOCKS = {
    0: {0: "audio_in", 1: "frequency", 2: "resonance", 3: "lowpass_out", 4: "hipass_out", 5: "bandpass_out"},
    1: {0: "output_L", 1: "output_R"},
    2: {0: "input_L", 1: "input_R", 2: "gain"},
    5: {0: "cv_control", 1: "tap_control", 2: "swing_amount", 3: "output", 4: "phase_input", 5: "phase_reset"},
    6: {0: "cv_input", 1: "retrigger", 2: "delay", 3: "attack", 4: "hold_AD", 5: "decay", 6: "sustain", 7: "hold_SR", 8: "release", 9: "cv_output"},
    7: {0: "audio_in_1", 1: "audio_in_2", 2: "level_control", 3: "audio_out_1", 4: "audio_out_2"},
    13: {0: "audio_in", 1: "delay_time", 2: "mod_in", 3: "tap_tempo", 4: "audio_out"},
    24: {0: "audio_in", 1: "gain", 2: "frequency", 3: "q", 4: "audio_out"},
    25: {0: "audio_in_L", 1: "audio_in_R", 2: "mix", 3: "decay_time", 4: "audio_out_L", 5: "audio_out_R", 6: "low_eq", 7: "high_eq"},
    30: {0: "audio_in", 1: "record", 2: "restart_playback", 3: "speed_pitch", 4: "start_position", 5: "loop_length", 6: "audio_out", 7: "reverse_playback", 8: "reset", 9: "stop_play"},
    38: {0: "audio_out"},
    43: {0: "audio_in_L", 1: "audio_in_R", 2: "delay_time", 3: "feedback", 4: "mod_rate", 5: "tap_tempo", 6: "mod_depth", 7: "mix", 8: "audio_out_L", 9: "audio_out_R"},
    44: {0: "cv_output"},
    45: {0: "value", 1: "cv_output"},
    48: {0: "cv_input", 1: "time_constant", 2: "cv_output", 3: "rise_constant", 4: "fall_constant"},
    52: {0: "cv_input", 1: "cv_output"},
    59: {0: "audio_in", 1: "pitch_shift", 2: "audio_out"},
    64: {0: "audio_in_1_L", 1: "audio_in_2_L", 2: "mix", 3: "audio_out_L", 4: "audio_in_1_R", 5: "audio_in_2_R", 6: "audio_out_R"},
    67: {0: "audio_in_L", 1: "audio_in_R", 2: "decay_feedback", 3: "rate", 4: "resonance", 5: "mix", 6: "audio_out_L", 7: "audio_out_R"},
    74: {0: "audio_in_L", 1: "audio_in_R", 2: "decay_time", 3: "mix", 4: "audio_out_L", 5: "audio_out_R", 6: "low_eq", 7: "lpf_freq"},
    75: {0: "audio_in_L", 1: "audio_in_R", 2: "delay_time", 3: "tap_tempo", 4: "feedback", 5: "mod_rate", 6: "mod_depth", 7: "mix", 8: "audio_out_L", 9: "audio_out_R"},
    76: {0: "audio_in_1_L", 1: "audio_in_1_R", 2: "audio_in_2_L", 3: "audio_in_2_R",
         4: "audio_in_3_L", 5: "audio_in_3_R", 6: "audio_in_4_L", 7: "audio_in_4_R",
         8: "audio_in_5_L", 9: "audio_in_5_R", 10: "audio_in_6_L", 11: "audio_in_6_R",
         12: "audio_in_7_L", 13: "audio_in_7_R", 14: "audio_in_8_L", 15: "audio_in_8_R",
         16: "gain_1", 17: "gain_2", 18: "gain_3", 19: "gain_4",
         20: "gain_5", 21: "gain_6", 22: "gain_7", 23: "gain_8",
         24: "pan_1", 25: "pan_2", 26: "pan_3", 27: "pan_4",
         28: "pan_5", 29: "pan_6", 30: "pan_7", 31: "pan_8",
         32: "audio_out_L", 33: "audio_out_R"},
    79: {0: "audio_in_L", 1: "audio_in_R", 2: "decay_time", 3: "mix", 4: "audio_out_L", 5: "audio_out_R"},
    80: {0: "audio_in_L", 1: "audio_in_R", 2: "decay_time", 3: "low_eq", 4: "lpf_freq", 5: "mix", 6: "audio_out_L", 7: "audio_out_R"},
    83: {0: "audio_in_L", 1: "audio_in_R", 2: "grain_size", 3: "grain_position", 4: "density", 5: "texture", 6: "speed_pitch", 7: "freeze", 8: "audio_out_L", 9: "audio_out_R"},
    106: {0: "audio_in_L", 1: "audio_in_R", 2: "delay_time", 3: "tap_tempo", 4: "tap_ratio", 5: "feedback", 6: "pitch", 7: "mix", 8: "audio_out_L", 9: "audio_out_R"},
}

# Module options definitions for key modules
MODULE_OPTIONS = {
    0: {"lowpass_output": ["on", "off"], "hipass_output": ["off", "on"], "bandpass_output": ["off", "on"], "freq_change": ["smooth", "instant"]},
    1: {"channels": ["stereo", "left", "right"]},
    2: {"gain_control": ["off", "on"], "channels": ["stereo", "left", "right"]},
    5: {"waveform": ["square", "sine", "triangle", "sawtooth", "ramp", "random"], "swing_control": ["off", "on"], "output": ["0 to 1", "-1 to 1"], "input": ["cv", "tap", "linear_cv"], "phase_input": ["off", "on"], "phase_reset": ["off", "on"]},
    6: {"retrigger_input": ["off", "on"], "initial_delay": ["off", "on"], "hold_attack_decay": ["off", "on"], "str": ["on", "off"], "immediate_release": ["on", "off"], "hold_sustain_release": ["off", "on"], "time_scale": ["exponent", "linear"]},
    7: {"channels": ["1in->1out", "stereo"]},
    13: {"max_time": ["1s", "2s", "4s", "8s", "16s", "100ms"], "tap_tempo_in": ["no", "yes"], "interpolation": ["on", "off"], "CV Input": ["exponent", "linear"]},
    24: {"filter_shape": ["lowpass", "hi_shelf", "bell", "highpass", "low_shelf", "bandpass"]},
    30: {"max_rec_time": ["1s", "2s", "4s", "8s", "16s", "32s"], "length_edit": ["off", "on"], "playback": ["once", "loop"], "length": ["fixed", "pre_speed"], "hear_while_rec": ["no", "yes"], "play_reverse": ["no", "yes"], "overdub": ["no", "yes"], "stop_play_button": ["no", "yes"]},
    43: {"channels": ["1in->1out", "1in->2out", "2in->2out"], "control": ["rate", "tap_tempo"], "type": ["clean", "tape", "old_tape", "bbd"], "tap_ratio": ["1:1", "2:3", "1:2", "1:3", "3:8", "1:4", "3:16", "1:8", "1:16", "1:32"]},
    44: {"stompswitch": ["left", "middle", "right", "ext"], "action": ["momentary", "latching"], "normally": ["zero", "one"]},
    45: {"output": ["0 to 1", "-1 to 1"]},
    48: {"control": ["linked", "separate"]},
    64: {"stereo": ["mono", "stereo"]},
    67: {"channels": ["1in->1out", "1in->2out", "stereo"]},
    74: {},
    75: {"channels": ["1in->2out", "stereo"], "control": ["rate", "tap_tempo", "cv_direct"], "type": ["clean", "tape", "old_tape", "bbd"], "tap_ratio": ["1:1", "2:3", "1:2", "1:3", "3:8", "1:4", "3:16", "1:8", "1:16", "1:32"]},
    76: {"channels": [2, 3, 4, 5, 6, 7, 8], "stereo": ["mono", "stereo"], "panning": ["off", "on"]},
    79: {"channels": ["1in->1out", "1in->2out", "stereo"]},
    83: {"num_grains": [1, 2, 3, 4, 5, 6, 7, 8], "channels": ["mono", "stereo"], "pos_control": ["cv", "tap_tempo"], "size_control": ["cv", "tap_tempo"], "max_grain_size": ["1s", "4s", "16s"]},
    106: {"channels": ["mono", "stereo"], "control": ["rate", "tap_tempo"]},
}

# Color ID to name
COLOR_NAMES = {
    1: "Blue", 2: "Green", 3: "Red", 4: "Yellow", 5: "Aqua",
    6: "Magenta", 7: "White", 8: "Orange", 9: "Lima", 10: "Surf",
    11: "Sky", 12: "Purple", 13: "Pink", 14: "Peach", 15: "Mango",
}


def extract_name(byt, offset):
    """Extract a null-terminated string from raw bytes."""
    raw = byt[offset:offset + 16]
    try:
        return raw.split(b'\x00')[0].decode('ascii', errors='replace').strip()
    except:
        return "<unknown>"


def decode_options(mod_idx, option_bytes):
    """Decode option bytes using the module options definitions."""
    opts = MODULE_OPTIONS.get(mod_idx, {})
    if not opts:
        return {f"raw_opt_{i}": b for i, b in enumerate(option_bytes) if b != 0}

    result = {}
    opt_keys = list(opts.keys())
    for i, key in enumerate(opt_keys):
        if i < len(option_bytes):
            val_idx = option_bytes[i]
            choices = opts[key]
            if isinstance(choices, list) and val_idx < len(choices):
                result[key] = choices[val_idx]
            else:
                result[key] = val_idx
    return result


def parse_zoia_bin(filepath):
    """Parse a ZOIA .bin file and return structured data."""
    with open(filepath, 'rb') as f:
        byt = f.read()

    # Unpack as little-endian int32s
    n_ints = len(byt) // 4
    data = struct.unpack(f'<{n_ints}i', byt[:n_ints * 4])

    patch_size = data[0]
    patch_name = extract_name(byt, 4)
    n_modules = data[5]

    print(f"{'=' * 70}")
    print(f"ZOIA PATCH: {patch_name}")
    print(f"{'=' * 70}")
    print(f"Size: {patch_size} int32s ({patch_size * 4} bytes)")
    print(f"Modules: {n_modules}")
    print()

    modules = []
    curr_step = 6

    for i in range(n_modules):
        size = data[curr_step]
        mod_idx = data[curr_step + 1]
        version = data[curr_step + 2]
        page = data[curr_step + 3]
        color_id = data[curr_step + 4]
        position = data[curr_step + 5]
        params_count = data[curr_step + 6]
        saveable_size = data[curr_step + 7]

        # Extract options bytes (8 bytes = 2 int32s at offsets 8,9)
        opt_bytes = list(bytearray(byt[(curr_step + 8) * 4:(curr_step + 8) * 4 + 4]))
        opt_bytes += list(bytearray(byt[(curr_step + 9) * 4:(curr_step + 9) * 4 + 4]))

        # Extract parameter values
        params_raw = []
        params_norm = []
        for p in range(params_count):
            raw_val = data[curr_step + 10 + p]
            params_raw.append(raw_val)
            params_norm.append(round(raw_val / 65535, 4) if raw_val >= 0 else round(raw_val / 65535, 4))

        # Extract module name (user-given name, at end of module data)
        name_offset = (curr_step + (size - 4)) * 4
        user_name = extract_name(byt, name_offset)

        # Get type name
        type_name = MODULE_NAMES.get(mod_idx, f"Unknown({mod_idx})")
        category = MODULE_CATEGORIES.get(mod_idx, "?")
        color = COLOR_NAMES.get(color_id, f"color_{color_id}")

        # Decode options
        options = decode_options(mod_idx, opt_bytes)

        module = {
            "number": i,
            "mod_idx": mod_idx,
            "type": type_name,
            "category": category,
            "name": user_name if user_name else "",
            "version": version,
            "page": page,
            "position": position,
            "color": color,
            "params_count": params_count,
            "params_raw": params_raw,
            "params_norm": params_norm,
            "options": options,
            "options_raw": opt_bytes,
        }
        modules.append(module)
        curr_step += size

    # ─── Connections ───
    n_connections = data[curr_step]
    connections = []
    curr_step_conn = curr_step

    for j in range(n_connections):
        src_mod = data[curr_step_conn + 1]
        src_block = data[curr_step_conn + 2]
        dst_mod = data[curr_step_conn + 3]
        dst_block = data[curr_step_conn + 4]
        strength = data[curr_step_conn + 5]

        # Resolve block names
        src_type_idx = modules[src_mod]["mod_idx"] if src_mod < len(modules) else -1
        dst_type_idx = modules[dst_mod]["mod_idx"] if dst_mod < len(modules) else -1
        src_block_name = MODULE_BLOCKS.get(src_type_idx, {}).get(src_block, f"block_{src_block}")
        dst_block_name = MODULE_BLOCKS.get(dst_type_idx, {}).get(dst_block, f"block_{dst_block}")

        conn = {
            "source_mod": src_mod,
            "source_block": src_block,
            "source_block_name": src_block_name,
            "dest_mod": dst_mod,
            "dest_block": dst_block,
            "dest_block_name": dst_block_name,
            "strength": strength // 100,  # percentage
            "strength_raw": strength,
        }
        connections.append(conn)
        curr_step_conn += 5

    # ─── Pages ───
    curr_step_page = curr_step_conn + 1
    n_pages = data[curr_step_page]
    pages = []
    for k in range(n_pages):
        page_name = extract_name(byt, (curr_step_page + 1) * 4)
        pages.append(page_name)
        curr_step_page += 4

    # ─── Print Modules ───
    print(f"{'─' * 70}")
    print("MODULES")
    print(f"{'─' * 70}")
    for m in modules:
        display_name = m["name"] if m["name"] else m["type"]
        label = f'[{m["number"]:2d}] {m["type"]}'
        if m["name"]:
            label += f' ("{m["name"]}")'
        label += f'  (page {m["page"]}, {m["color"]})'
        print(label)

        if m["options"]:
            opts_str = ", ".join(f"{k}={v}" for k, v in m["options"].items())
            print(f"     Options: {opts_str}")

        # Show parameters with block names
        blocks = MODULE_BLOCKS.get(m["mod_idx"], {})
        param_blocks = {pos: name for pos, name in blocks.items()
                       if name not in [n for n in blocks.values()
                                       if 'out' in n.lower() and 'audio' in n.lower()]}
        if m["params_norm"]:
            param_strs = []
            # Get param names from block definitions (isParam blocks in order)
            for pi, pv in enumerate(m["params_norm"]):
                param_strs.append(f"p{pi}={pv:.3f}")
            print(f"     Params: {', '.join(param_strs)}")
        print()

    # ─── Print Pages ───
    if pages:
        print(f"{'─' * 70}")
        print("PAGES")
        print(f"{'─' * 70}")
        for pi, pname in enumerate(pages):
            mods_on_page = [m for m in modules if m["page"] == pi]
            mod_list = ", ".join(f'[{m["number"]}]{m["type"]}' for m in mods_on_page)
            print(f"  Page {pi}: \"{pname}\" → {mod_list if mod_list else '(empty)'}")
        print()

    # ─── Print Connections ───
    print(f"{'─' * 70}")
    print(f"CONNECTIONS ({n_connections} cables)")
    print(f"{'─' * 70}")
    for c in connections:
        src_m = modules[c["source_mod"]]
        dst_m = modules[c["dest_mod"]]
        src_label = src_m["name"] if src_m["name"] else src_m["type"]
        dst_label = dst_m["name"] if dst_m["name"] else dst_m["type"]
        print(f"  [{c['source_mod']:2d}] {src_label}.{c['source_block_name']}"
              f"  ──{c['strength']:3d}%──▶  "
              f"[{c['dest_mod']:2d}] {dst_label}.{c['dest_block_name']}")
    print()

    # ─── Signal Flow Analysis ───
    print(f"{'─' * 70}")
    print("SIGNAL FLOW ANALYSIS")
    print(f"{'─' * 70}")

    # Find audio I/O
    inputs = [m for m in modules if m["mod_idx"] == 1]
    outputs = [m for m in modules if m["mod_idx"] == 2]
    print(f"  Audio Inputs:  {len(inputs)}  {[m['number'] for m in inputs]}")
    print(f"  Audio Outputs: {len(outputs)}  {[m['number'] for m in outputs]}")

    # Categorize modules
    effects = [m for m in modules if m["category"] == "Effect"]
    audio_proc = [m for m in modules if m["category"] == "Audio" and m["mod_idx"] not in [1, 2]]
    cv_mods = [m for m in modules if m["category"] == "CV"]
    interface_mods = [m for m in modules if m["category"] == "Interface" and m["mod_idx"] not in [1, 2]]

    if effects:
        print(f"\n  Effects ({len(effects)}):")
        for m in effects:
            print(f"    [{m['number']:2d}] {m['type']}" + (f' "{m["name"]}"' if m["name"] else ""))

    if audio_proc:
        print(f"\n  Audio Processing ({len(audio_proc)}):")
        for m in audio_proc:
            print(f"    [{m['number']:2d}] {m['type']}" + (f' "{m["name"]}"' if m["name"] else ""))

    if cv_mods:
        print(f"\n  CV/Control ({len(cv_mods)}):")
        for m in cv_mods:
            print(f"    [{m['number']:2d}] {m['type']}" + (f' "{m["name"]}"' if m["name"] else ""))

    if interface_mods:
        print(f"\n  Interface ({len(interface_mods)}):")
        for m in interface_mods:
            print(f"    [{m['number']:2d}] {m['type']}" + (f' "{m["name"]}"' if m["name"] else ""))

    # ─── Build adjacency for audio path tracing ───
    print(f"\n{'─' * 70}")
    print("AUDIO PATH TRACE (from Audio Input)")
    print(f"{'─' * 70}")

    # Build forward adjacency: mod -> [(dst_mod, src_block_name, dst_block_name, strength)]
    adj = {}
    for c in connections:
        src = c["source_mod"]
        dst = c["dest_mod"]
        if src not in adj:
            adj[src] = []
        adj[src].append((dst, c["source_block_name"], c["dest_block_name"], c["strength"]))

    # BFS from each Audio Input
    for inp in inputs:
        visited = set()
        queue = [(inp["number"], 0, "")]
        print(f"\n  From [{inp['number']}] Audio Input:")
        paths = []

        while queue:
            node, depth, path = queue.pop(0)
            if node in visited:
                continue
            visited.add(node)
            m = modules[node]
            label = m["name"] if m["name"] else m["type"]
            indent = "    " + "  " * depth
            print(f"{indent}└─▶ [{node}] {label}")

            if node in adj:
                for dst, sb, db, strength in adj[node]:
                    if dst not in visited and dst < len(modules):
                        # Only follow audio-carrying connections (heuristic: strength > 0 and involves audio blocks)
                        queue.append((dst, depth + 1, f"{path} -> {label}"))

    # ─── CPU estimate ───
    CPU_COSTS = {
        0: 1, 1: 0.3, 2: 1, 3: 0.6, 4: 2, 5: 0.3, 6: 0.07, 7: 0.3, 8: 0.2,
        9: 0.3, 10: 0.1, 11: 14.2, 12: 2.5, 13: 2, 14: 6, 15: 0.02, 16: 0.1,
        17: 0.02, 18: 0.7, 19: 0.2, 20: 0.1, 21: 0.1, 22: 0.2, 23: 2.4,
        24: 0.8, 25: 16.7, 26: 0.2, 27: 3, 28: 1, 29: 7.5, 30: 0.3, 31: 0.2,
        32: 0.2, 33: 0.8, 34: 0.7, 35: 0.03, 36: 12.3, 37: 0.5, 38: 0.4,
        39: 0.1, 40: 2.8, 41: 1.5, 42: 2.2, 43: 11, 44: 0.1, 45: 0.15,
        46: 1.5, 47: 0.1, 48: 0.1, 49: 0.14, 50: 0.04, 51: 0.07, 52: 0.1,
        53: 1.5, 54: 0.1, 55: 0.2, 56: 0.04, 57: 1, 58: 2.3, 59: 15.1,
        60: 0.1, 61: 0.2, 62: 0.1, 63: 0.8, 64: 0.8, 65: 0.2, 66: 14.1,
        67: 24.5, 68: 7, 69: 7.35, 70: 8, 71: 4.1, 72: 3.35, 73: 5.3,
        74: 17, 75: 13.4, 76: 11.5, 77: 0.2, 78: 1.7, 79: 6.5, 80: 17,
        81: 0.01, 82: 0.1, 83: 17, 84: 0.3, 85: 0.12, 86: 0.1, 102: 0.9,
        103: 0.1, 104: 0.3, 105: 0.1, 106: 0.1, 107: 0.1,
    }
    total_cpu = sum(CPU_COSTS.get(m["mod_idx"], 0) for m in modules)
    print(f"\n{'─' * 70}")
    print(f"Estimated CPU: {total_cpu:.1f}%")
    print(f"{'=' * 70}")

    # ─── Export JSON ───
    output = {
        "name": patch_name,
        "size": patch_size,
        "modules": modules,
        "connections": [{
            "source": f"{c['source_mod']}.{c['source_block_name']}",
            "destination": f"{c['dest_mod']}.{c['dest_block_name']}",
            "strength": c["strength"],
            "source_mod": c["source_mod"],
            "dest_mod": c["dest_mod"],
        } for c in connections],
        "pages": pages,
        "meta": {
            "n_modules": len(modules),
            "n_connections": n_connections,
            "n_pages": len(pages),
            "cpu": round(total_cpu, 1),
        }
    }

    json_path = Path(filepath).with_suffix('.json')
    with open(json_path, 'w') as f:
        json.dump(output, f, indent=2)
    print(f"\nJSON exported to: {json_path}")

    return output


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python parse_zoia.py <patch.bin>")
        sys.exit(1)

    parse_zoia_bin(sys.argv[1])
