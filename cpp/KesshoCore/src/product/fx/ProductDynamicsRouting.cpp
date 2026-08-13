#include "../KesshoProductEngineInternal.h"

uint32_t KesshoProductEngine::normalizedDynamicsBus(float value) const {
  if (!std::isfinite(value)) {
    return kDynamicsBusSkip;
  }
  const int32_t rounded = static_cast<int32_t>(std::lround(value));
  if (rounded <= static_cast<int32_t>(kDynamicsBusSkip)) {
    return kDynamicsBusSkip;
  }
  return clampU32(static_cast<uint32_t>(rounded), kDynamicsBusSkip, kDynamicsBusSidechain);
}

uint32_t KesshoProductEngine::dynamicsBusForSource(uint32_t source_id) const {
  switch (source_id) {
    case KESSHO_PRODUCT_SOURCE_PAD1:
      return routing.dynamics_routes[kDynamicsRoutePad1];
    case KESSHO_PRODUCT_SOURCE_PAD2:
      return routing.dynamics_routes[kDynamicsRoutePad2];
    case KESSHO_PRODUCT_SOURCE_LEAD1:
      return routing.dynamics_routes[kDynamicsRouteLead1];
    case KESSHO_PRODUCT_SOURCE_LEAD2:
      return routing.dynamics_routes[kDynamicsRouteLead2];
    case KESSHO_PRODUCT_SOURCE_SAMPLE1:
    case KESSHO_PRODUCT_SOURCE_SAMPLE2:
      return routing.dynamics_routes[kDynamicsRoutePiano];
    case KESSHO_PRODUCT_SOURCE_DRUM:
      return routing.dynamics_routes[kDynamicsRouteDrum];
    case KESSHO_PRODUCT_SOURCE_SOUNDSCAPE:
      return routing.dynamics_routes[kDynamicsRouteNature];
    default:
      return kDynamicsBusSkip;
  }
}

uint32_t KesshoProductEngine::dynamicsBusForSoundscapeLayer(uint32_t layer) const {
  switch (layer) {
    case kSoundscapeLayerOcean:
      return routing.dynamics_routes[kDynamicsRouteWaves];
    case kSoundscapeLayerWater:
      return routing.dynamics_routes[kDynamicsRouteWater];
    case kSoundscapeLayerInsects:
      return routing.dynamics_routes[kDynamicsRouteInsects];
    case kSoundscapeLayerNature:
      return routing.dynamics_routes[kDynamicsRouteNature];
    default:
      return dynamicsBusForSource(KESSHO_PRODUCT_SOURCE_SOUNDSCAPE);
  }
}

void KesshoProductEngine::routeTerminalSample(
    uint32_t bus,
    float* out_l,
    float* out_r,
    uint32_t frame,
    float left,
    float right) {
  if (std::fabs(left) <= 0.0f && std::fabs(right) <= 0.0f) {
    return;
  }
  switch (bus) {
    case kDynamicsBusEq1:
      dynamics_eq1_bus_l[frame] += left;
      dynamics_eq1_bus_r[frame] += right;
      return;
    case kDynamicsBusEq2:
      dynamics_eq2_bus_l[frame] += left;
      dynamics_eq2_bus_r[frame] += right;
      return;
    case kDynamicsBusSidechain:
      dynamics_sidechain_bus_l[frame] += left;
      dynamics_sidechain_bus_r[frame] += right;
      return;
    case kDynamicsBusSkip:
    default:
      out_l[frame] += left;
      out_r[frame] += right;
      return;
  }
}

