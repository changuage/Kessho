#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <iomanip>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

#include "KesshoCore/KesshoProductCore.h"
#include "KesshoCore/KesshoProductTypes.h"
#include "../src/product/KesshoProductEngineInternal.h"
#include "ProductSnapshotTestHelpers.h"

namespace {

constexpr double kSampleRate = 48000.0;
constexpr uint32_t kBlockSize = 128u;
constexpr uint32_t kWarmupBlocks = 16u;
constexpr uint32_t kMeasurementBlocks = 64u;
constexpr float kNonzeroRms = 1.0e-8f;
constexpr float kPreLimiterPeakCeiling = 0.95f;
constexpr float kLimiterInactivityEpsilonDb = 0.05f;

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Kessho Product level calibration validation failed: " << message << "\n";
    std::exit(1);
  }
}

struct SignalMetrics {
  double sum_squares = 0.0;
  uint64_t sample_count = 0u;
  float peak = 0.0f;
  uint64_t hash = 1469598103934665603ull;

  void add(const float* left, const float* right, uint32_t frames) {
    for (uint32_t i = 0u; i < frames; ++i) {
      const float channels[2] = {left[i], right[i]};
      for (float value : channels) {
        require(std::isfinite(value), "fixture emitted a non-finite sample");
        sum_squares += static_cast<double>(value) * static_cast<double>(value);
        ++sample_count;
        peak = std::max(peak, std::fabs(value));
        uint32_t bits = 0u;
        std::memcpy(&bits, &value, sizeof(bits));
        hash ^= static_cast<uint64_t>(bits);
        hash *= 1099511628211ull;
      }
    }
  }

  float rms() const {
    return sample_count == 0u
        ? 0.0f
        : static_cast<float>(std::sqrt(sum_squares / static_cast<double>(sample_count)));
  }
};

struct SourceMeasurement {
  const char* name = nullptr;
  uint32_t source_id = 0u;
  float rms = 0.0f;
  float peak = 0.0f;
  uint64_t hash = 0u;
};

struct DrumMeasurement {
  SignalMetrics master;
  SignalMetrics dry;
  SignalMetrics pre_limiter;
  float max_limiter_gain_reduction_db = 0.0f;
};

struct EarthMeasurement {
  SignalMetrics master;
  SignalMetrics water_dry;
  float max_limiter_gain_reduction_db = 0.0f;
};

struct FxMeasurement {
  SignalMetrics delay_a_main;
  SignalMetrics delay_a_reverb;
  SignalMetrics delay_b_main;
  SignalMetrics delay_b_reverb;
  SignalMetrics granular_main;
  SignalMetrics granular_reverb;
  SignalMetrics reverb_main;
};

struct HeadroomMeasurement {
  SignalMetrics pre_limiter;
  SignalMetrics output;
  float max_limiter_gain_reduction_db = 0.0f;
};

KesshoProductSnapshotV2 baseSnapshot() {
  KesshoProductSnapshotV2 snapshot{};
  snapshot.version = KESSHO_PRODUCT_SNAPSHOT_VERSION;
  snapshot.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
  snapshot.transport.running = 0u;
  snapshot.transport.bpm = 120.0f;
  snapshot.transport.beats_per_bar = 4u;
  snapshot.transport.bars_per_phrase = 4u;
  snapshot.harmony.root_midi = 60.0f;
  snapshot.harmony.scale_id = 1u;
  snapshot.master.gain = 1.0f;
  snapshot.master.limiter_ceiling_db = 0.0f;
  snapshot.rng.seed = 0x51a7c0deu;
  snapshot.rng.state = snapshot.rng.seed;
  kessho::product::tests::applyGeneratedSourceDefaults(snapshot);
  for (uint32_t index = 0u; index < kessho::product::internal::kSourceCount; ++index) {
    snapshot.sources[index].enabled = 0u;
    snapshot.sources[index].source_id = index + 1u;
    snapshot.sources[index].level = 1.0f;
    snapshot.sources[index].dry_gain = 1.0f;
    snapshot.sources[index].expression = 1.0f;
    snapshot.sources[index].post_lpf_hz = 18000.0f;
    snapshot.sources[index].stereo_width = 1.0f;
  }
  snapshot.fx.delay_a_enabled = 0u;
  snapshot.fx.delay_b_enabled = 0u;
  snapshot.fx.granular_enabled = 0u;
  snapshot.fx.spectral_freeze_enabled = 0u;
  snapshot.fx.dynamics_enabled = 0u;
  snapshot.fx.reverb_mix = 0.0f;
  snapshot.fx.delay_a_mix = 0.0f;
  snapshot.fx.delay_b_mix = 0.0f;
  snapshot.fx.granular_mix = 0.0f;
  snapshot.fx.spectral_freeze_mix = 0.0f;
  return snapshot;
}

