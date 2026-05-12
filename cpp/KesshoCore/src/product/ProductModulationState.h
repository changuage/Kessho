#pragma once

#include "ProductConstants.h"

#include <cstdint>

namespace kessho::product::internal {

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
  uint32_t seed = 1;
};

} // namespace kessho::product::internal
