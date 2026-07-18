#include <array>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <limits>

#include "KesshoCore/KesshoProductCore.h"
#include "../src/product/KesshoProductEngineInternal.h"
#include "ProductSnapshotTestHelpers.h"

namespace {

constexpr uint32_t kBlockSize = 128u;
constexpr double kParitySampleRate = 48000.0;
constexpr uint32_t kParityBlocks = 3000u;
constexpr double kLongRunSampleRate = 1000.0;
constexpr uint64_t kFiveMinuteFrames = static_cast<uint64_t>(kLongRunSampleRate * 5.0 * 60.0);
constexpr uint64_t kFnvOffset = 1469598103934665603ull;
constexpr uint64_t kFnvPrime = 1099511628211ull;

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Kessho Product sonic autonomy test failed: " << message << "\n";
    std::exit(1);
  }
}

uint64_t hashU32(uint64_t hash, uint32_t value) {
  hash ^= value;
  return hash * kFnvPrime;
}

uint64_t hashFloat(uint64_t hash, float value) {
  require(std::isfinite(value), "render produced a non-finite sample");
  uint32_t bits = 0u;
  static_assert(sizeof(bits) == sizeof(value), "float hash width mismatch");
  std::memcpy(&bits, &value, sizeof(bits));
  return hashU32(hash, bits);
}

KesshoProductSnapshotV2 makeAutonomousSequencerSnapshot(uint32_t seed) {
  KesshoProductSnapshotV2 snapshot{};
  snapshot.version = KESSHO_PRODUCT_SNAPSHOT_VERSION;
  snapshot.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
  snapshot.transport.running = 1u;
  snapshot.transport.bpm = 120.0f;
  snapshot.transport.beats_per_bar = 4u;
  snapshot.transport.bars_per_phrase = 4u;
  snapshot.harmony.root_midi = 60.0f;
  snapshot.harmony.scale_id = 1u;
  snapshot.master.gain = 0.8f;
  snapshot.rng.seed = seed;
  snapshot.rng.state = seed;

  snapshot.synth_euclid.lane_count = 1u;
  auto& lane = snapshot.synth_euclid.lanes[0];
  lane.enabled = 1u;
  lane.target_source_id = KESSHO_PRODUCT_SOURCE_PAD1;
  lane.step_count = 8u;
  lane.fill_count = 5u;
  lane.clock_division = 16u;
  lane.probability = 0.72f;
  lane.ratchet = 1u;
  lane.midi_note = 60.0f;
  lane.velocity = 0.75f;
  lane.hold_seconds = 0.08f;
  lane.morph = 0.35f;
  lane.expression = 0.8f;
  lane.seed = seed ^ 0x91e10da5u;
  snapshot.drum_euclid.lane_count = 0u;

  kessho::product::tests::applyGeneratedSourceDefaults(snapshot);
  for (uint32_t index = 1u; index < 8u; ++index) {
    snapshot.sources[index].enabled = 0u;
  }
  return snapshot;
}

struct BoundedSonicTrace {
  uint64_t pcm_hash = kFnvOffset;
  uint64_t event_trace_hash = kFnvOffset;
  uint64_t rendered_frames = 0u;
  uint32_t rng_end_state = 0u;
  uint32_t hit_count = 0u;
};

BoundedSonicTrace renderAutonomyFixture(uint32_t seed, bool request_visible_host_telemetry) {
  KesshoProductEngine* engine = kessho_product_create(kParitySampleRate, kBlockSize, 0u);
  require(engine != nullptr, "autonomy fixture engine creation failed");
  const KesshoProductSnapshotV2 snapshot = makeAutonomousSequencerSnapshot(seed);
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "autonomy fixture snapshot load failed");

  std::array<float, kBlockSize> left{};
  std::array<float, kBlockSize> right{};
  BoundedSonicTrace trace{};
  for (uint32_t block = 0u; block < kParityBlocks; ++block) {
    kessho_product_render(engine, left.data(), right.data(), kBlockSize);
    for (uint32_t frame = 0u; frame < kBlockSize; ++frame) {
      trace.pcm_hash = hashFloat(trace.pcm_hash, left[frame]);
      trace.pcm_hash = hashFloat(trace.pcm_hash, right[frame]);
    }
    trace.event_trace_hash = hashU32(trace.event_trace_hash, engine->sequencer_events.count);
    trace.event_trace_hash = hashU32(trace.event_trace_hash, engine->rng_state);
    trace.rendered_frames += kBlockSize;

    if (request_visible_host_telemetry && block % 64u == 0u) {
      require(kessho_product_refresh_telemetry(engine) == KESSHO_PRODUCT_OK, "control telemetry refresh failed");
      KesshoProductTelemetry telemetry{};
      require(kessho_product_copy_telemetry(engine, &telemetry) == KESSHO_PRODUCT_OK, "control telemetry copy failed");
    }
  }

  require(kessho_product_refresh_telemetry(engine) == KESSHO_PRODUCT_OK, "final telemetry refresh failed");
  KesshoProductTelemetry telemetry{};
  require(kessho_product_copy_telemetry(engine, &telemetry) == KESSHO_PRODUCT_OK, "final telemetry copy failed");
  trace.rng_end_state = telemetry.rng_state;
  trace.hit_count = telemetry.synth_sequencer_hit_counts[0];
  trace.event_trace_hash = hashU32(trace.event_trace_hash, trace.rng_end_state);
  trace.event_trace_hash = hashU32(trace.event_trace_hash, trace.hit_count);
  kessho_product_destroy(engine);
  return trace;
}

void requireSuspendedHostParity() {
  const BoundedSonicTrace control = renderAutonomyFixture(0x1234567u, true);
  const BoundedSonicTrace suspended = renderAutonomyFixture(0x1234567u, false);
  require(control.rendered_frames == suspended.rendered_frames, "suspended host changed rendered frame count");
  require(control.pcm_hash == suspended.pcm_hash, "suspended host changed deterministic PCM");
  require(control.event_trace_hash == suspended.event_trace_hash, "suspended host changed event trace");
  require(control.rng_end_state == suspended.rng_end_state, "suspended host changed RNG end state");
  require(control.hit_count > 0u, "autonomy fixture generated no sequencer hits");

  const BoundedSonicTrace different_seed = renderAutonomyFixture(0x7654321u, false);
  require(
      different_seed.pcm_hash != suspended.pcm_hash ||
          different_seed.event_trace_hash != suspended.event_trace_hash,
      "different seed changed no random decision");
}

void requireFiveMinuteBoundedClockRun() {
  KesshoProductEngine* engine = kessho_product_create(kLongRunSampleRate, kBlockSize, 0u);
  require(engine != nullptr, "long-run engine creation failed");
  KesshoProductSnapshotV2 snapshot{};
  snapshot.version = KESSHO_PRODUCT_SNAPSHOT_VERSION;
  snapshot.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
  snapshot.transport.running = 1u;
  snapshot.transport.bpm = 120.0f;
  snapshot.transport.beats_per_bar = 4u;
  snapshot.transport.bars_per_phrase = 4u;
  snapshot.master.gain = 1.0f;
  snapshot.rng.seed = 23u;
  snapshot.rng.state = 23u;
  kessho::product::tests::applyGeneratedSourceDefaults(snapshot);
  for (auto& source : snapshot.sources) {
    source.enabled = 0u;
  }
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "long-run snapshot load failed");

  std::array<float, kBlockSize> left{};
  std::array<float, kBlockSize> right{};
  uint64_t rendered = 0u;
  uint64_t bounded_hash = kFnvOffset;
  while (rendered < kFiveMinuteFrames) {
    const uint32_t frames = static_cast<uint32_t>(
        std::min<uint64_t>(kBlockSize, kFiveMinuteFrames - rendered));
    kessho_product_render(engine, left.data(), right.data(), frames);
    bounded_hash = hashU32(bounded_hash, static_cast<uint32_t>(engine->transport.sample_frame));
    rendered += frames;
  }
  require(engine->transport.sample_frame == kFiveMinuteFrames, "five-minute transport frame mismatch");
  require(engine->control_event_count <= kessho::product::generated::KESSHO_PRODUCT_MAX_CONTROL_EVENTS, "control queue exceeded fixed capacity");
  require(
      engine->sequencer_events.count <= kessho::product::generated::KESSHO_PRODUCT_MAX_SEQUENCER_EVENTS,
      "sequencer buffer exceeded fixed capacity");
  require(bounded_hash != kFnvOffset, "long-run trace did not advance");
  kessho_product_destroy(engine);
}

