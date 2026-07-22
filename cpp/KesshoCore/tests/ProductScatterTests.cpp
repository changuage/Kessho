#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iostream>

#include "KesshoCore/KesshoProductCore.h"
#include "../src/product/KesshoProductEngineInternal.h"
#include "ProductSnapshotTestHelpers.h"

namespace {

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Kessho Product Scatter test failed: " << message << "\n";
    std::exit(1);
  }
}

void requireNear(float actual, float expected, const char* message) {
  if (std::fabs(actual - expected) > 0.00002f) {
    std::cerr << "Kessho Product Scatter test failed: " << message
              << " expected=" << expected << " actual=" << actual << "\n";
    std::exit(1);
  }
}

ProductScatterVoiceConfig denseFixtureConfig() {
  ProductScatterVoiceConfig config{};
  config.enabled = true;
  config.trigger_probability = 1.0f;
  config.burst_probability = 1.0f;
  config.feel_x = 0.0f;
  config.feel_y = -0.95f;
  config.anchor = 1.0f;
  config.breath = 0.0f;
  config.memory = 0.5f;
  config.motion = 1.0f;
  config.fracture = 0.6f;
  config.spread = 1.0f;
  return config;
}

void requirePhraseOracle() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128u, 0u);
  require(engine != nullptr, "oracle engine create failed");
  engine->scatter_runtime.active[DRUM_VOICE_CLICK] = denseFixtureConfig();
  const ProductScatterPhrase phrase = engine->generateScatterPhrase(DRUM_VOICE_CLICK, 1729u);
  require(phrase.steps == 2u, "oracle step count mismatch");
  require(phrase.hits == 2u, "oracle hit count mismatch");
  require(phrase.rotation == 0u, "oracle rotation mismatch");
  require(phrase.trigger_mask == 0x3u, "oracle trigger mask mismatch");
  require(phrase.clock_division == 8u, "oracle clock division mismatch");
  require(phrase.zone == ProductScatterZone::Pulse, "oracle zone mismatch");
  require(phrase.contour == ProductScatterContour::Stepped, "oracle contour mismatch");
  if (phrase.pitch[0] != 17 || phrase.pitch[1] != -41) {
    std::cerr << "Kessho Product Scatter test failed: oracle pitch mismatch actual="
              << phrase.pitch[0] << "," << phrase.pitch[1] << "\n";
    std::exit(1);
  }
  requireNear(phrase.expression[0], 0.852126071f, "oracle expression 0 mismatch");
  requireNear(phrase.expression[1], 0.692635627f, "oracle expression 1 mismatch");
  requireNear(phrase.morph[0], 0.901503970f, "oracle morph 0 mismatch");
  requireNear(phrase.morph[1], 0.0f, "oracle morph 1 mismatch");
  requireNear(phrase.distance[0], 0.171291509f, "oracle distance 0 mismatch");
  requireNear(phrase.distance[1], 0.954605903f, "oracle distance 1 mismatch");
  require(phrase.ratchet[0] == 1u && phrase.ratchet[1] == 2u, "oracle ratchet mismatch");
  kessho_product_destroy(engine);
}

