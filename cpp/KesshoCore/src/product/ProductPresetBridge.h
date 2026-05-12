#pragma once

#include "ProductMath.h"

#include <algorithm>
#include <cstdint>

#include "../modules/KesshoModule.h"

namespace kessho::product::internal {

inline uint32_t defaultSourcePresetId(uint32_t source_id) {
  switch (source_id) {
    case KESSHO_PRODUCT_SOURCE_PAD1:
    case KESSHO_PRODUCT_SOURCE_PAD2:
      return kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_INIT;
    case KESSHO_PRODUCT_SOURCE_LEAD1:
    case KESSHO_PRODUCT_SOURCE_LEAD2:
      return kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES;
    case KESSHO_PRODUCT_SOURCE_DRUM:
      return kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_DRUM_DEFAULT;
    case KESSHO_PRODUCT_SOURCE_PIANO:
      return kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PIANO_DEFAULT;
    case KESSHO_PRODUCT_SOURCE_SOUNDSCAPE:
      return kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_SOUNDSCAPE_OCEAN_SAMPLE;
    default:
      return 0u;
  }
}

inline const kessho::product::generated::KesshoProductGeneratedSourcePreset* findSourcePreset(uint32_t preset_id) {
  for (const auto& preset : kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESETS) {
    if (preset.id == preset_id) {
      return &preset;
    }
  }
  return nullptr;
}

inline const kessho::product::generated::KesshoProductGeneratedDrumVoicePreset* findDrumVoicePreset(
    uint32_t voice_index,
    uint32_t preset_id) {
  const kessho::product::generated::KesshoProductGeneratedDrumVoicePreset* fallback = nullptr;
  for (const auto& preset : kessho::product::generated::KESSHO_PRODUCT_DRUM_VOICE_PRESETS) {
    if (preset.voice_index != voice_index) {
      continue;
    }
    if (preset.id == preset_id) {
      return &preset;
    }
    if (fallback == nullptr || preset.default_for_voice != 0u) {
      fallback = &preset;
    }
  }
  return fallback;
}

inline float smoothstep01(float value) {
  const float t = clampFloat(value, 0.0f, 1.0f);
  return t * t * (3.0f - 2.0f * t);
}

inline bool drumParamUsesPresetSnap(uint32_t param_index) {
  return param_index == 32u || param_index == 82u || param_index == 96u;
}

inline kessho::core::KesshoSourcePresetPatch sourcePresetPatch(
    const kessho::product::generated::KesshoProductGeneratedSourcePreset* preset) {
  kessho::core::KesshoSourcePresetPatch patch{};
  if (preset == nullptr) {
    return patch;
  }
  patch.tone = clampFloat(preset->profile_tone, 0.0f, 1.0f);
  patch.brightness = clampFloat(preset->profile_brightness, 0.0f, 1.0f);
  patch.texture = clampFloat(preset->profile_texture, 0.0f, 1.0f);
  patch.motion = clampFloat(preset->profile_motion, 0.0f, 1.0f);
  patch.attack = clampFloat(preset->profile_attack, 0.0f, 1.0f);
  patch.release = clampFloat(preset->profile_release, 0.0f, 1.0f);
  patch.body = clampFloat(preset->profile_body, 0.0f, 1.0f);
  patch.transient = clampFloat(preset->profile_transient, 0.0f, 1.0f);
  patch.exact_pad_param_count = std::min<uint32_t>(
      preset->exact_pad_param_count,
      kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT);
  for (uint32_t i = 0; i < patch.exact_pad_param_count; ++i) {
    patch.exact_pad_params[i] = preset->exact_pad_params[i];
  }
  patch.exact_lead_param_count = std::min<uint32_t>(
      preset->exact_lead_param_count,
      kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT);
  for (uint32_t i = 0; i < patch.exact_lead_param_count; ++i) {
    patch.exact_lead_params[i] = preset->exact_lead_params[i];
  }
  patch.exact_drum_param_count = std::min<uint32_t>(
      preset->exact_drum_param_count,
      kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT);
  for (uint32_t i = 0; i < patch.exact_drum_param_count; ++i) {
    patch.exact_drum_params[i] = preset->exact_drum_params[i];
  }
  return patch;
}

inline float moduleSourceOutputTrim(uint32_t source_id) {
  switch (source_id) {
    case KESSHO_PRODUCT_SOURCE_LEAD1:
    case KESSHO_PRODUCT_SOURCE_LEAD2:
      return kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_OUTPUT_TRIM;
    default:
      return 1.0f;
  }
}

} // namespace kessho::product::internal
