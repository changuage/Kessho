#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <vector>

#include "KesshoCore/KesshoProductCore.h"
#include "../src/product/KesshoProductEngineInternal.h"
#include "../src/product/generated/SampleLibraryRegistry.generated.h"
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

struct GraphTapPeaks {
  float dry = 0.0f;
  float send = 0.0f;
};

GraphTapPeaks renderGraphTapPeaks(
    KesshoProductEngine* engine,
    uint32_t dry_tap,
    uint32_t send_tap,
    uint32_t blocks = 48u) {
  std::vector<float> output_l(128);
  std::vector<float> output_r(128);
  std::vector<float> tap_l(128);
  std::vector<float> tap_r(128);
  GraphTapPeaks peaks{};
  for (uint32_t block = 0u; block < blocks; ++block) {
    kessho_product_render(engine, output_l.data(), output_r.data(), 128u);
    require(
        kessho_product_get_graph_tap(engine, dry_tap, tap_l.data(), tap_r.data(), 128u) == KESSHO_PRODUCT_OK,
        "source calibration dry graph tap read failed");
    peaks.dry = std::max(peaks.dry, peak(tap_l, tap_r));
    require(
        kessho_product_get_graph_tap(engine, send_tap, tap_l.data(), tap_r.data(), 128u) == KESSHO_PRODUCT_OK,
        "source calibration send graph tap read failed");
    peaks.send = std::max(peaks.send, peak(tap_l, tap_r));
  }
  return peaks;
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
  engine.graph_taps_enabled = true;

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
  requireNear(engine.graph_lead1_dry_l[0], 0.5f * trim, "Lead graph dry tap bypassed engineering calibration");
  requireNear(engine.graph_lead1_dry_r[0], 0.25f * trim, "Lead graph dry right tap bypassed engineering calibration");
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

KesshoProductSnapshotV2 makeCalibrationSnapshot() {
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

  return snapshot;
}

KesshoProductSnapshotV2 makePianoSnapshot() {
  KesshoProductSnapshotV2 snapshot = makeCalibrationSnapshot();
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

void requirePadCalibrationPrecedesDrySendSplit() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "Pad calibration engine create failed");

  KesshoProductSnapshotV2 snapshot = makeCalibrationSnapshot();
  KesshoProductSourceSnapshot& pad = snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u];
  pad.enabled = 1u;
  pad.source_id = KESSHO_PRODUCT_SOURCE_PAD1;
  pad.level = 1.0f;
  pad.dry_gain = 1.0f;
  pad.reverb_send = 1.0f;
  pad.source_preset_a_id = kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_PLUCK_BELL;
  pad.source_preset_b_id = pad.source_preset_a_id;
  pad.preset_id = pad.source_preset_a_id;
  // Keep the artistic Pad output level at unity so the two graph branches
  // expose only the shared fixed engineering transfer.
  pad.pad_override_count = 1u;
  pad.pad_override_indices[0] = 57u;
  pad.pad_override_values[0] = 1.0f;

  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "Pad calibration snapshot load failed");
  require(
      kessho_product_set_graph_taps_enabled(engine, 1u) == KESSHO_PRODUCT_OK,
      "Pad calibration graph tap enable failed");

  KesshoProductEvent note{};
  note.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  note.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  note.value = 60.0f;
  note.value2 = 0.8f;
  note.value3 = 0.25f;
  require(kessho_product_enqueue_event(engine, &note) == KESSHO_PRODUCT_OK, "Pad calibration note enqueue failed");

  const GraphTapPeaks peaks = renderGraphTapPeaks(
      engine,
      KESSHO_PRODUCT_GRAPH_TAP_PAD1_DRY,
      KESSHO_PRODUCT_GRAPH_TAP_PAD1_REVERB_SEND);
  require(peaks.dry > 0.00001f, "Pad calibration dry fixture stayed silent");
  require(peaks.send > 0.00001f, "Pad calibration send fixture stayed silent");
  require(
      std::fabs(peaks.dry - peaks.send) <= std::max(0.00001f, peaks.dry * 0.002f),
      "Pad dry and pre-fader send do not share the fixed calibration/polyphony boundary");

  kessho_product_destroy(engine);
}

