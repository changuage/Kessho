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

typedef struct KesshoWaterInstance KesshoWaterInstance;
typedef struct KesshoInsectsInstance KesshoInsectsInstance;
typedef struct KesshoInsects2Instance KesshoInsects2Instance;

/* ─── Water engine ─── */

int   water_init(float sample_rate);
void  water_destroy(void);
float* water_get_output_ptr(void);        /* interleaved stereo: L0 R0 L1 R1 … */
void  water_process_block(int block_size);

void  water_set_preset(int preset);       /* 0=tapDrips 1=stream 2=waterfall 3=rainWindow */
void  water_set_params(float intensity_min, float intensity_max,
                       float distance_min, float distance_max,
                       float hard_drop_base_freq_min, float hard_drop_base_freq_max,
                       float water_drop_base_freq_min, float water_drop_base_freq_max,
                       float drop_size_min, float drop_size_max,
                       float hardness_min, float hardness_max,
                       float glass_thickness_min, float glass_thickness_max);
void  water_set_layer_detail_params(float hard_rate, float hard_tone_hz, float hard_character,
                                    float water_rate, float water_tone_hz,
                                    float bubble_rate, float bubble_tone_hz);
void  water_set_layer_mix(float hard_drops, float water_drops, float turbulence,
                          float bubbling, float surf, float channels);
void  water_set_layer_density(float hard_drops, float water_drops, float turbulence,
                              float bubbling, float surf, float channels);
void  water_set_density_loop_params(float hard_send, float water_send,
                                    float bubble_send, float feedback, float tone_hz,
                                    float ring, float wet);
void  water_start(void);
void  water_stop(void);
void  water_set_seed(int seed);
void  water_set_surf_params(float duration_min, float duration_max,
                           float interval_min, float interval_max,
                           float foam_min, float foam_max,
                           float proximity_min, float proximity_max,
                           float depth_min, float depth_max,
                           float body_freq_min, float body_freq_max,
                           float spray_freq_min, float spray_freq_max,
                           float foam_bright_min, float foam_bright_max);
void  water_set_channels_params(float morph, float speed);
int   water_get_active_voices(void);
int   water_get_events_per_sec(void);
int   water_get_surf_trigger_serial(void);
float water_get_surf_trigger_duration_pos(void);
float water_get_surf_trigger_interval_pos(void);
float water_get_surf_trigger_foam_pos(void);
float water_get_surf_trigger_proximity_pos(void);
float water_get_surf_trigger_depth_pos(void);
float water_get_surf_trigger_body_pos(void);
float water_get_surf_trigger_spray_pos(void);
float water_get_surf_trigger_foam_bright_pos(void);

/* Instance API for KesshoCore module ownership. */
KesshoWaterInstance* water_instance_create(float sample_rate);
void  water_instance_destroy(KesshoWaterInstance* instance);
int   water_instance_reset(KesshoWaterInstance* instance, float sample_rate);
float* water_instance_get_output_ptr(KesshoWaterInstance* instance);
void  water_instance_process_block(KesshoWaterInstance* instance, int block_size);
void  water_instance_set_preset(KesshoWaterInstance* instance, int preset);
void  water_instance_set_params(KesshoWaterInstance* instance,
                                float intensity_min, float intensity_max,
                                float distance_min, float distance_max,
                                float hard_drop_base_freq_min, float hard_drop_base_freq_max,
                                float water_drop_base_freq_min, float water_drop_base_freq_max,
                                float drop_size_min, float drop_size_max,
                                float hardness_min, float hardness_max,
                                float glass_thickness_min, float glass_thickness_max);
void  water_instance_set_layer_detail_params(KesshoWaterInstance* instance,
                                             float hard_rate, float hard_tone_hz, float hard_character,
                                             float water_rate, float water_tone_hz,
                                             float bubble_rate, float bubble_tone_hz);
void  water_instance_set_layer_mix(KesshoWaterInstance* instance,
                                   float hard_drops, float water_drops, float turbulence,
                                   float bubbling, float surf, float channels);
void  water_instance_set_layer_density(KesshoWaterInstance* instance,
                                       float hard_drops, float water_drops, float turbulence,
                                       float bubbling, float surf, float channels);
void  water_instance_set_density_loop_params(KesshoWaterInstance* instance,
                                             float hard_send, float water_send,
                                             float bubble_send, float feedback, float tone_hz,
                                             float ring, float wet);
void  water_instance_start(KesshoWaterInstance* instance);
void  water_instance_stop(KesshoWaterInstance* instance);
void  water_instance_set_seed(KesshoWaterInstance* instance, int seed);
void  water_instance_set_surf_params(KesshoWaterInstance* instance,
                                     float duration_min, float duration_max,
                                     float interval_min, float interval_max,
                                     float foam_min, float foam_max,
                                     float proximity_min, float proximity_max,
                                     float depth_min, float depth_max,
                                     float body_freq_min, float body_freq_max,
                                     float spray_freq_min, float spray_freq_max,
                                     float foam_bright_min, float foam_bright_max);
