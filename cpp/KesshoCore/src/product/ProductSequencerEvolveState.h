#pragma once

#include "ProductConstants.h"
#include "KesshoCore/KesshoProductEvents.h"

#include <cstdint>

namespace kessho::product::internal {

struct StepValueSubLaneConfig {
  bool enabled = false;
  uint32_t steps = 0;
  uint32_t direction = KESSHO_PRODUCT_SUBLANE_DIRECTION_FORWARD;
};

struct LaneEvolveHomeState {
  bool captured = false;
  uint32_t step_count = generated::KESSHO_PRODUCT_DEFAULT_SEQUENCER_STEPS;
  uint32_t fill_count = generated::KESSHO_PRODUCT_DEFAULT_SEQUENCER_FILLS;
  int32_t rotation = 0;
  float swing = 0.0f;
  float probability = generated::KESSHO_PRODUCT_DEFAULT_SEQUENCER_PROBABILITY;
  uint32_t ratchet = 1;
  float midi_note = 60.0f;
  float note_range_min = 64.0f;
  float note_range_max = 76.0f;
  float expression = generated::KESSHO_PRODUCT_DEFAULT_SOURCE_EXPRESSION;
  float morph = 0.0f;
  float distance = 0.0f;
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
  uint32_t midi_note_override_set_low = 0;
  uint32_t midi_note_override_set_high = 0;
  float midi_note_overrides[64]{};
  uint32_t expression_override_set_low = 0;
  uint32_t expression_override_set_high = 0;
  float expression_overrides[64]{};
  uint32_t morph_override_set_low = 0;
  uint32_t morph_override_set_high = 0;
  float morph_overrides[64]{};
  uint32_t distance_override_set_low = 0;
  uint32_t distance_override_set_high = 0;
  float distance_overrides[64]{};
  uint32_t nudge_override_set_low = 0;
  uint32_t nudge_override_set_high = 0;
  float nudge_overrides[64]{};
  StepValueSubLaneConfig step_value_configs[9]{};
};

} // namespace kessho::product::internal
