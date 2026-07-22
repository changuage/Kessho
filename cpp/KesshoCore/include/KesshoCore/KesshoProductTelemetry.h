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

#define KESSHO_PRODUCT_SEQUENCER_UI_STATE_LANES 16u
#define KESSHO_PRODUCT_SEQUENCER_UI_STATE_STEPS 64u
#define KESSHO_PRODUCT_SEQUENCER_UI_STATE_SUBLANES 9u
#define KESSHO_PRODUCT_ORBIT_VISUAL_LANES KESSHO_PRODUCT_SEQUENCER_UI_STATE_LANES
#define KESSHO_PRODUCT_ORBIT_VISUAL_NOTES 32u
#define KESSHO_PRODUCT_ANCHOR_WALKER_VISUAL_LANES KESSHO_PRODUCT_SEQUENCER_UI_STATE_LANES
#define KESSHO_PRODUCT_ANCHOR_WALKER_VISUAL_OUTPUTS 4u
#define KESSHO_PRODUCT_RUNTIME_WALK_TELEMETRY_CAPACITY 96u
#define KESSHO_PRODUCT_EARTH_TEXTURE_TELEMETRY_CAPACITY 4u
#define KESSHO_PRODUCT_MODULATION_DEBUG_TELEMETRY_CAPACITY 96u
#define KESSHO_PRODUCT_GRANULAR_VISUAL_EVENT_CAPACITY 32u
#define KESSHO_PRODUCT_DEBUG_SOURCE_STATE_CAPACITY 8u
#define KESSHO_PRODUCT_DEBUG_VOICE_SPAWN_CAPACITY 16u
#define KESSHO_PRODUCT_SEQUENCER_UI_MUTATION_HAS_OVERRIDES 1u
#define KESSHO_PRODUCT_SEQUENCER_UI_CHANGE_SNAPSHOT 1u
#define KESSHO_PRODUCT_SEQUENCER_UI_CHANGE_STEP 2u
#define KESSHO_PRODUCT_SEQUENCER_UI_CHANGE_DICE 3u
#define KESSHO_PRODUCT_SEQUENCER_UI_CHANGE_RESET_HOME 4u
#define KESSHO_PRODUCT_SEQUENCER_UI_CHANGE_EVOLUTION 5u
#define KESSHO_PRODUCT_SEQUENCER_UI_CHANGE_PERFORMANCE 6u

#define KESSHO_PRODUCT_EARTH_TEXTURE_ACTIVE 1u
#define KESSHO_PRODUCT_EARTH_TEXTURE_PARITY_FIXTURE 2u
#define KESSHO_PRODUCT_EARTH_TEXTURE_PARAMS_AVAILABLE 4u
#define KESSHO_PRODUCT_EARTH_TEXTURE_SOURCE_ENABLED 8u

#define KESSHO_PRODUCT_EARTH_TEXTURE_REASON_NONE 0u
#define KESSHO_PRODUCT_EARTH_TEXTURE_REASON_TEXTURE_PARAMS_MISSING 1u
#define KESSHO_PRODUCT_EARTH_TEXTURE_REASON_PARITY_FIXTURE_ENABLED 2u
#define KESSHO_PRODUCT_EARTH_TEXTURE_REASON_ASSET_NOT_REGISTERED 3u
#define KESSHO_PRODUCT_EARTH_TEXTURE_REASON_ASSET_NOT_FOUND 4u
#define KESSHO_PRODUCT_EARTH_TEXTURE_REASON_ASSET_TOO_SHORT 5u
#define KESSHO_PRODUCT_EARTH_TEXTURE_REASON_SOURCE_DISABLED 6u
#define KESSHO_PRODUCT_EARTH_TEXTURE_REASON_SLOT_MUTED 7u
#define KESSHO_PRODUCT_EARTH_TEXTURE_REASON_DENSITY_ZERO 8u
#define KESSHO_PRODUCT_EARTH_TEXTURE_REASON_VOICE_BUDGET_EXCEEDED 9u

