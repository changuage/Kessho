#pragma once

#include <algorithm>
#include <stdint.h>

#include <memory>

namespace kessho::core {

class IKesshoModule {
public:
  virtual ~IKesshoModule() = default;

  virtual bool prepare(double sample_rate, int max_block_size) = 0;
  virtual void reset() = 0;
  virtual void processInterleaved(const float* input_interleaved, float* output_interleaved, int frames) = 0;
  virtual void processPlanarStereo(
      const float* input_l,
      const float* input_r,
      float* output_l,
      float* output_r,
      int frames) = 0;
  virtual int paramCount() const {
    return 0;
  }
  virtual float* params() {
    return nullptr;
  }
  virtual void commitParams() {}
  virtual int noteOn(float frequency, float velocity, float hold_seconds, int lead_index) {
    (void)frequency;
    (void)velocity;
    (void)hold_seconds;
    (void)lead_index;
    return 0;
  }
  virtual int noteOff(int voice_index) {
    (void)voice_index;
    return 0;
  }
  virtual int killVoice(int voice_index) {
    (void)voice_index;
    return 0;
  }
  virtual void allNotesOff() {}
  virtual int activeVoiceCount() {
    return 0;
  }
  virtual int outputTapCount() const {
    return 1;
  }
  virtual void processPlanarStereoTaps(
      const float* input_l,
      const float* input_r,
      float* const* output_l,
      float* const* output_r,
      uint32_t output_bus_count,
      int frames) {
    if (output_bus_count == 0 || output_l == nullptr || output_r == nullptr || frames <= 0) {
      return;
    }

    for (uint32_t bus = 0; bus < output_bus_count; ++bus) {
      if (output_l[bus] == nullptr || output_r[bus] == nullptr) {
        return;
      }
    }

    processPlanarStereo(input_l, input_r, output_l[0], output_r[0], frames);
    for (uint32_t bus = 1; bus < output_bus_count; ++bus) {
      std::fill(output_l[bus], output_l[bus] + frames, 0.0f);
      std::fill(output_r[bus], output_r[bus] + frames, 0.0f);
    }
  }
};

std::unique_ptr<IKesshoModule> createDynamicsCharacterModule();
std::unique_ptr<IKesshoModule> createDynamicsDegradeModule();
std::unique_ptr<IKesshoModule> createReverbModule();
std::unique_ptr<IKesshoModule> createGranularModule();
std::unique_ptr<IKesshoModule> createSpectralFreezeModule();
std::unique_ptr<IKesshoModule> createLeadFmModule();
std::unique_ptr<IKesshoModule> createPadModule();
std::unique_ptr<IKesshoModule> createDrumModule();
std::unique_ptr<IKesshoModule> createSoundscapesModule();
std::unique_ptr<IKesshoModule> createDelayAModule();
std::unique_ptr<IKesshoModule> createDelayBModule();

} // namespace kessho::core
