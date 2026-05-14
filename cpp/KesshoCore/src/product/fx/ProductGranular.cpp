#include "../KesshoProductEngineInternal.h"

namespace {

void configureLowpass(
    kessho::product::internal::ProductBiquadLowpassState& state,
    float cutoff_hz,
    double sample_rate) {
  if (sample_rate <= 0.0) {
    return;
  }
  const float nyquist_limit = static_cast<float>(sample_rate * 0.499);
  const float cutoff = clampFloat(cutoff_hz, 20.0f, std::max(20.0f, nyquist_limit));
  if (std::abs(state.coeff_cutoff - cutoff) <= 0.0001f) {
    return;
  }

  constexpr float kWebAudioLowPassQ07 = 1.0839269140212036f; // pow(10, 0.7 / 20)
  const float omega = static_cast<float>((kTwoPi * static_cast<double>(cutoff)) / sample_rate);
  const float sin_omega = std::sin(omega);
  const float cos_omega = std::cos(omega);
  const float alpha = sin_omega / (2.0f * kWebAudioLowPassQ07);
  const float a0 = 1.0f + alpha;
  state.b0 = ((1.0f - cos_omega) * 0.5f) / a0;
  state.b1 = (1.0f - cos_omega) / a0;
  state.b2 = ((1.0f - cos_omega) * 0.5f) / a0;
  state.a1 = (-2.0f * cos_omega) / a0;
  state.a2 = (1.0f - alpha) / a0;
  state.coeff_cutoff = cutoff;
}

float processLowpass(
    const kessho::product::internal::ProductBiquadLowpassState& filter,
    kessho::product::internal::BiquadState& state,
    float input) {
  const float y =
      filter.b0 * input +
      filter.b1 * state.x1 +
      filter.b2 * state.x2 -
      filter.a1 * state.y1 -
      filter.a2 * state.y2;
  state.x2 = state.x1;
  state.x1 = input;
  state.y2 = state.y1;
  state.y1 = std::isfinite(y) ? y : 0.0f;
  return state.y1;
}

float granularCompressorGainDbForLevel(float level_db) {
  constexpr float threshold = -24.0f;
  constexpr float knee = 6.0f;
  constexpr float ratio = 4.0f;
  const float lower = threshold - knee * 0.5f;
  const float upper = threshold + knee * 0.5f;
  if (level_db <= lower) {
    return 0.0f;
  }
  if (level_db >= upper) {
    return (threshold + (level_db - threshold) / ratio) - level_db;
  }
  const float x = level_db - lower;
  return ((1.0f / ratio) - 1.0f) * x * x / (2.0f * knee);
}

constexpr float kGranularReverbCompressorMakeupGain = 3.037f;

} // namespace

  void KesshoProductEngine::renderGranular(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    graph_granular_input_l[frame] = granular_bus_l[frame];
    graph_granular_input_r[frame] = granular_bus_r[frame];
  }
  const bool active =
      fx.granular_enabled &&
      (fx.granular_mix > 0.0001f ||
       routing.granular_to_reverb > 0.0001f ||
       routing.granular_to_delay_a > 0.0001f ||
       routing.granular_to_delay_b > 0.0001f);
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
  std::fill(output_lpf_l, output_lpf_l + frames, 0.0f);
  std::fill(output_lpf_r, output_lpf_r + frames, 0.0f);
  std::fill(reverb_branch_l, reverb_branch_l + frames, 0.0f);
  std::fill(reverb_branch_r, reverb_branch_r + frames, 0.0f);
  configureLowpass(granular_output_lpf, fx.granular_output_lpf_hz, sample_rate);
  configureLowpass(granular_reverb_lpf, fx.granular_reverb_lpf_hz, sample_rate);
  const float attack_coeff = std::exp(-1.0f / std::max(1.0f, 0.003f * static_cast<float>(sample_rate)));
  const float release_coeff = std::exp(-1.0f / std::max(1.0f, 0.25f * static_cast<float>(sample_rate)));
  for (uint32_t i = 0; i < frames; ++i) {
    output_lpf_l[i] = processLowpass(granular_output_lpf, granular_output_lpf.left, module_l[i]);
    output_lpf_r[i] = processLowpass(granular_output_lpf, granular_output_lpf.right, module_r[i]);

    const float reverb_filtered_l = processLowpass(granular_reverb_lpf, granular_reverb_lpf.left, module_l[i]);
    const float reverb_filtered_r = processLowpass(granular_reverb_lpf, granular_reverb_lpf.right, module_r[i]);
    const float detector = std::max(std::max(std::abs(reverb_filtered_l), std::abs(reverb_filtered_r)), 1.0e-9f);
    const float target_gain = std::pow(10.0f, granularCompressorGainDbForLevel(20.0f * std::log10(detector)) / 20.0f);
    const float coeff = target_gain < granular_reverb_comp_gain ? attack_coeff : release_coeff;
    granular_reverb_comp_gain = target_gain + (granular_reverb_comp_gain - target_gain) * coeff;
    reverb_branch_l[i] = reverb_filtered_l * granular_reverb_comp_gain * kGranularReverbCompressorMakeupGain;
    reverb_branch_r[i] = reverb_filtered_r * granular_reverb_comp_gain * kGranularReverbCompressorMakeupGain;
  }
  mixFxBuffer(output_lpf_l, output_lpf_r, out_l, out_r, start, frames, fx.granular_mix, kSidechainGranular);
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    const float direct_l = output_lpf_l[i] * fx.granular_mix;
    const float direct_r = output_lpf_r[i] * fx.granular_mix;
    const float reverb_l = reverb_branch_l[i] * routing.granular_to_reverb;
    const float reverb_r = reverb_branch_r[i] * routing.granular_to_reverb;
    const float delay_a_l = output_lpf_l[i] * routing.granular_to_delay_a;
    const float delay_a_r = output_lpf_r[i] * routing.granular_to_delay_a;
    const float delay_b_l = output_lpf_l[i] * routing.granular_to_delay_b;
    const float delay_b_r = output_lpf_r[i] * routing.granular_to_delay_b;
    graph_granular_output_l[frame] = direct_l;
    graph_granular_output_r[frame] = direct_r;
    graph_granular_reverb_send_l[frame] = reverb_l;
    graph_granular_reverb_send_r[frame] = reverb_r;
    graph_granular_to_delay_a_send_l[frame] = delay_a_l;
    graph_granular_to_delay_a_send_r[frame] = delay_a_r;
    graph_granular_to_delay_b_send_l[frame] = delay_b_l;
    graph_granular_to_delay_b_send_r[frame] = delay_b_r;
    reverb_bus_l[frame] += reverb_l;
    reverb_bus_r[frame] += reverb_r;
    delay_a_bus_l[frame] += delay_a_l;
    delay_a_bus_r[frame] += delay_a_r;
    delay_b_bus_l[frame] += delay_b_l;
    delay_b_bus_r[frame] += delay_b_r;
  }
}
