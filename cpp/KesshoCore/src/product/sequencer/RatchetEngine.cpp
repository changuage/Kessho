#include "../KesshoProductEngineInternal.h"

namespace {

void clearDiceFieldOverrides(LaneState& lane, uint32_t flags) {
  if ((flags & KESSHO_PRODUCT_DICE_FIELD_TRIGGER) != 0u) {
    lane.step_override_set_low = 0u;
    lane.step_override_set_high = 0u;
    lane.step_override_value_low = 0u;
    lane.step_override_value_high = 0u;
  }
  if ((flags & KESSHO_PRODUCT_DICE_FIELD_PROBABILITY) != 0u) {
    lane.probability_override_set_low = 0u;
    lane.probability_override_set_high = 0u;
  }
  if ((flags & KESSHO_PRODUCT_DICE_FIELD_RATCHET) != 0u) {
    lane.ratchet_override_set_low = 0u;
    lane.ratchet_override_set_high = 0u;
  }
  if ((flags & KESSHO_PRODUCT_DICE_FIELD_MIDI_NOTE) != 0u) {
    lane.midi_note_override_set_low = 0u;
    lane.midi_note_override_set_high = 0u;
  }
  if ((flags & KESSHO_PRODUCT_DICE_FIELD_EXPRESSION) != 0u) {
    lane.expression_override_set_low = 0u;
    lane.expression_override_set_high = 0u;
    lane.expression_range_set_low = 0u;
    lane.expression_range_set_high = 0u;
  }
  if ((flags & KESSHO_PRODUCT_DICE_FIELD_MORPH) != 0u) {
    lane.morph_override_set_low = 0u;
    lane.morph_override_set_high = 0u;
    lane.morph_range_set_low = 0u;
    lane.morph_range_set_high = 0u;
  }
  if ((flags & KESSHO_PRODUCT_DICE_FIELD_DISTANCE) != 0u) {
    lane.distance_override_set_low = 0u;
    lane.distance_override_set_high = 0u;
    lane.distance_range_set_low = 0u;
    lane.distance_range_set_high = 0u;
  }
}

uint32_t diceStepFieldId(uint32_t field) {
  return (field >> KESSHO_PRODUCT_STEP_FIELD_SHIFT) & KESSHO_PRODUCT_STEP_FIELD_ID_MASK;
}

uint32_t diceFieldStepCount(const LaneState& lane, uint32_t field, uint32_t fallback_steps) {
  const uint32_t field_id = diceStepFieldId(field);
  if (field_id < 8u) {
    const StepValueSubLaneConfig& config = lane.step_value_configs[field_id];
    if (config.enabled && config.steps > 0u) {
      return clampU32(config.steps, 1u, 64u);
    }
  }
  return fallback_steps;
}

bool diceWriteOffsetAllowsStep(
    const LaneState& lane,
    uint32_t sequencer_id,
    uint32_t field,
    uint32_t step,
    uint32_t fallback_steps,
    int32_t write_offset,
    uint32_t bar_index) {
  if (write_offset == 0) {
    return true;
  }
  if (sequencer_id == KESSHO_PRODUCT_SEQUENCER_DRUM &&
      (field == KESSHO_PRODUCT_STEP_FIELD_PROBABILITY ||
       field == KESSHO_PRODUCT_STEP_FIELD_RATCHET)) {
    return true;
  }
  const uint32_t field_steps = diceFieldStepCount(lane, field, fallback_steps);
  if (field_steps == 0u) {
    return true;
  }
  const uint32_t write_step = write_offset < 0
      ? (bar_index % field_steps)
      : (static_cast<uint32_t>(write_offset) % field_steps);
  return step == write_step;
}

}

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
  if ((event.flags & KESSHO_PRODUCT_EVOLVE_MODE_PARITY) != 0u) {
    applyParityEvolveSequencerLaneEvent(event);
    return;
  }
  const float intensity = clampFloat(event.value <= 0.0f ? 1.0f : event.value, 0.0f, 1.0f);
  if (intensity <= 0.0001f || lane.step_count == 0u) {
    telemetry.last_error_code = KESSHO_PRODUCT_OK;
    return;
  }
  const uint32_t dice_flags = event.flags == 0u
      ? KESSHO_PRODUCT_DICE_FIELD_ALL
      : (event.flags & KESSHO_PRODUCT_DICE_FIELD_ALL);
  if (dice_flags == 0u) {
    telemetry.last_error_code = KESSHO_PRODUCT_OK;
    return;
  }
  if (event.flags == 0u) {
    clearLaneStepOverrides(lane);
  } else {
    clearDiceFieldOverrides(lane, dice_flags);
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
      (dice_flags * 3266489917u));
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

  const int32_t write_offset = static_cast<int32_t>(std::lround(event.value3));
  const uint32_t write_bar = static_cast<uint32_t>(std::lround(std::max(0.0f, event.value4)));
  auto write_allows = [&](uint32_t field, uint32_t step, uint32_t fallback_steps) {
    return diceWriteOffsetAllowsStep(lane, event.target_id, field, step, fallback_steps, write_offset, write_bar);
  };

  for (uint32_t step = 0; step < steps; ++step) {
    if ((dice_flags & KESSHO_PRODUCT_DICE_FIELD_TRIGGER) != 0u) {
      const bool base_hit = manualMaskHit(lane, step);
      const bool random_hit = dicePatternHit(step, steps, fills, rotation);
      const bool use_random_hit = intensity >= 0.999f || hashUnit(seed ^ step ^ 0xb5297a4du) < intensity;
      setStepOverride(lane, step, use_random_hit ? random_hit : base_hit);
    }
  }

  if ((dice_flags & KESSHO_PRODUCT_DICE_FIELD_PROBABILITY) != 0u) {
    const uint32_t field_steps = diceFieldStepCount(lane, KESSHO_PRODUCT_STEP_FIELD_PROBABILITY, steps);
    for (uint32_t step = 0; step < field_steps; ++step) {
      if (!write_allows(KESSHO_PRODUCT_STEP_FIELD_PROBABILITY, step, steps)) {
        continue;
      }
      const float random_probability = 0.25f + hashUnit(seed ^ (step * 747796405u) ^ 0x7f4a7c15u) * 0.75f;
      const float probability = clampFloat(lane.probability * (1.0f - intensity) + random_probability * intensity, 0.0f, 1.0f);
      setStepFieldOverride(lane, KESSHO_PRODUCT_STEP_FIELD_PROBABILITY, step, probability, 0.0f);
    }
  }

  if ((dice_flags & KESSHO_PRODUCT_DICE_FIELD_RATCHET) != 0u) {
    const uint32_t field_steps = diceFieldStepCount(lane, KESSHO_PRODUCT_STEP_FIELD_RATCHET, steps);
    for (uint32_t step = 0; step < field_steps; ++step) {
      if (!write_allows(KESSHO_PRODUCT_STEP_FIELD_RATCHET, step, steps)) {
        continue;
      }
      const float random_ratchet = static_cast<float>(1u + (hashU32(seed ^ (step * 2654435761u) ^ 0x5bd1e995u) % 4u));
      const float ratchet = clampFloat(lane.ratchet * (1.0f - intensity) + random_ratchet * intensity, 1.0f, 8.0f);
      setStepFieldOverride(lane, KESSHO_PRODUCT_STEP_FIELD_RATCHET, step, ratchet, 0.0f);
    }
  }

  if ((dice_flags & KESSHO_PRODUCT_DICE_FIELD_EXPRESSION) != 0u) {
    const uint32_t field_steps = diceFieldStepCount(lane, KESSHO_PRODUCT_STEP_FIELD_EXPRESSION, steps);
    for (uint32_t step = 0; step < field_steps; ++step) {
      if (!write_allows(KESSHO_PRODUCT_STEP_FIELD_EXPRESSION, step, steps)) {
        continue;
      }
      const float expression = clampFloat(lane.expression * (1.0f - intensity) + hashUnit(seed ^ (step * 1597334677u) ^ 0x94d049bbu) * intensity, 0.0f, 1.0f);
      setStepFieldOverride(lane, KESSHO_PRODUCT_STEP_FIELD_EXPRESSION, step, expression, 0.0f);
    }
  }
  if ((dice_flags & KESSHO_PRODUCT_DICE_FIELD_MORPH) != 0u) {
    const uint32_t field_steps = diceFieldStepCount(lane, KESSHO_PRODUCT_STEP_FIELD_MORPH, steps);
    for (uint32_t step = 0; step < field_steps; ++step) {
      if (!write_allows(KESSHO_PRODUCT_STEP_FIELD_MORPH, step, steps)) {
        continue;
      }
      const float morph = clampFloat(lane.morph * (1.0f - intensity) + hashUnit(seed ^ (step * 3812015801u) ^ 0x2c1b3c6du) * intensity, 0.0f, 1.0f);
      setStepFieldOverride(lane, KESSHO_PRODUCT_STEP_FIELD_MORPH, step, morph, 0.0f);
    }
  }
  if ((dice_flags & KESSHO_PRODUCT_DICE_FIELD_DISTANCE) != 0u) {
    const uint32_t field_steps = diceFieldStepCount(lane, KESSHO_PRODUCT_STEP_FIELD_DISTANCE, steps);
    for (uint32_t step = 0; step < field_steps; ++step) {
      if (!write_allows(KESSHO_PRODUCT_STEP_FIELD_DISTANCE, step, steps)) {
        continue;
      }
      const float distance = clampFloat(lane.distance * (1.0f - intensity) + hashUnit(seed ^ (step * 1103515245u) ^ 0x165667b1u) * intensity, 0.0f, 1.0f);
      setStepFieldOverride(lane, KESSHO_PRODUCT_STEP_FIELD_DISTANCE, step, distance, 0.0f);
    }
  }

  if ((dice_flags & KESSHO_PRODUCT_DICE_FIELD_MIDI_NOTE) != 0u) {
    const uint32_t field_steps = diceFieldStepCount(lane, KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE, steps);
    for (uint32_t step = 0; step < field_steps; ++step) {
      if (!write_allows(KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE, step, steps)) {
        continue;
      }
      const int32_t offset = static_cast<int32_t>(hashU32(seed ^ (step * 668265263u) ^ 0x27d4eb2fu) % 25u) - 12;
      const float midi = clampFloat(lane.midi_note + static_cast<float>(std::lround(static_cast<float>(offset) * intensity)), 0.0f, 127.0f);
      setStepFieldOverride(lane, KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE, step, midi, 0.0f);
    }
  }
  markSequencerUiStateChanged(event.target_id, event.index, KESSHO_PRODUCT_SEQUENCER_UI_CHANGE_DICE);
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
}
