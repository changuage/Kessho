#pragma once

#include <cstdint>

#include "../src/product/KesshoProductEngineInternal.h"

namespace kessho::product::tests {

inline void applyGeneratedSourcePreset(KesshoProductSnapshotV2& snapshot, uint32_t source_id, uint32_t preset_id) {
  using namespace kessho::product::internal;
  if (source_id < 1u || source_id > 7u) {
    return;
  }
  KesshoProductSourceSnapshot& source = snapshot.sources[source_id - 1u];
  source.source_id = source_id;
  source.preset_id = preset_id;
  const auto* preset = findSourcePreset(preset_id);
  if (!sourcePresetMatchesSource(source_id, preset)) {
    return;
  }
  const auto patch = sourcePresetPatch(*preset);
  if (source_id == KESSHO_PRODUCT_SOURCE_PAD1 || source_id == KESSHO_PRODUCT_SOURCE_PAD2) {
    source.exact_pad_param_count = patch.exact_pad_param_count;
    for (uint32_t index = 0; index < source.exact_pad_param_count; ++index) {
      source.exact_pad_params[index] = patch.exact_pad_params[index];
    }
  }
  if (source_id == KESSHO_PRODUCT_SOURCE_LEAD1 || source_id == KESSHO_PRODUCT_SOURCE_LEAD2) {
    source.exact_lead_param_count = patch.exact_lead_param_count;
    for (uint32_t index = 0; index < source.exact_lead_param_count; ++index) {
      source.exact_lead_params[index] = patch.exact_lead_params[index];
    }
  }
  if (source_id == KESSHO_PRODUCT_SOURCE_DRUM) {
    for (const auto& voice : kessho::product::generated::KESSHO_PRODUCT_DRUM_VOICES) {
      if (voice.index >= kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_VOICE_COUNT) {
        continue;
      }
      const auto* default_preset = defaultDrumVoicePreset(voice.index);
      if (default_preset == nullptr) {
        continue;
      }
      source.drum_voice_preset_a_ids[voice.index] = default_preset->id;
      source.drum_voice_preset_b_ids[voice.index] = default_preset->id;
    }
  }
}

inline void applyGeneratedSourceDefaults(KesshoProductSnapshotV2& snapshot) {
  using namespace kessho::product::internal;
  for (uint32_t index = 0; index < 7u; ++index) {
    const uint32_t source_id = index + 1u;
    KesshoProductSourceSnapshot& source = snapshot.sources[index];
    source.attack_seconds = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_ATTACK_SECONDS;
    source.decay_seconds = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_DECAY_SECONDS;
    source.sustain = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_SUSTAIN;
    source.hold_seconds = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_HOLD_SECONDS;
    source.release_seconds = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_RELEASE_SECONDS;
    const uint32_t preset_id = snapshot.sources[index].preset_id == 0u
        ? defaultSourcePresetId(source_id)
        : snapshot.sources[index].preset_id;
    applyGeneratedSourcePreset(snapshot, source_id, preset_id);
  }
}

} // namespace kessho::product::tests
