#include "../KesshoProductEngineInternal.h"

namespace {

using kessho::product::internal::LaneState;
using kessho::product::internal::SequencerChainState;

// Early onsets advance the loop cursor before its nominal edit boundary.
uint64_t pendingVariationBoundary(const LaneState& lane, uint64_t sample_frame) {
  if (lane.sequencer_variation_preactivated && lane.sequencer_start_sample_frame >= 0 &&
      sample_frame <= static_cast<uint64_t>(lane.sequencer_start_sample_frame)) {
    return static_cast<uint64_t>(lane.sequencer_start_sample_frame);
  }
  return lane.variation_runtime.next_boundary_frame;
}

uint64_t chainDurationFrames(double sample_rate, float seconds) {
  return std::max<uint64_t>(1u, static_cast<uint64_t>(std::llround(
      sample_rate * static_cast<double>(std::max(0.001f, seconds)))));
}

uint64_t variationDurationFrames(
    const KesshoProductEngine& engine,
    const LaneState& lane,
    const KesshoProductSequencerVariationSnapshot& variation) {
  const uint32_t steps = std::max<uint32_t>(
      1u,
      std::min<uint32_t>(variation.step_count, KESSHO_PRODUCT_SEQUENCER_VARIATION_MAX_STEPS));
  const uint32_t division = std::max<uint32_t>(1u, variation.clock_division);
  const double samples_per_step = engine.transport.samplesPerBeat(engine.sample_rate) * 4.0 /
      static_cast<double>(division) /
      static_cast<double>(kessho::product::internal::clampFloat(lane.tempo_multiplier, 0.25f, 12.0f));
  return std::max<uint64_t>(1u, static_cast<uint64_t>(std::llround(
      samples_per_step * static_cast<double>(steps))));
}

uint64_t variationLeadingNegativeNudgeFrames(
    const KesshoProductEngine& engine,
    const LaneState& lane,
    const KesshoProductSequencerVariationSnapshot& variation) {
  if (variation.trigger_mask == 0u || variation.step_count == 0u) return 0u;
  uint32_t first_trigger = variation.step_count;
  for (uint32_t step = 0u; step < variation.step_count; ++step) {
    if ((variation.trigger_mask & (1u << step)) != 0u) {
      first_trigger = step;
      break;
    }
  }
  if (first_trigger >= variation.step_count) return 0u;

  uint32_t nudge_step = first_trigger;
  constexpr uint32_t kNudgeFieldId = 8u;
  if ((variation.sublane_enabled_mask & (1u << kNudgeFieldId)) != 0u) {
    const uint32_t steps = std::clamp<uint32_t>(
        variation.sublane_steps[kNudgeFieldId],
        1u,
        KESSHO_PRODUCT_SEQUENCER_VARIATION_MAX_STEPS);
    const bool follow_trigger_hits =
        (variation.sublane_follow_trigger_hits_mask & (1u << kNudgeFieldId)) != 0u;
    const uint32_t phase = follow_trigger_hits ? 0u : first_trigger;
    const uint32_t direction = variation.sublane_directions[kNudgeFieldId];
    if (direction == KESSHO_PRODUCT_SUBLANE_DIRECTION_REVERSE) {
      nudge_step = steps - 1u - (phase % steps);
    } else if (direction == KESSHO_PRODUCT_SUBLANE_DIRECTION_PINGPONG && steps > 1u) {
      const uint32_t period = steps * 2u - 2u;
      const uint32_t position = phase % period;
      nudge_step = position < steps ? position : period - position;
    } else {
      nudge_step = phase % steps;
    }
  }
  if (nudge_step >= KESSHO_PRODUCT_SEQUENCER_VARIATION_MAX_STEPS ||
      (variation.nudge_mask & (1u << nudge_step)) == 0u ||
      !std::isfinite(variation.nudge_values[nudge_step]) ||
      variation.nudge_values[nudge_step] >= 0.0f) {
    return 0u;
  }
  const double samples_per_step = engine.transport.samplesPerBeat(engine.sample_rate) * 4.0 /
      static_cast<double>(std::max<uint32_t>(1u, variation.clock_division)) /
      static_cast<double>(kessho::product::internal::clampFloat(lane.tempo_multiplier, 0.25f, 12.0f));
  return static_cast<uint64_t>(std::max<double>(
      0.0,
      std::llround((-static_cast<double>(variation.nudge_values[nudge_step]) - first_trigger) * samples_per_step)));
}

bool variationPopulated(const KesshoProductSequencerVariationSnapshot& snapshot) {
  return snapshot.step_count >= 2u &&
      snapshot.step_count <= KESSHO_PRODUCT_SEQUENCER_VARIATION_MAX_STEPS;
}

bool finiteInRange(float value, float low, float high) {
  return std::isfinite(value) && value >= low && value <= high;
}

bool normalizeVariationBank(
    const KesshoProductSequencerVariationBank& source,
    KesshoProductSequencerVariationBank& destination) {
  if (source.revision == UINT64_MAX) return false;
  if (source.schema_version != 0u &&
      source.schema_version != KESSHO_PRODUCT_SEQUENCER_VARIATION_SCHEMA_VERSION) {
    return false;
  }
  if (source.enabled > 1u || source.chain_length > KESSHO_PRODUCT_SEQUENCER_VARIATION_MAX_CHAIN_ENTRIES ||
      source.play_variation >= KESSHO_PRODUCT_SEQUENCER_VARIATION_COUNT) {
    return false;
  }
  destination = source;
  destination.schema_version = KESSHO_PRODUCT_SEQUENCER_VARIATION_SCHEMA_VERSION;
  if (destination.enabled != 0u && destination.chain_length == 0u) return false;

  for (uint32_t variation = 0u;
       variation < KESSHO_PRODUCT_SEQUENCER_VARIATION_COUNT;
       ++variation) {
    auto& snapshot = destination.variations[variation];
    if (snapshot.step_count == 0u) continue;
    if (!variationPopulated(snapshot) || snapshot.clock_division == 0u || snapshot.clock_division > 64u ||
        !finiteInRange(snapshot.swing, 0.0f, 1.0f) ||
        (snapshot.trigger_mask & (snapshot.step_count == 32u
            ? 0u
            : ~((1u << snapshot.step_count) - 1u))) != 0u ||
        (snapshot.sublane_enabled_mask & ~0x1ffu) != 0u ||
        (snapshot.sublane_follow_trigger_hits_mask & ~0x1feu) != 0u ||
        snapshot.pitch_mode > kessho::product::internal::kSequencerPitchModeNoteRange ||
        snapshot.pitch_binding_mode > kessho::product::internal::kSequencerPitchBindingStep ||
        !finiteInRange(snapshot.pitch_root, 0.0f, 127.0f)) {
      return false;
    }
    for (uint32_t field = 0u; field < 9u; ++field) {
      if (snapshot.sublane_enabled_mask & (1u << field)) {
        if (snapshot.sublane_steps[field] == 0u || snapshot.sublane_steps[field] > 32u) return false;
      }
      if (snapshot.sublane_directions[field] > KESSHO_PRODUCT_SUBLANE_DIRECTION_PINGPONG) return false;
    }
    const auto maskHas = [](uint32_t mask, uint32_t step) {
      return (mask & (1u << step)) != 0u;
    };
    for (uint32_t step = 0u; step < KESSHO_PRODUCT_SEQUENCER_VARIATION_MAX_STEPS; ++step) {
      if (maskHas(snapshot.probability_mask, step) && !finiteInRange(snapshot.probability[step], 0.0f, 1.0f)) return false;
      if (maskHas(snapshot.ratchet_mask, step) && (snapshot.ratchet[step] == 0u || snapshot.ratchet[step] > 8u)) return false;
      if (maskHas(snapshot.trig_condition_mask, step) &&
          (snapshot.trig_condition_numerators[step] == 0u ||
           snapshot.trig_condition_denominators[step] < snapshot.trig_condition_numerators[step])) return false;
      if (maskHas(snapshot.midi_note_mask, step) && !finiteInRange(snapshot.midi_notes[step], -48.0f, 48.0f)) return false;
      if (maskHas(snapshot.expression_mask, step) && !finiteInRange(snapshot.expression[step], 0.0f, 1.0f)) return false;
      if (maskHas(snapshot.expression_range_mask, step) && !finiteInRange(snapshot.expression_range_maxes[step], 0.0f, 1.0f)) return false;
      if (maskHas(snapshot.morph_mask, step) && !finiteInRange(snapshot.morph[step], 0.0f, 1.0f)) return false;
      if (maskHas(snapshot.morph_range_mask, step) && !finiteInRange(snapshot.morph_range_maxes[step], 0.0f, 1.0f)) return false;
      if (maskHas(snapshot.distance_mask, step) && !finiteInRange(snapshot.distance[step], 0.0f, 1.0f)) return false;
      if (maskHas(snapshot.distance_range_mask, step) && !finiteInRange(snapshot.distance_range_maxes[step], 0.0f, 1.0f)) return false;
      if (maskHas(snapshot.nudge_mask, step) && !finiteInRange(snapshot.nudge_values[step], -1.0f, 1.0f)) return false;
    }
    for (uint32_t step = 0u; step < snapshot.step_count; ++step) {
      auto& cell = snapshot.steps[step];
      if (cell.mode > KESSHO_PRODUCT_SEQUENCER_VARIATION_STEP_ARP ||
          cell.note_count > KESSHO_PRODUCT_SEQUENCER_VARIATION_MAX_NOTES_PER_STEP ||
          !finiteInRange(cell.gate_beats, 0.0f, 64.0f) ||
          !finiteInRange(cell.arp_span_steps, 0.0f, 32.0f) ||
          cell.arp_direction > 1u || cell.follow_harmony > 1u) {
        return false;
      }
      if (cell.mode == KESSHO_PRODUCT_SEQUENCER_VARIATION_STEP_EMPTY && cell.note_count != 0u) return false;
      if (cell.mode == KESSHO_PRODUCT_SEQUENCER_VARIATION_STEP_ARP &&
          (cell.arp_rate_x2 == 0u || cell.arp_rate_x2 > 8u ||
           cell.arp_length == 0u || cell.arp_length > 16u ||
           cell.arp_flow > 5u || cell.arp_contour_mode > 1u || cell.arp_boundary_mode > 2u)) {
        return false;
      }
      for (uint32_t note = 0u; note < cell.note_count; ++note) {
        if (!finiteInRange(cell.notes[note].midi_note, -48.0f, 48.0f) ||
            !finiteInRange(cell.notes[note].velocity, 0.0f, 1.0f) ||
            !finiteInRange(cell.notes[note].gate_beats, 0.0f, 64.0f)) return false;
      }
      for (uint32_t pulse = 0u; pulse < 16u; ++pulse) {
        if (cell.arp_contour[pulse] < -12 || cell.arp_contour[pulse] > 12 ||
            cell.arp_slot_lane[pulse] < -1 || cell.arp_slot_lane[pulse] > 7) return false;
      }
    }
  }

  uint32_t total_steps = 0u;
  for (uint32_t entry = 0u; entry < destination.chain_length; ++entry) {
    const uint32_t variation = destination.chain[entry];
    if (variation >= KESSHO_PRODUCT_SEQUENCER_VARIATION_COUNT ||
        (destination.enabled != 0u && !variationPopulated(destination.variations[variation]))) return false;
    total_steps += destination.variations[variation].step_count;
  }
  if (destination.enabled != 0u &&
      (!variationPopulated(destination.variations[destination.play_variation]) ||
       total_steps > KESSHO_PRODUCT_SEQUENCER_VARIATION_MAX_CHAIN_STEPS)) return false;
  return true;
}

LaneState* variationLanes(
    KesshoProductEngine& engine,
    uint32_t sequencer_id,
    uint32_t& lane_count) {
  if (sequencer_id == KESSHO_PRODUCT_SEQUENCER_SYNTH) {
    lane_count = engine.synth_lane_count;
    return engine.synth_lanes;
  }
  if (sequencer_id == KESSHO_PRODUCT_SEQUENCER_DRUM) {
    lane_count = engine.drum_lane_count;
    return engine.drum_lanes;
  }
  lane_count = 0u;
  return nullptr;
}

const LaneState* variationLanes(
    const KesshoProductEngine& engine,
    uint32_t sequencer_id,
    uint32_t& lane_count) {
  if (sequencer_id == KESSHO_PRODUCT_SEQUENCER_SYNTH) {
    lane_count = engine.synth_lane_count;
    return engine.synth_lanes;
  }
  if (sequencer_id == KESSHO_PRODUCT_SEQUENCER_DRUM) {
    lane_count = engine.drum_lane_count;
    return engine.drum_lanes;
  }
  lane_count = 0u;
  return nullptr;
}

} // namespace

