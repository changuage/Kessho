#pragma once

#include "ProductConstants.h"

#include <cstdint>

namespace kessho::product::internal {

struct GranularVoiceState {
  bool enabled = false;
  uint32_t mode = 1;
  uint32_t slice = 0;
  float speed = 1.0f;
  float scan_rate = 1.0f;
  bool reverse = false;
  float pitch = 0.0f;
  float write_follow = 0.0f;
  float density = 20.0f;
  float grain_size_ms = 80.0f;
  float spray = 0.3f;
  float position_spray = 0.3f;
  float timing_spray = 0.0f;
  float lookback = 0.35f;
  float write_guard = 0.30f;
  uint32_t pitch_mode = 0;
  float pitch_spread = 0.0f;
  float pitch_jitter_cents = 4.0f;
  float pitch_quantize = 1.0f;
  float reverse_chance = 0.0f;
  float bloom = 0.0f;
  float glide = 0.0f;
  uint32_t cloud_style = 0;
  uint32_t anchor_pattern = 0;
  float loop_crossfade_ms = 12.0f;
  float grain_octave_probability = 0.0f;
  float attack_seconds = 0.003f;
  float decay_seconds = 0.5f;
  float gain = 0.5f;
  float pan = 0.0f;
  float blur = 0.0f;
  float stereo_spread = 0.5f;
  float position_lfo_rate = 0.0f;
  float position_lfo_depth = 0.0f;
  float pan_lfo_rate = 0.0f;
  float reverse_lfo_rate = 0.0f;
  float record_lfo_rate = 0.0f;
  bool euclid_gated = false;
  bool euclid_muted = false;
};

} // namespace kessho::product::internal
