#include "../KesshoProductEngineInternal.h"

  kessho::core::KesshoSourcePresetPatch KesshoProductEngine::drumVoiceMorphPatch(const SourceState& source) const {
  kessho::core::KesshoSourcePresetPatch patch{};
  const auto* default_preset = findSourcePreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_DRUM_DEFAULT);
  if (!sourcePresetMatchesSource(KESSHO_PRODUCT_SOURCE_DRUM, default_preset)) {
    return patch;
  }
  patch = sourcePresetPatch(*default_preset);
  if (patch.exact_drum_param_count != kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT) {
    return {};
  }

  for (const auto& voice : kessho::product::generated::KESSHO_PRODUCT_DRUM_VOICES) {
    if (voice.index >= kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_VOICE_COUNT) {
      continue;
    }
    applyDrumVoiceMorphToPatch(patch, source, voice.index, source.drum_voice_morphs[voice.index]);
  }
  return patch;
}

void KesshoProductEngine::applyDrumVoiceMorphToPatch(
    kessho::core::KesshoSourcePresetPatch& patch,
    const SourceState& source,
    uint32_t voice_index,
    float morph) const {
  if (voice_index >= kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_VOICE_COUNT) {
    return;
  }
  const kessho::product::generated::KesshoProductGeneratedDrumVoice* voice = nullptr;
  for (const auto& candidate : kessho::product::generated::KESSHO_PRODUCT_DRUM_VOICES) {
    if (candidate.index == voice_index) {
      voice = &candidate;
      break;
    }
  }
  if (voice == nullptr) {
    return;
  }
  if (patch.exact_drum_param_count != kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT) {
    return;
  }
  const auto* preset_a = findDrumVoicePreset(voice->index, source.drum_voice_preset_a_ids[voice->index]);
  const auto* preset_b = findDrumVoicePreset(voice->index, source.drum_voice_preset_b_ids[voice->index]);
  if (preset_a == nullptr || preset_b == nullptr) {
    return;
  }

  const float clamped_morph = clampFloat(morph, 0.0f, 1.0f);
  const float smooth = smoothstep01(clamped_morph);
  const uint32_t end = std::min<uint32_t>(
      voice->param_start + voice->param_count,
      kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT);
  for (uint32_t param_index = voice->param_start; param_index < end; ++param_index) {
    const float a = preset_a->params[param_index];
    const float b = preset_b->params[param_index];
    patch.exact_drum_params[param_index] = drumParamUsesPresetSnap(param_index)
        ? (clamped_morph < 0.5f ? a : b)
        : a + (b - a) * smooth;
  }
}