namespace kessho::product::internal {

bool validateSequencerVariationBank(
    const KesshoProductSequencerVariationBank& bank) {
  KesshoProductSequencerVariationBank normalized{};
  return normalizeVariationBank(bank, normalized);
}

} // namespace kessho::product::internal

void KesshoProductEngine::applySequencerChainParamEvent(const KesshoProductEvent& event) {
  SequencerChainState* chain = nullptr;
  uint32_t lane_count = 0u;
  if (event.target_id == KESSHO_PRODUCT_SEQUENCER_SYNTH) {
    chain = &synth_sequencer_chain;
    lane_count = synth_lane_count;
  } else if (event.target_id == KESSHO_PRODUCT_SEQUENCER_DRUM) {
    chain = &drum_sequencer_chain;
    lane_count = drum_lane_count;
  }
  if (chain == nullptr) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    return;
  }

  switch (event.param_id) {
    case KESSHO_PRODUCT_PARAM_SEQUENCER_CHAIN_ENABLED_ID:
      chain->enabled = event.value >= 0.5f;
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_CHAIN_ENTRY_COUNT_ID:
      chain->entry_count = std::min<uint32_t>(
          kessho::product::internal::kMaxSequencerChainEntries,
          static_cast<uint32_t>(std::max(0.0f, std::round(event.value))));
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_CHAIN_ENTRY_LANE_ID:
      if (event.index >= kessho::product::internal::kMaxSequencerChainEntries) {
        telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SEQUENCER_LANE;
        return;
      }
      chain->entry_lane_indices[event.index] = lane_count == 0u
          ? 0u
          : std::min<uint32_t>(lane_count - 1u, static_cast<uint32_t>(std::max(0.0f, std::round(event.value))));
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_CHAIN_ENTRY_DURATION_SECONDS_ID:
      if (event.index >= kessho::product::internal::kMaxSequencerChainEntries) {
        telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SEQUENCER_LANE;
        return;
      }
      chain->entry_duration_seconds[event.index] = clampFloat(event.value, 0.001f, 4096.0f);
      break;
    default:
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
      return;
  }
  chain->initialized = false;
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
}

