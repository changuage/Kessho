#pragma once

#include <cmath>
#include <cstdint>

namespace kessho::product::saturation {

struct Params {
  uint32_t mode = 0u;
  uint32_t quality = 1u;
  float drive = 0.0f;
  float tone = 0.5f;
  float bias = 0.5f;
};

struct State {
  float previous = 0.0f;
  float oversampled_lp = 0.0f;
  float cached_drive = -1.0f;
  float cached_sample_rate = 0.0f;
  float cached_alpha = 0.0f;
  uint32_t cached_quality = 0xffffffffu;
  uint32_t cached_factor = 1u;
};

inline float clampFinite(float value, float lo, float hi) {
  if (!std::isfinite(value)) return lo;
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

inline float unit(float value) {
  return clampFinite(value, 0.0f, 1.0f);
}

inline float applyToneTilt(float value, float tone, float amount) {
  const float tilt = (unit(tone) - 0.5f) * amount;
  const float positive = tilt > 0.0f ? tilt : 0.0f;
  const float negative = tilt < 0.0f ? -tilt : 0.0f;
  return value * (1.0f + positive * 0.22f - negative * 0.16f);
}

inline float saturationCurve(float value, uint32_t mode, float drive, float bias) {
  const float asym = (unit(bias) - 0.5f) * 0.8f;
  const float biased = value + asym * (0.24f + drive * 0.22f);
  float result = biased;
  switch (mode) {
    case 1u: {
      const float soft = std::tanh(biased);
      const float harmonic = std::sin(biased * 3.14159265358979323846f * (0.32f + drive * 0.12f));
      result = soft * (0.86f - drive * 0.08f) + harmonic * (0.08f + drive * 0.08f);
      break;
    }
    case 2u: {
      const float even = biased + biased * biased * asym * (0.24f + drive * 0.18f);
      result = std::tanh(even * (0.92f + drive * 0.16f));
      break;
    }
    case 3u: {
      const float positive = std::tanh(biased * (1.0f + drive * 0.2f));
      const float negative = -std::tanh(-biased * (0.72f - asym * 0.12f));
      result = biased >= 0.0f ? positive : negative;
      break;
    }
    case 4u: {
      const float folded = std::sin(biased * 3.14159265358979323846f * (0.64f + drive * 0.28f));
      result = std::tanh(biased) * (0.74f - drive * 0.08f) + folded * (0.18f + drive * 0.14f);
      break;
    }
    default:
      result = std::tanh(biased);
      break;
  }
  result -= asym * (0.16f + drive * 0.08f);
  return clampFinite(result, -1.25f, 1.25f);
}

inline float processCore(float value, const Params& params) {
  const float drive = unit(params.drive);
  if (drive <= 0.0001f) return value;
  const float shaped_drive = std::pow(drive, 1.15f);
  const float pre_gain = 1.0f + shaped_drive * shaped_drive * 6.0f + shaped_drive * 1.2f;
  const float pre_tone = applyToneTilt(value, params.tone, shaped_drive);
  const float shaped = saturationCurve(pre_tone * pre_gain, params.mode, shaped_drive, params.bias);
  const float auto_gain = 1.0f / (1.0f + shaped_drive * (1.12f + params.mode * 0.08f));
  return applyToneTilt(shaped * auto_gain, params.tone, shaped_drive * 0.85f);
}

inline uint32_t oversamplingFactor(const Params& params) {
  const float drive = unit(params.drive);
  const bool hq = params.quality >= 2u;
  return drive > 0.66f ? 4u : drive > (hq ? 0.12f : 0.18f) ? 2u : 1u;
}

inline uint32_t prepare(State& state, const Params& params, float sample_rate) {
  const float drive = unit(params.drive);
  const float safe_sample_rate = sample_rate > 1000.0f ? sample_rate : 44100.0f;
  if (state.cached_drive == drive && state.cached_quality == params.quality &&
      state.cached_sample_rate == safe_sample_rate) {
    return state.cached_factor;
  }
  state.cached_drive = drive;
  state.cached_quality = params.quality;
  state.cached_sample_rate = safe_sample_rate;
  state.cached_factor = oversamplingFactor(params);
  if (state.cached_factor > 1u && params.quality >= 1u) {
    state.cached_alpha = 1.0f - std::exp(
        -2.0f * 3.14159265358979323846f *
        (safe_sample_rate * 0.42f / static_cast<float>(state.cached_factor)) /
        (safe_sample_rate * static_cast<float>(state.cached_factor)));
  } else {
    state.cached_alpha = 0.0f;
  }
  return state.cached_factor;
}

inline float process(float value, const Params& params, State& state, float sample_rate) {
  const float drive = unit(params.drive);
  if (drive <= 0.0001f) return value;
  const uint32_t factor = prepare(state, params, sample_rate);
  if (factor == 1u) {
    const float result = processCore(value, params);
    state.previous = value;
    return result;
  }

  const bool smooth_aa = state.cached_alpha > 0.0f;
  float sum = 0.0f;
  for (uint32_t step = 1u; step <= factor; ++step) {
    const float fraction = static_cast<float>(step) / static_cast<float>(factor);
    const float oversampled = state.previous + (value - state.previous) * fraction;
    const float shaped = processCore(oversampled, params);
    if (smooth_aa) {
      state.oversampled_lp += (shaped - state.oversampled_lp) * state.cached_alpha;
      sum += state.oversampled_lp;
    } else {
      sum += shaped;
    }
  }
  state.previous = value;
  return sum / static_cast<float>(factor);
}

} // namespace kessho::product::saturation