KesshoProductEngine* makeDirectRuntimeEngine(double sample_rate, uint32_t seed = 31u) {
  KesshoProductEngine* engine = kessho_product_create(sample_rate, kBlockSize, 0u);
  require(engine != nullptr, "direct runtime engine creation failed");
  KesshoProductSnapshotV2 snapshot = makeAutonomousSequencerSnapshot(seed);
  snapshot.synth_euclid.lane_count = 0u;
  snapshot.transport.running = 1u;
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "direct runtime snapshot load failed");
  return engine;
}

void requireSourceMorphFrameMathAtRate(double sample_rate) {
  KesshoProductEngine* engine = makeDirectRuntimeEngine(sample_rate);
  const double phrase_frames = engine->transport.samplesPerPhrase(sample_rate);

  engine->configureSourceMorphAutomation(0u, true, ProductMorphMode::Linear, 8.0f, 101u);
  engine->transport.sample_frame = static_cast<uint64_t>(std::llround(phrase_frames * 4.0));
  engine->scheduleSourceMorphAutomation();
  require(std::fabs(engine->sources[0].morph - 0.5f) < 0.0001f, "linear morph midpoint mismatch");

  engine->configureSourceMorphAutomation(1u, true, ProductMorphMode::PingPong, 8.0f, 102u);
  const uint64_t ping_start = engine->transport.sample_frame;
  engine->transport.sample_frame = ping_start + static_cast<uint64_t>(std::llround(phrase_frames * 2.0));
  engine->scheduleSourceMorphAutomation();
  require(std::fabs(engine->sources[1].morph - 0.5f) < 0.0001f, "ping-pong rising midpoint mismatch");
  engine->transport.sample_frame = ping_start + static_cast<uint64_t>(std::llround(phrase_frames * 6.0));
  engine->scheduleSourceMorphAutomation();
  require(std::fabs(engine->sources[1].morph - 0.5f) < 0.0001f, "ping-pong falling midpoint mismatch");

  for (const float phrases : {1.0f, 8.0f, 32.0f, 1000.0f}) {
    engine->transport.sample_frame = 0u;
    engine->configureSourceMorphAutomation(2u, true, ProductMorphMode::Linear, phrases, 103u);
    const uint64_t duration = engine->sonic_runtime.source_morph[2].cycle_duration_frames;
    require(
        duration == static_cast<uint64_t>(std::llround(phrase_frames * phrases)),
        "morph cycle duration did not use integer frame distance");
    engine->transport.sample_frame = duration / 2u;
    engine->scheduleSourceMorphAutomation();
    require(std::fabs(engine->sources[2].morph - 0.5f) < 0.0002f, "long-horizon morph phase drifted");
  }

  for (uint32_t target = 0u; target < kProductSourceMorphAutomationCount; ++target) {
    engine->transport.sample_frame = 0u;
    engine->configureSourceMorphAutomation(target, true, ProductMorphMode::Linear, 1.0f, 200u + target);
    engine->transport.sample_frame = engine->sonic_runtime.source_morph[target].cycle_duration_frames / 2u;
    engine->scheduleSourceMorphAutomation();
    const float value = target < kProductDirectSourceMorphAutomationCount
        ? engine->sources[target].morph
        : engine->sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u]
            .drum_voice_morphs[target - kProductDirectSourceMorphAutomationCount];
    require(std::fabs(value - 0.5f) < 0.0002f, "one of the 11 source morph targets did not advance");
  }
  kessho_product_destroy(engine);
}

void requireSourceMorphSuspendedHostFixture() {
  for (const double sample_rate : {44100.0, 48000.0, 96000.0}) {
    requireSourceMorphFrameMathAtRate(sample_rate);
  }

  KesshoProductEngine* first = makeDirectRuntimeEngine(48000.0, 401u);
  KesshoProductEngine* second = makeDirectRuntimeEngine(48000.0, 401u);
  KesshoProductEngine* different = makeDirectRuntimeEngine(48000.0, 402u);

  KesshoProductSnapshotV2 configured_snapshot = makeAutonomousSequencerSnapshot(403u);
  configured_snapshot.synth_euclid.lane_count = 0u;
  configured_snapshot.sonic_runtime.source_morph[0] = {1u, 2u, 16.0f, 991u};
  KesshoProductEngine* configured = kessho_product_create(48000.0, kBlockSize, 0u);
  require(
      kessho_product_load_snapshot_v2(configured, &configured_snapshot, sizeof(configured_snapshot)) == KESSHO_PRODUCT_OK,
      "serialized source morph automation snapshot load failed");
  require(configured->sonic_runtime.source_morph[0].enabled == 1u, "snapshot did not enable source morph automation");
  require(configured->sonic_runtime.source_morph[0].mode == ProductMorphMode::Random, "snapshot lost source morph mode");
  require(configured->sonic_runtime.source_morph[0].phrases_per_cycle == 16.0f, "snapshot lost source morph duration");
  require(kessho_product_refresh_telemetry(configured) == KESSHO_PRODUCT_OK, "source morph telemetry refresh failed");
  const KesshoProductTelemetry configured_telemetry = kessho_product_get_telemetry(configured);
  require(
      (configured_telemetry.source_morph_automation_enabled_mask & 1u) != 0u,
      "source morph automation was absent from telemetry");
  for (KesshoProductEngine* engine : {first, second, different}) {
    engine->configureSourceMorphAutomation(0u, true, ProductMorphMode::Random, 1.0f, engine == different ? 402u : 401u);
    engine->transport.sample_frame = engine->sonic_runtime.source_morph[0].cycle_duration_frames;
    engine->scheduleSourceMorphAutomation();
  }
  require(first->sources[0].morph == second->sources[0].morph, "same seed changed Random morph sequence");
  require(first->sources[0].morph != different->sources[0].morph, "different seed did not change Random morph sequence");
  require(first->sonic_runtime.source_morph[0].last_random_cycle_index == 1u, "Random morph did not commit at the cycle boundary");
  const float held_random = first->sources[0].morph;
  first->transport.sample_frame += 128u;
  first->scheduleSourceMorphAutomation();
  require(first->sources[0].morph == held_random, "Random morph did not hold its cycle value");
  require(first->sonic_runtime.source_morph[0].last_random_cycle_index == 1u, "Random morph repeated its cycle decision");

  KesshoProductEvent manual{};
  manual.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
  manual.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  manual.param_id = KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID;
  manual.value = 0.73f;
  first->applySourceParam(manual);
  require(first->sonic_runtime.source_morph[0].enabled == 0u, "manual morph did not disable automation");
  require((first->sonic_runtime.source_morph_enabled_mask & 1u) == 0u, "manual morph left the target in the enabled mask");
  first->transport.sample_frame += first->sonic_runtime.source_morph[0].cycle_duration_frames;
  first->scheduleSourceMorphAutomation();
  require(std::fabs(first->sources[0].morph - 0.73f) < 0.0001f, "manual morph value was not held");

  kessho_product_destroy(first);
  kessho_product_destroy(second);
  kessho_product_destroy(different);
  kessho_product_destroy(configured);
}

