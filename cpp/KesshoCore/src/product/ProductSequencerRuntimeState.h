#pragma once

#include "ProductArpRuntimeState.h"

namespace kessho::product::internal {

struct PendingRatchetEvent {
  uint64_t parent_step_id = 0;
  uint64_t hit_count_phase = 0;
  int64_t grid_origin_sample = 0;
  uint64_t absolute_sample = 0;
  uint32_t lane_index = 0;
  uint32_t step_index = 0;
  uint32_t arp_step_index = UINT32_MAX;
  uint32_t ratchet_index = 0;
  uint32_t ratchet_count = 1;
  KesshoSequencerEvent event{};
};

} // namespace kessho::product::internal
