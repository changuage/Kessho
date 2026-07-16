#include "../KesshoProductEngineInternal.h"

  void KesshoProductEngine::clearStepOverride(LaneState& lane, uint32_t step) {
  if (step < 32u) {
    const uint32_t bit = 1u << step;
    lane.step_override_set_low &= ~bit;
    lane.step_override_value_low &= ~bit;
    return;
  }
  const uint32_t bit = 1u << (step - 32u);
  lane.step_override_set_high &= ~bit;
  lane.step_override_value_high &= ~bit;
}

  void KesshoProductEngine::clearPendingRatchets(LaneState& lane) {
  lane.pending_ratchet_count = 0u;
}

  void KesshoProductEngine::clearPendingArpRatchets(LaneState& lane) {
  uint32_t write_index = 0u;
  for (uint32_t read_index = 0u; read_index < lane.pending_ratchet_count; ++read_index) {
    const PendingRatchetEvent& pending = lane.pending_ratchets[read_index];
    if (pending.arp_step_index != UINT32_MAX) continue;
    lane.pending_ratchets[write_index++] = pending;
  }
  lane.pending_ratchet_count = write_index;
}

  void KesshoProductEngine::resetSequencerLaneRuntime(LaneState& lane, bool wait_for_join_boundary) {
  lane.emitted_hit_count = 0u;
  lane.last_emitted_morph_valid = false;
  lane.last_emitted_morph = 0.0f;
  lane.last_emitted_distance_valid = false;
  lane.last_emitted_distance = 0.0f;
  lane.last_emitted_expression_valid = false;
  lane.last_emitted_expression = 1.0f;
  lane.last_emitted_drum_voice = DRUM_NUM_VOICE_TYPES;
  lane.last_emitted_sample_frame = 0u;
  lane.arp.cursor = 0u;
  lane.arp.current_step = 0u;
  lane.arp.next_event_sample = 0u;
  lane.arp.runtime_initialized = false;
  lane.sequencer_runtime_sample_frame = 0u;
  lane.sequencer_start_sample_frame = 0;
  lane.sequencer_runtime_initialized = false;
  lane.sequencer_join_pending = wait_for_join_boundary;
  lane.evolve_runtime.initialized = false;
  lane.pending_unmute_quantization = 0u;
  lane.anchor_walker.cursor_degree = 0;
  lane.anchor_walker.cursor_midi = lane.anchor_walker.manual_anchor_midi;
  lane.anchor_walker.cursor_valid = false;
  lane.anchor_walker.anchor_midi = lane.anchor_walker.manual_anchor_midi;
  lane.anchor_walker.anchor_valid = false;
  lane.anchor_walker.gesture_held = false;
  lane.anchor_walker.held_gesture_delta = 0;
  lane.anchor_walker.held_gesture_velocity = 1.0f;
  lane.anchor_walker.gesture_started_sample = 0u;
  lane.anchor_walker.next_gesture_walk_sample = 0u;
  lane.anchor_walker.pending_gesture_steps = 0u;
  lane.anchor_walker.previous_cursor_midi = lane.anchor_walker.manual_anchor_midi;
  lane.anchor_walker.last_gesture_delta = 0;
  lane.anchor_walker.boundary_event = 0u;
  lane.anchor_walker.last_output_count = 0u;
  for (uint32_t output_index = 0u; output_index < kMaxAnchorWalkerLayers; ++output_index) {
    lane.anchor_walker.last_output_midis[output_index] = 0.0f;
    lane.anchor_walker.last_output_velocities[output_index] = 0.0f;
    lane.anchor_walker.last_output_source_ids[output_index] = 0u;
  }
  lane.anchor_walker.runtime_sample_frame = 0u;
  lane.anchor_walker.next_walk_sample = 0u;
  lane.anchor_walker.runtime_initialized = false;
  lane.orbit.runtime_sample_frame = 0u;
  lane.orbit.runtime_initialized = false;
  lane.orbit.prev_base_angle = lane.orbit.base_angle;
  for (uint32_t i = 0u; i < kMaxOrbitSequencerNotes; ++i) {
    lane.orbit.notes[i].prev_angle = lane.orbit.notes[i].angle;
    lane.orbit.notes[i].flash = 0.0f;
  }
  clearPendingRatchets(lane);
}

  bool KesshoProductEngine::stepMaskHas(uint32_t low, uint32_t high, uint32_t step) const {
  if (step < 32u) {
    return (low & (1u << step)) != 0u;
  }
  return (high & (1u << (step - 32u))) != 0u;
}

  void KesshoProductEngine::setStepMask(uint32_t& low, uint32_t& high, uint32_t step) {
  if (step < 32u) {
    low |= 1u << step;
    return;
  }
  high |= 1u << (step - 32u);
}

  void KesshoProductEngine::clearStepMask(uint32_t& low, uint32_t& high, uint32_t step) {
  if (step < 32u) {
    low &= ~(1u << step);
    return;
  }
  high &= ~(1u << (step - 32u));
}

  float KesshoProductEngine::stepFloatValue(
      uint32_t step,
      uint32_t low,
      uint32_t high,
      const float values[64],
      float fallback) const {
  return stepMaskHas(low, high, step) ? values[step] : fallback;
}

  float KesshoProductEngine::stepFloatRangeValue(
      uint32_t step,
      uint32_t low,
      uint32_t high,
      const float values[64],
      uint32_t range_low,
      uint32_t range_high,
      const float range_maxes[64],
      float fallback,
      uint32_t sample_seed) const {
  const uint32_t range_step = stepMaskHas(range_low, range_high, 0u) ? 0u : step;
  if (stepMaskHas(range_low, range_high, range_step)) {
    const float min_value = std::min(values[range_step], range_maxes[range_step]);
    const float max_value = std::max(values[range_step], range_maxes[range_step]);
    return min_value + hashUnit(sample_seed ^ (range_step * 374761393u)) * (max_value - min_value);
  }
  return stepFloatValue(step, low, high, values, fallback);
}

  uint32_t KesshoProductEngine::stepU32Value(
      uint32_t step,
      uint32_t low,
      uint32_t high,
      const uint32_t values[64],
      uint32_t fallback) const {
  return stepMaskHas(low, high, step) ? values[step] : fallback;
}

  void KesshoProductEngine::setStepOverride(LaneState& lane, uint32_t step, bool enabled) {
  if (step < 32u) {
    const uint32_t bit = 1u << step;
    lane.step_override_set_low |= bit;
    if (enabled) {
      lane.step_override_value_low |= bit;
    } else {
      lane.step_override_value_low &= ~bit;
    }
    return;
  }
  const uint32_t bit = 1u << (step - 32u);
  lane.step_override_set_high |= bit;
  if (enabled) {
    lane.step_override_value_high |= bit;
  } else {
    lane.step_override_value_high &= ~bit;
  }
}

  void KesshoProductEngine::clearLaneStepOverrides(LaneState& lane) {
  lane.step_override_set_low = 0;
  lane.step_override_set_high = 0;
  lane.step_override_value_low = 0;
  lane.step_override_value_high = 0;
  lane.probability_override_set_low = 0;
  lane.probability_override_set_high = 0;
  lane.ratchet_override_set_low = 0;
  lane.ratchet_override_set_high = 0;
  lane.trig_condition_override_set_low = 0;
  lane.trig_condition_override_set_high = 0;
  lane.midi_note_override_set_low = 0;
  lane.midi_note_override_set_high = 0;
  lane.expression_override_set_low = 0;
  lane.expression_override_set_high = 0;
  lane.expression_range_set_low = 0;
  lane.expression_range_set_high = 0;
  lane.morph_override_set_low = 0;
  lane.morph_override_set_high = 0;
  lane.morph_range_set_low = 0;
  lane.morph_range_set_high = 0;
  lane.distance_override_set_low = 0;
  lane.distance_override_set_high = 0;
  lane.distance_range_set_low = 0;
  lane.distance_range_set_high = 0;
  lane.nudge_override_set_low = 0;
  lane.nudge_override_set_high = 0;
  for (uint32_t step = 0u; step < 64u; ++step) {
    lane.play_note_voice_masks[step] = 0u;
    for (uint32_t voice = 0u; voice < kMaxProductPlayVoicesPerStep; ++voice) {
      lane.play_note_overrides[step][voice] = {};
    }
  }
  for (StepValueSubLaneConfig& config : lane.step_value_configs) {
    config = {};
  }
}

  uint32_t KesshoProductEngine::stepFieldId(uint32_t field) const {
  return (field >> KESSHO_PRODUCT_STEP_FIELD_SHIFT) & KESSHO_PRODUCT_STEP_FIELD_ID_MASK;
}

  bool KesshoProductEngine::validStepFieldId(uint32_t field_id) const {
  return field_id < 9u;
}

  void KesshoProductEngine::applyStepFieldConfig(LaneState& lane, const KesshoProductEvent& event) {
  const uint32_t field_id = event.param_id & KESSHO_PRODUCT_STEP_FIELD_ID_MASK;
  if (!validStepFieldId(field_id)) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    return;
  }

  StepValueSubLaneConfig& config = lane.step_value_configs[field_id];
  if ((event.flags & KESSHO_PRODUCT_STEP_TOGGLE_CLEAR_FIELD) != 0u ||
      (event.flags & KESSHO_PRODUCT_STEP_TOGGLE_ACTIVE) == 0u ||
      event.value < 0.5f) {
    config = {};
    telemetry.last_error_code = KESSHO_PRODUCT_OK;
    return;
  }

  config.enabled = true;
  config.steps = clampU32(static_cast<uint32_t>(std::lround(event.value2)), 1u, 64u);
  config.direction = clampU32(
      static_cast<uint32_t>(std::lround(event.value3)),
      KESSHO_PRODUCT_SUBLANE_DIRECTION_FORWARD,
      KESSHO_PRODUCT_SUBLANE_DIRECTION_PINGPONG);
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
}

  uint32_t KesshoProductEngine::subLaneStepForField(
      const LaneState& lane,
      uint32_t field,
      uint32_t trigger_step,
      int64_t absolute_step,
      uint64_t hit_count_phase) const {
  const uint32_t field_id = stepFieldId(field);
  if (!validStepFieldId(field_id)) {
    return trigger_step;
  }

  const StepValueSubLaneConfig& config = lane.step_value_configs[field_id];
  if (!config.enabled || config.steps == 0u || absolute_step < 0) {
    return trigger_step;
  }

  const uint32_t steps = clampU32(config.steps, 1u, 64u);
  const uint64_t phase = field == KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE && lane.midi_note_binding_mode == kSequencerPitchBindingStep
      ? trigger_step
      : hit_count_phase;
  if (config.direction == KESSHO_PRODUCT_SUBLANE_DIRECTION_REVERSE) {
    return steps - 1u - static_cast<uint32_t>(phase % steps);
  }
  if (config.direction == KESSHO_PRODUCT_SUBLANE_DIRECTION_PINGPONG && steps > 1u) {
    const uint32_t period = steps * 2u - 2u;
    const uint32_t position = static_cast<uint32_t>(phase % period);
    return position < steps ? position : period - position;
  }
  return static_cast<uint32_t>(phase % steps);
}

  void KesshoProductEngine::clearStepFieldOverride(LaneState& lane, uint32_t field, uint32_t step) {
  switch (field) {
    case KESSHO_PRODUCT_STEP_FIELD_PROBABILITY:
      clearStepMask(lane.probability_override_set_low, lane.probability_override_set_high, step);
      break;
    case KESSHO_PRODUCT_STEP_FIELD_RATCHET:
      clearStepMask(lane.ratchet_override_set_low, lane.ratchet_override_set_high, step);
      break;
    case KESSHO_PRODUCT_STEP_FIELD_TRIG_CONDITION:
      clearStepMask(lane.trig_condition_override_set_low, lane.trig_condition_override_set_high, step);
      break;
    case KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE:
      clearStepMask(lane.midi_note_override_set_low, lane.midi_note_override_set_high, step);
      break;
    case KESSHO_PRODUCT_STEP_FIELD_EXPRESSION:
      clearStepMask(lane.expression_override_set_low, lane.expression_override_set_high, step);
      clearStepMask(lane.expression_range_set_low, lane.expression_range_set_high, step);
      break;
    case KESSHO_PRODUCT_STEP_FIELD_MORPH:
      clearStepMask(lane.morph_override_set_low, lane.morph_override_set_high, step);
      clearStepMask(lane.morph_range_set_low, lane.morph_range_set_high, step);
      break;
    case KESSHO_PRODUCT_STEP_FIELD_DISTANCE:
      clearStepMask(lane.distance_override_set_low, lane.distance_override_set_high, step);
      clearStepMask(lane.distance_range_set_low, lane.distance_range_set_high, step);
      break;
    case KESSHO_PRODUCT_STEP_FIELD_NUDGE:
      clearStepMask(lane.nudge_override_set_low, lane.nudge_override_set_high, step);
      break;
    case KESSHO_PRODUCT_STEP_FIELD_PLAY_NOTE:
      lane.play_note_voice_masks[step] = 0u;
      for (uint32_t voice = 0u; voice < kMaxProductPlayVoicesPerStep; ++voice) {
        lane.play_note_overrides[step][voice] = {};
      }
      break;
    case KESSHO_PRODUCT_STEP_FIELD_TRIGGER:
    default:
      clearStepOverride(lane, step);
      break;
  }
}

