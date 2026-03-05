/**
 * Kessho Soundscapes — C++ / WASM Audio Engine
 *
 * High-performance port of water.worklet.js + insects.worklet.js
 *
 * Key optimizations over JS:
 *   - Fast polynomial sin/cos/tanh approximations (no Math.sin per sample)
 *   - Biquad coefficient updates amortized (every 32 samples)
 *   - Flat struct arrays (no per-sample heap allocation)
 *   - Batch PRNG (pre-fill block-sized noise buffer)
 *   - Pre-computed pan values (cached on trigger, not per-sample)
 *   - SIMD-friendly filter layout
 */

#ifndef KESSHO_SOUNDSCAPES_H
#define KESSHO_SOUNDSCAPES_H

#ifdef __cplusplus
extern "C" {
#endif

/* ─── Water engine ─── */

int   water_init(float sample_rate);
void  water_destroy(void);
float* water_get_output_ptr(void);        /* interleaved stereo: L0 R0 L1 R1 … */
void  water_process_block(int block_size);

void  water_set_preset(int preset);       /* 0=tapDrips 1=stream 2=waterfall 3=rainWindow */
void  water_set_params(float intensity, float rate, float distance,
                       float base_freq, float drop_size, float hardness,
                       float glass_thickness);
void  water_set_layer_mix(float hard_drops, float water_drops, float turbulence,
                          float bubbling, float roar, float rivulets);
void  water_set_layer_density(float hard_drops, float water_drops, float turbulence,
                              float bubbling, float roar, float rivulets);
void  water_start(void);
void  water_stop(void);
void  water_set_seed(int seed);
int   water_get_active_voices(void);
int   water_get_events_per_sec(void);

/* ─── Insects engine ─── */

int   insects_init(float sample_rate);
void  insects_destroy(void);
float* insects_get_output_ptr(void);
void  insects_process_block(int block_size);

void  insects_set_engine(int engine);     /* 0=cricket 1=treeCricket 2=katydid 3=cicada 4=grasshopper 5=moleCricket 6=flyBee */
void  insects_set_params(float density, float temperature, float distance,
                         float proximity, float antiphony, float click_rate,
                         float motion);
void  insects_start(void);
void  insects_stop(void);
void  insects_set_seed(int seed);
int   insects_get_active_voices(void);
int   insects_get_engine_type(void);

/* ─── Insects engine 2 (dual layering) ─── */

int   insects2_init(float sample_rate);
void  insects2_destroy(void);
float* insects2_get_output_ptr(void);
void  insects2_process_block(int block_size);

void  insects2_set_engine(int engine);
void  insects2_set_params(float density, float temperature, float distance,
                          float proximity, float antiphony, float click_rate,
                          float motion);
void  insects2_start(void);
void  insects2_stop(void);
void  insects2_set_seed(int seed);
int   insects2_get_active_voices(void);
int   insects2_get_engine_type(void);

/* ─── Ocean engine ─── */

int   ocean_init(float sample_rate);
void  ocean_destroy(void);
float* ocean_get_output_ptr(void);
void  ocean_process_block(int block_size);

void  ocean_set_params(float intensity,
                       float wave_duration_min, float wave_duration_max,
                       float wave_interval_min, float wave_interval_max,
                       float wave2_offset_min, float wave2_offset_max,
                       float foam_min, float foam_max,
                       float depth_min, float depth_max);
void  ocean_start(void);
void  ocean_stop(void);
void  ocean_set_seed(int seed);

#ifdef __cplusplus
}
#endif

#endif /* KESSHO_SOUNDSCAPES_H */
