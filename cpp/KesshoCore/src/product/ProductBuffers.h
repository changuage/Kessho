#pragma once

#include "ProductConstants.h"

#include <cstdint>

namespace kessho::product::internal {

struct QueuedProductEvent {
  KesshoProductEvent event{};
  uint32_t sequence = 0;
};

struct SequencerBuffer {
  KesshoSequencerEvent events[kessho::product::generated::KESSHO_PRODUCT_MAX_SEQUENCER_EVENTS]{};
  uint32_t count = 0;

  void clear() {
    count = 0;
  }

  bool push(const KesshoSequencerEvent& event) {
    if (count >= kessho::product::generated::KESSHO_PRODUCT_MAX_SEQUENCER_EVENTS) {
      return false;
    }
    events[count++] = event;
    return true;
  }

  void sortByOffset() {
    for (uint32_t i = 1; i < count; ++i) {
      KesshoSequencerEvent key = events[i];
      uint32_t j = i;
      while (j > 0 && key.sample_offset < events[j - 1].sample_offset) {
        events[j] = events[j - 1];
        --j;
      }
      events[j] = key;
    }
  }
};

} // namespace kessho::product::internal
