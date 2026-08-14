#include "../KesshoProductEngineInternal.h"
#include "ProductFxGraphRouting.h"

namespace {

struct StereoBus {
  float* left;
  float* right;
};

struct RouteSignal {
  const float* left;
  const float* right;
  bool block_local;
};

StereoBus inputBus(KesshoProductEngine& engine, uint8_t node) {
  switch (node) {
    case kFxNodeDelayA: return {engine.delay_a_bus_l, engine.delay_a_bus_r};
    case kFxNodeDelayB: return {engine.delay_b_bus_l, engine.delay_b_bus_r};
    case kFxNodeGranular: return {engine.granular_bus_l, engine.granular_bus_r};
    case kFxNodeDegrade: return {engine.degrade_bus_l, engine.degrade_bus_r};
    case kFxNodeFreeze: return {engine.spectral_freeze_bus_l, engine.spectral_freeze_bus_r};
    case kFxNodeReverb: return {engine.reverb_bus_l, engine.reverb_bus_r};
    case kFxNodeEq1: return {engine.dynamics_eq1_bus_l, engine.dynamics_eq1_bus_r};
    case kFxNodeEq2: return {engine.dynamics_eq2_bus_l, engine.dynamics_eq2_bus_r};
    case kFxNodeSidechain: return {engine.dynamics_sidechain_bus_l, engine.dynamics_sidechain_bus_r};
    case kFxNodeCreativeSaturation:
      return {engine.creative_saturation_bus_l, engine.creative_saturation_bus_r};
    default: return {nullptr, nullptr};
  }
}

RouteSignal routeSignal(KesshoProductEngine& engine, uint8_t from, uint8_t to) {
  if (from == kFxNodeDelayA || from == kFxNodeDelayB) {
    uint32_t tap = KESSHO_MODULE_DELAY_A_TAP_MAIN;
    if (to == kFxNodeReverb) tap = KESSHO_MODULE_DELAY_A_TAP_REVERB_SEND;
    else if (to == kFxNodeDelayA || to == kFxNodeDelayB) tap = KESSHO_MODULE_DELAY_A_TAP_DELAY_B_SEND;
    else if (to == kFxNodeGranular) tap = KESSHO_MODULE_DELAY_A_TAP_GRANULAR_SEND;
    else if (to == kFxNodeDegrade) tap = KESSHO_MODULE_DELAY_A_TAP_DRIFT_SEND;
    return {engine.module_tap_l[tap], engine.module_tap_r[tap], true};
  }
  if (from == kFxNodeGranular) {
    const uint32_t tap = to == kFxNodeReverb ? 1u : 0u;
    return {engine.module_tap_l[tap], engine.module_tap_r[tap], true};
  }
  return {engine.fx_node_output_l[from], engine.fx_node_output_r[from], false};
}

StereoBus routeTap(KesshoProductEngine& engine, uint8_t from, uint8_t to) {
  if (from == kFxNodeDelayA) {
    if (to == kFxNodeReverb) return {engine.graph_delay_a_reverb_send_l, engine.graph_delay_a_reverb_send_r};
    if (to == kFxNodeDelayB) return {engine.graph_delay_a_to_delay_b_send_l, engine.graph_delay_a_to_delay_b_send_r};
    if (to == kFxNodeGranular) return {engine.graph_delay_a_to_granular_send_l, engine.graph_delay_a_to_granular_send_r};
  } else if (from == kFxNodeDelayB) {
    if (to == kFxNodeReverb) return {engine.graph_delay_b_reverb_send_l, engine.graph_delay_b_reverb_send_r};
    if (to == kFxNodeDelayA) return {engine.graph_delay_b_to_delay_a_send_l, engine.graph_delay_b_to_delay_a_send_r};
    if (to == kFxNodeGranular) return {engine.graph_delay_b_to_granular_send_l, engine.graph_delay_b_to_granular_send_r};
  } else if (from == kFxNodeGranular) {
    if (to == kFxNodeReverb) return {engine.graph_granular_reverb_send_l, engine.graph_granular_reverb_send_r};
    if (to == kFxNodeDelayA) return {engine.graph_granular_to_delay_a_send_l, engine.graph_granular_to_delay_a_send_r};
    if (to == kFxNodeDelayB) return {engine.graph_granular_to_delay_b_send_l, engine.graph_granular_to_delay_b_send_r};
  }
  return {nullptr, nullptr};
}

} // namespace

void kessho::product::internal::routeFxGraphNode(
    KesshoProductEngine& engine,
    uint8_t node,
    uint32_t start,
    uint32_t frames) {
  const uint16_t destinations = engine.routing.fx_edge_mask[node];
  for (uint8_t to = 0u; to < kFxNodeCount; ++to) {
    if ((destinations & static_cast<uint16_t>(1u << to)) == 0u) continue;
    const float amount = engine.resolveFxRouteAmount(node, to);
    const float previous_amount = engine.routing.fx_route_effective_amount[node][to];
    engine.routing.fx_route_effective_amount[node][to] = amount;
    engine.telemetry.fx_route_effective_amounts[node * kFxNodeCount + to] = amount;
    if (amount <= 0.0f && previous_amount <= 0.0f) continue;
    const StereoBus destination = inputBus(engine, to);
    const RouteSignal route = routeSignal(engine, node, to);
    const StereoBus graph_tap = engine.graph_taps_enabled ? routeTap(engine, node, to) : StereoBus{nullptr, nullptr};
    for (uint32_t i = 0; i < frames; ++i) {
      const uint32_t frame = start + i;
      const float ramp = static_cast<float>(i + 1u) / static_cast<float>(frames);
      const float smoothed_amount = previous_amount + (amount - previous_amount) * ramp;
      const uint32_t source_frame = route.block_local ? i : frame;
      const float routed_l = route.left[source_frame] * smoothed_amount;
      const float routed_r = route.right[source_frame] * smoothed_amount;
      destination.left[frame] += routed_l;
      destination.right[frame] += routed_r;
      if (graph_tap.left != nullptr) {
        graph_tap.left[frame] = routed_l;
        graph_tap.right[frame] = routed_r;
      }
    }
  }
}
