#include "../KesshoProductEngineInternal.h"

  float KesshoProductEngine::evolutionDepth() const {
  const float journey_depth = journey_running
      ? 0.35f * (0.5f + 0.5f * std::sin(static_cast<float>(kTwoPi) * journey_phase))
      : 0.0f;
  return clampFloat(evolution_amount + journey_depth, 0.0f, 1.0f);
}

  float KesshoProductEngine::evolvedLaneValue(
      const LaneState& lane,
      uint32_t lane_index,
      uint32_t step_id,
      uint64_t absolute_sample,
      uint32_t component,
      float base,
      float depth,
      float min_value,
      float max_value) const {
  const float amount = evolutionDepth() * clampFloat(depth, 0.0f, 1.0f);
  if (amount <= 0.000001f) {
    return clampFloat(base, min_value, max_value);
  }

  const uint64_t bar = transport.barIndexAt(sample_rate, absolute_sample);
  const uint64_t phrase = transport.phraseIndexAt(sample_rate, absolute_sample);
  const uint32_t seed =
      lane.seed ^
      rng_seed ^
      evolution_state ^
      (component * 374761393u) ^
      (lane_index * 668265263u) ^
      (step_id * 2246822519u) ^
      static_cast<uint32_t>(bar * 3266489917ull) ^
      static_cast<uint32_t>(phrase * 2654435761ull);
  const float random_delta = hashUnit(seed) * 2.0f - 1.0f;
  const float journey_delta = journey_running
      ? std::sin(static_cast<float>(kTwoPi) * (journey_phase + lane_index * 0.071f + step_id * 0.019f + component * 0.113f))
      : 0.0f;
  return clampFloat(base + amount * (random_delta + journey_delta * 0.5f), min_value, max_value);
}
