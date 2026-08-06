#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <limits>
#include <vector>

#include "KesshoCore/KesshoProductCore.h"
#include "KesshoProductParamIds.h"
#include "KesshoProductSchema.h"
#include "../src/modules/KesshoModule.h"
#include "ProductSnapshotTestHelpers.h"

namespace {

constexpr float kDrumSubMidiNote = 35.0f;

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Kessho Product Source Wrapper test failed: " << message << "\n";
    std::exit(1);
  }
}

void enableGraphTaps(KesshoProductEngine* engine, const char* message) {
  require(kessho_product_set_graph_taps_enabled(engine, 1u) == KESSHO_PRODUCT_OK, message);
}

float peakRange(const std::vector<float>& left, const std::vector<float>& right, uint32_t begin, uint32_t end) {
  float result = 0.0f;
  for (uint32_t i = begin; i < end; ++i) {
    require(std::isfinite(left[i]) && std::isfinite(right[i]), "non-finite output sample");
    result = std::max(result, std::fabs(left[i]));
    result = std::max(result, std::fabs(right[i]));
  }
  return result;
}

float peakSamples(const std::vector<float>& samples) {
  float result = 0.0f;
  for (const float sample : samples) {
    require(std::isfinite(sample), "non-finite output sample");
    result = std::max(result, std::fabs(sample));
  }
  return result;
}

float maxAbsDiff(const std::vector<float>& a, const std::vector<float>& b) {
  require(a.size() == b.size(), "sample buffers have different sizes");
  float result = 0.0f;
  for (std::size_t i = 0; i < a.size(); ++i) {
    require(std::isfinite(a[i]) && std::isfinite(b[i]), "non-finite output sample");
    result = std::max(result, std::fabs(a[i] - b[i]));
  }
  return result;
}

float renderPeakBlocks(KesshoProductEngine* engine, uint32_t blocks = 64) {
  std::vector<float> left(128);
  std::vector<float> right(128);
  float result = 0.0f;
  for (uint32_t block = 0; block < blocks; ++block) {
    std::fill(left.begin(), left.end(), 0.0f);
    std::fill(right.begin(), right.end(), 0.0f);
    kessho_product_render(engine, left.data(), right.data(), 128);
    result = std::max(result, peakRange(left, right, 0, 128));
  }
  return result;
}

float renderRmsBlocks(KesshoProductEngine* engine, uint32_t blocks = 64) {
  std::vector<float> left(128);
  std::vector<float> right(128);
  double sum = 0.0;
  uint32_t count = 0;
  for (uint32_t block = 0; block < blocks; ++block) {
    std::fill(left.begin(), left.end(), 0.0f);
    std::fill(right.begin(), right.end(), 0.0f);
    kessho_product_render(engine, left.data(), right.data(), 128);
    for (uint32_t i = 0; i < 128; ++i) {
      require(std::isfinite(left[i]) && std::isfinite(right[i]), "non-finite output sample");
      sum += static_cast<double>(left[i]) * static_cast<double>(left[i]);
      sum += static_cast<double>(right[i]) * static_cast<double>(right[i]);
      count += 2u;
    }
  }
  return std::sqrt(sum / static_cast<double>(std::max<uint32_t>(1u, count)));
}

struct RenderStemPeaks {
  float output_peak = 0.0f;
  float stem_peak = 0.0f;
  uint32_t max_active_voices = 0u;
};

RenderStemPeaks renderAndStemPeakBlocks(KesshoProductEngine* engine, uint32_t stem_id, uint32_t blocks = 64) {
  require(kessho_product_set_stems_enabled(engine, 1u) == KESSHO_PRODUCT_OK, "stem enable failed");
  std::vector<float> left(128);
  std::vector<float> right(128);
  std::vector<float> stem_l(128);
  std::vector<float> stem_r(128);
  RenderStemPeaks peaks{};
  for (uint32_t block = 0; block < blocks; ++block) {
    std::fill(left.begin(), left.end(), 0.0f);
    std::fill(right.begin(), right.end(), 0.0f);
    kessho_product_render(engine, left.data(), right.data(), 128);
    peaks.output_peak = std::max(peaks.output_peak, peakRange(left, right, 0, 128));
    require(kessho_product_get_stem(engine, stem_id, stem_l.data(), stem_r.data(), 128) == KESSHO_PRODUCT_OK, "stem read failed");
    peaks.stem_peak = std::max(peaks.stem_peak, peakRange(stem_l, stem_r, 0, 128));
    const KesshoProductTelemetry telemetry = kessho_product_get_telemetry(engine);
    peaks.max_active_voices = std::max(peaks.max_active_voices, telemetry.active_voices);
  }
  return peaks;
}

float renderDeltaRmsBlocks(KesshoProductEngine* engine, uint32_t blocks = 64) {
  std::vector<float> left(128);
  std::vector<float> right(128);
  double sum = 0.0;
  uint32_t count = 0;
  float previous_left = 0.0f;
  float previous_right = 0.0f;
  for (uint32_t block = 0; block < blocks; ++block) {
    std::fill(left.begin(), left.end(), 0.0f);
    std::fill(right.begin(), right.end(), 0.0f);
    kessho_product_render(engine, left.data(), right.data(), 128);
    for (uint32_t i = 0; i < 128; ++i) {
      require(std::isfinite(left[i]) && std::isfinite(right[i]), "non-finite output sample");
      const float delta_left = left[i] - previous_left;
      const float delta_right = right[i] - previous_right;
      sum += static_cast<double>(delta_left) * static_cast<double>(delta_left);
      sum += static_cast<double>(delta_right) * static_cast<double>(delta_right);
      previous_left = left[i];
      previous_right = right[i];
      count += 2;
    }
  }
  return std::sqrt(sum / static_cast<double>(std::max<uint32_t>(1u, count)));
}

struct TestBiquad {
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

TestBiquad makeTestHighpass(float cutoff_hz, float sample_rate) {
  TestBiquad filter{};
  constexpr double kTwoPi = 6.283185307179586476925286766559;
  constexpr float kWebAudioQ07 = 1.0839269140212036f;
  const float cutoff = std::max(20.0f, std::min(cutoff_hz, sample_rate * 0.499f));
  const float omega = static_cast<float>((kTwoPi * static_cast<double>(cutoff)) / sample_rate);
  const float sin_omega = std::sin(omega);
  const float cos_omega = std::cos(omega);
  const float alpha = sin_omega / (2.0f * kWebAudioQ07);
  const float a0 = 1.0f + alpha;
  filter.b0 = ((1.0f + cos_omega) * 0.5f) / a0;
  filter.b1 = -(1.0f + cos_omega) / a0;
  filter.b2 = ((1.0f + cos_omega) * 0.5f) / a0;
  filter.a1 = (-2.0f * cos_omega) / a0;
  filter.a2 = (1.0f - alpha) / a0;
  return filter;
}

float processTestBiquad(TestBiquad& filter, float input) {
  const float y =
      filter.b0 * input +
      filter.b1 * filter.x1 +
      filter.b2 * filter.x2 -
      filter.a1 * filter.y1 -
      filter.a2 * filter.y2;
  filter.x2 = filter.x1;
  filter.x1 = input;
  filter.y2 = filter.y1;
  filter.y1 = std::isfinite(y) ? y : 0.0f;
  return filter.y1;
}

float renderHighpassRmsBlocks(KesshoProductEngine* engine, float highpass_hz, uint32_t blocks = 64) {
  std::vector<float> left(128);
  std::vector<float> right(128);
  TestBiquad highpass_l = makeTestHighpass(highpass_hz, 48000.0f);
  TestBiquad highpass_r = makeTestHighpass(highpass_hz, 48000.0f);
  double sum = 0.0;
  uint32_t count = 0;
  for (uint32_t block = 0; block < blocks; ++block) {
    std::fill(left.begin(), left.end(), 0.0f);
    std::fill(right.begin(), right.end(), 0.0f);
    kessho_product_render(engine, left.data(), right.data(), 128);
    for (uint32_t i = 0; i < 128; ++i) {
      require(std::isfinite(left[i]) && std::isfinite(right[i]), "non-finite output sample");
      const float high_l = processTestBiquad(highpass_l, left[i]);
      const float high_r = processTestBiquad(highpass_r, right[i]);
      sum += static_cast<double>(high_l) * static_cast<double>(high_l);
      sum += static_cast<double>(high_r) * static_cast<double>(high_r);
      count += 2u;
    }
  }
  return std::sqrt(sum / static_cast<double>(std::max<uint32_t>(1u, count)));
}

const kessho::product::generated::KesshoProductGeneratedSourcePreset* generatedPreset(uint32_t preset_id) {
  for (const auto& preset : kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESETS) {
    if (preset.id == preset_id) {
      return &preset;
    }
  }
  return nullptr;
}

uint32_t generatedSourcePresetCount() {
  return static_cast<uint32_t>(
      sizeof(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESETS) /
      sizeof(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESETS[0]));
}

bool generatedSourceMatches(
    const kessho::product::generated::KesshoProductGeneratedSourcePreset& preset,
    const char* source) {
  return std::strcmp(preset.source, source) == 0;
}

bool generatedMacrosAreFinite(const kessho::product::generated::KesshoProductGeneratedSourcePreset& preset) {
  return std::isfinite(preset.macro_morph) && std::isfinite(preset.macro_distance) &&
      std::isfinite(preset.macro_expression);
}

const kessho::product::generated::KesshoProductGeneratedDrumVoicePreset* generatedDrumVoicePreset(
    uint32_t voice_index,
    const char* name) {
  for (const auto& preset : kessho::product::generated::KESSHO_PRODUCT_DRUM_VOICE_PRESETS) {
    if (preset.voice_index == voice_index && std::strcmp(preset.name, name) == 0) {
      return &preset;
    }
  }
  return nullptr;
}

KesshoProductSnapshotV2 makeSnapshot() {
  KesshoProductSnapshotV2 snapshot{};
  snapshot.version = KESSHO_PRODUCT_SNAPSHOT_VERSION;
  snapshot.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
  snapshot.transport.running = 0;
  snapshot.transport.bpm = 120.0f;
  snapshot.transport.beats_per_bar = 4;
  snapshot.transport.bars_per_phrase = 4;
  snapshot.harmony.root_midi = 60.0f;
  snapshot.harmony.scale_id = 1;
  snapshot.harmony.tension = 0.3f;
  snapshot.master.gain = 1.0f;
  snapshot.rng.seed = 91;
  snapshot.rng.state = 91;
  for (uint32_t i = 0; i < kessho::product::internal::kSourceCount; ++i) {
    snapshot.sources[i].enabled = 1;
    snapshot.sources[i].source_id = i + 1;
    snapshot.sources[i].level = 0.9f;
    snapshot.sources[i].dry_gain = 1.0f;
    snapshot.sources[i].expression = 0.8f;
    snapshot.sources[i].post_lpf_hz = 18000.0f;
    snapshot.sources[i].stereo_width = 1.0f;
  }
  kessho::product::tests::applyGeneratedSourceDefaults(snapshot);
  return snapshot;
}

void appendPadOverride(KesshoProductSourceSnapshot& source, uint32_t param_index, float value) {
  require(source.pad_override_count < kessho::product::generated::KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT, "too many Pad overrides");
  const uint32_t slot = source.pad_override_count++;
  source.pad_override_indices[slot] = param_index;
  source.pad_override_values[slot] = value;
}

void appendLeadOverride(KesshoProductSourceSnapshot& source, uint32_t param_index, float value) {
  require(source.lead_override_count < kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT, "too many Lead overrides");
  const uint32_t slot = source.lead_override_count++;
  source.lead_override_indices[slot] = param_index;
  source.lead_override_values[slot] = value;
}

void appendDrumOverride(KesshoProductSourceSnapshot& source, uint32_t param_index, float value) {
  require(source.drum_override_count < kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_PARAM_COUNT, "too many Drum overrides");
  const uint32_t slot = source.drum_override_count++;
  source.drum_override_indices[slot] = param_index;
  source.drum_override_values[slot] = value;
}

void requireGeneratedSourcePresetFamilyCoverage() {
  using namespace kessho::product::generated;

  require(
      generatedSourcePresetCount() == KESSHO_PRODUCT_SOURCE_PRESET_COUNT,
      "generated source preset array count does not match schema count");

  uint32_t pad_count = 0;
  uint32_t lead_count = 0;
  uint32_t drum_count = 0;
  uint32_t sample_count = 0;
  uint32_t soundscape_count = 0;
  uint32_t water_soundscape_count = 0;

  for (const auto& preset : KESSHO_PRODUCT_SOURCE_PRESETS) {
    require(preset.name != nullptr && std::strlen(preset.name) > 0, "generated source preset name missing");
    require(preset.source != nullptr && std::strlen(preset.source) > 0, "generated source preset source missing");
    require(preset.key != nullptr && std::strlen(preset.key) > 0, "generated source preset key missing");
    require(generatedMacrosAreFinite(preset), "generated source preset macros contain non-finite value");

    if (generatedSourceMatches(preset, "pad")) {
      ++pad_count;
      require(preset.id >= KESSHO_PRODUCT_SOURCE_PRESET_PAD_INIT, "generated pad preset id below pad range");
      require(preset.id <= KESSHO_PRODUCT_SOURCE_PRESET_PAD_CLASSIC_MOOG_BASS, "generated pad preset id above pad range");
      continue;
    }

    if (generatedSourceMatches(preset, "lead")) {
      ++lead_count;
      require(preset.id >= KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES, "generated lead preset id below lead range");
      require(preset.id <= KESSHO_PRODUCT_SOURCE_PRESET_LEAD_GAMELAN, "generated lead preset id above lead range");
      continue;
    }

    if (generatedSourceMatches(preset, "drum")) {
      ++drum_count;
      require(preset.id == KESSHO_PRODUCT_SOURCE_PRESET_DRUM_DEFAULT, "generated drum preset id mismatch");
      continue;
    }

    if (generatedSourceMatches(preset, "sample")) {
      ++sample_count;
      require(preset.id == KESSHO_PRODUCT_SOURCE_PRESET_PIANO_DEFAULT, "generated sample preset id mismatch");
      continue;
    }

    if (generatedSourceMatches(preset, "soundscape")) {
      ++soundscape_count;
      require(preset.id >= KESSHO_PRODUCT_SOURCE_PRESET_SOUNDSCAPE_OCEAN_SAMPLE, "generated soundscape preset id below range");
      require(preset.id <= KESSHO_PRODUCT_SOURCE_PRESET_SOUNDSCAPE_INSECTS2, "generated soundscape preset id above range");
      if (preset.id >= KESSHO_PRODUCT_SOURCE_PRESET_SOUNDSCAPE_WATER0 &&
          preset.id <= KESSHO_PRODUCT_SOURCE_PRESET_SOUNDSCAPE_WATER7) {
        ++water_soundscape_count;
      }
      continue;
    }

    require(false, "generated source preset uses unknown source family");
  }

  require(pad_count == 25u, "generated pad preset family count mismatch");
  require(lead_count == 2u, "generated lead preset family count mismatch");
  require(drum_count == 1u, "generated drum preset family count mismatch");
  require(sample_count == 1u, "generated sample preset family count mismatch");
  require(soundscape_count == 14u, "generated soundscape preset family count mismatch");
  require(water_soundscape_count == 8u, "generated water soundscape preset count mismatch");
  require(KESSHO_PRODUCT_GENERATED_PAD_SOURCE_PRESET_COUNT == pad_count, "generated pad source patch table count mismatch");
  require(KESSHO_PRODUCT_GENERATED_LEAD_SOURCE_PRESET_COUNT == lead_count, "generated lead source patch table count mismatch");
  require(KESSHO_PRODUCT_GENERATED_DRUM_SOURCE_PRESET_COUNT == drum_count, "generated drum source patch table count mismatch");
}

void requireExactSourcePresetMetadata() {
  const auto* init = generatedPreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_INIT);
  require(init != nullptr, "generated PadInit preset missing");
  const auto init_patch = kessho::product::internal::sourcePresetPatch(*init);
  require(
      init_patch.exact_pad_param_count == kessho::product::generated::KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT,
      "generated PadInit exact pad param count missing");
  require(
      kessho::product::generated::KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT == 52u,
      "generated pad param count must match module layout");
  require(std::fabs(init_patch.exact_pad_params[32] - 6.0f) < 0.00001f, "PadInit exact attack did not match web preset");
  require(std::fabs(init_patch.exact_pad_params[35] - 12.0f) < 0.00001f, "PadInit exact release did not match web preset");
  require(std::fabs(init_patch.exact_pad_params[51] - 0.5f) < 0.00001f, "PadInit exact output trim did not match web pad trim");

