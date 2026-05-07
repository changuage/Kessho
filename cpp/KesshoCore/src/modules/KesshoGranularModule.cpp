#include "KesshoModule.h"

#include <algorithm>
#include <array>
#include <memory>

#include "kessho_granular.h"

namespace kessho::core {
namespace {

constexpr int kGranularBlockSize = KESSHO_MAX_BLOCK_SIZE;
constexpr int kGlobalParamCount = 10;
constexpr int kVoiceParamCount = 25;
constexpr int kVoiceParamStart = kGlobalParamCount;
constexpr int kScaleCountParam = kVoiceParamStart + KESSHO_NUM_VOICES * kVoiceParamCount;
constexpr int kScaleIntervalsParam = kScaleCountParam + 1;
constexpr int kChordCountParam = kScaleIntervalsParam + KESSHO_MAX_SCALE_INTERVALS;
constexpr int kChordPitchesParam = kChordCountParam + 1;
constexpr int kChordBiasParam = kChordPitchesParam + KESSHO_MAX_CHORD_PITCHES;
constexpr int kLegacyParamStart = kChordBiasParam + 1;
constexpr int kParamCount = kLegacyParamStart + 6;

constexpr int kParamEnabled = 0;
constexpr int kParamFreeze = 1;
constexpr int kParamFreezeWithFeedback = 2;
constexpr int kParamDryWet = 3;
constexpr int kParamFeedback = 4;
constexpr int kParamFeedbackLpf = 5;
constexpr int kParamBufferSeconds = 6;
constexpr int kParamGrainShape = 7;
constexpr int kParamBusDiffusion = 8;
constexpr int kParamTimingRandomness = 9;

constexpr int kVoiceEnabled = 0;
constexpr int kVoiceMode = 1;
constexpr int kVoiceSlice = 2;
constexpr int kVoiceSpeed = 3;
constexpr int kVoiceScanRate = 4;
constexpr int kVoiceReverse = 5;
constexpr int kVoicePitch = 6;
constexpr int kVoiceWriteFollow = 7;
constexpr int kVoiceDensity = 8;
constexpr int kVoiceGrainSize = 9;
constexpr int kVoiceSpray = 10;
constexpr int kVoiceGrainOct = 11;
constexpr int kVoiceAttack = 12;
constexpr int kVoiceDecay = 13;
constexpr int kVoiceGain = 14;
constexpr int kVoicePan = 15;
constexpr int kVoiceBlur = 16;
constexpr int kVoiceStereoSpread = 17;
constexpr int kVoicePosLfoRate = 18;
constexpr int kVoicePosLfoDepth = 19;
constexpr int kVoicePanLfoRate = 20;
constexpr int kVoiceReverseLfoRate = 21;
constexpr int kVoiceRecordLfoRate = 22;
constexpr int kVoiceEuclidGated = 23;
constexpr int kVoiceEuclidMuted = 24;

std::array<float, kParamCount> makeDefaultParams() {
  std::array<float, kParamCount> params{};
  params[kParamEnabled] = 1.0f;
  params[kParamFreeze] = 0.0f;
  params[kParamFreezeWithFeedback] = 0.0f;
  params[kParamDryWet] = 0.3f;
  params[kParamFeedback] = 0.1f;
  params[kParamFeedbackLpf] = 8000.0f;
  params[kParamBufferSeconds] = 16.0f;
  params[kParamGrainShape] = KESSHO_GRAIN_SHAPE_TRIANGLE;
  params[kParamBusDiffusion] = 0.0f;
  params[kParamTimingRandomness] = 0.35f;

  for (int voice = 0; voice < KESSHO_NUM_VOICES; ++voice) {
    const int base = kVoiceParamStart + voice * kVoiceParamCount;
    params[base + kVoiceEnabled] = voice == 0 ? 1.0f : 0.0f;
    params[base + kVoiceMode] = KESSHO_MODE_GRANULAR;
    params[base + kVoiceSlice] = static_cast<float>(voice * 4);
    params[base + kVoiceSpeed] = 1.0f;
    params[base + kVoiceScanRate] = 1.0f;
    params[base + kVoiceReverse] = 0.0f;
    params[base + kVoicePitch] = 0.0f;
    params[base + kVoiceWriteFollow] = 0.0f;
    params[base + kVoiceDensity] = 20.0f;
    params[base + kVoiceGrainSize] = 80.0f;
    params[base + kVoiceSpray] = 0.3f;
    params[base + kVoiceGrainOct] = 0.0f;
    params[base + kVoiceAttack] = 0.003f;
    params[base + kVoiceDecay] = 0.5f;
    params[base + kVoiceGain] = 0.5f;
    params[base + kVoicePan] = 0.0f;
    params[base + kVoiceBlur] = 0.0f;
    params[base + kVoiceStereoSpread] = 0.5f;
    params[base + kVoicePosLfoRate] = 0.0f;
    params[base + kVoicePosLfoDepth] = 0.0f;
    params[base + kVoicePanLfoRate] = 0.0f;
    params[base + kVoiceReverseLfoRate] = 0.0f;
    params[base + kVoiceRecordLfoRate] = 0.0f;
    params[base + kVoiceEuclidGated] = 0.0f;
    params[base + kVoiceEuclidMuted] = 0.0f;
  }

  params[kScaleCountParam] = 0.0f;
  params[kChordCountParam] = 0.0f;
  params[kChordBiasParam] = 0.0f;
  params[kLegacyParamStart] = 10.0f;
  params[kLegacyParamStart + 1] = 0.8f;
  params[kLegacyParamStart + 2] = KESSHO_PITCH_HARMONIC;
  params[kLegacyParamStart + 3] = 2.0f;
  params[kLegacyParamStart + 4] = KESSHO_MAX_TOTAL_GRAINS;
  params[kLegacyParamStart + 5] = 0.1f;
  return params;
}

int roundedInt(float value) {
  return static_cast<int>(value >= 0.0f ? value + 0.5f : value - 0.5f);
}

class GranularModule final : public IKesshoModule {
public:
  ~GranularModule() override {
    granular_instance_destroy(instance_);
  }

