#include "../KesshoProductEngineInternal.h"

  void KesshoProductEngine::ensureSoundscapeVoice() {
  SourceState& source = sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1u];
  if (!source.enabled) {
    releaseSourceVoices(KESSHO_PRODUCT_SOURCE_SOUNDSCAPE);
    return;
  }
  releaseUnwantedSoundscapeVoices(source);
  if (source.asset_ref_count == 0u) {
    return;
  }
  for (uint32_t ref_index = 0; ref_index < source.asset_ref_count; ++ref_index) {
    const uint32_t asset_id = source.asset_refs[ref_index];
    if (asset_id == 0u || soundscapeAssetUsesModule(source, asset_id) || hasActiveSoundscapeVoice(asset_id)) {
      continue;
    }
    const uint32_t slot = findAssetSlot(asset_id);
    if (slot == kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS) {
      reportMissingSourceAsset(source, asset_id);
      continue;
    }
    if ((assets[slot].flags & KESSHO_PRODUCT_ASSET_SOUNDSCAPE) == 0u) {
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