  const auto* lead = generatedPreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES);
  require(lead != nullptr, "generated lead preset missing");
  const auto lead_patch = kessho::product::internal::sourcePresetPatch(*lead);
  require(lead_patch.exact_pad_param_count == 0u, "non-pad preset unexpectedly compiled pad params");
  require(
      lead_patch.exact_lead_param_count == kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT,
      "generated LeadSoftRhodes exact lead param count missing");
  require(
      kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT == 112u,
      "generated lead param count must match module layout");
  require(
      std::fabs(kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_OUTPUT_TRIM - 0.59f) < 0.00001f,
      "generated lead output trim must match Product Core parity trim");
  require(std::fabs(lead_patch.exact_lead_params[0] - 0.0f) < 0.00001f, "LeadSoftRhodes exact algorithm did not match web preset");
  require(std::fabs(lead_patch.exact_lead_params[3] - 1.0f) < 0.00001f, "LeadSoftRhodes exact operator ratio did not match web preset");
  require(std::fabs(lead_patch.exact_lead_params[62] - 0.36f) < 0.00001f, "LeadSoftRhodes exact gain did not match web preset");

  const auto* gamelan = generatedPreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_GAMELAN);
  require(gamelan != nullptr, "generated LeadGamelan preset missing");
  const auto gamelan_patch = kessho::product::internal::sourcePresetPatch(*gamelan);
  require(
      gamelan_patch.exact_lead_param_count == kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT,
      "generated LeadGamelan exact lead param count missing");
  require(std::fabs(gamelan_patch.exact_lead_params[0] - 3.0f) < 0.00001f, "LeadGamelan exact algorithm did not match web preset");
  require(std::fabs(gamelan_patch.exact_lead_params[62] - 0.7f) < 0.00001f, "LeadGamelan exact gain did not match web preset");

  const auto* drum = generatedPreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_DRUM_DEFAULT);
  require(drum != nullptr, "generated DrumDefault preset missing");
  const auto drum_patch = kessho::product::internal::sourcePresetPatch(*drum);
  require(
      drum_patch.exact_drum_param_count == kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_PARAM_COUNT,
      "generated DrumDefault exact drum param count missing");
  require(
      kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_PARAM_COUNT ==
          kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT,
      "generated drum param count must match module layout");
  require(
      kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_VOICE_COUNT == 7u,
      "generated drum voice count must match Product Core drum source layout");
  require(
      kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_VOICE_PRESET_COUNT > 60u,
      "generated drum voice preset table must include factory drum presets");
  require(std::fabs(drum_patch.exact_drum_params[12] - 55.0f) < 0.00001f, "DrumDefault exact kick frequency did not match module layout");
  require(std::fabs(drum_patch.exact_drum_params[122] - 0.8f) < 0.00001f, "DrumDefault exact master level did not match module layout");

  const auto* classic_sub = generatedDrumVoicePreset(0u, "Classic Sub");
  const auto* soft_touch = generatedDrumVoicePreset(0u, "Soft Touch");
  require(classic_sub != nullptr, "generated Classic Sub drum voice preset missing");
  require(soft_touch != nullptr, "generated Soft Touch drum voice preset missing");
  require(std::fabs(classic_sub->params[2] - 0.8f) < 0.00001f, "Classic Sub generated level did not match preset");
  require(std::fabs(soft_touch->params[2] - 0.4f) < 0.00001f, "Soft Touch generated level did not match preset");
}

void triggerManual(KesshoProductEngine* engine, uint32_t source_id, float midi_note, uint32_t sample_offset = 0) {
  KesshoProductEvent note{};
  note.sample_offset = sample_offset;
  note.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  note.target_id = source_id;
  note.value = midi_note;
  note.value2 = 0.9f;
  note.value3 = 0.18f;
  require(kessho_product_enqueue_event(engine, &note) == KESSHO_PRODUCT_OK, "manual note enqueue failed");
}

void setSourceParam(KesshoProductEngine* engine, uint32_t source_id, uint32_t param_id, float value) {
  KesshoProductEvent event{};
  event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
  event.target_id = source_id;
  event.param_id = param_id;
  event.value = value;
  require(kessho_product_enqueue_event(engine, &event) == KESSHO_PRODUCT_OK, "source param enqueue failed");
}

void applySourceOverrideSlot(
    KesshoProductEngine* engine,
    uint32_t source_id,
    uint32_t slot,
    uint32_t param_index,
    float value) {
  KesshoProductEvent event{};
  event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SOURCE_OVERRIDE;
  event.target_id = source_id;
  event.index = slot;
  event.param_id = param_index;
  event.value = value;
  event.flags = KESSHO_PRODUCT_SOURCE_OVERRIDE_SET_SLOT;
  engine->applyControlEvent(event);
  require(engine->telemetry.last_error_code == KESSHO_PRODUCT_OK, "source override slot event failed");
}

void applySourceOverrideCommit(KesshoProductEngine* engine, uint32_t source_id, uint32_t override_count) {
  KesshoProductEvent event{};
  event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SOURCE_OVERRIDE;
  event.target_id = source_id;
  event.index = override_count;
  event.flags = KESSHO_PRODUCT_SOURCE_OVERRIDE_COMMIT;
  engine->applyControlEvent(event);
  require(engine->telemetry.last_error_code == KESSHO_PRODUCT_OK, "source override commit event failed");
}

void requireSourceRenders(uint32_t source_id, uint32_t stem_id, float midi_note, const char* label) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "snapshot load failed");
  triggerManual(engine, source_id, midi_note);

  const RenderStemPeaks peaks = renderAndStemPeakBlocks(engine, stem_id);
  require(peaks.output_peak > 0.0001f, label);
  require(peaks.stem_peak > 0.0001f, "source stem missing module output");
  require(peaks.max_active_voices > 0u, "module active voices missing from telemetry");
  kessho_product_destroy(engine);
}

void configurePadFilterLfoTelemetryPatch(KesshoProductSourceSnapshot& source, float cutoff_min, float cutoff_max) {
  constexpr uint32_t kPadParamFilterCutoff = 21u;
  constexpr uint32_t kPadParamFilterKeyTracking = 25u;
  constexpr uint32_t kPadParamLfo1Rate = 36u;
  constexpr uint32_t kPadParamLfo1Depth = 37u;
  constexpr uint32_t kPadParamLfo1Wave = 38u;
  constexpr uint32_t kPadParamLfo1Dest = 39u;
  constexpr uint32_t kPadParamLevel = 51u;
  appendPadOverride(source, kPadParamFilterCutoff, std::sqrt(cutoff_min * cutoff_max));
  appendPadOverride(source, kPadParamFilterKeyTracking, 0.0f);
  appendPadOverride(source, kPadParamLfo1Rate, 64.0f);
  appendPadOverride(source, kPadParamLfo1Depth, std::log2(cutoff_max / cutoff_min) * 0.125f);
  appendPadOverride(source, kPadParamLfo1Wave, 6.0f);
  appendPadOverride(source, kPadParamLfo1Dest, 1.0f);
  appendPadOverride(source, kPadParamLevel, 1.0f);
}

void configurePadLowRateRandomWalkTelemetryPatch(KesshoProductSourceSnapshot& source, float cutoff_min, float cutoff_max) {
  constexpr uint32_t kPadParamFilterCutoff = 21u;
  constexpr uint32_t kPadParamFilterKeyTracking = 25u;
  constexpr uint32_t kPadParamLfo1Rate = 36u;
  constexpr uint32_t kPadParamLfo1Depth = 37u;
  constexpr uint32_t kPadParamLfo1Wave = 38u;
  constexpr uint32_t kPadParamLfo1Dest = 39u;
  constexpr uint32_t kPadParamLfo2Depth = 41u;
  constexpr uint32_t kPadParamModEnvEnabled = 44u;
  constexpr uint32_t kPadParamLevel = 51u;
  appendPadOverride(source, kPadParamFilterCutoff, cutoff_min + (cutoff_max - cutoff_min) * 0.5f);
  appendPadOverride(source, kPadParamFilterKeyTracking, 0.0f);
  appendPadOverride(source, kPadParamLfo1Rate, 0.09f);
  appendPadOverride(source, kPadParamLfo1Depth, 1.0f);
  appendPadOverride(source, kPadParamLfo1Wave, 6.0f);
  appendPadOverride(source, kPadParamLfo1Dest, 1.0f);
  appendPadOverride(source, kPadParamLfo2Depth, 0.0f);
  appendPadOverride(source, kPadParamModEnvEnabled, 0.0f);
  appendPadOverride(source, kPadParamLevel, 1.0f);
}

void configurePadModEnvelopeTelemetryPatch(KesshoProductSourceSnapshot& source, float cutoff_min, float cutoff_max) {
  constexpr uint32_t kPadParamFilterCutoff = 21u;
  constexpr uint32_t kPadParamFilterKeyTracking = 25u;
  constexpr uint32_t kPadParamAttack = 32u;
  constexpr uint32_t kPadParamDecay = 33u;
  constexpr uint32_t kPadParamSustain = 34u;
  constexpr uint32_t kPadParamRelease = 35u;
  constexpr uint32_t kPadParamLfo1Depth = 37u;
  constexpr uint32_t kPadParamLfo2Depth = 41u;
  constexpr uint32_t kPadParamModEnvEnabled = 44u;
  constexpr uint32_t kPadParamModEnvAttack = 45u;
  constexpr uint32_t kPadParamModEnvDecay = 46u;
  constexpr uint32_t kPadParamModEnvSustain = 47u;
  constexpr uint32_t kPadParamModEnvRelease = 48u;
  constexpr uint32_t kPadParamModEnvDepth = 49u;
  constexpr uint32_t kPadParamModEnvDest = 50u;
  constexpr uint32_t kPadParamLevel = 51u;
  appendPadOverride(source, kPadParamFilterCutoff, cutoff_min);
  appendPadOverride(source, kPadParamFilterKeyTracking, 0.0f);
  appendPadOverride(source, kPadParamAttack, 0.001f);
  appendPadOverride(source, kPadParamDecay, 0.05f);
  appendPadOverride(source, kPadParamSustain, 1.0f);
  appendPadOverride(source, kPadParamRelease, 0.5f);
  appendPadOverride(source, kPadParamLfo1Depth, 0.0f);
  appendPadOverride(source, kPadParamLfo2Depth, 0.0f);
  appendPadOverride(source, kPadParamModEnvEnabled, 1.0f);
  appendPadOverride(source, kPadParamModEnvAttack, 0.001f);
  appendPadOverride(source, kPadParamModEnvDecay, 0.05f);
  appendPadOverride(source, kPadParamModEnvSustain, 1.0f);
  appendPadOverride(source, kPadParamModEnvRelease, 0.25f);
  appendPadOverride(source, kPadParamModEnvDepth, std::log2(cutoff_max / cutoff_min) * 0.25f);
  appendPadOverride(source, kPadParamModEnvDest, 1.0f);
  appendPadOverride(source, kPadParamLevel, 1.0f);
}

void requirePadFilterLfoTelemetryTracksBothPads() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "Pad telemetry engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  configurePadFilterLfoTelemetryPatch(snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u], 200.0f, 4000.0f);
  configurePadFilterLfoTelemetryPatch(snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD2 - 1u], 500.0f, 9000.0f);
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "Pad telemetry snapshot load failed");

  triggerManual(engine, KESSHO_PRODUCT_SOURCE_PAD1, 60.0f);
  triggerManual(engine, KESSHO_PRODUCT_SOURCE_PAD2, 67.0f);
  std::vector<float> left(128);
  std::vector<float> right(128);
  for (int block = 0; block < 16; ++block) {
    kessho_product_render(engine, left.data(), right.data(), 128);
  }

  const KesshoProductTelemetry telemetry = kessho_product_get_telemetry(engine);
  require(
      telemetry.pad1_filter_freq >= 200.0f && telemetry.pad1_filter_freq <= 4000.0f,
      "Pad 1 filter telemetry did not track Product Core cutoff");
  require(
      telemetry.pad2_filter_freq >= 500.0f && telemetry.pad2_filter_freq <= 9000.0f,
      "Pad 2 filter telemetry did not track Product Core cutoff");
  require(std::fabs(telemetry.pad1_lfo1_value) > 0.0001f, "Pad 1 LFO telemetry did not move");
  require(std::fabs(telemetry.pad2_lfo1_value) > 0.0001f, "Pad 2 LFO telemetry did not move");
  kessho_product_destroy(engine);
}

