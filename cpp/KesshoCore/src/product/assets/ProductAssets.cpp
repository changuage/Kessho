#include "../KesshoProductEngineInternal.h"

  bool KesshoProductEngine::soundscapeWantsAsset(const SourceState& source, uint32_t asset_id) const {
  if (soundscapeAssetUsesModule(source, asset_id)) {
    return false;
  }
  for (uint32_t i = 0; i < source.asset_ref_count; ++i) {
    if (source.asset_refs[i] == asset_id) {
      return true;
    }
  }
  return false;
}

  float KesshoProductEngine::soundscapeAssetRefLevel(const SourceState& source, uint32_t asset_id) const {
  for (uint32_t i = 0; i < source.asset_ref_count; ++i) {
    if (source.asset_refs[i] == asset_id) {
      return clampFloat(source.asset_ref_levels[i], 0.0f, 2.0f);
    }
  }
  return 1.0f;
}

  void KesshoProductEngine::applySoundscapeAssetLevelValue(uint32_t asset_id, float value) {
  if (asset_id == 0u) {
    return;
  }
  SourceState& source = sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1u];
  for (uint32_t i = 0; i < source.asset_ref_count; ++i) {
    if (source.asset_refs[i] == asset_id) {
      source.asset_ref_levels[i] = clampFloat(value, 0.0f, 2.0f);
      return;
    }
  }
  // Asset-level automation may only update the authoritative snapshot list.
  // Appending an absent asset here used to resurrect a removed Waves texture.
}

  bool KesshoProductEngine::soundscapeModuleParamsAvailable(const SourceState& source) const {
  return source.source_id == KESSHO_PRODUCT_SOURCE_SOUNDSCAPE &&
      source.soundscape_module_param_count >= kSoundscapeProductModuleParamCount;
}

  bool KesshoProductEngine::soundscapeModuleShouldRun(const SourceState& source) const {
  if (!sourceRenderActive(source) || !soundscapeModuleParamsAvailable(source)) return false;
  const bool water_configured = source.soundscape_module_params[kSoundscapeModuleWaterActiveParam] > 0.5f;
  const bool insects_configured = source.soundscape_module_params[kSoundscapeModuleInsectsActiveParam] > 0.5f ||
      source.soundscape_module_params[kSoundscapeModuleInsects2ActiveParam] > 0.5f ||
      soundscape_insects_layer_gains[0].gain > 0.0001f || soundscape_insects_layer_gains[0].remaining > 0u ||
      soundscape_insects_layer_gains[1].gain > 0.0001f || soundscape_insects_layer_gains[1].remaining > 0u;
  const bool water_gate_active = source.soundscape_module_params[kSoundscapeModuleWaterMasterEnabledParam] > 0.5f ||
      soundscape_family_gains[0].gain > 0.0001f || soundscape_family_gains[0].remaining > 0u;
  const bool insects_gate_active = source.soundscape_module_params[kSoundscapeModuleInsectsMasterEnabledParam] > 0.5f ||
      soundscape_family_gains[1].gain > 0.0001f || soundscape_family_gains[1].remaining > 0u;
  return (water_configured && water_gate_active) || (insects_configured && insects_gate_active);
}

  bool KesshoProductEngine::soundscapeAssetUsesModule(const SourceState& source, uint32_t asset_id) const {
  if (!soundscapeModuleParamsAvailable(source)) {
    return false;
  }
  return asset_id == kSoundscapeAssetWater || asset_id == kSoundscapeAssetInsects;
}

  bool KesshoProductEngine::isSoundscapeTextureAsset(uint32_t asset_id) const {
  return soundscapeTextureSlotForAsset(asset_id) < kSoundscapeTextureSlotCount;
}

  bool KesshoProductEngine::shouldUseSoundscapeTextureSlices(const SourceState& source, uint32_t asset_id) const {
  if (!isSoundscapeTextureAsset(asset_id)) {
    return false;
  }
  return !soundscapeParityFixtureEnabled(source);
}

  bool KesshoProductEngine::hasActiveSoundscapeVoice(uint32_t asset_id) const {
  for (const Voice& voice : voices) {
    if (!voice.active || voice.source_id != KESSHO_PRODUCT_SOURCE_SOUNDSCAPE || !voice.sample_voice) {
      continue;
    }
    if (voice.asset_slot < kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS &&
        assets[voice.asset_slot].active &&
        assets[voice.asset_slot].asset_id == asset_id) {
      return true;
    }
  }
  return false;
}

  bool KesshoProductEngine::hasActiveLegacySoundscapeVoice(uint32_t asset_id) const {
  for (const Voice& voice : voices) {
    if (!voice.active || voice.source_id != KESSHO_PRODUCT_SOURCE_SOUNDSCAPE ||
        !voice.sample_voice || voice.soundscape_texture_voice) {
      continue;
    }
    if (voice.asset_slot < kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS &&
        assets[voice.asset_slot].active &&
        assets[voice.asset_slot].asset_id == asset_id) {
      return true;
    }
  }
  return false;
}

  double KesshoProductEngine::soundscapeRandomStartFrame(const AssetSlot& asset, uint32_t sample_seed) const {
  if (asset.frame_count <= kSoundscapeRandomStartMinimumFrames) {
    return 0.0;
  }
  const uint32_t crossfade_frames = loopCrossfadeFrames(asset);
  const uint32_t max_start = asset.frame_count > crossfade_frames + 1u
      ? asset.frame_count - crossfade_frames - 1u
      : asset.frame_count - 1u;
  const float position = hashUnit(sample_seed ^ asset.asset_id ^ 0xa341316cu);
  return std::floor(static_cast<double>(position) * static_cast<double>(max_start + 1u));
}

  SoundscapeLayerPolicy KesshoProductEngine::soundscapeLayerPolicy(uint32_t asset_id) const {
  switch (asset_id) {
    case kSoundscapeAssetOcean:
      return {0.90f, 0.10f, 0.12f, 0.28f, 0.006f};
    case kSoundscapeAssetWater:
      return {0.88f, 0.12f, 0.14f, 0.26f, 0.012f};
    case kSoundscapeAssetBirds:
    case kSoundscapeAssetBirds2:
      return {0.72f, 0.28f, 0.30f, 0.62f, 0.035f};
    case kSoundscapeAssetFrogs:
      return {0.76f, 0.20f, 0.26f, 0.48f, 0.020f};
    case kSoundscapeAssetInsects:
      return {0.62f, 0.24f, 0.36f, 0.64f, 0.045f};
    default:
      return {};
  }
}

  uint32_t KesshoProductEngine::soundscapeLayerIndexForAsset(uint32_t asset_id) const {
  switch (asset_id) {
    case kSoundscapeAssetOcean:
      return kSoundscapeLayerOcean;
    case kSoundscapeAssetWater:
      return kSoundscapeLayerWater;
    case kSoundscapeAssetInsects:
      return kSoundscapeLayerInsects;
    case kSoundscapeAssetBirds:
    case kSoundscapeAssetBirds2:
    case kSoundscapeAssetFrogs:
      return kSoundscapeLayerNature;
    default:
      return kSoundscapeLayerCount;
  }
}

  uint32_t KesshoProductEngine::soundscapeTextureSlotForAsset(uint32_t asset_id) const {
  switch (asset_id) {
    case kSoundscapeAssetOcean:
      return kSoundscapeTextureSlotOcean;
    case kSoundscapeAssetBirds:
      return kSoundscapeTextureSlotBirds;
    case kSoundscapeAssetBirds2:
      return kSoundscapeTextureSlotBirds2;
    case kSoundscapeAssetFrogs:
      return kSoundscapeTextureSlotFrogs;
    default:
      return kSoundscapeTextureSlotCount;
  }
}

  uint32_t KesshoProductEngine::soundscapeTextureAssetId(const SourceState& source, uint32_t slot) const {
  const float value = soundscapeTextureParam(source, slot, kSoundscapeTextureParamAssetId, 0.0f);
  if (value > 0.0f) return static_cast<uint32_t>(std::lround(value));
  const uint32_t legacy_assets[kSoundscapeTextureSlotCount] = {
      kSoundscapeAssetOcean, kSoundscapeAssetBirds, kSoundscapeAssetBirds2, kSoundscapeAssetFrogs};
  return slot < kSoundscapeTextureSlotCount ? legacy_assets[slot] : 0u;
}

  bool KesshoProductEngine::soundscapeTextureSlotEnabled(const SourceState& source, uint32_t slot) const {
  const uint32_t asset_id = soundscapeTextureAssetId(source, slot);
  const bool legacy_selected = soundscapeWantsAsset(source, asset_id);
  const bool canonical_slot = soundscapeTextureParam(
      source, slot, kSoundscapeTextureParamAssetId, 0.0f) > 0.0f;
  const uint32_t new_param_count = kSoundscapeTextureParamStart +
      slot * kSoundscapeTextureParamStride + kSoundscapeTextureParamEnabled + 1u;
  const bool child_enabled = canonical_slot && source.soundscape_texture_param_count >= new_param_count
      ? soundscapeTextureParam(source, slot, kSoundscapeTextureParamEnabled, legacy_selected ? 1.0f : 0.0f) >= 0.5f
      : legacy_selected;
  const bool master_enabled = source.soundscape_module_param_count > kSoundscapeModuleNatureMasterEnabledParam
      ? source.soundscape_module_params[kSoundscapeModuleNatureMasterEnabledParam] >= 0.5f
      : true;
  return child_enabled && master_enabled;
}

  float KesshoProductEngine::soundscapeLayerLevel(const AssetSlot& asset, uint32_t sample_seed) const {
  const SoundscapeLayerPolicy policy = soundscapeLayerPolicy(asset.asset_id);
  return policy.level_base + policy.level_range * hashUnit(sample_seed ^ 0x8da6b343u);
}

  float KesshoProductEngine::soundscapeLayerPan(const AssetSlot& asset, uint32_t sample_seed, float distance) const {
  const SoundscapeLayerPolicy policy = soundscapeLayerPolicy(asset.asset_id);
  const float spread = policy.pan_base + clampFloat(distance, 0.0f, 1.0f) * policy.pan_distance;
  return ((hashUnit(sample_seed ^ 0xd1b54a32u) * 2.0f) - 1.0f) * spread;
}

  float KesshoProductEngine::soundscapeLayerPlaybackRate(const AssetSlot& asset, uint32_t sample_seed) const {
  const SoundscapeLayerPolicy policy = soundscapeLayerPolicy(asset.asset_id);
  const float rate_delta = ((hashUnit(sample_seed ^ 0xc2b2ae35u) * 2.0f) - 1.0f) * policy.rate_depth;
  return clampFloat(1.0f + rate_delta, 0.5f, 2.0f);
}

  bool KesshoProductEngine::soundscapeParityFixtureEnabled(const SourceState& source) const {
  if (source.source_id != KESSHO_PRODUCT_SOURCE_SOUNDSCAPE ||
      source.soundscape_texture_param_count < kSoundscapeParityParamCount) {
    return false;
  }
  const float value = source.soundscape_texture_params[kSoundscapeParityFixtureParam];
  return std::isfinite(value) && value >= 0.5f;
}

  bool KesshoProductEngine::soundscapeTextureParamsAvailable(const SourceState& source) const {
  return source.source_id == KESSHO_PRODUCT_SOURCE_SOUNDSCAPE &&
      source.soundscape_texture_param_count >= kSoundscapeTextureParamCount;
}

  float KesshoProductEngine::soundscapeTextureParam(
      const SourceState& source,
      uint32_t slot,
      uint32_t param,
      float fallback) const {
  if (!soundscapeTextureParamsAvailable(source) ||
      slot >= kSoundscapeTextureSlotCount ||
      param >= kSoundscapeTextureParamStride) {
    return fallback;
  }
  const uint32_t param_index = kSoundscapeTextureParamStart + slot * kSoundscapeTextureParamStride + param;
  const float value = source.soundscape_texture_params[param_index];
  return std::isfinite(value) ? value : fallback;
}

  uint32_t KesshoProductEngine::soundscapeTextureSeed(
      const SourceState& source,
      uint32_t slot,
      uint32_t fallback) const {
  if (!soundscapeTextureParamsAvailable(source) || slot >= kSoundscapeTextureSlotCount) {
    return fallback == 0u ? 1u : fallback;
  }
  const uint32_t lo_param = kSoundscapeTextureParamStart + slot * kSoundscapeTextureParamStride + kSoundscapeTextureParamSeedLo;
  const uint32_t hi_param = kSoundscapeTextureParamStart + slot * kSoundscapeTextureParamStride + kSoundscapeTextureParamSeedHi;
  const uint32_t lo = static_cast<uint32_t>(clampFloat(source.soundscape_texture_params[lo_param], 0.0f, 65535.0f)) & 0xffffu;
  const uint32_t hi = static_cast<uint32_t>(clampFloat(source.soundscape_texture_params[hi_param], 0.0f, 65535.0f)) & 0xffffu;
  const uint32_t seed = lo | (hi << 16u);
  return seed == 0u ? (fallback == 0u ? 1u : fallback) : seed;
}

  float KesshoProductEngine::soundscapeTextureRandom(uint32_t slot) {
  if (slot >= kSoundscapeTextureSlotCount) {
    return 0.0f;
  }
  SoundscapeTextureRuntime& runtime = soundscape_texture_runtimes[slot];
  uint32_t t = (runtime.rng_state += 0x6d2b79f5u);
  t = (t ^ (t >> 15u)) * (t | 1u);
  t ^= t + ((t ^ (t >> 7u)) * (t | 61u));
  return static_cast<float>(t ^ (t >> 14u)) / 4294967296.0f;
}

  double KesshoProductEngine::soundscapeTexturePickOffset(
      uint32_t slot,
      double max_offset,
      double duration) {
  if (slot >= kSoundscapeTextureSlotCount || max_offset <= 0.0001) {
    return 0.0;
  }
  SoundscapeTextureRuntime& runtime = soundscape_texture_runtimes[slot];
  const double exclusion_distance =
      std::min(duration * 0.75, std::max(2.5, max_offset * 0.12));
  double candidate = soundscapeTextureRandom(slot) * max_offset;
  for (uint32_t attempt = 0; attempt < 8u; ++attempt) {
    candidate = soundscapeTextureRandom(slot) * max_offset;
    bool too_close = false;
    for (uint32_t i = 0; i < runtime.recent_offset_count; ++i) {
      if (std::abs(static_cast<double>(runtime.recent_offsets[i]) - candidate) < exclusion_distance) {
        too_close = true;
        break;
      }
    }
    if (!too_close) {
      break;
    }
  }
  if (runtime.recent_offset_count < 6u) {
    runtime.recent_offsets[runtime.recent_offset_count++] = static_cast<float>(candidate);
  } else {
    for (uint32_t i = 1u; i < 6u; ++i) {
      runtime.recent_offsets[i - 1u] = runtime.recent_offsets[i];
    }
    runtime.recent_offsets[5u] = static_cast<float>(candidate);
  }
  return candidate;
}

  double KesshoProductEngine::soundscapeTextureStrideSeconds(
      double output_duration,
      double fade,
      float density_value) const {
  const double duration = std::max(1.5, output_duration);
  const double density = clampFloat(density_value, 0.0f, 1.0f);
  const double silence_gap_at_zero = std::min(std::max(std::min(fade * 0.45, duration * 0.14), 0.18), 1.25);
  const double handoff_overlap = fade;
  const double dense_overlap = std::min(std::max(fade + duration * 0.16, fade * 1.25), duration * 0.42);
  const double overlap_or_gap = density <= 0.25
      ? (-silence_gap_at_zero + (handoff_overlap + silence_gap_at_zero) * (density / 0.25))
      : (handoff_overlap + (dense_overlap - handoff_overlap) * ((density - 0.25) / 0.75));
  return std::min(std::max(duration - overlap_or_gap, 0.35), duration + silence_gap_at_zero);
}

  void KesshoProductEngine::resetSoundscapeTextureRuntime(uint32_t slot) {
  if (slot >= kSoundscapeTextureSlotCount) {
    return;
  }
  soundscape_texture_runtimes[slot] = {};
  std::fill(
      soundscape_texture_delay[slot],
      soundscape_texture_delay[slot] + kSoundscapeTextureHaasDelayMaxFrames,
      0.0f);
  soundscape_texture_delay_index[slot] = 0u;
}

  void KesshoProductEngine::resetSoundscapeTextureRuntimes() {
  for (uint32_t slot = 0u; slot < kSoundscapeTextureSlotCount; ++slot) {
    resetSoundscapeTextureRuntime(slot);
  }
}

  void KesshoProductEngine::suspendSoundscapeTextureRuntimes() {
  for (uint32_t slot = 0u; slot < kSoundscapeTextureSlotCount; ++slot) {
    SoundscapeTextureRuntime& runtime = soundscape_texture_runtimes[slot];
    runtime.next_start_frame = 0u;
  }
}

  void KesshoProductEngine::releaseSoundscapeTextureVoices(uint32_t texture_slot) {
  for (Voice& voice : voices) {
    if (!voice.active || voice.source_id != KESSHO_PRODUCT_SOURCE_SOUNDSCAPE ||
        !voice.sample_voice || !voice.soundscape_texture_voice ||
        voice.soundscape_texture_slot != texture_slot) {
      continue;
    }
    releaseSoundscapeTextureVoice(voice, voice.soundscape_asset_level);
  }
}

  void KesshoProductEngine::configureSoundscapeTextureSpatialRuntime(
      uint32_t asset_id,
      SoundscapeTextureRuntime& runtime) const {
  runtime.spatial_enabled = true;
  runtime.spatial_delay_frames = 1u;
  runtime.spatial_center_gain = 1.0f;
  runtime.spatial_side_gain = 0.0f;
  runtime.spatial_left_branch_l = 1.0f;
  runtime.spatial_left_branch_r = 0.0f;
  runtime.spatial_right_branch_l = 0.0f;
  runtime.spatial_right_branch_r = 1.0f;

  double delay_ms = 0.0;
  switch (asset_id) {
    case kSoundscapeAssetOcean:
      delay_ms = 10.0;
      runtime.spatial_side_gain = 0.24f;
      runtime.spatial_center_gain = 0.80f;
      runtime.spatial_left_branch_l = 0.9930684569549263f;
      runtime.spatial_left_branch_r = 0.11753739745783766f;
      runtime.spatial_right_branch_l = 0.1175373974578377f;
      runtime.spatial_right_branch_r = 0.9930684569549263f;
      break;
    case kSoundscapeAssetBirds:
      delay_ms = 13.0;
      runtime.spatial_side_gain = 0.42f;
      runtime.spatial_center_gain = 0.56f;
      break;
    case kSoundscapeAssetBirds2:
      delay_ms = 15.0;
      runtime.spatial_side_gain = 0.45f;
      runtime.spatial_center_gain = 0.50f;
      break;
    case kSoundscapeAssetFrogs:
      delay_ms = 12.0;
      runtime.spatial_side_gain = 0.36f;
      runtime.spatial_center_gain = 0.68f;
      break;
    default:
      runtime.spatial_enabled = false;
      return;
  }

  runtime.spatial_delay_frames = clampU32(
      static_cast<uint32_t>(std::lround(sample_rate * delay_ms * 0.001)),
      1u,
      kSoundscapeTextureHaasDelayMaxFrames - 1u);
}

  void KesshoProductEngine::processSoundscapeTextureSpatialForSlot(
      uint32_t slot,
      float& left,
      float& right) {
  if (slot >= kSoundscapeTextureSlotCount) {
    return;
  }
  const SoundscapeTextureRuntime& runtime = soundscape_texture_runtimes[slot];
  if (!runtime.spatial_enabled) {
    return;
  }
  const uint32_t delay_frames = clampU32(
      runtime.spatial_delay_frames,
      1u,
      kSoundscapeTextureHaasDelayMaxFrames - 1u);
  const uint32_t read_index =
      (soundscape_texture_delay_index[slot] + kSoundscapeTextureHaasDelayMaxFrames - delay_frames) %
      kSoundscapeTextureHaasDelayMaxFrames;
  const float mono = (left + right) * 0.5f;
  const float delayed = soundscape_texture_delay[slot][read_index];
  soundscape_texture_delay[slot][soundscape_texture_delay_index[slot]] = mono;
  soundscape_texture_delay_index[slot] =
      (soundscape_texture_delay_index[slot] + 1u) % kSoundscapeTextureHaasDelayMaxFrames;

  left = mono * runtime.spatial_center_gain +
      mono * runtime.spatial_side_gain * runtime.spatial_left_branch_l +
      delayed * runtime.spatial_side_gain * runtime.spatial_right_branch_l;
  right = mono * runtime.spatial_center_gain +
      mono * runtime.spatial_side_gain * runtime.spatial_left_branch_r +
      delayed * runtime.spatial_side_gain * runtime.spatial_right_branch_r;
}

  void KesshoProductEngine::processSoundscapeTextureFilter(
      Voice& voice,
      const SourceState& source,
      float& left,
      float& right) {
  const uint32_t slot = voice.soundscape_texture_slot;
  if (slot >= kSoundscapeTextureSlotCount || sample_rate <= 0.0) return;
  const uint8_t type = static_cast<uint8_t>(clampU32(
      static_cast<uint32_t>(std::lround(soundscapeTextureParam(source, slot, kSoundscapeTextureParamFilterType, 0.0f))), 0u, 3u));
  const float cutoff = clampFloat(
      soundscapeTextureParam(source, slot, kSoundscapeTextureParamFilterCutoff, 12000.0f),
      40.0f,
      static_cast<float>(sample_rate * 0.45));
  const float resonance = clampFloat(
      soundscapeTextureParam(source, slot, kSoundscapeTextureParamFilterResonance, 0.05f), 0.0f, 1.0f);
  const float q = 0.5f + resonance * 9.5f;
  if (voice.post_coeff_cutoff != cutoff || voice.post_filter_q != q || voice.post_filter_type != type) {
    const float omega = 2.0f * static_cast<float>(M_PI) * cutoff / static_cast<float>(sample_rate);
    const float cos_omega = std::cos(omega);
    const float sin_omega = std::sin(omega);
    const float alpha = sin_omega / (2.0f * q);
    float b0 = 1.0f, b1 = 0.0f, b2 = 0.0f;
    if (type == 0u) { b0 = (1.0f - cos_omega) * 0.5f; b1 = 1.0f - cos_omega; b2 = b0; }
    else if (type == 1u) { b0 = alpha; b1 = 0.0f; b2 = -alpha; }
    else if (type == 2u) { b0 = (1.0f + cos_omega) * 0.5f; b1 = -(1.0f + cos_omega); b2 = b0; }
    else { b0 = 1.0f; b1 = -2.0f * cos_omega; b2 = 1.0f; }
    const float a0 = 1.0f + alpha;
    voice.post_b0 = b0 / a0; voice.post_b1 = b1 / a0; voice.post_b2 = b2 / a0;
    voice.post_a1 = (-2.0f * cos_omega) / a0; voice.post_a2 = (1.0f - alpha) / a0;
    voice.post_coeff_cutoff = cutoff; voice.post_filter_q = q; voice.post_filter_type = type;
  }
  auto process = [&voice](BiquadState& state, float input) {
    const float output = voice.post_b0 * input + voice.post_b1 * state.x1 + voice.post_b2 * state.x2 -
        voice.post_a1 * state.y1 - voice.post_a2 * state.y2;
    state.x2 = state.x1; state.x1 = input; state.y2 = state.y1; state.y1 = output;
    return output;
  };
  left = process(voice.post_left, left);
  right = process(voice.post_right, right);
}

  float KesshoProductEngine::soundscapeLayerRouteSend(
      const SourceState& source,
      uint32_t layer,
      uint32_t route,
      float fallback) const {
  if (source.source_id != KESSHO_PRODUCT_SOURCE_SOUNDSCAPE ||
      layer >= kSoundscapeLayerCount ||
      route >= kSoundscapeLayerRouteStride ||
      source.soundscape_texture_param_count < kSoundscapeLayerRouteParamCount) {
    return fallback;
  }
  const uint32_t param_index = layer * kSoundscapeLayerRouteStride + route;
  const float value = source.soundscape_texture_params[param_index];
  return std::isfinite(value) ? clampFloat(value, 0.0f, 2.0f) : fallback;
}
