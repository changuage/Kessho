#include "KesshoModule.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <memory>
#include <vector>

namespace kessho::core {
namespace {

constexpr int kParamCount = 24;
constexpr int kParamEnabled = 0;
constexpr int kParamActivity = 1;
constexpr int kParamRepeats = 2;
constexpr int kParamBaseTimeMs = 3;
constexpr int kParamTone = 4;
constexpr int kParamVibrato = 5;
constexpr int kParamMix = 6;
constexpr int kParamReverbSend = 7;
constexpr int kParamGranularSend = 8;
constexpr int kParamToDelayA = 9;
constexpr int kParamSpaceMode = 10;
constexpr int kParamPattern = 11;
constexpr int kParamWarp = 12;
constexpr int kParamWarpIntensity = 13;
constexpr int kParamSpread = 14;
constexpr int kParamTapeHeadMask = 15;
constexpr int kParamTapeHeadLevelBase = 16;
constexpr int kParamTapeHeadPanBase = 20;

constexpr int kTapCount = 8;
constexpr int kTapeHeadCount = 4;
constexpr int kOutputTapCount = 4;
constexpr float kPi = 3.14159265358979323846f;
constexpr float kWebAudioCompressorLookaheadSeconds = 0.006f;
constexpr float kWebAudioCompressorMakeupGain = 1.477f;
constexpr std::array<float, kTapCount> kDiffuseTapFactors{
    0.78f, 1.07f, 1.41f, 1.86f, 2.34f, 2.93f, 3.58f, 4.26f};
constexpr std::array<float, kTapCount> kDiffuseTapWeights{
    1.0f, 0.86f, 0.76f, 0.64f, 0.55f, 0.47f, 0.39f, 0.32f};
constexpr std::array<float, kTapCount> kTapPans{
    -0.7f, 0.7f, -0.5f, 0.5f, -0.8f, 0.8f, -0.3f, 0.3f};
constexpr std::array<float, kTapCount> kTapVibratoRates{
    0.7f, 1.1f, 0.9f, 1.3f, 0.8f, 1.2f, 1.0f, 0.6f};
constexpr std::array<float, kTapCount> kWarpFilterFreqs{
    200.0f, 380.0f, 720.0f, 1360.0f, 2580.0f, 3800.0f, 4900.0f, 6000.0f};
constexpr std::array<float, kTapCount> kWarpPitchTiltFreqs{
    1200.0f, 1500.0f, 1800.0f, 2200.0f, 2800.0f, 3600.0f, 4800.0f, 6400.0f};
constexpr std::array<float, kTapCount> kWarpPitchTiltGains{
    0.0f, 0.0f, 0.0f, 0.0f, 3.5f, 3.5f, 8.0f, 8.0f};
constexpr std::array<float, kTapCount> kWarpGrainCenterFreqs{
    650.0f, 900.0f, 1200.0f, 1600.0f, 2100.0f, 2800.0f, 3600.0f, 4600.0f};
constexpr std::array<float, kTapeHeadCount> kTapeHeadDefaultLevels{{0.72f, 0.8f, 0.88f, 1.0f}};
constexpr std::array<float, kTapeHeadCount> kTapeHeadDefaultPans{{0.28f, 0.72f, 0.38f, 0.62f}};

float clamp(float value, float min_value, float max_value) {
  return std::max(min_value, std::min(max_value, value));
}

struct PatternPreset {
  std::array<float, kTapCount> subdivisions{};
  std::array<float, kTapCount> gains{};
  std::array<float, kTapCount> pans{};
};

const PatternPreset& patternForIndex(int index) {
  static const PatternPreset cascade{
      std::array<float, kTapCount>{1.0f, 0.5f, 0.75f, 0.25f, 1.0f / 3.0f, 1.0f / 6.0f, 0.375f, 0.125f},
      std::array<float, kTapCount>{1.0f, 0.85f, 0.75f, 0.7f, 0.65f, 0.6f, 0.55f, 0.5f},
      std::array<float, kTapCount>{-0.7f, 0.7f, -0.5f, 0.5f, -0.8f, 0.8f, -0.3f, 0.3f},
  };
  static const PatternPreset golden{
      std::array<float, kTapCount>{1.0f, 0.618f, 0.382f, 0.236f, 0.146f, 0.09f, 0.056f, 0.034f},
      std::array<float, kTapCount>{1.0f, 0.9f, 0.8f, 0.7f, 0.6f, 0.5f, 0.4f, 0.3f},
      std::array<float, kTapCount>{-0.3f, 0.5f, -0.7f, 0.2f, -0.5f, 0.8f, -0.2f, 0.6f},
  };
  static const PatternPreset mirror{
      std::array<float, kTapCount>{0.5f, 0.5f, 0.75f, 0.75f, 1.0f, 1.0f, 0.25f, 0.25f},
      std::array<float, kTapCount>{1.0f, 1.0f, 0.8f, 0.8f, 0.65f, 0.65f, 0.5f, 0.5f},
      std::array<float, kTapCount>{-0.8f, 0.8f, -0.6f, 0.6f, -0.4f, 0.4f, -0.9f, 0.9f},
  };
  static const PatternPreset dotted{
      std::array<float, kTapCount>{1.5f, 0.75f, 0.375f, 1.125f, 0.5625f, 0.28125f, 0.1875f, 0.09375f},
      std::array<float, kTapCount>{1.0f, 0.88f, 0.76f, 0.68f, 0.58f, 0.48f, 0.4f, 0.32f},
      std::array<float, kTapCount>{-0.6f, 0.6f, -0.4f, 0.4f, -0.7f, 0.7f, -0.5f, 0.5f},
  };
  static const std::array<const PatternPreset*, 4> patterns{{&cascade, &golden, &mirror, &dotted}};
  return *patterns[static_cast<size_t>(clamp(static_cast<float>(index), 0.0f, 3.0f))];
}

const std::array<float, kTapeHeadCount>& tapeHeadRatiosForIndex(int index) {
  static const std::array<float, kTapeHeadCount> even{{0.25f, 0.5f, 0.75f, 1.0f}};
  static const std::array<float, kTapeHeadCount> triplet{{1.0f / 6.0f, 1.0f / 3.0f, 2.0f / 3.0f, 1.0f}};
  static const std::array<float, kTapeHeadCount> golden{{0.2360679f, 0.381966f, 0.618034f, 1.0f}};
  static const std::array<float, kTapeHeadCount> silver{{0.3535534f, 0.5f, 0.7071068f, 1.0f}};
  static const std::array<const std::array<float, kTapeHeadCount>*, 4> ratios{{&even, &triplet, &golden, &silver}};
  return *ratios[static_cast<size_t>(clamp(static_cast<float>(index), 0.0f, 3.0f))];
}

struct TapActivityConfig {
  float ramp_start;
  float threshold;
  float max_gain;
};

constexpr std::array<TapActivityConfig, kTapCount> kTapActivity{{
    {0.0f, 0.0f, 1.0f},
    {0.1f, 0.15f, 0.85f},
    {0.2f, 0.3f, 0.75f},
    {0.3f, 0.4f, 0.7f},
    {0.45f, 0.55f, 0.65f},
    {0.55f, 0.65f, 0.6f},
    {0.7f, 0.8f, 0.55f},
    {0.85f, 0.9f, 0.5f},
}};

float computeTapGain(int tap_index, float activity) {
  const TapActivityConfig cfg = kTapActivity[static_cast<size_t>(tap_index)];
  if (activity < cfg.ramp_start) return 0.0f;
  if (activity >= cfg.threshold) {
    const float intensity = std::min(1.0f, (activity - cfg.threshold) / std::max(0.01f, 1.0f - cfg.threshold));
    return cfg.max_gain * (0.4f + 0.6f * intensity);
  }
  const float fade = (activity - cfg.ramp_start) / std::max(0.01f, cfg.threshold - cfg.ramp_start);
  return cfg.max_gain * fade * 0.4f;
}

float computeDiffuseTapGain(int tap_index, float activity) {
  const float onset = static_cast<float>(tap_index) * 0.08f;
  const float fill = std::min(1.0f, std::max(0.0f, (activity - onset) / 0.55f));
  if (fill <= 0.0f) return 0.0f;
  const float curve = std::pow(fill, 0.85f);
  return kDiffuseTapWeights[static_cast<size_t>(tap_index)] * curve * (0.15f + 0.85f * fill);
}

struct Biquad {
  enum class Type {
    Lowpass,
    Highpass,
    Bandpass,
    Allpass,
    Highshelf,
  };

