#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <limits>

#include "KesshoCore/KesshoProductCore.h"
#include "../src/product/KesshoProductEngineInternal.h"
#include "ProductSnapshotTestHelpers.h"

namespace {

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Kessho Product Journey schedule test failed: " << message << "\n";
    std::exit(1);
  }
}

void requireNear(float actual, float expected, const char* message) {
  if (std::fabs(actual - expected) > 1.0e-5f) {
    std::cerr << "Kessho Product Journey schedule test failed: " << message
              << " expected=" << expected << " actual=" << actual << "\n";
    std::exit(1);
  }
}

KesshoProductEngine* createEngine() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128u, 0u);
  require(engine != nullptr, "engine create failed");
  KesshoProductSnapshotV2 snapshot{};
  snapshot.version = KESSHO_PRODUCT_SNAPSHOT_VERSION;
  snapshot.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
  snapshot.transport.running = 1u;
  snapshot.transport.bpm = 120.0f;
  snapshot.transport.beats_per_bar = 4u;
  snapshot.transport.bars_per_phrase = 4u;
  snapshot.master.gain = 0.8f;
  kessho::product::tests::applyGeneratedSourceDefaults(snapshot);
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].enabled = 1u;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].level = 0.2f;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "snapshot load failed");
  return engine;
}

void enqueue(KesshoProductEngine* engine, const KesshoProductEvent& event) {
  require(kessho_product_enqueue_event(engine, &event) == KESSHO_PRODUCT_OK, "event enqueue failed");
}

void render(KesshoProductEngine* engine) {
  float left[128]{};
  float right[128]{};
  kessho_product_render(engine, left, right, 128u);
}

void render(KesshoProductEngine* engine, float* left, float* right) {
  kessho_product_render(engine, left, right, 128u);
}

void uploadProgram(KesshoProductEngine* engine, uint32_t program_index, float from, float to) {
  KesshoProductEvent begin{};
  begin.event_kind = KESSHO_PRODUCT_EVENT_KIND_BEGIN_JOURNEY_TRANSITION_PROGRAM;
  begin.index = program_index;
  begin.value = 1.0f;
  begin.flags = 100u + program_index;
  enqueue(engine, begin);

  KesshoProductEvent entry{};
  entry.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_JOURNEY_TRANSITION_ENTRY;
  entry.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  entry.index = program_index << 16u;
  entry.param_id = KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID;
  entry.value = from;
  entry.value2 = to;
  entry.value3 = 0.5f;
  entry.value4 = static_cast<float>(KESSHO_PRODUCT_EVENT_KIND_SET_PARAM);
  entry.flags = static_cast<uint32_t>(ProductSceneInterpolation::Linear);
  enqueue(engine, entry);

  KesshoProductEvent commit{};
  commit.event_kind = KESSHO_PRODUCT_EVENT_KIND_COMMIT_JOURNEY_TRANSITION_PROGRAM;
  commit.index = program_index;
  enqueue(engine, commit);
}

void uploadEntry(
    KesshoProductEngine* engine,
    uint32_t index,
    uint32_t from,
    uint32_t to,
    uint32_t program,
    uint32_t hold,
    uint32_t morph,
    uint32_t flags = 0u) {
  KesshoProductEvent hold_event{};
  hold_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_JOURNEY_SCHEDULE_ENTRY_HOLD;
  hold_event.target_id = from | (to << 8u);
  hold_event.index = index;
  hold_event.param_id = program;
  hold_event.value = static_cast<float>(hold);
  hold_event.flags = flags;
  enqueue(engine, hold_event);

  KesshoProductEvent morph_event{};
  morph_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_JOURNEY_SCHEDULE_ENTRY_MORPH;
  morph_event.index = index;
  morph_event.value = static_cast<float>(morph);
  enqueue(engine, morph_event);
}

