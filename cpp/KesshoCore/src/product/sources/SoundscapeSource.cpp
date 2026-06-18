#include "../KesshoProductEngineInternal.h"

void KesshoProductEngine::ensureSoundscapeVoice() {
  SourceState& source = sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1u];
  if (!source.enabled || !sourceRenderActive(source)) {
    releaseSourceVoices(KESSHO_PRODUCT_SOURCE_SOUNDSCAPE);
    suspendSoundscapeTextureRuntimes();
    return;
  }
  releaseUnwantedSoundscapeVoices(source);
  if (source.asset_ref_count == 0u) {
    suspendSoundscapeTextureRuntimes();
    return;
  }
  const bool parity_fixture = soundscapeParityFixtureEnabled(source);
  for (uint32_t ref_index = 0; ref_index < source.asset_ref_count; ++ref_index) {
    const uint32_t asset_id = source.asset_refs[ref_index];
    if (asset_id == 0u || soundscapeAssetUsesModule(source, asset_id)) {
      continue;
    }
    const uint32_t texture_slot = soundscapeTextureSlotForAsset(asset_id);
    const bool texture_asset = texture_slot < kSoundscapeTextureSlotCount;
    const uint32_t slot = findAssetSlot(asset_id);
    if (slot == kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS) {
      if (texture_asset) {
        SoundscapeTextureRuntime& runtime = soundscape_texture_runtimes[texture_slot];
        runtime.last_fallback_reason = kSoundscapeTextureFallbackMissingAsset;
      }
      reportMissingSourceAsset(source, asset_id);
      continue;
    }
    if ((assets[slot].flags & KESSHO_PRODUCT_ASSET_SOUNDSCAPE) == 0u) {
      if (texture_asset) {
        SoundscapeTextureRuntime& runtime = soundscape_texture_runtimes[texture_slot];
        runtime.last_fallback_reason = kSoundscapeTextureFallbackInvalidAssetMetadata;
      }
      continue;
    }
    // Texture params are optional: soundscapeTextureParam() and soundscapeTextureSeed()
    // provide defaults. Legacy whole-sample playback is reserved for parity fixtures.
    if (shouldUseSoundscapeTextureSlices(source, asset_id)) {
      soundscape_texture_runtimes[texture_slot].last_fallback_reason = kSoundscapeTextureFallbackNone;
      releaseLegacySoundscapeVoices(asset_id);
      ensureSoundscapeTextureVoice(source, asset_id, slot);
      continue;
    }
    if (texture_asset) {
      SoundscapeTextureRuntime& runtime = soundscape_texture_runtimes[texture_slot];
      runtime.last_fallback_reason = parity_fixture
          ? kSoundscapeTextureFallbackParityFixture
          : kSoundscapeTextureFallbackTextureParamsUnavailable;
      releaseSoundscapeTextureVoices(asset_id);
    }
    if (hasActiveLegacySoundscapeVoice(asset_id)) {
      continue;
    }
    triggerVoice(
        KESSHO_PRODUCT_SOURCE_SOUNDSCAPE,
        60.0f,
        1.0f,
        static_cast<float>(static_cast<double>(assets[slot].frame_count) / std::max(1.0, assets[slot].sample_rate)),
        source.morph,
        source.distance,
        source.expression,
        hashU32(rng_seed ^ asset_id ^ 0x51f15ca9u),
        asset_id);
  }
}
