#include "../KesshoProductEngineInternal.h"
#include <cmath>

constexpr float kGranularReverbCompressorMakeupGain = 3.037f;
constexpr float kGranularReverbCompressorLowerGain = 0.04466836f; // -27 dB
constexpr float kGranularRouteEpsilon = 0.0001f;

float KesshoProductEngine::granularCompressorGainDbForLevel(float level_db) const {
  constexpr float threshold = -24.0f;
  constexpr float knee = 6.0f;
  constexpr float ratio = 4.0f;
  const float lower = threshold - knee * 0.5f;
  const float upper = threshold + knee * 0.5f;
  if (level_db <= lower) return 0.0f;
  if (level_db >= upper) return (threshold + (level_db - threshold) / ratio) - level_db;
  const float x = level_db - lower;
  return ((1.0f / ratio) - 1.0f) * x * x / (2.0f * knee);
}

void KesshoProductEngine::updateGranularReverbCompressorCoeffs() {
  if (sample_rate == granular_reverb_comp_coeff_sample_rate) return;
  granular_reverb_comp_coeff_sample_rate = sample_rate;
  if (sample_rate <= 0.0) {
    granular_reverb_comp_attack_coeff = 0.0f;
    granular_reverb_comp_release_coeff = 0.0f;
    return;
  }
  granular_reverb_comp_attack_coeff = std::exp(
      -1.0f / std::max(1.0f, 0.003f * static_cast<float>(sample_rate)));
  granular_reverb_comp_release_coeff = std::exp(
      -1.0f / std::max(1.0f, 0.25f * static_cast<float>(sample_rate)));
}

