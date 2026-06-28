#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <ctime>
#include <iostream>
#include <string>
#include <vector>

#include "KesshoCore/KesshoProductCore.h"
#include "ProductSnapshotTestHelpers.h"
#include "../src/product/generated/SampleLibraryRegistry.generated.h"

namespace {

constexpr uint32_t kFrames = 128;
constexpr double kSampleRate = 48000.0;
constexpr double kQuantumMs = static_cast<double>(kFrames) * 1000.0 / kSampleRate;
constexpr uint32_t kPiano60AssetId = 7240u;
constexpr uint32_t kSoftStringLoopAssetId = 8201u;
constexpr uint32_t kArchiveLoopAssetId = 8400u;
std::vector<std::vector<float>> g_asset_storage;

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Kessho Product sampler CPU test failed: " << message << "\n";
    std::exit(1);
  }
}

struct RenderCpuStats {
  double average_percent = 0.0;
  double peak_percent = 0.0;
  double p95_ms = 0.0;
  double p99_ms = 0.0;
  uint32_t missed_quantum_count = 0;
  uint32_t active_voices = 0;
  uint32_t active_assets = 0;
  uint32_t asset_misses = 0;
  uint32_t voice_steals = 0;
};

struct Scenario {
  std::string id;
  KesshoProductSnapshotV2 snapshot{};
  bool register_piano = false;
  bool register_soft = false;
  bool register_archive = false;
  uint32_t trigger_count = 1;
  uint32_t expected_max_active_voices = 64;
  uint32_t expected_min_asset_misses = 0;
};

double percentile(std::vector<double> values, double percentile_value) {
  require(!values.empty(), "percentile input stayed empty");
  std::sort(values.begin(), values.end());
  const double rank = percentile_value * static_cast<double>(values.size() - 1u);
  const size_t lo = static_cast<size_t>(std::floor(rank));
  const size_t hi = static_cast<size_t>(std::ceil(rank));
  if (lo == hi) return values[lo];
  const double t = rank - static_cast<double>(lo);
  return values[lo] + (values[hi] - values[lo]) * t;
}

KesshoProductSnapshotV2 makeBaseSnapshot() {
  KesshoProductSnapshotV2 snapshot{};
  snapshot.version = KESSHO_PRODUCT_SNAPSHOT_VERSION;
  snapshot.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
  snapshot.transport.running = 1u;
  snapshot.transport.bpm = 120.0f;
  snapshot.transport.beats_per_bar = 4u;
  snapshot.transport.bars_per_phrase = 4u;
  snapshot.master.gain = 0.8f;
  snapshot.rng.seed = 23u;
  snapshot.rng.state = 23u;
  kessho::product::tests::applyGeneratedSourceDefaults(snapshot);
  for (uint32_t index = 0; index < 8u; ++index) {
    snapshot.sources[index].enabled = 0u;
    snapshot.sources[index].level = 0.0f;
    snapshot.sources[index].dry_gain = 1.0f;
    snapshot.sources[index].delay_a_send = 0.0f;
    snapshot.sources[index].delay_b_send = 0.0f;
    snapshot.sources[index].granular_send = 0.0f;
    snapshot.sources[index].reverb_send = 0.0f;
    snapshot.sources[index].post_lpf_hz = 18000.0f;
    snapshot.sources[index].stereo_width = 1.0f;
  }
  snapshot.fx.reverb_mix = 0.0f;
  snapshot.fx.delay_a_enabled = 0u;
  snapshot.fx.delay_b_enabled = 0u;
  snapshot.fx.granular_enabled = 0u;
  snapshot.fx.dynamics_enabled = 0u;
  return snapshot;
}

void configurePiano(KesshoProductSnapshotV2& snapshot, uint32_t source_id, uint32_t max_voices = 16u) {
  auto& source = snapshot.sources[source_id - 1u];
  source.enabled = 1u;
  source.level = 0.7f;
  source.sample_library_id = kessho::product::generated::kSampleLibraryIdPiano;
  source.sample_role_id = 0u;
  source.sample_articulation_id = 0u;
  source.sample_selection_mode = KESSHO_PRODUCT_SAMPLE_SELECTION_NEAREST;
  source.sample_dynamic_mode = KESSHO_PRODUCT_SAMPLE_DYNAMIC_FIXED;
  source.sample_fixed_dynamic_id = kessho::product::generated::kSampleDynamicIdRegular;
  source.sample_loop_enabled = 0u;
  source.sample_max_voices = max_voices;
  source.sample_variant_mode = KESSHO_PRODUCT_SAMPLE_VARIANT_STABLE;
  source.attack_seconds = 0.004f;
  source.release_seconds = 0.02f;
}

