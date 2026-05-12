#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iostream>

#include "KesshoCore/KesshoProductCore.h"
#include "../src/product/KesshoProductEngineInternal.h"

namespace {

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Kessho Product Determinism test failed: " << message << "\n";
    std::exit(1);
  }
}

void requireNear(float actual, float expected, float tolerance, const char* message) {
  require(std::fabs(actual - expected) <= tolerance, message);
}

KesshoProductSnapshotV2 makeSnapshot(uint32_t seed = 19u) {
  KesshoProductSnapshotV2 snapshot{};
  snapshot.version = KESSHO_PRODUCT_SNAPSHOT_VERSION;
  snapshot.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
  snapshot.transport.running = 1;
  snapshot.transport.bpm = 120.0f;
  snapshot.transport.beats_per_bar = 4;
  snapshot.transport.bars_per_phrase = 4;
  snapshot.harmony.root_midi = 60.0f;
  snapshot.harmony.scale_id = 1;
  snapshot.harmony.tension = 0.0f;
  snapshot.master.gain = 1.0f;
  snapshot.rng.seed = seed;
  snapshot.rng.state = seed;

  for (uint32_t source = 0; source < 7; ++source) {
    snapshot.sources[source].enabled = 1;
    snapshot.sources[source].source_id = source + 1u;
    snapshot.sources[source].level = 0.8f;
    snapshot.sources[source].dry_gain = 1.0f;
    snapshot.sources[source].expression = 0.8f;
    snapshot.sources[source].post_lpf_hz = 18000.0f;
    snapshot.sources[source].stereo_width = 1.0f;
  }

  snapshot.synth_euclid.lane_count = 1;
  KesshoProductSequencerLaneSnapshot& lane = snapshot.synth_euclid.lanes[0];
  lane.enabled = 1;
  lane.target_source_id = KESSHO_PRODUCT_SOURCE_PAD1;
  lane.step_count = 4;
  lane.fill_count = 4;
  lane.clock_division = 16;
  lane.probability = 1.0f;
  lane.ratchet = 1;
  lane.midi_note = 60.0f;
  lane.velocity = 0.8f;
  lane.hold_seconds = 0.1f;
  lane.morph = 0.35f;
  lane.distance = 0.45f;
  lane.expression = 0.75f;
  lane.seed = seed + 101u;
  lane.manual_step_mask_low = 0x0fu;
  snapshot.drum_euclid.lane_count = 0;
  return snapshot;
}

int32_t renderEvents(const KesshoProductSnapshotV2& snapshot, KesshoSequencerEvent* events, uint32_t max_events, uint32_t frames) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "engine create failed");
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "snapshot load failed");
  const int32_t count = kessho_product_debug_render_events(engine, events, max_events, frames);
  kessho_product_destroy(engine);
  return count;
}

const KesshoSequencerEvent* findEvent(const KesshoSequencerEvent* events, int32_t count, uint32_t step_id, uint32_t sample_offset) {
  for (int32_t index = 0; index < count; ++index) {
    if (events[index].step_id == step_id && events[index].sample_offset == sample_offset) {
      return &events[index];
    }
  }
  return nullptr;
}

void requireSameMusicalEvent(const KesshoSequencerEvent& left, const KesshoSequencerEvent& right, const char* message) {
  require(left.sample_offset == right.sample_offset, message);
  require(left.source_id == right.source_id, message);
  require(left.lane_id == right.lane_id, message);
  require(left.step_id == right.step_id, message);
  requireNear(left.midi_note, right.midi_note, 0.0001f, message);
  requireNear(left.velocity, right.velocity, 0.0001f, message);
  requireNear(left.morph, right.morph, 0.0001f, message);
  requireNear(left.distance, right.distance, 0.0001f, message);
  requireNear(left.expression, right.expression, 0.0001f, message);
}

float expectedEvolvedLaneValue(
    const KesshoProductSnapshotV2& snapshot,
    uint32_t lane_index,
    uint32_t step_id,
    uint64_t absolute_sample,
    uint32_t component,
    float base,
    float depth,
    float min_value,
    float max_value) {
  using namespace kessho::product::internal;

  const float amount = clampFloat(snapshot.evolution.amount, 0.0f, 1.0f) * clampFloat(depth, 0.0f, 1.0f);
  if (amount <= 0.000001f) {
    return clampFloat(base, min_value, max_value);
  }
  ProductTransport transport{};
  transport.running = snapshot.transport.running != 0u;
  transport.bpm = snapshot.transport.bpm;
  transport.beats_per_bar = snapshot.transport.beats_per_bar;
  transport.bars_per_phrase = snapshot.transport.bars_per_phrase;
  const uint64_t bar = transport.barIndexAt(48000.0, absolute_sample);
  const uint64_t phrase = transport.phraseIndexAt(48000.0, absolute_sample);
  const KesshoProductSequencerLaneSnapshot& lane = snapshot.synth_euclid.lanes[lane_index];
  const uint32_t seed =
      lane.seed ^
      snapshot.rng.seed ^
      snapshot.evolution.state ^
      (component * 374761393u) ^
      (lane_index * 668265263u) ^
      (step_id * 2246822519u) ^
      static_cast<uint32_t>(bar * 3266489917ull) ^
      static_cast<uint32_t>(phrase * 2654435761ull);
  const float random_delta = hashUnit(seed) * 2.0f - 1.0f;
  return clampFloat(base + amount * random_delta, min_value, max_value);
}

