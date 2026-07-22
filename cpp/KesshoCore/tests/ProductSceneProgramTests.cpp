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
    std::cerr << "Kessho Product scene program test failed: " << message << "\n";
    std::exit(1);
  }
}

void requireNear(float actual, float expected, const char* message) {
  if (std::fabs(actual - expected) > 1.0e-5f) {
    std::cerr << "Kessho Product scene program test failed: " << message
              << " expected=" << expected << " actual=" << actual << "\n";
    std::exit(1);
  }
}

void enqueue(KesshoProductEngine* engine, const KesshoProductEvent& event) {
  require(kessho_product_enqueue_event(engine, &event) == KESSHO_PRODUCT_OK, "event enqueue failed");
}

void renderBlock(KesshoProductEngine* engine) {
  float left[128]{};
  float right[128]{};
  kessho_product_render(engine, left, right, 128u);
}

void renderBlock(KesshoProductEngine* engine, float* left, float* right) {
  kessho_product_render(engine, left, right, 128u);
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
  snapshot.harmony.root_midi = 60.0f;
  snapshot.master.gain = 0.8f;
  kessho::product::tests::applyGeneratedSourceDefaults(snapshot);
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].enabled = 1u;
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].level = 0.2f;
  require(kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot)) == KESSHO_PRODUCT_OK,
      "snapshot load failed");
  return engine;
}

void uploadFixture(KesshoProductEngine* engine) {
  KesshoProductEvent begin{};
  begin.event_kind = KESSHO_PRODUCT_EVENT_KIND_BEGIN_SCENE_PROGRAM;
  begin.value = 1.0f;
  begin.value2 = 2.0f;
  begin.value3 = 17.0f;
  enqueue(engine, begin);

  KesshoProductEvent entry{};
  entry.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SCENE_ENTRY;
  entry.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  entry.index = 0u;
  entry.param_id = KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID;
  entry.value = 0.2f;
  entry.value2 = 0.8f;
  entry.value3 = 0.5f;
  entry.value4 = static_cast<float>(KESSHO_PRODUCT_EVENT_KIND_SET_PARAM);
  entry.flags = static_cast<uint32_t>(ProductSceneInterpolation::Linear);
  enqueue(engine, entry);

  for (uint32_t slot = 0u; slot < 2u; ++slot) {
    KesshoProductEvent header{};
    header.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SCENE_COMMAND_HEADER;
    header.index = slot;
    header.value2 = 0.5f;
    header.value3 = static_cast<float>(KESSHO_PRODUCT_EVENT_KIND_SET_HARMONY_ROOT);
    header.value4 = static_cast<float>(slot == 0u ? KESSHO_PRODUCT_SCENE_COMMAND_FORWARD : KESSHO_PRODUCT_SCENE_COMMAND_REVERSE);
    enqueue(engine, header);
    KesshoProductEvent values{};
    values.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SCENE_COMMAND_VALUES;
    values.index = slot;
    values.value = slot == 0u ? 72.0f : 48.0f;
    enqueue(engine, values);
  }
  KesshoProductEvent commit{};
  commit.event_kind = KESSHO_PRODUCT_EVENT_KIND_COMMIT_SCENE_PROGRAM;
  enqueue(engine, commit);
}

void setPosition(KesshoProductEngine* engine, float position) {
  KesshoProductEvent event{};
  event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SCENE_POSITION;
  event.value = position;
  enqueue(engine, event);
  renderBlock(engine);
}

void requireInterpolationAndBoundaryCommands() {
  KesshoProductEngine* engine = createEngine();
  uploadFixture(engine);
  setPosition(engine, 0.25f);
  requireNear(engine->sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].level, 0.35f, "quarter-position interpolation mismatch");
  requireNear(engine->harmony.root_midi, 48.0f, "scene commit did not establish the A-side command");
  setPosition(engine, 0.75f);
  requireNear(engine->sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].level, 0.65f, "three-quarter interpolation mismatch");
  requireNear(engine->harmony.root_midi, 72.0f, "forward boundary command did not fire");
  setPosition(engine, 0.25f);
  requireNear(engine->harmony.root_midi, 48.0f, "reverse boundary command did not fire");
  kessho_product_destroy(engine);
}

void requireCommitIsAtomic() {
  KesshoProductEngine* engine = createEngine();
  uploadFixture(engine);
  setPosition(engine, 1.0f);
  requireNear(engine->sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].level, 0.8f, "active program endpoint mismatch");
  KesshoProductEvent begin{};
  begin.event_kind = KESSHO_PRODUCT_EVENT_KIND_BEGIN_SCENE_PROGRAM;
  begin.value = 1.0f;
  enqueue(engine, begin);
  renderBlock(engine);
  setPosition(engine, 0.0f);
  requireNear(engine->sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].level, 0.2f, "uncommitted staging program replaced active state");
  kessho_product_destroy(engine);
}

