#pragma once

#include <cstdint>

namespace kessho::product::internal {

constexpr uint32_t kMaxSequencerChainEntries = 16u;

struct SequencerChainState {
  bool enabled = false;
  bool initialized = false;
  uint32_t entry_count = 0u;
  uint32_t active_entry = 0u;
  uint32_t entry_lane_indices[kMaxSequencerChainEntries]{};
  float entry_duration_seconds[kMaxSequencerChainEntries]{};
  uint64_t next_boundary_frame = 0u;
};

} // namespace kessho::product::internal