void requireExtremePhraseOracle() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128u, 0u);
  require(engine != nullptr, "extreme oracle engine create failed");
  ProductScatterVoiceConfig config{};
  config.enabled = true;
  config.trigger_probability = 1.0f;
  config.burst_probability = 0.55f;
  config.feel_x = 0.9f;
  config.feel_y = 0.75f;
  config.anchor = 0.65f;
  config.breath = 0.3f;
  config.memory = 0.5f;
  config.motion = 0.9f;
  config.fracture = 0.7f;
  config.spread = 0.8f;
  engine->scatter_runtime.active[DRUM_VOICE_CLICK] = config;
  const ProductScatterPhrase phrase = engine->generateScatterPhrase(DRUM_VOICE_CLICK, 4091u);
  require(phrase.steps == 16u && phrase.hits == 9u && phrase.rotation == 0u, "extreme oracle shape mismatch");
  require(phrase.trigger_mask == 0x6ad5u, "extreme oracle trigger mask mismatch");
  require(phrase.clock_division == 16u, "extreme oracle clock division mismatch");
  requireNear(phrase.swing, 0.07f, "extreme oracle swing mismatch");
  require(phrase.zone == ProductScatterZone::Scatter, "extreme oracle zone mismatch");
  require(phrase.contour == ProductScatterContour::Scatter, "extreme oracle contour mismatch");
  const int32_t expected_pitch[16] = {-17, 0, 4, 0, 26, 0, -33, 4, 0, 41, 0, 15, 0, -2, 9, 0};
  const uint32_t expected_ratchet[16] = {2, 1, 2, 1, 1, 1, 1, 4, 1, 1, 1, 1, 1, 3, 1, 1};
  const float expected_expression[16] = {
      0.679111691f, 0.78f, 0.579077133f, 0.78f, 0.697068036f, 0.78f, 0.505133995f, 0.817999428f,
      0.78f, 0.583850965f, 0.78f, 0.491322256f, 0.78f, 0.520534656f, 0.694041424f, 0.78f};
  const float expected_morph[16] = {
      0.781399227f, 0.5f, 1.0f, 0.5f, 0.692210597f, 0.5f, 0.028480221f, 0.0f,
      0.5f, 0.483846456f, 0.5f, 0.530686862f, 0.5f, 0.976387915f, 0.397111198f, 0.5f};
  const float expected_distance[16] = {
      0.410000703f, 0.5f, 0.522670838f, 0.5f, 0.0f, 0.5f, 0.294770605f, 0.540805390f,
      0.5f, 0.115592768f, 0.5f, 0.317262905f, 0.5f, 0.308807423f, 0.665507892f, 0.5f};
  for (uint32_t step = 0u; step < 16u; ++step) {
    require(phrase.pitch[step] == expected_pitch[step], "extreme oracle pitch mismatch");
    require(phrase.ratchet[step] == expected_ratchet[step], "extreme oracle ratchet mismatch");
    requireNear(phrase.expression[step], expected_expression[step], "extreme oracle expression mismatch");
    requireNear(phrase.morph[step], expected_morph[step], "extreme oracle morph mismatch");
    requireNear(phrase.distance[step], expected_distance[step], "extreme oracle distance mismatch");
  }
  kessho_product_destroy(engine);
}

void enqueueVoiceConfig(KesshoProductEngine* engine, uint32_t voice, const ProductScatterVoiceConfig& config) {
  const struct Param { uint32_t id; float value; } params[] = {
      {KESSHO_PRODUCT_SCATTER_PARAM_ENABLED, config.enabled ? 1.0f : 0.0f},
      {KESSHO_PRODUCT_SCATTER_PARAM_TRIGGER_PROBABILITY, config.trigger_probability},
      {KESSHO_PRODUCT_SCATTER_PARAM_BURST_PROBABILITY, config.burst_probability},
      {KESSHO_PRODUCT_SCATTER_PARAM_RANDOM_WALK, config.random_walk},
      {KESSHO_PRODUCT_SCATTER_PARAM_RANDOM_WALK_ENABLED, config.random_walk_enabled ? 1.0f : 0.0f},
      {KESSHO_PRODUCT_SCATTER_PARAM_FEEL_X, config.feel_x},
      {KESSHO_PRODUCT_SCATTER_PARAM_FEEL_Y, config.feel_y},
      {KESSHO_PRODUCT_SCATTER_PARAM_ANCHOR, config.anchor},
      {KESSHO_PRODUCT_SCATTER_PARAM_BREATH, config.breath},
      {KESSHO_PRODUCT_SCATTER_PARAM_MEMORY, config.memory},
      {KESSHO_PRODUCT_SCATTER_PARAM_MOTION, config.motion},
      {KESSHO_PRODUCT_SCATTER_PARAM_FRACTURE, config.fracture},
      {KESSHO_PRODUCT_SCATTER_PARAM_SPREAD, config.spread},
  };
  for (const Param& param : params) {
    KesshoProductEvent event{};
    event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SCATTER_VOICE_PARAM;
    event.index = voice;
    event.param_id = param.id;
    event.value = param.value;
    require(kessho_product_enqueue_event(engine, &event) == KESSHO_PRODUCT_OK, "config event enqueue failed");
  }
}

