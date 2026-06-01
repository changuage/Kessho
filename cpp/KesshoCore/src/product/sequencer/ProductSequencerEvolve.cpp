#include "../KesshoProductEngineInternal.h"

#include <algorithm>
#include <cmath>

namespace {

constexpr uint32_t kValueFields[] = {
  KESSHO_PRODUCT_STEP_FIELD_EXPRESSION,
  KESSHO_PRODUCT_STEP_FIELD_MORPH,
  KESSHO_PRODUCT_STEP_FIELD_DISTANCE,
};

constexpr uint32_t kLengthDirectionFields[] = {
  KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE,
  KESSHO_PRODUCT_STEP_FIELD_EXPRESSION,
  KESSHO_PRODUCT_STEP_FIELD_MORPH,
  KESSHO_PRODUCT_STEP_FIELD_DISTANCE,
};

bool hasFlag(uint32_t flags, uint32_t flag) {
  return (flags & flag) != 0u;
}

struct EvolveRandom {
  uint32_t state = 0u;
  bool stream = false;
};

uint32_t nextHashRandom(uint32_t& state) {
  state = kessho::product::internal::hashU32(state ^ 0x9e3779b9u);
  if (state == 0u) {
    state = 0x6d2b79f5u;
  }
  return state;
}

uint32_t nextMulberryRandom(uint32_t& state) {
  uint32_t t = (state += 0x6d2b79f5u);
  t = (t ^ (t >> 15u)) * (t | 1u);
  t ^= t + ((t ^ (t >> 7u)) * (t | 61u));
  return t ^ (t >> 14u);
}

uint32_t nextRandom(EvolveRandom& rng) {
  return rng.stream ? nextMulberryRandom(rng.state) : nextHashRandom(rng.state);
}

bool maskHas(uint32_t low, uint32_t high, uint32_t step) {
  if (step < 32u) {
    return (low & (1u << step)) != 0u;
  }
  return (high & (1u << (step - 32u))) != 0u;
}

void setMask(uint32_t& low, uint32_t& high, uint32_t step) {
  if (step < 32u) {
    low |= 1u << step;
    return;
  }
  high |= 1u << (step - 32u);
}

void clearMask(uint32_t& low, uint32_t& high, uint32_t step) {
  if (step < 32u) {
    low &= ~(1u << step);
    return;
  }
  high &= ~(1u << (step - 32u));
}

float randomUnit(EvolveRandom& rng) {
  if (!rng.stream) {
    return kessho::product::internal::hashUnit(nextRandom(rng));
  }
  return static_cast<float>(nextRandom(rng)) * (1.0f / 4294967296.0f);
}

bool chance(EvolveRandom& rng, float probability) {
  return randomUnit(rng) < kessho::product::internal::clampFloat(probability, 0.0f, 1.0f);
}

bool tensionGate(EvolveRandom& rng, float base_probability, float tension, float affinity) {
  const float match = 1.0f - std::fabs(kessho::product::internal::clampFloat(tension, 0.0f, 1.0f) - affinity);
  return chance(rng, base_probability * (0.3f + 0.7f * match));
}

float decodeTensionParam(uint32_t encoded_param, float fallback) {
  if (encoded_param == 0u) {
    return kessho::product::internal::clampFloat(fallback, 0.0f, 1.0f);
  }
  const uint32_t encoded = kessho::product::internal::clampU32(
      encoded_param - 1u,
      0u,
      KESSHO_PRODUCT_EVOLVE_TENSION_PARAM_SCALE);
  return static_cast<float>(encoded) / static_cast<float>(KESSHO_PRODUCT_EVOLVE_TENSION_PARAM_SCALE);
}

float eventEffectiveTension(const KesshoProductEvent& event, float fallback, bool rng_stream) {
  if (!rng_stream) {
    return decodeTensionParam(event.param_id, fallback);
  }
  return decodeTensionParam(
      static_cast<uint32_t>(std::lround(std::max(0.0f, event.value2))),
      fallback);
}

float drift(float value, float delta, EvolveRandom& rng) {
  return value + (randomUnit(rng) * 2.0f - 1.0f) * delta;
}

uint32_t fieldId(uint32_t field) {
  return (field >> KESSHO_PRODUCT_STEP_FIELD_SHIFT) & KESSHO_PRODUCT_STEP_FIELD_ID_MASK;
}

uint32_t fieldDiceFlag(uint32_t field) {
  switch (field) {
    case KESSHO_PRODUCT_STEP_FIELD_PROBABILITY: return KESSHO_PRODUCT_DICE_FIELD_PROBABILITY;
    case KESSHO_PRODUCT_STEP_FIELD_RATCHET: return KESSHO_PRODUCT_DICE_FIELD_RATCHET;
    case KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE: return KESSHO_PRODUCT_DICE_FIELD_MIDI_NOTE;
    case KESSHO_PRODUCT_STEP_FIELD_EXPRESSION: return KESSHO_PRODUCT_DICE_FIELD_EXPRESSION;
    case KESSHO_PRODUCT_STEP_FIELD_MORPH: return KESSHO_PRODUCT_DICE_FIELD_MORPH;
    case KESSHO_PRODUCT_STEP_FIELD_DISTANCE: return KESSHO_PRODUCT_DICE_FIELD_DISTANCE;
    default: return 0u;
  }
}

bool fieldEnabled(uint32_t flags, uint32_t field) {
  return hasFlag(flags, fieldDiceFlag(field));
}

uint32_t fieldStepCount(const LaneState& lane, uint32_t field) {
  const uint32_t id = fieldId(field);
  if (id < 8u) {
    const StepValueSubLaneConfig& config = lane.step_value_configs[id];
    if (config.enabled && config.steps > 0u) {
      return kessho::product::internal::clampU32(config.steps, 1u, 64u);
    }
  }
  return kessho::product::internal::clampU32(lane.step_count, 1u, 64u);
}

uint32_t writePosition(uint32_t length, int32_t write_offset, uint32_t bar_index) {
  if (length <= 1u) {
    return 0u;
  }
  if (write_offset < 0) {
    const double phase = static_cast<double>(bar_index % 64u) / 64.0;
    const double span = static_cast<double>(length - 2u);
    const int32_t offset = 1 + static_cast<int32_t>(std::floor(std::sin(phase * 6.283185307179586) * 0.5 * span + span * 0.5));
    return static_cast<uint32_t>(std::max(1, std::min(static_cast<int32_t>(length - 1u), offset))) % length;
  }
  return static_cast<uint32_t>(write_offset) % length;
}

bool writeAllows(uint32_t length, uint32_t step, int32_t write_offset, uint32_t bar_index) {
  return write_offset == 0 || step == writePosition(length, write_offset, bar_index);
}

float homeValue(const LaneEvolveHomeState& home, uint32_t field, uint32_t step, float fallback) {
  switch (field) {
    case KESSHO_PRODUCT_STEP_FIELD_PROBABILITY:
      return maskHas(home.probability_override_set_low, home.probability_override_set_high, step)
          ? home.probability_overrides[step]
          : home.probability;
    case KESSHO_PRODUCT_STEP_FIELD_RATCHET:
      return maskHas(home.ratchet_override_set_low, home.ratchet_override_set_high, step)
          ? static_cast<float>(home.ratchet_overrides[step])
          : static_cast<float>(home.ratchet);
    case KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE:
      return maskHas(home.midi_note_override_set_low, home.midi_note_override_set_high, step)
          ? home.midi_note_overrides[step]
          : home.midi_note;
    case KESSHO_PRODUCT_STEP_FIELD_EXPRESSION:
      return maskHas(home.expression_override_set_low, home.expression_override_set_high, step)
          ? home.expression_overrides[step]
          : home.expression;
    case KESSHO_PRODUCT_STEP_FIELD_MORPH:
      return maskHas(home.morph_override_set_low, home.morph_override_set_high, step)
          ? home.morph_overrides[step]
          : home.morph;
    case KESSHO_PRODUCT_STEP_FIELD_DISTANCE:
      return maskHas(home.distance_override_set_low, home.distance_override_set_high, step)
          ? home.distance_overrides[step]
          : home.distance;
    default:
      return fallback;
  }
}

float laneValue(const LaneState& lane, uint32_t field, uint32_t step) {
  switch (field) {
    case KESSHO_PRODUCT_STEP_FIELD_PROBABILITY:
      return maskHas(lane.probability_override_set_low, lane.probability_override_set_high, step)
          ? lane.probability_overrides[step]
          : lane.probability;
    case KESSHO_PRODUCT_STEP_FIELD_RATCHET:
      return maskHas(lane.ratchet_override_set_low, lane.ratchet_override_set_high, step)
          ? static_cast<float>(lane.ratchet_overrides[step])
          : static_cast<float>(lane.ratchet);
    case KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE:
      return maskHas(lane.midi_note_override_set_low, lane.midi_note_override_set_high, step)
          ? lane.midi_note_overrides[step]
          : lane.midi_note;
    case KESSHO_PRODUCT_STEP_FIELD_EXPRESSION:
      return maskHas(lane.expression_override_set_low, lane.expression_override_set_high, step)
          ? lane.expression_overrides[step]
          : lane.expression;
    case KESSHO_PRODUCT_STEP_FIELD_MORPH:
      return maskHas(lane.morph_override_set_low, lane.morph_override_set_high, step)
          ? lane.morph_overrides[step]
          : lane.morph;
    case KESSHO_PRODUCT_STEP_FIELD_DISTANCE:
      return maskHas(lane.distance_override_set_low, lane.distance_override_set_high, step)
          ? lane.distance_overrides[step]
          : lane.distance;
    default:
      return 0.0f;
  }
}

void setLaneValue(LaneState& lane, uint32_t field, uint32_t step, float value) {
  if (step >= 64u) {
    return;
  }
  switch (field) {
    case KESSHO_PRODUCT_STEP_FIELD_PROBABILITY:
      lane.probability_overrides[step] = kessho::product::internal::clampFloat(value, 0.0f, 1.0f);
      setMask(lane.probability_override_set_low, lane.probability_override_set_high, step);
      break;
    case KESSHO_PRODUCT_STEP_FIELD_RATCHET:
      lane.ratchet_overrides[step] = kessho::product::internal::clampU32(static_cast<uint32_t>(std::lround(value)), 1u, 8u);
      setMask(lane.ratchet_override_set_low, lane.ratchet_override_set_high, step);
      break;
    case KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE:
      lane.midi_note_overrides[step] = kessho::product::internal::clampFloat(value, 0.0f, 127.0f);
      setMask(lane.midi_note_override_set_low, lane.midi_note_override_set_high, step);
      break;
    case KESSHO_PRODUCT_STEP_FIELD_EXPRESSION:
      lane.expression_overrides[step] = kessho::product::internal::clampFloat(value, 0.0f, 1.0f);
      setMask(lane.expression_override_set_low, lane.expression_override_set_high, step);
      clearMask(lane.expression_range_set_low, lane.expression_range_set_high, step);
      break;
    case KESSHO_PRODUCT_STEP_FIELD_MORPH:
      lane.morph_overrides[step] = kessho::product::internal::clampFloat(value, 0.0f, 1.0f);
      setMask(lane.morph_override_set_low, lane.morph_override_set_high, step);
      clearMask(lane.morph_range_set_low, lane.morph_range_set_high, step);
      break;
    case KESSHO_PRODUCT_STEP_FIELD_DISTANCE:
      lane.distance_overrides[step] = kessho::product::internal::clampFloat(value, 0.0f, 1.0f);
      setMask(lane.distance_override_set_low, lane.distance_override_set_high, step);
      clearMask(lane.distance_range_set_low, lane.distance_range_set_high, step);
      break;
    default:
      break;
  }
}

void clearLaneValue(LaneState& lane, uint32_t field, uint32_t step) {
  if (step >= 64u) {
    return;
  }
  switch (field) {
    case KESSHO_PRODUCT_STEP_FIELD_PROBABILITY:
      clearMask(lane.probability_override_set_low, lane.probability_override_set_high, step);
      break;
    case KESSHO_PRODUCT_STEP_FIELD_RATCHET:
      clearMask(lane.ratchet_override_set_low, lane.ratchet_override_set_high, step);
      break;
    case KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE:
      clearMask(lane.midi_note_override_set_low, lane.midi_note_override_set_high, step);
      break;
    case KESSHO_PRODUCT_STEP_FIELD_EXPRESSION:
      clearMask(lane.expression_override_set_low, lane.expression_override_set_high, step);
      clearMask(lane.expression_range_set_low, lane.expression_range_set_high, step);
      break;
    case KESSHO_PRODUCT_STEP_FIELD_MORPH:
      clearMask(lane.morph_override_set_low, lane.morph_override_set_high, step);
      clearMask(lane.morph_range_set_low, lane.morph_range_set_high, step);
      break;
    case KESSHO_PRODUCT_STEP_FIELD_DISTANCE:
      clearMask(lane.distance_override_set_low, lane.distance_override_set_high, step);
      clearMask(lane.distance_range_set_low, lane.distance_range_set_high, step);
      break;
    default:
      break;
  }
}

bool originalHasFieldValue(const LaneState& lane, uint32_t field, uint32_t step) {
  switch (field) {
    case KESSHO_PRODUCT_STEP_FIELD_PROBABILITY:
      return maskHas(lane.probability_override_set_low, lane.probability_override_set_high, step);
    case KESSHO_PRODUCT_STEP_FIELD_RATCHET:
      return maskHas(lane.ratchet_override_set_low, lane.ratchet_override_set_high, step);
    case KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE:
      return maskHas(lane.midi_note_override_set_low, lane.midi_note_override_set_high, step);
    case KESSHO_PRODUCT_STEP_FIELD_EXPRESSION:
      return maskHas(lane.expression_override_set_low, lane.expression_override_set_high, step);
    case KESSHO_PRODUCT_STEP_FIELD_MORPH:
      return maskHas(lane.morph_override_set_low, lane.morph_override_set_high, step);
    case KESSHO_PRODUCT_STEP_FIELD_DISTANCE:
      return maskHas(lane.distance_override_set_low, lane.distance_override_set_high, step);
    default:
      return false;
  }
}

void restoreMaskedValues(const LaneState& original, LaneState& lane, uint32_t field, int32_t write_offset, uint32_t bar_index) {
  if (write_offset == 0) {
    return;
  }
  const uint32_t steps = fieldStepCount(lane, field);
  const uint32_t pos = writePosition(steps, write_offset, bar_index);
  for (uint32_t step = 0u; step < steps; ++step) {
    if (step == pos) {
      continue;
    }
    if (originalHasFieldValue(original, field, step)) {
      setLaneValue(lane, field, step, laneValue(original, field, step));
    } else {
      clearLaneValue(lane, field, step);
    }
  }
}

uint32_t collectActiveFields(uint32_t flags, const uint32_t* fields, uint32_t field_count, uint32_t out_fields[8]) {
  uint32_t count = 0u;
  for (uint32_t i = 0u; i < field_count; ++i) {
    const uint32_t field = fields[i];
    if (fieldEnabled(flags, field)) {
      out_fields[count++] = field;
    }
  }
  return count;
}

bool laneFieldValuesDiffer(const LaneState& left, const LaneState& right, uint32_t field) {
  const uint32_t steps = std::max(fieldStepCount(left, field), fieldStepCount(right, field));
  for (uint32_t step = 0u; step < steps; ++step) {
    if (std::fabs(laneValue(left, field, step) - laneValue(right, field, step)) > 0.0001f) {
      return true;
    }
  }
  return false;
}

float committedManualValue(float current, uint32_t field, EvolveRandom& rng) {
  const float min_value = field == KESSHO_PRODUCT_STEP_FIELD_EXPRESSION ? 0.2f : 0.0f;
  const float delta = 0.18f + randomUnit(rng) * 0.12f;
  const float target = current >= 0.65f ? current - delta : current + delta;
  return kessho::product::internal::clampFloat(target, min_value, 1.0f);
}

void commitManualValueMutation(const LaneState& original, LaneState& lane, uint32_t flags, int32_t write_offset, uint32_t bar_index, EvolveRandom& rng) {
  uint32_t active_fields[8]{};
  const uint32_t count = collectActiveFields(flags, kValueFields, 3u, active_fields);
  if (count == 0u) {
    return;
  }
  for (uint32_t i = 0u; i < count; ++i) {
    const uint32_t field = active_fields[i];
    if (laneFieldValuesDiffer(original, lane, field)) {
      continue;
    }
    const uint32_t steps = fieldStepCount(lane, field);
    const uint32_t step = write_offset == 0
        ? static_cast<uint32_t>(std::floor(randomUnit(rng) * static_cast<float>(steps))) % steps
        : writePosition(steps, write_offset, bar_index);
    setLaneValue(lane, field, step, committedManualValue(laneValue(lane, field, step), field, rng));
  }
}

uint32_t randomOtherDirection(uint32_t current, EvolveRandom& rng) {
  const uint32_t safe = current > KESSHO_PRODUCT_SUBLANE_DIRECTION_PINGPONG
      ? KESSHO_PRODUCT_SUBLANE_DIRECTION_FORWARD
      : current;
  return (safe + 1u + static_cast<uint32_t>(std::floor(randomUnit(rng) * 2.0f))) % 3u;
}

float mutateRatchetHomeBiased(float current, float home, float intensity, EvolveRandom& rng) {
  if (current > home) {
    const float revert_chance = 0.60f + (1.0f - intensity) * 0.15f;
    if (chance(rng, revert_chance)) {
      return std::max(home, current - 1.0f);
    }
  }
  const float roll = randomUnit(rng);
  const float i2 = intensity * intensity;
  if (roll < 0.04f * i2) return 4.0f;
  if (roll < 0.15f * i2) return 3.0f;
  if (roll < 0.31f * intensity) return 2.0f;
  return home;
}

float mutateContinuousValueDrift(
    float current,
    float min_value,
    float max_value,
    float drift_scale,
    float intensity,
    bool strict,
    EvolveRandom& rng) {
  if (strict && chance(rng, 0.2f * intensity)) {
    return min_value + randomUnit(rng) * (max_value - min_value);
  }
  return kessho::product::internal::clampFloat(drift(current, drift_scale * intensity, rng), min_value, max_value);
}

uint32_t writeSequencerPitchScaleIntervals(uint32_t scale_id, int intervals[12]) {
  static constexpr int chromatic[] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11};
  static constexpr int major[] = {0, 2, 4, 5, 7, 9, 11};
  static constexpr int minor[] = {0, 2, 3, 5, 7, 8, 10};
  static constexpr int dorian[] = {0, 2, 3, 5, 7, 9, 10};
  static constexpr int phrygian[] = {0, 1, 3, 5, 7, 8, 10};
  static constexpr int lydian[] = {0, 2, 4, 6, 7, 9, 11};
  static constexpr int mixolydian[] = {0, 2, 4, 5, 7, 9, 10};
  static constexpr int locrian[] = {0, 1, 3, 5, 6, 8, 10};
  static constexpr int pentatonic[] = {0, 2, 4, 7, 9};
  static constexpr int min_penta[] = {0, 3, 5, 7, 10};
  static constexpr int blues[] = {0, 3, 5, 6, 7, 10};
  static constexpr int harmonic_minor[] = {0, 2, 3, 5, 7, 8, 11};
  static constexpr int melodic_minor[] = {0, 2, 3, 5, 7, 9, 11};
  static constexpr int whole_tone[] = {0, 2, 4, 6, 8, 10};
  static constexpr int diminished[] = {0, 2, 3, 5, 6, 8, 9, 11};
  static constexpr int augmented[] = {0, 3, 4, 7, 8, 11};
  static constexpr int hungarian_minor[] = {0, 2, 3, 6, 7, 8, 11};
  static constexpr int japanese[] = {0, 1, 5, 7, 8};
  static constexpr int arabic[] = {0, 1, 4, 5, 7, 8, 11};
  const auto write = [&](const int* values, uint32_t count) {
    for (uint32_t i = 0u; i < count && i < 12u; ++i) {
      intervals[i] = values[i];
    }
    return std::min(count, 12u);
  };
  switch (scale_id) {
    case 0u: return write(chromatic, 12u);
    case 2u: return write(minor, 7u);
    case 3u: return write(dorian, 7u);
    case 4u: return write(phrygian, 7u);
    case 5u: return write(lydian, 7u);
    case 6u: return write(mixolydian, 7u);
    case 7u: return write(locrian, 7u);
    case 8u: return write(pentatonic, 5u);
    case 9u: return write(min_penta, 5u);
    case 10u: return write(blues, 6u);
    case 11u: return write(harmonic_minor, 7u);
    case 12u: return write(melodic_minor, 7u);
    case 13u: return write(whole_tone, 6u);
    case 14u: return write(diminished, 8u);
    case 15u: return write(augmented, 6u);
    case 16u: return write(hungarian_minor, 7u);
    case 17u: return write(japanese, 5u);
    case 18u: return write(arabic, 7u);
    case 1u:
    default:
      return write(major, 7u);
  }
}