void requireIdlePadLowRateRandomWalkTelemetryTracksBothPads() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "Idle Pad random-walk telemetry engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  configurePadLowRateRandomWalkTelemetryPatch(snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u], 40.0f, 1690.0f);
  configurePadLowRateRandomWalkTelemetryPatch(snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD2 - 1u], 80.0f, 2600.0f);
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "Idle Pad random-walk snapshot load failed");

  std::vector<float> left(128);
  std::vector<float> right(128);
  for (int block = 0; block < 80; ++block) {
    kessho_product_render(engine, left.data(), right.data(), 128);
  }

  const KesshoProductTelemetry telemetry = kessho_product_get_telemetry(engine);
  const float pad1_center = 40.0f + (1690.0f - 40.0f) * 0.5f;
  const float pad2_center = 80.0f + (2600.0f - 80.0f) * 0.5f;
  require(telemetry.active_voices == 0u, "Idle Pad random-walk telemetry test unexpectedly triggered a voice");
  require(std::fabs(telemetry.pad1_lfo1_value) > 0.000001f, "Idle Pad 1 low-rate random-walk LFO telemetry did not move");
  require(std::fabs(telemetry.pad2_lfo1_value) > 0.000001f, "Idle Pad 2 low-rate random-walk LFO telemetry did not move");
  require(std::fabs(telemetry.pad1_filter_freq - pad1_center) > 0.001f, "Idle Pad 1 low-rate random-walk filter telemetry stayed at center");
  require(std::fabs(telemetry.pad2_filter_freq - pad2_center) > 0.001f, "Idle Pad 2 low-rate random-walk filter telemetry stayed at center");

  triggerManual(engine, KESSHO_PRODUCT_SOURCE_PAD1, 60.0f);
  triggerManual(engine, KESSHO_PRODUCT_SOURCE_PAD2, 67.0f);
  for (int block = 0; block < 80; ++block) {
    kessho_product_render(engine, left.data(), right.data(), 128);
  }

  const KesshoProductTelemetry active_telemetry = kessho_product_get_telemetry(engine);
  require(active_telemetry.active_voices > 0u, "Active Pad random-walk telemetry test did not trigger voices");
  require(std::fabs(active_telemetry.pad1_lfo1_value) > 0.000001f, "Active Pad 1 low-rate random-walk LFO telemetry did not move");
  require(std::fabs(active_telemetry.pad2_lfo1_value) > 0.000001f, "Active Pad 2 low-rate random-walk LFO telemetry did not move");
  require(std::fabs(active_telemetry.pad1_filter_freq - pad1_center) > 0.001f, "Active Pad 1 low-rate random-walk filter telemetry stayed at center");
  require(std::fabs(active_telemetry.pad2_filter_freq - pad2_center) > 0.001f, "Active Pad 2 low-rate random-walk filter telemetry stayed at center");
  kessho_product_destroy(engine);
}

void requirePadLowRateRandomWalkTelemetryUpdatesContinuously() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "Pad random-walk cadence engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  configurePadLowRateRandomWalkTelemetryPatch(snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u], 40.0f, 360.0f);
  configurePadLowRateRandomWalkTelemetryPatch(snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD2 - 1u], 80.0f, 620.0f);
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "Pad random-walk cadence snapshot load failed");

  std::vector<float> left(128);
  std::vector<float> right(128);
  auto renderBlocks = [&](int block_count) {
    for (int block = 0; block < block_count; ++block) {
      kessho_product_render(engine, left.data(), right.data(), 128);
    }
  };
  auto countFilterChanges = [&](int samples, int blocks_per_sample) {
    KesshoProductTelemetry previous = kessho_product_get_telemetry(engine);
    uint32_t pad1_changes = 0u;
    uint32_t pad2_changes = 0u;
    for (int sample = 0; sample < samples; ++sample) {
      renderBlocks(blocks_per_sample);
      const KesshoProductTelemetry next = kessho_product_get_telemetry(engine);
      if (std::fabs(next.pad1_filter_freq - previous.pad1_filter_freq) > 0.001f) {
        ++pad1_changes;
      }
      if (std::fabs(next.pad2_filter_freq - previous.pad2_filter_freq) > 0.001f) {
        ++pad2_changes;
      }
      previous = next;
    }
    return std::min(pad1_changes, pad2_changes);
  };

  const uint32_t idle_changes = countFilterChanges(30, 38);
  require(idle_changes >= 8u, "Idle Pad low-rate random-walk telemetry updated too sparsely");

  triggerManual(engine, KESSHO_PRODUCT_SOURCE_PAD1, 60.0f);
  triggerManual(engine, KESSHO_PRODUCT_SOURCE_PAD2, 67.0f);
  const uint32_t active_changes = countFilterChanges(30, 38);
  require(active_changes >= 8u, "Active Pad low-rate random-walk telemetry updated too sparsely");

  kessho_product_destroy(engine);
}

void requirePadModEnvelopeTelemetryTracksBothPads() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "Pad mod-envelope telemetry engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  configurePadModEnvelopeTelemetryPatch(snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u], 250.0f, 4200.0f);
  configurePadModEnvelopeTelemetryPatch(snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD2 - 1u], 650.0f, 8600.0f);
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "Pad mod-envelope snapshot load failed");

  triggerManual(engine, KESSHO_PRODUCT_SOURCE_PAD1, 60.0f);
  triggerManual(engine, KESSHO_PRODUCT_SOURCE_PAD2, 67.0f);
  std::vector<float> left(128);
  std::vector<float> right(128);
  for (int block = 0; block < 8; ++block) {
    kessho_product_render(engine, left.data(), right.data(), 128);
  }

  const KesshoProductTelemetry telemetry = kessho_product_get_telemetry(engine);
  require(
      telemetry.pad1_filter_freq > 250.0f + (4200.0f - 250.0f) * 0.8f &&
          telemetry.pad1_filter_freq <= 4200.0f,
      "Pad 1 mod envelope did not drive Product Core filter cutoff");
  require(
      telemetry.pad2_filter_freq > 650.0f + (8600.0f - 650.0f) * 0.8f &&
          telemetry.pad2_filter_freq <= 8600.0f,
      "Pad 2 mod envelope did not drive Product Core filter cutoff");
  kessho_product_destroy(engine);
}

void requireSourceParamEventsAffectRender() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "source param engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "source param snapshot load failed");

  setSourceParam(engine, KESSHO_PRODUCT_SOURCE_PAD1, KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID, 0.0f);
  triggerManual(engine, KESSHO_PRODUCT_SOURCE_PAD1, 60.0f);

  std::vector<float> left(128);
  std::vector<float> right(128);
  kessho_product_render(engine, left.data(), right.data(), 128);
  require(peakRange(left, right, 0, 128) < 0.000001f, "source level param did not silence pad 1");

  setSourceParam(engine, KESSHO_PRODUCT_SOURCE_PAD1, KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID, 1.0f);
  triggerManual(engine, KESSHO_PRODUCT_SOURCE_PAD1, 60.0f);
  require(renderPeakBlocks(engine) > 0.0001f, "source level param did not restore pad 1");

  kessho_product_destroy(engine);
}

float renderDrumPeakWithSourceLevel(float level) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "drum source level event engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "drum source level event snapshot load failed");
  setSourceParam(engine, KESSHO_PRODUCT_SOURCE_DRUM, KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID, level);
  triggerManual(engine, KESSHO_PRODUCT_SOURCE_DRUM, 36.0f);
  const float result = renderPeakBlocks(engine, 32u);
  kessho_product_destroy(engine);
  return result;
}

float renderDrumReverbSendPeakWithSourceParam(float send) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "drum source reverb event engine create failed");
  enableGraphTaps(engine, "drum source reverb graph tap enable failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  snapshot.fx.reverb_mix = 0.0f;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "drum source reverb event snapshot load failed");
  setSourceParam(engine, KESSHO_PRODUCT_SOURCE_DRUM, KESSHO_PRODUCT_PARAM_SOURCE_REVERB_SEND_ID, send);
  triggerManual(engine, KESSHO_PRODUCT_SOURCE_DRUM, 36.0f);
  std::vector<float> left(128);
  std::vector<float> right(128);
  std::vector<float> tap_l(128);
  std::vector<float> tap_r(128);
  float result = 0.0f;
  for (uint32_t block = 0; block < 32u; ++block) {
    std::fill(left.begin(), left.end(), 0.0f);
    std::fill(right.begin(), right.end(), 0.0f);
    kessho_product_render(engine, left.data(), right.data(), 128);
    require(
        kessho_product_get_graph_tap(engine, KESSHO_PRODUCT_GRAPH_TAP_DRUM_REVERB_SEND, tap_l.data(), tap_r.data(), 128) == KESSHO_PRODUCT_OK,
        "drum source reverb graph tap read failed");
    result = std::max(result, peakRange(tap_l, tap_r, 0, 128));
  }
  kessho_product_destroy(engine);
  return result;
}

void requireDrumSourceParamsDriveModule() {
  const float muted_level = renderDrumPeakWithSourceLevel(0.0f);
  const float open_level = renderDrumPeakWithSourceLevel(1.0f);
  require(muted_level < 0.000001f, "drum source level event did not mute drum module");
  require(open_level > 0.00001f, "drum source level event did not restore drum module");

  const float muted_reverb = renderDrumReverbSendPeakWithSourceParam(0.0f);
  const float open_reverb = renderDrumReverbSendPeakWithSourceParam(1.0f);
  require(muted_reverb < 0.000001f, "drum source reverb event did not mute drum module reverb send");
  require(open_reverb > 0.00001f, "drum source reverb event did not restore drum module reverb send");
}

void requireDrumSourceParamsStayStructured() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "drum structured source param engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "drum structured source param snapshot load failed");
  setSourceParam(engine, KESSHO_PRODUCT_SOURCE_DRUM, KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID, 0.64f);
  setSourceParam(engine, KESSHO_PRODUCT_SOURCE_DRUM, KESSHO_PRODUCT_PARAM_SOURCE_REVERB_SEND_ID, 0.22f);
  require(engine->sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u].source_preset_patch_valid, "drum source level/reverb events lost structured source patch");
  require(engine->sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u].drum_override_count == 0u, "drum source level/reverb events created sparse Drum overrides");
  triggerManual(engine, KESSHO_PRODUCT_SOURCE_DRUM, 36.0f);
  require(engine->sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u].source_preset_patch_valid, "drum trigger lost structured source patch");
  require(engine->sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u].drum_override_count == 0u, "drum trigger created sparse Drum overrides");
  kessho_product_destroy(engine);
}

void requirePadOverridesStayStructured() {
  constexpr uint32_t kPadHardnessParamIndex = 15u;
  constexpr float kHardnessOverride = 1.37f;
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "pad structured override engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u];
  source.source_preset_a_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_SOFT_PLUCK;
  source.source_preset_b_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_BUCHLA_PLUCK;
  source.morph = 0.43f;
  source.pad_override_count = 1u;
  source.pad_override_indices[0] = kPadHardnessParamIndex;
  source.pad_override_values[0] = kHardnessOverride;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "pad structured override snapshot load failed");

  const auto& loaded = engine->sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u];
  require(loaded.source_preset_endpoint_valid, "pad structured override snapshot did not compile generated endpoints");
  require(loaded.pad_override_count == 1u, "pad sparse override count did not load to structured SourceState");
  require(loaded.pad_override_indices[0] == kPadHardnessParamIndex, "pad sparse override index did not load to structured SourceState");
  require(std::fabs(loaded.pad_override_values[0] - kHardnessOverride) < 0.00001f, "pad sparse override value did not load to structured SourceState");

  triggerManual(engine, KESSHO_PRODUCT_SOURCE_PAD1, 60.0f);
  require(renderPeakBlocks(engine, 8u) > 0.0001f, "pad sparse override source did not render");
  require(engine->sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].source_preset_endpoint_valid, "pad sparse override trigger lost generated endpoints");
  require(engine->sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].pad_override_count == 1u, "pad sparse override trigger lost structured override state");
  kessho_product_destroy(engine);
}

void requireLeadOverridesStayStructured() {
  constexpr uint32_t kLeadGainParamIndex = 62u;
  constexpr float kGainOverride = 0.41f;
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "lead structured override engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u];
  source.source_preset_a_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES;
  source.source_preset_b_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_GAMELAN;
  source.morph = 0.43f;
  source.distance = 0.0f;
  source.lead_override_count = 1u;
  source.lead_override_indices[0] = kLeadGainParamIndex;
  source.lead_override_values[0] = kGainOverride;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "lead structured override snapshot load failed");

  const auto& loaded = engine->sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u];
  require(loaded.source_preset_endpoint_valid, "lead structured override snapshot did not compile generated endpoints");
  require(loaded.lead_override_count == 1u, "lead sparse override count did not load to structured SourceState");
  require(loaded.lead_override_indices[0] == kLeadGainParamIndex, "lead sparse override index did not load to structured SourceState");
  require(std::fabs(loaded.lead_override_values[0] - kGainOverride) < 0.00001f, "lead sparse override value did not load to structured SourceState");

  triggerManual(engine, KESSHO_PRODUCT_SOURCE_LEAD1, 64.0f);
  require(renderPeakBlocks(engine, 8u) > 0.0001f, "lead sparse override source did not render");
  require(engine->sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u].source_preset_endpoint_valid, "lead sparse override trigger lost generated endpoints");
  require(engine->sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u].lead_override_count == 1u, "lead sparse override trigger lost structured override state");
  kessho_product_destroy(engine);
}

