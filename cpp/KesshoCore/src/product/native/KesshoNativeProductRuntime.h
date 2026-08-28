#pragma once

#include <array>
#include <atomic>
#include <cstdint>

#include "KesshoCore/KesshoProductCore.h"

namespace kessho::product::native {

inline constexpr uint32_t kNativeProductMaxBlockFrames = 1024;
inline constexpr uint32_t kNativeProductEventQueueCapacity = 256;
inline constexpr uint32_t kNativeProductTelemetryBlockCadence = 16;
inline constexpr uint32_t kNativeProductInteractionEventQueueCapacity = 257;

struct NativeProductRuntimeConfig {
  double sample_rate = 48000.0;
  uint32_t max_block_size = 128;
  uint32_t flags = 0;
};

class NativeProductRuntime {
 public:
  explicit NativeProductRuntime(const NativeProductRuntimeConfig& config);
  ~NativeProductRuntime();

  NativeProductRuntime(const NativeProductRuntime&) = delete;
  NativeProductRuntime& operator=(const NativeProductRuntime&) = delete;

  bool valid() const;
  uint32_t maxBlockSize() const { return max_block_size_; }

  int32_t reset();
  int32_t loadSnapshot(const KesshoProductSnapshotV2& snapshot);
  int32_t enqueueEvent(const KesshoProductEvent& event);
  int32_t enqueueEvents(const KesshoProductEvent* events, uint32_t event_count);

  int32_t renderCallback(float* out_l, float* out_r, uint32_t frames);
  int32_t renderIntoPreallocatedBuffers(uint32_t frames);
  const float* preallocatedLeft() const { return render_left_.data(); }
  const float* preallocatedRight() const { return render_right_.data(); }

  int32_t copyTelemetry(KesshoProductTelemetry& telemetry) const;
  int32_t setInteractionDemand(uint32_t demand_mask, uint32_t source_mask);
  int32_t copyInteractionSignals(KesshoProductInteractionSignalSnapshot& signals) const;
  uint32_t drainInteractionEvents(
      KesshoProductInteractionEvent* events,
      uint32_t max_event_count,
      uint32_t* overflow_count);
  void requestTelemetryRefresh() { telemetry_refresh_requested_.store(true, std::memory_order_release); }
  uint64_t telemetryPublicationCount() const {
    return telemetry_publication_count_.load(std::memory_order_acquire);
  }

  int32_t registerAssetBuffer(
      uint32_t asset_id,
      const float* const* channels,
      uint32_t channel_count,
      uint32_t frame_count,
      double asset_sample_rate,
      uint32_t flags);
  int32_t unregisterAssetBuffer(uint32_t asset_id);

  uint32_t droppedEventCount() const { return dropped_event_count_.load(std::memory_order_acquire); }
  uint32_t queuedEventCount() const;

 private:
  void drainQueuedEventsOnRenderThread();
  void publishTelemetryOnRenderThread();
  void publishInteractionEventsOnRenderThread();

  KesshoProductEngine* engine_ = nullptr;
  uint32_t max_block_size_ = 0;
  std::array<KesshoProductEvent, kNativeProductEventQueueCapacity> event_queue_{};
  std::atomic<uint32_t> event_write_index_{0};
  std::atomic<uint32_t> event_read_index_{0};
  std::atomic<uint32_t> dropped_event_count_{0};
  std::array<KesshoProductTelemetry, 2> telemetry_buffers_{};
  std::atomic<uint32_t> active_telemetry_index_{0};
  std::atomic<bool> telemetry_refresh_requested_{false};
  std::atomic<uint64_t> telemetry_publication_count_{0};
  std::array<KesshoProductInteractionSignalSnapshot, 2> interaction_signal_buffers_{};
  std::atomic<uint32_t> active_interaction_signal_index_{0};
  std::atomic<uint32_t> pending_interaction_demand_mask_{0};
  std::atomic<uint32_t> pending_interaction_source_mask_{0};
  std::atomic<bool> interaction_demand_pending_{false};
  std::array<KesshoProductInteractionEvent, kNativeProductInteractionEventQueueCapacity> interaction_event_queue_{};
  std::array<KesshoProductInteractionEvent, KESSHO_PRODUCT_INTERACTION_EVENT_CAPACITY> interaction_event_scratch_{};
  std::atomic<uint32_t> interaction_event_write_index_{0};
  std::atomic<uint32_t> interaction_event_read_index_{0};
  std::atomic<uint32_t> interaction_event_overflow_count_{0};
  uint32_t interaction_core_overflow_count_ = 0u;
  uint32_t telemetry_blocks_since_publish_ = 0u;
  std::array<float, kNativeProductMaxBlockFrames> render_left_{};
  std::array<float, kNativeProductMaxBlockFrames> render_right_{};
};

} // namespace kessho::product::native
