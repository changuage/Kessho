#pragma once

#include "ProductConstants.h"

namespace kessho::product::internal {

constexpr uint32_t kMaxProductPlayVoicesPerStep = 32u;
constexpr uint32_t kMaxProductArpSteps = 16u;

struct ProductPlayNoteOverride {
  float midi_note = 60.0f;
  float offset_ms = 0.0f;
  float velocity = 1.0f;
};

struct ProductArpPatternState {
  bool enabled = false;
  uint32_t length = 1u;
  float rate = 1.0f;
  uint32_t active_mask = 0u;
  float midi_notes[kMaxProductArpSteps]{};
};

struct ProductArpRuntimeState : ProductArpPatternState {
  uint32_t cursor = 0u;
  uint32_t current_step = 0u;
  uint64_t next_event_sample = 0u;
  bool runtime_initialized = false;
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
