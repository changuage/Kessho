#pragma once

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef void* KesshoNativeProductCoreHandle;

typedef struct KesshoNativeProductCapabilityReport {
  uint32_t abi_version;
  uint32_t schema_hash;
  uint32_t supports_full_product_graph;
  uint32_t supports_synth_sequencer;
  uint32_t supports_drum_sequencer;
  uint32_t supports_journey_morph_clock;
  uint32_t supports_harmony_core;
  uint32_t supports_core_asset_rendering;
  uint32_t supports_native_bridge;
  uint32_t supports_recordable_stems;
  uint32_t supports_cpu_telemetry;
  uint32_t legacy_fallback_count;
  uint32_t unsupported_method_count;
} KesshoNativeProductCapabilityReport;

typedef struct KesshoNativeProductTelemetry {
  uint32_t schema_hash;
  double sample_rate;
  uint32_t block_size;
  uint32_t transport_running;
  uint64_t absolute_sample_time;
  double beat_position;
  uint64_t bar_index;
  uint64_t phrase_index;
  uint32_t active_sources;
  uint32_t active_voices;
  uint32_t active_assets;
  uint32_t active_grains;
  float render_cpu_percent;
  float render_cpu_peak_percent;
  float render_p95_ms;
  float render_p99_ms;
  uint32_t missed_quantum_count;
  uint32_t sequencer_event_count;
  uint32_t control_queue_depth;
  uint32_t asset_missing_count;
  int32_t last_error_code;
  uint32_t journey_morph_running;
  float journey_morph_phase;
  float harmony_root_midi;
  uint32_t harmony_scale_id;
  float harmony_tension;
  uint32_t harmony_chord_degree;
  float harmony_chord_midi[4];
  uint32_t rng_seed;
  uint32_t rng_state;
  uint32_t source_preset_ids[7];
} KesshoNativeProductTelemetry;

int32_t kessho_native_product_get_abi_version(void);
KesshoNativeProductCapabilityReport kessho_native_product_get_capability_report(void);

KesshoNativeProductCoreHandle kessho_native_product_create(
    double sample_rate,
    uint32_t max_block_size,
    uint32_t flags);

void kessho_native_product_destroy(KesshoNativeProductCoreHandle handle);
void kessho_native_product_reset(KesshoNativeProductCoreHandle handle);

int32_t kessho_native_product_load_snapshot(
    KesshoNativeProductCoreHandle handle,
    const void* snapshot_bytes,
    uint32_t snapshot_byte_count);

int32_t kessho_native_product_enqueue_event(
    KesshoNativeProductCoreHandle handle,
    uint32_t sample_offset,
    uint32_t event_kind,
    uint32_t target_id,
    uint32_t index,
    uint32_t param_id,
    float value,
    float value2,
    float value3,
    float value4,
    uint32_t flags);

int32_t kessho_native_product_render(
    KesshoNativeProductCoreHandle handle,
    float* out_l,
    float* out_r,
    uint32_t frames);

int32_t kessho_native_product_get_stem(
    KesshoNativeProductCoreHandle handle,
    uint32_t stem_id,
    float* out_l,
    float* out_r,
    uint32_t frames);

KesshoNativeProductTelemetry kessho_native_product_get_telemetry(
    KesshoNativeProductCoreHandle handle);

int32_t kessho_native_product_register_interleaved_asset(
    KesshoNativeProductCoreHandle handle,
    uint32_t asset_id,
    const float* interleaved_pcm,
    uint32_t frame_count,
    uint32_t channel_count,
    double sample_rate,
    uint32_t flags);

int32_t kessho_native_product_unregister_asset(
    KesshoNativeProductCoreHandle handle,
    uint32_t asset_id);

#ifdef __cplusplus
}
#endif
