#pragma once

#include "ProductConstants.h"

#include <cstdint>

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
  float reverb_send = 0.12f;
  float delay_a_send = 0.0f;
  float delay_b_send = 0.0f;
  float granular_send = 0.0f;
  float diffuse_send = 0.0f;
  float post_lpf_hz = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_HZ;
  float stereo_width = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_STEREO_WIDTH;
  float post_lpf_key_tracking = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_KEY_TRACKING;
  float post_lpf_tracking_midi = 60.0f;
  float hold_seconds = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_HOLD_SECONDS;
  uint32_t exact_pad_param_count = 0u;
  float exact_pad_params[kessho::product::generated::KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT]{};
  uint32_t exact_lead_param_count = 0u;
  float exact_lead_params[kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT]{};
  uint32_t exact_drum_param_count = 0u;
  float exact_drum_params[kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_PARAM_COUNT]{};
  uint32_t drum_voice_preset_a_ids[kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_VOICE_COUNT]{};
  uint32_t drum_voice_preset_b_ids[kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_VOICE_COUNT]{};
  float drum_voice_morphs[kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_VOICE_COUNT]{};
};

struct BiquadState {
  float x1 = 0.0f;
  float x2 = 0.0f;
  float y1 = 0.0f;
  float y2 = 0.0f;
};

struct ProductBiquadLowpassState {
  float coeff_cutoff = -1.0f;
  float b0 = 1.0f;
  float b1 = 0.0f;
  float b2 = 0.0f;
  float a1 = 0.0f;
  float a2 = 0.0f;
  BiquadState left{};
  BiquadState right{};
};

enum ProductBiquadFilterType : uint32_t {
  kProductBiquadLowpass = 0u,
  kProductBiquadHighpass = 1u,
};

struct ProductBiquadFilterState {
  float coeff_cutoff = -1.0f;
  uint32_t coeff_type = kProductBiquadLowpass;
  float b0 = 1.0f;
  float b1 = 0.0f;
  float b2 = 0.0f;
  float a1 = 0.0f;
  float a2 = 0.0f;
  BiquadState left{};
  BiquadState right{};
};

struct PadPostChainState {
  float post_lpf_hz = kDefaultPadPostLpfHz;
  float stereo_width = kDefaultPadStereoWidth;
  float coeff_cutoff = -1.0f;
  float b0 = 1.0f;
  float b1 = 0.0f;
  float b2 = 0.0f;
  float a1 = 0.0f;
  float a2 = 0.0f;
  BiquadState left{};
  BiquadState right{};
};

struct LeadPostChainState {
  float post_lpf_hz = kDefaultLeadPostLpfHz;
  float stereo_width = kDefaultLeadStereoWidth;
  float coeff_cutoff = -1.0f;
  float b0 = 1.0f;
  float b1 = 0.0f;
  float b2 = 0.0f;
  float a1 = 0.0f;
  float a2 = 0.0f;
  BiquadState stage1_left{};
  BiquadState stage1_right{};
  BiquadState stage2_left{};
  BiquadState stage2_right{};
};

struct AssetSlot {
  bool active = false;
  uint32_t asset_id = 0;
  const float* channels[2]{};
  uint32_t channel_count = 0;
  uint32_t frame_count = 0;
  double sample_rate = 0.0;
  uint32_t flags = 0;
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
  bool piano_sample_voice = false;
  bool drum_voice = false;
  bool looping = false;
  double phase = 0.0;
  double sample_position = 0.0;
  double sample_step = 1.0;
  float frequency = 0.0f;
  float amplitude = 0.0f;
  float pan = 0.0f;
  uint32_t age_frames = 0;
  uint32_t remaining_frames = 0;
  uint32_t total_frames = 1;
  uint32_t envelope_attack_frames = 1;
  uint32_t envelope_decay_frames = 1;
  uint32_t envelope_hold_frames = 0;
  uint32_t envelope_release_frames = 1;
  float envelope_sustain = 1.0f;
  float post_coeff_cutoff = -1.0f;
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

struct SoundscapeTextureRuntime {
  bool initialized = false;
  uint32_t seed = 0u;
  uint32_t rng_state = 0u;
  uint64_t next_start_frame = 0u;
  float recent_offsets[6]{};
  uint32_t recent_offset_count = 0u;
};

} // namespace kessho::product::internal