struct SourceMorphParityTrace {
  uint64_t pcm_hash = kFnvOffset;
  uint64_t sample_frame = 0u;
  uint64_t random_cycle_index = 0u;
  float morph = 0.0f;
};

SourceMorphParityTrace renderSourceMorphParity(bool request_visible_host_telemetry) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, kBlockSize, 0u);
  require(engine != nullptr, "source morph parity engine creation failed");
  const KesshoProductSnapshotV2 snapshot = makeAutonomousSequencerSnapshot(451u);
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "source morph parity snapshot load failed");
  engine->configureSourceMorphAutomation(0u, true, ProductMorphMode::Random, 1.0f, 991u);

  std::array<float, kBlockSize> left{};
  std::array<float, kBlockSize> right{};
  SourceMorphParityTrace trace{};
  for (uint32_t block = 0u; block < 3001u; ++block) {
    kessho_product_render(engine, left.data(), right.data(), kBlockSize);
    for (uint32_t frame = 0u; frame < kBlockSize; ++frame) {
      trace.pcm_hash = hashFloat(trace.pcm_hash, left[frame]);
      trace.pcm_hash = hashFloat(trace.pcm_hash, right[frame]);
    }
    if (request_visible_host_telemetry && block % 64u == 0u) {
      require(kessho_product_refresh_telemetry(engine) == KESSHO_PRODUCT_OK, "source morph parity telemetry refresh failed");
    }
  }
  trace.sample_frame = engine->transport.sample_frame;
  trace.random_cycle_index = engine->sonic_runtime.source_morph[0].last_random_cycle_index;
  trace.morph = engine->sources[0].morph;
  kessho_product_destroy(engine);
  return trace;
}

void requireSourceMorphForegroundSuspendedParity() {
  const SourceMorphParityTrace foreground = renderSourceMorphParity(true);
  const SourceMorphParityTrace suspended = renderSourceMorphParity(false);
  require(foreground.pcm_hash == suspended.pcm_hash, "host suspension changed source morph PCM");
  require(foreground.sample_frame == suspended.sample_frame, "host suspension changed source morph sample time");
  require(foreground.random_cycle_index == 1u, "source morph parity fixture crossed no Random boundary");
  require(foreground.random_cycle_index == suspended.random_cycle_index, "host suspension changed source morph Random cursor");
  require(foreground.morph == suspended.morph, "host suspension changed source morph value");
}

void requireAutoStopAtRate(double sample_rate) {
  KesshoProductEngine* engine = makeDirectRuntimeEngine(sample_rate);
  constexpr uint64_t target_frame = 65u;
  KesshoProductEvent auto_stop{};
  auto_stop.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_AUTO_STOP;
  auto_stop.value = static_cast<float>(target_frame / sample_rate);
  require(kessho_product_enqueue_event(engine, &auto_stop) == KESSHO_PRODUCT_OK, "auto-stop event enqueue failed");
  std::array<float, 1> event_left{};
  std::array<float, 1> event_right{};
  kessho_product_render(engine, event_left.data(), event_right.data(), 1u);
  require(kessho_product_refresh_telemetry(engine) == KESSHO_PRODUCT_OK, "auto-stop telemetry refresh failed");
  const KesshoProductTelemetry armed_telemetry = kessho_product_get_telemetry(engine);
  require(armed_telemetry.auto_stop_enabled != 0u, "auto-stop armed state was absent from telemetry");
  require(armed_telemetry.auto_stop_target_sample_frame == target_frame, "auto-stop telemetry target frame mismatch");
  std::array<float, kBlockSize> left{};
  std::array<float, kBlockSize> right{};
  kessho_product_render(engine, left.data(), right.data(), kBlockSize);
  require(!engine->transport.running, "auto-stop did not stop without a host callback");
  require(engine->transport.sample_frame == target_frame, "auto-stop did not fire at the exact in-block sample");
  require(!engine->sonic_runtime.auto_stop.enabled, "auto-stop did not disarm after firing");

  auto_stop.value = -1.0f;
  require(
      kessho_product_enqueue_event(engine, &auto_stop) == KESSHO_PRODUCT_ERROR_INVALID_EVENT,
      "invalid auto-stop duration was accepted");
  kessho_product_destroy(engine);
}

void requireAutoStopDisablesJourneySchedule() {
  KesshoProductEngine* engine = makeDirectRuntimeEngine(48000.0);
  ProductJourneyScheduleBuffer& schedule = engine->journey_schedule_runtime.buffers[0];
  schedule.entry_count = 1u;
  schedule.loop_start_index = 0u;
  schedule.entries[0].hold_frames = 128u;
  schedule.entries[0].hold_set = true;
  schedule.entries[0].morph_set = true;
  schedule.entries[0].flags = 1u;
  engine->journey_schedule_runtime.active = true;
  engine->setJourneyScheduleEnabled(true);
  engine->configureProductAutoStop(true, 65.0 / 48000.0);

  std::array<float, kBlockSize> left{};
  std::array<float, kBlockSize> right{};
  kessho_product_render(engine, left.data(), right.data(), kBlockSize);
  require(!engine->transport.running, "auto-stop Journey fixture left transport running");
  require(!engine->journey_schedule_runtime.running, "auto-stop left Journey schedule running");
  require(engine->journey_schedule_runtime.phase == ProductJourneyPhase::Off,
      "auto-stop left Journey schedule armed");
  require(!engine->journey_running, "auto-stop left Journey morph runtime running");

  const uint32_t stopped_transition_count = engine->journey_schedule_runtime.transition_count;
  engine->transport.running = true;
  kessho_product_render(engine, left.data(), right.data(), kBlockSize);
  require(engine->journey_schedule_runtime.transition_count == stopped_transition_count,
      "transport restart resumed the auto-stopped Journey");
  engine->setJourneyScheduleEnabled(true);
  kessho_product_render(engine, left.data(), right.data(), kBlockSize);
  kessho_product_render(engine, left.data(), right.data(), kBlockSize);
  require(engine->journey_schedule_runtime.transition_count > stopped_transition_count,
      "explicit Journey restart did not resume transitions");
  kessho_product_destroy(engine);
}

struct AutoStopParityTrace {
  uint64_t pcm_hash = kFnvOffset;
  uint64_t sample_frame = 0u;
  bool running = true;
};

AutoStopParityTrace renderAutoStopParity(bool request_visible_host_telemetry) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, kBlockSize, 0u);
  require(engine != nullptr, "auto-stop parity engine creation failed");
  const KesshoProductSnapshotV2 snapshot = makeAutonomousSequencerSnapshot(461u);
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "auto-stop parity snapshot load failed");
  engine->configureProductAutoStop(true, 257.0 / 48000.0);

  std::array<float, kBlockSize> left{};
  std::array<float, kBlockSize> right{};
  AutoStopParityTrace trace{};
  for (uint32_t block = 0u; block < 4u; ++block) {
    kessho_product_render(engine, left.data(), right.data(), kBlockSize);
    for (uint32_t frame = 0u; frame < kBlockSize; ++frame) {
      trace.pcm_hash = hashFloat(trace.pcm_hash, left[frame]);
      trace.pcm_hash = hashFloat(trace.pcm_hash, right[frame]);
    }
    if (request_visible_host_telemetry) {
      require(kessho_product_refresh_telemetry(engine) == KESSHO_PRODUCT_OK, "auto-stop parity telemetry refresh failed");
    }
  }
  trace.sample_frame = engine->transport.sample_frame;
  trace.running = engine->transport.running;
  kessho_product_destroy(engine);
  return trace;
}