  void reset(float value = 0.0f) {
    x1 = value;
    x2 = value;
    y1 = value;
    y2 = value;
  }

  void configure(Type type, float hz, float q, float gain_db, float sample_rate) {
    const float bounded = clamp(hz, 20.0f, sample_rate * 0.45f);
    const float bounded_q = clamp(q, 0.001f, 1000.0f);
    const float omega = 2.0f * kPi * bounded / std::max(1000.0f, sample_rate);
    const float sin_omega = std::sin(omega);
    const float cos_omega = std::cos(omega);
    const float a_gain = std::pow(10.0f, gain_db / 40.0f);
    float raw_b0 = 1.0f;
    float raw_b1 = 0.0f;
    float raw_b2 = 0.0f;
    float raw_a0 = 1.0f;
    float raw_a1 = 0.0f;
    float raw_a2 = 0.0f;

    if (type == Type::Highshelf) {
      const float sqrt_a = std::sqrt(std::max(0.001f, a_gain));
      const float alpha = sin_omega / 2.0f * std::sqrt(2.0f);
      raw_b0 = a_gain * ((a_gain + 1.0f) + (a_gain - 1.0f) * cos_omega + 2.0f * sqrt_a * alpha);
      raw_b1 = -2.0f * a_gain * ((a_gain - 1.0f) + (a_gain + 1.0f) * cos_omega);
      raw_b2 = a_gain * ((a_gain + 1.0f) + (a_gain - 1.0f) * cos_omega - 2.0f * sqrt_a * alpha);
      raw_a0 = (a_gain + 1.0f) - (a_gain - 1.0f) * cos_omega + 2.0f * sqrt_a * alpha;
      raw_a1 = 2.0f * ((a_gain - 1.0f) - (a_gain + 1.0f) * cos_omega);
      raw_a2 = (a_gain + 1.0f) - (a_gain - 1.0f) * cos_omega - 2.0f * sqrt_a * alpha;
    } else {
      const float alpha = sin_omega / (2.0f * bounded_q);
      raw_a0 = 1.0f + alpha;
      raw_a1 = -2.0f * cos_omega;
      raw_a2 = 1.0f - alpha;
      switch (type) {
        case Type::Highpass:
          raw_b0 = (1.0f + cos_omega) * 0.5f;
          raw_b1 = -(1.0f + cos_omega);
          raw_b2 = (1.0f + cos_omega) * 0.5f;
          break;
        case Type::Bandpass:
          raw_b0 = alpha;
          raw_b1 = 0.0f;
          raw_b2 = -alpha;
          break;
        case Type::Allpass:
          raw_b0 = 1.0f - alpha;
          raw_b1 = -2.0f * cos_omega;
          raw_b2 = 1.0f + alpha;
          break;
        case Type::Lowpass:
        default:
          raw_b0 = (1.0f - cos_omega) * 0.5f;
          raw_b1 = 1.0f - cos_omega;
          raw_b2 = (1.0f - cos_omega) * 0.5f;
          break;
      }
    }

    const float inv_a0 = 1.0f / raw_a0;
    b0 = raw_b0 * inv_a0;
    b1 = raw_b1 * inv_a0;
    b2 = raw_b2 * inv_a0;
    a1 = raw_a1 * inv_a0;
    a2 = raw_a2 * inv_a0;
  }