void requireDrumOverridesStayStructured() {
  constexpr uint32_t kDrumSubFreqParamIndex = 0u;
  constexpr float kSubFreqOverride = 72.0f;
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "drum structured override engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u];
  source.enabled = 1u;
  source.drum_override_count = 1u;
  source.drum_override_indices[0] = kDrumSubFreqParamIndex;
  source.drum_override_values[0] = kSubFreqOverride;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "drum structured override snapshot load failed");

  const auto& loaded = engine->sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u];
  require(loaded.source_preset_patch_valid, "drum structured override snapshot did not compile generated voice patch");
  require(loaded.drum_override_count == 1u, "drum sparse override count did not load to structured SourceState");
  require(loaded.drum_override_indices[0] == kDrumSubFreqParamIndex, "drum sparse override index did not load to structured SourceState");
  require(std::fabs(loaded.drum_override_values[0] - kSubFreqOverride) < 0.00001f, "drum sparse override value did not load to structured SourceState");
  require(
      std::fabs(loaded.source_preset_patch.exact_drum_params[kDrumSubFreqParamIndex] - kSubFreqOverride) < 0.00001f,
      "drum sparse override did not compile into generated Drum source patch");

  triggerManual(engine, KESSHO_PRODUCT_SOURCE_DRUM, kDrumSubMidiNote);
  require(renderPeakBlocks(engine, 8u) > 0.0001f, "drum sparse override source did not render");
  require(engine->sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u].source_preset_patch_valid, "drum sparse override trigger lost generated source patch");
  require(engine->sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u].drum_override_count == 1u, "drum sparse override trigger lost structured override state");
  kessho_product_destroy(engine);
}

void requirePadLiveOverrideEventStaysStructured() {
  constexpr uint32_t kPadHardnessParamIndex = 15u;
  constexpr float kHardnessOverride = 1.43f;
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "pad live override engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u];
  source.source_preset_a_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_SOFT_PLUCK;
  source.source_preset_b_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_BUCHLA_PLUCK;
  source.morph = 0.25f;
  source.distance = 0.0f;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "pad live override snapshot load failed");

  applySourceOverrideSlot(engine, KESSHO_PRODUCT_SOURCE_PAD1, 0u, kPadHardnessParamIndex, kHardnessOverride);
  applySourceOverrideCommit(engine, KESSHO_PRODUCT_SOURCE_PAD1, 1u);
  const SourceState& loaded = engine->sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u];
  require(loaded.pad_override_count == 1u, "pad live override count did not update SourceState");
  require(loaded.pad_override_indices[0] == kPadHardnessParamIndex, "pad live override index did not update SourceState");
  require(std::fabs(loaded.pad_override_values[0] - kHardnessOverride) < 0.00001f, "pad live override value did not update SourceState");
  require(engine->pad_module != nullptr && engine->pad_module->params() != nullptr, "pad module missing for live override test");
  require(
      std::fabs(engine->pad_module->params()[kPadHardnessParamIndex] - kHardnessOverride) < 0.00001f,
      "pad live override event did not update module patch");
  triggerManual(engine, KESSHO_PRODUCT_SOURCE_PAD1, 60.0f);
  require(renderPeakBlocks(engine, 8u) > 0.0001f, "pad live override source did not render");
  require(engine->sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].pad_override_count == 1u, "pad live override trigger lost structured override state");
  kessho_product_destroy(engine);
}

void requireLeadLiveOverrideEventStaysStructured() {
  constexpr uint32_t kLeadGainParamIndex = 62u;
  constexpr float kGainOverride = 0.37f;
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "lead live override engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u];
  source.source_preset_a_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES;
  source.source_preset_b_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_GAMELAN;
  source.morph = 0.25f;
  source.distance = 0.0f;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "lead live override snapshot load failed");

  applySourceOverrideSlot(engine, KESSHO_PRODUCT_SOURCE_LEAD1, 0u, kLeadGainParamIndex, kGainOverride);
  applySourceOverrideCommit(engine, KESSHO_PRODUCT_SOURCE_LEAD1, 1u);
  const SourceState& loaded = engine->sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u];
  require(loaded.lead_override_count == 1u, "lead live override count did not update SourceState");
  require(loaded.lead_override_indices[0] == kLeadGainParamIndex, "lead live override index did not update SourceState");
  require(std::fabs(loaded.lead_override_values[0] - kGainOverride) < 0.00001f, "lead live override value did not update SourceState");
  require(engine->lead_modules[0] != nullptr && engine->lead_modules[0]->params() != nullptr, "lead module missing for live override test");
  require(
      std::fabs(engine->lead_modules[0]->params()[kLeadGainParamIndex] - kGainOverride) < 0.00001f,
      "lead live override event did not update module patch");
  triggerManual(engine, KESSHO_PRODUCT_SOURCE_LEAD1, 64.0f);
  require(renderPeakBlocks(engine, 8u) > 0.0001f, "lead live override source did not render");
  require(engine->sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u].lead_override_count == 1u, "lead live override trigger lost structured override state");
  kessho_product_destroy(engine);
}

void requireDrumLiveOverrideEventStaysStructured() {
  constexpr uint32_t kDrumSubFreqParamIndex = 0u;
  constexpr float kSubFreqOverride = 72.0f;
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "drum live override engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u];
  source.enabled = 1u;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "drum live override snapshot load failed");

  applySourceOverrideSlot(engine, KESSHO_PRODUCT_SOURCE_DRUM, 0u, kDrumSubFreqParamIndex, kSubFreqOverride);
  applySourceOverrideCommit(engine, KESSHO_PRODUCT_SOURCE_DRUM, 1u);
  const SourceState& loaded = engine->sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u];
  require(loaded.drum_override_count == 1u, "drum live override count did not update SourceState");
  require(loaded.drum_override_indices[0] == kDrumSubFreqParamIndex, "drum live override index did not update SourceState");
  require(std::fabs(loaded.drum_override_values[0] - kSubFreqOverride) < 0.00001f, "drum live override value did not update SourceState");
  require(
      std::fabs(loaded.source_preset_patch.exact_drum_params[kDrumSubFreqParamIndex] - kSubFreqOverride) < 0.00001f,
      "drum live override did not update generated source patch");
  require(engine->drum_module != nullptr && engine->drum_module->params() != nullptr, "drum module missing for live override test");
  require(
      std::fabs(engine->drum_module->params()[kDrumSubFreqParamIndex] - kSubFreqOverride) < 0.00001f,
      "drum live override event did not update module patch");
  triggerManual(engine, KESSHO_PRODUCT_SOURCE_DRUM, kDrumSubMidiNote);
  require(renderPeakBlocks(engine, 8u) > 0.0001f, "drum live override source did not render");
  require(engine->sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u].drum_override_count == 1u, "drum live override trigger lost structured override state");
  kessho_product_destroy(engine);
}

void requireRuntimeParamEventsUseStructuredOverrides() {
  {
    constexpr uint32_t kPadHardnessParamIndex = 15u;
    constexpr float kHardnessOverride = 1.28f;
    KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
    require(engine != nullptr, "pad runtime-param override engine create failed");
    KesshoProductSnapshotV2 snapshot = makeSnapshot();
    KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u];
    source.source_preset_a_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_SOFT_PLUCK;
    source.source_preset_b_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_BUCHLA_PLUCK;
    source.morph = 0.25f;
    source.distance = 0.0f;
    require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "pad runtime-param override snapshot load failed");

    KesshoProductEvent event{};
    event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
    event.param_id = kProductPadRuntimeParamIdBase + kPadHardnessParamIndex;
    event.value = kHardnessOverride;
    engine->applyParam(event);
    const auto& loaded = engine->sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u];
    require(engine->telemetry.last_error_code == KESSHO_PRODUCT_OK, "pad runtime-param override event failed");
    require(loaded.pad_override_count == 1u && loaded.pad_override_indices[0] == kPadHardnessParamIndex, "pad runtime param missed sparse override state");
    require(std::fabs(loaded.pad_override_values[0] - kHardnessOverride) < 0.00001f, "pad runtime param missed sparse override value");
    require(
        engine->pad_module != nullptr &&
          engine->pad_module->params() != nullptr &&
          std::fabs(engine->pad_module->params()[kPadHardnessParamIndex] - kHardnessOverride) < 0.00001f,
        "pad runtime param did not update module through structured override");
    kessho_product_destroy(engine);
  }

  {
    constexpr uint32_t kLeadGainParamIndex = 62u;
    constexpr float kGainOverride = 0.39f;
    KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
    require(engine != nullptr, "lead runtime-param override engine create failed");
    KesshoProductSnapshotV2 snapshot = makeSnapshot();
    KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u];
    source.source_preset_a_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES;
    source.source_preset_b_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_GAMELAN;
    source.morph = 0.25f;
    source.distance = 0.0f;
    require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "lead runtime-param override snapshot load failed");

    KesshoProductEvent event{};
    event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
    event.param_id = kProductLeadRuntimeParamIdBase + kLeadGainParamIndex;
    event.value = kGainOverride;
    engine->applyParam(event);
    const auto& loaded = engine->sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u];
    require(engine->telemetry.last_error_code == KESSHO_PRODUCT_OK, "lead runtime-param override event failed");
    require(loaded.lead_override_count == 1u && loaded.lead_override_indices[0] == kLeadGainParamIndex, "lead runtime param missed sparse override state");
    require(std::fabs(loaded.lead_override_values[0] - kGainOverride) < 0.00001f, "lead runtime param missed sparse override value");
    require(
        engine->lead_modules[0] != nullptr &&
          engine->lead_modules[0]->params() != nullptr &&
          std::fabs(engine->lead_modules[0]->params()[kLeadGainParamIndex] - kGainOverride) < 0.00001f,
        "lead runtime param did not update module through structured override");
    kessho_product_destroy(engine);
  }

  {
    constexpr uint32_t kDrumSubFreqParamIndex = 0u;
    constexpr float kSubFreqOverride = 73.0f;
    KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
    require(engine != nullptr, "drum runtime-param override engine create failed");
    KesshoProductSnapshotV2 snapshot = makeSnapshot();
    KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u];
    source.enabled = 1u;
    require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "drum runtime-param override snapshot load failed");

    KesshoProductEvent event{};
    event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
    event.param_id = kProductDrumRuntimeParamIdBase + kDrumSubFreqParamIndex;
    event.value = kSubFreqOverride;
    engine->applyParam(event);
    const auto& loaded = engine->sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u];
    require(engine->telemetry.last_error_code == KESSHO_PRODUCT_OK, "drum runtime-param override event failed");
    require(loaded.drum_override_count == 1u && loaded.drum_override_indices[0] == kDrumSubFreqParamIndex, "drum runtime param missed sparse override state");
    require(std::fabs(loaded.drum_override_values[0] - kSubFreqOverride) < 0.00001f, "drum runtime param missed sparse override value");
    require(
        engine->drum_module != nullptr &&
          engine->drum_module->params() != nullptr &&
          std::fabs(engine->drum_module->params()[kDrumSubFreqParamIndex] - kSubFreqOverride) < 0.00001f,
        "drum runtime param did not update module through structured override");
    kessho_product_destroy(engine);
  }
}

void requirePartialExactPatchFallbacksAreRejected() {
  {
    KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
    require(engine != nullptr, "partial Drum exact snapshot engine create failed");
    KesshoProductSnapshotV2 snapshot = makeSnapshot();
    KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u];
    source.exact_drum_param_count = 1u;
    source.exact_drum_params[0] = 72.0f;
    require(
        kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT,
        "partial Drum exact snapshot should be rejected instead of retained as fallback state");
    kessho_product_destroy(engine);
  }
}

void requireInvalidSourcePresetFallbacksAreRejected() {
  {
    KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
    require(engine != nullptr, "invalid source preset snapshot engine create failed");
    KesshoProductSnapshotV2 snapshot = makeSnapshot();
    snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].preset_id = 999999u;
    require(
        kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT,
        "snapshot with unknown source preset id should be rejected instead of defaulted");
    kessho_product_destroy(engine);
  }

  {
    KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
    require(engine != nullptr, "invalid Pad endpoint exact fallback snapshot engine create failed");
    KesshoProductSnapshotV2 snapshot = makeSnapshot();
    KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u];
    source.source_preset_b_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_DRUM_DEFAULT;
    require(
        kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT,
        "snapshot with exact Pad params and invalid endpoint id should be rejected instead of ignoring the endpoint");
    kessho_product_destroy(engine);
  }

  {
    KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
    require(engine != nullptr, "invalid Lead endpoint exact fallback snapshot engine create failed");
    KesshoProductSnapshotV2 snapshot = makeSnapshot();
    KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u];
    source.source_preset_a_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_INIT;
    require(
        kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT,
        "snapshot with exact Lead params and invalid endpoint id should be rejected instead of ignoring the endpoint");
    kessho_product_destroy(engine);
  }

  {
    KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
    require(engine != nullptr, "invalid Drum voice preset snapshot engine create failed");
    KesshoProductSnapshotV2 snapshot = makeSnapshot();
    KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u];
    source.drum_voice_preset_a_ids[0] = 999999u;
    require(
        kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT,
        "snapshot with unknown Drum voice preset id should be rejected instead of defaulted");
    kessho_product_destroy(engine);
  }

  {
    KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
    require(engine != nullptr, "invalid source preset live event engine create failed");
    KesshoProductSnapshotV2 snapshot = makeSnapshot();
    require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "invalid source preset live event base snapshot load failed");

    const uint32_t previous_pad_endpoint = engine->sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].source_preset_a_id;
    KesshoProductEvent pad_endpoint_event{};
    pad_endpoint_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SOURCE_PRESET;
    pad_endpoint_event.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
    pad_endpoint_event.index = 1u;
    pad_endpoint_event.value = static_cast<float>(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_DRUM_DEFAULT);
    engine->applySourcePresetEvent(pad_endpoint_event);
    require(engine->telemetry.last_error_code == KESSHO_PRODUCT_ERROR_INVALID_PARAM, "invalid Pad endpoint preset event should be rejected");
    require(
        engine->sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].source_preset_a_id == previous_pad_endpoint,
        "invalid Pad endpoint preset event mutated source state");

    const uint32_t previous_drum_voice_preset =
        engine->sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u].drum_voice_preset_a_ids[0];
    KesshoProductEvent drum_voice_event{};
    drum_voice_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SOURCE_PRESET;
    drum_voice_event.target_id = KESSHO_PRODUCT_SOURCE_DRUM;
    drum_voice_event.index = 1u;
    drum_voice_event.value = 999999.0f;
    engine->applySourcePresetEvent(drum_voice_event);
    require(engine->telemetry.last_error_code == KESSHO_PRODUCT_ERROR_INVALID_PARAM, "invalid Drum voice preset event should be rejected");
    require(
        engine->sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u].drum_voice_preset_a_ids[0] == previous_drum_voice_preset,
        "invalid Drum voice preset event mutated source state");

    const uint32_t previous_drum_source_preset = engine->sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u].preset_id;
    KesshoProductEvent drum_root_event{};
    drum_root_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SOURCE_PRESET;
    drum_root_event.target_id = KESSHO_PRODUCT_SOURCE_DRUM;
    drum_root_event.value = static_cast<float>(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_INIT);
    engine->applySourcePresetEvent(drum_root_event);
    require(engine->telemetry.last_error_code == KESSHO_PRODUCT_ERROR_INVALID_PARAM, "invalid Drum root preset event should be rejected");
    require(
        engine->sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u].preset_id == previous_drum_source_preset,
        "invalid Drum root preset event mutated source state");
    kessho_product_destroy(engine);
  }
}

