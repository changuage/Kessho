#include "../KesshoProductEngineInternal.h"

void KesshoProductEngine::configureDynamicsDriftModule() {
  const auto configure_module = [this](
      kessho::core::IKesshoModule* module,
      bool include_drift_degrade,
      bool include_master_chain) {
    if (module == nullptr) {
      return;
    }
    float* params = module->params();
    if (params == nullptr || static_cast<uint32_t>(module->paramCount()) < kDynamicsDriftParamCount) {
      return;
    }
    std::fill(params, params + module->paramCount(), 0.0f);
      const auto unit = [](float value) { return clampFloat(value, 0.0f, 1.0f); };
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
      const auto smoothstep01 = [](float value) {
        const float x = clampFloat(value, 0.0f, 1.0f); return x * x * (3.0f - 2.0f * x);
      };
      const bool saturation_enabled = include_master_chain && fx.dynamics_saturation_enabled;
      const bool drift_enabled = include_drift_degrade && fx.dynamics_enabled && fx.dynamics_drift_enabled;
      const bool erosion_enabled = include_drift_degrade && fx.dynamics_enabled && fx.dynamics_erosion_enabled;
      const bool end_comp_enabled = include_master_chain && fx.dynamics_enabled && fx.dynamics_end_comp_enabled;
      const uint32_t drift_mode = drift_enabled ? clampU32(fx.dynamics_drift_mode, 0u, 2u) : 0u;
      const bool mode_active = drift_mode != 0u;
      const float clean_flavor = drift_mode == 0u ? 1.0f : 0.0f;
      const float shallow_flavor = drift_mode == 2u ? 1.0f : 0.0f;
      const float abyss_flavor = drift_mode == 1u ? 1.0f : 0.0f;
      const float default_age = drift_mode == 2u ? 0.18f : (drift_mode == 1u ? 0.06f : 0.0f);
      const float default_resonance = drift_mode == 2u ? 0.24f : (drift_mode == 1u ? 0.18f : 0.2f);
      const float default_depth = drift_mode == 2u ? 0.82f : (drift_mode == 1u ? 0.33f : 0.12f);
      const float default_rate = drift_mode == 2u ? 0.16f : (drift_mode == 1u ? 0.08f : 0.2f);
      const float default_damp = drift_mode == 2u ? 0.65f : (drift_mode == 1u ? 0.33f : 0.5f);
      const float default_bias = drift_mode == 2u ? 0.44f : (drift_mode == 1u ? 0.38f : 0.78f);
      const float default_lpg_amount = drift_mode == 2u ? 0.68f : (drift_mode == 1u ? 0.84f : 0.08f);
      const float drift_mix = drift_enabled ? unit(fx.dynamics_drift_mix) : 0.0f;
      const float drift_quality = static_cast<float>(clampU32(fx.dynamics_drift_quality, 0u, 2u));
      const float drift_anti_comb = unit(fx.dynamics_drift_anti_comb);
      const float drift_diffusion = unit(fx.dynamics_drift_diffusion);
      const float drift_bias = drift_enabled ? unit(fx.dynamics_drift_bias) : default_bias;
      const float drift_lpg_amount = drift_enabled ? unit(fx.dynamics_drift_lpg_amount) : default_lpg_amount;
      const float erosion_mix = erosion_enabled ? unit(fx.dynamics_erosion_mix) : 0.0f;
      const float erosion_quality = static_cast<float>(clampU32(fx.dynamics_erosion_quality, 0u, 2u));
      const float erosion_event_amount = unit(fx.dynamics_erosion_event_amount);
      const float erosion_profile_amount = unit(fx.dynamics_erosion_profile_amount);
      const float erosion_dither_amount = unit(fx.dynamics_erosion_dither_amount);
      const float base_wet = unit(1.0f - (1.0f - drift_mix) * (1.0f - erosion_mix));
      const float erosion_color_influence = std::sqrt(erosion_mix);
      const float erosion_motion_influence = erosion_mix * (0.65f + 0.35f * erosion_mix);
      const float erosion_failure_influence = smoothstep01((erosion_mix - 0.25f) / 0.75f);
      const float erosion_influence = erosion_color_influence;
      const float base_dry = 1.0f - base_wet;
      const float raw_drift_age = drift_enabled ? unit(fx.dynamics_drift_age) : 0.0f;
      const float raw_erosion_age = erosion_enabled ? unit(fx.dynamics_erosion_age) : 0.0f;
      const float raw_erosion_generation = erosion_enabled ? unit(fx.dynamics_erosion_generation) : 0.0f;
      const float raw_erosion_alias = erosion_enabled ? unit(fx.dynamics_erosion_alias) : 0.0f;
      const float base_erosion_wow = erosion_enabled ? unit(fx.dynamics_erosion_wow) : 0.0f;
      const float base_erosion_flutter = erosion_enabled ? unit(fx.dynamics_erosion_flutter) : 0.0f;
      const float base_erosion_drift = erosion_enabled ? unit(fx.dynamics_erosion_drift) : 0.0f;
      const float erosion_wobble_speed = erosion_enabled ? unit(fx.dynamics_erosion_wobble_speed) : 0.35f;
      const float erosion_age = raw_erosion_age * erosion_influence;
      const float erosion_generation = raw_erosion_generation * erosion_influence;
      const float erosion_alias = raw_erosion_alias * erosion_influence;
      const float raw_media_wear = unit(raw_erosion_age + raw_erosion_generation * 0.42f);
      const float media_wear = unit(erosion_age + erosion_generation * 0.42f);
      const float raw_corrosion = erosion_enabled ? unit(fx.dynamics_erosion_corrosion) : 0.0f;
      const float contribution_abyss = abyss_flavor * drift_mix;
      const float contribution_shallow = shallow_flavor * drift_mix;
      const float contribution_clean = clean_flavor * drift_mix;
      const float contribution_material_wear = unit((raw_erosion_age * 0.72f + raw_erosion_generation * 0.58f) * erosion_color_influence);
      const float contribution_alias_damage = unit((raw_erosion_alias * 0.9f + raw_corrosion * 0.42f) * erosion_failure_influence);
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
      const float env_follow = drift_enabled ? unit(fx.dynamics_drift_env_follow) : 0.0f;
      float mod_sources[kDynamicsModSourceCount]{};
      if (erosion_enabled) {
        mod_sources[kDynamicsModSourceSlow] = erosion_motion_influence * clampFloat(
            base_erosion_wow * 0.22f +
                base_erosion_drift * 0.34f +
                raw_erosion_age * 0.2f +
                raw_erosion_generation * 0.18f +
                contribution_smooth_drift * 0.18f,
            0.0f,
            1.0f);
        mod_sources[kDynamicsModSourceFlutter] = erosion_motion_influence * clampFloat(
            base_erosion_flutter * 0.55f + contribution_flutter_jitter * 0.24f + raw_erosion_generation * 0.08f,
            0.0f,
            1.0f);
        mod_sources[kDynamicsModSourceRandom] = erosion_motion_influence * clampFloat(
            base_erosion_drift * 0.3f + contribution_random_hold * 0.44f + raw_media_wear * 0.22f,
            0.0f,
            1.0f);
        mod_sources[kDynamicsModSourceEnv] = erosion_motion_influence * env_follow;
        mod_sources[kDynamicsModSourceNoise] = erosion_failure_influence * clampFloat(
            unit(fx.dynamics_erosion_noise) * 0.64f + raw_corrosion * 0.18f + raw_erosion_alias * 0.12f,
            0.0f,
            1.0f);
      }
      const float mod_wow = dynamicsModRoute(mod_sources, kDynamicsModTargetWow);
      const float mod_flutter = dynamicsModRoute(mod_sources, kDynamicsModTargetFlutter);
      const float mod_lp = dynamicsModRoute(mod_sources, kDynamicsModTargetLp);
      const float mod_wet = dynamicsModRoute(mod_sources, kDynamicsModTargetWet);
      const float mod_dropout = dynamicsModRoute(mod_sources, kDynamicsModTargetDropout);
      const float mod_alias = dynamicsModRoute(mod_sources, kDynamicsModTargetAlias);
      const float worklet_alias = unit(raw_erosion_alias + mod_alias * 0.18f);
      const float shaped_alias = unit(erosion_alias + mod_alias * 0.08f);
      const float digital_damage = unit(shaped_alias * 0.46f + erosion_generation * 0.22f);
      const float damage = unit(
          erosion_mix *
          (erosion_age * 0.32f + erosion_generation * 0.18f + shaped_alias * 0.08f + raw_corrosion * erosion_failure_influence * 0.12f));
      const float drift_age = drift_enabled ? std::max(raw_drift_age, mode_active ? default_age : 0.0f) : 0.0f;
      const float age = unit(std::max(drift_age, media_wear * (0.38f + erosion_mix * 0.52f)));
      const float depth = drift_enabled ? std::max(unit(fx.dynamics_drift_depth), mode_active ? default_depth : 0.0f) : 0.0f;
      const float rate = drift_enabled ? std::max(unit(fx.dynamics_drift_rate), mode_active ? default_rate : 0.0f) : 0.0f;
      const float damp = drift_enabled ? std::max(unit(fx.dynamics_drift_damp), mode_active ? default_damp : 0.5f) : 0.5f;
      const float stereo = drift_enabled ? unit(fx.dynamics_drift_stereo) : 0.0f;
      const float lpg_response = mode_active
          ? unit(drift_lpg_amount * (0.4f + env_follow * 0.6f))
          : unit(drift_lpg_amount * (0.12f + env_follow * 0.4f));
      const float raw_wow = unit(base_erosion_wow * erosion_motion_influence * (0.95f + contribution_cross_patch * 0.22f) + mod_wow * 0.2f);
      const float raw_flutter = unit(base_erosion_flutter * erosion_motion_influence * (0.38f + contribution_cross_patch * 0.18f) + mod_flutter * 0.08f);
      const float raw_drift = base_erosion_drift * erosion_motion_influence;
      const float water_cyclic_bias = clean_flavor > 0.0f ? 0.11f : (shallow_flavor > 0.0f ? 0.026f : 0.02f);
      const float water_sine_scale = clean_flavor > 0.0f ? 0.62f : (shallow_flavor > 0.0f ? 0.24f : 0.18f);
      const float mode_wow = depth * (water_cyclic_bias + contribution_sine_wow * water_sine_scale);
      const float mode_flutter = depth * (0.02f + contribution_flutter_jitter * 0.12f);
      const float flutter_damage = contribution_material_wear * 0.014f + contribution_alias_damage * (0.018f + contribution_cross_patch * 0.074f);
      const float cyclic_mode_scale = clean_flavor > 0.0f
          ? 1.0f
          : (shallow_flavor > 0.0f
                ? 0.34f + erosion_mix * 0.08f
                : (abyss_flavor > 0.0f ? 0.28f + erosion_mix * 0.07f : 0.56f + erosion_mix * 0.14f));
      const float cyclic_flutter_scale = clean_flavor > 0.0f
          ? 1.0f
          : (shallow_flavor > 0.0f
                ? 0.54f + erosion_mix * 0.1f
                : (abyss_flavor > 0.0f ? 0.42f + erosion_mix * 0.08f : 0.74f + erosion_mix * 0.12f));
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
      const float tape_wander_depth = erosion_enabled
          ? raw_drift * 0.0021f + contribution_material_wear * 0.0011f + contribution_alias_damage * 0.00032f + mod_wow * 0.00085f
          : 0.0f;
      const float tape_flutter_depth = erosion_enabled
          ? raw_flutter * 0.00022f + contribution_material_wear * 0.00009f + contribution_alias_damage * 0.0001f + mod_flutter * 0.0002f
          : 0.0f;
      const float clean_tape_pitch_focus =
          clean_flavor * erosion_mix * unit(base_erosion_wow + base_erosion_drift * 0.15f + mod_wow * 0.45f);
      const float clean_tape_serial_weight = unit(clean_tape_pitch_focus * 3.2f);
      const float dry = base_dry * (1.0f - clean_tape_serial_weight);
      const float wet = unit(1.0f - dry);
      const float erosion_wet_ratio = wet > 0.0001f ? unit(erosion_mix / wet) : 0.0f;
      const float cyclic_wow_depth_scale = clean_flavor > 0.0f
          ? 0.012f + depth * 0.01f + rate * 0.005f + clean_tape_pitch_focus * 0.012f
          : 0.006f + depth * 0.0045f + rate * 0.0018f + shallow_flavor * 0.0015f + abyss_flavor * 0.001f + erosion_mix * 0.0012f;
      const float wow_depth_base = (cyclic_wow * cyclic_wow_depth_scale + tape_wander_depth) *
          (0.58f +
           depth * (1.45f + shallow_flavor * 0.36f + abyss_flavor * 0.28f + clean_flavor * 0.55f) +
           contribution_cross_patch * 0.4f +
           clean_tape_pitch_focus * 1.6f +
           rate * (0.14f + shallow_flavor * 0.18f + abyss_flavor * 0.12f + clean_flavor * 0.24f));
      const float wow_depth = wow_depth_base * (1.0f + base_erosion_wow) * abyss_pitch_motion_trim;
      const float flutter_depth = (cyclic_flutter * (0.00072f + clean_tape_pitch_focus * 0.00024f) + tape_flutter_depth) *
          (0.28f +
           depth * (0.52f + shallow_flavor * 0.18f + abyss_flavor * 0.12f + clean_flavor * 0.28f) +
           contribution_cross_patch * 0.48f +
           clean_tape_pitch_focus * 0.34f +
           rate * (0.05f + shallow_flavor * 0.09f + abyss_flavor * 0.06f + clean_flavor * 0.08f)) *
          abyss_pitch_motion_trim;
      const float corrosion = unit(raw_corrosion * erosion_failure_influence * 0.72f + erosion_generation * 0.035f + shaped_alias * 0.025f);
      const bool shared_filter_active = drift_enabled || erosion_enabled;
      const float shared_hp = shared_filter_active ? unit(fx.dynamics_degrade_hp) : 0.0f;
      const float shared_lp = shared_filter_active ? unit(fx.dynamics_degrade_lp) : 1.0f;
      const float hp = std::max(shared_hp, damage * 0.025f + corrosion * 0.012f);
      const float lp_ceiling = std::max(
          0.08f,
          1.0f -
              damage * 0.2f -
              corrosion * 0.1f -
              media_wear * erosion_mix * 0.08f -
              digital_damage * 0.05f -
              mod_lp * 0.08f);
      const float lp = std::max(0.08f, std::min(shared_lp, lp_ceiling));
      const float resonance = drift_enabled
          ? std::max(unit(fx.dynamics_drift_resonance), mode_active ? default_resonance : 0.2f)
          : 0.2f;
      const float damage_activity = erosion_enabled
          ? unit(raw_erosion_age + raw_erosion_generation + raw_erosion_alias + raw_corrosion + unit(fx.dynamics_erosion_noise) + unit(fx.dynamics_erosion_saturation))
          : 0.0f;
      const float noise = erosion_enabled
          ? unit(unit(fx.dynamics_erosion_noise) * erosion_influence * 0.55f + erosion_mix * (media_wear * 0.025f + digital_damage * 0.012f))
          : 0.0f;
      const float drift_drive = drift_enabled
          ? drift_mix * (shallow_flavor * 0.07f + abyss_flavor * (0.06f + env_follow * 0.04f) + drift_age * 0.06f)
          : 0.0f;
      const float erosion_nonlinear_color = erosion_enabled
          ? unit(erosion_generation * 0.015f + shaped_alias * 0.012f + corrosion * 0.018f)
          : 0.0f;
      const float saturation = unit(
          (erosion_enabled ? unit(fx.dynamics_erosion_saturation) * erosion_influence * 0.55f + erosion_nonlinear_color : 0.0f) +
          drift_drive);
      const float tone = 0.5f + ((erosion_enabled ? unit(fx.dynamics_erosion_tone) : 0.5f) - 0.5f) * erosion_influence;
      const float dropout = damage_activity > 0.0001f
          ? unit(
                erosion_failure_influence *
                    (media_wear * 0.25f +
                     corrosion * 0.28f +
                     erosion_generation * 0.06f +
                     noise * 0.08f +
                     raw_erosion_alias * 0.035f) +
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
      const float drift_hold_rate_hz = shallow_flavor > 0.0f
          ? 0.16f + rate * 1.75f + depth * 0.4f
          : (abyss_flavor > 0.0f
                ? 0.1f + rate * 1.15f + depth * 0.26f + env_follow * 0.04f
                : 0.12f + rate * 1.05f + depth * 0.32f);
      const float erosion_motion_weight = erosion_enabled ? unit(erosion_motion_influence * (0.65f + erosion_wet_ratio * 0.35f)) : 0.0f;
      const float erosion_hold_rate_hz =
          0.02f + erosion_wobble_speed * 0.58f + raw_drift * 0.11f + contribution_material_wear * 0.075f + contribution_alias_damage * 0.035f;
      const float random_hold_rate_hz =
          drift_hold_rate_hz + (erosion_hold_rate_hz - drift_hold_rate_hz) * erosion_motion_weight;
      const float drift_hold_lag = shallow_flavor > 0.0f
          ? 0.08f + damp * 0.52f
          : (abyss_flavor > 0.0f ? 0.12f + damp * 0.68f : 0.1f + damp * 0.58f);
      const float erosion_hold_lag = std::max(
          0.18f,
          1.3f - erosion_wobble_speed * 0.98f + raw_media_wear * (0.2f + (1.0f - erosion_wobble_speed) * 0.16f));
      const float random_hold_lag =
          drift_hold_lag + (erosion_hold_lag - drift_hold_lag) * erosion_motion_weight;
      const float erosion_level_trim = erosion_enabled
          ? std::max(0.7f, 1.0f - erosion_wet_ratio * (0.12f + raw_media_wear * 0.12f + raw_corrosion * 0.16f + raw_erosion_alias * 0.1f))
          : 1.0f;
      const float clean_comb_tame =
          clean_flavor * unit(erosion_mix * (0.85f + contribution_material_wear * 0.35f + contribution_alias_damage * 0.18f));
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
      const float shallow_random_delay_base = 0.00095f + (0.00080f - 0.00095f) * drift_anti_comb;
      const float shallow_random_delay_depth = 0.0104f + (0.0056f - 0.0104f) * drift_anti_comb;
      const float shallow_random_delay_rate = 0.0009f + (0.00065f - 0.0009f) * drift_anti_comb;
      const float shallow_random_delay_bbd = 0.0024f + (0.0014f - 0.0024f) * drift_anti_comb;
      const float random_delay_depth = clean_flavor > 0.0f
          ? random_drift *
              (0.00008f +
               depth * 0.0018f +
               rate * 0.00065f +
               mod_flutter * 0.00018f +
               contribution_material_wear * 0.00024f +
               contribution_alias_damage * 0.00011f)
          : (shallow_flavor > 0.0f
                ? random_drift * (shallow_random_delay_base + depth * shallow_random_delay_depth + rate * shallow_random_delay_rate + contribution_bbd_color * shallow_random_delay_bbd)
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
          ? unitToLogFrequency(drift_bias, 500.0f, 12000.0f)
          : (shallow_flavor > 0.0f
                ? water_bias_floor(drift_bias, 140.0f, 220.0f, 1800.0f)
                : water_bias_floor(drift_bias, 130.0f, 205.0f, 1200.0f));
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
      const float drift_wow_frequency = clean_flavor > 0.0f
          ? 0.03f + rate * 0.48f + depth * 0.12f + drift * 0.1f
          : 0.052f + rate * 0.82f + depth * 0.16f + drift * 0.28f;
      const float erosion_wow_frequency = clean_flavor > 0.0f
          ? 0.012f + std::pow(erosion_wobble_speed, 1.35f) * 0.11f + drift * 0.035f + contribution_material_wear * 0.025f + mod_wow * 0.018f
          : 0.018f + erosion_wobble_speed * 0.36f + drift * 0.12f + contribution_material_wear * 0.05f + mod_wow * 0.04f;
      const float wow_frequency =
          drift_wow_frequency + (erosion_wow_frequency - drift_wow_frequency) * erosion_motion_weight;
      const bool master_sat_active = saturation_enabled;
      const float master_sat_drive = master_sat_active ? unit(fx.dynamics_saturation_drive) : 0.0f;
      const float master_sat_quality = static_cast<float>(clampU32(fx.dynamics_saturation_quality, 0u, 2u));
      const float end_wet = end_comp_enabled ? unit(fx.dynamics_end_comp_mix) : 0.0f;
      const float end_comp_mode = static_cast<float>(clampU32(fx.dynamics_end_comp_mode, 0u, 4u));
      const float end_comp_peak_blend = unit(fx.dynamics_end_comp_peak_blend);
      const float end_comp_clarity = unit(fx.dynamics_end_comp_clarity);
      const float end_comp_two_band_amount = fx.dynamics_end_comp_mode == 4u ? unit(fx.dynamics_end_comp_two_band_amount) : 0.0f;
      const float end_comp_band_split_hz = unitToLogFrequency(fx.dynamics_end_comp_band_split, 90.0f, 320.0f);
      const bool worklet_active = wet > 0.0001f || master_sat_drive > 0.0001f || (end_comp_enabled && end_wet > 0.0001f);
      const float comb_risk_for_allpass = unit(4.0f * dry * wet);

      params[kDynActive] = worklet_active ? 1.0f : 0.0f;
      params[kDynAllpassActive] = (mode_active && drift_diffusion > 0.001f && comb_risk_for_allpass > 0.18f) ? 1.0f : 0.0f;
      params[kDynDry] = dry;
      params[kDynWet] = wet;
      params[kDynErosionMix] = erosion_wet_ratio;
      params[kDynErosionAlias] = worklet_alias;
      params[kDynErosionGeneration] = raw_erosion_generation;
      params[kDynErosionCorrosion] = raw_corrosion;
      params[kDynErosionWear] = raw_media_wear;
      params[kDynNoiseGain] = std::min(0.018f, wet * noise * (0.006f + age * 0.014f + corrosion * 0.012f)) * erosion_level_trim;
      params[kDynJitterDepth] = damage_activity > 0.0001f
          ? erosion_failure_influence *
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
          (1.0f - stereo * (0.14f + shallow_flavor * 0.12f)) * (1.0f - clean_comb_tame * 0.08f) * erosion_level_trim;
      params[kDynSpreadDelayGain] =
          stereo *
          (clean_flavor > 0.0f
               ? (0.05f + depth * 0.12f) * (1.0f - clean_comb_tame * 0.34f)
               : 0.16f + depth * (0.4f + shallow_flavor * 0.18f)) *
          erosion_level_trim;
      params[kDynWowFrequency] = wow_frequency;
      params[kDynFlutterFrequency] =
          2.4f + rate * (6.2f + shallow_flavor * 4.2f + abyss_flavor * 2.2f) + flutter * (4.6f + corrosion * 3.0f);
      params[kDynFlutterRandomDepth] =
          erosion_mix *
          unit(0.2f + mod_flutter * 1.8f + contribution_flutter_jitter * 0.5f + corrosion * 0.25f) *
          (0.00004f + flutter * 0.00082f + mod_flutter * 0.00048f);
      params[kDynWowDepth] = wow_depth;
      params[kDynFlutterDepth] = flutter_depth;
      params[kDynHighpassHz] = unitToLogFrequency(hp, 20.0f, 2400.0f);
      params[kDynHighpassQ] = 0.7f + resonance * 1.5f;
      params[kDynAllpassAFrequency] =
          420.0f + shallow_flavor * 480.0f + abyss_flavor * 620.0f + depth * 420.0f + age * 180.0f;
      params[kDynAllpassAQ] =
          std::min(0.95f, 0.55f + shallow_flavor * 0.18f + abyss_flavor * 0.14f + depth * 0.18f);
      params[kDynAllpassBFrequency] =
          1450.0f + shallow_flavor * 1850.0f + abyss_flavor * 1250.0f + depth * 950.0f + age * 360.0f;
      params[kDynAllpassBQ] =
          std::min(0.85f, 0.48f + shallow_flavor * 0.16f + abyss_flavor * 0.12f + depth * 0.16f);
      params[kDynHeadBumpFrequency] = 80.0f + media_wear * 45.0f + corrosion * 20.0f;
      params[kDynHeadBumpQ] = 0.55f + media_wear * 0.55f;
      params[kDynHeadBumpGain] =
          erosion_mix * 1.1f * (0.2f + media_wear * 0.65f) * erosion_level_trim +
          drift_mix * (abyss_flavor * 0.28f + shallow_flavor * 0.22f);
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
              drift_mix *
              (abyss_flavor > 0.0f ? 0.08f : (shallow_flavor > 0.0f ? 0.045f : 0.012f)) +
          mod_wet * erosion_mix * 0.03f;
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
      params[kDynCompressorThreshold] = drift_enabled
          ? -16.0f - drift_mix * (shallow_flavor * 10.0f + abyss_flavor * 7.0f)
          : -4.0f;
      params[kDynCompressorKnee] = 10.0f + shallow_flavor * 10.0f + abyss_flavor * 8.0f;
      params[kDynCompressorRatio] = 1.2f + shallow_flavor * 0.8f + abyss_flavor * 0.9f + env_follow * abyss_flavor * 0.35f;
      params[kDynCompressorAttack] = 0.004f + shallow_flavor * 0.014f + abyss_flavor * 0.003f;
      params[kDynCompressorRelease] = 0.12f + shallow_flavor * 0.1f + abyss_flavor * 0.18f + damp * 0.08f;
      params[kDynCompressorMakeup] = 1.0f + drift_mix * (shallow_flavor * 0.05f + abyss_flavor * 0.16f);
      params[kDynSaturation] = saturation;
      params[kDynCorrosion] = corrosion;
      params[kDynMasterSatActive] = master_sat_drive > 0.0001f ? 1.0f : 0.0f;
      params[kDynMasterSatMode] = static_cast<float>(master_sat_active ? clampU32(fx.dynamics_saturation_mode, 0u, 4u) : 0u);
      params[kDynMasterSatDrive] = master_sat_drive;
      params[kDynMasterSatTone] = master_sat_active ? unit(fx.dynamics_saturation_tone) : 0.5f;
      params[kDynMasterSatBias] = master_sat_active ? unit(fx.dynamics_saturation_bias) : 0.5f;
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
      params[kDynDriftQuality] = drift_quality;
      params[kDynDriftAntiComb] = drift_anti_comb;
      params[kDynDriftDiffusion] = drift_diffusion;
      params[kDynErosionUiMix] = erosion_mix;
      params[kDynErosionColorInfluence] = erosion_color_influence;
      params[kDynErosionMotionInfluence] = erosion_motion_influence;
      params[kDynErosionFailureInfluence] = erosion_failure_influence;
      params[kDynErosionQuality] = erosion_quality;
      params[kDynErosionEventAmount] = erosion_event_amount;
      params[kDynErosionProfileAmount] = erosion_profile_amount;
      params[kDynErosionDitherAmount] = erosion_dither_amount;
      params[kDynEndCompMode] = end_comp_mode;
      params[kDynEndCompPeakBlend] = end_comp_peak_blend;
      params[kDynEndCompClarity] = end_comp_clarity;
      params[kDynEndCompTwoBandAmount] = end_comp_two_band_amount;
      params[kDynEndCompBandSplitHz] = end_comp_band_split_hz;
      params[kDynMasterSatQuality] = master_sat_quality;
      module->commitParams();
  };
  configure_module(dynamics_drift_module.get(), false, true);
  configure_module(dynamics_degrade_send_module.get(), true, false);
}
