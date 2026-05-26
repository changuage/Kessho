#include "KesshoProductEngineInternal.h"

  void KesshoProductEngine::resetDiffuseRuntime() {
  diffuse_highpass = {};
  diffuse_lowpass = {};
  diffuse_delay_index = 0u;
  std::fill(diffuse_delay_l, diffuse_delay_l + kDiffuseDelayMaxFrames, 0.0f);
  std::fill(diffuse_delay_r, diffuse_delay_r + kDiffuseDelayMaxFrames, 0.0f);
  diffuse_bus_active_this_block = false;
  diffuse_runtime_active = false;
  diffuse_idle_frames_remaining = 0u;
}

  void KesshoProductEngine::updateProductBiquadCoefficients(
      ProductBiquadFilterState& filter,
      float cutoff_hz,
      uint32_t type) {
  const float nyquist_limit = static_cast<float>(sample_rate * 0.499);
  const float cutoff = clampFloat(cutoff_hz, 20.0f, std::max(20.0f, nyquist_limit));
  if (std::abs(filter.coeff_cutoff - cutoff) <= 0.0001f && filter.coeff_type == type) {
    return;
  }

  constexpr float kWebAudioQ07 = 1.0839269140212036f; // pow(10, 0.7 / 20)
  const float omega = static_cast<float>((kTwoPi * static_cast<double>(cutoff)) / sample_rate);
  const float sin_omega = std::sin(omega);
  const float cos_omega = std::cos(omega);
  const float alpha = sin_omega / (2.0f * kWebAudioQ07);
  const float a0 = 1.0f + alpha;
  if (type == kProductBiquadHighpass) {
    filter.b0 = ((1.0f + cos_omega) * 0.5f) / a0;
    filter.b1 = -(1.0f + cos_omega) / a0;
    filter.b2 = ((1.0f + cos_omega) * 0.5f) / a0;
  } else {
    filter.b0 = ((1.0f - cos_omega) * 0.5f) / a0;
    filter.b1 = (1.0f - cos_omega) / a0;
    filter.b2 = ((1.0f - cos_omega) * 0.5f) / a0;
  }
  filter.a1 = (-2.0f * cos_omega) / a0;
  filter.a2 = (1.0f - alpha) / a0;
  filter.coeff_cutoff = cutoff;
  filter.coeff_type = type;
}

  float KesshoProductEngine::processProductBiquadSample(
      const ProductBiquadFilterState& filter,
      BiquadState& state,
      float input) const {
  const float y =
      filter.b0 * input +
      filter.b1 * state.x1 +
      filter.b2 * state.x2 -
      filter.a1 * state.y1 -
      filter.a2 * state.y2;
  state.x2 = state.x1;
  state.x1 = input;
  state.y2 = state.y1;
  state.y1 = std::isfinite(y) ? y : 0.0f;
  return state.y1;
}

  void KesshoProductEngine::renderDiffuseBus(float* out_l, float* out_r, uint32_t frames) {
  if (out_l == nullptr || out_r == nullptr || frames == 0u) {
    return;
  }
  if (!diffuse_bus_active_this_block && !diffuse_runtime_active) {
    return;
  }
  const uint32_t idle_release_frames = std::max<uint32_t>(
      frames,
      static_cast<uint32_t>(std::ceil(sample_rate * static_cast<double>(kDiffuseIdleReleaseSeconds))));
  if (diffuse_bus_active_this_block) {
    diffuse_runtime_active = true;
    diffuse_idle_frames_remaining = idle_release_frames;
  }
  updateProductBiquadCoefficients(diffuse_highpass, kDiffuseHighpassHz, kProductBiquadHighpass);
  updateProductBiquadCoefficients(diffuse_lowpass, kDiffuseLowpassHz, kProductBiquadLowpass);
  const uint32_t delay_frames = clampU32(
      static_cast<uint32_t>(std::lround(sample_rate * static_cast<double>(kDiffuseHaasDelayMs) * 0.001)),
      1u,
      kDiffuseDelayMaxFrames - 1u);

  float block_peak = 0.0f;
  for (uint32_t i = 0; i < frames; ++i) {
    const float high_l = processProductBiquadSample(diffuse_highpass, diffuse_highpass.left, diffuse_bus_l[i]);
    const float high_r = processProductBiquadSample(diffuse_highpass, diffuse_highpass.right, diffuse_bus_r[i]);
    const float filtered_l = processProductBiquadSample(diffuse_lowpass, diffuse_lowpass.left, high_l);
    const float filtered_r = processProductBiquadSample(diffuse_lowpass, diffuse_lowpass.right, high_r);

    const uint32_t read_index =
        (diffuse_delay_index + kDiffuseDelayMaxFrames - delay_frames) % kDiffuseDelayMaxFrames;
    const float delayed_l = diffuse_delay_l[read_index];
    const float delayed_r = diffuse_delay_r[read_index];
    diffuse_delay_l[diffuse_delay_index] = filtered_l;
    diffuse_delay_r[diffuse_delay_index] = filtered_r;
    diffuse_delay_index = (diffuse_delay_index + 1u) % kDiffuseDelayMaxFrames;

    const float center_l = filtered_l * kDiffuseHaasCenterGain;
    const float center_r = filtered_r * kDiffuseHaasCenterGain;
    const float spread_l = center_l + (filtered_l + filtered_r) * kDiffuseHaasSideGain;
    const float spread_r = center_r + (delayed_l + delayed_r) * kDiffuseHaasSideGain;
    const float out_left = spread_l * kDiffuseOutputGain;
    const float out_right = spread_r * kDiffuseOutputGain;
    const float reverb_left = spread_l * kDiffuseReverbSendGain;
    const float reverb_right = spread_r * kDiffuseReverbSendGain;
    block_peak = std::max(block_peak, std::max(
        std::max(std::fabs(out_left), std::fabs(out_right)),
        std::max(std::fabs(reverb_left), std::fabs(reverb_right))));

    if (graph_taps_enabled) {
      graph_diffuse_output_l[i] = out_left;
      graph_diffuse_output_r[i] = out_right;
      graph_diffuse_reverb_send_l[i] = reverb_left;
      graph_diffuse_reverb_send_r[i] = reverb_right;
    }
    out_l[i] += out_left;
    out_r[i] += out_right;
    reverb_bus_l[i] += reverb_left;
    reverb_bus_r[i] += reverb_right;
  }
  if (!diffuse_bus_active_this_block && diffuse_runtime_active) {
    diffuse_idle_frames_remaining =
        diffuse_idle_frames_remaining > frames ? diffuse_idle_frames_remaining - frames : 0u;
    if (diffuse_idle_frames_remaining == 0u && block_peak <= kDiffuseIdleSleepPeak) {
      resetDiffuseRuntime();
    }
  }
}

  void KesshoProductEngine::renderSampleVoices(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  bool has_active_voice = false;
  bool source_has_active_voice[kSourceCount]{};
  for (const Voice& voice : voices) {
    if (voice.active && voice.source_id >= 1u && voice.source_id <= kSourceCount) {
      has_active_voice = true;
      source_has_active_voice[voice.source_id - 1u] = true;
    }
  }
  if (!has_active_voice) {
    return;
  }
  float source_gates[kSourceCount][kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES]{};
  for (uint32_t source_index = 0u; source_index < kSourceCount; ++source_index) {
    if (!source_has_active_voice[source_index]) {
      continue;
    }
    SourceState& source = sources[source_index];
    for (uint32_t i = 0; i < frames; ++i) {
      source_gates[source_index][i] = sourceEnableGainForFrame(source, transport.sample_frame + i);
    }
  }
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    for (Voice& voice : voices) {
      if (!voice.active) {
        continue;
      }
      if (voice.source_id < 1u || voice.source_id > kSourceCount) {
        voice.active = false;
        continue;
      }
      float value_l = 0.0f;
      float value_r = 0.0f;
      renderVoiceSample(voice, value_l, value_r);
      SourceState& source = sources[voice.source_id - 1u];
      const float source_gate = source_gates[voice.source_id - 1u][i];
      if (voice.source_id == KESSHO_PRODUCT_SOURCE_SOUNDSCAPE &&
          voice.sample_voice &&
          voice.soundscape_texture_voice &&
          voice.age_frames > 0u &&
          voice.asset_slot < kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS &&
          assets[voice.asset_slot].active) {
        processSoundscapeTextureSpatial(assets[voice.asset_slot].asset_id, value_l, value_r);
      }
      const float pan_l = voice.pan <= 0.0f ? 1.0f : 1.0f - voice.pan * 0.5f;
      const float pan_r = voice.pan >= 0.0f ? 1.0f : 1.0f + voice.pan * 0.5f;
      const uint32_t sidechain_target = sidechainTargetForSource(voice.source_id);
      const float duck_gain = sidechainGain(sidechain_target, frame);
      const bool piano_voice = voice.source_id == KESSHO_PRODUCT_SOURCE_PIANO;
      const bool soundscape_sample =
          voice.source_id == KESSHO_PRODUCT_SOURCE_SOUNDSCAPE &&
          voice.sample_voice &&
          voice.asset_slot < kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS &&
          assets[voice.asset_slot].active;
      float send_left = value_l * source.dry_gain * pan_l * source_gate;
      float send_right = value_r * source.dry_gain * pan_r * source_gate;
      float dry_left = send_left;
      float dry_right = send_right;
      if (!soundscape_sample) {
        processVoicePostChain(voice, dry_left, dry_right);
        if (piano_voice) {
          send_left = dry_left;
          send_right = dry_right;
          dry_left *= source.level * kPianoSampleParityTrim;
          dry_right *= source.level * kPianoSampleParityTrim;
        } else {
          dry_left *= source.level;
          dry_right *= source.level;
        }
      }
      uint32_t soundscape_layer = kSoundscapeLayerCount;
      float soundscape_asset_level = 1.0f;
      float soundscape_earth_level = 1.0f;
      float graph_dry_left = dry_left;
      float graph_dry_right = dry_right;
      float output_dry_left = dry_left;
      float output_dry_right = dry_right;
      float layer_send_left = send_left;
      float layer_send_right = send_right;
      if (soundscape_sample) {
        soundscape_layer = soundscapeLayerIndexForAsset(assets[voice.asset_slot].asset_id);
        soundscape_asset_level = soundscapeAssetRefLevel(source, assets[voice.asset_slot].asset_id);
        if (source.soundscape_module_param_count > kSoundscapeModuleEarthLevelParam) {
          soundscape_earth_level =
              clampFloat(source.soundscape_module_params[kSoundscapeModuleEarthLevelParam], 0.0f, 2.0f);
        }
        graph_dry_left = dry_left * soundscape_asset_level;
        graph_dry_right = dry_right * soundscape_asset_level;
        output_dry_left = graph_dry_left * soundscape_earth_level;
        output_dry_right = graph_dry_right * soundscape_earth_level;
        layer_send_left = send_left * soundscape_asset_level;
        layer_send_right = send_right * soundscape_asset_level;
      }
      const float left = output_dry_left * duck_gain;
      const float right = output_dry_right * duck_gain;
      if (graph_taps_enabled || source.diffuse_send > 0.0f) {
        recordSourceGraphTaps(
            voice.source_id,
            frame,
            source,
            graph_dry_left,
            graph_dry_right,
            left,
            right,
            send_left,
            send_right);
      }
      float reverb_send = source.reverb_send;
      float delay_a_send = source.delay_a_send;
      float delay_b_send = source.delay_b_send;
      float granular_send = source.granular_send;
      if (soundscape_sample) {
        if (soundscape_layer < kSoundscapeLayerCount) {
          reverb_send = soundscapeLayerRouteSend(source, soundscape_layer, kSoundscapeLayerRouteReverb, reverb_send);
          delay_a_send = soundscapeLayerRouteSend(source, soundscape_layer, kSoundscapeLayerRouteDelayA, delay_a_send);
          delay_b_send = soundscapeLayerRouteSend(source, soundscape_layer, kSoundscapeLayerRouteDelayB, delay_b_send);
          granular_send = soundscapeLayerRouteSend(source, soundscape_layer, kSoundscapeLayerRouteGranular, granular_send);
          if (graph_taps_enabled) {
            graph_soundscape_layer_dry_l[soundscape_layer][frame] += graph_dry_left;
            graph_soundscape_layer_dry_r[soundscape_layer][frame] += graph_dry_right;
            graph_soundscape_layer_reverb_send_l[soundscape_layer][frame] += layer_send_left * reverb_send;
            graph_soundscape_layer_reverb_send_r[soundscape_layer][frame] += layer_send_right * reverb_send;
            graph_soundscape_layer_delay_a_send_l[soundscape_layer][frame] += layer_send_left * delay_a_send;
            graph_soundscape_layer_delay_a_send_r[soundscape_layer][frame] += layer_send_right * delay_a_send;
            graph_soundscape_layer_delay_b_send_l[soundscape_layer][frame] += layer_send_left * delay_b_send;
            graph_soundscape_layer_delay_b_send_r[soundscape_layer][frame] += layer_send_right * delay_b_send;
            graph_soundscape_layer_granular_send_l[soundscape_layer][frame] += layer_send_left * granular_send;
            graph_soundscape_layer_granular_send_r[soundscape_layer][frame] += layer_send_right * granular_send;
          }
        }
      }
      out_l[frame] += left;
      out_r[frame] += right;
      if (voice.source_id < kStemCount) {
        stem_l[voice.source_id][frame] += left;
        stem_r[voice.source_id][frame] += right;
      }
      const float bus_send_left = soundscape_sample ? layer_send_left : send_left;
      const float bus_send_right = soundscape_sample ? layer_send_right : send_right;
      reverb_bus_l[frame] += bus_send_left * reverb_send;
      reverb_bus_r[frame] += bus_send_right * reverb_send;
      delay_a_bus_l[frame] += bus_send_left * delay_a_send;
      delay_a_bus_r[frame] += bus_send_right * delay_a_send;
      delay_b_bus_l[frame] += bus_send_left * delay_b_send;
      delay_b_bus_r[frame] += bus_send_right * delay_b_send;
      granular_bus_l[frame] += bus_send_left * granular_send;
      granular_bus_r[frame] += bus_send_right * granular_send;
    }
  }
}

  void KesshoProductEngine::renderSegment(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  renderSidechainGains(start, frames);
  renderProductModules(out_l, out_r, start, frames);
  renderSampleVoices(out_l, out_r, start, frames);
}

  void KesshoProductEngine::applyMaster(float* out_l, float* out_r, uint32_t frames) {
  for (uint32_t i = 0; i < frames; ++i) {
    out_l[i] *= master_gain;
    out_r[i] *= master_gain;
    if (graph_taps_enabled) {
      graph_dynamics_input_l[i] = out_l[i];
      graph_dynamics_input_r[i] = out_r[i];
    }
  }
  renderDynamics(out_l, out_r, frames);
  if (graph_taps_enabled) {
    for (uint32_t i = 0; i < frames; ++i) {
      graph_dynamics_output_l[i] = out_l[i];
      graph_dynamics_output_r[i] = out_r[i];
    }
  }
  const float ceiling = master_limiter_ceiling_gain;
  float master_input_peak = 0.0f;
  float master_output_peak = 0.0f;
  float master_true_peak = 0.0f;
  double master_output_sum_squares = 0.0;
  double master_loudness_energy = 0.0;
  float limiter_gain_reduction_db = 0.0f;
  for (uint32_t i = 0; i < frames; ++i) {
    const float pre_limiter_l = out_l[i];
    const float pre_limiter_r = out_r[i];
    if (graph_taps_enabled) {
      graph_master_pre_limiter_l[i] = pre_limiter_l;
      graph_master_pre_limiter_r[i] = pre_limiter_r;
    }
    const float input_peak = std::max(std::fabs(pre_limiter_l), std::fabs(pre_limiter_r));
    master_input_peak = std::max(master_input_peak, input_peak);
    if (input_peak > ceiling && ceiling > 0.0f) {
      limiter_gain_reduction_db = std::max(
          limiter_gain_reduction_db,
          20.0f * std::log10(input_peak / ceiling));
    }
    out_l[i] = clampFloat(pre_limiter_l, -ceiling, ceiling);
    out_r[i] = clampFloat(pre_limiter_r, -ceiling, ceiling);
    const float true_peak_l = std::max(
        std::fabs(out_l[i]),
        std::fabs((out_l[i] + master_true_peak_prev_l) * 0.5f));
    const float true_peak_r = std::max(
        std::fabs(out_r[i]),
        std::fabs((out_r[i] + master_true_peak_prev_r) * 0.5f));
    master_true_peak = std::max(master_true_peak, true_peak_l);
    master_true_peak = std::max(master_true_peak, true_peak_r);
    master_true_peak_prev_l = out_l[i];
    master_true_peak_prev_r = out_r[i];
    master_output_peak = std::max(master_output_peak, std::fabs(out_l[i]));
    master_output_peak = std::max(master_output_peak, std::fabs(out_r[i]));
    master_output_sum_squares += static_cast<double>(out_l[i]) * static_cast<double>(out_l[i]);
    master_output_sum_squares += static_cast<double>(out_r[i]) * static_cast<double>(out_r[i]);
    master_loudness_energy += static_cast<double>(out_l[i]) * static_cast<double>(out_l[i]);
    master_loudness_energy += static_cast<double>(out_r[i]) * static_cast<double>(out_r[i]);
    stem_l[KESSHO_PRODUCT_STEM_MASTER][i] = out_l[i];
    stem_r[KESSHO_PRODUCT_STEM_MASTER][i] = out_r[i];
  }
  master_integrated_loudness_energy += master_loudness_energy;
  master_integrated_loudness_frames += frames;
  const double integrated_mean_square = master_integrated_loudness_frames == 0u
      ? 0.0
      : master_integrated_loudness_energy / static_cast<double>(master_integrated_loudness_frames);
  telemetry.master_input_peak = master_input_peak;
  telemetry.master_output_peak = master_output_peak;
  telemetry.master_output_rms = frames == 0u
      ? 0.0f
      : static_cast<float>(std::sqrt(master_output_sum_squares / static_cast<double>(frames * 2u)));
  telemetry.master_limiter_gain_reduction_db = limiter_gain_reduction_db;
  telemetry.dynamics_saturation_drive = fx.dynamics_saturation_drive;
  telemetry.master_true_peak = master_true_peak;
  telemetry.master_true_peak_dbtp = gainToDb(master_true_peak);
  telemetry.master_integrated_lufs = integrated_mean_square <= 0.000000000001
      ? kProductTelemetrySilenceDb
      : static_cast<float>(-0.691 + 10.0 * std::log10(integrated_mean_square));
}

  void KesshoProductEngine::clearOutput(float* out_l, float* out_r, uint32_t frames) {
  for (uint32_t i = 0; i < frames; ++i) {
    out_l[i] = 0.0f;
    out_r[i] = 0.0f;
  }
  const uint32_t stem_frames = std::min<uint32_t>(frames, kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES);
  for (uint32_t stem = 0; stem < kStemCount; ++stem) {
    for (uint32_t i = 0; i < stem_frames; ++i) {
      stem_l[stem][i] = 0.0f;
      stem_r[stem][i] = 0.0f;
    }
  }
  for (uint32_t i = 0; i < stem_frames; ++i) {
    reverb_bus_l[i] = 0.0f;
    reverb_bus_r[i] = 0.0f;
    delay_a_bus_l[i] = delay_a_cross_carry_l[i];
    delay_a_bus_r[i] = delay_a_cross_carry_r[i];
    delay_a_cross_carry_l[i] = 0.0f;
    delay_a_cross_carry_r[i] = 0.0f;
    delay_b_bus_l[i] = 0.0f;
    delay_b_bus_r[i] = 0.0f;
    granular_bus_l[i] = 0.0f;
    granular_bus_r[i] = 0.0f;
    diffuse_bus_l[i] = 0.0f;
    diffuse_bus_r[i] = 0.0f;
    if (graph_taps_enabled) {
    graph_reverb_input_l[i] = 0.0f;
    graph_reverb_input_r[i] = 0.0f;
    graph_delay_a_input_l[i] = 0.0f;
    graph_delay_a_input_r[i] = 0.0f;
    graph_delay_b_input_l[i] = 0.0f;
    graph_delay_b_input_r[i] = 0.0f;
    graph_granular_input_l[i] = 0.0f;
    graph_granular_input_r[i] = 0.0f;
    graph_diffuse_input_l[i] = 0.0f;
    graph_diffuse_input_r[i] = 0.0f;
    graph_diffuse_output_l[i] = 0.0f;
    graph_diffuse_output_r[i] = 0.0f;
    graph_diffuse_reverb_send_l[i] = 0.0f;
    graph_diffuse_reverb_send_r[i] = 0.0f;
    for (uint32_t layer = 0; layer < kSoundscapeLayerCount; ++layer) {
      graph_soundscape_layer_dry_l[layer][i] = 0.0f;
      graph_soundscape_layer_dry_r[layer][i] = 0.0f;
      graph_soundscape_layer_reverb_send_l[layer][i] = 0.0f;
      graph_soundscape_layer_reverb_send_r[layer][i] = 0.0f;
      graph_soundscape_layer_delay_a_send_l[layer][i] = 0.0f;
      graph_soundscape_layer_delay_a_send_r[layer][i] = 0.0f;
      graph_soundscape_layer_delay_b_send_l[layer][i] = 0.0f;
      graph_soundscape_layer_delay_b_send_r[layer][i] = 0.0f;
      graph_soundscape_layer_granular_send_l[layer][i] = 0.0f;
      graph_soundscape_layer_granular_send_r[layer][i] = 0.0f;
    }
    graph_delay_a_output_l[i] = 0.0f;
    graph_delay_a_output_r[i] = 0.0f;
    graph_delay_a_reverb_send_l[i] = 0.0f;
    graph_delay_a_reverb_send_r[i] = 0.0f;
    graph_delay_a_to_delay_b_send_l[i] = 0.0f;
    graph_delay_a_to_delay_b_send_r[i] = 0.0f;
    graph_delay_a_to_granular_send_l[i] = 0.0f;
    graph_delay_a_to_granular_send_r[i] = 0.0f;
    graph_delay_b_output_l[i] = 0.0f;
    graph_delay_b_output_r[i] = 0.0f;
    graph_delay_b_reverb_send_l[i] = 0.0f;
    graph_delay_b_reverb_send_r[i] = 0.0f;
    graph_delay_b_to_delay_a_send_l[i] = 0.0f;
    graph_delay_b_to_delay_a_send_r[i] = 0.0f;
    graph_delay_b_to_granular_send_l[i] = 0.0f;
    graph_delay_b_to_granular_send_r[i] = 0.0f;
    graph_granular_output_l[i] = 0.0f;
    graph_granular_output_r[i] = 0.0f;
    graph_granular_reverb_send_l[i] = 0.0f;
    graph_granular_reverb_send_r[i] = 0.0f;
    graph_granular_to_delay_a_send_l[i] = 0.0f;
    graph_granular_to_delay_a_send_r[i] = 0.0f;
    graph_granular_to_delay_b_send_l[i] = 0.0f;
    graph_granular_to_delay_b_send_r[i] = 0.0f;
    graph_reverb_preconditioner_output_l[i] = 0.0f;
    graph_reverb_preconditioner_output_r[i] = 0.0f;
    graph_spectral_freeze_input_l[i] = 0.0f;
    graph_spectral_freeze_input_r[i] = 0.0f;
    graph_spectral_freeze_output_l[i] = 0.0f;
    graph_spectral_freeze_output_r[i] = 0.0f;
    graph_reverb_output_l[i] = 0.0f;
    graph_reverb_output_r[i] = 0.0f;
    graph_dynamics_input_l[i] = 0.0f;
    graph_dynamics_input_r[i] = 0.0f;
    graph_dynamics_output_l[i] = 0.0f;
    graph_dynamics_output_r[i] = 0.0f;
    graph_master_pre_limiter_l[i] = 0.0f;
    graph_master_pre_limiter_r[i] = 0.0f;
    for (uint32_t target = 0; target < kSidechainTargetCount; ++target) {
      graph_sidechain_input_l[target][i] = 0.0f;
      graph_sidechain_input_r[target][i] = 0.0f;
      graph_sidechain_output_l[target][i] = 0.0f;
      graph_sidechain_output_r[target][i] = 0.0f;
    }
    graph_drum_dry_l[i] = 0.0f;
    graph_drum_dry_r[i] = 0.0f;
    graph_drum_reverb_send_l[i] = 0.0f;
    graph_drum_reverb_send_r[i] = 0.0f;
    graph_drum_delay_a_send_l[i] = 0.0f;
    graph_drum_delay_a_send_r[i] = 0.0f;
    graph_drum_delay_b_send_l[i] = 0.0f;
    graph_drum_delay_b_send_r[i] = 0.0f;
    graph_drum_granular_send_l[i] = 0.0f;
    graph_drum_granular_send_r[i] = 0.0f;
    graph_pad1_dry_l[i] = 0.0f;
    graph_pad1_dry_r[i] = 0.0f;
    graph_pad1_reverb_send_l[i] = 0.0f;
    graph_pad1_reverb_send_r[i] = 0.0f;
    graph_pad1_delay_a_send_l[i] = 0.0f;
    graph_pad1_delay_a_send_r[i] = 0.0f;
    graph_pad1_delay_b_send_l[i] = 0.0f;
    graph_pad1_delay_b_send_r[i] = 0.0f;
    graph_pad1_granular_send_l[i] = 0.0f;
    graph_pad1_granular_send_r[i] = 0.0f;
    graph_pad1_diffuse_send_l[i] = 0.0f;
    graph_pad1_diffuse_send_r[i] = 0.0f;
    graph_pad2_dry_l[i] = 0.0f;
    graph_pad2_dry_r[i] = 0.0f;
    graph_pad2_reverb_send_l[i] = 0.0f;
    graph_pad2_reverb_send_r[i] = 0.0f;
    graph_pad2_delay_a_send_l[i] = 0.0f;
    graph_pad2_delay_a_send_r[i] = 0.0f;
    graph_pad2_delay_b_send_l[i] = 0.0f;
    graph_pad2_delay_b_send_r[i] = 0.0f;
    graph_pad2_granular_send_l[i] = 0.0f;
    graph_pad2_granular_send_r[i] = 0.0f;
    graph_pad2_diffuse_send_l[i] = 0.0f;
    graph_pad2_diffuse_send_r[i] = 0.0f;
    graph_lead1_dry_l[i] = 0.0f;
    graph_lead1_dry_r[i] = 0.0f;
    graph_lead1_reverb_send_l[i] = 0.0f;
    graph_lead1_reverb_send_r[i] = 0.0f;
    graph_lead1_delay_a_send_l[i] = 0.0f;
    graph_lead1_delay_a_send_r[i] = 0.0f;
    graph_lead1_delay_b_send_l[i] = 0.0f;
    graph_lead1_delay_b_send_r[i] = 0.0f;
    graph_lead1_granular_send_l[i] = 0.0f;
    graph_lead1_granular_send_r[i] = 0.0f;
    graph_lead1_diffuse_send_l[i] = 0.0f;
    graph_lead1_diffuse_send_r[i] = 0.0f;
    graph_lead2_dry_l[i] = 0.0f;
    graph_lead2_dry_r[i] = 0.0f;
    graph_lead2_reverb_send_l[i] = 0.0f;
    graph_lead2_reverb_send_r[i] = 0.0f;
    graph_lead2_delay_a_send_l[i] = 0.0f;
    graph_lead2_delay_a_send_r[i] = 0.0f;
    graph_lead2_delay_b_send_l[i] = 0.0f;
    graph_lead2_delay_b_send_r[i] = 0.0f;
    graph_lead2_granular_send_l[i] = 0.0f;
    graph_lead2_granular_send_r[i] = 0.0f;
    graph_lead2_diffuse_send_l[i] = 0.0f;
    graph_lead2_diffuse_send_r[i] = 0.0f;
    graph_piano_dry_l[i] = 0.0f;
    graph_piano_dry_r[i] = 0.0f;
    graph_piano_reverb_send_l[i] = 0.0f;
    graph_piano_reverb_send_r[i] = 0.0f;
    graph_piano_delay_a_send_l[i] = 0.0f;
    graph_piano_delay_a_send_r[i] = 0.0f;
    graph_piano_delay_b_send_l[i] = 0.0f;
    graph_piano_delay_b_send_r[i] = 0.0f;
    graph_piano_granular_send_l[i] = 0.0f;
    graph_piano_granular_send_r[i] = 0.0f;
    graph_piano_diffuse_send_l[i] = 0.0f;
    graph_piano_diffuse_send_r[i] = 0.0f;
    }
  }
  diffuse_bus_active_this_block = false;
  last_stem_frames = stem_frames;
}

