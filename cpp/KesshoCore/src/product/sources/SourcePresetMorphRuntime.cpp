#include "../KesshoProductEngineInternal.h"

namespace {

bool sequencerMorphSubLaneActive(const KesshoProductEngine& engine, const LaneState& lane) {
  const uint32_t morph_field_id = engine.stepFieldId(KESSHO_PRODUCT_STEP_FIELD_MORPH);
  const bool morph_config_enabled =
      engine.validStepFieldId(morph_field_id) &&
      lane.step_value_configs[morph_field_id].enabled;
  return morph_config_enabled ||
      lane.morph_override_set_low != 0u ||
      lane.morph_override_set_high != 0u ||
      lane.morph_range_set_low != 0u ||
      lane.morph_range_set_high != 0u;
}

bool laneTargetsPresetSource(const LaneState& lane, uint32_t source_id, uint32_t drum_voice) {
  if (source_id == KESSHO_PRODUCT_SOURCE_DRUM) {
    return lane.target_source_id == KESSHO_PRODUCT_SOURCE_DRUM &&
        drum_voice < DRUM_NUM_VOICE_TYPES &&
        lane.last_emitted_drum_voice == drum_voice;
  }
  return lane.target_source_id == source_id;
}

void selectLatestSequencerMorph(
    const KesshoProductEngine& engine,
    const LaneState* lanes,
    uint32_t lane_count,
    uint32_t source_id,
    uint32_t drum_voice,
    bool& found,
    uint64_t& latest_sample_frame,
    float& morph) {
  for (uint32_t lane_index = 0; lane_index < lane_count; ++lane_index) {
    const LaneState& lane = lanes[lane_index];
    if (!lane.enabled ||
        !lane.last_emitted_morph_valid ||
        !laneTargetsPresetSource(lane, source_id, drum_voice) ||
        !sequencerMorphSubLaneActive(engine, lane) ||
        !std::isfinite(lane.last_emitted_morph)) {
      continue;
    }
    if (!found || lane.last_emitted_sample_frame >= latest_sample_frame) {
      found = true;
      latest_sample_frame = lane.last_emitted_sample_frame;
      morph = clampFloat(lane.last_emitted_morph, 0.0f, 1.0f);
    }
  }
}

} // namespace

bool KesshoProductEngine::activeSequencerMorphForPresetSource(
    uint32_t source_id,
    uint32_t drum_voice,
    float& morph) const {
  if (!transport.running) {
    return false;
  }
  bool found = false;
  uint64_t latest_sample_frame = 0u;
  selectLatestSequencerMorph(
      *this,
      synth_lanes,
      synth_lane_count,
      source_id,
      drum_voice,
      found,
      latest_sample_frame,
      morph);
  selectLatestSequencerMorph(
      *this,
      drum_lanes,
      drum_lane_count,
      source_id,
      drum_voice,
      found,
      latest_sample_frame,
      morph);
  return found;
}
