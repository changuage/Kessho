#include "KesshoModule.h"

#include <algorithm>
#include <array>
#include <memory>

#include "kessho_reverb.h"

namespace kessho::core {
namespace {

constexpr int kReverbBlockSize = 128;
constexpr int kParamCount = 30;
constexpr int kParamType = 0;
constexpr int kParamQuality = 1;
constexpr int kParamDecay = 2;
constexpr int kParamSize = 3;
constexpr int kParamDamping = 4;
constexpr int kParamDiffusion = 5;
constexpr int kParamModulation = 6;
constexpr int kParamPredelay = 7;
constexpr int kParamWidth = 8;
constexpr int kParamShimmerAmount = 9;
constexpr int kParamShimmerPitch = 10;
constexpr int kParamSlowRate = 11;
constexpr int kParamSlowDepth = 12;
constexpr int kParamReverseAmount = 13;
constexpr int kParamReverseLength = 14;
constexpr int kParamChorusRate = 15;
constexpr int kParamChorusDepth = 16;
constexpr int kParamModCharacter = 17;
constexpr int kParamDampLow = 18;
constexpr int kParamDampHigh = 19;
constexpr int kParamCrossover = 20;
constexpr int kParamInputTone = 21;
constexpr int kParamShimmerFeedback = 22;
constexpr int kParamWarp = 23;
constexpr int kParamCrossFeed = 24;
constexpr int kParamEarlyReflections = 25;
constexpr int kParamAirAbsorption = 26;
constexpr int kParamSaturationMode = 27;
constexpr int kParamTransientSmooth = 28;
constexpr int kParamErLpFreq = 29;

class ReverbModule final : public IKesshoModule {
public:
  ~ReverbModule() override {
    reverb_instance_destroy(instance_);
  }

  bool prepare(double sample_rate, int max_block_size) override {
    sample_rate_ = sample_rate > 1000.0 ? static_cast<float>(sample_rate) : 48000.0f;
    max_block_size_ = std::max(1, std::min(max_block_size, kReverbBlockSize));
    reverb_instance_destroy(instance_);
    instance_ = reverb_instance_create(sample_rate_);
    if (instance_ == nullptr) {
      return false;
    }
    commitParams();
    return true;
  }

  void reset() override {
    if (instance_ != nullptr && reverb_instance_reset(instance_, sample_rate_) == 1) {
      commitParams();
    }
  }

  void processInterleaved(const float* input_interleaved, float* output_interleaved, int frames) override {
    if (instance_ == nullptr || input_interleaved == nullptr || output_interleaved == nullptr || frames <= 0) {
      return;
    }

    int rendered = 0;
    while (rendered < frames) {
      const int block = std::min(kReverbBlockSize, std::min(max_block_size_, frames - rendered));
      float* input = reverb_instance_get_input_ptr(instance_);
      float* output = reverb_instance_get_output_ptr(instance_);
      const int sample_count = block * 2;
      std::copy(input_interleaved + rendered * 2, input_interleaved + rendered * 2 + sample_count, input);
      reverb_instance_process_block(instance_, block);
      std::copy(output, output + sample_count, output_interleaved + rendered * 2);
      rendered += block;
    }
  }

  void processPlanarStereo(
      const float* input_l,
      const float* input_r,
      float* output_l,
      float* output_r,
      int frames) override {
    if (
        instance_ == nullptr ||
        input_l == nullptr ||
        input_r == nullptr ||
        output_l == nullptr ||
        output_r == nullptr ||
        frames <= 0) {
      return;
    }

    int rendered = 0;
    while (rendered < frames) {
      const int block = std::min(kReverbBlockSize, std::min(max_block_size_, frames - rendered));
      float* input = reverb_instance_get_input_ptr(instance_);
      float* output = reverb_instance_get_output_ptr(instance_);
      for (int i = 0; i < block; ++i) {
        input[i * 2] = input_l[rendered + i];
        input[i * 2 + 1] = input_r[rendered + i];
      }
      reverb_instance_process_block(instance_, block);
      for (int i = 0; i < block; ++i) {
        output_l[rendered + i] = output[i * 2];
        output_r[rendered + i] = output[i * 2 + 1];
      }
      rendered += block;
    }
  }