void KesshoProductEngine::applySequencerChainTransitions() {
  const auto apply = [&](SequencerChainState& chain, LaneState* lanes, uint32_t lane_count) {
    if (!transport.running || !chain.enabled || chain.entry_count == 0u || lane_count == 0u) {
      chain.initialized = false;
      for (uint32_t lane = 0u; lane < lane_count; ++lane) lanes[lane].chain_muted = false;
      return;
    }

    if (!chain.initialized) {
      chain.active_entry = 0u;
      chain.next_boundary_frame = transport.sample_frame +
          chainDurationFrames(sample_rate, chain.entry_duration_seconds[0]);
      chain.initialized = true;
    } else {
      uint32_t transitions = 0u;
      while (transport.sample_frame >= chain.next_boundary_frame && transitions++ < 64u) {
        chain.active_entry = (chain.active_entry + 1u) % chain.entry_count;
        chain.next_boundary_frame += chainDurationFrames(
            sample_rate,
            chain.entry_duration_seconds[chain.active_entry]);
      }
    }

    const uint32_t active_lane = std::min<uint32_t>(
        lane_count - 1u,
        chain.entry_lane_indices[chain.active_entry]);
    for (uint32_t lane = 0u; lane < lane_count; ++lane) {
      const bool next_muted = lane != active_lane;
      if (lanes[lane].chain_muted && !next_muted) resetSequencerLaneRuntime(lanes[lane], false);
      lanes[lane].chain_muted = next_muted;
    }
  };
  apply(synth_sequencer_chain, synth_lanes, synth_lane_count);
  apply(drum_sequencer_chain, drum_lanes, drum_lane_count);
}

