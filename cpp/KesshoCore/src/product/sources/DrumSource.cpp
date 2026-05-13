#include "../KesshoProductEngineInternal.h"

  kessho::core::KesshoSourcePresetPatch KesshoProductEngine::drumVoiceMorphPatch(const SourceState& source) const {
  auto patch = sourcePresetPatch(findSourcePreset(kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_DRUM_DEFAULT));
  if (patch.exact_drum_param_count != kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT) {
    patch.exact_drum_param_count = kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT;
    for (uint32_t i = 0; i < kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT; ++i) {
      patch.exact_drum_params[i] = 0.0f;
    }
  }

  for (const auto& voice : kessho::product::generated::KESSHO_PRODUCT_DRUM_VOICES) {
    if (voice.index >= kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_VOICE_COUNT) {
      continue;
    }
    const auto* preset_a = findDrumVoicePreset(voice.index, source.drum_voice_preset_a_ids[voice.index]);
    const auto* preset_b = findDrumVoicePreset(voice.index, source.drum_voice_preset_b_ids[voice.index]);
    if (preset_a == nullptr && preset_b == nullptr) {
      continue;
    }
    if (preset_a == nullptr) {
      preset_a = preset_b;
    }
    if (preset_b == nullptr) {
      preset_b = preset_a;
    }

    const float morph = clampFloat(source.drum_voice_morphs[voice.index], 0.0f, 1.0f);
    const float smooth = smoothstep01(morph);
    const uint32_t end = std::min<uint32_t>(
        voice.param_start + voice.param_count,
        kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT);
    for (uint32_t param_index = voice.param_start; param_index < end; ++param_index) {
      const float a = preset_a->params[param_index];
      const float b = preset_b->params[param_index];
      patch.exact_drum_params[param_index] = drumParamUsesPresetSnap(param_index)
          ? (morph < 0.5f ? a : b)
          : a + (b - a) * smooth;
    }
  }
  return patch;
}
