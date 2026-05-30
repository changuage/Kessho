#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <initializer_list>
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

void requireScaleIntervals(uint32_t scale_id, std::initializer_list<int> expected, const char* message) {
  int intervals[kMaxScaleNotes]{};
  const uint32_t count = scaleIntervals(scale_id, intervals);
  require(count == expected.size(), message);
  uint32_t index = 0u;
  for (const int interval : expected) {
    require(index < kMaxScaleNotes && intervals[index] == interval, message);
    ++index;
  }
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

int32_t renderEventsAfterParam(
    const KesshoProductSnapshotV2& snapshot,
    uint32_t param_id,
    float value,
    KesshoSequencerEvent* events,
    uint32_t max_events,
    KesshoProductTelemetry* telemetry = nullptr) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "param engine create failed");
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "param snapshot load failed");
  KesshoProductEvent event{};
  event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
  event.param_id = param_id;
  event.value = value;
  require(kessho_product_enqueue_event(engine, &event) == KESSHO_PRODUCT_OK, "harmony param enqueue failed");
  const int32_t count = kessho_product_debug_render_events(engine, events, max_events, 18001);
  if (telemetry) {
    *telemetry = kessho_product_get_telemetry(engine);
  }
  kessho_product_destroy(engine);
  return count;
}

int32_t renderEventsAfterSynthPitchOverride(
    const KesshoProductSnapshotV2& snapshot,
    uint32_t param_id,
    float value,
    KesshoSequencerEvent* events,
    uint32_t max_events) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, 0);
  require(engine != nullptr, "explicit pitch engine create failed");
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "explicit pitch snapshot load failed");
  KesshoProductEvent pitch_event{};
  pitch_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SEQUENCER_STEP;
  pitch_event.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
  pitch_event.index = 0;
  pitch_event.param_id = 0;
  pitch_event.value = 71.0f;
  pitch_event.flags = KESSHO_PRODUCT_STEP_TOGGLE_ACTIVE | KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE;
  require(kessho_product_enqueue_event(engine, &pitch_event) == KESSHO_PRODUCT_OK, "explicit pitch step enqueue failed");
  if (param_id != 0u) {
    KesshoProductEvent param_event{};
    param_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
    param_event.param_id = param_id;
    param_event.value = value;
    require(kessho_product_enqueue_event(engine, &param_event) == KESSHO_PRODUCT_OK, "explicit pitch harmony param enqueue failed");
  }
  const int32_t count = kessho_product_debug_render_events(engine, events, max_events, 18001);
  kessho_product_destroy(engine);
  return count;
}