void requireInvalidSparseOverrideFallbacksAreRejected() {
  {
    KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
    require(engine != nullptr, "invalid sparse Pad override engine create failed");
    KesshoProductSnapshotV2 snapshot = makeSnapshot();
    KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u];
    source.source_preset_a_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_INIT;
    source.source_preset_b_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_INIT;
    source.pad_override_count = 1u;
    source.pad_override_indices[0] = kessho::product::generated::KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT;
    require(
        kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT,
        "snapshot with out-of-range sparse Pad override index should be rejected instead of clamped");
    kessho_product_destroy(engine);
  }

  {
    KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
    require(engine != nullptr, "mixed exact/sparse Lead override engine create failed");
    KesshoProductSnapshotV2 snapshot = makeSnapshot();
    KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u];
    source.exact_lead_param_count = 1u;
    source.exact_lead_params[0] = 3.0f;
    source.lead_override_count = 1u;
    source.lead_override_indices[0] = 62u;
    source.lead_override_values[0] = 0.1f;
    require(
        kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT,
        "snapshot with exact Lead patch plus sparse override should be rejected instead of merged");
    kessho_product_destroy(engine);
  }

  {
    KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
    require(engine != nullptr, "wrong-family sparse override engine create failed");
    KesshoProductSnapshotV2 snapshot = makeSnapshot();
    KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_PIANO - 1u];
    source.pad_override_count = 1u;
    source.pad_override_indices[0] = 15u;
    source.pad_override_values[0] = 0.4f;
    require(
        kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT,
        "snapshot with wrong-family sparse override should be rejected instead of ignored");
    kessho_product_destroy(engine);
  }
}

void requireInvalidExactPatchFallbacksAreRejected() {
  {
    KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
    require(engine != nullptr, "wrong-family exact patch engine create failed");
    KesshoProductSnapshotV2 snapshot = makeSnapshot();
    KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_PIANO - 1u];
    source.exact_pad_param_count = kessho::product::generated::KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT;
    source.exact_pad_params[0] = 0.25f;
    require(
        kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT,
        "snapshot with wrong-family exact Pad patch should be rejected instead of copied or ignored");
    kessho_product_destroy(engine);
  }

  {
    KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
    require(engine != nullptr, "oversized exact Lead patch engine create failed");
    KesshoProductSnapshotV2 snapshot = makeSnapshot();
    KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u];
    source.exact_lead_param_count = kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT + 1u;
    require(
        kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT,
        "snapshot with oversized exact Lead patch should be rejected instead of clamped");
    kessho_product_destroy(engine);
  }

  {
    KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
    require(engine != nullptr, "non-finite exact Drum patch engine create failed");
    KesshoProductSnapshotV2 snapshot = makeSnapshot();
    KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u];
    source.exact_drum_param_count = kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_PARAM_COUNT;
    source.exact_drum_params[0] = std::numeric_limits<float>::quiet_NaN();
    require(
        kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT,
        "snapshot with non-finite exact Drum patch value should be rejected instead of zero-filled");
    kessho_product_destroy(engine);
  }

  {
    KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
    require(engine != nullptr, "soundscape overloaded exact patch engine create failed");
    KesshoProductSnapshotV2 snapshot = makeSnapshot();
    KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1u];
    source.exact_drum_param_count = kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_PARAM_COUNT;
    source.exact_drum_params[0] = 0.5f;
    require(
        kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT,
        "soundscape overloaded exact Drum patch should be rejected instead of cleared");
    kessho_product_destroy(engine);
  }
}

void requireSoundscapeSnapshotOwnsStructuredFields() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "soundscape structured snapshot engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1u];
  source.enabled = 1u;
  source.source_id = KESSHO_PRODUCT_SOURCE_SOUNDSCAPE;
  snapshot.soundscape_texture_param_count = kessho::product::internal::kSoundscapeTextureParamCount;
  snapshot.soundscape_texture_params[kessho::product::internal::kSoundscapeLayerOcean * kessho::product::internal::kSoundscapeLayerRouteStride + kessho::product::internal::kSoundscapeLayerRouteReverb] = 0.37f;
  snapshot.soundscape_texture_params[kessho::product::internal::kSoundscapeTextureParamStart + kessho::product::internal::kSoundscapeTextureParamSeedLo] = 123.0f;
  snapshot.soundscape_module_param_count = kessho::product::internal::kSoundscapeProductModuleParamCount;
  snapshot.soundscape_module_params[kessho::product::internal::kSoundscapeModuleWaterActiveParam] = 1.0f;
  snapshot.soundscape_module_params[kessho::product::internal::kSoundscapeModuleEarthLevelParam] = 0.71f;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "soundscape structured snapshot load failed");

  const auto& loaded = engine->sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1u];
  require(
      loaded.soundscape_texture_param_count == kessho::product::internal::kSoundscapeTextureParamCount,
      "soundscape texture params were not loaded to structured SourceState");
  require(
      loaded.soundscape_module_param_count == kessho::product::internal::kSoundscapeProductModuleParamCount,
      "soundscape module params were not loaded to structured SourceState");
  require(
      std::fabs(loaded.soundscape_texture_params[kessho::product::internal::kSoundscapeLayerOcean * kessho::product::internal::kSoundscapeLayerRouteStride + kessho::product::internal::kSoundscapeLayerRouteReverb] - 0.37f) < 0.00001f,
      "soundscape route param did not survive structured snapshot load");
  require(
      std::fabs(loaded.soundscape_module_params[kessho::product::internal::kSoundscapeModuleEarthLevelParam] - 0.71f) < 0.00001f,
      "soundscape module param did not survive structured snapshot load");
  kessho_product_destroy(engine);
}

float maxNormalizedGraphTapDiff(
    KesshoProductEngine* engine,
    uint32_t dry_tap_id,
    uint32_t send_tap_id,
    uint32_t blocks,
    float& dry_peak) {
  std::vector<float> left(128);
  std::vector<float> right(128);
  std::vector<float> dry_l(128);
  std::vector<float> dry_r(128);
  std::vector<float> send_l(128);
  std::vector<float> send_r(128);
  float diff = 0.0f;
  dry_peak = 0.0f;
  for (uint32_t block = 0; block < blocks; ++block) {
    std::fill(left.begin(), left.end(), 0.0f);
    std::fill(right.begin(), right.end(), 0.0f);
    kessho_product_render(engine, left.data(), right.data(), 128);
    require(
        kessho_product_get_graph_tap(engine, dry_tap_id, dry_l.data(), dry_r.data(), 128) == KESSHO_PRODUCT_OK,
        "dry graph tap read failed");
    require(
        kessho_product_get_graph_tap(engine, send_tap_id, send_l.data(), send_r.data(), 128) == KESSHO_PRODUCT_OK,
        "send graph tap read failed");
    const float block_dry_peak = peakRange(dry_l, dry_r, 0, 128);
    const float block_send_peak = peakRange(send_l, send_r, 0, 128);
    dry_peak = std::max(dry_peak, block_dry_peak);
    if (block_dry_peak <= 0.000001f || block_send_peak <= 0.000001f) {
      continue;
    }
    const float dry_scale = 1.0f / block_dry_peak;
    const float send_scale = 1.0f / block_send_peak;
    for (uint32_t frame = 0; frame < 128u; ++frame) {
      diff = std::max(diff, std::fabs(dry_l[frame] * dry_scale - send_l[frame] * send_scale));
      diff = std::max(diff, std::fabs(dry_r[frame] * dry_scale - send_r[frame] * send_scale));
    }
  }
  return diff;
}

void requirePadFxSendsFollowPostLpf(uint32_t source_id, uint32_t dry_tap_id, const uint32_t* send_tap_ids, const char* label) {
  constexpr uint32_t kPadParamLevel = 51u;
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "pad post-LPF send engine create failed");
  enableGraphTaps(engine, "pad post-LPF graph tap enable failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  KesshoProductSourceSnapshot& source = snapshot.sources[source_id - 1u];
  source.level = 1.0f;
  source.dry_gain = 1.0f;
  source.reverb_send = 1.0f;
  source.delay_a_send = 1.0f;
  source.delay_b_send = 1.0f;
  source.granular_send = 1.0f;
  source.diffuse_send = 0.0f;
  source.post_lpf_hz = 220.0f;
  source.stereo_width = 1.0f;
  kessho::product::tests::applyGeneratedSourcePreset(
      snapshot,
      source_id,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_GLASS_SHIMMER);
  appendPadOverride(source, kPadParamLevel, 1.0f);

  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "pad post-LPF send snapshot load failed");
  triggerManual(engine, source_id, source_id == KESSHO_PRODUCT_SOURCE_PAD2 ? 67.0f : 60.0f);

  for (uint32_t index = 0; index < 4u; ++index) {
    float dry_peak = 0.0f;
    const float diff = maxNormalizedGraphTapDiff(engine, dry_tap_id, send_tap_ids[index], 96u, dry_peak);
    require(dry_peak > 0.000001f, "pad post-LPF dry graph tap did not render");
    require(diff < 0.015f, label);
  }
  kessho_product_destroy(engine);
}

void requirePadFxSendsFollowPostLpfForBothPads() {
  const uint32_t pad1_send_taps[] = {
      KESSHO_PRODUCT_GRAPH_TAP_PAD1_REVERB_SEND,
      KESSHO_PRODUCT_GRAPH_TAP_PAD1_DELAY_A_SEND,
      KESSHO_PRODUCT_GRAPH_TAP_PAD1_DELAY_B_SEND,
      KESSHO_PRODUCT_GRAPH_TAP_PAD1_GRANULAR_SEND,
  };
  requirePadFxSendsFollowPostLpf(
      KESSHO_PRODUCT_SOURCE_PAD1,
      KESSHO_PRODUCT_GRAPH_TAP_PAD1_DRY,
      pad1_send_taps,
      "pad 1 FX send bypassed source post-LPF");

  const uint32_t pad2_send_taps[] = {
      KESSHO_PRODUCT_GRAPH_TAP_PAD2_REVERB_SEND,
      KESSHO_PRODUCT_GRAPH_TAP_PAD2_DELAY_A_SEND,
      KESSHO_PRODUCT_GRAPH_TAP_PAD2_DELAY_B_SEND,
      KESSHO_PRODUCT_GRAPH_TAP_PAD2_GRANULAR_SEND,
  };
  requirePadFxSendsFollowPostLpf(
      KESSHO_PRODUCT_SOURCE_PAD2,
      KESSHO_PRODUCT_GRAPH_TAP_PAD2_DRY,
      pad2_send_taps,
      "pad 2 FX send bypassed source post-LPF");
}

struct PianoPostLpfGraphProbe {
  float dry_rms = 0.0f;
  float reverb_send_rms = 0.0f;
  float delay_a_send_rms = 0.0f;
  float delay_b_send_rms = 0.0f;
  float granular_send_rms = 0.0f;
};

void accumulateTapEnergy(
    KesshoProductEngine* engine,
    uint32_t tap_id,
    double& sum,
    uint32_t& count) {
  std::vector<float> left(128);
  std::vector<float> right(128);
  require(
      kessho_product_get_graph_tap(engine, tap_id, left.data(), right.data(), 128) == KESSHO_PRODUCT_OK,
      "piano post-LPF graph tap read failed");
  for (uint32_t i = 0; i < 128u; ++i) {
    require(std::isfinite(left[i]) && std::isfinite(right[i]), "non-finite piano graph tap sample");
    sum += static_cast<double>(left[i]) * static_cast<double>(left[i]);
    sum += static_cast<double>(right[i]) * static_cast<double>(right[i]);
    count += 2u;
  }
}

PianoPostLpfGraphProbe renderPianoPostLpfGraphProbe(float post_lpf_hz) {
  constexpr uint32_t piano_asset_id = 9013u;
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "piano post-LPF graph engine create failed");
  enableGraphTaps(engine, "piano post-LPF graph tap enable failed");

  std::vector<float> piano_sample(4096);
  constexpr float kFourKhzRadians = 0.5235987755982988f;
  for (uint32_t index = 0; index < piano_sample.size(); ++index) {
    piano_sample[index] = 0.65f * std::sin(static_cast<float>(index) * kFourKhzRadians);
  }
  const float* piano_channels[1] = {piano_sample.data()};
  require(
      kessho_product_register_asset_buffer(
          engine,
          piano_asset_id,
          piano_channels,
          1u,
          static_cast<uint32_t>(piano_sample.size()),
          48000.0,
          KESSHO_PRODUCT_ASSET_PIANO) == KESSHO_PRODUCT_OK,
      "piano post-LPF graph asset registration failed");

  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_PIANO - 1u];
  source.enabled = 1;
  source.asset_id = piano_asset_id;
  source.level = 1.0f;
  source.dry_gain = 1.0f;
  source.reverb_send = 1.0f;
  source.delay_a_send = 1.0f;
  source.delay_b_send = 1.0f;
  source.granular_send = 1.0f;
  source.diffuse_send = 0.0f;
  source.post_lpf_hz = post_lpf_hz;
  source.stereo_width = 1.0f;
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "piano post-LPF graph snapshot load failed");
  triggerManual(engine, KESSHO_PRODUCT_SOURCE_PIANO, 60.0f);

  double dry_sum = 0.0;
  double reverb_sum = 0.0;
  double delay_a_sum = 0.0;
  double delay_b_sum = 0.0;
  double granular_sum = 0.0;
  uint32_t dry_count = 0u;
  uint32_t reverb_count = 0u;
  uint32_t delay_a_count = 0u;
  uint32_t delay_b_count = 0u;
  uint32_t granular_count = 0u;
  std::vector<float> left(128);
  std::vector<float> right(128);
  for (uint32_t block = 0; block < 32u; ++block) {
    std::fill(left.begin(), left.end(), 0.0f);
    std::fill(right.begin(), right.end(), 0.0f);
    kessho_product_render(engine, left.data(), right.data(), 128);
    accumulateTapEnergy(engine, KESSHO_PRODUCT_GRAPH_TAP_PIANO_DRY, dry_sum, dry_count);
    accumulateTapEnergy(engine, KESSHO_PRODUCT_GRAPH_TAP_PIANO_REVERB_SEND, reverb_sum, reverb_count);
    accumulateTapEnergy(engine, KESSHO_PRODUCT_GRAPH_TAP_PIANO_DELAY_A_SEND, delay_a_sum, delay_a_count);
    accumulateTapEnergy(engine, KESSHO_PRODUCT_GRAPH_TAP_PIANO_DELAY_B_SEND, delay_b_sum, delay_b_count);
    accumulateTapEnergy(engine, KESSHO_PRODUCT_GRAPH_TAP_PIANO_GRANULAR_SEND, granular_sum, granular_count);
  }

  PianoPostLpfGraphProbe probe{};
  probe.dry_rms = std::sqrt(dry_sum / static_cast<double>(std::max<uint32_t>(1u, dry_count)));
  probe.reverb_send_rms = std::sqrt(reverb_sum / static_cast<double>(std::max<uint32_t>(1u, reverb_count)));
  probe.delay_a_send_rms = std::sqrt(delay_a_sum / static_cast<double>(std::max<uint32_t>(1u, delay_a_count)));
  probe.delay_b_send_rms = std::sqrt(delay_b_sum / static_cast<double>(std::max<uint32_t>(1u, delay_b_count)));
  probe.granular_send_rms = std::sqrt(granular_sum / static_cast<double>(std::max<uint32_t>(1u, granular_count)));
  kessho_product_destroy(engine);
  return probe;
}

