#include "../KesshoProductEngineInternal.h"
#include "../generated/SampleLibraryRegistry.generated.h"

namespace {

uint32_t roundedU32(float value, uint32_t fallback) {
  if (!std::isfinite(value)) {
    return fallback;
  }
  const long rounded = std::lround(value);
  return rounded <= 0 ? 0u : static_cast<uint32_t>(rounded);
}

bool generatedSampleLibraryExists(uint32_t id) {
  for (const auto& library : kessho::product::generated::kGeneratedSampleLibraries) {
    if (library.libraryId == id) {
      return true;
    }
  }
  return false;
}

template <typename Selector>
bool generatedSampleDescriptorIdExists(uint32_t id, Selector selector) {
  if (id == 0u) {
    return true;
  }
  for (const auto& descriptor : kessho::product::generated::kGeneratedSampleDescriptors) {
    if (selector(descriptor) == id) {
      return true;
    }
  }
  return false;
}

uint32_t liveSampleLibraryId(float value) {
  const uint32_t id = roundedU32(value, kessho::product::internal::kSampleLibraryPiano);
  return generatedSampleLibraryExists(id) ? id : kessho::product::internal::kSampleLibraryPiano;
}

uint32_t liveSampleRoleId(float value) {
  const uint32_t id = roundedU32(value, kessho::product::internal::kSampleRoleAny);
  return generatedSampleDescriptorIdExists(id, [](const kessho::product::generated::GeneratedSampleDescriptor& descriptor) {
    return static_cast<uint32_t>(descriptor.roleId);
  }) ? id : kessho::product::internal::kSampleRoleAny;
}

uint32_t liveSampleArticulationId(float value) {
  const uint32_t id = roundedU32(value, kessho::product::internal::kSampleArticulationAny);
  return generatedSampleDescriptorIdExists(id, [](const kessho::product::generated::GeneratedSampleDescriptor& descriptor) {
    return static_cast<uint32_t>(descriptor.articulationId);
  }) ? id : kessho::product::internal::kSampleArticulationAny;
}

uint32_t liveSampleDynamicId(float value) {
  const uint32_t id = roundedU32(value, kessho::product::internal::kSampleDynamicRegular);
  return generatedSampleDescriptorIdExists(id, [](const kessho::product::generated::GeneratedSampleDescriptor& descriptor) {
    return static_cast<uint32_t>(descriptor.dynamicId);
  }) ? id : kessho::product::internal::kSampleDynamicRegular;
}

} // namespace

void KesshoProductEngine::applySourceParam(const KesshoProductEvent& event) {
  if (event.target_id < 1u || event.target_id > kSourceCount) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
    return;
  }
  SourceState& source = sources[event.target_id - 1u];
  const bool lead_source = isLeadProductSource(event.target_id);
  const bool sample_source = isSampleProductSource(event.target_id);
  const bool extended_envelope_source = lead_source || isSampleProductSource(event.target_id);
  bool release_sample_voices = false;
  const auto require_sample_source = [this, sample_source]() {
    if (!sample_source) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
      return false;
    }
    return true;
  };
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
      source.attack_seconds = clampFloat(event.value, 0.001f, extended_envelope_source ? 16.0f : 2.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_DECAY_SECONDS_ID:
      source.decay_seconds = clampFloat(event.value, 0.01f, extended_envelope_source ? 8.0f : 4.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_SUSTAIN_ID:
      source.sustain = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_HOLD_SECONDS_ID:
      source.hold_seconds = clampFloat(event.value, 0.0f, lead_source ? 44.0f : 20.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SOURCE_RELEASE_SECONDS_ID:
      source.release_seconds = clampFloat(event.value, 0.01f, extended_envelope_source ? 30.0f : 8.0f);
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
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_LIBRARY_ID_ID: {
      if (!require_sample_source()) return;
      const uint32_t next = liveSampleLibraryId(event.value);
      release_sample_voices = source.sample_library_id != next;
      source.sample_library_id = next;
      break;
    }
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_ROLE_ID_ID: {
      if (!require_sample_source()) return;
      const uint32_t next = liveSampleRoleId(event.value);
      release_sample_voices = source.sample_role_id != next;
      source.sample_role_id = next;
      break;
    }
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_ARTICULATION_ID_ID: {
      if (!require_sample_source()) return;
      const uint32_t next = liveSampleArticulationId(event.value);
      release_sample_voices = source.sample_articulation_id != next;
      source.sample_articulation_id = next;
      break;
    }
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_SELECTION_MODE_ID: {
      if (!require_sample_source()) return;
      const uint32_t next = clampU32(roundedU32(event.value, KESSHO_PRODUCT_SAMPLE_SELECTION_NEAREST), 0u, KESSHO_PRODUCT_SAMPLE_SELECTION_EXACT);
      release_sample_voices = source.sample_selection_mode != next;
      source.sample_selection_mode = next;
      break;
    }
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_DYNAMIC_MODE_ID: {
      if (!require_sample_source()) return;
      const uint32_t next = clampU32(roundedU32(event.value, KESSHO_PRODUCT_SAMPLE_DYNAMIC_VELOCITY), 0u, KESSHO_PRODUCT_SAMPLE_DYNAMIC_LEGACY_PIANO_PARITY);
      release_sample_voices = source.sample_dynamic_mode != next;
      source.sample_dynamic_mode = next;
      break;
    }
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_FIXED_DYNAMIC_ID_ID: {
      if (!require_sample_source()) return;
      const uint32_t next = liveSampleDynamicId(event.value);
      release_sample_voices = source.sample_fixed_dynamic_id != next;
      source.sample_fixed_dynamic_id = next;
      break;
    }
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_LOOP_ENABLED_ID: {
      if (!require_sample_source()) return;
      const bool next = event.value >= 0.5f;
      release_sample_voices = source.sample_loop_enabled != next;
      source.sample_loop_enabled = next;
      break;
    }
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_MAX_VOICES_ID: {
      if (!require_sample_source()) return;
      const uint32_t next = clampU32(roundedU32(event.value, kSampleDefaultMaxVoices), 1u, 64u);
      release_sample_voices = next < source.sample_max_voices;
      source.sample_max_voices = next;
      break;
    }
    case KESSHO_PRODUCT_PARAM_SOURCE_SAMPLE_VARIANT_MODE_ID: {
      if (!require_sample_source()) return;
      const uint32_t next = clampU32(roundedU32(event.value, KESSHO_PRODUCT_SAMPLE_VARIANT_STABLE), 0u, KESSHO_PRODUCT_SAMPLE_VARIANT_ROUND_ROBIN);
      release_sample_voices = source.sample_variant_mode != next;
      source.sample_variant_mode = next;
      break;
    }
    default:
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
      return;
  }
  if (release_sample_voices) {
    source.sample_variant_counter = 0u;
    releaseSourceVoices(event.target_id);
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
