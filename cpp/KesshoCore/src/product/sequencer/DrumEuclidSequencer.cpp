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
      return false;
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