void requirePianoFxSendsFollowPostLpf() {
  const PianoPostLpfGraphProbe high = renderPianoPostLpfGraphProbe(18000.0f);
  const PianoPostLpfGraphProbe low = renderPianoPostLpfGraphProbe(250.0f);
  require(high.dry_rms > low.dry_rms * 8.0f, "piano post-LPF did not affect dry graph tap");
  require(high.reverb_send_rms > low.reverb_send_rms * 8.0f, "piano reverb send bypassed source post-LPF");
  require(high.delay_a_send_rms > low.delay_a_send_rms * 8.0f, "piano Delay A send bypassed source post-LPF");
  require(high.delay_b_send_rms > low.delay_b_send_rms * 8.0f, "piano Delay B send bypassed source post-LPF");
  require(high.granular_send_rms > low.granular_send_rms * 8.0f, "piano granular send bypassed source post-LPF");
}

float renderRmsWithLeadPostLpf(float snapshot_cutoff_hz, bool send_param_event) {
  const auto* rhodes = generatedPreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES);
  require(rhodes != nullptr, "LeadSoftRhodes preset missing for source post-chain test");

  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "source post-chain engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u];
  source.preset_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES;
  source.level = 1.0f;
  source.expression = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_EXPRESSION;
  source.post_lpf_hz = send_param_event ? 18000.0f : snapshot_cutoff_hz;
  source.stereo_width = 1.0f;
  source.source_preset_a_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES;
  source.source_preset_b_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES;
  appendLeadOverride(source, 62u, 0.8f);

  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "source post-chain snapshot load failed");
  if (send_param_event) {
    setSourceParam(engine, KESSHO_PRODUCT_SOURCE_LEAD1, KESSHO_PRODUCT_PARAM_SOURCE_POST_LPF_HZ_ID, snapshot_cutoff_hz);
  }
  triggerManual(engine, KESSHO_PRODUCT_SOURCE_LEAD1, 64.0f);
  const float result = renderDeltaRmsBlocks(engine);
  kessho_product_destroy(engine);
  return result;
}

float renderDeltaRmsWithPadPostLpf(uint32_t source_id, float snapshot_cutoff_hz, bool send_param_event) {
  const uint32_t preset_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_GLASS_SHIMMER;
  const auto* preset = generatedPreset(preset_id);
  require(preset != nullptr, "Glass Shimmer preset missing for pad post-chain test");

  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "pad source post-chain engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  KesshoProductSourceSnapshot& source = snapshot.sources[source_id - 1u];
  source.level = 1.0f;
  source.dry_gain = 1.0f;
  source.reverb_send = 0.0f;
  source.delay_a_send = 0.0f;
  source.delay_b_send = 0.0f;
  source.granular_send = 0.0f;
  source.diffuse_send = 0.0f;
  source.post_lpf_hz = send_param_event ? 18000.0f : snapshot_cutoff_hz;
  source.stereo_width = 1.0f;
  kessho::product::tests::applyGeneratedSourcePreset(snapshot, source_id, preset_id);

  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "pad source post-chain snapshot load failed");
  if (send_param_event) {
    setSourceParam(engine, source_id, KESSHO_PRODUCT_PARAM_SOURCE_POST_LPF_HZ_ID, snapshot_cutoff_hz);
  }
  triggerManual(engine, source_id, source_id == KESSHO_PRODUCT_SOURCE_PAD2 ? 67.0f : 60.0f);
  const float result = renderDeltaRmsBlocks(engine, 96u);
  kessho_product_destroy(engine);
  return result;
}

float renderDeltaRmsWithOpenPadFilterAndPostLpf(uint32_t source_id, float internal_filter_hz, float post_lpf_hz) {
  const uint32_t preset_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_SATURATED_DRIFT;
  const auto* preset = generatedPreset(preset_id);
  require(preset != nullptr, "Saturated Drift preset missing for pad post-LPF dominance test");

  constexpr uint32_t kPadParamFilterCutoff = 21u;
  constexpr uint32_t kPadParamLfo1Depth = 37u;
  constexpr uint32_t kPadParamLfo2Depth = 41u;
  constexpr uint32_t kPadParamModEnvEnabled = 44u;
  constexpr uint32_t kPadParamLevel = 51u;

  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "pad open-filter post-LPF engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  KesshoProductSourceSnapshot& source = snapshot.sources[source_id - 1u];
  source.level = 1.0f;
  source.dry_gain = 1.0f;
  source.reverb_send = 0.0f;
  source.delay_a_send = 0.0f;
  source.delay_b_send = 0.0f;
  source.granular_send = 0.0f;
  source.diffuse_send = 0.0f;
  source.post_lpf_hz = post_lpf_hz;
  source.stereo_width = 1.0f;
  kessho::product::tests::applyGeneratedSourcePreset(snapshot, source_id, preset_id);
  appendPadOverride(source, kPadParamFilterCutoff, internal_filter_hz);
  appendPadOverride(source, kPadParamLfo1Depth, 0.0f);
  appendPadOverride(source, kPadParamLfo2Depth, 0.0f);
  appendPadOverride(source, kPadParamModEnvEnabled, 0.0f);
  appendPadOverride(source, kPadParamLevel, 1.0f);

  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "pad open-filter post-LPF snapshot load failed");
  triggerManual(engine, source_id, source_id == KESSHO_PRODUCT_SOURCE_PAD2 ? 67.0f : 60.0f);
  const float result = renderDeltaRmsBlocks(engine, 96u);
  kessho_product_destroy(engine);
  return result;
}

float renderHighBandRmsWithOpenPadFilterAndPostLpf(
    uint32_t source_id,
    float internal_filter_hz,
    float post_lpf_hz,
    float highpass_hz = 3000.0f) {
  const uint32_t preset_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_SATURATED_DRIFT;
  const auto* preset = generatedPreset(preset_id);
  require(preset != nullptr, "Saturated Drift preset missing for pad post-LPF high-band test");

  constexpr uint32_t kPadParamFilterCutoff = 21u;
  constexpr uint32_t kPadParamLfo1Depth = 37u;
  constexpr uint32_t kPadParamLfo2Depth = 41u;
  constexpr uint32_t kPadParamModEnvEnabled = 44u;
  constexpr uint32_t kPadParamLevel = 51u;

  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "pad high-band post-LPF engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  KesshoProductSourceSnapshot& source = snapshot.sources[source_id - 1u];
  source.level = 1.0f;
  source.dry_gain = 1.0f;
  source.reverb_send = 0.0f;
  source.delay_a_send = 0.0f;
  source.delay_b_send = 0.0f;
  source.granular_send = 0.0f;
  source.diffuse_send = 0.0f;
  source.post_lpf_hz = post_lpf_hz;
  source.stereo_width = 1.0f;
  kessho::product::tests::applyGeneratedSourcePreset(snapshot, source_id, preset_id);
  appendPadOverride(source, kPadParamFilterCutoff, internal_filter_hz);
  appendPadOverride(source, kPadParamLfo1Depth, 0.0f);
  appendPadOverride(source, kPadParamLfo2Depth, 0.0f);
  appendPadOverride(source, kPadParamModEnvEnabled, 0.0f);
  appendPadOverride(source, kPadParamLevel, 1.0f);

  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "pad high-band post-LPF snapshot load failed");
  triggerManual(engine, source_id, source_id == KESSHO_PRODUCT_SOURCE_PAD2 ? 67.0f : 60.0f);
  const float result = renderHighpassRmsBlocks(engine, highpass_hz, 96u);
  kessho_product_destroy(engine);
  return result;
}

float renderDeltaRmsWithLeadPostLpfTracking(float tracking, bool send_param_event) {
  const auto* rhodes = generatedPreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES);
  require(rhodes != nullptr, "LeadSoftRhodes preset missing for source post-LPF tracking test");

  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "source post-LPF tracking engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u];
  source.preset_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES;
  source.level = 1.0f;
  source.expression = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_EXPRESSION;
  source.post_lpf_hz = 400.0f;
  source.stereo_width = 1.0f;
  source.post_lpf_key_tracking = send_param_event ? 0.0f : tracking;
  source.source_preset_a_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES;
  source.source_preset_b_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES;
  appendLeadOverride(source, 62u, 0.8f);

  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "source post-LPF tracking snapshot load failed");
  if (send_param_event) {
    setSourceParam(engine, KESSHO_PRODUCT_SOURCE_LEAD1, KESSHO_PRODUCT_PARAM_SOURCE_POST_LPF_KEY_TRACKING_ID, tracking);
  }
  triggerManual(engine, KESSHO_PRODUCT_SOURCE_LEAD1, 84.0f);
  const float result = renderDeltaRmsBlocks(engine);
  kessho_product_destroy(engine);
  return result;
}

void requireSourcePostChainAffectsRender() {
  const uint32_t pad_sources[] = {KESSHO_PRODUCT_SOURCE_PAD1, KESSHO_PRODUCT_SOURCE_PAD2};
  for (const uint32_t source_id : pad_sources) {
    const float high_pad_snapshot = renderDeltaRmsWithPadPostLpf(source_id, 18000.0f, false);
    const float low_pad_snapshot = renderDeltaRmsWithPadPostLpf(source_id, 250.0f, false);
    require(high_pad_snapshot > low_pad_snapshot * 1.5f, "source snapshot post-LPF did not affect pad render");

    const float high_pad_event = renderDeltaRmsWithPadPostLpf(source_id, 18000.0f, true);
    const float low_pad_event = renderDeltaRmsWithPadPostLpf(source_id, 250.0f, true);
    require(high_pad_event > low_pad_event * 1.5f, "source post-LPF param event did not affect pad render");

    const float open_filter_high_post = renderDeltaRmsWithOpenPadFilterAndPostLpf(source_id, 8000.0f, 8000.0f);
    const float open_filter_low_post = renderDeltaRmsWithOpenPadFilterAndPostLpf(source_id, 8000.0f, 600.0f);
    require(
        open_filter_high_post > open_filter_low_post * 1.5f,
        "pad post-LPF did not remain downstream when internal filter was opened");

    const float open_filter_high_band_high_post = renderHighBandRmsWithOpenPadFilterAndPostLpf(source_id, 8000.0f, 8000.0f);
    const float open_filter_high_band_low_post = renderHighBandRmsWithOpenPadFilterAndPostLpf(source_id, 8000.0f, 600.0f);
    require(
        open_filter_high_band_high_post > open_filter_high_band_low_post * 3.0f,
        "pad post-LPF did not attenuate high-band energy when internal filter was opened");
    const float open_filter_presence_high_post =
        renderHighBandRmsWithOpenPadFilterAndPostLpf(source_id, 8000.0f, 8000.0f, 1200.0f);
    const float open_filter_presence_low_post =
        renderHighBandRmsWithOpenPadFilterAndPostLpf(source_id, 8000.0f, 600.0f, 1200.0f);
    require(
        open_filter_presence_low_post < open_filter_presence_high_post * 0.30f,
        "pad post-LPF did not suppress near-band brightness when internal filter was opened above it");
  }

  const float high_snapshot = renderRmsWithLeadPostLpf(18000.0f, false);
  const float low_snapshot = renderRmsWithLeadPostLpf(250.0f, false);
  require(high_snapshot > low_snapshot * 2.0f, "source snapshot post-LPF did not affect lead render");

  const float high_event = renderRmsWithLeadPostLpf(18000.0f, true);
  const float low_event = renderRmsWithLeadPostLpf(250.0f, true);
  require(high_event > low_event * 2.0f, "source post-LPF param event did not affect lead render");

  const float untracked_snapshot = renderDeltaRmsWithLeadPostLpfTracking(0.0f, false);
  const float tracked_snapshot = renderDeltaRmsWithLeadPostLpfTracking(1.0f, false);
  require(tracked_snapshot > untracked_snapshot * 1.1f, "source snapshot post-LPF key tracking did not affect lead render");

  const float untracked_event = renderDeltaRmsWithLeadPostLpfTracking(0.0f, true);
  const float tracked_event = renderDeltaRmsWithLeadPostLpfTracking(1.0f, true);
  require(tracked_event > untracked_event * 1.1f, "source post-LPF key tracking param event did not affect lead render");
}

float renderRmsWithSourceMacros(uint32_t source_id, float morph, float distance, float expression) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "macro engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  if (source_id == KESSHO_PRODUCT_SOURCE_PAD1 || source_id == KESSHO_PRODUCT_SOURCE_PAD2) {
    KesshoProductSourceSnapshot& source = snapshot.sources[source_id - 1u];
    source.source_preset_a_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_SOFT_PLUCK;
    source.source_preset_b_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_BUCHLA_PLUCK;
  }
  snapshot.sources[source_id - 1u].morph = morph;
  snapshot.sources[source_id - 1u].distance = distance;
  snapshot.sources[source_id - 1u].expression = expression;
  snapshot.sources[source_id - 1u].level = 1.0f;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "macro snapshot load failed");
  triggerManual(engine, source_id, source_id == KESSHO_PRODUCT_SOURCE_DRUM ? 36.0f : 64.0f);

  const float result = renderRmsBlocks(engine);
  kessho_product_destroy(engine);
  return result;
}