void KesshoProductEngine::mixFxBuffer(const float* in_l, const float* in_r, float* out_l, float* out_r,
    uint32_t start, uint32_t frames, float gain, uint32_t sidechain_target) {
  if (gain <= 0.0f) {
    return;
  }
  if (!fx.sidechain_enabled && !graph_taps_enabled) {
    for (uint32_t i = 0; i < frames; ++i) {
      const uint32_t frame = start + i;
      const float left = in_l[i] * gain;
      const float right = in_r[i] * gain;
      out_l[frame] += left;
      out_r[frame] += right;
      if (captureStems()) {
        stem_l[KESSHO_PRODUCT_STEM_FX][frame] += left;
        stem_r[KESSHO_PRODUCT_STEM_FX][frame] += right;
      }
    }
    return;
  }
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    const float input_left = in_l[i] * gain;
    const float input_right = in_r[i] * gain;
    const float duck_gain = sidechainGain(sidechain_target, frame);
    const float wet = clampFloat(fx.sidechain_mix, 0.0f, 1.0f);
    const float blended_gain = 1.0f + (duck_gain - 1.0f) * wet;
    const float left = input_left * blended_gain;
    const float right = input_right * blended_gain;
    if (graph_taps_enabled && sidechain_target < kSidechainTargetCount) {
      graph_sidechain_input_l[sidechain_target][frame] += input_left;
      graph_sidechain_input_r[sidechain_target][frame] += input_right;
      graph_sidechain_output_l[sidechain_target][frame] += left;
      graph_sidechain_output_r[sidechain_target][frame] += right;
    }
    out_l[frame] += left;
    out_r[frame] += right;
    if (captureStems()) {
      stem_l[KESSHO_PRODUCT_STEM_FX][frame] += left;
      stem_r[KESSHO_PRODUCT_STEM_FX][frame] += right;
    }
  }
}

void KesshoProductEngine::renderDegradeSend(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  const bool degrade_output_active =
      fx_graph_rendering ||
      routing.degrade_return_level > 0.0001f ||
      routing.degrade_to_reverb > 0.0001f;
  const bool degrade_fx_active =
      fx.dynamics_enabled &&
      degrade_output_active &&
      ((fx.dynamics_drift_enabled && fx.dynamics_drift_mix > 0.0001f) ||
       (fx.dynamics_erosion_enabled && fx.dynamics_erosion_mix > 0.0001f));
  if (dynamics_degrade_send_module == nullptr || frames == 0u || !degrade_fx_active) {
    return;
  }
  float input_peak = 0.0f;
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    input_peak = std::max(input_peak, std::max(std::abs(degrade_bus_l[frame]), std::abs(degrade_bus_r[frame])));
  }
  if (input_peak <= 1.0e-8f) {
    return;
  }
  std::fill(module_l, module_l + frames, 0.0f);
  std::fill(module_r, module_r + frames, 0.0f);
  dynamics_degrade_send_module->processPlanarStereo(
      degrade_bus_l + start,
      degrade_bus_r + start,
      module_l,
      module_r,
      static_cast<int>(frames));
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    const float mute_gain = routingMuteGainForFrame(kRoutingMuteRowDegrade, transport.sample_frame + i);
    const float left = module_l[i] * routing.degrade_return_level * mute_gain;
    const float right = module_r[i] * routing.degrade_return_level * mute_gain;
    if (fx_graph_rendering) {
      fx_node_output_l[kFxNodeDegrade][frame] = module_l[i] * mute_gain;
      fx_node_output_r[kFxNodeDegrade][frame] = module_r[i] * mute_gain;
      continue;
    }
    if (routing.degrade_to_reverb > 0.0001f) {
      reverb_bus_l[frame] += module_l[i] * routing.degrade_to_reverb * mute_gain;
      reverb_bus_r[frame] += module_r[i] * routing.degrade_to_reverb * mute_gain;
    }
    routeTerminalSample(routing.dynamics_routes[kDynamicsRouteDegrade], out_l, out_r, frame, left, right);
    if (captureStems()) {
      stem_l[KESSHO_PRODUCT_STEM_FX][frame] += left;
      stem_r[KESSHO_PRODUCT_STEM_FX][frame] += right;
    }
  }
}
