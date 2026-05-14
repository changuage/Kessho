#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iostream>

#include "KesshoCore/KesshoProductCore.h"
#include "KesshoProductParamIds.h"
#include "../src/product/KesshoProductEngineInternal.h"
#include "ProductSnapshotTestHelpers.h"

namespace {

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Kessho Product Harmony test failed: " << message << "\n";
    std::exit(1);
  }
}

void requireNear(float actual, float expected, float tolerance, const char* message) {
  require(std::fabs(actual - expected) <= tolerance, message);
}

bool midiMatchesScale(float midi, float root_midi, uint32_t scale_id) {
  int intervals[kMaxScaleNotes]{};
  const uint32_t count = scaleIntervals(scale_id, intervals);
  const uint32_t root_pitch_class = positiveModulo(roundedInt(root_midi), 12u);
  const uint32_t interval = positiveModulo(roundedInt(midi) - static_cast<int>(root_pitch_class), 12u);
  for (uint32_t i = 0; i < count; ++i) {
    if (static_cast<uint32_t>(intervals[i]) == interval) {
      return true;
    }
  }
  return false;
}

KesshoProductSnapshotV2 makeSnapshot(float root_midi, uint32_t scale_id, float tension, uint32_t seed) {
  KesshoProductSnapshotV2 snapshot{};
  snapshot.version = KESSHO_PRODUCT_SNAPSHOT_VERSION;
  snapshot.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
  snapshot.transport.running = 1;
  snapshot.transport.bpm = 120.0f;
  snapshot.transport.beats_per_bar = 4;
  snapshot.transport.bars_per_phrase = 4;
  snapshot.harmony.root_midi = root_midi;
  snapshot.harmony.scale_id = scale_id;
  snapshot.harmony.tension = tension;
  snapshot.master.gain = 1.0f;
  snapshot.rng.seed = seed;
  snapshot.rng.state = seed;

  for (uint32_t i = 0; i < 7; ++i) {
    snapshot.sources[i].enabled = 1;
    snapshot.sources[i].source_id = i + 1;
    snapshot.sources[i].level = 0.8f;
    snapshot.sources[i].dry_gain = 1.0f;
    snapshot.sources[i].expression = 0.8f;
    snapshot.sources[i].post_lpf_hz = 18000.0f;
    snapshot.sources[i].stereo_width = 1.0f;
  }

  snapshot.synth_euclid.lane_count = 1;
  snapshot.synth_euclid.lanes[0].enabled = 1;
  snapshot.synth_euclid.lanes[0].target_source_id = KESSHO_PRODUCT_SOURCE_PAD1;
  snapshot.synth_euclid.lanes[0].step_count = 16;
  snapshot.synth_euclid.lanes[0].fill_count = 16;
  snapshot.synth_euclid.lanes[0].clock_division = 16;
  snapshot.synth_euclid.lanes[0].probability = 1.0f;
  snapshot.synth_euclid.lanes[0].ratchet = 1;
  snapshot.synth_euclid.lanes[0].midi_note = root_midi;
  snapshot.synth_euclid.lanes[0].velocity = 0.8f;
  snapshot.synth_euclid.lanes[0].hold_seconds = 0.1f;
  snapshot.synth_euclid.lanes[0].expression = 0.8f;
  snapshot.synth_euclid.lanes[0].seed = seed + 10u;
  snapshot.drum_euclid.lane_count = 0;
  kessho::product::tests::applyGeneratedSourceDefaults(snapshot);
  return snapshot;
}

int32_t renderEvents(const KesshoProductSnapshotV2& snapshot, KesshoSequencerEvent* events, uint32_t max_events) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "engine create failed");
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "snapshot load failed");
  const int32_t count = kessho_product_debug_render_events(engine, events, max_events, 18001);
  kessho_product_destroy(engine);
  return count;
}

