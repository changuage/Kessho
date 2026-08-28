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
    std::cerr << "Kessho Product interaction test failed: " << message << "\n";
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
  snapshot.rng.seed = 73u;
  snapshot.rng.state = 73u;
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
  lane.velocity = 0.9f;
  lane.hold_seconds = 0.12f;
  lane.expression = 0.9f;
  lane.seed = 127u;
  lane.manual_step_mask_low = 0x0fu;
  kessho::product::tests::applyGeneratedSourceDefaults(snapshot);
  return snapshot;
}

bool allZero(const std::array<float, kFrames>& values) {
  for (float value : values) if (value != 0.0f) return false;
  return true;
}

} // namespace

int main() {
  KesshoProductEngine* baseline = kessho_product_create(48000.0, kFrames, 0u);
  KesshoProductEngine* analyzed = kessho_product_create(48000.0, kFrames, 0u);
  require(baseline != nullptr && analyzed != nullptr, "engine creation failed");
  const KesshoProductSnapshotV2 snapshot = makeSnapshot();
  require(kessho_product_load_snapshot_v2(baseline, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "baseline load failed");
  require(kessho_product_load_snapshot_v2(analyzed, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "analyzed load failed");

  std::array<float, kFrames> left_a{};
  std::array<float, kFrames> right_a{};
  std::array<float, kFrames> left_b{};
  std::array<float, kFrames> right_b{};
  std::array<float, kFrames> stem_l{};
  std::array<float, kFrames> stem_r{};
  kessho_product_render(baseline, left_a.data(), right_a.data(), kFrames);
  kessho_product_render(analyzed, left_b.data(), right_b.data(), kFrames);
  require(std::memcmp(left_a.data(), left_b.data(), sizeof(left_a)) == 0, "pre-demand left PCM mismatch");
  require(std::memcmp(right_a.data(), right_b.data(), sizeof(right_a)) == 0, "pre-demand right PCM mismatch");
  require(kessho_product_get_stem(baseline, KESSHO_PRODUCT_STEM_MASTER, stem_l.data(), stem_r.data(), kFrames) == KESSHO_PRODUCT_OK, "off-demand stem read failed");
  require(allZero(stem_l) && allZero(stem_r), "off-demand analysis captured stems");

  constexpr uint32_t demand =
      KESSHO_PRODUCT_INTERACTION_DEMAND_EVENTS |
      KESSHO_PRODUCT_INTERACTION_DEMAND_ENVELOPE |
      KESSHO_PRODUCT_INTERACTION_DEMAND_PEAK |
      KESSHO_PRODUCT_INTERACTION_DEMAND_RMS |
      KESSHO_PRODUCT_INTERACTION_DEMAND_ONSET;
  constexpr uint32_t sources =
      (1u << KESSHO_PRODUCT_STEM_MASTER) |
      (1u << KESSHO_PRODUCT_STEM_PAD1);
  require(kessho_product_set_interaction_demand(analyzed, demand, sources) == KESSHO_PRODUCT_OK, "demand enable failed");

  float max_master = 0.0f;
  float max_pad = 0.0f;
  float max_onset = 0.0f;
  KesshoProductInteractionSignalSnapshot signals{};
  for (uint32_t block = 0u; block < 96u; ++block) {
    kessho_product_render(baseline, left_a.data(), right_a.data(), kFrames);
    kessho_product_render(analyzed, left_b.data(), right_b.data(), kFrames);
    require(std::memcmp(left_a.data(), left_b.data(), sizeof(left_a)) == 0, "analysis changed left PCM");
    require(std::memcmp(right_a.data(), right_b.data(), sizeof(right_a)) == 0, "analysis changed right PCM");
    require(kessho_product_copy_interaction_signals(analyzed, &signals) == KESSHO_PRODUCT_OK, "signal copy failed");
    max_master = std::max(max_master, signals.envelope[KESSHO_PRODUCT_STEM_MASTER]);
    max_pad = std::max(max_pad, signals.rms[KESSHO_PRODUCT_STEM_PAD1]);
    max_onset = std::max(max_onset, signals.onset_strength[KESSHO_PRODUCT_STEM_PAD1]);
  }
  require(signals.version == KESSHO_PRODUCT_INTERACTION_VERSION, "snapshot version mismatch");
  require(signals.demand_mask == demand && signals.source_mask == sources, "snapshot demand mismatch");
  require(signals.valid_source_mask == sources, "unselected source became valid");
  require(signals.revision > 0u && signals.sample_frame > 0u, "snapshot did not advance");
  require(max_master > 0.00001f && max_pad > 0.00001f && max_onset > 0.00001f, "selected signals stayed silent");
  std::array<KesshoProductInteractionEvent, KESSHO_PRODUCT_INTERACTION_EVENT_CAPACITY> captured_events{};
  uint32_t overflow = 0u;
  const uint32_t captured_count = kessho_product_drain_interaction_events(
      analyzed, captured_events.data(), static_cast<uint32_t>(captured_events.size()), &overflow);
  bool found_sequencer_voice = false;
  for (uint32_t index = 0u; index < captured_count; ++index) {
    const auto& event = captured_events[index];
    if (event.type == KESSHO_PRODUCT_INTERACTION_EVENT_VOICE_TRIGGERED &&
        event.parent == KESSHO_PRODUCT_INTERACTION_PARENT_SYNTHS &&
        event.child == KESSHO_PRODUCT_INTERACTION_CHILD_PAD1 &&
        event.origin == KESSHO_PRODUCT_INTERACTION_ORIGIN_SEQUENCER) {
      found_sequencer_voice = true;
    }
  }
  require(found_sequencer_voice, "sequencer voice identity was not captured");

  require(kessho_product_set_interaction_demand(analyzed, 0u, 0u) == KESSHO_PRODUCT_OK, "demand disable failed");
  require(kessho_product_copy_interaction_signals(analyzed, &signals) == KESSHO_PRODUCT_OK, "disabled signal copy failed");
  require(signals.demand_mask == 0u && signals.source_mask == 0u && signals.valid_source_mask == 0u, "disabled snapshot stayed armed");
  for (uint32_t source = 0u; source < KESSHO_PRODUCT_INTERACTION_SOURCE_COUNT; ++source) {
    require(signals.envelope[source] == 0.0f && signals.peak[source] == 0.0f &&
            signals.rms[source] == 0.0f && signals.onset_strength[source] == 0.0f,
            "disabled snapshot retained values");
  }

  require(kessho_product_set_interaction_demand(analyzed, UINT32_MAX, UINT32_MAX) == KESSHO_PRODUCT_OK, "mask sanitization failed");
  require(kessho_product_copy_interaction_signals(analyzed, &signals) == KESSHO_PRODUCT_OK, "sanitized signal copy failed");
  require(signals.demand_mask == KESSHO_PRODUCT_INTERACTION_DEMAND_ALL, "demand mask was not sanitized");
  require(signals.source_mask == KESSHO_PRODUCT_INTERACTION_SOURCE_MASK_ALL, "source mask was not sanitized");

  KesshoProductEngine* events = kessho_product_create(48000.0, kFrames, 0u);
  require(events != nullptr, "event engine creation failed");
  KesshoProductSnapshotV2 event_snapshot = makeSnapshot();
  event_snapshot.transport.running = 0u;
  event_snapshot.transport.bpm = 400.0f;
  event_snapshot.transport.beats_per_bar = 1u;
  event_snapshot.transport.bars_per_phrase = 1u;
  require(kessho_product_load_snapshot_v2(events, &event_snapshot, sizeof(event_snapshot)) == KESSHO_PRODUCT_OK,
      "event snapshot load failed");
  require(kessho_product_set_interaction_demand(events, KESSHO_PRODUCT_INTERACTION_DEMAND_EVENTS, 0u) == KESSHO_PRODUCT_OK,
      "event demand enable failed");
  KesshoProductEvent start{};
  start.event_kind = KESSHO_PRODUCT_EVENT_KIND_START;
  KesshoProductEvent note{};
  note.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  note.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  note.value = 64.0f;
  note.value2 = 0.75f;
  note.value3 = 0.1f;
  require(kessho_product_enqueue_event(events, &start) == KESSHO_PRODUCT_OK, "start enqueue failed");
  require(kessho_product_enqueue_event(events, &note) == KESSHO_PRODUCT_OK, "note enqueue failed");
  kessho_product_render(events, left_a.data(), right_a.data(), kFrames);
  uint32_t count = kessho_product_drain_interaction_events(
      events, captured_events.data(), static_cast<uint32_t>(captured_events.size()), &overflow);
  require(count >= 2u, "start and manual voice events were not captured");
  require(captured_events[0].type == KESSHO_PRODUCT_INTERACTION_EVENT_TRANSPORT_STARTED,
      "transport start ordering changed");
  require(captured_events[1].type == KESSHO_PRODUCT_INTERACTION_EVENT_VOICE_TRIGGERED &&
          captured_events[1].child == KESSHO_PRODUCT_INTERACTION_CHILD_PAD1 &&
          captured_events[1].origin == KESSHO_PRODUCT_INTERACTION_ORIGIN_MANUAL,
      "manual source identity changed");

  for (uint32_t block = 0u; block < 64u; ++block) {
    kessho_product_render(events, left_a.data(), right_a.data(), kFrames);
  }
  count = kessho_product_drain_interaction_events(
      events, captured_events.data(), static_cast<uint32_t>(captured_events.size()), &overflow);
  bool found_beat = false, found_bar = false, found_phrase = false;
  for (uint32_t index = 0u; index < count; ++index) {
    found_beat |= captured_events[index].type == KESSHO_PRODUCT_INTERACTION_EVENT_TRANSPORT_BEAT;
    found_bar |= captured_events[index].type == KESSHO_PRODUCT_INTERACTION_EVENT_TRANSPORT_BAR;
    found_phrase |= captured_events[index].type == KESSHO_PRODUCT_INTERACTION_EVENT_TRANSPORT_PHRASE;
  }
  require(found_beat && found_bar && found_phrase, "transport clock events were not captured");

  KesshoProductEvent stop{};
  stop.event_kind = KESSHO_PRODUCT_EVENT_KIND_STOP;
  require(kessho_product_enqueue_event(events, &stop) == KESSHO_PRODUCT_OK, "stop enqueue failed");
  kessho_product_render(events, left_a.data(), right_a.data(), kFrames);
  count = kessho_product_drain_interaction_events(events, captured_events.data(), 1u, &overflow);
  require(count == 1u && captured_events[0].type == KESSHO_PRODUCT_INTERACTION_EVENT_TRANSPORT_STOPPED,
      "transport stop was not captured");

  for (uint32_t transition = 0u; transition < KESSHO_PRODUCT_INTERACTION_EVENT_CAPACITY + 12u; ++transition) {
    KesshoProductEvent toggle{};
    toggle.event_kind = (transition & 1u) == 0u
        ? KESSHO_PRODUCT_EVENT_KIND_START
        : KESSHO_PRODUCT_EVENT_KIND_STOP;
    require(kessho_product_enqueue_event(events, &toggle) == KESSHO_PRODUCT_OK, "overflow toggle enqueue failed");
    kessho_product_render(events, left_a.data(), right_a.data(), kFrames);
  }
  count = kessho_product_drain_interaction_events(
      events, captured_events.data(), static_cast<uint32_t>(captured_events.size()), &overflow);
  require(count == KESSHO_PRODUCT_INTERACTION_EVENT_CAPACITY && overflow > 0u,
      "event ring did not stay bounded");
  require(kessho_product_set_interaction_demand(events, 0u, 0u) == KESSHO_PRODUCT_OK, "event demand disable failed");
  require(kessho_product_drain_interaction_events(events, captured_events.data(), 1u, &overflow) == 0u && overflow == 0u,
      "event demand disable did not clear the ring");
  kessho_product_destroy(events);

  kessho_product_destroy(baseline);
  kessho_product_destroy(analyzed);
  std::cout << "Kessho Product interaction tests passed\n";
  return 0;
}
