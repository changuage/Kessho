#include "../KesshoProductEngineInternal.h"

  ModulationRange* KesshoProductEngine::findModulationRange(uint32_t target_id, uint32_t param_id) {
  for (ModulationRange& range : modulation_ranges) {
    if (range.active && range.target_id == target_id && range.param_id == param_id) {
      return &range;
    }
  }
  return nullptr;
}

  const ModulationRange* KesshoProductEngine::findModulationRange(uint32_t target_id, uint32_t param_id) const {
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

  void KesshoProductEngine::applyModulationRangeEvent(const KesshoProductEvent& event) {
  const uint32_t target_id = event.target_id;
  const uint32_t param_id = event.param_id;
  const uint32_t mode = static_cast<uint32_t>(std::max(0.0f, std::round(event.value3)));
  const bool active = (event.flags & KESSHO_PRODUCT_MODULATION_RANGE_ACTIVE) != 0u &&
      mode != KESSHO_PRODUCT_MODULATION_RANGE_OFF;
  if (param_id == 0u || (!isSourceTarget(target_id) && !isDrumRangeTarget(target_id) && target_id != 0u)) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
    return;
  }
  if (isDrumRangeTarget(target_id) && !isSourceParam(param_id)) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
    return;
  }

  ModulationRange* range = findOrAllocateModulationRange(target_id, param_id);
  if (range == nullptr) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_ALLOCATION_FAILURE;
    return;
  }
  if (!active) {
    *range = {};
    telemetry.last_error_code = KESSHO_PRODUCT_OK;
    return;
  }

  const float min_value = std::min(event.value, event.value2);
  const float max_value = std::max(event.value, event.value2);
  range->active = true;
  range->control_id = event.index == 0u ? hashU32(target_id ^ (param_id * 16777619u)) : event.index;
  range->target_id = target_id;
  range->param_id = param_id;
  range->mode = mode == KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK
      ? KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK
      : KESSHO_PRODUCT_MODULATION_RANGE_SAMPLE_HOLD;
  range->min_value = min_value;
  range->max_value = max_value;
  const float fallback_current = (min_value + max_value) * 0.5f;
  range->current_value = clampFloat(
      std::isfinite(event.value4) ? event.value4 : fallback_current,
      min_value,
      max_value);
  range->seed = hashU32(rng_seed ^ range->control_id ^ range->target_id ^ range->param_id);
  const float direction = hashUnit(range->seed ^ 0xa511e9b3u) < 0.5f ? -1.0f : 1.0f;
  const float span = std::max(0.0001f, max_value - min_value);
  range->velocity = direction * span * (0.015f + hashUnit(range->seed ^ 0x63d83595u) * 0.025f);
  if (target_id == 0u && range->mode == KESSHO_PRODUCT_MODULATION_RANGE_SAMPLE_HOLD) {
    KesshoProductEvent param_event{};
    param_event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
    param_event.target_id = 0u;
    param_event.param_id = range->param_id;
    param_event.value = range->current_value;
    telemetry.last_error_code = KESSHO_PRODUCT_OK;
    applyParam(param_event);
    return;
  }
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
}

  float KesshoProductEngine::modulationRangeSample(const ModulationRange& range, float fallback, uint32_t sample_seed) const {
  if (!range.active) {
    return fallback;
  }
  if (range.max_value <= range.min_value) {
    return range.min_value;
  }
  if (range.mode == KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK) {
    return clampFloat(range.current_value, range.min_value, range.max_value);
  }
  const float position = hashUnit(range.seed ^ sample_seed ^ (range.target_id * 2246822519u) ^ (range.param_id * 3266489917u));
  return range.min_value + (range.max_value - range.min_value) * position;
}

  float KesshoProductEngine::resolveModulatedValue(uint32_t target_id, uint32_t param_id, float fallback, uint32_t sample_seed) const {
  const ModulationRange* range = findModulationRange(target_id, param_id);
  if (range == nullptr) {
    return fallback;
  }
  return modulationRangeSample(*range, fallback, sample_seed);
}

  void KesshoProductEngine::applyRuntimeWalkValue(const ModulationRange& range) {
  if (!range.active || range.mode != KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK) {
    return;
  }
  if (isDrumRangeTarget(range.target_id)) {
    if (range.param_id == KESSHO_PRODUCT_PARAM_SOURCE_DELAY_ASEND_ID && drum_module) {
      const int voice = static_cast<int>(range.target_id - KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE);
      drum_module->setVoiceSend(voice, range.current_value);
    }
    return;
  }
  KesshoProductEvent event{};
  event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
  event.target_id = range.target_id;
  event.param_id = range.param_id;
  event.value = range.current_value;
  applyParam(event);
}

  void KesshoProductEngine::advanceModulationRanges(uint32_t frames) {
  if (frames == 0u) {
    return;
  }
  const float beats = static_cast<float>(static_cast<double>(frames) / transport.samplesPerBeat(sample_rate));
  for (ModulationRange& range : modulation_ranges) {
    if (!range.active || range.mode != KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK) {
      continue;
    }
    if (range.max_value <= range.min_value) {
      range.current_value = range.min_value;
      applyRuntimeWalkValue(range);
      continue;
    }
    const float span = range.max_value - range.min_value;
    const uint32_t time_seed = static_cast<uint32_t>(transport.sample_frame) ^ static_cast<uint32_t>(transport.sample_frame >> 32);
    const float jitter = (hashUnit(range.seed ^ time_seed ^ 0x9e3779b9u) - 0.5f) * span * 0.01f;
    range.current_value += (range.velocity + jitter) * beats;
    if (range.current_value <= range.min_value) {
      range.current_value = range.min_value;
      range.velocity = std::abs(range.velocity);
    } else if (range.current_value >= range.max_value) {
      range.current_value = range.max_value;
      range.velocity = -std::abs(range.velocity);
    }
    applyRuntimeWalkValue(range);
  }
}
