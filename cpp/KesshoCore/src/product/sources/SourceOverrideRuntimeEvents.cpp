#include "../KesshoProductEngineInternal.h"

bool KesshoProductEngine::applyRuntimeSourceOverrideParam(uint32_t source_id, uint32_t param_index, float value) {
  if (source_id < 1u || source_id > kSourceCount || !std::isfinite(value)) {
    return false;
  }
  const uint32_t param_count = sourceOverrideParamCountForSource(source_id);
  if (param_count == 0u || param_index >= param_count) {
    return false;
  }
  SourceState& source = sources[source_id - 1u];
  if ((isPadProductSource(source_id) || isLeadProductSource(source_id)) && !source.source_preset_endpoint_valid) {
    return false;
  }
  if (source_id == KESSHO_PRODUCT_SOURCE_DRUM && !source.source_preset_patch_valid) {
    return false;
  }
  uint32_t* override_count = nullptr;
  uint32_t* override_indices = nullptr;
  float* override_values = nullptr;
  if (!sourceOverrideStorage(source, source_id, override_count, override_indices, override_values)) {
    return false;
  }

  for (uint32_t slot = 0u; slot < *override_count && slot < param_count; ++slot) {
    if (override_indices[slot] == param_index) {
      override_values[slot] = value;
      float morph_anchor = source.morph;
      source.structured_override_morph_anchor_enabled =
          activeSequencerEndpointMorphAnchor(source_id, source, morph_anchor);
      source.structured_override_morph_anchor = morph_anchor;
      return applyStructuredSourceOverridesToModuleForCurrentMorph(source_id);
    }
  }
  if (*override_count >= param_count) {
    return false;
  }
  const uint32_t slot = *override_count;
  override_indices[slot] = param_index;
  override_values[slot] = value;
  *override_count = slot + 1u;
  float morph_anchor = source.morph;
  source.structured_override_morph_anchor_enabled =
      activeSequencerEndpointMorphAnchor(source_id, source, morph_anchor);
  source.structured_override_morph_anchor = morph_anchor;
  return applyStructuredSourceOverridesToModuleForCurrentMorph(source_id);
}

void KesshoProductEngine::applySourceOverrideEvent(const KesshoProductEvent& event) {
  if (event.target_id < 1u || event.target_id > kSourceCount) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
    return;
  }
  const uint32_t param_count = sourceOverrideParamCountForSource(event.target_id);
  if (param_count == 0u) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
    return;
  }
  SourceState& source = sources[event.target_id - 1u];
  uint32_t* override_count = nullptr;
  uint32_t* override_indices = nullptr;
  float* override_values = nullptr;
  if (!sourceOverrideStorage(source, event.target_id, override_count, override_indices, override_values)) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
    return;
  }
  const bool set_slot = (event.flags & KESSHO_PRODUCT_SOURCE_OVERRIDE_SET_SLOT) != 0u;
  const bool commit = (event.flags & KESSHO_PRODUCT_SOURCE_OVERRIDE_COMMIT) != 0u;
  if (set_slot == commit) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    return;
  }
  if (set_slot) {
    if (event.index >= param_count || event.param_id >= param_count) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
      return;
    }
    override_indices[event.index] = event.param_id;
    override_values[event.index] = event.value;
    telemetry.last_error_code = KESSHO_PRODUCT_OK;
    return;
  }
  if (event.index > param_count) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
    return;
  }
  *override_count = event.index;
  const bool explicit_morph_anchor =
      (event.flags & KESSHO_PRODUCT_SOURCE_OVERRIDE_MORPH_ANCHORED) != 0u;
  float morph_anchor = source.morph;
  source.structured_override_morph_anchor_enabled = explicit_morph_anchor && std::isfinite(event.value);
  if (source.structured_override_morph_anchor_enabled) {
    morph_anchor = clampFloat(event.value, 0.0f, 1.0f);
  } else {
    source.structured_override_morph_anchor_enabled =
        activeSequencerEndpointMorphAnchor(event.target_id, source, morph_anchor);
  }
  source.structured_override_morph_anchor = morph_anchor;
  for (uint32_t slot = *override_count; slot < param_count; ++slot) {
    override_indices[slot] = 0u;
    override_values[slot] = 0.0f;
  }

  if (!applyStructuredSourceOverridesToModuleForCurrentMorph(event.target_id)) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    return;
  }
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
}
