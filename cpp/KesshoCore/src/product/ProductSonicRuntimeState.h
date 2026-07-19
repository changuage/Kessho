#pragma once

#include <cstdint>

namespace kessho::product::internal {

constexpr uint32_t kProductSourceMorphAutomationCount = 11u;
constexpr uint32_t kProductDirectSourceMorphAutomationCount = 4u;
// Avoid rebuilding structured overrides for sub-millipercent control-rate changes.
constexpr float kAutomatedSourceMorphApplyThreshold = 1.0f / 1024.0f;

enum class ProductMorphMode : uint32_t {
  Linear = 0u,
  PingPong = 1u,
  Random = 2u,
};

struct SourceMorphAutomationState {
  uint32_t target_id = 0u;
  uint32_t enabled = 0u;
  ProductMorphMode mode = ProductMorphMode::PingPong;
  float phrases_per_cycle = 8.0f;
  float held_random = 0.0f;
  int32_t direction = 1;
  uint32_t rng_state = 1u;
  uint64_t cycle_start_frame = 0u;
  uint64_t cycle_duration_frames = 1u;
  uint64_t last_random_cycle_index = 0u;
};

struct ProductAutoStopState {
  bool enabled = false;
  uint64_t target_sample_frame = 0u;
};

struct ProductSonicRuntimeState {
  SourceMorphAutomationState source_morph[kProductSourceMorphAutomationCount]{};
  uint32_t source_morph_enabled_mask = 0u;
  ProductAutoStopState auto_stop{};
};

} // namespace kessho::product::internal
