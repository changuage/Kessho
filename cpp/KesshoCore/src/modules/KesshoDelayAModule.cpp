#include "KesshoModule.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <memory>
#include <vector>

namespace kessho::core {
namespace {

constexpr int kParamCount = 16;
constexpr int kParamEnabled = 0;
constexpr int kParamTimeLeftMs = 1;
constexpr int kParamTimeRightMs = 2;
constexpr int kParamFeedback = 3;
constexpr int kParamMix = 4;
constexpr int kParamFilterHz = 5;
constexpr int kParamFilterType = 6;
constexpr int kParamReverbSend = 7;
constexpr int kParamModRateHz = 8;
constexpr int kParamModDepthMs = 9;
constexpr int kParamPingPong = 10;
constexpr int kParamDuck = 11;
constexpr int kParamWidth = 12;
constexpr int kParamToDelayB = 13;
constexpr int kParamCrossFeedFilterHz = 14;
constexpr int kParamGranularSend = 15;

constexpr int kOutputTapCount = 4;
constexpr float kPi = 3.14159265358979323846f;
constexpr float kMergerDownmixGain = 0.75f;

float clamp(float value, float min_value, float max_value) {
  return std::max(min_value, std::min(max_value, value));
}

struct Biquad {
  enum class Type {
    Lowpass,
    Highpass,
    Bandpass,
  };

  void reset(float value = 0.0f) {
    x1 = value;
    x2 = value;
    y1 = value;
    y2 = value;
  }

