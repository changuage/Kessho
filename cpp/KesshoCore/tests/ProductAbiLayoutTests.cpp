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
  static_assert(sizeof(KesshoProductSourceSnapshot) == 5148, "source snapshot ABI size changed");
  static_assert(sizeof(KesshoProductSequencerLaneSnapshot) == 96, "sequencer lane snapshot ABI size changed");
  static_assert(sizeof(KesshoProductSnapshotV2) == 145976, "product snapshot ABI size changed");
  static_assert(sizeof(KesshoProductEvent) == 40, "product event ABI size changed");
  static_assert(sizeof(KesshoSequencerEvent) == 60, "sequencer event ABI size changed");
  static_assert(sizeof(KesshoProductGranularVisualEvent) == 32, "granular visual event ABI size changed");
  static_assert(sizeof(KesshoProductDebugSourceState) == 32, "product debug source telemetry ABI size changed");
  static_assert(sizeof(KesshoProductDebugVoiceSpawn) == 48, "product debug voice telemetry ABI size changed");
  static_assert(sizeof(KesshoProductTelemetry) == 15008, "product telemetry ABI size changed");
  static_assert(sizeof(KesshoProductSequencerLaneUiState) == 3296, "sequencer UI lane state ABI size changed");
  static_assert(sizeof(KesshoProductSequencerUiState) == 105508, "sequencer UI state ABI size changed");

  require(offsetof(KesshoProductSnapshotV2, schema_hash) == 4, "snapshot schema hash offset changed");
  require(offsetof(KesshoProductSnapshotV2, sources) == 164, "snapshot sources offset changed");
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
      offsetof(KesshoProductTelemetry, granular_visual_event_count) == 7728,
      "telemetry granular visual event count offset changed");
  require(
      offsetof(KesshoProductTelemetry, granular_visual_events) == 7732,
      "telemetry granular visual events offset changed");
  require(
      offsetof(KesshoProductTelemetry, debug_source_state_count) == 8756,
      "telemetry debug source count offset changed");
  require(
      offsetof(KesshoProductTelemetry, debug_source_states) == 8760,
      "telemetry debug source states offset changed");
  require(
      offsetof(KesshoProductTelemetry, debug_voice_spawn_count) == 8984,
      "telemetry debug voice count offset changed");
  require(
      offsetof(KesshoProductTelemetry, debug_voice_spawns) == 8992,
      "telemetry debug voice spawns offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_orbit_visual_note_counts) == 9760,
      "telemetry synth Orbit visual note-count offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_orbit_visual_base_angles) == 9824,
      "telemetry synth Orbit visual base-angle offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_orbit_visual_note_angles) == 9888,
      "telemetry synth Orbit visual note-angle offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_orbit_visual_note_flashes) == 11936,
      "telemetry synth Orbit visual note-flash offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_anchor_walker_visual_flags) == 13984,
      "telemetry synth Anchor Walker visual flags offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_anchor_walker_cursor_degrees) == 14048,
      "telemetry synth Anchor Walker cursor-degree offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_anchor_walker_last_gesture_deltas) == 14112,
      "telemetry synth Anchor Walker gesture-delta offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_anchor_walker_boundary_events) == 14176,
      "telemetry synth Anchor Walker boundary-event offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_anchor_walker_output_counts) == 14240,
      "telemetry synth Anchor Walker output-count offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_anchor_walker_anchor_midis) == 14304,
      "telemetry synth Anchor Walker anchor-MIDI offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_anchor_walker_cursor_midis) == 14368,
      "telemetry synth Anchor Walker cursor-MIDI offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_anchor_walker_previous_cursor_midis) == 14432,
      "telemetry synth Anchor Walker previous-cursor-MIDI offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_anchor_walker_output_midis) == 14496,
      "telemetry synth Anchor Walker output-MIDI offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_anchor_walker_output_velocities) == 14752,
      "telemetry synth Anchor Walker output-velocity offset changed");
  require(
      offsetof(KesshoProductSequencerLaneUiState, nudge_override_set_low) == 100,
      "sequencer UI nudge override low offset changed");
  require(
      offsetof(KesshoProductSequencerLaneUiState, step_value_config_enabled_mask) == 108,
      "sequencer UI sub-lane config mask offset changed");
  require(
      offsetof(KesshoProductSequencerLaneUiState, probability_overrides) == 184,
      "sequencer UI probability override offset changed");
  require(
      offsetof(KesshoProductSequencerLaneUiState, nudge_overrides) == 2232,
      "sequencer UI nudge override values offset changed");
  require(
      offsetof(KesshoProductSequencerLaneUiState, expression_range_set_low) == 2488,
      "sequencer UI expression range mask offset changed");
  require(
      offsetof(KesshoProductSequencerLaneUiState, swing) == 3280,
      "sequencer UI lane swing offset changed");
  require(
      offsetof(KesshoProductSequencerLaneUiState, midi_note) == 3284,
      "sequencer UI lane base MIDI offset changed");
  require(
      offsetof(KesshoProductSequencerLaneUiState, note_range_min) == 3288,
      "sequencer UI lane note-range min offset changed");
  require(
      offsetof(KesshoProductSequencerLaneUiState, note_range_max) == 3292,
      "sequencer UI lane note-range max offset changed");
  require(
      offsetof(KesshoProductSequencerUiState, synth_lanes) == 36,
      "sequencer UI synth lanes offset changed");

  std::cout << "Kessho Product ABI layout tests passed\n";
  return 0;
}