void requireNonFiniteSceneValuesAreRejected() {
  KesshoProductEngine* engine = createEngine();
  KesshoProductEvent entry{};
  entry.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SCENE_ENTRY;
  entry.param_id = KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID;
  entry.value = std::numeric_limits<float>::quiet_NaN();
  entry.value2 = 0.8f;
  entry.value3 = 0.5f;
  entry.value4 = static_cast<float>(KESSHO_PRODUCT_EVENT_KIND_SET_PARAM);
  require(kessho_product_enqueue_event(engine, &entry) == KESSHO_PRODUCT_ERROR_INVALID_EVENT,
      "scene entry accepted a non-finite endpoint");

  KesshoProductEvent values{};
  values.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SCENE_COMMAND_VALUES;
  values.value2 = std::numeric_limits<float>::infinity();
  require(kessho_product_enqueue_event(engine, &values) == KESSHO_PRODUCT_ERROR_INVALID_EVENT,
      "scene command accepted non-finite values");
  kessho_product_destroy(engine);
}

void requireSoundscapeTargetsAndTelemetry() {
  KesshoProductEngine* engine = createEngine();
  ProductSceneProgramBuffer& active = engine->scene_program_runtime.buffers[0];
  SourceState& soundscape = engine->sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1u];
  soundscape.asset_ref_count = 1u;
  soundscape.asset_refs[0] = 7102u;
  soundscape.asset_ref_levels[0] = 0.8f;
  active.entry_count = 3u;
  active.revision = 91u;
  active.entries[0] = {
      KESSHO_PRODUCT_EVENT_KIND_SET_PARAM,
      kSoundscapeAssetLevelRangeTargetBase + 7102u,
      0u,
      KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID,
      0.0f,
      0.8f};
  active.entries[1] = {
      KESSHO_PRODUCT_EVENT_KIND_SET_PARAM,
      kSoundscapeTextureParamTargetBase + 2u,
      0u,
      KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID,
      0.1f,
      0.7f};
  active.entries[2] = {
      KESSHO_PRODUCT_EVENT_KIND_SET_PARAM,
      kSoundscapeModuleParamTargetBase,
      0u,
      KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID,
      0.0f,
      1.0f,
      0.5f,
      ProductSceneInterpolation::DiscreteA};
  engine->scene_program_runtime.active_buffer = 0u;
  engine->scene_program_runtime.active = true;
  setPosition(engine, 0.49f);
  const SourceState& soundscape_a = engine->sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1u];
  requireNear(engine->soundscapeAssetRefLevel(soundscape_a, 7102u), 0.392f, "soundscape asset gain interpolation mismatch");
  requireNear(soundscape_a.soundscape_texture_params[2], 0.394f, "soundscape texture interpolation mismatch");
  requireNear(soundscape_a.soundscape_module_params[0], 0.0f, "soundscape discrete parameter switched early");
  setPosition(engine, 0.5f);
  const SourceState& soundscape_b = engine->sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1u];
  requireNear(soundscape_b.soundscape_module_params[0], 1.0f, "soundscape discrete parameter did not switch");
  const KesshoProductTelemetry telemetry = kessho_product_get_telemetry(engine);
  require(telemetry.scene_program_revision == 91u, "scene telemetry revision mismatch");
  requireNear(telemetry.scene_position, 0.5f, "scene telemetry position mismatch");
  kessho_product_destroy(engine);
}

void requireMalformedCommitDoesNotSwap() {
  KesshoProductEngine* engine = createEngine();
  uploadFixture(engine);
  renderBlock(engine);
  const uint32_t active_buffer = engine->scene_program_runtime.active_buffer;
  KesshoProductEvent begin{};
  begin.event_kind = KESSHO_PRODUCT_EVENT_KIND_BEGIN_SCENE_PROGRAM;
  begin.value = 0.0f;
  begin.value2 = 1.0f;
  enqueue(engine, begin);
  KesshoProductEvent commit{};
  commit.event_kind = KESSHO_PRODUCT_EVENT_KIND_COMMIT_SCENE_PROGRAM;
  enqueue(engine, commit);
  renderBlock(engine);
  require(engine->telemetry.last_error_code == KESSHO_PRODUCT_ERROR_INVALID_EVENT, "malformed scene commit did not report an error");
  require(engine->scene_program_runtime.active_buffer == active_buffer, "malformed scene commit replaced active program");
  kessho_product_destroy(engine);
}