void configureSoftLoop(KesshoProductSnapshotV2& snapshot, uint32_t source_id, uint32_t max_voices = 12u) {
  auto& source = snapshot.sources[source_id - 1u];
  source.enabled = 1u;
  source.level = 0.7f;
  source.sample_library_id = kessho::product::generated::kSampleLibraryIdSoftStringSpurs;
  source.sample_role_id = 0u;
  source.sample_articulation_id = 0u;
  source.sample_selection_mode = KESSHO_PRODUCT_SAMPLE_SELECTION_MAPPED;
  source.sample_dynamic_mode = KESSHO_PRODUCT_SAMPLE_DYNAMIC_FIXED;
  source.sample_fixed_dynamic_id = kessho::product::generated::kSampleDynamicIdSingle;
  source.sample_loop_enabled = 1u;
  source.sample_max_voices = max_voices;
  source.sample_variant_mode = KESSHO_PRODUCT_SAMPLE_VARIANT_STABLE;
  source.attack_seconds = 0.004f;
  source.release_seconds = 0.02f;
}

void configureArchiveLoop(KesshoProductSnapshotV2& snapshot, uint32_t source_id, uint32_t max_voices = 12u) {
  auto& source = snapshot.sources[source_id - 1u];
  source.enabled = 1u;
  source.level = 0.7f;
  source.sample_library_id = kessho::product::generated::kSampleLibraryIdArchiveFoundStrings001;
  source.sample_role_id = 0u;
  source.sample_articulation_id = 0u;
  source.sample_selection_mode = KESSHO_PRODUCT_SAMPLE_SELECTION_NEAREST;
  source.sample_dynamic_mode = KESSHO_PRODUCT_SAMPLE_DYNAMIC_FIXED;
  source.sample_fixed_dynamic_id = kessho::product::generated::kSampleDynamicIdSingle;
  source.sample_loop_enabled = 1u;
  source.sample_max_voices = max_voices;
  source.sample_variant_mode = KESSHO_PRODUCT_SAMPLE_VARIANT_STABLE;
  source.attack_seconds = 0.004f;
  source.release_seconds = 0.02f;
}

void fillWave(std::vector<float>& target, float phase_offset) {
  for (uint32_t index = 0; index < target.size(); ++index) {
    const float phase = static_cast<float>(index) * 0.0314159f + phase_offset;
    target[index] = 0.2f * static_cast<float>(std::sin(phase));
  }
}

void registerAsset(KesshoProductEngine* engine, uint32_t asset_id, uint32_t frames, uint32_t flags) {
  g_asset_storage.emplace_back(frames);
  g_asset_storage.emplace_back(frames);
  fillWave(g_asset_storage[g_asset_storage.size() - 2u], 0.0f);
  fillWave(g_asset_storage[g_asset_storage.size() - 1u], 0.7f);
  const float* channels[2] = {
      g_asset_storage[g_asset_storage.size() - 2u].data(),
      g_asset_storage[g_asset_storage.size() - 1u].data(),
  };
  require(
      kessho_product_register_asset_buffer(engine, asset_id, channels, 2u, frames, kSampleRate, flags) ==
          KESSHO_PRODUCT_OK,
      "sampler asset registration failed");
}

void triggerManual(KesshoProductEngine* engine, uint32_t source_id, float midi_note, uint32_t sample_offset) {
  KesshoProductEvent note{};
  note.sample_offset = sample_offset;
  note.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  note.target_id = source_id;
  note.value = midi_note;
  note.value2 = 0.9f;
  note.value3 = 0.18f;
  require(kessho_product_enqueue_event(engine, &note) == KESSHO_PRODUCT_OK, "sampler manual note enqueue failed");
}