  float process(float input) {
    const float output = b0 * input + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = input;
    y2 = y1;
    y1 = output;
    return std::isfinite(output) ? output : 0.0f;
  }

  float b0 = 1.0f;
  float b1 = 0.0f;
  float b2 = 0.0f;
  float a1 = 0.0f;
  float a2 = 0.0f;
  float x1 = 0.0f;
  float x2 = 0.0f;
  float y1 = 0.0f;
  float y2 = 0.0f;
};

struct DelayLine {
  bool prepare(double sample_rate, float max_seconds) {
    const size_t samples = static_cast<size_t>(std::ceil(sample_rate * max_seconds)) + 4;
    buffer.assign(std::max<size_t>(samples, 8), 0.0f);
    write_index = 0;
    return !buffer.empty();
  }

  void reset() {
    std::fill(buffer.begin(), buffer.end(), 0.0f);
    write_index = 0;
  }

  float read(float delay_samples) const {
    if (buffer.empty()) return 0.0f;
    const float bounded = clamp(delay_samples, 1.0f, static_cast<float>(buffer.size() - 3));
    float read_pos = static_cast<float>(write_index) - bounded;
    while (read_pos < 0.0f) {
      read_pos += static_cast<float>(buffer.size());
    }
    const int i0 = static_cast<int>(read_pos) % static_cast<int>(buffer.size());
    const int i1 = (i0 + 1) % static_cast<int>(buffer.size());
    const float frac = read_pos - std::floor(read_pos);
    return buffer[static_cast<size_t>(i0)] * (1.0f - frac) + buffer[static_cast<size_t>(i1)] * frac;
  }

