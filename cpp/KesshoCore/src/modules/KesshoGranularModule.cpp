#include "KesshoModule.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <memory>

#include "kessho_granular.h"

namespace kessho::core {
namespace {

constexpr int kGranularBlockSize = KESSHO_MAX_BLOCK_SIZE;
constexpr int kGranularRandomSequenceCount = 4096;
constexpr int kGlobalParamCount = 10;
constexpr int kVoiceParamCount = 25;
constexpr int kVoiceParamStart = kGlobalParamCount;
constexpr int kScaleCountParam = kVoiceParamStart + KESSHO_NUM_VOICES * kVoiceParamCount;
constexpr int kScaleIntervalsParam = kScaleCountParam + 1;
constexpr int kChordCountParam = kScaleIntervalsParam + KESSHO_MAX_SCALE_INTERVALS;
constexpr int kChordPitchesParam = kChordCountParam + 1;
constexpr int kChordBiasParam = kChordPitchesParam + KESSHO_MAX_CHORD_PITCHES;
constexpr int kLegacyParamStart = kChordBiasParam + 1;
constexpr int kLegacyParamCount = 6;
constexpr int kExtGlobalParamStart = kLegacyParamStart + kLegacyParamCount;
constexpr int kExtGlobalParamCount = 5;
constexpr int kExtVoiceParamCount = 14;
constexpr int kExtVoiceParamStart = kExtGlobalParamStart + kExtGlobalParamCount;
constexpr int kParamCount = kExtVoiceParamStart + KESSHO_NUM_VOICES * kExtVoiceParamCount;

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

constexpr int kExtGlobalQuality = 0;
constexpr int kExtGlobalMaxGrains = 1;
constexpr int kExtGlobalSprayMacro = 2;
constexpr int kExtGlobalCloudMacro = 3;
constexpr int kExtGlobalPitchMacro = 4;

constexpr int kExtVoicePositionSpray = 0;
constexpr int kExtVoiceTimingSpray = 1;
constexpr int kExtVoiceLookback = 2;
constexpr int kExtVoiceWriteGuard = 3;
constexpr int kExtVoicePitchMode = 4;
constexpr int kExtVoicePitchSpread = 5;
constexpr int kExtVoicePitchJitter = 6;
constexpr int kExtVoicePitchQuantize = 7;
constexpr int kExtVoiceReverseChance = 8;
constexpr int kExtVoiceBloom = 9;
constexpr int kExtVoiceGlide = 10;
constexpr int kExtVoiceCloudStyle = 11;
constexpr int kExtVoiceAnchorPattern = 12;
constexpr int kExtVoiceLoopCrossfade = 13;

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
  params[kExtGlobalParamStart + kExtGlobalQuality] = 1.0f;
  params[kExtGlobalParamStart + kExtGlobalMaxGrains] = 48.0f;
  params[kExtGlobalParamStart + kExtGlobalSprayMacro] = 0.0f;
  params[kExtGlobalParamStart + kExtGlobalCloudMacro] = 0.0f;
  params[kExtGlobalParamStart + kExtGlobalPitchMacro] = 0.0f;
  for (int voice = 0; voice < KESSHO_NUM_VOICES; ++voice) {
    const int ext = kExtVoiceParamStart + voice * kExtVoiceParamCount;
    params[ext + kExtVoicePositionSpray] = 0.3f;
    params[ext + kExtVoiceTimingSpray] = 0.0f;
    params[ext + kExtVoiceLookback] = 0.35f;
    params[ext + kExtVoiceWriteGuard] = 0.3f;
    params[ext + kExtVoicePitchMode] = 0.0f;
    params[ext + kExtVoicePitchSpread] = 0.0f;
    params[ext + kExtVoicePitchJitter] = 4.0f;
    params[ext + kExtVoicePitchQuantize] = 1.0f;
    params[ext + kExtVoiceReverseChance] = 0.0f;
    params[ext + kExtVoiceBloom] = 0.0f;
    params[ext + kExtVoiceGlide] = 0.0f;
    params[ext + kExtVoiceCloudStyle] = 0.0f;
    params[ext + kExtVoiceAnchorPattern] = 0.0f;
    params[ext + kExtVoiceLoopCrossfade] = 12.0f;
  }
  return params;
}

int roundedInt(float value) {
  return static_cast<int>(value >= 0.0f ? value + 0.5f : value - 0.5f);
}

float nextMulberry32(uint32_t& seed) {
  uint32_t t = (seed += 0x6d2b79f5u);
  t = (t ^ (t >> 15u)) * (t | 1u);
  t ^= t + ((t ^ (t >> 7u)) * (t | 61u));
  return static_cast<float>(static_cast<double>(t ^ (t >> 14u)) / 4294967296.0);
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
    params_cache_valid_ = false;
    applied_random_seed_ = 0u;
    prepared_random_seed_ = 0u;
    pending_random_sequence_ready_ = false;
    return true;
  }