RenderCpuStats renderScenario(const Scenario& scenario) {
  constexpr uint32_t warmup_blocks = 96u;
  constexpr uint32_t timed_blocks = 320u;
  constexpr uint32_t timed_blocks_per_sample = 4u;
  KesshoProductEngine* engine = kessho_product_create(kSampleRate, kFrames, 0);
  require(engine != nullptr, "engine create failed");
  require(
      kessho_product_load_snapshot_v2(engine, &scenario.snapshot, sizeof(scenario.snapshot)) == KESSHO_PRODUCT_OK,
      "sampler snapshot load failed");

  if (scenario.register_piano) registerAsset(engine, kPiano60AssetId, 4096u, KESSHO_PRODUCT_ASSET_SAMPLE | KESSHO_PRODUCT_ASSET_PIANO);
  if (scenario.register_soft) registerAsset(engine, kSoftStringLoopAssetId, 1200000u, KESSHO_PRODUCT_ASSET_SAMPLE | KESSHO_PRODUCT_ASSET_LOOP);
  if (scenario.register_archive) registerAsset(engine, kArchiveLoopAssetId, 700000u, KESSHO_PRODUCT_ASSET_SAMPLE | KESSHO_PRODUCT_ASSET_LOOP);

  const bool sample1_enabled = scenario.snapshot.sources[KESSHO_PRODUCT_SOURCE_SAMPLE1 - 1u].enabled != 0u;
  const bool sample2_enabled = scenario.snapshot.sources[KESSHO_PRODUCT_SOURCE_SAMPLE2 - 1u].enabled != 0u;
  for (uint32_t index = 0; index < scenario.trigger_count; ++index) {
    const uint32_t offset = (index % 8u) * 8u;
    if (sample1_enabled) triggerManual(engine, KESSHO_PRODUCT_SOURCE_SAMPLE1, 60.0f, offset);
    if (sample2_enabled) triggerManual(engine, KESSHO_PRODUCT_SOURCE_SAMPLE2, 60.0f, offset);
  }

  std::vector<float> left(kFrames);
  std::vector<float> right(kFrames);
  for (uint32_t block = 0; block < warmup_blocks; ++block) {
    kessho_product_render(engine, left.data(), right.data(), kFrames);
  }

  std::vector<double> block_ms;
  block_ms.reserve(timed_blocks);
  const std::clock_t start_clock = std::clock();
  for (uint32_t block = 0; block < timed_blocks;) {
    const uint32_t sample_blocks = std::min(timed_blocks_per_sample, timed_blocks - block);
    const std::clock_t sample_start_clock = std::clock();
    for (uint32_t sample_block = 0; sample_block < sample_blocks; ++sample_block) {
      kessho_product_render(engine, left.data(), right.data(), kFrames);
    }
    const std::clock_t sample_end_clock = std::clock();
    const double sample_ms = 1000.0 * static_cast<double>(sample_end_clock - sample_start_clock) /
                             static_cast<double>(CLOCKS_PER_SEC);
    const double per_block_ms = sample_ms / static_cast<double>(sample_blocks);
    for (uint32_t sample_block = 0; sample_block < sample_blocks; ++sample_block) {
      block_ms.push_back(per_block_ms);
    }
    block += sample_blocks;
  }
  const std::clock_t end_clock = std::clock();
  const double elapsed_ms = 1000.0 * static_cast<double>(end_clock - start_clock) / static_cast<double>(CLOCKS_PER_SEC);
  const double rendered_ms = static_cast<double>(timed_blocks * kFrames) * 1000.0 / kSampleRate;
  KesshoProductTelemetry telemetry = kessho_product_get_telemetry(engine);

  RenderCpuStats stats{};
  stats.average_percent = (elapsed_ms / rendered_ms) * 100.0;
  stats.p95_ms = percentile(block_ms, 0.95);
  stats.p99_ms = percentile(block_ms, 0.99);
  for (double block_elapsed_ms : block_ms) {
    stats.peak_percent = std::max(stats.peak_percent, (block_elapsed_ms / kQuantumMs) * 100.0);
    if (block_elapsed_ms > kQuantumMs) ++stats.missed_quantum_count;
  }
  stats.active_voices = telemetry.active_voices;
  stats.active_assets = telemetry.active_assets;
  stats.asset_misses = telemetry.asset_missing_count;
  const uint32_t expected_voice_triggers =
      scenario.trigger_count * (static_cast<uint32_t>(sample1_enabled) + static_cast<uint32_t>(sample2_enabled));
  stats.voice_steals = expected_voice_triggers > telemetry.active_voices
      ? expected_voice_triggers - telemetry.active_voices
      : 0u;

  require(stats.missed_quantum_count == 0u, "sampler scenario missed a simulated deadline");
  require(stats.p99_ms < kQuantumMs, "sampler scenario p99 exceeded one render quantum");
  require(stats.active_voices <= scenario.expected_max_active_voices, "sampler scenario exceeded max voice budget");
  require(stats.asset_misses >= scenario.expected_min_asset_misses, "sampler scenario did not report expected asset miss");
  kessho_product_destroy(engine);
  return stats;
}

void printScenario(const Scenario& scenario, const RenderCpuStats& stats) {
  std::cout << "Sampler CPU scenario " << scenario.id
            << ": avg " << stats.average_percent
            << "% peak " << stats.peak_percent
            << "% p95 " << stats.p95_ms
            << " ms p99 " << stats.p99_ms
            << " ms missed " << stats.missed_quantum_count
            << " activeVoices " << stats.active_voices
            << " voiceSteals " << stats.voice_steals
            << " assetMisses " << stats.asset_misses
            << " registeredAssets " << stats.active_assets << "\n";
}

} // namespace

