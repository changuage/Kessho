#include "../KesshoProductEngineInternal.h"

namespace {
constexpr uint32_t kSourcePresetEndpointHasMorphFlag = 1u;

bool sourceOverrideStorage(
    SourceState& source,
    uint32_t source_id,
    uint32_t*& count,
    uint32_t*& indices,
    float*& values) {
  if (isPadProductSource(source_id)) {
    count = &source.pad_override_count;
    indices = source.pad_override_indices;
    values = source.pad_override_values;
    return true;
  }
  if (isLeadProductSource(source_id)) {
    count = &source.lead_override_count;
    indices = source.lead_override_indices;
    values = source.lead_override_values;
    return true;
  }
  if (source_id == KESSHO_PRODUCT_SOURCE_DRUM) {
    count = &source.drum_override_count;
    indices = source.drum_override_indices;
    values = source.drum_override_values;
    return true;
  }
  return false;
}

bool sourceUsesExactPatch(const SourceState& source, uint32_t source_id) {
  if (isPadProductSource(source_id)) {
    return source.exact_pad_param_count != 0u;
  }
  if (isLeadProductSource(source_id)) {
    return source.exact_lead_param_count != 0u;
  }
  if (source_id == KESSHO_PRODUCT_SOURCE_DRUM) {
    return source.exact_drum_param_count != 0u;
  }
  return true;
}
}

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
    case KESSHO_PRODUCT_PARAM_SOURCE_ATTACK_SECONDS_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_DECAY_SECONDS_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_SUSTAIN_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_HOLD_SECONDS_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_RELEASE_SECONDS_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_LEAD_ENVELOPE_OVERRIDE_ENABLED_ID:
    case KESSHO_PRODUCT_PARAM_SOURCE_LEAD_ALGORITHM_PRESET_AENABLED_ID:
      return true;
    default:
      return false;
  }
}

  bool KesshoProductEngine::isSourceTarget(uint32_t target_id) const { return target_id >= 1u && target_id <= kSourceCount; }

  bool KesshoProductEngine::isDrumRangeTarget(uint32_t target_id) const {
  return target_id >= KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE && target_id < KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE + DRUM_NUM_VOICE_TYPES;
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
  SourceState& source = sources[event.target_id - 1u];
  const uint32_t preset_id = static_cast<uint32_t>(std::lround(event.value));
  if (event.index > 0u) {
    if (event.target_id == KESSHO_PRODUCT_SOURCE_DRUM) {
      const uint32_t encoded = event.index - 1u;
      const uint32_t voice_count = kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_VOICE_COUNT;
      const bool endpoint_b = encoded >= voice_count;
      const uint32_t voice_index = endpoint_b ? encoded - voice_count : encoded;
      if (voice_index >= voice_count) {
        telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
        return;
      }
      if (findDrumVoicePreset(voice_index, preset_id) == nullptr) {
        telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
        return;
      }
      if (endpoint_b) {
        source.drum_voice_preset_b_ids[voice_index] = preset_id;
      } else {
        source.drum_voice_preset_a_ids[voice_index] = preset_id;
      }
      if ((event.flags & kSourcePresetEndpointHasMorphFlag) != 0u) {
        source.drum_voice_morphs[voice_index] = clampFloat(event.value2, 0.0f, 1.0f);
      }
      compileSourcePresetRuntime(source);
      if (source.exact_drum_param_count == kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT) {
        kessho::core::KesshoSourcePresetPatch patch{};
        patch.exact_drum_param_count = kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT;
        for (uint32_t param_index = 0; param_index < kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT; ++param_index) {
          patch.exact_drum_params[param_index] = source.exact_drum_params[param_index];
        }
        applyDrumVoiceMorphToPatch(patch, source, voice_index, source.drum_voice_morphs[voice_index]);
        for (uint32_t param_index = 0; param_index < kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT; ++param_index) {
          source.exact_drum_params[param_index] = patch.exact_drum_params[param_index];
        }
        if (drum_module) {
          drum_module->setSourcePresetPatch(0, patch);
        }
      }
      telemetry.last_error_code = KESSHO_PRODUCT_OK;
      return;
    }
    if (
        event.target_id == KESSHO_PRODUCT_SOURCE_PAD1 ||
        event.target_id == KESSHO_PRODUCT_SOURCE_PAD2 ||
        event.target_id == KESSHO_PRODUCT_SOURCE_LEAD1 ||
        event.target_id == KESSHO_PRODUCT_SOURCE_LEAD2) {
      const auto* endpoint_preset = findSourcePreset(preset_id);
      if (!sourcePresetMatchesSource(event.target_id, endpoint_preset)) {
        telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
        return;
      }
      const auto endpoint_patch = sourcePresetPatch(*endpoint_preset);
      const bool valid_endpoint =
          ((event.target_id == KESSHO_PRODUCT_SOURCE_PAD1 || event.target_id == KESSHO_PRODUCT_SOURCE_PAD2) &&
           endpoint_patch.exact_pad_param_count == kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT) ||
          ((event.target_id == KESSHO_PRODUCT_SOURCE_LEAD1 || event.target_id == KESSHO_PRODUCT_SOURCE_LEAD2) &&
           endpoint_patch.exact_lead_param_count == kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT);
      if (!valid_endpoint) {
        telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
        return;
      }
      if (event.index == 1u) {
        source.source_preset_a_id = preset_id;
      } else if (event.index == 2u) {
        source.source_preset_b_id = preset_id;
      } else {
        telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
        return;
      }
      compileSourcePresetEndpoints(source);
      telemetry.last_error_code = KESSHO_PRODUCT_OK;
      return;
    }
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
    return;
  }
  if (!validSourcePresetForSource(event.target_id, preset_id)) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
    return;
  }
  source.preset_id = preset_id;
  compileSourcePresetRuntime(source);
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
}

  bool KesshoProductEngine::applyStructuredSourceOverridesToModule(uint32_t source_id) {
  if (source_id < 1u || source_id > kSourceCount) {
    return false;
  }
  SourceState& source = sources[source_id - 1u];
  if (isPadProductSource(source_id)) {
    kessho::core::KesshoSourcePresetPatch patch{};
    const auto* resolved_patch = resolveSourcePresetEndpointPatch(
        source,
        source_id,
        source.morph,
        source.distance,
        patch);
    if (resolved_patch == nullptr ||
        resolved_patch->exact_pad_param_count != kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT) {
      return false;
    }
    if (pad_module) {
      const uint32_t pad_index = source_id == KESSHO_PRODUCT_SOURCE_PAD2 ? 1u : 0u;
      pad_module->setSourcePresetPatch(static_cast<int>(pad_index), *resolved_patch);
    }
    return true;
  }

  if (isLeadProductSource(source_id)) {
    kessho::core::KesshoSourcePresetPatch patch{};
    const auto* resolved_patch = resolveSourcePresetEndpointPatch(
        source,
        source_id,
        source.morph,
        source.distance,
        patch);
    if (resolved_patch == nullptr ||
        resolved_patch->exact_lead_param_count != kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT) {
      return false;
    }
    const uint32_t lead_index = source_id == KESSHO_PRODUCT_SOURCE_LEAD2 ? 1u : 0u;
    if (lead_modules[lead_index]) {
      lead_modules[lead_index]->setSourcePresetPatch(static_cast<int>(lead_index), *resolved_patch);
    }
    return true;
  }

  if (source_id != KESSHO_PRODUCT_SOURCE_DRUM) {
    return false;
  }
  compileSourcePresetRuntime(source);
  if (!source.source_preset_patch_valid ||
      source.source_preset_patch.exact_drum_param_count != kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT) {
    return false;
  }
  if (drum_module) {
    auto patch = source.source_preset_patch;
    applyDrumSourceMixFieldsToPatch(patch, source.level, source.reverb_send);
    drum_module->setSourcePresetPatch(0, patch);
  }
  return true;
}

  bool KesshoProductEngine::applyRuntimeSourceOverrideParam(uint32_t source_id, uint32_t param_index, float value) {
  if (source_id < 1u || source_id > kSourceCount || !std::isfinite(value)) {
    return false;
  }
  const uint32_t param_count = sourceOverrideParamCountForSource(source_id);
  if (param_count == 0u || param_index >= param_count) {
    return false;
  }
  SourceState& source = sources[source_id - 1u];
  if (sourceUsesExactPatch(source, source_id)) {
    return false;
  }
  if ((isPadProductSource(source_id) || isLeadProductSource(source_id)) && !source.source_preset_endpoint_valid) {
    return false;
  }
  if (source_id == KESSHO_PRODUCT_SOURCE_DRUM && !source.source_preset_patch_valid) {
    return false;
  }
  uint32_t* override_count = nullptr;
  uint32_t* override_indices = nullptr;
  float* override_values = nullptr;
  if (!sourceOverrideStorage(source, source_id, override_count, override_indices, override_values)) {
    return false;
  }

  for (uint32_t slot = 0u; slot < *override_count && slot < param_count; ++slot) {
    if (override_indices[slot] == param_index) {
      override_values[slot] = value;
      return applyStructuredSourceOverridesToModule(source_id);
    }
  }
  if (*override_count >= param_count) {
    return false;
  }
  const uint32_t slot = *override_count;
  override_indices[slot] = param_index;
  override_values[slot] = value;
  *override_count = slot + 1u;
  return applyStructuredSourceOverridesToModule(source_id);
}

  void KesshoProductEngine::applySourceOverrideEvent(const KesshoProductEvent& event) {
  if (event.target_id < 1u || event.target_id > kSourceCount) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
    return;
  }
  const uint32_t param_count = sourceOverrideParamCountForSource(event.target_id);
  if (param_count == 0u) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
    return;
  }
  SourceState& source = sources[event.target_id - 1u];
  if (sourceUsesExactPatch(source, event.target_id)) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    return;
  }
  uint32_t* override_count = nullptr;
  uint32_t* override_indices = nullptr;
  float* override_values = nullptr;
  if (!sourceOverrideStorage(source, event.target_id, override_count, override_indices, override_values)) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
    return;
  }
  const bool set_slot = (event.flags & KESSHO_PRODUCT_SOURCE_OVERRIDE_SET_SLOT) != 0u;
  const bool commit = (event.flags & KESSHO_PRODUCT_SOURCE_OVERRIDE_COMMIT) != 0u;
  if (set_slot == commit) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    return;
  }
  if (set_slot) {
    if (event.index >= param_count || event.param_id >= param_count) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
      return;
    }
    override_indices[event.index] = event.param_id;
    override_values[event.index] = event.value;
    telemetry.last_error_code = KESSHO_PRODUCT_OK;
    return;
  }
  if (event.index > param_count) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
    return;
  }
  *override_count = event.index;
  for (uint32_t slot = *override_count; slot < param_count; ++slot) {
    override_indices[slot] = 0u;
    override_values[slot] = 0.0f;
  }

  if (!applyStructuredSourceOverridesToModule(event.target_id)) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    return;
  }
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
}

  void KesshoProductEngine::applySourceParam(const KesshoProductEvent& event) {
  if (event.target_id < 1u || event.target_id > kSourceCount) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
    return;
  }
  SourceState& source = sources[event.target_id - 1u];
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
      source.attack_seconds = clampFloat(event.value, 0.001f, 2.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_DECAY_SECONDS_ID:
      source.decay_seconds = clampFloat(event.value, 0.01f, 4.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_SUSTAIN_ID:
      source.sustain = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_HOLD_SECONDS_ID:
      source.hold_seconds = clampFloat(event.value, 0.0f, 20.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_RELEASE_SECONDS_ID:
      source.release_seconds = clampFloat(event.value, 0.01f, 8.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_LEAD_ENVELOPE_OVERRIDE_ENABLED_ID:
      source.lead_envelope_override_enabled = event.value >= 0.5f;
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_LEAD_ALGORITHM_PRESET_AENABLED_ID:
      source.lead_algorithm_preset_a_enabled = event.value >= 0.5f;
      break;
    default:
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
      return;
  }
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
}
