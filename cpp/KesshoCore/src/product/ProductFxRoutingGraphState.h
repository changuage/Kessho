#pragma once
#include "ProductDynamicsRouteConstants.h"
#include <cstdint>
namespace kessho::product::internal {
enum ProductFxNode : uint8_t {
  kFxNodeDelayA = 0u,
  kFxNodeDelayB,
  kFxNodeGranular,
  kFxNodeDegrade,
  kFxNodeFreeze,
  kFxNodeReverb,
  kFxNodeEq1,
  kFxNodeEq2,
  kFxNodeSidechain,
  kFxNodeCreativeSaturation,
  kFxNodeCount,
};
static_assert(kFxNodeCount <= 16u, "FX edge masks require at most 16 nodes");
struct FxRoutingGraphState {
  float fx_route_amount[kFxNodeCount][kFxNodeCount]{};
  uint8_t fx_route_mode[kFxNodeCount][kFxNodeCount]{};
  float fx_route_min[kFxNodeCount][kFxNodeCount]{};
  float fx_route_max[kFxNodeCount][kFxNodeCount]{};
  float fx_route_effective_amount[kFxNodeCount][kFxNodeCount]{};
  float fx_route_walk_position[kFxNodeCount][kFxNodeCount]{};
  uint64_t fx_route_walk_step[kFxNodeCount][kFxNodeCount]{};
  uint16_t fx_edge_mask[kFxNodeCount]{};
  uint8_t fx_render_order[kFxNodeCount]{};
  uint32_t fx_dynamics_bus[kFxNodeCount]{};

  FxRoutingGraphState() {
    for (uint8_t node = 0u; node < kFxNodeCount; ++node) fx_render_order[node] = node;
  }
  void clearFxGraph() {
    for (uint8_t from = 0u; from < kFxNodeCount; ++from) {
      fx_edge_mask[from] = 0u;
      fx_dynamics_bus[from] = kDynamicsBusSkip;
      fx_render_order[from] = from;
      for (uint8_t to = 0u; to < kFxNodeCount; ++to) {
        fx_route_amount[from][to] = 0.0f;
        fx_route_mode[from][to] = 0u;
        fx_route_min[from][to] = 0.0f;
        fx_route_max[from][to] = 0.0f;
        fx_route_effective_amount[from][to] = 0.0f;
        fx_route_walk_position[from][to] = 0.5f;
        fx_route_walk_step[from][to] = UINT64_MAX;
      }
    }
  }
  bool fxEdgeEnabled(uint8_t from, uint8_t to) const {
    return from < kFxNodeCount && to < kFxNodeCount &&
        (fx_edge_mask[from] & static_cast<uint16_t>(1u << to)) != 0u;
  }
  bool fxNodeCanReach(uint8_t from, uint8_t target) const {
    if (from >= kFxNodeCount || target >= kFxNodeCount) return false;
    bool visited[kFxNodeCount]{};
    bool queued[kFxNodeCount]{};
    uint8_t stack[kFxNodeCount]{};
    uint8_t stack_size = 0u;
    stack[stack_size++] = from;
    queued[from] = true;
    while (stack_size > 0u) {
      const uint8_t node = stack[--stack_size];
      if (node == target) return true;
      if (visited[node]) continue;
      visited[node] = true;
      const uint16_t edges = fx_edge_mask[node];
      for (uint8_t next = 0u; next < kFxNodeCount; ++next) {
        if (!queued[next] && (edges & static_cast<uint16_t>(1u << next)) != 0u) {
          queued[next] = true;
          stack[stack_size++] = next;
        }
      }
    }
    return false;
  }
  bool canEnableFxEdge(uint8_t from, uint8_t to) const {
    if (from >= kFxNodeCount || to >= kFxNodeCount || from == to) return false;
    return fxEdgeEnabled(from, to) || !fxNodeCanReach(to, from);
  }
  bool rebuildFxRenderOrder() {
    uint8_t indegree[kFxNodeCount]{};
    bool emitted[kFxNodeCount]{};
    for (uint8_t from = 0u; from < kFxNodeCount; ++from) {
      const uint16_t edges = fx_edge_mask[from];
      for (uint8_t to = 0u; to < kFxNodeCount; ++to) {
        if ((edges & static_cast<uint16_t>(1u << to)) != 0u) ++indegree[to];
      }
    }
    for (uint8_t order_index = 0u; order_index < kFxNodeCount; ++order_index) {
      uint8_t next = kFxNodeCount;
      for (uint8_t node = 0u; node < kFxNodeCount; ++node) {
        if (!emitted[node] && indegree[node] == 0u) {
          next = node;
          break;
        }
      }
      if (next == kFxNodeCount) return false;
      emitted[next] = true;
      fx_render_order[order_index] = next;
      const uint16_t edges = fx_edge_mask[next];
      for (uint8_t to = 0u; to < kFxNodeCount; ++to) {
        if ((edges & static_cast<uint16_t>(1u << to)) != 0u) --indegree[to];
      }
    }
    return true;
  }

  bool setFxEdgeEnabled(uint8_t from, uint8_t to, bool enabled) {
    if (from >= kFxNodeCount || to >= kFxNodeCount || from == to) return false;
    const uint16_t bit = static_cast<uint16_t>(1u << to);
    if (enabled) {
      if (!canEnableFxEdge(from, to)) return false;
      fx_edge_mask[from] |= bit;
    } else {
      fx_edge_mask[from] &= static_cast<uint16_t>(~bit);
    }
    return rebuildFxRenderOrder();
  }

  bool setFxRoute(uint8_t from, uint8_t to, float amount, bool enabled) {
    if (!setFxEdgeEnabled(from, to, enabled)) return false;
    fx_route_amount[from][to] = enabled ? amount : 0.0f;
    if (enabled && fx_route_mode[from][to] == 0u) {
      fx_route_min[from][to] = amount;
      fx_route_max[from][to] = amount;
      fx_route_effective_amount[from][to] = amount;
    }
    return true;
  }

  void setFxRouteModulation(uint8_t from, uint8_t to, uint8_t mode, float min_value, float max_value) {
    if (from >= kFxNodeCount || to >= kFxNodeCount) return;
    fx_route_mode[from][to] = mode > 3u ? 0u : mode;
    fx_route_min[from][to] = min_value;
    fx_route_max[from][to] = max_value;
    fx_route_walk_position[from][to] = max_value > min_value
        ? (fx_route_amount[from][to] - min_value) / (max_value - min_value)
        : 0.5f;
    if (fx_route_walk_position[from][to] < 0.0f) fx_route_walk_position[from][to] = 0.0f;
    if (fx_route_walk_position[from][to] > 1.0f) fx_route_walk_position[from][to] = 1.0f;
    fx_route_walk_step[from][to] = UINT64_MAX;
    fx_route_effective_amount[from][to] = fx_route_amount[from][to];
  }
};

} // namespace kessho::product::internal