int32_t scaleDegreeForSemitone(float semitone, const int* intervals, uint32_t interval_count) {
  if (interval_count == 0u) {
    return 0;
  }
  const int32_t rounded = static_cast<int32_t>(std::lround(semitone));
  const int32_t octave = static_cast<int32_t>(std::floor(static_cast<float>(rounded) / 12.0f));
  const int32_t pitch_class = ((rounded % 12) + 12) % 12;
  uint32_t best_degree = 0u;
  int32_t best_distance = 128;
  for (uint32_t degree = 0u; degree < interval_count; ++degree) {
    const int32_t distance = std::abs(intervals[degree] - pitch_class);
    if (distance < best_distance) {
      best_distance = distance;
      best_degree = degree;
    }
  }
  return octave * static_cast<int32_t>(interval_count) + static_cast<int32_t>(best_degree);
}

float semitoneForScaleDegree(int32_t degree, const int* intervals, uint32_t interval_count) {
  if (interval_count == 0u) {
    return 0.0f;
  }
  const int32_t octave = static_cast<int32_t>(std::floor(static_cast<float>(degree) / static_cast<float>(interval_count)));
  const int32_t index = ((degree % static_cast<int32_t>(interval_count)) + static_cast<int32_t>(interval_count)) % static_cast<int32_t>(interval_count);
  return static_cast<float>(octave * 12 + intervals[index]);
}

