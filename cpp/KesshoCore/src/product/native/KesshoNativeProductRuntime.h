#pragma once

#include <array>
#include <atomic>
#include <cstdint>
#include <cstring>

#include "KesshoCore/KesshoProductCore.h"
#include "KesshoCore/KesshoProductSequencerVariations.h"

namespace kessho::product::native {

// A variation runtime is published by the render thread and copied by a
// control/UI thread.  Atomic fields keep the publication race-free; the
// sequence makes a reader retry if it observed fields from two publications.
struct PublishedSequencerVariationRuntime {
  std::atomic<uint64_t> sequence{0u};
  std::atomic<uint32_t> schema_version{0u};
  std::atomic<uint32_t> active_variation{0u};
  std::atomic<uint32_t> chain_position{0u};
  std::atomic<uint32_t> active_step{0u};
  std::atomic<uint64_t> revision{0u};
  std::atomic<uint64_t> next_boundary_frame{UINT64_MAX};

  void publish(const KesshoProductSequencerVariationRuntime& value) noexcept {
    sequence.fetch_add(1u, std::memory_order_acq_rel);
    schema_version.store(value.schema_version, std::memory_order_relaxed);
    active_variation.store(value.active_variation, std::memory_order_relaxed);
    chain_position.store(value.chain_position, std::memory_order_relaxed);
    active_step.store(value.active_step, std::memory_order_relaxed);
    revision.store(value.revision, std::memory_order_relaxed);
    next_boundary_frame.store(value.next_boundary_frame, std::memory_order_relaxed);
    std::atomic_thread_fence(std::memory_order_release);
    sequence.fetch_add(1u, std::memory_order_release);
  }

  void reset() noexcept {
    KesshoProductSequencerVariationRuntime value{};
    value.next_boundary_frame = UINT64_MAX;
    publish(value);
  }

  bool copyTo(KesshoProductSequencerVariationRuntime& value) const noexcept {
    for (uint32_t attempt = 0u; attempt < 8u; ++attempt) {
      const uint64_t before = sequence.load(std::memory_order_acquire);
      if ((before & 1u) != 0u) continue;
      value.schema_version = schema_version.load(std::memory_order_relaxed);
      value.active_variation = active_variation.load(std::memory_order_relaxed);
      value.chain_position = chain_position.load(std::memory_order_relaxed);
      value.active_step = active_step.load(std::memory_order_relaxed);
      value.revision = revision.load(std::memory_order_relaxed);
      value.next_boundary_frame = next_boundary_frame.load(std::memory_order_relaxed);
      std::atomic_thread_fence(std::memory_order_acquire);
      if (before == sequence.load(std::memory_order_acquire)) return true;
    }
    // Never acknowledge a mixed publication.  The caller retries while the
    // render thread is publishing the next coherent runtime.
    return false;
  }
};

// The capture clock is published by the render thread and read by a control
// or capture-timer thread.  Keep every field atomic so a reader never copies
// through a slot while the render thread is updating it.  The sequence turns
// the individual atomic fields into one coherent snapshot without adding a
// lock to the audio callback.
struct PublishedCaptureClock {
  std::atomic<uint64_t> sequence{0u};
  std::atomic<uint32_t> schema_version{0u};
  std::atomic<uint32_t> reserved{0u};
  std::atomic<uint64_t> current_sample{0u};
  std::atomic<uint64_t> current_beat_bits{0u};
  std::atomic<uint64_t> current_bpm_bits{0u};

  static uint64_t doubleBits(double value) noexcept {
    uint64_t bits = 0u;
    std::memcpy(&bits, &value, sizeof(bits));
    return bits;
  }

  static double bitsDouble(uint64_t bits) noexcept {
    double value = 0.0;
    std::memcpy(&value, &bits, sizeof(value));
    return value;
  }

  void publish(const KesshoProductCaptureClock& value) noexcept {
    sequence.fetch_add(1u, std::memory_order_acq_rel);
    schema_version.store(value.schema_version, std::memory_order_relaxed);
    reserved.store(value.reserved, std::memory_order_relaxed);
    current_sample.store(value.current_sample, std::memory_order_relaxed);
    current_beat_bits.store(doubleBits(value.current_beat), std::memory_order_relaxed);
    current_bpm_bits.store(doubleBits(value.current_bpm), std::memory_order_relaxed);
    std::atomic_thread_fence(std::memory_order_release);
    sequence.fetch_add(1u, std::memory_order_release);
  }

