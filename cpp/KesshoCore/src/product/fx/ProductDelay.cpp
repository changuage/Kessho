#include "../KesshoProductEngineInternal.h"

  void KesshoProductEngine::renderDelayModule(
      kessho::core::IKesshoModule* module,
      float* input_l,
      float* input_r,
      float* cross_l,
      float* cross_r,
      float* out_l,
      float* out_r,
      uint32_t start,
      uint32_t frames) {
  if (module == nullptr || frames == 0u) {
    return;
  }
  float* tap_l[kModuleTapCount]{};
  float* tap_r[kModuleTapCount]{};
  for (uint32_t bus = 0; bus < kModuleTapCount; ++bus) {
    tap_l[bus] = module_tap_l[bus];
    tap_r[bus] = module_tap_r[bus];
    std::fill(module_tap_l[bus], module_tap_l[bus] + frames, 0.0f);
    std::fill(module_tap_r[bus], module_tap_r[bus] + frames, 0.0f);
  }
  module->processPlanarStereoTaps(input_l + start, input_r + start, tap_l, tap_r, KESSHO_MODULE_DELAY_A_OUTPUT_TAP_COUNT, static_cast<int>(frames));
  mixFxBuffer(
      module_tap_l[KESSHO_MODULE_DELAY_A_TAP_MAIN],
      module_tap_r[KESSHO_MODULE_DELAY_A_TAP_MAIN],
      out_l,
      out_r,
      start,
      frames,
      1.0f,
      module == delay_a_module.get() ? kSidechainDelayA : kSidechainDelayB);
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    reverb_bus_l[frame] += module_tap_l[KESSHO_MODULE_DELAY_A_TAP_REVERB_SEND][i];
    reverb_bus_r[frame] += module_tap_r[KESSHO_MODULE_DELAY_A_TAP_REVERB_SEND][i];
    cross_l[frame] += module_tap_l[KESSHO_MODULE_DELAY_A_TAP_DELAY_B_SEND][i];
    cross_r[frame] += module_tap_r[KESSHO_MODULE_DELAY_A_TAP_DELAY_B_SEND][i];
    granular_bus_l[frame] += module_tap_l[KESSHO_MODULE_DELAY_A_TAP_GRANULAR_SEND][i];
    granular_bus_r[frame] += module_tap_r[KESSHO_MODULE_DELAY_A_TAP_GRANULAR_SEND][i];
  }
}
