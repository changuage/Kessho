#pragma once

#include "ProductConstants.h"
#include "ProductMath.h"
#include "ProductVoiceState.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>

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

inline bool sourcePresetMatchesSource(
    uint32_t source_id,
    const kessho::product::generated::KesshoProductGeneratedSourcePreset* preset) {
  if (preset == nullptr || preset->source == nullptr) {
    return false;
  }
  switch (source_id) {
    case KESSHO_PRODUCT_SOURCE_PAD1:
    case KESSHO_PRODUCT_SOURCE_PAD2:
      return std::strcmp(preset->source, "pad") == 0;
    case KESSHO_PRODUCT_SOURCE_LEAD1:
    case KESSHO_PRODUCT_SOURCE_LEAD2:
      return std::strcmp(preset->source, "lead") == 0;
    case KESSHO_PRODUCT_SOURCE_DRUM:
      return std::strcmp(preset->source, "drum") == 0;
    case KESSHO_PRODUCT_SOURCE_PIANO:
      return std::strcmp(preset->source, "piano") == 0;
    case KESSHO_PRODUCT_SOURCE_SOUNDSCAPE:
      return std::strcmp(preset->source, "soundscape") == 0;
    default:
      return false;
  }
}

inline bool validSourcePresetForSource(uint32_t source_id, uint32_t preset_id) {
  return sourcePresetMatchesSource(source_id, findSourcePreset(preset_id));
}

inline const kessho::product::generated::KesshoProductGeneratedDrumVoicePreset* findDrumVoicePreset(
    uint32_t voice_index,
    uint32_t preset_id) {
  for (const auto& preset : kessho::product::generated::KESSHO_PRODUCT_DRUM_VOICE_PRESETS) {
    if (preset.voice_index != voice_index) {
      continue;
    }
    if (preset.id == preset_id) {
      return &preset;
    }
  }
  return nullptr;
}

inline const kessho::product::generated::KesshoProductGeneratedDrumVoicePreset* defaultDrumVoicePreset(
    uint32_t voice_index) {
  for (const auto& preset : kessho::product::generated::KESSHO_PRODUCT_DRUM_VOICE_PRESETS) {
    if (preset.voice_index == voice_index && preset.default_for_voice != 0u) {
      return &preset;
    }
  }
  return nullptr;
}

inline const kessho::product::generated::KesshoProductGeneratedPadSourcePreset* findPadSourcePresetPatch(
    uint32_t preset_id) {
  for (const auto& preset : kessho::product::generated::KESSHO_PRODUCT_PAD_SOURCE_PRESETS) {
    if (preset.id == preset_id) {
      return &preset;
    }
  }
  return nullptr;
}

inline const kessho::product::generated::KesshoProductGeneratedLeadSourcePreset* findLeadSourcePresetPatch(
    uint32_t preset_id) {
  for (const auto& preset : kessho::product::generated::KESSHO_PRODUCT_LEAD_SOURCE_PRESETS) {
    if (preset.id == preset_id) {
      return &preset;
    }
  }
  return nullptr;
}

inline const kessho::product::generated::KesshoProductGeneratedDrumSourcePreset* findDrumSourcePresetPatch(
    uint32_t preset_id) {
  for (const auto& preset : kessho::product::generated::KESSHO_PRODUCT_DRUM_SOURCE_PRESETS) {
    if (preset.id == preset_id) {
      return &preset;
    }
  }
  return nullptr;
}

inline float smoothstep01(float value) {
  const float t = clampFloat(value, 0.0f, 1.0f);
  return t * t * (3.0f - 2.0f * t);
}

inline float lerpPresetValue(float a, float b, float t) {
  return a + (b - a) * t;
}

inline float snapPresetValue(float a, float b, float t) {
  return t < 0.5f ? a : b;
}

template <std::size_t Count>
inline bool generatedParamIndexListed(uint32_t index, const uint32_t (&values)[Count]) {
  for (std::size_t value_index = 0u; value_index < Count; ++value_index) {
    if (values[value_index] == index) {
      return true;
    }
  }
  return false;
}