  void write(float sample) {
    if (buffer.empty()) return;
    buffer[write_index] = sample;
    write_index = (write_index + 1) % buffer.size();
  }

  std::vector<float> buffer;
  size_t write_index = 0;
};

struct BlockDelay {
  void prepare(int frames) {
    buffer.assign(static_cast<size_t>(std::max(1, frames)), 0.0f);
    write_index = 0;
  }

  void reset() {
    std::fill(buffer.begin(), buffer.end(), 0.0f);
    write_index = 0;
  }

  float process(float input) {
    if (buffer.empty()) return input;
    const float output = buffer[write_index];
    buffer[write_index] = input;
    write_index = (write_index + 1) % buffer.size();
    return output;
  }

  std::vector<float> buffer;
  size_t write_index = 0;
};

struct DelayBState {
  bool enabled = false;
  float activity = 0.3f;
  float repeats = 0.3f;
  float base_time_sec = 0.5f;
  float tone = 0.5f;
  float vibrato = 0.0f;
  float mix = 1.0f;
  float reverb_send = 0.0f;
  float granular_send = 0.0f;
  float to_delay_a = 0.0f;
  bool diffuse = false;
  bool tape_heads = false;
  int pattern = 0;
  int warp = 0;
  float warp_intensity = 0.5f;
  float spread = 0.5f;
  uint32_t tape_head_mask = 15u;
  std::array<float, kTapeHeadCount> tape_head_levels = kTapeHeadDefaultLevels;
  std::array<float, kTapeHeadCount> tape_head_pans = kTapeHeadDefaultPans;
};

class DelayBModule final : public IKesshoModule {
public:
  bool prepare(double sample_rate, int max_block_size) override {
    sample_rate_ = sample_rate > 1000.0 ? static_cast<float>(sample_rate) : 48000.0f;
    max_block_size_ = std::max(1, max_block_size);
    const int output_latency_frames = std::max(
        1,
        static_cast<int>(std::lround(sample_rate_ * kWebAudioCompressorLookaheadSeconds)));
    output_latency_l_.prepare(output_latency_frames);
    output_latency_r_.prepare(output_latency_frames);
    for (int i = 0; i < kTapCount; ++i) {
      if (!tap_l_[static_cast<size_t>(i)].prepare(sample_rate_, 5.0f) ||
          !tap_r_[static_cast<size_t>(i)].prepare(sample_rate_, 5.0f) ||
          !offset_l_[static_cast<size_t>(i)].prepare(sample_rate_, 0.25f) ||
          !offset_r_[static_cast<size_t>(i)].prepare(sample_rate_, 0.25f)) {
        return false;
      }
    }
    resetParams();
    reset();
    return true;
  }

  void reset() override {
    for (int i = 0; i < kTapCount; ++i) {
      tap_l_[static_cast<size_t>(i)].reset();
      tap_r_[static_cast<size_t>(i)].reset();
      offset_l_[static_cast<size_t>(i)].reset();
      offset_r_[static_cast<size_t>(i)].reset();
      warp_l_[static_cast<size_t>(i)].reset();
      warp_r_[static_cast<size_t>(i)].reset();
      vibrato_phase_[static_cast<size_t>(i)] = 0.0f;
    }
    high_cut_l_.reset();
    high_cut_r_.reset();
    low_cut_l_.reset();
    low_cut_r_.reset();
    output_latency_l_.reset();
    output_latency_r_.reset();
    feedback_l_ = 0.0f;
    feedback_r_ = 0.0f;
  }

  void processInterleaved(const float* input_interleaved, float* output_interleaved, int frames) override {
    if (input_interleaved == nullptr || output_interleaved == nullptr || frames <= 0) return;
    int rendered = 0;
    while (rendered < frames) {
      const int block = std::min(max_block_size_, frames - rendered);
      for (int i = 0; i < block; ++i) {
        float tap_l[kOutputTapCount]{};
        float tap_r[kOutputTapCount]{};
        processSample(
            input_interleaved[(rendered + i) * 2],
            input_interleaved[(rendered + i) * 2 + 1],
            tap_l,
            tap_r);
        output_interleaved[(rendered + i) * 2] = tap_l[0];
        output_interleaved[(rendered + i) * 2 + 1] = tap_r[0];
      }
      rendered += block;
    }
  }

