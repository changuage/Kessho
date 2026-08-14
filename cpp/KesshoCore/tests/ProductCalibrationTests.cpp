#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <vector>

#include "KesshoCore/KesshoProductCore.h"
#include "../src/product/KesshoProductEngineInternal.h"
#include "ProductSnapshotTestHelpers.h"

namespace {

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Kessho Product calibration test failed: " << message << "\n";
    std::exit(1);
  }
}

void requireNear(float actual, float expected, const char* message) {
  require(std::isfinite(actual), "non-finite calibration result");
  require(std::fabs(actual - expected) <= 0.00001f, message);
}

float peak(const std::vector<float>& left, const std::vector<float>& right) {
  float result = 0.0f;
  for (std::size_t i = 0; i < left.size(); ++i) {
    require(std::isfinite(left[i]) && std::isfinite(right[i]), "non-finite render sample");
    result = std::max(result, std::fabs(left[i]));
    result = std::max(result, std::fabs(right[i]));
  }
  return result;
}

void configureLead(KesshoProductEngine& engine, float level) {
  SourceState& lead = engine.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u];
  lead.enabled = true;
  lead.source_id = KESSHO_PRODUCT_SOURCE_LEAD1;
  lead.level = level;
  lead.dry_gain = 1.0f;
  lead.reverb_send = 0.25f;
  lead.delay_a_send = 0.0f;
  lead.delay_b_send = 0.0f;
  lead.granular_send = 0.0f;
  lead.degrade_send = 0.0f;
  lead.spectral_freeze_send = 0.0f;
  lead.diffuse_send = 0.0f;
}

void requireCalibrationPrecedesDrySendSplit() {
  KesshoProductEngine engine(48000.0, 128, 0);
  configureLead(engine, 0.5f);

  const float trim = moduleSourceOutputTrim(KESSHO_PRODUCT_SOURCE_LEAD1);
  float dry_l[1] = {1.0f};
  float dry_r[1] = {0.5f};
  float send_l[1] = {1.0f};
  float send_r[1] = {0.5f};
  float out_l[1]{};
  float out_r[1]{};

  engine.mixSourceBuffer(
      KESSHO_PRODUCT_SOURCE_LEAD1,
      dry_l,
      dry_r,
      send_l,
      send_r,
      out_l,
      out_r,
      0u,
      1u);

  requireNear(out_l[0], 0.5f * trim, "Lead dry path did not receive calibration exactly once");
  requireNear(out_r[0], 0.25f * trim, "Lead dry right path did not receive calibration exactly once");
  requireNear(engine.reverb_bus_l[0], 0.25f * trim, "Lead Reverb send bypassed source calibration");
  requireNear(engine.reverb_bus_r[0], 0.125f * trim, "Lead Reverb send right bypassed source calibration");
}

void requirePreFaderBehaviorSurvivesCalibration() {
  KesshoProductEngine engine(48000.0, 128, 0);
  configureLead(engine, 0.0f);

  const float trim = moduleSourceOutputTrim(KESSHO_PRODUCT_SOURCE_LEAD1);
  float signal_l[1] = {1.0f};
  float signal_r[1] = {1.0f};
  float out_l[1]{};
  float out_r[1]{};

  engine.mixSourceBuffer(
      KESSHO_PRODUCT_SOURCE_LEAD1,
      signal_l,
      signal_r,
      signal_l,
      signal_r,
      out_l,
      out_r,
      0u,
      1u);

  requireNear(out_l[0], 0.0f, "zero-level Lead dry path should remain silent");
  requireNear(out_r[0], 0.0f, "zero-level Lead dry right path should remain silent");
  requireNear(engine.reverb_bus_l[0], 0.25f * trim, "pre-fader Lead send was muted by source level");
  requireNear(engine.reverb_bus_r[0], 0.25f * trim, "pre-fader Lead send right was muted by source level");
}

void requireBoostRangeRemainsEffective() {
  KesshoProductEngine engine(48000.0, 128, 0);
  configureLead(engine, 1.0f);

  KesshoProductEvent event{};
  event.target_id = KESSHO_PRODUCT_SOURCE_LEAD1;
  event.param_id = KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID;
  event.value = 1.5f;
  engine.applySourceParam(event);

  const SourceState& lead = engine.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u];
  requireNear(lead.level, 1.5f, "SourceLevel boost range was clipped or reinterpreted");

  const float trim = moduleSourceOutputTrim(KESSHO_PRODUCT_SOURCE_LEAD1);
  float signal[1] = {1.0f};
  float out_l[1]{};
  float out_r[1]{};
  engine.mixSourceBuffer(
      KESSHO_PRODUCT_SOURCE_LEAD1,
      signal,
      signal,
      signal,
      signal,
      out_l,
      out_r,
      0u,
      1u);

  requireNear(out_l[0], 1.5f * trim, "SourceLevel 1.5 boost no longer reaches the dry path");
}

