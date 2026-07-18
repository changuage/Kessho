#pragma once

#include "ProductConstants.h"

namespace kessho::product::internal {

constexpr uint32_t kMaxProductArpSteps = 16u;

enum class ProductArpFlow : uint32_t {
  Up = 0u,
  Down = 1u,
  UpDown = 2u,
  DownUp = 3u,
  RandomLiveTone = 4u,
  DiceHold = 5u,
};

enum class ProductArpContourMode : uint32_t { Pool = 0u, Semitone = 1u };
enum class ProductArpBoundaryMode : uint32_t { Fold = 0u, Wrap = 1u, Clamp = 2u };

struct ProductArpPatternState {
  bool enabled = false;
  uint32_t length = 1u;
  float rate = 1.0f;
  uint32_t active_mask = 0u;
  uint32_t reset_mask = 0u;
  ProductArpFlow flow = ProductArpFlow::Up;
  ProductArpContourMode contour_mode = ProductArpContourMode::Pool;
  ProductArpBoundaryMode boundary_mode = ProductArpBoundaryMode::Fold;
  bool fixed_midi_mode = false;
  int32_t contour[kMaxProductArpSteps]{};
  int32_t slot_lane[kMaxProductArpSteps] = {
      -1, -1, -1, -1, -1, -1, -1, -1,
      -1, -1, -1, -1, -1, -1, -1, -1};
  float midi_notes[kMaxProductArpSteps]{};
};

struct ProductArpRuntimeState : ProductArpPatternState {
  uint32_t cursor = 0u;
  uint32_t current_step = 0u;
  float current_midi = -1.0f;
  uint64_t next_event_sample = 0u;
  bool runtime_initialized = false;
  uint32_t random_counter = 0u;
  uint32_t dice_indices[kMaxProductArpSteps]{};
};

} // namespace kessho::product::internal