  void processPlanarStereo(
      const float* input_l,
      const float* input_r,
      float* output_l,
      float* output_r,
      int frames) override {
    if (input_l == nullptr || input_r == nullptr || output_l == nullptr || output_r == nullptr || frames <= 0) {
      return;
    }
    for (int i = 0; i < frames; ++i) {
      float tap_l[kOutputTapCount]{};
      float tap_r[kOutputTapCount]{};
      processSample(input_l[i], input_r[i], tap_l, tap_r);
      output_l[i] = tap_l[0];
      output_r[i] = tap_r[0];
    }
  }

  void processPlanarStereoTaps(
      const float* input_l,
      const float* input_r,
      float* const* output_l,
      float* const* output_r,
      uint32_t output_bus_count,
      int frames) override {
    if (
        input_l == nullptr ||
        input_r == nullptr ||
        output_l == nullptr ||
        output_r == nullptr ||
        output_bus_count == 0 ||
        output_bus_count > kOutputTapCount ||
        frames <= 0) {
      return;
    }
    for (uint32_t bus = 0; bus < output_bus_count; ++bus) {
      if (output_l[bus] == nullptr || output_r[bus] == nullptr) return;
    }

    for (int i = 0; i < frames; ++i) {
      float tap_l[kOutputTapCount]{};
      float tap_r[kOutputTapCount]{};
      processSample(input_l[i], input_r[i], tap_l, tap_r);
      for (uint32_t bus = 0; bus < output_bus_count; ++bus) {
        output_l[bus][i] = tap_l[bus];
        output_r[bus][i] = tap_r[bus];
      }
    }
  }

  int paramCount() const override {
    return kParamCount;
  }

  float* params() override {
    return params_.data();
  }

  void commitParams() override {
    state_.enabled = params_[kParamEnabled] > 0.5f;
    state_.activity = clamp(params_[kParamActivity], 0.0f, 1.0f);
    state_.repeats = state_.enabled ? clamp(params_[kParamRepeats], 0.0f, 0.85f) : 0.0f;
    state_.base_time_sec = clamp(params_[kParamBaseTimeMs] * 0.001f, 0.02f, 5.0f);
    state_.tone = clamp(params_[kParamTone], 0.0f, 1.0f);
    state_.vibrato = state_.enabled ? clamp(params_[kParamVibrato], 0.0f, 1.0f) : 0.0f;
    state_.mix = state_.enabled ? clamp(params_[kParamMix], 0.0f, 1.0f) : 0.0f;
    state_.reverb_send = state_.enabled ? clamp(params_[kParamReverbSend], 0.0f, 1.0f) : 0.0f;
    state_.granular_send = state_.enabled ? clamp(params_[kParamGranularSend], 0.0f, 1.0f) : 0.0f;
    state_.to_delay_a = state_.enabled ? clamp(params_[kParamToDelayA], 0.0f, 1.0f) : 0.0f;
    const int space_mode = static_cast<int>(clamp(std::round(params_[kParamSpaceMode]), 0.0f, 2.0f));
    state_.diffuse = space_mode == 1;
    state_.tape_heads = space_mode == 2;
    state_.pattern = static_cast<int>(clamp(std::round(params_[kParamPattern]), 0.0f, 3.0f));
    state_.warp = static_cast<int>(clamp(std::round(params_[kParamWarp]), 0.0f, 3.0f));
    state_.warp_intensity = clamp(params_[kParamWarpIntensity], 0.0f, 1.0f);
    state_.spread = clamp(params_[kParamSpread], 0.0f, 1.0f);
    state_.tape_head_mask = static_cast<uint32_t>(clamp(std::round(params_[kParamTapeHeadMask]), 0.0f, 15.0f));
    for (int i = 0; i < kTapeHeadCount; ++i) {
      const size_t index = static_cast<size_t>(i);
      state_.tape_head_levels[index] = clamp(params_[kParamTapeHeadLevelBase + i], 0.0f, 1.0f);
      state_.tape_head_pans[index] = clamp(params_[kParamTapeHeadPanBase + i], 0.0f, 1.0f);
    }
    configureFilters();
    configureTapRuntime();
  }

