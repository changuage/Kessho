#include "KesshoModule.h"

#include <algorithm>
#include <array>
#include <memory>

#include "kessho_spectral_freeze.h"

namespace kessho::core {
namespace {

constexpr int kSpectralFreezeBlockSize = KESSHO_SPECTRAL_FREEZE_MAX_BLOCK_SIZE;
constexpr int kParamFreeze = 0;
constexpr int kParamSlushy = 1;
constexpr int kParamSpeed = 2;
constexpr int kParamMix = 3;
constexpr int kParamDecay = 4;
constexpr int kParamPhaseJitter = 5;
constexpr int kParamCount = 6;

std::array<float, kParamCount> makeDefaultParams() {
  std::array<float, kParamCount> params{};
  params[kParamFreeze] = 0.0f;
  params[kParamSlushy] = 0.0f;
  params[kParamSpeed] = 0.0f;
  params[kParamMix] = 1.0f;
  params[kParamDecay] = 0.0f;
  params[kParamPhaseJitter] = 0.0f;
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

    int rendered = 0;
    while (rendered < frames) {
      const int block = std::min(kSpectralFreezeBlockSize, std::min(max_block_size_, frames - rendered));
      float* input = spectral_freeze_instance_get_input_ptr(instance_);
      float* output = spectral_freeze_instance_get_output_ptr(instance_);
      for (int i = 0; i < block; ++i) {
        input[i * 2] = input_l[rendered + i];
        input[i * 2 + 1] = input_r[rendered + i];
      }
      spectral_freeze_instance_process_block(instance_, block);
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

    spectral_freeze_instance_set_freeze(instance_, params_[kParamFreeze] > 0.5f ? 1 : 0);
    spectral_freeze_instance_set_slushy(instance_, params_[kParamSlushy] > 0.5f ? 1 : 0);
    spectral_freeze_instance_set_speed(instance_, params_[kParamSpeed]);
    spectral_freeze_instance_set_mix(instance_, params_[kParamMix]);
    spectral_freeze_instance_set_decay(instance_, params_[kParamDecay]);
    spectral_freeze_instance_set_phase_jitter(instance_, params_[kParamPhaseJitter]);
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
