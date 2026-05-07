/**
 * Kessho Lead 4-op FM Synth — C API Header
 *
 * Full C++ port of lead4opfm.ts for compilation to:
 *   - WebAssembly (via Emscripten) for web AudioWorklet
 *   - Native ARM/x86 for iOS/macOS (via CMake)
 *
 * 4-operator FM with 5 algorithms, unison (1-4), ADSR + filter envelope,
 * per-operator feedback/level/detune, LFO, XY stereo routing, drive,
 * transient layer, and stereo ping-pong delay.
 *
 * Preset morphing stays in JS — the WASM engine receives pre-morphed params.
 */

#ifndef KESSHO_LEAD_FM_H
#define KESSHO_LEAD_FM_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct KesshoLeadFmInstance KesshoLeadFmInstance;

// ═══════════════ Constants ═══════════════

#define LEAD_FM_MAX_POLYPHONY     8   // max simultaneous notes
#define LEAD_FM_MAX_UNISON        4   // max unison voices per note
#define LEAD_FM_NUM_OPERATORS     4
#define LEAD_FM_MAX_BLOCK_SIZE    128
#define LEAD_FM_DELAY_MAX_SECONDS 4.0f

// Algorithm indices
#define LEAD_FM_ALG_PARALLEL  0
#define LEAD_FM_ALG_STACK     1
#define LEAD_FM_ALG_SPLIT     2
#define LEAD_FM_ALG_CROSS     3
#define LEAD_FM_ALG_DX17      4

// LFO targets
#define LEAD_FM_LFO_ALL     0
#define LEAD_FM_LFO_MOD1    1
#define LEAD_FM_LFO_MOD2    2
#define LEAD_FM_LFO_MOD3    3
#define LEAD_FM_LFO_MOD4    4
#define LEAD_FM_LFO_FILTER  5
#define LEAD_FM_LFO_PITCH   6
#define LEAD_FM_LFO_DETUNE  7
#define LEAD_FM_LFO_NONE    8

// Filter types
#define LEAD_FM_FILTER_LP    0
#define LEAD_FM_FILTER_HP    1
#define LEAD_FM_FILTER_BP    2
#define LEAD_FM_FILTER_NOTCH 3
#define LEAD_FM_FILTER_PEAK  4

// Transient types
#define LEAD_FM_TRANS_WHITE    0
#define LEAD_FM_TRANS_PINK     1
#define LEAD_FM_TRANS_BROWN    2
#define LEAD_FM_TRANS_FILTERED 3

// ═══════════════ Lifecycle ═══════════════

int   lead_fm_init(float sample_rate);
void  lead_fm_destroy(void);

// ═══════════════ Buffer Access ═══════════════

/** Stereo interleaved output (L0,R0,L1,R1,...). Size: MAX_BLOCK_SIZE * 2 */
float* lead_fm_get_output_ptr(void);

/** Stereo interleaved lead 2 output. Size: MAX_BLOCK_SIZE * 2 */
float* lead_fm_get_output2_ptr(void);

// ═══════════════ Processing ═══════════════

void lead_fm_process_block(int block_size);

// ═══════════════ Note Control ═══════════════

/** Trigger a note. Params should already be set via setters. */
void lead_fm_note_on(float frequency, float velocity, float hold_seconds);

/** Trigger a note with lead index (0=lead1, 1=lead2) for separate output routing. */
void lead_fm_note_on_ex(float frequency, float velocity, float hold_seconds, int lead_index);

/** Release all active notes */
void lead_fm_all_notes_off(void);

// ═══════════════ Morphed Preset Parameters ═══════════════
// These mirror Lead4opFMMorphedParams — set before note_on()

// Algorithm
void lead_fm_set_algorithm(int algo);

// Carrier
void lead_fm_set_beat_detune(float cents);
void lead_fm_set_carrier2_mix(float mix);

// Per-operator (op_idx: 0-3)
void lead_fm_set_op_ratio(int op_idx, float ratio);
void lead_fm_set_op_index(int op_idx, float index);
void lead_fm_set_op_decay(int op_idx, float decay_sec);
void lead_fm_set_op_sustain(int op_idx, float sustain);
void lead_fm_set_op_level(int op_idx, float level);
void lead_fm_set_op_feedback(int op_idx, float feedback);
void lead_fm_set_op_detune(int op_idx, float cents);
void lead_fm_set_op_env_rate(int op_idx, float rate);
void lead_fm_set_op_mod_attack(int op_idx, float attack_sec);
void lead_fm_set_op_mod_delay(int op_idx, float delay_sec);

