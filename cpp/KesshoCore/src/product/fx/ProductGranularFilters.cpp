#include "../KesshoProductEngineInternal.h"

void KesshoProductEngine::configureGranularLowpass(ProductBiquadLowpassState& state, float cutoff_hz) const {
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

float KesshoProductEngine::processGranularLowpass(
    const ProductBiquadLowpassState& filter,
    BiquadState& state,
    float input) const {
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

float KesshoProductEngine::granularCompressorGainDbForLevel(float level_db) const {
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