float gravityPullLaneValue(const LaneState& lane, bool drum_lane, uint32_t field, float current, float target) {
  if (field != KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE) {
    return current + (target - current) * 0.2f;
  }

  int scale_intervals[12]{};
  const uint32_t scale_count = writeSequencerPitchScaleIntervals(lane.pitch_scale_id, scale_intervals);
  const float root = drum_lane ? lane.midi_note : lane.pitch_root;
  if (!drum_lane && lane.pitch_mode == kSequencerPitchModeNotes && scale_count > 0u) {
    const int32_t current_degree = scaleDegreeForSemitone(current - root, scale_intervals, scale_count);
    const int32_t target_degree = scaleDegreeForSemitone(target - root, scale_intervals, scale_count);
    const int32_t pulled_degree = static_cast<int32_t>(std::lround(
        static_cast<float>(current_degree) + static_cast<float>(target_degree - current_degree) * 0.2f));
    return kessho::product::internal::clampFloat(
        root + semitoneForScaleDegree(pulled_degree, scale_intervals, scale_count),
        0.0f,
        127.0f);
  }

  const float current_offset = current - root;
  const float target_offset = target - root;
  return kessho::product::internal::clampFloat(
      root + std::round(current_offset + (target_offset - current_offset) * 0.2f),
      0.0f,
      127.0f);
}

