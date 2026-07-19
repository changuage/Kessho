#pragma once

#include <stdint.h>

#ifdef __cplusplus
#include <array>
#include <atomic>
#endif

#ifdef __cplusplus
extern "C" {
#endif

#define KESSHO_PRODUCT_SIMPLE_SEQUENCER_VISUAL_CHORD 1u
#define KESSHO_PRODUCT_SIMPLE_SEQUENCER_VISUAL_RANDOM_TIMING 2u

typedef struct KesshoProductSimpleSequencerVisualEvent {
  uint64_t event_id;
  uint64_t absolute_sample;
  uint64_t phrase_start_sample;
  uint64_t phrase_index;
  uint32_t kind;
  uint32_t target_source_id;
  float midi_note;
  float velocity;
  float gate_seconds;
  uint32_t voice_index;
  float phrase_seconds;
  float trigger_interval_seconds;
} KesshoProductSimpleSequencerVisualEvent;

#ifdef __cplusplus
}

namespace kessho::product {

static_assert(
    sizeof(KesshoProductSimpleSequencerVisualEvent) == 64u,
    "Simple sequencer visual event ABI size changed");

template <size_t Capacity>
class SimpleSequencerVisualRing {
public:
  bool push(const KesshoProductSimpleSequencerVisualEvent& event) noexcept {
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

  bool pop(KesshoProductSimpleSequencerVisualEvent& out) noexcept {
    const uint32_t read = read_index_.load(std::memory_order_relaxed);
    const uint32_t write = write_index_.load(std::memory_order_acquire);
    if (read == write) return false;
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
  std::array<KesshoProductSimpleSequencerVisualEvent, Capacity> buffer_{};
  std::atomic<uint32_t> read_index_{0u};
  std::atomic<uint32_t> write_index_{0u};
  std::atomic<uint32_t> overflow_count_{0u};
};

} // namespace kessho::product
#endif