void uploadLoop(KesshoProductEngine* engine) {
  KesshoProductEvent begin{};
  begin.event_kind = KESSHO_PRODUCT_EVENT_KIND_BEGIN_JOURNEY_SCHEDULE;
  begin.target_id = 0xf1234567u;
  begin.value = 2.0f;
  begin.value2 = 2.0f;
  begin.value3 = 1.0f;
  begin.flags = 77u;
  enqueue(engine, begin);
  uploadEntry(engine, 0u, 0u, 1u, 0u, 128u, 256u);
  uploadEntry(engine, 1u, 1u, 0u, 1u, 128u, 256u);
  uploadProgram(engine, 0u, 0.2f, 0.8f);
  uploadProgram(engine, 1u, 0.8f, 0.2f);
  KesshoProductEvent commit{};
  commit.event_kind = KESSHO_PRODUCT_EVENT_KIND_COMMIT_JOURNEY_SCHEDULE;
  enqueue(engine, commit);
  KesshoProductEvent start{};
  start.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_JOURNEY_SCHEDULE_ENABLED;
  start.value = 1.0f;
  enqueue(engine, start);
}

void uploadFiniteJourney(KesshoProductEngine* engine) {
  KesshoProductEvent begin{};
  begin.event_kind = KESSHO_PRODUCT_EVENT_KIND_BEGIN_JOURNEY_SCHEDULE;
  begin.target_id = 0xf1234567u;
  begin.value = 1.0f;
  begin.value2 = 1.0f;
  begin.value3 = 0.0f;
  begin.flags = 79u;
  enqueue(engine, begin);
  uploadEntry(engine, 0u, 0u, 1u, 0u, 128u, 256u);
  uploadProgram(engine, 0u, 0.2f, 0.8f);
  KesshoProductEvent commit{};
  commit.event_kind = KESSHO_PRODUCT_EVENT_KIND_COMMIT_JOURNEY_SCHEDULE;
  enqueue(engine, commit);
  KesshoProductEvent start{};
  start.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_JOURNEY_SCHEDULE_ENABLED;
  start.value = 1.0f;
  enqueue(engine, start);
}

void requireScheduleExecutesAndLoops() {
  KesshoProductEngine* engine = createEngine();
  uploadLoop(engine);
  render(engine);
  require(engine->journey_schedule_runtime.phase == ProductJourneyPhase::Hold, "schedule did not start in hold");
  render(engine);
  require(engine->journey_schedule_runtime.phase == ProductJourneyPhase::Morph, "hold did not reach morph");
  render(engine);
  requireNear(engine->sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].level, 0.5f, "morph midpoint mismatch");
  render(engine);
  render(engine);
  requireNear(engine->sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].level, 0.8f, "morph endpoint mismatch");
  require(engine->journey_schedule_runtime.schedule_index == 1u, "schedule did not advance to second entry");
  for (uint32_t block = 0u; block < 4u; ++block) render(engine);
  require(engine->journey_schedule_runtime.schedule_index == 0u, "closed suffix did not restart");
  require(engine->journey_schedule_runtime.transition_count == 2u, "transition trace count mismatch");
  require(engine->journey_schedule_runtime.buffers[engine->journey_schedule_runtime.active_buffer].prepared_total_frames == 768u,
      "prepared frame total mismatch");
  const KesshoProductTelemetry telemetry = kessho_product_get_telemetry(engine);
  require(telemetry.journey_schedule_revision == 77u, "Journey telemetry revision mismatch");
  require(telemetry.journey_schedule_entry_count == 2u, "Journey telemetry entry count mismatch");
  require(telemetry.journey_prepared_total_frames == 768u, "Journey telemetry prepared frames mismatch");
  require(telemetry.journey_transition_count == 2u, "Journey telemetry transition count mismatch");
  kessho_product_destroy(engine);
}

void requireSelfLoopSkipsMorph() {
  KesshoProductEngine* engine = createEngine();
  KesshoProductEvent begin{};
  begin.event_kind = KESSHO_PRODUCT_EVENT_KIND_BEGIN_JOURNEY_SCHEDULE;
  begin.value = 1.0f;
  begin.value3 = 1.0f;
  enqueue(engine, begin);
  uploadEntry(engine, 0u, 0u, 0u, kProductJourneyNoProgram, 128u, 0u, 1u);
  KesshoProductEvent commit{};
  commit.event_kind = KESSHO_PRODUCT_EVENT_KIND_COMMIT_JOURNEY_SCHEDULE;
  enqueue(engine, commit);
  KesshoProductEvent start{};
  start.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_JOURNEY_SCHEDULE_ENABLED;
  start.value = 1.0f;
  enqueue(engine, start);
  render(engine);
  render(engine);
  require(engine->journey_schedule_runtime.phase == ProductJourneyPhase::Hold, "self-loop entered a morph phase");
  require(engine->journey_schedule_runtime.transition_count == 1u, "self-loop transition was not counted");
  kessho_product_destroy(engine);
}