  bool prepare(double sample_rate, int max_block_size) override {
    sample_rate_ = sample_rate > 1000.0 ? static_cast<float>(sample_rate) : 48000.0f;
    max_block_size_ = std::max(1, std::min(max_block_size, kGranularBlockSize));
    granular_instance_destroy(instance_);
    instance_ = granular_instance_create(sample_rate_, params_[kParamBufferSeconds]);
    if (instance_ == nullptr) {
      return false;
    }
    commitParams();
    return true;
  }

  void reset() override {
    if (instance_ != nullptr &&
        granular_instance_reset(instance_, sample_rate_, params_[kParamBufferSeconds]) == 1) {
      commitParams();
    }
  }

  void processInterleaved(const float* input_interleaved, float* output_interleaved, int frames) override {
    if (instance_ == nullptr || input_interleaved == nullptr || output_interleaved == nullptr || frames <= 0) {
      return;
    }

    int rendered = 0;
    while (rendered < frames) {
      const int block = std::min(kGranularBlockSize, std::min(max_block_size_, frames - rendered));
      float* input = granular_instance_get_input_ptr(instance_);
      float* output = granular_instance_get_output_ptr(instance_);
      const int sample_count = block * 2;
      std::copy(input_interleaved + rendered * 2, input_interleaved + rendered * 2 + sample_count, input);
      granular_instance_process_block(instance_, block);
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
      const int block = std::min(kGranularBlockSize, std::min(max_block_size_, frames - rendered));
      float* input = granular_instance_get_input_ptr(instance_);
      float* output = granular_instance_get_output_ptr(instance_);
      for (int i = 0; i < block; ++i) {
        input[i * 2] = input_l[rendered + i];
        input[i * 2 + 1] = input_r[rendered + i];
      }
      granular_instance_process_block(instance_, block);
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

    granular_instance_set_enabled(instance_, params_[kParamEnabled] > 0.5f ? 1 : 0);
    granular_instance_set_freeze(
        instance_,
        params_[kParamFreeze] > 0.5f ? 1 : 0,
        params_[kParamFreezeWithFeedback] > 0.5f ? 1 : 0);
    granular_instance_set_dry_wet(instance_, params_[kParamDryWet]);
    granular_instance_set_feedback(instance_, params_[kParamFeedback], params_[kParamFeedbackLpf]);
    granular_instance_set_buffer_size(instance_, params_[kParamBufferSeconds]);
    granular_instance_set_grain_shape(instance_, roundedInt(params_[kParamGrainShape]));
    granular_instance_set_bus_diffusion(instance_, params_[kParamBusDiffusion]);
    granular_instance_set_timing_randomness(instance_, params_[kParamTimingRandomness]);

    for (int voice = 0; voice < KESSHO_NUM_VOICES; ++voice) {
      const int base = kVoiceParamStart + voice * kVoiceParamCount;
      granular_instance_set_voice_mode(
          instance_,
          voice,
          params_[base + kVoiceEnabled] > 0.5f ? 1 : 0,
          roundedInt(params_[base + kVoiceMode]));
      granular_instance_set_voice_position(
          instance_,
          voice,
          roundedInt(params_[base + kVoiceSlice]),
          params_[base + kVoiceSpeed],
          params_[base + kVoiceScanRate],
          params_[base + kVoiceReverse] > 0.5f ? 1 : 0,
          params_[base + kVoicePitch],
          params_[base + kVoiceWriteFollow]);
      granular_instance_set_voice_grain(
          instance_,
          voice,
          params_[base + kVoiceDensity],
          params_[base + kVoiceGrainSize],
          params_[base + kVoiceSpray],
          params_[base + kVoiceGrainOct],
          params_[base + kVoiceAttack],
          params_[base + kVoiceDecay]);
      granular_instance_set_voice_output(
          instance_,
          voice,
          params_[base + kVoiceGain],
          params_[base + kVoicePan],
          params_[base + kVoiceBlur],
          params_[base + kVoiceStereoSpread]);
      granular_instance_set_voice_lfo(
          instance_,
          voice,
          params_[base + kVoicePosLfoRate],
          params_[base + kVoicePosLfoDepth],
          params_[base + kVoicePanLfoRate],
          params_[base + kVoiceReverseLfoRate],
          params_[base + kVoiceRecordLfoRate]);
      granular_instance_set_voice_euclid_gated(
          instance_,
          voice,
          params_[base + kVoiceEuclidGated] > 0.5f ? 1 : 0);
      granular_instance_set_voice_euclid_muted(
          instance_,
          voice,
          params_[base + kVoiceEuclidMuted] > 0.5f ? 1 : 0);
    }

    std::array<int, KESSHO_MAX_SCALE_INTERVALS> scale_intervals{};
    const int scale_count = std::clamp(roundedInt(params_[kScaleCountParam]), 0, KESSHO_MAX_SCALE_INTERVALS);
    for (int i = 0; i < scale_count; ++i) {
      scale_intervals[i] = roundedInt(params_[kScaleIntervalsParam + i]);
    }
    granular_instance_set_scale(instance_, scale_intervals.data(), scale_count);

    std::array<int, KESSHO_MAX_CHORD_PITCHES> chord_pitches{};
    const int chord_count = std::clamp(roundedInt(params_[kChordCountParam]), 0, KESSHO_MAX_CHORD_PITCHES);
    for (int i = 0; i < chord_count; ++i) {
      chord_pitches[i] = roundedInt(params_[kChordPitchesParam + i]);
    }
    granular_instance_set_chord_bias(
        instance_,
        chord_pitches.data(),
        chord_count,
        params_[kChordBiasParam]);

    granular_instance_set_legacy_params(
        instance_,
        params_[kLegacyParamStart],
        params_[kLegacyParamStart + 1],
        roundedInt(params_[kLegacyParamStart + 2]),
        params_[kLegacyParamStart + 3],
        roundedInt(params_[kLegacyParamStart + 4]),
        params_[kLegacyParamStart + 5]);
  }

private:
  KesshoGranularInstance* instance_ = nullptr;
  float sample_rate_ = 48000.0f;
  int max_block_size_ = kGranularBlockSize;
  std::array<float, kParamCount> params_ = makeDefaultParams();
};

} // namespace

std::unique_ptr<IKesshoModule> createGranularModule() {
  return std::make_unique<GranularModule>();
}

} // namespace kessho::core
