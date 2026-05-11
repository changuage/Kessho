#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <vector>

#include "KesshoCore/KesshoProductCore.h"
#include "KesshoProductSchema.h"

namespace {

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Kessho Product Graph test failed: " << message << "\n";
    std::exit(1);
  }
}

float peak(const std::vector<float>& values) {
  float result = 0.0f;
  for (float value : values) {
    require(std::isfinite(value), "non-finite output sample");
    result = std::max(result, std::fabs(value));
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
  snapshot.master.gain = 1.0f;
  snapshot.rng.seed = 77;
  snapshot.rng.state = 77;
  for (uint32_t i = 0; i < 7; ++i) {
    snapshot.sources[i].enabled = 1;
    snapshot.sources[i].source_id = i + 1;
    snapshot.sources[i].level = 0.8f;
    snapshot.sources[i].dry_gain = 1.0f;
    snapshot.sources[i].expression = 0.8f;
    snapshot.sources[i].post_lpf_hz = 18000.0f;
    snapshot.sources[i].stereo_width = 1.0f;
  }
  return snapshot;
}

} // namespace

int main() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].preset_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_PLUCK_BELL;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "snapshot load failed");

  KesshoProductEvent note{};
  note.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  note.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  note.value = 60.0f;
  note.value2 = 0.8f;
  note.value3 = 0.2f;
  require(kessho_product_enqueue_event(engine, &note) == KESSHO_PRODUCT_OK, "manual note enqueue failed");

  std::vector<float> left(128);
  std::vector<float> right(128);
  kessho_product_render(engine, left.data(), right.data(), static_cast<uint32_t>(left.size()));
  require(peak(left) > 0.001f || peak(right) > 0.001f, "manual pad note did not reach master output");

  std::vector<float> stem_l(128);
  std::vector<float> stem_r(128);
  require(
      kessho_product_get_stem(engine, KESSHO_PRODUCT_STEM_PAD1, stem_l.data(), stem_r.data(), 128) ==
          KESSHO_PRODUCT_OK,
      "pad stem read failed");
  require(peak(stem_l) > 0.001f || peak(stem_r) > 0.001f, "pad source stem did not contain manual note");
  require(
      kessho_product_get_stem(engine, 99, stem_l.data(), stem_r.data(), 128) == KESSHO_PRODUCT_ERROR_INVALID_PARAM,
      "invalid stem id should be rejected");

  KesshoProductEvent journey{};
  journey.event_kind = KESSHO_PRODUCT_EVENT_KIND_START_JOURNEY_MORPH_CLOCK;
  require(kessho_product_enqueue_event(engine, &journey) == KESSHO_PRODUCT_OK, "journey start enqueue failed");
  KesshoProductEvent start{};
  start.event_kind = KESSHO_PRODUCT_EVENT_KIND_START;
  require(kessho_product_enqueue_event(engine, &start) == KESSHO_PRODUCT_OK, "transport start enqueue failed");
  kessho_product_render(engine, left.data(), right.data(), static_cast<uint32_t>(left.size()));
  KesshoProductTelemetry telemetry = kessho_product_get_telemetry(engine);
  require(telemetry.journey_morph_running == 1, "journey clock did not start");
  require(telemetry.journey_morph_phase > 0.0f, "journey clock phase did not advance");
  require(telemetry.transport_running == 1, "transport did not start");
  KesshoProductTelemetry copied_telemetry{};
  require(
      kessho_product_copy_telemetry(engine, &copied_telemetry) == KESSHO_PRODUCT_OK,
      "telemetry copy failed");
  require(copied_telemetry.transport_running == 1, "copied telemetry missed transport state");
  require(copied_telemetry.journey_morph_running == 1, "copied telemetry missed journey state");
  require(copied_telemetry.rng_seed == 77u, "copied telemetry missed RNG seed");
  require(copied_telemetry.rng_state == 77u, "copied telemetry missed RNG state");

  KesshoProductEvent stop_journey{};
  stop_journey.event_kind = KESSHO_PRODUCT_EVENT_KIND_STOP_JOURNEY_MORPH_CLOCK;
  require(kessho_product_enqueue_event(engine, &stop_journey) == KESSHO_PRODUCT_OK, "journey stop enqueue failed");
  kessho_product_render(engine, left.data(), right.data(), static_cast<uint32_t>(left.size()));
  telemetry = kessho_product_get_telemetry(engine);
  require(telemetry.journey_morph_running == 0, "journey clock did not stop");

  kessho_product_destroy(engine);
  std::cout << "Kessho Product Graph tests passed\n";
  return 0;
}
