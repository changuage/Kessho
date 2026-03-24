/**
 * Kessho Drum Synth — C API Header
 *
 * Full C++ port of drumSynth.ts for compilation to:
 *   - WebAssembly (via Emscripten) for web AudioWorklet
 *   - Native ARM/x86 for iOS/macOS (via CMake)
 *
 * 7 voice types: Sub, Kick, Click, BeepHi, BeepLo, Noise, Membrane
 * Each with variation/distance modelling, stereo ping-pong delay.
 * All DSP runs in C++. JS retains Euclidean scheduling + UI callbacks.
 */

#ifndef KESSHO_DRUM_H
#define KESSHO_DRUM_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// ═══════════════ Constants ═══════════════

#define DRUM_NUM_VOICE_TYPES   7
#define DRUM_MAX_POLYPHONY     4    // per voice type
#define DRUM_TOTAL_VOICES      (DRUM_NUM_VOICE_TYPES * DRUM_MAX_POLYPHONY)
#define DRUM_MAX_BLOCK_SIZE    128
#define DRUM_TRIGGER_QUEUE_SIZE 64
#define DRUM_DELAY_MAX_SECONDS 4.0f

// Voice type indices
#define DRUM_VOICE_SUB       0
#define DRUM_VOICE_KICK      1
#define DRUM_VOICE_CLICK     2
#define DRUM_VOICE_BEEP_HI   3
#define DRUM_VOICE_BEEP_LO   4
#define DRUM_VOICE_NOISE     5
#define DRUM_VOICE_MEMBRANE  6

// Click modes
#define DRUM_CLICK_IMPULSE    0
#define DRUM_CLICK_NOISE      1
#define DRUM_CLICK_TONAL      2
#define DRUM_CLICK_GRANULAR   3
#define DRUM_CLICK_CONTINUOUS 4

// ═══════════════ Lifecycle ═══════════════

/**
 * Initialize the drum engine. Must be called once before processing.
 * @param sample_rate  Audio sample rate (e.g. 44100, 48000)
 * @return 0 on success, non-zero on failure
 */
int drum_init(float sample_rate);

/**
 * Destroy the drum engine and free all memory.
 */
void drum_destroy(void);

// ═══════════════ Buffer Access (zero-copy) ═══════════════

/**
 * Get pointer to stereo output buffer (interleaved: L0,R0,L1,R1,...).
 * JS reads output samples from here after drum_process_block().
 * Size: MAX_BLOCK_SIZE * 2 floats.
 */
float* drum_get_output_ptr(void);

/**
 * Get pointer to reverb send output buffer (stereo interleaved).
 * Separate bus for the reverb send signal.
 */
float* drum_get_reverb_send_ptr(void);

// ═══════════════ Processing ═══════════════

/**
 * Process one audio block of drum synthesis.
 * Drains trigger queue, synthesizes all active voices, applies delay.
 * @param block_size  Number of stereo sample frames to generate
 */
void drum_process_block(int block_size);

// ═══════════════ Voice Triggers ═══════════════

/**
 * Queue a voice trigger for processing in the next block.
 * @param voice_type     0=sub, 1=kick, 2=click, 3=beepHi, 4=beepLo, 5=noise, 6=membrane
 * @param velocity       0..1
 * @param sample_offset  Sample offset within the current/next block for precise timing
 */
void drum_trigger(int voice_type, float velocity, int sample_offset);

// ═══════════════ Per-Voice Parameters ═══════════════

// --- Sub ---
void drum_set_sub_freq(float freq);
void drum_set_sub_decay(float decay_ms);
void drum_set_sub_level(float level);
void drum_set_sub_tone(float tone);
void drum_set_sub_shape(float shape);
void drum_set_sub_pitch_env(float semitones);
void drum_set_sub_pitch_decay(float decay_ms);
void drum_set_sub_drive(float drive);
void drum_set_sub_sub_octave(float amount);
void drum_set_sub_attack(float attack_ms);
void drum_set_sub_variation(float variation);
void drum_set_sub_distance(float distance);

// --- Kick ---
void drum_set_kick_freq(float freq);
void drum_set_kick_pitch_env(float semitones);
void drum_set_kick_pitch_decay(float decay_ms);
void drum_set_kick_decay(float decay_ms);
void drum_set_kick_level(float level);
void drum_set_kick_click(float click);
void drum_set_kick_body(float body);
void drum_set_kick_punch(float punch);
void drum_set_kick_tail(float tail);
void drum_set_kick_tone(float tone);
void drum_set_kick_attack(float attack_ms);
void drum_set_kick_variation(float variation);
void drum_set_kick_distance(float distance);