uint64_t KesshoProductEngine::nextSequencerChainBoundaryFrame() const {
  uint64_t next = UINT64_MAX;
  const auto inspect = [&](const SequencerChainState& chain) {
    if (transport.running && chain.enabled && chain.initialized && chain.entry_count > 0u) {
      next = std::min(next, chain.next_boundary_frame);
    }
  };
  inspect(synth_sequencer_chain);
  inspect(drum_sequencer_chain);
  return next;
}

void KesshoProductEngine::bindSequencerVariationRuntimes() {
  if (!sequencer_variation_storage) return;
  for (uint32_t lane = 0u; lane < kMaxLaneCount; ++lane) {
    kessho::product::internal::bindSequencerVariationRuntime(
        synth_lanes[lane].variation_runtime,
        &sequencer_variation_storage->active_synth[lane],
        &sequencer_variation_storage->pending_synth[lane]);
    kessho::product::internal::bindSequencerVariationRuntime(
        drum_lanes[lane].variation_runtime,
        &sequencer_variation_storage->active_drum[lane],
        &sequencer_variation_storage->pending_drum[lane]);
  }
}

int32_t KesshoProductEngine::setSequencerVariationBank(
    uint32_t sequencer_id,
    uint32_t lane_index,
    const KesshoProductSequencerVariationBank& bank) {
  uint32_t lane_count = 0u;
  LaneState* lanes = variationLanes(*this, sequencer_id, lane_count);
  if (lanes == nullptr || lane_index >= lane_count) {
    return KESSHO_PRODUCT_ERROR_INVALID_SEQUENCER_LANE;
  }
  KesshoProductSequencerVariationBank normalized{};
  if (!normalizeVariationBank(bank, normalized)) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
    return KESSHO_PRODUCT_ERROR_INVALID_PARAM;
  }
  auto& runtime = lanes[lane_index].variation_runtime;
  if (runtime.active == nullptr || runtime.pending == nullptr) bindSequencerVariationRuntimes();
  const uint64_t revision_floor = std::max(
      runtime.active_revision,
      runtime.pending != nullptr ? runtime.pending->revision : 0u);
  // Callers may reserve a monotonic revision before the boundary so the
  // receipt can identify the exact transaction.  Legacy callers submit zero
  // (or a stale value), which still gets the next local revision.
  if (normalized.revision > revision_floor) {
    // Keep the caller's reserved revision.
  } else {
    if (revision_floor == UINT64_MAX) return KESSHO_PRODUCT_ERROR_INVALID_PARAM;
    normalized.revision = revision_floor + 1u;
  }
  if (runtime.pending == nullptr) return KESSHO_PRODUCT_ERROR_INVALID_PARAM;
  *runtime.pending = normalized;
  runtime.pending_valid = true;
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
  return KESSHO_PRODUCT_OK;
}

