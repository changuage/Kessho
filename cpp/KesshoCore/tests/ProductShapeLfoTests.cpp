#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iostream>

#include "KesshoCore/KesshoProductCore.h"
#include "KesshoProductParamIds.h"
#include "../src/product/KesshoProductEngineInternal.h"

namespace {

using kessho::product::internal::ModulationRange;
using kessho::product::internal::kProductControlOnlyModulationTarget;

constexpr double kSampleRate = 48000.0;
constexpr uint32_t kBlock = 128u;

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Kessho Product shape-LFO test failed: " << message << "\n";
    std::exit(1);
  }
}

uint32_t modulationFlags(
    uint32_t shape,
    uint32_t timing,
    uint32_t reference = KESSHO_PRODUCT_MODULATION_SYNC_REFERENCE_BAR,
    uint32_t division = KESSHO_PRODUCT_MODULATION_SYNC_DIVISION_1,
    float speed = 1.0f,
    bool source_b = false) {
  const uint32_t speed_bits = static_cast<uint32_t>(std::lround(speed * 1000.0f))
      << KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK_SPEED_SHIFT;
  return KESSHO_PRODUCT_MODULATION_RANGE_ACTIVE |
      (shape << KESSHO_PRODUCT_MODULATION_RANGE_SHAPE_SHIFT) |
      (timing << KESSHO_PRODUCT_MODULATION_RANGE_TIMING_SHIFT) |
      (reference == KESSHO_PRODUCT_MODULATION_SYNC_REFERENCE_PHRASE
          ? KESSHO_PRODUCT_MODULATION_RANGE_SYNC_REFERENCE
          : 0u) |
      (division << KESSHO_PRODUCT_MODULATION_RANGE_SYNC_DIVISION_SHIFT) |
      (source_b ? KESSHO_PRODUCT_MODULATION_RANGE_SOURCE_B : 0u) |
      speed_bits;
}

KesshoProductEngine* makeEngine() {
  KesshoProductEngine* engine = kessho_product_create(kSampleRate, kBlock, 77u);
  require(engine != nullptr, "engine allocation failed");
  return engine;
}

ModulationRange* applyShape(
    KesshoProductEngine& engine,
    uint32_t param_id,
    uint32_t control_id,
    float min_value,
    float max_value,
    uint32_t shape,
    uint32_t timing,
    uint32_t reference = KESSHO_PRODUCT_MODULATION_SYNC_REFERENCE_BAR,
    uint32_t division = KESSHO_PRODUCT_MODULATION_SYNC_DIVISION_1,
    float speed = 1.0f,
    bool source_b = false) {
  KesshoProductEvent event{};
  event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_MODULATION_RANGE;
  event.target_id = kProductControlOnlyModulationTarget;
  event.index = control_id;
  event.param_id = param_id;
  event.value = min_value;
  event.value2 = max_value;
  event.value3 = static_cast<float>(KESSHO_PRODUCT_MODULATION_RANGE_SHAPE_LFO);
  event.value4 = (min_value + max_value) * 0.5f;
  event.flags = modulationFlags(shape, timing, reference, division, speed, source_b);
  engine.applyModulationRangeEvent(event);
  require(engine.telemetry.last_error_code == KESSHO_PRODUCT_OK, "shape range apply failed");
  ModulationRange* range = engine.findModulationRange(
      kProductControlOnlyModulationTarget,
      param_id);
  require(range != nullptr, "shape range missing after apply");
  return range;
}

ModulationRange* applyWalk(
    KesshoProductEngine& engine,
    uint32_t param_id,
    uint32_t control_id,
    float min_value,
    float max_value,
    float current_value,
    float speed = 4.25f,
    bool source_b = false,
    uint32_t timing = KESSHO_PRODUCT_MODULATION_TIMING_LINK) {
  KesshoProductEvent event{};
  event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_MODULATION_RANGE;
  event.target_id = kProductControlOnlyModulationTarget;
  event.index = control_id;
  event.param_id = param_id;
  event.value = min_value;
  event.value2 = max_value;
  event.value3 = static_cast<float>(KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK);
  event.value4 = current_value;
  event.flags = KESSHO_PRODUCT_MODULATION_RANGE_ACTIVE |
      (timing << KESSHO_PRODUCT_MODULATION_RANGE_TIMING_SHIFT) |
      (static_cast<uint32_t>(std::lround(speed * 1000.0f))
          << KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK_SPEED_SHIFT) |
      (timing == KESSHO_PRODUCT_MODULATION_TIMING_LINK
          ? KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK_GLOBAL
          : 0u) |
      (source_b ? KESSHO_PRODUCT_MODULATION_RANGE_SOURCE_B : 0u);
  engine.applyModulationRangeEvent(event);
  require(engine.telemetry.last_error_code == KESSHO_PRODUCT_OK, "linked walk apply failed");
  return engine.findModulationRange(kProductControlOnlyModulationTarget, param_id);
}

