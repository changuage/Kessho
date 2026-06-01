#include "../KesshoProductEngineInternal.h"

namespace {

void bumpPresetRuntimeRevision(SourceState& source) {
  ++source.source_preset_runtime_revision;
  if (source.source_preset_runtime_revision == 0u) {
    source.source_preset_runtime_revision = 1u;
  }
  source.applied_module_patch_ptr = nullptr;
  source.applied_module_patch_revision = 0u;
}

} // namespace

void KesshoProductEngine::compileSourcePresetRuntime(SourceState& source) {
  bumpPresetRuntimeRevision(source);
  source.source_preset_patch_valid = false;
  source.source_preset_patch = {};
  source.source_preset_macro_morph = 0.0f;
  source.source_preset_macro_distance = 0.0f;
  source.source_preset_macro_expression = 1.0f;
  const auto* preset = findSourcePreset(source.preset_id);
  if (!sourcePresetMatchesSource(source.source_id, preset)) {
    return;
  }
  source.source_preset_patch_valid = true;
  source.source_preset_patch = sourcePresetPatch(*preset);
  source.source_preset_macro_morph = preset->macro_morph;
  source.source_preset_macro_distance = preset->macro_distance;
  source.source_preset_macro_expression = preset->macro_expression;
  if (source.source_id == KESSHO_PRODUCT_SOURCE_DRUM) {
    source.source_preset_patch = drumVoiceMorphPatch(source);
    applyDrumStructuredOverridesToPatch(
        source.source_preset_patch,
        source.drum_override_count,
        source.drum_override_indices,
        source.drum_override_values);
    source.source_preset_patch_valid =
        source.source_preset_patch.exact_drum_param_count == kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT;
  }
}

void KesshoProductEngine::compileSourcePresetEndpoints(SourceState& source) {
  bumpPresetRuntimeRevision(source);
  source.source_preset_endpoint_valid = false;
  source.source_preset_endpoint_a = {};
  source.source_preset_endpoint_b = {};
  const bool source_endpoint_target =
      source.source_id == KESSHO_PRODUCT_SOURCE_PAD1 ||
      source.source_id == KESSHO_PRODUCT_SOURCE_PAD2 ||
      source.source_id == KESSHO_PRODUCT_SOURCE_LEAD1 ||
      source.source_id == KESSHO_PRODUCT_SOURCE_LEAD2;
  if (!source_endpoint_target || source.source_preset_a_id == 0u ||
      source.source_preset_b_id == 0u) {
    return;
  }
  const auto* endpoint_a_preset = findSourcePreset(source.source_preset_a_id);
  const auto* endpoint_b_preset = findSourcePreset(source.source_preset_b_id);
  if (!sourcePresetMatchesSource(source.source_id, endpoint_a_preset) ||
      !sourcePresetMatchesSource(source.source_id, endpoint_b_preset)) {
    return;
  }
  const auto endpoint_a = sourcePresetPatch(*endpoint_a_preset);
  const auto endpoint_b = sourcePresetPatch(*endpoint_b_preset);
  const bool pad_endpoint =
      (source.source_id == KESSHO_PRODUCT_SOURCE_PAD1 || source.source_id == KESSHO_PRODUCT_SOURCE_PAD2) &&
      endpoint_a.exact_pad_param_count == kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT &&
      endpoint_b.exact_pad_param_count == kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT;
  const bool lead_endpoint =
      (source.source_id == KESSHO_PRODUCT_SOURCE_LEAD1 || source.source_id == KESSHO_PRODUCT_SOURCE_LEAD2) &&
      endpoint_a.exact_lead_param_count == kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT &&
      endpoint_b.exact_lead_param_count == kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT;
  if (pad_endpoint || lead_endpoint) {
    source.source_preset_endpoint_valid = true;
    source.source_preset_endpoint_a = endpoint_a;
    source.source_preset_endpoint_b = endpoint_b;
  }
}
