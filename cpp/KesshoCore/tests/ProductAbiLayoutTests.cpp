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
  static_assert(sizeof(KesshoProductSourceSnapshot) == 1204, "source snapshot ABI size changed");
  static_assert(sizeof(KesshoProductSnapshotV2) == 12700, "product snapshot ABI size changed");
  static_assert(sizeof(KesshoProductEvent) == 40, "product event ABI size changed");
  static_assert(sizeof(KesshoSequencerEvent) == 60, "sequencer event ABI size changed");
  static_assert(sizeof(KesshoProductTelemetry) == 1040, "product telemetry ABI size changed");
  static_assert(sizeof(KesshoProductSequencerLaneUiState) == 2216, "sequencer UI lane state ABI size changed");
  static_assert(sizeof(KesshoProductSequencerUiState) == 70948, "sequencer UI state ABI size changed");

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
      offsetof(KesshoProductTelemetry, dynamics_saturation_drive) == 984,
      "telemetry dynamics saturation offset changed");
  require(
      offsetof(KesshoProductTelemetry, sequencer_ui_state_revision) == 988,
      "telemetry sequencer UI revision offset changed");
  require(
      offsetof(KesshoProductTelemetry, master_true_peak) == 992,
      "telemetry master true peak offset changed");
  require(
      offsetof(KesshoProductTelemetry, master_integrated_lufs) == 1000,
      "telemetry master integrated LUFS offset changed");
  require(
      offsetof(KesshoProductTelemetry, granular_write_head) == 1004,
      "telemetry granular write head offset changed");
  require(
      offsetof(KesshoProductTelemetry, granular_voice_positions) == 1008,
      "telemetry granular voice positions offset changed");
  require(
      offsetof(KesshoProductTelemetry, pad1_filter_freq) == 1024,
      "telemetry Pad 1 filter frequency offset changed");
  require(
      offsetof(KesshoProductTelemetry, pad1_lfo1_value) == 1028,
      "telemetry Pad 1 LFO offset changed");
  require(
      offsetof(KesshoProductTelemetry, pad2_filter_freq) == 1032,
      "telemetry Pad 2 filter frequency offset changed");
  require(
      offsetof(KesshoProductTelemetry, pad2_lfo1_value) == 1036,
      "telemetry Pad 2 LFO offset changed");
  require(
      offsetof(KesshoProductSequencerLaneUiState, probability_overrides) == 168,
      "sequencer UI probability override offset changed");
  require(
      offsetof(KesshoProductSequencerUiState, synth_lanes) == 36,
      "sequencer UI synth lanes offset changed");

  std::cout << "Kessho Product ABI layout tests passed\n";
  return 0;
}