void requireFiniteJourneyCompletesWithoutStoppingAudio() {
  KesshoProductEngine* engine = createEngine();
  uploadFiniteJourney(engine);
  KesshoProductEvent note{};
  note.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  note.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  note.value = 60.0f;
  note.value2 = 0.8f;
  note.value3 = 1.0f;
  enqueue(engine, note);

  for (uint32_t block = 0u; block < 4u; ++block) render(engine);
  require(engine->journey_schedule_runtime.phase == ProductJourneyPhase::FinalHold,
      "finite Journey did not enter final hold");
  require(!engine->journey_schedule_runtime.running, "finite Journey remained scheduled after completion");
  require(!engine->journey_running, "finite Journey left morph runtime running after completion");
  require(engine->transport.running, "finite Journey completion stopped the transport");
  requireNear(engine->sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].level, 0.8f,
      "finite Journey did not retain its final scene");

  float left[128]{};
  float right[128]{};
  render(engine, left, right);
  double energy = 0.0;
  for (uint32_t frame = 0u; frame < 128u; ++frame) {
    energy += static_cast<double>(left[frame]) * left[frame] +
        static_cast<double>(right[frame]) * right[frame];
  }
  require(energy > 1.0e-8, "finite Journey completion silenced final-scene audio");

  require(kessho_product_refresh_telemetry(engine) == KESSHO_PRODUCT_OK,
      "finite Journey telemetry refresh failed");
  const KesshoProductTelemetry telemetry = kessho_product_get_telemetry(engine);
  require(telemetry.journey_schedule_phase == static_cast<uint32_t>(ProductJourneyPhase::FinalHold),
      "finite Journey telemetry lost final-hold phase");
  require(telemetry.journey_schedule_running == 0u, "finite Journey telemetry remained running");
  require(telemetry.journey_morph_running == 0u, "finite Journey morph telemetry remained running");

  const uint32_t completed_transitions = engine->journey_schedule_runtime.transition_count;
  engine->transport.running = false;
  render(engine);
  engine->transport.running = true;
  render(engine);
  require(engine->journey_schedule_runtime.transition_count == completed_transitions,
      "transport restart restarted a completed Journey");
  require(engine->journey_schedule_runtime.phase == ProductJourneyPhase::FinalHold,
      "transport restart changed completed Journey phase");
  kessho_product_destroy(engine);
}

void requireMalformedCommitIsAtomic() {
  KesshoProductEngine* engine = createEngine();
  uploadLoop(engine);
  render(engine);
  const uint32_t active_buffer = engine->journey_schedule_runtime.active_buffer;
  KesshoProductEvent stop{};
  stop.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_JOURNEY_SCHEDULE_ENABLED;
  stop.value = 0.0f;
  enqueue(engine, stop);
  KesshoProductEvent begin{};
  begin.event_kind = KESSHO_PRODUCT_EVENT_KIND_BEGIN_JOURNEY_SCHEDULE;
  begin.value = 1.0f;
  enqueue(engine, begin);
  KesshoProductEvent commit{};
  commit.event_kind = KESSHO_PRODUCT_EVENT_KIND_COMMIT_JOURNEY_SCHEDULE;
  enqueue(engine, commit);
  render(engine);
  require(engine->telemetry.last_error_code == KESSHO_PRODUCT_ERROR_INVALID_EVENT, "malformed commit did not fail");
  require(engine->journey_schedule_runtime.active_buffer == active_buffer, "malformed commit replaced active schedule");
  kessho_product_destroy(engine);
}

