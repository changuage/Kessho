#include "KesshoModule.h"

#include <algorithm>
#include <array>
#include <memory>

#include "kessho_dynamics_degrade.h"

namespace kessho::core {
namespace {

constexpr int kParamCount = 6;
constexpr int kParamEnabled = 0;
constexpr int kParamMix = 1;
constexpr int kParamAlias = 2;
constexpr int kParamGeneration = 3;
constexpr int kParamCorrosion = 4;
constexpr int kParamWear = 5;

class DynamicsErosionModule final : public IKesshoModule {
public:
  ~DynamicsErosionModule() override {
    dynamics_degrade_instance_destroy(instance_);
  }

  bool prepare(double sample_rate, int max_block_size) override {
    sample_rate_ = sample_rate > 1000.0 ? static_cast<float>(sample_rate) : 44100.0f;
    max_block_size_ = std::max(1, std::min(max_block_size, KESSHO_DYNAMICS_DEGRADE_MAX_BLOCK_SIZE));
    instance_ = dynamics_degrade_instance_create(sample_rate_);
    return instance_ != nullptr;
  }

  void reset() override {
    if (instance_ != nullptr) {
      dynamics_degrade_instance_reset(instance_, sample_rate_);
      commitParams();
    }
  }

  void processInterleaved(const float* input_interleaved, float* output_interleaved, int frames) override {
    if (instance_ == nullptr || input_interleaved == nullptr || output_interleaved == nullptr || frames <= 0) {
      return;
    }

    int rendered = 0;
    while (rendered < frames) {
      const int block = std::min(
          KESSHO_DYNAMICS_DEGRADE_MAX_BLOCK_SIZE,
          std::min(max_block_size_, frames - rendered));
      float* input = dynamics_degrade_instance_get_input_ptr(instance_);
      float* output = dynamics_degrade_instance_get_output_ptr(instance_);
      const int sample_count = block * 2;
      std::copy(input_interleaved + rendered * 2, input_interleaved + rendered * 2 + sample_count, input);
      dynamics_degrade_instance_process_block(instance_, block);
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
      const int block = std::min(
          KESSHO_DYNAMICS_DEGRADE_MAX_BLOCK_SIZE,
          std::min(max_block_size_, frames - rendered));
      float* input = dynamics_degrade_instance_get_input_ptr(instance_);
      float* output = dynamics_degrade_instance_get_output_ptr(instance_);
      for (int i = 0; i < block; ++i) {
        input[i * 2] = input_l[rendered + i];
        input[i * 2 + 1] = input_r[rendered + i];
      }
      dynamics_degrade_instance_process_block(instance_, block);
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
    if (instance_ == nullptr) return;
    dynamics_degrade_instance_set_params(
        instance_,
        params_[kParamEnabled] > 0.5f ? 1 : 0,
        params_[kParamMix],
        params_[kParamAlias],
        params_[kParamGeneration],
        params_[kParamCorrosion],
        params_[kParamWear]);
  }

private:
  KesshoDynamicsDegradeInstance* instance_ = nullptr;
  float sample_rate_ = 44100.0f;
  int max_block_size_ = KESSHO_DYNAMICS_DEGRADE_MAX_BLOCK_SIZE;
  std::array<float, kParamCount> params_{};
};

} // namespace

std::unique_ptr<IKesshoModule> createDynamicsErosionModule() {
  return std::make_unique<DynamicsErosionModule>();
}

} // namespace kessho::core
