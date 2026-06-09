#pragma once

#include <algorithm>
#include <stdint.h>

#include <memory>

namespace kessho::core {

constexpr uint32_t KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT = 53u;
constexpr uint32_t KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT = 80u;
constexpr uint32_t KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT = 126u;

struct KesshoSourcePresetPatch {
  uint32_t exact_pad_param_count = 0u;
  float exact_pad_params[KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT]{};
  uint32_t exact_lead_param_count = 0u;
  float exact_lead_params[KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT]{};
  uint32_t exact_drum_param_count = 0u;
  float exact_drum_params[KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT]{};
};

struct KesshoGranularVisualEventSnapshot {
  float position_norm = 0.0f;
  float pan = 0.0f;
  float pitch_semi = 0.0f;
  float gain = 0.0f;
  float length_ms = 0.0f;
  int32_t voice = 0;
  int32_t flags = 0;
  int32_t cloud_style = 0;
};

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
  virtual int setIndexedParam(int param_index, float value) {
    float* module_params = params();
    if (module_params == nullptr || param_index < 0 || param_index >= paramCount()) {
      return 0;
    }
    module_params[param_index] = value;
    commitParams();
    return 1;
  }
  virtual int noteOn(float frequency, float velocity, float hold_seconds, int lead_index) {
    (void)frequency;
    (void)velocity;
    (void)hold_seconds;
    (void)lead_index;
    return 0;
  }
  virtual int setVoiceFrequency(int voice_index, float frequency) {
    (void)voice_index;
    (void)frequency;
    return 0;
  }
  virtual int setTriggerMacros(float morph, float distance, float expression) {
    (void)morph;
    (void)distance;
    (void)expression;
    return 0;
  }
  virtual int setTriggerControls(
      float morph,
      float distance,
      float expression,
      float pitch,
      float ratchet_decay_cap,
      float ratchet_attack_cap) {
    (void)pitch;
    (void)ratchet_decay_cap;
    (void)ratchet_attack_cap;
    return setTriggerMacros(morph, distance, expression);
  }
  virtual int setSourceMacros(int source_index, float morph, float distance, float expression) {
    (void)source_index;
    return setTriggerMacros(morph, distance, expression);
  }
  virtual int setSourcePresetPatch(int source_index, const KesshoSourcePresetPatch& patch) {
    (void)source_index;
    (void)patch;
    return 0;
  }
  virtual int setVoiceSend(int voice_index, float delay_send) {
    (void)voice_index;
    (void)delay_send;
    return 0;
  }
  virtual int setRandomSeed(uint32_t seed) {
    (void)seed;
    return 0;
  }
  virtual int noteOff(int voice_index) {
    (void)voice_index;
    return 0;
  }
  virtual int lastTriggeredVoiceIndex() const {
    return -1;
  }
  virtual float lastTriggeredFrequencyHz() const {
    return 0.0f;
  }
  virtual int killVoice(int voice_index) {
    (void)voice_index;
    return 0;
  }
  virtual void allNotesOff() {}
  virtual int activeVoiceCount() {
    return 0;
  }
  virtual void advancePadIdleTelemetry(int source_index, int frames) {
    (void)source_index;
    (void)frames;
  }
  virtual float currentPadFilterFrequency(int source_index) {
    (void)source_index;
    return 0.0f;
  }
  virtual float currentPadLfoValue(int source_index) {
    (void)source_index;
    return 0.0f;
  }
  virtual int activeGrainCount() {
    return 0;
  }
  virtual float granularWriteHeadPosition() {
    return 0.0f;
  }
  virtual void granularVoicePositions(float* out_positions, uint32_t position_count) {
    if (out_positions == nullptr) {
      return;
    }
    for (uint32_t index = 0; index < position_count; ++index) {
      out_positions[index] = 0.0f;
    }
  }
  virtual int copyGranularWaveform(float* out_peaks, uint32_t bin_count) {
    if (out_peaks != nullptr) {
      std::fill(out_peaks, out_peaks + bin_count, 0.0f);
    }
    return 0;
  }
  virtual int copyGranularVisualEvents(KesshoGranularVisualEventSnapshot* out_events, uint32_t event_count) {
    if (out_events != nullptr) {
      std::fill(out_events, out_events + event_count, KesshoGranularVisualEventSnapshot{});
    }
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

std::unique_ptr<IKesshoModule> createDynamicsDriftModule();
std::unique_ptr<IKesshoModule> createDynamicsErosionModule();
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
