#include "../KesshoProductEngineInternal.h"

void KesshoProductEngine::configureReverbModule() {
  if (fx_configuration_batch_depth > 0u) {
    reverb_configuration_pending = true;
    return;
  }
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
