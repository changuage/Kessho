#include "../KesshoProductEngineInternal.h"

  bool KesshoProductEngine::isSequencerLaneParam(uint32_t param_id) const {
  switch (param_id) {
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_ENABLED_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_TARGET_SOURCE_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_STEP_COUNT_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_FILL_COUNT_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_ROTATION_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_CLOCK_DIVISION_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_SWING_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_PROBABILITY_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_RATCHET_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_TRIG_CONDITION_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_MIDI_NOTE_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_VELOCITY_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_HOLD_SECONDS_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_SEED_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_INITIAL_START_DELAY_SECONDS_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_PITCH_BINDING_MODE_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_TEMPO_MULTIPLIER_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_MORPH_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_DISTANCE_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_EXPRESSION_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_PITCH_MODE_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_PITCH_ROOT_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_PITCH_SCALE_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_NOTE_RANGE_MIN_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_NOTE_RANGE_MAX_ID:
      return true;
    default:
      return param_id >= KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_MODE_ID &&
          param_id <= KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_GATE_RANGE_ENABLED_ID;
  }
}

  void KesshoProductEngine::applySequencerLaneParamEvent(const KesshoProductEvent& event) {
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
  switch (event.param_id) {
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_ENABLED_ID: {
      const bool enabled = event.value >= 0.5f;
      if (lane.enabled != enabled) {
        resetSequencerLaneRuntime(lane);
      }
      lane.enabled = enabled;
      break;
    }
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_TARGET_SOURCE_ID: {
      if (event.value < 1.0f || event.value > static_cast<float>(kSourceCount)) {
        telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
        return;
      }
      const uint32_t source_id = static_cast<uint32_t>(std::lround(event.value));
      lane.target_source_id = source_id;
      if (source_id != KESSHO_PRODUCT_SOURCE_DRUM) {
        lane.drum_voice_mask = 0u;
      }
      if (source_id != KESSHO_PRODUCT_SOURCE_PAD1 && source_id != KESSHO_PRODUCT_SOURCE_PAD2) {
        lane.target_pad_voice_index = kPadVoiceNoPreference;
        lane.target_pad_voice_mask = 0u;
      }
      break;
    }
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_STEP_COUNT_ID:
      if (event.value < 1.0f) {
        telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SEQUENCER_LANE;
        return;
      }
      lane.step_count = clampU32(static_cast<uint32_t>(std::lround(event.value)), 1u, 64u);
      lane.fill_count = clampU32(lane.fill_count, 0u, lane.step_count);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_FILL_COUNT_ID:
      lane.fill_count = clampU32(static_cast<uint32_t>(std::lround(std::max(0.0f, event.value))), 0u, lane.step_count);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_ROTATION_ID:
      lane.rotation = static_cast<int32_t>(std::lround(clampFloat(event.value, -64.0f, 64.0f)));
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_CLOCK_DIVISION_ID:
      lane.clock_division = clampU32(static_cast<uint32_t>(std::lround(event.value)), 1u, 128u);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_SWING_ID:
      lane.swing = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_PROBABILITY_ID:
      lane.probability = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_RATCHET_ID:
      lane.ratchet = clampU32(static_cast<uint32_t>(std::lround(event.value)), 1u, 8u);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_TRIG_CONDITION_ID:
      lane.trig_condition = static_cast<uint32_t>(std::lround(std::max(0.0f, event.value)));
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_MIDI_NOTE_ID:
      lane.midi_note = clampFloat(event.value, 0.0f, 127.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_VELOCITY_ID:
      lane.velocity = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_HOLD_SECONDS_ID:
      lane.hold_seconds = clampFloat(event.value, 0.001f, 20.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_SEED_ID: {
      const uint32_t seed = static_cast<uint32_t>(std::lround(std::max(0.0f, event.value)));
      if (lane.target_source_id == KESSHO_PRODUCT_SOURCE_DRUM) {
        lane.drum_voice_mask = drumVoiceMaskFromEncodedSeed(seed);
      }
      const bool pad_lane =
          lane.target_source_id == KESSHO_PRODUCT_SOURCE_PAD1 ||
          lane.target_source_id == KESSHO_PRODUCT_SOURCE_PAD2;
      lane.target_pad_voice_index = pad_lane
          ? padVoiceIndexFromEncodedSeed(seed)
          : kPadVoiceNoPreference;
      lane.target_pad_voice_mask = pad_lane
          ? padVoiceMaskFromEncodedSeed(seed)
          : 0u;
      const uint32_t decoded_seed = lane.target_source_id == KESSHO_PRODUCT_SOURCE_DRUM
          ? laneSeedFromEncodedDrumVoiceMask(seed)
          : (pad_lane ? laneSeedFromEncodedPadVoice(seed) : seed);
      lane.seed = decoded_seed == 0u ? rng_seed + event.index + 1u : decoded_seed;
      break;
    }
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_INITIAL_START_DELAY_SECONDS_ID:
      lane.initial_start_delay_seconds =
          std::isfinite(event.value) && event.value >= 0.0f
              ? clampFloat(event.value, 0.0f, 64.0f)
              : kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SEQUENCER_INITIAL_START_DELAY_SECONDS;
      if (lane.enabled) {
        resetSequencerLaneRuntime(lane);
      }
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_PITCH_BINDING_MODE_ID:
      lane.midi_note_binding_mode = event.value >= 0.5f ? kSequencerPitchBindingStep : kSequencerPitchBindingHit;
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_TEMPO_MULTIPLIER_ID:
      lane.tempo_multiplier = clampFloat(event.value, 0.25f, 12.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_MORPH_ID:
      lane.morph = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_DISTANCE_ID:
      lane.distance = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_EXPRESSION_ID:
      lane.expression = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_PITCH_MODE_ID:
      lane.pitch_mode = clampU32(static_cast<uint32_t>(std::lround(std::max(0.0f, event.value))), kSequencerPitchModeSemitones, kSequencerPitchModeNoteRange);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_PITCH_ROOT_ID:
      lane.pitch_root = clampFloat(event.value, 0.0f, 127.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_PITCH_SCALE_ID:
      lane.pitch_scale_id = clampU32(static_cast<uint32_t>(std::lround(std::max(0.0f, event.value))), 0u, kSequencerPitchScaleCount - 1u);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_NOTE_RANGE_MIN_ID:
      lane.note_range_min = clampFloat(event.value, 24.0f, 108.0f);
      if (lane.note_range_max < lane.note_range_min + 2.0f) {
        lane.note_range_max = clampFloat(lane.note_range_min + 2.0f, 26.0f, 108.0f);
      }
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_NOTE_RANGE_MAX_ID:
      lane.note_range_max = clampFloat(event.value, 24.0f, 108.0f);
      if (lane.note_range_min > lane.note_range_max - 2.0f) {
        lane.note_range_min = clampFloat(lane.note_range_max - 2.0f, 24.0f, 106.0f);
      }
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_MODE_ID: {
      const uint32_t mode = clampU32(static_cast<uint32_t>(std::lround(std::max(0.0f, event.value))), kSequencerModeEuclid, kSequencerModeOrbit);
      if (lane.sequencer_mode != mode) {
        lane.sequencer_mode = mode;
        resetSequencerLaneRuntime(lane);
      }
      break;
    }
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_MODE_ID:
      lane.anchor_walker.mode = clampU32(static_cast<uint32_t>(std::lround(std::max(0.0f, event.value))), 0u, 2u);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_ANCHOR_SOURCE_ID:
      lane.anchor_walker.anchor_source = clampU32(static_cast<uint32_t>(std::lround(std::max(0.0f, event.value))), 0u, 3u);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_MANUAL_ANCHOR_MIDI_ID:
      lane.anchor_walker.manual_anchor_midi = clampFloat(event.value, 0.0f, 127.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_SNAP_SOURCE_ID:
      lane.anchor_walker.snap_source = clampU32(static_cast<uint32_t>(std::lround(std::max(0.0f, event.value))), 0u, 4u);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_CUSTOM_PITCH_CLASS_MASK_ID:
      lane.anchor_walker.custom_pitch_class_mask = static_cast<uint16_t>(
          clampU32(static_cast<uint32_t>(std::lround(std::max(1.0f, event.value))), 1u, 0x0fffu));
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_AUTO_RATE_ID:
      lane.anchor_walker.auto_rate = clampU32(static_cast<uint32_t>(std::lround(std::max(0.0f, event.value))), 0u, 6u);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_AUTO_FEEL_ID:
      lane.anchor_walker.auto_feel = clampU32(static_cast<uint32_t>(std::lround(std::max(0.0f, event.value))), 0u, 2u);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_LEAD_MODE_ID:
      lane.anchor_walker.lead_mode = event.value >= 0.5f;
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_MW_TO_VELOCITY_ID:
      lane.anchor_walker.mw_to_velocity = event.value >= 0.5f;
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_PITCH_WHEEL_WALK_ID:
      lane.anchor_walker.pitch_wheel_walk = event.value >= 0.5f;
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_GESTURE_PATTERN_STEP_ID: {
      const uint32_t pattern_index = event.flags & 0xffu;
      if (pattern_index < kMaxAnchorWalkerPatternSteps) {
        lane.anchor_walker.gesture_pattern[pattern_index] = static_cast<int32_t>(
            clampInt(static_cast<int32_t>(std::lround(event.value)), -7, 7));
      }
      break;
    }
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_GESTURE_PATTERN_LENGTH_ID:
      lane.anchor_walker.gesture_pattern_length = clampU32(static_cast<uint32_t>(std::lround(std::max(1.0f, event.value))), 1u, kMaxAnchorWalkerPatternSteps);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_LAYER_PRESET_ID:
      lane.anchor_walker.layer_preset = clampU32(static_cast<uint32_t>(std::lround(std::max(0.0f, event.value))), 0u, 6u);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_SPREAD_MS_ID:
      lane.anchor_walker.spread_seconds = clampFloat(event.value * 0.001f, 0.0f, 0.5f);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_OUTPUT_RANGE_MIN_ID:
      lane.anchor_walker.output_range_min = clampFloat(event.value, 0.0f, 127.0f);
      if (lane.anchor_walker.output_range_max < lane.anchor_walker.output_range_min) {
        lane.anchor_walker.output_range_max = lane.anchor_walker.output_range_min;
      }
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_OUTPUT_RANGE_MAX_ID:
      lane.anchor_walker.output_range_max = clampFloat(event.value, lane.anchor_walker.output_range_min, 127.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_LAYER_ENABLED_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_LAYER_TRANSPOSE_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_LAYER_DIATONIC_OFFSET_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_LAYER_TUNING_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_LAYER_MOTION_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_LAYER_DELAY_MS_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_LAYER_GATE_RATIO_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_LAYER_VELOCITY_SCALE_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_LAYER_VELOCITY_OFFSET_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_LAYER_TARGET_SOURCE_ID: {
      const uint32_t layer_index = event.flags & 0xffu;
      if (layer_index >= kMaxAnchorWalkerLayers) break;
      AnchorWalkerLayerState& layer = lane.anchor_walker.layers[layer_index];
      switch (event.param_id) {
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_LAYER_ENABLED_ID: layer.enabled = event.value >= 0.5f; break;
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_LAYER_TRANSPOSE_ID: layer.transpose_semitones = static_cast<int32_t>(clampInt(static_cast<int32_t>(std::lround(event.value)), -48, 48)); break;
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_LAYER_DIATONIC_OFFSET_ID: layer.diatonic_offset = static_cast<int32_t>(clampInt(static_cast<int32_t>(std::lround(event.value)), -14, 14)); break;
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_LAYER_TUNING_ID: layer.tuning = clampU32(static_cast<uint32_t>(std::lround(std::max(0.0f, event.value))), 0u, 2u); break;
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_LAYER_MOTION_ID: layer.motion = clampU32(static_cast<uint32_t>(std::lround(std::max(0.0f, event.value))), 0u, 2u); break;
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_LAYER_DELAY_MS_ID: layer.delay_seconds = clampFloat(event.value * 0.001f, 0.0f, 0.5f); break;
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_LAYER_GATE_RATIO_ID: layer.gate_ratio = clampFloat(event.value, 0.05f, 1.0f); break;
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_LAYER_VELOCITY_SCALE_ID: layer.velocity_scale = clampFloat(event.value, 0.0f, 2.0f); break;
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_LAYER_VELOCITY_OFFSET_ID: layer.velocity_offset = clampFloat(event.value, -1.0f, 1.0f); break;
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ANCHOR_WALKER_LAYER_TARGET_SOURCE_ID: layer.target_source_id = clampU32(static_cast<uint32_t>(std::lround(std::max(0.0f, event.value))), 0u, kSourceCount); break;
        default: break;
      }
      break;
    }
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_TRIGGER_LINE_COUNT_ID:
      lane.orbit.trigger_line_count = clampU32(static_cast<uint32_t>(std::lround(std::max(1.0f, event.value))), 1u, kMaxOrbitTriggerLines);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_BPM_PERCENT_ID:
      lane.orbit.bpm_percent = clampFloat(event.value, 1.0f, 800.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_QUANTIZE_TO_HARMONY_ID:
      lane.orbit.quantize_to_harmony = event.value >= 0.5f;
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_SNAP_SOURCE_ID:
      lane.orbit.snap_source = clampU32(static_cast<uint32_t>(std::lround(std::max(0.0f, event.value))), 0u, 4u);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_PITCH_RANGE_MIN_ID:
      lane.orbit.pitch_range_min = clampFloat(event.value, 0.0f, 127.0f);
      if (lane.orbit.pitch_range_max < lane.orbit.pitch_range_min) lane.orbit.pitch_range_max = lane.orbit.pitch_range_min;
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_PITCH_RANGE_MAX_ID:
      lane.orbit.pitch_range_max = clampFloat(event.value, lane.orbit.pitch_range_min, 127.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_SPLINE_H1_X_ID: lane.orbit.spline_h1_x = clampFloat(event.value, -1.2f, 1.2f); break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_SPLINE_H1_Y_ID: lane.orbit.spline_h1_y = clampFloat(event.value, -1.2f, 1.2f); break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_SPLINE_H2_X_ID: lane.orbit.spline_h2_x = clampFloat(event.value, -1.2f, 1.2f); break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_SPLINE_H2_Y_ID: lane.orbit.spline_h2_y = clampFloat(event.value, -1.2f, 1.2f); break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_SPLINE_TIP_X_ID: lane.orbit.spline_tip_x = clampFloat(event.value, -1.2f, 1.2f); break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_SPLINE_TIP_Y_ID: lane.orbit.spline_tip_y = clampFloat(event.value, -1.2f, 1.2f); break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_SPLINE_SPIN_ENABLED_ID: lane.orbit.spline_spin_enabled = event.value >= 0.5f; break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_SPLINE_SPIN_DIRECTION_ID: lane.orbit.spline_spin_direction = event.value < 0.0f ? -1 : 1; break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_SPLINE_BASE_ANGLE_ID: lane.orbit.base_angle = wrapRadians(event.value); lane.orbit.prev_base_angle = lane.orbit.base_angle; break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_COUNT_ID:
      lane.orbit.note_count = clampU32(static_cast<uint32_t>(std::lround(std::max(0.0f, event.value))), 0u, kMaxOrbitSequencerNotes);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_ENABLED_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_RADIUS_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_PHASE_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_SPEED_MODE_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_SPEED_VALUE_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_DIRECTION_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_PITCH_MODE_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_MIDI_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_HARMONY_DEGREE_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_VELOCITY_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_VELOCITY_MIN_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_VELOCITY_MAX_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_GATE_BEATS_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_GATE_MIN_BEATS_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_GATE_MAX_BEATS_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_PROBABILITY_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_TARGET_SOURCE_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_SEED_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_PITCH_RANGE_MIN_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_PITCH_RANGE_MAX_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_VELOCITY_RANGE_ENABLED_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_GATE_RANGE_ENABLED_ID: {
      const uint32_t note_index = event.flags & 0xffu;
      if (note_index >= kMaxOrbitSequencerNotes) break;
      OrbitNoteState& note = lane.orbit.notes[note_index];
      switch (event.param_id) {
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_ENABLED_ID: note.enabled = event.value >= 0.5f; break;
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_RADIUS_ID: note.radius_norm = clampFloat(event.value, 0.08f, 1.0f); break;
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_PHASE_ID: note.angle = wrapRadians(event.value); note.prev_angle = note.angle; break;
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_SPEED_MODE_ID: note.speed_mode = event.value >= 0.5f ? 1u : 0u; break;
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_SPEED_VALUE_ID: note.speed_value = clampFloat(event.value, 0.125f, 800.0f); break;
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_DIRECTION_ID: note.direction = event.value < 0.0f ? -1 : 1; break;
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_PITCH_MODE_ID: note.pitch_mode = clampU32(static_cast<uint32_t>(std::lround(std::max(0.0f, event.value))), 0u, 2u); break;
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_MIDI_ID: note.midi_note = clampFloat(event.value, 0.0f, 127.0f); break;
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_HARMONY_DEGREE_ID: note.harmony_degree = static_cast<int32_t>(clampInt(static_cast<int32_t>(std::lround(event.value)), -32, 32)); break;
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_VELOCITY_ID: note.velocity = clampFloat(event.value, 0.0f, 1.0f); break;
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_VELOCITY_MIN_ID: note.velocity_min = clampFloat(event.value, 0.0f, 1.0f); if (note.velocity_max < note.velocity_min) note.velocity_max = note.velocity_min; break;
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_VELOCITY_MAX_ID: note.velocity_max = clampFloat(event.value, note.velocity_min, 1.0f); break;
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_GATE_BEATS_ID: note.gate_beats = clampFloat(event.value, 0.05f, 8.0f); break;
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_GATE_MIN_BEATS_ID: note.gate_min_beats = clampFloat(event.value, 0.05f, 8.0f); if (note.gate_max_beats < note.gate_min_beats) note.gate_max_beats = note.gate_min_beats; break;
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_GATE_MAX_BEATS_ID: note.gate_max_beats = clampFloat(event.value, note.gate_min_beats, 8.0f); break;
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_PROBABILITY_ID: note.probability = clampFloat(event.value, 0.0f, 1.0f); break;
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_TARGET_SOURCE_ID: note.target_source_id = clampU32(static_cast<uint32_t>(std::lround(std::max(0.0f, event.value))), 0u, kSourceCount); break;
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_SEED_ID: note.seed = static_cast<uint32_t>(std::lround(std::max(1.0f, event.value))); break;
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_PITCH_RANGE_MIN_ID: note.pitch_range_min = clampFloat(event.value, 0.0f, 127.0f); if (note.pitch_range_max < note.pitch_range_min) note.pitch_range_max = note.pitch_range_min; break;
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_PITCH_RANGE_MAX_ID: note.pitch_range_max = clampFloat(event.value, note.pitch_range_min, 127.0f); break;
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_VELOCITY_RANGE_ENABLED_ID: note.velocity_range_enabled = event.value >= 0.5f; break;
        case KESSHO_PRODUCT_PARAM_SEQUENCER_ORBIT_NOTE_GATE_RANGE_ENABLED_ID: note.gate_range_enabled = event.value >= 0.5f; break;
        default: break;
      }
      break;
    }
    default:
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
      return;
  }
  switch (event.param_id) {
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_STEP_COUNT_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_FILL_COUNT_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_ROTATION_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_CLOCK_DIVISION_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_SWING_ID:
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_TEMPO_MULTIPLIER_ID:
      clearPendingRatchets(lane);
      break;
    default:
      break;
  }
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
}

  LaneState* KesshoProductEngine::sequencerLanesForEvent(const KesshoProductEvent& event, uint32_t& lane_count) {
  if (event.target_id == KESSHO_PRODUCT_SEQUENCER_SYNTH) {
    lane_count = synth_lane_count;
    return synth_lanes;
  }
  if (event.target_id == KESSHO_PRODUCT_SEQUENCER_DRUM) {
    lane_count = drum_lane_count;
    return drum_lanes;
  }
  telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_EVENT;
  lane_count = 0;
  return nullptr;
}

  void KesshoProductEngine::applyResetSequencerLaneHomeEvent(const KesshoProductEvent& event) {
  uint32_t lane_count = 0;
  LaneState* lanes = sequencerLanesForEvent(event, lane_count);
  if (lanes == nullptr) {
    return;
  }
  if (event.index >= lane_count) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SEQUENCER_LANE;
    return;
  }
  clearLaneStepOverrides(lanes[event.index]);
  clearSequencerEvolveHome(lanes[event.index]);
  markSequencerUiStateChanged(event.target_id, event.index, KESSHO_PRODUCT_SEQUENCER_UI_CHANGE_RESET_HOME);
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
}
