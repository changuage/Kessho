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
    case KESSHO_PRODUCT_PARAM_SOURCE_DIFFUSE_SEND_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_POST_LPF_HZ_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_STEREO_WIDTH_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_POST_LPF_KEY_TRACKING_ID:
      return true;
    default:
      return false;
  }
}

  bool KesshoProductEngine::isSourceTarget(uint32_t target_id) const {
  return target_id >= 1u && target_id <= kSourceCount;
}

  bool KesshoProductEngine::isDrumRangeTarget(uint32_t target_id) const {
  return target_id >= KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE &&
      target_id < KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE + DRUM_NUM_VOICE_TYPES;
}

  void KesshoProductEngine::applySourcePresetEvent(const KesshoProductEvent& event) {
  if (event.target_id < 1u || event.target_id > kSourceCount) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
    return;
  }
  if (event.value <= 0.0f) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
    return;
  }
  const uint32_t preset_id = static_cast<uint32_t>(std::lround(event.value));
  sources[event.target_id - 1u].preset_id = preset_id;
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
}

  void KesshoProductEngine::applySourceParam(const KesshoProductEvent& event) {
  if (event.target_id < 1u || event.target_id > kSourceCount) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
    return;
  }

  SourceState& source = sources[event.target_id - 1u];
  const auto sync_drum_param = [this, &source, &event](uint32_t param_index, float value) {
    if (event.target_id != KESSHO_PRODUCT_SOURCE_DRUM || param_index >= kProductDrumRuntimeParamCount) {
      return;
    }
    if (source.exact_drum_param_count != kProductDrumRuntimeParamCount) {
      const auto patch = sourcePresetPatch(findSourcePreset(defaultSourcePresetId(KESSHO_PRODUCT_SOURCE_DRUM)));
      source.exact_drum_param_count = kProductDrumRuntimeParamCount;
      for (uint32_t index = 0u; index < kProductDrumRuntimeParamCount; ++index) {
        source.exact_drum_params[index] = index < patch.exact_drum_param_count ? patch.exact_drum_params[index] : 0.0f;
      }
    }
    source.exact_drum_params[param_index] = value;
    if (drum_module) {
      drum_module->setIndexedParam(static_cast<int>(param_index), value);
    }
  };
  switch (event.param_id) {
    case KESSHO_PRODUCT_PARAM_SOURCE_ENABLED_ID:
      setSourceEnabled(source, event.value >= 0.5f, false);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID:
      source.level = clampFloat(event.value, 0.0f, 1.5f);
      sync_drum_param(kProductDrumMasterLevelParam, source.level);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID:
      source.morph = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_DISTANCE_ID:
      source.distance = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_EXPRESSION_ID:
      source.expression = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_DRY_GAIN_ID:
      source.dry_gain = clampFloat(event.value, 0.0f, 2.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_REVERB_SEND_ID:
      source.reverb_send = clampFloat(event.value, 0.0f, 2.0f);
      sync_drum_param(kProductDrumReverbSendParam, clampFloat(source.reverb_send, 0.0f, 1.0f));
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_DELAY_ASEND_ID:
      source.delay_a_send = clampFloat(event.value, 0.0f, 2.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_DELAY_BSEND_ID:
      source.delay_b_send = clampFloat(event.value, 0.0f, 2.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_GRANULAR_SEND_ID:
      source.granular_send = clampFloat(event.value, 0.0f, 2.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_DIFFUSE_SEND_ID:
      source.diffuse_send = clampFloat(event.value, 0.0f, 2.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_POST_LPF_HZ_ID:
      source.post_lpf_hz = clampFloat(event.value, 20.0f, 20000.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_STEREO_WIDTH_ID:
      source.stereo_width = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_POST_LPF_KEY_TRACKING_ID:
      source.post_lpf_key_tracking = clampFloat(event.value, 0.0f, 1.0f);
      break;
    default:
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
      return;
  }
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
}