void applySynthNoteRangeBounds(LaneState& lane, float min_note, float max_note) {
  float next_min = min_note;
  float next_max = max_note;
  if (next_max - next_min < 2.0f) {
    const float mid = (next_min + next_max) * 0.5f;
    next_min = std::floor(mid - 1.0f);
    next_max = std::ceil(mid + 1.0f);
  }
  next_min = kessho::product::internal::clampFloat(std::round(next_min), 36.0f, 94.0f);
  next_max = kessho::product::internal::clampFloat(std::round(next_max), next_min + 2.0f, 96.0f);
  lane.note_range_min = next_min;
  lane.note_range_max = next_max;
  lane.midi_note = (next_min + next_max) * 0.5f;
}

bool evolveSynthNoteRangeWalk(LaneState& lane, const LaneEvolveHomeState& home, float intensity, EvolveRandom& rng) {
  if (lane.pitch_mode != kSequencerPitchModeNoteRange || !chance(rng, 0.6f * intensity)) {
    return false;
  }

  float next_min = lane.note_range_min;
  float next_max = lane.note_range_max;
  const int32_t shift_step = intensity > 0.5f && randomUnit(rng) < intensity ? 2 : 1;
  const int32_t shift = randomUnit(rng) < 0.5f ? -shift_step : shift_step;
  next_min += static_cast<float>(shift);
  next_max += static_cast<float>(shift);

  if (intensity > 0.6f && randomUnit(rng) < intensity - 0.4f) {
    const float widen = intensity > 0.8f && randomUnit(rng) < intensity ? 2.0f : 1.0f;
    next_min -= widen;
    next_max += widen;
  }

  if (next_max - next_min < 2.0f) {
    const float mid = (next_min + next_max) * 0.5f;
    next_min = std::floor(mid - 1.0f);
    next_max = std::ceil(mid + 1.0f);
  }

  const float home_mid = (home.note_range_min + home.note_range_max) * 0.5f;
  const float next_mid = (next_min + next_max) * 0.5f;
  if (std::fabs(next_mid - home_mid) > 12.0f) {
    const float correction = next_mid > home_mid
        ? next_mid - home_mid - 12.0f
        : next_mid - home_mid + 12.0f;
    const float rounded_correction = std::round(correction);
    next_min -= rounded_correction;
    next_max -= rounded_correction;
  }

  const float previous_min = lane.note_range_min;
  const float previous_max = lane.note_range_max;
  applySynthNoteRangeBounds(lane, next_min, next_max);
  return std::fabs(lane.note_range_min - previous_min) > 0.001f ||
      std::fabs(lane.note_range_max - previous_max) > 0.001f;
}