void requireWaveformValues() {
  const float phases[] = {0.0f, 0.25f, 0.5f, 0.75f};
  const float expected[][4] = {
      {0.0f, 0.5f, 1.0f, 0.5f}, // sine
      {0.0f, 0.5f, 1.0f, 0.5f}, // triangle
      {0.0f, 0.0f, 1.0f, 1.0f}, // square
  };
  for (uint32_t shape = 0u; shape < 3u; ++shape) {
    KesshoProductEngine* engine = makeEngine();
    ModulationRange* range = applyShape(
        *engine,
        KESSHO_PRODUCT_PARAM_MASTER_GAIN_ID,
        100u + shape,
        0.0f,
        1.0f,
        shape,
        KESSHO_PRODUCT_MODULATION_TIMING_SYNC);
    engine->transport.running = true;
    range->sync_reference = KESSHO_PRODUCT_MODULATION_SYNC_REFERENCE_BAR;
    range->sync_division = KESSHO_PRODUCT_MODULATION_SYNC_DIVISION_1;
    for (uint32_t index = 0u; index < 4u; ++index) {
      engine->transport.bar_position_origin = phases[index];
      engine->advanceModulationRanges(1u);
      require(
          std::fabs(range->current_value - expected[shape][index]) < 0.001f,
          "waveform value mismatch");
    }
    kessho_product_destroy(engine);
  }
}

void requireLinkAndFreeModes() {
  KesshoProductEngine* linked = makeEngine();
  ModulationRange* link_a = applyShape(
      *linked,
      KESSHO_PRODUCT_PARAM_MASTER_GAIN_ID,
      200u,
      0.0f,
      1.0f,
      KESSHO_PRODUCT_MODULATION_SHAPE_SINE,
      KESSHO_PRODUCT_MODULATION_TIMING_LINK,
      KESSHO_PRODUCT_MODULATION_SYNC_REFERENCE_BAR,
      KESSHO_PRODUCT_MODULATION_SYNC_DIVISION_1,
      1.75f);
  ModulationRange* link_b = applyShape(
      *linked,
      KESSHO_PRODUCT_PARAM_MASTER_LIMITER_CEILING_DB_ID,
      201u,
      -2.0f,
      4.0f,
      KESSHO_PRODUCT_MODULATION_SHAPE_SINE,
      KESSHO_PRODUCT_MODULATION_TIMING_LINK,
      KESSHO_PRODUCT_MODULATION_SYNC_REFERENCE_BAR,
      KESSHO_PRODUCT_MODULATION_SYNC_DIVISION_1,
      1.75f);
  linked->advanceModulationRanges(4800u);
  const float normalized_a = link_a->current_value;
  const float normalized_b = (link_b->current_value + 2.0f) / 6.0f;
  require(std::fabs(normalized_a - normalized_b) < 0.00001f, "linked shape ranges diverged");

  ModulationRange* walk_a = applyWalk(*linked, KESSHO_PRODUCT_PARAM_FX_DELAY_AMIX_ID, 202u, 0.0f, 1.0f, 0.2f);
  ModulationRange* walk_b = applyWalk(*linked, KESSHO_PRODUCT_PARAM_FX_DELAY_BMIX_ID, 203u, 10.0f, 20.0f, 17.5f);
  linked->advanceModulationRanges(4800u);
  const float walk_normalized_a = walk_a->current_value;
  const float walk_normalized_b = (walk_b->current_value - 10.0f) / 10.0f;
  require(std::fabs(walk_normalized_a - walk_normalized_b) < 0.00001f, "linked walk state was not shared");

  ModulationRange* shape_slot_b = applyShape(
      *linked,
      KESSHO_PRODUCT_PARAM_FX_REVERB_MIX_ID,
      204u,
      0.0f,
      1.0f,
      KESSHO_PRODUCT_MODULATION_SHAPE_SINE,
      KESSHO_PRODUCT_MODULATION_TIMING_LINK,
      KESSHO_PRODUCT_MODULATION_SYNC_REFERENCE_BAR,
      KESSHO_PRODUCT_MODULATION_SYNC_DIVISION_1,
      3.0f,
      true);
  linked->advanceModulationRanges(4800u);
  require(std::fabs(shape_slot_b->current_value - link_a->current_value) > 0.00001f,
      "Mod A and Mod B linked shape buses were coupled");

  ModulationRange* walk_slot_b = applyWalk(
      *linked,
      KESSHO_PRODUCT_PARAM_FX_GRANULAR_MIX_ID,
      205u,
      0.0f,
      1.0f,
      0.5f,
      0.5f,
      true);
  linked->advanceModulationRanges(48000u);
  require(std::fabs(walk_slot_b->current_value - walk_a->current_value) > 0.00001f,
      "Mod A and Mod B linked walk buses were coupled");
  kessho_product_destroy(linked);

  KesshoProductEngine* free = makeEngine();
  ModulationRange* free_a = applyShape(
      *free,
      KESSHO_PRODUCT_PARAM_MASTER_GAIN_ID,
      210u,
      0.0f,
      1.0f,
      KESSHO_PRODUCT_MODULATION_SHAPE_SINE,
      KESSHO_PRODUCT_MODULATION_TIMING_FREE,
      KESSHO_PRODUCT_MODULATION_SYNC_REFERENCE_BAR,
      KESSHO_PRODUCT_MODULATION_SYNC_DIVISION_1,
      1.0f);
  ModulationRange* free_b = applyShape(
      *free,
      KESSHO_PRODUCT_PARAM_MASTER_LIMITER_CEILING_DB_ID,
      211u,
      0.0f,
      1.0f,
      KESSHO_PRODUCT_MODULATION_SHAPE_SINE,
      KESSHO_PRODUCT_MODULATION_TIMING_FREE,
      KESSHO_PRODUCT_MODULATION_SYNC_REFERENCE_BAR,
      KESSHO_PRODUCT_MODULATION_SYNC_DIVISION_1,
      1.0f);
  free->advanceModulationRanges(4800u);
  require(std::fabs(free_a->current_value - free_b->current_value) > 0.00001f, "free shape oscillators were coupled");

  ModulationRange* free_walk_a = applyWalk(
      *free, KESSHO_PRODUCT_PARAM_FX_DELAY_AMIX_ID, 212u, 0.0f, 1.0f, 0.5f, 1.0f, false,
      KESSHO_PRODUCT_MODULATION_TIMING_FREE);
  ModulationRange* free_walk_b = applyWalk(
      *free, KESSHO_PRODUCT_PARAM_FX_DELAY_BMIX_ID, 213u, 0.0f, 1.0f, 0.5f, 1.0f, false,
      KESSHO_PRODUCT_MODULATION_TIMING_FREE);
  free->advanceModulationRanges(48000u);
  require(std::fabs(free_walk_a->current_value - free_walk_b->current_value) > 0.00001f,
      "free random walks were coupled");
  kessho_product_destroy(free);
}

