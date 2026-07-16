#include "KesshoNativeProductRuntime.h"

#include <algorithm>

namespace kessho::product::native {

NativeProductRuntime::NativeProductRuntime(const NativeProductRuntimeConfig& config)
    : max_block_size_(config.max_block_size) {
  if (config.max_block_size == 0 || config.max_block_size > kNativeProductMaxBlockFrames) {
    return;
  }
  engine_ = kessho_product_create(config.sample_rate, config.max_block_size, config.flags);
  if (engine_ != nullptr) {
    (void)kessho_product_set_meter_demand(engine_, 1u);
    (void)kessho_product_refresh_telemetry(engine_);
    KesshoProductTelemetry telemetry{};
    if (kessho_product_copy_telemetry(engine_, &telemetry) == KESSHO_PRODUCT_OK) {
      telemetry_buffers_[0] = telemetry;
      telemetry_buffers_[1] = telemetry;
    }
  }
}

NativeProductRuntime::~NativeProductRuntime() {
  if (engine_ != nullptr) {
    kessho_product_destroy(engine_);
    engine_ = nullptr;
  }
}

bool NativeProductRuntime::valid() const {
  return engine_ != nullptr;
}

int32_t NativeProductRuntime::reset() {
  if (engine_ == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  kessho_product_reset(engine_);
  event_read_index_.store(0, std::memory_order_release);
  event_write_index_.store(0, std::memory_order_release);
  dropped_event_count_.store(0, std::memory_order_release);
  telemetry_refresh_requested_.store(false, std::memory_order_release);
  telemetry_publication_count_.store(0u, std::memory_order_release);
  telemetry_blocks_since_publish_ = 0u;
  (void)kessho_product_refresh_telemetry(engine_);
  KesshoProductTelemetry telemetry{};
  if (kessho_product_copy_telemetry(engine_, &telemetry) == KESSHO_PRODUCT_OK) {
    telemetry_buffers_[0] = telemetry;
    telemetry_buffers_[1] = telemetry;
    active_telemetry_index_.store(0, std::memory_order_release);
  }
  return KESSHO_PRODUCT_OK;
}

int32_t NativeProductRuntime::loadSnapshot(const KesshoProductSnapshotV2& snapshot) {
  if (engine_ == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  return kessho_product_load_snapshot_v2(engine_, &snapshot, sizeof(snapshot));
}

int32_t NativeProductRuntime::enqueueEvent(const KesshoProductEvent& event) {
  const uint32_t write = event_write_index_.load(std::memory_order_relaxed);
  const uint32_t next = (write + 1u) % kNativeProductEventQueueCapacity;
  const uint32_t read = event_read_index_.load(std::memory_order_acquire);
  if (next == read) {
    dropped_event_count_.fetch_add(1u, std::memory_order_release);
    return KESSHO_PRODUCT_ERROR_EVENT_QUEUE_FULL;
  }
  event_queue_[write] = event;
  event_write_index_.store(next, std::memory_order_release);
  return KESSHO_PRODUCT_OK;
}

int32_t NativeProductRuntime::enqueueEvents(const KesshoProductEvent* events, uint32_t event_count) {
  if (events == nullptr && event_count > 0u) {
    return KESSHO_PRODUCT_ERROR_INVALID_EVENT;
  }
  for (uint32_t i = 0; i < event_count; ++i) {
    const int32_t result = enqueueEvent(events[i]);
    if (result != KESSHO_PRODUCT_OK) {
      return result;
    }
  }
  return KESSHO_PRODUCT_OK;
}

int32_t NativeProductRuntime::renderCallback(float* out_l, float* out_r, uint32_t frames) {
  if (engine_ == nullptr || out_l == nullptr || out_r == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  if (frames == 0u || frames > max_block_size_ || frames > kNativeProductMaxBlockFrames) {
    return KESSHO_PRODUCT_ERROR_RENDER_BLOCK_TOO_LARGE;
  }
  drainQueuedEventsOnRenderThread();
  kessho_product_render(engine_, out_l, out_r, frames);
  publishTelemetryOnRenderThread();
  return KESSHO_PRODUCT_OK;
}

int32_t NativeProductRuntime::renderIntoPreallocatedBuffers(uint32_t frames) {
  return renderCallback(render_left_.data(), render_right_.data(), frames);
}

int32_t NativeProductRuntime::copyTelemetry(KesshoProductTelemetry& telemetry) const {
  const uint32_t active = active_telemetry_index_.load(std::memory_order_acquire) & 1u;
  telemetry = telemetry_buffers_[active];
  return engine_ == nullptr ? KESSHO_PRODUCT_ERROR_INVALID_ENGINE : KESSHO_PRODUCT_OK;
}

int32_t NativeProductRuntime::registerAssetBuffer(
    uint32_t asset_id,
    const float* const* channels,
    uint32_t channel_count,
    uint32_t frame_count,
    double asset_sample_rate,
    uint32_t flags) {
  if (engine_ == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  return kessho_product_register_asset_buffer(
      engine_,
      asset_id,
      channels,
      channel_count,
      frame_count,
      asset_sample_rate,
      flags);
}

int32_t NativeProductRuntime::unregisterAssetBuffer(uint32_t asset_id) {
  if (engine_ == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  return kessho_product_unregister_asset_buffer(engine_, asset_id);
}

uint32_t NativeProductRuntime::queuedEventCount() const {
  const uint32_t write = event_write_index_.load(std::memory_order_acquire);
  const uint32_t read = event_read_index_.load(std::memory_order_acquire);
  return write >= read
      ? write - read
      : kNativeProductEventQueueCapacity - read + write;
}

void NativeProductRuntime::drainQueuedEventsOnRenderThread() {
  uint32_t read = event_read_index_.load(std::memory_order_relaxed);
  const uint32_t write = event_write_index_.load(std::memory_order_acquire);
  while (read != write) {
    const KesshoProductEvent event = event_queue_[read];
    (void)kessho_product_enqueue_event(engine_, &event);
    read = (read + 1u) % kNativeProductEventQueueCapacity;
  }
  event_read_index_.store(read, std::memory_order_release);
}

void NativeProductRuntime::publishTelemetryOnRenderThread() {
  const bool explicitly_requested = telemetry_refresh_requested_.exchange(false, std::memory_order_acq_rel);
  ++telemetry_blocks_since_publish_;
  if (!explicitly_requested && telemetry_blocks_since_publish_ < kNativeProductTelemetryBlockCadence) {
    return;
  }
  telemetry_blocks_since_publish_ = 0u;
  if (kessho_product_refresh_telemetry(engine_) != KESSHO_PRODUCT_OK) {
    return;
  }
  const uint32_t inactive = (active_telemetry_index_.load(std::memory_order_relaxed) + 1u) & 1u;
  if (kessho_product_copy_telemetry(engine_, &telemetry_buffers_[inactive]) == KESSHO_PRODUCT_OK) {
    active_telemetry_index_.store(inactive, std::memory_order_release);
    telemetry_publication_count_.fetch_add(1u, std::memory_order_release);
  }
}

} // namespace kessho::product::native
