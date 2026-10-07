#include "KesshoNativeProductRuntime.h"

#include "../ProductSequencerVariationValidation.h"

#include <algorithm>
#include <cmath>
#include <limits>

namespace kessho::product::native {

namespace {

uint32_t sequencerVariationRevisionSlot(uint32_t sequencer_id, uint32_t lane_index) {
  return (sequencer_id == KESSHO_PRODUCT_SEQUENCER_DRUM ? 8u : 0u) + lane_index;
}

struct HostSpinLockGuard {
  explicit HostSpinLockGuard(std::atomic_flag& lock) : lock_(lock) {
    while (lock_.test_and_set(std::memory_order_acquire)) {
    }
  }

  ~HostSpinLockGuard() {
    lock_.clear(std::memory_order_release);
  }

  HostSpinLockGuard(const HostSpinLockGuard&) = delete;
  HostSpinLockGuard& operator=(const HostSpinLockGuard&) = delete;

 private:
  std::atomic_flag& lock_;
};

} // namespace

NativeProductRuntime::NativeProductRuntime(const NativeProductRuntimeConfig& config)
    : max_block_size_(config.max_block_size) {
  for (uint32_t slot = 0u; slot < sequencer_variation_pending_slots_.size(); ++slot) {
    sequencer_variation_pending_slots_[slot].store(UINT32_MAX, std::memory_order_relaxed);
    pending_sequencer_variation_selections_[slot].store(0u, std::memory_order_relaxed);
    sequencer_variation_native_revisions_[slot].store(0u, std::memory_order_relaxed);
    sequencer_variation_mailbox_locks_[slot].clear(std::memory_order_relaxed);
    sequencer_variation_shadow_valid_[slot] = false;
    sequencer_variation_runtime_buffers_[slot].reset();
  }
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
    publishCaptureClockOnRenderThread();
    publishSequencerVariationRuntimesOnRenderThread();
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
  for (uint32_t slot = 0u; slot < sequencer_variation_pending_slots_.size(); ++slot) {
    HostSpinLockGuard guard(sequencer_variation_mailbox_locks_[slot]);
    sequencer_variation_pending_slots_[slot].store(UINT32_MAX, std::memory_order_release);
    pending_sequencer_variation_selections_[slot].store(0u, std::memory_order_release);
    sequencer_variation_native_revisions_[slot].store(0u, std::memory_order_release);
    sequencer_variation_next_slots_[slot] = 0u;
    sequencer_variation_shadow_banks_[slot] = {};
    sequencer_variation_shadow_valid_[slot] = false;
    sequencer_variation_runtime_buffers_[slot].reset();
  }
  recorded_capture_manual_ring_.reset();
  recorded_capture_active_.store(false, std::memory_order_release);
  recorded_capture_origin_.publish({});
  recorded_capture_requested_generation_.store(0u, std::memory_order_release);
  recorded_capture_origin_generation_.store(0u, std::memory_order_release);
  recorded_capture_source_lane_index_ = 0u;
  recorded_capture_target_lane_index_ = 0u;
  recorded_capture_source_mode_ = 0u;
  (void)kessho_product_refresh_telemetry(engine_);
  KesshoProductTelemetry telemetry{};
  if (kessho_product_copy_telemetry(engine_, &telemetry) == KESSHO_PRODUCT_OK) {
    telemetry_buffers_[0] = telemetry;
    telemetry_buffers_[1] = telemetry;
    active_telemetry_index_.store(0, std::memory_order_release);
  }
  publishCaptureClockOnRenderThread();
  publishSequencerVariationRuntimesOnRenderThread();
  return KESSHO_PRODUCT_OK;
}

int32_t NativeProductRuntime::loadSnapshot(const KesshoProductSnapshotV2& snapshot) {
  if (engine_ == nullptr) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  const int32_t result = kessho_product_load_snapshot_v2(engine_, &snapshot, sizeof(snapshot));
  if (result == KESSHO_PRODUCT_OK) {
    publishCaptureClockOnRenderThread();
  }
  return result;
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

int32_t NativeProductRuntime::setSequencerVariationBank(
    uint32_t sequencer_id,
    uint32_t lane_index,
    const KesshoProductSequencerVariationBank& bank,
    uint64_t* native_revision) {
  if (engine_ == nullptr) return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  if ((sequencer_id != KESSHO_PRODUCT_SEQUENCER_SYNTH &&
       sequencer_id != KESSHO_PRODUCT_SEQUENCER_DRUM) ||
      lane_index >= 8u) {
    return KESSHO_PRODUCT_ERROR_INVALID_SEQUENCER_LANE;
  }
  KesshoProductSequencerUiState ui_state{};
  if (kessho_product_copy_sequencer_ui_state(engine_, &ui_state) != KESSHO_PRODUCT_OK) {
    return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  }
  const uint32_t lane_count = sequencer_id == KESSHO_PRODUCT_SEQUENCER_DRUM
      ? ui_state.drum_lane_count
      : ui_state.synth_lane_count;
  if (lane_index >= lane_count) return KESSHO_PRODUCT_ERROR_INVALID_SEQUENCER_LANE;
  if (!kessho::product::internal::validateSequencerVariationBank(bank)) {
    return KESSHO_PRODUCT_ERROR_INVALID_PARAM;
  }
  const uint32_t slot = sequencerVariationRevisionSlot(sequencer_id, lane_index);
  HostSpinLockGuard guard(sequencer_variation_mailbox_locks_[slot]);
  const uint32_t pending = sequencer_variation_pending_slots_[slot].load(std::memory_order_acquire);
  if (pending != UINT32_MAX) {
    return KESSHO_PRODUCT_ERROR_EVENT_QUEUE_FULL;
  }
  const uint32_t write_slot = sequencer_variation_next_slots_[slot] % kSequencerVariationMailboxSlots;
  KesshoProductSequencerVariationRuntime runtime{};
  if (!sequencer_variation_runtime_buffers_[slot].copyTo(runtime)) {
    return KESSHO_PRODUCT_ERROR_EVENT_QUEUE_FULL;
  }
  const uint64_t revision_floor = std::max(
      runtime.revision,
      sequencer_variation_native_revisions_[slot].load(std::memory_order_acquire));
  if (revision_floor == UINT64_MAX ||
      (bank.revision <= revision_floor && revision_floor >= UINT64_MAX - 1u)) {
    return KESSHO_PRODUCT_ERROR_INVALID_PARAM;
  }
  KesshoProductSequencerVariationBank submitted = bank;
  submitted.revision = bank.revision > revision_floor
      ? bank.revision
      : revision_floor + 1u;
  const uint32_t mailbox_index = slot * kSequencerVariationMailboxSlots + write_slot;
  sequencer_variation_mailboxes_[mailbox_index] = submitted;
  // Keep this slot reserved until the render thread has copied it into the
  // core's pending bank.  A second host submission receives queue-full rather
  // than racing a 79 KiB copy.
  sequencer_variation_pending_slots_[slot].store(write_slot, std::memory_order_release);
  sequencer_variation_next_slots_[slot] = (write_slot + 1u) % kSequencerVariationMailboxSlots;
  sequencer_variation_native_revisions_[slot].store(submitted.revision, std::memory_order_release);
  sequencer_variation_shadow_banks_[slot] = submitted;
  sequencer_variation_shadow_valid_[slot] = true;
  if (native_revision != nullptr) *native_revision = submitted.revision;
  return KESSHO_PRODUCT_OK;
}

int32_t NativeProductRuntime::selectSequencerVariation(
    uint32_t sequencer_id,
    uint32_t lane_index,
    uint32_t variation_index) {
  if (engine_ == nullptr) return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  if ((sequencer_id != KESSHO_PRODUCT_SEQUENCER_SYNTH &&
       sequencer_id != KESSHO_PRODUCT_SEQUENCER_DRUM) ||
      lane_index >= 8u ||
      variation_index >= KESSHO_PRODUCT_SEQUENCER_VARIATION_COUNT) {
    return KESSHO_PRODUCT_ERROR_INVALID_PARAM;
  }
  const uint32_t slot = sequencerVariationRevisionSlot(sequencer_id, lane_index);
  HostSpinLockGuard guard(sequencer_variation_mailbox_locks_[slot]);
  if (!sequencer_variation_shadow_valid_[slot]) {
    return KESSHO_PRODUCT_ERROR_INVALID_PARAM;
  }
  const auto& bank = sequencer_variation_shadow_banks_[slot];
  if (bank.enabled == 0u || !bank.variations[variation_index].step_count) {
    return KESSHO_PRODUCT_ERROR_INVALID_PARAM;
  }
  if (bank.chain_length > 1u) {
    bool in_chain = false;
    for (uint32_t entry = 0u; entry < bank.chain_length; ++entry) {
      if (bank.chain[entry] == variation_index) {
        in_chain = true;
        break;
      }
    }
    if (!in_chain) return KESSHO_PRODUCT_ERROR_INVALID_PARAM;
  }
  // Selection is a compact command and may replace an earlier unconsumed
  // editor selection.  The bank itself remains render-thread owned.
  pending_sequencer_variation_selections_[slot].store(
      variation_index + 1u, std::memory_order_release);
  return KESSHO_PRODUCT_OK;
}

int32_t NativeProductRuntime::copySequencerVariationRuntime(
    uint32_t sequencer_id,
    uint32_t lane_index,
    KesshoProductSequencerVariationRuntime& runtime) const {
  if (engine_ == nullptr) return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  if ((sequencer_id != KESSHO_PRODUCT_SEQUENCER_SYNTH &&
       sequencer_id != KESSHO_PRODUCT_SEQUENCER_DRUM) ||
      lane_index >= 8u) {
    return KESSHO_PRODUCT_ERROR_INVALID_SEQUENCER_LANE;
  }
  const uint32_t slot = sequencerVariationRevisionSlot(sequencer_id, lane_index);
  if (!sequencer_variation_runtime_buffers_[slot].copyTo(runtime)) {
    return KESSHO_PRODUCT_ERROR_EVENT_QUEUE_FULL;
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
  drainSequencerVariationMailboxesOnRenderThread();
  drainQueuedEventsOnRenderThread();
  if (interaction_demand_pending_.exchange(false, std::memory_order_acq_rel)) {
    (void)kessho_product_set_interaction_demand(
        engine_,
        pending_interaction_demand_mask_.load(std::memory_order_acquire),
        pending_interaction_source_mask_.load(std::memory_order_acquire));
  }
  kessho_product_render(engine_, out_l, out_r, frames);
  publishSequencerVariationRuntimesOnRenderThread();
  publishCaptureClockOnRenderThread();
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
    if (event.event_kind == KESSHO_PRODUCT_EVENT_KIND_GENERATED_SEQUENCER_CAPTURE) {
      if (event.value >= 0.5f) {
        recorded_capture_manual_ring_.reset();
        recorded_capture_source_lane_index_ = event.index;
        recorded_capture_target_lane_index_ = event.param_id;
        recorded_capture_source_mode_ = static_cast<uint32_t>(std::lround(event.value2));
        KesshoProductCaptureClock clock{};
        if (kessho_product_copy_capture_clock(engine_, &clock) == KESSHO_PRODUCT_OK) {
          recorded_capture_origin_.publish(clock);
          recorded_capture_origin_generation_.store(event.flags, std::memory_order_release);
        }
        recorded_capture_active_.store(true, std::memory_order_release);
      }
    } else if (
        event.event_kind == KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON &&
        recorded_capture_source_mode_ ==
            KESSHO_PRODUCT_GENERATED_SEQUENCER_CAPTURE_MODE_EUCLID &&
        recorded_capture_active_.load(std::memory_order_acquire)) {
      captureManualNoteOnRenderThread(event);
    }
    (void)kessho_product_enqueue_event(engine_, &event);
    if (event.event_kind == KESSHO_PRODUCT_EVENT_KIND_GENERATED_SEQUENCER_CAPTURE &&
        event.value < 0.5f) {
    recorded_capture_active_.store(false, std::memory_order_release);
    }
    read = (read + 1u) % kNativeProductEventQueueCapacity;
  }
  event_read_index_.store(read, std::memory_order_release);
}

void NativeProductRuntime::drainSequencerVariationMailboxesOnRenderThread() {
  if (engine_ == nullptr) return;
  for (uint32_t slot = 0u; slot < sequencer_variation_pending_slots_.size(); ++slot) {
    const uint32_t pending = sequencer_variation_pending_slots_[slot].load(std::memory_order_acquire);
    if (pending != UINT32_MAX) {
      const uint32_t mailbox_index = slot * kSequencerVariationMailboxSlots + pending;
      const uint32_t sequencer_id = slot >= 8u
          ? KESSHO_PRODUCT_SEQUENCER_DRUM
          : KESSHO_PRODUCT_SEQUENCER_SYNTH;
      const uint32_t lane_index = slot % 8u;
      // The pending mailbox remains reserved while this call copies the bank
      // into the core's own render-thread state.
      (void)kessho_product_set_sequencer_variation_bank(
          engine_,
          sequencer_id,
          lane_index,
          &sequencer_variation_mailboxes_[mailbox_index]);
      sequencer_variation_pending_slots_[slot].store(UINT32_MAX, std::memory_order_release);
    }
    const uint32_t selection = pending_sequencer_variation_selections_[slot].exchange(
        0u,
        std::memory_order_acq_rel);
    if (selection != 0u && selection - 1u < KESSHO_PRODUCT_SEQUENCER_VARIATION_COUNT) {
      const uint32_t sequencer_id = slot >= 8u
          ? KESSHO_PRODUCT_SEQUENCER_DRUM
          : KESSHO_PRODUCT_SEQUENCER_SYNTH;
      (void)kessho_product_select_sequencer_variation(
          engine_,
          sequencer_id,
          slot % 8u,
          selection - 1u);
    }
  }
}

void NativeProductRuntime::publishSequencerVariationRuntimesOnRenderThread() {
  if (engine_ == nullptr) return;
  for (uint32_t slot = 0u; slot < sequencer_variation_runtime_buffers_.size(); ++slot) {
    const uint32_t sequencer_id = slot >= 8u
        ? KESSHO_PRODUCT_SEQUENCER_DRUM
        : KESSHO_PRODUCT_SEQUENCER_SYNTH;
    KesshoProductSequencerVariationRuntime runtime{};
    if (kessho_product_copy_sequencer_variation_runtime(
            engine_, sequencer_id, slot % 8u, &runtime) != KESSHO_PRODUCT_OK) {
      continue;
    }
    sequencer_variation_runtime_buffers_[slot].publish(runtime);
  }
}

int32_t NativeProductRuntime::copyCaptureClock(KesshoProductCaptureClock& clock) const {
  if (engine_ == nullptr) return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  return capture_clock_.copyTo(clock)
      ? KESSHO_PRODUCT_OK
      : KESSHO_PRODUCT_ERROR_EVENT_QUEUE_FULL;
}

int32_t NativeProductRuntime::setRecordedCapture(
    bool enabled, uint32_t source_lane_index, uint32_t target_lane_index,
    uint32_t source_mode, double duration_beats) {
  if (engine_ == nullptr) return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  if (source_lane_index >= 8u || target_lane_index >= 8u || source_mode > 2u ||
      !std::isfinite(duration_beats) || (enabled && duration_beats <= 0.0)) {
    return KESSHO_PRODUCT_ERROR_INVALID_PARAM;
  }
  KesshoProductEvent event{};
  event.event_kind = KESSHO_PRODUCT_EVENT_KIND_GENERATED_SEQUENCER_CAPTURE;
  event.target_id = KESSHO_PRODUCT_SEQUENCER_SYNTH;
  event.index = source_lane_index;
  event.param_id = target_lane_index;
  event.value = enabled ? 1.0f : 0.0f;
  event.value2 = static_cast<float>(source_mode);
  if (enabled) {
    event.flags = recorded_capture_requested_generation_.fetch_add(1u, std::memory_order_acq_rel) + 1u;
  }
  return enqueueEvent(event);
}

uint32_t NativeProductRuntime::drainRecordedCaptureEvents(
    KesshoProductGeneratedSequencerCaptureEvent* events, uint32_t max_event_count,
    uint32_t* overflow_count) {
  uint32_t generated_overflow = 0u;
  uint32_t count = kessho_product_drain_generated_sequencer_capture_events(
      engine_, events, max_event_count, &generated_overflow);
  if (events != nullptr) {
    while (count < max_event_count && recorded_capture_manual_ring_.pop(events[count])) ++count;
  }
  if (overflow_count != nullptr) {
    *overflow_count = generated_overflow + recorded_capture_manual_ring_.overflowCount();
  }
  return count;
}

bool NativeProductRuntime::copyRecordedCaptureOrigin(uint64_t& sample, double& beat) const {
  const uint32_t generation = recorded_capture_requested_generation_.load(std::memory_order_acquire);
  if (generation == 0u ||
      generation != recorded_capture_origin_generation_.load(std::memory_order_acquire)) return false;
  KesshoProductCaptureClock clock{};
  if (!recorded_capture_origin_.copyTo(clock) ||
      generation != recorded_capture_requested_generation_.load(std::memory_order_acquire)) return false;
  sample = clock.current_sample;
  beat = clock.current_beat;
  return true;
}

void NativeProductRuntime::publishCaptureClockOnRenderThread() {
  if (engine_ == nullptr) return;
  KesshoProductCaptureClock clock{};
  if (kessho_product_copy_capture_clock(engine_, &clock) != KESSHO_PRODUCT_OK) return;
  capture_clock_.publish(clock);
}

void NativeProductRuntime::captureManualNoteOnRenderThread(const KesshoProductEvent& event) {
  KesshoProductCaptureClock clock{};
  uint64_t block_sample = 0u;
  if (kessho_product_copy_capture_clock(engine_, &clock) == KESSHO_PRODUCT_OK) {
    block_sample = clock.current_sample;
  }
  KesshoProductGeneratedSequencerCaptureEvent captured{};
  captured.absolute_sample = block_sample > std::numeric_limits<uint64_t>::max() - event.sample_offset
      ? std::numeric_limits<uint64_t>::max()
      : block_sample + event.sample_offset;
  captured.source_lane_index = recorded_capture_source_lane_index_;
  captured.source_mode = recorded_capture_source_mode_;
  captured.target_source_id = event.target_id;
  captured.midi_note = std::clamp(event.value, 0.0f, 127.0f);
  captured.velocity = std::clamp(event.value2, 0.0f, 1.0f);
  captured.gate_seconds = std::clamp(
      std::isfinite(event.value3) ? event.value3 : 0.001f,
      0.001f,
      20.0f);
  recorded_capture_manual_ring_.push(captured);
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
