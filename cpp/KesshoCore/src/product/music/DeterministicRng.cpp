#include "../KesshoProductEngineInternal.h"

namespace kessho::product::internal {

uint32_t hashU32(uint32_t value) {
  value ^= value >> 16;
  value *= 0x7feb352du;
  value ^= value >> 15;
  value *= 0x846ca68bu;
  value ^= value >> 16;
  return value;
}

float hashUnit(uint32_t value) {
  return static_cast<float>(hashU32(value) & 0x00ffffffu) / static_cast<float>(0x01000000u);
}

} // namespace kessho::product::internal