void requireDirectMusicCoverage() {
  requireScaleIntervals(1u, {0, 2, 4, 5, 7, 9, 11}, "major scale interval mismatch");
  requireScaleIntervals(2u, {0, 2, 3, 5, 7, 8, 10}, "aeolian scale interval mismatch");
  requireScaleIntervals(3u, {0, 2, 4, 7, 9}, "major pentatonic scale interval mismatch");
  requireScaleIntervals(4u, {0, 1, 3, 4, 6, 7, 9, 10}, "octatonic scale interval mismatch");
  requireScaleIntervals(5u, {0, 2, 4, 6, 7, 9, 11}, "lydian scale interval mismatch");
  requireScaleIntervals(6u, {0, 2, 4, 5, 7, 9, 10}, "mixolydian scale interval mismatch");
  requireScaleIntervals(7u, {0, 3, 5, 7, 10}, "minor pentatonic scale interval mismatch");
  requireScaleIntervals(8u, {0, 2, 3, 5, 7, 9, 10}, "dorian scale interval mismatch");
  requireScaleIntervals(9u, {0, 2, 3, 5, 7, 8, 11}, "harmonic minor scale interval mismatch");
  requireScaleIntervals(10u, {0, 2, 3, 5, 7, 9, 11}, "melodic minor scale interval mismatch");
  requireScaleIntervals(11u, {0, 1, 4, 5, 7, 8, 10}, "phrygian dominant scale interval mismatch");

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

  KesshoSequencerEvent lydian_events[16]{};
  count = renderEvents(makeSnapshot(60.0f, 5, 0.3f, 1), lydian_events, 16);
  require(count >= 4, "lydian event count too low");
  requireNear(lydian_events[3].midi_note, 66.0f, 0.001f, "lydian raised fourth event mismatch");

  KesshoSequencerEvent phrygian_events[16]{};
  count = renderEvents(makeSnapshot(60.0f, 11, 0.3f, 1), phrygian_events, 16);
  require(count >= 2, "phrygian dominant event count too low");
  requireNear(phrygian_events[1].midi_note, 61.0f, 0.001f, "phrygian dominant flat second event mismatch");

  KesshoProductSnapshotV2 explicit_pitch_snapshot = makeSnapshot(60.0f, 1, 0.3f, 1);
  KesshoSequencerEvent explicit_pitch_events[16]{};
  count = renderEventsAfterSynthPitchOverride(explicit_pitch_snapshot, 0u, 0.0f, explicit_pitch_events, 16);
  require(count >= 1, "explicit pitch override event count too low");
  requireNear(explicit_pitch_events[0].midi_note, 71.0f, 0.001f, "explicit sequencer pitch override should bypass harmony voicing");
  KesshoSequencerEvent explicit_pitch_root_events[16]{};
  count = renderEventsAfterSynthPitchOverride(
      explicit_pitch_snapshot,
      KESSHO_PRODUCT_PARAM_HARMONY_ROOT_MIDI_ID,
      67.0f,
      explicit_pitch_root_events,
      16);
  require(count >= 1, "explicit pitch runtime root event count too low");
  requireNear(explicit_pitch_root_events[0].midi_note, 71.0f, 0.001f, "explicit sequencer pitch override should survive runtime harmony root changes");
  KesshoSequencerEvent explicit_pitch_scale_events[16]{};
  count = renderEventsAfterSynthPitchOverride(
      explicit_pitch_snapshot,
      KESSHO_PRODUCT_PARAM_HARMONY_SCALE_ID_ID,
      11.0f,
      explicit_pitch_scale_events,
      16);
  require(count >= 1, "explicit pitch runtime scale event count too low");
  requireNear(explicit_pitch_scale_events[0].midi_note, 71.0f, 0.001f, "explicit sequencer pitch override should survive runtime harmony scale changes");

  KesshoProductTelemetry root_param_telemetry{};
  KesshoSequencerEvent root_param_events[16]{};
  count = renderEventsAfterParam(
      makeSnapshot(60.0f, 1, 0.3f, 1),
      KESSHO_PRODUCT_PARAM_HARMONY_ROOT_MIDI_ID,
      62.0f,
      root_param_events,
      16,
      &root_param_telemetry);
  require(count >= 1, "runtime harmony root param event count too low");
  requireNear(root_param_events[0].midi_note, 62.0f, 0.001f, "runtime harmony root param did not transpose sequencer event");
  requireNear(root_param_telemetry.harmony_root_midi, 62.0f, 0.001f, "runtime harmony root param telemetry mismatch");

  KesshoProductTelemetry scale_param_telemetry{};
  KesshoSequencerEvent scale_param_events[16]{};
  count = renderEventsAfterParam(
      makeSnapshot(60.0f, 1, 0.3f, 1),
      KESSHO_PRODUCT_PARAM_HARMONY_SCALE_ID_ID,
      2.0f,
      scale_param_events,
      16,
      &scale_param_telemetry);
  require(count >= 3, "runtime harmony scale param event count too low");
  requireNear(scale_param_events[2].midi_note, 63.0f, 0.001f, "runtime harmony scale param did not minorize sequencer event");
  require(scale_param_telemetry.harmony_scale_id == 2u, "runtime harmony scale param telemetry mismatch");

  bool tension_param_changed_notes = false;
  for (uint32_t seed = 1u; seed < 96u && !tension_param_changed_notes; ++seed) {
    KesshoProductSnapshotV2 low_tension_snapshot = makeSnapshot(60.0f, 1, 0.0f, seed);
    low_tension_snapshot.harmony.voicing_mode = 1u;
    KesshoSequencerEvent low_tension_events[16]{};
    KesshoSequencerEvent high_tension_events[16]{};
    const int32_t low_tension_count = renderEvents(low_tension_snapshot, low_tension_events, 16);
    KesshoProductTelemetry tension_param_telemetry{};
    const int32_t high_tension_count = renderEventsAfterParam(
        low_tension_snapshot,
        KESSHO_PRODUCT_PARAM_HARMONY_TENSION_ID,
        0.95f,
        high_tension_events,
        16,
        &tension_param_telemetry);
    requireNear(tension_param_telemetry.harmony_tension, 0.95f, 0.001f, "runtime harmony tension param telemetry mismatch");
    const int32_t compare_count = std::min(low_tension_count, high_tension_count);
    for (int32_t i = 0; i < compare_count; ++i) {
      if (std::fabs(low_tension_events[i].midi_note - high_tension_events[i].midi_note) > 0.001f) {
        tension_param_changed_notes = true;
        break;
      }
    }
  }
  require(tension_param_changed_notes, "runtime harmony tension param should alter generated sequencer notes");

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

  KesshoProductSnapshotV2 pool_snapshot = makeSnapshot(60.0f, 1, 0.3f, 77);
  pool_snapshot.harmony.active_source = 3u;
  pool_snapshot.harmony.control_mode = 2u;
  pool_snapshot.harmony.control_strength = 1u;
  pool_snapshot.harmony.manual_control_available = 1u;
  pool_snapshot.harmony.note_pool_count = 4u;
  pool_snapshot.harmony.note_pool_midi[0] = 60.0f;
  pool_snapshot.harmony.note_pool_midi[1] = 63.0f;
  pool_snapshot.harmony.note_pool_midi[2] = 67.0f;
  pool_snapshot.harmony.note_pool_midi[3] = 70.0f;
  KesshoSequencerEvent pool_events[16]{};
  count = renderEvents(pool_snapshot, pool_events, 16);
  require(count >= 1, "manual harmony pool event count too low");
  bool pool_event_in_manual_pool = false;
  for (float note : {60.0f, 63.0f, 67.0f, 70.0f}) {
    if (std::fabs(pool_events[0].midi_note - note) <= 0.001f) {
      pool_event_in_manual_pool = true;
    }
  }
  require(pool_event_in_manual_pool, "manual harmony pool should feed sequencer voicing");

  KesshoProductEngine* manual_engine = kessho_product_create(48000.0, 128, 0);
  require(manual_engine != nullptr, "manual harmony engine create failed");
  KesshoProductSnapshotV2 manual_snapshot = makeSnapshot(60.0f, 1, 0.3f, 81);
  manual_snapshot.journey.enabled = 1u;
  manual_snapshot.journey.morph_phase = 0.4f;
  require(kessho_product_load_snapshot_v2(manual_engine, &manual_snapshot, sizeof(manual_snapshot)) == KESSHO_PRODUCT_OK, "manual harmony snapshot load failed");
  KesshoProductEvent manual_intent_event{};
  manual_intent_event.event_kind = KESSHO_PRODUCT_EVENT_HARMONY_CONTROL_SET_MANUAL_INTENT_ID;
  manual_intent_event.value = 3.0f;
  manual_intent_event.value2 = 6.0f;
  manual_intent_event.value3 = 0.0f;
  manual_intent_event.value4 = 1.0f;
  require(kessho_product_enqueue_event(manual_engine, &manual_intent_event) == KESSHO_PRODUCT_OK, "manual harmony intent enqueue failed");
  KesshoSequencerEvent locked_manual_events[16]{};
  count = kessho_product_debug_render_events(manual_engine, locked_manual_events, 16, 18001);
  KesshoProductTelemetry locked_manual_telemetry = kessho_product_get_telemetry(manual_engine);
  require(count >= 1, "locked manual harmony event count too low");
  requireNear(locked_manual_events[0].midi_note, 60.0f, 0.001f, "manual harmony intent should be ignored during morph");
  require(locked_manual_telemetry.harmony_chord_degree == 0u, "manual harmony should stay baseline during morph");
  kessho_product_destroy(manual_engine);

  KesshoProductEngine* endpoint_manual_engine = kessho_product_create(48000.0, 128, 0);
  require(endpoint_manual_engine != nullptr, "endpoint manual harmony engine create failed");
  KesshoProductSnapshotV2 endpoint_manual_snapshot = makeSnapshot(60.0f, 1, 0.3f, 82);
  require(kessho_product_load_snapshot_v2(endpoint_manual_engine, &endpoint_manual_snapshot, sizeof(endpoint_manual_snapshot)) == KESSHO_PRODUCT_OK, "endpoint manual harmony snapshot load failed");
  require(kessho_product_enqueue_event(endpoint_manual_engine, &manual_intent_event) == KESSHO_PRODUCT_OK, "endpoint manual harmony intent enqueue failed");
  KesshoSequencerEvent endpoint_manual_events[16]{};
  count = kessho_product_debug_render_events(endpoint_manual_engine, endpoint_manual_events, 16, 18001);
  require(count >= 1, "endpoint manual harmony event count too low");
  bool endpoint_event_in_manual_pool = false;
  for (float note : {65.0f, 68.0f, 72.0f, 75.0f}) {
    if (std::fabs(endpoint_manual_events[0].midi_note - note) <= 0.001f) {
      endpoint_event_in_manual_pool = true;
    }
  }
  require(endpoint_event_in_manual_pool, "manual harmony intent should control pool at morph endpoint");
  kessho_product_destroy(endpoint_manual_engine);

  std::cout << "Kessho Product Harmony tests passed\n";
  return 0;
}