int32_t KesshoProductEngine::selectSequencerVariation(
    uint32_t sequencer_id,
    uint32_t lane_index,
    uint32_t variation_index) {
  uint32_t lane_count = 0u;
  LaneState* lanes = variationLanes(*this, sequencer_id, lane_count);
  if (lanes == nullptr || lane_index >= lane_count) {
    return KESSHO_PRODUCT_ERROR_INVALID_SEQUENCER_LANE;
  }
  if (variation_index >= KESSHO_PRODUCT_SEQUENCER_VARIATION_COUNT) {
    return KESSHO_PRODUCT_ERROR_INVALID_PARAM;
  }
  auto& runtime = lanes[lane_index].variation_runtime;
  if (runtime.active == nullptr || runtime.pending == nullptr) bindSequencerVariationRuntimes();
  const auto* bank = runtime.active_valid && runtime.active != nullptr
      ? runtime.active
      : (runtime.pending_valid ? runtime.pending : nullptr);
  if (bank == nullptr || bank->enabled == 0u) {
    return KESSHO_PRODUCT_ERROR_INVALID_PARAM;
  }
  if (bank->chain_length > 1u) {
      bool in_chain = false;
      for (uint32_t entry = 0u; entry < bank->chain_length; ++entry) {
        if (bank->chain[entry] == variation_index) {
          in_chain = true;
          break;
        }
      }
      if (!in_chain) return KESSHO_PRODUCT_ERROR_INVALID_PARAM;
  }
  if (!variationPopulated(bank->variations[variation_index])) return KESSHO_PRODUCT_ERROR_INVALID_PARAM;
  runtime.pending_variation = variation_index;
  runtime.pending_variation_valid = true;
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
  return KESSHO_PRODUCT_OK;
}

