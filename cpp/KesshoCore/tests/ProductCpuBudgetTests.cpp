#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <algorithm>
#include <ctime>
#include <iostream>
#include <vector>

#include "KesshoCore/KesshoProductCore.h"
#include "ProductSnapshotTestHelpers.h"

namespace {

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Kessho Product CPU test failed: " << message << "\n";
    std::exit(1);
  }
}

struct RenderCpuStats {
  double average_percent = 0.0;
  double peak_percent = 0.0;
  double p95_ms = 0.0;
  double p99_ms = 0.0;
  uint32_t missed_quantum_count = 0;
};

KesshoProductSnapshotV2 makeSnapshot() {
  KesshoProductSnapshotV2 snapshot{};
  snapshot.version = KESSHO_PRODUCT_SNAPSHOT_VERSION;
  snapshot.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
  snapshot.transport.running = 1;
  snapshot.transport.bpm = 120.0f;
  snapshot.transport.beats_per_bar = 4;
  snapshot.transport.bars_per_phrase = 4;
  snapshot.master.gain = 0.8f;
  snapshot.rng.seed = 11;
  snapshot.rng.state = 11;
  for (uint32_t i = 0; i < 7; ++i) {
    snapshot.sources[i].enabled = 1;
    snapshot.sources[i].source_id = i + 1;
    snapshot.sources[i].level = 0.6f;
    snapshot.sources[i].dry_gain = 1.0f;
    snapshot.sources[i].expression = 0.8f;
    snapshot.sources[i].post_lpf_hz = 18000.0f;
    snapshot.sources[i].stereo_width = 1.0f;
  }
  snapshot.synth_euclid.lane_count = 2;
  for (uint32_t lane = 0; lane < 2; ++lane) {
    snapshot.synth_euclid.lanes[lane].enabled = 1;
    snapshot.synth_euclid.lanes[lane].target_source_id = lane == 0 ? KESSHO_PRODUCT_SOURCE_PAD1 : KESSHO_PRODUCT_SOURCE_LEAD1;
    snapshot.synth_euclid.lanes[lane].step_count = 16;
    snapshot.synth_euclid.lanes[lane].fill_count = 5;
    snapshot.synth_euclid.lanes[lane].clock_division = 16;
    snapshot.synth_euclid.lanes[lane].probability = 1.0f;
    snapshot.synth_euclid.lanes[lane].ratchet = 2;
    snapshot.synth_euclid.lanes[lane].midi_note = 60.0f + static_cast<float>(lane * 7);
    snapshot.synth_euclid.lanes[lane].velocity = 0.8f;
    snapshot.synth_euclid.lanes[lane].hold_seconds = 0.12f;
    snapshot.synth_euclid.lanes[lane].expression = 0.8f;
    snapshot.synth_euclid.lanes[lane].seed = 100 + lane;
  }
  snapshot.drum_euclid.lane_count = 1;
  snapshot.drum_euclid.lanes[0] = snapshot.synth_euclid.lanes[0];
  snapshot.drum_euclid.lanes[0].target_source_id = KESSHO_PRODUCT_SOURCE_DRUM;
  snapshot.drum_euclid.lanes[0].midi_note = 36.0f;
  snapshot.drum_euclid.lanes[0].hold_seconds = 0.08f;
  kessho::product::tests::applyGeneratedSourceDefaults(snapshot);
  return snapshot;
}

void disableAllFx(KesshoProductSnapshotV2& snapshot) {
  snapshot.fx.reverb_mix = 0.0f;
  snapshot.fx.delay_a_enabled = 0u;
  snapshot.fx.delay_a_mix = 0.0f;
  snapshot.fx.delay_b_enabled = 0u;
  snapshot.fx.delay_b_mix = 0.0f;
  snapshot.fx.granular_enabled = 0u;
  snapshot.fx.granular_mix = 0.0f;
  snapshot.fx.spectral_freeze_enabled = 0u;
  snapshot.fx.spectral_freeze_mix = 0.0f;
  snapshot.fx.dynamics_enabled = 0u;
  snapshot.fx.dynamics_drive = 0.0f;
  snapshot.routing.delay_to_reverb = 0.0f;
  snapshot.routing.granular_to_reverb = 0.0f;
  snapshot.routing.delay_a_to_granular = 0.0f;
  snapshot.routing.delay_b_to_granular = 0.0f;
  snapshot.routing.delay_a_to_delay_b = 0.0f;
  snapshot.routing.delay_b_to_delay_a = 0.0f;
  snapshot.routing.delay_b_to_reverb = 0.0f;
}

