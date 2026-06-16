#pragma once

#include "ProductConstants.h"

#include <cstdint>

namespace kessho::product::internal {

constexpr uint32_t kSequencerModeEuclid = 0u;
constexpr uint32_t kSequencerModeAnchorWalker = 1u;
constexpr uint32_t kSequencerModeOrbit = 2u;
constexpr uint32_t kMaxAnchorWalkerLayers = 4u;
constexpr uint32_t kMaxAnchorWalkerPatternSteps = 16u;
constexpr uint32_t kMaxOrbitSequencerNotes = 32u;
constexpr uint32_t kMaxOrbitTriggerLines = 8u;
constexpr uint32_t kOrbitSplineLutSize = 32u;

struct AnchorWalkerLayerState {
  bool enabled = false;
  int32_t transpose_semitones = 0;
  int32_t diatonic_offset = 0;
  uint32_t tuning = 2u;
  uint32_t motion = 0u;
  float delay_seconds = 0.0f;
  float gate_ratio = 0.75f;
  float velocity_scale = 1.0f;
  float velocity_offset = 0.0f;
  uint32_t target_source_id = 0u;
};

struct AnchorWalkerState {
  bool enabled = false;
  uint32_t mode = 0u;
  uint32_t play_mode = 0u;
  uint32_t target_source_id = KESSHO_PRODUCT_SOURCE_LEAD1;
  uint32_t anchor_source = 0u;
  float manual_anchor_midi = 60.0f;
  uint32_t snap_source = 0u;
  uint16_t custom_pitch_class_mask = 0x0ab5u;
  uint32_t trigger_mode = 0u;
  uint32_t boundary_mode = 0u;
  uint32_t keyboard_range = 0u;
  bool show_linked_outputs = true;
  uint32_t auto_rate = 0u;
  uint32_t auto_feel = 0u;
  float swing = 0.0f;
  bool lead_mode = false;
  bool mw_to_velocity = false;
  bool pitch_wheel_walk = false;
  int32_t gesture_pattern[kMaxAnchorWalkerPatternSteps]{1, -1, 2, -1};
  uint32_t gesture_pattern_length = 4u;
  int32_t active_pad_delta = 0;
  uint32_t layer_preset = 0u;
  float spread_seconds = 0.0f;
  AnchorWalkerLayerState layers[kMaxAnchorWalkerLayers]{};
  uint32_t layer_count = 1u;
  float output_range_min = 36.0f;
  float output_range_max = 96.0f;
  uint32_t seed = 1u;

  bool gesture_held = false;
  int32_t held_gesture_delta = 0;
  float held_gesture_velocity = 1.0f;
  uint64_t gesture_started_sample = 0u;
  uint64_t next_gesture_walk_sample = 0u;
  uint32_t pending_gesture_steps = 0u;
  float previous_cursor_midi = 60.0f;
  int32_t last_gesture_delta = 0;
  uint32_t boundary_event = 0u;
  uint32_t last_output_count = 0u;
  float last_output_midis[kMaxAnchorWalkerLayers]{};
  float last_output_velocities[kMaxAnchorWalkerLayers]{};
  uint32_t last_output_source_ids[kMaxAnchorWalkerLayers]{};
  int32_t cursor_degree = 0;
  float cursor_midi = 60.0f;
  bool cursor_valid = false;
  float anchor_midi = 60.0f;
  bool anchor_valid = false;
  uint64_t runtime_sample_frame = 0u;
  uint64_t next_walk_sample = 0u;
  bool runtime_initialized = false;
};

struct OrbitNoteState {
  bool enabled = false;
  float radius_norm = 0.5f;
  float angle = 0.0f;
  float prev_angle = 0.0f;
  float authored_phase = 0.0f;
  uint32_t speed_mode = 1u;
  float speed_value = 1.0f;
  int32_t direction = 1;
  uint32_t pitch_mode = 1u;
  float midi_note = 60.0f;
  int32_t harmony_degree = 0;
  float pitch_range_min = 48.0f;
  float pitch_range_max = 84.0f;
  float velocity = 0.8f;
  bool velocity_range_enabled = false;
  float velocity_min = 0.6f;
  float velocity_max = 1.0f;
  float gate_beats = 0.5f;
  bool gate_range_enabled = false;
  float gate_min_beats = 0.25f;
  float gate_max_beats = 0.75f;
  float probability = 1.0f;
  uint32_t target_source_id = 0u;
  uint32_t seed = 1u;
  float flash = 0.0f;
};

struct OrbitSequencerState {
  bool enabled = false;
  uint32_t target_source_id = KESSHO_PRODUCT_SOURCE_LEAD1;
  uint32_t trigger_line_count = 1u;
  uint32_t clock_mode = 0u;
  float bpm_percent = 100.0f;
  float speed_offset = 0.0f;
  float global_offset = 0.0f;
  float even_offset = 0.0f;
  float free_offset = 0.0f;
  uint32_t even_reverse_mode = 0u;
  uint32_t constellation_mode = 0u;
  bool quantize_to_harmony = true;
  uint32_t snap_source = 0u;
  float pitch_range_min = 48.0f;
  float pitch_range_max = 84.0f;
  float spline_h1_x = 0.0f;
  float spline_h1_y = -0.3f;
  float spline_h2_x = 0.0f;
  float spline_h2_y = -0.65f;
  float spline_tip_x = 0.0f;
  float spline_tip_y = -1.0f;
  bool spline_spin_enabled = false;
  int32_t spline_spin_direction = 1;
  float base_angle = 0.0f;
  float prev_base_angle = 0.0f;
  float authored_base_angle = 0.0f;
  OrbitNoteState notes[kMaxOrbitSequencerNotes]{};
  uint32_t note_count = 0u;
  uint32_t seed = 1u;
  uint64_t runtime_sample_frame = 0u;
  bool runtime_initialized = false;
};

} // namespace kessho::product::internal