void requireSourceMacrosAffectRender() {
  const float quiet_pad = renderRmsWithSourceMacros(KESSHO_PRODUCT_SOURCE_PAD1, 0.0f, 0.0f, 0.15f);
  const float bright_pad = renderRmsWithSourceMacros(KESSHO_PRODUCT_SOURCE_PAD1, 0.9f, 0.8f, 1.0f);
  // Exact Pad endpoints own their wavefolder/envelope shape; endpoint morph/distance can darken
  // the render, so the wrapper smoke test should assert change rather than "brighter is louder".
  require(std::fabs(bright_pad - quiet_pad) > quiet_pad * 0.001f, "pad source endpoint controls did not affect render energy");
}

float renderPeakWithSourcePreset(uint32_t source_id, uint32_t preset_id, uint32_t blocks = 64) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "preset macro engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  snapshot.sources[source_id - 1u].preset_id = preset_id;
  kessho::product::tests::applyGeneratedSourcePreset(snapshot, source_id, preset_id);
  snapshot.sources[source_id - 1u].morph = 0.15f;
  snapshot.sources[source_id - 1u].distance = 0.1f;
  snapshot.sources[source_id - 1u].expression = 0.65f;
  snapshot.sources[source_id - 1u].level = 1.0f;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "preset macro snapshot load failed");
  triggerManual(engine, source_id, source_id == KESSHO_PRODUCT_SOURCE_DRUM ? 36.0f : 64.0f);

  const float result = renderPeakBlocks(engine, blocks);
  kessho_product_destroy(engine);
  return result;
}

void requireSourcePresetMacrosAffectRender() {
  static_assert(
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESETS[0].macro_expression > 0.0f,
      "generated source presets must expose macro fields");
  const float init_peak = renderPeakWithSourcePreset(
      KESSHO_PRODUCT_SOURCE_PAD1,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_INIT);
  const float pluck_peak = renderPeakWithSourcePreset(
      KESSHO_PRODUCT_SOURCE_PAD1,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_PLUCK_BELL);
  require(pluck_peak > init_peak * 2.0f, "generated exact pad preset envelope did not affect render");

  const float rhodes_peak = renderPeakWithSourcePreset(
      KESSHO_PRODUCT_SOURCE_LEAD1,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES);
  const float gamelan_peak = renderPeakWithSourcePreset(
      KESSHO_PRODUCT_SOURCE_LEAD1,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_GAMELAN);
  require(std::fabs(gamelan_peak - rhodes_peak) > 0.00001f, "generated lead preset profile did not affect render");
}

void requireBroadPadPresetFamiliesRender() {
  const uint32_t representative_pad_presets[] = {
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_INIT,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_DEEP_SUB_DRONE,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_GLASS_SHIMMER,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_PLUCK_BELL,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_SYNC_LEAD,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_SERGE_SWARM,
  };
  const uint32_t pad_sources[] = {KESSHO_PRODUCT_SOURCE_PAD1, KESSHO_PRODUCT_SOURCE_PAD2};

  for (const uint32_t source_id : pad_sources) {
    float min_peak = 1000000.0f;
    float max_peak = 0.0f;
    for (const uint32_t preset_id : representative_pad_presets) {
      const auto* preset = generatedPreset(preset_id);
      require(preset != nullptr, "representative generated pad preset missing");
      require(generatedSourceMatches(*preset, "pad"), "representative generated pad preset has wrong source family");
      const float peak = renderPeakWithSourcePreset(source_id, preset_id, 256);
      require(peak > 0.000001f, "representative generated pad preset did not render");
      min_peak = std::min(min_peak, peak);
      max_peak = std::max(max_peak, peak);
    }
    require(max_peak > min_peak * 1.1f, "representative generated pad presets did not produce distinct levels");
  }
}

void requireBroadLeadPresetFamiliesRender() {
  const uint32_t lead_sources[] = {KESSHO_PRODUCT_SOURCE_LEAD1, KESSHO_PRODUCT_SOURCE_LEAD2};
  for (const uint32_t source_id : lead_sources) {
    const float rhodes_peak = renderPeakWithSourcePreset(
        source_id,
        kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES);
    const float gamelan_peak = renderPeakWithSourcePreset(
        source_id,
        kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_GAMELAN);
    require(rhodes_peak > 0.000001f, "generated LeadSoftRhodes preset did not render");
    require(gamelan_peak > 0.000001f, "generated LeadGamelan preset did not render");
    require(std::fabs(gamelan_peak - rhodes_peak) > 0.00001f, "generated lead presets did not produce distinct levels");
  }
}

void requireGeneratedDrumPresetRenders() {
  const float drum_peak = renderPeakWithSourcePreset(
      KESSHO_PRODUCT_SOURCE_DRUM,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_DRUM_DEFAULT);
  require(drum_peak > 0.0001f, "generated DrumDefault preset did not render");
}

void requireGeneratedAssetPresetTelemetryCoverage() {
  const uint32_t asset_source_presets[] = {
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PIANO_DEFAULT,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_SOUNDSCAPE_OCEAN_SAMPLE,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_SOUNDSCAPE_WATER0,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_SOUNDSCAPE_WATER1,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_SOUNDSCAPE_WATER2,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_SOUNDSCAPE_WATER3,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_SOUNDSCAPE_WATER4,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_SOUNDSCAPE_WATER5,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_SOUNDSCAPE_WATER6,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_SOUNDSCAPE_WATER7,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_SOUNDSCAPE_BIRDS,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_SOUNDSCAPE_BIRDS2,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_SOUNDSCAPE_FROGS,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_SOUNDSCAPE_INSECTS,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_SOUNDSCAPE_INSECTS2,
  };

  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "asset preset telemetry engine create failed");
  std::vector<float> left(128);
  std::vector<float> right(128);
  for (const uint32_t preset_id : asset_source_presets) {
    const auto* preset = generatedPreset(preset_id);
    require(preset != nullptr, "generated asset-backed source preset missing");
    const uint32_t source_id = generatedSourceMatches(*preset, "sample")
        ? KESSHO_PRODUCT_SOURCE_PIANO
        : KESSHO_PRODUCT_SOURCE_SOUNDSCAPE;
    require(
        generatedSourceMatches(*preset, "sample") || generatedSourceMatches(*preset, "soundscape"),
        "asset-backed generated preset has wrong source family");

    KesshoProductSnapshotV2 snapshot = makeSnapshot();
    snapshot.sources[source_id - 1u].preset_id = preset_id;
    kessho::product::tests::applyGeneratedSourcePreset(snapshot, source_id, preset_id);
    require(
        kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
        "asset-backed generated source preset snapshot load failed");
    std::fill(left.begin(), left.end(), 0.0f);
    std::fill(right.begin(), right.end(), 0.0f);
    kessho_product_render(engine, left.data(), right.data(), 128);
    const KesshoProductTelemetry telemetry = kessho_product_get_telemetry(engine);
    require(telemetry.source_preset_ids[source_id - 1u] == preset_id, "asset-backed generated source preset missed telemetry");
  }
  kessho_product_destroy(engine);
}

float renderPeakWithLeadSnapshotGain(float gain) {
  const auto* rhodes = generatedPreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES);
  require(rhodes != nullptr, "LeadSoftRhodes preset missing for sparse override snapshot test");

  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "sparse Lead snapshot engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u];
  source.preset_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES;
  source.level = 1.0f;
  source.morph = 0.0f;
  source.distance = 0.0f;
  source.expression = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_EXPRESSION;
  source.source_preset_a_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES;
  source.source_preset_b_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES;
  appendLeadOverride(source, 62u, gain);

  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "sparse Lead snapshot load failed");
  triggerManual(engine, KESSHO_PRODUCT_SOURCE_LEAD1, 64.0f);
  const float result = renderPeakBlocks(engine);
  kessho_product_destroy(engine);
  return result;
}

void requireSnapshotSparseLeadParamsAffectRender() {
  const float low_gain_peak = renderPeakWithLeadSnapshotGain(0.05f);
  const float high_gain_peak = renderPeakWithLeadSnapshotGain(0.8f);
  require(high_gain_peak > low_gain_peak * 3.0f, "snapshot sparse Lead params did not affect render gain");
}

float renderDrumSubWithSparseLevel(float sub_level) {
  const auto* drum = generatedPreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_DRUM_DEFAULT);
  require(drum != nullptr, "DrumDefault preset missing for sparse Drum override test");

  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "sparse Drum override engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u];
  source.level = 1.0f;
  source.expression = 1.0f;
  source.preset_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_DRUM_DEFAULT;
  appendDrumOverride(source, 2u, sub_level);

  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "sparse Drum override snapshot load failed");
  triggerManual(engine, KESSHO_PRODUCT_SOURCE_DRUM, kDrumSubMidiNote);
  const float result = renderPeakBlocks(engine);
  kessho_product_destroy(engine);
  return result;
}

void requireSnapshotSparseDrumParamsAffectRender() {
  const float normal = renderDrumSubWithSparseLevel(0.8f);
  const float muted = renderDrumSubWithSparseLevel(0.0f);
  require(normal > 0.0001f, "sparse Drum default patch did not render");
  require(muted < normal * 0.1f, "sparse Drum snapshot override did not change rendered sub level");
}

void requireLiveSparseDrumParamsSurviveTrigger() {
  constexpr uint32_t kSubLevelParamIndex = 2u;
  const auto* drum = generatedPreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_DRUM_DEFAULT);
  require(drum != nullptr, "DrumDefault preset missing for live sparse Drum override test");

  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "live sparse Drum override engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u];
  source.level = 1.0f;
  source.expression = 1.0f;
  source.preset_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_DRUM_DEFAULT;
  appendDrumOverride(source, kSubLevelParamIndex, 0.8f);

  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "live sparse Drum override snapshot load failed");
  require(engine->drum_module != nullptr, "drum module missing for live sparse override test");
  const float* drum_params = engine->drum_module->params();
  require(drum_params != nullptr, "drum module params missing for live sparse override test");
  require(std::fabs(drum_params[kSubLevelParamIndex] - 0.8f) < 0.0001f, "sparse Drum snapshot did not initialize module params");

  KesshoProductEvent event{};
  event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
  event.param_id = kProductDrumRuntimeParamIdBase + kSubLevelParamIndex;
  event.value = 0.0f;
  engine->applyParam(event);
  require(engine->telemetry.last_error_code == KESSHO_PRODUCT_OK, "live sparse Drum param event failed");
  const SourceState& loaded = engine->sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u];
  require(loaded.drum_override_count == 1u, "live sparse Drum param missed source state count");
  require(loaded.drum_override_indices[0] == kSubLevelParamIndex, "live sparse Drum param missed source state index");
  require(std::fabs(loaded.drum_override_values[0]) < 0.0001f, "live sparse Drum param missed source state value");
  require(std::fabs(drum_params[kSubLevelParamIndex]) < 0.0001f, "live sparse Drum param missed module params");

  triggerManual(engine, KESSHO_PRODUCT_SOURCE_DRUM, kDrumSubMidiNote);
  require(std::fabs(drum_params[kSubLevelParamIndex]) < 0.0001f, "drum trigger restored stale source preset over live sparse params");
  kessho_product_destroy(engine);
}

float renderDrumSubWithGeneratedVoicePreset(const char* preset_name) {
  const auto* preset = generatedDrumVoicePreset(0u, preset_name);
  require(preset != nullptr, "generated drum voice preset missing for render test");

  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "generated drum voice preset engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u];
  source.level = 1.0f;
  source.expression = 1.0f;
  source.preset_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_DRUM_DEFAULT;
  source.drum_voice_preset_a_ids[0] = preset->id;
  source.drum_voice_preset_b_ids[0] = preset->id;
  source.drum_voice_morphs[0] = 0.0f;

  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "generated drum voice preset snapshot load failed");
  triggerManual(engine, KESSHO_PRODUCT_SOURCE_DRUM, kDrumSubMidiNote);
  const float result = renderPeakBlocks(engine);
  kessho_product_destroy(engine);
  return result;
}

void requireGeneratedDrumVoicePresetsAffectRender() {
  const float classic = renderDrumSubWithGeneratedVoicePreset("Classic Sub");
  const float soft = renderDrumSubWithGeneratedVoicePreset("Soft Touch");
  require(classic > 0.0001f, "generated Classic Sub preset did not render");
  require(soft < classic * 0.75f, "generated drum voice preset selection did not affect rendered sub level");
}

std::vector<float> renderDrumSubReconstructionProof(const char* preset_name, bool use_voice_preset_ids) {
  const auto* preset = generatedDrumVoicePreset(0u, preset_name);
  require(preset != nullptr, "generated drum voice preset missing for reconstruction proof");

  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "drum reconstruction proof engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u];
  source.level = 1.0f;
  source.expression = 1.0f;
  source.preset_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_DRUM_DEFAULT;

  if (use_voice_preset_ids) {
    source.drum_voice_preset_a_ids[preset->voice_index] = preset->id;
    source.drum_voice_preset_b_ids[preset->voice_index] = preset->id;
    source.drum_voice_morphs[preset->voice_index] = 0.0f;
  } else {
    const uint32_t end = std::min<uint32_t>(
        preset->param_start + preset->param_count,
        kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_PARAM_COUNT);
    for (uint32_t index = preset->param_start; index < end; ++index) {
      appendDrumOverride(source, index, preset->params[index]);
    }
  }

  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "drum reconstruction proof snapshot load failed");
  triggerManual(engine, KESSHO_PRODUCT_SOURCE_DRUM, kDrumSubMidiNote);

  std::vector<float> left(128);
  std::vector<float> right(128);
  std::vector<float> samples;
  samples.reserve(64u * 128u * 2u);
  for (uint32_t block = 0; block < 64; ++block) {
    std::fill(left.begin(), left.end(), 0.0f);
    std::fill(right.begin(), right.end(), 0.0f);
    kessho_product_render(engine, left.data(), right.data(), 128);
    for (uint32_t index = 0; index < 128; ++index) {
      samples.push_back(left[index]);
      samples.push_back(right[index]);
    }
  }
  kessho_product_destroy(engine);
  return samples;
}