void configureSource(
    KesshoProductSnapshotV2& snapshot,
    uint32_t source_id,
    uint32_t preset_id,
    float level = 1.0f) {
  KesshoProductSourceSnapshot& source = snapshot.sources[source_id - 1u];
  source.enabled = 1u;
  source.source_id = source_id;
  source.preset_id = preset_id;
  source.level = level;
  source.dry_gain = 1.0f;
  source.expression = 1.0f;
  source.post_lpf_hz = 18000.0f;
  source.stereo_width = 1.0f;
  source.reverb_send = 0.0f;
  source.delay_a_send = 0.0f;
  source.delay_b_send = 0.0f;
  source.granular_send = 0.0f;
  source.degrade_send = 0.0f;
  source.spectral_freeze_send = 0.0f;
  source.diffuse_send = 0.0f;
  kessho::product::tests::applyGeneratedSourcePreset(snapshot, source_id, preset_id);
}

uint32_t dryTapForSource(uint32_t source_id) {
  switch (source_id) {
    case KESSHO_PRODUCT_SOURCE_PAD1: return KESSHO_PRODUCT_GRAPH_TAP_PAD1_DRY;
    case KESSHO_PRODUCT_SOURCE_LEAD1: return KESSHO_PRODUCT_GRAPH_TAP_LEAD1_DRY;
    case KESSHO_PRODUCT_SOURCE_PIANO: return KESSHO_PRODUCT_GRAPH_TAP_PIANO_DRY;
    default: return KESSHO_PRODUCT_GRAPH_TAP_MASTER_PRE_LIMITER;
  }
}

