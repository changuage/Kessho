#include "../KesshoProductEngineInternal.h"

  bool KesshoProductEngine::trigConditionPass(uint32_t trig_condition, uint64_t absolute_sample) const {
  if (trig_condition == KESSHO_PRODUCT_TRIG_ALWAYS) {
    return true;
  }
  const uint64_t bar = transport.barIndexAt(sample_rate, absolute_sample);
  if (trig_condition == KESSHO_PRODUCT_TRIG_EVERY_2_BARS) {
    return (bar % 2u) == 0u;
  }
  if (trig_condition == KESSHO_PRODUCT_TRIG_FIRST_BAR_OF_PHRASE) {
    return (bar % std::max(1u, transport.bars_per_phrase)) == 0u;
  }
  return true;
}

  bool KesshoProductEngine::stepTrigConditionPass(const LaneState& lane, uint32_t step, int64_t absolute_step) const {
  if (!stepMaskHas(lane.trig_condition_override_set_low, lane.trig_condition_override_set_high, step)) {
    const auto* variation = activeVariationSnapshot(lane.variation_runtime);
    if (variation == nullptr || !variationMaskHas(variation->trig_condition_mask, step)) return true;
  }
  const auto* variation = activeVariationSnapshot(lane.variation_runtime);
  const bool variation_value = variation != nullptr && variationMaskHas(variation->trig_condition_mask, step);
  const uint32_t denominator = std::max(
      1u,
      variation_value ? variation->trig_condition_denominators[step] : lane.trig_condition_denominators[step]);
  const uint32_t numerator = clampU32(
      variation_value ? variation->trig_condition_numerators[step] : lane.trig_condition_numerators[step],
      1u,
      denominator);
  const uint32_t step_count = variationStepCount(lane.variation_runtime, lane.step_count);
  const uint64_t visit = static_cast<uint64_t>(absolute_step / std::max<int64_t>(1, static_cast<int64_t>(step_count))) + 1u;
  return ((visit - 1u) % denominator) + 1u == numerator;
}

bool KesshoProductEngine::manualMaskHit(const LaneState& lane, uint32_t step) const {
  if (const auto* variation = activeVariationSnapshot(lane.variation_runtime);
      variation != nullptr && step < variation->step_count) {
    return (variation->trigger_mask & (1u << step)) != 0u;
  }
  if (step < 32u) {
    const uint32_t bit = 1u << step;
    if ((lane.step_override_set_low & bit) != 0u) {
      return (lane.step_override_value_low & bit) != 0u;
    }
  } else {
    const uint32_t bit = 1u << (step - 32u);
    if ((lane.step_override_set_high & bit) != 0u) {
      return (lane.step_override_value_high & bit) != 0u;
    }
  }
  if (lane.manual_step_mask_low == 0u && lane.manual_step_mask_high == 0u) {
    return euclidHit(step, lane.step_count, lane.fill_count, lane.rotation);
  }
  if (step < 32u) {
    return (lane.manual_step_mask_low & (1u << step)) != 0u;
  }
  return (lane.manual_step_mask_high & (1u << (step - 32u))) != 0u;
}
