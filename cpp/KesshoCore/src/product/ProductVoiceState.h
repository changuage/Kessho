#pragma once

#include "ProductConstants.h"
#include "ProductFilterState.h"
#include "ProductSoundscapeTextureRuntimeState.h"

#include <cstdint>

#include "../modules/KesshoModule.h"
#include "kessho_pad.h"

namespace kessho::product::internal {

struct SourceState {
  bool enabled = true;
  uint32_t source_id = KESSHO_PRODUCT_SOURCE_PAD1;
  uint32_t preset_id = 0;
  uint32_t asset_id = 0;
  uint32_t asset_refs[kMaxSoundscapeAssetRefs]{};
  float asset_ref_levels[kMaxSoundscapeAssetRefs]{};
  uint32_t asset_ref_count = 0;
  uint32_t last_missing_asset_id = 0;
  float level = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_LEVEL;
  float morph = 0.0f;
  float distance = 0.0f;
  float expression = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_EXPRESSION;
  float dry_gain = 1.0f;
  float enabled_gain = 1.0f;
  float enabled_gain_target = 1.0f;
  float enabled_gain_delta = 0.0f;
  uint32_t enabled_gain_ramp_remaining = 0u;
  uint64_t enabled_gain_frame = 0u;
  // Realtime UI audition is runtime-only. It can render a disabled source
  // without changing the authored enabled state or its snapshot value.
  uint32_t transient_audition_hold_count = 0u;
  uint64_t transient_audition_until_frame = 0u;
  float transient_audition_gain = 0.0f;
  float transient_audition_gain_target = 0.0f;
  float transient_audition_gain_delta = 0.0f;
  uint32_t transient_audition_gain_ramp_remaining = 0u;
  uint64_t transient_audition_gain_frame = 0u;
  float reverb_send = 0.12f;
  float delay_a_send = 0.0f;
  float delay_b_send = 0.0f;
  float granular_send = 0.0f;
  float degrade_send = 0.0f;
  float granular_send_gain = 0.0f;
  uint64_t granular_send_gain_frame = UINT64_MAX;
  float diffuse_send = 0.0f;
  float post_lpf_hz = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_HZ;
  float stereo_width = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_STEREO_WIDTH;
  float post_lpf_key_tracking = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_KEY_TRACKING;
  float post_lpf_tracking_midi = 60.0f;
  float lead_vibrato_depth = 0.0f;
  float lead_vibrato_rate = 0.0f;
  float lead_glide = 0.0f;
  float attack_seconds = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_ATTACK_SECONDS;
  float decay_seconds = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_DECAY_SECONDS;
  float sustain = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_SUSTAIN;
  float hold_seconds = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_HOLD_SECONDS;
  float release_seconds = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_RELEASE_SECONDS;
  uint32_t sample_library_id = kSampleLibraryPiano;
  uint32_t sample_role_id = kSampleRoleAny;
  uint32_t sample_articulation_id = kSampleArticulationAny;
  uint32_t sample_selection_mode = KESSHO_PRODUCT_SAMPLE_SELECTION_NEAREST;
  uint32_t sample_dynamic_mode = KESSHO_PRODUCT_SAMPLE_DYNAMIC_LEGACY_PIANO_PARITY;
  uint32_t sample_fixed_dynamic_id = kSampleDynamicRegular;
  bool sample_loop_enabled = true;
  uint32_t sample_max_voices = kSampleDefaultMaxVoices;
  uint32_t sample_variant_mode = KESSHO_PRODUCT_SAMPLE_VARIANT_STABLE;
  uint32_t sample_variant_counter = 0u;
  bool structured_override_morph_anchor_enabled = false;
  float structured_override_morph_anchor = 0.0f;
  uint32_t pad_override_count = 0u; uint32_t pad_override_indices[kessho::product::generated::KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT]{}; float pad_override_values[kessho::product::generated::KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT]{};
  uint32_t lead_override_count = 0u; uint32_t lead_override_indices[kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT]{}; float lead_override_values[kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT]{};
  uint32_t drum_override_count = 0u; uint32_t drum_override_indices[kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_PARAM_COUNT]{}; float drum_override_values[kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_PARAM_COUNT]{};
  uint32_t soundscape_texture_param_count = 0u; float soundscape_texture_params[kSoundscapeTextureParamCount]{};
  uint32_t soundscape_module_param_count = 0u; float soundscape_module_params[kSoundscapeProductModuleParamCount]{};
  uint32_t source_preset_a_id = 0u, source_preset_b_id = 0u;
  bool lead_envelope_override_enabled = false;
  bool lead_algorithm_preset_a_enabled = false;
  bool source_preset_patch_valid = false, source_preset_endpoint_valid = false;
  uint32_t source_preset_runtime_revision = 1u;
  float source_preset_macro_morph = 0.0f, source_preset_macro_distance = 0.0f, source_preset_macro_expression = 1.0f;
  kessho::core::KesshoSourcePresetPatch source_preset_patch{}, source_preset_endpoint_a{}, source_preset_endpoint_b{};
  const kessho::core::KesshoSourcePresetPatch* applied_module_patch_ptr = nullptr;
  uint32_t applied_module_patch_revision = 0u;
  uint32_t drum_voice_preset_a_ids[kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_VOICE_COUNT]{};
  uint32_t drum_voice_preset_b_ids[kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_VOICE_COUNT]{};
  float drum_voice_morphs[kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_VOICE_COUNT]{};
};

struct AssetSlot {
  bool active = false;
  uint32_t asset_id = 0;
  const float* channels[2]{};
  uint32_t channel_count = 0;
  uint32_t frame_count = 0;
  double sample_rate = 0.0;
  uint32_t flags = 0;
  uint32_t loop_start_frame = 0;
  uint32_t loop_end_frame = 0;
  uint32_t loop_crossfade_frames = 0;
};

struct SoundscapeLayerPolicy {
  float level_base = 0.85f;
  float level_range = 0.15f;
  float pan_base = 0.2f;
  float pan_distance = 0.55f;
  float rate_depth = 0.02f;
};

struct Voice {
  bool active = false;
  uint32_t source_id = 0;
  uint32_t asset_slot = 0;
  bool sample_voice = false;
  bool soundscape_texture_voice = false;
  uint8_t soundscape_texture_slot = kSoundscapeTextureSlotCount;
  uint8_t soundscape_layer = kSoundscapeLayerCount;
  bool soundscape_releasing = false;
  uint32_t soundscape_texture_slice_id = 0; bool soundscape_texture_sample_hold_triggered = false;
  uint64_t soundscape_texture_start_frame = 0u;
  float soundscape_texture_start_offset_seconds = 0.0f;
  float soundscape_asset_level = 1.0f;
  bool sample_slot_voice = false;
  bool piano_sample_voice = false;
  bool drum_voice = false;
  bool looping = false;
  double phase = 0.0;
  double sample_position = 0.0;
  double sample_step = 1.0;
  float frequency = 0.0f;
  float midi_note = 60.0f, amplitude = 0.0f, harmony_fade_gain = 1.0f, harmony_fade_target = 1.0f, harmony_fade_step = 0.0f; uint32_t harmony_fade_frames_remaining = 0u; bool harmony_resolved_voice = false;
  float pan = 0.0f;
  uint32_t age_frames = 0;
  uint32_t remaining_frames = 0;
  uint32_t total_frames = 1;
  uint32_t envelope_attack_frames = 1;
  uint32_t envelope_decay_frames = 1;
  uint32_t envelope_hold_frames = 0;
  uint32_t envelope_release_frames = 1;
  uint32_t loop_crossfade_frames = 0;
  float envelope_sustain = 1.0f;
  float post_coeff_cutoff = -1.0f; float post_filter_q = -1.0f; uint8_t post_filter_type = 0u;
  float post_b0 = 1.0f;
  float post_b1 = 0.0f;
  float post_b2 = 0.0f;
  float post_a1 = 0.0f;
  float post_a2 = 0.0f;
  BiquadState post_left{};
  BiquadState post_right{};
  BiquadState post_stage2_left{};
  BiquadState post_stage2_right{};
  uint32_t start_delay_frames = 0;
};

} // namespace kessho::product::internal