SourceMeasurement renderMelodicFixture(
    const char* name,
    uint32_t source_id,
    uint32_t preset_id,
    float midi_note,
    uint32_t asset_id = 0u) {
  auto engine_storage = std::make_unique<KesshoProductEngine>(kSampleRate, kBlockSize, 0u);
  KesshoProductEngine& engine = *engine_storage;
  KesshoProductSnapshotV2 snapshot = baseSnapshot();
  configureSource(snapshot, source_id, preset_id);
  std::vector<float> asset;
  if (source_id == KESSHO_PRODUCT_SOURCE_PIANO) {
    asset.resize(static_cast<size_t>(kSampleRate));
    for (uint32_t index = 0u; index < asset.size(); ++index) {
      asset[index] = 0.24f * std::sin(static_cast<float>(index) * 0.041f);
    }
    KesshoProductSourceSnapshot& source = snapshot.sources[source_id - 1u];
    source.asset_id = asset_id;
    source.sample_library_id = kessho::product::internal::kSampleLibraryPiano;
    source.sample_selection_mode = KESSHO_PRODUCT_SAMPLE_SELECTION_EXACT;
    source.sample_dynamic_mode = KESSHO_PRODUCT_SAMPLE_DYNAMIC_FIXED;
    source.sample_loop_enabled = 1u;
    const float* channels[1] = {asset.data()};
    require(
        kessho_product_register_asset_buffer(
            &engine,
            asset_id,
            channels,
            1u,
            static_cast<uint32_t>(asset.size()),
            kSampleRate,
            KESSHO_PRODUCT_ASSET_PIANO | KESSHO_PRODUCT_ASSET_LOOP) == KESSHO_PRODUCT_OK,
        "Piano sustained fixture asset registration failed");
  }
  require(
      kessho_product_load_snapshot_v2(&engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "melodic level fixture snapshot load failed");
  require(
      kessho_product_set_graph_taps_enabled(&engine, 1u) == KESSHO_PRODUCT_OK,
      "melodic level fixture graph taps enable failed");
  KesshoProductEvent note{};
  note.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  note.target_id = source_id;
  note.value = midi_note;
  note.value2 = 0.85f;
  note.value3 = 1.0f;
  require(kessho_product_enqueue_event(&engine, &note) == KESSHO_PRODUCT_OK, "melodic fixture note enqueue failed");

  std::vector<float> output_l(kBlockSize);
  std::vector<float> output_r(kBlockSize);
  std::vector<float> tap_l(kBlockSize);
  std::vector<float> tap_r(kBlockSize);
  SignalMetrics dry;
  const uint32_t tap_id = dryTapForSource(source_id);
  for (uint32_t block = 0u; block < kWarmupBlocks + kMeasurementBlocks; ++block) {
    kessho_product_render(&engine, output_l.data(), output_r.data(), kBlockSize);
    if (block < kWarmupBlocks) continue;
    require(
        kessho_product_get_graph_tap(&engine, tap_id, tap_l.data(), tap_r.data(), kBlockSize) == KESSHO_PRODUCT_OK,
        "melodic fixture graph tap read failed");
    dry.add(tap_l.data(), tap_r.data(), kBlockSize);
  }
  require(dry.rms() > kNonzeroRms, "sustained melodic fixture rendered silence");
  return {name, source_id, dry.rms(), dry.peak, dry.hash};
}

std::vector<std::pair<uint64_t, uint32_t>> drumPattern() {
  std::vector<std::pair<uint64_t, uint32_t>> events;
  constexpr uint64_t sixteenth = 6000u;
  for (uint32_t step = 0u; step < 32u; ++step) {
    const uint64_t frame = static_cast<uint64_t>(step) * sixteenth;
    if ((step % 8u) == 0u) events.push_back({frame, 36u});
    if ((step % 8u) == 4u) events.push_back({frame, 38u});
    if ((step % 2u) == 0u) events.push_back({frame, 37u});
  }
  return events;
}

DrumMeasurement renderDrumFixture() {
  auto engine_storage = std::make_unique<KesshoProductEngine>(kSampleRate, kBlockSize, 0u);
  KesshoProductEngine& engine = *engine_storage;
  KesshoProductSnapshotV2 snapshot = baseSnapshot();
  configureSource(
      snapshot,
      KESSHO_PRODUCT_SOURCE_DRUM,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_DRUM_DEFAULT,
      1.0f);
  require(
      kessho_product_load_snapshot_v2(&engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "two-bar drum fixture snapshot load failed");
  require(
      kessho_product_set_graph_taps_enabled(&engine, 1u) == KESSHO_PRODUCT_OK,
      "two-bar drum fixture graph taps enable failed");

  const auto events = drumPattern();
  std::size_t event_index = 0u;
  constexpr uint32_t total_blocks = 1500u;
  std::vector<float> output_l(kBlockSize);
  std::vector<float> output_r(kBlockSize);
  std::vector<float> tap_l(kBlockSize);
  std::vector<float> tap_r(kBlockSize);
  DrumMeasurement result;
  for (uint32_t block = 0u; block < total_blocks; ++block) {
    const uint64_t block_start = static_cast<uint64_t>(block) * kBlockSize;
    const uint64_t block_end = block_start + kBlockSize;
    while (event_index < events.size() && events[event_index].first < block_end) {
      require(
          engine.triggerVoice(
              KESSHO_PRODUCT_SOURCE_DRUM,
              static_cast<float>(events[event_index].second),
              0.82f,
              0.12f,
              -1.0f,
              -1.0f,
              1.0f,
              static_cast<uint32_t>(event_index + 1u)) != kessho::product::internal::kProductInvalidVoiceIndex,
          "two-bar drum fixture trigger failed");
      ++event_index;
    }
    kessho_product_render(&engine, output_l.data(), output_r.data(), kBlockSize);
    result.master.add(output_l.data(), output_r.data(), kBlockSize);
    const KesshoProductTelemetry telemetry = kessho_product_get_telemetry(&engine);
    result.max_limiter_gain_reduction_db = std::max(
        result.max_limiter_gain_reduction_db, telemetry.master_limiter_gain_reduction_db);
    require(
        kessho_product_get_graph_tap(
            &engine,
            KESSHO_PRODUCT_GRAPH_TAP_MASTER_PRE_LIMITER,
            tap_l.data(),
            tap_r.data(),
            kBlockSize) == KESSHO_PRODUCT_OK,
        "two-bar drum pre-limiter tap read failed");
    result.pre_limiter.add(tap_l.data(), tap_r.data(), kBlockSize);
    require(
        kessho_product_get_graph_tap(
            &engine,
            KESSHO_PRODUCT_GRAPH_TAP_DRUM_DRY,
            tap_l.data(),
            tap_r.data(),
            kBlockSize) == KESSHO_PRODUCT_OK,
        "two-bar drum dry tap read failed");
    result.dry.add(tap_l.data(), tap_r.data(), kBlockSize);
  }
  require(event_index == events.size(), "two-bar drum fixture did not schedule every hit");
  require(result.dry.rms() > kNonzeroRms, "two-bar drum fixture rendered silence");
  return result;
}

EarthMeasurement renderEarthFixture() {
  using namespace kessho::product::internal;
  auto engine_storage = std::make_unique<KesshoProductEngine>(kSampleRate, kBlockSize, 0u);
  KesshoProductEngine& engine = *engine_storage;
  KesshoProductSnapshotV2 snapshot = baseSnapshot();
  snapshot.transport.running = 1u;
  configureSource(
      snapshot,
      KESSHO_PRODUCT_SOURCE_SOUNDSCAPE,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_SOUNDSCAPE_OCEAN_SAMPLE);
  require(engine.soundscapes_module != nullptr, "Earth fixture Soundscape module missing");
  const float* soundscape_defaults = engine.soundscapes_module->params();
  require(soundscape_defaults != nullptr, "Earth fixture Soundscape defaults missing");
  std::copy(
      soundscape_defaults,
      soundscape_defaults + kSoundscapeModuleParamCount,
      snapshot.soundscape_module_params);
  snapshot.soundscape_module_param_count = kSoundscapeProductModuleParamCount;
  snapshot.soundscape_module_params[kSoundscapeModuleWaterActiveParam] = 1.0f;
  snapshot.soundscape_module_params[kSoundscapeModuleWaterSeedParam] = 0x1234u;
  snapshot.soundscape_module_params[kSoundscapeModuleWaterLevelParam] = 1.0f;
  snapshot.soundscape_module_params[kSoundscapeModuleEarthLevelParam] = 1.0f;
  snapshot.soundscape_module_params[kSoundscapeModuleWaterMasterEnabledParam] = 1.0f;
  snapshot.soundscape_module_params[kSoundscapeModuleWaterLayerMaskParam] =
      static_cast<float>(kSoundscapeWaterLayerMaskAll);
  snapshot.soundscape_texture_param_count = kSoundscapeTextureParamCount;
  snapshot.routing.dynamics_water_bus = 0u;
  require(
      kessho_product_load_snapshot_v2(&engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "Earth fixture snapshot load failed");
  require(
      kessho_product_set_graph_taps_enabled(&engine, 1u) == KESSHO_PRODUCT_OK,
      "Earth fixture graph taps enable failed");

  std::vector<float> output_l(kBlockSize);
  std::vector<float> output_r(kBlockSize);
  std::vector<float> tap_l(kBlockSize);
  std::vector<float> tap_r(kBlockSize);
  EarthMeasurement result;
  for (uint32_t block = 0u; block < kWarmupBlocks + kMeasurementBlocks; ++block) {
    kessho_product_render(&engine, output_l.data(), output_r.data(), kBlockSize);
    const KesshoProductTelemetry telemetry = kessho_product_get_telemetry(&engine);
    result.max_limiter_gain_reduction_db =
        std::max(result.max_limiter_gain_reduction_db, telemetry.master_limiter_gain_reduction_db);
    if (block < kWarmupBlocks) continue;
    result.master.add(output_l.data(), output_r.data(), kBlockSize);
    require(
        kessho_product_get_graph_tap(
            &engine,
            KESSHO_PRODUCT_GRAPH_TAP_SOUNDSCAPE_WATER_DRY,
            tap_l.data(),
            tap_r.data(),
            kBlockSize) == KESSHO_PRODUCT_OK,
        "Earth fixture water tap read failed");
    result.water_dry.add(tap_l.data(), tap_r.data(), kBlockSize);
  }
  require(result.water_dry.rms() > kNonzeroRms, "Earth fixture water module rendered silence");
  require(result.master.rms() > kNonzeroRms, "Earth fixture master rendered silence");
  return result;
}

void clearFxInputs(KesshoProductEngine& engine) {
  float* const buffers[] = {
      engine.delay_a_bus_l, engine.delay_a_bus_r,
      engine.delay_b_bus_l, engine.delay_b_bus_r,
      engine.granular_bus_l, engine.granular_bus_r,
      engine.degrade_bus_l, engine.degrade_bus_r,
      engine.spectral_freeze_bus_l, engine.spectral_freeze_bus_r,
      engine.reverb_bus_l, engine.reverb_bus_r,
      engine.dynamics_eq1_bus_l, engine.dynamics_eq1_bus_r,
      engine.dynamics_eq2_bus_l, engine.dynamics_eq2_bus_r,
      engine.dynamics_sidechain_bus_l, engine.dynamics_sidechain_bus_r,
      engine.creative_saturation_bus_l, engine.creative_saturation_bus_r,
  };
  for (float* buffer : buffers) {
    std::fill(buffer, buffer + kBlockSize, 0.0f);
  }
}

FxMeasurement renderFixedFxFixture() {
  using namespace kessho::product::internal;
  auto engine_storage = std::make_unique<KesshoProductEngine>(kSampleRate, kBlockSize, 0u);
  KesshoProductEngine& engine = *engine_storage;
  engine.graph_taps_enabled = true;
  engine.fx.delay_a_enabled = true;
  engine.fx.delay_a_time_left_ms = 8.0f;
  engine.fx.delay_a_time_right_ms = 12.0f;
  engine.fx.delay_a_feedback = 0.0f;
  engine.fx.delay_a_filter_hz = 18000.0f;
  engine.fx.delay_a_mix = 1.0f;
  engine.fx.delay_b_enabled = true;
  engine.fx.delay_b_activity = 1.0f;
  engine.fx.delay_b_repeats = 0.35f;
  engine.fx.delay_b_base_time_ms = 12.0f;
  engine.fx.delay_b_mix = 1.0f;
  engine.fx.granular_enabled = true;
  engine.fx.granular_mix = 1.0f;
  engine.fx.granular_output_lpf_hz = 18000.0f;
  engine.fx.granular_reverb_lpf_hz = 18000.0f;
  engine.fx.reverb_mix = 1.0f;
  engine.routing.clearFxGraph();
  require(engine.routing.setFxRoute(kFxNodeDelayA, kFxNodeReverb, 1.0f, true), "fixed FX Delay A route setup failed");
  require(engine.routing.setFxRoute(kFxNodeDelayB, kFxNodeReverb, 1.0f, true), "fixed FX Delay B route setup failed");
  require(engine.routing.setFxRoute(kFxNodeGranular, kFxNodeReverb, 1.0f, true), "fixed FX Granular route setup failed");
  engine.configureFxModules();

  std::vector<float> output_l(kBlockSize);
  std::vector<float> output_r(kBlockSize);
  FxMeasurement result;
  for (uint32_t block = 0u; block < 96u; ++block) {
    clearFxInputs(engine);
    for (uint32_t i = 0u; i < kBlockSize; ++i) {
      const uint32_t frame = block * kBlockSize + i;
      const float phase = static_cast<float>(frame) * 0.021f;
      engine.delay_a_bus_l[i] = 0.22f * std::sin(phase);
      engine.delay_a_bus_r[i] = 0.17f * std::cos(phase * 0.93f);
      engine.delay_b_bus_l[i] = 0.19f * std::sin(phase * 0.71f);
      engine.delay_b_bus_r[i] = 0.13f * std::cos(phase * 0.67f);
      engine.granular_bus_l[i] = 0.16f * std::sin(phase * 0.47f);
      engine.granular_bus_r[i] = 0.12f * std::cos(phase * 0.43f);
      engine.reverb_bus_l[i] = 0.11f * std::sin(phase * 0.31f);
      engine.reverb_bus_r[i] = 0.09f * std::cos(phase * 0.29f);
    }
    std::fill(output_l.begin(), output_l.end(), 0.0f);
    std::fill(output_r.begin(), output_r.end(), 0.0f);
    engine.renderFxGraph(output_l.data(), output_r.data(), 0u, kBlockSize);
    if (block < kWarmupBlocks) continue;
    const auto addTap = [&](uint32_t tap_id, SignalMetrics& metric) {
      const float* left = nullptr;
      const float* right = nullptr;
      switch (tap_id) {
        case KESSHO_PRODUCT_GRAPH_TAP_DELAY_A_OUTPUT:
          left = engine.graph_delay_a_output_l; right = engine.graph_delay_a_output_r; break;
        case KESSHO_PRODUCT_GRAPH_TAP_DELAY_A_REVERB_SEND:
          left = engine.graph_delay_a_reverb_send_l; right = engine.graph_delay_a_reverb_send_r; break;
        case KESSHO_PRODUCT_GRAPH_TAP_DELAY_B_OUTPUT:
          left = engine.graph_delay_b_output_l; right = engine.graph_delay_b_output_r; break;
        case KESSHO_PRODUCT_GRAPH_TAP_DELAY_B_REVERB_SEND:
          left = engine.graph_delay_b_reverb_send_l; right = engine.graph_delay_b_reverb_send_r; break;
        case KESSHO_PRODUCT_GRAPH_TAP_GRANULAR_OUTPUT:
          left = engine.graph_granular_output_l; right = engine.graph_granular_output_r; break;
        case KESSHO_PRODUCT_GRAPH_TAP_GRANULAR_REVERB_SEND:
          left = engine.graph_granular_reverb_send_l; right = engine.graph_granular_reverb_send_r; break;
        case KESSHO_PRODUCT_GRAPH_TAP_REVERB_OUTPUT:
          left = engine.graph_reverb_output_l; right = engine.graph_reverb_output_r; break;
        default: break;
      }
      require(left != nullptr && right != nullptr, "fixed FX graph tap mapping missing");
      metric.add(left, right, kBlockSize);
    };
    addTap(KESSHO_PRODUCT_GRAPH_TAP_DELAY_A_OUTPUT, result.delay_a_main);
    addTap(KESSHO_PRODUCT_GRAPH_TAP_DELAY_A_REVERB_SEND, result.delay_a_reverb);
    addTap(KESSHO_PRODUCT_GRAPH_TAP_DELAY_B_OUTPUT, result.delay_b_main);
    addTap(KESSHO_PRODUCT_GRAPH_TAP_DELAY_B_REVERB_SEND, result.delay_b_reverb);
    addTap(KESSHO_PRODUCT_GRAPH_TAP_GRANULAR_OUTPUT, result.granular_main);
    addTap(KESSHO_PRODUCT_GRAPH_TAP_GRANULAR_REVERB_SEND, result.granular_reverb);
    addTap(KESSHO_PRODUCT_GRAPH_TAP_REVERB_OUTPUT, result.reverb_main);
  }
  require(result.delay_a_main.rms() > kNonzeroRms, "fixed FX Delay A main return rendered silence");
  require(result.delay_a_reverb.rms() > kNonzeroRms, "fixed FX Delay A specialized Reverb branch rendered silence");
  require(result.delay_b_main.rms() > kNonzeroRms, "fixed FX Delay B main return rendered silence");
  require(result.delay_b_reverb.rms() > kNonzeroRms, "fixed FX Delay B specialized Reverb branch rendered silence");
  require(result.granular_main.rms() > kNonzeroRms, "fixed FX Granular main return rendered silence");
  require(result.granular_reverb.rms() > kNonzeroRms, "fixed FX Granular specialized Reverb branch rendered silence");
  require(result.reverb_main.rms() > kNonzeroRms, "fixed FX Reverb main return rendered silence");
  return result;
}

HeadroomMeasurement renderHeadroomFixture() {
  auto engine_storage = std::make_unique<KesshoProductEngine>(kSampleRate, kBlockSize, 0u);
  KesshoProductEngine& engine = *engine_storage;
  KesshoProductSnapshotV2 snapshot = baseSnapshot();
  snapshot.master.gain = 0.9f;
  configureSource(
      snapshot,
      KESSHO_PRODUCT_SOURCE_PAD1,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_METAL_TINE,
      0.82f);
  configureSource(
      snapshot,
      KESSHO_PRODUCT_SOURCE_LEAD1,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES,
      0.76f);
  configureSource(
      snapshot,
      KESSHO_PRODUCT_SOURCE_PIANO,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PIANO_DEFAULT,
      0.68f);
  std::vector<float> piano_asset(static_cast<size_t>(kSampleRate));
  for (uint32_t index = 0u; index < piano_asset.size(); ++index) {
    piano_asset[index] = 0.24f * std::sin(static_cast<float>(index) * 0.037f);
  }
  KesshoProductSourceSnapshot& piano = snapshot.sources[KESSHO_PRODUCT_SOURCE_PIANO - 1u];
  piano.asset_id = 9302u;
  piano.sample_library_id = kessho::product::internal::kSampleLibraryPiano;
  piano.sample_selection_mode = KESSHO_PRODUCT_SAMPLE_SELECTION_EXACT;
  piano.sample_dynamic_mode = KESSHO_PRODUCT_SAMPLE_DYNAMIC_FIXED;
  piano.sample_loop_enabled = 1u;
  const float* piano_channels[1] = {piano_asset.data()};
  require(
      kessho_product_register_asset_buffer(
          &engine,
          9302u,
          piano_channels,
          1u,
          static_cast<uint32_t>(piano_asset.size()),
          kSampleRate,
          KESSHO_PRODUCT_ASSET_PIANO | KESSHO_PRODUCT_ASSET_LOOP) == KESSHO_PRODUCT_OK,
      "headroom Piano fixture asset registration failed");
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].reverb_send = 0.25f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u].reverb_send = 0.20f;
  piano.reverb_send = 0.18f;
  snapshot.fx.reverb_mix = 0.35f;
  snapshot.fx.delay_a_enabled = 1u;
  snapshot.fx.delay_a_mix = 0.28f;
  snapshot.fx.delay_a_time_left_ms = 40.0f;
  snapshot.fx.delay_a_time_right_ms = 52.0f;
  snapshot.fx.delay_a_filter_hz = 8000.0f;
  snapshot.fx.delay_b_enabled = 1u;
  snapshot.fx.delay_b_mix = 0.22f;
  snapshot.fx.delay_b_activity = 0.6f;
  snapshot.fx.delay_b_repeats = 0.25f;
  snapshot.fx.delay_b_base_time_ms = 75.0f;
  snapshot.fx.granular_enabled = 1u;
  snapshot.fx.granular_mix = 0.18f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].delay_a_send = 0.16f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].delay_b_send = 0.10f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].granular_send = 0.08f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u].delay_a_send = 0.14f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u].delay_b_send = 0.10f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u].granular_send = 0.08f;
  piano.delay_a_send = 0.12f;
  piano.delay_b_send = 0.08f;
  piano.granular_send = 0.06f;
  require(
      kessho_product_load_snapshot_v2(&engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "headroom fixture snapshot load failed");
  require(
      kessho_product_set_graph_taps_enabled(&engine, 1u) == KESSHO_PRODUCT_OK,
      "headroom fixture graph taps enable failed");
  KesshoProductEvent pad_note{};
  pad_note.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  pad_note.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  pad_note.value = 48.0f;
  pad_note.value2 = 0.8f;
  pad_note.value3 = 0.8f;
  require(kessho_product_enqueue_event(&engine, &pad_note) == KESSHO_PRODUCT_OK, "headroom Pad note enqueue failed");
  KesshoProductEvent lead_note = pad_note;
  lead_note.target_id = KESSHO_PRODUCT_SOURCE_LEAD1;
  lead_note.value = 60.0f;
  require(kessho_product_enqueue_event(&engine, &lead_note) == KESSHO_PRODUCT_OK, "headroom Lead note enqueue failed");
  KesshoProductEvent piano_note = pad_note;
  piano_note.target_id = KESSHO_PRODUCT_SOURCE_PIANO;
  piano_note.value = 64.0f;
  piano_note.value2 = 0.72f;
  piano_note.value3 = 1.0f;
  require(kessho_product_enqueue_event(&engine, &piano_note) == KESSHO_PRODUCT_OK, "headroom Piano note enqueue failed");

  std::vector<float> output_l(kBlockSize);
  std::vector<float> output_r(kBlockSize);
  std::vector<float> tap_l(kBlockSize);
  std::vector<float> tap_r(kBlockSize);
  HeadroomMeasurement result;
  for (uint32_t block = 0u; block < 96u; ++block) {
    kessho_product_render(&engine, output_l.data(), output_r.data(), kBlockSize);
    const KesshoProductTelemetry telemetry = kessho_product_get_telemetry(&engine);
    result.max_limiter_gain_reduction_db =
        std::max(result.max_limiter_gain_reduction_db, telemetry.master_limiter_gain_reduction_db);
    if (block < kWarmupBlocks) continue;
    result.output.add(output_l.data(), output_r.data(), kBlockSize);
    require(
        kessho_product_get_graph_tap(
            &engine,
            KESSHO_PRODUCT_GRAPH_TAP_MASTER_PRE_LIMITER,
            tap_l.data(),
            tap_r.data(),
            kBlockSize) == KESSHO_PRODUCT_OK,
        "headroom pre-limiter tap read failed");
    result.pre_limiter.add(tap_l.data(), tap_r.data(), kBlockSize);
  }
  require(result.pre_limiter.peak < kPreLimiterPeakCeiling, "nominal headroom fixture exceeded pre-limiter ceiling");
  require(
      result.max_limiter_gain_reduction_db <= kLimiterInactivityEpsilonDb,
      "nominal headroom fixture required meaningful limiter gain reduction");
  return result;
}

