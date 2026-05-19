#pragma once

#include "ProductConstants.h"

#include <cstdint>

namespace kessho::product::internal {

enum ProductSampleHoldTriggerBus : uint32_t {
  kProductSampleHoldTriggerTimed = 0,
  kProductSampleHoldTriggerDelayA = 1,
  kProductSampleHoldTriggerDelayB = 2,
  kProductSampleHoldTriggerGranular = 3,
  kProductSampleHoldTriggerReverb = 4,
};

struct ModulationRange {
  bool active = false;
  uint32_t control_id = 0;
  uint32_t target_id = 0;
  uint32_t param_id = 0;
  uint32_t mode = KESSHO_PRODUCT_MODULATION_RANGE_OFF;
  float min_value = 0.0f;
  float max_value = 0.0f;
  float current_value = 0.0f;
  float velocity = 0.0f;
  float random_walk_speed = 1.0f;
  float random_walk_step_accumulator = 0.0f;
  uint32_t seed = 1;
  uint32_t random_walk_counter = 0;
  bool random_walk_global = false;
  uint32_t sample_hold_interval_frames = 0;
  uint32_t sample_hold_frames_until_next = 0;
  uint32_t sample_hold_counter = 0;
  uint32_t sample_hold_trigger_bus = kProductSampleHoldTriggerTimed;
};

struct ProductFxSampleHoldOwner {
  uint32_t source_id = 0;
  float strength = 0.0f;
  uint64_t expires_at_frame = 0;
};

} // namespace kessho::product::internal
