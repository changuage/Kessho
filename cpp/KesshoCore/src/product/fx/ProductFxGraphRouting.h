#pragma once

#include <cstdint>

struct KesshoProductEngine;

namespace kessho::product::internal {

void routeFxGraphNode(
    KesshoProductEngine& engine,
    uint8_t node,
    uint32_t start,
    uint32_t frames);

} // namespace kessho::product::internal