void requireAutoStopSuspendedHostFixture() {
  for (const double sample_rate : {44100.0, 48000.0, 96000.0}) {
    requireAutoStopAtRate(sample_rate);
  }
  const AutoStopParityTrace foreground = renderAutoStopParity(true);
  const AutoStopParityTrace suspended = renderAutoStopParity(false);
  require(foreground.pcm_hash == suspended.pcm_hash, "host suspension changed auto-stop PCM");
  require(foreground.sample_frame == 257u, "auto-stop parity fixture missed its target frame");
  require(foreground.sample_frame == suspended.sample_frame, "host suspension changed auto-stop frame");
  require(!foreground.running && !suspended.running, "auto-stop parity fixture remained running");
  requireAutoStopDisablesJourneySchedule();
}

void requireArpHarmonySuspendedHostFixture() {
  KesshoProductSnapshotV2 snapshot = makeAutonomousSequencerSnapshot(701u);
  auto& lane = snapshot.synth_euclid.lanes[0];
  lane.step_count = 1u;
  lane.fill_count = 1u;
  lane.manual_step_mask_low = 1u;
  lane.probability = 1.0f;
  lane.midi_note = 60.0f;
  snapshot.harmony.note_pool_count = 3u;
  snapshot.harmony.note_pool_midi[0] = 60.0f;
  snapshot.harmony.note_pool_midi[1] = 64.0f;
  snapshot.harmony.note_pool_midi[2] = 67.0f;
  KesshoProductEngine* engine = kessho_product_create(48000.0, kBlockSize, 0u);
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "arp autonomy snapshot load failed");

  KesshoProductEvent config{};
  config.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SYNTH_ARP_CONFIG;
  config.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
  config.param_id = 0x0fu;
  config.value = 1.0f;
  config.value2 = 4.0f;
  config.value3 = 1.0f;
  config.flags = KESSHO_PRODUCT_ARP_MUSICAL_CONFIG;
  require(kessho_product_enqueue_event(engine, &config) == KESSHO_PRODUCT_OK, "arp autonomy config enqueue failed");
  for (uint32_t step = 0u; step < 16u; ++step) {
    KesshoProductEvent arp_step{};
    arp_step.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SYNTH_ARP_STEP;
    arp_step.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
    arp_step.param_id = step;
    arp_step.value = -1.0f;
    arp_step.value2 = step < 4u ? 1.0f : 0.0f;
    arp_step.value4 = -1.0f;
    require(kessho_product_enqueue_event(engine, &arp_step) == KESSHO_PRODUCT_OK, "arp autonomy step enqueue failed");
  }
  KesshoProductEvent commit{};
  commit.event_kind = KESSHO_PRODUCT_EVENT_KIND_COMMIT_SYNTH_ARP_PATTERN;
  commit.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
  require(kessho_product_enqueue_event(engine, &commit) == KESSHO_PRODUCT_OK, "arp autonomy commit enqueue failed");

  KesshoSequencerEvent events[16]{};
  const int32_t first_count = kessho_product_debug_render_events(engine, events, 16u, 6000u);
  require(first_count == 4, "arp autonomy first harmony event count mismatch");
  for (int32_t index = 0; index < first_count; ++index) {
    require(
        events[index].midi_note == 60.0f || events[index].midi_note == 64.0f || events[index].midi_note == 67.0f,
        "arp autonomy did not use Product Core harmony");
  }
  engine->harmony.note_pool_midi[0] = 62.0f;
  engine->harmony.note_pool_midi[1] = 65.0f;
  engine->harmony.note_pool_midi[2] = 69.0f;
  const int32_t second_count = kessho_product_debug_render_events(engine, events, 16u, 6000u);
  require(second_count == 4, "arp autonomy suspended-host event count mismatch");
  for (int32_t index = 0; index < second_count; ++index) {
    require(
        events[index].midi_note == 62.0f || events[index].midi_note == 65.0f || events[index].midi_note == 69.0f,
        "arp did not follow harmony with host suspended");
  }
  kessho_product_destroy(engine);
}

struct RandomLiveParityTrace {
  uint64_t pcm_hash = kFnvOffset;
  uint64_t note_trace_hash = kFnvOffset;
  uint32_t random_counter = 0u;
  uint32_t note_change_count = 0u;
  float current_midi = -1.0f;
  float telemetry_midi = -1.0f;
};

RandomLiveParityTrace renderRandomLiveParity(uint32_t seed, bool request_visible_host_telemetry) {
  KesshoProductSnapshotV2 snapshot = makeAutonomousSequencerSnapshot(seed);
  auto& lane = snapshot.synth_euclid.lanes[0];
  lane.step_count = 1u;
  lane.fill_count = 1u;
  lane.manual_step_mask_low = 1u;
  lane.probability = 1.0f;
  lane.seed = seed ^ 0x91e10da5u;
  snapshot.harmony.note_pool_count = 4u;
  snapshot.harmony.note_pool_midi[0] = 60.0f;
  snapshot.harmony.note_pool_midi[1] = 62.0f;
  snapshot.harmony.note_pool_midi[2] = 65.0f;
  snapshot.harmony.note_pool_midi[3] = 69.0f;

  KesshoProductEngine* engine = kessho_product_create(48000.0, kBlockSize, 0u);
  require(engine != nullptr, "Random Live parity engine creation failed");
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "Random Live parity snapshot load failed");

  KesshoProductEvent config{};
  config.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SYNTH_ARP_CONFIG;
  config.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
  config.param_id = 0xffu;
  config.value = 1.0f;
  config.value2 = 8.0f;
  config.value3 = 1.0f;
  config.flags = KESSHO_PRODUCT_ARP_MUSICAL_CONFIG |
      static_cast<uint32_t>(ProductArpFlow::RandomLiveTone);
  require(kessho_product_enqueue_event(engine, &config) == KESSHO_PRODUCT_OK, "Random Live parity config enqueue failed");
  for (uint32_t step = 0u; step < 16u; ++step) {
    KesshoProductEvent arp_step{};
    arp_step.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SYNTH_ARP_STEP;
    arp_step.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
    arp_step.param_id = step;
    arp_step.value = -1.0f;
    arp_step.value2 = step < 8u ? 1.0f : 0.0f;
    arp_step.value4 = -1.0f;
    require(kessho_product_enqueue_event(engine, &arp_step) == KESSHO_PRODUCT_OK, "Random Live parity step enqueue failed");
  }
  KesshoProductEvent commit{};
  commit.event_kind = KESSHO_PRODUCT_EVENT_KIND_COMMIT_SYNTH_ARP_PATTERN;
  commit.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
  require(kessho_product_enqueue_event(engine, &commit) == KESSHO_PRODUCT_OK, "Random Live parity commit enqueue failed");

  std::array<float, kBlockSize> left{};
  std::array<float, kBlockSize> right{};
  RandomLiveParityTrace trace{};
  float previous_midi = -1.0f;
  uint32_t rendered_frames = 0u;
  while (rendered_frames < 12000u) {
    const uint32_t frames = std::min<uint32_t>(kBlockSize, 12000u - rendered_frames);
    kessho_product_render(engine, left.data(), right.data(), frames);
    for (uint32_t frame = 0u; frame < frames; ++frame) {
      trace.pcm_hash = hashFloat(trace.pcm_hash, left[frame]);
      trace.pcm_hash = hashFloat(trace.pcm_hash, right[frame]);
    }
    const float current_midi = engine->synth_lanes[0].arp.current_midi;
    trace.note_trace_hash = hashFloat(trace.note_trace_hash, current_midi);
    trace.note_trace_hash = hashU32(trace.note_trace_hash, engine->synth_lanes[0].arp.random_counter);
    if (current_midi >= 0.0f && current_midi != previous_midi) {
      ++trace.note_change_count;
      previous_midi = current_midi;
    }
    if (request_visible_host_telemetry && (rendered_frames / kBlockSize) % 8u == 0u) {
      require(kessho_product_refresh_telemetry(engine) == KESSHO_PRODUCT_OK, "Random Live parity telemetry refresh failed");
    }
    rendered_frames += frames;
  }
  require(kessho_product_refresh_telemetry(engine) == KESSHO_PRODUCT_OK, "Random Live final telemetry refresh failed");
  const KesshoProductTelemetry telemetry = kessho_product_get_telemetry(engine);
  trace.random_counter = engine->synth_lanes[0].arp.random_counter;
  trace.current_midi = engine->synth_lanes[0].arp.current_midi;
  trace.telemetry_midi = telemetry.synth_arp_current_midis[0];
  kessho_product_destroy(engine);
  return trace;
}