inline bool padPresetParamUsesSnap(uint32_t index) {
  return generatedParamIndexListed(
      index,
      kessho::product::generated::KESSHO_PRODUCT_PAD_PRESET_SNAP_PARAM_INDICES);
}

inline bool leadPresetParamUsesSnap(uint32_t index) {
  return generatedParamIndexListed(
      index,
      kessho::product::generated::KESSHO_PRODUCT_LEAD_PRESET_SNAP_PARAM_INDICES);
}

inline bool leadPresetParamUsesRound(uint32_t index) {
  return generatedParamIndexListed(
      index,
      kessho::product::generated::KESSHO_PRODUCT_LEAD_PRESET_ROUND_PARAM_INDICES);
}

inline bool drumParamUsesPresetSnap(uint32_t param_index) {
  for (const uint32_t snap_param_index : kessho::product::generated::KESSHO_PRODUCT_DRUM_PRESET_SNAP_PARAM_INDICES) {
    if (param_index == snap_param_index) {
      return true;
    }
  }
  return false;
}

inline kessho::core::KesshoSourcePresetPatch sourcePresetPatch(
    const kessho::product::generated::KesshoProductGeneratedSourcePreset& preset) {
  kessho::core::KesshoSourcePresetPatch patch{};
  if (std::strcmp(preset.source, "pad") == 0) {
    const auto* pad_preset = findPadSourcePresetPatch(preset.id);
    if (pad_preset != nullptr) {
      patch.exact_pad_param_count = kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT;
      for (uint32_t i = 0; i < patch.exact_pad_param_count; ++i) {
        patch.exact_pad_params[i] = pad_preset->params[i];
      }
    }
  }
  if (std::strcmp(preset.source, "lead") == 0) {
    const auto* lead_preset = findLeadSourcePresetPatch(preset.id);
    if (lead_preset != nullptr) {
      patch.exact_lead_param_count = kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT;
      for (uint32_t i = 0; i < patch.exact_lead_param_count; ++i) {
        patch.exact_lead_params[i] = lead_preset->params[i];
      }
    }
  }
  if (std::strcmp(preset.source, "drum") == 0) {
    const auto* drum_preset = findDrumSourcePresetPatch(preset.id);
    if (drum_preset != nullptr) {
      patch.exact_drum_param_count = kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT;
      for (uint32_t i = 0; i < patch.exact_drum_param_count; ++i) {
        patch.exact_drum_params[i] = drum_preset->params[i];
      }
    }
  }
  return patch;
}

inline float morphExactPadPresetValue(uint32_t index, float a, float b, float t) {
  return padPresetParamUsesSnap(index) ? snapPresetValue(a, b, t) : lerpPresetValue(a, b, t);
}

inline float morphExactLeadPresetValue(uint32_t index, float a, float b, float t) {
  if (leadPresetParamUsesSnap(index)) {
    return snapPresetValue(a, b, t);
  }
  const float value = lerpPresetValue(a, b, t);
  return leadPresetParamUsesRound(index) ? std::round(value) : value;
}

