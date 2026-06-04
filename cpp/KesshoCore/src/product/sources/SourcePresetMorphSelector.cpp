#include "../KesshoProductEngineInternal.h"

namespace {

bool sequencerSourceFieldSubLaneActive(const KesshoProductEngine& engine, const LaneState& lane, uint32_t step_field) {
  const uint32_t field_id = engine.stepFieldId(step_field);
  const bool config_enabled =
      engine.validStepFieldId(field_id) &&
      lane.step_value_configs[field_id].enabled;
  switch (step_field) {
    case KESSHO_PRODUCT_STEP_FIELD_MORPH:
      return config_enabled ||
          lane.morph_override_set_low != 0u ||
          lane.morph_override_set_high != 0u ||
          lane.morph_range_set_low != 0u ||
          lane.morph_range_set_high != 0u;
    case KESSHO_PRODUCT_STEP_FIELD_DISTANCE:
      return config_enabled ||
          lane.distance_override_set_low != 0u ||
          lane.distance_override_set_high != 0u ||
          lane.distance_range_set_low != 0u ||
          lane.distance_range_set_high != 0u;
    case KESSHO_PRODUCT_STEP_FIELD_EXPRESSION:
      return config_enabled ||
          lane.expression_override_set_low != 0u ||
          lane.expression_override_set_high != 0u ||
          lane.expression_range_set_low != 0u ||
          lane.expression_range_set_high != 0u;
    default:
      return false;
  }
}

bool laneTargetsPresetSource(const LaneState& lane, uint32_t source_id, uint32_t drum_voice) {
  if (source_id == KESSHO_PRODUCT_SOURCE_DRUM) {
    return lane.target_source_id == KESSHO_PRODUCT_SOURCE_DRUM &&
        drum_voice < DRUM_NUM_VOICE_TYPES &&
        lane.last_emitted_drum_voice == drum_voice;
  }
  return lane.target_source_id == source_id;
}

bool laneLastEmittedSourceField(const LaneState& lane, uint32_t step_field, float& value) {
  switch (step_field) {
    case KESSHO_PRODUCT_STEP_FIELD_MORPH:
      if (!lane.last_emitted_morph_valid) return false;
      value = lane.last_emitted_morph;
      return true;
    case KESSHO_PRODUCT_STEP_FIELD_DISTANCE:
      if (!lane.last_emitted_distance_valid) return false;
      value = lane.last_emitted_distance;
      return true;
    case KESSHO_PRODUCT_STEP_FIELD_EXPRESSION:
      if (!lane.last_emitted_expression_valid) return false;
      value = lane.last_emitted_expression;
      return true;
    default:
      return false;
  }
}

void selectLatestSequencerSourceField(
    const KesshoProductEngine& engine,
    const LaneState* lanes,
    uint32_t lane_count,
    uint32_t source_id,
    uint32_t drum_voice,
    uint32_t step_field,
    bool& found,
    uint64_t& latest_sample_frame,
    float& value) {
  for (uint32_t lane_index = 0; lane_index < lane_count; ++lane_index) {
    const LaneState& lane = lanes[lane_index];
    float candidate = 0.0f;
    if (!lane.enabled ||
        !laneTargetsPresetSource(lane, source_id, drum_voice) ||
        !sequencerSourceFieldSubLaneActive(engine, lane, step_field) ||
        !laneLastEmittedSourceField(lane, step_field, candidate) ||
        !std::isfinite(candidate)) {
      continue;
    }
    if (!found || lane.last_emitted_sample_frame >= latest_sample_frame) {
      found = true;
      latest_sample_frame = lane.last_emitted_sample_frame;
      value = clampFloat(candidate, 0.0f, 1.0f);
    }
  }
}

} // namespace

bool KesshoProductEngine::activeSequencerSourceFieldForPresetSource(
    uint32_t source_id,
    uint32_t drum_voice,
    uint32_t step_field,
    float& value) const {
  if (!transport.running) {
    return false;
  }
  bool found = false;
  uint64_t latest_sample_frame = 0u;
  selectLatestSequencerSourceField(
      *this,
      synth_lanes,
      synth_lane_count,
      source_id,
      drum_voice,
      step_field,
      found,
      latest_sample_frame,
      value);
  selectLatestSequencerSourceField(
      *this,
      drum_lanes,
      drum_lane_count,
      source_id,
      drum_voice,
      step_field,
      found,
      latest_sample_frame,
      value);
  return found;
}
