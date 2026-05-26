#include "../KesshoProductEngineInternal.h"

namespace {

constexpr float kGranularReverbCompressorMakeupGain = 3.037f;
constexpr float kGranularReverbCompressorLowerGain = 0.04466836f; // -27 dB

} // namespace

void KesshoProductEngine::resetGranularPhraseRuntime() {
  granular_last_phrase_index = 0u;
  granular_phrase_runtime_initialized = false;
}

void KesshoProductEngine::advanceGranularPhraseReseed() {
  if (granular_module == nullptr || !transport.running || sample_rate <= 0.0) {
    return;
  }
  const uint64_t phrase = transport.phraseIndex(sample_rate);
  if (!granular_phrase_runtime_initialized) {
    granular_phrase_runtime_initialized = true;
    granular_last_phrase_index = phrase;
    return;
  }
  if (phrase == granular_last_phrase_index) {
    return;
  }
  granular_last_phrase_index = phrase;
  granular_module->setRandomSeed(rng_state);
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
      fx.granular_mix > 0.0001f ||
      routing.granular_to_reverb > 0.0001f ||
      routing.granular_to_delay_a > 0.0001f ||
      routing.granular_to_delay_b > 0.0001f;
  bool input_armed =
      routing.delay_a_to_granular > 0.0001f ||
      routing.delay_b_to_granular > 0.0001f;
  if (!input_armed) {
    for (uint32_t source_index = 0; source_index < kSourceCount; ++source_index) {
      const SourceState& source = sources[source_index];
      if (sourceRenderActive(source) && source.granular_send > 0.0001f) {
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
  std::fill(output_lpf_l, output_lpf_l + frames, 0.0f);
  std::fill(output_lpf_r, output_lpf_r + frames, 0.0f);
  std::fill(reverb_branch_l, reverb_branch_l + frames, 0.0f);
  std::fill(reverb_branch_r, reverb_branch_r + frames, 0.0f);
  configureGranularLowpass(granular_output_lpf, fx.granular_output_lpf_hz);
  configureGranularLowpass(granular_reverb_lpf, fx.granular_reverb_lpf_hz);
  const float attack_coeff = std::exp(-1.0f / std::max(1.0f, 0.003f * static_cast<float>(sample_rate)));
  const float release_coeff = std::exp(-1.0f / std::max(1.0f, 0.25f * static_cast<float>(sample_rate)));
  for (uint32_t i = 0; i < frames; ++i) {
    output_lpf_l[i] = processGranularLowpass(granular_output_lpf, granular_output_lpf.left, module_l[i]);
    output_lpf_r[i] = processGranularLowpass(granular_output_lpf, granular_output_lpf.right, module_r[i]);

    const float reverb_filtered_l = processGranularLowpass(granular_reverb_lpf, granular_reverb_lpf.left, module_l[i]);
    const float reverb_filtered_r = processGranularLowpass(granular_reverb_lpf, granular_reverb_lpf.right, module_r[i]);
    const float detector = std::max(std::max(std::abs(reverb_filtered_l), std::abs(reverb_filtered_r)), 1.0e-9f);
    const float target_gain = detector <= kGranularReverbCompressorLowerGain
        ? 1.0f
        : std::pow(10.0f, granularCompressorGainDbForLevel(20.0f * std::log10(detector)) / 20.0f);
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
    reverb_bus_l[frame] += reverb_l;
    reverb_bus_r[frame] += reverb_r;
    delay_a_bus_l[frame] += delay_a_l;
    delay_a_bus_r[frame] += delay_a_r;
    delay_b_bus_l[frame] += delay_b_l;
    delay_b_bus_r[frame] += delay_b_r;
  }
}