void enableFxStress(KesshoProductSnapshotV2& snapshot) {
  snapshot.fx.reverb_mix = 0.5f;
  snapshot.fx.reverb_decay = 0.8f;
  snapshot.fx.delay_a_enabled = 1u;
  snapshot.fx.delay_a_mix = 0.35f;
  snapshot.fx.delay_a_feedback = 0.45f;
  snapshot.fx.delay_a_time_left_ms = 120.0f;
  snapshot.fx.delay_a_time_right_ms = 180.0f;
  snapshot.fx.delay_b_enabled = 1u;
  snapshot.fx.delay_b_mix = 0.25f;
  snapshot.fx.delay_b_activity = 0.5f;
  snapshot.fx.delay_b_repeats = 0.45f;
  snapshot.fx.granular_enabled = 1u;
  snapshot.fx.granular_mix = 0.2f;
  snapshot.fx.granular_voices[0].enabled = 1u;
  snapshot.fx.granular_voices[0].density = 24.0f;
  snapshot.fx.dynamics_enabled = 1u;
  snapshot.fx.dynamics_drive = 0.35f;
  snapshot.fx.dynamics_character_enabled = 1u;
  snapshot.fx.dynamics_character_mix = 0.25f;
  snapshot.fx.dynamics_degrade_enabled = 1u;
  snapshot.fx.dynamics_degrade_mix = 0.2f;
  snapshot.fx.dynamics_saturation_enabled = 1u;
  snapshot.fx.dynamics_saturation_drive = 0.2f;
  snapshot.fx.dynamics_end_comp_enabled = 1u;
  snapshot.fx.dynamics_end_comp_mix = 0.35f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].reverb_send = 0.5f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].delay_a_send = 0.4f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].granular_send = 0.25f;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_LEAD1 - 1u].delay_b_send = 0.35f;
  snapshot.routing.delay_to_reverb = 0.25f;
  snapshot.routing.granular_to_reverb = 0.2f;
  snapshot.routing.delay_a_to_granular = 0.15f;
  snapshot.routing.delay_b_to_reverb = 0.25f;
}

double percentile(std::vector<double> values, double percentile_value) {
  require(!values.empty(), "percentile input stayed empty");
  std::sort(values.begin(), values.end());
  const double rank = percentile_value * static_cast<double>(values.size() - 1u);
  const size_t lo = static_cast<size_t>(std::floor(rank));
  const size_t hi = static_cast<size_t>(std::ceil(rank));
  if (lo == hi) {
    return values[lo];
  }
  const double t = rank - static_cast<double>(lo);
  return values[lo] + (values[hi] - values[lo]) * t;
}

