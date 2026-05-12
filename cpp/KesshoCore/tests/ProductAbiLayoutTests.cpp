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
  static_assert(sizeof(KesshoProductSourceSnapshot) == 1200, "source snapshot ABI size changed");
  static_assert(sizeof(KesshoProductSnapshotV2) == 12644, "product snapshot ABI size changed");
  static_assert(sizeof(KesshoProductEvent) == 40, "product event ABI size changed");
  static_assert(sizeof(KesshoSequencerEvent) == 60, "sequencer event ABI size changed");
  static_assert(sizeof(KesshoProductTelemetry) == 368, "product telemetry ABI size changed");
  static_assert(sizeof(KesshoProductSequencerLaneUiState) == 2216, "sequencer UI lane state ABI size changed");
  static_assert(sizeof(KesshoProductSequencerUiState) == 70948, "sequencer UI state ABI size changed");

  require(offsetof(KesshoProductSnapshotV2, schema_hash) == 4, "snapshot schema hash offset changed");
  require(offsetof(KesshoProductSnapshotV2, sources) == 56, "snapshot sources offset changed");
  require(offsetof(KesshoProductEvent, sample_offset) == 0, "event sample offset changed");
  require(offsetof(KesshoProductEvent, event_kind) == 4, "event kind offset changed");
  require(offsetof(KesshoSequencerEvent, midi_note) == 16, "sequencer event midi offset changed");
  require(offsetof(KesshoSequencerEvent, flags) == 56, "sequencer event flags offset changed");
  require(offsetof(KesshoProductTelemetry, schema_hash) == 0, "telemetry schema hash offset changed");
  require(offsetof(KesshoProductTelemetry, rng_seed) == 288, "telemetry rng seed offset changed");
  require(offsetof(KesshoProductTelemetry, master_input_peak) == 324, "telemetry master input peak offset changed");
  require(
      offsetof(KesshoProductTelemetry, dynamics_saturation_drive) == 344,
      "telemetry dynamics saturation offset changed");
  require(
      offsetof(KesshoProductTelemetry, sequencer_ui_state_revision) == 348,
      "telemetry sequencer UI revision offset changed");
  require(
      offsetof(KesshoProductTelemetry, master_true_peak) == 352,
      "telemetry master true peak offset changed");
  require(
      offsetof(KesshoProductTelemetry, master_integrated_lufs) == 360,
      "telemetry master integrated LUFS offset changed");
  require(
      offsetof(KesshoProductSequencerLaneUiState, probability_overrides) == 168,
      "sequencer UI probability override offset changed");
  require(
      offsetof(KesshoProductSequencerUiState, synth_lanes) == 36,
      "sequencer UI synth lanes offset changed");

  std::cout << "Kessho Product ABI layout tests passed\n";
  return 0;
}
