#include "../KesshoProductEngineInternal.h"

  void KesshoProductEngine::renderDelayModule(
      kessho::core::IKesshoModule* module,
      float* input_l,
      float* input_r,
      float* cross_l,
      float* cross_r,
      float* out_l,
      float* out_r,
      uint32_t start,
      uint32_t frames) {
  const bool is_delay_a = module == delay_a_module.get();
  float* graph_input_l = is_delay_a ? graph_delay_a_input_l : graph_delay_b_input_l;
  float* graph_input_r = is_delay_a ? graph_delay_a_input_r : graph_delay_b_input_r;
  float* graph_output_l = is_delay_a ? graph_delay_a_output_l : graph_delay_b_output_l;
  float* graph_output_r = is_delay_a ? graph_delay_a_output_r : graph_delay_b_output_r;
  float* graph_reverb_l = is_delay_a ? graph_delay_a_reverb_send_l : graph_delay_b_reverb_send_l;
  float* graph_reverb_r = is_delay_a ? graph_delay_a_reverb_send_r : graph_delay_b_reverb_send_r;
  float* graph_cross_l = is_delay_a ? graph_delay_a_to_delay_b_send_l : graph_delay_b_to_delay_a_send_l;
  float* graph_cross_r = is_delay_a ? graph_delay_a_to_delay_b_send_r : graph_delay_b_to_delay_a_send_r;
  float* graph_granular_l = is_delay_a ? graph_delay_a_to_granular_send_l : graph_delay_b_to_granular_send_l;
  float* graph_granular_r = is_delay_a ? graph_delay_a_to_granular_send_r : graph_delay_b_to_granular_send_r;
  if (graph_taps_enabled) {
    for (uint32_t i = 0; i < frames; ++i) {
      const uint32_t frame = start + i;
      graph_input_l[frame] = input_l[frame];
      graph_input_r[frame] = input_r[frame];
    }
  }
  if (module == nullptr || frames == 0u) {
    return;
  }
  float* tap_l[kModuleTapCount]{};
  float* tap_r[kModuleTapCount]{};
  const uint32_t tap_count = is_delay_a
      ? KESSHO_MODULE_DELAY_A_OUTPUT_TAP_COUNT
      : KESSHO_MODULE_DELAY_B_OUTPUT_TAP_COUNT;
  for (uint32_t bus = 0; bus < tap_count; ++bus) {
    tap_l[bus] = module_tap_l[bus];
    tap_r[bus] = module_tap_r[bus];
    std::fill(module_tap_l[bus], module_tap_l[bus] + frames, 0.0f);
    std::fill(module_tap_r[bus], module_tap_r[bus] + frames, 0.0f);
  }
  module->processPlanarStereoTaps(input_l + start, input_r + start, tap_l, tap_r, tap_count, static_cast<int>(frames));
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    const float mute_gain = routingMuteGainForFrame(
        is_delay_a ? kRoutingMuteRowDelayA : kRoutingMuteRowDelayB,
        transport.sample_frame + i);
    const float output_l_sample = module_tap_l[KESSHO_MODULE_DELAY_A_TAP_MAIN][i] * mute_gain;
    const float output_r_sample = module_tap_r[KESSHO_MODULE_DELAY_A_TAP_MAIN][i] * mute_gain;
    const float reverb_l_sample = module_tap_l[KESSHO_MODULE_DELAY_A_TAP_REVERB_SEND][i] * mute_gain;
    const float reverb_r_sample = module_tap_r[KESSHO_MODULE_DELAY_A_TAP_REVERB_SEND][i] * mute_gain;
    const float cross_l_sample = module_tap_l[KESSHO_MODULE_DELAY_A_TAP_DELAY_B_SEND][i] * mute_gain;
    const float cross_r_sample = module_tap_r[KESSHO_MODULE_DELAY_A_TAP_DELAY_B_SEND][i] * mute_gain;
    const float granular_l_sample = module_tap_l[KESSHO_MODULE_DELAY_A_TAP_GRANULAR_SEND][i] * mute_gain;
    const float granular_r_sample = module_tap_r[KESSHO_MODULE_DELAY_A_TAP_GRANULAR_SEND][i] * mute_gain;
    const float drift_l_sample = module_tap_l[KESSHO_MODULE_DELAY_A_TAP_DRIFT_SEND][i] * mute_gain;
    const float drift_r_sample = module_tap_r[KESSHO_MODULE_DELAY_A_TAP_DRIFT_SEND][i] * mute_gain;
    if (graph_taps_enabled) {
      graph_output_l[frame] = output_l_sample;
      graph_output_r[frame] = output_r_sample;
      graph_reverb_l[frame] = reverb_l_sample;
      graph_reverb_r[frame] = reverb_r_sample;
      graph_cross_l[frame] = cross_l_sample;
      graph_cross_r[frame] = cross_r_sample;
      graph_granular_l[frame] = granular_l_sample;
      graph_granular_r[frame] = granular_r_sample;
    }
    routeTerminalSample(
        routing.dynamics_routes[is_delay_a ? kDynamicsRouteDelayA : kDynamicsRouteDelayB],
        out_l,
        out_r,
        frame,
        output_l_sample,
        output_r_sample);
    if (captureStems()) {
      stem_l[KESSHO_PRODUCT_STEM_FX][frame] += output_l_sample;
      stem_r[KESSHO_PRODUCT_STEM_FX][frame] += output_r_sample;
    }
    reverb_bus_l[frame] += reverb_l_sample;
    reverb_bus_r[frame] += reverb_r_sample;
    cross_l[frame] += cross_l_sample;
    cross_r[frame] += cross_r_sample;
    if (!is_delay_a) {
      delay_a_cross_carry_l[i] = cross_l_sample;
      delay_a_cross_carry_r[i] = cross_r_sample;
    }
    granular_bus_l[frame] += granular_l_sample;
    granular_bus_r[frame] += granular_r_sample;
    degrade_bus_l[frame] += drift_l_sample;
    degrade_bus_r[frame] += drift_r_sample;
  }
}