constexpr uint32_t kLeadAttackParamIndex = 43u;
constexpr uint32_t kLeadDecayParamIndex = 44u;
constexpr uint32_t kLeadSustainParamIndex = 45u;
constexpr uint32_t kLeadReleaseParamIndex = 46u;
constexpr uint32_t kLeadAlgorithmParamIndex = 0u;
constexpr uint32_t kLeadCarrier2MixParamIndex = 2u;
constexpr uint32_t kLeadMod1IndexParamIndex = 4u;
constexpr uint32_t kLeadMod2IndexParamIndex = 14u;
constexpr uint32_t kLeadMod3IndexParamIndex = 24u;
constexpr uint32_t kLeadMod4IndexParamIndex = 34u;
constexpr uint32_t kLeadFilterFreqParamIndex = 47u;
constexpr uint32_t kLeadFilterQParamIndex = 48u;
constexpr uint32_t kLeadFilterEnvDepthParamIndex = 54u;
constexpr uint32_t kLeadDriveParamIndex = 55u;
constexpr uint32_t kLeadTransientClickParamIndex = 56u;
constexpr uint32_t kLeadTransientNoiseParamIndex = 57u;
constexpr uint32_t kLeadGainParamIndex = 62u;
constexpr uint32_t kPadHardnessParamIndex = 15u;
constexpr uint32_t kPadWarmthParamIndex = 16u;
constexpr uint32_t kPadPresenceParamIndex = 17u;
constexpr uint32_t kPadFilterCutoffMinParamIndex = 21u;
constexpr uint32_t kPadFilterCutoffMaxParamIndex = 22u;
constexpr uint32_t kPadAttackParamIndex = 33u;
constexpr uint32_t kPadDecayParamIndex = 34u;
constexpr uint32_t kPadSustainParamIndex = 35u;
constexpr uint32_t kPadReleaseParamIndex = 36u;
constexpr float kDistanceSlightPoint = 0.25f;
constexpr float kDistanceStrength = 2.0f;
constexpr float kAttackDistanceBaseBoostSeconds = 0.1f;
constexpr float kAttackDistanceZeroThresholdSeconds = 0.005f;

inline bool isPadProductSource(uint32_t source_id) {
  return source_id == KESSHO_PRODUCT_SOURCE_PAD1 || source_id == KESSHO_PRODUCT_SOURCE_PAD2;
}

inline bool isLeadProductSource(uint32_t source_id) {
  return source_id == KESSHO_PRODUCT_SOURCE_LEAD1 || source_id == KESSHO_PRODUCT_SOURCE_LEAD2;
}

inline uint32_t sourceOverrideParamCountForSource(uint32_t source_id) {
  if (isPadProductSource(source_id)) {
    return kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT;
  }
  if (isLeadProductSource(source_id)) {
    return kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT;
  }
  if (source_id == KESSHO_PRODUCT_SOURCE_DRUM) {
    return kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT;
  }
  return 0u;
}

inline float scalePatchDistance(float distance) {
  const float safe_distance = clampFloat(distance, 0.0f, 1.0f);
  return kDistanceStrength <= 1.0f ? safe_distance : 1.0f - std::pow(1.0f - safe_distance, kDistanceStrength);
}

inline float patchDistanceAnchor(float distance, float start_value, float slight_value, float max_value) {
  const float safe_distance = scalePatchDistance(distance);
  if (safe_distance <= kDistanceSlightPoint) {
    return start_value + (safe_distance / kDistanceSlightPoint) * (slight_value - start_value);
  }
  const float tail_t = (safe_distance - kDistanceSlightPoint) / (1.0f - kDistanceSlightPoint);
  return slight_value + tail_t * (max_value - slight_value);
}

inline float patchDistanceAdd(float base, float distance, float slight_delta, float max_delta, float min_value, float max_value) {
  return clampFloat(
      base + patchDistanceAnchor(distance, 0.0f, slight_delta, max_delta),
      min_value,
      max_value);
}

inline float patchDistanceMultiply(float base, float distance, float slight_mul, float max_mul, float min_value, float max_value) {
  return clampFloat(
      base * patchDistanceAnchor(distance, 1.0f, slight_mul, max_mul),
      min_value,
      max_value);
}

inline float patchDistanceAttack(float base, float distance, float slight_mul, float max_mul, float max_value) {
  if (std::fabs(distance) <= 0.0001f) {
    return clampFloat(base, 0.001f, max_value);
  }
  const float effective_base = base <= kAttackDistanceZeroThresholdSeconds
      ? base + kAttackDistanceBaseBoostSeconds
      : base;
  return patchDistanceMultiply(effective_base, distance, slight_mul, max_mul, 0.001f, max_value);
}