typedef struct KesshoProductSequencerLaneUiState {
  uint32_t enabled;
  uint32_t target_source_id;
  uint32_t step_count;
  uint32_t fill_count;
  uint32_t rotation;
  uint32_t clock_division;
  uint32_t mutation_flags;
  uint32_t step_override_set_low;
  uint32_t step_override_set_high;
  uint32_t step_override_value_low;
  uint32_t step_override_value_high;
  uint32_t probability_override_set_low;
  uint32_t probability_override_set_high;
  uint32_t ratchet_override_set_low;
  uint32_t ratchet_override_set_high;
  uint32_t trig_condition_override_set_low;
  uint32_t trig_condition_override_set_high;
  uint32_t midi_note_override_set_low;
  uint32_t midi_note_override_set_high;
  uint32_t expression_override_set_low;
  uint32_t expression_override_set_high;
  uint32_t morph_override_set_low;
  uint32_t morph_override_set_high;
  uint32_t distance_override_set_low;
  uint32_t distance_override_set_high;
  uint32_t nudge_override_set_low;
  uint32_t nudge_override_set_high;
  uint32_t step_value_config_enabled_mask;
  uint32_t step_value_config_steps[KESSHO_PRODUCT_SEQUENCER_UI_STATE_SUBLANES];
  uint32_t step_value_config_directions[KESSHO_PRODUCT_SEQUENCER_UI_STATE_SUBLANES];
  float probability_overrides[KESSHO_PRODUCT_SEQUENCER_UI_STATE_STEPS];
  uint32_t ratchet_overrides[KESSHO_PRODUCT_SEQUENCER_UI_STATE_STEPS];
  uint32_t trig_condition_numerators[KESSHO_PRODUCT_SEQUENCER_UI_STATE_STEPS];
  uint32_t trig_condition_denominators[KESSHO_PRODUCT_SEQUENCER_UI_STATE_STEPS];
  float midi_note_overrides[KESSHO_PRODUCT_SEQUENCER_UI_STATE_STEPS];
  float expression_overrides[KESSHO_PRODUCT_SEQUENCER_UI_STATE_STEPS];
  float morph_overrides[KESSHO_PRODUCT_SEQUENCER_UI_STATE_STEPS];
  float distance_overrides[KESSHO_PRODUCT_SEQUENCER_UI_STATE_STEPS];
  float nudge_overrides[KESSHO_PRODUCT_SEQUENCER_UI_STATE_STEPS];
  uint32_t expression_range_set_low;
  uint32_t expression_range_set_high;
  uint32_t morph_range_set_low;
  uint32_t morph_range_set_high;
  uint32_t distance_range_set_low;
  uint32_t distance_range_set_high;
  float expression_range_maxes[KESSHO_PRODUCT_SEQUENCER_UI_STATE_STEPS];
  float morph_range_maxes[KESSHO_PRODUCT_SEQUENCER_UI_STATE_STEPS];
  float distance_range_maxes[KESSHO_PRODUCT_SEQUENCER_UI_STATE_STEPS];
  float swing;
  float midi_note;
  float note_range_min;
  float note_range_max;
} KesshoProductSequencerLaneUiState;

typedef struct KesshoProductSequencerUiState {
  uint32_t schema_hash;
  uint32_t revision;
  uint32_t synth_lane_count;
  uint32_t drum_lane_count;
  float evolution_amount;
  uint32_t evolution_state;
  uint32_t last_changed_target_id;
  uint32_t last_changed_lane_index;
  uint32_t last_change_kind;
  KesshoProductSequencerLaneUiState synth_lanes[KESSHO_PRODUCT_SEQUENCER_UI_STATE_LANES];
  KesshoProductSequencerLaneUiState drum_lanes[KESSHO_PRODUCT_SEQUENCER_UI_STATE_LANES];
} KesshoProductSequencerUiState;

typedef struct KesshoProductGranularVisualEvent {
  float position_norm;
  float pan;
  float pitch_semi;
  float gain;
  float length_ms;
  int32_t voice;
  int32_t flags;
  int32_t cloud_style;
} KesshoProductGranularVisualEvent;

typedef struct KesshoProductDebugSourceState {
  uint32_t source_id;
  uint32_t preset_id;
  uint32_t source_preset_a_id;
  uint32_t source_preset_b_id;
  uint32_t source_revision;
  uint32_t source_state_hash;
  uint32_t compiled_source_hash;
  uint32_t override_block_hash;
} KesshoProductDebugSourceState;