void KesshoProductEngine::renderGranular(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  if (graph_taps_enabled) {
    for (uint32_t i = 0; i < frames; ++i) {
      const uint32_t frame = start + i;
      graph_granular_input_l[frame] = granular_bus_l[frame];
      graph_granular_input_r[frame] = granular_bus_r[frame];
    }
  }
  const bool output_armed =
      fx.granular_mix > kGranularRouteEpsilon ||
      routing.granular_to_reverb > kGranularRouteEpsilon ||
      routing.granular_to_delay_a > kGranularRouteEpsilon ||
      routing.granular_to_delay_b > kGranularRouteEpsilon ||
      routing.granular_to_degrade > kGranularRouteEpsilon;
  bool input_armed =
      routing.delay_a_to_granular > kGranularRouteEpsilon ||
      routing.delay_b_to_granular > kGranularRouteEpsilon;
  if (!input_armed) {
    for (uint32_t source_index = 0; source_index < kSourceCount; ++source_index) {
      const SourceState& source = sources[source_index];
      if (sourceRenderActive(source) && source.granular_send > kGranularRouteEpsilon) {
        input_armed = true;
        break;
      }
    }
  }
  const bool active = fx.granular_enabled && (input_armed || output_armed);
  if (granular_module == nullptr || frames == 0u || !active) {
    return;
  }
  std::fill(module_l, module_l + frames, 0.0f);
  std::fill(module_r, module_r + frames, 0.0f);
  granular_module->processPlanarStereo(granular_bus_l + start, granular_bus_r + start, module_l, module_r, static_cast<int>(frames));
  float* output_lpf_l = module_tap_l[0];
  float* output_lpf_r = module_tap_r[0];
  float* reverb_branch_l = module_tap_l[1];
  float* reverb_branch_r = module_tap_r[1];
  const bool direct_armed =
      fx.granular_mix > kGranularRouteEpsilon ||
      granular_mix_gain > kGranularRouteEpsilon;
  const bool reverb_armed =
      routing.granular_to_reverb > kGranularRouteEpsilon ||
      granular_reverb_send_gain > kGranularRouteEpsilon;
  const bool delay_a_armed =
      routing.granular_to_delay_a > kGranularRouteEpsilon ||
      granular_delay_a_send_gain > kGranularRouteEpsilon;
  const bool delay_b_armed =
      routing.granular_to_delay_b > kGranularRouteEpsilon ||
      granular_delay_b_send_gain > kGranularRouteEpsilon;
  const bool drift_armed =
      routing.granular_to_degrade > kGranularRouteEpsilon ||
      granular_degrade_send_gain > kGranularRouteEpsilon;
  const bool output_filter_armed = direct_armed || delay_a_armed || delay_b_armed || drift_armed;
  if (output_filter_armed) {
    std::fill(output_lpf_l, output_lpf_l + frames, 0.0f);
    std::fill(output_lpf_r, output_lpf_r + frames, 0.0f);
    updateProductBiquadCoefficients(granular_output_lpf, fx.granular_output_lpf_hz, kProductBiquadLowpass);
  }
  if (reverb_armed) {
    std::fill(reverb_branch_l, reverb_branch_l + frames, 0.0f);
    std::fill(reverb_branch_r, reverb_branch_r + frames, 0.0f);
    updateProductBiquadCoefficients(granular_reverb_lpf, fx.granular_reverb_lpf_hz, kProductBiquadLowpass);
  }
  updateGranularReverbCompressorCoeffs();
  if (output_filter_armed || reverb_armed) {
    for (uint32_t i = 0; i < frames; ++i) {
      if (output_filter_armed) {
        output_lpf_l[i] = processProductBiquadSample(granular_output_lpf, granular_output_lpf.left, module_l[i]);
        output_lpf_r[i] = processProductBiquadSample(granular_output_lpf, granular_output_lpf.right, module_r[i]);
      }

      if (reverb_armed) {
        const float reverb_filtered_l = processProductBiquadSample(granular_reverb_lpf, granular_reverb_lpf.left, module_l[i]);
        const float reverb_filtered_r = processProductBiquadSample(granular_reverb_lpf, granular_reverb_lpf.right, module_r[i]);
        const float detector = std::max(std::max(std::abs(reverb_filtered_l), std::abs(reverb_filtered_r)), 1.0e-9f);
        const float target_gain = detector <= kGranularReverbCompressorLowerGain
            ? 1.0f
            : std::pow(10.0f, granularCompressorGainDbForLevel(20.0f * std::log10(detector)) / 20.0f);
        const float coeff = target_gain < granular_reverb_comp_gain
            ? granular_reverb_comp_attack_coeff
            : granular_reverb_comp_release_coeff;
        granular_reverb_comp_gain = target_gain + (granular_reverb_comp_gain - target_gain) * coeff;
        reverb_branch_l[i] = reverb_filtered_l * granular_reverb_comp_gain * kGranularReverbCompressorMakeupGain;
        reverb_branch_r[i] = reverb_filtered_r * granular_reverb_comp_gain * kGranularReverbCompressorMakeupGain;
      }
    }
  }
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    advanceGranularReturnGains(transport.sample_frame + i);
    const float mute_gain = routingMuteGainForFrame(kRoutingMuteRowGranular, transport.sample_frame + i);
    const float direct_l = direct_armed ? output_lpf_l[i] * granular_mix_gain * mute_gain : 0.0f;
    const float direct_r = direct_armed ? output_lpf_r[i] * granular_mix_gain * mute_gain : 0.0f;
    const float reverb_l = reverb_armed ? reverb_branch_l[i] * granular_reverb_send_gain * mute_gain : 0.0f;
    const float reverb_r = reverb_armed ? reverb_branch_r[i] * granular_reverb_send_gain * mute_gain : 0.0f;
    const float delay_a_l = delay_a_armed ? output_lpf_l[i] * granular_delay_a_send_gain * mute_gain : 0.0f;
    const float delay_a_r = delay_a_armed ? output_lpf_r[i] * granular_delay_a_send_gain * mute_gain : 0.0f;
    const float delay_b_l = delay_b_armed ? output_lpf_l[i] * granular_delay_b_send_gain * mute_gain : 0.0f;
    const float delay_b_r = delay_b_armed ? output_lpf_r[i] * granular_delay_b_send_gain * mute_gain : 0.0f;
    const float drift_l = drift_armed ? output_lpf_l[i] * granular_degrade_send_gain * mute_gain : 0.0f;
    const float drift_r = drift_armed ? output_lpf_r[i] * granular_degrade_send_gain * mute_gain : 0.0f;
    if (graph_taps_enabled) {
      graph_granular_output_l[frame] = direct_l;
      graph_granular_output_r[frame] = direct_r;
      graph_granular_reverb_send_l[frame] = reverb_l;
      graph_granular_reverb_send_r[frame] = reverb_r;
      graph_granular_to_delay_a_send_l[frame] = delay_a_l;
      graph_granular_to_delay_a_send_r[frame] = delay_a_r;
      graph_granular_to_delay_b_send_l[frame] = delay_b_l;
      graph_granular_to_delay_b_send_r[frame] = delay_b_r;
    }
    routeTerminalSample(routing.dynamics_routes[kDynamicsRouteGranular], out_l, out_r, frame, direct_l, direct_r);
    if (captureStems()) {
      stem_l[KESSHO_PRODUCT_STEM_FX][frame] += direct_l;
      stem_r[KESSHO_PRODUCT_STEM_FX][frame] += direct_r;
    }
    reverb_bus_l[frame] += reverb_l;
    reverb_bus_r[frame] += reverb_r;
    delay_a_bus_l[frame] += delay_a_l;
    delay_a_bus_r[frame] += delay_a_r;
    delay_b_bus_l[frame] += delay_b_l;
    delay_b_bus_r[frame] += delay_b_r;
    degrade_bus_l[frame] += drift_l;
    degrade_bus_r[frame] += drift_r;
  }
}