// --- Click ---
void drum_set_click_decay(float decay_ms);
void drum_set_click_filter(float freq);
void drum_set_click_tone(float tone);
void drum_set_click_level(float level);
void drum_set_click_resonance(float resonance);
void drum_set_click_pitch(float freq);
void drum_set_click_pitch_env(float semitones);
void drum_set_click_mode(int mode);
void drum_set_click_grain_count(int count);
void drum_set_click_grain_spread(float spread_ms);
void drum_set_click_stereo_width(float width);
void drum_set_click_exciter_color(float color);
void drum_set_click_attack(float attack_ms);
void drum_set_click_variation(float variation);
void drum_set_click_distance(float distance);

// --- BeepHi ---
void drum_set_beep_hi_freq(float freq);
void drum_set_beep_hi_attack(float attack_ms);
void drum_set_beep_hi_decay(float decay_ms);
void drum_set_beep_hi_level(float level);
void drum_set_beep_hi_tone(float tone);
void drum_set_beep_hi_inharmonic(float inharmonic);
void drum_set_beep_hi_partials(int partials);
void drum_set_beep_hi_shimmer(float shimmer);
void drum_set_beep_hi_shimmer_rate(float rate);
void drum_set_beep_hi_brightness(float brightness);
void drum_set_beep_hi_feedback(float feedback);
void drum_set_beep_hi_mod_env_decay(float decay);
void drum_set_beep_hi_noise_in_mod(float amount);
void drum_set_beep_hi_mod_ratio(float ratio);
void drum_set_beep_hi_mod_ratio_fine(float fine);
void drum_set_beep_hi_mod_env_end(float end);
void drum_set_beep_hi_noise_decay(float decay);
void drum_set_beep_hi_variation(float variation);
void drum_set_beep_hi_distance(float distance);

// --- BeepLo ---
void drum_set_beep_lo_freq(float freq);
void drum_set_beep_lo_attack(float attack_ms);
void drum_set_beep_lo_decay(float decay_ms);
void drum_set_beep_lo_level(float level);
void drum_set_beep_lo_tone(float tone);
void drum_set_beep_lo_pitch_env(float semitones);
void drum_set_beep_lo_pitch_decay(float decay_ms);
void drum_set_beep_lo_body(float body);
void drum_set_beep_lo_pluck(float pluck);
void drum_set_beep_lo_pluck_damp(float damp);
void drum_set_beep_lo_modal(float modal);
void drum_set_beep_lo_modal_q(float q);
void drum_set_beep_lo_modal_inharmonic(float inharmonic);
void drum_set_beep_lo_modal_spread(float spread);
void drum_set_beep_lo_modal_cut(float cut);
void drum_set_beep_lo_osc_gain(float gain);
void drum_set_beep_lo_modal_gain(float gain);
void drum_set_beep_lo_variation(float variation);
void drum_set_beep_lo_distance(float distance);

// --- Noise ---
void drum_set_noise_freq(float freq);
void drum_set_noise_decay(float decay_ms);
void drum_set_noise_level(float level);
void drum_set_noise_q(float q);
void drum_set_noise_filter_type(int type);
void drum_set_noise_attack(float attack_ms);
void drum_set_noise_formant(float formant);
void drum_set_noise_breath(float breath);
void drum_set_noise_filter_env_depth(float depth);
void drum_set_noise_filter_env_decay(float decay_ms);
void drum_set_noise_density(float density);
void drum_set_noise_color_lfo(float rate);
void drum_set_noise_variation(float variation);
void drum_set_noise_distance(float distance);

// --- Membrane ---
void drum_set_membrane_freq(float freq);
void drum_set_membrane_decay(float decay_ms);
void drum_set_membrane_level(float level);
void drum_set_membrane_tension(float tension);
void drum_set_membrane_material(float material);
void drum_set_membrane_size(float size);
void drum_set_membrane_damping(float damping);
void drum_set_membrane_strike(float strike);
void drum_set_membrane_wire_buzz(float buzz);
void drum_set_membrane_attack(float attack_ms);
void drum_set_membrane_variation(float variation);
void drum_set_membrane_distance(float distance);

// ═══════════════ Delay Effect ═══════════════

void drum_set_delay_enabled(int enabled);
void drum_set_delay_time_l(float samples);
void drum_set_delay_time_r(float samples);
void drum_set_delay_feedback(float feedback);
void drum_set_delay_filter(float cutoff_hz);
void drum_set_delay_mix(float mix);
void drum_set_delay_send(int voice_type, float level);

// ═══════════════ Per-Trigger Overrides ═══════════════

void drum_set_trigger_morph(float morph_position);
void drum_set_trigger_distance(float distance);
void drum_set_trigger_pitch(float semitones);
void drum_set_trigger_ratchet_cap(float decay_cap_sec, float attack_cap_sec);
void drum_clear_trigger_overrides(void);

// ═══════════════ Global ═══════════════

void drum_set_master_level(float level);
void drum_set_reverb_send(float level);
void drum_set_rng_seed(unsigned int seed);

/** Get number of currently active voices (for CPU overlay). */
int drum_get_active_count(void);

#ifdef __cplusplus
}
#endif

#endif // KESSHO_DRUM_H
