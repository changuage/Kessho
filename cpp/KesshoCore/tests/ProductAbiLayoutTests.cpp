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
  static_assert(sizeof(KesshoProductSourceSnapshot) == 5248, "source snapshot ABI size changed");
  static_assert(sizeof(KesshoProductSequencerLaneSnapshot) == 100, "sequencer lane snapshot ABI size changed");
  static_assert(sizeof(KesshoProductSnapshotV2) == 155256, "product snapshot ABI size changed");
  static_assert(sizeof(KesshoProductEvent) == 40, "product event ABI size changed");
  static_assert(sizeof(KesshoSequencerEvent) == 60, "sequencer event ABI size changed");
  static_assert(sizeof(KesshoProductGranularVisualEvent) == 32, "granular visual event ABI size changed");
  static_assert(sizeof(KesshoProductTelemetry) == 14512, "product telemetry ABI size changed");
  static_assert(sizeof(KesshoProductSequencerLaneUiState) == 3296, "sequencer UI lane state ABI size changed");
  static_assert(sizeof(KesshoProductSequencerUiState) == 105508, "sequencer UI state ABI size changed");

  require(offsetof(KesshoProductSnapshotV2, schema_hash) == 4, "snapshot schema hash offset changed");
  require(offsetof(KesshoProductSnapshotV2, sources) == 2928, "snapshot sources offset changed");
  require(offsetof(KesshoProductSnapshotV2, sonic_runtime) == 155080, "snapshot sonic runtime offset changed");
  require(offsetof(KesshoProductEvent, sample_offset) == 0, "event sample offset changed");
  require(offsetof(KesshoProductEvent, event_kind) == 4, "event kind offset changed");
  require(offsetof(KesshoSequencerEvent, midi_note) == 16, "sequencer event midi offset changed");
  require(offsetof(KesshoSequencerEvent, flags) == 56, "sequencer event flags offset changed");
  require(offsetof(KesshoProductTelemetry, schema_hash) == 0, "telemetry schema hash offset changed");
  require(
      offsetof(KesshoProductTelemetry, source_morph_automation_enabled_mask) == 14128,
      "source morph telemetry offset changed");
  require(
      offsetof(KesshoProductTelemetry, auto_stop_target_sample_frame) == 14184,
      "auto-stop telemetry offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_arp_current_midis) == 14192,
      "telemetry synth ARP current MIDI offset changed");
  require(
      offsetof(KesshoProductTelemetry, scatter_current_phrase_id) == 14256,
      "telemetry Scatter projection offset changed");
  require(
      offsetof(KesshoProductTelemetry, scene_program_revision) == 14272,
      "telemetry scene projection offset changed");
  require(
      offsetof(KesshoProductTelemetry, routing_mute_group_revision) == 14280,
      "telemetry routing mute group projection offset changed");
  require(
      offsetof(KesshoProductTelemetry, journey_schedule_revision) == 14352,
      "telemetry Journey schedule projection offset changed");
  require(
      offsetof(KesshoProductTelemetry, journey_prepared_total_frames) == 14384,
      "telemetry Journey prepared-frame offset changed");
  require(
      offsetof(KesshoProductTelemetry, harmony_note_pool_count) == 14428,
      "telemetry harmony note-pool offset changed");
  KesshoProductEngine* engine = kessho_product_create(48000.0, 128u, 0u);
  require(engine != nullptr, "product engine creation failed");
  KesshoProductSnapshotV2 snapshot{};
  require(
      kessho_product_load_snapshot_v2(engine, &snapshot, sizeof(snapshot) + 4u) ==
          KESSHO_PRODUCT_ERROR_INVALID_SNAPSHOT,
      "oversized snapshot ABI payload was accepted");
  kessho_product_destroy(engine);
  require(offsetof(KesshoProductTelemetry, rng_seed) == 928, "telemetry rng seed offset changed");
  require(offsetof(KesshoProductTelemetry, master_input_peak) == 968, "telemetry master input peak offset changed");
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
      offsetof(KesshoProductTelemetry, synth_sequencer_hit_counts) == 1040,
      "telemetry synth sequencer hit-count offset changed");
  require(
      offsetof(KesshoProductTelemetry, drum_sequencer_hit_counts) == 1104,
      "telemetry drum sequencer hit-count offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_sequencer_current_steps) == 1168,
      "telemetry synth sequencer current-step offset changed");
  require(
      offsetof(KesshoProductTelemetry, drum_sequencer_current_steps) == 1232,
      "telemetry drum sequencer current-step offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_arp_current_steps) == 1296,
      "telemetry synth ARP current-step offset changed");
  require(
      offsetof(KesshoProductTelemetry, earth_texture_asset_ids) == 1360,
      "telemetry Earth texture debug offset changed");
  require(
      offsetof(KesshoProductTelemetry, modulation_debug_count) == 1648,
      "telemetry modulation debug offset changed");
  require(
      offsetof(KesshoProductTelemetry, modulation_debug_last_trigger_frames) == 7032,
      "telemetry modulation trigger-frame offset changed");
  require(
      offsetof(KesshoProductTelemetry, granular_visual_event_count) == 7800,
      "telemetry granular visual event count offset changed");
  require(
      offsetof(KesshoProductTelemetry, granular_visual_events) == 7804,
      "telemetry granular visual events offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_orbit_visual_note_counts) == 8828,
      "telemetry synth Orbit visual note-count offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_orbit_visual_base_angles) == 8892,
      "telemetry synth Orbit visual base-angle offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_orbit_visual_note_angles) == 8956,
      "telemetry synth Orbit visual note-angle offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_orbit_visual_note_flashes) == 11004,
      "telemetry synth Orbit visual note-flash offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_anchor_walker_visual_flags) == 13052,
      "telemetry synth Anchor Walker visual flags offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_anchor_walker_cursor_degrees) == 13116,
      "telemetry synth Anchor Walker cursor-degree offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_anchor_walker_last_gesture_deltas) == 13180,
      "telemetry synth Anchor Walker gesture-delta offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_anchor_walker_boundary_events) == 13244,
      "telemetry synth Anchor Walker boundary-event offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_anchor_walker_output_counts) == 13308,
      "telemetry synth Anchor Walker output-count offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_anchor_walker_anchor_midis) == 13372,
      "telemetry synth Anchor Walker anchor-MIDI offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_anchor_walker_cursor_midis) == 13436,
      "telemetry synth Anchor Walker cursor-MIDI offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_anchor_walker_previous_cursor_midis) == 13500,
      "telemetry synth Anchor Walker previous-cursor-MIDI offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_anchor_walker_output_midis) == 13564,
      "telemetry synth Anchor Walker output-MIDI offset changed");
  require(
      offsetof(KesshoProductTelemetry, synth_anchor_walker_output_velocities) == 13820,
      "telemetry synth Anchor Walker output-velocity offset changed");
  require(offsetof(KesshoProductTelemetry, transport_bpm) == 14076, "telemetry transport BPM offset changed");
  require(offsetof(KesshoProductTelemetry, transport_transition_pending) == 14092, "telemetry pending transition offset changed");
  require(offsetof(KesshoProductTelemetry, transport_pending_apply_frame) == 14112, "telemetry pending apply frame offset changed");
  require(offsetof(KesshoProductTelemetry, transport_transition_revision) == 14120, "telemetry transition revision offset changed");
  require(offsetof(KesshoProductTelemetry, transport_phrase_progress) == 14124, "telemetry phrase progress offset changed");
  require(offsetof(KesshoProductTelemetry, auto_cycle_revision) == 14316, "telemetry auto-cycle revision offset changed");
  require(offsetof(KesshoProductTelemetry, auto_cycle_phase_start_frame) == 14328, "telemetry auto-cycle phase-start offset changed");
  require(offsetof(KesshoProductTelemetry, auto_cycle_phase_end_frame) == 14336, "telemetry auto-cycle phase-end offset changed");
  require(sizeof(KesshoProductTelemetry) == 14512, "telemetry byte size changed");
  require(offsetof(KesshoProductTelemetry, harmony_play_dispatch_count) == 14408, "harmony dispatch telemetry offset changed");
  require(offsetof(KesshoProductTelemetry, harmony_play_last_dispatch_frame) == 14416, "harmony dispatch frame telemetry offset changed");
  require(offsetof(KesshoProductTelemetry, harmony_play_dispatch_latency_ms) == 14424, "harmony dispatch latency telemetry offset changed");
  require(offsetof(KesshoProductTelemetry, harmony_next_note_pool_count) == 14464, "harmony next note-pool count telemetry offset changed");
  require(offsetof(KesshoProductTelemetry, harmony_next_source) == 14500, "harmony next-source telemetry offset changed");
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
