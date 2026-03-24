/**
 * Kessho Granular-FX Granular Engine — C API Header
 *
 * Full C++ port of granular-fx.worklet.ts for compilation to:
 *   - WebAssembly (via Emscripten) for web AudioWorklet
 *   - Native ARM/x86 for iOS/macOS (via CMake)
 *
 * All DSP runs in C++. JS retains only a thin AudioWorklet wrapper
 * that copies buffers and translates postMessage → C API calls.
 */

#ifndef KESSHO_GRANULAR_H
#define KESSHO_GRANULAR_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// ═══════════════ Constants ═══════════════

#define KESSHO_NUM_VOICES       4
#define KESSHO_NUM_SLICES       16
#define KESSHO_MAX_GRAINS       64   // per-voice pool size
#define KESSHO_MAX_TOTAL_GRAINS 64   // global cap across all voices
#define KESSHO_MAX_BLOCK_SIZE   128
#define KESSHO_HANN_TABLE_SIZE  1024
#define KESSHO_PAN_TABLE_SIZE   256
#define KESSHO_XFADE_TABLE_SIZE 1024
#define KESSHO_ALLPASS_STAGES   4
#define KESSHO_MAX_SCALE_INTERVALS 12
#define KESSHO_MAX_CHORD_PITCHES    7
#define KESSHO_SINC_TAPS          8     // 8-point windowed sinc interpolation
#define KESSHO_SINC_OVERSAMPLING  256   // fractional offset resolution
#define KESSHO_SINC_TABLE_SIZE    (KESSHO_SINC_TAPS * KESSHO_SINC_OVERSAMPLING)
#define KESSHO_UNFREEZE_XFADE_SAMPLES 480  // ~10ms crossfade at 48kHz

// Voice modes
#define KESSHO_MODE_CLEAN    0
#define KESSHO_MODE_GRANULAR 1
#define KESSHO_MODE_LEGACY   2

// Pitch modes (legacy)
#define KESSHO_PITCH_RANDOM   0
#define KESSHO_PITCH_HARMONIC 1

// ═══════════════ Lifecycle ═══════════════

/**
 * Initialize the granular engine. Must be called once before any other function.
 * Allocates circular buffer, pre-computes LUTs, initializes all voice state.
 *
 * @param sample_rate   Audio sample rate (e.g. 44100, 48000)
 * @param buffer_seconds Circular buffer length in seconds (e.g. 16)
 * @return 0 on success, non-zero on failure
 */
int granular_init(float sample_rate, float buffer_seconds);

/**
 * Destroy the granular engine and free all memory.
 */
void granular_destroy(void);

// ═══════════════ Buffer Access (zero-copy) ═══════════════

/**
 * Get pointer to input buffer (stereo interleaved: L0,R0,L1,R1,...).
 * JS writes input samples here before calling granular_process_block().
 * Size: MAX_BLOCK_SIZE * 2 floats.
 */
float* granular_get_input_ptr(void);

/**
 * Get pointer to output buffer (stereo interleaved: L0,R0,L1,R1,...).
 * JS reads output samples from here after granular_process_block() returns.
 * Size: MAX_BLOCK_SIZE * 2 floats.
 */
float* granular_get_output_ptr(void);

// ═══════════════ Processing ═══════════════

/**
 * Process one audio block. Input must already be written to the input buffer.
 * Output is written to the output buffer.
 *
 * @param block_size  Number of samples per channel (typically 128)
 */
void granular_process_block(int block_size);

// ═══════════════ Global Parameters ═══════════════

/**
 * Enable or disable the granular engine. When disabled, input passes through unchanged.
 */
void granular_set_enabled(int enabled);

/**
 * Set freeze state. When frozen, write head stops (buffer content is static).
 * @param frozen           1 = frozen, 0 = recording
 * @param with_feedback    1 = allow feedback writes even while frozen
 */
void granular_set_freeze(int frozen, int with_feedback);

/**
 * Set dry/wet output level (0.0–1.0).
 */
void granular_set_dry_wet(float level);

/**
 * Set feedback amount and lowpass cutoff.
 * @param amount  Feedback gain (0.0–0.85 for standard, 0.0–0.35 for legacy)
 * @param lpf_hz  Feedback lowpass filter cutoff in Hz (e.g. 8000)
 */
void granular_set_feedback(float amount, float lpf_hz);

/**
 * Set scale intervals for pitch quantization (up to 12 intervals).
 * Pass count=0 to disable quantization.
 * @param intervals  Array of semitone offsets within one octave (e.g. [0,2,4,5,7,9,11])
 * @param count      Number of intervals (0–12)
 */
void granular_set_scale(const int* intervals, int count);

/**
 * Set chord pitches and chord-bias blend for pitch quantization.
 * When chord_bias > 0, quantize_pitch blends toward chord tones.
 * @param pitches   Array of MIDI note offsets (semitones from root, up to 7)
 * @param count     Number of chord pitches (0–7)
 * @param bias      Blend amount 0.0–1.0 (0 = pure scale, 1 = chord tones only)
 */
void granular_set_chord_bias(const int* pitches, int count, float bias);

/**
 * Resize the circular buffer. Preserves existing content where possible.
 * @param buffer_seconds  New buffer length in seconds
 */