KesshoProductSnapshotV2 makePianoSnapshot() {
  KesshoProductSnapshotV2 snapshot{};
  snapshot.version = KESSHO_PRODUCT_SNAPSHOT_VERSION;
  snapshot.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
  snapshot.master.gain = 1.0f;
  snapshot.rng.seed = 37u;
  snapshot.rng.state = 37u;
  kessho::product::tests::applyGeneratedSourceDefaults(snapshot);
  for (uint32_t i = 0u; i < kessho::product::internal::kSourceCount; ++i) {
    snapshot.sources[i].enabled = 0u;
  }

  KesshoProductSourceSnapshot& piano = snapshot.sources[KESSHO_PRODUCT_SOURCE_PIANO - 1u];
  piano.enabled = 1u;
  piano.source_id = KESSHO_PRODUCT_SOURCE_PIANO;
  piano.asset_id = 9101u;
  piano.level = 1.0f;
  piano.dry_gain = 1.0f;
  piano.reverb_send = 1.0f;
  piano.delay_a_send = 0.0f;
  piano.delay_b_send = 0.0f;
  piano.granular_send = 0.0f;
  piano.degrade_send = 0.0f;
  piano.spectral_freeze_send = 0.0f;
  piano.sample_library_id = kSampleLibraryPiano;
  return snapshot;
}

void requirePianoCalibrationPrecedesDrySendSplit() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "piano calibration engine create failed");

  std::vector<float> sample(4096);
  for (uint32_t i = 0u; i < sample.size(); ++i) {
    sample[i] = std::sin(static_cast<float>(i) * 0.05f) * 0.35f;
  }
  const float* channels[1] = {sample.data()};
  require(
      kessho_product_register_asset_buffer(
          engine,
          9101u,
          channels,
          1u,
          static_cast<uint32_t>(sample.size()),
          48000.0,
          KESSHO_PRODUCT_ASSET_PIANO) == KESSHO_PRODUCT_OK,
      "piano calibration asset registration failed");

  KesshoProductSnapshotV2 snapshot = makePianoSnapshot();
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "piano calibration snapshot load failed");
  require(
      kessho_product_set_graph_taps_enabled(engine, 1u) == KESSHO_PRODUCT_OK,
      "piano calibration graph tap enable failed");

  KesshoProductEvent note{};
  note.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  note.target_id = KESSHO_PRODUCT_SOURCE_PIANO;
  note.value = 60.0f;
  note.value2 = 0.9f;
  note.value3 = 0.25f;
  require(kessho_product_enqueue_event(engine, &note) == KESSHO_PRODUCT_OK, "piano calibration note enqueue failed");

  std::vector<float> left(128);
  std::vector<float> right(128);
  std::vector<float> tap_l(128);
  std::vector<float> tap_r(128);
  float dry_peak = 0.0f;
  float send_peak = 0.0f;
  for (uint32_t block = 0u; block < 48u; ++block) {
    kessho_product_render(engine, left.data(), right.data(), 128u);
    require(
        kessho_product_get_graph_tap(
            engine,
            KESSHO_PRODUCT_GRAPH_TAP_PIANO_DRY,
            tap_l.data(),
            tap_r.data(),
            128u) == KESSHO_PRODUCT_OK,
        "piano calibration dry tap read failed");
    dry_peak = std::max(dry_peak, peak(tap_l, tap_r));
    require(
        kessho_product_get_graph_tap(
            engine,
            KESSHO_PRODUCT_GRAPH_TAP_PIANO_REVERB_SEND,
            tap_l.data(),
            tap_r.data(),
            128u) == KESSHO_PRODUCT_OK,
        "piano calibration Reverb send tap read failed");
    send_peak = std::max(send_peak, peak(tap_l, tap_r));
  }

  require(dry_peak > 0.00001f, "piano calibration dry fixture stayed silent");
  require(send_peak > 0.00001f, "piano calibration send fixture stayed silent");
  require(
      std::fabs(dry_peak - send_peak) <= std::max(0.00001f, dry_peak * 0.001f),
      "Piano dry and send branches do not share the same engineering calibration boundary");

  kessho_product_destroy(engine);
}

} // namespace

int main() {
  requireCalibrationPrecedesDrySendSplit();
  requirePreFaderBehaviorSurvivesCalibration();
  requireBoostRangeRemainsEffective();
  requirePianoCalibrationPrecedesDrySendSplit();
  std::cout << "Kessho Product calibration transfer tests passed\n";
  return 0;
}
