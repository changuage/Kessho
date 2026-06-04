#include "../KesshoProductEngineInternal.h"

bool KesshoProductEngine::applySourceExactRuntimeRanges(
    uint32_t source_id,
    uint32_t param_id_base,
    float* params,
    uint32_t param_count,
    uint32_t sample_seed) {
  if (params == nullptr || active_modulation_range_count == 0u) {
    return false;
  }
  bool changed = false;
  for (ModulationRange& range : modulation_ranges) {
    if (!range.active ||
        range.target_id != source_id ||
        range.param_id < param_id_base ||
        range.param_id >= param_id_base + param_count) {
      continue;
    }
    const uint32_t param_index = range.param_id - param_id_base;
    const float value = modulationRangeSample(range, params[param_index], sample_seed);
    params[param_index] = value;
    changed = true;
    if (range.mode == KESSHO_PRODUCT_MODULATION_RANGE_SAMPLE_HOLD) {
      range.current_value = value;
      ++range.sample_hold_counter;
      range.last_trigger_frame = transport.sample_frame;
      range.last_trigger_source = source_id;
    }
  }
  return changed;
}
