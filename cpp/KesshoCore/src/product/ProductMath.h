#pragma once

#include "ProductConstants.h"

#include <algorithm>
#include <cmath>
#include <cstdint>

namespace kessho::product::internal {

inline float clampFloat(float value, float min_value, float max_value) {
  if (!std::isfinite(value)) {
    return min_value;
  }
  return std::min(max_value, std::max(min_value, value));
}

inline float scaleSourceDistance(float distance) {
  const float safe_distance = clampFloat(distance, 0.0f, 1.0f);
  return 1.0f - (1.0f - safe_distance) * (1.0f - safe_distance);
}

inline float anchoredDistanceValue(float distance, float start_value, float slight_value, float max_value) {
  constexpr float kSlightPoint = 0.25f;
  const float scaled = scaleSourceDistance(distance);
  if (scaled <= kSlightPoint) {
    const float head_t = kSlightPoint <= 0.0f ? 1.0f : scaled / kSlightPoint;
    return start_value + head_t * (slight_value - start_value);
  }
  const float tail_t = (scaled - kSlightPoint) / (1.0f - kSlightPoint);
  return slight_value + tail_t * (max_value - slight_value);
}

inline float distanceMultiply(float base, float distance, float slight_mul, float max_mul) {
  return base * anchoredDistanceValue(distance, 1.0f, slight_mul, max_mul);
}

inline float distanceAdd(float base, float distance, float slight_delta, float max_delta) {
  return base + anchoredDistanceValue(distance, 0.0f, slight_delta, max_delta);
}

inline uint32_t clampU32(uint32_t value, uint32_t min_value, uint32_t max_value) {
  return std::min(max_value, std::max(min_value, value));
}

inline float midiToFrequency(float midi_note) {
  return kProductTuningA4Hz * std::pow(2.0f, (midi_note - 69.0f) / 12.0f);
}

inline float dbToGain(float db) {
  return std::pow(10.0f, db / 20.0f);
}

inline float gainToDb(float gain) {
  if (!std::isfinite(gain) || gain <= 0.000000001f) {
    return kProductTelemetrySilenceDb;
  }
  return 20.0f * std::log10(gain);
}

inline float unitToLogFrequency(float value, float min_hz, float max_hz) {
  const float t = clampFloat(value, 0.0f, 1.0f);
  return min_hz * std::pow(max_hz / min_hz, t);
}

uint32_t hashU32(uint32_t value);

float hashUnit(uint32_t value);

inline int roundedInt(float value) {
  return static_cast<int>(value >= 0.0f ? value + 0.5f : value - 0.5f);
}

inline uint32_t positiveModulo(int32_t value, uint32_t modulo) {
  const int32_t signed_modulo = static_cast<int32_t>(modulo);
  int32_t result = value % signed_modulo;
  if (result < 0) {
    result += signed_modulo;
  }
  return static_cast<uint32_t>(result);
}

inline bool euclidHit(uint32_t step, uint32_t steps, uint32_t fills, int32_t rotation) {
  if (steps == 0 || fills == 0) {
    return false;
  }
  if (fills >= steps) {
    return true;
  }

  const uint32_t rotated = positiveModulo(static_cast<int32_t>(step) - rotation, steps);
  return (rotated * fills) % steps < fills;
}

struct ProductTransport;
struct LaneState;

uint32_t scaleIntervals(uint32_t scale_id, int intervals[kMaxScaleNotes]);

uint32_t circleOfFifthsProgressionDegree(
    uint32_t seed,
    float tension,
    uint64_t bar,
    uint64_t phrase,
    uint32_t scale_count);

double sequencerSamplesPerStep(const ProductTransport& transport, double sample_rate, uint32_t clock_division);

double sequencerSwingSamples(const ProductTransport& transport, const LaneState& lane, double samples_per_step);

int64_t sequencerFirstStep(uint64_t block_start, double samples_per_step);

int64_t sequencerLastStep(uint64_t block_end, double samples_per_step);

} // namespace kessho::product::internal
