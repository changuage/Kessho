#pragma once

#include "ProductFxRoutingGraphState.h"

#include <cstdint>

namespace kessho::product::internal {

struct RoutingState : FxRoutingGraphState {
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

  RoutingState() {
    (void)setFxRoute(kFxNodeDelayA, kFxNodeReverb, delay_to_reverb, true);
    (void)setFxRoute(kFxNodeDelayB, kFxNodeReverb, delay_b_to_reverb, true);
    (void)setFxRoute(kFxNodeGranular, kFxNodeReverb, granular_to_reverb, true);
    (void)setFxRoute(kFxNodeFreeze, kFxNodeReverb, 1.0f, true);
    syncLegacyFxRoutes();
  }

  void syncLegacyFxRoutes() {
    const auto amount = [this](uint8_t from, uint8_t to) {
      return fxEdgeEnabled(from, to) ? fx_route_amount[from][to] : 0.0f;
    };
    delay_a_to_delay_b = amount(kFxNodeDelayA, kFxNodeDelayB);
    delay_b_to_delay_a = amount(kFxNodeDelayB, kFxNodeDelayA);
    delay_to_reverb = amount(kFxNodeDelayA, kFxNodeReverb);
    granular_to_reverb = amount(kFxNodeGranular, kFxNodeReverb);
    delay_a_to_granular = amount(kFxNodeDelayA, kFxNodeGranular);
    delay_b_to_granular = amount(kFxNodeDelayB, kFxNodeGranular);
    delay_b_to_reverb = amount(kFxNodeDelayB, kFxNodeReverb);
    granular_to_delay_a = amount(kFxNodeGranular, kFxNodeDelayA);
    granular_to_delay_b = amount(kFxNodeGranular, kFxNodeDelayB);
    delay_a_to_degrade = amount(kFxNodeDelayA, kFxNodeDegrade);
    delay_b_to_degrade = amount(kFxNodeDelayB, kFxNodeDegrade);
    granular_to_degrade = amount(kFxNodeGranular, kFxNodeDegrade);
    reverb_to_degrade = amount(kFxNodeReverb, kFxNodeDegrade);
    degrade_to_reverb = amount(kFxNodeDegrade, kFxNodeReverb);
  }
};

} // namespace kessho::product::internal
