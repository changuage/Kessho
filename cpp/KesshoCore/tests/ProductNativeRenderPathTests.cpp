#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iostream>

#include "KesshoCore/KesshoProductCore.h"
#include "KesshoNativeProductRuntime.h"
#include "KesshoProductEventIds.h"
#include "KesshoProductParamIds.h"
#include "ProductSnapshotTestHelpers.h"

namespace {

constexpr uint32_t kBlockFrames = 128;

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Kessho Product native render path test failed: " << message << "\n";
    std::exit(1);
  }
}

class NativeProductEngine {
 public:
  NativeProductEngine(double sample_rate, uint32_t max_block_size)
      : engine_(kessho_product_create(sample_rate, max_block_size, 0)) {}

  ~NativeProductEngine() {
    if (engine_ != nullptr) {
      kessho_product_destroy(engine_);
    }
  }

  NativeProductEngine(const NativeProductEngine&) = delete;
  NativeProductEngine& operator=(const NativeProductEngine&) = delete;

  bool valid() const { return engine_ != nullptr; }

  int32_t loadSnapshot(const KesshoProductSnapshotV2& snapshot) {
    return kessho_product_load_snapshot_v2(engine_, &snapshot, sizeof(snapshot));
  }

  int32_t enqueueEvent(const KesshoProductEvent& event) {
    return kessho_product_enqueue_event(engine_, &event);
  }

  int32_t enqueueEvents(const KesshoProductEvent* events, uint32_t event_count) {
    return kessho_product_enqueue_events(engine_, events, event_count);
  }

  void render(float* out_l, float* out_r, uint32_t frames) {
    kessho_product_render(engine_, out_l, out_r, frames);
  }

  int32_t copyTelemetry(KesshoProductTelemetry& telemetry) {
    return kessho_product_copy_telemetry(engine_, &telemetry);
  }

  int32_t registerAsset(
      uint32_t asset_id,
      const float* const* channels,
      uint32_t channel_count,
      uint32_t frame_count,
      double sample_rate) {
    return kessho_product_register_asset_buffer(
        engine_,
        asset_id,
        channels,
        channel_count,
        frame_count,
        sample_rate,
        0);
  }

  int32_t unregisterAsset(uint32_t asset_id) {
    return kessho_product_unregister_asset_buffer(engine_, asset_id);
  }

 private:
  KesshoProductEngine* engine_ = nullptr;
};

KesshoProductSnapshotV2 makeNativeSmokeSnapshot() {
  KesshoProductSnapshotV2 snapshot{};
  snapshot.version = KESSHO_PRODUCT_SNAPSHOT_VERSION;
  snapshot.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
  snapshot.transport.bpm = 120.0f;
  snapshot.transport.beats_per_bar = 4;
  snapshot.transport.bars_per_phrase = 4;
  snapshot.master.gain = 0.8f;
  snapshot.rng.seed = 23;
  snapshot.rng.state = 23;
  for (uint32_t i = 0; i < 7; ++i) {
    snapshot.sources[i].enabled = i == KESSHO_PRODUCT_SOURCE_PAD1 - 1 ? 1u : 0u;
    snapshot.sources[i].source_id = i + 1u;
    snapshot.sources[i].level = 0.9f;
    snapshot.sources[i].dry_gain = 1.0f;
    snapshot.sources[i].expression = 0.85f;
    snapshot.sources[i].post_lpf_hz = 18000.0f;
    snapshot.sources[i].stereo_width = 1.0f;
  }
  kessho::product::tests::applyGeneratedSourceDefaults(snapshot);
  return snapshot;
}

KesshoProductEvent startEvent() {
  KesshoProductEvent event{};
  event.event_kind = KESSHO_PRODUCT_EVENT_KIND_START;
  return event;
}

KesshoProductEvent manualPadNote() {
  KesshoProductEvent event{};
  event.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  event.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  event.value = 60.0f;
  event.value2 = 0.75f;
  event.value3 = 0.45f;
  return event;
}

float renderPeak(NativeProductEngine& engine) {
  std::array<float, kBlockFrames> left{};
  std::array<float, kBlockFrames> right{};
  float peak = 0.0f;
  for (uint32_t block = 0; block < 64; ++block) {
    left.fill(0.0f);
    right.fill(0.0f);
    engine.render(left.data(), right.data(), kBlockFrames);
    for (uint32_t frame = 0; frame < kBlockFrames; ++frame) {
      require(std::isfinite(left[frame]) && std::isfinite(right[frame]), "non-finite native render sample");
      peak = std::max(peak, std::max(std::fabs(left[frame]), std::fabs(right[frame])));
    }
  }
  return peak;
}