// Amplitude envelope (ADSR)
void lead_fm_set_attack(float seconds);
void lead_fm_set_decay(float seconds);
void lead_fm_set_sustain(float level);
void lead_fm_set_release(float seconds);

// Filter
void lead_fm_set_filter_freq(float hz);
void lead_fm_set_filter_q(float q);
void lead_fm_set_filter_type(int type);
void lead_fm_set_filter_env_attack(float seconds);
void lead_fm_set_filter_env_decay(float seconds);
void lead_fm_set_filter_env_sustain(float level);
void lead_fm_set_filter_env_release(float seconds);
void lead_fm_set_filter_env_depth(float hz);

// Drive
void lead_fm_set_drive(float amount);

// Transient
void lead_fm_set_transient_click(float click);
void lead_fm_set_transient_noise(float noise);
void lead_fm_set_transient_duration_ms(float ms);
void lead_fm_set_transient_decay(float decay);
void lead_fm_set_transient_filter(float freq);
void lead_fm_set_transient_type(int type);

// Gain
void lead_fm_set_gain(float gain);

// XY stereo
void lead_fm_set_x_level(float level);
void lead_fm_set_x_pan(float pan);
void lead_fm_set_y_level(float level);
void lead_fm_set_y_pan(float pan);

// LFO
void lead_fm_set_lfo_rate(float hz);
void lead_fm_set_lfo_depth(float depth);
void lead_fm_set_lfo_target(int target);

// Unison
void lead_fm_set_unison_voices(int count);
void lead_fm_set_unison_detune(float cents);

// ═══════════════ Delay Effect ═══════════════

void lead_fm_set_delay_enabled(int enabled);
void lead_fm_set_delay_time_l(float samples);
void lead_fm_set_delay_time_r(float samples);
void lead_fm_set_delay_feedback(float feedback);
void lead_fm_set_delay_filter(float cutoff_hz);
void lead_fm_set_delay_mix(float mix);
void lead_fm_set_delay_send(float level);

// ═══════════════ Status ═══════════════

int lead_fm_get_active_count(void);

// ═══════════════ Instance API ═══════════════
//
// Legacy functions above keep the existing singleton ABI for the web worklet.
// KesshoCore uses this instance API so concurrent native/WASM modules do not
// share note, delay, RNG, or output-buffer state.

KesshoLeadFmInstance* lead_fm_instance_create(float sample_rate);
void lead_fm_instance_destroy(KesshoLeadFmInstance* instance);
int lead_fm_instance_reset(KesshoLeadFmInstance* instance, float sample_rate);

float* lead_fm_instance_get_output_ptr(KesshoLeadFmInstance* instance);
float* lead_fm_instance_get_output2_ptr(KesshoLeadFmInstance* instance);
void lead_fm_instance_process_block(KesshoLeadFmInstance* instance, int block_size);

void lead_fm_instance_note_on(KesshoLeadFmInstance* instance, float frequency, float velocity, float hold_seconds);
void lead_fm_instance_note_on_ex(
    KesshoLeadFmInstance* instance,
    float frequency,
    float velocity,
    float hold_seconds,
    int lead_index);
void lead_fm_instance_all_notes_off(KesshoLeadFmInstance* instance);

void lead_fm_instance_set_algorithm(KesshoLeadFmInstance* instance, int algo);
void lead_fm_instance_set_beat_detune(KesshoLeadFmInstance* instance, float cents);
void lead_fm_instance_set_carrier2_mix(KesshoLeadFmInstance* instance, float mix);

