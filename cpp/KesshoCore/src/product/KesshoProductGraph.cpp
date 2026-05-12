#include "KesshoProductEngineInternal.h"

  void KesshoProductEngine::renderPadModule(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  if (!pad_module || frames == 0u) {
    return;
  }
  advancePadVoiceReleases(frames);
  float* tap_l[kModuleTapCount]{};
  float* tap_r[kModuleTapCount]{};
  for (uint32_t bus = 0; bus < kModuleTapCount; ++bus) {
    tap_l[bus] = module_tap_l[bus];
    tap_r[bus] = module_tap_r[bus];
    std::fill(module_tap_l[bus], module_tap_l[bus] + frames, 0.0f);
    std::fill(module_tap_r[bus], module_tap_r[bus] + frames, 0.0f);
  }
  pad_module->processPlanarStereoTaps(silent_l, silent_r, tap_l, tap_r, KESSHO_MODULE_PAD_OUTPUT_TAP_COUNT, static_cast<int>(frames));
  processPadPostChain(
      0u,
      KESSHO_PRODUCT_SOURCE_PAD1,
      module_tap_l[KESSHO_MODULE_TAP_POSTFADER_PAD1],
      module_tap_r[KESSHO_MODULE_TAP_POSTFADER_PAD1],
      frames);
  processPadPostChain(
      1u,
      KESSHO_PRODUCT_SOURCE_PAD2,
      module_tap_l[KESSHO_MODULE_TAP_POSTFADER_PAD2],
      module_tap_r[KESSHO_MODULE_TAP_POSTFADER_PAD2],
      frames);
  mixPadSourceBuffer(
      KESSHO_PRODUCT_SOURCE_PAD1,
      module_tap_l[KESSHO_MODULE_TAP_POSTFADER_PAD1],
      module_tap_r[KESSHO_MODULE_TAP_POSTFADER_PAD1],
      module_tap_l[KESSHO_MODULE_TAP_PREFADER_PAD1],
      module_tap_r[KESSHO_MODULE_TAP_PREFADER_PAD1],
      out_l,
      out_r,
      start,
      frames);
  mixPadSourceBuffer(
      KESSHO_PRODUCT_SOURCE_PAD2,
      module_tap_l[KESSHO_MODULE_TAP_POSTFADER_PAD2],
      module_tap_r[KESSHO_MODULE_TAP_POSTFADER_PAD2],
      module_tap_l[KESSHO_MODULE_TAP_PREFADER_PAD2],
      module_tap_r[KESSHO_MODULE_TAP_PREFADER_PAD2],
      out_l,
      out_r,
      start,
      frames);
}

  void KesshoProductEngine::renderSingleModuleSource(
      kessho::core::IKesshoModule* module,
      uint32_t source_id,
      float* out_l,
      float* out_r,
      uint32_t start,
      uint32_t frames) {
  if (module == nullptr || frames == 0u) {
    return;
  }
  std::fill(module_l, module_l + frames, 0.0f);
  std::fill(module_r, module_r + frames, 0.0f);
  module->processPlanarStereo(silent_l, silent_r, module_l, module_r, static_cast<int>(frames));
  if (source_id == KESSHO_PRODUCT_SOURCE_LEAD1) {
    processLeadPostChain(0u, source_id, module_l, module_r, frames);
  } else if (source_id == KESSHO_PRODUCT_SOURCE_LEAD2) {
    processLeadPostChain(1u, source_id, module_l, module_r, frames);
  }
  mixSourceBuffer(source_id, module_l, module_r, out_l, out_r, start, frames);
}

  void KesshoProductEngine::renderProductModules(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  if (!modules_ready || frames == 0u) {
    return;
  }
  renderPadModule(out_l, out_r, start, frames);
  renderSingleModuleSource(lead_modules[0].get(), KESSHO_PRODUCT_SOURCE_LEAD1, out_l, out_r, start, frames);
  renderSingleModuleSource(lead_modules[1].get(), KESSHO_PRODUCT_SOURCE_LEAD2, out_l, out_r, start, frames);
  renderSingleModuleSource(drum_module.get(), KESSHO_PRODUCT_SOURCE_DRUM, out_l, out_r, start, frames);
}
