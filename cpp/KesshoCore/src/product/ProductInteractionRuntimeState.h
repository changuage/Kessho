#pragma once

#include "KesshoCore/KesshoProductInteraction.h"

struct ProductInteractionRuntimeState {
  uint32_t interaction_demand_mask = 0u;
  uint32_t interaction_source_mask = 0u;
  KesshoProductInteractionSignalSnapshot interaction_signals{};
  float interaction_envelope_state[KESSHO_PRODUCT_INTERACTION_SOURCE_COUNT]{};
  float interaction_previous_peak[KESSHO_PRODUCT_INTERACTION_SOURCE_COUNT]{};
  KesshoProductInteractionEvent interaction_event_ring[KESSHO_PRODUCT_INTERACTION_EVENT_CAPACITY]{};
  uint32_t interaction_event_read_index = 0u;
  uint32_t interaction_event_write_index = 0u;
  uint32_t interaction_event_count = 0u;
  uint32_t interaction_event_overflow_count = 0u;
  bool interaction_clock_initialized = false;
  uint64_t interaction_last_beat_index = 0u;
  uint64_t interaction_last_bar_index = 0u;
  uint64_t interaction_last_phrase_index = 0u;
};
