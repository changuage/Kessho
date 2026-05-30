#include "../KesshoProductEngineInternal.h"

namespace {

void recordSampleHoldTrigger(
    ModulationRange& range,
    uint32_t target_id,
    uint64_t sample_frame,
    float value,
    bool is_drum_target) {
  if (range.mode != KESSHO_PRODUCT_MODULATION_RANGE_SAMPLE_HOLD) return;
  range.current_value = value;
  ++range.sample_hold_counter;
  range.last_trigger_frame = sample_frame;
  range.last_trigger_source = is_drum_target ? KESSHO_PRODUCT_SOURCE_DRUM : target_id;
}

} // namespace

  float KesshoProductEngine::resolveModulatedValue(uint32_t target_id, uint32_t param_id, float fallback, uint32_t sample_seed) {
  if (active_modulation_range_count == 0u) {
    return fallback;
  }
  const uint32_t source_param_slot = sourceModulationParamSlot(param_id);
  const uint32_t source_param_bit = source_param_slot < kSourceModulationParamSlotCount
      ? (1u << source_param_slot)
      : 0u;
  uint16_t route_index = kInvalidModulationRouteIndex;
  bool route_required = false;
  const bool drum_target = isDrumRangeTarget(target_id);
  if (target_id >= 1u && target_id <= kSourceCount && source_param_bit != 0u) {
    if ((source_modulation_param_masks[target_id - 1u] & source_param_bit) == 0u) {
      return fallback;
    }
    route_index = source_modulation_route_indices[target_id - 1u][source_param_slot];
    route_required = true;
  } else if (drum_target) {
    const uint32_t drum_voice = target_id - KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE;
    uint32_t drum_param_index = 0u;
    if (productDrumRuntimeParamIndex(param_id, drum_param_index)) {
      if (!drumRuntimeParamModulated(drum_voice, drum_param_index)) return fallback;
      route_index = drum_runtime_modulation_route_indices[drum_voice][drum_param_index];
      route_required = true;
    } else if (source_param_bit != 0u &&
        (drum_source_modulation_param_masks[drum_voice] & source_param_bit) == 0u) {
      return fallback;
    } else if (source_param_bit != 0u) {
      route_index = drum_source_modulation_route_indices[drum_voice][source_param_slot];
      route_required = true;
    }
  }
  if (route_index != kInvalidModulationRouteIndex && route_index < kMaxModulationRanges) {
    ModulationRange& range = modulation_ranges[route_index];
    if (range.active && range.target_id == target_id && range.param_id == param_id) {
      const float value = modulationRangeSample(range, fallback, sample_seed);
      recordSampleHoldTrigger(range, target_id, transport.sample_frame, value, drum_target);
      return value;
    }
  }
  if (route_required) return fallback;
  ModulationRange* range = findModulationRange(target_id, param_id);
  if (range == nullptr) return fallback;
  const float value = modulationRangeSample(*range, fallback, sample_seed);
  recordSampleHoldTrigger(*range, target_id, transport.sample_frame, value, drum_target);
  return value;
}