void copyLaneHome(LaneEvolveHomeState& home, const LaneState& lane) {
  home.captured = true;
  home.step_count = lane.step_count;
  home.fill_count = lane.fill_count;
  home.rotation = lane.rotation;
  home.swing = lane.swing;
  home.probability = lane.probability;
  home.ratchet = lane.ratchet;
  home.midi_note = lane.midi_note;
  home.note_range_min = lane.note_range_min;
  home.note_range_max = lane.note_range_max;
  home.expression = lane.expression;
  home.morph = lane.morph;
  home.distance = lane.distance;
  home.step_override_set_low = lane.step_override_set_low;
  home.step_override_set_high = lane.step_override_set_high;
  home.step_override_value_low = lane.step_override_value_low;
  home.step_override_value_high = lane.step_override_value_high;
  home.probability_override_set_low = lane.probability_override_set_low;
  home.probability_override_set_high = lane.probability_override_set_high;
  home.ratchet_override_set_low = lane.ratchet_override_set_low;
  home.ratchet_override_set_high = lane.ratchet_override_set_high;
  home.midi_note_override_set_low = lane.midi_note_override_set_low;
  home.midi_note_override_set_high = lane.midi_note_override_set_high;
  home.expression_override_set_low = lane.expression_override_set_low;
  home.expression_override_set_high = lane.expression_override_set_high;
  home.morph_override_set_low = lane.morph_override_set_low;
  home.morph_override_set_high = lane.morph_override_set_high;
  home.distance_override_set_low = lane.distance_override_set_low;
  home.distance_override_set_high = lane.distance_override_set_high;
  for (uint32_t step = 0u; step < 64u; ++step) {
    home.probability_overrides[step] = lane.probability_overrides[step];
    home.ratchet_overrides[step] = lane.ratchet_overrides[step];
    home.midi_note_overrides[step] = lane.midi_note_overrides[step];
    home.expression_overrides[step] = lane.expression_overrides[step];
    home.morph_overrides[step] = lane.morph_overrides[step];
    home.distance_overrides[step] = lane.distance_overrides[step];
  }
  for (uint32_t field = 0u; field < 8u; ++field) {
    home.step_value_configs[field] = lane.step_value_configs[field];
  }
}

}

void KesshoProductEngine::captureSequencerEvolveHome(LaneState& lane) {
  if (!lane.evolve_home.captured) {
    copyLaneHome(lane.evolve_home, lane);
  }
}

void KesshoProductEngine::clearSequencerEvolveHome(LaneState& lane) {
  lane.evolve_home = {};
}

