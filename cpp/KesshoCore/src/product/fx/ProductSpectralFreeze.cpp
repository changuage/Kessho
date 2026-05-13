#include "../KesshoProductEngineInternal.h"

  void KesshoProductEngine::renderSpectralFreeze(float* out_l, float* out_r, uint32_t frames) {
  if (spectral_freeze_module == nullptr || frames == 0u || !fx.spectral_freeze_enabled || fx.spectral_freeze_mix <= 0.0f) {
    return;
  }
  std::fill(module_l, module_l + frames, 0.0f);
  std::fill(module_r, module_r + frames, 0.0f);
  spectral_freeze_module->processPlanarStereo(out_l, out_r, module_l, module_r, static_cast<int>(frames));
  const float mix = clampFloat(fx.spectral_freeze_mix, 0.0f, 1.0f);
  for (uint32_t i = 0; i < frames; ++i) {
    const float wet_l = module_l[i] * mix;
    const float wet_r = module_r[i] * mix;
    out_l[i] = out_l[i] * (1.0f - mix) + wet_l;
    out_r[i] = out_r[i] * (1.0f - mix) + wet_r;
    stem_l[KESSHO_PRODUCT_STEM_FX][i] += wet_l;
    stem_r[KESSHO_PRODUCT_STEM_FX][i] += wet_r;
  }
}
