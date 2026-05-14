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
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_ENABLED_ID:
      lane.enabled = event.value >= 0.5f;
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_TARGET_SOURCE_ID: {
      if (event.value < 1.0f || event.value > static_cast<float>(kSourceCount)) {
        telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SOURCE;
        return;
      }
      const uint32_t source_id = static_cast<uint32_t>(std::lround(event.value));
      lane.target_source_id = source_id;
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
      lane.seed = seed == 0u ? rng_seed + event.index + 1u : seed;
      break;
    }
    default:
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_PARAM;
      return;
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
  markSequencerUiStateChanged(event.target_id, event.index, KESSHO_PRODUCT_SEQUENCER_UI_CHANGE_RESET_HOME);
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
}