void lead_fm_instance_set_op_ratio(KesshoLeadFmInstance* instance, int op_idx, float ratio);
void lead_fm_instance_set_op_index(KesshoLeadFmInstance* instance, int op_idx, float index);
void lead_fm_instance_set_op_decay(KesshoLeadFmInstance* instance, int op_idx, float decay_sec);
void lead_fm_instance_set_op_sustain(KesshoLeadFmInstance* instance, int op_idx, float sustain);
void lead_fm_instance_set_op_level(KesshoLeadFmInstance* instance, int op_idx, float level);
void lead_fm_instance_set_op_feedback(KesshoLeadFmInstance* instance, int op_idx, float feedback);
void lead_fm_instance_set_op_detune(KesshoLeadFmInstance* instance, int op_idx, float cents);
void lead_fm_instance_set_op_env_rate(KesshoLeadFmInstance* instance, int op_idx, float rate);
void lead_fm_instance_set_op_mod_attack(KesshoLeadFmInstance* instance, int op_idx, float attack_sec);
void lead_fm_instance_set_op_mod_delay(KesshoLeadFmInstance* instance, int op_idx, float delay_sec);

void lead_fm_instance_set_attack(KesshoLeadFmInstance* instance, float seconds);
void lead_fm_instance_set_decay(KesshoLeadFmInstance* instance, float seconds);
void lead_fm_instance_set_sustain(KesshoLeadFmInstance* instance, float level);
void lead_fm_instance_set_release(KesshoLeadFmInstance* instance, float seconds);

void lead_fm_instance_set_filter_freq(KesshoLeadFmInstance* instance, float hz);
void lead_fm_instance_set_filter_q(KesshoLeadFmInstance* instance, float q);
void lead_fm_instance_set_filter_type(KesshoLeadFmInstance* instance, int type);
void lead_fm_instance_set_filter_env_attack(KesshoLeadFmInstance* instance, float seconds);
void lead_fm_instance_set_filter_env_decay(KesshoLeadFmInstance* instance, float seconds);
void lead_fm_instance_set_filter_env_sustain(KesshoLeadFmInstance* instance, float level);
void lead_fm_instance_set_filter_env_release(KesshoLeadFmInstance* instance, float seconds);
void lead_fm_instance_set_filter_env_depth(KesshoLeadFmInstance* instance, float hz);

void lead_fm_instance_set_drive(KesshoLeadFmInstance* instance, float amount);

void lead_fm_instance_set_transient_click(KesshoLeadFmInstance* instance, float click);
void lead_fm_instance_set_transient_noise(KesshoLeadFmInstance* instance, float noise);
void lead_fm_instance_set_transient_duration_ms(KesshoLeadFmInstance* instance, float ms);
void lead_fm_instance_set_transient_decay(KesshoLeadFmInstance* instance, float decay);
void lead_fm_instance_set_transient_filter(KesshoLeadFmInstance* instance, float freq);
void lead_fm_instance_set_transient_type(KesshoLeadFmInstance* instance, int type);

void lead_fm_instance_set_gain(KesshoLeadFmInstance* instance, float gain);
void lead_fm_instance_set_x_level(KesshoLeadFmInstance* instance, float level);
void lead_fm_instance_set_x_pan(KesshoLeadFmInstance* instance, float pan);
void lead_fm_instance_set_y_level(KesshoLeadFmInstance* instance, float level);
void lead_fm_instance_set_y_pan(KesshoLeadFmInstance* instance, float pan);

void lead_fm_instance_set_lfo_rate(KesshoLeadFmInstance* instance, float hz);
void lead_fm_instance_set_lfo_depth(KesshoLeadFmInstance* instance, float depth);
void lead_fm_instance_set_lfo_target(KesshoLeadFmInstance* instance, int target);

void lead_fm_instance_set_unison_voices(KesshoLeadFmInstance* instance, int count);
void lead_fm_instance_set_unison_detune(KesshoLeadFmInstance* instance, float cents);

void lead_fm_instance_set_delay_enabled(KesshoLeadFmInstance* instance, int enabled);
void lead_fm_instance_set_delay_time_l(KesshoLeadFmInstance* instance, float samples);
void lead_fm_instance_set_delay_time_r(KesshoLeadFmInstance* instance, float samples);
void lead_fm_instance_set_delay_feedback(KesshoLeadFmInstance* instance, float feedback);
void lead_fm_instance_set_delay_filter(KesshoLeadFmInstance* instance, float cutoff_hz);
void lead_fm_instance_set_delay_mix(KesshoLeadFmInstance* instance, float mix);
void lead_fm_instance_set_delay_send(KesshoLeadFmInstance* instance, float level);

int lead_fm_instance_get_active_count(KesshoLeadFmInstance* instance);

#ifdef __cplusplus
}
#endif

#endif // KESSHO_LEAD_FM_H
