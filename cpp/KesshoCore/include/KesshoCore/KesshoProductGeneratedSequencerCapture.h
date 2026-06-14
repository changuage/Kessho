#pragma once

#include <stdint.h>

#ifdef __cplusplus
#include <array>
#include <atomic>
#endif

#ifdef __cplusplus
extern "C" {
#endif

typedef enum KesshoProductGeneratedSequencerCaptureMode {
  KESSHO_PRODUCT_GENERATED_SEQUENCER_CAPTURE_MODE_EUCLID = 0u,
  KESSHO_PRODUCT_GENERATED_SEQUENCER_CAPTURE_MODE_ANCHOR_WALKER = 1u,
  KESSHO_PRODUCT_GENERATED_SEQUENCER_CAPTURE_MODE_ORBIT = 2u
} KesshoProductGeneratedSequencerCaptureMode;

typedef struct KesshoProductGeneratedSequencerCaptureEvent {
  uint64_t event_id;
  uint64_t absolute_sample;
  uint32_t source_lane_index;
  uint32_t source_mode;
  uint32_t target_source_id;
  float midi_note;
  float velocity;
  float gate_seconds;
  int32_t source_step_index;
  int32_t source_layer_index;
  int32_t source_note_index;
  int32_t target_step_index;
} KesshoProductGeneratedSequencerCaptureEvent;

typedef struct KesshoProductGeneratedSequencerCaptureConfig {
  uint32_t enabled;
  int32_t source_lane_index;
  int32_t target_lane_index;
  uint32_t source_mode_mask;
} KesshoProductGeneratedSequencerCaptureConfig;

#ifdef __cplusplus
}
#endif

#ifdef __cplusplus

namespace kessho::product {

static_assert(
    sizeof(KesshoProductGeneratedSequencerCaptureEvent) == 56u,
    "Generated sequencer capture event ABI size changed");

inline uint32_t generatedSequencerCaptureModeBit(uint32_t mode) noexcept {
  return 1u << (mode & 31u);
}

inline bool shouldCaptureGeneratedSequencerEvent(
    const KesshoProductGeneratedSequencerCaptureConfig& config,
    uint32_t source_lane_index,
    uint32_t source_mode) noexcept {
  if (config.enabled == 0u) {
    return false;
  }
  if (config.source_lane_index >= 0 &&
      static_cast<uint32_t>(config.source_lane_index) != source_lane_index) {
    return false;
  }
  return (config.source_mode_mask & generatedSequencerCaptureModeBit(source_mode)) != 0u;
}

template <size_t Capacity>
class GeneratedSequencerCaptureRing {
public:
  bool push(const KesshoProductGeneratedSequencerCaptureEvent& event) noexcept {
    const uint32_t write = write_index_.load(std::memory_order_relaxed);
    const uint32_t next = (write + 1u) % static_cast<uint32_t>(Capacity);
    const uint32_t read = read_index_.load(std::memory_order_acquire);
    if (next == read) {
      overflow_count_.fetch_add(1u, std::memory_order_relaxed);
      return false;
    }
    buffer_[write] = event;
    write_index_.store(next, std::memory_order_release);
    return true;
  }

  bool pop(KesshoProductGeneratedSequencerCaptureEvent& out) noexcept {
    const uint32_t read = read_index_.load(std::memory_order_relaxed);
    const uint32_t write = write_index_.load(std::memory_order_acquire);
    if (read == write) {
      return false;
    }
    out = buffer_[read];
    read_index_.store(
        (read + 1u) % static_cast<uint32_t>(Capacity),
        std::memory_order_release);
    return true;
  }

  uint32_t overflowCount() const noexcept {
    return overflow_count_.load(std::memory_order_relaxed);
  }

  void reset() noexcept {
    read_index_.store(0u, std::memory_order_release);
    write_index_.store(0u, std::memory_order_release);
    overflow_count_.store(0u, std::memory_order_release);
  }

private:
  std::array<KesshoProductGeneratedSequencerCaptureEvent, Capacity> buffer_{};
  std::atomic<uint32_t> read_index_{0u};
  std::atomic<uint32_t> write_index_{0u};
  std::atomic<uint32_t> overflow_count_{0u};
};

} // namespace kessho::product

#endif
