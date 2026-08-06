#pragma once

#include "ProductArpRuntimeState.h"

namespace kessho::product::internal {

constexpr uint32_t kMaxProductPlayVoicesPerStep = 32u;
// For slot-backed play-note records, value4 packs (slotId + 1) * 32 + toneIndex.
// Zero through 31 retain the legacy voice-index-only representation.
constexpr uint32_t kProductPlayHarmonySlotPackWidth = kMaxProductPlayVoicesPerStep;
struct ProductPlayNoteOverride {
  float midi_note = 60.0f;
  float offset_ms = 0.0f;
  float velocity = 1.0f;
  int32_t harmony_slot_id = -1;
};

struct PendingRatchetEvent {
  uint64_t parent_step_id = 0;
  uint64_t absolute_sample = 0;
  uint32_t lane_index = 0;
  uint32_t step_index = 0;
  uint32_t arp_step_index = UINT32_MAX;
  uint32_t ratchet_index = 0;
  uint32_t ratchet_count = 1;
  KesshoSequencerEvent event{};
};

} // namespace kessho::product::internal
