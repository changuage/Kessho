#include "../KesshoProductEngineInternal.h"

  bool KesshoProductEngine::dicePatternHit(uint32_t step, uint32_t steps, uint32_t fills, uint32_t rotation) const {
  return euclidHit(step, steps, fills, static_cast<int32_t>(rotation));
}

  bool KesshoProductEngine::dicePatternMatchesBase(const LaneState& lane, uint32_t rotation, uint32_t fills) const {
  for (uint32_t step = 0; step < lane.step_count; ++step) {
    if (dicePatternHit(step, lane.step_count, fills, rotation) != euclidHit(step, lane.step_count, lane.fill_count, lane.rotation)) {
      return false;
    }
  }
  return true;
}

  void KesshoProductEngine::applyDiceSequencerLaneEvent(const KesshoProductEvent& event) {
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
  clearLaneStepOverrides(lane);
  const float intensity = clampFloat(event.value <= 0.0f ? 1.0f : event.value, 0.0f, 1.0f);
  if (intensity <= 0.0001f || lane.step_count == 0u) {
    telemetry.last_error_code = KESSHO_PRODUCT_OK;
    return;
  }

  const uint32_t event_seed = static_cast<uint32_t>(std::lround(std::max(0.0f, event.value2)));
  const uint32_t dice_nonce = event_seed == 0u ? rng_state : event_seed;
  const uint32_t seed = hashU32(
      rng_seed ^
      rng_state ^
      evolution_state ^
      lane.seed ^
      dice_nonce ^
      (event.target_id * 16777619u) ^
      (event.index * 2246822519u) ^
      (event.flags * 3266489917u));
  rng_state = hashU32(seed ^ rng_state ^ 0x9e3779b9u);
  if (rng_state == 0u) {
    rng_state = rng_seed == 0u ? 1u : rng_seed;
  }
  const uint32_t steps = clampU32(lane.step_count, 1u, 64u);
  uint32_t fills = lane.fill_count == 0u ? std::max(1u, steps / 4u) : lane.fill_count;
  fills = clampU32(fills, 1u, steps);
  uint32_t rotation = steps > 1u ? (hashU32(seed ^ 0x6c8e9cf5u) % steps) : 0u;
  for (uint32_t attempts = 0; attempts < steps && dicePatternMatchesBase(lane, rotation, fills); ++attempts) {
    rotation = (rotation + 1u) % steps;
  }

  for (uint32_t step = 0; step < steps; ++step) {
    const bool base_hit = manualMaskHit(lane, step);
    const bool random_hit = dicePatternHit(step, steps, fills, rotation);
    const bool use_random_hit = intensity >= 0.999f || hashUnit(seed ^ step ^ 0xb5297a4du) < intensity;
    setStepOverride(lane, step, use_random_hit ? random_hit : base_hit);

    const float random_probability = 0.25f + hashUnit(seed ^ (step * 747796405u) ^ 0x7f4a7c15u) * 0.75f;
    const float probability = clampFloat(lane.probability * (1.0f - intensity) + random_probability * intensity, 0.0f, 1.0f);
    setStepFieldOverride(lane, KESSHO_PRODUCT_STEP_FIELD_PROBABILITY, step, probability, 0.0f);

    const float expression = clampFloat(lane.expression * (1.0f - intensity) + hashUnit(seed ^ (step * 1597334677u) ^ 0x94d049bbu) * intensity, 0.0f, 1.0f);
    const float morph = clampFloat(lane.morph * (1.0f - intensity) + hashUnit(seed ^ (step * 3812015801u) ^ 0x2c1b3c6du) * intensity, 0.0f, 1.0f);
    const float distance = clampFloat(lane.distance * (1.0f - intensity) + hashUnit(seed ^ (step * 1103515245u) ^ 0x165667b1u) * intensity, 0.0f, 1.0f);
    setStepFieldOverride(lane, KESSHO_PRODUCT_STEP_FIELD_EXPRESSION, step, expression, 0.0f);
    setStepFieldOverride(lane, KESSHO_PRODUCT_STEP_FIELD_MORPH, step, morph, 0.0f);
    setStepFieldOverride(lane, KESSHO_PRODUCT_STEP_FIELD_DISTANCE, step, distance, 0.0f);

    if (event.target_id == KESSHO_PRODUCT_SEQUENCER_SYNTH) {
      const int32_t offset = static_cast<int32_t>(hashU32(seed ^ (step * 668265263u) ^ 0x27d4eb2fu) % 25u) - 12;
      const float midi = clampFloat(lane.midi_note + static_cast<float>(std::lround(static_cast<float>(offset) * intensity)), 0.0f, 127.0f);
      setStepFieldOverride(lane, KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE, step, midi, 0.0f);
    }
  }
  markSequencerUiStateChanged(event.target_id, event.index, KESSHO_PRODUCT_SEQUENCER_UI_CHANGE_DICE);
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
}
