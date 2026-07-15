#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iostream>

#include "KesshoCore/KesshoProductCore.h"
#include "KesshoProductParamIds.h"
#include "../src/product/KesshoProductEngineInternal.h"

namespace {

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Kessho Product sample-hold parity test failed: " << message << "\n";
    std::exit(1);
  }
}

KesshoProductEvent sampleHoldRange(
    uint32_t target_id,
    uint32_t param_id,
    uint32_t control_id,
    float min_value,
    float max_value,
    float current_value,
    uint32_t trigger_flags = 0u) {
  KesshoProductEvent event{};
  event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_MODULATION_RANGE;
  event.target_id = target_id;
  event.index = control_id;
  event.param_id = param_id;
  event.value = min_value;
  event.value2 = max_value;
  event.value3 = static_cast<float>(KESSHO_PRODUCT_MODULATION_RANGE_SAMPLE_HOLD);
  event.value4 = current_value;
  event.flags = KESSHO_PRODUCT_MODULATION_RANGE_ACTIVE | trigger_flags;
  return event;
}

ModulationRange* applySampleHoldRange(
    KesshoProductEngine& engine,
    uint32_t target_id,
    uint32_t param_id,
    uint32_t control_id,
    float min_value,
    float max_value,
    float current_value,
    uint32_t trigger_flags = 0u) {
  KesshoProductEvent event = sampleHoldRange(
      target_id,
      param_id,
      control_id,
      min_value,
      max_value,
      current_value,
      trigger_flags);
  engine.applyModulationRangeEvent(event);
  require(engine.telemetry.last_error_code == KESSHO_PRODUCT_OK, "sample-hold range apply failed");
  ModulationRange* range = engine.findModulationRange(target_id, param_id);
  require(range != nullptr, "sample-hold range missing after apply");
  return range;
}

void requireRangeValue(const ModulationRange* range, float min_value, float max_value, const char* message) {
  require(range != nullptr, message);
  require(range->current_value >= min_value && range->current_value <= max_value, message);
}

void requireTriggered(const ModulationRange* range, uint32_t bus, uint32_t source_id, const char* message) {
  require(range != nullptr, message);
  require(range->sample_hold_trigger_bus == bus, message);
  require(range->sample_hold_counter > 0u, message);
  require(range->last_trigger_source == source_id, message);
}

void enableSource(KesshoProductEngine& engine, uint32_t source_id) {
  SourceState& source = engine.sources[source_id - 1u];
  source.enabled = true;
  source.level = 1.0f;
  source.expression = 1.0f;
  source.dry_gain = 1.0f;
  source.post_lpf_hz = 18000.0f;
  source.stereo_width = 1.0f;
}

KesshoProductEngine* makeEngine(uint32_t seed = 0u) {
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128, seed);
  require(engine != nullptr, "sample-hold test engine allocation failed");
  return engine;
}

void triggerPad(KesshoProductEngine& engine, uint32_t seed = 12345u) {
  enableSource(engine, KESSHO_PRODUCT_SOURCE_PAD1);
  const uint32_t voice = engine.triggerVoice(
      KESSHO_PRODUCT_SOURCE_PAD1,
      60.0f,
      0.8f,
      0.12f,
      -1.0f,
      -1.0f,
      -1.0f,
      seed);
  require(voice != kProductInvalidVoiceIndex, "pad trigger failed");
}

void triggerDrum(KesshoProductEngine& engine, uint32_t seed = 12345u) {
  enableSource(engine, KESSHO_PRODUCT_SOURCE_DRUM);
  engine.triggerVoice(
      KESSHO_PRODUCT_SOURCE_DRUM,
      36.0f,
      0.9f,
      0.12f,
      -1.0f,
      -1.0f,
      -1.0f,
      seed);
  require(engine.telemetry.last_error_code == KESSHO_PRODUCT_OK, "drum trigger failed");
}

void requireTimedGlobalParam() {
  KesshoProductEngine* engine = makeEngine();
  engine->master_gain = 0.2f;
  ModulationRange* range = applySampleHoldRange(
      *engine,
      0u,
      KESSHO_PRODUCT_PARAM_MASTER_GAIN_ID,
      1001u,
      0.2f,
      0.8f,
      0.2f);
  require(range->sample_hold_trigger_bus == kProductSampleHoldTriggerTimed, "global sample-hold bus should be timed");
  engine->advanceModulationRanges(4800u);
  requireRangeValue(range, 0.2f, 0.8f, "timed global sample-hold left range");
  require(range->sample_hold_counter == 1u, "timed global sample-hold counter did not advance once");
  require(range->last_trigger_source == 0u, "timed global sample-hold trigger source should be timer");
  require(std::fabs(engine->master_gain - 0.2f) > 0.0001f, "timed global sample-hold did not apply Product param");
  kessho_product_destroy(engine);
}