void KesshoProductEngine::applyPendingSequencerVariationBanks() {
  const auto apply = [&](LaneState* lanes, uint32_t lane_count) {
    for (uint32_t lane_index = 0u; lane_index < lane_count; ++lane_index) {
      auto& lane = lanes[lane_index];
      auto& runtime = lane.variation_runtime;
      if (!runtime.pending_valid || runtime.pending == nullptr || runtime.active == nullptr) continue;
      if (runtime.active_valid && transport.running &&
          runtime.next_boundary_frame != UINT64_MAX &&
          transport.sample_frame < pendingVariationBoundary(lane, transport.sample_frame)) {
        continue;
      }
      const bool preserve_active_variation = runtime.active_valid;
      const uint32_t previous_variation = runtime.active_variation;
      const uint32_t previous_play_variation = runtime.active->play_variation;
      const bool explicit_play_variation_change =
          previous_play_variation != runtime.pending->play_variation;
      *runtime.active = *runtime.pending;
      runtime.active_valid = true;
      runtime.pending_valid = false;
      runtime.active_revision = runtime.active->revision;
      runtime.chain_position = 0u;
      runtime.active_variation = runtime.active->chain_length > 1u
          ? (runtime.active->chain[0] < KESSHO_PRODUCT_SEQUENCER_VARIATION_COUNT
              ? runtime.active->chain[0]
              : 0u)
          : runtime.active->play_variation;
      if (preserve_active_variation && !explicit_play_variation_change &&
          previous_variation < KESSHO_PRODUCT_SEQUENCER_VARIATION_COUNT &&
          variationPopulated(runtime.active->variations[previous_variation])) {
        if (runtime.active->chain_length <= 1u) {
          runtime.active_variation = previous_variation;
        } else {
          for (uint32_t position = 0u; position < runtime.active->chain_length; ++position) {
            if (runtime.active->chain[position] == previous_variation) {
              runtime.active_variation = previous_variation;
              runtime.chain_position = position;
              break;
            }
          }
        }
      }
      runtime.next_boundary_frame = UINT64_MAX;
      resetSequencerLaneRuntime(lane, false, true);
    }
    for (uint32_t lane_index = 0u; lane_index < lane_count; ++lane_index) {
      auto& lane = lanes[lane_index];
      auto& runtime = lane.variation_runtime;
      if (!runtime.pending_variation_valid || !runtime.active_valid || runtime.active == nullptr) continue;
      if (transport.running && runtime.next_boundary_frame != UINT64_MAX &&
          transport.sample_frame < pendingVariationBoundary(lane, transport.sample_frame)) continue;
      runtime.active_variation = runtime.pending_variation;
      runtime.pending_variation_valid = false;
      runtime.chain_position = 0u;
      for (uint32_t position = 0u; position < runtime.active->chain_length; ++position) {
        if (runtime.active->chain[position] == runtime.active_variation) {
          runtime.chain_position = position;
          break;
        }
      }
      runtime.next_boundary_frame = UINT64_MAX;
      resetSequencerLaneRuntime(lane, false, true);
    }
  };
  apply(synth_lanes, synth_lane_count);
  apply(drum_lanes, drum_lane_count);
}