  int paramCount() const override {
    return kParamCount;
  }

  float* params() override {
    return params_.data();
  }

  void commitParams() override {
    if (instance_ == nullptr) {
      return;
    }

    reverb_instance_set_type(instance_, static_cast<int>(params_[kParamType]));
    reverb_instance_set_quality(instance_, static_cast<int>(params_[kParamQuality]));
    reverb_instance_set_params(
        instance_,
        params_[kParamDecay],
        params_[kParamSize],
        params_[kParamDamping],
        params_[kParamDiffusion],
        params_[kParamModulation],
        params_[kParamPredelay],
        params_[kParamWidth]);
    reverb_instance_set_shimmer(instance_, params_[kParamShimmerAmount], params_[kParamShimmerPitch]);
    reverb_instance_set_slow_mod(instance_, params_[kParamSlowRate], params_[kParamSlowDepth]);
    reverb_instance_set_reverse(instance_, params_[kParamReverseAmount], params_[kParamReverseLength]);
    reverb_instance_set_chorus(instance_, params_[kParamChorusRate], params_[kParamChorusDepth]);
    reverb_instance_set_mod_character(instance_, static_cast<int>(params_[kParamModCharacter]));
    reverb_instance_set_multiband_damp(
        instance_,
        params_[kParamDampLow],
        params_[kParamDampHigh],
        params_[kParamCrossover]);
    reverb_instance_set_input_tone(instance_, params_[kParamInputTone]);
    reverb_instance_set_shimmer_feedback(instance_, params_[kParamShimmerFeedback]);
    reverb_instance_set_warp(instance_, params_[kParamWarp]);
    reverb_instance_set_cross_feed(instance_, params_[kParamCrossFeed]);
    reverb_instance_set_early_reflections(instance_, params_[kParamEarlyReflections]);
    reverb_instance_set_air_absorption(instance_, params_[kParamAirAbsorption]);
    reverb_instance_set_saturation_mode(instance_, static_cast<int>(params_[kParamSaturationMode]));
    reverb_instance_set_transient_smooth(instance_, params_[kParamTransientSmooth]);
    reverb_instance_set_er_lp_freq(instance_, params_[kParamErLpFreq]);
  }

private:
  KesshoReverbInstance* instance_ = nullptr;
  float sample_rate_ = 48000.0f;
  int max_block_size_ = kReverbBlockSize;
  std::array<float, kParamCount> params_{
      1.0f,    // type: hall
      0.0f,    // quality: ultra
      0.8f,    // decay
      1.5f,    // size
      0.5f,    // damping
      0.8f,    // diffusion
      0.3f,    // modulation
      20.0f,   // predelay
      0.8f,    // width
      0.0f,    // shimmer amount
      12.0f,   // shimmer pitch
      0.05f,   // slow rate
      0.0f,    // slow depth
      0.0f,    // reverse amount
      2.0f,    // reverse length
      0.5f,    // chorus rate
      12.0f,   // chorus depth
      2.0f,    // modulation character
      0.1f,    // low-band damping
      0.3f,    // high-band damping
      800.0f,  // crossover
      0.0f,    // input tone
      0.0f,    // shimmer feedback
      0.0f,    // warp
      0.0f,    // cross-feed
      0.3f,    // early reflections
      0.2f,    // air absorption
      0.0f,    // saturation mode
      0.0f,    // transient smooth
      2500.0f  // early-reflection low-pass
  };
};

} // namespace

std::unique_ptr<IKesshoModule> createReverbModule() {
  return std::make_unique<ReverbModule>();
}

} // namespace kessho::core