void requireNonFiniteUploadValuesAreRejected() {
  KesshoProductEngine* engine = createEngine();
  KesshoProductEvent begin{};
  begin.event_kind = KESSHO_PRODUCT_EVENT_KIND_BEGIN_JOURNEY_SCHEDULE;
  begin.value = 1.0f;
  begin.value2 = 1.0f;
  enqueue(engine, begin);

  KesshoProductEvent entry{};
  entry.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_JOURNEY_TRANSITION_ENTRY;
  entry.index = 0u;
  entry.param_id = KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID;
  entry.value = std::numeric_limits<float>::quiet_NaN();
  entry.value2 = 0.8f;
  entry.value3 = 0.5f;
  entry.value4 = static_cast<float>(KESSHO_PRODUCT_EVENT_KIND_SET_PARAM);
  require(kessho_product_enqueue_event(engine, &entry) == KESSHO_PRODUCT_ERROR_INVALID_EVENT,
      "Journey transition accepted a non-finite endpoint");

  KesshoProductEvent values{};
  values.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_JOURNEY_TRANSITION_COMMAND_VALUES;
  values.value = std::numeric_limits<float>::infinity();
  require(kessho_product_enqueue_event(engine, &values) == KESSHO_PRODUCT_ERROR_INVALID_EVENT,
      "Journey transition accepted non-finite command values");
  kessho_product_destroy(engine);
}

void requireJourneyScheduleSuspendedHostFixture() {
  KesshoProductEngine* visible = createEngine();
  KesshoProductEngine* suspended = createEngine();
  uploadLoop(visible);
  uploadLoop(suspended);
  KesshoProductEvent note{};
  note.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  note.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  note.value = 60.0f;
  note.value2 = 0.8f;
  note.value3 = 1.0f;
  enqueue(visible, note);
  enqueue(suspended, note);
  double pcm_energy = 0.0;
  for (uint32_t block = 0u; block < 40u; ++block) {
    float visible_left[128]{};
    float visible_right[128]{};
    float suspended_left[128]{};
    float suspended_right[128]{};
    render(visible, visible_left, visible_right);
    render(suspended, suspended_left, suspended_right);
    const KesshoProductTelemetry visible_telemetry = kessho_product_get_telemetry(visible);
    for (uint32_t frame = 0u; frame < 128u; ++frame) {
      requireNear(visible_left[frame], suspended_left[frame], "suspended left PCM diverged");
      requireNear(visible_right[frame], suspended_right[frame], "suspended right PCM diverged");
      pcm_energy += static_cast<double>(visible_left[frame]) * visible_left[frame] +
          static_cast<double>(visible_right[frame]) * visible_right[frame];
    }
    require(visible->journey_schedule_runtime.schedule_index == suspended->journey_schedule_runtime.schedule_index,
        "suspended schedule index diverged");
    require(visible->journey_schedule_runtime.phase == suspended->journey_schedule_runtime.phase,
        "suspended phase diverged");
    requireNear(
        visible->sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].level,
        suspended->sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].level,
        "suspended scene value diverged");
    require(visible->journey_schedule_runtime.phase_start_frame == suspended->journey_schedule_runtime.phase_start_frame,
        "suspended phase-start trace diverged");
    require(visible->journey_schedule_runtime.phase_end_frame == suspended->journey_schedule_runtime.phase_end_frame,
        "suspended phase-end trace diverged");
    require(visible->journey_schedule_runtime.transition_count == suspended->journey_schedule_runtime.transition_count,
        "suspended transition-count trace diverged");
    require(visible->rng_state == suspended->rng_state, "suspended RNG state diverged");
    require(visible_telemetry.journey_transition_count == visible->journey_schedule_runtime.transition_count,
        "visible-host telemetry callback changed Journey trace ownership");
  }
  require(pcm_energy > 1.0e-8, "suspended-host PCM fixture rendered silence");
  kessho_product_destroy(visible);
  kessho_product_destroy(suspended);
}

} // namespace

int main() {
  requireScheduleExecutesAndLoops();
  requireSelfLoopSkipsMorph();
  requireFiniteJourneyCompletesWithoutStoppingAudio();
  requireMalformedCommitIsAtomic();
  requireNonFiniteUploadValuesAreRejected();
  requireJourneyScheduleSuspendedHostFixture();
  std::cout << "Kessho Product Journey schedule tests passed\n";
  return 0;
}
