#include "../KesshoProductEngineInternal.h"

void KesshoProductEngine::renderFx(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  renderFxGraph(out_l, out_r, start, frames);
}