void requireDrumVoicePresetIdsReconstructSparseDrumOverrides() {
  const std::vector<float> from_voice_ids = renderDrumSubReconstructionProof("Soft Touch", true);
  const std::vector<float> from_sparse_overrides = renderDrumSubReconstructionProof("Soft Touch", false);
  require(peakSamples(from_voice_ids) > 0.0001f, "drum voice preset ID reconstruction did not render");
  require(
      maxAbsDiff(from_voice_ids, from_sparse_overrides) < 0.000001f,
      "drum voice preset IDs did not reconstruct the equivalent sparse Drum overrides");
}

float renderDelayedLeadPeakWithSourceHold(float source_hold_seconds, float event_hold_seconds) {
  const auto* rhodes = generatedPreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES);
  require(rhodes != nullptr, "LeadSoftRhodes preset missing for source hold test");

  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "source hold engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u];
  source.preset_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES;
  source.level = 1.0f;
  source.expression = 1.0f;
  source.hold_seconds = source_hold_seconds;
  source.source_preset_a_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES;
  source.source_preset_b_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES;
  appendLeadOverride(source, 44u, 0.03f);
  appendLeadOverride(source, 45u, 1.0f);
  appendLeadOverride(source, 46u, 0.02f);
  appendLeadOverride(source, 62u, 0.8f);

  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "source hold snapshot load failed");

  KesshoProductEvent note{};
  note.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  note.target_id = KESSHO_PRODUCT_SOURCE_LEAD1;
  note.value = 64.0f;
  note.value2 = 0.9f;
  note.value3 = event_hold_seconds;
  require(kessho_product_enqueue_event(engine, &note) == KESSHO_PRODUCT_OK, "source hold manual note enqueue failed");

  std::vector<float> left(128);
  std::vector<float> right(128);
  float delayed_peak = 0.0f;
  for (uint32_t block = 0; block < 96; ++block) {
    std::fill(left.begin(), left.end(), 0.0f);
    std::fill(right.begin(), right.end(), 0.0f);
    kessho_product_render(engine, left.data(), right.data(), 128);
    if (block >= 56 && block < 72) {
      delayed_peak = std::max(delayed_peak, peakRange(left, right, 0, 128));
    }
  }
  kessho_product_destroy(engine);
  return delayed_peak;
}

void requireManualLeadUsesSourceHold() {
  const float short_source_peak = renderDelayedLeadPeakWithSourceHold(0.02f, 0.5f);
  const float long_source_peak = renderDelayedLeadPeakWithSourceHold(0.5f, 0.02f);
  require(long_source_peak > short_source_peak * 2.0f, "manual lead trigger did not use source snapshot hold");
}

void requireSourcePresetTelemetryAndEvent() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "source preset engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].preset_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_GLASS_SHIMMER;
  kessho::product::tests::applyGeneratedSourcePreset(
      snapshot,
      KESSHO_PRODUCT_SOURCE_PAD1,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_GLASS_SHIMMER);
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "source preset snapshot load failed");

  std::vector<float> left(128);
  std::vector<float> right(128);
  kessho_product_render(engine, left.data(), right.data(), 128);
  KesshoProductTelemetry telemetry = kessho_product_get_telemetry(engine);
  require(
      telemetry.source_preset_ids[KESSHO_PRODUCT_SOURCE_PAD1 - 1u] ==
          kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_GLASS_SHIMMER,
      "source preset snapshot did not reach telemetry");

  KesshoProductEvent event{};
  event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SOURCE_PRESET;
  event.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  event.value = static_cast<float>(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_SERGE_SWARM);
  require(kessho_product_enqueue_event(engine, &event) == KESSHO_PRODUCT_OK, "source preset event enqueue failed");
  kessho_product_render(engine, left.data(), right.data(), 128);
  telemetry = kessho_product_get_telemetry(engine);
  require(
      telemetry.source_preset_ids[KESSHO_PRODUCT_SOURCE_PAD1 - 1u] ==
          kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_SERGE_SWARM,
      "source preset event did not reach telemetry");
  kessho_product_destroy(engine);
}

void requireSampleOffsetManualTrigger() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "offset engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].preset_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_PLUCK_BELL;
  kessho::product::tests::applyGeneratedSourcePreset(
      snapshot,
      KESSHO_PRODUCT_SOURCE_PAD1,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_PLUCK_BELL);
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "offset snapshot load failed");
  triggerManual(engine, KESSHO_PRODUCT_SOURCE_PAD1, 60.0f, 64);

  std::vector<float> left(128);
  std::vector<float> right(128);
  kessho_product_render(engine, left.data(), right.data(), 128);
  const float before_offset = peakRange(left, right, 0, 64);
  const float after_offset = peakRange(left, right, 64, 128);
  require(before_offset < 0.000001f, "sample-offset note rendered before its offset");
  require(after_offset > 0.00001f, "sample-offset note did not render after its offset");

  std::fill(left.begin(), left.end(), 0.0f);
  std::fill(right.begin(), right.end(), 0.0f);
  kessho_product_render(engine, left.data(), right.data(), 128);
  require(peakRange(left, right, 0, 128) > 0.0001f, "sample-offset note did not continue after its onset quantum");
  kessho_product_destroy(engine);
}

void requireRepresentativeFullArrangementProbe() {
  constexpr uint32_t piano_asset_id = 8101u;
  constexpr uint32_t soundscape_asset_id = 8102u;

  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "full arrangement engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  snapshot.transport.running = 1;
  snapshot.master.gain = 0.55f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].preset_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_GLASS_SHIMMER;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD2 - 1u].preset_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_SERGE_SWARM;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u].preset_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD2 - 1u].preset_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_GAMELAN;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u].preset_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_DRUM_DEFAULT;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PIANO - 1u].preset_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PIANO_DEFAULT;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PIANO - 1u].asset_id = piano_asset_id;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1u].preset_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_SOUNDSCAPE_WATER3;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1u].asset_id = soundscape_asset_id;
  kessho::product::tests::applyGeneratedSourceDefaults(snapshot);
  snapshot.asset_refs[0] = soundscape_asset_id;
  snapshot.asset_ref_levels[0] = 1.0f;
  for (uint32_t index = 0; index < 7; ++index) {
    snapshot.sources[index].level = 0.72f;
    snapshot.sources[index].dry_gain = 1.0f;
    snapshot.sources[index].expression = 0.85f;
    snapshot.sources[index].post_lpf_hz = 16000.0f;
    snapshot.sources[index].stereo_width = 1.0f;
  }

  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "full arrangement snapshot load failed");

  float piano_data[256]{};
  for (uint32_t index = 0; index < 256; ++index) {
    piano_data[index] = (index < 96u) ? 0.45f : 0.0f;
  }
  const float* piano_channels[1] = {piano_data};
  require(
      kessho_product_register_asset_buffer(
          engine,
          piano_asset_id,
          piano_channels,
          1,
          256,
          48000.0,
          KESSHO_PRODUCT_ASSET_PIANO) == KESSHO_PRODUCT_OK,
      "full arrangement piano asset registration failed");

  float soundscape_left[512]{};
  float soundscape_right[512]{};
  for (uint32_t index = 0; index < 512; ++index) {
    const float phase = static_cast<float>(index) * 0.049087385f;
    soundscape_left[index] = 0.28f * static_cast<float>(std::sin(phase));
    soundscape_right[index] = 0.28f * static_cast<float>(std::sin(phase + 0.8f));
  }
  const float* soundscape_channels[2] = {soundscape_left, soundscape_right};
  require(
      kessho_product_register_asset_buffer(
          engine,
          soundscape_asset_id,
          soundscape_channels,
          2,
          512,
          48000.0,
          KESSHO_PRODUCT_ASSET_LOOP | KESSHO_PRODUCT_ASSET_SOUNDSCAPE) == KESSHO_PRODUCT_OK,
      "full arrangement soundscape asset registration failed");

  triggerManual(engine, KESSHO_PRODUCT_SOURCE_PAD1, 60.0f, 0u);
  triggerManual(engine, KESSHO_PRODUCT_SOURCE_PAD2, 67.0f, 16u);
  triggerManual(engine, KESSHO_PRODUCT_SOURCE_LEAD1, 64.0f, 32u);
  triggerManual(engine, KESSHO_PRODUCT_SOURCE_LEAD2, 71.0f, 48u);
  triggerManual(engine, KESSHO_PRODUCT_SOURCE_DRUM, 36.0f, 64u);
  triggerManual(engine, KESSHO_PRODUCT_SOURCE_PIANO, 72.0f, 80u);

  std::vector<float> left(128);
  std::vector<float> right(128);
  std::vector<float> stem_l(128);
  std::vector<float> stem_r(128);
  float master_peak = 0.0f;
  float stem_peaks[8]{};
  require(kessho_product_set_stems_enabled(engine, 1u) == KESSHO_PRODUCT_OK, "full arrangement stem enable failed");
  for (uint32_t block = 0; block < 256; ++block) {
    std::fill(left.begin(), left.end(), 0.0f);
    std::fill(right.begin(), right.end(), 0.0f);
    kessho_product_render(engine, left.data(), right.data(), 128);
    master_peak = std::max(master_peak, peakRange(left, right, 0, 128));
    for (uint32_t stem_id = KESSHO_PRODUCT_STEM_PAD1; stem_id <= KESSHO_PRODUCT_STEM_SOUNDSCAPE; ++stem_id) {
      require(kessho_product_get_stem(engine, stem_id, stem_l.data(), stem_r.data(), 128) == KESSHO_PRODUCT_OK, "full arrangement stem read failed");
      stem_peaks[stem_id] = std::max(stem_peaks[stem_id], peakRange(stem_l, stem_r, 0, 128));
    }
  }

  require(master_peak > 0.001f, "full arrangement master did not render");
  require(stem_peaks[KESSHO_PRODUCT_STEM_PAD1] > 0.000001f, "full arrangement Pad1 stem did not render");
  require(stem_peaks[KESSHO_PRODUCT_STEM_PAD2] > 0.000001f, "full arrangement Pad2 stem did not render");
  require(stem_peaks[KESSHO_PRODUCT_STEM_LEAD1] > 0.000001f, "full arrangement Lead1 stem did not render");
  require(stem_peaks[KESSHO_PRODUCT_STEM_LEAD2] > 0.000001f, "full arrangement Lead2 stem did not render");
  require(stem_peaks[KESSHO_PRODUCT_STEM_DRUM] > 0.000001f, "full arrangement Drum stem did not render");
  require(stem_peaks[KESSHO_PRODUCT_STEM_PIANO] > 0.000001f, "full arrangement Piano stem did not render");
  require(stem_peaks[KESSHO_PRODUCT_STEM_SOUNDSCAPE] > 0.000001f, "full arrangement Soundscape stem did not render");

  const KesshoProductTelemetry telemetry = kessho_product_get_telemetry(engine);
  require(telemetry.active_assets >= 2u, "full arrangement registered assets missing from telemetry");
  require(telemetry.source_preset_ids[KESSHO_PRODUCT_SOURCE_PAD2 - 1u] == snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD2 - 1u].preset_id, "full arrangement Pad2 preset missed telemetry");
  require(telemetry.source_preset_ids[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1u] == snapshot.sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1u].preset_id, "full arrangement Soundscape preset missed telemetry");
  kessho_product_destroy(engine);
}

} // namespace

int main() {
  requireGeneratedSourcePresetFamilyCoverage();
  requireExactSourcePresetMetadata();
  requireSourceRenders(KESSHO_PRODUCT_SOURCE_PAD1, KESSHO_PRODUCT_STEM_PAD1, 60.0f, "pad 1 did not render");
  requireSourceRenders(KESSHO_PRODUCT_SOURCE_PAD2, KESSHO_PRODUCT_STEM_PAD2, 64.0f, "pad 2 did not render");
  requirePadFilterLfoTelemetryTracksBothPads();
  requireIdlePadLowRateRandomWalkTelemetryTracksBothPads();
  requirePadLowRateRandomWalkTelemetryUpdatesContinuously();
  requirePadModEnvelopeTelemetryTracksBothPads();
  requireSourceRenders(KESSHO_PRODUCT_SOURCE_LEAD1, KESSHO_PRODUCT_STEM_LEAD1, 67.0f, "lead 1 did not render");
  requireSourceRenders(KESSHO_PRODUCT_SOURCE_LEAD2, KESSHO_PRODUCT_STEM_LEAD2, 71.0f, "lead 2 did not render");
  requireSourceRenders(KESSHO_PRODUCT_SOURCE_DRUM, KESSHO_PRODUCT_STEM_DRUM, 36.0f, "drum did not render");
  requireSourceParamEventsAffectRender();
  requireDrumSourceParamsDriveModule();
  requireDrumSourceParamsStayStructured();
  requirePadOverridesStayStructured();
  requireLeadOverridesStayStructured();
  requireDrumOverridesStayStructured();
  requirePadLiveOverrideEventStaysStructured();
  requireLeadLiveOverrideEventStaysStructured();
  requireDrumLiveOverrideEventStaysStructured();
  requireRuntimeParamEventsUseStructuredOverrides();
  requirePartialExactPatchFallbacksAreRejected();
  requireInvalidSourcePresetFallbacksAreRejected();
  requireInvalidSparseOverrideFallbacksAreRejected();
  requireInvalidExactPatchFallbacksAreRejected();
  requireSoundscapeSnapshotOwnsStructuredFields();
  requireSourceMacrosAffectRender();
  requireSourcePresetMacrosAffectRender();
  requireBroadPadPresetFamiliesRender();
  requireBroadLeadPresetFamiliesRender();
  requireGeneratedDrumPresetRenders();
  requireGeneratedAssetPresetTelemetryCoverage();
  requireSnapshotSparseLeadParamsAffectRender();
  requireSnapshotSparseDrumParamsAffectRender();
  requireLiveSparseDrumParamsSurviveTrigger();
  requireGeneratedDrumVoicePresetsAffectRender();
  requireDrumVoicePresetIdsReconstructSparseDrumOverrides();
  requireSourcePostChainAffectsRender();
  requirePadFxSendsFollowPostLpfForBothPads();
  requirePianoFxSendsFollowPostLpf();
  requireManualLeadUsesSourceHold();
  requireSourcePresetTelemetryAndEvent();
  requireSampleOffsetManualTrigger();
  requireRepresentativeFullArrangementProbe();

  std::cout << "Kessho Product Source Wrapper tests passed\n";
  return 0;
}
