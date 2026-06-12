#include "../KesshoProductEngineInternal.h"

void KesshoProductEngine::applySourceParam(const KesshoProductEvent& event) {
  if (event.target_id < 1u || event.target_id > kSourceCount) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
    return;
  }
  SourceState& source = sources[event.target_id - 1u];
  const bool lead_source = isLeadProductSource(event.target_id);
  const auto sync_drum_module_param = [this, &event](uint32_t param_index, float value) {
    if (event.target_id != KESSHO_PRODUCT_SOURCE_DRUM || param_index >= kProductDrumRuntimeParamCount) {
      return;
    }
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
      sync_drum_module_param(kProductDrumMasterLevelParam, source.level);
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
      sync_drum_module_param(kProductDrumReverbSendParam, clampFloat(source.reverb_send, 0.0f, 1.0f));
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
    case KESSHO_PRODUCT_PARAM_SOURCE_DEGRADE_SEND_ID:
      source.degrade_send = clampFloat(event.value, 0.0f, 2.0f);
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
    case KESSHO_PRODUCT_PARAM_SOURCE_ATTACK_SECONDS_ID:
      source.attack_seconds = clampFloat(event.value, 0.001f, lead_source ? 16.0f : 2.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_DECAY_SECONDS_ID:
      source.decay_seconds = clampFloat(event.value, 0.01f, lead_source ? 8.0f : 4.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_SUSTAIN_ID:
      source.sustain = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_HOLD_SECONDS_ID:
      source.hold_seconds = clampFloat(event.value, 0.0f, lead_source ? 44.0f : 20.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_RELEASE_SECONDS_ID:
      source.release_seconds = clampFloat(event.value, 0.01f, lead_source ? 30.0f : 8.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_LEAD_ENVELOPE_OVERRIDE_ENABLED_ID:
      source.lead_envelope_override_enabled = event.value >= 0.5f;
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_LEAD_ALGORITHM_PRESET_AENABLED_ID:
      source.lead_algorithm_preset_a_enabled = event.value >= 0.5f;
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_LEAD_VIBRATO_DEPTH_ID:
      source.lead_vibrato_depth = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_LEAD_VIBRATO_RATE_ID:
      source.lead_vibrato_rate = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_LEAD_GLIDE_ID:
      source.lead_glide = clampFloat(event.value, 0.0f, 1.0f);
      break;
    default:
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
      return;
  }
  switch (event.param_id) {
    case KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_DISTANCE_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_ATTACK_SECONDS_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_DECAY_SECONDS_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_SUSTAIN_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_RELEASE_SECONDS_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_LEAD_ENVELOPE_OVERRIDE_ENABLED_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_LEAD_ALGORITHM_PRESET_AENABLED_ID:
      if (isPadProductSource(event.target_id) || isLeadProductSource(event.target_id)) {
        (void) applyStructuredSourceOverridesToModuleForCurrentMorph(event.target_id);
      }
      break;
    default:
      break;
  }
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
}