void KesshoProductEngine::render(float* out_l, float* out_r, uint32_t frames) {
  if (out_l == nullptr || out_r == nullptr || frames == 0u) {
    return;
  }
  if (frames > max_block_size || frames > kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES) {
    clearOutput(out_l, out_r, std::min<uint32_t>(frames, max_block_size));
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_RENDER_BLOCK_TOO_LARGE;
    return;
  }

  clearOutput(out_l, out_r, frames);

  uint32_t control_index = 0;
  while (control_index < control_event_count && control_events[control_index].event.sample_offset == 0u) {
    applyControlEvent(control_events[control_index].event);
    ++control_index;
  }

  advanceModulationRanges(frames);
  advanceGranularPhraseReseed();
  advanceReverbHarmonyCoupling(frames);
  ensureSoundscapeVoice();
  generateSequencerEvents(frames);
  uint32_t sequencer_index = 0;

  uint32_t cursor = 0;
  while (cursor < frames) {
    while (control_index < control_event_count && control_events[control_index].event.sample_offset == cursor) {
      applyControlEvent(control_events[control_index].event);
      ++control_index;
    }
    while (sequencer_index < sequencer_events.count && sequencer_events.events[sequencer_index].sample_offset == cursor) {
      triggerSequencerEvent(sequencer_events.events[sequencer_index]);
      ++sequencer_index;
    }

    uint32_t next_event_offset = frames;
    if (control_index < control_event_count) {
      next_event_offset = std::min(next_event_offset, control_events[control_index].event.sample_offset);
    }
    if (sequencer_index < sequencer_events.count) {
      next_event_offset = std::min(next_event_offset, sequencer_events.events[sequencer_index].sample_offset);
    }
    if (next_event_offset <= cursor) {
      next_event_offset = cursor + 1u;
    }
    const uint32_t segment_frames = next_event_offset - cursor;
    renderSegment(out_l, out_r, cursor, segment_frames);
    if (transport.running) {
      transport.sample_frame += segment_frames;
    }
    cursor = next_event_offset;
  }

  renderDiffuseBus(out_l, out_r, frames);
  renderFx(out_l, out_r, 0u, frames);
  applyMaster(out_l, out_r, frames);
  compactControlEvents(frames, control_index);
  advanceJourney(frames);
  product_render_frame += frames;
  updateTelemetry(frames);
}