  int outputTapCount() const override {
    return kOutputTapCount;
  }

private:
  void resetParams() {
    params_.fill(0.0f);
    params_[kParamActivity] = 0.3f;
    params_[kParamRepeats] = 0.3f;
    params_[kParamBaseTimeMs] = 500.0f;
    params_[kParamTone] = 0.5f;
    params_[kParamMix] = 1.0f;
    params_[kParamReverbSend] = 0.0f;
    params_[kParamGranularSend] = 0.0f;
    params_[kParamToDelayA] = 0.0f;
    params_[kParamWarpIntensity] = 0.5f;
    params_[kParamSpread] = 0.5f;
    params_[kParamTapeHeadMask] = 15.0f;
    for (int i = 0; i < kTapeHeadCount; ++i) {
      const size_t index = static_cast<size_t>(i);
      params_[kParamTapeHeadLevelBase + i] = kTapeHeadDefaultLevels[index];
      params_[kParamTapeHeadPanBase + i] = kTapeHeadDefaultPans[index];
    }
    commitParams();
  }

  void configureFilters() {
    const float tone = state_.tone;
    const float high_cut_hz = state_.tape_heads
        ? clamp(11000.0f - tone * 7600.0f - state_.warp_intensity * 1400.0f, 1200.0f, 12000.0f)
        : 600.0f + tone * 11400.0f;
    const float low_cut_hz = state_.tape_heads
        ? 45.0f + tone * 260.0f
        : 60.0f + std::max(0.0f, tone - 0.5f) * 680.0f;
    high_cut_l_.configure(Biquad::Type::Lowpass, high_cut_hz, 0.7f, 0.0f, sample_rate_);
    high_cut_r_.configure(Biquad::Type::Lowpass, high_cut_hz, 0.7f, 0.0f, sample_rate_);
    low_cut_l_.configure(Biquad::Type::Highpass, low_cut_hz, 0.7f, 0.0f, sample_rate_);
    low_cut_r_.configure(Biquad::Type::Highpass, low_cut_hz, 0.7f, 0.0f, sample_rate_);

    for (int i = 0; i < kTapCount; ++i) {
      Biquad::Type type = Biquad::Type::Bandpass;
      float hz = kWarpFilterFreqs[static_cast<size_t>(i)];
      float q = 3.0f;
      float gain_db = 0.0f;
      if (state_.tape_heads) {
        type = Biquad::Type::Allpass;
        hz = 520.0f + static_cast<float>(i) * 230.0f + state_.warp_intensity * 520.0f;
        q = 0.55f + state_.warp_intensity * 1.6f;
      } else if (state_.warp == 2 && i >= 4) {
        type = Biquad::Type::Highshelf;
        hz = kWarpPitchTiltFreqs[static_cast<size_t>(i)];
        q = 0.7f;
        gain_db = kWarpPitchTiltGains[static_cast<size_t>(i)] * state_.warp_intensity;
      } else if (state_.warp == 3 && i >= 4) {
        type = Biquad::Type::Allpass;
        hz = kWarpGrainCenterFreqs[static_cast<size_t>(i)];
        q = 0.65f + state_.warp_intensity * 2.2f;
      }
      warp_l_[static_cast<size_t>(i)].configure(type, hz, q, gain_db, sample_rate_);
      warp_r_[static_cast<size_t>(i)].configure(type, hz, q, gain_db, sample_rate_);
    }
  }

  void configureTapRuntime() {
    float sum_gain = 0.0f;
    for (int i = 0; i < kTapCount; ++i) {
      const size_t index = static_cast<size_t>(i);
      tap_gain_[index] = tapGain(i);
      tap_time_samples_[index] = tapTimeSeconds(i) * sample_rate_;
      sum_gain += tap_gain_[index];

      const float pan = tapPan(i);
      if (pan <= 0.0f) {
        const float angle = (pan + 1.0f) * kPi * 0.5f;
        tap_left_from_left_[index] = 1.0f;
        tap_left_from_right_[index] = std::cos(angle);
        tap_right_from_left_[index] = 0.0f;
        tap_right_from_right_[index] = std::sin(angle);
      } else {
        const float angle = pan * kPi * 0.5f;
        tap_left_from_left_[index] = std::cos(angle);
        tap_left_from_right_[index] = 0.0f;
        tap_right_from_left_[index] = std::sin(angle);
        tap_right_from_right_[index] = 1.0f;
      }

      warp_wet_[index] = warpWet(i);
      warp_offset_samples_[index] = warpOffsetSamples(i);
      const float vibrato_multiplier =
          state_.tape_heads
              ? 0.45f + static_cast<float>(i) * 0.12f
              : state_.warp == 2 && i >= 4
              ? 1.0f + state_.warp_intensity * (i >= 6 ? 3.0f : 1.7f)
              : state_.warp == 3 && i >= 4 ? 1.0f + state_.warp_intensity * 1.4f : 1.0f;
      vibrato_depth_seconds_[index] = state_.tape_heads
          ? (state_.vibrato * 0.004f + state_.warp_intensity * 0.0018f) * vibrato_multiplier
          : state_.vibrato * 0.008f * (state_.diffuse ? 0.55f : 1.0f) * vibrato_multiplier;
      vibrato_phase_increment_[index] = 2.0f * kPi * kTapVibratoRates[index] / sample_rate_;
    }

    const float raw_feedback =
        state_.tape_heads ? state_.repeats * 0.84f : state_.diffuse ? state_.repeats * 0.9f : state_.repeats;
    normalized_feedback_ = sum_gain > 1.0f ? raw_feedback / sum_gain : raw_feedback;
  }