RenderCpuStats renderCpuStats(const KesshoProductSnapshotV2& snapshot, uint32_t blocks) {
  constexpr uint32_t frames = 128;
  constexpr uint32_t warmup_blocks = 256;
  constexpr uint32_t timed_blocks_per_sample = 5;
  KesshoProductEngine* engine = kessho_product_create(48000.0, frames, 0);
  require(engine != nullptr, "engine create failed");
  const int32_t load_result = kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot));
  if (load_result != KESSHO_PRODUCT_OK) {
    std::cerr << "snapshot load result=" << load_result
              << " last_error=" << kessho_product_get_telemetry(engine).last_error_code << "\n";
  }
  require(load_result == KESSHO_PRODUCT_OK, "snapshot load failed");

  std::vector<float> left(frames);
  std::vector<float> right(frames);
  for (uint32_t block = 0; block < warmup_blocks; ++block) {
    kessho_product_render(engine, left.data(), right.data(), frames);
  }

  std::vector<double> block_ms;
  block_ms.reserve(blocks);
  const std::clock_t start_clock = std::clock();
  for (uint32_t block = 0; block < blocks;) {
    const uint32_t sample_blocks = std::min(timed_blocks_per_sample, blocks - block);
    const std::clock_t sample_start_clock = std::clock();
    for (uint32_t sample_block = 0; sample_block < sample_blocks; ++sample_block) {
      kessho_product_render(engine, left.data(), right.data(), frames);
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
  const double rendered_ms = static_cast<double>(blocks * frames) * 1000.0 / 48000.0;
  const double quantum_ms = static_cast<double>(frames) * 1000.0 / 48000.0;
  RenderCpuStats stats{};
  stats.average_percent = (elapsed_ms / rendered_ms) * 100.0;
  stats.p95_ms = percentile(block_ms, 0.95);
  stats.p99_ms = percentile(block_ms, 0.99);
  for (double block_elapsed_ms : block_ms) {
    stats.peak_percent = std::max(stats.peak_percent, (block_elapsed_ms / quantum_ms) * 100.0);
    if (block_elapsed_ms > quantum_ms) {
      ++stats.missed_quantum_count;
    }
  }
  KesshoProductTelemetry telemetry = kessho_product_get_telemetry(engine);
  require(telemetry.absolute_sample_time == (blocks + warmup_blocks) * frames, "sample time did not advance as expected");
  kessho_product_destroy(engine);
  return stats;
}

void printCpuStats(const char* label, const RenderCpuStats& stats) {
  std::cout << label << " "
            << stats.average_percent << "% avg, "
            << stats.peak_percent << "% peak, p95 " << stats.p95_ms
            << " ms, p99 " << stats.p99_ms << " ms, missed "
            << stats.missed_quantum_count << "\n";
}

} // namespace

int main() {
  constexpr uint32_t blocks = 750;
  constexpr uint32_t max_allowed_missed_quantums = 2;
  constexpr double quantum_ms = 128.0 * 1000.0 / 48000.0;
  KesshoProductSnapshotV2 disabled_snapshot = makeSnapshot();
  disableAllFx(disabled_snapshot);
  const RenderCpuStats disabled_stats = renderCpuStats(disabled_snapshot, blocks);
  printCpuStats("Kessho Product CPU measured: disabled FX", disabled_stats);
  require(disabled_stats.average_percent < 25.0, "disabled-FX product render CPU budget exceeded");
  require(disabled_stats.p95_ms < quantum_ms * 0.5, "disabled-FX product render p95 budget exceeded");
  require(disabled_stats.p99_ms < quantum_ms, "disabled-FX product render p99 budget exceeded");
  require(
      disabled_stats.missed_quantum_count <= max_allowed_missed_quantums,
      "disabled-FX product render missed too many simulated quantums");

  KesshoProductSnapshotV2 active_snapshot = makeSnapshot();
  enableFxStress(active_snapshot);
  const RenderCpuStats active_stats = renderCpuStats(active_snapshot, blocks);
  printCpuStats("Kessho Product CPU measured: active FX", active_stats);
  require(active_stats.average_percent < 35.0, "active-FX product render CPU smoke budget exceeded");
  require(active_stats.p95_ms < quantum_ms * 0.75, "active-FX product render p95 budget exceeded");
  require(active_stats.p99_ms < quantum_ms, "active-FX product render p99 budget exceeded");
  require(
      active_stats.missed_quantum_count <= max_allowed_missed_quantums,
      "active-FX product render missed too many simulated quantums");

  std::cout << "Kessho Product CPU smoke passed: disabled FX "
            << disabled_stats.average_percent << "% avg, "
            << disabled_stats.peak_percent << "% peak, p95 " << disabled_stats.p95_ms
            << " ms, p99 " << disabled_stats.p99_ms << " ms, missed "
            << disabled_stats.missed_quantum_count << "; active FX "
            << active_stats.average_percent << "% avg, "
            << active_stats.peak_percent << "% peak, p95 " << active_stats.p95_ms
            << " ms, p99 " << active_stats.p99_ms << " ms, missed "
            << active_stats.missed_quantum_count << "\n";
  return 0;
}
