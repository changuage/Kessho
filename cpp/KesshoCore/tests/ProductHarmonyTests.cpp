#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <initializer_list>
#include <iostream>
#include <memory>
#include <vector>

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
  snapshot.arrangement.rng_state = seed;
  snapshot.arrangement.synth_voice_mask = 63u;
  snapshot.arrangement.wave_spread = 0.0f;
  snapshot.arrangement.lead_chord_bias = 0.78f;

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

__attribute__((noinline)) void requireDirectMusicCoverage() {
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

  auto direct_storage = std::make_unique<KesshoProductEngine>(48000.0, 128, 0);
  KesshoProductEngine& direct = *direct_storage;
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

__attribute__((noinline)) void requireArrangementScheduling() {
  auto arrangement_snapshot = std::make_unique<KesshoProductSnapshotV2>(
      makeSnapshot(60.0f, 1u, 0.4f, 404u));
  arrangement_snapshot->synth_euclid.lane_count = 0u;
  arrangement_snapshot->arrangement.chord_generator_enabled = 1u;
  arrangement_snapshot->arrangement.chord_generator_source_id = KESSHO_PRODUCT_SOURCE_PAD1;
  arrangement_snapshot->arrangement.chord_generator_voice_count = 3u;
  KesshoSequencerEvent arrangement_events[32]{};
  const int32_t count = renderEvents(*arrangement_snapshot, arrangement_events, 32u);
  require(count == 3, "Product arrangement chord generator event count mismatch");
  for (int32_t index = 0; index < count; ++index) {
    require(arrangement_events[index].source_id == KESSHO_PRODUCT_SOURCE_PAD1,
        "Product arrangement chord generator source mismatch");
    require(arrangement_events[index].sample_offset == 0u,
        "Product arrangement chord generator offset mismatch");
  }

  auto lead_snapshot = std::make_unique<KesshoProductSnapshotV2>(
      makeSnapshot(60.0f, 1u, 0.4f, 505u));
  lead_snapshot->synth_euclid.lane_count = 0u;
  lead_snapshot->arrangement.lead_random_enabled = 1u;
  lead_snapshot->arrangement.lead_random_source_id = KESSHO_PRODUCT_SOURCE_LEAD1;
  lead_snapshot->arrangement.lead_phrase_seconds = 0.25f;
  lead_snapshot->arrangement.lead_density = 0.5f;
  lead_snapshot->arrangement.lead_octave = 0;
  lead_snapshot->arrangement.lead_octave_range = 2u;
  lead_snapshot->arrangement.lead_hold_seconds = 0.4f;
  lead_snapshot->arrangement.lead_velocity_min = 0.5f;
  lead_snapshot->arrangement.lead_velocity_max = 0.9f;
  KesshoSequencerEvent lead_events_a[32]{};
  KesshoSequencerEvent lead_events_b[32]{};
  const int32_t lead_count_a = renderEvents(*lead_snapshot, lead_events_a, 32u);
  const int32_t lead_count_b = renderEvents(*lead_snapshot, lead_events_b, 32u);
  require(lead_count_a > 0 && lead_count_a == lead_count_b, "Product random lead deterministic count mismatch");
  for (int32_t index = 0; index < lead_count_a; ++index) {
    require(lead_events_a[index].source_id == KESSHO_PRODUCT_SOURCE_LEAD1,
        "Product random lead source mismatch");
    require(lead_events_a[index].sample_offset == lead_events_b[index].sample_offset,
        "Product random lead offset mismatch");
    requireNear(lead_events_a[index].midi_note, lead_events_b[index].midi_note, 0.000001f,
        "Product random lead MIDI mismatch");
    requireNear(lead_events_a[index].velocity, lead_events_b[index].velocity, 0.000001f,
        "Product random lead velocity mismatch");
  }

  auto rng_chord_snapshot = std::make_unique<KesshoProductSnapshotV2>(
      makeSnapshot(60.0f, 1u, 0.4f, 707u));
  rng_chord_snapshot->synth_euclid.lane_count = 0u;
  rng_chord_snapshot->harmony.note_pool_count = 4u;
  rng_chord_snapshot->harmony.note_pool_midi[0] = 60.0f;
  rng_chord_snapshot->harmony.note_pool_midi[1] = 64.0f;
  rng_chord_snapshot->harmony.note_pool_midi[2] = 67.0f;
  rng_chord_snapshot->harmony.note_pool_midi[3] = 72.0f;
  rng_chord_snapshot->harmony.phrase_length_seconds = 16.0f;
  rng_chord_snapshot->harmony.chord_interval_seconds = 8.0f;
  rng_chord_snapshot->arrangement.chord_generator_enabled = 1u;
  rng_chord_snapshot->arrangement.chord_generator_source_id = KESSHO_PRODUCT_SOURCE_PAD1;
  rng_chord_snapshot->arrangement.chord_generator_voice_count = 3u;
  rng_chord_snapshot->arrangement.rng_state = 123456u;
  rng_chord_snapshot->arrangement.wave_spread = 0.125f;
  KesshoProductEngine* rng_chord_engine = kessho_product_create(48000.0, 128u, 0u);
  require(rng_chord_engine != nullptr, "arrangement RNG chord engine create failed");
  require(kessho_product_load_snapshot_v2(
      rng_chord_engine, rng_chord_snapshot.get(), sizeof(*rng_chord_snapshot)) == KESSHO_PRODUCT_OK,
      "arrangement RNG chord snapshot load failed");
  require(kessho_product_set_simple_sequencer_visual_demand(
      rng_chord_engine, KESSHO_PRODUCT_SIMPLE_SEQUENCER_VISUAL_CHORD) == KESSHO_PRODUCT_OK,
      "arrangement chord visual demand failed");
  SequencerBuffer early_chord_events{};
  rng_chord_engine->generateArrangementEvents(128u, early_chord_events);
  require(early_chord_events.count == 0u,
      "future arrangement chord notes should not emit before their trigger block");
  KesshoProductSimpleSequencerVisualEvent early_chord_visual_events[8]{};
  uint32_t early_chord_visual_overflow = 0u;
  const uint32_t early_chord_visual_count = kessho_product_drain_simple_sequencer_visual_events(
      rng_chord_engine, early_chord_visual_events, 8u, &early_chord_visual_overflow);
  require(early_chord_visual_count == 3u && early_chord_visual_overflow == 0u,
      "the complete chord plan must be visible before any future note triggers");
  for (uint32_t index = 0u; index < early_chord_visual_count; ++index) {
    require(early_chord_visual_events[index].absolute_sample >= 128u,
        "predictive chord telemetry must describe a future trigger");
  }
  SequencerBuffer rng_chord_events{};
  rng_chord_engine->generateArrangementEvents(48000u, rng_chord_events);
  rng_chord_events.sortByOffset();
  require(rng_chord_events.count == 3u, "TypeScript parity chord event count mismatch");
  require(rng_chord_events.events[0].sample_offset == 7681u &&
      rng_chord_events.events[1].sample_offset == 10011u &&
      rng_chord_events.events[2].sample_offset == 11176u,
      "TypeScript parity chord sample offsets mismatch");
  require(rng_chord_engine->arrangement.rng_state == 1767748072u,
      "TypeScript parity chord RNG state mismatch");
  KesshoProductSimpleSequencerVisualEvent chord_visual_events[8]{};
  uint32_t chord_visual_overflow = 0u;
  const uint32_t chord_visual_count = kessho_product_drain_simple_sequencer_visual_events(
      rng_chord_engine, chord_visual_events, 8u, &chord_visual_overflow);
  require(chord_visual_count == 0u && chord_visual_overflow == 0u,
      "triggering a queued chord must not republish or mutate its visual plan");
  std::sort(early_chord_visual_events, early_chord_visual_events + early_chord_visual_count,
      [](const auto& left, const auto& right) { return left.absolute_sample < right.absolute_sample; });
  for (uint32_t index = 0u; index < early_chord_visual_count; ++index) {
    require(early_chord_visual_events[index].kind == KESSHO_PRODUCT_SIMPLE_SEQUENCER_VISUAL_CHORD,
        "arrangement chord visual kind mismatch");
    requireNear(early_chord_visual_events[index].midi_note, rng_chord_events.events[index].midi_note, 0.000001f,
        "arrangement chord visual MIDI must match the scheduled event");
    require(early_chord_visual_events[index].absolute_sample == rng_chord_events.events[index].sample_offset,
        "arrangement chord visual sample must match the scheduled event");
  }
  rng_chord_engine->transport.sample_frame = 384000u;
  rng_chord_engine->advanceHarmonyClock();
  require(!rng_chord_engine->arrangement.chord_generator_pending,
      "an internal harmony tick must not rebuild the chord generator mid-phrase");
  const float current_phrase_voicing_spread = rng_chord_engine->harmony.voicing_spread;
  const float current_phrase_wave_spread = rng_chord_engine->arrangement.wave_spread;
  KesshoProductEvent octave_event{};
  octave_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
  octave_event.param_id = KESSHO_PRODUCT_PARAM_ARRANGEMENT_SYNTH_OCTAVE_ID;
  octave_event.value = 1.0f;
  rng_chord_engine->applyParam(octave_event);
  KesshoProductEvent voicing_spread_event{};
  voicing_spread_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
  voicing_spread_event.param_id = KESSHO_PRODUCT_PARAM_HARMONY_VOICING_SPREAD_ID;
  voicing_spread_event.value = 1.0f;
  rng_chord_engine->applyParam(voicing_spread_event);
  KesshoProductEvent wave_spread_event{};
  wave_spread_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
  wave_spread_event.param_id = KESSHO_PRODUCT_PARAM_ARRANGEMENT_WAVE_SPREAD_ID;
  wave_spread_event.value = 1.0f;
  rng_chord_engine->applyParam(wave_spread_event);
  require(rng_chord_engine->arrangement.synth_octave == 0 &&
      rng_chord_engine->arrangement.requested_synth_octave == 1,
      "a running octave change should be staged without rewriting the current phrase");
  requireNear(rng_chord_engine->harmony.voicing_spread, current_phrase_voicing_spread, 0.000001f,
      "a running voicing-spread change must preserve the current phrase");
  requireNear(rng_chord_engine->harmony.requested_voicing_spread, 1.0f, 0.000001f,
      "a running voicing-spread change should stage the requested value");
  requireNear(rng_chord_engine->arrangement.wave_spread, current_phrase_wave_spread, 0.000001f,
      "a running wave-spread change must preserve the current phrase");
  requireNear(rng_chord_engine->arrangement.requested_wave_spread, 1.0f, 0.000001f,
      "a running wave-spread change should stage the requested value");
  require(!rng_chord_engine->arrangement.chord_generator_pending,
      "running chord-control changes must not retrigger inside the current phrase");
  rng_chord_engine->transport.sample_frame = 768000u;
  rng_chord_engine->advanceHarmonyClock();
  require(rng_chord_engine->arrangement.synth_octave == 1 &&
      rng_chord_engine->arrangement.chord_generator_pending,
      "the staged octave should rebuild the core chord at the next phrase boundary");
  requireNear(rng_chord_engine->harmony.voicing_spread, 1.0f, 0.000001f,
      "the staged voicing spread should apply at the next phrase boundary");
  requireNear(rng_chord_engine->arrangement.wave_spread, 1.0f, 0.000001f,
      "the staged wave spread should apply at the next phrase boundary");
  SequencerBuffer octave_chord_events{};
  rng_chord_engine->generateArrangementEvents(768000u, octave_chord_events);
  octave_chord_events.sortByOffset();
  require(octave_chord_events.count == 3u,
      "the rebuilt chord should schedule every note across the next phrase");
  std::array<float, 3> octave_midi{};
  std::array<float, 3> expected_octave_midi{};
  for (uint32_t index = 0u; index < octave_chord_events.count; ++index) {
    octave_midi[index] = octave_chord_events.events[index].midi_note;
    expected_octave_midi[index] = rng_chord_engine->harmony.note_pool_midi[index] + 12.0f;
  }
  std::sort(octave_midi.begin(), octave_midi.end());
  std::sort(expected_octave_midi.begin(), expected_octave_midi.end());
  for (uint32_t index = 0u; index < octave_midi.size(); ++index) {
    requireNear(octave_midi[index], expected_octave_midi[index], 0.000001f,
        "arrangement octave rebuild should transpose the next phrase chord exactly one octave");
  }
  KesshoProductSimpleSequencerVisualEvent octave_visual_events[8]{};
  uint32_t octave_visual_overflow = 0u;
  const uint32_t octave_visual_count = kessho_product_drain_simple_sequencer_visual_events(
      rng_chord_engine, octave_visual_events, 8u, &octave_visual_overflow);
  require(octave_visual_count == 3u && octave_visual_overflow == 0u,
      "arrangement octave rebuild visual capture count mismatch");
  std::sort(octave_visual_events, octave_visual_events + octave_visual_count,
      [](const auto& left, const auto& right) { return left.absolute_sample < right.absolute_sample; });
  for (uint32_t index = 0u; index < octave_visual_count; ++index) {
    require(octave_visual_events[index].phrase_index == 1u &&
        octave_visual_events[index].phrase_start_sample == 768000u,
        "the octave rebuild must publish one new plan at the phrase boundary");
    requireNear(octave_visual_events[index].midi_note,
        octave_chord_events.events[index].midi_note, 0.000001f,
        "the rebuilt chord visual MIDI must match the scheduled next-phrase note");
    require(octave_visual_events[index].absolute_sample ==
        768000u + octave_chord_events.events[index].sample_offset,
        "the rebuilt chord visual timing must match the scheduled next-phrase note");
  }
  rng_chord_engine->transport.sample_frame = 1536000u;
  rng_chord_engine->advanceHarmonyClock();
  require(rng_chord_engine->arrangement.chord_generator_pending,
      "every completed phrase must publish one chord-generator plan even when harmony repeats");
  kessho_product_destroy(rng_chord_engine);

  auto rng_lead_snapshot = std::make_unique<KesshoProductSnapshotV2>(
      makeSnapshot(60.0f, 1u, 0.4f, 808u));
  rng_lead_snapshot->synth_euclid.lane_count = 0u;
  rng_lead_snapshot->harmony.note_pool_count = 4u;
  rng_lead_snapshot->harmony.note_pool_midi[0] = 60.0f;
  rng_lead_snapshot->harmony.note_pool_midi[1] = 64.0f;
  rng_lead_snapshot->harmony.note_pool_midi[2] = 67.0f;
  rng_lead_snapshot->harmony.note_pool_midi[3] = 72.0f;
  rng_lead_snapshot->arrangement.lead_random_enabled = 1u;
  rng_lead_snapshot->arrangement.lead_random_source_id = KESSHO_PRODUCT_SOURCE_LEAD1;
  rng_lead_snapshot->arrangement.lead_phrase_seconds = 0.25f;
  rng_lead_snapshot->arrangement.lead_density = 0.5f;
  rng_lead_snapshot->arrangement.lead_octave = 0;
  rng_lead_snapshot->arrangement.lead_octave_range = 2u;
  rng_lead_snapshot->arrangement.lead_hold_seconds = 0.4f;
  rng_lead_snapshot->arrangement.lead_velocity_min = 0.5f;
  rng_lead_snapshot->arrangement.lead_velocity_max = 0.9f;
  rng_lead_snapshot->arrangement.lead_chord_bias = 0.78f;
  rng_lead_snapshot->arrangement.rng_state = 123456u;
  KesshoProductEngine* rng_lead_engine = kessho_product_create(48000.0, 128u, 0u);
  require(rng_lead_engine != nullptr, "arrangement RNG lead engine create failed");
  require(kessho_product_load_snapshot_v2(
      rng_lead_engine, rng_lead_snapshot.get(), sizeof(*rng_lead_snapshot)) == KESSHO_PRODUCT_OK,
      "arrangement RNG lead snapshot load failed");
  require(kessho_product_set_simple_sequencer_visual_demand(
      rng_lead_engine, KESSHO_PRODUCT_SIMPLE_SEQUENCER_VISUAL_RANDOM_TIMING) == KESSHO_PRODUCT_OK,
      "arrangement random-timing visual demand failed");
  SequencerBuffer early_lead_events{};
  rng_lead_engine->generateArrangementEvents(128u, early_lead_events);
  require(early_lead_events.count == 0u,
      "future random-timing notes should not emit before their trigger block");
  KesshoProductSimpleSequencerVisualEvent lead_visual_events[8]{};
  uint32_t lead_visual_overflow = 0u;
  const uint32_t lead_visual_count = kessho_product_drain_simple_sequencer_visual_events(
      rng_lead_engine, lead_visual_events, 8u, &lead_visual_overflow);
  require(lead_visual_count == 2u && lead_visual_overflow == 0u,
      "the complete random-timing plan must be visible before any future note triggers");
  SequencerBuffer rng_lead_events{};
  rng_lead_engine->generateArrangementEvents(12000u, rng_lead_events);
  rng_lead_events.sortByOffset();
  require(rng_lead_events.count == 2u, "TypeScript parity lead event count mismatch");
  require(rng_lead_events.events[0].sample_offset == 2794u &&
      rng_lead_events.events[0].midi_note == 79.0f &&
      rng_lead_events.events[1].sample_offset == 9567u &&
      rng_lead_events.events[1].midi_note == 69.0f,
      "TypeScript parity lead note stream mismatch");
  requireNear(rng_lead_events.events[0].velocity, 0.6253640386f, 0.000001f,
      "TypeScript parity lead velocity A mismatch");
  requireNear(rng_lead_events.events[1].velocity, 0.5834287915f, 0.000001f,
      "TypeScript parity lead velocity B mismatch");
  require(rng_lead_engine->arrangement.rng_state == 3599313885u,
      "TypeScript parity lead RNG state mismatch");
  KesshoProductSimpleSequencerVisualEvent triggered_lead_visual_events[8]{};
  uint32_t triggered_lead_visual_overflow = 0u;
  require(kessho_product_drain_simple_sequencer_visual_events(
      rng_lead_engine, triggered_lead_visual_events, 8u, &triggered_lead_visual_overflow) == 0u &&
      triggered_lead_visual_overflow == 0u,
      "triggering queued random-timing notes must not republish or mutate their visual plan");
  std::sort(lead_visual_events, lead_visual_events + lead_visual_count,
      [](const auto& left, const auto& right) { return left.absolute_sample < right.absolute_sample; });
  for (uint32_t index = 0u; index < lead_visual_count; ++index) {
    require(lead_visual_events[index].kind == KESSHO_PRODUCT_SIMPLE_SEQUENCER_VISUAL_RANDOM_TIMING,
        "arrangement random-timing visual kind mismatch");
    requireNear(lead_visual_events[index].midi_note, rng_lead_events.events[index].midi_note, 0.000001f,
        "arrangement random-timing visual MIDI must match the scheduled event");
    require(lead_visual_events[index].absolute_sample == rng_lead_events.events[index].sample_offset,
        "arrangement random-timing visual sample must match the scheduled event");
  }
  kessho_product_destroy(rng_lead_engine);

  auto mode_snapshot = std::make_unique<KesshoProductSnapshotV2>(
      makeSnapshot(60.0f, 1u, 0.4f, 909u));
  mode_snapshot->synth_euclid.lane_count = 0u;
  mode_snapshot->arrangement.chord_sequencer_enabled = 1u;
  mode_snapshot->arrangement.chord_sequencer_source_id = KESSHO_PRODUCT_SOURCE_LEAD1;
  mode_snapshot->arrangement.chord_sequencer_voice_count = 3u;
  mode_snapshot->arrangement.chord_sequencer_step_count = 1u;
  mode_snapshot->arrangement.chord_sequencer_enabled_mask = 1u;
  mode_snapshot->arrangement.chord_sequencer_step_seconds = 1.0f;
  mode_snapshot->arrangement.chord_sequencer_probability[0] = 1.0f;
  mode_snapshot->arrangement.chord_sequencer_hold_steps[0] = 1u;
  mode_snapshot->arrangement.chord_step_slot_id[0] = 0;
  mode_snapshot->arrangement.chord_slot_note_count[0] = 3u;
  mode_snapshot->arrangement.chord_slot_midi[0] = 60.0f;
  mode_snapshot->arrangement.chord_slot_midi[1] = 64.0f;
  mode_snapshot->arrangement.chord_slot_midi[2] = 67.0f;
  mode_snapshot->arrangement.wave_spread = 0.0f;
  mode_snapshot->arrangement.rng_state = 123456u;
  mode_snapshot->arrangement.chord_playback_mode = 1u;
  mode_snapshot->arrangement.chord_arp_speed_seconds = 0.25f;
  mode_snapshot->arrangement.chord_arp_gate = 0.62f;
  mode_snapshot->arrangement.chord_arp_pattern_length = 4u;
  mode_snapshot->arrangement.chord_arp_active_mask = 0x0fu;
  for (uint32_t index = 0u; index < 4u; ++index) mode_snapshot->arrangement.chord_arp_tone[index] = index + 1u;
  KesshoProductEngine* arp_engine = kessho_product_create(48000.0, 128u, 0u);
  require(arp_engine != nullptr, "arrangement arp engine create failed");
  require(kessho_product_load_snapshot_v2(arp_engine, mode_snapshot.get(), sizeof(*mode_snapshot)) == KESSHO_PRODUCT_OK,
      "arrangement arp snapshot load failed");
  SequencerBuffer arp_events{};
  arp_engine->generateArrangementEvents(48000u, arp_events);
  arp_events.sortByOffset();
  require(arp_events.count == 4u, "TypeScript parity arp event count mismatch");
  const uint32_t arp_offsets[4] = {0u, 12000u, 24000u, 36000u};
  const float arp_midi[4] = {60.0f, 64.0f, 67.0f, 72.0f};
  for (uint32_t index = 0u; index < 4u; ++index) {
    require(arp_events.events[index].sample_offset == arp_offsets[index] &&
        arp_events.events[index].midi_note == arp_midi[index],
        "TypeScript parity arp event stream mismatch");
  }
  kessho_product_destroy(arp_engine);

  mode_snapshot->arrangement.chord_playback_mode = 2u;
  mode_snapshot->arrangement.chord_strum_direction = 0u;
  mode_snapshot->arrangement.chord_strum_spread_seconds = 0.09f;
  mode_snapshot->arrangement.chord_strum_curve = 0.0f;
  mode_snapshot->arrangement.chord_strum_gate = 0.86f;
  mode_snapshot->arrangement.chord_strum_velocity_falloff = 0.08f;
  KesshoProductEngine* strum_engine = kessho_product_create(48000.0, 128u, 0u);
  require(strum_engine != nullptr, "arrangement strum engine create failed");
  require(kessho_product_load_snapshot_v2(strum_engine, mode_snapshot.get(), sizeof(*mode_snapshot)) == KESSHO_PRODUCT_OK,
      "arrangement strum snapshot load failed");
  SequencerBuffer strum_events{};
  strum_engine->generateArrangementEvents(48000u, strum_events);
  strum_events.sortByOffset();
  require(strum_events.count == 3u, "TypeScript parity strum event count mismatch");
  const uint32_t strum_offsets[3] = {0u, 2160u, 4320u};
  const float strum_velocity[3] = {1.0f, 0.96f, 0.92f};
  for (uint32_t index = 0u; index < 3u; ++index) {
    require(strum_events.events[index].sample_offset == strum_offsets[index],
        "TypeScript parity strum sample offset mismatch");
    requireNear(strum_events.events[index].velocity, strum_velocity[index], 0.000001f,
        "TypeScript parity strum velocity mismatch");
  }
  kessho_product_destroy(strum_engine);

  mode_snapshot->arrangement.chord_playback_mode = 0u;
  mode_snapshot->arrangement.chord_expression_mask = 0xffu;
  mode_snapshot->arrangement.chord_morph_mask = 0xffu;
  mode_snapshot->arrangement.chord_distance_mask = 0xffu;
  mode_snapshot->arrangement.chord_nudge_mask = 0xffu;
  mode_snapshot->arrangement.chord_expression[0] = 0.7f;
  mode_snapshot->arrangement.chord_morph[0] = 0.3f;
  mode_snapshot->arrangement.chord_distance[0] = 0.4f;
  mode_snapshot->arrangement.chord_nudge[0] = 0.1f;
  for (uint32_t lane = 0u; lane < 5u; ++lane) mode_snapshot->arrangement.chord_sub_lane_steps[lane] = 1u;
  KesshoProductEngine* sub_lane_engine = kessho_product_create(48000.0, 128u, 0u);
  require(sub_lane_engine != nullptr, "arrangement sub-lane engine create failed");
  require(kessho_product_load_snapshot_v2(
      sub_lane_engine, mode_snapshot.get(), sizeof(*mode_snapshot)) == KESSHO_PRODUCT_OK,
      "arrangement sub-lane snapshot load failed");
  SequencerBuffer sub_lane_events{};
  sub_lane_engine->generateArrangementEvents(48000u, sub_lane_events);
  require(sub_lane_events.count == 3u, "TypeScript parity sub-lane event count mismatch");
  for (uint32_t index = 0u; index < sub_lane_events.count; ++index) {
    const KesshoSequencerEvent& event = sub_lane_events.events[index];
    require(event.sample_offset == 2160u, "TypeScript parity sub-lane nudge mismatch");
    requireNear(event.velocity, 0.7f, 0.000001f, "TypeScript parity sub-lane expression mismatch");
    requireNear(event.morph, 0.3f, 0.000001f, "TypeScript parity sub-lane morph mismatch");
    requireNear(event.distance, 0.4f, 0.000001f, "TypeScript parity sub-lane distance mismatch");
  }
  kessho_product_destroy(sub_lane_engine);
}

__attribute__((noinline)) void requireLongArrangementSimulation() {
  auto snapshot = std::make_unique<KesshoProductSnapshotV2>(
      makeSnapshot(60.0f, 1u, 0.4f, 606u));
  snapshot->synth_euclid.lane_count = 0u;
  snapshot->harmony.chord_interval_seconds = 8.0f;
  snapshot->arrangement.chord_generator_enabled = 1u;
  snapshot->arrangement.chord_generator_source_id = KESSHO_PRODUCT_SOURCE_PAD1;
  snapshot->arrangement.chord_generator_voice_count = 4u;
  snapshot->arrangement.chord_sequencer_enabled = 1u;
  snapshot->arrangement.chord_sequencer_source_id = KESSHO_PRODUCT_SOURCE_PAD2;
  snapshot->arrangement.chord_sequencer_voice_count = 3u;
  snapshot->arrangement.chord_sequencer_step_count = 8u;
  snapshot->arrangement.chord_sequencer_enabled_mask = 0xffu;
  snapshot->arrangement.chord_sequencer_step_seconds = 0.5f;
  snapshot->arrangement.lead_random_enabled = 1u;
  snapshot->arrangement.lead_random_source_id = KESSHO_PRODUCT_SOURCE_LEAD1;
  snapshot->arrangement.lead_phrase_seconds = 2.0f;
  snapshot->arrangement.lead_density = 0.5f;
  snapshot->arrangement.lead_octave_range = 2u;
  snapshot->arrangement.lead_hold_seconds = 0.4f;
  snapshot->arrangement.lead_velocity_min = 0.5f;
  snapshot->arrangement.lead_velocity_max = 0.9f;
  for (uint32_t step = 0u; step < 8u; ++step) {
    snapshot->arrangement.chord_sequencer_probability[step] = 1.0f;
    snapshot->arrangement.chord_sequencer_hold_steps[step] = 1u + (step & 1u);
  }

  KesshoProductEngine* engine_a = kessho_product_create(48000.0, 4096u, 0u);
  KesshoProductEngine* engine_b = kessho_product_create(48000.0, 4096u, 0u);
  require(engine_a != nullptr && engine_b != nullptr, "long arrangement engines create failed");
  require(kessho_product_load_snapshot_v2(engine_a, snapshot.get(), sizeof(*snapshot)) == KESSHO_PRODUCT_OK,
      "long arrangement A snapshot load failed");
  require(kessho_product_load_snapshot_v2(engine_b, snapshot.get(), sizeof(*snapshot)) == KESSHO_PRODUCT_OK,
      "long arrangement B snapshot load failed");

  constexpr uint64_t kSixtyMinuteFrames = 60u * 60u * 48000u;
  uint64_t generated_event_count = 0u;
  for (uint64_t frame = 0u; frame < kSixtyMinuteFrames; frame += 4096u) {
    const uint32_t frames = static_cast<uint32_t>(std::min<uint64_t>(4096u, kSixtyMinuteFrames - frame));
    engine_a->transport.sample_frame = frame;
    engine_b->transport.sample_frame = frame;
    engine_a->advanceHarmonyClock();
    engine_b->advanceHarmonyClock();
    SequencerBuffer events_a{};
    SequencerBuffer events_b{};
    engine_a->generateArrangementEvents(frames, events_a);
    engine_b->generateArrangementEvents(frames, events_b);
    require(events_a.count == events_b.count, "60-minute arrangement deterministic count mismatch");
    generated_event_count += events_a.count;
    for (uint32_t index = 0u; index < events_a.count; ++index) {
      const KesshoSequencerEvent& a = events_a.events[index];
      const KesshoSequencerEvent& b = events_b.events[index];
      require(a.sample_offset < frames, "60-minute arrangement event escaped render block");
      require(a.sample_offset == b.sample_offset && a.source_id == b.source_id &&
          a.event_kind == b.event_kind && a.midi_note == b.midi_note &&
          a.velocity == b.velocity && a.hold_seconds == b.hold_seconds,
          "60-minute arrangement deterministic event mismatch");
    }
  }
  require(generated_event_count > 1000u, "60-minute arrangement simulation generated too few events");
  require(engine_a->arrangement.pending_count == engine_b->arrangement.pending_count,
      "60-minute arrangement pending queue mismatch");
  require(engine_a->telemetry.asset_missing_count == 0u && engine_b->telemetry.asset_missing_count == 0u,
      "60-minute arrangement simulation increased missing-asset telemetry");
  kessho_product_destroy(engine_a);
  kessho_product_destroy(engine_b);
}

__attribute__((noinline)) void requireArrangementPcmParity() {
  struct ExpectedNote {
    uint32_t sample_offset;
    float midi;
    float velocity;
    float hold_seconds;
  };
  const auto run_case = [&](uint32_t playback_mode, const std::vector<ExpectedNote>& expected) {
    auto scheduled_snapshot = std::make_unique<KesshoProductSnapshotV2>(
        makeSnapshot(60.0f, 1u, 0.4f, 1001u + playback_mode));
    scheduled_snapshot->synth_euclid.lane_count = 0u;
    scheduled_snapshot->drum_euclid.lane_count = 0u;
    scheduled_snapshot->arrangement.chord_sequencer_enabled = 1u;
    scheduled_snapshot->arrangement.chord_sequencer_source_id = KESSHO_PRODUCT_SOURCE_LEAD1;
    scheduled_snapshot->arrangement.chord_sequencer_voice_count = 3u;
    scheduled_snapshot->arrangement.chord_sequencer_step_count = 1u;
    scheduled_snapshot->arrangement.chord_sequencer_enabled_mask = 1u;
    scheduled_snapshot->arrangement.chord_sequencer_step_seconds = 1.0f;
    scheduled_snapshot->arrangement.chord_sequencer_probability[0] = 1.0f;
    scheduled_snapshot->arrangement.chord_sequencer_hold_steps[0] = 1u;
    scheduled_snapshot->arrangement.chord_step_slot_id[0] = 0;
    scheduled_snapshot->arrangement.chord_slot_note_count[0] = 3u;
    scheduled_snapshot->arrangement.chord_slot_midi[0] = 60.0f;
    scheduled_snapshot->arrangement.chord_slot_midi[1] = 64.0f;
    scheduled_snapshot->arrangement.chord_slot_midi[2] = 67.0f;
    scheduled_snapshot->arrangement.wave_spread = 0.0f;
    scheduled_snapshot->arrangement.rng_state = 123456u;
    scheduled_snapshot->arrangement.chord_playback_mode = playback_mode;
    scheduled_snapshot->arrangement.chord_arp_speed_seconds = 0.25f;
    scheduled_snapshot->arrangement.chord_arp_gate = 0.62f;
    scheduled_snapshot->arrangement.chord_arp_pattern_length = 4u;
    scheduled_snapshot->arrangement.chord_arp_active_mask = 0x0fu;
    scheduled_snapshot->arrangement.chord_strum_direction = 0u;
    scheduled_snapshot->arrangement.chord_strum_spread_seconds = 0.09f;
    scheduled_snapshot->arrangement.chord_strum_curve = 0.0f;
    scheduled_snapshot->arrangement.chord_strum_gate = 0.86f;
    scheduled_snapshot->arrangement.chord_strum_velocity_falloff = 0.08f;
    for (uint32_t index = 0u; index < 4u; ++index) scheduled_snapshot->arrangement.chord_arp_tone[index] = index + 1u;

    auto host_snapshot = std::make_unique<KesshoProductSnapshotV2>(*scheduled_snapshot);
    host_snapshot->arrangement.chord_sequencer_enabled = 0u;
    KesshoProductEngine* scheduled = kessho_product_create(48000.0, 128u, 0u);
    KesshoProductEngine* host = kessho_product_create(48000.0, 128u, 0u);
    require(scheduled != nullptr && host != nullptr, "arrangement PCM parity engine create failed");
    require(kessho_product_load_snapshot_v2(scheduled, scheduled_snapshot.get(), sizeof(*scheduled_snapshot)) == KESSHO_PRODUCT_OK,
        "arrangement PCM scheduled snapshot load failed");
    require(kessho_product_load_snapshot_v2(host, host_snapshot.get(), sizeof(*host_snapshot)) == KESSHO_PRODUCT_OK,
        "arrangement PCM host snapshot load failed");
    for (const ExpectedNote& note : expected) {
      KesshoProductEvent event{};
      event.sample_offset = note.sample_offset;
      event.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
      event.target_id = KESSHO_PRODUCT_SOURCE_LEAD1;
      event.value = note.midi;
      event.value2 = note.velocity;
      event.value3 = note.hold_seconds;
      require(kessho_product_enqueue_event(host, &event) == KESSHO_PRODUCT_OK,
          "arrangement PCM host event enqueue failed");
    }

    constexpr uint32_t kFrames = 48000u;
    std::vector<float> scheduled_left(kFrames), scheduled_right(kFrames), host_left(kFrames), host_right(kFrames);
    for (uint32_t offset = 0u; offset < kFrames; offset += 128u) {
      const uint32_t frames = std::min<uint32_t>(128u, kFrames - offset);
      kessho_product_render(scheduled, scheduled_left.data() + offset, scheduled_right.data() + offset, frames);
      kessho_product_render(host, host_left.data() + offset, host_right.data() + offset, frames);
    }
    double dot = 0.0;
    double scheduled_energy = 0.0;
    double host_energy = 0.0;
    for (uint32_t index = 0u; index < kFrames; ++index) {
      for (uint32_t channel = 0u; channel < 2u; ++channel) {
        const double a = channel == 0u ? scheduled_left[index] : scheduled_right[index];
        const double b = channel == 0u ? host_left[index] : host_right[index];
        dot += a * b;
        scheduled_energy += a * a;
        host_energy += b * b;
      }
    }
    require(scheduled_energy > 0.0 && host_energy > 0.0, "arrangement PCM parity rendered silence");
    const double correlation = dot / std::sqrt(scheduled_energy * host_energy);
    const double loudness_delta_db = 10.0 * std::log10(scheduled_energy / host_energy);
    require(correlation >= 0.9999, "arrangement PCM parity correlation fell below 0.9999");
    require(std::fabs(loudness_delta_db) < 0.1, "arrangement PCM parity loudness delta exceeded 0.1 dB");
    kessho_product_destroy(scheduled);
    kessho_product_destroy(host);
  };

  run_case(0u, {
      {0u, 60.0f, 1.0f, 1.0f},
      {0u, 64.0f, 1.0f, 1.0f},
      {0u, 67.0f, 1.0f, 1.0f},
  });
  run_case(1u, {
      {0u, 60.0f, 1.0f, 0.155f},
      {12000u, 64.0f, 1.0f, 0.155f},
      {24000u, 67.0f, 1.0f, 0.155f},
      {36000u, 72.0f, 1.0f, 0.155f},
  });
  run_case(2u, {
      {0u, 60.0f, 1.0f, 0.86f},
      {2160u, 64.0f, 0.96f, 0.8213f},
      {4320u, 67.0f, 0.92f, 0.7826f},
  });
}

__attribute__((noinline)) void requireTypeScriptHarmonySequenceParity() {
  auto snapshot = std::make_unique<KesshoProductSnapshotV2>(
      makeSnapshot(64.0f, 1u, 0.3f, 987u));
  snapshot->harmony.chord_interval_seconds = 16.0f;
  std::memcpy(snapshot->harmony.seed_material, "phase8-harmony-reference", 25u);
  snapshot->harmony.phrase_length_seconds = 16.0f;
  snapshot->harmony.progression_phrase_seconds = 16.0f;
  snapshot->harmony.voicing_spread = 0.5f;
  snapshot->harmony.detune_cents = 8.0f;
  snapshot->harmony.scale_mode = 1u;
  snapshot->harmony.phrases_until_change = 1u;
  snapshot->harmony.current_degree = 0;
  snapshot->harmony.note_pool_count = 5u;
  const float initial_chord[5] = {40.0f, 44.0f, 47.0f, 51.0f, 54.0f};
  for (uint32_t index = 0u; index < 5u; ++index) snapshot->harmony.note_pool_midi[index] = initial_chord[index];
  snapshot->harmony.progression_steps = 4u;
  snapshot->harmony.progression_step_enabled_mask = 0x0fu;
  snapshot->harmony.progression_phrase_multiplier = 1u;
  snapshot->harmony.cof_home_root = 4;
  snapshot->harmony.cof_drift_rate = 2u;
  snapshot->harmony.cof_drift_range = 3u;
  snapshot->harmony.next_phrase_index_low = 1u;
  snapshot->harmony.next_progression_phrase_index_low = 1u;

  KesshoProductEngine* engine = kessho_product_create(48000.0, 4096u, 0u);
  require(engine != nullptr, "TypeScript harmony parity engine create failed");
  require(kessho_product_load_snapshot_v2(engine, snapshot.get(), sizeof(*snapshot)) == KESSHO_PRODUCT_OK,
      "TypeScript harmony parity snapshot load failed");
  uint64_t hash = 1469598103934665603ull;
  const auto mix = [&](uint32_t value) {
    hash ^= value;
    hash *= 1099511628211ull;
  };
  constexpr uint64_t kIntervalFrames = 16u * 48000u;
  for (uint64_t phrase = 1u; phrase <= 225u; ++phrase) {
    engine->transport.sample_frame = phrase * kIntervalFrames;
    engine->advanceHarmonyClock();
    mix(engine->harmony.note_pool_count);
    mix(static_cast<uint32_t>(engine->harmony.current_degree));
    mix(engine->harmony.scale_id);
    for (uint32_t index = 0u; index < engine->harmony.note_pool_count; ++index) {
      mix(static_cast<uint32_t>(std::llround(engine->harmony.note_pool_midi[index] * 1000000.0f)));
    }
  }
  require(hash == 0xf16309e39d57bf50ull,
      "60-minute harmony event sequence diverged from deterministic TypeScript reference");
  require(engine->harmony.note_pool_count == 5u &&
          engine->harmony.note_pool_midi[0] == 45.0f &&
          engine->harmony.note_pool_midi[4] == 59.0f &&
          engine->harmony.current_degree == 3,
      "60-minute harmony final state diverged from deterministic TypeScript reference");
  kessho_product_destroy(engine);
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

  auto clock_snapshot = std::make_unique<KesshoProductSnapshotV2>(
      makeSnapshot(60.0f, 1u, 0.6f, 123u));
  clock_snapshot->harmony.chord_interval_seconds = 0.01f;
  KesshoProductEngine* clock_engine = kessho_product_create(48000.0, 128u, 0u);
  require(clock_engine != nullptr, "sample-frame harmony clock engine create failed");
  require(kessho_product_load_snapshot_v2(clock_engine, clock_snapshot.get(), sizeof(*clock_snapshot)) == KESSHO_PRODUCT_OK,
      "sample-frame harmony clock snapshot load failed");
  require(clock_engine->harmony.next_harmony_frame == 480u, "sample-frame harmony boundary mismatch");
  float clock_left[128]{};
  float clock_right[128]{};
  for (uint32_t block = 0u; block < 4u; ++block) {
    kessho_product_render(clock_engine, clock_left, clock_right, 128u);
  }
  require(clock_engine->harmony.harmony_tick_index == 1u, "sample-frame harmony clock missed exact boundary");
  require(clock_engine->harmony.next_harmony_frame == 960u, "sample-frame harmony clock next boundary mismatch");
  require(clock_engine->harmony.note_pool_count >= 3u && clock_engine->harmony.note_pool_count <= 6u,
      "sample-frame harmony clock did not generate a chord");
  kessho_product_destroy(clock_engine);

  auto long_clock_snapshot = std::make_unique<KesshoProductSnapshotV2>(
      makeSnapshot(60.0f, 1u, 0.6f, 987u));
  long_clock_snapshot->harmony.chord_interval_seconds = 16.0f;
  KesshoProductEngine* long_clock_a = kessho_product_create(48000.0, 4096u, 0u);
  KesshoProductEngine* long_clock_b = kessho_product_create(48000.0, 4096u, 0u);
  require(long_clock_a != nullptr && long_clock_b != nullptr, "long harmony clock engines create failed");
  require(kessho_product_load_snapshot_v2(long_clock_a, long_clock_snapshot.get(), sizeof(*long_clock_snapshot)) == KESSHO_PRODUCT_OK,
      "long harmony clock A snapshot load failed");
  require(kessho_product_load_snapshot_v2(long_clock_b, long_clock_snapshot.get(), sizeof(*long_clock_snapshot)) == KESSHO_PRODUCT_OK,
      "long harmony clock B snapshot load failed");
  constexpr uint64_t kSixtyMinuteFrames = 60u * 60u * 48000u;
  uint64_t rendered_frames = 0u;
  while (rendered_frames < kSixtyMinuteFrames) {
    const uint32_t frames = static_cast<uint32_t>(std::min<uint64_t>(4096u, kSixtyMinuteFrames - rendered_frames));
    rendered_frames += frames;
    long_clock_a->transport.sample_frame = rendered_frames;
    long_clock_b->transport.sample_frame = rendered_frames;
    long_clock_a->advanceHarmonyClock();
    long_clock_b->advanceHarmonyClock();
  }
  require(long_clock_a->harmony.harmony_tick_index == 225u, "60-minute harmony clock tick count mismatch");
  require(long_clock_a->harmony.harmony_tick_index == long_clock_b->harmony.harmony_tick_index,
      "60-minute harmony clock determinism tick mismatch");
  require(long_clock_a->harmony.harmony_rng_state == long_clock_b->harmony.harmony_rng_state,
      "60-minute harmony clock RNG mismatch");
  require(long_clock_a->harmony.chord_degree == long_clock_b->harmony.chord_degree,
      "60-minute harmony clock chord mismatch");
  kessho_product_destroy(long_clock_a);
  kessho_product_destroy(long_clock_b);

  requireArrangementScheduling();
  requireLongArrangementSimulation();
  requireArrangementPcmParity();
  requireTypeScriptHarmonySequenceParity();

  std::cout << "Kessho Product Harmony tests passed\n";
  return 0;
}