void KesshoProductEngine::applyParityEvolveSequencerLaneEvent(const KesshoProductEvent& event) {
  uint32_t lane_count = 0u;
  LaneState* lanes = sequencerLanesForEvent(event, lane_count);
  if (lanes == nullptr) {
    return;
  }
  if (event.index >= lane_count) {
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_INVALID_SEQUENCER_LANE;
    return;
  }

  LaneState& lane = lanes[event.index];
  if (lane.step_count == 0u) {
    telemetry.last_error_code = KESSHO_PRODUCT_OK;
    return;
  }

  captureSequencerEvolveHome(lane);
  const LaneState original = lane;
  const LaneEvolveHomeState& home = lane.evolve_home;
  const uint32_t flags = event.flags;
  const bool drum_lane = event.target_id == KESSHO_PRODUCT_SEQUENCER_DRUM;
  const float intensity = clampFloat(event.value <= 0.0f ? 1.0f : event.value, 0.0f, 1.0f);
  const bool rng_stream = hasFlag(flags, KESSHO_PRODUCT_EVOLVE_RNG_STREAM);
  const float tension = eventEffectiveTension(event, harmony.tension, rng_stream);
  const bool strict = hasFlag(flags, KESSHO_PRODUCT_EVOLVE_MUTATION_STRICT);
  const int32_t write_offset = static_cast<int32_t>(std::lround(event.value3));
  const uint32_t bar_index = static_cast<uint32_t>(std::lround(std::max(0.0f, event.value4)));
  const uint32_t event_seed = rng_stream
      ? event.param_id
      : static_cast<uint32_t>(std::lround(std::max(0.0f, event.value2)));
  EvolveRandom rng{};
  rng.stream = rng_stream;
  if (rng_stream) {
    if (!sequencer_evolve_rng_stream_initialized || sequencer_evolve_rng_stream_seed != event_seed) {
      sequencer_evolve_rng_stream_seed = event_seed;
      sequencer_evolve_rng_stream_state = event_seed;
      sequencer_evolve_rng_stream_initialized = true;
    }
    rng.state = sequencer_evolve_rng_stream_state;
  } else {
    rng.state = hashU32(
        rng_seed ^
        rng_state ^
        evolution_state ^
        lane.seed ^
        event_seed ^
        (event.target_id * 16777619u) ^
        (event.index * 2246822519u));
  }

  if (hasFlag(flags, KESSHO_PRODUCT_EVOLVE_METHOD_ROTATE_DRIFT) &&
      drum_lane &&
      tensionGate(rng, 0.4f + 0.4f * intensity, tension, 0.4f)) {
    const int32_t dir = randomUnit(rng) < 0.5f ? 1 : -1;
    const int32_t steps = static_cast<int32_t>(std::max(1u, lane.step_count));
    lane.rotation = (lane.rotation + dir) % steps;
    if (lane.rotation < 0) {
      lane.rotation += steps;
    }
  }

  if (hasFlag(flags, KESSHO_PRODUCT_EVOLVE_METHOD_SWING_DRIFT) && tensionGate(rng, 1.0f, tension, 0.3f)) {
    lane.swing = clampFloat(drift(lane.swing, 0.03f * intensity, rng), 0.0f, 0.75f);
  }

  if (hasFlag(flags, KESSHO_PRODUCT_EVOLVE_METHOD_PROB_DRIFT) &&
      fieldEnabled(flags, KESSHO_PRODUCT_STEP_FIELD_PROBABILITY) &&
      tensionGate(rng, 1.0f, tension, 0.3f)) {
    const uint32_t steps = fieldStepCount(lane, KESSHO_PRODUCT_STEP_FIELD_PROBABILITY);
    for (uint32_t step = 0u; step < steps; ++step) {
      if (!writeAllows(steps, step, write_offset, bar_index)) {
        continue;
      }
      if (drum_lane && !manualMaskHit(lane, step % std::max(1u, lane.step_count))) {
        continue;
      }
      setLaneValue(lane, KESSHO_PRODUCT_STEP_FIELD_PROBABILITY, step, clampFloat(drift(laneValue(lane, KESSHO_PRODUCT_STEP_FIELD_PROBABILITY, step), 0.15f * intensity, rng), 0.2f, 1.0f));
    }
  }

  if (hasFlag(flags, KESSHO_PRODUCT_EVOLVE_METHOD_GHOST_NOTES) &&
      drum_lane &&
      fieldEnabled(flags, KESSHO_PRODUCT_STEP_FIELD_EXPRESSION) &&
      fieldEnabled(flags, KESSHO_PRODUCT_STEP_FIELD_DISTANCE) &&
      tensionGate(rng, 0.55f * intensity, tension, 0.6f)) {
    uint32_t inactive[64]{};
    uint32_t inactive_count = 0u;
    const uint32_t steps = clampU32(lane.step_count, 1u, 64u);
    for (uint32_t step = 0u; step < steps; ++step) {
      if (!manualMaskHit(lane, step) && !maskHas(lane.step_override_set_low, lane.step_override_set_high, step)) {
        inactive[inactive_count++] = step;
      }
    }
    uint32_t count = std::min(3u, static_cast<uint32_t>(std::ceil(static_cast<float>(inactive_count) * 0.25f)));
    while (count > 0u && inactive_count > 0u) {
      const uint32_t pick = static_cast<uint32_t>(std::floor(randomUnit(rng) * static_cast<float>(inactive_count))) % inactive_count;
      const uint32_t step = inactive[pick];
      inactive[pick] = inactive[inactive_count - 1u];
      --inactive_count;
      --count;
      setStepOverride(lane, step, true);
      setLaneValue(lane, KESSHO_PRODUCT_STEP_FIELD_PROBABILITY, step, 0.15f + randomUnit(rng) * 0.2f);
      setLaneValue(lane, KESSHO_PRODUCT_STEP_FIELD_EXPRESSION, step, 0.2f + randomUnit(rng) * 0.2f);
      setLaneValue(lane, KESSHO_PRODUCT_STEP_FIELD_DISTANCE, step, 0.6f + randomUnit(rng) * 0.2f);
    }
  }

  if (hasFlag(flags, KESSHO_PRODUCT_EVOLVE_METHOD_RATCHET_SPRAY) &&
      fieldEnabled(flags, KESSHO_PRODUCT_STEP_FIELD_RATCHET) &&
      tensionGate(rng, 0.4f * intensity, tension, 0.6f)) {
    const uint32_t steps = fieldStepCount(lane, KESSHO_PRODUCT_STEP_FIELD_RATCHET);
    uint32_t step = static_cast<uint32_t>(std::floor(randomUnit(rng) * static_cast<float>(steps))) % steps;
    if (drum_lane) {
      uint32_t active[64]{};
      uint32_t active_count = 0u;
      for (uint32_t i = 0u; i < std::min(steps, lane.step_count); ++i) {
        if (manualMaskHit(lane, i)) {
          active[active_count++] = i;
        }
      }
      if (active_count > 0u) {
        step = active[static_cast<uint32_t>(std::floor(randomUnit(rng) * static_cast<float>(active_count))) % active_count];
      }
    }
    if (writeAllows(steps, step, write_offset, bar_index)) {
      const float current = laneValue(lane, KESSHO_PRODUCT_STEP_FIELD_RATCHET, step);
      const float home_value = homeValue(home, KESSHO_PRODUCT_STEP_FIELD_RATCHET, step, 1.0f);
      setLaneValue(lane, KESSHO_PRODUCT_STEP_FIELD_RATCHET, step, mutateRatchetHomeBiased(current, home_value, intensity, rng));
    }
  }

  if (hasFlag(flags, KESSHO_PRODUCT_EVOLVE_METHOD_HIT_DRIFT) &&
      drum_lane &&
      tensionGate(rng, 0.45f * intensity, tension, 0.7f)) {
    const uint32_t step_size = intensity > 0.85f && randomUnit(rng) < 0.4f ? 2u : 1u;
    const int32_t dir = randomUnit(rng) < 0.5f ? -static_cast<int32_t>(step_size) : static_cast<int32_t>(step_size);
    const uint32_t max_hits = std::max(1u, lane.step_count - 1u);
    const uint32_t next_hits = clampU32(static_cast<uint32_t>(std::max(1, static_cast<int32_t>(lane.fill_count) + dir)), 1u, max_hits);
    if (next_hits != lane.fill_count) {
      lane.fill_count = next_hits;
      lane.step_override_set_low = 0u;
      lane.step_override_set_high = 0u;
      lane.step_override_value_low = 0u;
      lane.step_override_value_high = 0u;
    }
  }

  if (hasFlag(flags, KESSHO_PRODUCT_EVOLVE_METHOD_PITCH_WALK) &&
      !drum_lane &&
      fieldEnabled(flags, KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE) &&
      lane.pitch_mode == kSequencerPitchModeNoteRange) {
    evolveSynthNoteRangeWalk(lane, home, intensity, rng);
  }

  if (hasFlag(flags, KESSHO_PRODUCT_EVOLVE_METHOD_PITCH_WALK) &&
      fieldEnabled(flags, KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE) &&
      (drum_lane || lane.pitch_mode != kSequencerPitchModeNoteRange) &&
      chance(rng, (drum_lane ? 0.55f : 0.6f) * intensity)) {
    const uint32_t steps = fieldStepCount(lane, KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE);
    const uint32_t walk_count = (!drum_lane && intensity > 0.7f)
        ? (randomUnit(rng) < intensity ? 2u : 1u)
        : (drum_lane && intensity > 0.8f ? (randomUnit(rng) < 0.5f ? 2u : 1u) : 1u);
    int scale_intervals[12]{};
    const uint32_t scale_count = writeSequencerPitchScaleIntervals(lane.pitch_scale_id, scale_intervals);
    const bool scale_degree_walk = lane.pitch_mode == kSequencerPitchModeNotes && scale_count > 0u;
    for (uint32_t walk = 0u; walk < walk_count; ++walk) {
      const uint32_t step = static_cast<uint32_t>(std::floor(randomUnit(rng) * static_cast<float>(steps))) % steps;
      const float current = laneValue(lane, KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE, step);
      const float home_value = homeValue(home, KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE, step, lane.midi_note);
      float next_value = current;
      bool allowed_home_distance = false;
      if (scale_degree_walk) {
        const float root = drum_lane ? lane.midi_note : lane.pitch_root;
        const int32_t current_degree = scaleDegreeForSemitone(current - root, scale_intervals, scale_count);
        const int32_t home_degree = scaleDegreeForSemitone(home_value - root, scale_intervals, scale_count);
        const int32_t direction = randomUnit(rng) < 0.5f ? -1 : 1;
        const int32_t next_degree = current_degree + direction;
        next_value = kessho::product::internal::clampFloat(root + semitoneForScaleDegree(next_degree, scale_intervals, scale_count), 0.0f, 127.0f);
        allowed_home_distance = drum_lane
            ? std::fabs((next_value - root) - (home_value - root)) <= 14.0f
            : std::abs(next_degree - home_degree) <= 7;
      } else {
        const int32_t width = !drum_lane && intensity > 0.6f && randomUnit(rng) < intensity ? 2 : 1;
        const float direction = randomUnit(rng) < 0.5f ? -static_cast<float>(width) : static_cast<float>(width);
        next_value = current + direction;
        allowed_home_distance = std::fabs(next_value - home_value) <= 5.0f;
      }
      if (writeAllows(steps, step, write_offset, bar_index) && allowed_home_distance) {
        setLaneValue(lane, KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE, step, next_value);
      }
    }
  }

  if (hasFlag(flags, KESSHO_PRODUCT_EVOLVE_METHOD_VALUE_DRIFT) && tensionGate(rng, 1.0f, tension, 0.3f)) {
    for (const uint32_t field : kValueFields) {
      if (!fieldEnabled(flags, field)) {
        continue;
      }
      const uint32_t steps = fieldStepCount(lane, field);
      const float min_value = field == KESSHO_PRODUCT_STEP_FIELD_EXPRESSION ? 0.2f : 0.0f;
      const float drift_scale = field == KESSHO_PRODUCT_STEP_FIELD_EXPRESSION ? 0.08f : field == KESSHO_PRODUCT_STEP_FIELD_MORPH ? 0.05f : 0.06f;
      for (uint32_t step = 0u; step < steps; ++step) {
        if (writeAllows(steps, step, write_offset, bar_index)) {
          setLaneValue(lane, field, step, mutateContinuousValueDrift(laneValue(lane, field, step), min_value, 1.0f, drift_scale, intensity, strict, rng));
        }
      }
    }
  }

  if (hasFlag(flags, KESSHO_PRODUCT_EVOLVE_METHOD_VALUE_SCRAMBLE) &&
      intensity > 0.4f &&
      tensionGate(rng, 0.3f * intensity, tension, 0.5f)) {
    const uint32_t swaps = std::max(2u, static_cast<uint32_t>(std::floor(intensity * 6.0f)));
    for (const uint32_t field : kValueFields) {
      if (!fieldEnabled(flags, field) || randomUnit(rng) < 0.5f) {
        continue;
      }
      const uint32_t steps = fieldStepCount(lane, field);
      for (uint32_t swap = 0u; swap < swaps; ++swap) {
        const uint32_t a = static_cast<uint32_t>(std::floor(randomUnit(rng) * static_cast<float>(steps))) % steps;
        const uint32_t b = static_cast<uint32_t>(std::floor(randomUnit(rng) * static_cast<float>(steps))) % steps;
        if (a != b) {
          const float va = laneValue(lane, field, a);
          const float vb = laneValue(lane, field, b);
          setLaneValue(lane, field, a, vb);
          setLaneValue(lane, field, b, va);
        }
      }
    }
  }

  if (hasFlag(flags, KESSHO_PRODUCT_EVOLVE_METHOD_VALUE_WIDEN) &&
      intensity > 0.6f &&
      tensionGate(rng, 0.15f * intensity, tension, 0.7f)) {
    for (const uint32_t field : kValueFields) {
      if (!fieldEnabled(flags, field) || randomUnit(rng) < 0.5f) {
        continue;
      }
      const uint32_t steps = fieldStepCount(lane, field);
      const float min_value = field == KESSHO_PRODUCT_STEP_FIELD_EXPRESSION ? 0.2f : 0.0f;
      const float center = (min_value + 1.0f) * 0.5f;
      for (uint32_t step = 0u; step < steps; ++step) {
        if (randomUnit(rng) <= 0.6f) {
          const float value = laneValue(lane, field, step);
          setLaneValue(lane, field, step, clampFloat(center + (value - center) * (1.0f + intensity * 0.5f), min_value, 1.0f));
        }
      }
    }
  }

  if (hasFlag(flags, KESSHO_PRODUCT_EVOLVE_METHOD_SUBLANE_LENGTH_DRIFT) && intensity > 0.5f && chance(rng, 0.25f * intensity)) {
    uint32_t active_fields[8]{};
    const uint32_t count = collectActiveFields(flags, kLengthDirectionFields, 4u, active_fields);
    if (count > 0u) {
      const uint32_t field = active_fields[static_cast<uint32_t>(std::floor(randomUnit(rng) * static_cast<float>(count))) % count];
      StepValueSubLaneConfig& config = lane.step_value_configs[fieldId(field)];
      const uint32_t current_steps = config.enabled && config.steps > 0u ? config.steps : lane.step_count;
      const int32_t dir = randomUnit(rng) < 0.5f ? -1 : 1;
      config.enabled = true;
      config.direction = config.direction > KESSHO_PRODUCT_SUBLANE_DIRECTION_PINGPONG ? KESSHO_PRODUCT_SUBLANE_DIRECTION_FORWARD : config.direction;
      config.steps = clampU32(static_cast<uint32_t>(std::max(drum_lane ? 1 : 2, static_cast<int32_t>(current_steps) + dir)), drum_lane ? 1u : 2u, 16u);
    }
  }

  if (hasFlag(flags, KESSHO_PRODUCT_EVOLVE_METHOD_SUBLANE_DIRECTION_FLIP) &&
      intensity > 0.8f &&
      tensionGate(rng, 0.08f * intensity, tension, 0.8f)) {
    uint32_t active_fields[8]{};
    const uint32_t count = collectActiveFields(flags, kLengthDirectionFields, 4u, active_fields);
    if (count > 0u) {
      const uint32_t field = active_fields[static_cast<uint32_t>(std::floor(randomUnit(rng) * static_cast<float>(count))) % count];
      StepValueSubLaneConfig& config = lane.step_value_configs[fieldId(field)];
      config.enabled = true;
      config.steps = config.steps == 0u ? lane.step_count : config.steps;
      config.direction = randomOtherDirection(config.direction, rng);
    }
  }

  if (hasFlag(flags, KESSHO_PRODUCT_EVOLVE_METHOD_TRIGGER_TOGGLE) &&
      !drum_lane &&
      intensity > 0.3f &&
      tensionGate(rng, 0.55f * intensity, tension, 0.7f)) {
    const uint32_t steps = clampU32(lane.step_count, 1u, 64u);
    const uint32_t count = std::max(1u, static_cast<uint32_t>(std::floor((intensity - 0.3f) * 5.0f)));
    for (uint32_t i = 0u; i < count; ++i) {
      const uint32_t step = static_cast<uint32_t>(std::floor(randomUnit(rng) * static_cast<float>(steps))) % steps;
      if (!maskHas(lane.step_override_set_low, lane.step_override_set_high, step)) {
        setStepOverride(lane, step, randomUnit(rng) < 0.5f);
      } else if (randomUnit(rng) < 0.3f) {
        clearStepOverride(lane, step);
      } else {
        setStepOverride(lane, step, !maskHas(lane.step_override_value_low, lane.step_override_value_high, step));
      }
    }
  }

  for (const uint32_t field : kValueFields) {
    if (fieldEnabled(flags, field)) {
      restoreMaskedValues(original, lane, field, write_offset, bar_index);
    }
  }
  if (fieldEnabled(flags, KESSHO_PRODUCT_STEP_FIELD_PROBABILITY)) {
    restoreMaskedValues(original, lane, KESSHO_PRODUCT_STEP_FIELD_PROBABILITY, write_offset, bar_index);
  }
  if (fieldEnabled(flags, KESSHO_PRODUCT_STEP_FIELD_RATCHET)) {
    restoreMaskedValues(original, lane, KESSHO_PRODUCT_STEP_FIELD_RATCHET, write_offset, bar_index);
  }
  if (fieldEnabled(flags, KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE)) {
    restoreMaskedValues(original, lane, KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE, write_offset, bar_index);
  }

  if (hasFlag(flags, KESSHO_PRODUCT_EVOLVE_MANUAL_COMMIT)) {
    commitManualValueMutation(original, lane, flags, write_offset, bar_index, rng);
  }

  if (home.captured && chance(rng, 0.15f * (1.2f - intensity))) {
    lane.swing += (home.swing - lane.swing) * 0.3f;
    if (drum_lane && lane.rotation != home.rotation) {
      const int32_t step = lane.rotation > home.rotation ? -1 : 1;
      const int32_t steps = static_cast<int32_t>(std::max(1u, lane.step_count));
      lane.rotation = (lane.rotation + step) % steps;
      if (lane.rotation < 0) {
        lane.rotation += steps;
      }
    }
  }

  if (home.captured && chance(rng, 0.15f * (1.2f - intensity))) {
    uint32_t active_fields[8]{};
    const uint32_t count = collectActiveFields(flags, kLengthDirectionFields, 4u, active_fields);
    if (count > 0u) {
      const uint32_t field = active_fields[static_cast<uint32_t>(std::floor(randomUnit(rng) * static_cast<float>(count))) % count];
      if (drum_lane || lane.pitch_mode != kSequencerPitchModeNoteRange || field != KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE) {
        const uint32_t steps = fieldStepCount(lane, field);
        for (uint32_t step = 0u; step < steps; ++step) {
          const float current = laneValue(lane, field, step);
          const float target = homeValue(home, field, step, current);
          setLaneValue(lane, field, step, gravityPullLaneValue(lane, drum_lane, field, current, target));
        }
      }
    }
  }

  if (home.captured && chance(rng, 0.15f * (1.2f - intensity))) {
    uint32_t active_fields[8]{};
    const uint32_t count = collectActiveFields(flags, kLengthDirectionFields, 4u, active_fields);
    if (count > 0u) {
      const uint32_t field = active_fields[static_cast<uint32_t>(std::floor(randomUnit(rng) * static_cast<float>(count))) % count];
      const uint32_t id = fieldId(field);
      StepValueSubLaneConfig& config = lane.step_value_configs[id];
      const StepValueSubLaneConfig& home_config = home.step_value_configs[id];
      if (config.enabled && home_config.enabled && config.steps != home_config.steps) {
        config.steps += config.steps > home_config.steps ? -1u : 1u;
      }
      if (config.enabled && home_config.enabled && config.direction != home_config.direction) {
        config.direction = home_config.direction;
      }
    }
  }

  if (rng.stream) {
    sequencer_evolve_rng_stream_state = rng.state;
  }
  rng_state = hashU32(rng_state ^ rng.state ^ 0x9e3779b9u);
  if (rng_state == 0u) {
    rng_state = rng_seed == 0u ? 1u : rng_seed;
  }
  markSequencerUiStateChanged(event.target_id, event.index, KESSHO_PRODUCT_SEQUENCER_UI_CHANGE_DICE);
  telemetry.last_error_code = KESSHO_PRODUCT_OK;
}
