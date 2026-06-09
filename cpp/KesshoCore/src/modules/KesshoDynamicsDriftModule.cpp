#include "KesshoModule.h"

#include <algorithm>
#include <cstring>
#include <memory>

#include "kessho_dynamics_drift.h"

namespace kessho::core {
namespace {

class DynamicsDriftModule final : public IKesshoModule {
public:
  ~DynamicsDriftModule() override {
    dynamics_drift_instance_destroy(instance_);
  }

  bool prepare(double sample_rate, int max_block_size) override {
    sample_rate_ = sample_rate;
    max_block_size_ = std::max(1, max_block_size);
    dynamics_drift_instance_destroy(instance_);
    instance_ = nullptr;
    instance_ = dynamics_drift_instance_create(static_cast<float>(sample_rate_));
    return instance_ != nullptr;
  }

  void reset() override {
    if (instance_ != nullptr) {
      dynamics_drift_instance_reset(instance_, static_cast<float>(sample_rate_));
    }
  }

  void processInterleaved(const float* input_interleaved, float* output_interleaved, int frames) override {
    if (instance_ == nullptr || input_interleaved == nullptr || output_interleaved == nullptr || frames <= 0) {
      return;
    }

    int rendered = 0;
    while (rendered < frames) {
      const int block = std::min(
          KESSHO_DYNAMICS_DRIFT_MAX_BLOCK_SIZE,
          std::min(max_block_size_, frames - rendered));
      float* input = dynamics_drift_instance_get_input_ptr(instance_);
      float* output = dynamics_drift_instance_get_output_ptr(instance_);
      const int sample_count = block * 2;
      std::memcpy(input, input_interleaved + rendered * 2, static_cast<size_t>(sample_count) * sizeof(float));
      dynamics_drift_instance_process_block(instance_, block);
      std::memcpy(output_interleaved + rendered * 2, output, static_cast<size_t>(sample_count) * sizeof(float));
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
          KESSHO_DYNAMICS_DRIFT_MAX_BLOCK_SIZE,
          std::min(max_block_size_, frames - rendered));
      float* input = dynamics_drift_instance_get_input_ptr(instance_);
      float* output = dynamics_drift_instance_get_output_ptr(instance_);
      for (int i = 0; i < block; ++i) {
        input[i * 2] = input_l[rendered + i];
        input[i * 2 + 1] = input_r[rendered + i];
      }
      dynamics_drift_instance_process_block(instance_, block);
      for (int i = 0; i < block; ++i) {
        output_l[rendered + i] = output[i * 2];
        output_r[rendered + i] = output[i * 2 + 1];
      }
      rendered += block;
    }
  }

  int paramCount() const override {
    return KESSHO_DYNAMICS_DRIFT_PARAM_COUNT;
  }

  float* params() override {
    return instance_ != nullptr ? dynamics_drift_instance_get_params_ptr(instance_) : nullptr;
  }

  void commitParams() override {
    if (instance_ != nullptr) {
      dynamics_drift_instance_commit_params(instance_);
    }
  }

private:
  double sample_rate_ = 48000.0;
  int max_block_size_ = KESSHO_DYNAMICS_DRIFT_MAX_BLOCK_SIZE;
  KesshoDynamicsDriftInstance* instance_ = nullptr;
};

} // namespace

std::unique_ptr<IKesshoModule> createDynamicsDriftModule() {
  return std::make_unique<DynamicsDriftModule>();
}

} // namespace kessho::core