inline void applyLeadDistanceToPatch(kessho::core::KesshoSourcePresetPatch& patch, uint32_t source_id, float distance) {
  if (distance <= 0.0001f ||
      patch.exact_lead_param_count != kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT) {
    return;
  }
  const bool lead2 = source_id == KESSHO_PRODUCT_SOURCE_LEAD2;
  const float shaped = scalePatchDistance(distance);
  patch.exact_lead_params[kLeadAttackParamIndex] = patchDistanceAttack(
      patch.exact_lead_params[kLeadAttackParamIndex],
      distance,
      lead2 ? 1.25f : 1.2f,
      lead2 ? 3.6f : 3.2f,
      16.0f);
  patch.exact_lead_params[kLeadDecayParamIndex] = patchDistanceMultiply(
      patch.exact_lead_params[kLeadDecayParamIndex],
      distance,
      lead2 ? 0.94f : 0.95f,
      lead2 ? 0.74f : 0.78f,
      0.01f,
      8.0f);
  patch.exact_lead_params[kLeadSustainParamIndex] = patchDistanceAdd(
      patch.exact_lead_params[kLeadSustainParamIndex],
      distance,
      lead2 ? -0.05f : -0.04f,
      lead2 ? -0.30f : -0.26f,
      0.0f,
      1.0f);
  patch.exact_lead_params[kLeadReleaseParamIndex] = patchDistanceMultiply(
      patch.exact_lead_params[kLeadReleaseParamIndex],
      distance,
      lead2 ? 1.15f : 1.12f,
      lead2 ? 2.0f : 1.9f,
      0.01f,
      30.0f);
  patch.exact_lead_params[kLeadFilterFreqParamIndex] =
      std::max(80.0f, patch.exact_lead_params[kLeadFilterFreqParamIndex] * (1.0f - shaped * 0.72f));
  patch.exact_lead_params[kLeadFilterQParamIndex] =
      std::max(0.05f, patch.exact_lead_params[kLeadFilterQParamIndex] * (1.0f - shaped * 0.18f));
  patch.exact_lead_params[kLeadFilterEnvDepthParamIndex] *= 1.0f - shaped * 0.55f;
  patch.exact_lead_params[kLeadTransientClickParamIndex] *= 1.0f - shaped * 0.92f;
  patch.exact_lead_params[kLeadTransientNoiseParamIndex] *= 1.0f - shaped * 0.82f;
  patch.exact_lead_params[kLeadMod1IndexParamIndex] *= 1.0f - shaped * 0.34f;
  patch.exact_lead_params[kLeadMod2IndexParamIndex] *= 1.0f - shaped * 0.30f;
  patch.exact_lead_params[kLeadMod3IndexParamIndex] *= 1.0f - shaped * 0.24f;
  patch.exact_lead_params[kLeadMod4IndexParamIndex] *= 1.0f - shaped * 0.18f;
  patch.exact_lead_params[kLeadDriveParamIndex] *= 1.0f - shaped * 0.62f;
  patch.exact_lead_params[kLeadCarrier2MixParamIndex] *= 1.0f - shaped * 0.12f;
  patch.exact_lead_params[kLeadGainParamIndex] *= 1.0f - shaped * 0.15f;
}

inline void applyPadDistanceToPatch(kessho::core::KesshoSourcePresetPatch& patch, float distance) {
  if (distance <= 0.0001f ||
      patch.exact_pad_param_count != kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT) {
    return;
  }
  patch.exact_pad_params[kPadAttackParamIndex] = patchDistanceAttack(
      patch.exact_pad_params[kPadAttackParamIndex],
      distance,
      1.35f,
      4.0f,
      16.0f);
  patch.exact_pad_params[kPadDecayParamIndex] = patchDistanceMultiply(
      patch.exact_pad_params[kPadDecayParamIndex],
      distance,
      1.08f,
      1.35f,
      0.01f,
      8.0f);
  patch.exact_pad_params[kPadSustainParamIndex] = patchDistanceAdd(
      patch.exact_pad_params[kPadSustainParamIndex],
      distance,
      -0.03f,
      -0.18f,
      0.0f,
      1.0f);
  patch.exact_pad_params[kPadReleaseParamIndex] = patchDistanceMultiply(
      patch.exact_pad_params[kPadReleaseParamIndex],
      distance,
      1.18f,
      2.40f,
      0.01f,
      30.0f);
  patch.exact_pad_params[kPadHardnessParamIndex] = patchDistanceAdd(
      patch.exact_pad_params[kPadHardnessParamIndex],
      distance,
      -0.04f,
      -0.22f,
      0.0f,
      2.0f);
  patch.exact_pad_params[kPadWarmthParamIndex] = patchDistanceAdd(
      patch.exact_pad_params[kPadWarmthParamIndex],
      distance,
      0.04f,
      0.18f,
      0.0f,
      1.0f);
  patch.exact_pad_params[kPadPresenceParamIndex] = patchDistanceAdd(
      patch.exact_pad_params[kPadPresenceParamIndex],
      distance,
      -0.05f,
      -0.30f,
      0.0f,
      1.0f);
  patch.exact_pad_params[kPadFilterCutoffMinParamIndex] = patchDistanceMultiply(
      patch.exact_pad_params[kPadFilterCutoffMinParamIndex],
      distance,
      0.85f,
      0.45f,
      40.0f,
      8000.0f);
  patch.exact_pad_params[kPadFilterCutoffMaxParamIndex] = patchDistanceMultiply(
      patch.exact_pad_params[kPadFilterCutoffMaxParamIndex],
      distance,
      0.92f,
      0.55f,
      40.0f,
      8000.0f);
}

