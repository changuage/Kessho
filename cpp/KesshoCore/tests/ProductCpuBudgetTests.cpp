#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <vector>

#include "KesshoCore/KesshoProductCore.h"

namespace {

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Kessho Product CPU test failed: " << message << "\n";
    std::exit(1);
  }
}

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
  return snapshot;
}

} // namespace

int main() {
  constexpr uint32_t frames = 128;
  constexpr uint32_t blocks = 750;
  KesshoProductEngine* engine = kessho_product_create(48000.0, frames, 0);
  require(engine != nullptr, "engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "snapshot load failed");

  std::vector<float> left(frames);
  std::vector<float> right(frames);
  const auto start = std::chrono::steady_clock::now();
  for (uint32_t block = 0; block < blocks; ++block) {
    kessho_product_render(engine, left.data(), right.data(), frames);
  }
  const auto end = std::chrono::steady_clock::now();
  const double elapsed_ms = std::chrono::duration<double, std::milli>(end - start).count();
  const double rendered_ms = static_cast<double>(blocks * frames) * 1000.0 / 48000.0;
  const double cpu_percent = (elapsed_ms / rendered_ms) * 100.0;
  require(cpu_percent < 35.0, "product render CPU smoke budget exceeded");
  KesshoProductTelemetry telemetry = kessho_product_get_telemetry(engine);
  require(telemetry.absolute_sample_time == blocks * frames, "sample time did not advance as expected");
  kessho_product_destroy(engine);
  std::cout << "Kessho Product CPU smoke passed: " << cpu_percent << "%\n";
  return 0;
}
