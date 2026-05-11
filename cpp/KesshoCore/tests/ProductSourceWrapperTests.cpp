#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdlib>
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
  }
  return snapshot;
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

  std::vector<float> left(128);
  std::vector<float> right(128);
  kessho_product_render(engine, left.data(), right.data(), 128);
  require(peakRange(left, right, 0, 128) > 0.0001f, label);

  std::vector<float> stem_l(128);
  std::vector<float> stem_r(128);
  require(kessho_product_get_stem(engine, stem_id, stem_l.data(), stem_r.data(), 128) == KESSHO_PRODUCT_OK, "stem read failed");
  require(peakRange(stem_l, stem_r, 0, 128) > 0.0001f, "source stem missing module output");

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

  std::fill(left.begin(), left.end(), 0.0f);
  std::fill(right.begin(), right.end(), 0.0f);
  setSourceParam(engine, KESSHO_PRODUCT_SOURCE_PAD1, KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID, 1.0f);
  triggerManual(engine, KESSHO_PRODUCT_SOURCE_PAD1, 60.0f);
  kessho_product_render(engine, left.data(), right.data(), 128);
  require(peakRange(left, right, 0, 128) > 0.0001f, "source level param did not restore pad 1");

  kessho_product_destroy(engine);
}

float renderPeakWithSourceMacros(uint32_t source_id, float morph, float distance, float expression) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "macro engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  snapshot.sources[source_id - 1u].morph = morph;
  snapshot.sources[source_id - 1u].distance = distance;
  snapshot.sources[source_id - 1u].expression = expression;
  snapshot.sources[source_id - 1u].level = 1.0f;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "macro snapshot load failed");
  triggerManual(engine, source_id, source_id == KESSHO_PRODUCT_SOURCE_DRUM ? 36.0f : 64.0f);

  std::vector<float> left(128);
  std::vector<float> right(128);
  kessho_product_render(engine, left.data(), right.data(), 128);
  const float result = peakRange(left, right, 0, 128);
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

  std::vector<float> left(128);
  std::vector<float> right(128);
  kessho_product_render(engine, left.data(), right.data(), 128);
  const float result = peakRange(left, right, 0, 128);
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
  const float shimmer_peak = renderPeakWithSourcePreset(
      KESSHO_PRODUCT_SOURCE_PAD1,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_GLASS_SHIMMER);
  require(std::fabs(shimmer_peak - init_peak) > 0.00001f, "generated pad preset macros did not affect render");

  const float rhodes_peak = renderPeakWithSourcePreset(
      KESSHO_PRODUCT_SOURCE_LEAD1,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES);
  const float gamelan_peak = renderPeakWithSourcePreset(
      KESSHO_PRODUCT_SOURCE_LEAD1,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_GAMELAN);
  require(std::fabs(gamelan_peak - rhodes_peak) > 0.00001f, "generated lead preset profile did not affect render");
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
  requireSourceRenders(KESSHO_PRODUCT_SOURCE_PAD1, KESSHO_PRODUCT_STEM_PAD1, 60.0f, "pad 1 did not render");
  requireSourceRenders(KESSHO_PRODUCT_SOURCE_PAD2, KESSHO_PRODUCT_STEM_PAD2, 64.0f, "pad 2 did not render");
  requireSourceRenders(KESSHO_PRODUCT_SOURCE_LEAD1, KESSHO_PRODUCT_STEM_LEAD1, 67.0f, "lead 1 did not render");
  requireSourceRenders(KESSHO_PRODUCT_SOURCE_LEAD2, KESSHO_PRODUCT_STEM_LEAD2, 71.0f, "lead 2 did not render");
  requireSourceRenders(KESSHO_PRODUCT_SOURCE_DRUM, KESSHO_PRODUCT_STEM_DRUM, 36.0f, "drum did not render");
  requireSourceParamEventsAffectRender();
  requireSourceMacrosAffectRender();
  requireSourcePresetMacrosAffectRender();
  requireSourcePresetTelemetryAndEvent();
  requireSampleOffsetManualTrigger();

  std::cout << "Kessho Product Source Wrapper tests passed\n";
  return 0;
}