void KesshoProductEngine::setStepFieldOverride(LaneState& lane, uint32_t field, uint32_t step, float value, float value2, float value3, float value4, uint32_t flags) {
  const bool is_range = (flags & KESSHO_PRODUCT_STEP_TOGGLE_RANGE_VALUE) != 0u;
  switch (field) {
    case KESSHO_PRODUCT_STEP_FIELD_PROBABILITY:
      lane.probability_overrides[step] = clampFloat(value, 0.0f, 1.0f);
      setStepMask(lane.probability_override_set_low, lane.probability_override_set_high, step);
      break;
    case KESSHO_PRODUCT_STEP_FIELD_RATCHET:
      lane.ratchet_overrides[step] = clampU32(static_cast<uint32_t>(std::lround(value)), 1u, 8u);
      setStepMask(lane.ratchet_override_set_low, lane.ratchet_override_set_high, step);
      break;
    case KESSHO_PRODUCT_STEP_FIELD_TRIG_CONDITION:
      lane.trig_condition_numerators[step] = clampU32(static_cast<uint32_t>(std::lround(value)), 1u, 16u);
      lane.trig_condition_denominators[step] = clampU32(static_cast<uint32_t>(std::lround(value2)), 1u, 16u);
      setStepMask(lane.trig_condition_override_set_low, lane.trig_condition_override_set_high, step);
      break;
    case KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE:
      lane.midi_note_overrides[step] = clampFloat(value, -1.0f, 127.0f);
      setStepMask(lane.midi_note_override_set_low, lane.midi_note_override_set_high, step);
      break;
    case KESSHO_PRODUCT_STEP_FIELD_EXPRESSION:
      lane.expression_overrides[step] = clampFloat(value, 0.0f, 1.0f);
      if (is_range) {
        lane.expression_range_maxes[step] = clampFloat(value2, 0.0f, 1.0f);
        setStepMask(lane.expression_range_set_low, lane.expression_range_set_high, step);
      } else {
        clearStepMask(lane.expression_range_set_low, lane.expression_range_set_high, step);
      }
      setStepMask(lane.expression_override_set_low, lane.expression_override_set_high, step);
      break;
    case KESSHO_PRODUCT_STEP_FIELD_MORPH:
      lane.morph_overrides[step] = clampFloat(value, 0.0f, 1.0f);
      if (is_range) {
        lane.morph_range_maxes[step] = clampFloat(value2, 0.0f, 1.0f);
        setStepMask(lane.morph_range_set_low, lane.morph_range_set_high, step);
      } else {
        clearStepMask(lane.morph_range_set_low, lane.morph_range_set_high, step);
      }
      setStepMask(lane.morph_override_set_low, lane.morph_override_set_high, step);
      break;
    case KESSHO_PRODUCT_STEP_FIELD_DISTANCE:
      lane.distance_overrides[step] = clampFloat(value, 0.0f, 1.0f);
      if (is_range) {
        lane.distance_range_maxes[step] = clampFloat(value2, 0.0f, 1.0f);
        setStepMask(lane.distance_range_set_low, lane.distance_range_set_high, step);
      } else {
        clearStepMask(lane.distance_range_set_low, lane.distance_range_set_high, step);
      }
      setStepMask(lane.distance_override_set_low, lane.distance_override_set_high, step);
      break;
    case KESSHO_PRODUCT_STEP_FIELD_NUDGE:
      lane.nudge_overrides[step] = clampFloat(value, -1.0f, 1.0f);
      setStepMask(lane.nudge_override_set_low, lane.nudge_override_set_high, step);
      break;
    case KESSHO_PRODUCT_STEP_FIELD_PLAY_NOTE: {
      const uint32_t voice = clampU32(
          static_cast<uint32_t>(std::lround(value4)),
          0u,
          kMaxProductPlayVoicesPerStep - 1u);
      ProductPlayNoteOverride& note = lane.play_note_overrides[step][voice];
      note.midi_note = clampFloat(value, 0.0f, 127.0f);
      note.offset_ms = clampFloat(value2, 0.0f, 16000.0f);
      note.velocity = clampFloat(value3, 0.05f, 1.0f);
      lane.play_note_voice_masks[step] |= 1u << voice;
      break;
    }
    case KESSHO_PRODUCT_STEP_FIELD_TRIGGER:
    default:
      setStepOverride(lane, step, value >= 0.5f);
      break;
  }
}

  void KesshoProductEngine::applySequencerStepEvent(const KesshoProductEvent& event) {
  uint32_t lane_count = 0;
  LaneState* lanes = sequencerLanesForEvent(event, lane_count);
  if (lanes == nullptr) {
    return;
  }
  if (event.index >= lane_count) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SEQUENCER_LANE;
    return;
  }

  LaneState& lane = lanes[event.index];
  const uint32_t field = event.flags & KESSHO_PRODUCT_STEP_FIELD_MASK;
  if ((event.flags & KESSHO_PRODUCT_STEP_TOGGLE_CLEAR_LANE) != 0u) {
    clearLaneStepOverrides(lane);
    markSequencerUiStateChanged(event.target_id, event.index, KESSHO_PRODUCT_SEQUENCER_UI_CHANGE_STEP);
    telemetry.last_error_code = KESSHO_PRODUCT_OK;
    return;
  }
  if (field == KESSHO_PRODUCT_STEP_FIELD_SUBLANE_CONFIG) {
    applyStepFieldConfig(lane, event);
    markSequencerUiStateChanged(event.target_id, event.index, KESSHO_PRODUCT_SEQUENCER_UI_CHANGE_STEP);
    return;
  }
  if (event.param_id >= 64u) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    return;
  }

  uint32_t allowed_steps = field == KESSHO_PRODUCT_STEP_FIELD_PLAY_NOTE ? 64u : lane.step_count;
  const uint32_t field_id = stepFieldId(field);
  if (field != KESSHO_PRODUCT_STEP_FIELD_TRIGGER &&
      field != KESSHO_PRODUCT_STEP_FIELD_PLAY_NOTE &&
      validStepFieldId(field_id)) {
    const StepValueSubLaneConfig& config = lane.step_value_configs[field_id];
    if (config.enabled && config.steps > 0u) {
      allowed_steps = config.steps;
    }
  }
  if (allowed_steps == 0u || event.param_id >= allowed_steps) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    return;
  }
  const uint32_t step = event.param_id;
  if ((event.flags & KESSHO_PRODUCT_STEP_TOGGLE_CLEAR_FIELD) != 0u) {
    clearStepFieldOverride(lane, field, step);
  } else if ((event.flags & KESSHO_PRODUCT_STEP_TOGGLE_ACTIVE) != 0u) {
    setStepFieldOverride(lane, field, step, event.value, event.value2, event.value3, event.value4, event.flags);
  } else {
    clearStepFieldOverride(lane, field, step);
  }
  markSequencerUiStateChanged(event.target_id, event.index, KESSHO_PRODUCT_SEQUENCER_UI_CHANGE_STEP);
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
}