void  water_instance_set_channels_params(KesshoWaterInstance* instance, float morph, float speed);
int   water_instance_get_active_voices(KesshoWaterInstance* instance);
int   water_instance_get_events_per_sec(KesshoWaterInstance* instance);

/* ─── Insects engine ─── */

int   insects_init(float sample_rate);
void  insects_destroy(void);
float* insects_get_output_ptr(void);
void  insects_process_block(int block_size);

void  insects_set_engine(int engine);     /* 0=cricket 1=treeCricket 2=katydid 3=cicada 4=grasshopper 5=moleCricket 6=flyBee */
void  insects_set_params(float density_min, float density_max,
                         float temperature_min, float temperature_max,
                         float distance_min, float distance_max,
                         float proximity_min, float proximity_max,
                         float antiphony_min, float antiphony_max,
                         float click_rate_min, float click_rate_max,
                         float motion_min, float motion_max);
void  insects_start(void);
void  insects_stop(void);
void  insects_set_seed(int seed);
int   insects_get_active_voices(void);
int   insects_get_engine_type(void);

KesshoInsectsInstance* insects_instance_create(float sample_rate);
void  insects_instance_destroy(KesshoInsectsInstance* instance);
int   insects_instance_reset(KesshoInsectsInstance* instance, float sample_rate);
float* insects_instance_get_output_ptr(KesshoInsectsInstance* instance);
void  insects_instance_process_block(KesshoInsectsInstance* instance, int block_size);
void  insects_instance_set_engine(KesshoInsectsInstance* instance, int engine);
void  insects_instance_set_params(KesshoInsectsInstance* instance,
                                  float density_min, float density_max,
                                  float temperature_min, float temperature_max,
                                  float distance_min, float distance_max,
                                  float proximity_min, float proximity_max,
                                  float antiphony_min, float antiphony_max,
                                  float click_rate_min, float click_rate_max,
                                  float motion_min, float motion_max);
void  insects_instance_start(KesshoInsectsInstance* instance);
void  insects_instance_stop(KesshoInsectsInstance* instance);
void  insects_instance_set_seed(KesshoInsectsInstance* instance, int seed);
int   insects_instance_get_active_voices(KesshoInsectsInstance* instance);
int   insects_instance_get_engine_type(KesshoInsectsInstance* instance);

/* ─── Insects engine 2 (dual layering) ─── */

int   insects2_init(float sample_rate);
void  insects2_destroy(void);
float* insects2_get_output_ptr(void);
void  insects2_process_block(int block_size);

void  insects2_set_engine(int engine);
void  insects2_set_params(float density_min, float density_max,
                          float temperature_min, float temperature_max,
                          float distance_min, float distance_max,
                          float proximity_min, float proximity_max,
                          float antiphony_min, float antiphony_max,
                          float click_rate_min, float click_rate_max,
                          float motion_min, float motion_max);
void  insects2_start(void);
void  insects2_stop(void);
void  insects2_set_seed(int seed);
int   insects2_get_active_voices(void);
int   insects2_get_engine_type(void);

KesshoInsects2Instance* insects2_instance_create(float sample_rate);
void  insects2_instance_destroy(KesshoInsects2Instance* instance);
int   insects2_instance_reset(KesshoInsects2Instance* instance, float sample_rate);
float* insects2_instance_get_output_ptr(KesshoInsects2Instance* instance);
void  insects2_instance_process_block(KesshoInsects2Instance* instance, int block_size);
void  insects2_instance_set_engine(KesshoInsects2Instance* instance, int engine);
void  insects2_instance_set_params(KesshoInsects2Instance* instance,
                                   float density_min, float density_max,
                                   float temperature_min, float temperature_max,
                                   float distance_min, float distance_max,
                                   float proximity_min, float proximity_max,
                                   float antiphony_min, float antiphony_max,
                                   float click_rate_min, float click_rate_max,
                                   float motion_min, float motion_max);
void  insects2_instance_start(KesshoInsects2Instance* instance);
void  insects2_instance_stop(KesshoInsects2Instance* instance);
void  insects2_instance_set_seed(KesshoInsects2Instance* instance, int seed);
int   insects2_instance_get_active_voices(KesshoInsects2Instance* instance);
int   insects2_instance_get_engine_type(KesshoInsects2Instance* instance);

#ifdef __cplusplus
}
#endif

#endif /* KESSHO_SOUNDSCAPES_H */
