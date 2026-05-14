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

struct FxState {
  float granular_mix = 0.0f;
  bool granular_enabled = false;
  bool granular_freeze = false;
  bool granular_freeze_with_feedback = false;
  float granular_feedback = 0.1f;
  float granular_feedback_lpf_hz = 8000.0f;
  float granular_reverb_lpf_hz = 4000.0f;
  float granular_output_lpf_hz = 12000.0f;
  float granular_buffer_seconds = 16.0f;
  uint32_t granular_grain_shape = 0;
  float granular_bus_diffusion = 0.0f;
  float granular_timing_randomness = 0.35f;
  float granular_chord_bias = 0.0f;
  float granular_legacy_jitter_ms = 10.0f;
  float granular_legacy_probability = 0.8f;
  uint32_t granular_legacy_pitch_mode = 1;
  float granular_legacy_pitch_spread = 2.0f;
  uint32_t granular_legacy_max_grains = 64;
  float granular_legacy_feedback = 0.1f;
  GranularVoiceState granular_voices[kGranularVoiceCount]{};
  bool delay_a_enabled = true;
  float delay_a_time_left_ms = 500.0f;
  float delay_a_time_right_ms = 375.0f;
  float delay_a_feedback = 0.4f;
  float delay_a_mix = 0.0f;
  float delay_a_filter_hz = 2000.0f;
  uint32_t delay_a_filter_type = 0;
  float delay_a_mod_rate_hz = 0.0f;
  float delay_a_mod_depth_ms = 0.0f;
  bool delay_a_ping_pong = false;
  float delay_a_duck = 0.0f;
  float delay_a_width = 0.5f;
  float delay_a_cross_feed_filter_hz = 8000.0f;
  bool delay_b_enabled = false;
  float delay_b_activity = 0.3f;
  float delay_b_repeats = 0.3f;
  float delay_b_base_time_ms = 500.0f;
  float delay_b_tone = 0.5f;
  float delay_b_vibrato = 0.0f;
  float delay_b_mix = 0.0f;
  uint32_t delay_b_space_mode = 0;
  uint32_t delay_b_pattern = 0;
  uint32_t delay_b_warp = 0;
  float delay_b_warp_intensity = 0.5f;
  float delay_b_spread = 0.5f;
  float reverb_mix = 0.12f;
  uint32_t reverb_type = 2;
  uint32_t reverb_quality = 1;
  float reverb_decay = 0.9f;
  float reverb_size = 2.0f;
  float reverb_damping = 0.2f;
  float reverb_diffusion = 1.0f;
  float reverb_modulation = 0.4f;
  float reverb_predelay_ms = 60.0f;
  float reverb_width = 0.85f;
  float reverb_shimmer_amount = 0.0f;
  float reverb_shimmer_pitch = 12.0f;
  float reverb_slow_rate_hz = 0.05f;
  float reverb_slow_depth = 0.0f;
  float reverb_reverse_amount = 0.0f;
  float reverb_reverse_length_sec = 2.0f;
  float reverb_chorus_rate_hz = 0.5f;
  float reverb_chorus_depth = 12.0f;
  uint32_t reverb_mod_character = 2;
  float reverb_damp_low = 0.1f;
  float reverb_damp_high = 0.3f;
  float reverb_crossover_hz = 800.0f;
  float reverb_input_tone = 0.0f;
  float reverb_shimmer_feedback = 0.0f;
  float reverb_warp = 0.0f;
  float reverb_cross_feed = 0.0f;
  float reverb_early_reflections = 0.3f;
  float reverb_air_absorption = 0.2f;
  uint32_t reverb_saturation_mode = 0;
  float reverb_transient_smooth = 0.0f;
  float reverb_er_lp_freq = 2500.0f;
  float reverb_pre_comp_threshold = -36.0f;
  float reverb_pre_comp_knee = 20.0f;
  float reverb_pre_comp_ratio = 5.0f;
  float reverb_pre_comp_attack_ms = 0.7f;
  float reverb_pre_comp_release_ms = 700.0f;
  float reverb_pre_comp_makeup = 2.9f;
  float spectral_freeze_mix = 0.0f;
  bool spectral_freeze_enabled = false;
  bool spectral_freeze_active = false;
  bool spectral_freeze_slushy = false;
  float spectral_freeze_speed = 0.3f;
  float spectral_freeze_decay = 1.0f;
  float spectral_freeze_phase_jitter = 0.0f;
  uint32_t spectral_freeze_routing = 0;
  float spectral_freeze_reverb_crossfade = 0.5f;
  float dynamics_drive = 0.0f;
  bool dynamics_enabled = false;
  bool dynamics_character_enabled = false;
  uint32_t dynamics_character_mode = 0;
  float dynamics_character_mix = 0.0f;
  float dynamics_character_age = 0.0f;
  float dynamics_character_bias = 0.5f;
  float dynamics_character_lpg_amount = 0.5f;
  float dynamics_character_resonance = 0.2f;
  float dynamics_character_stereo = 0.5f;
  float dynamics_character_env_follow = 0.0f;
  float dynamics_character_depth = 0.0f;
  float dynamics_character_rate = 0.3f;
  float dynamics_character_damp = 0.5f;
  bool dynamics_degrade_enabled = false;
  float dynamics_degrade_mix = 0.0f;
  float dynamics_degrade_age = 0.0f;
  float dynamics_degrade_generation = 0.0f;
  float dynamics_degrade_alias = 0.0f;
  float dynamics_degrade_wow = 0.0f;
  float dynamics_degrade_flutter = 0.0f;
  float dynamics_degrade_drift = 0.0f;
  float dynamics_degrade_wobble_speed = 0.35f;
  float dynamics_degrade_tone = 0.5f;
  float dynamics_degrade_hp = 0.0f;
  float dynamics_degrade_lp = 1.0f;
  float dynamics_degrade_noise = 0.0f;
  float dynamics_degrade_saturation = 0.0f;
  float dynamics_degrade_corrosion = 0.0f;
  float dynamics_mod[kDynamicsModSourceCount][kDynamicsModTargetCount]{
      {0.18f, 0.02f, 0.12f, 0.03f, 0.04f, 0.0f},
      {0.0f, 0.12f, 0.02f, 0.0f, 0.02f, 0.0f},
      {0.04f, 0.03f, 0.14f, 0.02f, 0.1f, 0.02f},
      {0.0f, 0.0f, 0.08f, 0.04f, 0.0f, 0.0f},
      {0.0f, 0.06f, 0.02f, 0.0f, 0.06f, 0.02f},
  };
  bool dynamics_saturation_enabled = false;
  uint32_t dynamics_saturation_mode = 0;
  float dynamics_saturation_drive = 0.0f;
  float dynamics_saturation_tone = 0.5f;
  float dynamics_saturation_bias = 0.5f;
  bool dynamics_end_comp_enabled = false;
  float dynamics_end_comp_threshold = -18.0f;
  float dynamics_end_comp_knee = 12.0f;
  float dynamics_end_comp_ratio = 2.0f;
  float dynamics_end_comp_attack_ms = 10.0f;
  float dynamics_end_comp_release_ms = 180.0f;
  float dynamics_end_comp_makeup = 1.0f;
  float dynamics_end_comp_mix = 1.0f;
  float dynamics_end_comp_detector_hp = 0.25f;
  float dynamics_end_comp_detector_tilt = 0.5f;
  float dynamics_end_comp_auto_makeup = 0.7f;
  float dynamics_end_comp_program_release = 0.65f;
  bool sidechain_enabled = false;
  uint32_t sidechain_key_a = kSidechainKeyKick;
  uint32_t sidechain_key_b = kSidechainKeyOff;
  float sidechain_key_a_weight = 1.0f;
  float sidechain_key_b_weight = 0.7f;
  float sidechain_amount = 0.5f;
  float sidechain_threshold = -24.0f;
  float sidechain_ratio = 4.0f;
  float sidechain_knee = 6.0f;
  float sidechain_attack_ms = 5.0f;
  float sidechain_hold_ms = 20.0f;
  float sidechain_release_ms = 180.0f;
  float sidechain_makeup = 1.0f;
  float sidechain_mix = 1.0f;
  float sidechain_curve = 0.5f;
  float sidechain_detector_hp = 0.0f;
  float sidechain_detector_lp = 1.0f;
  float sidechain_targets[kSidechainTargetCount]{};
};

struct SidechainEnvelope {
  float current_gain = 1.0f;
  float start_gain = 1.0f;
  float target_gain = 1.0f;
  uint32_t attack_elapsed = 0u;
  uint32_t attack_frames = 0u;
  uint32_t hold_remaining = 0u;
  uint32_t release_elapsed = 0u;
  uint32_t release_frames = 0u;
  float release_coeff = 0.0f;
};

struct RoutingState {
  float delay_a_to_delay_b = 0.0f;
  float delay_b_to_delay_a = 0.0f;
  float delay_to_reverb = 0.2f;
  float granular_to_reverb = 0.15f;
  float delay_a_to_granular = 0.0f;
  float delay_b_to_granular = 0.0f;
  float delay_b_to_reverb = 0.4f;
  float granular_to_delay_a = 0.0f;
  float granular_to_delay_b = 0.0f;
};

} // namespace kessho::product::internal
