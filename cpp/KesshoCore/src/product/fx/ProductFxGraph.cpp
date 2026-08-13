#include "../KesshoProductEngineInternal.h"

namespace {

struct StereoBus {
  float* left;
  float* right;
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

bool hasInput(const StereoBus& bus, uint32_t start, uint32_t frames) {
  if (bus.left == nullptr || bus.right == nullptr) return false;
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    if (std::fabs(bus.left[frame]) > 1.0e-8f || std::fabs(bus.right[frame]) > 1.0e-8f) return true;
  }
  return false;
}

uint32_t tailFramesFor(const KesshoProductEngine& engine, uint8_t node) {
  const float seconds = node == kFxNodeDelayA || node == kFxNodeDelayB || node == kFxNodeReverb
      ? 30.0f
      : node == kFxNodeGranular || node == kFxNodeFreeze ? 4.0f : 0.0f;
  return static_cast<uint32_t>(seconds * static_cast<float>(engine.sample_rate));
}

float returnGain(const KesshoProductEngine& engine, uint8_t node) {
  switch (node) {
    case kFxNodeDelayA: return clampFloat(engine.fx.delay_a_mix, 0.0f, 1.0f);
    case kFxNodeDelayB: return clampFloat(engine.fx.delay_b_mix, 0.0f, 1.0f);
    case kFxNodeGranular: return std::max(0.0f, engine.granular_mix_gain);
    case kFxNodeDegrade: return std::max(0.0f, engine.routing.degrade_return_level);
    case kFxNodeFreeze: return clampFloat(engine.fx.spectral_freeze_mix, 0.0f, 1.0f);
    case kFxNodeReverb: return std::max(0.0f, engine.fx.reverb_mix);
    default: return 1.0f;
  }
}

uint32_t routingMuteRowForGraphNode(uint8_t node) {
  return node >= kFxNodeEq1
      ? kRoutingMuteRowEq1 + static_cast<uint32_t>(node - kFxNodeEq1)
      : kProductRoutingMuteRowCount;
}
} // namespace

void KesshoProductEngine::renderFxGraph(
    float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  if (!modules_ready || frames == 0u) return;
  fx_graph_rendering = true;
  for (uint8_t order_index = 0u; order_index < kFxNodeCount; ++order_index) {
    const uint8_t node = routing.fx_render_order[order_index];
    if (node >= kFxNodeCount) continue;
    const StereoBus input = inputBus(*this, node);
    const bool input_active = hasInput(input, start, frames);
    if (input_active) fx_node_tail_frames[node] = tailFramesFor(*this, node);
    const bool held_freeze = node == kFxNodeFreeze &&
        fx.spectral_freeze_enabled && fx.spectral_freeze_active;
    const bool tail_active = fx_node_tail_frames[node] > 0u || held_freeze;
    if (!input_active && !tail_active) continue;

    switch (node) {
      case kFxNodeDelayA:
        if (fx.delay_a_enabled) {
          renderDelayModule(delay_a_module.get(), input.left, input.right, delay_b_bus_l, delay_b_bus_r,
              out_l, out_r, start, frames);
        }
        break;
      case kFxNodeDelayB:
        if (fx.delay_b_enabled) {
          renderDelayModule(delay_b_module.get(), input.left, input.right, delay_a_bus_l, delay_a_bus_r,
              out_l, out_r, start, frames);
        }
        break;
      case kFxNodeGranular:
        if (fx.granular_enabled) renderGranular(out_l, out_r, start, frames);
        break;
      case kFxNodeDegrade:
        renderDegradeSend(out_l, out_r, start, frames);
        break;
      case kFxNodeFreeze:
        if (fx.spectral_freeze_enabled) renderSpectralFreeze(out_l, out_r, start, frames, false);
        break;
      case kFxNodeReverb:
        if (prepareReverbInput(start, frames)) renderReverb(out_l, out_r, start, frames);
        break;
      case kFxNodeEq1:
      case kFxNodeEq2:
      case kFxNodeSidechain:
        renderDynamicsNode(node, fx_node_output_l[node], fx_node_output_r[node], start, frames);
        break;
      case kFxNodeCreativeSaturation: {
        const kessho::product::saturation::Params params{
            fx.dynamics_saturation_mode,
            fx.dynamics_saturation_quality,
            fx.dynamics_saturation_drive,
            fx.dynamics_saturation_tone,
            fx.dynamics_saturation_bias};
        for (uint32_t i = 0; i < frames; ++i) {
          const uint32_t frame = start + i;
          if (fx.dynamics_saturation_enabled) {
            fx_node_output_l[node][frame] = kessho::product::saturation::process(
                input.left[frame], params, creative_saturation_state_l, static_cast<float>(sample_rate));
            fx_node_output_r[node][frame] = kessho::product::saturation::process(
                input.right[frame], params, creative_saturation_state_r, static_cast<float>(sample_rate));
          } else {
            fx_node_output_l[node][frame] = input.left[frame];
            fx_node_output_r[node][frame] = input.right[frame];
          }
        }
        break;
      }
      default: break;
    }

    const uint32_t mute_row = routingMuteRowForGraphNode(node);
    if (mute_row < kProductRoutingMuteRowCount) {
      for (uint32_t i = 0; i < frames; ++i) {
        const uint32_t frame = start + i;
        const float mute_gain = routingMuteGainForFrame(mute_row, transport.sample_frame + i);
        fx_node_output_l[node][frame] *= mute_gain;
        fx_node_output_r[node][frame] *= mute_gain;
      }
    }
    if (!held_freeze) {
      if (fx_node_tail_frames[node] > frames) fx_node_tail_frames[node] -= frames;
      else fx_node_tail_frames[node] = 0u;
    }

    const uint16_t destinations = routing.fx_edge_mask[node];
    for (uint8_t to = 0u; to < kFxNodeCount; ++to) {
      if ((destinations & static_cast<uint16_t>(1u << to)) == 0u) continue;
      const float amount = resolveFxRouteAmount(node, to);
      const float previous_amount = routing.fx_route_effective_amount[node][to];
      routing.fx_route_effective_amount[node][to] = amount;
      telemetry.fx_route_effective_amounts[node * kFxNodeCount + to] = amount;
      if (amount <= 0.0f && previous_amount <= 0.0f) continue;
      const StereoBus destination = inputBus(*this, to);
      for (uint32_t i = 0; i < frames; ++i) {
        const uint32_t frame = start + i;
        const float ramp = static_cast<float>(i + 1u) / static_cast<float>(frames);
        const float smoothed_amount = previous_amount + (amount - previous_amount) * ramp;
        destination.left[frame] += fx_node_output_l[node][frame] * smoothed_amount;
        destination.right[frame] += fx_node_output_r[node][frame] * smoothed_amount;
      }
    }

    const float level = returnGain(*this, node);
    if (level <= 0.0f) continue;
    for (uint32_t i = 0; i < frames; ++i) {
      const uint32_t frame = start + i;
      const float left = fx_node_output_l[node][frame] * level;
      const float right = fx_node_output_r[node][frame] * level;
      out_l[frame] += left;
      out_r[frame] += right;
      if (captureStems()) {
        stem_l[KESSHO_PRODUCT_STEM_FX][frame] += left;
        stem_r[KESSHO_PRODUCT_STEM_FX][frame] += right;
      }
    }
  }
  fx_graph_rendering = false;
}