void requireRandomLiveForegroundSuspendedParity() {
  const RandomLiveParityTrace foreground = renderRandomLiveParity(731u, true);
  const RandomLiveParityTrace suspended = renderRandomLiveParity(731u, false);
  require(foreground.pcm_hash == suspended.pcm_hash, "host suspension changed Random Live PCM");
  require(foreground.note_trace_hash == suspended.note_trace_hash, "host suspension changed Random Live note trace");
  require(foreground.random_counter == suspended.random_counter, "host suspension changed Random Live RNG cursor");
  require(foreground.note_change_count > 1u, "Random Live changed no audible notes without host activity");
  require(foreground.current_midi == foreground.telemetry_midi, "Random Live telemetry did not match the audible MIDI");
  require(suspended.current_midi == suspended.telemetry_midi, "suspended Random Live telemetry did not match the audible MIDI");

  const RandomLiveParityTrace different_seed = renderRandomLiveParity(733u, false);
  require(
      different_seed.note_trace_hash != suspended.note_trace_hash ||
          different_seed.pcm_hash != suspended.pcm_hash,
      "different seed changed no Random Live decision");
}

void configureScatterClick(KesshoProductEngine* engine) {
  ProductScatterVoiceConfig& click = engine->scatter_runtime.staging[DRUM_VOICE_CLICK];
  click.enabled = true;
  click.trigger_probability = 1.0f;
  click.burst_probability = 0.55f;
  click.feel_x = 0.9f;
  click.feel_y = 0.75f;
  click.anchor = 0.65f;
  click.breath = 0.3f;
  click.memory = 0.5f;
  click.motion = 0.9f;
  click.fracture = 0.7f;
  click.spread = 0.8f;
  engine->commitScatterConfig();
  engine->setScatterEnabled(true);
}

void requireScatterSuspendedHostFixture() {
  KesshoProductSnapshotV2 snapshot = makeAutonomousSequencerSnapshot(809u);
  snapshot.synth_euclid.lane_count = 0u;
  snapshot.drum_euclid.lane_count = 0u;
  snapshot.transport.bpm = 120.0f;
  KesshoProductEngine* engine = kessho_product_create(kLongRunSampleRate, kBlockSize, 0u);
  require(engine != nullptr, "Scatter autonomy engine creation failed");
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "Scatter autonomy snapshot load failed");
  configureScatterClick(engine);

  constexpr uint32_t chunk_frames = 4096u;
  KesshoSequencerEvent events[128]{};
  uint64_t rendered = 0u;
  uint64_t event_count = 0u;
  while (rendered < kFiveMinuteFrames) {
    const uint32_t frames = static_cast<uint32_t>(std::min<uint64_t>(chunk_frames, kFiveMinuteFrames - rendered));
    const int32_t count = kessho_product_debug_render_events(engine, events, 128u, frames);
    require(count >= 0, "Scatter autonomy debug render failed");
    event_count += static_cast<uint32_t>(count);
    rendered += frames;
  }
  require(engine->transport.sample_frame == kFiveMinuteFrames, "Scatter autonomy clock did not reach five minutes");
  require(engine->scatter_runtime.voices[DRUM_VOICE_CLICK].phrase_counter >= 8u, "Scatter autonomy stopped generating phrases");
  require(engine->scatter_runtime.pulse_count >= 8u && event_count >= 8u, "Scatter autonomy stopped emitting hits");
  kessho_product_destroy(engine);
}

struct ScatterParityTrace {
  uint64_t pcm_hash = kFnvOffset;
  uint64_t runtime_hash = kFnvOffset;
  double energy = 0.0;
  uint32_t selector_rng_state = 0u;
  uint32_t voice_rng_state = 0u;
  uint32_t phrase_counter = 0u;
  uint32_t pulse_count = 0u;
  KesshoProductTelemetry telemetry{};
};

ScatterParityTrace renderScatterParity(uint32_t seed, bool request_visible_host_telemetry) {
  constexpr double sample_rate = 8000.0;
  constexpr uint32_t render_frames = 64000u;
  KesshoProductSnapshotV2 snapshot = makeAutonomousSequencerSnapshot(seed);
  snapshot.synth_euclid.lane_count = 0u;
  snapshot.drum_euclid.lane_count = 0u;
  snapshot.transport.bpm = 120.0f;
  for (auto& source : snapshot.sources) source.enabled = 0u;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u].enabled = 1u;
  KesshoProductEngine* engine = kessho_product_create(sample_rate, kBlockSize, 0u);
  require(engine != nullptr, "Scatter parity engine creation failed");
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "Scatter parity snapshot load failed");
  configureScatterClick(engine);

  std::array<float, kBlockSize> left{};
  std::array<float, kBlockSize> right{};
  ScatterParityTrace trace{};
  uint32_t rendered = 0u;
  while (rendered < render_frames) {
    const uint32_t frames = std::min<uint32_t>(kBlockSize, render_frames - rendered);
    kessho_product_render(engine, left.data(), right.data(), frames);
    for (uint32_t frame = 0u; frame < frames; ++frame) {
      trace.pcm_hash = hashFloat(trace.pcm_hash, left[frame]);
      trace.pcm_hash = hashFloat(trace.pcm_hash, right[frame]);
      trace.energy += static_cast<double>(left[frame]) * left[frame] +
          static_cast<double>(right[frame]) * right[frame];
    }
    trace.runtime_hash = hashU32(trace.runtime_hash, engine->scatter_runtime.current_phrase_id);
    trace.runtime_hash = hashU32(trace.runtime_hash, engine->scatter_runtime.current_voice);
    trace.runtime_hash = hashU32(trace.runtime_hash, engine->scatter_runtime.current_step);
    trace.runtime_hash = hashU32(trace.runtime_hash, engine->scatter_runtime.pulse_count);
    trace.runtime_hash = hashU32(trace.runtime_hash, engine->scatter_runtime.selector_rng_state);
    trace.runtime_hash = hashU32(
        trace.runtime_hash,
        engine->scatter_runtime.voices[DRUM_VOICE_CLICK].rng_state);
    if (request_visible_host_telemetry && (rendered / kBlockSize) % 16u == 0u) {
      require(kessho_product_refresh_telemetry(engine) == KESSHO_PRODUCT_OK, "Scatter parity telemetry refresh failed");
    }
    rendered += frames;
  }
  require(kessho_product_refresh_telemetry(engine) == KESSHO_PRODUCT_OK, "Scatter final telemetry refresh failed");
  trace.selector_rng_state = engine->scatter_runtime.selector_rng_state;
  trace.voice_rng_state = engine->scatter_runtime.voices[DRUM_VOICE_CLICK].rng_state;
  trace.phrase_counter = engine->scatter_runtime.voices[DRUM_VOICE_CLICK].phrase_counter;
  trace.pulse_count = engine->scatter_runtime.pulse_count;
  trace.telemetry = kessho_product_get_telemetry(engine);
  kessho_product_destroy(engine);
  return trace;
}

