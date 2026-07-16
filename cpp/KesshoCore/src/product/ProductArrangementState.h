#pragma once

#include "ProductConstants.h"

namespace kessho::product::internal {

constexpr uint32_t kMaxArrangementPendingEvents = 512u;

struct ProductArrangementPendingEvent {
  uint64_t absolute_sample = 0u;
  KesshoSequencerEvent event{};
};

struct ProductArrangementState {
  bool chord_generator_enabled = false;
  uint32_t chord_generator_source_id = KESSHO_PRODUCT_SOURCE_SAMPLE1;
  uint32_t chord_generator_voice_count = 6u;
  bool chord_sequencer_enabled = false;
  uint32_t chord_sequencer_source_id = KESSHO_PRODUCT_SOURCE_SAMPLE1;
  uint32_t chord_sequencer_voice_count = 6u;
  uint32_t chord_sequencer_step_count = 8u;
  uint32_t chord_sequencer_enabled_mask = 0xffu;
  float chord_sequencer_step_seconds = 1.0f;
  float chord_sequencer_probability[8]{};
  uint32_t chord_sequencer_hold_steps[8]{};
  bool lead_random_enabled = false;
  uint32_t lead_random_source_id = KESSHO_PRODUCT_SOURCE_LEAD1;
  float lead_phrase_seconds = 16.0f;
  float lead_density = 0.5f;
  int32_t lead_octave = 1;
  uint32_t lead_octave_range = 2u;
  float lead_hold_seconds = 0.5f;
  float lead_velocity_min = 0.5f;
  float lead_velocity_max = 0.9f;
  uint32_t rng_seed = 1u;
  uint32_t rng_state = 1u;
  float wave_spread = 0.125f;
  int32_t synth_octave = 0;
  float lead_chord_bias = 0.78f;
  uint32_t synth_voice_mask = 63u;
  uint32_t pad2_voice_assign = 0u;
  uint32_t pad_euclid_owned_voice_mask = 0u;
  bool chord_generator_pad_split = false;
  bool chord_sequencer_pad_split = false;
  float source_hold_seconds[8]{};
  bool pad1_fit_envelope_to_chord = true;
  bool pad2_fit_envelope_to_chord = true;
  uint32_t chord_slot_note_count[8]{};
  float chord_slot_midi[64]{};
  int32_t chord_step_slot_id[8]{};
  bool chord_slot_lane_enabled = false;
  uint32_t chord_expression_mask = 0u;
  uint32_t chord_morph_mask = 0u;
  uint32_t chord_distance_mask = 0u;
  uint32_t chord_nudge_mask = 0u;
  float chord_expression[8]{};
  float chord_morph[8]{};
  float chord_distance[8]{};
  float chord_nudge[8]{};
  float chord_lane_values[8]{};
  uint32_t chord_sub_lane_steps[5]{};
  uint32_t chord_sub_lane_directions[5]{};
  uint32_t chord_playback_mode = 0u;
  float chord_arp_speed_seconds = 0.25f;
  float chord_arp_gate = 0.62f;
  uint32_t chord_arp_pattern_length = 8u;
  uint32_t chord_arp_active_mask = 0xffffu;
  uint32_t chord_arp_tone[16]{};
  int32_t chord_arp_octave[16]{};
  uint32_t chord_strum_direction = 0u;
  float chord_strum_spread_seconds = 0.09f;
  float chord_strum_curve = 0.35f;
  float chord_strum_gate = 0.86f;
  float chord_strum_velocity_falloff = 0.08f;
  float lead_initial_delay_seconds = 0.0f;
  uint64_t next_chord_sequencer_frame = 0u;
  uint64_t next_lead_phrase_frame = 0u;
  uint64_t chord_step_index = 0u;
  uint64_t lead_phrase_index = 0u;
  bool chord_generator_pending = false;
  ProductArrangementPendingEvent pending[kMaxArrangementPendingEvents]{};
  uint32_t pending_count = 0u;
};

} // namespace kessho::product::internal
