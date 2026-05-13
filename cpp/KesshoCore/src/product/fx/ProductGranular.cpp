#include "../KesshoProductEngineInternal.h"

  void KesshoProductEngine::renderGranular(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  const bool active =
      fx.granular_enabled &&
      (fx.granular_mix > 0.0001f || routing.granular_to_reverb > 0.0001f);
  if (granular_module == nullptr || frames == 0u || !active) {
    return;
  }
  std::fill(module_l, module_l + frames, 0.0f);
  std::fill(module_r, module_r + frames, 0.0f);
  granular_module->processPlanarStereo(granular_bus_l + start, granular_bus_r + start, module_l, module_r, static_cast<int>(frames));
  mixFxBuffer(module_l, module_r, out_l, out_r, start, frames, fx.granular_mix, kSidechainGranular);
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    reverb_bus_l[frame] += module_l[i] * routing.granular_to_reverb;
    reverb_bus_r[frame] += module_r[i] * routing.granular_to_reverb;
  }
}