void requireScatterForegroundSuspendedParity() {
  const ScatterParityTrace foreground = renderScatterParity(821u, true);
  const ScatterParityTrace suspended = renderScatterParity(821u, false);
  require(foreground.energy > 0.0, "Scatter parity fixture rendered silence");
  require(foreground.pcm_hash == suspended.pcm_hash, "host suspension changed Scatter PCM");
  require(foreground.runtime_hash == suspended.runtime_hash, "host suspension changed Scatter runtime trace");
  require(foreground.selector_rng_state == suspended.selector_rng_state, "host suspension changed Scatter selector RNG");
  require(foreground.voice_rng_state == suspended.voice_rng_state, "host suspension changed Scatter voice RNG");
  require(foreground.phrase_counter > 0u && foreground.pulse_count > 0u, "Scatter parity fixture generated no phrases or pulses");
  require(foreground.phrase_counter == suspended.phrase_counter, "host suspension changed Scatter phrase count");
  require(foreground.pulse_count == suspended.pulse_count, "host suspension changed Scatter pulse count");
  require(foreground.telemetry.scatter_current_phrase_id == suspended.telemetry.scatter_current_phrase_id,
      "host suspension changed Scatter phrase telemetry");
  require(foreground.telemetry.scatter_current_voice == suspended.telemetry.scatter_current_voice,
      "host suspension changed Scatter voice telemetry");
  require(foreground.telemetry.scatter_current_step == suspended.telemetry.scatter_current_step,
      "host suspension changed Scatter step telemetry");
  require(foreground.telemetry.scatter_pulse_count == foreground.pulse_count,
      "Scatter telemetry did not match the audible pulse count");

  const ScatterParityTrace different_seed = renderScatterParity(823u, false);
  require(
      different_seed.runtime_hash != suspended.runtime_hash ||
          different_seed.pcm_hash != suspended.pcm_hash,
      "different seed changed no Scatter decision");
}

void requireSceneProgramSuspendedHostFixture() {
  KesshoProductSnapshotV2 snapshot = makeAutonomousSequencerSnapshot(907u);
  snapshot.synth_euclid.lane_count = 0u;
  KesshoProductEngine* engine = kessho_product_create(kLongRunSampleRate, kBlockSize, 0u);
  require(engine != nullptr, "scene autonomy engine creation failed");
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "scene autonomy snapshot load failed");
  ProductSceneProgramBuffer& active = engine->scene_program_runtime.buffers[0];
  active.entry_count = 1u;
  active.revision = 23u;
  active.entries[0].event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
  active.entries[0].target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  active.entries[0].param_id = KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID;
  active.entries[0].value_a = 0.2f;
  active.entries[0].value_b = 0.8f;
  engine->scene_program_runtime.active_buffer = 0u;
  engine->scene_program_runtime.active = true;
  engine->setSceneProgramPosition(0.75f);
  engine->scheduleSceneRuntimeEvents();

  constexpr uint32_t chunk_frames = 4096u;
  KesshoSequencerEvent events[4]{};
  uint64_t rendered = 0u;
  while (rendered < kFiveMinuteFrames) {
    const uint32_t frames = static_cast<uint32_t>(std::min<uint64_t>(chunk_frames, kFiveMinuteFrames - rendered));
    require(kessho_product_debug_render_events(engine, events, 4u, frames) >= 0,
        "scene autonomy debug render failed");
    rendered += frames;
  }
  require(engine->transport.sample_frame == kFiveMinuteFrames, "scene autonomy clock did not reach five minutes");
  require(std::fabs(engine->sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].level - 0.65f) < 1.0e-5f,
      "scene autonomy value changed while the host was suspended");
  require(engine->scene_program_runtime.buffers[0].revision == 23u,
      "scene autonomy program revision changed while suspended");
  kessho_product_destroy(engine);
}