  float tapGain(int i) const {
    if (!state_.enabled) return 0.0f;
    if (state_.tape_heads) {
      if (i >= kTapeHeadCount) return 0.0f;
      const size_t index = static_cast<size_t>(i);
      if ((state_.tape_head_mask & (1u << index)) == 0u) return 0.0f;
      return state_.tape_head_levels[index] * (0.75f + state_.activity * 0.25f);
    }
    const PatternPreset& pattern = patternForIndex(state_.pattern);
    return state_.diffuse
        ? computeDiffuseTapGain(i, state_.activity)
        : computeTapGain(i, state_.activity) * pattern.gains[static_cast<size_t>(i)];
  }

  float tapTimeSeconds(int i) const {
    if (state_.tape_heads && i < kTapeHeadCount) {
      const auto& ratios = tapeHeadRatiosForIndex(state_.pattern);
      return clamp(state_.base_time_sec * ratios[static_cast<size_t>(i)], 0.001f, 5.0f);
    }
    const PatternPreset& pattern = patternForIndex(state_.pattern);
    const float base = state_.diffuse ? std::max(0.08f, state_.base_time_sec * 0.85f) : state_.base_time_sec;
    const float factor = state_.diffuse
        ? kDiffuseTapFactors[static_cast<size_t>(i)]
        : pattern.subdivisions[static_cast<size_t>(i)];
    return clamp(base * factor, 0.001f, 5.0f);
  }

  float tapPan(int i) const {
    if (state_.tape_heads && i < kTapeHeadCount) {
      const float base_pan = (state_.tape_head_pans[static_cast<size_t>(i)] - 0.5f) * 2.0f;
      return clamp(base_pan * state_.spread * 2.0f, -1.0f, 1.0f);
    }
    const PatternPreset& pattern = patternForIndex(state_.pattern);
    const float base_pan = state_.diffuse ? kTapPans[static_cast<size_t>(i)] : pattern.pans[static_cast<size_t>(i)];
    return clamp(base_pan * state_.spread * 2.0f, -1.0f, 1.0f);
  }

  float warpWet(int i) const {
    if (!state_.enabled) return 0.0f;
    if (state_.tape_heads) return i < kTapeHeadCount ? state_.warp_intensity * 0.28f : 0.0f;
    if (state_.warp == 1) return state_.warp_intensity;
    if ((state_.warp == 2 || state_.warp == 3) && i >= 4) return state_.warp_intensity;
    return 0.0f;
  }

  float warpOffsetSamples(int i) const {
    if (state_.tape_heads && i < kTapeHeadCount && state_.enabled) {
      const float offset_sec = (0.0015f + static_cast<float>(i) * 0.0012f) * state_.warp_intensity;
      return std::max(1.0f, offset_sec * sample_rate_);
    }
    if (state_.warp != 3 || i < 4 || !state_.enabled) return 1.0f;
    const float normalized_index = static_cast<float>(i - 3) / 4.0f;
    const float offset_sec = (0.006f + normalized_index * 0.042f) * state_.warp_intensity;
    return std::max(1.0f, offset_sec * sample_rate_);
  }

