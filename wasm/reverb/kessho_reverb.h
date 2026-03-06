/**
 * Kessho Reverb v2 — C API Header
 *
 * Ambient wash reverb inspired by Empress Reverb / Valhalla Supermassive.
 *
 * Architecture:
 *   - 16-channel FDN (Ultra) / 8-channel (Balanced) / 4-channel (Lite)
 *   - Golden-ratio-spaced prime delay line lengths
 *   - Per-delay-line chorus modulation with random phase offsets
 *   - Drift (filtered noise) modulation option
 *   - Multi-band damping (2-band: low + high decay rates)
 *   - Input tone shaping (pre-filter before FDN)
 *   - True stereo decorrelation (different tap combinations per ear)
 *   - Shimmer with feedback into FDN (compound pitch shifting)
 *   - Hadamard mixing matrices (16×16, 8×8, 4×4)
 *   - 3 cascaded allpass diffuser pairs (pre/mid/post)
 *   - Reverse tail with windowed crossfade
 *   - Quality modes: Ultra (16ch + mid-diffusion), Balanced (8ch), Lite (4ch)
 */

#ifndef KESSHO_REVERB_H
#define KESSHO_REVERB_H

#ifdef __cplusplus
extern "C" {
#endif

/* ────── Lifecycle ────── */

int   reverb_init(float sample_rate);
void  reverb_destroy(void);

/* ────── Buffer Access (zero-copy) ────── */

float* reverb_get_input_ptr(void);   /* stereo interleaved: L0,R0,L1,R1,… */
float* reverb_get_output_ptr(void);  /* stereo interleaved: L0,R0,L1,R1,… */

/* ────── Processing ────── */

void  reverb_process_block(int block_size);

/* ────── Parameters ────── */

/** Set reverb type preset.  0=plate 1=hall 2=cathedral 3=darkHall 4=dattorroPlate 5=dattorroShimmer */
void  reverb_set_type(int type);

/** Set quality mode.  0=ultra(16ch) 1=balanced(8ch) 2=lite(4ch) */
void  reverb_set_quality(int quality);

/** Set core parameters */
void  reverb_set_params(
    float decay,       /* 0-1 */
    float size,        /* 0.5-3.0 */
    float damping,     /* 0-1   (legacy — maps to dampHigh) */
    float diffusion,   /* 0-1 */
    float modulation,  /* 0-1 */
    float predelay,    /* ms */
    float width        /* 0-1 */
);

/** Freeze / infinite sustain.  1=on 0=off */
void  reverb_set_freeze(int freeze);

/** Shimmer amount + pitch shift */
void  reverb_set_shimmer(float amount, float pitch_semitones);

/** Slow character-modulation (breathing) */
void  reverb_set_slow_mod(float rate_hz, float depth);

/** Reverse tail */
void  reverb_set_reverse(float amount, float length_seconds);

/* ────── v2 Parameters ────── */

/** Per-delay-line chorus.  rate 0.1-2 Hz, depth 0-40 samples */
void  reverb_set_chorus(float rate_hz, float depth);

/** Modulation character.  0=sine 1=drift 2=hybrid */
void  reverb_set_mod_character(int mode);

/** Multi-band damping.  dampLow/High 0-1, crossover 200-4000 Hz */
void  reverb_set_multiband_damp(float damp_low, float damp_high,
                                 float crossover_hz);

/** Input tone shaping.  -1=dark 0=flat +1=bright */
void  reverb_set_input_tone(float tone);

/** Shimmer feedback into FDN (compound pitch shifting).  0-1 */
void  reverb_set_shimmer_feedback(float feedback);

/* ────── v3 Parameters ────── */

/** Warp: pitch-bend in feedback path.  0-1 */
void  reverb_set_warp(float amount);

/** Cross-feed: stereo cross-injection.  0-1 */
void  reverb_set_cross_feed(float amount);

#ifdef __cplusplus
}
#endif

#endif /* KESSHO_REVERB_H */
