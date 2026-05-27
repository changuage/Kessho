#include "../KesshoProductEngineInternal.h"

namespace {
bool sourceOverrideStorage(
    SourceState& source,
    uint32_t source_id,
    uint32_t*& count,
    uint32_t*& indices,
    float*& values) {
  if (isPadProductSource(source_id)) {
    count = &source.pad_override_count;
    indices = source.pad_override_indices;
    values = source.pad_override_values;
    return true;
  }
  if (isLeadProductSource(source_id)) {
    count = &source.lead_override_count;
    indices = source.lead_override_indices;
    values = source.lead_override_values;
    return true;
  }
  if (source_id == KESSHO_PRODUCT_SOURCE_DRUM) {
    count = &source.drum_override_count;
    indices = source.drum_override_indices;
    values = source.drum_override_values;
    return true;
  }
  return false;
}
}

bool KesshoProductEngine::applyStructuredSourceOverridesToModule(uint32_t source_id) {
  if (source_id < 1u || source_id > kSourceCount) {
    return false;
  }
  SourceState& source = sources[source_id - 1u];
  if (isPadProductSource(source_id)) {
    kessho::core::KesshoSourcePresetPatch patch{};
    const auto* resolved_patch = resolveSourcePresetEndpointPatch(
        source,
        source_id,
        source.morph,
        source.distance,
        patch);
    if (resolved_patch == nullptr ||
        resolved_patch->exact_pad_param_count != kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT) {
      return false;
    }
    if (pad_module) {
      const uint32_t pad_index = source_id == KESSHO_PRODUCT_SOURCE_PAD2 ? 1u : 0u;
      pad_module->setSourcePresetPatch(static_cast<int>(pad_index), *resolved_patch);
    }
    return true;
  }

  if (isLeadProductSource(source_id)) {
    kessho::core::KesshoSourcePresetPatch patch{};
    const auto* resolved_patch = resolveSourcePresetEndpointPatch(
        source,
        source_id,
        source.morph,
        source.distance,
        patch);
    if (resolved_patch == nullptr ||
        resolved_patch->exact_lead_param_count != kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT) {
      return false;
    }
    const uint32_t lead_index = source_id == KESSHO_PRODUCT_SOURCE_LEAD2 ? 1u : 0u;
    if (lead_modules[lead_index]) {
      lead_modules[lead_index]->setSourcePresetPatch(static_cast<int>(lead_index), *resolved_patch);
    }
    return true;
  }

  if (source_id != KESSHO_PRODUCT_SOURCE_DRUM) {
    return false;
  }
  compileSourcePresetRuntime(source);
  if (!source.source_preset_patch_valid ||
      source.source_preset_patch.exact_drum_param_count != kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT) {
    return false;
  }
  if (drum_module) {
    auto patch = source.source_preset_patch;
    applyDrumSourceMixFieldsToPatch(patch, source.level, source.reverb_send);
    drum_module->setSourcePresetPatch(0, patch);
  }
  return true;
}

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
      return applyStructuredSourceOverridesToModule(source_id);
    }
  }
  if (*override_count >= param_count) {
    return false;
  }
  const uint32_t slot = *override_count;
  override_indices[slot] = param_index;
  override_values[slot] = value;
  *override_count = slot + 1u;
  return applyStructuredSourceOverridesToModule(source_id);
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
  for (uint32_t slot = *override_count; slot < param_count; ++slot) {
    override_indices[slot] = 0u;
    override_values[slot] = 0.0f;
  }

  if (!applyStructuredSourceOverridesToModule(event.target_id)) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    return;
  }
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
}
