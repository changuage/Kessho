#include "KesshoProductEngineInternal.h"

extern "C" {

int32_t kessho_product_set_simple_sequencer_visual_demand(
    KesshoProductEngine* engine,
    uint32_t demand_mask) {
  if (engine == nullptr) return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  const uint32_t next_mask = demand_mask &
      (KESSHO_PRODUCT_SIMPLE_SEQUENCER_VISUAL_CHORD |
       KESSHO_PRODUCT_SIMPLE_SEQUENCER_VISUAL_RANDOM_TIMING);
  if (engine->simple_sequencer_visual_demand_mask != next_mask) {
    engine->simple_sequencer_visual_ring.reset();
  }
  engine->simple_sequencer_visual_demand_mask = next_mask;
  return KESSHO_PRODUCT_OK;
}

uint32_t kessho_product_drain_simple_sequencer_visual_events(
    KesshoProductEngine* engine,
    KesshoProductSimpleSequencerVisualEvent* out_events,
    uint32_t max_event_count,
    uint32_t* out_overflow_count) {
  auto* ring = engine == nullptr ? nullptr : &engine->simple_sequencer_visual_ring;
  if (out_overflow_count != nullptr) *out_overflow_count = ring == nullptr ? 0u : ring->overflowCount();
  if (ring == nullptr || out_events == nullptr || max_event_count == 0u) return 0u;
  uint32_t count = 0u;
  while (count < max_event_count && ring->pop(out_events[count])) ++count;
  return count;
}

} // extern "C"