  void configure(Type type, float hz, float q, float sample_rate) {
    const float bounded = clamp(hz, 20.0f, sample_rate * 0.45f);
    const float bounded_q = clamp(q, 0.001f, 1000.0f);
    const float omega = 2.0f * kPi * bounded / std::max(1000.0f, sample_rate);
    const float sin_omega = std::sin(omega);
    const float cos_omega = std::cos(omega);
    const float alpha_q = sin_omega / (2.0f * bounded_q);
    const float alpha_q_db = sin_omega / (2.0f * std::pow(10.0f, bounded_q / 20.0f));
    const float alpha = type == Type::Bandpass ? alpha_q : alpha_q_db;
    float raw_b0 = 0.0f;
    float raw_b1 = 0.0f;
    float raw_b2 = 0.0f;
    const float raw_a0 = 1.0f + alpha;
    const float raw_a1 = -2.0f * cos_omega;
    const float raw_a2 = 1.0f - alpha;

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
      case Type::Lowpass:
      default:
        raw_b0 = (1.0f - cos_omega) * 0.5f;
        raw_b1 = 1.0f - cos_omega;
        raw_b2 = (1.0f - cos_omega) * 0.5f;
        break;
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

struct DelayAState {
  bool enabled = false;
  float time_l = 0.25f;
  float time_r = 0.375f;
  float feedback = 0.4f;
  float mix = 0.35f;
  float filter_hz = 2000.0f;
  int filter_type = 0;
  float reverb_send = 0.0f;
  float mod_rate_hz = 0.01f;
  float mod_depth_l = 0.0f;
  float mod_depth_r = 0.0f;
  bool ping_pong = false;
  float duck = 0.0f;
  float to_delay_b = 0.0f;
  float cross_feed_filter_hz = 8000.0f;
  float granular_send = 0.0f;
};

class DelayAModule final : public IKesshoModule {
public:
  bool prepare(double sample_rate, int max_block_size) override {
    sample_rate_ = sample_rate > 1000.0 ? static_cast<float>(sample_rate) : 48000.0f;
    max_block_size_ = std::max(1, max_block_size);
    const int feedback_latency_frames = max_block_size_;
    feedback_delay_l_0_.prepare(feedback_latency_frames);
    feedback_delay_l_1_.prepare(feedback_latency_frames);
    feedback_delay_r_0_.prepare(feedback_latency_frames);
    feedback_delay_r_1_.prepare(feedback_latency_frames);
    if (
        !delay_l_0_.prepare(sample_rate_, 5.0f) ||
        !delay_l_1_.prepare(sample_rate_, 5.0f) ||
        !delay_r_0_.prepare(sample_rate_, 5.0f) ||
        !delay_r_1_.prepare(sample_rate_, 5.0f)) {
      return false;
    }
    resetParams();
    reset();
    return true;
  }

  void reset() override {
    delay_l_0_.reset();
    delay_l_1_.reset();
    delay_r_0_.reset();
    delay_r_1_.reset();
    filter_l_0_.reset();
    filter_l_1_.reset();
    filter_r_0_.reset();
    filter_r_1_.reset();
    feedback_delay_l_0_.reset();
    feedback_delay_l_1_.reset();
    feedback_delay_r_0_.reset();
    feedback_delay_r_1_.reset();
    cross_filter_l_.reset();
    cross_filter_r_.reset();
    envelope_ = 0.0f;
    mod_phase_ = 0.0f;
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
    const bool enabled = params_[kParamEnabled] > 0.5f;
    const float base_l = clamp(params_[kParamTimeLeftMs] * 0.001f, 0.01f, 5.0f);
    const float base_r = clamp(params_[kParamTimeRightMs] * 0.001f, 0.01f, 5.0f);
    const float width = clamp(params_[kParamWidth], 0.0f, 1.0f);
    const float mono_blend = std::max(0.0f, 1.0f - width * 2.0f);
    const float avg_time = (base_l + base_r) * 0.5f;
    float final_l = base_l * (1.0f - mono_blend) + avg_time * mono_blend;
    float final_r = base_r * (1.0f - mono_blend) + avg_time * mono_blend;
    if (width > 0.5f) {
      final_r = clamp(final_r + (width - 0.5f) * 2.0f * 0.015f, 0.01f, 5.0f);
    }

    state_.enabled = enabled;
    state_.time_l = final_l;
    state_.time_r = final_r;
    state_.feedback = enabled ? clamp(params_[kParamFeedback], 0.0f, 0.95f) : 0.0f;
    state_.mix = enabled ? clamp(params_[kParamMix], 0.0f, 1.0f) : 0.0f;
    state_.filter_hz = clamp(params_[kParamFilterHz], 200.0f, 12000.0f);
    state_.filter_type = static_cast<int>(clamp(std::round(params_[kParamFilterType]), 0.0f, 2.0f));
    state_.reverb_send = enabled ? clamp(params_[kParamReverbSend], 0.0f, 1.0f) : 0.0f;
    state_.mod_rate_hz = std::max(0.01f, clamp(params_[kParamModRateHz], 0.0f, 5.0f));
    state_.mod_depth_l = enabled
        ? std::min(final_l * 0.8f, clamp(params_[kParamModDepthMs], 0.0f, 50.0f) * 0.001f)
        : 0.0f;
    state_.mod_depth_r = enabled
        ? std::min(final_r * 0.8f, clamp(params_[kParamModDepthMs], 0.0f, 50.0f) * 0.001f)
        : 0.0f;
    state_.ping_pong = params_[kParamPingPong] > 0.5f;
    state_.duck = enabled ? clamp(params_[kParamDuck], 0.0f, 1.0f) : 0.0f;
    state_.to_delay_b = enabled ? clamp(params_[kParamToDelayB], 0.0f, 1.0f) : 0.0f;
    state_.cross_feed_filter_hz = clamp(params_[kParamCrossFeedFilterHz], 200.0f, 12000.0f);
    state_.granular_send = enabled ? clamp(params_[kParamGranularSend], 0.0f, 1.0f) : 0.0f;
    configureFilters();
  }

  int outputTapCount() const override {
    return kOutputTapCount;
  }

private:
  void resetParams() {
    params_.fill(0.0f);
    params_[kParamEnabled] = 0.0f;
    params_[kParamTimeLeftMs] = 250.0f;
    params_[kParamTimeRightMs] = 375.0f;
    params_[kParamFeedback] = 0.4f;
    params_[kParamMix] = 0.35f;
    params_[kParamFilterHz] = 2000.0f;
    params_[kParamFilterType] = 0.0f;
    params_[kParamReverbSend] = 0.0f;
    params_[kParamModRateHz] = 0.0f;
    params_[kParamModDepthMs] = 0.0f;
    params_[kParamPingPong] = 0.0f;
    params_[kParamDuck] = 0.0f;
    params_[kParamWidth] = 0.5f;
    params_[kParamToDelayB] = 0.0f;
    params_[kParamCrossFeedFilterHz] = 8000.0f;
    params_[kParamGranularSend] = 0.0f;
    commitParams();
  }

  void configureFilters() {
    Biquad::Type filter_type = Biquad::Type::Lowpass;
    float filter_q = 0.7f;
    if (state_.filter_type == 1) {
      filter_type = Biquad::Type::Highpass;
    } else if (state_.filter_type == 2) {
      filter_type = Biquad::Type::Bandpass;
      filter_q = 2.0f;
    }
    filter_l_0_.configure(filter_type, state_.filter_hz, filter_q, sample_rate_);
    filter_l_1_.configure(filter_type, state_.filter_hz, filter_q, sample_rate_);
    filter_r_0_.configure(filter_type, state_.filter_hz, filter_q, sample_rate_);
    filter_r_1_.configure(filter_type, state_.filter_hz, filter_q, sample_rate_);
    cross_filter_l_.configure(Biquad::Type::Lowpass, state_.cross_feed_filter_hz, 0.7f, sample_rate_);
    cross_filter_r_.configure(Biquad::Type::Lowpass, state_.cross_feed_filter_hz, 0.7f, sample_rate_);
  }

  float updateDuck(float input_l, float input_r) {
    const float peak = std::max(std::fabs(input_l), std::fabs(input_r));
    const float normalized = clamp((peak - 0.01f) * 4.5f, 0.0f, 1.0f);
    if (normalized > envelope_) {
      envelope_ += (normalized - envelope_) * 0.4f;
    } else {
      envelope_ = envelope_ * 0.9f + normalized * 0.1f;
    }
    return 1.0f - clamp(envelope_ * state_.duck, 0.0f, 0.92f);
  }

  void processSample(float input_l, float input_r, float* taps_l, float* taps_r) {
    if (!state_.enabled) {
      for (int bus = 0; bus < kOutputTapCount; ++bus) {
        taps_l[bus] = 0.0f;
        taps_r[bus] = 0.0f;
      }
      return;
    }

    const float mod = std::sin(mod_phase_);
    mod_phase_ += 2.0f * kPi * state_.mod_rate_hz / sample_rate_;
    if (mod_phase_ >= 2.0f * kPi) mod_phase_ -= 2.0f * kPi;

    const float delay_samples_l = (state_.time_l + mod * state_.mod_depth_l) * sample_rate_;
    const float delay_samples_r = (state_.time_r - mod * state_.mod_depth_r) * sample_rate_;
    const float delayed_l_0 = delay_l_0_.read(delay_samples_l);
    const float delayed_l_1 = delay_l_1_.read(delay_samples_l);
    const float delayed_r_0 = delay_r_0_.read(delay_samples_r);
    const float delayed_r_1 = delay_r_1_.read(delay_samples_r);
    const float filtered_l_0 = filter_l_0_.process(delayed_l_0);
    const float filtered_l_1 = filter_l_1_.process(delayed_l_1);
    const float filtered_r_0 = filter_r_0_.process(delayed_r_0);
    const float filtered_r_1 = filter_r_1_.process(delayed_r_1);
    const float feedback_l_0 = feedback_delay_l_0_.process(filtered_l_0);
    const float feedback_l_1 = feedback_delay_l_1_.process(filtered_l_1);
    const float feedback_r_0 = feedback_delay_r_0_.process(filtered_r_0);
    const float feedback_r_1 = feedback_delay_r_1_.process(filtered_r_1);
    const float self_feedback = state_.ping_pong ? 0.0f : state_.feedback;
    const float cross_feedback = state_.ping_pong ? state_.feedback : 0.0f;

    delay_l_0_.write(input_l + feedback_l_0 * self_feedback + feedback_r_0 * cross_feedback);
    delay_l_1_.write(input_r + feedback_l_1 * self_feedback + feedback_r_1 * cross_feedback);
    delay_r_0_.write(input_l + feedback_r_0 * self_feedback + feedback_l_0 * cross_feedback);
    delay_r_1_.write(input_r + feedback_r_1 * self_feedback + feedback_l_1 * cross_feedback);

    const float duck_gain = state_.duck > 0.0001f ? updateDuck(input_l, input_r) : 1.0f;
    const float filtered_l = (filtered_l_0 + filtered_l_1) * kMergerDownmixGain;
    const float filtered_r = (filtered_r_0 + filtered_r_1) * kMergerDownmixGain;
    const float limited_l = std::tanh(filtered_l * 1.4f) * 0.7142857f;
    const float limited_r = std::tanh(filtered_r * 1.4f) * 0.7142857f;
    const float main_l = limited_l * duck_gain * state_.mix;
    const float main_r = limited_r * duck_gain * state_.mix;

    taps_l[0] = main_l;
    taps_r[0] = main_r;
    taps_l[1] = limited_l * state_.reverb_send;
    taps_r[1] = limited_r * state_.reverb_send;
    taps_l[2] = cross_filter_l_.process(limited_l) * state_.to_delay_b;
    taps_r[2] = cross_filter_r_.process(limited_r) * state_.to_delay_b;
    taps_l[3] = limited_l * state_.granular_send;
    taps_r[3] = limited_r * state_.granular_send;
  }

  float sample_rate_ = 48000.0f;
  int max_block_size_ = 128;
  std::array<float, kParamCount> params_{};
  DelayAState state_{};
  DelayLine delay_l_0_;
  DelayLine delay_l_1_;
  DelayLine delay_r_0_;
  DelayLine delay_r_1_;
  BlockDelay feedback_delay_l_0_;
  BlockDelay feedback_delay_l_1_;
  BlockDelay feedback_delay_r_0_;
  BlockDelay feedback_delay_r_1_;
  Biquad filter_l_0_;
  Biquad filter_l_1_;
  Biquad filter_r_0_;
  Biquad filter_r_1_;
  Biquad cross_filter_l_;
  Biquad cross_filter_r_;
  float envelope_ = 0.0f;
  float mod_phase_ = 0.0f;
};

} // namespace

std::unique_ptr<IKesshoModule> createDelayAModule() {
  return std::make_unique<DelayAModule>();
}

} // namespace kessho::core