void requireGlobalAutoCycleSuspendedHostFixture() {
  constexpr double sample_rate = 1000.0;
  constexpr uint32_t max_block = 2048u;
  KesshoProductSnapshotV2 snapshot = makeAutonomousSequencerSnapshot(991u);
  snapshot.synth_euclid.lane_count = 0u;
  KesshoProductEngine* engine = kessho_product_create(sample_rate, max_block, 0u);
  require(engine != nullptr, "auto-cycle engine creation failed");
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "auto-cycle snapshot load failed");
  engine->transport.phrase_seconds = 0.1f;
  auto& scene = engine->scene_program_runtime.buffers[0];
  scene.entry_count = 1u;
  scene.entries[0].event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
  scene.entries[0].target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  scene.entries[0].param_id = KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID;
  scene.entries[0].value_a = 0.2f;
  scene.entries[0].value_b = 0.8f;
  engine->scene_program_runtime.active_buffer = 0u;
  engine->scene_program_runtime.active = true;

  KesshoProductEvent config{};
  config.event_kind = KESSHO_PRODUCT_EVENT_KIND_CONFIGURE_GLOBAL_AUTO_CYCLE;
  config.value = 0.4f;
  config.value2 = 1.0f;
  config.value3 = 0.5f;
  config.value4 = 17.0f;
  config.flags = 1u;
  engine->configureGlobalAutoCycle(config);
  require(engine->auto_cycle_runtime.phase == ProductAutoCyclePhase::Hold,
      "auto-cycle did not preserve mid-morph entry hold");
  require(engine->auto_cycle_runtime.phase_end_frame == 100u,
      "auto-cycle hold was not exactly one phrase");
  engine->transport.running = false;
  engine->scheduleGlobalAutoCycle();
  require(engine->auto_cycle_runtime.phase == ProductAutoCyclePhase::Hold &&
          engine->auto_cycle_runtime.phase_end_frame == 100u,
      "auto-cycle advanced while transport was paused");
  engine->transport.running = true;
  engine->transport.sample_frame = 100u;
  engine->scheduleGlobalAutoCycle();
  require(engine->auto_cycle_runtime.phase == ProductAutoCyclePhase::Entry &&
          engine->auto_cycle_runtime.phase_end_frame == 150u,
      "auto-cycle entry phase duration was not sample exact");
  engine->transport.sample_frame = 150u;
  engine->scheduleGlobalAutoCycle();
  engine->scheduleSceneRuntimeEvents();
  require(engine->auto_cycle_runtime.phase == ProductAutoCyclePhase::PlayA &&
          engine->auto_cycle_runtime.phase_end_frame == 250u,
      "auto-cycle endpoint sequence did not enter PlayA");
  require(std::fabs(engine->sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].level - 0.2f) < 1.0e-6f,
      "auto-cycle entry did not apply endpoint A");
  KesshoProductEvent duration_update = config;
  duration_update.value2 = 2.0f;
  duration_update.value3 = 0.25f;
  duration_update.flags = 3u;
  engine->configureGlobalAutoCycle(duration_update);
  require(engine->auto_cycle_runtime.phase == ProductAutoCyclePhase::PlayA &&
          engine->auto_cycle_runtime.phase_end_frame == 250u,
      "auto-cycle duration update restarted the active phase");
  engine->transport.sample_frame = 250u;
  engine->scheduleGlobalAutoCycle();
  require(engine->auto_cycle_runtime.phase == ProductAutoCyclePhase::MorphAB &&
          engine->auto_cycle_runtime.phase_end_frame == 275u,
      "auto-cycle did not apply the updated transition duration at the next phase");
  engine->transport.sample_frame = 275u;
  engine->scheduleGlobalAutoCycle();
  engine->scheduleSceneRuntimeEvents();
  require(engine->auto_cycle_runtime.phase == ProductAutoCyclePhase::PlayB &&
          engine->auto_cycle_runtime.phase_end_frame == 475u,
      "auto-cycle did not apply the updated play duration at the next phase");
  require(std::fabs(engine->sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].level - 0.8f) < 1.0e-6f,
      "auto-cycle MorphAB did not apply endpoint B");
  engine->transport.sample_frame = 475u;
  engine->scheduleGlobalAutoCycle();
  require(engine->auto_cycle_runtime.phase == ProductAutoCyclePhase::MorphBA &&
          engine->auto_cycle_runtime.phase_end_frame == 500u,
      "auto-cycle did not enter sample-exact MorphBA");
  engine->transport.sample_frame = 500u;
  engine->scheduleGlobalAutoCycle();
  engine->scheduleSceneRuntimeEvents();
  require(engine->auto_cycle_runtime.phase == ProductAutoCyclePhase::PlayA &&
          engine->auto_cycle_runtime.phase_end_frame == 700u,
      "auto-cycle did not return to PlayA with the updated duration");
  require(std::fabs(engine->sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].level - 0.2f) < 1.0e-6f,
      "auto-cycle MorphBA did not restore endpoint A");

  engine->transport.sample_frame = 0u;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "auto-cycle transition-count snapshot reload failed");
  engine->transport.phrase_seconds = 0.001f;
  scene = {};
  scene.entry_count = 1u;
  scene.entries[0].event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
  scene.entries[0].target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  scene.entries[0].param_id = KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID;
  scene.entries[0].value_a = 0.2f;
  scene.entries[0].value_b = 0.8f;
  engine->scene_program_runtime.active_buffer = 0u;
  engine->scene_program_runtime.active = true;
  config.value = 0.0f;
  config.value2 = 1.0f;
  config.value3 = 1.0f;
  engine->configureGlobalAutoCycle(config);
  std::array<float, 1001u> left{};
  std::array<float, 1001u> right{};
  kessho_product_render(engine, left.data(), right.data(), 1001u);
  require(engine->auto_cycle_runtime.transition_count >= 1000u,
      "auto-cycle stopped before 1000 suspended-host transitions");
  kessho_product_destroy(engine);

  KesshoProductEngine* foreground = kessho_product_create(sample_rate, kBlockSize, 0u);
  KesshoProductEngine* suspended = kessho_product_create(sample_rate, kBlockSize, 0u);
  require(foreground != nullptr && suspended != nullptr, "auto-cycle parity engine creation failed");
  require(kessho_product_load_snapshot_v2(foreground, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "auto-cycle foreground snapshot load failed");
  require(kessho_product_load_snapshot_v2(suspended, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "auto-cycle suspended snapshot load failed");
  foreground->transport.phrase_seconds = 0.032f;
  suspended->transport.phrase_seconds = 0.032f;
  config.value = 0.4f;
  config.value2 = 1.0f;
  config.value3 = 1.0f;
  config.flags = 1u;
  const auto configure = [&config](KesshoProductEngine& target) {
    auto& active = target.scene_program_runtime.buffers[0];
    active.entry_count = 1u;
    active.entries[0].event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
    active.entries[0].target_id = KESSHO_PRODUCT_SOURCE_PAD1;
    active.entries[0].param_id = KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID;
    active.entries[0].value_a = 0.2f;
    active.entries[0].value_b = 0.8f;
    target.scene_program_runtime.active_buffer = 0u;
    target.scene_program_runtime.active = true;
    target.configureGlobalAutoCycle(config);
  };
  configure(*foreground);
  configure(*suspended);
  std::array<float, kBlockSize> foreground_l{};
  std::array<float, kBlockSize> foreground_r{};
  std::array<float, kBlockSize> suspended_l{};
  std::array<float, kBlockSize> suspended_r{};
  constexpr uint32_t parity_frames = 8u;
  uint32_t seen_phase_mask = 0u;
  for (uint32_t block = 0u; block < 512u; ++block) {
    kessho_product_render(foreground, foreground_l.data(), foreground_r.data(), parity_frames);
    if ((block % 4u) == 0u) {
      require(kessho_product_refresh_telemetry(foreground) == KESSHO_PRODUCT_OK,
          "auto-cycle foreground telemetry refresh failed");
      (void)kessho_product_get_telemetry(foreground);
    }
    kessho_product_render(suspended, suspended_l.data(), suspended_r.data(), parity_frames);
    require(std::memcmp(foreground_l.data(), suspended_l.data(), parity_frames * sizeof(float)) == 0 &&
            std::memcmp(foreground_r.data(), suspended_r.data(), parity_frames * sizeof(float)) == 0,
        "auto-cycle foreground/suspended PCM diverged");
    require(foreground->auto_cycle_runtime.phase == suspended->auto_cycle_runtime.phase &&
            foreground->auto_cycle_runtime.transition_count == suspended->auto_cycle_runtime.transition_count &&
            foreground->scene_program_runtime.position == suspended->scene_program_runtime.position,
        "auto-cycle foreground/suspended phase trace diverged");
    const uint32_t phase = static_cast<uint32_t>(foreground->auto_cycle_runtime.phase);
    if (phase >= 1u && phase <= 6u) seen_phase_mask |= 1u << (phase - 1u);
  }
  require(seen_phase_mask == 0x3fu, "auto-cycle parity fixture did not traverse all six phases");
  require(kessho_product_refresh_telemetry(foreground) == KESSHO_PRODUCT_OK &&
          kessho_product_refresh_telemetry(suspended) == KESSHO_PRODUCT_OK,
      "auto-cycle final telemetry refresh failed");
  const KesshoProductTelemetry foreground_telemetry = kessho_product_get_telemetry(foreground);
  const KesshoProductTelemetry suspended_telemetry = kessho_product_get_telemetry(suspended);
  require(foreground_telemetry.auto_cycle_revision == suspended_telemetry.auto_cycle_revision &&
          foreground_telemetry.auto_cycle_phase == suspended_telemetry.auto_cycle_phase &&
          foreground_telemetry.auto_cycle_position == suspended_telemetry.auto_cycle_position &&
          foreground_telemetry.auto_cycle_phase_start_frame ==
              suspended_telemetry.auto_cycle_phase_start_frame &&
          foreground_telemetry.auto_cycle_phase_end_frame ==
              suspended_telemetry.auto_cycle_phase_end_frame &&
          foreground_telemetry.auto_cycle_transition_count ==
              suspended_telemetry.auto_cycle_transition_count &&
          foreground_telemetry.auto_cycle_enabled == suspended_telemetry.auto_cycle_enabled,
      "auto-cycle foreground/suspended telemetry diverged");
  kessho_product_destroy(foreground);
  kessho_product_destroy(suspended);
}

void requireRoutingMuteGroupSuspendedHostFixture() {
  KesshoProductSnapshotV2 snapshot = makeAutonomousSequencerSnapshot(1009u);
  snapshot.synth_euclid.lane_count = 0u;
  KesshoProductEngine* engine = kessho_product_create(kLongRunSampleRate, kBlockSize, 0u);
  require(engine != nullptr, "routing mute autonomy engine creation failed");
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "routing mute autonomy snapshot load failed");

  auto& runtime = engine->routing_mute_groups;
  runtime.active[0].stored = true;
  runtime.active[0].eligible = true;
  runtime.active[0].mute_mask = 1u << kRoutingMuteRowPad1;
  runtime.active[0].min_hold_quarter_phrases = 1u;
  runtime.active[0].max_hold_quarter_phrases = 1u;
  runtime.active[0].transition_frames = 97u;
  runtime.active[1].stored = true;
  runtime.active[1].eligible = true;
  runtime.active[1].mute_mask = 1u << kRoutingMuteRowDrums;
  runtime.active[1].min_hold_quarter_phrases = 1u;
  runtime.active[1].max_hold_quarter_phrases = 2u;
  runtime.active[1].transition_frames = 97u;
  runtime.rng_state = 31u;
  runtime.avoid_repeat = true;
  runtime.enabled = true;
  runtime.next_change_frame = 0u;

  engine->scheduleRoutingMuteGroups(kBlockSize);
  require(runtime.active_slot < 2u, "routing mute runtime did not choose an eligible slot");
  require(runtime.non_unity_row_mask != 0u, "routing mute runtime did not mark an active fade row");
  const uint32_t first_slot = runtime.active_slot;
  const uint64_t first_change = runtime.next_change_frame;
  engine->transport.running = false;
  engine->scheduleRoutingMuteGroups(kBlockSize);
  require(runtime.next_change_frame == first_change, "routing mute runtime advanced while transport was paused");
  engine->transport.running = true;

  const uint32_t row = first_slot == 0u ? kRoutingMuteRowPad1 : kRoutingMuteRowDrums;
  float previous = 1.0f;
  for (uint64_t frame = 0u; frame <= 97u; ++frame) {
    const float gain = engine->routingMuteGainForFrame(row, frame);
    require(gain <= previous + 1.0e-6f, "routing mute fade-down was not sample-monotonic");
    previous = gain;
  }
  require(previous <= 0.0001f, "routing mute fade-down did not finish at zero");
  engine->recallRoutingMuteGroupAt(kProductRoutingMuteNoSlot, 0u, 98u);
  require(engine->routingMuteGainForFrame(row, 99u) == 1.0f, "routing mute reset did not restore unity");
  require(
      (runtime.non_unity_row_mask & (1u << row)) == 0u,
      "routing mute reset retained the per-sample slow path");

  KesshoSequencerEvent events[4]{};
  uint32_t transitions = runtime.trace_revision;
  for (uint32_t iteration = 0u; iteration < 2500u; ++iteration) {
    engine->scheduleRoutingMuteGroups(256u);
    require(kessho_product_debug_render_events(engine, events, 4u, 256u) >= 0,
        "routing mute suspended-host render failed");
    transitions = std::max(transitions, runtime.trace_revision);
  }
  require(transitions >= 8u, "routing mute random cycle stopped with the host suspended");
  require(runtime.active_slot != kProductRoutingMuteNoSlot, "routing mute random cycle lost its active slot");
  kessho_product_destroy(engine);

  snapshot.synth_euclid.lane_count = 1u;
  KesshoProductEngine* foreground = kessho_product_create(kLongRunSampleRate, kBlockSize, 0u);
  KesshoProductEngine* suspended = kessho_product_create(kLongRunSampleRate, kBlockSize, 0u);
  require(foreground != nullptr && suspended != nullptr, "routing mute parity engine creation failed");
  require(kessho_product_load_snapshot_v2(foreground, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "routing mute foreground snapshot load failed");
  require(kessho_product_load_snapshot_v2(suspended, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "routing mute suspended snapshot load failed");
  const auto configure = [](KesshoProductEngine& target) {
    auto& state = target.routing_mute_groups;
    state = {};
    for (uint32_t slot_index = 0u; slot_index < 2u; ++slot_index) {
      auto& slot = state.active[slot_index];
      slot.stored = true;
      slot.eligible = true;
      slot.mute_mask = 1u << (slot_index == 0u ? kRoutingMuteRowPad1 : kRoutingMuteRowDrums);
      slot.min_hold_quarter_phrases = 1u;
      slot.max_hold_quarter_phrases = 2u;
      slot.transition_frames = 97u;
      slot.synth_lane_enabled_mask = 1u;
    }
    state.baseline_synth_lane_enabled_mask = 1u;
    state.enabled = true;
    state.avoid_repeat = true;
    state.rng_state = 73u;
    state.next_change_frame = 0u;
  };
  configure(*foreground);
  configure(*suspended);
  std::array<float, kBlockSize> foreground_l{};
  std::array<float, kBlockSize> foreground_r{};
  std::array<float, kBlockSize> suspended_l{};
  std::array<float, kBlockSize> suspended_r{};
  uint32_t seen_slot_mask = 0u;
  bool saw_fade_down = false;
  bool saw_fade_up = false;
  bool saw_muted_hold = false;
  for (uint32_t block = 0u; block < 1000u; ++block) {
    kessho_product_render(foreground, foreground_l.data(), foreground_r.data(), kBlockSize);
    if ((block % 4u) == 0u) {
      require(kessho_product_refresh_telemetry(foreground) == KESSHO_PRODUCT_OK,
          "routing mute foreground telemetry refresh failed");
    }
    kessho_product_render(suspended, suspended_l.data(), suspended_r.data(), kBlockSize);
    require(std::memcmp(foreground_l.data(), suspended_l.data(), sizeof(foreground_l)) == 0,
        "routing mute foreground/suspended left PCM diverged");
    require(std::memcmp(foreground_r.data(), suspended_r.data(), sizeof(foreground_r)) == 0,
        "routing mute foreground/suspended right PCM diverged");
    require(foreground->routing_mute_groups.active_slot == suspended->routing_mute_groups.active_slot &&
            foreground->routing_mute_groups.next_slot == suspended->routing_mute_groups.next_slot &&
            foreground->routing_mute_groups.rng_state == suspended->routing_mute_groups.rng_state,
        "routing mute foreground/suspended slot or RNG trace diverged");
    const auto& foreground_state = foreground->routing_mute_groups;
    if (foreground_state.active_slot < 2u) seen_slot_mask |= 1u << foreground_state.active_slot;
    for (const auto& ramp : foreground_state.rows) {
      saw_fade_down |= ramp.target_gain <= 0.0001f && ramp.end_frame > 0u;
      saw_fade_up |= ramp.target_gain >= 0.9999f && ramp.end_frame > 0u;
      saw_muted_hold |= ramp.runtime_muted && ramp.target_gain <= 0.0001f &&
          ramp.end_frame <= foreground->transport.sample_frame;
    }
  }
  require(seen_slot_mask == 0x3u, "routing mute parity fixture did not traverse both eligible slots");
  require(saw_fade_down, "routing mute parity fixture traversed no fade-down");
  require(saw_fade_up, "routing mute parity fixture traversed no fade-up");
  require(saw_muted_hold, "routing mute parity fixture traversed no muted hold");
  kessho_product_destroy(foreground);
  kessho_product_destroy(suspended);
}

// Migration fixtures are added beside their Product Core owners in phases 8F-8L.
// The static ownership gate requires those named fixtures before declaring parity.
void requireBaselineSequencerAutonomyFixture() {
  requireSuspendedHostParity();
}

void requireGlobalAutoCycleEventValidation() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, kBlockSize, 0u);
  require(engine != nullptr, "auto-cycle validation engine creation failed");
  KesshoProductEvent event{};
  event.event_kind = KESSHO_PRODUCT_EVENT_KIND_CONFIGURE_GLOBAL_AUTO_CYCLE;
  event.value2 = 1.0f;
  event.value3 = 1.0f;
  require(kessho_product_enqueue_event(engine, &event) == KESSHO_PRODUCT_OK,
      "valid auto-cycle event was rejected");
  event.value = std::numeric_limits<float>::quiet_NaN();
  require(kessho_product_enqueue_event(engine, &event) == KESSHO_PRODUCT_ERROR_INVALID_EVENT,
      "non-finite auto-cycle event was accepted");
  kessho_product_destroy(engine);
}

} // namespace

int main() {
  requireBaselineSequencerAutonomyFixture();
  requireFiveMinuteBoundedClockRun();
  requireSourceMorphSuspendedHostFixture();
  requireSourceMorphForegroundSuspendedParity();
  requireAutoStopSuspendedHostFixture();
  requireArpHarmonySuspendedHostFixture();
  requireRandomLiveForegroundSuspendedParity();
  requireScatterSuspendedHostFixture();
  requireScatterForegroundSuspendedParity();
  requireSceneProgramSuspendedHostFixture();
  requireRoutingMuteGroupSuspendedHostFixture();
  requireGlobalAutoCycleEventValidation();
  requireGlobalAutoCycleSuspendedHostFixture();
  std::cout << "Kessho Product sonic autonomy baseline tests passed\n";
  return 0;
}
