#pragma once

#include <cstdint>

#include "../src/product/KesshoProductEngineInternal.h"

namespace kessho::product::tests {

inline void applyGeneratedSourcePreset(KesshoProductSnapshotV2& snapshot, uint32_t source_id, uint32_t preset_id) {
  using namespace kessho::product::internal;
  if (source_id < 1u || source_id > kSourceCount) {
    return;
  }
  KesshoProductSourceSnapshot& source = snapshot.sources[source_id - 1u];
  source.source_id = source_id;
  source.preset_id = preset_id;
  const auto* preset = findSourcePreset(preset_id);
  if (!sourcePresetMatchesSource(source_id, preset)) {
    return;
  }
  if (source_id == KESSHO_PRODUCT_SOURCE_PAD1 || source_id == KESSHO_PRODUCT_SOURCE_PAD2) {
    source.source_preset_a_id = preset_id;
    source.source_preset_b_id = preset_id;
  }
  if (source_id == KESSHO_PRODUCT_SOURCE_LEAD1 || source_id == KESSHO_PRODUCT_SOURCE_LEAD2) {
    source.source_preset_a_id = preset_id;
    source.source_preset_b_id = preset_id;
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
  for (uint32_t index = 0; index < kSourceCount; ++index) {
    const uint32_t source_id = index + 1u;
    KesshoProductSourceSnapshot& source = snapshot.sources[index];
    if (source.source_id == 0u) {
      source.source_id = source_id;
      source.enabled = 1u;
      source.level = 0.9f;
      source.dry_gain = 1.0f;
      source.expression = 0.8f;
      source.post_lpf_hz = 18000.0f;
      source.stereo_width = 1.0f;
    }
    source.attack_seconds = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_ATTACK_SECONDS;
    source.decay_seconds = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_DECAY_SECONDS;
    source.sustain = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_SUSTAIN;
    source.hold_seconds = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_HOLD_SECONDS;
    source.release_seconds = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_RELEASE_SECONDS;
    source.sample_library_id = kSampleLibraryPiano;
    source.sample_role_id = kSampleRoleAny;
    source.sample_articulation_id = kSampleArticulationAny;
    source.sample_selection_mode = KESSHO_PRODUCT_SAMPLE_SELECTION_NEAREST;
    source.sample_dynamic_mode = KESSHO_PRODUCT_SAMPLE_DYNAMIC_LEGACY_PIANO_PARITY;
    source.sample_fixed_dynamic_id = kSampleDynamicRegular;
    source.sample_loop_enabled = 1u;
    source.sample_max_voices = kSampleDefaultMaxVoices;
    source.sample_variant_mode = KESSHO_PRODUCT_SAMPLE_VARIANT_STABLE;
    const uint32_t preset_id = snapshot.sources[index].preset_id == 0u
        ? defaultSourcePresetId(source_id)
        : snapshot.sources[index].preset_id;
    applyGeneratedSourcePreset(snapshot, source_id, preset_id);
  }
}

} // namespace kessho::product::tests
