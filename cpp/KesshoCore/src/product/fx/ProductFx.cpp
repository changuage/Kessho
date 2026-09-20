#include "../KesshoProductEngineInternal.h"

void KesshoProductEngine::beginFxConfigurationBatch() {
  ++fx_configuration_batch_depth;
}

void KesshoProductEngine::endFxConfigurationBatch() {
  if (fx_configuration_batch_depth == 0u) return;
  --fx_configuration_batch_depth;
  if (fx_configuration_batch_depth != 0u) return;
  const bool configure_all = fx_configuration_pending;
  const bool configure_reverb = reverb_configuration_pending;
  const bool configure_spectral_freeze = spectral_freeze_configuration_pending;
  fx_configuration_pending = false;
  reverb_configuration_pending = false;
  spectral_freeze_configuration_pending = false;
  if (configure_all) {
    configureFxModules();
  } else {
    if (configure_reverb) configureReverbModule();
    if (configure_spectral_freeze) configureSpectralFreezeModule();
  }
  if (soundscapes_module_params_dirty) configureSoundscapesModuleFromSource();
}

void KesshoProductEngine::renderFx(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  renderFxGraph(out_l, out_r, start, frames);
}
