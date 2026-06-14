#include "../KesshoProductEngineInternal.h"

namespace {
constexpr uint32_t kPadAttackParamIndex = 33u, kPadDecayParamIndex = 34u, kPadReleaseParamIndex = 36u;
constexpr uint32_t kLeadAttackParamIndex = 43u, kLeadDecayParamIndex = 44u, kLeadReleaseParamIndex = 46u;

float normalizedSynthRatchetFactor(float factor) {
  return std::isfinite(factor) ? kessho::product::internal::clampFloat(factor, 0.125f, 1.0f) : 1.0f;
}

float scaledEnvelopeSeconds(float seconds, float factor) {
  if (!std::isfinite(seconds)) {
    return seconds;
  }
  return std::max(0.001f, seconds * factor);
}

void scaleLeadRatchetPatch(kessho::core::KesshoSourcePresetPatch& patch, float factor) {
  if (factor >= 0.999f) {
    return;
  }
  if (patch.exact_lead_param_count == kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT) {
    patch.exact_lead_params[kLeadAttackParamIndex] = scaledEnvelopeSeconds(patch.exact_lead_params[kLeadAttackParamIndex], factor);
    patch.exact_lead_params[kLeadDecayParamIndex] = scaledEnvelopeSeconds(patch.exact_lead_params[kLeadDecayParamIndex], factor);
    patch.exact_lead_params[kLeadReleaseParamIndex] = scaledEnvelopeSeconds(patch.exact_lead_params[kLeadReleaseParamIndex], factor);
  }
}

bool stableSourcePatchPointer(
    const SourceState& source,
    const kessho::core::KesshoSourcePresetPatch* patch) {
  return patch == &source.source_preset_patch ||
         patch == &source.source_preset_endpoint_a ||
         patch == &source.source_preset_endpoint_b;
}

bool modulePatchAlreadyApplied(
    const SourceState& source,
    const kessho::core::KesshoSourcePresetPatch* patch) {
  return stableSourcePatchPointer(source, patch) &&
         source.applied_module_patch_ptr == patch &&
         source.applied_module_patch_revision == source.source_preset_runtime_revision;
}

void recordModulePatchApplied(
    SourceState& source,
    const kessho::core::KesshoSourcePresetPatch* patch,
    bool applied) {
  if (applied && stableSourcePatchPointer(source, patch)) {
    source.applied_module_patch_ptr = patch;
    source.applied_module_patch_revision = source.source_preset_runtime_revision;
    return;
  }
  source.applied_module_patch_ptr = nullptr;
  source.applied_module_patch_revision = 0u;
}

float padRatchetHoldSeconds(float hold_seconds, float factor) {
  if (factor >= 0.999f || !std::isfinite(hold_seconds) || hold_seconds <= 0.0f) {
    return hold_seconds;
  }
  return std::max(0.02f, hold_seconds * factor);
}

static_assert(kPadAttackParamIndex < kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT && kPadDecayParamIndex < kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT && kPadReleaseParamIndex < kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT, "pad envelope indexes must fit exact patch");
static_assert(kLeadAttackParamIndex < kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT && kLeadDecayParamIndex < kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT && kLeadReleaseParamIndex < kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT, "lead envelope indexes must fit exact patch");
} // namespace

  bool KesshoProductEngine::triggerModuleSource(
      uint32_t source_id,
      float midi_note,
      float velocity,
      float hold_seconds,
      float morph,
      float distance,
      float expression,
      const kessho::core::KesshoSourcePresetPatch* preset_patch,
      float drum_delay_send,
      bool scale_velocity_by_expression,
      float drum_pitch_offset,
      float drum_ratchet_decay_cap,
      float drum_ratchet_attack_cap,
      float synth_ratchet_factor,
      uint32_t sample_seed,
      uint32_t pad_voice_index,
      uint32_t* out_module_voice_index) {
  if (out_module_voice_index != nullptr) {
    *out_module_voice_index = kProductInvalidVoiceIndex;
  }
  if (!modules_ready) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_ALLOCATION_FAILURE;
    return true;
  }
  const float frequency = midiToFrequency(clampFloat(midi_note, 0.0f, 127.0f));
  const float clamped_velocity = clampFloat(
      velocity * (scale_velocity_by_expression ? clampFloat(expression, 0.0f, 1.5f) : 1.0f),
      0.0f,
      1.0f);
  switch (source_id) {
    case KESSHO_PRODUCT_SOURCE_PAD1:
    case KESSHO_PRODUCT_SOURCE_PAD2: {
      if (!pad_module) {
        telemetry.last_error_code = KESSHO_PRODUCT_ERROR_ALLOCATION_FAILURE;
        return true;
      }
      const uint32_t pad_index = source_id == KESSHO_PRODUCT_SOURCE_PAD2 ? 1u : 0u;
      const uint32_t voice_index = pad_voice_index < static_cast<uint32_t>(PAD_VOICES_PER_PAD)
          ? pad_voice_index
          : (pad_voice_cursors[pad_index]++ % PAD_VOICES_PER_PAD);
      const int route = static_cast<int>(pad_index * PAD_VOICES_PER_PAD + voice_index);
      if (out_module_voice_index != nullptr) {
        *out_module_voice_index = static_cast<uint32_t>(route % PAD_NUM_VOICES);
      }
      const bool exact_pad_patch =
          preset_patch != nullptr &&
          preset_patch->exact_pad_param_count == kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT;
      SourceState& source = sources[source_id - 1u];
      if (exact_pad_patch) {
        if (!modulePatchAlreadyApplied(source, preset_patch)) {
          recordModulePatchApplied(
              source,
              preset_patch,
              pad_module->setSourcePresetPatch(static_cast<int>(pad_index), *preset_patch) != 0);
        }
      } else if (preset_patch != nullptr) {
        recordModulePatchApplied(
            source,
            preset_patch,
            pad_module->setSourcePresetPatch(static_cast<int>(pad_index), *preset_patch) != 0);
        pad_module->setSourceMacros(static_cast<int>(pad_index), morph, distance, expression);
      } else {
        recordModulePatchApplied(source, preset_patch, false);
        pad_module->setSourceMacros(static_cast<int>(pad_index), morph, distance, expression);
      }
      const int route_voice_index = route % PAD_NUM_VOICES;
      const float effective_hold_seconds = padRatchetHoldSeconds(
          hold_seconds,
          normalizedSynthRatchetFactor(synth_ratchet_factor));
      if (pad_module->noteOn(frequency, clamped_velocity, effective_hold_seconds, route) != 0) {
        schedulePadVoiceRelease(pad_index, static_cast<uint32_t>(route_voice_index), effective_hold_seconds);
      }
      return true;
    }
    case KESSHO_PRODUCT_SOURCE_LEAD1:
    case KESSHO_PRODUCT_SOURCE_LEAD2: {
      const uint32_t lead_index = source_id == KESSHO_PRODUCT_SOURCE_LEAD2 ? 1u : 0u;
      const bool exact_lead_patch =
          preset_patch != nullptr &&
          preset_patch->exact_lead_param_count == kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT;
      sources[source_id - 1u].post_lpf_tracking_midi = clampFloat(midi_note, 0.0f, 127.0f);
      if (!lead_modules[lead_index]) {
        telemetry.last_error_code = KESSHO_PRODUCT_ERROR_ALLOCATION_FAILURE;
        return true;
      }
      if (preset_patch != nullptr) {
        SourceState& source = sources[source_id - 1u];
        const float ratchet_factor = normalizedSynthRatchetFactor(synth_ratchet_factor);
        if (ratchet_factor < 0.999f || !modulePatchAlreadyApplied(source, preset_patch)) {
          kessho::core::KesshoSourcePresetPatch ratchet_patch = *preset_patch;
          scaleLeadRatchetPatch(ratchet_patch, ratchet_factor);
          recordModulePatchApplied(
              source,
              ratchet_factor >= 0.999f ? preset_patch : nullptr,
              lead_modules[lead_index]->setSourcePresetPatch(static_cast<int>(lead_index), ratchet_patch) != 0);
        }
      } else {
        SourceState& source = sources[source_id - 1u];
        recordModulePatchApplied(source, preset_patch, false);
      }
      if (!exact_lead_patch) {
        lead_modules[lead_index]->setTriggerMacros(morph, distance, expression);
      }
      if (lead_modules[lead_index]->noteOn(frequency, clamped_velocity, std::max(0.001f, hold_seconds), 0) != 0 &&
          out_module_voice_index != nullptr) {
        const int lead_voice_index = lead_modules[lead_index]->lastTriggeredVoiceIndex();
        if (lead_voice_index >= 0) {
          *out_module_voice_index = static_cast<uint32_t>(lead_voice_index);
        }
      }
      return true;
    }
    case KESSHO_PRODUCT_SOURCE_DRUM: {
      if (!drum_module) {
        telemetry.last_error_code = KESSHO_PRODUCT_ERROR_ALLOCATION_FAILURE;
        return true;
      }
      const DrumKitMapEntry kit_entry = defaultDrumKitMapEntry(midi_note);
      const int voice_type = std::clamp(static_cast<int>(kit_entry.voice), 0, DRUM_NUM_VOICE_TYPES - 1);
      if (preset_patch != nullptr) {
        drum_module->setSourcePresetPatch(0, *preset_patch);
      }
      if (std::isfinite(drum_delay_send) && drum_delay_send >= 0.0f) {
        drum_module->setVoiceSend(voice_type, drum_delay_send);
      }
      drum_module->prepareRandomSeed(sample_seed ^ kit_entry.seed_salt);
      const float mapped_morph = morph >= 0.0f
          ? clampFloat(morph + clamped_velocity * kit_entry.velocity_to_morph, 0.0f, 1.0f)
          : morph;
      drum_module->setTriggerControls(
          mapped_morph,
          distance,
          expression * kit_entry.velocity_to_expression,
          drum_pitch_offset + kit_entry.pitch_semis,
          drum_ratchet_decay_cap,
          drum_ratchet_attack_cap);
      drum_module->noteOn(0.0f, clamped_velocity * kit_entry.velocity_to_level, 0.0f, voice_type);
      drum_module_trigger_pending = true;
      if (out_module_voice_index != nullptr) {
        *out_module_voice_index = static_cast<uint32_t>(voice_type);
      }
      return true;
    }
    default:
      return false;
  }
}
