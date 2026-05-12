#include "../KesshoProductEngineInternal.h"

  void KesshoProductEngine::schedulePadVoiceRelease(uint32_t pad_index, uint32_t voice_index, float hold_seconds) {
  if (pad_index >= static_cast<uint32_t>(PAD_NUM_PADS) || voice_index >= static_cast<uint32_t>(PAD_NUM_VOICES)) {
    return;
  }
  for (uint32_t pad = 0; pad < static_cast<uint32_t>(PAD_NUM_PADS); ++pad) {
    pad_voice_release_frames[pad][voice_index] = 0u;
  }
  if (!std::isfinite(hold_seconds) || hold_seconds <= 0.0f || sample_rate <= 0.0) {
    return;
  }
  const double requested_frames = static_cast<double>(hold_seconds) * sample_rate;
  pad_voice_release_frames[pad_index][voice_index] =
      static_cast<uint32_t>(std::max(1.0, std::min(requested_frames, static_cast<double>(UINT32_MAX))));
}

  void KesshoProductEngine::clearPadVoiceReleases(uint32_t source_id) {
  const bool clear_all = source_id == 0u;
  for (uint32_t pad = 0; pad < static_cast<uint32_t>(PAD_NUM_PADS); ++pad) {
    const uint32_t pad_source_id = pad == 0u ? KESSHO_PRODUCT_SOURCE_PAD1 : KESSHO_PRODUCT_SOURCE_PAD2;
    if (!clear_all && source_id != pad_source_id) {
      continue;
    }
    for (uint32_t voice = 0; voice < static_cast<uint32_t>(PAD_NUM_VOICES); ++voice) {
      pad_voice_release_frames[pad][voice] = 0u;
    }
  }
}

  void KesshoProductEngine::advancePadVoiceReleases(uint32_t frames) {
  if (!pad_module || frames == 0u) {
    return;
  }
  for (uint32_t pad = 0; pad < static_cast<uint32_t>(PAD_NUM_PADS); ++pad) {
    for (uint32_t voice = 0; voice < static_cast<uint32_t>(PAD_NUM_VOICES); ++voice) {
      uint32_t& remaining = pad_voice_release_frames[pad][voice];
      if (remaining == 0u) {
        continue;
      }
      if (remaining <= frames) {
        pad_module->noteOff(static_cast<int>(voice));
        remaining = 0u;
      } else {
        remaining -= frames;
      }
    }
  }
}

  void KesshoProductEngine::resetPadPostChains() {
  for (PadPostChainState& chain : pad_post_chains) {
    chain = {};
    chain.post_lpf_hz = kDefaultPadPostLpfHz;
    chain.stereo_width = kDefaultPadStereoWidth;
    updatePadPostChainCoefficients(chain);
  }
}

  float KesshoProductEngine::resolveSourcePostLpfHz(uint32_t source_id) const {
  if (source_id < 1u || source_id > kSourceCount) {
    return kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_HZ;
  }
  const SourceState& source = sources[source_id - 1u];
  float cutoff = source.post_lpf_hz;
  switch (source_id) {
    case KESSHO_PRODUCT_SOURCE_PAD1:
    case KESSHO_PRODUCT_SOURCE_PAD2:
      cutoff = distanceMultiply(cutoff, source.distance, 0.90f, 0.42f);
      break;
    case KESSHO_PRODUCT_SOURCE_LEAD1:
      cutoff = distanceMultiply(cutoff, source.distance, 0.88f, 0.38f);
      break;
    case KESSHO_PRODUCT_SOURCE_LEAD2:
      cutoff = distanceMultiply(cutoff, source.distance, 0.84f, 0.32f);
      break;
    case KESSHO_PRODUCT_SOURCE_PIANO:
      cutoff = distanceMultiply(cutoff, source.distance, 0.82f, 0.30f);
      break;
    default:
      break;
  }
  if (source_id == KESSHO_PRODUCT_SOURCE_LEAD1 || source_id == KESSHO_PRODUCT_SOURCE_LEAD2) {
    const float tracking = clampFloat(source.post_lpf_key_tracking, 0.0f, 1.0f);
    if (tracking > 0.0001f) {
      const float tracking_frequency = midiToFrequency(clampFloat(source.post_lpf_tracking_midi, 0.0f, 127.0f));
      const float ratio = clampFloat(tracking_frequency / midiToFrequency(60.0f), 0.125f, 8.0f);
      cutoff *= std::pow(ratio, tracking);
    }
  }
  return clampFloat(cutoff, 20.0f, 20000.0f);
}

  float KesshoProductEngine::resolveSourceStereoWidth(uint32_t source_id) const {
  if (source_id < 1u || source_id > kSourceCount) {
    return kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_STEREO_WIDTH;
  }
  const SourceState& source = sources[source_id - 1u];
  float width = source.stereo_width;
  switch (source_id) {
    case KESSHO_PRODUCT_SOURCE_PAD1:
    case KESSHO_PRODUCT_SOURCE_PAD2:
      width = distanceAdd(width, source.distance, -0.06f, -0.35f);
      break;
    case KESSHO_PRODUCT_SOURCE_LEAD1:
      width = distanceAdd(width, source.distance, -0.08f, -0.42f);
      break;
    case KESSHO_PRODUCT_SOURCE_LEAD2:
      width = distanceAdd(width, source.distance, -0.10f, -0.50f);
      break;
    case KESSHO_PRODUCT_SOURCE_PIANO:
      width = distanceAdd(width, source.distance, -0.06f, -0.28f);
      break;
    default:
      break;
  }
  return clampFloat(width, 0.0f, 1.0f);
}

  void KesshoProductEngine::updatePadPostChainCoefficients(PadPostChainState& chain) {
  const float nyquist_limit = static_cast<float>(sample_rate * 0.499);
  const float cutoff = clampFloat(chain.post_lpf_hz, 20.0f, std::max(20.0f, nyquist_limit));
  if (std::abs(chain.coeff_cutoff - cutoff) <= 0.0001f) {
    return;
  }

  constexpr float kWebAudioLowPassQ07 = 1.0839269140212036f; // pow(10, 0.7 / 20)
  const float omega = static_cast<float>((kTwoPi * static_cast<double>(cutoff)) / sample_rate);
  const float sin_omega = std::sin(omega);
  const float cos_omega = std::cos(omega);
  const float alpha = sin_omega / (2.0f * kWebAudioLowPassQ07);
  const float a0 = 1.0f + alpha;
  chain.b0 = ((1.0f - cos_omega) * 0.5f) / a0;
  chain.b1 = (1.0f - cos_omega) / a0;
  chain.b2 = ((1.0f - cos_omega) * 0.5f) / a0;
  chain.a1 = (-2.0f * cos_omega) / a0;
  chain.a2 = (1.0f - alpha) / a0;
  chain.coeff_cutoff = cutoff;
}

  float KesshoProductEngine::processPadPostLpfSample(const PadPostChainState& chain, BiquadState& state, float input) const {
  const float y =
      chain.b0 * input +
      chain.b1 * state.x1 +
      chain.b2 * state.x2 -
      chain.a1 * state.y1 -
      chain.a2 * state.y2;
  state.x2 = state.x1;
  state.x1 = input;
  state.y2 = state.y1;
  state.y1 = std::isfinite(y) ? y : 0.0f;
  return state.y1;
}

  void KesshoProductEngine::processPadPostChain(uint32_t pad_index, uint32_t source_id, float* left, float* right, uint32_t frames) {
  if (pad_index >= static_cast<uint32_t>(PAD_NUM_PADS) || left == nullptr || right == nullptr || frames == 0u) {
    return;
  }
  PadPostChainState& chain = pad_post_chains[pad_index];
  chain.post_lpf_hz = resolveSourcePostLpfHz(source_id);
  chain.stereo_width = resolveSourceStereoWidth(source_id);
  updatePadPostChainCoefficients(chain);
  const float width = clampFloat(chain.stereo_width, 0.0f, 1.0f);
  const float direct = 0.5f * (1.0f + width);
  const float cross = 0.5f * (1.0f - width);
  for (uint32_t i = 0; i < frames; ++i) {
    const float filtered_left = processPadPostLpfSample(chain, chain.left, left[i]);
    const float filtered_right = processPadPostLpfSample(chain, chain.right, right[i]);
    left[i] = filtered_left * direct + filtered_right * cross;
    right[i] = filtered_left * cross + filtered_right * direct;
  }
}

  void KesshoProductEngine::resetLeadPostChains() {
  for (LeadPostChainState& chain : lead_post_chains) {
    chain = {};
    chain.post_lpf_hz = kDefaultLeadPostLpfHz;
    chain.stereo_width = kDefaultLeadStereoWidth;
    updateLeadPostChainCoefficients(chain);
  }
}

  void KesshoProductEngine::updateLeadPostChainCoefficients(LeadPostChainState& chain) {
  const float nyquist_limit = static_cast<float>(sample_rate * 0.499);
  const float cutoff = clampFloat(chain.post_lpf_hz, 20.0f, std::max(20.0f, nyquist_limit));
  if (std::abs(chain.coeff_cutoff - cutoff) <= 0.0001f) {
    return;
  }

  constexpr float kWebAudioLowPassQ07 = 1.0839269140212036f; // pow(10, 0.7 / 20)
  const float omega = static_cast<float>((kTwoPi * static_cast<double>(cutoff)) / sample_rate);
  const float sin_omega = std::sin(omega);
  const float cos_omega = std::cos(omega);
  const float alpha = sin_omega / (2.0f * kWebAudioLowPassQ07);
  const float a0 = 1.0f + alpha;
  chain.b0 = ((1.0f - cos_omega) * 0.5f) / a0;
  chain.b1 = (1.0f - cos_omega) / a0;
  chain.b2 = ((1.0f - cos_omega) * 0.5f) / a0;
  chain.a1 = (-2.0f * cos_omega) / a0;
  chain.a2 = (1.0f - alpha) / a0;
  chain.coeff_cutoff = cutoff;
}

  float KesshoProductEngine::processLeadPostLpfSample(const LeadPostChainState& chain, BiquadState& state, float input) const {
  const float y =
      chain.b0 * input +
      chain.b1 * state.x1 +
      chain.b2 * state.x2 -
      chain.a1 * state.y1 -
      chain.a2 * state.y2;
  state.x2 = state.x1;
  state.x1 = input;
  state.y2 = state.y1;
  state.y1 = std::isfinite(y) ? y : 0.0f;
  return state.y1;
}

  void KesshoProductEngine::processLeadPostChain(uint32_t lead_index, uint32_t source_id, float* left, float* right, uint32_t frames) {
  if (lead_index >= 2u || left == nullptr || right == nullptr || frames == 0u) {
    return;
  }
  LeadPostChainState& chain = lead_post_chains[lead_index];
  chain.post_lpf_hz = resolveSourcePostLpfHz(source_id);
  chain.stereo_width = resolveSourceStereoWidth(source_id);
  updateLeadPostChainCoefficients(chain);
  const float width = clampFloat(chain.stereo_width, 0.0f, 1.0f);
  const float direct = 0.5f * (1.0f + width);
  const float cross = 0.5f * (1.0f - width);
  for (uint32_t i = 0; i < frames; ++i) {
    const float stage1_left = processLeadPostLpfSample(chain, chain.stage1_left, left[i]);
    const float stage1_right = processLeadPostLpfSample(chain, chain.stage1_right, right[i]);
    const float filtered_left = processLeadPostLpfSample(chain, chain.stage2_left, stage1_left);
    const float filtered_right = processLeadPostLpfSample(chain, chain.stage2_right, stage1_right);
    left[i] = filtered_left * direct + filtered_right * cross;
    right[i] = filtered_left * cross + filtered_right * direct;
  }
}

  void KesshoProductEngine::updateVoicePostChainCoefficients(Voice& voice, float cutoff_hz) {
  const float nyquist_limit = static_cast<float>(sample_rate * 0.499);
  const float cutoff = clampFloat(cutoff_hz, 20.0f, std::max(20.0f, nyquist_limit));
  if (std::abs(voice.post_coeff_cutoff - cutoff) <= 0.0001f) {
    return;
  }

  constexpr float kWebAudioLowPassQ07 = 1.0839269140212036f; // pow(10, 0.7 / 20)
  const float omega = static_cast<float>((kTwoPi * static_cast<double>(cutoff)) / sample_rate);
  const float sin_omega = std::sin(omega);
  const float cos_omega = std::cos(omega);
  const float alpha = sin_omega / (2.0f * kWebAudioLowPassQ07);
  const float a0 = 1.0f + alpha;
  voice.post_b0 = ((1.0f - cos_omega) * 0.5f) / a0;
  voice.post_b1 = (1.0f - cos_omega) / a0;
  voice.post_b2 = ((1.0f - cos_omega) * 0.5f) / a0;
  voice.post_a1 = (-2.0f * cos_omega) / a0;
  voice.post_a2 = (1.0f - alpha) / a0;
  voice.post_coeff_cutoff = cutoff;
}

  float KesshoProductEngine::processVoicePostLpfSample(const Voice& voice, BiquadState& state, float input) const {
  const float y =
      voice.post_b0 * input +
      voice.post_b1 * state.x1 +
      voice.post_b2 * state.x2 -
      voice.post_a1 * state.y1 -
      voice.post_a2 * state.y2;
  state.x2 = state.x1;
  state.x1 = input;
  state.y2 = state.y1;
  state.y1 = std::isfinite(y) ? y : 0.0f;
  return state.y1;
}

  void KesshoProductEngine::processVoicePostChain(Voice& voice, float& left, float& right) {
  const uint32_t source_id = voice.source_id;
  updateVoicePostChainCoefficients(voice, resolveSourcePostLpfHz(source_id));
  const float width = resolveSourceStereoWidth(source_id);
  const float filtered_left = processVoicePostLpfSample(voice, voice.post_left, left);
  const float filtered_right = processVoicePostLpfSample(voice, voice.post_right, right);
  const float direct = 0.5f * (1.0f + width);
  const float cross = 0.5f * (1.0f - width);
  left = filtered_left * direct + filtered_right * cross;
  right = filtered_left * cross + filtered_right * direct;
}

  void KesshoProductEngine::mixPadSourceBuffer(
      uint32_t source_id,
      const float* dry_l,
      const float* dry_r,
      const float* send_l,
      const float* send_r,
      float* out_l,
      float* out_r,
      uint32_t start,
      uint32_t frames) {
  if (source_id < 1u || source_id > kSourceCount) {
    return;
  }
  const SourceState& source = sources[source_id - 1u];
  if (!source.enabled) {
    return;
  }
  const float dry_gain = source.level * source.dry_gain;
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    const float dry_left = dry_l[i] * dry_gain;
    const float dry_right = dry_r[i] * dry_gain;
    const float send_left = send_l[i];
    const float send_right = send_r[i];
    const float duck_gain = sidechainGain(source_id - 1u, frame);
    const float left = dry_left * duck_gain;
    const float right = dry_right * duck_gain;
    out_l[frame] += left;
    out_r[frame] += right;
    stem_l[source_id][frame] += left;
    stem_r[source_id][frame] += right;
    reverb_bus_l[frame] += send_left * source.reverb_send;
    reverb_bus_r[frame] += send_right * source.reverb_send;
    delay_a_bus_l[frame] += send_left * source.delay_a_send;
    delay_a_bus_r[frame] += send_right * source.delay_a_send;
    delay_b_bus_l[frame] += send_left * source.delay_b_send;
    delay_b_bus_r[frame] += send_right * source.delay_b_send;
    granular_bus_l[frame] += send_left * source.granular_send;
    granular_bus_r[frame] += send_right * source.granular_send;
  }
}

  void KesshoProductEngine::mixSourceBuffer(
      uint32_t source_id,
      const float* in_l,
      const float* in_r,
      float* out_l,
      float* out_r,
      uint32_t start,
      uint32_t frames) {
  if (source_id < 1u || source_id > kSourceCount || source_id >= kStemCount) {
    return;
  }
  const SourceState& source = sources[source_id - 1u];
  if (!source.enabled) {
    return;
  }
  const float gain = source.level * source.dry_gain * moduleSourceOutputTrim(source_id);
  const uint32_t sidechain_target = sidechainTargetForSource(source_id);
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    const float send_left = in_l[i] * gain;
    const float send_right = in_r[i] * gain;
    const float duck_gain = sidechainGain(sidechain_target, frame);
    const float left = send_left * duck_gain;
    const float right = send_right * duck_gain;
    out_l[frame] += left;
    out_r[frame] += right;
    stem_l[source_id][frame] += left;
    stem_r[source_id][frame] += right;
    reverb_bus_l[frame] += send_left * source.reverb_send;
    reverb_bus_r[frame] += send_right * source.reverb_send;
    delay_a_bus_l[frame] += send_left * source.delay_a_send;
    delay_a_bus_r[frame] += send_right * source.delay_a_send;
    delay_b_bus_l[frame] += send_left * source.delay_b_send;
    delay_b_bus_r[frame] += send_right * source.delay_b_send;
    granular_bus_l[frame] += send_left * source.granular_send;
    granular_bus_r[frame] += send_right * source.granular_send;
  }
}
