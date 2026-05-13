#include "../KesshoProductEngineInternal.h"

  float KesshoProductEngine::reverbPreCompressorGainDbForLevel(float level_db) const {
  const float threshold = clampFloat(fx.reverb_pre_comp_threshold, -60.0f, 0.0f);
  const float knee = clampFloat(fx.reverb_pre_comp_knee, 0.0f, 40.0f);
  const float ratio = clampFloat(fx.reverb_pre_comp_ratio, 1.0f, 20.0f);
  if (ratio <= 1.0f) {
    return 0.0f;
  }
  constexpr float strength = 0.04f;
  if (knee <= 0.0f) {
    if (level_db <= threshold) {
      return 0.0f;
    }
    return ((threshold + (level_db - threshold) / ratio) - level_db) * strength;
  }

  const float lower = threshold - knee * 0.5f;
  const float upper = threshold + knee * 0.5f;
  if (level_db <= lower) {
    return 0.0f;
  }
  if (level_db >= upper) {
    return ((threshold + (level_db - threshold) / ratio) - level_db) * strength;
  }

  const float x = level_db - lower;
  return ((1.0f / ratio) - 1.0f) * x * x / (2.0f * knee) * strength;
}

  float KesshoProductEngine::reverbPreconditionerSoftLimit(float value) const {
  constexpr float limit = 1.047f;
  const float abs_value = std::abs(value);
  if (abs_value <= limit) {
    return value;
  }
  return std::copysign(limit + std::tanh((abs_value - limit) * 6.0f) * 0.005f, value);
}

  void KesshoProductEngine::processReverbPreconditioner(uint32_t start, uint32_t frames) {
  if (frames == 0u || sample_rate <= 0.0) {
    return;
  }
  const float attack_ms = clampFloat(fx.reverb_pre_comp_attack_ms, 0.1f, 30.0f);
  const float release_ms = clampFloat(fx.reverb_pre_comp_release_ms, 20.0f, 1000.0f);
  const float attack_coeff = std::exp(-1.0f / std::max(1.0f, attack_ms * 0.001f * static_cast<float>(sample_rate)));
  const float release_coeff = std::exp(-1.0f / std::max(1.0f, release_ms * 0.001f * static_cast<float>(sample_rate)));
  const float ratio = clampFloat(fx.reverb_pre_comp_ratio, 1.0f, 20.0f);
  const float ratio_depth = clampFloat((ratio - 1.0f) / 4.0f, 0.0f, 1.0f);
  const float native_auto_makeup = 1.0f + ratio_depth * 0.18f;
  const float input_makeup = clampFloat(fx.reverb_pre_comp_makeup, 0.5f, 4.0f);

  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    const float left = reverb_bus_l[frame];
    const float right = reverb_bus_r[frame];
    const float detector = std::max(std::max(std::abs(left), std::abs(right)), 1.0e-9f);
    const float level_db = 20.0f * std::log10(detector);
    const float target_gain = std::pow(10.0f, reverbPreCompressorGainDbForLevel(level_db) / 20.0f);
    const float coeff = target_gain < reverb_pre_comp_gain ? attack_coeff : release_coeff;
    reverb_pre_comp_gain = target_gain + (reverb_pre_comp_gain - target_gain) * coeff;
    const float gain = reverb_pre_comp_gain * native_auto_makeup * input_makeup;
    reverb_bus_l[frame] = reverbPreconditionerSoftLimit(left * gain);
    reverb_bus_r[frame] = reverbPreconditionerSoftLimit(right * gain);
  }
}

  void KesshoProductEngine::renderReverb(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  if (reverb_module == nullptr || frames == 0u || fx.reverb_mix <= 0.0f) {
    return;
  }
  std::fill(module_l, module_l + frames, 0.0f);
  std::fill(module_r, module_r + frames, 0.0f);
  processReverbPreconditioner(start, frames);
  reverb_module->processPlanarStereo(reverb_bus_l + start, reverb_bus_r + start, module_l, module_r, static_cast<int>(frames));
  mixFxBuffer(
      module_l,
      module_r,
      out_l,
      out_r,
      start,
      frames,
      fx.reverb_mix * kessho::product::generated::KESSHO_PRODUCT_GENERATED_REVERB_OUTPUT_TRIM,
      kSidechainReverb);
}
