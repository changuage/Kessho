#include <array>
#include <cstdint>
#include <cstdlib>
#include <iostream>

#include "KesshoCore/KesshoProductCore.h"
#include "../src/product/KesshoProductEngineInternal.h"

namespace {

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Kessho Product asset release test failed: " << message << "\n";
    std::exit(1);
  }
}

} // namespace

int main() {
  using namespace kessho::product::internal;
  constexpr uint32_t kAssetId = 9101u;
  std::array<float, 512> samples{};
  samples.fill(0.25f);
  const float* channels[1] = {samples.data()};
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128u, 0u);
  require(engine != nullptr, "engine creation failed");
  require(
      kessho_product_register_asset_buffer(
          engine, kAssetId, channels, 1u, samples.size(), 48000.0, KESSHO_PRODUCT_ASSET_SAMPLE) == KESSHO_PRODUCT_OK,
      "asset registration failed");
  const uint32_t slot = engine->findAssetSlot(kAssetId);
  require(slot < kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS, "registered asset slot missing");
  std::array<float, 512> replacement_samples{};
  replacement_samples.fill(0.75f);
  const float* replacement_channels[1] = {replacement_samples.data()};
  require(
      kessho_product_register_asset_buffer(
          engine, kAssetId, replacement_channels, 1u, replacement_samples.size(), 48000.0, KESSHO_PRODUCT_ASSET_SAMPLE) ==
          KESSHO_PRODUCT_ERROR_ASSET_IN_USE,
      "duplicate registration replaced a live allocation");
  require(engine->assets[slot].channels[0] == samples.data(), "duplicate registration changed the registered pointer");

  Voice& one_shot = engine->voices[0];
  one_shot = {};
  one_shot.active = true;
  one_shot.sample_voice = true;
  one_shot.source_id = KESSHO_PRODUCT_SOURCE_PIANO;
  one_shot.asset_slot = slot;
  one_shot.remaining_frames = 256u;
  one_shot.total_frames = 256u;
  require(
      kessho_product_unregister_asset_buffer(engine, kAssetId) == KESSHO_PRODUCT_ERROR_ASSET_IN_USE,
      "active one-shot release was not deferred");
  require(engine->assets[slot].active, "deferred one-shot release mutated the asset slot");
  one_shot.active = false;
  require(kessho_product_unregister_asset_buffer(engine, kAssetId) == KESSHO_PRODUCT_OK, "finished one-shot release failed");

  require(
      kessho_product_register_asset_buffer(
          engine, kAssetId, channels, 1u, samples.size(), 48000.0, KESSHO_PRODUCT_ASSET_SAMPLE | KESSHO_PRODUCT_ASSET_LOOP) == KESSHO_PRODUCT_OK,
      "loop asset registration failed");
  const uint32_t loop_slot = engine->findAssetSlot(kAssetId);
  Voice& loop = engine->voices[1];
  loop = {};
  loop.active = true;
  loop.sample_voice = true;
  loop.looping = true;
  loop.source_id = KESSHO_PRODUCT_SOURCE_SOUNDSCAPE;
  loop.asset_slot = loop_slot;
  loop.remaining_frames = 512u;
  loop.total_frames = 512u;
  require(
      kessho_product_unregister_asset_buffer(engine, kAssetId) == KESSHO_PRODUCT_ERROR_ASSET_IN_USE,
      "active loop release was not deferred");
  require(engine->assets[loop_slot].active, "deferred loop release mutated the asset slot");
  loop.active = false;
  require(kessho_product_unregister_asset_buffer(engine, kAssetId) == KESSHO_PRODUCT_OK, "released loop unregister failed");

  kessho_product_destroy(engine);
  std::cout << "Kessho Product asset release tests passed\n";
  return 0;
}