void requireCommitEstablishesCurrentBoundarySide() {
  KesshoProductEngine* engine = createEngine();
  uploadFixture(engine);
  setPosition(engine, 0.75f);
  requireNear(engine->harmony.root_midi, 72.0f, "initial B-side command did not apply");

  KesshoProductEvent begin{};
  begin.event_kind = KESSHO_PRODUCT_EVENT_KIND_BEGIN_SCENE_PROGRAM;
  begin.value2 = 1.0f;
  enqueue(engine, begin);
  KesshoProductEvent header{};
  header.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SCENE_COMMAND_HEADER;
  header.index = 0u;
  header.value2 = 0.5f;
  header.value3 = static_cast<float>(KESSHO_PRODUCT_EVENT_KIND_SET_HARMONY_ROOT);
  header.value4 = static_cast<float>(KESSHO_PRODUCT_SCENE_COMMAND_FORWARD);
  enqueue(engine, header);
  KesshoProductEvent values{};
  values.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SCENE_COMMAND_VALUES;
  values.index = 0u;
  values.value = 84.0f;
  enqueue(engine, values);
  KesshoProductEvent commit{};
  commit.event_kind = KESSHO_PRODUCT_EVENT_KIND_COMMIT_SCENE_PROGRAM;
  enqueue(engine, commit);
  renderBlock(engine);
  requireNear(engine->harmony.root_midi, 84.0f,
      "new scene did not establish its B-side command at an unchanged position");
  kessho_product_destroy(engine);
}

void requireAudibleBidirectionalPcmParity() {
  KesshoProductEngine* scene = createEngine();
  KesshoProductEngine* reference = createEngine();
  uploadFixture(scene);
  require(
      scene->triggerVoice(KESSHO_PRODUCT_SOURCE_PAD1, 60.0f, 0.8f, 2.0f, -1.0f, -1.0f, -1.0f, 77u) !=
          kProductInvalidVoiceIndex,
      "scene PCM voice trigger failed");
  require(
      reference->triggerVoice(KESSHO_PRODUCT_SOURCE_PAD1, 60.0f, 0.8f, 2.0f, -1.0f, -1.0f, -1.0f, 77u) !=
          kProductInvalidVoiceIndex,
      "reference PCM voice trigger failed");

  double dot = 0.0;
  double scene_energy = 0.0;
  double reference_energy = 0.0;
  const auto render_position = [&](float position) {
    KesshoProductEvent event{};
    event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SCENE_POSITION;
    event.value = position;
    enqueue(scene, event);
    reference->sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].level = 0.2f + position * 0.6f;
    reference->harmony.root_midi = position >= 0.5f ? 72.0f : 48.0f;
    float scene_left[128]{};
    float scene_right[128]{};
    float reference_left[128]{};
    float reference_right[128]{};
    renderBlock(scene, scene_left, scene_right);
    renderBlock(reference, reference_left, reference_right);
    for (uint32_t frame = 0u; frame < 128u; ++frame) {
      for (uint32_t channel = 0u; channel < 2u; ++channel) {
        const double actual = channel == 0u ? scene_left[frame] : scene_right[frame];
        const double expected = channel == 0u ? reference_left[frame] : reference_right[frame];
        dot += actual * expected;
        scene_energy += actual * actual;
        reference_energy += expected * expected;
      }
    }
  };

  for (uint32_t step = 0u; step <= 10u; ++step) render_position(static_cast<float>(step) / 10.0f);
  for (int32_t step = 10; step >= 0; --step) render_position(static_cast<float>(step) / 10.0f);
  require(scene_energy > 1.0e-8 && reference_energy > 1.0e-8, "scene PCM parity fixture rendered silence");
  const double correlation = dot / std::sqrt(scene_energy * reference_energy);
  const double loudness_delta_db = 10.0 * std::log10(scene_energy / reference_energy);
  require(correlation >= 0.9999, "scene PCM parity correlation fell below 0.9999");
  require(std::fabs(loudness_delta_db) < 0.1, "scene PCM parity loudness delta exceeded 0.1 dB");
  kessho_product_destroy(scene);
  kessho_product_destroy(reference);
}

} // namespace

int main() {
  requireInterpolationAndBoundaryCommands();
  requireCommitIsAtomic();
  requireNonFiniteSceneValuesAreRejected();
  requireSoundscapeTargetsAndTelemetry();
  requireMalformedCommitDoesNotSwap();
  requireCommitEstablishesCurrentBoundarySide();
  requireAudibleBidirectionalPcmParity();
  std::cout << "Kessho Product scene program tests passed\n";
  return 0;
}
