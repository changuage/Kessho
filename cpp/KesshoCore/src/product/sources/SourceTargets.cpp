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
