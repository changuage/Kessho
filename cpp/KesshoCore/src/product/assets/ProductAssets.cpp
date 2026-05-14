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

  bool KesshoProductEngine::soundscapeModuleParamsAvailable(const SourceState& source) const {
  return source.source_id == KESSHO_PRODUCT_SOURCE_SOUNDSCAPE &&
      source.exact_drum_param_count >= kSoundscapeProductModuleParamCount;
}

  bool KesshoProductEngine::soundscapeAssetUsesModule(const SourceState& source, uint32_t asset_id) const {
  if (!soundscapeModuleParamsAvailable(source)) {
    return false;
  }
  return asset_id == kSoundscapeAssetWater || asset_id == kSoundscapeAssetInsects;
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
      source.exact_pad_param_count < kSoundscapeParityParamCount) {
    return false;
  }
  const float value = source.exact_pad_params[kSoundscapeParityFixtureParam];
  return std::isfinite(value) && value >= 0.5f;
}

  float KesshoProductEngine::soundscapeLayerRouteSend(
      const SourceState& source,
      uint32_t layer,
      uint32_t route,
      float fallback) const {
  if (source.source_id != KESSHO_PRODUCT_SOURCE_SOUNDSCAPE ||
      layer >= kSoundscapeLayerCount ||
      route >= kSoundscapeLayerRouteStride ||
      source.exact_pad_param_count < kSoundscapeLayerRouteParamCount) {
    return fallback;
  }
  const uint32_t param_index = layer * kSoundscapeLayerRouteStride + route;
  const float value = source.exact_pad_params[param_index];
  return std::isfinite(value) ? clampFloat(value, 0.0f, 2.0f) : fallback;
}
