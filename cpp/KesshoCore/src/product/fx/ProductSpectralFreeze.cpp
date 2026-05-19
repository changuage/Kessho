#include "../KesshoProductEngineInternal.h"

  bool KesshoProductEngine::processSpectralFreezeBranch(
      float* input_l,
      float* input_r,
      float* output_l,
      float* output_r,
      uint32_t start,
      uint32_t frames) {
  if (
      spectral_freeze_module == nullptr ||
      input_l == nullptr ||
      input_r == nullptr ||
      output_l == nullptr ||
      output_r == nullptr ||
      frames == 0u ||
      !fx.spectral_freeze_enabled ||
      fx.spectral_freeze_mix <= 0.0f) {
    return false;
  }
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    if (graph_taps_enabled) {
      graph_spectral_freeze_input_l[frame] = input_l[i];
      graph_spectral_freeze_input_r[frame] = input_r[i];
    }
  }
  spectral_freeze_module->processPlanarStereo(input_l, input_r, output_l, output_r, static_cast<int>(frames));
  const float mix = clampFloat(fx.spectral_freeze_mix, 0.0f, 1.0f);
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    output_l[i] = input_l[i] * (1.0f - mix) + output_l[i] * mix;
    output_r[i] = input_r[i] * (1.0f - mix) + output_r[i] * mix;
    if (graph_taps_enabled) {
      graph_spectral_freeze_output_l[frame] = output_l[i];
      graph_spectral_freeze_output_r[frame] = output_r[i];
    }
  }
  return true;
}
