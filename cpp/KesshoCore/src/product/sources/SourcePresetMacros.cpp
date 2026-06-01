#include "../KesshoProductEngineInternal.h"

void KesshoProductEngine::applySourcePresetMacros(
    const SourceState& source,
    float& morph,
    float& distance,
    float& expression) const {
  if (!source.source_preset_patch_valid) {
    return;
  }
  morph = clampFloat(morph + source.source_preset_macro_morph, 0.0f, 1.0f);
  distance = clampFloat(distance + source.source_preset_macro_distance, 0.0f, 1.0f);
  expression = clampFloat(expression * source.source_preset_macro_expression, 0.0f, 1.0f);
}

bool KesshoProductEngine::sourceMacrosDifferFromDefaults(float morph, float distance, float expression) const {
  return std::abs(morph) > 0.0001f ||
         std::abs(distance) > 0.0001f ||
         std::abs(expression - kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_EXPRESSION) > 0.0001f;
}
