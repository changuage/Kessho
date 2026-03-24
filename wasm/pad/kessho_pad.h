/**
 * Kessho Pad Synth — C API Header
 *
 * Full C++ port of engine.ts pad synthesis for compilation to:
 *   - WebAssembly (via Emscripten) for web AudioWorklet
 *   - Native ARM/x86 for iOS/macOS (via CMake)
 *
 * Dual-pad architecture: Pad 1 + Pad 2, 6 voices each (12 total).
 * Each voice: 4 oscillators (OscA, OscA detuned, OscB, Sub) + noise,
 * dual SVF filters (A+B, configurable routing), warmth/presence EQ,
 * saturation waveshaper, ADSR amplitude envelope, 2 LFOs, mod envelope.
 *
 * No pad-specific delay (reverb send handled externally).
 */

#ifndef KESSHO_PAD_H
#define KESSHO_PAD_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// ═══════════════ Constants ═══════════════

#define PAD_NUM_VOICES          6    // 6 voices total, assigned to pad 1 or 2
#define PAD_MAX_BLOCK_SIZE      128
#define PAD_NUM_PADS            2

// Waveform indices
#define PAD_WAVE_SINE      0
#define PAD_WAVE_TRIANGLE  1
#define PAD_WAVE_SAWTOOTH  2
#define PAD_WAVE_SQUARE    3

// Filter types
#define PAD_FILTER_LP      0
#define PAD_FILTER_BP      1
#define PAD_FILTER_HP      2
#define PAD_FILTER_NOTCH   3

// Filter routing
#define PAD_ROUTE_SERIES   0
#define PAD_ROUTE_A_ONLY   1
#define PAD_ROUTE_B_ONLY   2

// LFO waveforms
#define PAD_LFO_SINE          0
#define PAD_LFO_TRIANGLE      1
#define PAD_LFO_SAWTOOTH      2
#define PAD_LFO_SQUARE        3
#define PAD_LFO_SAMPLE_HOLD   4
#define PAD_LFO_RANDOM_SMOOTH 5
#define PAD_LFO_RANDOM_WALK   6

// LFO / Mod envelope destinations
#define PAD_DEST_NONE          0
#define PAD_DEST_FILTER_CUTOFF 1
#define PAD_DEST_FILTER_B      2
#define PAD_DEST_AMPLITUDE     3
#define PAD_DEST_PITCH         4
#define PAD_DEST_OSC_B_LEVEL   5
#define PAD_DEST_FOLD_AMOUNT   6

// Fold modes
#define PAD_FOLD_BUCHLA  0
#define PAD_FOLD_SINE    1
#define PAD_FOLD_SERGE   2

// ═══════════════ Lifecycle ═══════════════

int   pad_init(float sample_rate);
void  pad_destroy(void);

// ═══════════════ Buffer Access ═══════════════

/** Stereo interleaved output. Size: MAX_BLOCK_SIZE * 2 */
float* pad_get_output_ptr(void);

/** Stereo interleaved reverb send output */
float* pad_get_reverb_send_ptr(void);

/** Stereo interleaved pre-fader output (for granular FX input) */
float* pad_get_prefader_ptr(void);

// ═══════════════ Processing ═══════════════

void pad_process_block(int block_size);

// ═══════════════ Voice Control ═══════════════

/** Trigger a voice with the given frequency and velocity */
void pad_note_on(int voice_idx, float frequency, float velocity);

/** Release a voice */
void pad_note_off(int voice_idx);

/** Assign a voice to pad 1 (pad=0) or pad 2 (pad=1) */
void pad_set_voice_pad(int voice_idx, int pad);

// ═══════════════ Per-Pad Parameters ═══════════════
// pad_idx: 0=pad1, 1=pad2

// Oscillator A
void pad_set_osc_a_wave(int pad_idx, int wave);
void pad_set_osc_a_octave(int pad_idx, int octave);
void pad_set_osc_a_detune(int pad_idx, float cents);
void pad_set_osc_a_level(int pad_idx, float level);

// Oscillator B
void pad_set_osc_b_wave(int pad_idx, int wave);
void pad_set_osc_b_octave(int pad_idx, int octave);
void pad_set_osc_b_detune(int pad_idx, float cents);
void pad_set_osc_b_level(int pad_idx, float level);

// Osc Mix
void pad_set_osc_mix(int pad_idx, float mix);

// Sub oscillator
void pad_set_sub_enabled(int pad_idx, int enabled);
void pad_set_sub_octave(int pad_idx, int octave);
void pad_set_sub_wave(int pad_idx, int wave);
void pad_set_sub_level(int pad_idx, float level);

// Noise
void pad_set_noise_type(int pad_idx, int type); // 0=white, 1=pink
void pad_set_noise_level(int pad_idx, float level);

// Timbre
void pad_set_hardness(int pad_idx, float hardness);
void pad_set_warmth(int pad_idx, float warmth);
void pad_set_presence(int pad_idx, float presence);
void pad_set_fold_amount(int pad_idx, float amount);
void pad_set_fold_mode(int pad_idx, int mode);

// Filter A
void pad_set_filter_type(int pad_idx, int type);
void pad_set_filter_cutoff_min(int pad_idx, float hz);
void pad_set_filter_cutoff_max(int pad_idx, float hz);
void pad_set_filter_resonance(int pad_idx, float resonance);
void pad_set_filter_q(int pad_idx, float q);

// Filter B
void pad_set_filter_b_enabled(int pad_idx, int enabled);
void pad_set_filter_b_type(int pad_idx, int type);
void pad_set_filter_b_cutoff(int pad_idx, float hz);
void pad_set_filter_b_resonance(int pad_idx, float resonance);
void pad_set_filter_b_q(int pad_idx, float q);
void pad_set_filter_routing(int pad_idx, int routing);

// Amp Envelope (ADSR)
void pad_set_attack(int pad_idx, float seconds);
void pad_set_decay(int pad_idx, float seconds);
void pad_set_sustain(int pad_idx, float level);
void pad_set_release(int pad_idx, float seconds);

// LFO 1
void pad_set_lfo1_rate(int pad_idx, float hz);
void pad_set_lfo1_depth(int pad_idx, float depth);
void pad_set_lfo1_wave(int pad_idx, int wave);
void pad_set_lfo1_dest(int pad_idx, int dest);

// LFO 2
void pad_set_lfo2_rate(int pad_idx, float hz);
void pad_set_lfo2_depth(int pad_idx, float depth);
void pad_set_lfo2_wave(int pad_idx, int wave);
void pad_set_lfo2_dest(int pad_idx, int dest);

// Mod Envelope
void pad_set_mod_env_enabled(int pad_idx, int enabled);
void pad_set_mod_env_attack(int pad_idx, float seconds);
void pad_set_mod_env_decay(int pad_idx, float seconds);
void pad_set_mod_env_sustain(int pad_idx, float level);
void pad_set_mod_env_release(int pad_idx, float seconds);
void pad_set_mod_env_depth(int pad_idx, float depth);
void pad_set_mod_env_dest(int pad_idx, int dest);

// Level
void pad_set_level(int pad_idx, float level);
void pad_set_reverb_send(float level);

// ═══════════════ Status ═══════════════

int pad_get_active_count(void);

#ifdef __cplusplus
}
#endif

#endif // KESSHO_PAD_H