void requireSourceTriggerRanges() {
  KesshoProductEngine* engine = makeEngine();
  ModulationRange* morph = applySampleHoldRange(
      *engine,
      KESSHO_PRODUCT_SOURCE_PAD1,
      KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID,
      1101u,
      0.25f,
      0.75f,
      0.5f);
  ModulationRange* distance = applySampleHoldRange(
      *engine,
      KESSHO_PRODUCT_SOURCE_PAD1,
      KESSHO_PRODUCT_PARAM_SOURCE_DISTANCE_ID,
      1102u,
      0.15f,
      0.45f,
      0.2f);
  ModulationRange* expression = applySampleHoldRange(
      *engine,
      KESSHO_PRODUCT_SOURCE_PAD1,
      KESSHO_PRODUCT_PARAM_SOURCE_EXPRESSION_ID,
      1103u,
      0.4f,
      0.9f,
      0.6f);
  triggerPad(*engine);
  requireTriggered(morph, kProductSampleHoldTriggerTimed, KESSHO_PRODUCT_SOURCE_PAD1, "source morph sample-hold did not publish trigger state");
  requireTriggered(distance, kProductSampleHoldTriggerTimed, KESSHO_PRODUCT_SOURCE_PAD1, "source distance sample-hold did not publish trigger state");
  requireTriggered(expression, kProductSampleHoldTriggerTimed, KESSHO_PRODUCT_SOURCE_PAD1, "source expression sample-hold did not publish trigger state");
  requireRangeValue(morph, 0.25f, 0.75f, "source morph sample-hold left range");
  requireRangeValue(distance, 0.15f, 0.45f, "source distance sample-hold left range");
  requireRangeValue(expression, 0.4f, 0.9f, "source expression sample-hold left range");
  kessho_product_destroy(engine);
}

void requireDrumTriggerRanges() {
  KesshoProductEngine* engine = makeEngine();
  const uint32_t kick_target = KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE +
      static_cast<uint32_t>(defaultDrumKitMapEntry(36.0f).voice);
  ModulationRange* morph = applySampleHoldRange(
      *engine,
      kick_target,
      KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID,
      1201u,
      0.35f,
      0.65f,
      0.4f);
  ModulationRange* exact = applySampleHoldRange(
      *engine,
      kick_target,
      kProductDrumRuntimeParamIdBase,
      1202u,
      80.0f,
      120.0f,
      100.0f);
  triggerDrum(*engine);
  requireTriggered(morph, kProductSampleHoldTriggerTimed, KESSHO_PRODUCT_SOURCE_DRUM, "drum morph sample-hold did not publish trigger state");
  requireTriggered(exact, kProductSampleHoldTriggerTimed, KESSHO_PRODUCT_SOURCE_DRUM, "drum exact sample-hold did not publish trigger state");
  requireRangeValue(morph, 0.35f, 0.65f, "drum morph sample-hold left range");
  requireRangeValue(exact, 80.0f, 120.0f, "drum exact sample-hold left range");
  kessho_product_destroy(engine);
}

void requireFxTriggerBus(uint32_t param_id, uint32_t flag, uint32_t expected_bus, const char* message) {
  KesshoProductEngine* engine = makeEngine();
  enableSource(*engine, KESSHO_PRODUCT_SOURCE_PAD1);
  SourceState& source = engine->sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u];
  source.delay_a_send = 1.0f;
  source.delay_b_send = 1.0f;
  source.granular_send = 1.0f;
  source.reverb_send = 1.0f;
  engine->fx.delay_a_enabled = true;
  engine->fx.delay_b_enabled = true;
  engine->fx.granular_enabled = true;
  engine->fx.granular_mix = 1.0f;
  engine->fx.reverb_mix = 1.0f;
  ModulationRange* range = applySampleHoldRange(
      *engine,
      0u,
      param_id,
      1300u + expected_bus,
      0.1f,
      0.9f,
      0.1f,
      flag);
  triggerPad(*engine);
  requireTriggered(range, expected_bus, KESSHO_PRODUCT_SOURCE_PAD1, message);
  requireRangeValue(range, 0.1f, 0.9f, message);
  kessho_product_destroy(engine);
}

