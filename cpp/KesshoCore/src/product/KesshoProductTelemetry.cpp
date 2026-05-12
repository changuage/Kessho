#include "KesshoProductEngineInternal.h"

  void KesshoProductEngine::resetMasterTelemetryState() {
  master_true_peak_prev_l = 0.0f;
  master_true_peak_prev_r = 0.0f;
  master_integrated_loudness_energy = 0.0;
  master_integrated_loudness_frames = 0;
  telemetry.master_true_peak = 0.0f;
  telemetry.master_true_peak_dbtp = kProductTelemetrySilenceDb;
  telemetry.master_integrated_lufs = kProductTelemetrySilenceDb;
}

  void KesshoProductEngine::markSequencerUiStateChanged(uint32_t target_id, uint32_t lane_index, uint32_t change_kind) {
  ++sequencer_ui_state_revision;
  if (sequencer_ui_state_revision == 0u) {
    sequencer_ui_state_revision = 1u;
  }
  sequencer_ui_last_changed_target_id = target_id;
  sequencer_ui_last_changed_lane_index = lane_index;
  sequencer_ui_last_change_kind = change_kind;
  telemetry.sequencer_ui_state_revision = sequencer_ui_state_revision;
}

  void KesshoProductEngine::copySequencerLaneUiState(
    const LaneState& lane,
    KesshoProductSequencerLaneUiState& out) const {
  out = {};
  out.enabled = lane.enabled ? 1u : 0u;
  out.target_source_id = lane.target_source_id;
  out.step_count = lane.step_count;
  out.fill_count = lane.fill_count;
  out.rotation = static_cast<uint32_t>(lane.rotation);
  out.clock_division = lane.clock_division;
  out.step_override_set_low = lane.step_override_set_low;
  out.step_override_set_high = lane.step_override_set_high;
  out.step_override_value_low = lane.step_override_value_low;
  out.step_override_value_high = lane.step_override_value_high;
  out.probability_override_set_low = lane.probability_override_set_low;
  out.probability_override_set_high = lane.probability_override_set_high;
  out.ratchet_override_set_low = lane.ratchet_override_set_low;
  out.ratchet_override_set_high = lane.ratchet_override_set_high;
  out.trig_condition_override_set_low = lane.trig_condition_override_set_low;
  out.trig_condition_override_set_high = lane.trig_condition_override_set_high;
  out.midi_note_override_set_low = lane.midi_note_override_set_low;
  out.midi_note_override_set_high = lane.midi_note_override_set_high;
  out.expression_override_set_low = lane.expression_override_set_low;
  out.expression_override_set_high = lane.expression_override_set_high;
  out.morph_override_set_low = lane.morph_override_set_low;
  out.morph_override_set_high = lane.morph_override_set_high;
  out.distance_override_set_low = lane.distance_override_set_low;
  out.distance_override_set_high = lane.distance_override_set_high;
  out.mutation_flags =
      (out.step_override_set_low != 0u || out.step_override_set_high != 0u ||
       out.probability_override_set_low != 0u || out.probability_override_set_high != 0u ||
       out.ratchet_override_set_low != 0u || out.ratchet_override_set_high != 0u ||
       out.trig_condition_override_set_low != 0u || out.trig_condition_override_set_high != 0u ||
       out.midi_note_override_set_low != 0u || out.midi_note_override_set_high != 0u ||
       out.expression_override_set_low != 0u || out.expression_override_set_high != 0u ||
       out.morph_override_set_low != 0u || out.morph_override_set_high != 0u ||
       out.distance_override_set_low != 0u || out.distance_override_set_high != 0u)
      ? KESSHO_PRODUCT_SEQUENCER_UI_MUTATION_HAS_OVERRIDES
      : 0u;
  for (uint32_t i = 0; i < KESSHO_PRODUCT_SEQUENCER_UI_STATE_SUBLANES; ++i) {
    if (lane.step_value_configs[i].enabled) {
      out.step_value_config_enabled_mask |= 1u << i;
    }
    out.step_value_config_steps[i] = lane.step_value_configs[i].steps;
    out.step_value_config_directions[i] = lane.step_value_configs[i].direction;
  }
  for (uint32_t i = 0; i < KESSHO_PRODUCT_SEQUENCER_UI_STATE_STEPS; ++i) {
    out.probability_overrides[i] = lane.probability_overrides[i];
    out.ratchet_overrides[i] = lane.ratchet_overrides[i];
    out.trig_condition_numerators[i] = lane.trig_condition_numerators[i];
    out.trig_condition_denominators[i] = lane.trig_condition_denominators[i];
    out.midi_note_overrides[i] = lane.midi_note_overrides[i];
    out.expression_overrides[i] = lane.expression_overrides[i];
    out.morph_overrides[i] = lane.morph_overrides[i];
    out.distance_overrides[i] = lane.distance_overrides[i];
  }
}

  void KesshoProductEngine::copySequencerUiState(KesshoProductSequencerUiState& out) const {
  out = {};
  out.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
  out.revision = sequencer_ui_state_revision;
  out.synth_lane_count = synth_lane_count;
  out.drum_lane_count = drum_lane_count;
  out.evolution_amount = evolution_amount;
  out.evolution_state = evolution_state;
  out.last_changed_target_id = sequencer_ui_last_changed_target_id;
  out.last_changed_lane_index = sequencer_ui_last_changed_lane_index;
  out.last_change_kind = sequencer_ui_last_change_kind;
  const uint32_t lane_limit = KESSHO_PRODUCT_SEQUENCER_UI_STATE_LANES;
  for (uint32_t i = 0; i < std::min<uint32_t>(synth_lane_count, lane_limit); ++i) {
    copySequencerLaneUiState(synth_lanes[i], out.synth_lanes[i]);
  }
  for (uint32_t i = 0; i < std::min<uint32_t>(drum_lane_count, lane_limit); ++i) {
    copySequencerLaneUiState(drum_lanes[i], out.drum_lanes[i]);
  }
}

  void KesshoProductEngine::updateTelemetry(uint32_t frames) {
  updateHarmonyTelemetry(transport.sample_frame);
  uint32_t active_voice_count = 0;
  uint32_t active_source_mask = 0;
  for (const Voice& voice : voices) {
    if (voice.active) {
      ++active_voice_count;
      if (voice.source_id >= 1u && voice.source_id <= 31u) {
        active_source_mask |= 1u << voice.source_id;
      }
    }
  }
  const uint32_t pad_active_count = pad_module ? static_cast<uint32_t>(std::max(0, pad_module->activeVoiceCount())) : 0u;
  if (pad_active_count > 0u) {
    active_voice_count += pad_active_count;
    active_source_mask |= 1u << KESSHO_PRODUCT_SOURCE_PAD1;
    active_source_mask |= 1u << KESSHO_PRODUCT_SOURCE_PAD2;
  }
  for (uint32_t i = 0; i < 2u; ++i) {
    const uint32_t lead_active_count = lead_modules[i] ? static_cast<uint32_t>(std::max(0, lead_modules[i]->activeVoiceCount())) : 0u;
    if (lead_active_count > 0u) {
      active_voice_count += lead_active_count;
      active_source_mask |= 1u << (i == 0u ? KESSHO_PRODUCT_SOURCE_LEAD1 : KESSHO_PRODUCT_SOURCE_LEAD2);
    }
  }
  const uint32_t drum_active_count = drum_module ? static_cast<uint32_t>(std::max(0, drum_module->activeVoiceCount())) : 0u;
  if (drum_active_count > 0u) {
    active_voice_count += drum_active_count;
    active_source_mask |= 1u << KESSHO_PRODUCT_SOURCE_DRUM;
  }
  uint32_t active_source_count = 0;
  for (uint32_t bit = 0; bit < 32u; ++bit) {
    active_source_count += (active_source_mask & (1u << bit)) != 0u ? 1u : 0u;
  }
  uint32_t active_asset_count = 0;
  for (const AssetSlot& asset : assets) {
    active_asset_count += asset.active ? 1u : 0u;
  }

  telemetry.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
  telemetry.sample_rate = sample_rate;
  telemetry.block_size = frames == 0u ? max_block_size : frames;
  telemetry.transport_running = transport.running ? 1u : 0u;
  telemetry.absolute_sample_time = transport.sample_frame;
  telemetry.beat_position = transport.beatPosition(sample_rate);
  telemetry.bar_index = transport.barIndex(sample_rate);
  telemetry.phrase_index = transport.phraseIndex(sample_rate);
  telemetry.active_sources = active_source_count;
  telemetry.active_voices = active_voice_count;
  telemetry.active_assets = active_asset_count;
  telemetry.sequencer_event_count = sequencer_events.count;
  telemetry.control_queue_depth = control_event_count;
  telemetry.journey_morph_running = journey_running ? 1u : 0u;
  telemetry.journey_morph_phase = journey_phase;
  telemetry.harmony_root_midi = harmony.root_midi;
  telemetry.harmony_scale_id = harmony.scale_id;
  telemetry.harmony_tension = harmony.tension;
  telemetry.harmony_chord_degree = harmony.chord_degree;
  for (uint32_t i = 0; i < 4u; ++i) {
    telemetry.harmony_chord_midi[i] = harmony.chord_midi[i];
  }
  uint32_t active_range_count = 0;
  uint32_t walk_count = 0;
  for (uint32_t i = 0; i < kMaxRuntimeWalkTelemetry; ++i) {
    telemetry.runtime_walk_control_ids[i] = 0u;
    telemetry.runtime_walk_values[i] = 0.0f;
  }
  for (const ModulationRange& range : modulation_ranges) {
    if (!range.active) {
      continue;
    }
    ++active_range_count;
    if (range.mode == KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK && walk_count < kMaxRuntimeWalkTelemetry) {
      telemetry.runtime_walk_control_ids[walk_count] = range.control_id;
      telemetry.runtime_walk_values[walk_count] = range.current_value;
      ++walk_count;
    }
  }
  telemetry.modulation_range_count = active_range_count;
  telemetry.runtime_walk_count = walk_count;
  telemetry.rng_seed = rng_seed;
  telemetry.rng_state = rng_state;
  for (uint32_t i = 0; i < kSourceCount; ++i) {
    telemetry.source_preset_ids[i] = sources[i].preset_id;
  }
  telemetry.sequencer_ui_state_revision = sequencer_ui_state_revision;
}
