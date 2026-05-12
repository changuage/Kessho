#include "../KesshoProductEngineInternal.h"

namespace kessho::product::internal {

uint32_t circleOfFifthsProgressionDegree(
    uint32_t seed,
    float tension,
    uint64_t bar,
    uint64_t phrase,
    uint32_t scale_count) {
  if (scale_count == 0u || tension <= 0.5f) {
    return 0u;
  }
  return hashU32(seed ^ static_cast<uint32_t>(bar * 31u) ^ static_cast<uint32_t>(phrase * 131u)) % scale_count;
}

} // namespace kessho::product::internal