  void processSample(float input_l, float input_r, float* taps_l, float* taps_r) {
    for (int bus = 0; bus < kOutputTapCount; ++bus) {
      taps_l[bus] = 0.0f;
      taps_r[bus] = 0.0f;
    }
    if (!state_.enabled) return;

    const float input_feed_l = input_l + feedback_l_;
    const float input_feed_r = input_r + feedback_r_;
    float sum_l = 0.0f;
    float sum_r = 0.0f;
    for (int i = 0; i < kTapCount; ++i) {
      const size_t index = static_cast<size_t>(i);
      const float gain = tap_gain_[index];
      const float vibrato = std::sin(vibrato_phase_[index]) * vibrato_depth_seconds_[index];
      vibrato_phase_[index] += vibrato_phase_increment_[index];
      if (vibrato_phase_[index] >= 2.0f * kPi) vibrato_phase_[index] -= 2.0f * kPi;

      const float delay_samples = std::max(1.0f, tap_time_samples_[index] + vibrato * sample_rate_);
      const float delayed_l = tap_l_[index].read(delay_samples) * gain;
      const float delayed_r = tap_r_[index].read(delay_samples) * gain;
      tap_l_[index].write(input_feed_l);
      tap_r_[index].write(input_feed_r);

      const float wet = warp_wet_[index];
      const float dry = 1.0f - wet;
      const float filtered_l = warp_l_[index].process(delayed_l);
      const float filtered_r = warp_r_[index].process(delayed_r);
      offset_l_[index].write(filtered_l);
      offset_r_[index].write(filtered_r);
      const float offset_l = offset_l_[index].read(warp_offset_samples_[index]);
      const float offset_r = offset_r_[index].read(warp_offset_samples_[index]);
      const float warped_l = delayed_l * dry + offset_l * wet;
      const float warped_r = delayed_r * dry + offset_r * wet;
      sum_l += warped_l * tap_left_from_left_[index] + warped_r * tap_left_from_right_[index];
      sum_r += warped_l * tap_right_from_left_[index] + warped_r * tap_right_from_right_[index];
    }

    feedback_l_ = low_cut_l_.process(high_cut_l_.process(sum_l)) * normalized_feedback_;
    feedback_r_ = low_cut_r_.process(high_cut_r_.process(sum_r)) * normalized_feedback_;

    const float compressed_l = std::tanh(sum_l * 1.15f) * 0.8695652f * kWebAudioCompressorMakeupGain;
    const float compressed_r = std::tanh(sum_r * 1.15f) * 0.8695652f * kWebAudioCompressorMakeupGain;
    const float limited_l = output_latency_l_.process(compressed_l);
    const float limited_r = output_latency_r_.process(compressed_r);
    taps_l[0] = limited_l * state_.mix;
    taps_r[0] = limited_r * state_.mix;
    taps_l[1] = limited_l * state_.reverb_send;
    taps_r[1] = limited_r * state_.reverb_send;
    taps_l[2] = limited_l * state_.to_delay_a;
    taps_r[2] = limited_r * state_.to_delay_a;
    taps_l[3] = limited_l * state_.granular_send;
    taps_r[3] = limited_r * state_.granular_send;
  }

  float sample_rate_ = 48000.0f;
  int max_block_size_ = 128;
  std::array<float, kParamCount> params_{};
  DelayBState state_{};
  std::array<DelayLine, kTapCount> tap_l_{};
  std::array<DelayLine, kTapCount> tap_r_{};
  std::array<DelayLine, kTapCount> offset_l_{};
  std::array<DelayLine, kTapCount> offset_r_{};
  std::array<Biquad, kTapCount> warp_l_{};
  std::array<Biquad, kTapCount> warp_r_{};
  Biquad high_cut_l_{};
  Biquad high_cut_r_{};
  Biquad low_cut_l_{};
  Biquad low_cut_r_{};
  BlockDelay output_latency_l_;
  BlockDelay output_latency_r_;
  std::array<float, kTapCount> tap_gain_{};
  std::array<float, kTapCount> tap_time_samples_{};
  std::array<float, kTapCount> tap_left_from_left_{};
  std::array<float, kTapCount> tap_left_from_right_{};
  std::array<float, kTapCount> tap_right_from_left_{};
  std::array<float, kTapCount> tap_right_from_right_{};
  std::array<float, kTapCount> warp_wet_{};
  std::array<float, kTapCount> warp_offset_samples_{};
  std::array<float, kTapCount> vibrato_depth_seconds_{};
  std::array<float, kTapCount> vibrato_phase_increment_{};
  std::array<float, kTapCount> vibrato_phase_{};
  float normalized_feedback_ = 0.0f;
  float feedback_l_ = 0.0f;
  float feedback_r_ = 0.0f;
};

} // namespace

std::unique_ptr<IKesshoModule> createDelayBModule() {
  return std::make_unique<DelayBModule>();
}

} // namespace kessho::core
