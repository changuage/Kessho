/**
 * Kessho Reverb — C API Header
 *
 * Full C++ port of reverb.worklet.ts for compilation to:
 *   - WebAssembly (via Emscripten) for web AudioWorklet
 *   - Native ARM/x86 for iOS/macOS (via CMake)
 *
 * 8-channel FDN reverb with:
 *   - Hadamard mixing matrix (8×8 and 4×4 lite mode)
 *   - 3 cascaded allpass diffuser pairs (pre/mid/post)
 *   - Predelay, damping, HPF
 *   - Shimmer pitch-shifter in feedback loop
 *   - Slow character modulation (Nightsky/Blackhole-style breathing)
 *   - Reverse tail with windowed crossfade
 *   - Quality modes: Ultra (8ch + mid-diffusion), Balanced (8ch), Lite (4ch)
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

float* reverb_get_input_ptr(void);   /* stereo interleaved: L0,R0,L1,R1,... */
float* reverb_get_output_ptr(void);  /* stereo interleaved: L0,R0,L1,R1,... */

/* ────── Processing ────── */

void  reverb_process_block(int block_size);

/* ────── Parameters ────── */

/** Set reverb type preset. 0=plate, 1=hall, 2=cathedral, 3=darkHall */
void  reverb_set_type(int type);

/** Set quality mode. 0=ultra, 1=balanced, 2=lite */
void  reverb_set_quality(int quality);

/** Set core parameters */
void  reverb_set_params(
    float decay,       /* 0-1 */
    float size,        /* 0.5-3.0 */
    float damping,     /* 0-1 */
    float diffusion,   /* 0-1 */
    float modulation,  /* 0-1 */
    float predelay,    /* ms */
    float width        /* 0-1 */
);

/** Set freeze/infinite mode. 1=enabled, 0=disabled */
void  reverb_set_freeze(int freeze);

/** Set shimmer parameters */
void  reverb_set_shimmer(float amount, float pitch_semitones);

/** Set slow modulation parameters */
void  reverb_set_slow_mod(float rate_hz, float depth);

/** Set reverse tail parameters */
void  reverb_set_reverse(float amount, float length_seconds);

#ifdef __cplusplus
}
#endif

#endif /* KESSHO_REVERB_H */