int main() {
  std::vector<Scenario> scenarios;

  Scenario single{"sample1-piano-single-note", makeBaseSnapshot()};
  configurePiano(single.snapshot, KESSHO_PRODUCT_SOURCE_SAMPLE1, 16u);
  single.register_piano = true;
  scenarios.push_back(single);

  Scenario piano_voices{"sample1-piano-16-voices", makeBaseSnapshot()};
  configurePiano(piano_voices.snapshot, KESSHO_PRODUCT_SOURCE_SAMPLE1, 16u);
  piano_voices.register_piano = true;
  piano_voices.trigger_count = 16u;
  piano_voices.expected_max_active_voices = 16u;
  scenarios.push_back(piano_voices);

  Scenario shared{"sample1-sample2-same-asset-shared-cache", makeBaseSnapshot()};
  configurePiano(shared.snapshot, KESSHO_PRODUCT_SOURCE_SAMPLE1, 16u);
  configurePiano(shared.snapshot, KESSHO_PRODUCT_SOURCE_SAMPLE2, 16u);
  shared.register_piano = true;
  shared.trigger_count = 8u;
  shared.expected_max_active_voices = 16u;
  scenarios.push_back(shared);

  Scenario independent{"sample1-sample2-independent-assets", makeBaseSnapshot()};
  configurePiano(independent.snapshot, KESSHO_PRODUCT_SOURCE_SAMPLE1, 16u);
  configureSoftLoop(independent.snapshot, KESSHO_PRODUCT_SOURCE_SAMPLE2, 12u);
  independent.register_piano = true;
  independent.register_soft = true;
  independent.trigger_count = 8u;
  independent.expected_max_active_voices = 28u;
  scenarios.push_back(independent);

  Scenario loop1{"sample1-looped-string-12-voices", makeBaseSnapshot()};
  configureSoftLoop(loop1.snapshot, KESSHO_PRODUCT_SOURCE_SAMPLE1, 12u);
  loop1.register_soft = true;
  loop1.trigger_count = 12u;
  loop1.expected_max_active_voices = 12u;
  scenarios.push_back(loop1);

  Scenario loop2{"sample2-looped-string-12-voices", makeBaseSnapshot()};
  configureArchiveLoop(loop2.snapshot, KESSHO_PRODUCT_SOURCE_SAMPLE2, 12u);
  loop2.register_archive = true;
  loop2.trigger_count = 12u;
  loop2.expected_max_active_voices = 12u;
  scenarios.push_back(loop2);

  Scenario maxvoices{"sample1-sample2-max-voices", makeBaseSnapshot()};
  configurePiano(maxvoices.snapshot, KESSHO_PRODUCT_SOURCE_SAMPLE1, 16u);
  configureSoftLoop(maxvoices.snapshot, KESSHO_PRODUCT_SOURCE_SAMPLE2, 12u);
  maxvoices.register_piano = true;
  maxvoices.register_soft = true;
  maxvoices.trigger_count = 32u;
  maxvoices.expected_max_active_voices = 28u;
  scenarios.push_back(maxvoices);

  Scenario miss{"asset-miss-burst-no-allocation", makeBaseSnapshot()};
  configureSoftLoop(miss.snapshot, KESSHO_PRODUCT_SOURCE_SAMPLE1, 12u);
  miss.trigger_count = 24u;
  miss.expected_min_asset_misses = 1u;
  scenarios.push_back(miss);

  Scenario steal{"voice-steal-burst", makeBaseSnapshot()};
  configurePiano(steal.snapshot, KESSHO_PRODUCT_SOURCE_SAMPLE1, 4u);
  steal.register_piano = true;
  steal.trigger_count = 24u;
  steal.expected_max_active_voices = 4u;
  scenarios.push_back(steal);

  Scenario wrap{"loop-boundary-wrap-stress", makeBaseSnapshot()};
  configureSoftLoop(wrap.snapshot, KESSHO_PRODUCT_SOURCE_SAMPLE1, 12u);
  configureArchiveLoop(wrap.snapshot, KESSHO_PRODUCT_SOURCE_SAMPLE2, 12u);
  wrap.register_soft = true;
  wrap.register_archive = true;
  wrap.trigger_count = 12u;
  wrap.expected_max_active_voices = 24u;
  scenarios.push_back(wrap);

  for (const Scenario& scenario : scenarios) {
    const RenderCpuStats stats = renderScenario(scenario);
    printScenario(scenario, stats);
  }

  std::cout << "Kessho Product sampler CPU scenarios passed\n";
  return 0;
}
