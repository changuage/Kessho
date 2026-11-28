#pragma once

#include "ProductConstants.h"

namespace kessho::product::internal {

// Random lane pending notes live in one fixed queue per lane. A queue is only
// ever read or written by its own lane, so lanes cannot influence each other.
constexpr uint32_t kMaxRandomSlotPendingEvents = 512u;
constexpr uint32_t kMaxRandomSlotLanes = 8u;

struct RandomSlotPendingEvent {
  uint64_t absolute_sample = 0u;
  KesshoSequencerEvent event{};
  // Capture tap identity, applied when the note is emitted (0 mode = none).
  uint32_t capture_mode = 0u;
  uint64_t capture_attack_id = 0u;
};

struct RandomSlotPendingStorage {
  RandomSlotPendingEvent events[kMaxRandomSlotLanes][kMaxRandomSlotPendingEvents]{};
};

// Global arrangement state that is not owned by any one lane.
struct ProductArrangementState {
  uint32_t pad_euclid_owned_voice_mask = 0u;
  float source_hold_seconds[8]{};
  // Shared phrase timeline published by the Harmony clock; Random lanes align
  // to it but never write it.
  uint64_t chord_phrase_start_frame = 0u;
  uint64_t chord_phrase_index = 0u;
};

} // namespace kessho::product::internal
