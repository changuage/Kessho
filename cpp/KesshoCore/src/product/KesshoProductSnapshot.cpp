#include "KesshoProductEngineInternal.h"

  int32_t KesshoProductEngine::loadSnapshot(const KesshoProductSnapshotV2& snapshot) {
  if (snapshot.version != KESSHO_PRODUCT_SNAPSHOT_VERSION) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_UNSUPPORTED_SNAPSHOT_VERSION;
    return KESSHO_PRODUCT_ERROR_UNSUPPORTED_SNAPSHOT_VERSION;
  }
  if (snapshot.schema_hash != KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_SCHEMA_HASH_MISMATCH;
    return KESSHO_PRODUCT_ERROR_SCHEMA_HASH_MISMATCH;
  }

  transport.running = snapshot.transport.running != 0u;
  transport.bpm = clampFloat(snapshot.transport.bpm, 1.0f, 400.0f);
  transport.beats_per_bar = clampU32(snapshot.transport.beats_per_bar, 1u, 32u);
  transport.bars_per_phrase = clampU32(snapshot.transport.bars_per_phrase, 1u, 256u);
  transport.swing = clampFloat(snapshot.transport.swing, 0.0f, 1.0f);
  harmony.root_midi = clampFloat(snapshot.harmony.root_midi, 0.0f, 127.0f);
  harmony.scale_id = snapshot.harmony.scale_id == 0u ? 1u : snapshot.harmony.scale_id;
  harmony.tension = clampFloat(snapshot.harmony.tension, 0.0f, 1.0f);
  harmony.chord_mode = snapshot.harmony.chord_mode;
  harmony.voicing_mode = snapshot.harmony.voicing_mode;
  master_gain = clampFloat(snapshot.master.gain, 0.0f, 1.5f);
  setMasterLimiterCeilingDb(snapshot.master.limiter_ceiling_db);
  master_saturation_mode = clampU32(snapshot.master.saturation_mode, 0u, 4u);
  master_saturation_drive = clampFloat(snapshot.master.saturation_drive, 0.0f, 1.0f);
  master_saturation_tone = clampFloat(snapshot.master.saturation_tone, 0.0f, 1.0f);
  rng_seed = snapshot.rng.seed == 0u ? 1u : snapshot.rng.seed;
  rng_state = snapshot.rng.state == 0u ? rng_seed : snapshot.rng.state;
  evolution_amount = clampFloat(snapshot.evolution.amount, 0.0f, 1.0f);
  evolution_state = snapshot.evolution.state;
  journey_running = snapshot.journey.enabled != 0u;
  journey_phase = clampFloat(snapshot.journey.morph_phase, 0.0f, 1.0f);
  journey_rate_bars = clampFloat(snapshot.journey.morph_rate_bars, 0.25f, 128.0f);
  fx.granular_mix = clampFloat(snapshot.fx.granular_mix, 0.0f, 1.0f);
  fx.granular_enabled = snapshot.fx.granular_enabled != 0u;
  fx.granular_freeze = snapshot.fx.granular_freeze != 0u;
  fx.granular_freeze_with_feedback = snapshot.fx.granular_freeze_with_feedback != 0u;
  fx.granular_feedback = clampFloat(snapshot.fx.granular_feedback, 0.0f, 0.85f);
  fx.granular_feedback_lpf_hz = clampFloat(snapshot.fx.granular_feedback_lpf_hz, 200.0f, 12000.0f);
  fx.granular_buffer_seconds = clampFloat(snapshot.fx.granular_buffer_seconds, 1.0f, 32.0f);
  fx.granular_grain_shape = clampU32(snapshot.fx.granular_grain_shape, 0u, 3u);
  fx.granular_bus_diffusion = clampFloat(snapshot.fx.granular_bus_diffusion, 0.0f, 1.0f);
  fx.granular_timing_randomness = clampFloat(snapshot.fx.granular_timing_randomness, 0.0f, 1.0f);
  fx.granular_chord_bias = clampFloat(snapshot.fx.granular_chord_bias, 0.0f, 1.0f);
  fx.granular_legacy_jitter_ms = clampFloat(snapshot.fx.granular_legacy_jitter_ms, 0.0f, 30.0f);
  fx.granular_legacy_probability = clampFloat(snapshot.fx.granular_legacy_probability, 0.0f, 1.0f);
  fx.granular_legacy_pitch_mode = clampU32(snapshot.fx.granular_legacy_pitch_mode, 0u, 1u);
  fx.granular_legacy_pitch_spread = clampFloat(snapshot.fx.granular_legacy_pitch_spread, 0.0f, 12.0f);
  fx.granular_legacy_max_grains = clampU32(snapshot.fx.granular_legacy_max_grains, 0u, 128u);
  fx.granular_legacy_feedback = clampFloat(snapshot.fx.granular_legacy_feedback, 0.0f, 0.35f);
  for (uint32_t i = 0; i < kGranularVoiceCount; ++i) {
    const KesshoProductGranularVoiceSnapshot& voice_snapshot = snapshot.fx.granular_voices[i];
    GranularVoiceState& voice = fx.granular_voices[i];
    voice.enabled = voice_snapshot.enabled != 0u;
    voice.mode = clampU32(voice_snapshot.mode, 0u, 2u);
    voice.slice = clampU32(voice_snapshot.slice, 0u, 15u);
    voice.speed = clampFloat(voice_snapshot.speed, 0.0f, 4.0f);
    voice.scan_rate = clampFloat(voice_snapshot.scan_rate, 0.25f, 4.0f);
    voice.reverse = voice_snapshot.reverse != 0u;
    voice.pitch = clampFloat(voice_snapshot.pitch, -24.0f, 24.0f);
    voice.write_follow = clampFloat(voice_snapshot.write_follow, 0.0f, 1.0f);
    voice.density = clampFloat(voice_snapshot.density, 1.0f, 64.0f);
    voice.grain_size_ms = clampFloat(voice_snapshot.grain_size_ms, 10.0f, 500.0f);
    voice.spray = clampFloat(voice_snapshot.spray, 0.0f, 1.0f);
    voice.grain_octave_probability = clampFloat(voice_snapshot.grain_octave_probability, 0.0f, 1.0f);
    voice.attack_seconds = clampFloat(voice_snapshot.attack_seconds, 0.001f, 0.5f);
    voice.decay_seconds = clampFloat(voice_snapshot.decay_seconds, 0.01f, 4.0f);
    voice.gain = clampFloat(voice_snapshot.gain, 0.0f, 1.0f);
    voice.pan = clampFloat(voice_snapshot.pan, -1.0f, 1.0f);
    voice.blur = clampFloat(voice_snapshot.blur, 0.0f, 1.0f);
    voice.stereo_spread = clampFloat(voice_snapshot.stereo_spread, 0.0f, 1.0f);
    voice.position_lfo_rate = clampFloat(voice_snapshot.position_lfo_rate, 0.0f, 1.0f);
    voice.position_lfo_depth = clampFloat(voice_snapshot.position_lfo_depth, 0.0f, 1.0f);
    voice.pan_lfo_rate = clampFloat(voice_snapshot.pan_lfo_rate, 0.0f, 1.0f);
    voice.reverse_lfo_rate = clampFloat(voice_snapshot.reverse_lfo_rate, 0.0f, 1.0f);
    voice.record_lfo_rate = clampFloat(voice_snapshot.record_lfo_rate, 0.0f, 1.0f);
    voice.euclid_gated = voice_snapshot.euclid_gated != 0u;
    voice.euclid_muted = voice_snapshot.euclid_muted != 0u;
  }
  fx.delay_a_enabled = snapshot.fx.delay_a_enabled != 0u;
  fx.delay_a_time_left_ms = clampFloat(snapshot.fx.delay_a_time_left_ms, 10.0f, 5000.0f);
  fx.delay_a_time_right_ms = clampFloat(snapshot.fx.delay_a_time_right_ms, 10.0f, 5000.0f);
  fx.delay_a_feedback = clampFloat(snapshot.fx.delay_a_feedback, 0.0f, 0.95f);
  fx.delay_a_mix = clampFloat(snapshot.fx.delay_a_mix, 0.0f, 1.0f);
  fx.delay_a_filter_hz = clampFloat(snapshot.fx.delay_a_filter_hz, 200.0f, 12000.0f);
  fx.delay_a_filter_type = clampU32(snapshot.fx.delay_a_filter_type, 0u, 2u);
  fx.delay_a_mod_rate_hz = clampFloat(snapshot.fx.delay_a_mod_rate_hz, 0.0f, 5.0f);
  fx.delay_a_mod_depth_ms = clampFloat(snapshot.fx.delay_a_mod_depth_ms, 0.0f, 50.0f);
  fx.delay_a_ping_pong = snapshot.fx.delay_a_ping_pong != 0u;
  fx.delay_a_duck = clampFloat(snapshot.fx.delay_a_duck, 0.0f, 1.0f);
  fx.delay_a_width = clampFloat(snapshot.fx.delay_a_width, 0.0f, 1.0f);
  fx.delay_a_cross_feed_filter_hz = clampFloat(snapshot.fx.delay_a_cross_feed_filter_hz, 200.0f, 12000.0f);
  fx.delay_b_enabled = snapshot.fx.delay_b_enabled != 0u;
  fx.delay_b_activity = clampFloat(snapshot.fx.delay_b_activity, 0.0f, 1.0f);
  fx.delay_b_repeats = clampFloat(snapshot.fx.delay_b_repeats, 0.0f, 0.85f);
  fx.delay_b_base_time_ms = clampFloat(snapshot.fx.delay_b_base_time_ms, 20.0f, 5000.0f);
  fx.delay_b_tone = clampFloat(snapshot.fx.delay_b_tone, 0.0f, 1.0f);
  fx.delay_b_vibrato = clampFloat(snapshot.fx.delay_b_vibrato, 0.0f, 1.0f);
  fx.delay_b_mix = clampFloat(snapshot.fx.delay_b_mix, 0.0f, 1.0f);
  fx.delay_b_space_mode = clampU32(snapshot.fx.delay_b_space_mode, 0u, 1u);
  fx.delay_b_pattern = clampU32(snapshot.fx.delay_b_pattern, 0u, 3u);
  fx.delay_b_warp = clampU32(snapshot.fx.delay_b_warp, 0u, 3u);
  fx.delay_b_warp_intensity = clampFloat(snapshot.fx.delay_b_warp_intensity, 0.0f, 1.0f);
  fx.delay_b_spread = clampFloat(snapshot.fx.delay_b_spread, 0.0f, 1.0f);
  fx.reverb_mix = clampFloat(snapshot.fx.reverb_mix, 0.0f, 1.0f);
  fx.reverb_type = clampU32(snapshot.fx.reverb_type, 0u, 5u);
  fx.reverb_quality = clampU32(snapshot.fx.reverb_quality, 0u, 2u);
  fx.reverb_decay = clampFloat(snapshot.fx.reverb_decay, 0.0f, 1.0f);
  fx.reverb_size = clampFloat(snapshot.fx.reverb_size, 0.5f, 10.0f);
  fx.reverb_damping = clampFloat(snapshot.fx.reverb_damping, 0.0f, 1.0f);
  fx.reverb_diffusion = clampFloat(snapshot.fx.reverb_diffusion, 0.0f, 1.0f);
  fx.reverb_modulation = clampFloat(snapshot.fx.reverb_modulation, 0.0f, 1.0f);
  fx.reverb_predelay_ms = clampFloat(snapshot.fx.reverb_predelay_ms, 0.0f, 100.0f);
  fx.reverb_width = clampFloat(snapshot.fx.reverb_width, 0.0f, 1.0f);
  fx.reverb_shimmer_amount = clampFloat(snapshot.fx.reverb_shimmer_amount, 0.0f, 1.0f);
  fx.reverb_shimmer_pitch = clampFloat(snapshot.fx.reverb_shimmer_pitch, -24.0f, 24.0f);
  fx.reverb_slow_rate_hz = clampFloat(snapshot.fx.reverb_slow_rate_hz, 0.01f, 0.2f);
  fx.reverb_slow_depth = clampFloat(snapshot.fx.reverb_slow_depth, 0.0f, 1.0f);
  fx.reverb_reverse_amount = clampFloat(snapshot.fx.reverb_reverse_amount, 0.0f, 1.0f);
  fx.reverb_reverse_length_sec = clampFloat(snapshot.fx.reverb_reverse_length_sec, 0.5f, 16.0f);
  fx.reverb_chorus_rate_hz = clampFloat(snapshot.fx.reverb_chorus_rate_hz, 0.05f, 2.0f);
  fx.reverb_chorus_depth = clampFloat(snapshot.fx.reverb_chorus_depth, 0.0f, 40.0f);
  fx.reverb_mod_character = clampU32(snapshot.fx.reverb_mod_character, 0u, 2u);
  fx.reverb_damp_low = clampFloat(snapshot.fx.reverb_damp_low, 0.0f, 1.0f);
  fx.reverb_damp_high = clampFloat(snapshot.fx.reverb_damp_high, 0.0f, 1.0f);
  fx.reverb_crossover_hz = clampFloat(snapshot.fx.reverb_crossover_hz, 100.0f, 6000.0f);
  fx.reverb_input_tone = clampFloat(snapshot.fx.reverb_input_tone, -1.0f, 1.0f);
  fx.reverb_shimmer_feedback = clampFloat(snapshot.fx.reverb_shimmer_feedback, 0.0f, 1.0f);
  fx.reverb_warp = clampFloat(snapshot.fx.reverb_warp, 0.0f, 1.0f);
  fx.reverb_cross_feed = clampFloat(snapshot.fx.reverb_cross_feed, 0.0f, 1.0f);
  fx.reverb_early_reflections = clampFloat(snapshot.fx.reverb_early_reflections, 0.0f, 1.0f);
  fx.reverb_air_absorption = clampFloat(snapshot.fx.reverb_air_absorption, 0.0f, 1.0f);
  fx.reverb_saturation_mode = clampU32(snapshot.fx.reverb_saturation_mode, 0u, 2u);
  fx.reverb_transient_smooth = clampFloat(snapshot.fx.reverb_transient_smooth, 0.0f, 1.0f);
  fx.reverb_er_lp_freq = clampFloat(snapshot.fx.reverb_er_lp_freq, 200.0f, 12000.0f);
  fx.reverb_pre_comp_threshold = clampFloat(snapshot.fx.reverb_pre_comp_threshold, -60.0f, 0.0f);
  fx.reverb_pre_comp_knee = clampFloat(snapshot.fx.reverb_pre_comp_knee, 0.0f, 40.0f);
  fx.reverb_pre_comp_ratio = clampFloat(snapshot.fx.reverb_pre_comp_ratio, 1.0f, 20.0f);
  fx.reverb_pre_comp_attack_ms = clampFloat(snapshot.fx.reverb_pre_comp_attack_ms, 0.1f, 30.0f);
  fx.reverb_pre_comp_release_ms = clampFloat(snapshot.fx.reverb_pre_comp_release_ms, 20.0f, 1000.0f);
  fx.reverb_pre_comp_makeup = clampFloat(snapshot.fx.reverb_pre_comp_makeup, 0.5f, 4.0f);
  fx.spectral_freeze_mix = clampFloat(snapshot.fx.spectral_freeze_mix, 0.0f, 1.0f);
  fx.spectral_freeze_enabled = snapshot.fx.spectral_freeze_enabled != 0u;
  fx.spectral_freeze_active = snapshot.fx.spectral_freeze_active != 0u;
  fx.spectral_freeze_slushy = snapshot.fx.spectral_freeze_slushy != 0u;
  fx.spectral_freeze_speed = clampFloat(snapshot.fx.spectral_freeze_speed, 0.0f, 1.0f);
  fx.spectral_freeze_decay = clampFloat(snapshot.fx.spectral_freeze_decay, 0.0f, 1.0f);
  fx.spectral_freeze_phase_jitter = clampFloat(snapshot.fx.spectral_freeze_phase_jitter, 0.0f, 1.0f);
  fx.dynamics_drive = clampFloat(snapshot.fx.dynamics_drive, 0.0f, 1.0f);
  fx.dynamics_enabled = snapshot.fx.dynamics_enabled != 0u;
  fx.dynamics_character_enabled = snapshot.fx.dynamics_character_enabled != 0u;
  fx.dynamics_character_mode = clampU32(snapshot.fx.dynamics_character_mode, 0u, 2u);
  fx.dynamics_character_mix = clampFloat(snapshot.fx.dynamics_character_mix, 0.0f, 1.0f);
  fx.dynamics_character_age = clampFloat(snapshot.fx.dynamics_character_age, 0.0f, 1.0f);
  fx.dynamics_character_bias = clampFloat(snapshot.fx.dynamics_character_bias, 0.0f, 1.0f);
  fx.dynamics_character_lpg_amount = clampFloat(snapshot.fx.dynamics_character_lpg_amount, 0.0f, 1.0f);
  fx.dynamics_character_resonance = clampFloat(snapshot.fx.dynamics_character_resonance, 0.0f, 1.0f);
  fx.dynamics_character_stereo = clampFloat(snapshot.fx.dynamics_character_stereo, 0.0f, 1.0f);
  fx.dynamics_character_env_follow = clampFloat(snapshot.fx.dynamics_character_env_follow, 0.0f, 1.0f);
  fx.dynamics_character_depth = clampFloat(snapshot.fx.dynamics_character_depth, 0.0f, 1.0f);
  fx.dynamics_character_rate = clampFloat(snapshot.fx.dynamics_character_rate, 0.0f, 1.0f);
  fx.dynamics_character_damp = clampFloat(snapshot.fx.dynamics_character_damp, 0.0f, 1.0f);
  fx.dynamics_degrade_enabled = snapshot.fx.dynamics_degrade_enabled != 0u;
  fx.dynamics_degrade_mix = clampFloat(snapshot.fx.dynamics_degrade_mix, 0.0f, 1.0f);
  fx.dynamics_degrade_age = clampFloat(snapshot.fx.dynamics_degrade_age, 0.0f, 1.0f);
  fx.dynamics_degrade_generation = clampFloat(snapshot.fx.dynamics_degrade_generation, 0.0f, 1.0f);
  fx.dynamics_degrade_alias = clampFloat(snapshot.fx.dynamics_degrade_alias, 0.0f, 1.0f);
  fx.dynamics_degrade_wow = clampFloat(snapshot.fx.dynamics_degrade_wow, 0.0f, 1.0f);
  fx.dynamics_degrade_flutter = clampFloat(snapshot.fx.dynamics_degrade_flutter, 0.0f, 1.0f);
  fx.dynamics_degrade_drift = clampFloat(snapshot.fx.dynamics_degrade_drift, 0.0f, 1.0f);
  fx.dynamics_degrade_wobble_speed = clampFloat(snapshot.fx.dynamics_degrade_wobble_speed, 0.0f, 1.0f);
  fx.dynamics_degrade_tone = clampFloat(snapshot.fx.dynamics_degrade_tone, 0.0f, 1.0f);
  fx.dynamics_degrade_hp = clampFloat(snapshot.fx.dynamics_degrade_hp, 0.0f, 1.0f);
  fx.dynamics_degrade_lp = clampFloat(snapshot.fx.dynamics_degrade_lp, 0.0f, 1.0f);
  fx.dynamics_degrade_noise = clampFloat(snapshot.fx.dynamics_degrade_noise, 0.0f, 1.0f);
  fx.dynamics_degrade_saturation = clampFloat(snapshot.fx.dynamics_degrade_saturation, 0.0f, 1.0f);
  fx.dynamics_degrade_corrosion = clampFloat(snapshot.fx.dynamics_degrade_corrosion, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceSlow][kDynamicsModTargetWow] = clampFloat(snapshot.fx.dynamics_mod_slow_wow, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceSlow][kDynamicsModTargetFlutter] = clampFloat(snapshot.fx.dynamics_mod_slow_flutter, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceSlow][kDynamicsModTargetLp] = clampFloat(snapshot.fx.dynamics_mod_slow_lp, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceSlow][kDynamicsModTargetWet] = clampFloat(snapshot.fx.dynamics_mod_slow_wet, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceSlow][kDynamicsModTargetDropout] = clampFloat(snapshot.fx.dynamics_mod_slow_dropout, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceSlow][kDynamicsModTargetAlias] = clampFloat(snapshot.fx.dynamics_mod_slow_alias, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceFlutter][kDynamicsModTargetWow] = clampFloat(snapshot.fx.dynamics_mod_flutter_wow, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceFlutter][kDynamicsModTargetFlutter] = clampFloat(snapshot.fx.dynamics_mod_flutter_flutter, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceFlutter][kDynamicsModTargetLp] = clampFloat(snapshot.fx.dynamics_mod_flutter_lp, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceFlutter][kDynamicsModTargetWet] = clampFloat(snapshot.fx.dynamics_mod_flutter_wet, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceFlutter][kDynamicsModTargetDropout] = clampFloat(snapshot.fx.dynamics_mod_flutter_dropout, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceFlutter][kDynamicsModTargetAlias] = clampFloat(snapshot.fx.dynamics_mod_flutter_alias, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceRandom][kDynamicsModTargetWow] = clampFloat(snapshot.fx.dynamics_mod_random_wow, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceRandom][kDynamicsModTargetFlutter] = clampFloat(snapshot.fx.dynamics_mod_random_flutter, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceRandom][kDynamicsModTargetLp] = clampFloat(snapshot.fx.dynamics_mod_random_lp, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceRandom][kDynamicsModTargetWet] = clampFloat(snapshot.fx.dynamics_mod_random_wet, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceRandom][kDynamicsModTargetDropout] = clampFloat(snapshot.fx.dynamics_mod_random_dropout, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceRandom][kDynamicsModTargetAlias] = clampFloat(snapshot.fx.dynamics_mod_random_alias, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceEnv][kDynamicsModTargetWow] = clampFloat(snapshot.fx.dynamics_mod_env_wow, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceEnv][kDynamicsModTargetFlutter] = clampFloat(snapshot.fx.dynamics_mod_env_flutter, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceEnv][kDynamicsModTargetLp] = clampFloat(snapshot.fx.dynamics_mod_env_lp, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceEnv][kDynamicsModTargetWet] = clampFloat(snapshot.fx.dynamics_mod_env_wet, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceEnv][kDynamicsModTargetDropout] = clampFloat(snapshot.fx.dynamics_mod_env_dropout, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceEnv][kDynamicsModTargetAlias] = clampFloat(snapshot.fx.dynamics_mod_env_alias, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceNoise][kDynamicsModTargetWow] = clampFloat(snapshot.fx.dynamics_mod_noise_wow, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceNoise][kDynamicsModTargetFlutter] = clampFloat(snapshot.fx.dynamics_mod_noise_flutter, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceNoise][kDynamicsModTargetLp] = clampFloat(snapshot.fx.dynamics_mod_noise_lp, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceNoise][kDynamicsModTargetWet] = clampFloat(snapshot.fx.dynamics_mod_noise_wet, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceNoise][kDynamicsModTargetDropout] = clampFloat(snapshot.fx.dynamics_mod_noise_dropout, 0.0f, 1.0f);
  fx.dynamics_mod[kDynamicsModSourceNoise][kDynamicsModTargetAlias] = clampFloat(snapshot.fx.dynamics_mod_noise_alias, 0.0f, 1.0f);
  fx.dynamics_saturation_enabled = snapshot.fx.dynamics_saturation_enabled != 0u;
  fx.dynamics_saturation_mode = clampU32(snapshot.fx.dynamics_saturation_mode, 0u, 4u);
  fx.dynamics_saturation_drive = clampFloat(snapshot.fx.dynamics_saturation_drive, 0.0f, 1.0f);
  fx.dynamics_saturation_tone = clampFloat(snapshot.fx.dynamics_saturation_tone, 0.0f, 1.0f);
  fx.dynamics_saturation_bias = clampFloat(snapshot.fx.dynamics_saturation_bias, 0.0f, 1.0f);
  fx.dynamics_end_comp_enabled = snapshot.fx.dynamics_end_comp_enabled != 0u;
  fx.dynamics_end_comp_threshold = clampFloat(snapshot.fx.dynamics_end_comp_threshold, -60.0f, 0.0f);
  fx.dynamics_end_comp_knee = clampFloat(snapshot.fx.dynamics_end_comp_knee, 0.0f, 40.0f);
  fx.dynamics_end_comp_ratio = clampFloat(snapshot.fx.dynamics_end_comp_ratio, 1.0f, 20.0f);
  fx.dynamics_end_comp_attack_ms = clampFloat(snapshot.fx.dynamics_end_comp_attack_ms, 0.1f, 100.0f);
  fx.dynamics_end_comp_release_ms = clampFloat(snapshot.fx.dynamics_end_comp_release_ms, 20.0f, 1500.0f);
  fx.dynamics_end_comp_makeup = clampFloat(snapshot.fx.dynamics_end_comp_makeup, 0.25f, 4.0f);
  fx.dynamics_end_comp_mix = clampFloat(snapshot.fx.dynamics_end_comp_mix, 0.0f, 1.0f);
  fx.dynamics_end_comp_detector_hp = clampFloat(snapshot.fx.dynamics_end_comp_detector_hp, 0.0f, 1.0f);
  fx.dynamics_end_comp_detector_tilt = clampFloat(snapshot.fx.dynamics_end_comp_detector_tilt, 0.0f, 1.0f);
  fx.dynamics_end_comp_auto_makeup = clampFloat(snapshot.fx.dynamics_end_comp_auto_makeup, 0.0f, 1.0f);
  fx.dynamics_end_comp_program_release = clampFloat(snapshot.fx.dynamics_end_comp_program_release, 0.0f, 1.0f);
  fx.sidechain_enabled = snapshot.fx.sidechain_enabled != 0u;
  fx.sidechain_key_a = clampU32(snapshot.fx.sidechain_key_a, kSidechainKeyOff, kSidechainKeyMembrane);
  fx.sidechain_key_b = clampU32(snapshot.fx.sidechain_key_b, kSidechainKeyOff, kSidechainKeyMembrane);
  fx.sidechain_key_a_weight = clampFloat(snapshot.fx.sidechain_key_a_weight, 0.0f, 1.0f);
  fx.sidechain_key_b_weight = clampFloat(snapshot.fx.sidechain_key_b_weight, 0.0f, 1.0f);
  fx.sidechain_amount = clampFloat(snapshot.fx.sidechain_amount, 0.0f, 1.0f);
  fx.sidechain_threshold = clampFloat(snapshot.fx.sidechain_threshold, -60.0f, 0.0f);
  fx.sidechain_ratio = clampFloat(snapshot.fx.sidechain_ratio, 1.0f, 20.0f);
  fx.sidechain_knee = clampFloat(snapshot.fx.sidechain_knee, 0.0f, 40.0f);
  fx.sidechain_attack_ms = clampFloat(snapshot.fx.sidechain_attack_ms, 0.1f, 100.0f);
  fx.sidechain_hold_ms = clampFloat(snapshot.fx.sidechain_hold_ms, 0.0f, 250.0f);
  fx.sidechain_release_ms = clampFloat(snapshot.fx.sidechain_release_ms, 20.0f, 1500.0f);
  fx.sidechain_makeup = clampFloat(snapshot.fx.sidechain_makeup, 0.25f, 4.0f);
  fx.sidechain_mix = clampFloat(snapshot.fx.sidechain_mix, 0.0f, 1.0f);
  fx.sidechain_curve = clampFloat(snapshot.fx.sidechain_curve, 0.0f, 1.0f);
  fx.sidechain_detector_hp = clampFloat(snapshot.fx.sidechain_detector_hp, 0.0f, 1.0f);
  fx.sidechain_detector_lp = clampFloat(snapshot.fx.sidechain_detector_lp, 0.0f, 1.0f);
  fx.sidechain_targets[kSidechainPad1] = clampFloat(snapshot.fx.sidechain_pad1_target, 0.0f, 1.0f);
  fx.sidechain_targets[kSidechainPad2] = clampFloat(snapshot.fx.sidechain_pad2_target, 0.0f, 1.0f);
  fx.sidechain_targets[kSidechainLead1] = clampFloat(snapshot.fx.sidechain_lead1_target, 0.0f, 1.0f);
  fx.sidechain_targets[kSidechainLead2] = clampFloat(snapshot.fx.sidechain_lead2_target, 0.0f, 1.0f);
  fx.sidechain_targets[kSidechainPiano] = clampFloat(snapshot.fx.sidechain_piano_target, 0.0f, 1.0f);
  fx.sidechain_targets[kSidechainGranular] = clampFloat(snapshot.fx.sidechain_granular_target, 0.0f, 1.0f);
  fx.sidechain_targets[kSidechainDelayA] = clampFloat(snapshot.fx.sidechain_delay_a_target, 0.0f, 1.0f);
  fx.sidechain_targets[kSidechainDelayB] = clampFloat(snapshot.fx.sidechain_delay_b_target, 0.0f, 1.0f);
  fx.sidechain_targets[kSidechainReverb] = clampFloat(snapshot.fx.sidechain_reverb_target, 0.0f, 1.0f);
  resetSidechainRuntime();
  routing.delay_a_to_delay_b = clampFloat(snapshot.routing.delay_a_to_delay_b, 0.0f, 1.0f);
  routing.delay_b_to_delay_a = clampFloat(snapshot.routing.delay_b_to_delay_a, 0.0f, 1.0f);
  routing.delay_to_reverb = clampFloat(snapshot.routing.delay_to_reverb, 0.0f, 1.0f);
  routing.granular_to_reverb = clampFloat(snapshot.routing.granular_to_reverb, 0.0f, 1.0f);
  routing.delay_a_to_granular = clampFloat(snapshot.routing.delay_a_to_granular, 0.0f, 1.0f);
  routing.delay_b_to_granular = clampFloat(snapshot.routing.delay_b_to_granular, 0.0f, 1.0f);
  routing.delay_b_to_reverb = clampFloat(snapshot.routing.delay_b_to_reverb, 0.0f, 1.0f);
  configureFxModules();

  for (uint32_t i = 0; i < kSourceCount; ++i) {
    const KesshoProductSourceSnapshot& source = snapshot.sources[i];
    sources[i].enabled = source.enabled != 0u;
    sources[i].source_id = source.source_id == 0u ? i + 1u : source.source_id;
    sources[i].preset_id = source.preset_id == 0u ? defaultSourcePresetId(sources[i].source_id) : source.preset_id;
    sources[i].asset_id = source.asset_id;
    if (sources[i].last_missing_asset_id != source.asset_id) {
      sources[i].last_missing_asset_id = 0u;
    }
    sources[i].level = clampFloat(source.level, 0.0f, 1.5f);
    sources[i].morph = clampFloat(source.morph, 0.0f, 1.0f);
    sources[i].distance = clampFloat(source.distance, 0.0f, 1.0f);
    sources[i].expression = clampFloat(source.expression, 0.0f, 1.0f);
    sources[i].dry_gain = clampFloat(source.dry_gain, 0.0f, 2.0f);
    sources[i].reverb_send = clampFloat(source.reverb_send, 0.0f, 2.0f);
    sources[i].delay_a_send = clampFloat(source.delay_a_send, 0.0f, 2.0f);
    sources[i].delay_b_send = clampFloat(source.delay_b_send, 0.0f, 2.0f);
    sources[i].granular_send = clampFloat(source.granular_send, 0.0f, 2.0f);
    sources[i].post_lpf_hz = source.post_lpf_hz > 0.0f && std::isfinite(source.post_lpf_hz)
        ? clampFloat(source.post_lpf_hz, 20.0f, 20000.0f)
        : kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_HZ;
    sources[i].stereo_width = std::isfinite(source.stereo_width)
        ? clampFloat(source.stereo_width, 0.0f, 1.0f)
        : kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_STEREO_WIDTH;
    sources[i].post_lpf_key_tracking = std::isfinite(source.post_lpf_key_tracking)
        ? clampFloat(source.post_lpf_key_tracking, 0.0f, 1.0f)
        : kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_KEY_TRACKING;
    sources[i].hold_seconds = clampFloat(source.hold_seconds, 0.001f, 20.0f);
    sources[i].exact_pad_param_count = std::min<uint32_t>(
        source.exact_pad_param_count,
        kessho::product::generated::KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT);
    for (uint32_t param_index = 0; param_index < kessho::product::generated::KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT; ++param_index) {
      sources[i].exact_pad_params[param_index] =
          param_index < sources[i].exact_pad_param_count && std::isfinite(source.exact_pad_params[param_index])
              ? source.exact_pad_params[param_index]
              : 0.0f;
    }
    sources[i].exact_lead_param_count = std::min<uint32_t>(
        source.exact_lead_param_count,
        kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT);
    for (uint32_t param_index = 0; param_index < kessho::product::generated::KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT; ++param_index) {
      sources[i].exact_lead_params[param_index] =
          param_index < sources[i].exact_lead_param_count && std::isfinite(source.exact_lead_params[param_index])
              ? source.exact_lead_params[param_index]
              : 0.0f;
    }
    sources[i].exact_drum_param_count = std::min<uint32_t>(
        source.exact_drum_param_count,
        kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_PARAM_COUNT);
    for (uint32_t param_index = 0; param_index < kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_PARAM_COUNT; ++param_index) {
      sources[i].exact_drum_params[param_index] =
          param_index < sources[i].exact_drum_param_count && std::isfinite(source.exact_drum_params[param_index])
              ? source.exact_drum_params[param_index]
              : 0.0f;
    }
    for (uint32_t voice_index = 0; voice_index < kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_VOICE_COUNT; ++voice_index) {
      sources[i].drum_voice_preset_a_ids[voice_index] = source.drum_voice_preset_a_ids[voice_index];
      sources[i].drum_voice_preset_b_ids[voice_index] = source.drum_voice_preset_b_ids[voice_index];
      sources[i].drum_voice_morphs[voice_index] = std::isfinite(source.drum_voice_morphs[voice_index])
          ? clampFloat(source.drum_voice_morphs[voice_index], 0.0f, 1.0f)
          : 0.0f;
    }
  }
  SourceState& soundscape_source = sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1u];
  soundscape_source.asset_ref_count = 0;
  std::fill(soundscape_source.asset_refs, soundscape_source.asset_refs + kMaxSoundscapeAssetRefs, 0u);
  for (uint32_t ref_index = 0; ref_index < 32u && soundscape_source.asset_ref_count < kMaxSoundscapeAssetRefs; ++ref_index) {
    const uint32_t asset_id = snapshot.asset_refs[ref_index];
    if (asset_id == 0u) {
      continue;
    }
    bool already_present = false;
    for (uint32_t i = 0; i < soundscape_source.asset_ref_count; ++i) {
      already_present = already_present || soundscape_source.asset_refs[i] == asset_id;
    }
    if (!already_present) {
      soundscape_source.asset_refs[soundscape_source.asset_ref_count++] = asset_id;
    }
  }
  if (soundscape_source.asset_ref_count == 0u && soundscape_source.asset_id != 0u) {
    soundscape_source.asset_refs[soundscape_source.asset_ref_count++] = soundscape_source.asset_id;
  }
  soundscape_source.last_missing_asset_id = 0u;

  synth_lane_count = std::min<uint32_t>(snapshot.synth_euclid.lane_count, kMaxLaneCount);
  drum_lane_count = std::min<uint32_t>(snapshot.drum_euclid.lane_count, kMaxLaneCount);
  loadLaneSnapshots(snapshot.synth_euclid, synth_lanes, KESSHO_PRODUCT_SOURCE_PAD1);
  loadLaneSnapshots(snapshot.drum_euclid, drum_lanes, KESSHO_PRODUCT_SOURCE_DRUM);
  markSequencerUiStateChanged(0u, 0xffffffffu, KESSHO_PRODUCT_SEQUENCER_UI_CHANGE_SNAPSHOT);
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
  return KESSHO_PRODUCT_OK;
}

  void KesshoProductEngine::loadLaneSnapshots(
      const KesshoProductSequencerSnapshot& snapshot,
      LaneState* lanes,
      uint32_t fallback_source) {
  const uint32_t count = std::min<uint32_t>(snapshot.lane_count, kMaxLaneCount);
  for (uint32_t i = 0; i < count; ++i) {
    const KesshoProductSequencerLaneSnapshot& lane = snapshot.lanes[i];
    lanes[i].enabled = lane.enabled != 0u;
    lanes[i].target_source_id = lane.target_source_id == 0u ? fallback_source : lane.target_source_id;
    lanes[i].step_count = clampU32(lane.step_count, 1u, 64u);
    lanes[i].fill_count = clampU32(lane.fill_count, 0u, lanes[i].step_count);
    lanes[i].rotation = lane.rotation;
    lanes[i].clock_division = clampU32(lane.clock_division, 1u, 128u);
    lanes[i].swing = clampFloat(lane.swing, 0.0f, 1.0f);
    lanes[i].probability = clampFloat(lane.probability, 0.0f, 1.0f);
    lanes[i].ratchet = clampU32(lane.ratchet, 1u, 8u);
    lanes[i].trig_condition = lane.trig_condition;
    lanes[i].midi_note = clampFloat(lane.midi_note, 0.0f, 127.0f);
    lanes[i].velocity = clampFloat(lane.velocity, 0.0f, 1.0f);
    lanes[i].hold_seconds = clampFloat(lane.hold_seconds, 0.001f, 20.0f);
    lanes[i].morph = clampFloat(lane.morph, 0.0f, 1.0f);
    lanes[i].distance = clampFloat(lane.distance, 0.0f, 1.0f);
    lanes[i].expression = clampFloat(lane.expression, 0.0f, 1.0f);
    lanes[i].seed = lane.seed == 0u ? rng_seed + i + 1u : lane.seed;
    lanes[i].bar_reset = lane.bar_reset != 0u;
    lanes[i].phrase_reset = lane.phrase_reset != 0u;
    lanes[i].manual_step_mask_low = lane.manual_step_mask_low;
    lanes[i].manual_step_mask_high = lane.manual_step_mask_high;
    lanes[i].step_override_set_low = 0;
    lanes[i].step_override_set_high = 0;
    lanes[i].step_override_value_low = 0;
    lanes[i].step_override_value_high = 0;
    clearLaneStepOverrides(lanes[i]);
  }
}