void granular_set_buffer_size(float buffer_seconds);

// ═══════════════ Per-Voice Parameters ═══════════════

/**
 * Set voice mode and enable state.
 * @param voice   Voice index (0–3)
 * @param enabled 1 = active, 0 = muted
 * @param mode    KESSHO_MODE_CLEAN, KESSHO_MODE_GRANULAR, or KESSHO_MODE_LEGACY
 */
void granular_set_voice_mode(int voice, int enabled, int mode);

/**
 * Set voice slice and position parameters.
 * @param voice        Voice index (0–3)
 * @param slice        Slice index (0–15)
 * @param speed        Playback speed (0 = LFO scan mode, 1 = normal)
 * @param reverse      1 = reverse playback
 * @param pitch        Pitch offset in semitones (-24 to +24)
 * @param write_follow Blend between slice position and write head (0–1)
 */
void granular_set_voice_position(int voice, int slice, float speed, int reverse,
                                float pitch, float write_follow);

/**
 * Set voice grain parameters.
 * @param voice       Voice index (0–3)
 * @param density     Grains per second (1–64)
 * @param grain_size  Grain size in ms (10–500)
 * @param spray       Position randomization (0–1)
 * @param grain_oct   Probability of +12st shimmer (0–1)
 * @param attack      Attack time in seconds (0.001–0.5)
 * @param decay       Decay time in seconds (0.01–4.0)
 */
void granular_set_voice_grain(int voice, float density, float grain_size,
                             float spray, float grain_oct,
                             float attack, float decay);

/**
 * Set voice output parameters.
 * @param voice         Voice index (0–3)
 * @param gain          Output level (0–1)
 * @param pan           Stereo pan (-1 to +1)
 * @param blur          Allpass diffusion amount (0–1)
 * @param stereo_spread Pan randomization for grains (0–1)
 */
void granular_set_voice_output(int voice, float gain, float pan,
                              float blur, float stereo_spread);

/**
 * Set voice LFO rates.
 * @param voice          Voice index (0–3)
 * @param pos_rate       Position LFO rate (0–1, 0=off)
 * @param pos_depth      Position LFO depth (0–1)
 * @param pan_rate       Pan LFO rate (0–1, 0=off)
 * @param reverse_rate   Reverse LFO rate (0–1, 0=off)
 * @param record_rate    Record/write-follow LFO rate (0–1, 0=off)
 */
void granular_set_voice_lfo(int voice, float pos_rate, float pos_depth,
                           float pan_rate, float reverse_rate, float record_rate);

/**
 * Set Euclidean gating state for a voice.
 * @param voice  Voice index (0–3)
 * @param gated  1 = voice output gated by trigger envelope
 */
void granular_set_voice_euclid_gated(int voice, int gated);

/**
 * Set Euclidean mute state for a voice (silenced by Euclid mute/solo).
 * Voice is still counted for gain compensation to avoid volume jumps.
 * @param voice  Voice index (0–3)
 * @param muted  1 = voice silenced
 */
void granular_set_voice_euclid_muted(int voice, int muted);

// ═══════════════ Legacy Mode Parameters ═══════════════

/**
 * Set legacy granulator parameters (used when any voice is in KESSHO_MODE_LEGACY).
 * @param jitter         Timing jitter in ms
 * @param probability    Grain trigger probability (0–1)
 * @param pitch_mode     KESSHO_PITCH_RANDOM or KESSHO_PITCH_HARMONIC
 * @param pitch_spread   Pitch spread in semitones
 * @param max_grains     (unused, kept for ABI compat) (0–128)
 * @param feedback       Legacy feedback amount (0–0.35)
 */
void granular_set_legacy_params(float jitter, float probability, int pitch_mode,
                               float pitch_spread, int max_grains, float feedback);

// ═══════════════ Triggers & Events ═══════════════

/**
 * Euclidean trigger: restarts AD envelope for a voice, optionally overrides
 * slice, pitch, and reverse.
 *
 * @param voice            Voice index (0–3)
 * @param velocity         Trigger velocity (0–1)
 * @param slice_override   Slice index override (-1 = use voice param)
 * @param pitch_override   Pitch offset in semitones (added to voice pitch)
 * @param has_pitch        1 = pitch_override is active
 * @param reverse_override 1 = reverse, 0 = normal
 * @param has_reverse      1 = reverse_override is active
 */
void granular_euclid_trigger(int voice, float velocity, int slice_override,
                            float pitch_override, int has_pitch,
                            int reverse_override, int has_reverse);

/**
 * Supply random sequence for deterministic grain spawning.
 * @param data   Array of float values in [0, 1)
 * @param count  Number of values
 */
void granular_set_random_sequence(const float* data, int count);

// ═══════════════ State Queries ═══════════════

/**
 * Get normalized write head position (0–1).
 */
float granular_get_write_head(void);

/**
 * Get normalized read positions for all 4 voices.
 * @param out  Array of 4 floats to fill with positions (0–1)
 */
void granular_get_voice_positions(float* out);

/**
 * Get total number of active grains across all voices.
 */
int granular_get_active_grain_count(void);

#ifdef __cplusplus
}
#endif

#endif // KESSHO_GRANULAR_H