void requirePhraseRelativeFreeAndLinkRate() {
  KesshoProductEngine* engine = makeEngine();
  engine->transport.phrase_seconds = 8.0f;
  ModulationRange* free = applyShape(
      *engine,
      KESSHO_PRODUCT_PARAM_MASTER_GAIN_ID,
      220u,
      0.0f,
      1.0f,
      KESSHO_PRODUCT_MODULATION_SHAPE_TRIANGLE,
      KESSHO_PRODUCT_MODULATION_TIMING_FREE,
      KESSHO_PRODUCT_MODULATION_SYNC_REFERENCE_PHRASE,
      KESSHO_PRODUCT_MODULATION_SYNC_DIVISION_1,
      2.0f);
  ModulationRange* link = applyShape(
      *engine,
      KESSHO_PRODUCT_PARAM_MASTER_LIMITER_CEILING_DB_ID,
      221u,
      0.0f,
      1.0f,
      KESSHO_PRODUCT_MODULATION_SHAPE_TRIANGLE,
      KESSHO_PRODUCT_MODULATION_TIMING_LINK,
      KESSHO_PRODUCT_MODULATION_SYNC_REFERENCE_PHRASE,
      KESSHO_PRODUCT_MODULATION_SYNC_DIVISION_1,
      2.0f);
  free->shape_lfo_phase = 0.0f;
  engine->modulation_link_shape_phase[0] = 0.0f;

  // Two cycles per eight-second phrase means a four-second cycle. After one
  // second, both triangle waves must be one quarter through the cycle (0.5).
  engine->advanceModulationRanges(static_cast<uint32_t>(kSampleRate));
  require(std::fabs(free->current_value - 0.5f) < 0.0001f,
      "free shape speed did not follow the effective phrase");
  require(std::fabs(link->current_value - 0.5f) < 0.0001f,
      "linked shape speed did not follow the effective phrase");
  kessho_product_destroy(engine);
}

