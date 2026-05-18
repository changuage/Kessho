#include "../KesshoProductEngineInternal.h"

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

  void KesshoProductEngine::resetSonicParityFxRuntime() {
  if (delay_a_module) {
    delay_a_module->reset();
  }
  if (delay_b_module) {
    delay_b_module->reset();
  }
  if (reverb_module) {
    reverb_module->reset();
  }
  if (granular_module) {
    granular_module->reset();
  }
  if (spectral_freeze_module) {
    spectral_freeze_module->reset();
  }
  if (dynamics_character_module) {
    dynamics_character_module->reset();
  }
  if (soundscapes_module) {
    soundscapes_module->reset();
    soundscapes_module_params_configured = false;
  }
  granular_output_lpf = {};
  granular_reverb_lpf = {};
  granular_reverb_comp_gain = 1.0f;
  reverb_pre_comp_gain = 1.0f;
  resetReverbHarmonyCoupling();
  resetGranularPhraseRuntime();
  std::fill(delay_a_cross_carry_l, delay_a_cross_carry_l + kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES, 0.0f);
  std::fill(delay_a_cross_carry_r, delay_a_cross_carry_r + kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES, 0.0f);
  resetSidechainRuntime();
  resetDiffuseRuntime();
  configureFxModules();
  configureSoundscapesModuleFromSource();
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
  const float release_tau_seconds = std::max(0.000001f, clampFloat(fx.sidechain_release_ms, 20.0f, 1500.0f) / 3000.0f);
  const float release_coeff = std::exp(-1.0f / static_cast<float>(release_tau_seconds * sample_rate));

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
    envelope.release_coeff = release_coeff;
  }
}

  float KesshoProductEngine::advanceSidechainEnvelope(SidechainEnvelope& envelope) {
  if (envelope.attack_elapsed < envelope.attack_frames) {
    ++envelope.attack_elapsed;
    const float t = static_cast<float>(envelope.attack_elapsed) / static_cast<float>(std::max(1u, envelope.attack_frames));
    envelope.current_gain = envelope.start_gain + (envelope.target_gain - envelope.start_gain) * t;
    return envelope.current_gain;
  }
  if (envelope.hold_remaining > 0u) {
    --envelope.hold_remaining;
    envelope.current_gain = envelope.target_gain;
    return envelope.current_gain;
  }
  if (envelope.release_coeff > 0.0f && std::fabs(envelope.current_gain - 1.0f) > 0.00001f) {
    ++envelope.release_elapsed;
    envelope.current_gain = 1.0f + (envelope.current_gain - 1.0f) * envelope.release_coeff;
    return envelope.current_gain;
  }
  envelope.current_gain = 1.0f;
  envelope.start_gain = 1.0f;
  envelope.target_gain = 1.0f;
  envelope.release_coeff = 0.0f;
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
    const float input_left = in_l[i] * gain;
    const float input_right = in_r[i] * gain;
    const float duck_gain = sidechainGain(sidechain_target, frame);
    const float left = input_left * duck_gain;
    const float right = input_right * duck_gain;
    if (sidechain_target < kSidechainTargetCount) {
      graph_sidechain_input_l[sidechain_target][frame] += input_left;
      graph_sidechain_input_r[sidechain_target][frame] += input_right;
      graph_sidechain_output_l[sidechain_target][frame] += left;
      graph_sidechain_output_r[sidechain_target][frame] += right;
    }
    out_l[frame] += left;
    out_r[frame] += right;
    stem_l[KESSHO_PRODUCT_STEM_FX][frame] += left;
    stem_r[KESSHO_PRODUCT_STEM_FX][frame] += right;
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