void requireDirectMusicCoverage() {
  KesshoProductEngine direct(48000.0, 128, 0);
  direct.transport.running = true;
  direct.transport.bpm = 120.0f;
  direct.transport.beats_per_bar = 4u;
  direct.transport.bars_per_phrase = 4u;
  direct.harmony.root_midi = 60.0f;
  direct.harmony.scale_id = 1u;
  direct.harmony.tension = 0.3f;
  direct.rng_seed = 17u;

  LaneState lane{};
  lane.enabled = true;
  lane.target_source_id = KESSHO_PRODUCT_SOURCE_PAD1;
  lane.midi_note = 60.0f;
  lane.seed = 23u;

  direct.updateHarmonyTelemetry(0u);
  requireNear(direct.harmony.chord_midi[0], 60.0f, 0.001f, "direct harmony telemetry root mismatch");
  requireNear(direct.harmony.chord_midi[1], 64.0f, 0.001f, "direct harmony telemetry third mismatch");
  const float major_midi = direct.resolveHarmonyMidi(lane, 0u, 2u, 0u);
  require(major_midi >= 54.0f && major_midi <= 66.0f, "direct major voicing fell outside lane range");
  require(midiMatchesScale(major_midi, direct.harmony.root_midi, direct.harmony.scale_id), "direct major voicing left selected scale");

  direct.harmony.scale_id = 2u;
  const float minor_midi = direct.resolveHarmonyMidi(lane, 0u, 2u, 0u);
  require(minor_midi >= 54.0f && minor_midi <= 66.0f, "direct minor voicing fell outside lane range");
  require(midiMatchesScale(minor_midi, direct.harmony.root_midi, direct.harmony.scale_id), "direct minor voicing left selected scale");

  const uint32_t rng_a = hashU32(1234u);
  const uint32_t rng_b = hashU32(1234u);
  require(rng_a == rng_b, "direct deterministic RNG hash mismatch");
  require(hashUnit(1234u) >= 0.0f && hashUnit(1234u) < 1.0f, "direct RNG unit hash out of range");

  direct.evolution_amount = 1.0f;
  direct.evolution_state = 99u;
  const float evolved = direct.evolvedLaneValue(lane, 1u, 3u, 0u, 2u, 0.5f, 0.5f, 0.0f, 1.0f);
  require(evolved >= 0.0f && evolved <= 1.0f, "direct evolution value out of range");
  require(std::fabs(evolved - 0.5f) > 0.0001f, "direct evolution should alter lane value");

  direct.journey_running = true;
  direct.journey_phase = 0.1f;
  direct.journey_rate_bars = 1.0f;
  direct.advanceJourney(48000u);
  require(direct.journey_phase > 0.1f, "direct journey clock did not advance");
}

} // namespace

