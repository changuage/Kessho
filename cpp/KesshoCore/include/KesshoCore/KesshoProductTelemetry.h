#pragma once

#include <stdint.h>

typedef struct KesshoProductCapabilityReport {
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
} KesshoProductCapabilityReport;

typedef struct KesshoProductTelemetry {
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
  uint32_t wasm_heap_bytes;
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
  uint32_t modulation_range_count;
  uint32_t runtime_walk_count;
  uint32_t runtime_walk_control_ids[16];
  float runtime_walk_values[16];
  uint32_t rng_seed;
  uint32_t rng_state;
  uint32_t source_preset_ids[7];
} KesshoProductTelemetry;
