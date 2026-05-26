#pragma once

#include <cstdint>

namespace kessho::product::internal {

uint32_t clampU32(uint32_t value, uint32_t min_value, uint32_t max_value);

inline uint32_t positiveModulo(int32_t value, uint32_t modulo) {
  const int32_t signed_modulo = static_cast<int32_t>(modulo);
  int32_t result = value % signed_modulo;
  if (result < 0) {
    result += signed_modulo;
  }
  return static_cast<uint32_t>(result);
}

inline void buildEuclidPattern(
    int32_t level,
    const uint32_t counts[64],
    const uint32_t remainders[65],
    bool pattern[64],
    uint32_t& length) {
  if (length >= 64u) {
    return;
  }
  if (level == -1) {
    pattern[length++] = false;
    return;
  }
  if (level == -2) {
    pattern[length++] = true;
    return;
  }
  const uint32_t count = counts[level];
  for (uint32_t i = 0; i < count; ++i) {
    buildEuclidPattern(level - 1, counts, remainders, pattern, length);
  }
  if (remainders[level] != 0u) {
    buildEuclidPattern(level - 2, counts, remainders, pattern, length);
  }
}

inline bool euclidHit(uint32_t step, uint32_t steps, uint32_t fills, int32_t rotation) {
  if (steps == 0 || fills == 0) {
    return false;
  }
  if (fills >= steps) {
    return true;
  }

  const uint32_t safe_steps = clampU32(steps, 1u, 64u);
  const uint32_t safe_fills = clampU32(fills, 0u, safe_steps);
  uint32_t counts[64]{};
  uint32_t remainders[65]{};
  remainders[0] = safe_fills;
  uint32_t divisor = safe_steps - safe_fills;
  int32_t level = 0;
  while (remainders[level] > 1u && level < 63) {
    counts[level] = divisor / remainders[level];
    remainders[level + 1] = divisor % remainders[level];
    divisor = remainders[level];
    level += 1;
  }
  counts[level] = divisor;

  bool pattern[64]{};
  uint32_t length = 0;
  buildEuclidPattern(level, counts, remainders, pattern, length);
  if (length == 0u) {
    return false;
  }
  const uint32_t rotated = positiveModulo(static_cast<int32_t>(step % safe_steps) - rotation, safe_steps);
  return pattern[rotated % length];
}

} // namespace kessho::product::internal