void requireDrumPreFaderBoundarySurvivesCalibration() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "drum calibration engine create failed");
  KesshoProductSnapshotV2 snapshot = makeCalibrationSnapshot();
  KesshoProductSourceSnapshot& drum = snapshot.sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u];
  drum.enabled = 1u;
  drum.source_id = KESSHO_PRODUCT_SOURCE_DRUM;
  drum.level = 1.0f;
  drum.dry_gain = 1.0f;
  drum.reverb_send = 1.0f;
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "drum calibration snapshot load failed");
  requireNear(
      moduleSourceOutputTrim(KESSHO_PRODUCT_SOURCE_DRUM),
      1.0f,
      "drum engine calibration was duplicated in Product Core");
  requireNear(
      engine->drum_module->params()[kProductDrumMasterLevelParam],
      1.0f,
      "snapshot drum master level was rewritten by engineering calibration");
  requireNear(
      engine->drum_module->params()[kProductDrumReverbSendParam],
      1.0f,
      "snapshot drum Reverb send was rewritten by engineering calibration");

  KesshoProductEvent level_event{};
  level_event.target_id = KESSHO_PRODUCT_SOURCE_DRUM;
  level_event.param_id = KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID;
  level_event.value = 1.25f;
  engine->applySourceParam(level_event);
  KesshoProductEvent reverb_event{};
  reverb_event.target_id = KESSHO_PRODUCT_SOURCE_DRUM;
  reverb_event.param_id = KESSHO_PRODUCT_PARAM_SOURCE_REVERB_SEND_ID;
  reverb_event.value = 0.75f;
  engine->applySourceParam(reverb_event);
  requireNear(
      engine->sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u].level,
      1.25f,
      "drum source.level control law was altered by engineering trim");
  requireNear(
      engine->drum_module->params()[kProductDrumMasterLevelParam],
      1.25f,
      "runtime drum master sync changed source.level semantics");
  requireNear(
      engine->drum_module->params()[kProductDrumReverbSendParam],
      0.75f,
      "runtime drum Reverb sync changed send semantics");
  require(
      engine->applyStructuredSourceOverridesToModuleForCurrentMorph(KESSHO_PRODUCT_SOURCE_DRUM),
      "drum exact-patch calibration sync failed");
  requireNear(
      engine->drum_module->params()[kProductDrumMasterLevelParam],
      1.25f,
      "drum exact-patch sync changed source.level semantics");
  requireNear(
      engine->drum_module->params()[kProductDrumReverbSendParam],
      0.75f,
      "drum exact-patch Reverb sync changed send semantics");

  level_event.value = 0.0f;
  engine->applySourceParam(level_event);
  require(
      kessho_product_set_graph_taps_enabled(engine, 1u) == KESSHO_PRODUCT_OK,
      "drum calibration graph tap enable failed");

  KesshoProductEvent note{};
  note.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  note.target_id = KESSHO_PRODUCT_SOURCE_DRUM;
  note.value = 36.0f;
  note.value2 = 1.0f;
  note.value3 = 0.2f;
  require(kessho_product_enqueue_event(engine, &note) == KESSHO_PRODUCT_OK, "drum calibration note enqueue failed");
  const GraphTapPeaks peaks = renderGraphTapPeaks(
      engine,
      KESSHO_PRODUCT_GRAPH_TAP_DRUM_DRY,
      KESSHO_PRODUCT_GRAPH_TAP_DRUM_REVERB_SEND);
  require(peaks.dry <= 0.000001f, "zero-level drum dry path was not muted");
  require(peaks.send > 0.00001f, "intentional drum pre-fader Reverb send was muted by source level");
  kessho_product_destroy(engine);
}

void requireNonPianoSamplePreFaderBoundarySurvivesCalibration() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "sample calibration engine create failed");
  constexpr uint32_t kAssetId = 9201u;
  std::vector<float> sample(4096);
  for (uint32_t i = 0u; i < sample.size(); ++i) {
    sample[i] = std::sin(static_cast<float>(i) * 0.05f) * 0.35f;
  }
  const float* channels[1] = {sample.data()};
  require(
      kessho_product_register_asset_buffer(
          engine,
          kAssetId,
          channels,
          1u,
          static_cast<uint32_t>(sample.size()),
          48000.0,
          KESSHO_PRODUCT_ASSET_SAMPLE) == KESSHO_PRODUCT_OK,
      "sample calibration asset registration failed");

  KesshoProductSnapshotV2 snapshot = makeCalibrationSnapshot();
  KesshoProductSourceSnapshot& sample2 = snapshot.sources[KESSHO_PRODUCT_SOURCE_SAMPLE2 - 1u];
  sample2.enabled = 1u;
  sample2.source_id = KESSHO_PRODUCT_SOURCE_SAMPLE2;
  sample2.asset_id = kAssetId;
  sample2.level = 0.0f;
  sample2.dry_gain = 1.0f;
  sample2.reverb_send = 1.0f;
  sample2.sample_library_id = kessho::product::generated::kSampleLibraryIdSoftStringSpurs;
  sample2.sample_selection_mode = KESSHO_PRODUCT_SAMPLE_SELECTION_NEAREST;
  sample2.sample_dynamic_mode = KESSHO_PRODUCT_SAMPLE_DYNAMIC_FIXED;
  sample2.sample_fixed_dynamic_id = kessho::product::generated::kSampleDynamicIdSingle;
  sample2.sample_loop_enabled = 1u;
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "sample calibration snapshot load failed");
  require(
      kessho_product_set_graph_taps_enabled(engine, 1u) == KESSHO_PRODUCT_OK,
      "sample calibration graph tap enable failed");

  KesshoProductEvent note{};
  note.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  note.target_id = KESSHO_PRODUCT_SOURCE_SAMPLE2;
  note.value = 60.0f;
  note.value2 = 0.9f;
  note.value3 = 0.2f;
  require(kessho_product_enqueue_event(engine, &note) == KESSHO_PRODUCT_OK, "sample calibration note enqueue failed");
  const GraphTapPeaks peaks = renderGraphTapPeaks(
      engine,
      KESSHO_PRODUCT_GRAPH_TAP_SAMPLE2_DRY,
      KESSHO_PRODUCT_GRAPH_TAP_SAMPLE2_REVERB_SEND);
  require(peaks.dry <= 0.000001f, "zero-level non-Piano sample dry path was not muted");
  require(peaks.send > 0.00001f, "non-Piano sample pre-fader send was muted by source level");
  kessho_product_destroy(engine);
}