inline void applyPadStructuredOverridesToPatch(
    kessho::core::KesshoSourcePresetPatch& patch,
    const SourceState& source,
    float morph) {
  if (patch.exact_pad_param_count != kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT) {
    return;
  }
  if (source.structured_override_morph_anchor_enabled &&
      std::fabs(clampFloat(morph, 0.0f, 1.0f) - clampFloat(source.structured_override_morph_anchor, 0.0f, 1.0f)) > 0.001f) {
    return;
  }
  const uint32_t override_count = std::min<uint32_t>(
      source.pad_override_count,
      kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT);
  for (uint32_t override_slot = 0u; override_slot < override_count; ++override_slot) {
    const uint32_t param_index = source.pad_override_indices[override_slot];
    if (param_index >= kessho::core::KESSHO_SOURCE_PRESET_PAD_PARAM_COUNT) {
      continue;
    }
    patch.exact_pad_params[param_index] = source.pad_override_values[override_slot];
  }
}

inline void applyLeadStructuredOverridesToPatch(
    kessho::core::KesshoSourcePresetPatch& patch,
    const SourceState& source,
    uint32_t source_id,
    float morph,
    float distance) {
  if (patch.exact_lead_param_count != kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT) {
    return;
  }
  if (source.lead_algorithm_preset_a_enabled &&
      source.source_preset_endpoint_a.exact_lead_param_count == kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT) {
    patch.exact_lead_params[kLeadAlgorithmParamIndex] = source.source_preset_endpoint_a.exact_lead_params[kLeadAlgorithmParamIndex];
  }
  if (source.lead_envelope_override_enabled) {
    patch.exact_lead_params[kLeadAttackParamIndex] = source.attack_seconds;
    patch.exact_lead_params[kLeadDecayParamIndex] = source.decay_seconds;
    patch.exact_lead_params[kLeadSustainParamIndex] = source.sustain;
    patch.exact_lead_params[kLeadReleaseParamIndex] = source.release_seconds;
  }
  applyLeadDistanceToPatch(patch, source_id, distance);
  if (source.structured_override_morph_anchor_enabled &&
      std::fabs(clampFloat(morph, 0.0f, 1.0f) - clampFloat(source.structured_override_morph_anchor, 0.0f, 1.0f)) > 0.001f) {
    return;
  }
  const uint32_t override_count = std::min<uint32_t>(
      source.lead_override_count,
      kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT);
  for (uint32_t override_slot = 0u; override_slot < override_count; ++override_slot) {
    const uint32_t param_index = source.lead_override_indices[override_slot];
    if (param_index >= kessho::core::KESSHO_SOURCE_PRESET_LEAD_PARAM_COUNT) {
      continue;
    }
    patch.exact_lead_params[param_index] = source.lead_override_values[override_slot];
  }
}

