#pragma once

#include <cstdint>

namespace kessho::product::internal {

constexpr uint32_t kProductRoutingMuteGroupSlotCount = 8u;
constexpr uint32_t kProductRoutingMuteRowCount = 16u;
constexpr uint32_t kProductRoutingMuteNoSlot = UINT32_MAX;

enum ProductRoutingMuteRow : uint32_t {
  kRoutingMuteRowPad1 = 0u,
  kRoutingMuteRowPad2,
  kRoutingMuteRowLead1,
  kRoutingMuteRowLead2,
  kRoutingMuteRowSample1,
  kRoutingMuteRowSample2,
  kRoutingMuteRowDrums,
  kRoutingMuteRowGranular,
  kRoutingMuteRowWaves,
  kRoutingMuteRowWater,
  kRoutingMuteRowInsects,
  kRoutingMuteRowNature,
  kRoutingMuteRowDelayA,
  kRoutingMuteRowDelayB,
  kRoutingMuteRowDegrade,
  kRoutingMuteRowReverb,
};

struct ProductRoutingMuteGroupSlot {
  uint32_t mute_mask = 0u;
  uint32_t min_hold_quarter_phrases = 8u;
  uint32_t max_hold_quarter_phrases = 24u;
  uint32_t transition_frames = 0u;
  uint32_t synth_lane_enabled_mask = 0u;
  uint32_t synth_lane_muted_mask = 0u;
  uint32_t drum_lane_enabled_mask = 0u;
  uint32_t drum_lane_muted_mask = 0u;
  uint32_t granular_voice_enabled_mask = 0u;
  bool stored = false;
  bool eligible = false;
};

struct ProductRoutingMuteRowRamp {
  float start_gain = 1.0f;
  float target_gain = 1.0f;
  uint64_t start_frame = 0u;
  uint64_t end_frame = 0u;
  bool runtime_muted = false;
};

struct ProductRoutingMuteGroupRuntimeState {
  ProductRoutingMuteGroupSlot active[kProductRoutingMuteGroupSlotCount]{};
  ProductRoutingMuteGroupSlot staging[kProductRoutingMuteGroupSlotCount]{};
  ProductRoutingMuteRowRamp rows[kProductRoutingMuteRowCount]{};
  uint32_t active_slot = kProductRoutingMuteNoSlot;
  uint32_t next_slot = kProductRoutingMuteNoSlot;
  uint32_t rng_state = 1u;
  uint32_t revision = 0u;
  uint32_t trace_revision = 0u;
  uint32_t baseline_synth_lane_enabled_mask = 0u;
  uint32_t baseline_synth_lane_muted_mask = 0u;
  uint32_t baseline_drum_lane_enabled_mask = 0u;
  uint32_t baseline_drum_lane_muted_mask = 0u;
  uint32_t baseline_granular_voice_enabled_mask = 0u;
  uint32_t non_unity_row_mask = 0u;
  uint64_t next_change_frame = UINT64_MAX;
  uint64_t fade_end_frame = 0u;
  bool staging_open = false;
  bool enabled = false;
  bool avoid_repeat = true;
};

} // namespace kessho::product::internal
