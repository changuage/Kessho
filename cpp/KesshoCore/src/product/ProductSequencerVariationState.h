#pragma once

#include "KesshoCore/KesshoProductSequencerVariations.h"

#include <algorithm>
#include <cstdint>

namespace kessho::product::internal {

struct SequencerVariationRuntime {
  // Banks live in engine-owned heap storage.  Keeping the 79 KiB wire bank
  // out of LaneState is required because native tests and callers may place a
  // product engine on the stack, while the audio thread still gets a stable
  // active/pending handoff.
  KesshoProductSequencerVariationBank* active = nullptr;
  KesshoProductSequencerVariationBank* pending = nullptr;
  bool active_valid = false;
  bool pending_valid = false;
  uint32_t active_variation = 0u;
  uint32_t pending_variation = 0u;
  bool pending_variation_valid = false;
  uint32_t chain_position = 0u;
  uint64_t active_revision = 0u;
  uint64_t next_boundary_frame = UINT64_MAX;
};

struct SequencerVariationStorage {
  KesshoProductSequencerVariationBank active_synth[kMaxLaneCount]{};
  KesshoProductSequencerVariationBank pending_synth[kMaxLaneCount]{};
  KesshoProductSequencerVariationBank active_drum[kMaxLaneCount]{};
  KesshoProductSequencerVariationBank pending_drum[kMaxLaneCount]{};
};

inline void bindSequencerVariationRuntime(
    SequencerVariationRuntime& runtime,
    KesshoProductSequencerVariationBank* active,
    KesshoProductSequencerVariationBank* pending) noexcept {
  runtime.active = active;
  runtime.pending = pending;
}

inline const KesshoProductSequencerVariationSnapshot* activeVariationSnapshot(
    const SequencerVariationRuntime& runtime) noexcept {
  if (!runtime.active_valid || runtime.active == nullptr || runtime.active->enabled == 0u) return nullptr;
  const uint32_t variation = runtime.active_variation < KESSHO_PRODUCT_SEQUENCER_VARIATION_COUNT
      ? runtime.active_variation
      : 0u;
  return &runtime.active->variations[variation];
}

inline uint32_t variationStepCount(
    const SequencerVariationRuntime& runtime,
    uint32_t fallback) noexcept {
  const auto* variation = activeVariationSnapshot(runtime);
  if (variation == nullptr) return fallback;
  return variation->step_count == 0u
      ? fallback
      : std::min<uint32_t>(variation->step_count, KESSHO_PRODUCT_SEQUENCER_VARIATION_MAX_STEPS);
}

inline uint32_t variationClockDivision(
    const SequencerVariationRuntime& runtime,
    uint32_t fallback) noexcept {
  const auto* variation = activeVariationSnapshot(runtime);
  if (variation == nullptr) return fallback;
  return variation->clock_division == 0u ? fallback : variation->clock_division;
}

inline bool variationMaskHas(uint32_t mask, uint32_t step) noexcept {
  return step < 32u && (mask & (1u << step)) != 0u;
}

inline bool variationFieldEnabled(
    const KesshoProductSequencerVariationSnapshot& variation,
    uint32_t field_id) noexcept {
  return field_id < 9u && (variation.sublane_enabled_mask & (1u << field_id)) != 0u;
}

} // namespace kessho::product::internal
