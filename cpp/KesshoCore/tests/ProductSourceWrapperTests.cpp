#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <vector>

#include "KesshoCore/KesshoProductCore.h"
#include "KesshoProductParamIds.h"
#include "KesshoProductSchema.h"

namespace {

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Kessho Product Source Wrapper test failed: " << message << "\n";
    std::exit(1);
  }
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

float stemPeakBlocks(KesshoProductEngine* engine, uint32_t stem_id, uint32_t blocks = 1) {
  std::vector<float> stem_l(128);
  std::vector<float> stem_r(128);
  float result = 0.0f;
  for (uint32_t block = 0; block < blocks; ++block) {
    require(kessho_product_get_stem(engine, stem_id, stem_l.data(), stem_r.data(), 128) == KESSHO_PRODUCT_OK, "stem read failed");
    result = std::max(result, peakRange(stem_l, stem_r, 0, 128));
  }
  return result;
}

const kessho::product::generated::KesshoProductGeneratedSourcePreset* generatedPreset(uint32_t preset_id) {
  for (const auto& preset : kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESETS) {
    if (preset.id == preset_id) {
      return &preset;
    }
  }
  return nullptr;
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
  for (uint32_t i = 0; i < 7; ++i) {
    snapshot.sources[i].enabled = 1;
    snapshot.sources[i].source_id = i + 1;
    snapshot.sources[i].level = 0.9f;
    snapshot.sources[i].dry_gain = 1.0f;
    snapshot.sources[i].expression = 0.8f;
    snapshot.sources[i].post_lpf_hz = 18000.0f;
    snapshot.sources[i].stereo_width = 1.0f;
  }
  return snapshot;
}

void requireExactSourcePresetMetadata() {
  const auto* init = generatedPreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_INIT);
  require(init != nullptr, "generated PadInit preset missing");
  require(
      init->exact_pad_param_count == kessho::product::generated::KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT,
      "generated PadInit exact pad param count missing");
  require(
      kessho::product::generated::KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT == 53u,
      "generated pad param count must match module layout");
  require(std::fabs(init->exact_pad_params[33] - 6.0f) < 0.00001f, "PadInit exact attack did not match web preset");
  require(std::fabs(init->exact_pad_params[36] - 12.0f) < 0.00001f, "PadInit exact release did not match web preset");
  require(std::fabs(init->exact_pad_params[52] - 0.5f) < 0.00001f, "PadInit exact output trim did not match web pad trim");

  const auto* lead = generatedPreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES);
  require(lead != nullptr, "generated lead preset missing");
  require(lead->exact_pad_param_count == 0u, "non-pad preset unexpectedly carried exact pad params");
  require(
      lead->exact_lead_param_count == kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT,
      "generated LeadSoftRhodes exact lead param count missing");
  require(
      kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT == 80u,
      "generated lead param count must match module layout");
  require(
      std::fabs(kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_OUTPUT_TRIM - 0.59f) < 0.00001f,
      "generated lead output trim must match Product Core parity trim");
  require(std::fabs(lead->exact_lead_params[0] - 0.0f) < 0.00001f, "LeadSoftRhodes exact algorithm did not match web preset");
  require(std::fabs(lead->exact_lead_params[3] - 1.0f) < 0.00001f, "LeadSoftRhodes exact operator ratio did not match web preset");
  require(std::fabs(lead->exact_lead_params[62] - 0.34f) < 0.00001f, "LeadSoftRhodes exact gain did not match web preset");

  const auto* gamelan = generatedPreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_GAMELAN);
  require(gamelan != nullptr, "generated LeadGamelan preset missing");
  require(
      gamelan->exact_lead_param_count == kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT,
      "generated LeadGamelan exact lead param count missing");
  require(std::fabs(gamelan->exact_lead_params[0] - 3.0f) < 0.00001f, "LeadGamelan exact algorithm did not match web preset");
  require(std::fabs(gamelan->exact_lead_params[62] - 0.7f) < 0.00001f, "LeadGamelan exact gain did not match web preset");

  const auto* drum = generatedPreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_DRUM_DEFAULT);
  require(drum != nullptr, "generated DrumDefault preset missing");
  require(
      drum->exact_drum_param_count == kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_PARAM_COUNT,
      "generated DrumDefault exact drum param count missing");
  require(
      kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_PARAM_COUNT == 126u,
      "generated drum param count must match module layout");
  require(
      kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_VOICE_COUNT == 7u,
      "generated drum voice count must match Product Core drum source layout");
  require(
      kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_VOICE_PRESET_COUNT > 60u,
      "generated drum voice preset table must include factory drum presets");
  require(std::fabs(drum->exact_drum_params[12] - 55.0f) < 0.00001f, "DrumDefault exact kick frequency did not match module layout");
  require(std::fabs(drum->exact_drum_params[122] - 0.8f) < 0.00001f, "DrumDefault exact master level did not match module layout");

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

