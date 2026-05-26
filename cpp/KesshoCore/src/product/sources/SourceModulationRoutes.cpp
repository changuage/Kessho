#include "../KesshoProductEngineInternal.h"

  uint32_t KesshoProductEngine::sourceModulationParamSlot(uint32_t param_id) const {
  switch (param_id) {
    case KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID:
      return 0u;
    case KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID:
      return 1u;
    case KESSHO_PRODUCT_PARAM_SOURCE_DISTANCE_ID:
      return 2u;
    case KESSHO_PRODUCT_PARAM_SOURCE_EXPRESSION_ID:
      return 3u;
    case KESSHO_PRODUCT_PARAM_SOURCE_REVERB_SEND_ID:
      return 4u;
    case KESSHO_PRODUCT_PARAM_SOURCE_DELAY_ASEND_ID:
      return 5u;
    case KESSHO_PRODUCT_PARAM_SOURCE_DELAY_BSEND_ID:
      return 6u;
    case KESSHO_PRODUCT_PARAM_SOURCE_GRANULAR_SEND_ID:
      return 7u;
    case KESSHO_PRODUCT_PARAM_SOURCE_ATTACK_SECONDS_ID:
      return 8u;
    case KESSHO_PRODUCT_PARAM_SOURCE_DECAY_SECONDS_ID:
      return 9u;
    case KESSHO_PRODUCT_PARAM_SOURCE_SUSTAIN_ID:
      return 10u;
    case KESSHO_PRODUCT_PARAM_SOURCE_HOLD_SECONDS_ID:
      return 11u;
    case KESSHO_PRODUCT_PARAM_SOURCE_RELEASE_SECONDS_ID:
      return 12u;
    default:
      return kSourceModulationParamSlotCount;
  }
}

  uint32_t KesshoProductEngine::sourceModulationParamMaskBit(uint32_t param_id) const {
  const uint32_t slot = sourceModulationParamSlot(param_id);
  return slot < kSourceModulationParamSlotCount ? (1u << slot) : 0u;
}

  void KesshoProductEngine::resetModulationRouteCache() {
  active_modulation_range_count = 0u;
  std::fill(source_modulation_param_masks, source_modulation_param_masks + kSourceCount, 0u);
  std::fill(
      drum_source_modulation_param_masks,
      drum_source_modulation_param_masks + DRUM_NUM_VOICE_TYPES,
      0u);
  for (uint32_t voice = 0u; voice < DRUM_NUM_VOICE_TYPES; ++voice) {
    for (uint32_t word = 0u; word < 4u; ++word) {
      drum_runtime_modulation_masks[voice][word] = 0u;
    }
  }
  std::fill(
      &source_modulation_route_indices[0][0],
      &source_modulation_route_indices[0][0] + kSourceCount * kSourceModulationParamSlotCount,
      kInvalidModulationRouteIndex);
  std::fill(
      &drum_source_modulation_route_indices[0][0],
      &drum_source_modulation_route_indices[0][0] + DRUM_NUM_VOICE_TYPES * kSourceModulationParamSlotCount,
      kInvalidModulationRouteIndex);
  std::fill(
      &drum_runtime_modulation_route_indices[0][0],
      &drum_runtime_modulation_route_indices[0][0] + DRUM_NUM_VOICE_TYPES * kProductDrumRuntimeParamCount,
      kInvalidModulationRouteIndex);
}

  void KesshoProductEngine::rebuildModulationRouteCache() {
  resetModulationRouteCache();
  for (uint32_t range_index = 0u; range_index < kMaxModulationRanges; ++range_index) {
    const ModulationRange& range = modulation_ranges[range_index];
    if (!range.active) {
      continue;
    }
    ++active_modulation_range_count;
    const uint16_t route_index = static_cast<uint16_t>(range_index);
    const uint32_t source_param_slot = sourceModulationParamSlot(range.param_id);
    const uint32_t source_param_bit = source_param_slot < kSourceModulationParamSlotCount
        ? (1u << source_param_slot)
        : 0u;
    if (range.target_id >= 1u && range.target_id <= kSourceCount) {
      if (source_param_bit != 0u) {
        source_modulation_param_masks[range.target_id - 1u] |= source_param_bit;
        source_modulation_route_indices[range.target_id - 1u][source_param_slot] = route_index;
      }
      continue;
    }
    if (!isDrumRangeTarget(range.target_id)) {
      continue;
    }
    const uint32_t drum_voice = range.target_id - KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE;
    if (drum_voice >= static_cast<uint32_t>(DRUM_NUM_VOICE_TYPES)) {
      continue;
    }
    uint32_t drum_param_index = 0u;
    if (productDrumRuntimeParamIndex(range.param_id, drum_param_index)) {
      const uint32_t word = drum_param_index >> 5u;
      if (word < 4u) {
        drum_runtime_modulation_masks[drum_voice][word] |= 1u << (drum_param_index & 31u);
        drum_runtime_modulation_route_indices[drum_voice][drum_param_index] = route_index;
      }
      continue;
    }
    if (source_param_bit != 0u) {
      drum_source_modulation_param_masks[drum_voice] |= source_param_bit;
      drum_source_modulation_route_indices[drum_voice][source_param_slot] = route_index;
    }
  }
}

  bool KesshoProductEngine::drumRuntimeModulationActive(uint32_t drum_voice) const {
  if (drum_voice >= static_cast<uint32_t>(DRUM_NUM_VOICE_TYPES)) {
    return false;
  }
  return drum_runtime_modulation_masks[drum_voice][0] != 0u ||
         drum_runtime_modulation_masks[drum_voice][1] != 0u ||
         drum_runtime_modulation_masks[drum_voice][2] != 0u ||
         drum_runtime_modulation_masks[drum_voice][3] != 0u;
}

  bool KesshoProductEngine::drumRuntimeParamModulated(uint32_t drum_voice, uint32_t param_index) const {
  if (drum_voice >= static_cast<uint32_t>(DRUM_NUM_VOICE_TYPES) || param_index >= kProductDrumRuntimeParamCount) {
    return false;
  }
  const uint32_t word = param_index >> 5u;
  return word < 4u && (drum_runtime_modulation_masks[drum_voice][word] & (1u << (param_index & 31u))) != 0u;
}

  ModulationRange* KesshoProductEngine::findModulationRange(uint32_t target_id, uint32_t param_id) {
  if (active_modulation_range_count == 0u) {
    return nullptr;
  }
  for (ModulationRange& range : modulation_ranges) {
    if (range.active && range.target_id == target_id && range.param_id == param_id) {
      return &range;
    }
  }
  return nullptr;
}

  const ModulationRange* KesshoProductEngine::findModulationRange(uint32_t target_id, uint32_t param_id) const {
  if (active_modulation_range_count == 0u) {
    return nullptr;
  }
  for (const ModulationRange& range : modulation_ranges) {
    if (range.active && range.target_id == target_id && range.param_id == param_id) {
      return &range;
    }
  }
  return nullptr;
}

  ModulationRange* KesshoProductEngine::findOrAllocateModulationRange(uint32_t target_id, uint32_t param_id) {
  for (ModulationRange& range : modulation_ranges) {
    if (range.target_id == target_id && range.param_id == param_id) {
      return &range;
    }
  }
  for (ModulationRange& range : modulation_ranges) {
    if (!range.active) {
      return &range;
    }
  }
  return nullptr;
}