std::string hashString(uint64_t value) {
  return std::to_string(value);
}

void appendSignalJson(std::ostringstream& json, const SignalMetrics& metric) {
  json << "{\"rms\":" << std::setprecision(9) << metric.rms()
       << ",\"peak\":" << metric.peak
       << ",\"hash\":\"" << hashString(metric.hash) << "\"}";
}

void appendSourceJson(std::ostringstream& json, const SourceMeasurement& metric) {
  json << "{\"name\":\"" << metric.name << "\",\"source_id\":" << metric.source_id
       << ",\"rms\":" << std::setprecision(9) << metric.rms
       << ",\"peak\":" << metric.peak
       << ",\"hash\":\"" << hashString(metric.hash) << "\"}";
}

} // namespace

int main() {
  const SourceMeasurement pad = renderMelodicFixture(
      "sustained_pad_metal_tine_c4",
      KESSHO_PRODUCT_SOURCE_PAD1,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_METAL_TINE,
      60.0f);
  const SourceMeasurement lead = renderMelodicFixture(
      "sustained_lead_soft_rhodes_c4",
      KESSHO_PRODUCT_SOURCE_LEAD1,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES,
      60.0f);
  const SourceMeasurement piano = renderMelodicFixture(
      "sustained_piano_fixed_asset_c4",
      KESSHO_PRODUCT_SOURCE_PIANO,
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PIANO_DEFAULT,
      60.0f,
      9301u);
  const DrumMeasurement drums = renderDrumFixture();

  const EarthMeasurement earth = renderEarthFixture();

  const FxMeasurement fx = renderFixedFxFixture();

  const HeadroomMeasurement headroom = renderHeadroomFixture();

  std::ostringstream json;
  json << "{\"schema\":\"kessho-product-level-calibration-v1\""
       << ",\"sample_rate\":" << static_cast<uint32_t>(kSampleRate)
       << ",\"block_size\":" << kBlockSize
       << ",\"source_tolerance_db\":3.0"
       << ",\"fx_structural_tolerance_db\":3.0"
       << ",\"pre_limiter_peak_ceiling\":" << kPreLimiterPeakCeiling
       << ",\"limiter_inactivity_epsilon_db\":" << kLimiterInactivityEpsilonDb
       << ",\"sources\":[";
  appendSourceJson(json, pad);
  json << ",";
  appendSourceJson(json, lead);
  json << ",";
  appendSourceJson(json, piano);
  json << "]"
       << ",\"drums\":{";
  json << "\"master\":";
  appendSignalJson(json, drums.master);
  json << ",\"dry\":";
  appendSignalJson(json, drums.dry);
  json << ",\"pre_limiter\":";
  appendSignalJson(json, drums.pre_limiter);
  json << ",\"max_limiter_gain_reduction_db\":" << drums.max_limiter_gain_reduction_db;
  json << "}"
       << ",\"earth\":{";
  json << "\"master\":";
  appendSignalJson(json, earth.master);
  json << ",\"water_dry\":";
  appendSignalJson(json, earth.water_dry);
  json << ",\"max_limiter_gain_reduction_db\":" << earth.max_limiter_gain_reduction_db << "}"
       << ",\"fx\":{";
  json << "\"delay_a_main\":";
  appendSignalJson(json, fx.delay_a_main);
  json << ",\"delay_a_reverb\":";
  appendSignalJson(json, fx.delay_a_reverb);
  json << ",\"delay_b_main\":";
  appendSignalJson(json, fx.delay_b_main);
  json << ",\"delay_b_reverb\":";
  appendSignalJson(json, fx.delay_b_reverb);
  json << ",\"granular_main\":";
  appendSignalJson(json, fx.granular_main);
  json << ",\"granular_reverb\":";
  appendSignalJson(json, fx.granular_reverb);
  json << ",\"reverb_main\":";
  appendSignalJson(json, fx.reverb_main);
  json << "}"
       << ",\"headroom\":{";
  json << "\"pre_limiter\":";
  appendSignalJson(json, headroom.pre_limiter);
  json << ",\"output\":";
  appendSignalJson(json, headroom.output);
  json << ",\"max_limiter_gain_reduction_db\":" << headroom.max_limiter_gain_reduction_db << "}}";

  std::cout << "KESSHO_PRODUCT_LEVEL_CALIBRATION_JSON=" << json.str() << "\n";
  std::cout << "Kessho Product gain-staging validation fixtures passed\n";
  return 0;
}