void requireSoundscapeEarthBoundarySurvivesCalibration() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "Soundscape calibration engine create failed");
  KesshoProductSnapshotV2 snapshot = makeCalibrationSnapshot();
  snapshot.transport.running = 1u;
  KesshoProductSourceSnapshot& soundscape = snapshot.sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1u];
  soundscape.enabled = 1u;
  soundscape.source_id = KESSHO_PRODUCT_SOURCE_SOUNDSCAPE;
  soundscape.level = 1.0f;
  soundscape.dry_gain = 1.0f;
  require(engine->soundscapes_module != nullptr, "Soundscape calibration module missing");
  const float* soundscape_defaults = engine->soundscapes_module->params();
  require(soundscape_defaults != nullptr, "Soundscape calibration module defaults missing");
  std::copy(
      soundscape_defaults,
      soundscape_defaults + kSoundscapeModuleParamCount,
      snapshot.soundscape_module_params);
  snapshot.soundscape_module_param_count = kSoundscapeProductModuleParamCount;
  snapshot.soundscape_module_params[kSoundscapeModuleWaterActiveParam] = 1.0f;
  snapshot.soundscape_module_params[kSoundscapeModuleWaterLevelParam] = 1.0f;
  snapshot.soundscape_module_params[kSoundscapeModuleEarthLevelParam] = 0.0f;
  snapshot.soundscape_module_params[kSoundscapeModuleWaterMasterEnabledParam] = 1.0f;
  snapshot.soundscape_module_params[kSoundscapeModuleWaterLayerMaskParam] =
      static_cast<float>(kSoundscapeWaterLayerMaskAll);
  snapshot.soundscape_texture_param_count = kSoundscapeTextureParamCount;
  snapshot.soundscape_texture_params[kSoundscapeLayerWater * kSoundscapeLayerRouteStride + kSoundscapeLayerRouteReverb] = 1.0f;
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "Soundscape calibration snapshot load failed");
  require(
      kessho_product_set_graph_taps_enabled(engine, 1u) == KESSHO_PRODUCT_OK,
      "Soundscape calibration graph tap enable failed");

  std::vector<float> output_l(128);
  std::vector<float> output_r(128);
  std::vector<float> stem_l(128);
  std::vector<float> stem_r(128);
  std::vector<float> send_l(128);
  std::vector<float> send_r(128);
  float stem_peak = 0.0f;
  float send_peak = 0.0f;
  for (uint32_t block = 0u; block < 64u; ++block) {
    kessho_product_render(engine, output_l.data(), output_r.data(), 128u);
    require(
        kessho_product_get_stem(engine, KESSHO_PRODUCT_STEM_SOUNDSCAPE, stem_l.data(), stem_r.data(), 128u) == KESSHO_PRODUCT_OK,
        "Soundscape calibration stem read failed");
    require(
        kessho_product_get_graph_tap(
            engine,
            KESSHO_PRODUCT_GRAPH_TAP_SOUNDSCAPE_WATER_REVERB_SEND,
            send_l.data(),
            send_r.data(),
            128u) == KESSHO_PRODUCT_OK,
        "Soundscape calibration send graph tap read failed");
    stem_peak = std::max(stem_peak, peak(stem_l, stem_r));
    send_peak = std::max(send_peak, peak(send_l, send_r));
  }
  require(stem_peak <= 0.000001f, "Soundscape Earth level did not mute the dry/stem branch");
  require(send_peak > 0.00001f, "Soundscape pre-Earth Reverb send was muted by Earth level");
  kessho_product_destroy(engine);
}

} // namespace

int main() {
  requireCalibrationPrecedesDrySendSplit();
  requirePreFaderBehaviorSurvivesCalibration();
  requireBoostRangeRemainsEffective();
  requirePadCalibrationPrecedesDrySendSplit();
  requirePianoCalibrationPrecedesDrySendSplit();
  requireDrumPreFaderBoundarySurvivesCalibration();
  requireNonPianoSamplePreFaderBoundarySurvivesCalibration();
  requireSoundscapeEarthBoundarySurvivesCalibration();
  std::cout << "Kessho Product calibration transfer tests passed\n";
  return 0;
}