void requireScheduledOffsets() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128u, 0u);
  require(engine != nullptr, "scheduler engine create failed");
  KesshoProductSnapshotV2 snapshot{};
  snapshot.version = KESSHO_PRODUCT_SNAPSHOT_VERSION;
  snapshot.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
  snapshot.transport.running = 1u;
  snapshot.transport.bpm = 120.0f;
  snapshot.transport.beats_per_bar = 4u;
  snapshot.transport.bars_per_phrase = 4u;
  snapshot.rng.seed = 1729u;
  snapshot.rng.state = 1729u;
  snapshot.master.gain = 0.8f;
  kessho::product::tests::applyGeneratedSourceDefaults(snapshot);
  snapshot.sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u].enabled = 1u;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK, "scheduler snapshot load failed");
  enqueueVoiceConfig(engine, DRUM_VOICE_CLICK, denseFixtureConfig());
  KesshoProductEvent commit{};
  commit.event_kind = KESSHO_PRODUCT_EVENT_KIND_COMMIT_SCATTER_CONFIG;
  require(kessho_product_enqueue_event(engine, &commit) == KESSHO_PRODUCT_OK, "scheduler commit enqueue failed");
  KesshoProductEvent enable{};
  enable.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SCATTER_ENABLED;
  enable.value = 1.0f;
  require(kessho_product_enqueue_event(engine, &enable) == KESSHO_PRODUCT_OK, "scheduler enable enqueue failed");
  KesshoSequencerEvent events[64]{};
  const int32_t count = kessho_product_debug_render_events(engine, events, 64u, 48000u);
  require(count > 0, "scheduler produced no events without host callbacks");
  uint32_t previous = 0u;
  for (int32_t index = 0; index < count; ++index) {
    require(events[index].sample_offset >= previous, "scheduler event offsets are not ordered");
    require(events[index].source_id == KESSHO_PRODUCT_SOURCE_DRUM, "scheduler event source mismatch");
    previous = events[index].sample_offset;
  }
  kessho_product_destroy(engine);
}

void requireExactRatchetOffsets() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128u, 0u);
  require(engine != nullptr, "exact scheduler engine create failed");
  engine->transport.running = true;
  engine->transport.bpm = 120.0f;
  engine->scatter_runtime.active[DRUM_VOICE_CLICK] = denseFixtureConfig();
  engine->scatter_runtime.current_phrase = engine->generateScatterPhrase(DRUM_VOICE_CLICK, 1729u);
  engine->scatter_runtime.current_voice = DRUM_VOICE_CLICK;
  engine->scatter_runtime.enabled = true;
  engine->scatter_runtime.phrase_start_frame = 0u;
  engine->scatter_runtime.global_cooldown_until_frame = UINT64_MAX;
  engine->scatter_runtime.next_selector_frame = UINT64_MAX;
  SequencerBuffer events{};
  engine->scheduleScatterEvents(24001u, events, false);
  require(events.count == 3u, "exact scheduler ratchet count mismatch");
  events.sortByOffset();
  require(events.events[0].sample_offset == 0u, "exact scheduler first hit offset mismatch");
  require(events.events[1].sample_offset == 12000u, "exact scheduler second-step offset mismatch");
  require(events.events[2].sample_offset == 18000u, "exact scheduler ratchet offset mismatch");
  require(events.events[0].midi_note == 37.0f && events.events[1].midi_note == 37.0f, "exact scheduler voice routing mismatch");
  require(events.events[0].send_granular == 17.0f, "exact scheduler first pitch mismatch");
  require(events.events[1].send_granular == -41.0f, "exact scheduler second pitch mismatch");
  requireNear(events.events[2].velocity, events.events[1].velocity * 0.82f, "exact scheduler ratchet velocity mismatch");
  kessho_product_destroy(engine);
}