void KesshoProductEngine::advanceSequencerVariationBanks(uint32_t /*frames*/) {
  if (!transport.running) return;
  const auto advance = [&](LaneState* lanes, uint32_t lane_count) {
    for (uint32_t lane_index = 0u; lane_index < lane_count; ++lane_index) {
      LaneState& lane = lanes[lane_index];
      auto& runtime = lane.variation_runtime;
      if (!runtime.active_valid || runtime.active == nullptr || runtime.active->enabled == 0u || runtime.active->chain_length == 0u) continue;
      if (!lane.sequencer_runtime_initialized) continue;
      if (runtime.next_boundary_frame == UINT64_MAX) {
        runtime.next_boundary_frame = static_cast<uint64_t>(lane.sequencer_start_sample_frame) +
            variationDurationFrames(*this, lane, runtime.active->variations[runtime.active_variation]);
      }
      uint32_t transitions = 0u;
      while (transitions++ < 64u) {
        const uint64_t boundary_frame = runtime.next_boundary_frame;
        uint64_t leading_nudge_frames = 0u;
        uint32_t next_position = runtime.chain_position;
        uint32_t next_variation = runtime.active_variation;
        if (runtime.active->chain_length > 1u) {
          next_position = (runtime.chain_position + 1u) % runtime.active->chain_length;
          next_variation = runtime.active->chain[next_position];
          if (next_variation >= KESSHO_PRODUCT_SEQUENCER_VARIATION_COUNT) {
            next_variation = 0u;
          }
        }
        leading_nudge_frames = variationLeadingNegativeNudgeFrames(
            *this, lane, runtime.active->variations[next_variation]);
        const uint64_t activation_frame = boundary_frame > leading_nudge_frames
            ? boundary_frame - leading_nudge_frames
            : 0u;
        if (transport.sample_frame < activation_frame) break;

        const bool preactivated = transport.sample_frame < boundary_frame;
        runtime.chain_position = next_position;
        runtime.active_variation = next_variation;
        const uint64_t duration_frames = variationDurationFrames(
            *this, lane, runtime.active->variations[runtime.active_variation]);
        runtime.next_boundary_frame = boundary_frame > UINT64_MAX - duration_frames
            ? UINT64_MAX
            : boundary_frame + duration_frames;
        resetSequencerLaneRuntime(lane, false, true);
        lane.sequencer_runtime_initialized = true;
        lane.sequencer_join_pending = false;
        lane.sequencer_variation_preactivated = preactivated;
        lane.sequencer_start_sample_frame = static_cast<int64_t>(boundary_frame);
        // A negative nudge belongs to the next variation's first grid cell,
        // but its onset may precede the nominal boundary.  Keep that nominal
        // origin while allowing the current segment to emit the early onset.
        lane.sequencer_runtime_sample_frame = preactivated
            ? transport.sample_frame
            : boundary_frame;
      }
    }
  };
  advance(synth_lanes, synth_lane_count);
  advance(drum_lanes, drum_lane_count);
}