  void reset() override {
    if (instance_ != nullptr &&
        granular_instance_reset(instance_, sample_rate_, params_[kParamBufferSeconds]) == 1) {
      params_cache_valid_ = false;
      commitParams();
      applied_random_seed_ = 0u;
      prepared_random_seed_ = 0u;
      pending_random_sequence_ready_ = false;
      prepareRandomSequence(pending_random_seed_);
      commitPreparedRandomSequence();
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
      granular_instance_process_planar(
          instance_,
          input_l + rendered,
          input_r + rendered,
          output_l + rendered,
          output_r + rendered,
          block);
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
    preparePendingRandomSequence();
    if (
        params_cache_valid_ &&
        std::memcmp(params_.data(), committed_params_.data(), params_.size() * sizeof(float)) == 0) {
      commitPreparedRandomSequence();
      return;
    }

    const bool full_commit = !params_cache_valid_;
    const auto changed = [&](int index) -> bool {
      return full_commit || params_[index] != committed_params_[index];
    };
    const auto changed_range = [&](int start, int count) -> bool {
      if (full_commit) {
        return true;
      }
      for (int index = 0; index < count; ++index) {
        if (params_[start + index] != committed_params_[start + index]) {
          return true;
        }
      }
      return false;
    };

    const bool globals_changed =
        changed_range(0, kGlobalParamCount) ||
        changed_range(kScaleCountParam, 1 + KESSHO_MAX_SCALE_INTERVALS) ||
        changed_range(kChordCountParam, 1 + KESSHO_MAX_CHORD_PITCHES + 1) ||
        changed_range(kLegacyParamStart, kLegacyParamCount) ||
        changed_range(kExtGlobalParamStart, kExtGlobalParamCount);

    uint64_t voice_mode_mask = 0u;
    uint64_t voice_advanced_mask = 0u;
    uint64_t voice_position_mask = 0u;
    uint64_t voice_grain_mask = 0u;
    uint64_t voice_output_mask = 0u;
    uint64_t voice_lfo_mask = 0u;
    uint64_t voice_euclid_mask = 0u;
    for (int voice = 0; voice < KESSHO_NUM_VOICES; ++voice) {
      const int base = kVoiceParamStart + voice * kVoiceParamCount;
      const int ext = kExtVoiceParamStart + voice * kExtVoiceParamCount;
      const uint64_t bit = 1ull << static_cast<uint32_t>(voice);
      if (changed(base + kVoiceEnabled) || changed(base + kVoiceMode)) {
        voice_mode_mask |= bit;
      }
      if (changed_range(ext, kExtVoiceParamCount)) {
        voice_advanced_mask |= bit;
      }
      if (changed_range(base + kVoiceSlice, 6)) {
        voice_position_mask |= bit;
      }
      if (changed_range(base + kVoiceDensity, 6)) {
        voice_grain_mask |= bit;
      }
      if (changed_range(base + kVoiceGain, 4)) {
        voice_output_mask |= bit;
      }
      if (changed_range(base + kVoicePosLfoRate, 5)) {
        voice_lfo_mask |= bit;
      }
      if (changed(base + kVoiceEuclidGated) || changed(base + kVoiceEuclidMuted)) {
        voice_euclid_mask |= bit;
      }
    }

    if (globals_changed) {
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
      granular_instance_set_quality_params(
          instance_,
          roundedInt(params_[kExtGlobalParamStart + kExtGlobalQuality]),
          roundedInt(params_[kExtGlobalParamStart + kExtGlobalMaxGrains]),
          params_[kExtGlobalParamStart + kExtGlobalSprayMacro],
          params_[kExtGlobalParamStart + kExtGlobalCloudMacro],
          params_[kExtGlobalParamStart + kExtGlobalPitchMacro]);

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

    for (int voice = 0; voice < KESSHO_NUM_VOICES; ++voice) {
      const int base = kVoiceParamStart + voice * kVoiceParamCount;
      const int ext = kExtVoiceParamStart + voice * kExtVoiceParamCount;
      const uint64_t bit = 1ull << static_cast<uint32_t>(voice);
      if ((voice_mode_mask & bit) != 0u) {
      granular_instance_set_voice_mode(
          instance_,
          voice,
          params_[base + kVoiceEnabled] > 0.5f ? 1 : 0,
          roundedInt(params_[base + kVoiceMode]));
      }
      if ((voice_advanced_mask & bit) != 0u) {
      granular_instance_set_voice_advanced(
          instance_,
          voice,
          params_[ext + kExtVoicePositionSpray],
          params_[ext + kExtVoiceTimingSpray],
          params_[ext + kExtVoiceLookback],
          params_[ext + kExtVoiceWriteGuard],
          roundedInt(params_[ext + kExtVoicePitchMode]),
          params_[ext + kExtVoicePitchSpread],
          params_[ext + kExtVoicePitchJitter],
          params_[ext + kExtVoicePitchQuantize],
          params_[ext + kExtVoiceReverseChance],
          params_[ext + kExtVoiceBloom],
          params_[ext + kExtVoiceGlide],
          roundedInt(params_[ext + kExtVoiceCloudStyle]),
          roundedInt(params_[ext + kExtVoiceAnchorPattern]),
          params_[ext + kExtVoiceLoopCrossfade]);
      }
      if ((voice_position_mask & bit) != 0u) {
      granular_instance_set_voice_position(
          instance_,
          voice,
          roundedInt(params_[base + kVoiceSlice]),
          params_[base + kVoiceSpeed],
          params_[base + kVoiceScanRate],
          params_[base + kVoiceReverse] > 0.5f ? 1 : 0,
          params_[base + kVoicePitch],
          params_[base + kVoiceWriteFollow]);
      }
      if ((voice_grain_mask & bit) != 0u) {
      granular_instance_set_voice_grain(
          instance_,
          voice,
          params_[base + kVoiceDensity],
          params_[base + kVoiceGrainSize],
          params_[base + kVoiceSpray],
          params_[base + kVoiceGrainOct],
          params_[base + kVoiceAttack],
          params_[base + kVoiceDecay]);
      }
      if ((voice_output_mask & bit) != 0u) {
      granular_instance_set_voice_output(
          instance_,
          voice,
          params_[base + kVoiceGain],
          params_[base + kVoicePan],
          params_[base + kVoiceBlur],
          params_[base + kVoiceStereoSpread]);
      }
      if ((voice_lfo_mask & bit) != 0u) {
      granular_instance_set_voice_lfo(
          instance_,
          voice,
          params_[base + kVoicePosLfoRate],
          params_[base + kVoicePosLfoDepth],
          params_[base + kVoicePanLfoRate],
          params_[base + kVoiceReverseLfoRate],
          params_[base + kVoiceRecordLfoRate]);
      }
      if ((voice_euclid_mask & bit) != 0u) {
      granular_instance_set_voice_euclid_gated(
          instance_,
          voice,
          params_[base + kVoiceEuclidGated] > 0.5f ? 1 : 0);
      granular_instance_set_voice_euclid_muted(
          instance_,
          voice,
          params_[base + kVoiceEuclidMuted] > 0.5f ? 1 : 0);
      }
    }

    committed_params_ = params_;
    params_cache_valid_ = true;
    commitPreparedRandomSequence();
  }

  int setRandomSeed(uint32_t seed) override {
    pending_random_seed_ = seed == 0u ? 1u : seed;
    return 1;
  }

  int prepareRandomSeed(uint32_t seed) override {
    pending_random_seed_ = seed == 0u ? 1u : seed;
    preparePendingRandomSequence();
    return 1;
  }

  int activeGrainCount() override {
    return instance_ == nullptr ? 0 : granular_instance_get_active_grain_count(instance_);
  }

  float granularWriteHeadPosition() override {
    return instance_ == nullptr ? 0.0f : granular_instance_get_write_head(instance_);
  }

  void granularVoicePositions(float* out_positions, uint32_t position_count) override {
    if (out_positions == nullptr) {
      return;
    }
    std::array<float, KESSHO_NUM_VOICES> positions{};
    if (instance_ != nullptr) {
      granular_instance_get_voice_positions(instance_, positions.data());
    }
    const uint32_t copy_count = std::min<uint32_t>(position_count, KESSHO_NUM_VOICES);
    for (uint32_t index = 0; index < copy_count; ++index) {
      out_positions[index] = positions[index];
    }
    for (uint32_t index = copy_count; index < position_count; ++index) {
      out_positions[index] = 0.0f;
    }
  }

  int copyGranularVisualEvents(KesshoGranularVisualEventSnapshot* out_events, uint32_t event_count) override {
    if (out_events == nullptr || event_count == 0u) {
      return 0;
    }
    std::array<KesshoGranularVisualEvent, 32> events{};
    const uint32_t request_count = std::min<uint32_t>(event_count, static_cast<uint32_t>(events.size()));
    const int copied = instance_ == nullptr
        ? 0
        : granular_instance_get_visual_events(instance_, events.data(), static_cast<int>(request_count));
    const uint32_t safe_count = std::min<uint32_t>(static_cast<uint32_t>(std::max(copied, 0)), request_count);
    for (uint32_t index = 0; index < safe_count; ++index) {
      out_events[index].position_norm = events[index].position_norm;
      out_events[index].pan = events[index].pan;
      out_events[index].pitch_semi = events[index].pitch_semi;
      out_events[index].gain = events[index].gain;
      out_events[index].length_ms = events[index].length_ms;
      out_events[index].voice = events[index].voice;
      out_events[index].flags = events[index].flags;
      out_events[index].cloud_style = events[index].cloud_style;
    }
    for (uint32_t index = safe_count; index < event_count; ++index) {
      out_events[index] = KesshoGranularVisualEventSnapshot{};
    }
    return static_cast<int>(safe_count);
  }

  int copyGranularWaveform(float* out_peaks, uint32_t bin_count) override {
    if (out_peaks == nullptr || bin_count == 0u) {
      return 0;
    }
    std::fill(out_peaks, out_peaks + bin_count, 0.0f);
    if (instance_ == nullptr) {
      return 0;
    }

    const float* buffer = granular_instance_get_buffer_ptr_l(instance_);
    const int buffer_size_i = granular_instance_get_buffer_size(instance_);
    if (buffer == nullptr || buffer_size_i <= 0) {
      return 0;
    }

    constexpr uint32_t kSamplesPerBin = 8u;
    const uint32_t buffer_size = static_cast<uint32_t>(buffer_size_i);
    for (uint32_t bin = 0u; bin < bin_count; ++bin) {
      const uint32_t start = static_cast<uint32_t>(
          (static_cast<uint64_t>(bin) * buffer_size) / bin_count);
      uint32_t end = static_cast<uint32_t>(
          (static_cast<uint64_t>(bin + 1u) * buffer_size) / bin_count);
      if (end <= start) {
        end = std::min<uint32_t>(start + 1u, buffer_size);
      }
      const uint32_t span = std::max<uint32_t>(1u, end - start);
      float peak = 0.0f;
      for (uint32_t sample_index = 0u; sample_index < kSamplesPerBin; ++sample_index) {
        uint32_t pos = start + static_cast<uint32_t>(
            ((static_cast<uint64_t>(sample_index) * 2u + 1u) * span) / (kSamplesPerBin * 2u));
        if (pos >= end) {
          pos = end - 1u;
        }
        peak = std::max(peak, std::fabs(buffer[pos]));
      }
      out_peaks[bin] = peak;
    }
    return 1;
  }

private:
  void preparePendingRandomSequence() {
    if (pending_random_seed_ == 0u || applied_random_seed_ == pending_random_seed_) {
      return;
    }
    prepareRandomSequence(pending_random_seed_);
  }

  void prepareRandomSequence(uint32_t seed) {
    if (
        seed == 0u ||
        applied_random_seed_ == seed ||
        (pending_random_sequence_ready_ && prepared_random_seed_ == seed)) {
      return;
    }
    uint32_t state = seed;
    for (float& value : pending_random_sequence_) {
      value = nextMulberry32(state);
    }
    prepared_random_seed_ = seed;
    pending_random_sequence_ready_ = true;
  }

  void commitPreparedRandomSequence() {
    if (instance_ == nullptr || pending_random_seed_ == 0u || applied_random_seed_ == pending_random_seed_) {
      return;
    }
    if (!pending_random_sequence_ready_ || prepared_random_seed_ != pending_random_seed_) {
      return;
    }
    granular_instance_set_random_sequence(
        instance_,
        pending_random_sequence_.data(),
        static_cast<int>(pending_random_sequence_.size()));
    applied_random_seed_ = pending_random_seed_;
    pending_random_sequence_ready_ = false;
  }

  KesshoGranularInstance* instance_ = nullptr;
  float sample_rate_ = 48000.0f;
  int max_block_size_ = kGranularBlockSize;
  uint32_t pending_random_seed_ = 1u;
  uint32_t applied_random_seed_ = 0u;
  uint32_t prepared_random_seed_ = 0u;
  std::array<float, kGranularRandomSequenceCount> pending_random_sequence_{};
  bool pending_random_sequence_ready_ = false;
  std::array<float, kParamCount> params_ = makeDefaultParams();
  std::array<float, kParamCount> committed_params_{};
  bool params_cache_valid_ = false;
};

} // namespace

std::unique_ptr<IKesshoModule> createGranularModule() {
  return std::make_unique<GranularModule>();
}

} // namespace kessho::core