void requireSyncAndStoppedTransport() {
  KesshoProductEngine* engine = makeEngine();
  ModulationRange* sync = applyShape(
      *engine,
      KESSHO_PRODUCT_PARAM_MASTER_GAIN_ID,
      300u,
      0.0f,
      1.0f,
      KESSHO_PRODUCT_MODULATION_SHAPE_TRIANGLE,
      KESSHO_PRODUCT_MODULATION_TIMING_SYNC);
  engine->transport.running = true;
  engine->transport.bar_position_origin = 0.0;
  engine->transport.sample_frame = 0u;
  const uint64_t bar_frames = static_cast<uint64_t>(std::llround(
      engine->transport.samplesPerBeat(kSampleRate) *
      static_cast<double>(engine->transport.beats_per_bar)));
  engine->advanceModulationRanges(static_cast<uint32_t>(bar_frames / 2u));
  engine->transport.sample_frame = bar_frames / 2u;
  engine->advanceModulationRanges(static_cast<uint32_t>(bar_frames - bar_frames / 2u));
  require(std::fabs(sync->current_value) < 0.00001f, "sync phase drifted over one bar");
  const float stopped_value = sync->current_value;
  engine->transport.running = false;
  engine->advanceModulationRanges(static_cast<uint32_t>(bar_frames / 4u));
  require(std::fabs(sync->current_value - stopped_value) > 0.00001f,
      "sync preview froze while transport stopped");
  engine->transport.running = true;
  engine->transport.sample_frame = 0u;
  engine->advanceModulationRanges(1u);
  require(std::fabs(sync->current_value) < 0.0001f,
      "sync preview did not return to deterministic transport phase");
  kessho_product_destroy(engine);

  KesshoProductEngine* free = makeEngine();
  ModulationRange* free_range = applyShape(
      *free,
      KESSHO_PRODUCT_PARAM_MASTER_GAIN_ID,
      301u,
      0.0f,
      1.0f,
      KESSHO_PRODUCT_MODULATION_SHAPE_TRIANGLE,
      KESSHO_PRODUCT_MODULATION_TIMING_FREE,
      KESSHO_PRODUCT_MODULATION_SYNC_REFERENCE_BAR,
      KESSHO_PRODUCT_MODULATION_SYNC_DIVISION_1,
      1.0f);
  ModulationRange* link_range = applyShape(
      *free,
      KESSHO_PRODUCT_PARAM_MASTER_LIMITER_CEILING_DB_ID,
      302u,
      0.0f,
      1.0f,
      KESSHO_PRODUCT_MODULATION_SHAPE_TRIANGLE,
      KESSHO_PRODUCT_MODULATION_TIMING_LINK,
      KESSHO_PRODUCT_MODULATION_SYNC_REFERENCE_BAR,
      KESSHO_PRODUCT_MODULATION_SYNC_DIVISION_1,
      1.0f);
  const float before_free = free_range->current_value;
  const float before_link = link_range->current_value;
  free->transport.running = false;
  free->advanceModulationRanges(4800u);
  require(std::fabs(free_range->current_value - before_free) > 0.00001f, "free phase froze while stopped");
  require(std::fabs(link_range->current_value - before_link) > 0.00001f, "linked phase froze while stopped");
  kessho_product_destroy(free);
}

void requireSyncDivisionSemantics() {
  KesshoProductEngine* engine = makeEngine();
  ModulationRange* quarter = applyShape(
      *engine,
      KESSHO_PRODUCT_PARAM_MASTER_GAIN_ID,
      310u,
      0.0f,
      1.0f,
      KESSHO_PRODUCT_MODULATION_SHAPE_TRIANGLE,
      KESSHO_PRODUCT_MODULATION_TIMING_SYNC,
      KESSHO_PRODUCT_MODULATION_SYNC_REFERENCE_PHRASE,
      KESSHO_PRODUCT_MODULATION_SYNC_DIVISION_1_4);
  engine->transport.running = false;
  engine->transport.phrase_position_origin = 0.125;
  engine->advanceModulationRanges(1u);
  require(std::fabs(quarter->current_value - 1.0f) < 0.0001f,
      "Phrase + 1/4 did not produce four cycles per phrase");

  ModulationRange* double_bar = applyShape(
      *engine,
      KESSHO_PRODUCT_PARAM_MASTER_LIMITER_CEILING_DB_ID,
      311u,
      0.0f,
      1.0f,
      KESSHO_PRODUCT_MODULATION_SHAPE_TRIANGLE,
      KESSHO_PRODUCT_MODULATION_TIMING_SYNC,
      KESSHO_PRODUCT_MODULATION_SYNC_REFERENCE_BAR,
      KESSHO_PRODUCT_MODULATION_SYNC_DIVISION_2X);
  engine->transport.bar_position_origin = 1.0;
  engine->advanceModulationRanges(1u);
  require(std::fabs(double_bar->current_value - 1.0f) < 0.0001f,
      "Bar + 2x did not produce one cycle every two bars");
  kessho_product_destroy(engine);
}

} // namespace

int main() {
  requireWaveformValues();
  requireLinkAndFreeModes();
  requirePhraseRelativeFreeAndLinkRate();
  requireSyncAndStoppedTransport();
  requireSyncDivisionSemantics();
  std::cout << "Kessho Product shape-LFO tests passed\n";
  return 0;
}