int main() {
  requireDirectMusicCoverage();

  KesshoSequencerEvent major_events[16]{};
  int32_t count = renderEvents(makeSnapshot(60.0f, 1, 0.3f, 1), major_events, 16);
  require(count >= 3, "major scale event count too low");
  requireNear(major_events[0].midi_note, 60.0f, 0.001f, "major root event mismatch");
  requireNear(major_events[2].midi_note, 64.0f, 0.001f, "major third event mismatch");

  KesshoSequencerEvent minor_events[16]{};
  count = renderEvents(makeSnapshot(60.0f, 2, 0.3f, 1), minor_events, 16);
  require(count >= 3, "minor scale event count too low");
  requireNear(minor_events[2].midi_note, 63.0f, 0.001f, "minor third event mismatch");

  KesshoSequencerEvent transposed_events[16]{};
  count = renderEvents(makeSnapshot(62.0f, 1, 0.3f, 1), transposed_events, 16);
  require(count >= 1, "transposed event count too low");
  requireNear(transposed_events[0].midi_note, 62.0f, 0.001f, "root transpose mismatch");

  KesshoSequencerEvent seeded_a[16]{};
  KesshoSequencerEvent seeded_b[16]{};
  const KesshoProductSnapshotV2 seeded_snapshot = makeSnapshot(60.0f, 1, 0.9f, 19);
  const int32_t seeded_count_a = renderEvents(seeded_snapshot, seeded_a, 16);
  const int32_t seeded_count_b = renderEvents(seeded_snapshot, seeded_b, 16);
  require(seeded_count_a == seeded_count_b, "same seed event count mismatch");
  for (int32_t i = 0; i < seeded_count_a; ++i) {
    requireNear(seeded_a[i].midi_note, seeded_b[i].midi_note, 0.001f, "same seed harmony event mismatch");
  }

  bool found_different_seed = false;
  for (uint32_t seed = 20; seed < 80; ++seed) {
    KesshoSequencerEvent candidate[16]{};
    const int32_t candidate_count = renderEvents(makeSnapshot(60.0f, 1, 0.9f, seed), candidate, 16);
    if (candidate_count > 0 && std::fabs(candidate[0].midi_note - seeded_a[0].midi_note) > 0.001f) {
      found_different_seed = true;
      break;
    }
  }
  require(found_different_seed, "high-tension harmony should be seed-sensitive");

  KesshoProductSnapshotV2 stable_snapshot = makeSnapshot(60.0f, 1, 0.3f, 29);
  stable_snapshot.synth_euclid.lanes[0].morph = 0.5f;
  stable_snapshot.synth_euclid.lanes[0].distance = 0.5f;
  stable_snapshot.evolution.amount = 0.85f;
  stable_snapshot.evolution.state = 1234u;
  KesshoSequencerEvent evolved_a[16]{};
  KesshoSequencerEvent evolved_b[16]{};
  const int32_t evolved_count_a = renderEvents(stable_snapshot, evolved_a, 16);
  const int32_t evolved_count_b = renderEvents(stable_snapshot, evolved_b, 16);
  require(evolved_count_a > 0, "evolved event count too low");
  require(evolved_count_a == evolved_count_b, "same evolution state event count mismatch");
  for (int32_t i = 0; i < evolved_count_a; ++i) {
    requireNear(evolved_a[i].velocity, evolved_b[i].velocity, 0.0001f, "same evolution velocity mismatch");
    requireNear(evolved_a[i].morph, evolved_b[i].morph, 0.0001f, "same evolution morph mismatch");
    requireNear(evolved_a[i].distance, evolved_b[i].distance, 0.0001f, "same evolution distance mismatch");
    requireNear(evolved_a[i].expression, evolved_b[i].expression, 0.0001f, "same evolution expression mismatch");
  }

  KesshoProductSnapshotV2 base_snapshot = stable_snapshot;
  base_snapshot.evolution.amount = 0.0f;
  KesshoSequencerEvent base_evolved_compare[16]{};
  const int32_t base_evolved_count = renderEvents(base_snapshot, base_evolved_compare, 16);
  require(base_evolved_count == evolved_count_a, "evolution should not drop full-probability events");
  bool evolution_changed_values = false;
  for (int32_t i = 0; i < evolved_count_a; ++i) {
    if (
        std::fabs(base_evolved_compare[i].velocity - evolved_a[i].velocity) > 0.0001f ||
        std::fabs(base_evolved_compare[i].morph - evolved_a[i].morph) > 0.0001f ||
        std::fabs(base_evolved_compare[i].distance - evolved_a[i].distance) > 0.0001f ||
        std::fabs(base_evolved_compare[i].expression - evolved_a[i].expression) > 0.0001f) {
      evolution_changed_values = true;
      break;
    }
  }
  require(evolution_changed_values, "C++ evolution should alter generated sequencer event values");

  KesshoProductEngine* param_engine = kessho_product_create(48000.0, 128, 0);
  require(param_engine != nullptr, "evolution param engine create failed");
  require(kessho_product_load_snapshot_v2(param_engine, &base_snapshot, sizeof(base_snapshot)) == KESSHO_PRODUCT_OK, "evolution param snapshot load failed");
  KesshoProductEvent evolution_amount_event{};
  evolution_amount_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
  evolution_amount_event.param_id = KESSHO_PRODUCT_PARAM_EVOLUTION_AMOUNT_ID;
  evolution_amount_event.value = 0.85f;
  require(kessho_product_enqueue_event(param_engine, &evolution_amount_event) == KESSHO_PRODUCT_OK, "evolution amount param enqueue failed");
  KesshoProductEvent evolution_state_event{};
  evolution_state_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
  evolution_state_event.param_id = KESSHO_PRODUCT_PARAM_EVOLUTION_STATE_ID;
  evolution_state_event.value = 1234.0f;
  require(kessho_product_enqueue_event(param_engine, &evolution_state_event) == KESSHO_PRODUCT_OK, "evolution state param enqueue failed");
  KesshoSequencerEvent param_evolved[16]{};
  const int32_t param_evolved_count = kessho_product_debug_render_events(param_engine, param_evolved, 16, 18001);
  require(param_evolved_count == evolved_count_a, "evolution param event count mismatch");
  for (int32_t i = 0; i < param_evolved_count; ++i) {
    requireNear(param_evolved[i].velocity, evolved_a[i].velocity, 0.0001f, "evolution amount/state param velocity mismatch");
    requireNear(param_evolved[i].morph, evolved_a[i].morph, 0.0001f, "evolution amount/state param morph mismatch");
  }
  kessho_product_destroy(param_engine);

  KesshoProductSnapshotV2 journey_snapshot = base_snapshot;
  journey_snapshot.journey.enabled = 1u;
  journey_snapshot.journey.morph_phase = 0.25f;
  KesshoSequencerEvent journey_events[16]{};
  const int32_t journey_count = renderEvents(journey_snapshot, journey_events, 16);
  require(journey_count == base_evolved_count, "journey should not drop full-probability events");
  bool journey_changed_values = false;
  for (int32_t i = 0; i < journey_count; ++i) {
    if (
        std::fabs(base_evolved_compare[i].velocity - journey_events[i].velocity) > 0.0001f ||
        std::fabs(base_evolved_compare[i].morph - journey_events[i].morph) > 0.0001f ||
        std::fabs(base_evolved_compare[i].distance - journey_events[i].distance) > 0.0001f ||
        std::fabs(base_evolved_compare[i].expression - journey_events[i].expression) > 0.0001f) {
      journey_changed_values = true;
      break;
    }
  }
  require(journey_changed_values, "journey morph clock should alter generated sequencer event values");

  KesshoProductEngine* journey_event_engine = kessho_product_create(48000.0, 128, 0);
  require(journey_event_engine != nullptr, "journey event engine create failed");
  require(
      kessho_product_load_snapshot_v2(journey_event_engine, &base_snapshot, sizeof(base_snapshot)) == KESSHO_PRODUCT_OK,
      "journey event snapshot load failed");
  KesshoProductEvent journey_state_event{};
  journey_state_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_JOURNEY_STATE;
  journey_state_event.value = 1.0f;
  journey_state_event.value2 = 0.25f;
  journey_state_event.value3 = 2.0f;
  require(kessho_product_enqueue_event(journey_event_engine, &journey_state_event) == KESSHO_PRODUCT_OK, "journey state event enqueue failed");
  KesshoSequencerEvent journey_event_values[16]{};
  const int32_t journey_event_count = kessho_product_debug_render_events(journey_event_engine, journey_event_values, 16, 18001);
  require(journey_event_count == journey_count, "journey state event count mismatch");
  bool journey_event_changed_values = false;
  for (int32_t i = 0; i < journey_event_count; ++i) {
    if (
        std::fabs(base_evolved_compare[i].velocity - journey_event_values[i].velocity) > 0.0001f ||
        std::fabs(base_evolved_compare[i].morph - journey_event_values[i].morph) > 0.0001f ||
        std::fabs(base_evolved_compare[i].distance - journey_event_values[i].distance) > 0.0001f ||
        std::fabs(base_evolved_compare[i].expression - journey_event_values[i].expression) > 0.0001f) {
      journey_event_changed_values = true;
      break;
    }
  }
  require(journey_event_changed_values, "journey state event should alter generated sequencer event values");
  KesshoProductTelemetry journey_event_telemetry = kessho_product_get_telemetry(journey_event_engine);
  require(journey_event_telemetry.journey_morph_running == 1u, "journey state event telemetry running mismatch");
  requireNear(journey_event_telemetry.journey_morph_phase, 0.25f, 0.001f, "journey state event telemetry phase mismatch");
  kessho_product_destroy(journey_event_engine);

  KesshoProductEngine* journey_param_engine = kessho_product_create(48000.0, 128, 0);
  require(journey_param_engine != nullptr, "journey param engine create failed");
  require(
      kessho_product_load_snapshot_v2(journey_param_engine, &base_snapshot, sizeof(base_snapshot)) == KESSHO_PRODUCT_OK,
      "journey param snapshot load failed");
  KesshoProductEvent journey_enabled_param{};
  journey_enabled_param.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
  journey_enabled_param.param_id = KESSHO_PRODUCT_PARAM_JOURNEY_ENABLED_ID;
  journey_enabled_param.value = 1.0f;
  require(kessho_product_enqueue_event(journey_param_engine, &journey_enabled_param) == KESSHO_PRODUCT_OK, "journey enabled param enqueue failed");
  KesshoProductEvent journey_phase_param{};
  journey_phase_param.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
  journey_phase_param.param_id = KESSHO_PRODUCT_PARAM_JOURNEY_MORPH_PHASE_ID;
  journey_phase_param.value = 0.25f;
  require(kessho_product_enqueue_event(journey_param_engine, &journey_phase_param) == KESSHO_PRODUCT_OK, "journey phase param enqueue failed");
  KesshoSequencerEvent journey_param_values[16]{};
  const int32_t journey_param_count = kessho_product_debug_render_events(journey_param_engine, journey_param_values, 16, 18001);
  require(journey_param_count == journey_count, "journey param event count mismatch");
  KesshoProductTelemetry journey_param_telemetry = kessho_product_get_telemetry(journey_param_engine);
  require(journey_param_telemetry.journey_morph_running == 1u, "journey param telemetry running mismatch");
  requireNear(journey_param_telemetry.journey_morph_phase, 0.25f, 0.001f, "journey param telemetry phase mismatch");
  kessho_product_destroy(journey_param_engine);

  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "telemetry engine create failed");
  KesshoProductSnapshotV2 snapshot = makeSnapshot(65.0f, 3, 0.8f, 42);
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "telemetry snapshot load failed");
  float left[128]{};
  float right[128]{};
  kessho_product_render(engine, left, right, 128);
  KesshoProductTelemetry telemetry = kessho_product_get_telemetry(engine);
  requireNear(telemetry.harmony_root_midi, 65.0f, 0.001f, "telemetry root mismatch");
  require(telemetry.harmony_scale_id == 3, "telemetry scale mismatch");
  require(telemetry.harmony_chord_midi[0] >= 65.0f, "telemetry chord should be populated");
  kessho_product_destroy(engine);

  std::cout << "Kessho Product Harmony tests passed\n";
  return 0;
}
