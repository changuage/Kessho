#pragma once

#include "ProductConstants.h"

#include <cstdint>

namespace kessho::product::internal {

struct StepValueSubLaneConfig {
  bool enabled = false;
  uint32_t steps = 0;
  uint32_t direction = KESSHO_PRODUCT_SUBLANE_DIRECTION_FORWARD;
};

struct LaneState {
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
  float velocity = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SEQUENCER_VELOCITY;
  float hold_seconds = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SEQUENCER_HOLD_SECONDS;
  float morph = 0.0f;
  float distance = 0.0f;
  float expression = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_EXPRESSION;
  uint32_t seed = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_RNG_SEED;
  uint32_t midi_note_binding_mode = kSequencerPitchBindingHit;
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
  StepValueSubLaneConfig step_value_configs[8]{};
  uint64_t emitted_hit_count = 0;
  uint64_t sequencer_runtime_sample_frame = 0;
  uint64_t sequencer_start_sample_frame = 0;
  bool sequencer_runtime_initialized = false;
  bool sequencer_join_pending = true;
};

} // namespace kessho::product::internal