typedef struct KesshoProductDebugVoiceSpawn {
  uint64_t trigger_sample;
  uint64_t trigger_sequence;
  uint32_t source_id;
  uint32_t voice_id;
  uint32_t preset_id;
  uint32_t source_revision;
  uint32_t source_state_hash;
  uint32_t compiled_source_hash;
  uint32_t override_block_hash;
  uint32_t trigger_context_hash;
} KesshoProductDebugVoiceSpawn;

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
  uint32_t runtime_walk_control_ids[KESSHO_PRODUCT_RUNTIME_WALK_TELEMETRY_CAPACITY];
  float runtime_walk_values[KESSHO_PRODUCT_RUNTIME_WALK_TELEMETRY_CAPACITY];
  uint32_t rng_seed;
  uint32_t rng_state;
  uint32_t source_preset_ids[8];
  float master_input_peak;
  float master_output_peak;
  float master_output_rms;
  float master_limiter_gain_reduction_db;
  float dynamics_saturation_drive;
  uint32_t sequencer_ui_state_revision;
  float master_true_peak;
  float master_true_peak_dbtp;
  float master_integrated_lufs;
  float granular_write_head;
  float granular_voice_positions[4];
  float pad1_filter_freq;
  float pad1_lfo1_value;
  float pad2_filter_freq;
  float pad2_lfo1_value;
  uint32_t synth_sequencer_hit_counts[KESSHO_PRODUCT_SEQUENCER_UI_STATE_LANES];
  uint32_t drum_sequencer_hit_counts[KESSHO_PRODUCT_SEQUENCER_UI_STATE_LANES];
  uint32_t synth_sequencer_current_steps[KESSHO_PRODUCT_SEQUENCER_UI_STATE_LANES];
  uint32_t drum_sequencer_current_steps[KESSHO_PRODUCT_SEQUENCER_UI_STATE_LANES];
  uint32_t synth_arp_current_steps[KESSHO_PRODUCT_SEQUENCER_UI_STATE_LANES];
  uint32_t earth_texture_asset_ids[KESSHO_PRODUCT_EARTH_TEXTURE_TELEMETRY_CAPACITY];
  uint32_t earth_texture_flags[KESSHO_PRODUCT_EARTH_TEXTURE_TELEMETRY_CAPACITY];
  uint32_t earth_texture_inactive_reasons[KESSHO_PRODUCT_EARTH_TEXTURE_TELEMETRY_CAPACITY];
  uint32_t earth_texture_active_slice_counts[KESSHO_PRODUCT_EARTH_TEXTURE_TELEMETRY_CAPACITY];
  uint32_t earth_texture_playing_slice_counts[KESSHO_PRODUCT_EARTH_TEXTURE_TELEMETRY_CAPACITY];
  uint32_t earth_texture_last_slice_ids[KESSHO_PRODUCT_EARTH_TEXTURE_TELEMETRY_CAPACITY];
  uint32_t earth_texture_seeds[KESSHO_PRODUCT_EARTH_TEXTURE_TELEMETRY_CAPACITY];
  float earth_texture_last_offsets[KESSHO_PRODUCT_EARTH_TEXTURE_TELEMETRY_CAPACITY];
  float earth_texture_last_start_times[KESSHO_PRODUCT_EARTH_TEXTURE_TELEMETRY_CAPACITY];
  float earth_texture_slice_durations[KESSHO_PRODUCT_EARTH_TEXTURE_TELEMETRY_CAPACITY];
  float earth_texture_output_durations[KESSHO_PRODUCT_EARTH_TEXTURE_TELEMETRY_CAPACITY];
  float earth_texture_detune_cents[KESSHO_PRODUCT_EARTH_TEXTURE_TELEMETRY_CAPACITY];
  float earth_texture_speed_multipliers[KESSHO_PRODUCT_EARTH_TEXTURE_TELEMETRY_CAPACITY];
  float earth_texture_total_rates[KESSHO_PRODUCT_EARTH_TEXTURE_TELEMETRY_CAPACITY];
  float earth_texture_densities[KESSHO_PRODUCT_EARTH_TEXTURE_TELEMETRY_CAPACITY];
  float earth_texture_fade_times[KESSHO_PRODUCT_EARTH_TEXTURE_TELEMETRY_CAPACITY];
  float earth_texture_asset_durations[KESSHO_PRODUCT_EARTH_TEXTURE_TELEMETRY_CAPACITY];
  float earth_texture_max_offsets[KESSHO_PRODUCT_EARTH_TEXTURE_TELEMETRY_CAPACITY];
  uint32_t modulation_debug_count;
  uint32_t modulation_debug_control_ids[KESSHO_PRODUCT_MODULATION_DEBUG_TELEMETRY_CAPACITY];
  uint32_t modulation_debug_target_ids[KESSHO_PRODUCT_MODULATION_DEBUG_TELEMETRY_CAPACITY];
  uint32_t modulation_debug_param_ids[KESSHO_PRODUCT_MODULATION_DEBUG_TELEMETRY_CAPACITY];
  uint32_t modulation_debug_modes[KESSHO_PRODUCT_MODULATION_DEBUG_TELEMETRY_CAPACITY];
  uint32_t modulation_debug_trigger_buses[KESSHO_PRODUCT_MODULATION_DEBUG_TELEMETRY_CAPACITY];
  uint32_t modulation_debug_trigger_counters[KESSHO_PRODUCT_MODULATION_DEBUG_TELEMETRY_CAPACITY];
  uint32_t modulation_debug_seeds[KESSHO_PRODUCT_MODULATION_DEBUG_TELEMETRY_CAPACITY];
  uint32_t modulation_debug_random_walk_global[KESSHO_PRODUCT_MODULATION_DEBUG_TELEMETRY_CAPACITY];
  uint32_t modulation_debug_last_trigger_sources[KESSHO_PRODUCT_MODULATION_DEBUG_TELEMETRY_CAPACITY];
  float modulation_debug_min_values[KESSHO_PRODUCT_MODULATION_DEBUG_TELEMETRY_CAPACITY];
  float modulation_debug_max_values[KESSHO_PRODUCT_MODULATION_DEBUG_TELEMETRY_CAPACITY];
  float modulation_debug_current_values[KESSHO_PRODUCT_MODULATION_DEBUG_TELEMETRY_CAPACITY];
  float modulation_debug_normalized_positions[KESSHO_PRODUCT_MODULATION_DEBUG_TELEMETRY_CAPACITY];
  float modulation_debug_speeds[KESSHO_PRODUCT_MODULATION_DEBUG_TELEMETRY_CAPACITY];
  uint64_t modulation_debug_last_trigger_frames[KESSHO_PRODUCT_MODULATION_DEBUG_TELEMETRY_CAPACITY];
  uint32_t granular_visual_event_count;
  KesshoProductGranularVisualEvent granular_visual_events[KESSHO_PRODUCT_GRANULAR_VISUAL_EVENT_CAPACITY];
  uint32_t debug_source_state_count;
  KesshoProductDebugSourceState debug_source_states[KESSHO_PRODUCT_DEBUG_SOURCE_STATE_CAPACITY];
  uint32_t debug_voice_spawn_count;
  KesshoProductDebugVoiceSpawn debug_voice_spawns[KESSHO_PRODUCT_DEBUG_VOICE_SPAWN_CAPACITY];
  uint32_t synth_orbit_visual_note_counts[KESSHO_PRODUCT_ORBIT_VISUAL_LANES];
  float synth_orbit_visual_base_angles[KESSHO_PRODUCT_ORBIT_VISUAL_LANES];
  float synth_orbit_visual_note_angles[KESSHO_PRODUCT_ORBIT_VISUAL_LANES * KESSHO_PRODUCT_ORBIT_VISUAL_NOTES];
  float synth_orbit_visual_note_flashes[KESSHO_PRODUCT_ORBIT_VISUAL_LANES * KESSHO_PRODUCT_ORBIT_VISUAL_NOTES];
  uint32_t synth_anchor_walker_visual_flags[KESSHO_PRODUCT_ANCHOR_WALKER_VISUAL_LANES];
  int32_t synth_anchor_walker_cursor_degrees[KESSHO_PRODUCT_ANCHOR_WALKER_VISUAL_LANES];
  int32_t synth_anchor_walker_last_gesture_deltas[KESSHO_PRODUCT_ANCHOR_WALKER_VISUAL_LANES];
  uint32_t synth_anchor_walker_boundary_events[KESSHO_PRODUCT_ANCHOR_WALKER_VISUAL_LANES];
  uint32_t synth_anchor_walker_output_counts[KESSHO_PRODUCT_ANCHOR_WALKER_VISUAL_LANES];
  float synth_anchor_walker_anchor_midis[KESSHO_PRODUCT_ANCHOR_WALKER_VISUAL_LANES];
  float synth_anchor_walker_cursor_midis[KESSHO_PRODUCT_ANCHOR_WALKER_VISUAL_LANES];
  float synth_anchor_walker_previous_cursor_midis[KESSHO_PRODUCT_ANCHOR_WALKER_VISUAL_LANES];
  float synth_anchor_walker_output_midis[
      KESSHO_PRODUCT_ANCHOR_WALKER_VISUAL_LANES *
      KESSHO_PRODUCT_ANCHOR_WALKER_VISUAL_OUTPUTS];
  float synth_anchor_walker_output_velocities[
      KESSHO_PRODUCT_ANCHOR_WALKER_VISUAL_LANES *
      KESSHO_PRODUCT_ANCHOR_WALKER_VISUAL_OUTPUTS];
  float transport_bpm;
  uint32_t transport_beats_per_bar;
  uint32_t transport_bars_per_phrase;
  float transport_phrase_seconds;
  uint32_t transport_transition_pending;
  float transport_pending_bpm;
  uint32_t transport_pending_beats_per_bar;
  uint32_t transport_pending_bars_per_phrase;
  float transport_pending_phrase_seconds;
  uint64_t transport_pending_apply_frame;
  uint32_t transport_transition_revision;
  float transport_phrase_progress;
  uint32_t source_morph_automation_enabled_mask;
  float source_morph_values[KESSHO_PRODUCT_SOURCE_MORPH_AUTOMATION_COUNT];
  uint32_t auto_stop_enabled;
  uint64_t auto_stop_target_sample_frame;
  float synth_arp_current_midis[KESSHO_PRODUCT_SEQUENCER_UI_STATE_LANES];
  uint32_t scatter_current_phrase_id;
  uint32_t scatter_current_voice;
  uint32_t scatter_current_step;
  uint32_t scatter_pulse_count;
  uint32_t scene_program_revision;
  float scene_position;
  uint32_t routing_mute_group_revision;
  uint32_t routing_mute_group_active_slot;
  uint32_t routing_mute_group_next_slot;
  uint32_t routing_mute_group_mask;
  uint64_t routing_mute_group_next_change_frame;
  float routing_mute_group_transition_progress;
  uint32_t routing_mute_groups_enabled;
  uint32_t routing_mute_group_trace_revision;
  uint32_t auto_cycle_revision;
  uint32_t auto_cycle_phase;
  float auto_cycle_position;
  uint64_t auto_cycle_phase_start_frame;
  uint64_t auto_cycle_phase_end_frame;
  uint32_t auto_cycle_transition_count;
  uint32_t auto_cycle_enabled;
  uint32_t journey_schedule_revision;
  uint32_t journey_schedule_phase;
  uint32_t journey_current_node_index;
  uint32_t journey_next_node_index;
  uint32_t journey_schedule_index;
  uint32_t journey_loop_index;
  float journey_hold_progress;
  float journey_morph_progress;
  uint64_t journey_prepared_total_frames;
  uint32_t journey_transition_count;
  uint32_t journey_schedule_running;
  uint32_t journey_rng_state_after_plan;
  uint32_t journey_schedule_entry_count;
  // The arrangement scheduler cursor is the authoritative chord playhead.
  // These fields are appended to preserve every existing telemetry offset.
  uint64_t chord_sequencer_absolute_step;
  uint32_t chord_sequencer_current_step;
} KesshoProductTelemetry;
