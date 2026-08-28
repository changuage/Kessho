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
  pending_interaction_demand_mask_.store(0u, std::memory_order_release);
  pending_interaction_source_mask_.store(0u, std::memory_order_release);
  interaction_demand_pending_.store(false, std::memory_order_release);
  interaction_signal_buffers_.fill({});
  active_interaction_signal_index_.store(0u, std::memory_order_release);
  interaction_event_write_index_.store(0u, std::memory_order_release);
  interaction_event_read_index_.store(0u, std::memory_order_release);
  interaction_event_overflow_count_.store(0u, std::memory_order_release);
  interaction_core_overflow_count_ = 0u;
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
  if (interaction_demand_pending_.exchange(false, std::memory_order_acq_rel)) {
    (void)kessho_product_set_interaction_demand(
        engine_,
        pending_interaction_demand_mask_.load(std::memory_order_acquire),
        pending_interaction_source_mask_.load(std::memory_order_acquire));
  }
  kessho_product_render(engine_, out_l, out_r, frames);
  publishInteractionEventsOnRenderThread();
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

int32_t NativeProductRuntime::setInteractionDemand(uint32_t demand_mask, uint32_t source_mask) {
  if (engine_ == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  pending_interaction_demand_mask_.store(
      demand_mask & KESSHO_PRODUCT_INTERACTION_DEMAND_ALL,
      std::memory_order_release);
  pending_interaction_source_mask_.store(
      source_mask & KESSHO_PRODUCT_INTERACTION_SOURCE_MASK_ALL,
      std::memory_order_release);
  interaction_demand_pending_.store(true, std::memory_order_release);
  return KESSHO_PRODUCT_OK;
}

int32_t NativeProductRuntime::copyInteractionSignals(
    KesshoProductInteractionSignalSnapshot& signals) const {
  const uint32_t active = active_interaction_signal_index_.load(std::memory_order_acquire) & 1u;
  signals = interaction_signal_buffers_[active];
  return engine_ == nullptr ? KESSHO_PRODUCT_ERROR_INVALID_ENGINE : KESSHO_PRODUCT_OK;
}

uint32_t NativeProductRuntime::drainInteractionEvents(
    KesshoProductInteractionEvent* events,
    uint32_t max_event_count,
    uint32_t* overflow_count) {
  if (overflow_count != nullptr) {
    *overflow_count = interaction_event_overflow_count_.load(std::memory_order_acquire);
  }
  if (events == nullptr || max_event_count == 0u) return 0u;
  uint32_t read = interaction_event_read_index_.load(std::memory_order_relaxed);
  const uint32_t write = interaction_event_write_index_.load(std::memory_order_acquire);
  uint32_t count = 0u;
  while (read != write && count < max_event_count) {
    events[count++] = interaction_event_queue_[read];
    read = (read + 1u) % kNativeProductInteractionEventQueueCapacity;
  }
  interaction_event_read_index_.store(read, std::memory_order_release);
  return count;
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

void NativeProductRuntime::publishInteractionEventsOnRenderThread() {
  uint32_t core_overflow = 0u;
  const uint32_t count = kessho_product_drain_interaction_events(
      engine_, interaction_event_scratch_.data(),
      static_cast<uint32_t>(interaction_event_scratch_.size()), &core_overflow);
  if (core_overflow >= interaction_core_overflow_count_) {
    interaction_event_overflow_count_.fetch_add(
        core_overflow - interaction_core_overflow_count_, std::memory_order_relaxed);
  }
  interaction_core_overflow_count_ = core_overflow;
  uint32_t write = interaction_event_write_index_.load(std::memory_order_relaxed);
  for (uint32_t index = 0u; index < count; ++index) {
    const uint32_t next = (write + 1u) % kNativeProductInteractionEventQueueCapacity;
    if (next == interaction_event_read_index_.load(std::memory_order_acquire)) {
      interaction_event_overflow_count_.fetch_add(1u, std::memory_order_relaxed);
      continue;
    }
    interaction_event_queue_[write] = interaction_event_scratch_[index];
    write = next;
  }
  interaction_event_write_index_.store(write, std::memory_order_release);
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
  const uint32_t interaction_inactive =
      (active_interaction_signal_index_.load(std::memory_order_relaxed) + 1u) & 1u;
  if (kessho_product_copy_interaction_signals(
          engine_, &interaction_signal_buffers_[interaction_inactive]) == KESSHO_PRODUCT_OK) {
    active_interaction_signal_index_.store(interaction_inactive, std::memory_order_release);
  }
}

} // namespace kessho::product::native
