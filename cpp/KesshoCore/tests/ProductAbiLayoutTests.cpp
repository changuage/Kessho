#include <cstddef>
#include <cstdlib>
#include <iostream>

#include "KesshoCore/KesshoProductCore.h"

namespace {

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "Kessho Product ABI layout test failed: " << message << "\n";
    std::exit(1);
  }
}

} // namespace

int main() {
  static_assert(sizeof(KesshoProductSourceSnapshot) == 3320, "source snapshot ABI size changed");
  static_assert(sizeof(KesshoProductSequencerLaneSnapshot) == 92, "sequencer lane snapshot ABI size changed");
  static_assert(sizeof(KesshoProductSnapshotV2) == 28352, "product snapshot ABI size changed");
  static_assert(sizeof(KesshoProductEvent) == 40, "product event ABI size changed");
  static_assert(sizeof(KesshoSequencerEvent) == 60, "sequencer event ABI size changed");
  static_assert(sizeof(KesshoProductTelemetry) == 7728, "product telemetry ABI size changed");
  static_assert(sizeof(KesshoProductSequencerLaneUiState) == 3008, "sequencer UI lane state ABI size changed");
  static_assert(sizeof(KesshoProductSequencerUiState) == 96292, "sequencer UI state ABI size changed");

  require(offsetof(KesshoProductSnapshotV2, schema_hash) == 4, "snapshot schema hash offset changed");
  require(offsetof(KesshoProductSnapshotV2, sources) == 56, "snapshot sources offset changed");
  require(offsetof(KesshoProductEvent, sample_offset) == 0, "event sample offset changed");
  require(offsetof(KesshoProductEvent, event_kind) == 4, "event kind offset changed");
  require(offsetof(KesshoSequencerEvent, midi_note) == 16, "sequencer event midi offset changed");
  require(offsetof(KesshoSequencerEvent, flags) == 56, "sequencer event flags offset changed");
  require(offsetof(KesshoProductTelemetry, schema_hash) == 0, "telemetry schema hash offset changed");
  require(offsetof(KesshoProductTelemetry, rng_seed) == 928, "telemetry rng seed offset changed");
  require(offsetof(KesshoProductTelemetry, master_input_peak) == 964, "telemetry master input peak offset changed");
  require(
      offsetof(KesshoProductTelemetry, dynamics_saturation_drive) == 980,
      "telemetry dynamics saturation offset changed");
  require(
      offsetof(KesshoProductTelemetry, sequencer_ui_state_revision) == 984,
      "telemetry sequencer UI revision offset changed");
  require(
      offsetof(KesshoProductTelemetry, master_true_peak) == 988,
      "telemetry master true peak offset changed");
  require(
      offsetof(KesshoProductTelemetry, master_integrated_lufs) == 996,
      "telemetry master integrated LUFS offset changed");
  require(
      offsetof(KesshoProductTelemetry, granular_write_head) == 1000,
      "telemetry granular write head offset changed");
  require(
      offsetof(KesshoProductTelemetry, granular_voice_positions) == 1004,
      "telemetry granular voice positions offset changed");
  require(
      offsetof(KesshoProductTelemetry, pad1_filter_freq) == 1020,
      "telemetry Pad 1 filter frequency offset changed");
  require(
      offsetof(KesshoProductTelemetry, pad1_lfo1_value) == 1024,
      "telemetry Pad 1 LFO offset changed");
  require(
      offsetof(KesshoProductTelemetry, pad2_filter_freq) == 1028,
      "telemetry Pad 2 filter frequency offset changed");
  require(
      offsetof(KesshoProductTelemetry, pad2_lfo1_value) == 1032,
      "telemetry Pad 2 LFO offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_sequencer_hit_counts) == 1036,
      "telemetry synth sequencer hit-count offset changed");
  require(
      offsetof(KesshoProductTelemetry, drum_sequencer_hit_counts) == 1100,
      "telemetry drum sequencer hit-count offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_sequencer_current_steps) == 1164,
      "telemetry synth sequencer current-step offset changed");
  require(
      offsetof(KesshoProductTelemetry, drum_sequencer_current_steps) == 1228,
      "telemetry drum sequencer current-step offset changed");
  require(
      offsetof(KesshoProductTelemetry, earth_texture_asset_ids) == 1292,
      "telemetry Earth texture debug offset changed");
  require(
      offsetof(KesshoProductTelemetry, modulation_debug_count) == 1580,
      "telemetry modulation debug offset changed");
  require(
      offsetof(KesshoProductTelemetry, modulation_debug_last_trigger_frames) == 6960,
      "telemetry modulation trigger-frame offset changed");
  require(
      offsetof(KesshoProductSequencerLaneUiState, probability_overrides) == 168,
      "sequencer UI probability override offset changed");
  require(
      offsetof(KesshoProductSequencerUiState, synth_lanes) == 36,
      "sequencer UI synth lanes offset changed");

  std::cout << "Kessho Product ABI layout tests passed\n";
  return 0;
}