inline kessho::core::KesshoSourcePresetPatch morphSourcePresetPatch(
    const kessho::core::KesshoSourcePresetPatch& a,
    const kessho::core::KesshoSourcePresetPatch& b,
    float morph) {
  const float t = clampFloat(morph, 0.0f, 1.0f);
  kessho::core::KesshoSourcePresetPatch patch{};
  if (a.exact_pad_param_count == b.exact_pad_param_count) {
    patch.exact_pad_param_count = a.exact_pad_param_count;
    for (uint32_t i = 0; i < patch.exact_pad_param_count; ++i) {
      patch.exact_pad_params[i] = morphExactPadPresetValue(i, a.exact_pad_params[i], b.exact_pad_params[i], t);
    }
  }
  if (a.exact_lead_param_count == b.exact_lead_param_count) {
    patch.exact_lead_param_count = a.exact_lead_param_count;
    for (uint32_t i = 0; i < patch.exact_lead_param_count; ++i) {
      patch.exact_lead_params[i] = morphExactLeadPresetValue(i, a.exact_lead_params[i], b.exact_lead_params[i], t);
    }
  }
  return patch;
}

inline const kessho::core::KesshoSourcePresetPatch* resolveSourcePresetEndpointPatch(
    const SourceState& source,
    uint32_t source_id,
    float morph,
    float distance,
    kessho::core::KesshoSourcePresetPatch& scratch_patch) {
  const bool pad_source = isPadProductSource(source_id);
  const bool lead_source = isLeadProductSource(source_id);
  if (!source.source_preset_endpoint_valid || (!pad_source && !lead_source)) {
    return nullptr;
  }
  const bool pad_structured_override =
      pad_source &&
      source.pad_override_count > 0u;
  const bool lead_structured_override =
      lead_source &&
      (source.lead_envelope_override_enabled || source.lead_algorithm_preset_a_enabled || distance > 0.0001f ||
       source.lead_override_count > 0u);
  const bool endpoint_structured_override = pad_structured_override || lead_structured_override;
  if (morph <= 0.000001f) {
    if (!endpoint_structured_override) {
      return &source.source_preset_endpoint_a;
    }
    scratch_patch = source.source_preset_endpoint_a;
  } else if (morph >= 0.999999f) {
    if (!endpoint_structured_override) {
      return &source.source_preset_endpoint_b;
    }
    scratch_patch = source.source_preset_endpoint_b;
  } else {
    scratch_patch = morphSourcePresetPatch(
        source.source_preset_endpoint_a,
        source.source_preset_endpoint_b,
        morph);
  }
  if (lead_structured_override) {
    applyLeadStructuredOverridesToPatch(scratch_patch, source, source_id, morph, distance);
  }
  if (pad_structured_override) {
    applyPadStructuredOverridesToPatch(scratch_patch, source, morph);
  }
  return &scratch_patch;
}

inline void applyDrumSourceMixFieldsToPatch(
    kessho::core::KesshoSourcePresetPatch& patch,
    float source_level,
    float source_reverb_send) {
  if (patch.exact_drum_param_count != kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT) {
    return;
  }
  patch.exact_drum_params[kProductDrumMasterLevelParam] = clampFloat(source_level, 0.0f, 1.5f);
  patch.exact_drum_params[kProductDrumReverbSendParam] = clampFloat(source_reverb_send, 0.0f, 1.0f);
}

inline void applyDrumStructuredOverridesToPatch(
    kessho::core::KesshoSourcePresetPatch& patch,
    uint32_t override_count,
    const uint32_t* override_indices,
    const float* override_values) {
  if (patch.exact_drum_param_count != kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT ||
      override_indices == nullptr ||
      override_values == nullptr) {
    return;
  }
  const uint32_t count = std::min<uint32_t>(override_count, kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT);
  for (uint32_t slot = 0u; slot < count; ++slot) {
    const uint32_t param_index = override_indices[slot];
    if (param_index >= kessho::core::KESSHO_SOURCE_PRESET_DRUM_PARAM_COUNT) {
      continue;
    }
    patch.exact_drum_params[param_index] = override_values[slot];
  }
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
