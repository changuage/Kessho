#include "../KesshoProductEngineInternal.h"

float KesshoProductEngine::dynamicsModRoute(const float sources[kDynamicsModSourceCount], uint32_t target) const {
  if (target >= kDynamicsModTargetCount) {
    return 0.0f;
  }
  float sum = 0.0f;
  for (uint32_t source = 0; source < kDynamicsModSourceCount; ++source) {
    sum += sources[source] * clampFloat(fx.dynamics_mod[source][target], 0.0f, 1.0f);
  }
  return clampFloat(sum, 0.0f, 1.0f);
}