KesshoProductEngine* createDeterministicSchedulerEngine() {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128u, 0u);
  require(engine != nullptr, "deterministic scheduler engine create failed");
  KesshoProductSnapshotV2 snapshot{};
  snapshot.version = KESSHO_PRODUCT_SNAPSHOT_VERSION;
  snapshot.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
  snapshot.transport.running = 1u;
  snapshot.transport.bpm = 120.0f;
  snapshot.transport.beats_per_bar = 4u;
  snapshot.transport.bars_per_phrase = 4u;
  snapshot.rng.seed = 9137u;
  snapshot.rng.state = 9137u;
  snapshot.master.gain = 0.8f;
  kessho::product::tests::applyGeneratedSourceDefaults(snapshot);
  snapshot.sources[KESSHO_PRODUCT_SOURCE_DRUM - 1u].enabled = 1u;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "deterministic scheduler snapshot load failed");
  ProductScatterVoiceConfig config = denseFixtureConfig();
  config.feel_y = -0.4f;
  enqueueVoiceConfig(engine, DRUM_VOICE_KICK, config);
  enqueueVoiceConfig(engine, DRUM_VOICE_CLICK, config);
  KesshoProductEvent commit{};
  commit.event_kind = KESSHO_PRODUCT_EVENT_KIND_COMMIT_SCATTER_CONFIG;
  require(kessho_product_enqueue_event(engine, &commit) == KESSHO_PRODUCT_OK,
      "deterministic scheduler commit enqueue failed");
  KesshoProductEvent enable{};
  enable.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SCATTER_ENABLED;
  enable.value = 1.0f;
  require(kessho_product_enqueue_event(engine, &enable) == KESSHO_PRODUCT_OK,
      "deterministic scheduler enable enqueue failed");
  return engine;
}

void requireDeterministicVoiceSelectionAndCooldown() {
  KesshoProductEngine* first = createDeterministicSchedulerEngine();
  KesshoProductEngine* second = createDeterministicSchedulerEngine();
  uint32_t previous_phrase_id = 0u;
  uint64_t previous_cooldown = 0u;
  uint32_t phrase_count = 0u;
  bool saw_kick = false;
  bool saw_click = false;
  for (uint32_t block = 0u; block < 6000u; ++block) {
    KesshoSequencerEvent first_events[16]{};
    KesshoSequencerEvent second_events[16]{};
    const int32_t first_count = kessho_product_debug_render_events(first, first_events, 16u, 128u);
    const int32_t second_count = kessho_product_debug_render_events(second, second_events, 16u, 128u);
    require(first_count == second_count, "deterministic scheduler event count diverged");
    for (int32_t event = 0; event < first_count; ++event) {
      require(first_events[event].sample_offset == second_events[event].sample_offset,
          "deterministic scheduler event offset diverged");
      require(first_events[event].midi_note == second_events[event].midi_note,
          "deterministic scheduler voice diverged");
      requireNear(first_events[event].velocity, second_events[event].velocity,
          "deterministic scheduler velocity diverged");
      requireNear(first_events[event].send_granular, second_events[event].send_granular,
          "deterministic scheduler pitch diverged");
    }
    require(first->scatter_runtime.current_phrase_id == second->scatter_runtime.current_phrase_id,
        "deterministic scheduler phrase ID diverged");
    require(first->scatter_runtime.current_voice == second->scatter_runtime.current_voice,
        "deterministic scheduler selected voice diverged");
    if (first->scatter_runtime.current_phrase_id != 0u &&
        first->scatter_runtime.current_phrase_id != previous_phrase_id) {
      require(first->scatter_runtime.phrase_start_frame >= previous_cooldown,
          "Scatter selected a phrase before the global cooldown ended");
      previous_phrase_id = first->scatter_runtime.current_phrase_id;
      previous_cooldown = first->scatter_runtime.global_cooldown_until_frame;
      ++phrase_count;
      saw_kick |= first->scatter_runtime.current_voice == DRUM_VOICE_KICK;
      saw_click |= first->scatter_runtime.current_voice == DRUM_VOICE_CLICK;
    }
  }
  require(phrase_count >= 5u, "deterministic scheduler produced too few phrases");
  require(saw_kick && saw_click, "deterministic scheduler did not select both eligible voices");
  kessho_product_destroy(first);
  kessho_product_destroy(second);
}

} // namespace

int main() {
  requirePhraseOracle();
  requireExtremePhraseOracle();
  requireScheduledOffsets();
  requireExactRatchetOffsets();
  requireDeterministicVoiceSelectionAndCooldown();
  std::cout << "Kessho Product Scatter tests passed\n";
  return 0;
}
