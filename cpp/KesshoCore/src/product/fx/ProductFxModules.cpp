#include "../KesshoProductEngineInternal.h"

void KesshoProductEngine::configureReverbModule() {
  if (!reverb_module) {
    return;
  }
  float* params = reverb_module->params();
  if (params == nullptr || reverb_module->paramCount() < 31) {
    return;
  }
  const float effective_decay =
      clampFloat(fx.reverb_decay + clampFloat(reverb_bloom_boost, 0.0f, 1.0f) * 0.12f, 0.0f, 1.0f);
  const float effective_shimmer =
      clampFloat(
          fx.reverb_shimmer_amount +
              clampFloat(reverb_wash_boost, 0.0f, 1.0f) * 0.15f +
              clampFloat(reverb_bloom_boost, 0.0f, 1.0f) * 0.1f,
          0.0f,
          1.0f);
  params[0] = static_cast<float>(clampU32(fx.reverb_type, 0u, 5u));
  params[1] = static_cast<float>(clampU32(fx.reverb_quality, 0u, 2u));
  params[2] = effective_decay;
  params[3] = clampFloat(fx.reverb_size, 0.5f, 10.0f);
  params[4] = clampFloat(fx.reverb_damping, 0.0f, 1.0f);
  params[5] = clampFloat(fx.reverb_diffusion, 0.0f, 1.0f);
  params[6] = clampFloat(fx.reverb_modulation, 0.0f, 1.0f);
  params[7] = clampFloat(fx.reverb_predelay_ms, 0.0f, 100.0f);
  params[8] = clampFloat(fx.reverb_width, 0.0f, 1.0f);
  params[9] = effective_shimmer;
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
  params[30] = clampFloat(
      fx.reverb_bloom + clampFloat(reverb_bloom_boost, 0.0f, 1.0f) * 0.18f,
      -1.0f,
      1.0f);
  reverb_module->commitParams();
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
    if (params != nullptr && delay_b_module->paramCount() >= 24) {
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
      params[10] = static_cast<float>(clampU32(fx.delay_b_space_mode, 0u, 2u));
      params[11] = static_cast<float>(clampU32(fx.delay_b_pattern, 0u, 3u));
      params[12] = static_cast<float>(clampU32(fx.delay_b_warp, 0u, 3u));
      params[13] = clampFloat(fx.delay_b_warp_intensity, 0.0f, 1.0f);
      params[14] = clampFloat(fx.delay_b_spread, 0.0f, 1.0f);
      params[15] = static_cast<float>(clampU32(fx.delay_b_tape_head_mask, 0u, 15u));
      for (size_t index = 0; index < fx.delay_b_tape_head_levels.size(); ++index) {
        params[16 + index] = clampFloat(fx.delay_b_tape_head_levels[index], 0.0f, 1.0f);
        params[20 + index] = clampFloat(fx.delay_b_tape_head_pans[index], 0.0f, 1.0f);
      }
      delay_b_module->commitParams();
    }
  }
  configureReverbModule();
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
      granular_module->setRandomSeed(rng_state);
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
  configureDynamicsCharacterModule();
}
