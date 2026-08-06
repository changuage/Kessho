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
  float requested_wave_spread = 0.125f;
  int32_t synth_octave = 0;
  int32_t requested_synth_octave = 0;
  float lead_chord_bias = 0.78f;
  uint32_t harmony_slot_note_count[8]{};
  float harmony_slot_midi[64]{};
  uint32_t synth_voice_mask = 63u;
  uint32_t pad2_voice_assign = 0u;
  uint32_t pad_euclid_owned_voice_mask = 0u;
  bool chord_generator_pad_split = false;
  float source_hold_seconds[8]{};
  bool pad1_fit_envelope_to_chord = true;
  bool pad2_fit_envelope_to_chord = true;
  float lead_initial_delay_seconds = 0.0f;
  uint64_t next_lead_phrase_frame = 0u;
  uint64_t lead_phrase_index = 0u;
  uint64_t chord_phrase_start_frame = 0u;
  uint64_t chord_phrase_index = 0u;
  bool chord_generator_pending = false;
  ProductArrangementPendingEvent pending[kMaxArrangementPendingEvents]{};
  uint32_t pending_count = 0u;
};

} // namespace kessho::product::internal
