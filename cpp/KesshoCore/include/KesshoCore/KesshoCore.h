#pragma once

#include "KesshoTypes.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct KesshoEngine KesshoEngine;
typedef struct KesshoModule KesshoModule;
typedef struct KesshoMixer KesshoMixer;

int kessho_get_abi_version(void);
KesshoEngine* kessho_create(double sample_rate, int max_block_size);
void kessho_destroy(KesshoEngine* engine);
void kessho_reset(KesshoEngine* engine);
void kessho_start(KesshoEngine* engine);
void kessho_stop(KesshoEngine* engine);
int kessho_is_running(KesshoEngine* engine);
void kessho_render(KesshoEngine* engine, float* out_l, float* out_r, int frames);

int kessho_set_render_mode(KesshoEngine* engine, int render_mode);
void kessho_set_smoke_tone(KesshoEngine* engine, float frequency_hz, float amplitude);
int kessho_apply_snapshot_v1(KesshoEngine* engine, const KesshoCoreSnapshotV1* snapshot);
int kessho_set_transport_signature(
    KesshoEngine* engine,
    uint32_t beats_per_bar,
    uint32_t bars_per_phrase);
int kessho_push_param_event(KesshoEngine* engine, const KesshoParamEvent* event);
int kessho_push_midi_event(KesshoEngine* engine, const KesshoMidiEvent* event);
int kessho_push_transport_event(KesshoEngine* engine, const KesshoTransportEvent* event);
int kessho_get_event_queue_depth(KesshoEngine* engine);
uint32_t kessho_get_midi_events_processed(KesshoEngine* engine);
void kessho_set_seed(KesshoEngine* engine, uint32_t seed);
uint32_t kessho_get_seed(KesshoEngine* engine);
float kessho_next_random_float(KesshoEngine* engine);
uint64_t kessho_get_sample_frame(KesshoEngine* engine);
double kessho_get_sample_rate(KesshoEngine* engine);
int kessho_get_max_block_size(KesshoEngine* engine);
int kessho_get_stats(KesshoEngine* engine, KesshoCoreStats* stats);
int kessho_get_transport_info(KesshoEngine* engine, KesshoTransportInfo* info);

KesshoModule* kessho_module_create(int module_type, double sample_rate, int max_block_size);
void kessho_module_destroy(KesshoModule* module);
void kessho_module_reset(KesshoModule* module);
int kessho_module_self_check(int module_type, double sample_rate, int max_block_size);
int kessho_module_get_param_count(KesshoModule* module);
float* kessho_module_get_params_ptr(KesshoModule* module);
void kessho_module_commit_params(KesshoModule* module);
int kessho_module_note_on(
    KesshoModule* module,
    float frequency,
    float velocity,
    float hold_seconds,
    int lead_index);
int kessho_module_note_off(KesshoModule* module, int voice_index);
int kessho_module_kill_voice(KesshoModule* module, int voice_index);
void kessho_module_all_notes_off(KesshoModule* module);
int kessho_module_get_active_voice_count(KesshoModule* module);
int kessho_module_get_output_tap_count(KesshoModule* module);
int kessho_module_process_interleaved(
    KesshoModule* module,
    const float* input_interleaved,
    float* output_interleaved,
    int frames);
int kessho_module_process_planar_stereo(
    KesshoModule* module,
    const float* input_l,
    const float* input_r,
    float* output_l,
    float* output_r,
    int frames);
int kessho_module_process_planar_stereo_taps(
    KesshoModule* module,
    const float* input_l,
    const float* input_r,
    float* const* output_l,
    float* const* output_r,
    uint32_t output_bus_count,
    int frames);

KesshoMixer* kessho_mixer_create(void);
void kessho_mixer_destroy(KesshoMixer* mixer);
void kessho_mixer_clear_routes(KesshoMixer* mixer);
int kessho_mixer_set_route(KesshoMixer* mixer, uint32_t route_index, const KesshoMixerRoute* route);
int kessho_mixer_get_route(KesshoMixer* mixer, uint32_t route_index, KesshoMixerRoute* route);
int kessho_mixer_get_stats(KesshoMixer* mixer, KesshoMixerStats* stats);
int kessho_mixer_process_planar_stereo(
    KesshoMixer* mixer,
    const float* const* input_l,
    const float* const* input_r,
    uint32_t input_bus_count,
    float* const* output_l,
    float* const* output_r,
    uint32_t output_bus_count,
    int frames);

#ifdef __cplusplus
}
#endif
