#pragma once

#include "ProductConstants.h"

#include <cstdint>

namespace kessho::product::internal {

enum SoundscapeTextureFallbackReason : uint32_t {
  kSoundscapeTextureFallbackNone = 0u, kSoundscapeTextureFallbackNotTextureAsset = 1u,
  kSoundscapeTextureFallbackParityFixture = 2u, kSoundscapeTextureFallbackTextureParamsUnavailable = 3u,
  kSoundscapeTextureFallbackMissingAsset = 4u, kSoundscapeTextureFallbackInvalidAssetMetadata = 5u,
  kSoundscapeTextureFallbackAllocatorFull = 6u, kSoundscapeTextureFallbackAssetTooShortForSlice = 7u,
};

struct SoundscapeTextureRuntime {
  bool initialized = false; uint32_t asset_id = 0u;
  float output_level = 0.0f, output_level_target = 0.0f, output_level_delta = 0.0f;
  uint32_t output_level_ramp_remaining = 0u;
  uint32_t seed = 0u, rng_state = 0u;
  uint64_t next_start_frame = 0u;
  uint32_t next_slice_id = 1u, last_slice_id = 0u;
  uint64_t last_start_frame = 0u;
  float last_offset_seconds = 0.0f, last_slice_duration = 0.0f, last_output_duration = 0.0f;
  float last_detune_cents = 0.0f, last_speed_multiplier = 1.0f, last_total_rate = 1.0f;
  float last_density = 0.0f, last_fade_time = 0.0f, last_asset_duration = 0.0f, last_max_offset = 0.0f;
  uint32_t last_fallback_reason = kSoundscapeTextureFallbackNone;
  uint32_t runtime_reset_count = 0u;
  float recent_offsets[6]{};
  uint32_t recent_offset_count = 0u;
  bool spatial_enabled = false;
  uint32_t spatial_delay_frames = 0u;
  float spatial_center_gain = 1.0f;
  float spatial_side_gain = 0.0f;
  float spatial_left_branch_l = 1.0f;
  float spatial_left_branch_r = 0.0f;
  float spatial_right_branch_l = 0.0f;
  float spatial_right_branch_r = 1.0f;
};

} // namespace kessho::product::internal