void requireSourceRenders(uint32_t source_id, uint32_t stem_id, float midi_note, const char* label) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "snapshot load failed");
  triggerManual(engine, source_id, midi_note);

  const float output_peak = renderPeakBlocks(engine);
  require(output_peak > 0.0001f, label);
  require(stemPeakBlocks(engine, stem_id) > 0.0001f, "source stem missing module output");

  KesshoProductTelemetry telemetry = kessho_product_get_telemetry(engine);
  require(telemetry.active_voices > 0, "module active voices missing from telemetry");
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

float renderRmsWithLeadPostLpf(float snapshot_cutoff_hz, bool send_param_event) {
  const auto* rhodes = generatedPreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES);
  require(rhodes != nullptr, "LeadSoftRhodes preset missing for source post-chain test");

  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "source post-chain engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u];
  source.preset_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES;
  source.level = 1.0f;
  source.expression = 1.0f;
  source.post_lpf_hz = send_param_event ? 18000.0f : snapshot_cutoff_hz;
  source.stereo_width = 1.0f;
  source.exact_lead_param_count = kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT;
  for (uint32_t index = 0; index < kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT; ++index) {
    source.exact_lead_params[index] = rhodes->exact_lead_params[index];
  }
  source.exact_lead_params[62] = 0.8f;

  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "source post-chain snapshot load failed");
  if (send_param_event) {
    setSourceParam(engine, KESSHO_PRODUCT_SOURCE_LEAD1, KESSHO_PRODUCT_PARAM_SOURCE_POST_LPF_HZ_ID, snapshot_cutoff_hz);
  }
  triggerManual(engine, KESSHO_PRODUCT_SOURCE_LEAD1, 64.0f);
  const float result = renderDeltaRmsBlocks(engine);
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
  source.expression = 1.0f;
  source.post_lpf_hz = 400.0f;
  source.stereo_width = 1.0f;
  source.post_lpf_key_tracking = send_param_event ? 0.0f : tracking;
  source.exact_lead_param_count = kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT;
  for (uint32_t index = 0; index < kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT; ++index) {
    source.exact_lead_params[index] = rhodes->exact_lead_params[index];
  }
  source.exact_lead_params[62] = 0.8f;

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

float renderPeakWithSourceMacros(uint32_t source_id, float morph, float distance, float expression) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "macro engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  if (source_id == KESSHO_PRODUCT_SOURCE_LEAD1 || source_id == KESSHO_PRODUCT_SOURCE_LEAD2) {
    snapshot.sources[source_id - 1u].preset_id = 999999u;
  }
  snapshot.sources[source_id - 1u].morph = morph;
  snapshot.sources[source_id - 1u].distance = distance;
  snapshot.sources[source_id - 1u].expression = expression;
  snapshot.sources[source_id - 1u].level = 1.0f;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "macro snapshot load failed");
  triggerManual(engine, source_id, source_id == KESSHO_PRODUCT_SOURCE_DRUM ? 36.0f : 64.0f);

  const float result = renderPeakBlocks(engine);
  kessho_product_destroy(engine);
  return result;
}

void requireSourceMacrosAffectRender() {
  const float quiet_pad = renderPeakWithSourceMacros(KESSHO_PRODUCT_SOURCE_PAD1, 0.0f, 0.0f, 0.15f);
  const float bright_pad = renderPeakWithSourceMacros(KESSHO_PRODUCT_SOURCE_PAD1, 0.9f, 0.8f, 1.0f);
  require(bright_pad > quiet_pad * 1.5f, "pad source macros did not affect render level/tone");

  const float quiet_lead = renderPeakWithSourceMacros(KESSHO_PRODUCT_SOURCE_LEAD1, 0.0f, 0.0f, 0.15f);
  const float bright_lead = renderPeakWithSourceMacros(KESSHO_PRODUCT_SOURCE_LEAD1, 0.9f, 0.8f, 1.0f);
  require(bright_lead > quiet_lead * 1.5f, "lead source macros did not affect render level/tone");
}

float renderPeakWithSourcePreset(uint32_t source_id, uint32_t preset_id) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "preset macro engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  snapshot.sources[source_id - 1u].preset_id = preset_id;
  snapshot.sources[source_id - 1u].morph = 0.15f;
  snapshot.sources[source_id - 1u].distance = 0.1f;
  snapshot.sources[source_id - 1u].expression = 0.65f;
  snapshot.sources[source_id - 1u].level = 1.0f;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "preset macro snapshot load failed");
  triggerManual(engine, source_id, source_id == KESSHO_PRODUCT_SOURCE_DRUM ? 36.0f : 64.0f);

  const float result = renderPeakBlocks(engine);
  kessho_product_destroy(engine);
  return result;
}

