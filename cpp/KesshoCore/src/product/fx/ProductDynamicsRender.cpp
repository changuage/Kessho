#include "../KesshoProductEngineInternal.h"

void KesshoProductEngine::renderDynamics(float* out_l, float* out_r, uint32_t frames) {
  const bool dynamics_active =
      (fx.dynamics_master_saturation_enabled && fx.dynamics_drive > 0.0001f) ||
      (fx.dynamics_end_comp_enabled && fx.dynamics_end_comp_mix > 0.0001f);
  if (dynamics_drift_module == nullptr || frames == 0u || !dynamics_active) {
    return;
  }
  std::fill(module_l, module_l + frames, 0.0f);
  std::fill(module_r, module_r + frames, 0.0f);
  dynamics_drift_module->processPlanarStereo(out_l, out_r, module_l, module_r, static_cast<int>(frames));
  for (uint32_t i = 0; i < frames; ++i) {
    out_l[i] = module_l[i];
    out_r[i] = module_r[i];
  }
}
