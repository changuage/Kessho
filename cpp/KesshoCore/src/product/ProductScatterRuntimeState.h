#pragma once

#include <cstdint>

namespace kessho::product::internal {

constexpr uint32_t kProductScatterVoiceCount = 7u;
constexpr uint32_t kProductScatterMaxSteps = 16u;
constexpr uint32_t kProductScatterRecentPhraseCount = 4u;

enum class ProductScatterZone : uint32_t { Pulse = 0u, Gesture = 1u, Wave = 2u, Fracture = 3u, Scatter = 4u };
enum class ProductScatterContour : uint32_t {
  Linear = 0u,
  Exponential = 1u,
  Logarithmic = 2u,
  Stepped = 3u,
  Wave = 4u,
  RandomWalk = 5u,
  Scatter = 6u,
};

struct ProductScatterVoiceConfig {
  bool enabled = false;
  float trigger_probability = 0.0f;
  float burst_probability = 0.0f;
  float random_walk = 0.0f;
  bool random_walk_enabled = false;
  float feel_x = 0.0f;
  float feel_y = 0.0f;
  float anchor = 0.65f;
  float breath = 0.6f;
  float memory = 0.35f;
  float motion = 0.45f;
  float fracture = 0.2f;
  float spread = 0.1f;
};

struct ProductScatterPhrase {
  uint32_t id = 0u;
  uint32_t seed = 0u;
  uint32_t voice = 0u;
  uint32_t steps = 1u;
  uint32_t hits = 1u;
  uint32_t rotation = 0u;
  uint32_t trigger_mask = 1u;
  uint32_t clock_division = 8u;
  float swing = 0.0f;
  ProductScatterZone zone = ProductScatterZone::Pulse;
  ProductScatterContour contour = ProductScatterContour::Linear;
  int32_t pitch[kProductScatterMaxSteps]{};
  float expression[kProductScatterMaxSteps]{};
  float morph[kProductScatterMaxSteps]{};
  float distance[kProductScatterMaxSteps]{};
  uint32_t ratchet[kProductScatterMaxSteps]{};
};

struct ProductScatterVoiceRuntime {
  uint32_t phrase_counter = 0u;
  uint32_t rng_state = 1u;
  uint64_t cooldown_until_frame = 0u;
  uint32_t recent_phrase_ids[kProductScatterRecentPhraseCount]{};
  uint32_t recent_phrase_count = 0u;
  uint32_t recent_phrase_write = 0u;
};

struct ProductScatterRuntimeState {
  bool enabled = false;
  ProductScatterVoiceConfig active[kProductScatterVoiceCount]{};
  ProductScatterVoiceConfig staging[kProductScatterVoiceCount]{};
  ProductScatterVoiceRuntime voices[kProductScatterVoiceCount]{};
  ProductScatterPhrase current_phrase{};
  uint32_t selector_rng_state = 1u;
  uint64_t global_cooldown_until_frame = 0u;
  uint64_t next_selector_frame = 0u;
  uint64_t phrase_start_frame = 0u;
  uint32_t current_phrase_id = 0u;
  uint32_t current_voice = UINT32_MAX;
  uint32_t current_step = 0u;
  uint32_t pulse_count = 0u;
};

} // namespace kessho::product::internal
