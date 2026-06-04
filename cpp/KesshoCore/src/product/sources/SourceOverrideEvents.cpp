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

bool activeSequencerEndpointMorphAnchor(
    KesshoProductEngine& engine,
    uint32_t source_id,
    SourceState& source,
    float& morph_anchor) {
  if (!isPadProductSource(source_id) && !isLeadProductSource(source_id)) {
    return false;
  }
  float live_morph = source.morph;
  if (!engine.activeSequencerMorphForPresetSource(source_id, DRUM_NUM_VOICE_TYPES, live_morph)) {
    return false;
  }
  live_morph = clampFloat(live_morph, 0.0f, 1.0f);
  if (std::fabs(live_morph) > 0.001f && std::fabs(live_morph - 1.0f) > 0.001f) {
    return false;
  }
  morph_anchor = live_morph;
  return true;
}
}

bool KesshoProductEngine::applyStructuredSourceOverridesToModule(uint32_t source_id) {
  if (source_id < 1u || source_id > kSourceCount) {
    return false;
  }
  SourceState& source = sources[source_id - 1u];
  return applyStructuredSourceOverridesToModuleAtMorphAndDistance(source_id, source.morph, source.distance);
}

bool KesshoProductEngine::applyStructuredSourceOverridesToModuleForCurrentMorph(uint32_t source_id) {
  if (source_id < 1u || source_id > kSourceCount) {
    return false;
  }
  if (isPadProductSource(source_id) || isLeadProductSource(source_id)) {
    SourceState& source = sources[source_id - 1u];
    float live_morph = source.morph;
    float live_distance = source.distance;
    const bool has_live_morph =
        activeSequencerMorphForPresetSource(source_id, DRUM_NUM_VOICE_TYPES, live_morph);
    const bool has_live_distance =
        activeSequencerDistanceForPresetSource(source_id, DRUM_NUM_VOICE_TYPES, live_distance);
    if (has_live_morph || has_live_distance) {
      return applyStructuredSourceOverridesToModuleAtMorphAndDistance(source_id, live_morph, live_distance);
    }
  }
  return applyStructuredSourceOverridesToModule(source_id);
}

bool KesshoProductEngine::applyStructuredSourceOverridesToModuleAtMorph(uint32_t source_id, float morph) {
  if (source_id < 1u || source_id > kSourceCount) {
    return false;
  }
  return applyStructuredSourceOverridesToModuleAtMorphAndDistance(
      source_id,
      morph,
      sources[source_id - 1u].distance);
}

bool KesshoProductEngine::applyStructuredSourceOverridesToModuleAtMorphAndDistance(
    uint32_t source_id,
    float morph,
    float distance) {
  if (source_id < 1u || source_id > kSourceCount || !std::isfinite(morph)) {
    return false;
  }
  SourceState& source = sources[source_id - 1u];
  if (isPadProductSource(source_id)) {
    kessho::core::KesshoSourcePresetPatch patch{};
    const auto* resolved_patch = resolveSourcePresetEndpointPatch(
        source,
        source_id,
        clampFloat(morph, 0.0f, 1.0f),
        clampFloat(distance, 0.0f, 1.0f),
        patch);
    if (resolved_patch == nullptr ||
        resolved_patch->exact_pad_param_count != kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT) {
      return false;
    }
    if (pad_module) {
      const uint32_t pad_index = source_id == KESSHO_PRODUCT_SOURCE_PAD2 ? 1u : 0u;
      pad_module->setSourcePresetPatch(static_cast<int>(pad_index), *resolved_patch);
      source.applied_module_patch_ptr = nullptr;
      source.applied_module_patch_revision = 0u;
    }
    return true;
  }

  if (isLeadProductSource(source_id)) {
    kessho::core::KesshoSourcePresetPatch patch{};
    const auto* resolved_patch = resolveSourcePresetEndpointPatch(
        source,
        source_id,
        clampFloat(morph, 0.0f, 1.0f),
        clampFloat(distance, 0.0f, 1.0f),
        patch);
    if (resolved_patch == nullptr ||
        resolved_patch->exact_lead_param_count != kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT) {
      return false;
    }
    const uint32_t lead_index = source_id == KESSHO_PRODUCT_SOURCE_LEAD2 ? 1u : 0u;
    if (lead_modules[lead_index]) {
      lead_modules[lead_index]->setSourcePresetPatch(static_cast<int>(lead_index), *resolved_patch);
      source.applied_module_patch_ptr = nullptr;
      source.applied_module_patch_revision = 0u;
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
    source.applied_module_patch_ptr = nullptr;
    source.applied_module_patch_revision = 0u;
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
      float morph_anchor = source.morph;
      source.structured_override_morph_anchor_enabled =
          activeSequencerEndpointMorphAnchor(*this, source_id, source, morph_anchor);
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
      activeSequencerEndpointMorphAnchor(*this, source_id, source, morph_anchor);
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
        activeSequencerEndpointMorphAnchor(*this, event.target_id, source, morph_anchor);
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