void requireRngCallOrderIsolation() {
  KesshoProductSnapshotV2 base = makeSnapshot();
  base.evolution.amount = 0.75f;
  base.evolution.state = 1234u;
  KesshoSequencerEvent base_events[16]{};
  const int32_t base_count = renderEvents(base, base_events, 16, 24001);
  require(base_count >= 4, "base deterministic event count too low");

  KesshoProductSnapshotV2 masked = base;
  masked.synth_euclid.lanes[0].manual_step_mask_low = 0x0du;
  KesshoSequencerEvent masked_events[16]{};
  const int32_t masked_count = renderEvents(masked, masked_events, 16, 24001);
  require(masked_count == base_count - 1, "masked deterministic event count mismatch");

  const KesshoSequencerEvent* base_step_2 = findEvent(base_events, base_count, 2u, 12000u);
  const KesshoSequencerEvent* masked_step_2 = findEvent(masked_events, masked_count, 2u, 12000u);
  require(base_step_2 != nullptr && masked_step_2 != nullptr, "step 2 event missing from RNG call-order fixture");
  requireSameMusicalEvent(*base_step_2, *masked_step_2, "skipped step changed later deterministic event values");
}

void requireRngTransactionTrace() {
  KesshoProductSnapshotV2 snapshot = makeSnapshot(31u);
  snapshot.evolution.amount = 0.8f;
  snapshot.evolution.state = 4567u;
  KesshoSequencerEvent events[16]{};
  const int32_t count = renderEvents(snapshot, events, 16, 18001);
  require(count >= 3, "transaction trace event count too low");
  const KesshoSequencerEvent* event = findEvent(events, count, 2u, 12000u);
  require(event != nullptr, "transaction trace event missing");

  requireNear(
      event->velocity,
      expectedEvolvedLaneValue(snapshot, 0u, 2u, 12000u, 2u, snapshot.synth_euclid.lanes[0].velocity, 0.25f, 0.0f, 1.0f),
      0.0001f,
      "RNG transaction trace velocity mismatch");
  requireNear(
      event->morph,
      expectedEvolvedLaneValue(snapshot, 0u, 2u, 12000u, 3u, snapshot.synth_euclid.lanes[0].morph, 0.35f, 0.0f, 1.0f),
      0.0001f,
      "RNG transaction trace morph mismatch");
  requireNear(
      event->distance,
      expectedEvolvedLaneValue(snapshot, 0u, 2u, 12000u, 4u, snapshot.synth_euclid.lanes[0].distance, 0.35f, 0.0f, 1.0f),
      0.0001f,
      "RNG transaction trace distance mismatch");
  requireNear(
      event->expression,
      expectedEvolvedLaneValue(snapshot, 0u, 2u, 12000u, 5u, snapshot.synth_euclid.lanes[0].expression, 0.25f, 0.0f, 1.0f),
      0.0001f,
      "RNG transaction trace expression mismatch");
}

void requireVoicingDepth() {
  KesshoProductSnapshotV2 snapshot = makeSnapshot(41u);
  snapshot.synth_euclid.lanes[0].step_count = 7;
  snapshot.synth_euclid.lanes[0].fill_count = 7;
  snapshot.synth_euclid.lanes[0].manual_step_mask_low = 0x7fu;
  KesshoSequencerEvent events[16]{};
  const int32_t count = renderEvents(snapshot, events, 16, 36001);
  require(count >= 7, "voicing depth event count too low");
  const float expected_midi[7] = {60.0f, 62.0f, 64.0f, 65.0f, 67.0f, 69.0f, 71.0f};
  for (uint32_t index = 0; index < 7u; ++index) {
    requireNear(events[index].midi_note, expected_midi[index], 0.001f, "voicing depth scale degree mismatch");
  }
}

void requirePhraseMutationWrites() {
  KesshoProductSnapshotV2 snapshot = makeSnapshot(53u);
  snapshot.evolution.amount = 0.95f;
  snapshot.evolution.state = 8765u;
  KesshoSequencerEvent events[128]{};
  const int32_t count = renderEvents(snapshot, events, 128, 402001);
  require(count >= 68, "phrase mutation fixture event count too low");
  const KesshoSequencerEvent* first_phrase = findEvent(events, count, 0u, 0u);
  const KesshoSequencerEvent* second_phrase = findEvent(events, count, 0u, 384000u);
  require(first_phrase != nullptr && second_phrase != nullptr, "phrase boundary events missing");
  const bool phrase_changed_values =
      std::fabs(first_phrase->velocity - second_phrase->velocity) > 0.0001f ||
      std::fabs(first_phrase->morph - second_phrase->morph) > 0.0001f ||
      std::fabs(first_phrase->distance - second_phrase->distance) > 0.0001f ||
      std::fabs(first_phrase->expression - second_phrase->expression) > 0.0001f;
  require(phrase_changed_values, "phrase-indexed evolution did not write changed event values");
}

void requireJourneyMorphOwnership() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "journey ownership engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot(67u);
  snapshot.journey.enabled = 1u;
  snapshot.journey.morph_phase = 0.0f;
  snapshot.journey.morph_rate_bars = 1.0f;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "journey ownership snapshot load failed");

  float left[128]{};
  float right[128]{};
  for (uint32_t block = 0; block < 375u; ++block) {
    kessho_product_render(engine, left, right, 128);
  }
  const KesshoProductTelemetry telemetry = kessho_product_get_telemetry(engine);
  require(telemetry.journey_morph_running == 1u, "journey ownership telemetry running mismatch");
  require(telemetry.journey_morph_phase > 0.49f, "Product Core journey clock did not advance phase");
  require(telemetry.journey_morph_phase < 0.51f, "Product Core journey clock advanced phase outside expected rate");
  kessho_product_destroy(engine);
}

} // namespace

int main() {
  requireRngCallOrderIsolation();
  requireRngTransactionTrace();
  requireVoicingDepth();
  requirePhraseMutationWrites();
  requireJourneyMorphOwnership();

  std::cout << "Kessho Product Determinism tests passed\n";
  return 0;
}
