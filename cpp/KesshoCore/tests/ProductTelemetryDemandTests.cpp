#include <array>
#include <cstdint>
#include <cstdlib>
#include <iostream>

#include "KesshoCore/KesshoProductCore.h"
#include "ProductSnapshotTestHelpers.h"

namespace {

constexpr uint32_t kFrames = 128u;

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Kessho Product telemetry demand test failed: " << message << "\n";
    std::exit(1);
  }
}

KesshoProductSnapshotV2 makeRunningSnapshot() {
  KesshoProductSnapshotV2 snapshot{};
  snapshot.version = KESSHO_PRODUCT_SNAPSHOT_VERSION;
  snapshot.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
  snapshot.transport.running = 1u;
  snapshot.transport.bpm = 120.0f;
  snapshot.transport.beats_per_bar = 4u;
  snapshot.transport.bars_per_phrase = 4u;
  snapshot.master.gain = 1.0f;
  snapshot.rng.seed = 17u;
  snapshot.rng.state = 17u;
  for (uint32_t index = 0; index < 7u; ++index) {
    snapshot.sources[index].source_id = index + 1u;
    snapshot.sources[index].level = 0.8f;
    snapshot.sources[index].dry_gain = 1.0f;
    snapshot.sources[index].post_lpf_hz = 18000.0f;
    snapshot.sources[index].stereo_width = 1.0f;
  }
  kessho::product::tests::applyGeneratedSourceDefaults(snapshot);
  return snapshot;
}

} // namespace

int main() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, kFrames, 0u);
  require(engine != nullptr, "engine creation failed");
  const KesshoProductSnapshotV2 snapshot = makeRunningSnapshot();
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "snapshot load failed");

  const uint64_t refreshes_before = kessho_product_get_telemetry_refresh_count(engine);
  KesshoProductTelemetry before{};
  require(kessho_product_copy_telemetry(engine, &before) == KESSHO_PRODUCT_OK, "initial telemetry copy failed");

  std::array<float, kFrames> left{};
  std::array<float, kFrames> right{};
  for (uint32_t block = 0; block < 1000u; ++block) {
    kessho_product_render(engine, left.data(), right.data(), kFrames);
  }
  require(
      kessho_product_get_telemetry_refresh_count(engine) == refreshes_before,
      "rendering without a request performed a full telemetry refresh");

  KesshoProductTelemetry stale{};
  require(kessho_product_copy_telemetry(engine, &stale) == KESSHO_PRODUCT_OK, "stale telemetry copy failed");
  require(stale.absolute_sample_time > before.absolute_sample_time, "realtime transport counter became stale");
  require(kessho_product_refresh_telemetry(engine) == KESSHO_PRODUCT_OK, "explicit telemetry refresh failed");
  require(
      kessho_product_get_telemetry_refresh_count(engine) == refreshes_before + 1u,
      "explicit telemetry refresh count mismatch");
  KesshoProductTelemetry current{};
  require(kessho_product_copy_telemetry(engine, &current) == KESSHO_PRODUCT_OK, "current telemetry copy failed");
  require(current.absolute_sample_time > before.absolute_sample_time, "explicit refresh did not publish current transport");
  require(current.block_size == kFrames, "realtime block size was not preserved");

  KesshoProductEvent invalid{};
  invalid.event_kind = UINT32_MAX;
  require(
      kessho_product_enqueue_event(engine, &invalid) == KESSHO_PRODUCT_ERROR_INVALID_EVENT,
      "invalid event was not rejected");
  KesshoProductTelemetry error_snapshot{};
  require(kessho_product_copy_telemetry(engine, &error_snapshot) == KESSHO_PRODUCT_OK, "error telemetry copy failed");
  require(error_snapshot.last_error_code == KESSHO_PRODUCT_ERROR_INVALID_EVENT, "realtime error counter became stale");

  require(kessho_product_set_meter_demand(engine, 1u) == KESSHO_PRODUCT_OK, "meter demand enable failed");
  require(kessho_product_set_meter_demand(engine, 0u) == KESSHO_PRODUCT_OK, "meter demand disable failed");
  kessho_product_destroy(engine);
  std::cout << "Kessho Product telemetry demand tests passed\n";
  return 0;
}
