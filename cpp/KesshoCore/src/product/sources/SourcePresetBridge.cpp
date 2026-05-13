#include "../KesshoProductEngineInternal.h"

  void KesshoProductEngine::applySourcePresetMacros(const SourceState& source, float& morph, float& distance, float& expression) const {
  const auto* preset = findSourcePreset(source.preset_id);
  if (preset == nullptr) {
    return;
  }
  morph = clampFloat(morph + preset->macro_morph, 0.0f, 1.0f);
  distance = clampFloat(distance + preset->macro_distance, 0.0f, 1.0f);
  expression = clampFloat(expression * preset->macro_expression, 0.0f, 1.0f);
}

  bool KesshoProductEngine::exactPadMacrosDifferFromDefaults(float morph, float distance, float expression) const {
  return std::abs(morph) > 0.0001f ||
         std::abs(distance) > 0.0001f ||
         std::abs(expression - kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_EXPRESSION) > 0.0001f;
}
