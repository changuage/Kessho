#include "../KesshoProductEngineInternal.h"

namespace {
constexpr uint32_t kSourcePresetEndpointHasMorphFlag = 1u;
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
      if (drum_module && source.source_preset_patch_valid) {
        auto patch = source.source_preset_patch;
        float live_morph = source.drum_voice_morphs[voice_index];
        activeSequencerMorphForPresetSource(KESSHO_PRODUCT_SOURCE_DRUM, voice_index, live_morph);
        applyDrumVoiceMorphToPatch(patch, source, voice_index, live_morph);
        applyDrumSourceMixFieldsToPatch(patch, source.level, source.reverb_send);
        drum_module->setSourcePresetPatch(0, patch);
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
      float live_morph = source.morph;
      const bool has_live_sequencer_morph = activeSequencerMorphForPresetSource(
          event.target_id,
          DRUM_NUM_VOICE_TYPES,
          live_morph);
      const bool applied = has_live_sequencer_morph
          ? applyStructuredSourceOverridesToModuleAtMorph(event.target_id, live_morph)
          : applyStructuredSourceOverridesToModule(event.target_id);
      if (!applied) {
        telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
        return;
      }
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
