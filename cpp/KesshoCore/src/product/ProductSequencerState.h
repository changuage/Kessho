#pragma once

#include "ProductConstants.h"
#include "ProductSequencerFaceState.h"
#include "ProductSequencerPitchConstants.h"
#include "ProductSequencerEvolveState.h"
#include "kessho_drum.h"

#include <cstdint>

namespace kessho::product::internal {

constexpr uint32_t kMaxPendingRatchetsPerLane = 128u;

struct PendingRatchetEvent {
  uint64_t parent_step_id = 0;
  uint64_t absolute_sample = 0;
  uint32_t lane_index = 0;
  uint32_t step_index = 0;
  uint32_t ratchet_index = 0;
  uint32_t ratchet_count = 1;
  KesshoSequencerEvent event{};
};

struct LaneState {
  uint32_t sequencer_mode = kSequencerModeEuclid;
  bool enabled = false;
  uint32_t target_source_id = KESSHO_PRODUCT_SOURCE_PAD1;
  uint32_t step_count = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SEQUENCER_STEPS;
  uint32_t fill_count = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SEQUENCER_FILLS;
  int32_t rotation = 0;
  uint32_t clock_division = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SEQUENCER_CLOCK_DIVISION;
  float swing = 0.0f;
  float probability = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SEQUENCER_PROBABILITY;
  uint32_t ratchet = 1;
  uint32_t trig_condition = KESSHO_PRODUCT_TRIG_ALWAYS;
  float midi_note = 60.0f;
  uint32_t drum_voice_mask = 0;
  uint32_t target_pad_voice_index = kPadVoiceNoPreference;
  uint32_t target_pad_voice_mask = 0;
  float velocity = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SEQUENCER_VELOCITY;
  float hold_seconds = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SEQUENCER_HOLD_SECONDS;
  float morph = 0.0f;
  float distance = 0.0f;
  float expression = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_EXPRESSION;
  uint32_t seed = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_RNG_SEED;
  uint32_t midi_note_binding_mode = kSequencerPitchBindingHit;
  uint32_t pitch_mode = kSequencerPitchModeSemitones;
  float pitch_root = 60.0f;
  uint32_t pitch_scale_id = kSequencerPitchScaleMajor;
  float note_range_min = 64.0f;
  float note_range_max = 76.0f;
  bool bar_reset = true;
  bool phrase_reset = false;
  float tempo_multiplier = 1.0f;
  float initial_start_delay_seconds =
      kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SEQUENCER_INITIAL_START_DELAY_SECONDS;
  uint32_t manual_step_mask_low = 0;
  uint32_t manual_step_mask_high = 0;
  uint32_t step_override_set_low = 0;
  uint32_t step_override_set_high = 0;
  uint32_t step_override_value_low = 0;
  uint32_t step_override_value_high = 0;
  uint32_t probability_override_set_low = 0;
  uint32_t probability_override_set_high = 0;
  float probability_overrides[64]{};
  uint32_t ratchet_override_set_low = 0;
  uint32_t ratchet_override_set_high = 0;
  uint32_t ratchet_overrides[64]{};
  uint32_t trig_condition_override_set_low = 0;
  uint32_t trig_condition_override_set_high = 0;
  uint32_t trig_condition_numerators[64]{};
  uint32_t trig_condition_denominators[64]{};
  uint32_t midi_note_override_set_low = 0;
  uint32_t midi_note_override_set_high = 0;
  float midi_note_overrides[64]{};
  uint32_t expression_override_set_low = 0;
  uint32_t expression_override_set_high = 0;
  uint32_t expression_range_set_low = 0;
  uint32_t expression_range_set_high = 0;
  float expression_overrides[64]{};
  float expression_range_maxes[64]{};
  uint32_t morph_override_set_low = 0;
  uint32_t morph_override_set_high = 0;
  uint32_t morph_range_set_low = 0;
  uint32_t morph_range_set_high = 0;
  float morph_overrides[64]{};
  float morph_range_maxes[64]{};
  uint32_t distance_override_set_low = 0;
  uint32_t distance_override_set_high = 0;
  uint32_t distance_range_set_low = 0;
  uint32_t distance_range_set_high = 0;
  float distance_overrides[64]{};
  float distance_range_maxes[64]{};
  uint32_t nudge_override_set_low = 0, nudge_override_set_high = 0;
  float nudge_overrides[64]{};
  StepValueSubLaneConfig step_value_configs[9]{};
  LaneEvolveHomeState evolve_home{};
  uint64_t emitted_hit_count = 0;
  bool last_emitted_morph_valid = false;
  float last_emitted_morph = 0.0f;
  bool last_emitted_distance_valid = false;
  float last_emitted_distance = 0.0f;
  bool last_emitted_expression_valid = false;
  float last_emitted_expression = 1.0f;
  uint32_t last_emitted_drum_voice = DRUM_NUM_VOICE_TYPES;
  uint64_t last_emitted_sample_frame = 0;
  uint64_t sequencer_runtime_sample_frame = 0;
  uint64_t sequencer_start_sample_frame = 0;
  bool sequencer_runtime_initialized = false;
  bool sequencer_join_pending = true;
  PendingRatchetEvent pending_ratchets[kMaxPendingRatchetsPerLane]{};
  uint32_t pending_ratchet_count = 0;
  uint32_t pending_ratchet_drop_count = 0;
  AnchorWalkerState anchor_walker{};
  OrbitSequencerState orbit{};
};

} // namespace kessho::product::internal
