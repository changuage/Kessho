#include "KesshoModule.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <memory>

#include "kessho_spectral_freeze.h"

namespace kessho::core {
namespace {

constexpr int kSpectralFreezeBlockSize = KESSHO_SPECTRAL_FREEZE_MAX_BLOCK_SIZE;
constexpr int kParamActive = 0;
constexpr int kParamMode = 1;
constexpr int kParamCaptureSerial = 2;
constexpr int kParamStretchSpeed = 3;
constexpr int kParamDirection = 4;
constexpr int kParamPosition = 5;
constexpr int kParamRefresh = 6;
constexpr int kParamInputSensitivity = 7;
constexpr int kParamDiffusion = 8;
constexpr int kParamTone = 9;
constexpr int kParamWidth = 10;
constexpr int kParamSustain = 11;
constexpr int kParamMix = 12;
constexpr int kParamTransitionSeconds = 13;
constexpr int kParamCount = 14;

std::array<float, kParamCount> makeDefaultParams() {
  std::array<float, kParamCount> params{};
  params[kParamActive] = 0.0f;
  params[kParamMode] = static_cast<float>(KESSHO_SPECTRAL_FREEZE_MODE_STRETCH);
  params[kParamCaptureSerial] = 0.0f;
  params[kParamStretchSpeed] = 0.5f;
  params[kParamDirection] = static_cast<float>(KESSHO_SPECTRAL_FREEZE_DIRECTION_PING_PONG);
  params[kParamPosition] = 0.0f;
  params[kParamRefresh] = 0.15f;
  params[kParamInputSensitivity] = 0.5f;
  params[kParamDiffusion] = 0.55f;
  params[kParamTone] = -0.15f;
  params[kParamWidth] = 0.85f;
  params[kParamSustain] = 1.0f;
  params[kParamMix] = 1.0f;
  params[kParamTransitionSeconds] = 0.1f;
  return params;
}

class SpectralFreezeModule final : public IKesshoModule {
public:
  ~SpectralFreezeModule() override {
    spectral_freeze_instance_destroy(instance_);
  }

  bool prepare(double sample_rate, int max_block_size) override {
    sample_rate_ = sample_rate > 1000.0 ? static_cast<float>(sample_rate) : 48000.0f;
    max_block_size_ = std::max(1, std::min(max_block_size, kSpectralFreezeBlockSize));
    spectral_freeze_instance_destroy(instance_);
    instance_ = spectral_freeze_instance_create(sample_rate_);
    if (instance_ == nullptr) {
      return false;
    }
    commitParams();
    return true;
  }

  void reset() override {
    if (instance_ != nullptr && spectral_freeze_instance_reset(instance_, sample_rate_) == 1) {
      commitParams();
    }
  }

  void processInterleaved(const float* input_interleaved, float* output_interleaved, int frames) override {
    if (instance_ == nullptr || input_interleaved == nullptr || output_interleaved == nullptr || frames <= 0) {
      return;
    }

    int rendered = 0;
    while (rendered < frames) {
      const int block = std::min(kSpectralFreezeBlockSize, std::min(max_block_size_, frames - rendered));
      float* input = spectral_freeze_instance_get_input_ptr(instance_);
      float* output = spectral_freeze_instance_get_output_ptr(instance_);
      const int sample_count = block * 2;
      std::copy(input_interleaved + rendered * 2, input_interleaved + rendered * 2 + sample_count, input);
      spectral_freeze_instance_process_block(instance_, block);
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

    spectral_freeze_instance_process_planar(instance_, input_l, input_r, output_l, output_r, frames);
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

    spectral_freeze_instance_set_params(
        instance_,
        params_[kParamActive] > 0.5f ? 1 : 0,
        static_cast<int>(std::lround(params_[kParamMode])),
        static_cast<uint32_t>(std::max(0.0f, std::round(params_[kParamCaptureSerial]))),
        params_[kParamStretchSpeed],
        static_cast<int>(std::lround(params_[kParamDirection])),
        params_[kParamPosition],
        params_[kParamRefresh],
        params_[kParamInputSensitivity],
        params_[kParamDiffusion],
        params_[kParamTone],
        params_[kParamWidth],
        params_[kParamSustain],
        params_[kParamMix],
        params_[kParamTransitionSeconds]);
  }

private:
  KesshoSpectralFreezeInstance* instance_ = nullptr;
  float sample_rate_ = 48000.0f;
  int max_block_size_ = kSpectralFreezeBlockSize;
  std::array<float, kParamCount> params_ = makeDefaultParams();
};

} // namespace

std::unique_ptr<IKesshoModule> createSpectralFreezeModule() {
  return std::make_unique<SpectralFreezeModule>();
}

} // namespace kessho::core
