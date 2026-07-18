#pragma once

#include <cstdint>

namespace kessho::product::internal {

enum class ProductAutoCyclePhase : uint32_t {
  Off = 0u,
  Hold = 1u,
  Entry = 2u,
  PlayA = 3u,
  MorphAB = 4u,
  PlayB = 5u,
  MorphBA = 6u,
};

struct ProductAutoCycleRuntimeState {
  ProductAutoCyclePhase phase = ProductAutoCyclePhase::Off;
  uint64_t phase_start_frame = 0u;
  uint64_t phase_end_frame = 0u;
  uint64_t next_position_frame = UINT64_MAX;
  float entry_start_position = 0.0f;
  float entry_target_position = 0.0f;
  float position = 0.0f;
  float play_phrases = 1.0f;
  float transition_phrases = 1.0f;
  uint32_t revision = 0u;
  uint32_t transition_count = 0u;
  bool enabled = false;
};

} // namespace kessho::product::internal
