#include "KesshoProductEngineInternal.h"

extern "C" {

uint32_t kessho_product_drain_generated_sequencer_capture_events(
    KesshoProductEngine* engine,
    KesshoProductGeneratedSequencerCaptureEvent* out_events,
    uint32_t max_event_count,
    uint32_t* out_overflow_count) {
  auto* ring = engine == nullptr ? nullptr : engine->generated_sequencer_capture_ring.get();
  if (out_overflow_count != nullptr) *out_overflow_count = ring == nullptr ? 0u : ring->overflowCount();
  if (ring == nullptr || out_events == nullptr || max_event_count == 0u) return 0u;
  uint32_t count = 0u;
  while (count < max_event_count && ring->pop(out_events[count])) ++count;
  return count;
}

int32_t kessho_product_copy_capture_clock(
    KesshoProductEngine* engine,
    KesshoProductCaptureClock* out_clock) {
  if (engine == nullptr || out_clock == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  out_clock->schema_version = KESSHO_PRODUCT_CAPTURE_CLOCK_SCHEMA_VERSION;
  out_clock->reserved = 0u;
  out_clock->current_sample = engine->transport.sample_frame;
  out_clock->current_beat = engine->transport.beatPosition(engine->sample_rate);
  out_clock->current_bpm = static_cast<double>(engine->transport.bpm);
  return KESSHO_PRODUCT_OK;
}

int32_t kessho_product_copy_sequencer_ui_state(
    KesshoProductEngine* engine,
    KesshoProductSequencerUiState* out_state) {
  if (engine == nullptr || out_state == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  engine->copySequencerUiState(*out_state);
  return KESSHO_PRODUCT_OK;
}

int32_t kessho_product_set_sequencer_variation_bank(
    KesshoProductEngine* engine,
    uint32_t sequencer_id,
    uint32_t lane_index,
    const KesshoProductSequencerVariationBank* bank) {
  if (engine == nullptr) return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  if (bank == nullptr) return KESSHO_PRODUCT_ERROR_INVALID_PARAM;
  return engine->setSequencerVariationBank(sequencer_id, lane_index, *bank);
}

int32_t kessho_product_select_sequencer_variation(
    KesshoProductEngine* engine,
    uint32_t sequencer_id,
    uint32_t lane_index,
    uint32_t variation_index) {
  if (engine == nullptr) return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  return engine->selectSequencerVariation(sequencer_id, lane_index, variation_index);
}

int32_t kessho_product_copy_sequencer_variation_runtime(
    KesshoProductEngine* engine,
    uint32_t sequencer_id,
    uint32_t lane_index,
    KesshoProductSequencerVariationRuntime* out_runtime) {
  if (engine == nullptr || out_runtime == nullptr) return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  engine->copySequencerVariationRuntime(sequencer_id, lane_index, *out_runtime);
  return KESSHO_PRODUCT_OK;
}

} // extern "C"
