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
      const float macro_drive = clampFloat(fx.dynamics_drive, 0.0f, 1.0f);
      const float legacy_master_saturation_drive = clampFloat(master_saturation_drive, 0.0f, 1.0f);
      const bool legacy_master_saturation_enabled =
          !fx.dynamics_enabled && legacy_master_saturation_drive > 0.0001f;
      const bool dynamics_enabled =
          fx.dynamics_enabled || macro_drive > 0.0001f || legacy_master_saturation_enabled;
      const bool character_enabled = dynamics_enabled && fx.dynamics_character_enabled;
      const bool degrade_enabled = dynamics_enabled && fx.dynamics_degrade_enabled;
      const bool saturation_enabled =
          (fx.dynamics_enabled && fx.dynamics_saturation_enabled) || legacy_master_saturation_enabled;
      const bool end_comp_enabled = dynamics_enabled && fx.dynamics_end_comp_enabled;
      const float character_mix = character_enabled ? clampFloat(fx.dynamics_character_mix, 0.0f, 1.0f) : 0.0f;
      const float degrade_mix = degrade_enabled ? clampFloat(fx.dynamics_degrade_mix, 0.0f, 1.0f) : 0.0f;
      const float mode_wet = clampFloat(1.0f - (1.0f - character_mix) * (1.0f - degrade_mix), 0.0f, 1.0f);
      const float wet = clampFloat(std::max(mode_wet, macro_drive), 0.0f, 1.0f);
      const float dry = clampFloat(1.0f - wet * 0.72f - macro_drive * 0.12f, 0.0f, 1.0f);
      const uint32_t character_mode = character_enabled ? clampU32(fx.dynamics_character_mode, 0u, 2u) : 0u;
      const float shallow = character_mode == 2u ? 1.0f : 0.0f;
      const float abyss = character_mode == 1u ? 1.0f : 0.0f;
      const float depth = character_enabled ? clampFloat(fx.dynamics_character_depth, 0.0f, 1.0f) : 0.0f;
      const float rate = character_enabled ? clampFloat(fx.dynamics_character_rate, 0.0f, 1.0f) : 0.0f;
      const float damp = character_enabled ? clampFloat(fx.dynamics_character_damp, 0.0f, 1.0f) : 0.5f;
      const float stereo = character_enabled ? clampFloat(fx.dynamics_character_stereo, 0.0f, 1.0f) : 0.0f;
      const float resonance = character_enabled ? clampFloat(fx.dynamics_character_resonance, 0.0f, 1.0f) : 0.2f;
      const float env_follow = character_enabled ? clampFloat(fx.dynamics_character_env_follow, 0.0f, 1.0f) : 0.0f;
      const float character_age = character_enabled ? clampFloat(fx.dynamics_character_age, 0.0f, 1.0f) : 0.0f;
      const float lpg_amount = character_enabled ? clampFloat(fx.dynamics_character_lpg_amount, 0.0f, 1.0f) : 0.0f;
      const float bias = character_enabled ? clampFloat(fx.dynamics_character_bias, 0.0f, 1.0f) : 0.5f;
      const float degrade_age = degrade_enabled ? clampFloat(fx.dynamics_degrade_age, 0.0f, 1.0f) : 0.0f;
      const float degrade_generation = degrade_enabled ? clampFloat(fx.dynamics_degrade_generation, 0.0f, 1.0f) : 0.0f;
      const float degrade_alias = degrade_enabled ? clampFloat(fx.dynamics_degrade_alias, 0.0f, 1.0f) : 0.0f;
      const float degrade_wow = degrade_enabled ? clampFloat(fx.dynamics_degrade_wow, 0.0f, 1.0f) : 0.0f;
      const float degrade_flutter = degrade_enabled ? clampFloat(fx.dynamics_degrade_flutter, 0.0f, 1.0f) : 0.0f;
      const float degrade_drift = degrade_enabled ? clampFloat(fx.dynamics_degrade_drift, 0.0f, 1.0f) : 0.0f;
      const float degrade_wobble_speed = degrade_enabled ? clampFloat(fx.dynamics_degrade_wobble_speed, 0.0f, 1.0f) : 0.35f;
      const float degrade_tone = degrade_enabled ? clampFloat(fx.dynamics_degrade_tone, 0.0f, 1.0f) : 0.5f;
      const float degrade_hp = degrade_enabled ? clampFloat(fx.dynamics_degrade_hp, 0.0f, 1.0f) : 0.0f;
      const float degrade_lp = degrade_enabled ? clampFloat(fx.dynamics_degrade_lp, 0.0f, 1.0f) : 1.0f;
      const float degrade_noise = degrade_enabled ? clampFloat(fx.dynamics_degrade_noise, 0.0f, 1.0f) : 0.0f;
      const float degrade_saturation = degrade_enabled ? clampFloat(fx.dynamics_degrade_saturation, 0.0f, 1.0f) : 0.0f;
      const float degrade_corrosion = degrade_enabled ? clampFloat(fx.dynamics_degrade_corrosion, 0.0f, 1.0f) : 0.0f;
      const float degrade_influence = std::sqrt(clampFloat(degrade_mix, 0.0f, 1.0f));
      float mod_sources[kDynamicsModSourceCount]{};
      if (degrade_enabled) {
        const float media_wear = clampFloat(degrade_age + degrade_generation * 0.42f, 0.0f, 1.0f);
        mod_sources[kDynamicsModSourceSlow] = degrade_influence * clampFloat(
            degrade_wow * 0.22f + degrade_drift * 0.34f + degrade_age * 0.2f + degrade_generation * 0.18f,
            0.0f,
            1.0f);
        mod_sources[kDynamicsModSourceFlutter] = degrade_influence * clampFloat(
            degrade_flutter * 0.55f + degrade_generation * 0.08f,
            0.0f,
            1.0f);
        mod_sources[kDynamicsModSourceRandom] = degrade_influence * clampFloat(
            degrade_drift * 0.3f + media_wear * 0.22f,
            0.0f,
            1.0f);
        mod_sources[kDynamicsModSourceEnv] = degrade_influence * env_follow;
        mod_sources[kDynamicsModSourceNoise] = degrade_influence * clampFloat(
            degrade_noise * 0.64f + degrade_corrosion * 0.18f + degrade_alias * 0.12f,
            0.0f,
            1.0f);
      }
      const float mod_wow = dynamicsModRoute(mod_sources, kDynamicsModTargetWow);
      const float mod_flutter = dynamicsModRoute(mod_sources, kDynamicsModTargetFlutter);
      const float mod_lp = dynamicsModRoute(mod_sources, kDynamicsModTargetLp);
      const float mod_wet = dynamicsModRoute(mod_sources, kDynamicsModTargetWet);
      const float mod_dropout = dynamicsModRoute(mod_sources, kDynamicsModTargetDropout);
      const float mod_alias = dynamicsModRoute(mod_sources, kDynamicsModTargetAlias);
      const float shaped_alias = clampFloat(degrade_alias + mod_alias * 0.18f, 0.0f, 1.0f);
      const float shaped_wow = clampFloat(degrade_wow + mod_wow * 0.2f, 0.0f, 1.0f);
      const float shaped_flutter = clampFloat(degrade_flutter + mod_flutter * 0.08f, 0.0f, 1.0f);
      const float wear = clampFloat(degrade_age + degrade_generation * 0.42f, 0.0f, 1.0f);
      const float damage = clampFloat(
          degrade_mix * (degrade_age * 0.32f + degrade_generation * 0.18f + shaped_alias * 0.08f + degrade_corrosion * 0.12f),
          0.0f,
          1.0f);
      const float corrosion = clampFloat(degrade_corrosion * degrade_mix * 0.72f + degrade_generation * 0.04f + shaped_alias * 0.025f + macro_drive * 0.08f, 0.0f, 1.0f);
      const float random_drift = clampFloat(degrade_drift * 0.52f + depth * (0.18f + shallow * 0.24f + abyss * 0.2f) + mod_flutter * 0.24f, 0.0f, 1.0f);
      const float hold_rate_hz = 0.08f + rate * 1.2f + degrade_wobble_speed * degrade_mix * 0.48f + mod_wow * 0.08f;
      const float hold_lag = 0.08f + damp * 0.54f + (1.0f - degrade_wobble_speed) * degrade_mix * 0.28f;
      const float lowpass_unit = std::max(0.08f, std::min(degrade_lp, 1.0f - damage * 0.2f - corrosion * 0.1f - mod_lp * 0.08f));
      const float lowpass_hz = unitToLogFrequency(lowpass_unit, 1000.0f, 20000.0f) * (0.82f + degrade_tone * 0.38f);
      const float highpass_hz = unitToLogFrequency(std::max(degrade_hp, damage * 0.025f), 20.0f, 2400.0f);
      const float bias_floor_hz = unitToLogFrequency(bias, 140.0f + 360.0f * (1.0f - abyss), 1200.0f + 10800.0f * (1.0f - abyss));
      const float lpg_open_hz = std::max(0.0f, lowpass_hz - std::min(lowpass_hz, bias_floor_hz));
      const float wow_frequency = 0.03f + rate * 0.64f + degrade_wobble_speed * shaped_wow * 0.18f + degrade_drift * 0.12f + mod_wow * 0.04f;
      const float flutter_frequency = 2.4f + rate * 6.2f + shaped_flutter * 4.6f + corrosion * 3.0f;
      const float wow_depth = (shaped_wow * 0.003f + depth * 0.002f + degrade_drift * 0.001f + mod_wow * 0.00085f) * (1.0f + macro_drive);
      const float flutter_depth = (shaped_flutter * 0.0008f + depth * 0.0003f + corrosion * 0.0004f + mod_flutter * 0.0002f) * (1.0f + macro_drive);
      const float saturation_drive = legacy_master_saturation_enabled
          ? legacy_master_saturation_drive
          : (saturation_enabled ? clampFloat(fx.dynamics_saturation_drive, 0.0f, 1.0f) : macro_drive * 0.35f);
      const float end_comp_mix = end_comp_enabled
          ? clampFloat(fx.dynamics_end_comp_mix, 0.0f, 1.0f)
          : (macro_drive > 0.55f ? macro_drive : 0.0f);

      params[kDynActive] = dynamics_enabled && (wet > 0.0001f || saturation_drive > 0.0001f || end_comp_mix > 0.0001f) ? 1.0f : 0.0f;
      params[kDynAllpassActive] = 0.0f;
      params[kDynDry] = dry;
      params[kDynWet] = wet;
      params[kDynDegradeMix] = degrade_mix;
      params[kDynDegradeAlias] = shaped_alias;
      params[kDynDegradeGeneration] = degrade_generation;
      params[kDynDegradeCorrosion] = degrade_corrosion;
      params[kDynDegradeWear] = wear;
      params[kDynNoiseGain] = std::min(0.018f, wet * degrade_noise * (0.006f + wear * 0.014f + corrosion * 0.012f));
      params[kDynJitterDepth] = degrade_mix * (shaped_flutter * 0.00008f + corrosion * 0.00006f + shaped_alias * 0.00004f + mod_flutter * 0.00011f);
      params[kDynRandomDriftFilterHz] = std::max(0.08f, hold_rate_hz * (0.92f - damp * 0.58f));
      params[kDynRandomDriftDepth] = random_drift * (0.00016f + degrade_drift * 0.00225f + wear * 0.0015f);
      params[kDynBaseDelay] = 0.0003f + character_age * 0.0012f + degrade_drift * 0.004f;
      params[kDynSpreadDelay] = 0.0006f + stereo * 0.004f + character_age * 0.002f + degrade_drift * 0.006f;
      params[kDynRandomDrift] = random_drift;
      params[kDynRandomHoldRateHz] = hold_rate_hz;
      params[kDynRandomHoldLag] = hold_lag;
      params[kDynRandomDelayDepth] = random_drift * (0.00008f + depth * 0.004f + shaped_wow * 0.0008f);
      params[kDynRandomSpreadDelayDepth] = params[kDynRandomDelayDepth] * (0.68f + stereo * 0.56f);
      params[kDynRandomFilterDepth] = random_drift * (18.0f + depth * 220.0f + shaped_wow * 80.0f + mod_lp * 120.0f);
      params[kDynRandomSpreadFilterDepth] = params[kDynRandomFilterDepth] * (0.55f + stereo * 0.32f);
      params[kDynDepth] = depth;
      params[kDynRate] = rate;
      params[kDynShallow] = shallow;
      params[kDynAbyss] = abyss;
      params[kDynStereo] = stereo;
      params[kDynDamage] = damage;
      params[kDynMainPan] = -stereo * (0.25f + shallow * 0.18f);
      params[kDynSpreadPan] = stereo * (0.58f + shallow * 0.24f);
      params[kDynMainDelayGain] = 1.0f - stereo * 0.14f;
      params[kDynSpreadDelayGain] = stereo * (0.05f + depth * (0.12f + shallow * 0.28f + abyss * 0.12f));
      params[kDynWowFrequency] = wow_frequency;
      params[kDynFlutterFrequency] = flutter_frequency;
      params[kDynFlutterRandomDepth] = degrade_mix * shaped_flutter * (0.00004f + flutter_depth * 0.4f + mod_flutter * 0.00048f);
      params[kDynWowDepth] = wow_depth;
      params[kDynFlutterDepth] = flutter_depth;
      params[kDynHighpassHz] = highpass_hz;
      params[kDynHighpassQ] = 0.7f + resonance * 1.5f;
      params[kDynAllpassAFrequency] = 260.0f + shallow * 520.0f + depth * 380.0f + character_age * 240.0f;
      params[kDynAllpassAQ] = 0.25f + resonance * (abyss > 0.0f ? 0.18f : 1.1f);
      params[kDynAllpassBFrequency] = 900.0f + shallow * 2100.0f + depth * 680.0f + character_age * 420.0f;
      params[kDynAllpassBQ] = 0.25f + resonance * (abyss > 0.0f ? 0.14f : 0.85f);
      params[kDynHeadBumpFrequency] = 80.0f + wear * 45.0f + corrosion * 20.0f;
      params[kDynHeadBumpQ] = 0.55f + wear * 0.55f;
      params[kDynHeadBumpGain] = degrade_mix * 1.1f * (0.2f + wear * 0.65f) + character_mix * (abyss * 0.28f + shallow * 0.22f);
      params[kDynDropoutFilterHz] = 0.25f + wear * 1.8f + corrosion * 4.5f + degrade_generation * 1.2f + mod_dropout * 2.2f;
      params[kDynDropoutDepth] = clampFloat(damage + mod_dropout, 0.0f, 1.0f) * 0.16f;
      params[kDynDropoutGain] = 1.0f - clampFloat(damage + mod_dropout, 0.0f, 1.0f) * 0.14f;
      params[kDynEnvFilterHz] = 2.5f + env_follow * 26.0f + rate * 12.0f;
      params[kDynEnvToLowpassGain] = env_follow * lpg_amount * lpg_open_hz * (0.18f + shallow * 0.58f + abyss * 0.7f) + mod_lp * 120.0f;
      params[kDynEnvToResonanceGain] = env_follow * lpg_amount * (0.02f + resonance * (0.08f + abyss * 0.16f));
      params[kDynEnvToWetGain] = env_follow * lpg_amount * character_mix * (0.012f + shallow * 0.033f + abyss * 0.068f) + mod_wet * degrade_mix * 0.03f;
      params[kDynLowpassHz] = lowpass_hz;
      params[kDynLowpassQ] = 0.7f + resonance * (0.45f + shallow * 0.45f + abyss * 0.15f);
      params[kDynLowpassStage2Hz] = character_mode == 0u ? lowpass_hz : 20000.0f;
      params[kDynLowpassStage2Q] = character_mode == 0u ? 0.7f + resonance * 0.2f : 0.707f;
      params[kDynCompressorThreshold] = character_enabled ? -16.0f - character_mix * (shallow * 10.0f + abyss * 7.0f) : -4.0f;
      params[kDynCompressorKnee] = 10.0f + shallow * 10.0f + abyss * 8.0f;
      params[kDynCompressorRatio] = 1.2f + shallow * 0.8f + abyss * 0.9f + env_follow * abyss * 0.35f;
      params[kDynCompressorAttack] = 0.004f + shallow * 0.014f + abyss * 0.003f;
      params[kDynCompressorRelease] = 0.12f + shallow * 0.1f + abyss * 0.18f + damp * 0.08f;
      params[kDynCompressorMakeup] = 1.0f + character_mix * (shallow * 0.05f + abyss * 0.16f);
      params[kDynSaturation] = clampFloat(degrade_saturation * degrade_mix * 0.55f + character_mix * character_age * 0.06f + macro_drive * 0.25f, 0.0f, 1.0f);
      params[kDynCorrosion] = corrosion;
      params[kDynMasterSatActive] = saturation_drive > 0.0001f ? 1.0f : 0.0f;
      params[kDynMasterSatMode] = static_cast<float>(
          legacy_master_saturation_enabled
              ? clampU32(master_saturation_mode, 0u, 4u)
              : (saturation_enabled ? clampU32(fx.dynamics_saturation_mode, 0u, 4u) : 0u));
      params[kDynMasterSatDrive] = saturation_drive;
      params[kDynMasterSatTone] = legacy_master_saturation_enabled
          ? clampFloat(master_saturation_tone, 0.0f, 1.0f)
          : (saturation_enabled ? clampFloat(fx.dynamics_saturation_tone, 0.0f, 1.0f) : 0.5f);
      params[kDynMasterSatBias] = legacy_master_saturation_enabled
          ? 0.5f
          : (saturation_enabled ? clampFloat(fx.dynamics_saturation_bias, 0.0f, 1.0f) : 0.5f);
      params[kDynEndCompActive] = end_comp_mix > 0.0001f ? 1.0f : 0.0f;
      params[kDynEndCompThreshold] = end_comp_enabled ? clampFloat(fx.dynamics_end_comp_threshold, -60.0f, 0.0f) : -18.0f;
      params[kDynEndCompKnee] = end_comp_enabled ? clampFloat(fx.dynamics_end_comp_knee, 0.0f, 40.0f) : 6.0f;
      params[kDynEndCompRatio] = end_comp_enabled ? clampFloat(fx.dynamics_end_comp_ratio, 1.0f, 20.0f) : 2.0f + macro_drive * 2.0f;
      params[kDynEndCompAttack] = end_comp_enabled ? clampFloat(fx.dynamics_end_comp_attack_ms, 0.1f, 100.0f) * 0.001f : 0.01f;
      params[kDynEndCompRelease] = end_comp_enabled ? clampFloat(fx.dynamics_end_comp_release_ms, 20.0f, 1500.0f) * 0.001f : 0.12f;
      params[kDynEndCompMakeup] = end_comp_enabled ? clampFloat(fx.dynamics_end_comp_makeup, 0.25f, 4.0f) : 1.0f;
      params[kDynEndCompMix] = end_comp_mix;
      params[kDynEndCompDetectorHpHz] = unitToLogFrequency(
          end_comp_enabled ? fx.dynamics_end_comp_detector_hp : 0.25f,
          20.0f,
          360.0f);
      params[kDynEndCompDetectorTilt] = end_comp_enabled ? clampFloat(fx.dynamics_end_comp_detector_tilt, 0.0f, 1.0f) : 0.5f;
      params[kDynEndCompAutoMakeup] = end_comp_enabled ? clampFloat(fx.dynamics_end_comp_auto_makeup, 0.0f, 1.0f) : 0.0f;
      params[kDynEndCompProgramRelease] = end_comp_enabled ? clampFloat(fx.dynamics_end_comp_program_release, 0.0f, 1.0f) : 0.25f;
      dynamics_character_module->commitParams();
    }
  }
}

  void KesshoProductEngine::resetSidechainRuntime() {
  for (uint32_t target = 0; target < kSidechainTargetCount; ++target) {
    sidechain_envelopes[target] = {};
    sidechain_envelopes[target].current_gain = 1.0f;
    sidechain_envelopes[target].start_gain = 1.0f;
    sidechain_envelopes[target].target_gain = 1.0f;
    for (uint32_t frame = 0; frame < kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES; ++frame) {
      sidechain_gains[target][frame] = 1.0f;
    }
  }
}

  float KesshoProductEngine::sidechainTargetAmount(uint32_t target) const {
  if (!fx.sidechain_enabled || target >= kSidechainTargetCount) {
    return 0.0f;
  }
  const float raw = clampFloat(fx.sidechain_targets[target], 0.0f, 1.0f) *
      clampFloat(fx.sidechain_amount, 0.0f, 1.0f) *
      clampFloat(fx.sidechain_mix, 0.0f, 1.0f);
  return clampFloat(1.0f - (1.0f - raw) * (1.0f - raw), 0.0f, 1.0f);
}

  uint32_t KesshoProductEngine::sidechainTargetForSource(uint32_t source_id) const {
  switch (source_id) {
    case KESSHO_PRODUCT_SOURCE_PAD1:
      return kSidechainPad1;
    case KESSHO_PRODUCT_SOURCE_PAD2:
      return kSidechainPad2;
    case KESSHO_PRODUCT_SOURCE_LEAD1:
      return kSidechainLead1;
    case KESSHO_PRODUCT_SOURCE_LEAD2:
      return kSidechainLead2;
    case KESSHO_PRODUCT_SOURCE_PIANO:
      return kSidechainPiano;
    default:
      return kSidechainTargetCount;
  }
}

  float KesshoProductEngine::sidechainGain(uint32_t target, uint32_t frame) const {
  if (!fx.sidechain_enabled || target >= kSidechainTargetCount ||
      frame >= kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES) {
    return 1.0f;
  }
  return sidechain_gains[target][frame];
}

  void KesshoProductEngine::triggerSidechainDuck(uint32_t drum_voice, float velocity) {
  if (!fx.sidechain_enabled) {
    return;
  }
  const uint32_t key_id = clampU32(drum_voice + 1u, kSidechainKeySub, kSidechainKeyMembrane);
  const float weight =
      (key_id == fx.sidechain_key_a ? clampFloat(fx.sidechain_key_a_weight, 0.0f, 1.0f) : 0.0f) +
      (key_id == fx.sidechain_key_b ? clampFloat(fx.sidechain_key_b_weight, 0.0f, 1.0f) : 0.0f);
  if (weight <= 0.0001f) {
    return;
  }

  const float curve = 0.65f + clampFloat(fx.sidechain_curve, 0.0f, 1.0f) * 0.7f;
  const float trigger_strength = std::pow(clampFloat(velocity * weight, 0.0f, 1.0f), curve);
  const float detector_db = 20.0f * std::log10(std::max(0.0001f, trigger_strength));
  const float threshold_db = clampFloat(fx.sidechain_threshold, -60.0f, 0.0f);
  const float ratio = clampFloat(fx.sidechain_ratio, 1.0f, 20.0f);
  const float knee = clampFloat(fx.sidechain_knee, 0.0f, 40.0f);
  const float over_db = detector_db - threshold_db;
  const float knee_over_db =
      knee > 0.0f && over_db > -knee && over_db < knee
          ? ((over_db + knee) * (over_db + knee)) / (4.0f * knee)
          : std::max(0.0f, over_db);
  const float gain_reduction_db = knee_over_db * (1.0f - 1.0f / ratio);
  const float duck_factor = std::max(0.005f, std::pow(10.0f, -gain_reduction_db / 20.0f));
  const float makeup = clampFloat(fx.sidechain_makeup, 0.25f, 4.0f);
  const uint32_t attack_frames = std::max<uint32_t>(1u, static_cast<uint32_t>(clampFloat(fx.sidechain_attack_ms, 0.1f, 100.0f) * 0.001f * sample_rate));
  const uint32_t hold_frames = static_cast<uint32_t>(clampFloat(fx.sidechain_hold_ms, 0.0f, 250.0f) * 0.001f * sample_rate);
  const uint32_t release_frames = std::max<uint32_t>(1u, static_cast<uint32_t>(clampFloat(fx.sidechain_release_ms, 20.0f, 1500.0f) * 0.001f * sample_rate));

  for (uint32_t target = 0; target < kSidechainTargetCount; ++target) {
    const float amount = sidechainTargetAmount(target);
    if (amount <= 0.0001f) {
      continue;
    }
    const float ducked_wet_gain = std::min(amount * 1.2f, amount * duck_factor * makeup);
    const float computed_gain = clampFloat((1.0f - amount) + ducked_wet_gain, 0.0f, 1.0f);
    SidechainEnvelope& envelope = sidechain_envelopes[target];
    envelope.start_gain = envelope.current_gain;
    envelope.target_gain = std::min(envelope.current_gain, computed_gain);
    envelope.attack_elapsed = 0u;
    envelope.attack_frames = attack_frames;
    envelope.hold_remaining = hold_frames;
    envelope.release_elapsed = 0u;
    envelope.release_frames = release_frames;
  }
}

  float KesshoProductEngine::advanceSidechainEnvelope(SidechainEnvelope& envelope) {
  if (envelope.attack_elapsed < envelope.attack_frames) {
    ++envelope.attack_elapsed;
    const float t = static_cast<float>(envelope.attack_elapsed) / static_cast<float>(std::max(1u, envelope.attack_frames));
    const float shaped = 1.0f - (1.0f - t) * (1.0f - t);
    envelope.current_gain = envelope.start_gain + (envelope.target_gain - envelope.start_gain) * shaped;
    return envelope.current_gain;
  }
  if (envelope.hold_remaining > 0u) {
    --envelope.hold_remaining;
    envelope.current_gain = envelope.target_gain;
    return envelope.current_gain;
  }
  if (envelope.release_elapsed < envelope.release_frames) {
    ++envelope.release_elapsed;
    const float t = static_cast<float>(envelope.release_elapsed) / static_cast<float>(std::max(1u, envelope.release_frames));
    const float shaped = 1.0f - (1.0f - t) * (1.0f - t);
    envelope.current_gain = envelope.target_gain + (1.0f - envelope.target_gain) * shaped;
    return envelope.current_gain;
  }
  envelope.current_gain = 1.0f;
  envelope.start_gain = 1.0f;
  envelope.target_gain = 1.0f;
  return envelope.current_gain;
}

  void KesshoProductEngine::renderSidechainGains(uint32_t start, uint32_t frames) {
  if (start + frames > kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES) {
    return;
  }
  if (!fx.sidechain_enabled) {
    for (uint32_t target = 0; target < kSidechainTargetCount; ++target) {
      sidechain_envelopes[target].current_gain = 1.0f;
      sidechain_envelopes[target].target_gain = 1.0f;
      for (uint32_t i = 0; i < frames; ++i) {
        sidechain_gains[target][start + i] = 1.0f;
      }
    }
    return;
  }
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    for (uint32_t target = 0; target < kSidechainTargetCount; ++target) {
      sidechain_gains[target][frame] = advanceSidechainEnvelope(sidechain_envelopes[target]);
    }
  }
}

  void KesshoProductEngine::mixFxBuffer(
      const float* in_l,
      const float* in_r,
      float* out_l,
      float* out_r,
      uint32_t start,
      uint32_t frames,
      float gain,
      uint32_t sidechain_target) {
  if (gain <= 0.0f) {
    return;
  }
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    const float duck_gain = sidechainGain(sidechain_target, frame);
    const float left = in_l[i] * gain * duck_gain;
    const float right = in_r[i] * gain * duck_gain;
    out_l[frame] += left;
    out_r[frame] += right;
    stem_l[KESSHO_PRODUCT_STEM_FX][frame] += left;
    stem_r[KESSHO_PRODUCT_STEM_FX][frame] += right;
  }
}

  float KesshoProductEngine::reverbPreCompressorGainDbForLevel(float level_db) const {
  const float threshold = clampFloat(fx.reverb_pre_comp_threshold, -60.0f, 0.0f);
  const float knee = clampFloat(fx.reverb_pre_comp_knee, 0.0f, 40.0f);
  const float ratio = clampFloat(fx.reverb_pre_comp_ratio, 1.0f, 20.0f);
  if (ratio <= 1.0f) {
    return 0.0f;
  }
  constexpr float strength = 0.04f;
  if (knee <= 0.0f) {
    if (level_db <= threshold) {
      return 0.0f;
    }
    return ((threshold + (level_db - threshold) / ratio) - level_db) * strength;
  }

  const float lower = threshold - knee * 0.5f;
  const float upper = threshold + knee * 0.5f;
  if (level_db <= lower) {
    return 0.0f;
  }
  if (level_db >= upper) {
    return ((threshold + (level_db - threshold) / ratio) - level_db) * strength;
  }

  const float x = level_db - lower;
  return ((1.0f / ratio) - 1.0f) * x * x / (2.0f * knee) * strength;
}

  float KesshoProductEngine::reverbPreconditionerSoftLimit(float value) const {
  constexpr float limit = 1.047f;
  const float abs_value = std::abs(value);
  if (abs_value <= limit) {
    return value;
  }
  return std::copysign(limit + std::tanh((abs_value - limit) * 6.0f) * 0.005f, value);
}

  void KesshoProductEngine::processReverbPreconditioner(uint32_t start, uint32_t frames) {
  if (frames == 0u || sample_rate <= 0.0) {
    return;
  }
  const float attack_ms = clampFloat(fx.reverb_pre_comp_attack_ms, 0.1f, 30.0f);
  const float release_ms = clampFloat(fx.reverb_pre_comp_release_ms, 20.0f, 1000.0f);
  const float attack_coeff = std::exp(-1.0f / std::max(1.0f, attack_ms * 0.001f * static_cast<float>(sample_rate)));
  const float release_coeff = std::exp(-1.0f / std::max(1.0f, release_ms * 0.001f * static_cast<float>(sample_rate)));
  const float ratio = clampFloat(fx.reverb_pre_comp_ratio, 1.0f, 20.0f);
  const float ratio_depth = clampFloat((ratio - 1.0f) / 4.0f, 0.0f, 1.0f);
  const float native_auto_makeup = 1.0f + ratio_depth * 0.18f;
  const float input_makeup = clampFloat(fx.reverb_pre_comp_makeup, 0.5f, 4.0f);

  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    const float left = reverb_bus_l[frame];
    const float right = reverb_bus_r[frame];
    const float detector = std::max(std::max(std::abs(left), std::abs(right)), 1.0e-9f);
    const float level_db = 20.0f * std::log10(detector);
    const float target_gain = std::pow(10.0f, reverbPreCompressorGainDbForLevel(level_db) / 20.0f);
    const float coeff = target_gain < reverb_pre_comp_gain ? attack_coeff : release_coeff;
    reverb_pre_comp_gain = target_gain + (reverb_pre_comp_gain - target_gain) * coeff;
    const float gain = reverb_pre_comp_gain * native_auto_makeup * input_makeup;
    reverb_bus_l[frame] = reverbPreconditionerSoftLimit(left * gain);
    reverb_bus_r[frame] = reverbPreconditionerSoftLimit(right * gain);
  }
}

  void KesshoProductEngine::renderDelayModule(
      kessho::core::IKesshoModule* module,
      float* input_l,
      float* input_r,
      float* cross_l,
      float* cross_r,
      float* out_l,
      float* out_r,
      uint32_t start,
      uint32_t frames) {
  if (module == nullptr || frames == 0u) {
    return;
  }
  float* tap_l[kModuleTapCount]{};
  float* tap_r[kModuleTapCount]{};
  for (uint32_t bus = 0; bus < kModuleTapCount; ++bus) {
    tap_l[bus] = module_tap_l[bus];
    tap_r[bus] = module_tap_r[bus];
    std::fill(module_tap_l[bus], module_tap_l[bus] + frames, 0.0f);
    std::fill(module_tap_r[bus], module_tap_r[bus] + frames, 0.0f);
  }
  module->processPlanarStereoTaps(input_l + start, input_r + start, tap_l, tap_r, KESSHO_MODULE_DELAY_A_OUTPUT_TAP_COUNT, static_cast<int>(frames));
  mixFxBuffer(
      module_tap_l[KESSHO_MODULE_DELAY_A_TAP_MAIN],
      module_tap_r[KESSHO_MODULE_DELAY_A_TAP_MAIN],
      out_l,
      out_r,
      start,
      frames,
      1.0f,
      module == delay_a_module.get() ? kSidechainDelayA : kSidechainDelayB);
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    reverb_bus_l[frame] += module_tap_l[KESSHO_MODULE_DELAY_A_TAP_REVERB_SEND][i];
    reverb_bus_r[frame] += module_tap_r[KESSHO_MODULE_DELAY_A_TAP_REVERB_SEND][i];
    cross_l[frame] += module_tap_l[KESSHO_MODULE_DELAY_A_TAP_DELAY_B_SEND][i];
    cross_r[frame] += module_tap_r[KESSHO_MODULE_DELAY_A_TAP_DELAY_B_SEND][i];
    granular_bus_l[frame] += module_tap_l[KESSHO_MODULE_DELAY_A_TAP_GRANULAR_SEND][i];
    granular_bus_r[frame] += module_tap_r[KESSHO_MODULE_DELAY_A_TAP_GRANULAR_SEND][i];
  }
}

  void KesshoProductEngine::renderGranular(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  const bool active =
      fx.granular_enabled &&
      (fx.granular_mix > 0.0001f || routing.granular_to_reverb > 0.0001f);
  if (granular_module == nullptr || frames == 0u || !active) {
    return;
  }
  std::fill(module_l, module_l + frames, 0.0f);
  std::fill(module_r, module_r + frames, 0.0f);
  granular_module->processPlanarStereo(granular_bus_l + start, granular_bus_r + start, module_l, module_r, static_cast<int>(frames));
  mixFxBuffer(module_l, module_r, out_l, out_r, start, frames, fx.granular_mix, kSidechainGranular);
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    reverb_bus_l[frame] += module_l[i] * routing.granular_to_reverb;
    reverb_bus_r[frame] += module_r[i] * routing.granular_to_reverb;
  }
}

  void KesshoProductEngine::renderReverb(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  if (reverb_module == nullptr || frames == 0u || fx.reverb_mix <= 0.0f) {
    return;
  }
  std::fill(module_l, module_l + frames, 0.0f);
  std::fill(module_r, module_r + frames, 0.0f);
  processReverbPreconditioner(start, frames);
  reverb_module->processPlanarStereo(reverb_bus_l + start, reverb_bus_r + start, module_l, module_r, static_cast<int>(frames));
  mixFxBuffer(
      module_l,
      module_r,
      out_l,
      out_r,
      start,
      frames,
      fx.reverb_mix * kessho::product::generated::KESSHO_PRODUCT_GENERATED_REVERB_OUTPUT_TRIM,
      kSidechainReverb);
}

  void KesshoProductEngine::renderFx(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  if (!modules_ready || frames == 0u) {
    return;
  }
  renderDelayModule(delay_a_module.get(), delay_a_bus_l, delay_a_bus_r, delay_b_bus_l, delay_b_bus_r, out_l, out_r, start, frames);
  renderDelayModule(delay_b_module.get(), delay_b_bus_l, delay_b_bus_r, delay_a_bus_l, delay_a_bus_r, out_l, out_r, start, frames);
  renderGranular(out_l, out_r, start, frames);
  renderReverb(out_l, out_r, start, frames);
}

  void KesshoProductEngine::renderSpectralFreeze(float* out_l, float* out_r, uint32_t frames) {
  if (spectral_freeze_module == nullptr || frames == 0u || !fx.spectral_freeze_enabled || fx.spectral_freeze_mix <= 0.0f) {
    return;
  }
  std::fill(module_l, module_l + frames, 0.0f);
  std::fill(module_r, module_r + frames, 0.0f);
  spectral_freeze_module->processPlanarStereo(out_l, out_r, module_l, module_r, static_cast<int>(frames));
  const float mix = clampFloat(fx.spectral_freeze_mix, 0.0f, 1.0f);
  for (uint32_t i = 0; i < frames; ++i) {
    const float wet_l = module_l[i] * mix;
    const float wet_r = module_r[i] * mix;
    out_l[i] = out_l[i] * (1.0f - mix) + wet_l;
    out_r[i] = out_r[i] * (1.0f - mix) + wet_r;
    stem_l[KESSHO_PRODUCT_STEM_FX][i] += wet_l;
    stem_r[KESSHO_PRODUCT_STEM_FX][i] += wet_r;
  }
}

  void KesshoProductEngine::renderDynamics(float* out_l, float* out_r, uint32_t frames) {
  const bool dynamics_active =
      fx.dynamics_drive > 0.0001f ||
      (!fx.dynamics_enabled && master_saturation_drive > 0.0001f) ||
      (
          fx.dynamics_enabled &&
          ((fx.dynamics_character_enabled && fx.dynamics_character_mix > 0.0001f) ||
           (fx.dynamics_degrade_enabled && fx.dynamics_degrade_mix > 0.0001f) ||
           (fx.dynamics_saturation_enabled && fx.dynamics_saturation_drive > 0.0001f) ||
           (fx.dynamics_end_comp_enabled && fx.dynamics_end_comp_mix > 0.0001f)));
  if (dynamics_character_module == nullptr || frames == 0u || !dynamics_active) {
    return;
  }
  std::fill(module_l, module_l + frames, 0.0f);
  std::fill(module_r, module_r + frames, 0.0f);
  dynamics_character_module->processPlanarStereo(out_l, out_r, module_l, module_r, static_cast<int>(frames));
  for (uint32_t i = 0; i < frames; ++i) {
    out_l[i] = module_l[i];
    out_r[i] = module_r[i];
  }
}