  bool copyTo(KesshoProductCaptureClock& value) const noexcept {
    for (uint32_t attempt = 0u; attempt < 8u; ++attempt) {
      const uint64_t before = sequence.load(std::memory_order_acquire);
      if ((before & 1u) != 0u) continue;
      value.schema_version = schema_version.load(std::memory_order_relaxed);
      value.reserved = reserved.load(std::memory_order_relaxed);
      value.current_sample = current_sample.load(std::memory_order_relaxed);
      const uint64_t current_beat = current_beat_bits.load(std::memory_order_relaxed);
      const uint64_t current_bpm = current_bpm_bits.load(std::memory_order_relaxed);
      std::atomic_thread_fence(std::memory_order_acquire);
      if (before == sequence.load(std::memory_order_acquire)) {
        value.current_beat = bitsDouble(current_beat);
        value.current_bpm = bitsDouble(current_bpm);
        return true;
      }
    }
    return false;
  }
};

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
  int32_t copyCaptureClock(KesshoProductCaptureClock& clock) const;
  int32_t setRecordedCapture(
      bool enabled,
      uint32_t source_lane_index,
      uint32_t target_lane_index,
      uint32_t source_mode,
      double duration_beats);
  uint32_t drainRecordedCaptureEvents(
      KesshoProductGeneratedSequencerCaptureEvent* events,
      uint32_t max_event_count,
      uint32_t* overflow_count);
  bool recordedCaptureActive() const {
    return recorded_capture_active_.load(std::memory_order_acquire);
  }
  bool copyRecordedCaptureOrigin(uint64_t& sample, double& beat) const;

  int32_t setSequencerVariationBank(
      uint32_t sequencer_id,
      uint32_t lane_index,
      const KesshoProductSequencerVariationBank& bank,
      uint64_t* native_revision);
  int32_t selectSequencerVariation(
      uint32_t sequencer_id,
      uint32_t lane_index,
      uint32_t variation_index);
  int32_t copySequencerVariationRuntime(
      uint32_t sequencer_id,
      uint32_t lane_index,
      KesshoProductSequencerVariationRuntime& runtime) const;

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
  void drainSequencerVariationMailboxesOnRenderThread();
  void publishSequencerVariationRuntimesOnRenderThread();
  void captureManualNoteOnRenderThread(const KesshoProductEvent& event);
  void publishCaptureClockOnRenderThread();
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
  static constexpr uint32_t kSequencerVariationMailboxSlots = 2u;
  // Host writes one inactive bank slot, then publishes its index.  The render
  // thread consumes and clears that index only after the core copied the
  // transaction into its own pending state.
  std::array<KesshoProductSequencerVariationBank, 16u * kSequencerVariationMailboxSlots>
      sequencer_variation_mailboxes_{};
  std::array<std::atomic<uint32_t>, 16> sequencer_variation_pending_slots_{};
  // Zero means no selection request; stored values are variation index + 1.
  std::array<std::atomic<uint32_t>, 16> pending_sequencer_variation_selections_{};
  std::array<uint32_t, 16> sequencer_variation_next_slots_{};
  std::array<std::atomic<uint64_t>, 16> sequencer_variation_native_revisions_{};
  std::array<PublishedSequencerVariationRuntime, 16>
      sequencer_variation_runtime_buffers_{};
  std::array<std::atomic_flag, 16> sequencer_variation_mailbox_locks_{};
  std::array<KesshoProductSequencerVariationBank, 16>
      sequencer_variation_shadow_banks_{};
  std::array<bool, 16> sequencer_variation_shadow_valid_{};
  PublishedCaptureClock capture_clock_{};
  static constexpr uint32_t kRecordedCaptureRingCapacity = 2048u;
  kessho::product::GeneratedSequencerCaptureRing<kRecordedCaptureRingCapacity>
      recorded_capture_manual_ring_{};
  std::atomic<bool> recorded_capture_active_{false};
  PublishedCaptureClock recorded_capture_origin_{};
  std::atomic<uint32_t> recorded_capture_requested_generation_{0u};
  std::atomic<uint32_t> recorded_capture_origin_generation_{0u};
  uint32_t recorded_capture_source_lane_index_ = 0u;
  uint32_t recorded_capture_target_lane_index_ = 0u;
  uint32_t recorded_capture_source_mode_ = 0u;
};

} // namespace kessho::product::native
