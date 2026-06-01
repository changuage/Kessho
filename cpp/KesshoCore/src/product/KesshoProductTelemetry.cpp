#include "KesshoProductEngineInternal.h"

namespace {

uint32_t earthTextureAssetIdForSlot(uint32_t slot) {
  switch (slot) {
    case kessho::product::internal::kSoundscapeTextureSlotOcean:
      return kessho::product::internal::kSoundscapeAssetOcean;
    case kessho::product::internal::kSoundscapeTextureSlotBirds:
      return kessho::product::internal::kSoundscapeAssetBirds;
    case kessho::product::internal::kSoundscapeTextureSlotBirds2:
      return kessho::product::internal::kSoundscapeAssetBirds2;
    case kessho::product::internal::kSoundscapeTextureSlotFrogs:
      return kessho::product::internal::kSoundscapeAssetFrogs;
    default:
      return 0u;
  }
}

float normalizedModulationPosition(const kessho::product::internal::ModulationRange& range) {
  const float span = range.max_value - range.min_value;
  if (span <= 0.0f) {
    return 0.0f;
  }
  return kessho::product::internal::clampFloat((range.current_value - range.min_value) / span, 0.0f, 1.0f);
}

} // namespace

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
  out.swing = lane.swing;
  out.midi_note = lane.midi_note;
  out.note_range_min = lane.note_range_min;
  out.note_range_max = lane.note_range_max;
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
  out.expression_range_set_low = lane.expression_range_set_low;
  out.expression_range_set_high = lane.expression_range_set_high;
  out.morph_range_set_low = lane.morph_range_set_low;
  out.morph_range_set_high = lane.morph_range_set_high;
  out.distance_range_set_low = lane.distance_range_set_low;
  out.distance_range_set_high = lane.distance_range_set_high;
  out.mutation_flags =
      (out.step_override_set_low != 0u || out.step_override_set_high != 0u ||
       out.probability_override_set_low != 0u || out.probability_override_set_high != 0u ||
       out.ratchet_override_set_low != 0u || out.ratchet_override_set_high != 0u ||
       out.trig_condition_override_set_low != 0u || out.trig_condition_override_set_high != 0u ||
       out.midi_note_override_set_low != 0u || out.midi_note_override_set_high != 0u ||
       out.expression_override_set_low != 0u || out.expression_override_set_high != 0u ||
       out.morph_override_set_low != 0u || out.morph_override_set_high != 0u ||
       out.distance_override_set_low != 0u || out.distance_override_set_high != 0u ||
       out.expression_range_set_low != 0u || out.expression_range_set_high != 0u ||
       out.morph_range_set_low != 0u || out.morph_range_set_high != 0u ||
       out.distance_range_set_low != 0u || out.distance_range_set_high != 0u)
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
    out.expression_range_maxes[i] = lane.expression_range_maxes[i];
    out.morph_range_maxes[i] = lane.morph_range_maxes[i];
    out.distance_range_maxes[i] = lane.distance_range_maxes[i];
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
  telemetry.active_grains = granular_module == nullptr
      ? 0u
      : static_cast<uint32_t>(std::max(0, granular_module->activeGrainCount()));
  telemetry.granular_write_head = granular_module == nullptr
      ? 0.0f
      : granular_module->granularWriteHeadPosition();
  if (granular_module != nullptr) {
    granular_module->granularVoicePositions(telemetry.granular_voice_positions, 4u);
  } else {
    for (float& position : telemetry.granular_voice_positions) {
      position = 0.0f;
    }
  }
  telemetry.pad1_filter_freq = pad_module == nullptr ? 0.0f : pad_module->currentPadFilterFrequency(0);
  telemetry.pad1_lfo1_value = pad_module == nullptr ? 0.0f : pad_module->currentPadLfoValue(0);
  telemetry.pad2_filter_freq = pad_module == nullptr ? 0.0f : pad_module->currentPadFilterFrequency(1);
  telemetry.pad2_lfo1_value = pad_module == nullptr ? 0.0f : pad_module->currentPadLfoValue(1);
  for (uint32_t i = 0; i < KESSHO_PRODUCT_SEQUENCER_UI_STATE_LANES; ++i) {
    telemetry.synth_sequencer_hit_counts[i] = 0u;
    telemetry.drum_sequencer_hit_counts[i] = 0u;
    telemetry.synth_sequencer_current_steps[i] = 0u;
    telemetry.drum_sequencer_current_steps[i] = 0u;
  }
  for (uint32_t i = 0; i < std::min<uint32_t>(synth_lane_count, KESSHO_PRODUCT_SEQUENCER_UI_STATE_LANES); ++i) {
    const LaneState& lane = synth_lanes[i];
    if (!lane.enabled || !lane.sequencer_runtime_initialized || lane.step_count == 0u || lane.clock_division == 0u) {
      continue;
    }
    const double samples_per_step =
        sequencerSamplesPerStep(transport, sample_rate, lane.clock_division) /
        static_cast<double>(clampFloat(lane.tempo_multiplier, 0.25f, 12.0f));
    telemetry.synth_sequencer_current_steps[i] = sequencerCurrentRelativeStep(lane, transport.sample_frame, samples_per_step);
    telemetry.synth_sequencer_hit_counts[i] = static_cast<uint32_t>(
        std::min<uint64_t>(lane.emitted_hit_count, 0xffffffffull));
  }
  for (uint32_t i = 0; i < std::min<uint32_t>(drum_lane_count, KESSHO_PRODUCT_SEQUENCER_UI_STATE_LANES); ++i) {
    const LaneState& lane = drum_lanes[i];
    if (lane.enabled && lane.sequencer_runtime_initialized && lane.step_count != 0u && lane.clock_division != 0u) {
      const double samples_per_step =
          sequencerSamplesPerStep(transport, sample_rate, lane.clock_division) /
          static_cast<double>(clampFloat(lane.tempo_multiplier, 0.25f, 12.0f));
      telemetry.drum_sequencer_current_steps[i] = sequencerCurrentRelativeStep(lane, transport.sample_frame, samples_per_step);
    }
    telemetry.drum_sequencer_hit_counts[i] = static_cast<uint32_t>(
        std::min<uint64_t>(drum_lanes[i].emitted_hit_count, 0xffffffffull));
  }
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
  for (uint32_t slot = 0; slot < KESSHO_PRODUCT_EARTH_TEXTURE_TELEMETRY_CAPACITY; ++slot) {
    telemetry.earth_texture_asset_ids[slot] = 0u;
    telemetry.earth_texture_flags[slot] = 0u;
    telemetry.earth_texture_inactive_reasons[slot] = KESSHO_PRODUCT_EARTH_TEXTURE_REASON_ASSET_NOT_REGISTERED;
    telemetry.earth_texture_active_slice_counts[slot] = 0u;
    telemetry.earth_texture_playing_slice_counts[slot] = 0u;
    telemetry.earth_texture_last_slice_ids[slot] = 0u;
    telemetry.earth_texture_seeds[slot] = 0u;
    telemetry.earth_texture_last_offsets[slot] = 0.0f;
    telemetry.earth_texture_last_start_times[slot] = 0.0f;
    telemetry.earth_texture_slice_durations[slot] = 0.0f;
    telemetry.earth_texture_output_durations[slot] = 0.0f;
    telemetry.earth_texture_detune_cents[slot] = 0.0f;
    telemetry.earth_texture_speed_multipliers[slot] = 1.0f;
    telemetry.earth_texture_total_rates[slot] = 1.0f;
    telemetry.earth_texture_densities[slot] = 0.0f;
    telemetry.earth_texture_fade_times[slot] = 0.0f;
    telemetry.earth_texture_asset_durations[slot] = 0.0f;
    telemetry.earth_texture_max_offsets[slot] = 0.0f;
  }
  const SourceState& soundscape = sources[KESSHO_PRODUCT_SOURCE_SOUNDSCAPE - 1u];
  const bool soundscape_active = sourceRenderActive(soundscape);
  const bool texture_params_available = soundscapeTextureParamsAvailable(soundscape);
  const bool parity_fixture = soundscapeParityFixtureEnabled(soundscape);
  for (uint32_t slot = 0; slot < std::min<uint32_t>(KESSHO_PRODUCT_EARTH_TEXTURE_TELEMETRY_CAPACITY, kSoundscapeTextureSlotCount); ++slot) {
    const uint32_t asset_id = earthTextureAssetIdForSlot(slot);
    SoundscapeTextureRuntime& runtime = soundscape_texture_runtimes[slot];
    telemetry.earth_texture_asset_ids[slot] = asset_id;
    telemetry.earth_texture_seeds[slot] = runtime.seed != 0u
        ? runtime.seed
        : soundscapeTextureSeed(soundscape, slot, hashU32(rng_seed ^ asset_id ^ 0x51f15ca9u));
    if (soundscape_active) telemetry.earth_texture_flags[slot] |= KESSHO_PRODUCT_EARTH_TEXTURE_SOURCE_ENABLED;
    if (texture_params_available) telemetry.earth_texture_flags[slot] |= KESSHO_PRODUCT_EARTH_TEXTURE_PARAMS_AVAILABLE;
    if (parity_fixture) telemetry.earth_texture_flags[slot] |= KESSHO_PRODUCT_EARTH_TEXTURE_PARITY_FIXTURE;
    const float density = clampFloat(soundscapeTextureParam(
        soundscape,
        slot,
        kSoundscapeTextureParamDensity,
        slot == kSoundscapeTextureSlotOcean ? 0.38f : 0.48f), 0.0f, 1.0f);
    telemetry.earth_texture_densities[slot] = runtime.last_slice_id == 0u ? density : runtime.last_density;
    telemetry.earth_texture_fade_times[slot] = runtime.last_fade_time;
    telemetry.earth_texture_last_slice_ids[slot] = runtime.last_slice_id;
    telemetry.earth_texture_last_offsets[slot] = runtime.last_offset_seconds;
    telemetry.earth_texture_last_start_times[slot] = sample_rate > 0.0
        ? static_cast<float>(static_cast<double>(runtime.last_start_frame) / sample_rate)
        : 0.0f;
    telemetry.earth_texture_slice_durations[slot] = runtime.last_slice_duration;
    telemetry.earth_texture_output_durations[slot] = runtime.last_output_duration;
    telemetry.earth_texture_detune_cents[slot] = runtime.last_detune_cents;
    telemetry.earth_texture_speed_multipliers[slot] = runtime.last_speed_multiplier;
    telemetry.earth_texture_total_rates[slot] = runtime.last_total_rate;
    telemetry.earth_texture_asset_durations[slot] = runtime.last_asset_duration;
    telemetry.earth_texture_max_offsets[slot] = runtime.last_max_offset;

    uint32_t active_slice_count = 0u;
    uint32_t playing_slice_count = 0u;
    for (const Voice& voice : voices) {
      if (!voice.active || voice.source_id != KESSHO_PRODUCT_SOURCE_SOUNDSCAPE ||
          !voice.sample_voice || !voice.soundscape_texture_voice ||
          voice.asset_slot >= kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS ||
          !assets[voice.asset_slot].active ||
          assets[voice.asset_slot].asset_id != asset_id) {
        continue;
      }
      ++active_slice_count;
      if (voice.start_delay_frames == 0u) {
        ++playing_slice_count;
      }
    }
    telemetry.earth_texture_active_slice_counts[slot] = active_slice_count;
    telemetry.earth_texture_playing_slice_counts[slot] = playing_slice_count;

    uint32_t reason = KESSHO_PRODUCT_EARTH_TEXTURE_REASON_NONE;
    const uint32_t asset_slot = findAssetSlot(asset_id);
    if (!soundscape_active) {
      reason = KESSHO_PRODUCT_EARTH_TEXTURE_REASON_SOURCE_DISABLED;
    } else if (!texture_params_available) {
      reason = KESSHO_PRODUCT_EARTH_TEXTURE_REASON_TEXTURE_PARAMS_MISSING;
    } else if (parity_fixture) {
      reason = KESSHO_PRODUCT_EARTH_TEXTURE_REASON_PARITY_FIXTURE_ENABLED;
    } else if (!soundscapeWantsAsset(soundscape, asset_id)) {
      reason = KESSHO_PRODUCT_EARTH_TEXTURE_REASON_ASSET_NOT_REGISTERED;
    } else if (soundscapeAssetRefLevel(soundscape, asset_id) <= 0.0001f) {
      reason = KESSHO_PRODUCT_EARTH_TEXTURE_REASON_SLOT_MUTED;
    } else if (asset_slot == kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS ||
        !assets[asset_slot].active ||
        assets[asset_slot].frame_count == 0u ||
        assets[asset_slot].sample_rate <= 0.0f) {
      reason = KESSHO_PRODUCT_EARTH_TEXTURE_REASON_ASSET_NOT_FOUND;
    } else {
      const double asset_duration = static_cast<double>(assets[asset_slot].frame_count) /
          std::max(1.0, static_cast<double>(assets[asset_slot].sample_rate));
      const double slice_duration = std::min(
          std::max(
              static_cast<double>(soundscapeTextureParam(
                  soundscape,
                  slot,
                  kSoundscapeTextureParamSliceDuration,
                  slot == kSoundscapeTextureSlotFrogs ? 18.0f : 20.0f)),
              1.5),
          std::max(1.5, asset_duration - 0.05));
      const double max_offset = std::max(0.0, asset_duration - slice_duration - 0.02);
      if (runtime.last_asset_duration <= 0.0f) {
        telemetry.earth_texture_asset_durations[slot] = static_cast<float>(asset_duration);
        telemetry.earth_texture_slice_durations[slot] = static_cast<float>(slice_duration);
        telemetry.earth_texture_max_offsets[slot] = static_cast<float>(max_offset);
      }
      if (max_offset <= 0.0001) {
        reason = KESSHO_PRODUCT_EARTH_TEXTURE_REASON_ASSET_TOO_SHORT;
      }
    }
    telemetry.earth_texture_inactive_reasons[slot] = reason;
    if (reason == KESSHO_PRODUCT_EARTH_TEXTURE_REASON_NONE) {
      telemetry.earth_texture_flags[slot] |= KESSHO_PRODUCT_EARTH_TEXTURE_ACTIVE;
    }
  }

  uint32_t modulation_debug_count = 0u;
  for (uint32_t i = 0; i < KESSHO_PRODUCT_MODULATION_DEBUG_TELEMETRY_CAPACITY; ++i) {
    telemetry.modulation_debug_control_ids[i] = 0u;
    telemetry.modulation_debug_target_ids[i] = 0u;
    telemetry.modulation_debug_param_ids[i] = 0u;
    telemetry.modulation_debug_modes[i] = 0u;
    telemetry.modulation_debug_trigger_buses[i] = 0u;
    telemetry.modulation_debug_trigger_counters[i] = 0u;
    telemetry.modulation_debug_seeds[i] = 0u;
    telemetry.modulation_debug_random_walk_global[i] = 0u;
    telemetry.modulation_debug_last_trigger_sources[i] = 0u;
    telemetry.modulation_debug_min_values[i] = 0.0f;
    telemetry.modulation_debug_max_values[i] = 0.0f;
    telemetry.modulation_debug_current_values[i] = 0.0f;
    telemetry.modulation_debug_normalized_positions[i] = 0.0f;
    telemetry.modulation_debug_speeds[i] = 0.0f;
    telemetry.modulation_debug_last_trigger_frames[i] = 0u;
  }
  for (const ModulationRange& range : modulation_ranges) {
    if (!range.active || modulation_debug_count >= KESSHO_PRODUCT_MODULATION_DEBUG_TELEMETRY_CAPACITY) {
      continue;
    }
    const uint32_t index = modulation_debug_count++;
    telemetry.modulation_debug_control_ids[index] = range.control_id;
    telemetry.modulation_debug_target_ids[index] = range.target_id;
    telemetry.modulation_debug_param_ids[index] = range.param_id;
    telemetry.modulation_debug_modes[index] = range.mode;
    telemetry.modulation_debug_trigger_buses[index] = range.sample_hold_trigger_bus;
    telemetry.modulation_debug_trigger_counters[index] = range.mode == KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK
        ? range.random_walk_counter
        : range.sample_hold_counter;
    telemetry.modulation_debug_seeds[index] = range.seed;
    telemetry.modulation_debug_random_walk_global[index] = range.random_walk_global ? 1u : 0u;
    telemetry.modulation_debug_last_trigger_sources[index] = range.last_trigger_source;
    telemetry.modulation_debug_min_values[index] = range.min_value;
    telemetry.modulation_debug_max_values[index] = range.max_value;
    telemetry.modulation_debug_current_values[index] = range.current_value;
    telemetry.modulation_debug_normalized_positions[index] = normalizedModulationPosition(range);
    telemetry.modulation_debug_speeds[index] = range.mode == KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK
        ? range.random_walk_speed
        : 0.0f;
    telemetry.modulation_debug_last_trigger_frames[index] = range.last_trigger_frame;
  }
  telemetry.modulation_debug_count = modulation_debug_count;
  telemetry.rng_seed = rng_seed;
  telemetry.rng_state = rng_state;
  for (uint32_t i = 0; i < kSourceCount; ++i) {
    telemetry.source_preset_ids[i] = sources[i].preset_id;
  }
  telemetry.sequencer_ui_state_revision = sequencer_ui_state_revision;
}