void runNativeRenderSmoke() {
  NativeProductEngine engine(48000.0, kBlockFrames);
  require(engine.valid(), "native wrapper failed to create Product Core engine");
  const KesshoProductSnapshotV2 snapshot = makeNativeSmokeSnapshot();
  require(engine.loadSnapshot(snapshot) == KESSHO_PRODUCT_OK, "native wrapper failed to load snapshot");
  const std::array<KesshoProductEvent, 2> events{startEvent(), manualPadNote()};
  require(engine.enqueueEvents(events.data(), static_cast<uint32_t>(events.size())) == KESSHO_PRODUCT_OK, "native wrapper failed to enqueue events");
  require(renderPeak(engine) > 0.00001f, "native wrapper render stayed silent");

  KesshoProductTelemetry telemetry{};
  require(engine.copyTelemetry(telemetry) == KESSHO_PRODUCT_OK, "native wrapper failed to copy telemetry");
  require(telemetry.sample_rate == 48000.0, "native telemetry sample rate mismatch");
  require(telemetry.block_size == kBlockFrames, "native telemetry block size mismatch");
}

void runNativeAssetSmoke() {
  NativeProductEngine engine(48000.0, kBlockFrames);
  require(engine.valid(), "native asset wrapper failed to create Product Core engine");
  std::array<float, 256> left{};
  std::array<float, 256> right{};
  for (size_t i = 0; i < left.size(); ++i) {
    left[i] = std::sin(static_cast<float>(i) * 0.03f) * 0.2f;
    right[i] = std::cos(static_cast<float>(i) * 0.03f) * 0.2f;
  }
  const float* channels[] = {left.data(), right.data()};
  require(engine.registerAsset(9001, channels, 2, static_cast<uint32_t>(left.size()), 48000.0) == KESSHO_PRODUCT_OK, "native asset registration failed");
  require(engine.unregisterAsset(9001) == KESSHO_PRODUCT_OK, "native asset unregister failed");
}

float renderPeak(const float* left, const float* right, uint32_t frames) {
  float peak = 0.0f;
  for (uint32_t frame = 0; frame < frames; ++frame) {
    require(std::isfinite(left[frame]) && std::isfinite(right[frame]), "non-finite native runtime render sample");
    peak = std::max(peak, std::max(std::fabs(left[frame]), std::fabs(right[frame])));
  }
  return peak;
}

void runNativeRuntimeAdapterSmoke() {
  kessho::product::native::NativeProductRuntime runtime({48000.0, kBlockFrames, 0});
  require(runtime.valid(), "native runtime adapter failed to create Product Core engine");
  const KesshoProductSnapshotV2 snapshot = makeNativeSmokeSnapshot();
  require(runtime.loadSnapshot(snapshot) == KESSHO_PRODUCT_OK, "native runtime adapter failed to load snapshot");
  const std::array<KesshoProductEvent, 2> events{startEvent(), manualPadNote()};
  require(runtime.enqueueEvents(events.data(), static_cast<uint32_t>(events.size())) == KESSHO_PRODUCT_OK, "native runtime adapter failed to enqueue events");
  require(runtime.queuedEventCount() == events.size(), "native runtime adapter queue depth mismatch before render");
  float peak = 0.0f;
  for (uint32_t block = 0; block < 64; ++block) {
    require(runtime.renderIntoPreallocatedBuffers(kBlockFrames) == KESSHO_PRODUCT_OK, "native runtime adapter render callback failed");
    peak = std::max(peak, renderPeak(runtime.preallocatedLeft(), runtime.preallocatedRight(), kBlockFrames));
  }
  require(peak > 0.00001f, "native runtime adapter render stayed silent");
  require(runtime.queuedEventCount() == 0, "native runtime adapter did not drain queued events on render thread");
  KesshoProductTelemetry telemetry{};
  require(runtime.copyTelemetry(telemetry) == KESSHO_PRODUCT_OK, "native runtime adapter failed telemetry double-buffer copy");
  require(telemetry.sample_rate == 48000.0, "native runtime adapter telemetry sample rate mismatch");
  require(telemetry.block_size == kBlockFrames, "native runtime adapter telemetry block size mismatch");
  require(runtime.droppedEventCount() == 0, "native runtime adapter dropped events unexpectedly");
  require(runtime.reset() == KESSHO_PRODUCT_OK, "native runtime adapter reset failed");
  require(runtime.queuedEventCount() == 0, "native runtime adapter reset left queued events");
}

} // namespace

int main() {
  const KesshoProductCapabilityReport report = kessho_product_get_capability_report();
  require(report.supports_native_bridge == 0, "supports_native_bridge must remain 0 until BG3 signoff");
  runNativeRenderSmoke();
  runNativeAssetSmoke();
  runNativeRuntimeAdapterSmoke();
  std::cout << "Kessho Product native render path tests passed\n";
  return 0;
}