void requireSourcePresetMacrosAffectRender() {
  static_assert(
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESETS[0].macro_expression > 0.0f,
      "generated source presets must expose macro fields");
  static_assert(
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESETS[0].profile_tone >= 0.0f,
      "generated source presets must expose module profile fields");
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

float renderPeakWithLeadSnapshotGain(float gain) {
  const auto* rhodes = generatedPreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES);
  require(rhodes != nullptr, "LeadSoftRhodes preset missing for exact snapshot test");
  require(
      rhodes->exact_lead_param_count == kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT,
      "LeadSoftRhodes exact params missing for exact snapshot test");

  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "exact lead snapshot engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u];
  source.preset_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES;
  source.level = 1.0f;
  source.morph = 0.0f;
  source.distance = 0.0f;
  source.expression = 1.0f;
  source.exact_lead_param_count = kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT;
  for (uint32_t index = 0; index < kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT; ++index) {
    source.exact_lead_params[index] = rhodes->exact_lead_params[index];
  }
  source.exact_lead_params[62] = gain;

  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "exact lead snapshot load failed");
  triggerManual(engine, KESSHO_PRODUCT_SOURCE_LEAD1, 64.0f);
  const float result = renderPeakBlocks(engine);
  kessho_product_destroy(engine);
  return result;
}

void requireSnapshotExactLeadParamsAffectRender() {
  const float low_gain_peak = renderPeakWithLeadSnapshotGain(0.05f);
  const float high_gain_peak = renderPeakWithLeadSnapshotGain(0.8f);
  require(high_gain_peak > low_gain_peak * 3.0f, "snapshot exact lead params did not affect render gain");
}

float renderDrumSubWithExactLevel(float sub_level) {
  const auto* drum = generatedPreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_DRUM_DEFAULT);
  require(drum != nullptr, "DrumDefault preset missing for exact drum patch test");

  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "exact drum patch engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  KesshoProductSourceSnapshot& source = snapshot.sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u];
  source.level = 1.0f;
  source.expression = 1.0f;
  source.preset_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_DRUM_DEFAULT;
  source.exact_drum_param_count = kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_PARAM_COUNT;
  for (uint32_t index = 0; index < kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_PARAM_COUNT; ++index) {
    source.exact_drum_params[index] = drum->exact_drum_params[index];
  }
  source.exact_drum_params[2] = sub_level;

  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "exact drum patch snapshot load failed");
  triggerManual(engine, KESSHO_PRODUCT_SOURCE_DRUM, 36.0f);
  const float result = renderPeakBlocks(engine);
  kessho_product_destroy(engine);
  return result;
}

void requireSnapshotExactDrumParamsAffectRender() {
  const float normal = renderDrumSubWithExactLevel(0.8f);
  const float muted = renderDrumSubWithExactLevel(0.0f);
  require(normal > 0.0001f, "exact drum default patch did not render");
  require(muted < normal * 0.1f, "exact drum snapshot patch did not change rendered sub level");
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
  source.exact_drum_param_count = 0u;
  source.drum_voice_preset_a_ids[0] = preset->id;
  source.drum_voice_preset_b_ids[0] = preset->id;
  source.drum_voice_morphs[0] = 0.0f;

  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "generated drum voice preset snapshot load failed");
  triggerManual(engine, KESSHO_PRODUCT_SOURCE_DRUM, 36.0f);
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
  source.exact_lead_param_count = kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT;
  for (uint32_t index = 0; index < kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT; ++index) {
    source.exact_lead_params[index] = rhodes->exact_lead_params[index];
  }
  source.exact_lead_params[44] = 0.03f;
  source.exact_lead_params[45] = 1.0f;
  source.exact_lead_params[46] = 0.02f;
  source.exact_lead_params[62] = 0.8f;

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

} // namespace

int main() {
  requireExactSourcePresetMetadata();
  requireSourceRenders(KESSHO_PRODUCT_SOURCE_PAD1, KESSHO_PRODUCT_STEM_PAD1, 60.0f, "pad 1 did not render");
  requireSourceRenders(KESSHO_PRODUCT_SOURCE_PAD2, KESSHO_PRODUCT_STEM_PAD2, 64.0f, "pad 2 did not render");
  requireSourceRenders(KESSHO_PRODUCT_SOURCE_LEAD1, KESSHO_PRODUCT_STEM_LEAD1, 67.0f, "lead 1 did not render");
  requireSourceRenders(KESSHO_PRODUCT_SOURCE_LEAD2, KESSHO_PRODUCT_STEM_LEAD2, 71.0f, "lead 2 did not render");
  requireSourceRenders(KESSHO_PRODUCT_SOURCE_DRUM, KESSHO_PRODUCT_STEM_DRUM, 36.0f, "drum did not render");
  requireSourceParamEventsAffectRender();
  requireSourceMacrosAffectRender();
  requireSourcePresetMacrosAffectRender();
  requireSnapshotExactLeadParamsAffectRender();
  requireSnapshotExactDrumParamsAffectRender();
  requireGeneratedDrumVoicePresetsAffectRender();
  requireSourcePostChainAffectsRender();
  requireManualLeadUsesSourceHold();
  requireSourcePresetTelemetryAndEvent();
  requireSampleOffsetManualTrigger();

  std::cout << "Kessho Product Source Wrapper tests passed\n";
  return 0;
}