uint64_t KesshoProductEngine::nextSequencerVariationBoundaryFrame() const {
  uint64_t next = UINT64_MAX;
  const auto inspect = [&](const LaneState* lanes, uint32_t lane_count) {
    for (uint32_t lane_index = 0u; lane_index < lane_count; ++lane_index) {
      const auto& lane = lanes[lane_index];
      const auto& runtime = lane.variation_runtime;
      if (runtime.pending_valid || runtime.pending_variation_valid) {
        next = std::min(next, pendingVariationBoundary(lane, transport.sample_frame));
      }
      if (runtime.active_valid && runtime.active != nullptr && runtime.active->enabled != 0u &&
          runtime.next_boundary_frame != UINT64_MAX) {
        uint64_t activation_frame = runtime.next_boundary_frame;
        if (runtime.active->chain_length > 0u) {
          const uint32_t next_position =
              (runtime.chain_position + 1u) % runtime.active->chain_length;
          const uint32_t next_variation = runtime.active->chain_length > 1u
              ? runtime.active->chain[next_position] : runtime.active_variation;
          if (next_variation < KESSHO_PRODUCT_SEQUENCER_VARIATION_COUNT) {
            const uint64_t leading_nudge_frames = variationLeadingNegativeNudgeFrames(
                *this,
                lanes[lane_index],
                runtime.active->variations[next_variation]);
            activation_frame = runtime.next_boundary_frame > leading_nudge_frames
                ? runtime.next_boundary_frame - leading_nudge_frames
                : 0u;
          }
        }
        next = std::min(next, activation_frame);
      }
    }
  };
  inspect(synth_lanes, synth_lane_count);
  inspect(drum_lanes, drum_lane_count);
  return next;
}

void KesshoProductEngine::copySequencerVariationRuntime(
    uint32_t sequencer_id,
    uint32_t lane_index,
    KesshoProductSequencerVariationRuntime& out) const {
  out = {};
  out.schema_version = KESSHO_PRODUCT_SEQUENCER_VARIATION_SCHEMA_VERSION;
  uint32_t lane_count = 0u;
  const LaneState* lanes = variationLanes(*this, sequencer_id, lane_count);
  if (lanes == nullptr || lane_index >= lane_count) return;
  const LaneState& lane = lanes[lane_index];
  const auto& runtime = lane.variation_runtime;
  out.active_variation = runtime.active_variation;
  out.chain_position = runtime.chain_position;
  const auto* variation = kessho::product::internal::activeVariationSnapshot(runtime);
  const uint32_t step_count = kessho::product::internal::variationStepCount(runtime, lane.step_count);
  const uint32_t division = kessho::product::internal::variationClockDivision(runtime, lane.clock_division);
  const double samples_per_step = transport.samplesPerBeat(sample_rate) * 4.0 /
      static_cast<double>(std::max<uint32_t>(1u, division)) /
      static_cast<double>(kessho::product::internal::clampFloat(lane.tempo_multiplier, 0.25f, 12.0f));
  const int64_t elapsed = static_cast<int64_t>(transport.sample_frame) - lane.sequencer_start_sample_frame;
  out.active_step = variation != nullptr && lane.sequencer_runtime_initialized && step_count > 0u && samples_per_step > 0.0
      ? static_cast<uint32_t>(std::max<int64_t>(0, static_cast<int64_t>(std::floor(
          static_cast<double>(std::max<int64_t>(0, elapsed)) / samples_per_step)))) % step_count
      : 0u;
  out.revision = runtime.active_revision;
  out.next_boundary_frame = runtime.next_boundary_frame;
}
