#include "../KesshoProductEngineInternal.h"

bool KesshoProductEngine::isSourceParam(uint32_t param_id) const {
  switch (param_id) {
    case KESSHO_PRODUCT_PARAM_SOURCE_ENABLED_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_DISTANCE_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_EXPRESSION_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_DRY_GAIN_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_REVERB_SEND_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_DELAY_ASEND_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_DELAY_BSEND_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_GRANULAR_SEND_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_DEGRADE_SEND_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_SPECTRAL_FREEZE_SEND_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_DIFFUSE_SEND_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_POST_LPF_HZ_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_STEREO_WIDTH_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_POST_LPF_KEY_TRACKING_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_ATTACK_SECONDS_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_DECAY_SECONDS_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_SUSTAIN_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_HOLD_SECONDS_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_RELEASE_SECONDS_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_LEAD_ENVELOPE_OVERRIDE_ENABLED_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_LEAD_ALGORITHM_PRESET_AENABLED_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_LEAD_VIBRATO_DEPTH_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_LEAD_VIBRATO_RATE_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_LEAD_GLIDE_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_LIBRARY_ID_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_ROLE_ID_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_ARTICULATION_ID_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_SELECTION_MODE_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_DYNAMIC_MODE_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_FIXED_DYNAMIC_ID_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_LOOP_ENABLED_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_MAX_VOICES_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_VARIANT_MODE_ID:
      return true;
    default:
      return false;
  }
}

bool KesshoProductEngine::isSourceTarget(uint32_t target_id) const { return target_id >= 1u && target_id <= kSourceCount; }

bool KesshoProductEngine::isDrumRangeTarget(uint32_t target_id) const {
  return target_id >= KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE && target_id < KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE + DRUM_NUM_VOICE_TYPES;
}

bool KesshoProductEngine::isSoundscapeAssetLevelRangeTarget(uint32_t target_id) const {
  return target_id >= kSoundscapeAssetLevelRangeTargetBase &&
      target_id < kSoundscapeAssetLevelRangeTargetEnd;
}

uint32_t KesshoProductEngine::soundscapeAssetIdForLevelRangeTarget(uint32_t target_id) const {
  return isSoundscapeAssetLevelRangeTarget(target_id)
      ? target_id - kSoundscapeAssetLevelRangeTargetBase
      : 0u;
}

bool KesshoProductEngine::isSoundscapeTextureLevelRangeTarget(uint32_t target_id) const {
  return target_id >= kSoundscapeTextureLevelRangeTargetBase &&
      target_id < kSoundscapeTextureLevelRangeTargetEnd;
}

uint32_t KesshoProductEngine::soundscapeTextureSlotForLevelRangeTarget(uint32_t target_id) const {
  return isSoundscapeTextureLevelRangeTarget(target_id)
      ? target_id - kSoundscapeTextureLevelRangeTargetBase
      : kSoundscapeTextureSlotCount;
}

bool KesshoProductEngine::isSoundscapeTextureParamTarget(uint32_t target_id) const {
  return target_id >= kSoundscapeTextureParamTargetBase &&
      target_id < kSoundscapeTextureParamTargetEnd;
}

uint32_t KesshoProductEngine::soundscapeTextureParamIndexForRangeTarget(uint32_t target_id) const {
  return isSoundscapeTextureParamTarget(target_id)
      ? target_id - kSoundscapeTextureParamTargetBase
      : kSoundscapeTextureParamCount;
}

uint32_t KesshoProductEngine::soundscapeTextureSlotForParamRangeTarget(uint32_t target_id) const {
  if (!isSoundscapeTextureParamTarget(target_id)) return kSoundscapeTextureSlotCount;
  const uint32_t index = soundscapeTextureParamIndexForRangeTarget(target_id);
  if (index < kSoundscapeTextureParamStart) return kSoundscapeTextureSlotCount;
  const uint32_t slot = (index - kSoundscapeTextureParamStart) / kSoundscapeTextureParamStride;
  const uint32_t slot_param = (index - kSoundscapeTextureParamStart) % kSoundscapeTextureParamStride;
  return slot < kSoundscapeTextureSlotCount && slot_param < kSoundscapeTextureParamStride
      ? slot
      : kSoundscapeTextureSlotCount;
}

bool KesshoProductEngine::isSoundscapeModuleParamTarget(uint32_t target_id) const {
  return target_id >= kSoundscapeModuleParamTargetBase &&
      target_id < kSoundscapeModuleParamTargetEnd;
}

uint32_t KesshoProductEngine::soundscapeModuleParamIndexForRangeTarget(uint32_t target_id) const {
  return isSoundscapeModuleParamTarget(target_id)
      ? target_id - kSoundscapeModuleParamTargetBase
      : kSoundscapeProductModuleParamCount;
}
