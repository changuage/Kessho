#include "KesshoProductEngineInternal.h"
#include "generated/SampleLibraryRegistry.generated.h"

namespace {

const kessho::product::generated::GeneratedSampleDescriptor* findGeneratedSampleDescriptor(uint32_t asset_id) {
  for (const auto& descriptor : kessho::product::generated::kGeneratedSampleDescriptors) {
    if (descriptor.assetId == asset_id) return &descriptor;
  }
  return nullptr;
}

uint32_t scaledLoopFrame(uint32_t encoded_frame, double asset_sample_rate, uint32_t encoded_sample_rate) {
  if (encoded_sample_rate == 0u || asset_sample_rate <= 0.0) return encoded_frame;
  return static_cast<uint32_t>(std::max(
      0.0,
      std::round(static_cast<double>(encoded_frame) * asset_sample_rate / static_cast<double>(encoded_sample_rate))));
}

} // namespace

extern "C" {

int32_t kessho_product_register_asset_buffer(
    KesshoProductEngine* engine,
    uint32_t asset_id,
    const float* const* channels,
    uint32_t channel_count,
    uint32_t frame_count,
    double asset_sample_rate,
    uint32_t flags) {
  if (engine == nullptr) return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  if (asset_id == 0u || channels == nullptr || channel_count == 0u || channel_count > 2u ||
      channels[0] == nullptr || frame_count == 0u || asset_sample_rate <= 0.0) {
    engine->telemetry.last_error_code = KESSHO_PRODUCT_ERROR_ASSET_FORMAT_UNSUPPORTED;
    return KESSHO_PRODUCT_ERROR_ASSET_FORMAT_UNSUPPORTED;
  }
  uint32_t slot = engine->findAssetSlot(asset_id);
  if (slot != kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS) return KESSHO_PRODUCT_ERROR_ASSET_IN_USE;
  for (uint32_t i = 0; i < kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS; ++i) {
    if (!engine->assets[i].active) { slot = i; break; }
  }
  if (slot == kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS) {
    engine->telemetry.last_error_code = KESSHO_PRODUCT_ERROR_ALLOCATION_FAILURE;
    return KESSHO_PRODUCT_ERROR_ALLOCATION_FAILURE;
  }
  AssetSlot& asset = engine->assets[slot];
  asset.active = true;
  asset.asset_id = asset_id;
  asset.channel_count = channel_count;
  asset.frame_count = frame_count;
  asset.sample_rate = asset_sample_rate;
  asset.flags = flags;
  asset.loop_start_frame = 0u;
  asset.loop_end_frame = 0u;
  asset.loop_crossfade_frames = 0u;
  if (const auto* descriptor = findGeneratedSampleDescriptor(asset_id); descriptor && descriptor->hasLoop) {
    const uint32_t loop_start = std::min(
        frame_count,
        scaledLoopFrame(descriptor->encodedLoopStartFrame, asset_sample_rate, descriptor->encodedSampleRate));
    const uint32_t loop_end = std::min(
        frame_count,
        scaledLoopFrame(descriptor->encodedLoopEndFrame, asset_sample_rate, descriptor->encodedSampleRate));
    if (loop_end > loop_start + 8u) {
      asset.loop_start_frame = loop_start;
      asset.loop_end_frame = loop_end;
      asset.loop_crossfade_frames = std::min<uint32_t>(
          scaledLoopFrame(descriptor->encodedLoopCrossfadeFrames, asset_sample_rate, descriptor->encodedSampleRate),
          std::max<uint32_t>(1u, (loop_end - loop_start) / 2u));
      asset.flags |= KESSHO_PRODUCT_ASSET_LOOP;
    }
  }
  asset.channels[0] = channels[0];
  asset.channels[1] = channel_count > 1u ? channels[1] : channels[0];
  engine->updateTelemetry(0);
  return KESSHO_PRODUCT_OK;
}

int32_t kessho_product_unregister_asset_buffer(KesshoProductEngine* engine, uint32_t asset_id) {
  if (engine == nullptr) return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  const uint32_t slot = engine->findAssetSlot(asset_id);
  if (slot == kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS) return KESSHO_PRODUCT_ERROR_INVALID_ASSET_ID;
  if (engine->assetHasActiveVoice(asset_id)) return KESSHO_PRODUCT_ERROR_ASSET_IN_USE;
  engine->assets[slot] = {};
  engine->updateTelemetry(0);
  return KESSHO_PRODUCT_OK;
}

} // extern "C"