void KesshoProductEngine::applySynthArpConfigEvent(const KesshoProductEvent& event) {
  if (event.target_id != KESSHO_PRODUCT_SEQUENCER_SYNTH || event.index >= synth_lane_count) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SEQUENCER_LANE;
    return;
  }
  LaneState& lane = synth_lanes[event.index];
  ProductArpPatternState& pending_arp = lane.pending_arp;
  pending_arp.enabled = event.value >= 0.5f;
  pending_arp.length = clampU32(
      static_cast<uint32_t>(std::lround(event.value2)),
      1u,
      kMaxProductArpSteps);
  pending_arp.rate = clampFloat(event.value3, 0.25f, 4.0f);
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
}

void KesshoProductEngine::applySynthArpStepEvent(const KesshoProductEvent& event) {
  if (event.target_id != KESSHO_PRODUCT_SEQUENCER_SYNTH || event.index >= synth_lane_count) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SEQUENCER_LANE;
    return;
  }
  if (event.param_id >= kMaxProductArpSteps) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
    return;
  }
  LaneState& lane = synth_lanes[event.index];
  ProductArpPatternState& pending_arp = lane.pending_arp;
  const uint32_t bit = 1u << event.param_id;
  pending_arp.midi_notes[event.param_id] = clampFloat(event.value, -1.0f, 127.0f);
  if (event.value2 >= 0.5f && event.value >= 0.0f) {
    pending_arp.active_mask |= bit;
  } else {
    pending_arp.active_mask &= ~bit;
  }
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
}

