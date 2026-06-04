#include "../KesshoProductEngineInternal.h"

bool KesshoProductEngine::sourceOverrideStorage(
    SourceState& source,
    uint32_t source_id,
    uint32_t*& count,
    uint32_t*& indices,
    float*& values) const {
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

bool KesshoProductEngine::activeSequencerEndpointMorphAnchor(
    uint32_t source_id,
    SourceState& source,
    float& morph_anchor) const {
  if (!isPadProductSource(source_id) && !isLeadProductSource(source_id)) {
    return false;
  }
  float live_morph = source.morph;
  if (!activeSequencerMorphForPresetSource(source_id, DRUM_NUM_VOICE_TYPES, live_morph)) {
    return false;
  }
  live_morph = clampFloat(live_morph, 0.0f, 1.0f);
  if (std::fabs(live_morph) > 0.001f && std::fabs(live_morph - 1.0f) > 0.001f) {
    return false;
  }
  morph_anchor = live_morph;
  return true;
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
