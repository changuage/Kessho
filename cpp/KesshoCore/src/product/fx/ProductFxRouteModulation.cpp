#include "../KesshoProductEngineInternal.h"

#include <cstdint>

namespace {

float routeHashUnit(uint32_t seed, uint32_t edge, uint64_t step) {
  uint32_t value = seed ^ (edge * 0x9e3779b9u) ^ static_cast<uint32_t>(step) ^
      (static_cast<uint32_t>(step >> 32u) * 0x85ebca6bu);
  value ^= value >> 16u;
  value *= 0x7feb352du;
  value ^= value >> 15u;
  value *= 0x846ca68bu;
  value ^= value >> 16u;
  return static_cast<float>(value) * (1.0f / 4294967295.0f);
}

} // namespace

float KesshoProductEngine::resolveFxRouteAmount(uint8_t from, uint8_t to) {
  const uint8_t mode = routing.fx_route_mode[from][to];
  if (mode == 0u) return std::max(0.0f, routing.fx_route_amount[from][to]);
  const float min_value = std::max(0.0f, routing.fx_route_min[from][to]);
  const float max_value = std::max(min_value, routing.fx_route_max[from][to]);
  if (max_value <= min_value) return min_value;

  const double bpm = std::max(1.0, static_cast<double>(transport.bpm));
  const double samples_per_beat = sample_rate * 60.0 / bpm;
  const double beat = static_cast<double>(transport.sample_frame) / samples_per_beat;
  float position = 0.5f;
  if (mode == 1u) {
    const double cycle_beats = std::max(1u, transport.beats_per_bar) * 4.0;
    const double phase = std::fmod(beat / cycle_beats, 1.0);
    position = static_cast<float>(1.0 - std::fabs(phase * 2.0 - 1.0));
  } else {
    const uint64_t step = static_cast<uint64_t>(std::floor(beat));
    const uint32_t edge = static_cast<uint32_t>(from) * kFxNodeCount + to;
    if (mode == 2u) {
      if (routing.fx_route_walk_step[from][to] != step) {
        routing.fx_route_walk_step[from][to] = step;
        const float delta = (routeHashUnit(rng_seed, edge, step) - 0.5f) * 0.36f;
        routing.fx_route_walk_position[from][to] = clampFloat(
            routing.fx_route_walk_position[from][to] + delta, 0.0f, 1.0f);
      }
      position = routing.fx_route_walk_position[from][to];
    } else {
      position = routeHashUnit(rng_seed, edge, step);
    }
  }
  return min_value + (max_value - min_value) * position;
}