void requireDisabledAndRangeNormalization() {
  KesshoProductEngine* engine = makeEngine();
  ModulationRange* disabled = applySampleHoldRange(
      *engine,
      KESSHO_PRODUCT_SOURCE_PAD1,
      KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID,
      1401u,
      0.1f,
      0.9f,
      0.5f);
  require(disabled->active, "range should be active before disable");
  KesshoProductEvent off{};
  off.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_MODULATION_RANGE;
  off.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  off.param_id = KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID;
  off.value3 = static_cast<float>(KESSHO_PRODUCT_MODULATION_RANGE_SAMPLE_HOLD);
  engine->applyModulationRangeEvent(off);
  disabled = engine->findModulationRange(KESSHO_PRODUCT_SOURCE_PAD1, KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID);
  require(disabled == nullptr || !disabled->active, "disabled sample-hold range remained active");

  ModulationRange* zero = applySampleHoldRange(
      *engine,
      0u,
      KESSHO_PRODUCT_PARAM_MASTER_GAIN_ID,
      1402u,
      0.42f,
      0.42f,
      0.2f);
  engine->advanceModulationRanges(4800u);
  require(std::fabs(zero->current_value - 0.42f) < 0.0001f, "zero-width sample-hold should clamp to the only value");

  ModulationRange* reversed = applySampleHoldRange(
      *engine,
      KESSHO_PRODUCT_SOURCE_PAD1,
      KESSHO_PRODUCT_PARAM_SOURCE_DISTANCE_ID,
      1403u,
      0.8f,
      0.2f,
      0.5f);
  require(std::fabs(reversed->min_value - 0.2f) < 0.0001f, "reversed sample-hold min was not normalized");
  require(std::fabs(reversed->max_value - 0.8f) < 0.0001f, "reversed sample-hold max was not normalized");
  kessho_product_destroy(engine);
}

void requireStopResumeAndDeterminism() {
  KesshoProductEngine* stopped = makeEngine();
  stopped->master_gain = 0.3f;
  ModulationRange* stopped_range = applySampleHoldRange(
      *stopped,
      0u,
      KESSHO_PRODUCT_PARAM_MASTER_GAIN_ID,
      1501u,
      0.2f,
      0.8f,
      0.3f);
  require(stopped_range->sample_hold_counter == 0u, "sample-hold advanced before render/transport work");
  stopped->advanceModulationRanges(4800u);
  require(stopped_range->sample_hold_counter == 1u, "sample-hold did not resume when frames advanced");
  kessho_product_destroy(stopped);

  KesshoProductEngine* left = makeEngine(777u);
  KesshoProductEngine* right = makeEngine(777u);
  ModulationRange* left_range = applySampleHoldRange(
      *left,
      KESSHO_PRODUCT_SOURCE_PAD1,
      KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID,
      1502u,
      0.1f,
      0.9f,
      0.4f);
  ModulationRange* right_range = applySampleHoldRange(
      *right,
      KESSHO_PRODUCT_SOURCE_PAD1,
      KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID,
      1502u,
      0.1f,
      0.9f,
      0.4f);
  triggerPad(*left, 2468u);
  triggerPad(*right, 2468u);
  require(
      std::fabs(left_range->current_value - right_range->current_value) < 0.000001f,
      "seeded sample-hold fixture was not deterministic");
  kessho_product_destroy(left);
  kessho_product_destroy(right);
}

} // namespace

int main() {
  requireTimedGlobalParam();
  requireSourceTriggerRanges();
  requireDrumTriggerRanges();
  requireFxTriggerBus(
      KESSHO_PRODUCT_PARAM_FX_DELAY_AFEEDBACK_ID,
      KESSHO_PRODUCT_MODULATION_RANGE_TRIGGER_DELAY_A,
      kProductSampleHoldTriggerDelayA,
      "Delay A sample-hold did not trigger from Delay A bus");
  requireFxTriggerBus(
      KESSHO_PRODUCT_PARAM_FX_DELAY_BREPEATS_ID,
      KESSHO_PRODUCT_MODULATION_RANGE_TRIGGER_DELAY_B,
      kProductSampleHoldTriggerDelayB,
      "Delay B sample-hold did not trigger from Delay B bus");
  requireFxTriggerBus(
      KESSHO_PRODUCT_PARAM_FX_GRANULAR_FEEDBACK_ID,
      KESSHO_PRODUCT_MODULATION_RANGE_TRIGGER_GRANULAR,
      kProductSampleHoldTriggerGranular,
      "Granular sample-hold did not trigger from Granular bus");
  requireFxTriggerBus(
      KESSHO_PRODUCT_PARAM_FX_REVERB_DECAY_ID,
      KESSHO_PRODUCT_MODULATION_RANGE_TRIGGER_REVERB,
      kProductSampleHoldTriggerReverb,
      "Reverb sample-hold did not trigger from Reverb bus");
  requireDisabledAndRangeNormalization();
  requireStopResumeAndDeterminism();
  std::cout << "Kessho Product sample-hold parity tests passed\n";
  return 0;
}
