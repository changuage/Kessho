#include "../KesshoProductEngineInternal.h"

  float KesshoProductEngine::dynamicsModRoute(const float sources[kDynamicsModSourceCount], uint32_t target) const {
  if (target >= kDynamicsModTargetCount) {
    return 0.0f;
  }
  float sum = 0.0f;
  for (uint32_t source = 0; source < kDynamicsModSourceCount; ++source) {
    sum += sources[source] * clampFloat(fx.dynamics_mod[source][target], 0.0f, 1.0f);
  }
  return clampFloat(sum, 0.0f, 1.0f);
}

  void KesshoProductEngine::configureFxModules() {
  if (delay_a_module) {
    float* params = delay_a_module->params();
    if (params != nullptr && delay_a_module->paramCount() >= 16) {
      const bool active =
          fx.delay_a_enabled &&
          (fx.delay_a_mix > 0.0001f ||
           routing.delay_a_to_delay_b > 0.0001f ||
           routing.delay_to_reverb > 0.0001f ||
           routing.delay_a_to_granular > 0.0001f);
      params[0] = active ? 1.0f : 0.0f;
      params[1] = clampFloat(fx.delay_a_time_left_ms, 10.0f, 5000.0f);
      params[2] = clampFloat(fx.delay_a_time_right_ms, 10.0f, 5000.0f);
      params[3] = clampFloat(fx.delay_a_feedback, 0.0f, 0.95f);
      params[4] = clampFloat(fx.delay_a_mix, 0.0f, 1.0f);
      params[5] = clampFloat(fx.delay_a_filter_hz, 200.0f, 12000.0f);
      params[6] = static_cast<float>(clampU32(fx.delay_a_filter_type, 0u, 2u));
      params[7] = clampFloat(routing.delay_to_reverb, 0.0f, 1.0f);
      params[8] = clampFloat(fx.delay_a_mod_rate_hz, 0.0f, 5.0f);
      params[9] = clampFloat(fx.delay_a_mod_depth_ms, 0.0f, 50.0f);
      params[10] = fx.delay_a_ping_pong ? 1.0f : 0.0f;
      params[11] = clampFloat(fx.delay_a_duck, 0.0f, 1.0f);
      params[12] = clampFloat(fx.delay_a_width, 0.0f, 1.0f);
      params[13] = clampFloat(routing.delay_a_to_delay_b, 0.0f, 1.0f);
      params[14] = clampFloat(fx.delay_a_cross_feed_filter_hz, 200.0f, 12000.0f);
      params[15] = clampFloat(routing.delay_a_to_granular, 0.0f, 1.0f);
      delay_a_module->commitParams();
    }
  }
  if (delay_b_module) {
    float* params = delay_b_module->params();
    if (params != nullptr && delay_b_module->paramCount() >= 16) {
      const bool active =
          fx.delay_b_enabled &&
          (fx.delay_b_mix > 0.0001f ||
           routing.delay_b_to_delay_a > 0.0001f ||
           routing.delay_b_to_reverb > 0.0001f ||
           routing.delay_b_to_granular > 0.0001f);
      params[0] = active ? 1.0f : 0.0f;
      params[1] = clampFloat(fx.delay_b_activity, 0.0f, 1.0f);
      params[2] = clampFloat(fx.delay_b_repeats, 0.0f, 0.85f);
      params[3] = clampFloat(fx.delay_b_base_time_ms, 20.0f, 5000.0f);
      params[4] = clampFloat(fx.delay_b_tone, 0.0f, 1.0f);
      params[5] = clampFloat(fx.delay_b_vibrato, 0.0f, 1.0f);
      params[6] = clampFloat(fx.delay_b_mix, 0.0f, 1.0f);
      params[7] = clampFloat(routing.delay_b_to_reverb, 0.0f, 1.0f);
      params[8] = clampFloat(routing.delay_b_to_granular, 0.0f, 1.0f);
      params[9] = clampFloat(routing.delay_b_to_delay_a, 0.0f, 1.0f);
      params[10] = static_cast<float>(clampU32(fx.delay_b_space_mode, 0u, 1u));
      params[11] = static_cast<float>(clampU32(fx.delay_b_pattern, 0u, 3u));
      params[12] = static_cast<float>(clampU32(fx.delay_b_warp, 0u, 3u));
      params[13] = clampFloat(fx.delay_b_warp_intensity, 0.0f, 1.0f);
      params[14] = clampFloat(fx.delay_b_spread, 0.0f, 1.0f);
      delay_b_module->commitParams();
    }
  }
  if (reverb_module) {
    float* params = reverb_module->params();
    if (params != nullptr && reverb_module->paramCount() >= 30) {
      params[0] = static_cast<float>(clampU32(fx.reverb_type, 0u, 5u));
      params[1] = static_cast<float>(clampU32(fx.reverb_quality, 0u, 2u));
      params[2] = clampFloat(fx.reverb_decay, 0.0f, 1.0f);
      params[3] = clampFloat(fx.reverb_size, 0.5f, 10.0f);
      params[4] = clampFloat(fx.reverb_damping, 0.0f, 1.0f);
      params[5] = clampFloat(fx.reverb_diffusion, 0.0f, 1.0f);
      params[6] = clampFloat(fx.reverb_modulation, 0.0f, 1.0f);
      params[7] = clampFloat(fx.reverb_predelay_ms, 0.0f, 100.0f);
      params[8] = clampFloat(fx.reverb_width, 0.0f, 1.0f);
      params[9] = clampFloat(fx.reverb_shimmer_amount, 0.0f, 1.0f);
      params[10] = clampFloat(fx.reverb_shimmer_pitch, -24.0f, 24.0f);
      params[11] = clampFloat(fx.reverb_slow_rate_hz, 0.01f, 0.2f);
      params[12] = clampFloat(fx.reverb_slow_depth, 0.0f, 1.0f);
      params[13] = clampFloat(fx.reverb_reverse_amount, 0.0f, 1.0f);
      params[14] = clampFloat(fx.reverb_reverse_length_sec, 0.5f, 16.0f);
      params[15] = clampFloat(fx.reverb_chorus_rate_hz, 0.05f, 2.0f);
      params[16] = clampFloat(fx.reverb_chorus_depth, 0.0f, 40.0f);
      params[17] = static_cast<float>(clampU32(fx.reverb_mod_character, 0u, 2u));
      params[18] = clampFloat(fx.reverb_damp_low, 0.0f, 1.0f);
      params[19] = clampFloat(fx.reverb_damp_high, 0.0f, 1.0f);
      params[20] = clampFloat(fx.reverb_crossover_hz, 100.0f, 6000.0f);
      params[21] = clampFloat(fx.reverb_input_tone, -1.0f, 1.0f);
      params[22] = clampFloat(fx.reverb_shimmer_feedback, 0.0f, 1.0f);
      params[23] = clampFloat(fx.reverb_warp, 0.0f, 1.0f);
      params[24] = clampFloat(fx.reverb_cross_feed, 0.0f, 1.0f);
      params[25] = clampFloat(fx.reverb_early_reflections, 0.0f, 1.0f);
      params[26] = clampFloat(fx.reverb_air_absorption, 0.0f, 1.0f);
      params[27] = static_cast<float>(clampU32(fx.reverb_saturation_mode, 0u, 2u));
      params[28] = clampFloat(fx.reverb_transient_smooth, 0.0f, 1.0f);
      params[29] = clampFloat(fx.reverb_er_lp_freq, 200.0f, 12000.0f);
      reverb_module->commitParams();
    }
  }
  if (granular_module) {
    float* params = granular_module->params();
    if (params != nullptr && granular_module->paramCount() >= static_cast<int>(kGranularParamCount)) {
      params[0] = fx.granular_enabled ? 1.0f : 0.0f;
      params[1] = fx.granular_freeze ? 1.0f : 0.0f;
      params[2] = fx.granular_freeze_with_feedback ? 1.0f : 0.0f;
      params[3] = 1.0f;
      params[4] = clampFloat(fx.granular_feedback, 0.0f, 0.85f);
      params[5] = clampFloat(fx.granular_feedback_lpf_hz, 200.0f, 12000.0f);
      params[6] = clampFloat(fx.granular_buffer_seconds, 1.0f, 32.0f);
      params[7] = static_cast<float>(clampU32(fx.granular_grain_shape, 0u, 3u));
      params[8] = clampFloat(fx.granular_bus_diffusion, 0.0f, 1.0f);
      params[9] = clampFloat(fx.granular_timing_randomness, 0.0f, 1.0f);
      for (uint32_t voice_index = 0; voice_index < kGranularVoiceCount; ++voice_index) {
        const GranularVoiceState& voice = fx.granular_voices[voice_index];
        const uint32_t base = kGranularGlobalParamCount + voice_index * kGranularVoiceParamCount;
        params[base + 0] = voice.enabled ? 1.0f : 0.0f;
        params[base + 1] = static_cast<float>(clampU32(voice.mode, 0u, 2u));
        params[base + 2] = static_cast<float>(clampU32(voice.slice, 0u, 15u));
        params[base + 3] = clampFloat(voice.speed, 0.0f, 4.0f);
        params[base + 4] = clampFloat(voice.scan_rate, 0.25f, 4.0f);
        params[base + 5] = voice.reverse ? 1.0f : 0.0f;
        params[base + 6] = clampFloat(voice.pitch, -24.0f, 24.0f);
        params[base + 7] = clampFloat(voice.write_follow, 0.0f, 1.0f);
        params[base + 8] = clampFloat(voice.density, 1.0f, 64.0f);
        params[base + 9] = clampFloat(voice.grain_size_ms, 10.0f, 500.0f);
        params[base + 10] = clampFloat(voice.spray, 0.0f, 1.0f);
        params[base + 11] = clampFloat(voice.grain_octave_probability, 0.0f, 1.0f);
        params[base + 12] = clampFloat(voice.attack_seconds, 0.001f, 0.5f);
        params[base + 13] = clampFloat(voice.decay_seconds, 0.01f, 4.0f);
        params[base + 14] = clampFloat(voice.gain, 0.0f, 1.0f);
        params[base + 15] = clampFloat(voice.pan, -1.0f, 1.0f);
        params[base + 16] = clampFloat(voice.blur, 0.0f, 1.0f);
        params[base + 17] = clampFloat(voice.stereo_spread, 0.0f, 1.0f);
        params[base + 18] = clampFloat(voice.position_lfo_rate, 0.0f, 1.0f);
        params[base + 19] = clampFloat(voice.position_lfo_depth, 0.0f, 1.0f);
        params[base + 20] = clampFloat(voice.pan_lfo_rate, 0.0f, 1.0f);
        params[base + 21] = clampFloat(voice.reverse_lfo_rate, 0.0f, 1.0f);
        params[base + 22] = clampFloat(voice.record_lfo_rate, 0.0f, 1.0f);
        params[base + 23] = voice.euclid_gated ? 1.0f : 0.0f;
        params[base + 24] = voice.euclid_muted ? 1.0f : 0.0f;
      }
      int intervals[kMaxScaleNotes]{};
      const uint32_t interval_count = std::min<uint32_t>(scaleIntervals(harmony.scale_id, intervals), 12u);
      params[kGranularScaleCountParam] = static_cast<float>(interval_count);
      for (uint32_t i = 0; i < 12u; ++i) {
        params[kGranularScaleIntervalsParam + i] = i < interval_count ? static_cast<float>(intervals[i]) : 0.0f;
      }
      params[kGranularChordCountParam] = 4.0f;
      for (uint32_t i = 0; i < 7u; ++i) {
        params[kGranularChordPitchesParam + i] =
            i < 4u ? static_cast<float>(positiveModulo(roundedInt(harmony.chord_midi[i] - harmony.root_midi), 12u)) : 0.0f;
      }
      params[kGranularChordBiasParam] = clampFloat(fx.granular_chord_bias, 0.0f, 1.0f);
      params[kGranularLegacyParamStart + 0] = clampFloat(fx.granular_legacy_jitter_ms, 0.0f, 30.0f);
      params[kGranularLegacyParamStart + 1] = clampFloat(fx.granular_legacy_probability, 0.0f, 1.0f);
      params[kGranularLegacyParamStart + 2] = static_cast<float>(clampU32(fx.granular_legacy_pitch_mode, 0u, 1u));
      params[kGranularLegacyParamStart + 3] = clampFloat(fx.granular_legacy_pitch_spread, 0.0f, 12.0f);
      params[kGranularLegacyParamStart + 4] = static_cast<float>(clampU32(fx.granular_legacy_max_grains, 0u, 128u));
      params[kGranularLegacyParamStart + 5] = clampFloat(fx.granular_legacy_feedback, 0.0f, 0.35f);
      granular_module->commitParams();
    }
  }
  if (spectral_freeze_module) {
    float* params = spectral_freeze_module->params();
    if (params != nullptr && spectral_freeze_module->paramCount() >= 6) {
      params[0] = fx.spectral_freeze_active ? 1.0f : 0.0f;
      params[1] = fx.spectral_freeze_slushy ? 1.0f : 0.0f;
      params[2] = clampFloat(fx.spectral_freeze_speed, 0.0f, 1.0f);
      params[3] = 1.0f;
      params[4] = clampFloat(1.0f - fx.spectral_freeze_decay, 0.0f, 1.0f);
      params[5] = clampFloat(fx.spectral_freeze_phase_jitter, 0.0f, 1.0f);
      spectral_freeze_module->commitParams();
    }
  }
  if (dynamics_character_module) {
    float* params = dynamics_character_module->params();
    if (
        params != nullptr &&
        static_cast<uint32_t>(dynamics_character_module->paramCount()) >= kDynamicsCharacterParamCount) {
      std::fill(params, params + dynamics_character_module->paramCount(), 0.0f);
      const auto unit = [](float value) {
        return clampFloat(value, 0.0f, 1.0f);
      };
      const auto water_bias_floor = [](float value, float min_hz, float pedal_max_hz, float creative_max_hz) {
        const float t = clampFloat(value, 0.0f, 1.0f);
        constexpr float kPedalZone = 0.72f;
        if (t <= kPedalZone) {
          const float local = t / kPedalZone;
          return min_hz * std::pow(pedal_max_hz / min_hz, local);
        }
        const float local = (t - kPedalZone) / (1.0f - kPedalZone);
        return pedal_max_hz * std::pow(creative_max_hz / pedal_max_hz, local);
      };
      const float legacy_master_saturation_drive = clampFloat(master_saturation_drive, 0.0f, 1.0f);
      const bool legacy_master_saturation_enabled =
          !fx.dynamics_enabled && legacy_master_saturation_drive > 0.0001f;
      const bool dynamics_enabled = fx.dynamics_enabled || legacy_master_saturation_enabled;
      const bool character_enabled = dynamics_enabled && fx.dynamics_character_enabled;
      const bool degrade_enabled = dynamics_enabled && fx.dynamics_degrade_enabled;
      const bool end_comp_enabled = fx.dynamics_enabled && fx.dynamics_end_comp_enabled;
      const uint32_t character_mode = character_enabled ? clampU32(fx.dynamics_character_mode, 0u, 2u) : 0u;
      const bool mode_active = character_mode != 0u;
      const float clean_flavor = character_mode == 0u ? 1.0f : 0.0f;
      const float shallow_flavor = character_mode == 2u ? 1.0f : 0.0f;
      const float abyss_flavor = character_mode == 1u ? 1.0f : 0.0f;
      const float default_age = character_mode == 2u ? 0.18f : (character_mode == 1u ? 0.06f : 0.0f);
      const float default_resonance = character_mode == 2u ? 0.24f : (character_mode == 1u ? 0.18f : 0.2f);
      const float default_depth = character_mode == 2u ? 0.82f : (character_mode == 1u ? 0.33f : 0.12f);
      const float default_rate = character_mode == 2u ? 0.16f : (character_mode == 1u ? 0.08f : 0.2f);
      const float default_damp = character_mode == 2u ? 0.65f : (character_mode == 1u ? 0.33f : 0.5f);
      const float default_bias = character_mode == 2u ? 0.44f : (character_mode == 1u ? 0.38f : 0.78f);
      const float default_lpg_amount = character_mode == 2u ? 0.68f : (character_mode == 1u ? 0.84f : 0.08f);
      const float character_mix = character_enabled ? unit(fx.dynamics_character_mix) : 0.0f;
      const float character_bias = character_enabled ? unit(fx.dynamics_character_bias) : default_bias;
      const float character_lpg_amount = character_enabled ? unit(fx.dynamics_character_lpg_amount) : default_lpg_amount;
      const float degrade_mix = degrade_enabled ? unit(fx.dynamics_degrade_mix) : 0.0f;
      const float base_wet = unit(1.0f - (1.0f - character_mix) * (1.0f - degrade_mix));
      const float degrade_influence = std::sqrt(degrade_mix);
      const float base_dry = 1.0f - base_wet;
      const float raw_character_age = character_enabled ? unit(fx.dynamics_character_age) : 0.0f;
      const float raw_degrade_age = degrade_enabled ? unit(fx.dynamics_degrade_age) : 0.0f;
      const float raw_degrade_generation = degrade_enabled ? unit(fx.dynamics_degrade_generation) : 0.0f;
      const float raw_degrade_alias = degrade_enabled ? unit(fx.dynamics_degrade_alias) : 0.0f;
      const float base_degrade_wow = degrade_enabled ? unit(fx.dynamics_degrade_wow) : 0.0f;
      const float base_degrade_flutter = degrade_enabled ? unit(fx.dynamics_degrade_flutter) : 0.0f;
      const float base_degrade_drift = degrade_enabled ? unit(fx.dynamics_degrade_drift) : 0.0f;
      const float degrade_wobble_speed = degrade_enabled ? unit(fx.dynamics_degrade_wobble_speed) : 0.35f;
      const float degrade_age = raw_degrade_age * degrade_influence;
      const float degrade_generation = raw_degrade_generation * degrade_influence;
      const float degrade_alias = raw_degrade_alias * degrade_influence;
      const float raw_media_wear = unit(raw_degrade_age + raw_degrade_generation * 0.42f);
      const float media_wear = unit(degrade_age + degrade_generation * 0.42f);
      const float raw_corrosion = degrade_enabled ? unit(fx.dynamics_degrade_corrosion) : 0.0f;
      const float contribution_abyss = abyss_flavor * character_mix;
      const float contribution_shallow = shallow_flavor * character_mix;
      const float contribution_clean = clean_flavor * character_mix;
      const float contribution_material_wear = unit((raw_degrade_age * 0.72f + raw_degrade_generation * 0.58f) * degrade_influence);
      const float contribution_alias_damage = unit((raw_degrade_alias * 0.9f + raw_corrosion * 0.42f) * degrade_influence);
      const float contribution_cross_patch = unit(contribution_alias_damage * (0.4f + raw_corrosion * 0.8f));
      const float contribution_random_hold = unit(
          contribution_abyss * 0.88f +
          contribution_shallow * 0.82f +
          contribution_clean * 0.34f +
          contribution_material_wear * 0.08f +
          contribution_cross_patch * 0.28f);
      const float contribution_smooth_drift = unit(
          contribution_abyss * 0.56f +
          contribution_shallow * 0.78f +
          contribution_clean * 0.3f +
          contribution_material_wear * 0.44f +
          contribution_cross_patch * 0.24f);
      const float contribution_sine_wow = unit(
          contribution_clean * 0.18f +
          contribution_shallow * 0.12f +
          contribution_abyss * 0.1f +
          contribution_material_wear * 0.08f +
          contribution_cross_patch * 0.08f);
      const float contribution_flutter_jitter = unit(
          contribution_abyss * 0.18f +
          contribution_shallow * 0.34f +
          contribution_material_wear * 0.12f +
          contribution_alias_damage * (0.22f + contribution_cross_patch * 0.58f));
      const float contribution_envelope_bloom = unit(
          contribution_abyss * 0.72f +
          contribution_shallow * 0.22f +
          contribution_clean * 0.08f);
      const float contribution_cascaded_filter = unit(
          contribution_abyss * 0.52f +
          contribution_shallow * 0.56f +
          contribution_clean * 0.18f +
          contribution_material_wear * 0.18f);
      const float contribution_bbd_color = unit(
          contribution_shallow * 0.7f +
          contribution_abyss * 0.16f +
          contribution_material_wear * 0.1f +
          contribution_alias_damage * 0.12f);
      const float env_follow = character_enabled ? unit(fx.dynamics_character_env_follow) : 0.0f;
      float mod_sources[kDynamicsModSourceCount]{};
      if (degrade_enabled) {
        mod_sources[kDynamicsModSourceSlow] = degrade_influence * clampFloat(
            base_degrade_wow * 0.22f +
                base_degrade_drift * 0.34f +
                raw_degrade_age * 0.2f +
                raw_degrade_generation * 0.18f +
                contribution_smooth_drift * 0.18f,
            0.0f,
            1.0f);
        mod_sources[kDynamicsModSourceFlutter] = degrade_influence * clampFloat(
            base_degrade_flutter * 0.55f + contribution_flutter_jitter * 0.24f + raw_degrade_generation * 0.08f,
            0.0f,
            1.0f);
        mod_sources[kDynamicsModSourceRandom] = degrade_influence * clampFloat(
            base_degrade_drift * 0.3f + contribution_random_hold * 0.44f + raw_media_wear * 0.22f,
            0.0f,
            1.0f);
        mod_sources[kDynamicsModSourceEnv] = degrade_influence * env_follow;
        mod_sources[kDynamicsModSourceNoise] = degrade_influence * clampFloat(
            unit(fx.dynamics_degrade_noise) * 0.64f + raw_corrosion * 0.18f + raw_degrade_alias * 0.12f,
            0.0f,
            1.0f);
      }
      const float mod_wow = dynamicsModRoute(mod_sources, kDynamicsModTargetWow);
      const float mod_flutter = dynamicsModRoute(mod_sources, kDynamicsModTargetFlutter);
      const float mod_lp = dynamicsModRoute(mod_sources, kDynamicsModTargetLp);
      const float mod_wet = dynamicsModRoute(mod_sources, kDynamicsModTargetWet);
      const float mod_dropout = dynamicsModRoute(mod_sources, kDynamicsModTargetDropout);
      const float mod_alias = dynamicsModRoute(mod_sources, kDynamicsModTargetAlias);
      const float worklet_alias = unit(raw_degrade_alias + mod_alias * 0.18f);
      const float shaped_alias = unit(degrade_alias + mod_alias * 0.08f);
      const float digital_damage = unit(shaped_alias * 0.46f + degrade_generation * 0.22f);
      const float damage = unit(
          degrade_mix *
          (degrade_age * 0.32f + degrade_generation * 0.18f + shaped_alias * 0.08f + raw_corrosion * degrade_influence * 0.12f));
      const float character_age = character_enabled
          ? std::max(raw_character_age, mode_active ? default_age : 0.0f)
          : 0.0f;
      const float age = unit(std::max(character_age, media_wear * (0.38f + degrade_mix * 0.52f)));
      const float depth = character_enabled
          ? std::max(unit(fx.dynamics_character_depth), mode_active ? default_depth : 0.0f)
          : 0.0f;
      const float rate = character_enabled
          ? std::max(unit(fx.dynamics_character_rate), mode_active ? default_rate : 0.0f)
          : 0.0f;
      const float damp = character_enabled
          ? std::max(unit(fx.dynamics_character_damp), mode_active ? default_damp : 0.5f)
          : 0.5f;
      const float stereo = character_enabled ? unit(fx.dynamics_character_stereo) : 0.0f;
      const float lpg_response = mode_active
          ? unit(character_lpg_amount * (0.4f + env_follow * 0.6f))
          : unit(character_lpg_amount * (0.12f + env_follow * 0.4f));
      const float raw_wow = unit(base_degrade_wow * degrade_influence * (0.95f + contribution_cross_patch * 0.22f) + mod_wow * 0.2f);
      const float raw_flutter = unit(base_degrade_flutter * degrade_influence * (0.38f + contribution_cross_patch * 0.18f) + mod_flutter * 0.08f);
      const float raw_drift = base_degrade_drift * degrade_influence;
      const float water_cyclic_bias = clean_flavor > 0.0f ? 0.11f : (shallow_flavor > 0.0f ? 0.026f : 0.02f);
      const float water_sine_scale = clean_flavor > 0.0f ? 0.62f : (shallow_flavor > 0.0f ? 0.24f : 0.18f);
      const float mode_wow = depth * (water_cyclic_bias + contribution_sine_wow * water_sine_scale);
      const float mode_flutter = depth * (0.02f + contribution_flutter_jitter * 0.12f);
      const float flutter_damage =
          contribution_material_wear * 0.014f +
          contribution_alias_damage * (0.018f + contribution_cross_patch * 0.074f);
      const float cyclic_mode_scale = clean_flavor > 0.0f
          ? 1.0f
          : (shallow_flavor > 0.0f
                ? 0.34f + degrade_mix * 0.08f
                : (abyss_flavor > 0.0f ? 0.28f + degrade_mix * 0.07f : 0.56f + degrade_mix * 0.14f));
      const float cyclic_flutter_scale = clean_flavor > 0.0f
          ? 1.0f
          : (shallow_flavor > 0.0f
                ? 0.54f + degrade_mix * 0.1f
                : (abyss_flavor > 0.0f ? 0.42f + degrade_mix * 0.08f : 0.74f + degrade_mix * 0.12f));
      const float cyclic_wow = unit(raw_wow + mode_wow * cyclic_mode_scale);
      const float flutter = unit(raw_flutter + mode_flutter + flutter_damage);
      const float cyclic_flutter = unit(raw_flutter + mode_flutter * cyclic_flutter_scale);
      const float abyss_pitch_motion_trim = abyss_flavor > 0.0f ? 0.72f : 1.0f;
      const float drift = unit(
          raw_drift +
          depth * (0.06f + contribution_smooth_drift * 0.32f) +
          contribution_material_wear * 0.22f +
          contribution_cross_patch * 0.12f +
          mod_wow * 0.06f);
      const float tape_wander_depth = degrade_enabled
          ? raw_drift * 0.0021f + contribution_material_wear * 0.0011f + contribution_alias_damage * 0.00032f + mod_wow * 0.00085f
          : 0.0f;
      const float tape_flutter_depth = degrade_enabled
          ? raw_flutter * 0.00022f + contribution_material_wear * 0.00009f + contribution_alias_damage * 0.0001f + mod_flutter * 0.0002f
          : 0.0f;
      const float clean_tape_pitch_focus =
          clean_flavor * degrade_mix * unit(base_degrade_wow + base_degrade_drift * 0.15f + mod_wow * 0.45f);
      const float clean_tape_serial_weight = unit(clean_tape_pitch_focus * 3.2f);
      const float dry = base_dry * (1.0f - clean_tape_serial_weight);
      const float wet = unit(1.0f - dry);
      const float degrade_wet_ratio = wet > 0.0001f ? unit(degrade_mix / wet) : 0.0f;
      const float cyclic_wow_depth_scale = clean_flavor > 0.0f
          ? 0.012f + depth * 0.01f + rate * 0.005f + clean_tape_pitch_focus * 0.012f
          : 0.006f + depth * 0.0045f + rate * 0.0018f + shallow_flavor * 0.0015f + abyss_flavor * 0.001f + degrade_mix * 0.0012f;
      const float wow_depth_base = (cyclic_wow * cyclic_wow_depth_scale + tape_wander_depth) *
          (0.58f +
           depth * (1.45f + shallow_flavor * 0.36f + abyss_flavor * 0.28f + clean_flavor * 0.55f) +
           contribution_cross_patch * 0.4f +
           clean_tape_pitch_focus * 1.6f +
           rate * (0.14f + shallow_flavor * 0.18f + abyss_flavor * 0.12f + clean_flavor * 0.24f));
      const float wow_depth = wow_depth_base * (1.0f + base_degrade_wow) * abyss_pitch_motion_trim;
      const float flutter_depth = (cyclic_flutter * (0.00072f + clean_tape_pitch_focus * 0.00024f) + tape_flutter_depth) *
          (0.28f +
           depth * (0.52f + shallow_flavor * 0.18f + abyss_flavor * 0.12f + clean_flavor * 0.28f) +
           contribution_cross_patch * 0.48f +
           clean_tape_pitch_focus * 0.34f +
           rate * (0.05f + shallow_flavor * 0.09f + abyss_flavor * 0.06f + clean_flavor * 0.08f)) *
          abyss_pitch_motion_trim;
      const float corrosion = unit(raw_corrosion * degrade_influence * 0.72f + degrade_generation * 0.035f + shaped_alias * 0.025f);
      const bool shared_filter_active = character_enabled || degrade_enabled;
      const float shared_hp = shared_filter_active ? unit(fx.dynamics_degrade_hp) : 0.0f;
      const float shared_lp = shared_filter_active ? unit(fx.dynamics_degrade_lp) : 1.0f;
      const float hp = std::max(shared_hp, damage * 0.025f + corrosion * 0.012f);
      const float lp_ceiling = std::max(
          0.08f,
          1.0f -
              damage * 0.2f -
              corrosion * 0.1f -
              media_wear * degrade_mix * 0.08f -
              digital_damage * 0.05f -
              mod_lp * 0.08f);
      const float lp = std::max(0.08f, std::min(shared_lp, lp_ceiling));
      const float resonance = character_enabled
          ? std::max(unit(fx.dynamics_character_resonance), mode_active ? default_resonance : 0.2f)
          : 0.2f;
      const float damage_activity = degrade_enabled
          ? unit(raw_degrade_age + raw_degrade_generation + raw_degrade_alias + raw_corrosion + unit(fx.dynamics_degrade_noise) + unit(fx.dynamics_degrade_saturation))
          : 0.0f;
      const float noise = degrade_enabled
          ? unit(unit(fx.dynamics_degrade_noise) * degrade_influence * 0.55f + degrade_mix * (media_wear * 0.025f + digital_damage * 0.012f))
          : 0.0f;
      const float character_drive = character_enabled
          ? character_mix * (shallow_flavor * 0.07f + abyss_flavor * (0.06f + env_follow * 0.04f) + character_age * 0.06f)
          : 0.0f;
      const float degrade_nonlinear_color = degrade_enabled
          ? unit(degrade_generation * 0.015f + shaped_alias * 0.012f + corrosion * 0.018f)
          : 0.0f;
      const float saturation = unit(
          (degrade_enabled ? unit(fx.dynamics_degrade_saturation) * degrade_influence * 0.55f + degrade_nonlinear_color : 0.0f) +
          character_drive);
      const float tone = 0.5f + ((degrade_enabled ? unit(fx.dynamics_degrade_tone) : 0.5f) - 0.5f) * degrade_influence;
      const float dropout = damage_activity > 0.0001f
          ? unit(
                degrade_mix *
                    (media_wear * 0.25f +
                     corrosion * 0.28f +
                     degrade_generation * 0.06f +
                     noise * 0.08f +
                     raw_degrade_alias * 0.035f) +
                mod_dropout * 0.16f)
          : 0.0f;
      const float water_random_drive = clean_flavor * 0.06f + shallow_flavor * 0.28f + abyss_flavor * 0.34f;
      const float random_drift = unit(
          contribution_random_hold * (0.42f + stereo * 0.24f) +
          contribution_smooth_drift * 0.18f +
          env_follow * contribution_envelope_bloom * 0.12f +
          contribution_cross_patch * 0.16f +
          mod_flutter * 0.24f +
          water_random_drive);
      const float character_hold_rate_hz = shallow_flavor > 0.0f
          ? 0.16f + rate * 1.75f + depth * 0.4f
          : (abyss_flavor > 0.0f
                ? 0.1f + rate * 1.15f + depth * 0.26f + env_follow * 0.04f
                : 0.12f + rate * 1.05f + depth * 0.32f);
      const float degrade_motion_weight = degrade_enabled ? unit(degrade_wet_ratio * (0.65f + degrade_influence * 0.35f)) : 0.0f;
      const float degrade_hold_rate_hz =
          0.02f + degrade_wobble_speed * 0.58f + raw_drift * 0.11f + contribution_material_wear * 0.075f + contribution_alias_damage * 0.035f;
      const float random_hold_rate_hz =
          character_hold_rate_hz + (degrade_hold_rate_hz - character_hold_rate_hz) * degrade_motion_weight;
      const float character_hold_lag = shallow_flavor > 0.0f
          ? 0.08f + damp * 0.52f
          : (abyss_flavor > 0.0f ? 0.12f + damp * 0.68f : 0.1f + damp * 0.58f);
      const float degrade_hold_lag = std::max(
          0.18f,
          1.3f - degrade_wobble_speed * 0.98f + raw_media_wear * (0.2f + (1.0f - degrade_wobble_speed) * 0.16f));
      const float random_hold_lag =
          character_hold_lag + (degrade_hold_lag - character_hold_lag) * degrade_motion_weight;
      const float degrade_level_trim = degrade_enabled
          ? std::max(0.7f, 1.0f - degrade_wet_ratio * (0.12f + raw_media_wear * 0.12f + raw_corrosion * 0.16f + raw_degrade_alias * 0.1f))
          : 1.0f;
      const float clean_comb_tame =
          clean_flavor * unit(degrade_mix * (0.85f + contribution_material_wear * 0.35f + contribution_alias_damage * 0.18f));
      const float clean_base_delay = 0.00035f + age * 0.0012f + drift * 0.0006f;
      const float clean_tamed_base_delay = 0.00014f + age * 0.00045f + drift * 0.00024f;
      const float clean_tape_delay_headroom =
          clean_flavor * clean_tape_pitch_focus * std::min(0.085f, 0.009f + wow_depth * 1.2f + flutter_depth * 3.2f);
      const float base_delay = clean_flavor > 0.0f
          ? std::max(
                clean_base_delay + (clean_tamed_base_delay - clean_base_delay) * clean_comb_tame,
                clean_tape_delay_headroom)
          : 0.0025f + shallow_flavor * 0.0038f + abyss_flavor * 0.0012f + age * 0.009f + drift * 0.004f + contribution_bbd_color * 0.0018f;
      const float clean_spread_delay =
          std::min(0.012f, base_delay + stereo * (0.0012f + depth * 0.0012f) + drift * 0.0004f);
      const float clean_tamed_spread_delay =
          std::min(0.006f, base_delay + stereo * (0.00055f + depth * 0.00065f) + drift * 0.00016f);
      const float spread_base_delay = clean_flavor > 0.0f
          ? clean_spread_delay + (clean_tamed_spread_delay - clean_spread_delay) * clean_comb_tame
          : std::min(
                0.095f,
                base_delay + 0.0012f + stereo * (0.006f + shallow_flavor * 0.006f) + drift * 0.0015f);
      const float random_delay_depth = clean_flavor > 0.0f
          ? random_drift *
              (0.00008f +
               depth * 0.0018f +
               rate * 0.00065f +
               mod_flutter * 0.00018f +
               contribution_material_wear * 0.00024f +
               contribution_alias_damage * 0.00011f)
          : (shallow_flavor > 0.0f
                ? random_drift * (0.00095f + depth * 0.0104f + rate * 0.0009f + contribution_bbd_color * 0.0024f)
                : random_drift * (0.00032f + depth * 0.0042f + rate * 0.00072f + contribution_bbd_color * 0.0009f));
      const float random_spread_delay_depth =
          random_delay_depth * (0.68f + stereo * 0.56f + shallow_flavor * 0.3f + abyss_flavor * 0.22f);
      const float random_filter_depth = abyss_flavor > 0.0f
          ? random_drift * (20.0f + depth * 130.0f + rate * 34.0f) + mod_lp * 88.0f
          : (shallow_flavor > 0.0f
                ? random_drift * (56.0f + depth * 460.0f + rate * 62.0f) + mod_lp * 128.0f
                : random_drift * (18.0f + depth * 160.0f + rate * 48.0f) + mod_lp * 78.0f);
      const float random_spread_filter_depth = random_filter_depth * (0.55f + stereo * 0.32f);
      const float nyquist_safe_lp = static_cast<float>(sample_rate * 0.45);
      const float bias_floor_hz = clean_flavor > 0.0f
          ? unitToLogFrequency(character_bias, 500.0f, 12000.0f)
          : (shallow_flavor > 0.0f
                ? water_bias_floor(character_bias, 140.0f, 220.0f, 1800.0f)
                : water_bias_floor(character_bias, 130.0f, 205.0f, 1200.0f));
      const float lowpass_ceiling_hz = std::min({
          20000.0f,
          nyquist_safe_lp,
          unitToLogFrequency(lp, 1000.0f, 20000.0f) *
              (0.82f + tone * 0.38f) *
              (1.0f - contribution_bbd_color * 0.1f) *
              (1.0f - mod_lp * 0.05f)});
      const float lowpass_base_hz = std::min({
          20000.0f,
          nyquist_safe_lp,
          lowpass_ceiling_hz,
          bias_floor_hz * (0.9f + tone * 0.18f) * (1.0f - contribution_bbd_color * 0.05f)});
      const float lowpass_open_headroom_hz = std::max(0.0f, lowpass_ceiling_hz - lowpass_base_hz);
      const float lowpass_hz = std::min({20000.0f, nyquist_safe_lp, lowpass_base_hz});
      const float character_wow_frequency = clean_flavor > 0.0f
          ? 0.03f + rate * 0.48f + depth * 0.12f + drift * 0.1f
          : 0.052f + rate * 0.82f + depth * 0.16f + drift * 0.28f;
      const float degrade_wow_frequency = clean_flavor > 0.0f
          ? 0.012f + std::pow(degrade_wobble_speed, 1.35f) * 0.11f + drift * 0.035f + contribution_material_wear * 0.025f + mod_wow * 0.018f
          : 0.018f + degrade_wobble_speed * 0.36f + drift * 0.12f + contribution_material_wear * 0.05f + mod_wow * 0.04f;
      const float wow_frequency =
          character_wow_frequency + (degrade_wow_frequency - character_wow_frequency) * degrade_motion_weight;
      const bool master_sat_active = fx.dynamics_enabled && fx.dynamics_saturation_enabled;
      const float master_sat_drive = master_sat_active ? unit(fx.dynamics_saturation_drive) : 0.0f;
      const float end_wet = end_comp_enabled ? unit(fx.dynamics_end_comp_mix) : 0.0f;
      const bool worklet_active = wet > 0.0001f || master_sat_drive > 0.0001f || (end_comp_enabled && end_wet > 0.0001f);

      params[kDynActive] = worklet_active || legacy_master_saturation_enabled ? 1.0f : 0.0f;
      params[kDynAllpassActive] = 0.0f;
      params[kDynDry] = dry;
      params[kDynWet] = wet;
      params[kDynDegradeMix] = degrade_wet_ratio;
      params[kDynDegradeAlias] = worklet_alias;
      params[kDynDegradeGeneration] = raw_degrade_generation;
      params[kDynDegradeCorrosion] = raw_corrosion;
      params[kDynDegradeWear] = raw_media_wear;
      params[kDynNoiseGain] = std::min(0.018f, wet * noise * (0.006f + age * 0.014f + corrosion * 0.012f)) * degrade_level_trim;
      params[kDynJitterDepth] = damage_activity > 0.0001f
          ? degrade_mix *
              (contribution_flutter_jitter * 0.00008f +
               corrosion * 0.00006f +
               contribution_material_wear * 0.00005f +
               unit(contribution_alias_damage * 0.46f + contribution_cross_patch * 0.4f) * 0.00004f +
               mod_flutter * 0.00011f)
          : 0.0f;
      params[kDynRandomDriftFilterHz] = std::max(0.08f, random_hold_rate_hz * (0.92f - damp * 0.58f));
      params[kDynRandomDriftDepth] =
          random_drift *
          (0.00016f +
           drift * 0.00225f +
           contribution_material_wear * 0.00215f +
           contribution_alias_damage * 0.00075f +
           contribution_cross_patch * 0.00105f +
           mod_wow * 0.00095f) *
          abyss_pitch_motion_trim;
      params[kDynBaseDelay] = base_delay;
      params[kDynSpreadDelay] = spread_base_delay;
      params[kDynRandomDrift] = random_drift;
      params[kDynRandomHoldRateHz] = random_hold_rate_hz;
      params[kDynRandomHoldLag] = random_hold_lag;
      params[kDynRandomDelayDepth] = random_delay_depth;
      params[kDynRandomSpreadDelayDepth] = random_spread_delay_depth;
      params[kDynRandomFilterDepth] = random_filter_depth;
      params[kDynRandomSpreadFilterDepth] = random_spread_filter_depth;
      params[kDynDepth] = depth;
      params[kDynRate] = rate;
      params[kDynShallow] = shallow_flavor;
      params[kDynAbyss] = abyss_flavor;
      params[kDynStereo] = stereo;
      params[kDynDamage] = damage;
      params[kDynMainPan] = -stereo * (0.25f + shallow_flavor * 0.18f);
      params[kDynSpreadPan] = stereo * (0.58f + shallow_flavor * 0.24f);
      params[kDynMainDelayGain] =
          (1.0f - stereo * (0.14f + shallow_flavor * 0.12f)) * (1.0f - clean_comb_tame * 0.08f) * degrade_level_trim;
      params[kDynSpreadDelayGain] =
          stereo *
          (clean_flavor > 0.0f
               ? (0.05f + depth * 0.12f) * (1.0f - clean_comb_tame * 0.34f)
               : 0.16f + depth * (0.4f + shallow_flavor * 0.18f)) *
          degrade_level_trim;
      params[kDynWowFrequency] = wow_frequency;
      params[kDynFlutterFrequency] =
          2.4f + rate * (6.2f + shallow_flavor * 4.2f + abyss_flavor * 2.2f) + flutter * (4.6f + corrosion * 3.0f);
      params[kDynFlutterRandomDepth] =
          degrade_mix *
          unit(0.2f + mod_flutter * 1.8f + contribution_flutter_jitter * 0.5f + corrosion * 0.25f) *
          (0.00004f + flutter * 0.00082f + mod_flutter * 0.00048f);
      params[kDynWowDepth] = wow_depth;
      params[kDynFlutterDepth] = flutter_depth;
      params[kDynHighpassHz] = unitToLogFrequency(hp, 20.0f, 2400.0f);
      params[kDynHighpassQ] = 0.7f + resonance * 1.5f;
      params[kDynAllpassAFrequency] = 260.0f + shallow_flavor * 520.0f + depth * 380.0f + age * 240.0f;
      params[kDynAllpassAQ] =
          0.25f + contribution_bbd_color * 1.4f + shallow_flavor * 0.1f + resonance * (abyss_flavor > 0.0f ? 0.18f : 1.1f);
      params[kDynAllpassBFrequency] =
          900.0f + shallow_flavor * 2100.0f + depth * 680.0f + age * 420.0f + contribution_bbd_color * 320.0f;
      params[kDynAllpassBQ] =
          0.25f + contribution_bbd_color * 1.8f + shallow_flavor * 0.1f + resonance * (abyss_flavor > 0.0f ? 0.14f : 0.85f);
      params[kDynHeadBumpFrequency] = 80.0f + media_wear * 45.0f + corrosion * 20.0f;
      params[kDynHeadBumpQ] = 0.55f + media_wear * 0.55f;
      params[kDynHeadBumpGain] =
          degrade_mix * 1.1f * (0.2f + media_wear * 0.65f) * degrade_level_trim +
          character_mix * (abyss_flavor * 0.28f + shallow_flavor * 0.22f);
      params[kDynDropoutFilterHz] = 0.25f + media_wear * 1.8f + corrosion * 4.5f + digital_damage * 1.2f + mod_dropout * 2.2f;
      params[kDynDropoutDepth] = dropout * 0.16f;
      params[kDynDropoutGain] = 1.0f - dropout * 0.14f;
      params[kDynEnvFilterHz] = 2.5f + env_follow * 26.0f + rate * 12.0f;
      params[kDynEnvToLowpassGain] =
          contribution_envelope_bloom *
              lpg_response *
              lowpass_open_headroom_hz *
              (abyss_flavor > 0.0f
                   ? 0.88f + depth * 0.28f + resonance * 0.1f
                   : (shallow_flavor > 0.0f ? 0.76f + depth * 0.26f + resonance * 0.08f : 0.18f + depth * 0.12f)) +
          mod_lp * 120.0f;
      params[kDynEnvToResonanceGain] =
          contribution_envelope_bloom *
          lpg_response *
          (abyss_flavor > 0.0f ? 0.12f + resonance * 0.24f : (shallow_flavor > 0.0f ? 0.06f + resonance * 0.16f : 0.02f));
      params[kDynEnvToWetGain] =
          contribution_envelope_bloom *
              lpg_response *
              character_mix *
              (abyss_flavor > 0.0f ? 0.08f : (shallow_flavor > 0.0f ? 0.045f : 0.012f)) +
          mod_wet * degrade_mix * 0.03f;
      params[kDynLowpassHz] = lowpass_hz;
      params[kDynLowpassQ] =
          0.7f +
          resonance *
              (clean_flavor > 0.0f
                   ? 0.45f + contribution_cascaded_filter * 0.2f
                   : (abyss_flavor > 0.0f
                         ? 0.5f + contribution_cascaded_filter * 0.28f
                         : 0.9f + contribution_cascaded_filter * 0.42f));
      params[kDynLowpassStage2Hz] = mode_active ? std::min(20000.0f, nyquist_safe_lp) : lowpass_hz;
      params[kDynLowpassStage2Q] = mode_active ? 0.707f : 0.7f + resonance * 0.2f;
      params[kDynCompressorThreshold] = character_enabled
          ? -16.0f - character_mix * (shallow_flavor * 10.0f + abyss_flavor * 7.0f)
          : -4.0f;
      params[kDynCompressorKnee] = 10.0f + shallow_flavor * 10.0f + abyss_flavor * 8.0f;
      params[kDynCompressorRatio] = 1.2f + shallow_flavor * 0.8f + abyss_flavor * 0.9f + env_follow * abyss_flavor * 0.35f;
      params[kDynCompressorAttack] = 0.004f + shallow_flavor * 0.014f + abyss_flavor * 0.003f;
      params[kDynCompressorRelease] = 0.12f + shallow_flavor * 0.1f + abyss_flavor * 0.18f + damp * 0.08f;
      params[kDynCompressorMakeup] = 1.0f + character_mix * (shallow_flavor * 0.05f + abyss_flavor * 0.16f);
      params[kDynSaturation] = saturation;
      params[kDynCorrosion] = corrosion;
      params[kDynMasterSatActive] = (master_sat_drive > 0.0001f || legacy_master_saturation_enabled) ? 1.0f : 0.0f;
      params[kDynMasterSatMode] = static_cast<float>(
          legacy_master_saturation_enabled
              ? clampU32(master_saturation_mode, 0u, 4u)
              : (master_sat_active ? clampU32(fx.dynamics_saturation_mode, 0u, 4u) : 0u));
      params[kDynMasterSatDrive] = legacy_master_saturation_enabled ? legacy_master_saturation_drive : master_sat_drive;
      params[kDynMasterSatTone] = legacy_master_saturation_enabled
          ? clampFloat(master_saturation_tone, 0.0f, 1.0f)
          : (master_sat_active ? unit(fx.dynamics_saturation_tone) : 0.5f);
      params[kDynMasterSatBias] = legacy_master_saturation_enabled
          ? 0.5f
          : (master_sat_active ? unit(fx.dynamics_saturation_bias) : 0.5f);
      params[kDynEndCompActive] = end_comp_enabled && end_wet > 0.0001f ? 1.0f : 0.0f;
      params[kDynEndCompThreshold] = fx.dynamics_end_comp_threshold;
      params[kDynEndCompKnee] = std::max(0.0f, fx.dynamics_end_comp_knee);
      params[kDynEndCompRatio] = std::max(1.0f, fx.dynamics_end_comp_ratio);
      params[kDynEndCompAttack] = std::max(0.0001f, fx.dynamics_end_comp_attack_ms * 0.001f);
      params[kDynEndCompRelease] = std::max(0.02f, fx.dynamics_end_comp_release_ms * 0.001f);
      params[kDynEndCompMakeup] = end_comp_enabled ? clampFloat(fx.dynamics_end_comp_makeup, 0.05f, 8.0f) : 1.0f;
      params[kDynEndCompMix] = end_wet;
      params[kDynEndCompDetectorHpHz] = unitToLogFrequency(fx.dynamics_end_comp_detector_hp, 20.0f, 360.0f);
      params[kDynEndCompDetectorTilt] = unit(fx.dynamics_end_comp_detector_tilt);
      params[kDynEndCompAutoMakeup] = unit(fx.dynamics_end_comp_auto_makeup);
      params[kDynEndCompProgramRelease] = unit(fx.dynamics_end_comp_program_release);
      dynamics_character_module->commitParams();
    }
  }
}

  void KesshoProductEngine::renderFx(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  if (!modules_ready || frames == 0u) {
    return;
  }
  const bool granular_feeds_delay =
      routing.granular_to_delay_a > 0.0001f || routing.granular_to_delay_b > 0.0001f;
  const bool delay_feeds_granular =
      routing.delay_a_to_granular > 0.0001f || routing.delay_b_to_granular > 0.0001f;
  if (granular_feeds_delay && !delay_feeds_granular) {
    renderGranular(out_l, out_r, start, frames);
    renderDelayModule(delay_a_module.get(), delay_a_bus_l, delay_a_bus_r, delay_b_bus_l, delay_b_bus_r, out_l, out_r, start, frames);
    renderDelayModule(delay_b_module.get(), delay_b_bus_l, delay_b_bus_r, delay_a_bus_l, delay_a_bus_r, out_l, out_r, start, frames);
  } else {
    renderDelayModule(delay_a_module.get(), delay_a_bus_l, delay_a_bus_r, delay_b_bus_l, delay_b_bus_r, out_l, out_r, start, frames);
    renderDelayModule(delay_b_module.get(), delay_b_bus_l, delay_b_bus_r, delay_a_bus_l, delay_a_bus_r, out_l, out_r, start, frames);
    renderGranular(out_l, out_r, start, frames);
  }
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    delay_a_cross_carry_l[i] = graph_delay_b_to_delay_a_send_l[frame];
    delay_a_cross_carry_r[i] = graph_delay_b_to_delay_a_send_r[frame];
  }
  renderReverb(out_l, out_r, start, frames);
}
