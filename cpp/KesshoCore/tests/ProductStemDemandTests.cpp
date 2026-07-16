#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <iostream>

#include "KesshoCore/KesshoProductCore.h"
#include "ProductSnapshotTestHelpers.h"

namespace {

constexpr uint32_t kFrames = 128u;

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Kessho Product stem demand test failed: " << message << "\n";
    std::exit(1);
  }
}

KesshoProductSnapshotV2 makeSnapshot() {
  KesshoProductSnapshotV2 snapshot{};
  snapshot.version = KESSHO_PRODUCT_SNAPSHOT_VERSION;
  snapshot.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
  snapshot.transport.running = 1u;
  snapshot.transport.bpm = 120.0f;
  snapshot.transport.beats_per_bar = 4u;
  snapshot.transport.bars_per_phrase = 4u;
  snapshot.master.gain = 1.0f;
  snapshot.rng.seed = 29u;
  snapshot.rng.state = 29u;
  snapshot.synth_euclid.lane_count = 1u;
  auto& lane = snapshot.synth_euclid.lanes[0];
  lane.enabled = 1u;
  lane.target_source_id = KESSHO_PRODUCT_SOURCE_PAD1;
  lane.step_count = 4u;
  lane.fill_count = 4u;
  lane.clock_division = 16u;
  lane.probability = 1.0f;
  lane.ratchet = 1u;
  lane.midi_note = 60.0f;
  lane.velocity = 0.8f;
  lane.hold_seconds = 0.1f;
  lane.expression = 0.8f;
  lane.seed = 101u;
  lane.manual_step_mask_low = 0x0fu;
  kessho::product::tests::applyGeneratedSourceDefaults(snapshot);
  return snapshot;
}

float peak(const std::array<float, kFrames>& values) {
  float result = 0.0f;
  for (float value : values) result = std::max(result, std::fabs(value));
  return result;
}

} // namespace

int main() {
  KesshoProductEngine* stereo = kessho_product_create(48000.0, kFrames, 0u);
  KesshoProductEngine* stems = kessho_product_create(48000.0, kFrames, 0u);
  require(stereo != nullptr && stems != nullptr, "engine creation failed");
  const KesshoProductSnapshotV2 snapshot = makeSnapshot();
  require(kessho_product_load_snapshot_v2(stereo, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "stereo snapshot load failed");
  require(kessho_product_load_snapshot_v2(stems, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "stem snapshot load failed");
  require(kessho_product_set_stems_enabled(stems, 1u) == KESSHO_PRODUCT_OK, "stem enable failed");

  std::array<float, kFrames> stereo_l{};
  std::array<float, kFrames> stereo_r{};
  std::array<float, kFrames> stems_l{};
  std::array<float, kFrames> stems_r{};
  std::array<float, kFrames> captured_l{};
  std::array<float, kFrames> captured_r{};
  float captured_peak = 0.0f;
  for (uint32_t block = 0; block < 64u; ++block) {
    kessho_product_render(stereo, stereo_l.data(), stereo_r.data(), kFrames);
    kessho_product_render(stems, stems_l.data(), stems_r.data(), kFrames);
    require(std::memcmp(stereo_l.data(), stems_l.data(), sizeof(stereo_l)) == 0, "stem demand changed left master PCM");
    require(std::memcmp(stereo_r.data(), stems_r.data(), sizeof(stereo_r)) == 0, "stem demand changed right master PCM");
    require(kessho_product_get_stem(stereo, KESSHO_PRODUCT_STEM_MASTER, captured_l.data(), captured_r.data(), kFrames) == KESSHO_PRODUCT_OK, "disabled stem read failed");
    require(peak(captured_l) == 0.0f && peak(captured_r) == 0.0f, "disabled stems were written");
    require(kessho_product_get_stem(stems, KESSHO_PRODUCT_STEM_MASTER, captured_l.data(), captured_r.data(), kFrames) == KESSHO_PRODUCT_OK, "enabled stem read failed");
    captured_peak = std::max(captured_peak, std::max(peak(captured_l), peak(captured_r)));
  }
  require(captured_peak > 0.0001f, "enabled master stem remained silent");

  require(kessho_product_set_stems_enabled(stems, 0u) == KESSHO_PRODUCT_OK, "stem disable failed");
  kessho_product_render(stems, stems_l.data(), stems_r.data(), kFrames);
  require(kessho_product_get_stem(stems, KESSHO_PRODUCT_STEM_MASTER, captured_l.data(), captured_r.data(), kFrames) == KESSHO_PRODUCT_OK, "disabled-after-use stem read failed");
  require(peak(captured_l) == 0.0f && peak(captured_r) == 0.0f, "disabled stem exposed stale samples");

  require(kessho_product_set_graph_taps_enabled(stereo, 1u) == KESSHO_PRODUCT_OK, "graph tap enable failed");
  kessho_product_render(stereo, stereo_l.data(), stereo_r.data(), kFrames);
  require(kessho_product_get_stem(stereo, KESSHO_PRODUCT_STEM_MASTER, captured_l.data(), captured_r.data(), kFrames) == KESSHO_PRODUCT_OK, "graph-backed stem read failed");
  require(std::max(peak(captured_l), peak(captured_r)) > 0.0001f, "graph tap mode did not capture stem-backed taps");

  kessho_product_destroy(stereo);
  kessho_product_destroy(stems);
  std::cout << "Kessho Product stem demand tests passed\n";
  return 0;
}