void KesshoProductEngine::applyCommitSynthArpPatternEvent(const KesshoProductEvent& event) {
  if (event.target_id != KESSHO_PRODUCT_SEQUENCER_SYNTH || event.index >= synth_lane_count) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SEQUENCER_LANE;
    return;
  }
  LaneState& lane = synth_lanes[event.index];
  ProductArpRuntimeState& arp = lane.arp;
  const ProductArpPatternState& pending_arp = lane.pending_arp;
  const bool was_enabled = arp.enabled;
  arp.enabled = pending_arp.enabled;
  arp.length = pending_arp.length;
  arp.rate = pending_arp.rate;
  arp.active_mask = pending_arp.active_mask;
  for (uint32_t step = 0u; step < kMaxProductArpSteps; ++step) {
    arp.midi_notes[step] = pending_arp.midi_notes[step];
  }
  if (!arp.enabled) {
    arp.cursor = 0u;
    arp.current_step = 0u;
    arp.next_event_sample = 0u;
    arp.runtime_initialized = false;
  } else if (!was_enabled) {
    arp.cursor = 0u;
    arp.current_step = 0u;
    arp.next_event_sample = 0u;
    arp.runtime_initialized = false;
  } else if (arp.cursor >= arp.length) {
    arp.cursor %= arp.length;
  }
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
}
