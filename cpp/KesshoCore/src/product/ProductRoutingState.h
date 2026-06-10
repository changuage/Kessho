#pragma once

#include "ProductDynamicsRouteConstants.h"

#include <cstdint>

namespace kessho::product::internal {

struct RoutingState {
  float delay_a_to_delay_b = 0.0f;
  float delay_b_to_delay_a = 0.0f;
  float delay_to_reverb = 0.4f;
  float granular_to_reverb = 0.15f;
  float delay_a_to_granular = 0.0f;
  float delay_b_to_granular = 0.0f;
  float delay_b_to_reverb = 0.4f;
  float granular_to_delay_a = 0.0f;
  float granular_to_delay_b = 0.0f;
  float delay_a_to_degrade = 0.0f;
  float delay_b_to_degrade = 0.0f;
  float granular_to_degrade = 0.0f;
  float reverb_to_degrade = 0.0f;
  float degrade_to_reverb = 0.0f;
  float degrade_return_level = 1.0f;
  uint32_t dynamics_routes[kDynamicsRouteCount]{};
};

} // namespace kessho::product::internal
