#include "../KesshoProductEngineInternal.h"

namespace {

constexpr double kProductSampleHoldRateHz = 10.0;
constexpr float kProductRandomWalkMinSpeed = 0.01f;
constexpr float kProductRandomWalkMaxSpeed = 5.0f;

uint32_t sampleHoldIntervalFrames(double sample_rate) {
  if (!std::isfinite(sample_rate) || sample_rate <= 0.0) {
    return 1u;
  }
  return std::max<uint32_t>(1u, static_cast<uint32_t>(std::lround(sample_rate / kProductSampleHoldRateHz)));
}

float randomWalkSpeedFromFlags(uint32_t flags) {
  const uint32_t encoded = (flags & KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK_SPEED_MASK) >>
      KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK_SPEED_SHIFT;
  if (encoded == 0u) {
    return 1.0f;
  }
  return clampFloat(
      static_cast<float>(encoded) / static_cast<float>(KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK_SPEED_SCALE),
      kProductRandomWalkMinSpeed,
      kProductRandomWalkMaxSpeed);
}

} // namespace

  void KesshoProductEngine::applyModulationRangeEvent(const KesshoProductEvent& event) {
  const uint32_t target_id = event.target_id;
  const uint32_t param_id = event.param_id;
  const uint32_t mode = static_cast<uint32_t>(std::max(0.0f, std::round(event.value3)));
  const bool active = (event.flags & KESSHO_PRODUCT_MODULATION_RANGE_ACTIVE) != 0u &&
      mode != KESSHO_PRODUCT_MODULATION_RANGE_OFF;
  const bool control_only = target_id == kProductControlOnlyModulationTarget;
  const bool soundscape_asset_level_target = isSoundscapeAssetLevelRangeTarget(target_id);
  const bool soundscape_texture_level_target = isSoundscapeTextureLevelRangeTarget(target_id);
  const bool soundscape_texture_param_target = isSoundscapeTextureParamTarget(target_id);
  const bool soundscape_module_param_target = isSoundscapeModuleParamTarget(target_id);
  if (param_id == 0u ||
      (!isSourceTarget(target_id) && !isDrumRangeTarget(target_id) && target_id != 0u &&
       !control_only && !soundscape_asset_level_target && !soundscape_texture_level_target &&
       !soundscape_texture_param_target && !soundscape_module_param_target)) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
    return;
  }
  if ((soundscape_asset_level_target || soundscape_texture_level_target || soundscape_texture_param_target ||
       soundscape_module_param_target) &&
      param_id != KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
    return;
  }
  uint32_t drum_param_index = 0u;
  if (isDrumRangeTarget(target_id) && !isSourceParam(param_id) && !productDrumRuntimeParamIndex(param_id, drum_param_index)) {
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
    rebuildModulationRouteCache();
    telemetry.last_error_code = KESSHO_PRODUCT_OK;
    return;
  }

  const bool was_random_walk = range->active && range->mode == KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK;
  const float previous_current_value = range->current_value;
  const float previous_velocity = range->velocity;
  const float previous_walk_accumulator = range->random_walk_step_accumulator;
  const uint32_t previous_walk_counter = range->random_walk_counter;
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
      was_random_walk ? previous_current_value : (std::isfinite(event.value4) ? event.value4 : fallback_current),
      min_value,
      max_value);
  range->seed = hashU32(rng_seed ^ range->control_id);
  range->random_walk_speed = 1.0f;
  range->random_walk_global = false;
  range->random_walk_step_accumulator = 0.0f;
  range->random_walk_counter = 0u;
  range->velocity = 0.0f;
  if (range->mode == KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK) {
    range->random_walk_speed = randomWalkSpeedFromFlags(event.flags);
    range->random_walk_global = (event.flags & KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK_GLOBAL) != 0u;
    if (was_random_walk) {
      const float max_velocity = 0.05f * range->random_walk_speed;
      range->velocity = clampFloat(previous_velocity, -max_velocity, max_velocity);
      range->random_walk_step_accumulator = previous_walk_accumulator;
      range->random_walk_counter = previous_walk_counter;
    } else {
      range->velocity = (hashUnit(range->seed ^ 0x63d83595u) - 0.5f) * 0.02f;
    }
  }
  if (range->mode == KESSHO_PRODUCT_MODULATION_RANGE_SAMPLE_HOLD) {
    range->sample_hold_interval_frames = sampleHoldIntervalFrames(sample_rate);
    range->sample_hold_frames_until_next = range->sample_hold_interval_frames;
    range->sample_hold_counter = 0u;
    range->sample_hold_trigger_bus = sampleHoldTriggerBusForEvent(event);
  }
  rebuildModulationRouteCache();
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
  if (soundscape_asset_level_target || soundscape_texture_level_target || soundscape_texture_param_target ||
      soundscape_module_param_target) {
    applyModulationRangeValue(*range);
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

  void KesshoProductEngine::applyModulationRangeValue(const ModulationRange& range) {
  if (!range.active) {
    return;
  }
  if (range.target_id == kProductControlOnlyModulationTarget) {
    return;
  }
  if (isSoundscapeAssetLevelRangeTarget(range.target_id)) {
    if (range.param_id == KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID) {
      applySoundscapeAssetLevelValue(soundscapeAssetIdForLevelRangeTarget(range.target_id), range.current_value);
    }
    return;
  }
  if (isSoundscapeTextureLevelRangeTarget(range.target_id)) {
    if (range.param_id == KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID) {
      const uint32_t slot = soundscapeTextureSlotForLevelRangeTarget(range.target_id);
      if (slot < kSoundscapeTextureSlotCount) {
        SourceState& source = sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1u];
        const uint32_t index = kSoundscapeTextureParamStart +
            slot * kSoundscapeTextureParamStride + kSoundscapeTextureParamLevel;
        source.soundscape_texture_params[index] = clampFloat(range.current_value, 0.0f, 1.0f);
        source.soundscape_texture_param_count = std::max(
            source.soundscape_texture_param_count, index + 1u);
      }
    }
    return;
  }
  if (isSoundscapeModuleParamTarget(range.target_id)) {
    if (range.param_id == KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID) {
      const uint32_t index = soundscapeModuleParamIndexForRangeTarget(range.target_id);
      if (index < kSoundscapeProductModuleParamCount) {
        SourceState& source = sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1u];
        source.soundscape_module_params[index] = range.current_value;
        source.soundscape_module_param_count = std::max(
            source.soundscape_module_param_count, index + 1u);
      }
    }
    return;
  }
  if (isDrumRangeTarget(range.target_id)) {
    if (range.param_id == KESSHO_PRODUCT_PARAM_SOURCE_DELAY_ASEND_ID && drum_module) {
      const int voice = static_cast<int>(range.target_id - KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE);
      drum_module->setVoiceSend(voice, range.current_value);
      return;
    }
    uint32_t drum_param_index = 0u;
    if (productDrumRuntimeParamIndex(range.param_id, drum_param_index)) {
      KesshoProductEvent event{};
      event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
      event.param_id = range.param_id;
      event.value = range.current_value;
      applyParam(event);
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

  void KesshoProductEngine::applyRuntimeWalkValue(const ModulationRange& range) {
  if (!range.active || range.mode != KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK) {
    return;
  }
  applyModulationRangeValue(range);
}
