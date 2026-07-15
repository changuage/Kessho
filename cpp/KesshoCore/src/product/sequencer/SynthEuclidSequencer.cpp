#include "../KesshoProductEngineInternal.h"

#include <limits>

namespace {

float selectedDrumVoiceMidi(const kessho::product::internal::LaneState& lane, uint64_t hit_count, uint32_t seed) {
  const uint32_t mask = lane.drum_voice_mask;
  if (mask == 0u) {
    return lane.midi_note;
  }
  uint32_t enabled_count = 0u;
  for (uint32_t voice = 0u; voice < DRUM_NUM_VOICE_TYPES; ++voice) {
    if ((mask & (1u << voice)) != 0u) {
      ++enabled_count;
    }
  }
  if (enabled_count == 0u) {
    return lane.midi_note;
  }
  const uint32_t selected = kessho::product::internal::hashU32(
      seed ^ lane.seed ^ static_cast<uint32_t>(hit_count * 747796405ull) ^ 0x9e3779b9u) % enabled_count;
  uint32_t seen = 0u;
  for (uint32_t voice = 0u; voice < DRUM_NUM_VOICE_TYPES; ++voice) {
    if ((mask & (1u << voice)) == 0u) {
      continue;
    }
    if (seen == selected) {
      return kessho::product::internal::midiNoteForDrumVoice(voice);
    }
    ++seen;
  }
  return lane.midi_note;
}

bool sequencerStepFieldActive(
    const KesshoProductEngine& engine,
    const kessho::product::internal::LaneState& lane,
    uint32_t field,
    bool evolution_active) {
  const uint32_t field_id = engine.stepFieldId(field);
  const bool config_enabled =
      engine.validStepFieldId(field_id) &&
      lane.step_value_configs[field_id].enabled;
  switch (field) {
    case KESSHO_PRODUCT_STEP_FIELD_MORPH:
      return config_enabled ||
          evolution_active ||
          lane.morph_override_set_low != 0u ||
          lane.morph_override_set_high != 0u ||
          lane.morph_range_set_low != 0u ||
          lane.morph_range_set_high != 0u;
    case KESSHO_PRODUCT_STEP_FIELD_DISTANCE:
      return config_enabled ||
          evolution_active ||
          lane.distance_override_set_low != 0u ||
          lane.distance_override_set_high != 0u ||
          lane.distance_range_set_low != 0u ||
          lane.distance_range_set_high != 0u;
    case KESSHO_PRODUCT_STEP_FIELD_EXPRESSION:
      return config_enabled ||
          evolution_active ||
          lane.expression_override_set_low != 0u ||
          lane.expression_override_set_high != 0u ||
          lane.expression_range_set_low != 0u ||
          lane.expression_range_set_high != 0u;
    default:
      return config_enabled;
  }
}

bool sequencerTargetSourceEnabled(const KesshoProductEngine& engine, uint32_t source_id) {
  return source_id >= 1u &&
      source_id <= kessho::product::internal::kSourceCount &&
      engine.sources[source_id - 1u].enabled;
}

uint32_t relativeStepId(const kessho::product::internal::LaneState& lane, int64_t relative_step) {
  const int64_t steps = static_cast<int64_t>(std::max(1u, lane.step_count));
  int64_t step = relative_step % steps;
  if (step < 0) {
    step += steps;
  }
  return static_cast<uint32_t>(step);
}

double sequencerAnchorSample(
    const kessho::product::internal::LaneState& lane,
    int64_t relative_step,
    double samples_per_step,
    double swing_samples) {
  double sample = static_cast<double>(lane.sequencer_start_sample_frame) +
      static_cast<double>(relative_step) * samples_per_step;
  if ((relativeStepId(lane, relative_step) & 1u) != 0u) {
    sample += swing_samples;
  }
  return sample;
}

uint64_t roundedSampleFrame(double sample) {
  if (!std::isfinite(sample) || sample <= 0.0) {
    return 0u;
  }
  return static_cast<uint64_t>(std::llround(sample));
}

uint32_t activeTriggerCount(
    const KesshoProductEngine& engine,
    const kessho::product::internal::LaneState& lane) {
  const uint32_t steps = std::max(1u, lane.step_count);
  uint32_t count = 0u;
  for (uint32_t step = 0u; step < steps; ++step) {
    if (engine.manualMaskHit(lane, step)) {
      ++count;
    }
  }
  return count;
}

uint64_t activeHitOrdinalForRelativeStep(
    const KesshoProductEngine& engine,
    const kessho::product::internal::LaneState& lane,
    int64_t relative_step,
    uint32_t active_count) {
  if (relative_step <= 0 || active_count == 0u) {
    return 0u;
  }
  const uint32_t steps = std::max(1u, lane.step_count);
  const uint64_t cycles = static_cast<uint64_t>(relative_step / static_cast<int64_t>(steps));
  const uint32_t step_id = static_cast<uint32_t>(relative_step % static_cast<int64_t>(steps));
  uint64_t ordinal = cycles * static_cast<uint64_t>(active_count);
  for (uint32_t step = 0u; step < step_id; ++step) {
    if (engine.manualMaskHit(lane, step)) {
      ++ordinal;
    }
  }
  return ordinal;
}

int64_t adjacentActiveRelativeStep(
    const KesshoProductEngine& engine,
    const kessho::product::internal::LaneState& lane,
    int64_t relative_step,
    int32_t direction) {
  const uint32_t steps = std::max(1u, lane.step_count);
  for (uint32_t offset = 1u; offset <= steps; ++offset) {
    const int64_t candidate = relative_step + static_cast<int64_t>(direction) * static_cast<int64_t>(offset);
    if (engine.manualMaskHit(lane, relativeStepId(lane, candidate))) {
      return candidate;
    }
  }
  return relative_step;
}

bool nudgeSchedulingActive(
    const KesshoProductEngine& engine,
    const kessho::product::internal::LaneState& lane) {
  const uint32_t field_id = engine.stepFieldId(KESSHO_PRODUCT_STEP_FIELD_NUDGE);
  return engine.validStepFieldId(field_id) &&
      lane.step_value_configs[field_id].enabled &&
      (lane.nudge_override_set_low != 0u || lane.nudge_override_set_high != 0u);
}

float nudgeValueForRelativeStep(
    const KesshoProductEngine& engine,
    const kessho::product::internal::LaneState& lane,
    uint32_t trigger_step,
    int64_t relative_step,
    uint64_t active_hit_ordinal) {
  if (!nudgeSchedulingActive(engine, lane)) {
    return 0.0f;
  }
  const uint32_t nudge_step_id = engine.subLaneStepForField(
      lane,
      KESSHO_PRODUCT_STEP_FIELD_NUDGE,
      trigger_step,
      relative_step,
      active_hit_ordinal);
  return kessho::product::internal::clampFloat(
      engine.stepFloatValue(
          nudge_step_id,
          lane.nudge_override_set_low,
          lane.nudge_override_set_high,
          lane.nudge_overrides,
          0.0f),
      -1.0f,
      1.0f);
}

uint64_t nudgedSequencerEventSample(
    const KesshoProductEngine& engine,
    const kessho::product::internal::LaneState& lane,
    uint32_t trigger_step,
    int64_t relative_step,
    double samples_per_step,
    double swing_samples,
    uint32_t active_count) {
  const double base_sample = sequencerAnchorSample(lane, relative_step, samples_per_step, swing_samples);
  if (active_count == 0u) {
    return roundedSampleFrame(base_sample);
  }
  const uint64_t active_ordinal = activeHitOrdinalForRelativeStep(engine, lane, relative_step, active_count);
  const float nudge = nudgeValueForRelativeStep(engine, lane, trigger_step, relative_step, active_ordinal);
  if (std::fabs(nudge) <= 0.000001f) {
    return roundedSampleFrame(base_sample);
  }
  const int64_t neighbor_step = adjacentActiveRelativeStep(engine, lane, relative_step, nudge < 0.0f ? -1 : 1);
  if (neighbor_step == relative_step) {
    return roundedSampleFrame(base_sample);
  }
  const double neighbor_sample = sequencerAnchorSample(lane, neighbor_step, samples_per_step, swing_samples);
  const double nudged_sample = base_sample + (neighbor_sample - base_sample) * std::fabs(static_cast<double>(nudge));
  return roundedSampleFrame(nudged_sample);
}

void advanceProductArpCursor(kessho::product::internal::ProductArpRuntimeState& arp, uint64_t count = 1u) {
  const uint32_t length = std::max(1u, std::min<uint32_t>(arp.length, kessho::product::internal::kMaxProductArpSteps));
  arp.cursor = static_cast<uint32_t>((static_cast<uint64_t>(arp.cursor % length) + count) % length);
}

uint32_t productArpSlotsPerWindow(
    const kessho::product::internal::ProductArpRuntimeState& arp,
    uint64_t window_samples,
    double samples_per_step) {
  const uint32_t length = std::max(
      1u,
      std::min<uint32_t>(arp.length, kessho::product::internal::kMaxProductArpSteps));
  const float rate = kessho::product::internal::clampFloat(arp.rate, 0.25f, 4.0f);
  const double minimum_slots = static_cast<double>(length) * static_cast<double>(rate);
  uint32_t desired_slots = !std::isfinite(minimum_slots) || minimum_slots <= 1.0
      ? 1u
      : static_cast<uint32_t>(std::llround(minimum_slots));
  const double clock_spacing = samples_per_step / static_cast<double>(rate);
  if (std::isfinite(clock_spacing) && clock_spacing > 1.0 && window_samples > 0u) {
    const double continuous_slots = std::ceil(
        static_cast<double>(window_samples) / clock_spacing - 1.0e-9);
    if (std::isfinite(continuous_slots) && continuous_slots > 0.0) {
      desired_slots = std::max(
          desired_slots,
          static_cast<uint32_t>(std::llround(continuous_slots)));
    }
  }
  const uint32_t sample_limited = window_samples > 0u
      ? static_cast<uint32_t>(std::min<uint64_t>(
          static_cast<uint64_t>(kessho::product::internal::kMaxPendingRatchetsPerLane),
          window_samples))
      : 1u;
  return std::max(1u, std::min<uint32_t>(desired_slots, sample_limited));
}

uint64_t productArpSlotSample(
    uint64_t window_start,
    uint64_t window_samples,
    uint32_t window_slots,
    uint32_t slot_index) {
  const uint32_t slots = std::max(1u, window_slots);
  const double offset = static_cast<double>(window_samples) *
      (static_cast<double>(slot_index) / static_cast<double>(slots));
  return window_start + static_cast<uint64_t>(std::llround(std::max(0.0, offset)));
}

uint64_t productArpWindowEndSample(
    const KesshoProductEngine& engine,
    const kessho::product::internal::LaneState& lane,
    int64_t relative_step,
    uint64_t event_sample,
    double samples_per_step,
    double swing_samples,
    uint32_t nudge_active_count) {
  const int64_t next_relative_step = adjacentActiveRelativeStep(engine, lane, relative_step, 1);
  if (next_relative_step > relative_step) {
    const uint64_t next_sample = nudgedSequencerEventSample(
        engine,
        lane,
        relativeStepId(lane, next_relative_step),
        next_relative_step,
        samples_per_step,
        swing_samples,
        nudge_active_count);
    if (next_sample > event_sample) {
      return next_sample;
    }
  }
  const uint64_t fallback = static_cast<uint64_t>(std::max<int64_t>(1, std::llround(samples_per_step)));
  return event_sample + fallback;
}

void recordDrainedRatchet(
    kessho::product::internal::LaneState& lane,
    const kessho::product::internal::PendingRatchetEvent& pending) {
  const KesshoSequencerEvent& event = pending.event;
  if (pending.arp_step_index != UINT32_MAX) {
    lane.arp.current_step = pending.arp_step_index %
        kessho::product::internal::kMaxProductArpSteps;
  }
  if (event.morph >= 0.0f) {
    lane.last_emitted_morph_valid = true;
    lane.last_emitted_morph = event.morph;
  } else {
    lane.last_emitted_morph_valid = false;
  }
  if (event.distance >= 0.0f) {
    lane.last_emitted_distance_valid = true;
    lane.last_emitted_distance = event.distance;
  } else {
    lane.last_emitted_distance_valid = false;
  }
  if (event.expression >= 0.0f) {
    lane.last_emitted_expression_valid = true;
    lane.last_emitted_expression = event.expression;
  } else {
    lane.last_emitted_expression_valid = false;
  }
  lane.last_emitted_drum_voice = event.source_id == KESSHO_PRODUCT_SOURCE_DRUM
      ? static_cast<uint32_t>(std::clamp(
          static_cast<int>(std::lround(event.midi_note - 36.0f)),
          0,
          DRUM_NUM_VOICE_TYPES - 1))
      : DRUM_NUM_VOICE_TYPES;
  lane.last_emitted_sample_frame = pending.absolute_sample;
}

void pushPendingRatchet(
    kessho::product::internal::LaneState& lane,
    const kessho::product::internal::PendingRatchetEvent& pending) {
  if (lane.pending_ratchet_count >= kessho::product::internal::kMaxPendingRatchetsPerLane) {
    for (uint32_t i = 1u; i < lane.pending_ratchet_count; ++i) {
      lane.pending_ratchets[i - 1u] = lane.pending_ratchets[i];
    }
    lane.pending_ratchet_count -= 1u;
    lane.pending_ratchet_drop_count += 1u;
  }
  lane.pending_ratchets[lane.pending_ratchet_count++] = pending;
}

bool drainPendingRatchets(
    kessho::product::internal::LaneState& lane,
    uint64_t block_start,
    uint64_t block_end,
    const KesshoProductEngine& engine,
    kessho::product::internal::SequencerBuffer& out,
    KesshoProductTelemetry& telemetry) {
  uint32_t write_index = 0u;
  for (uint32_t read_index = 0u; read_index < lane.pending_ratchet_count; ++read_index) {
    kessho::product::internal::PendingRatchetEvent pending = lane.pending_ratchets[read_index];
    if (pending.absolute_sample < block_start) {
      continue;
    }
    if (pending.absolute_sample >= block_end) {
      lane.pending_ratchets[write_index++] = pending;
      continue;
    }
    if (!sequencerTargetSourceEnabled(engine, pending.event.source_id)) {
      continue;
    }
    pending.event.sample_offset = static_cast<uint32_t>(pending.absolute_sample - block_start);
    if (!out.push(pending.event)) {
      telemetry.last_error_code = KESSHO_PRODUCT_ERROR_EVENT_QUEUE_FULL;
      lane.pending_ratchets[write_index++] = pending;
      for (uint32_t keep_index = read_index + 1u; keep_index < lane.pending_ratchet_count; ++keep_index) {
        lane.pending_ratchets[write_index++] = lane.pending_ratchets[keep_index];
      }
      lane.pending_ratchet_count = write_index;
      return false;
    }
    recordDrainedRatchet(lane, pending);
  }
  lane.pending_ratchet_count = write_index;
  return true;
}

uint16_t pitchClassMaskFromMidiPool(const float* notes, uint32_t count) {
  uint16_t mask = 0u;
  const uint32_t safe_count = std::min<uint32_t>(count, 8u);
  for (uint32_t i = 0u; i < safe_count; ++i) {
    mask |= static_cast<uint16_t>(1u << kessho::product::internal::positiveModulo(
        kessho::product::internal::roundedInt(notes[i]),
        12u));
  }
  return mask;
}

uint16_t pitchClassMaskFromScale(const kessho::product::internal::HarmonyState& harmony) {
  int intervals[kessho::product::internal::kMaxScaleNotes]{};
  const uint32_t interval_count = kessho::product::internal::scaleIntervals(harmony.scale_id, intervals);
  if (interval_count == 0u) {
    return 0x0fffu;
  }
  uint16_t mask = 0u;
  const uint32_t root_pitch_class = kessho::product::internal::positiveModulo(
      kessho::product::internal::roundedInt(harmony.root_midi),
      12u);
  for (uint32_t i = 0u; i < interval_count; ++i) {
    mask |= static_cast<uint16_t>(1u << ((root_pitch_class + static_cast<uint32_t>(intervals[i])) % 12u));
  }
  return mask == 0u ? 0x0fffu : mask;
}

uint16_t pitchClassMaskFromChord(const kessho::product::internal::HarmonyState& harmony) {
  return pitchClassMaskFromMidiPool(harmony.chord_midi, 4u);
}

uint16_t walkerPitchClassMask(
    const KesshoProductEngine& engine,
    const kessho::product::internal::AnchorWalkerState& walker) {
  switch (walker.snap_source) {
    case 1u:
      if (engine.harmony.note_pool_count > 0u) {
        return pitchClassMaskFromMidiPool(engine.harmony.note_pool_midi, engine.harmony.note_pool_count);
      }
      return pitchClassMaskFromChord(engine.harmony);
    case 2u:
      return pitchClassMaskFromChord(engine.harmony);
    case 3u:
      return walker.custom_pitch_class_mask == 0u
          ? 0x0fffu
          : static_cast<uint16_t>(walker.custom_pitch_class_mask & 0x0fffu);
    case 4u:
      if (engine.harmony.note_pool_count > 0u) {
        return pitchClassMaskFromMidiPool(engine.harmony.note_pool_midi, engine.harmony.note_pool_count);
      }
      return pitchClassMaskFromScale(engine.harmony);
    case 0u:
    default:
      return pitchClassMaskFromScale(engine.harmony);
  }
}

uint16_t orbitPitchClassMask(
    const KesshoProductEngine& engine,
    const kessho::product::internal::OrbitSequencerState& orbit) {
  switch (orbit.snap_source) {
    case 1u:
      if (engine.harmony.note_pool_count > 0u) {
        return pitchClassMaskFromMidiPool(engine.harmony.note_pool_midi, engine.harmony.note_pool_count);
      }
      return pitchClassMaskFromChord(engine.harmony);
    case 2u:
      return pitchClassMaskFromChord(engine.harmony);
    case 4u:
      if (engine.harmony.note_pool_count > 0u) {
        return pitchClassMaskFromMidiPool(engine.harmony.note_pool_midi, engine.harmony.note_pool_count);
      }
      return pitchClassMaskFromScale(engine.harmony);
    case 0u:
    case 3u:
    default:
      return pitchClassMaskFromScale(engine.harmony);
  }
}

bool maskContainsMidi(uint16_t mask, int midi_note) {
  const uint16_t safe_mask = mask == 0u ? 0x0fffu : static_cast<uint16_t>(mask & 0x0fffu);
  const uint32_t pitch_class = kessho::product::internal::positiveModulo(midi_note, 12u);
  return (safe_mask & static_cast<uint16_t>(1u << pitch_class)) != 0u;
}

void midiRange(float min_value, float max_value, int& low, int& high) {
  low = std::clamp(kessho::product::internal::roundedInt(std::min(min_value, max_value)), 0, 127);
  high = std::clamp(kessho::product::internal::roundedInt(std::max(min_value, max_value)), 0, 127);
  if (high < low) {
    high = low;
  }
}

float snapMidiToMask(float midi_note, float min_value, float max_value, uint16_t mask) {
  int low = 0;
  int high = 127;
  midiRange(min_value, max_value, low, high);
  float best = kessho::product::internal::clampFloat(midi_note, static_cast<float>(low), static_cast<float>(high));
  float best_distance = 1000.0f;
  for (int candidate = low; candidate <= high; ++candidate) {
    if (!maskContainsMidi(mask, candidate)) {
      continue;
    }
    const float distance = std::abs(static_cast<float>(candidate) - midi_note);
    if (distance < best_distance) {
      best_distance = distance;
      best = static_cast<float>(candidate);
    }
  }
  return best;
}

float degreeMidiFromMask(float anchor_midi, int32_t degree, float min_value, float max_value, uint16_t mask) {
  int low = 0;
  int high = 127;
  midiRange(min_value, max_value, low, high);
  int count = 0;
  int nearest_index = 0;
  float nearest_distance = 1000.0f;
  for (int candidate = low; candidate <= high; ++candidate) {
    if (!maskContainsMidi(mask, candidate)) {
      continue;
    }
    const float distance = std::abs(static_cast<float>(candidate) - anchor_midi);
    if (distance < nearest_distance) {
      nearest_distance = distance;
      nearest_index = count;
    }
    ++count;
  }
  if (count <= 0) {
    return kessho::product::internal::clampFloat(anchor_midi, static_cast<float>(low), static_cast<float>(high));
  }
  const int target_index = std::clamp(nearest_index + degree, 0, count - 1);
  int index = 0;
  for (int candidate = low; candidate <= high; ++candidate) {
    if (!maskContainsMidi(mask, candidate)) {
      continue;
    }
    if (index == target_index) {
      return static_cast<float>(candidate);
    }
    ++index;
  }
  return kessho::product::internal::clampFloat(anchor_midi, static_cast<float>(low), static_cast<float>(high));
}

float radiusMidiFromMask(float radius_norm, float min_value, float max_value, uint16_t mask) {
  int low = 0;
  int high = 127;
  midiRange(min_value, max_value, low, high);
  int count = 0;
  for (int candidate = low; candidate <= high; ++candidate) {
    if (maskContainsMidi(mask, candidate)) {
      ++count;
    }
  }
  const float radius = kessho::product::internal::clampFloat(radius_norm, 0.0f, 1.0f);
  if (count <= 0) {
    return kessho::product::internal::clampFloat(
        static_cast<float>(low) + radius * static_cast<float>(high - low),
        static_cast<float>(low),
        static_cast<float>(high));
  }
  const int target_index = std::clamp(
      static_cast<int>(std::lround(radius * static_cast<float>(count - 1))),
      0,
      count - 1);
  int index = 0;
  for (int candidate = low; candidate <= high; ++candidate) {
    if (!maskContainsMidi(mask, candidate)) {
      continue;
    }
    if (index == target_index) {
      return static_cast<float>(candidate);
    }
    ++index;
  }
  return static_cast<float>(low);
}

int positiveModuloInt(int value, int divisor) {
  if (divisor <= 0) {
    return 0;
  }
  const int remainder = value % divisor;
  return remainder < 0 ? remainder + divisor : remainder;
}

int walkerBoundedLatticeIndex(int target_index, int count, uint32_t boundary_mode) {
  if (count <= 1) {
    return 0;
  }
  if (boundary_mode == 1u) {
    return positiveModuloInt(target_index, count);
  }
  if (boundary_mode == 0u) {
    const int period = (count - 1) * 2;
    const int folded = positiveModuloInt(target_index, period);
    return folded <= count - 1 ? folded : period - folded;
  }
  return std::clamp(target_index, 0, count - 1);
}

uint32_t walkerBoundaryEvent(int target_index, int count, uint32_t boundary_mode) {
  if (count <= 1 || (target_index >= 0 && target_index < count)) {
    return KESSHO_PRODUCT_ANCHOR_WALKER_BOUNDARY_NONE;
  }
  const bool hit_top = target_index >= count;
  if (boundary_mode == 1u) {
    return hit_top
        ? KESSHO_PRODUCT_ANCHOR_WALKER_BOUNDARY_WRAP_TOP
        : KESSHO_PRODUCT_ANCHOR_WALKER_BOUNDARY_WRAP_BOTTOM;
  }
  if (boundary_mode == 0u) {
    return hit_top
        ? KESSHO_PRODUCT_ANCHOR_WALKER_BOUNDARY_FOLD_TOP
        : KESSHO_PRODUCT_ANCHOR_WALKER_BOUNDARY_FOLD_BOTTOM;
  }
  return hit_top
      ? KESSHO_PRODUCT_ANCHOR_WALKER_BOUNDARY_CLAMP_TOP
      : KESSHO_PRODUCT_ANCHOR_WALKER_BOUNDARY_CLAMP_BOTTOM;
}

float walkerDegreeMidiFromMask(
    float anchor_midi,
    int32_t degree,
    float min_value,
    float max_value,
    uint16_t mask,
    uint32_t boundary_mode,
    uint32_t* boundary_event = nullptr) {
  int low = 0;
  int high = 127;
  midiRange(min_value, max_value, low, high);
  int count = 0;
  int nearest_index = 0;
  float nearest_distance = 1000.0f;
  for (int candidate = low; candidate <= high; ++candidate) {
    if (!maskContainsMidi(mask, candidate)) {
      continue;
    }
    const float distance = std::abs(static_cast<float>(candidate) - anchor_midi);
    if (distance < nearest_distance) {
      nearest_distance = distance;
      nearest_index = count;
    }
    ++count;
  }
  if (count <= 0) {
    if (boundary_event != nullptr) {
      *boundary_event = KESSHO_PRODUCT_ANCHOR_WALKER_BOUNDARY_NONE;
    }
    return kessho::product::internal::clampFloat(anchor_midi, static_cast<float>(low), static_cast<float>(high));
  }
  const int raw_target_index = nearest_index + degree;
  if (boundary_event != nullptr) {
    *boundary_event = walkerBoundaryEvent(raw_target_index, count, boundary_mode);
  }
  const int target_index = walkerBoundedLatticeIndex(raw_target_index, count, boundary_mode);
  int index = 0;
  for (int candidate = low; candidate <= high; ++candidate) {
    if (!maskContainsMidi(mask, candidate)) {
      continue;
    }
    if (index == target_index) {
      return static_cast<float>(candidate);
    }
    ++index;
  }
  return kessho::product::internal::clampFloat(anchor_midi, static_cast<float>(low), static_cast<float>(high));
}

float hashedMidiFromMask(float min_value, float max_value, uint16_t mask, uint32_t seed) {
  int low = 0;
  int high = 127;
  midiRange(min_value, max_value, low, high);
  int count = 0;
  for (int candidate = low; candidate <= high; ++candidate) {
    if (maskContainsMidi(mask, candidate)) {
      ++count;
    }
  }
  if (count <= 0) {
    return kessho::product::internal::clampFloat(
        static_cast<float>(low) + kessho::product::internal::hashUnit(seed) * static_cast<float>(high - low),
        static_cast<float>(low),
        static_cast<float>(high));
  }
  const int target_index = static_cast<int>(
      kessho::product::internal::hashUnit(seed ^ 0x6d2b79f5u) * static_cast<float>(count)) % count;
  int index = 0;
  for (int candidate = low; candidate <= high; ++candidate) {
    if (!maskContainsMidi(mask, candidate)) {
      continue;
    }
    if (index == target_index) {
      return static_cast<float>(candidate);
    }
    ++index;
  }
  return static_cast<float>(low);
}

float walkerAnchorMidi(
    const KesshoProductEngine& engine,
    const kessho::product::internal::AnchorWalkerState& walker) {
  switch (walker.anchor_source) {
    case 1u:
      if (engine.harmony.note_pool_count > 0u) {
        return kessho::product::internal::clampFloat(engine.harmony.note_pool_midi[0], 0.0f, 127.0f);
      }
      return kessho::product::internal::clampFloat(engine.harmony.root_midi, 0.0f, 127.0f);
    case 2u:
      if (engine.harmony.note_pool_count > 0u) {
        const uint32_t index = std::min<uint32_t>(engine.harmony.note_pool_count, 8u) - 1u;
        return kessho::product::internal::clampFloat(engine.harmony.note_pool_midi[index], 0.0f, 127.0f);
      }
      return kessho::product::internal::clampFloat(walker.manual_anchor_midi, 0.0f, 127.0f);
    case 3u:
      return kessho::product::internal::clampFloat(walker.manual_anchor_midi, 0.0f, 127.0f);
    case 0u:
    default:
      return kessho::product::internal::clampFloat(engine.harmony.root_midi, 0.0f, 127.0f);
  }
}

uint32_t sourceOrFollow(uint32_t source_id, uint32_t fallback_source_id) {
  const uint32_t selected = source_id == 0u ? fallback_source_id : source_id;
  return selected >= 1u && selected <= kessho::product::internal::kSourceCount
      ? selected
      : KESSHO_PRODUCT_SOURCE_LEAD1;
}

uint32_t walkRateDivision(uint32_t walk_rate) {
  switch (walk_rate) {
    case 1u: return 1u;
    case 2u: return 2u;
    case 3u: return 4u;
    case 4u: return 8u;
    case 5u: return 16u;
    case 6u: return 32u;
    case 0u:
    default:
      return 0u;
  }
}

double walkerSamplesPerTick(
    const KesshoProductEngine& engine,
    const kessho::product::internal::AnchorWalkerState& walker) {
  const uint32_t division = walkRateDivision(walker.auto_rate);
  if (division == 0u) {
    return 0.0;
  }
  double samples = kessho::product::internal::sequencerSamplesPerStep(
      engine.transport,
      engine.sample_rate,
      division);
  if (walker.auto_feel == 1u) {
    samples *= 1.5;
  } else if (walker.auto_feel == 2u) {
    samples *= 2.0 / 3.0;
  }
  return samples;
}

KesshoSequencerEvent makeFaceSequencerEvent(
    KesshoProductEngine& engine,
    const kessho::product::internal::LaneState& lane,
    uint32_t lane_index,
    uint32_t step_id,
    uint32_t source_id,
    float midi_note,
    float velocity,
    float hold_seconds,
    uint32_t event_seed,
    uint32_t local_flags) {
  const uint32_t target_source = sourceOrFollow(source_id, lane.target_source_id);
  KesshoSequencerEvent event{};
  event.source_id = static_cast<uint16_t>(target_source);
  event.lane_id = static_cast<uint16_t>(lane_index);
  event.step_id = static_cast<uint16_t>(step_id);
  event.event_kind = static_cast<uint16_t>(KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON);
  event.midi_note = kessho::product::internal::clampFloat(midi_note, 0.0f, 127.0f);
  event.frequency_hz = kessho::product::internal::midiToFrequency(event.midi_note);
  event.velocity = kessho::product::internal::clampFloat(velocity, 0.0f, 1.0f);
  event.hold_seconds = kessho::product::internal::clampFloat(hold_seconds, 0.001f, 20.0f);
  event.send_delay_a = target_source == KESSHO_PRODUCT_SOURCE_DRUM ? 1.0e10f : 1.0f;
  event.send_delay_b = 1.0e10f;
  event.send_granular = 0.0f;
  event.morph = target_source == KESSHO_PRODUCT_SOURCE_DRUM
      ? -1.0f
      : engine.resolveModulatedValue(
          target_source,
          KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID,
          lane.morph,
          event_seed ^ 0x2c1b3c6du);
  event.distance = target_source == KESSHO_PRODUCT_SOURCE_DRUM
      ? -1.0f
      : engine.resolveModulatedValue(
          target_source,
          KESSHO_PRODUCT_PARAM_SOURCE_DISTANCE_ID,
          lane.distance,
          event_seed ^ 0x165667b1u);
  event.expression = target_source == KESSHO_PRODUCT_SOURCE_DRUM
      ? 1.0f
      : engine.resolveModulatedValue(
          target_source,
          KESSHO_PRODUCT_PARAM_SOURCE_EXPRESSION_ID,
          lane.expression,
          event_seed ^ 0x51f15ca9u);
  const uint32_t pad_voice_index =
      target_source == KESSHO_PRODUCT_SOURCE_PAD1 || target_source == KESSHO_PRODUCT_SOURCE_PAD2
          ? kessho::product::internal::padVoiceIndexFromMask(lane.target_pad_voice_mask, lane.emitted_hit_count)
          : kessho::product::internal::kPadVoiceNoPreference;
  event.flags = kessho::product::internal::sequencerPadVoiceEventFlags(pad_voice_index) | (local_flags & 0x0000ffffu);
  return event;
}

bool enqueueFaceEvent(
    kessho::product::internal::LaneState& lane,
    uint64_t parent_step_id,
    uint64_t absolute_sample,
    uint32_t lane_index,
    uint32_t step_index,
    uint32_t ratchet_index,
    uint32_t ratchet_count,
    const KesshoSequencerEvent& event) {
  kessho::product::internal::PendingRatchetEvent pending{};
  pending.parent_step_id = parent_step_id;
  pending.absolute_sample = absolute_sample;
  pending.lane_index = lane_index;
  pending.step_index = step_index;
  pending.ratchet_index = ratchet_index;
  pending.ratchet_count = std::max(1u, ratchet_count);
  pending.event = event;
  pushPendingRatchet(lane, pending);
  return true;
}

float captureRelativeStepFloatForSample(
    const KesshoProductEngine& engine,
    const kessho::product::internal::LaneState& lane,
    uint64_t absolute_sample);

int32_t captureRelativeStepIndexForSample(
    const KesshoProductEngine& engine,
    const kessho::product::internal::LaneState& lane,
    uint64_t absolute_sample) {
  const double target_step = captureRelativeStepFloatForSample(engine, lane, absolute_sample);
  if (!std::isfinite(target_step) || target_step < 0.0) {
    return -1;
  }
  if (target_step > static_cast<double>(std::numeric_limits<int32_t>::max())) {
    return std::numeric_limits<int32_t>::max();
  }
  return static_cast<int32_t>(std::llround(target_step));
}

float captureRelativeStepFloatForSample(
    const KesshoProductEngine& engine,
    const kessho::product::internal::LaneState& lane,
    uint64_t absolute_sample) {
  using namespace kessho::product::internal;
  if (!lane.sequencer_runtime_initialized || lane.step_count == 0u || lane.clock_division == 0u) {
    return -1.0f;
  }
  if (static_cast<double>(absolute_sample) < static_cast<double>(lane.sequencer_start_sample_frame)) {
    return -1.0f;
  }
  const double samples_per_step =
      sequencerSamplesPerStep(engine.transport, engine.sample_rate, lane.clock_division) /
      static_cast<double>(clampFloat(lane.tempo_multiplier, 0.25f, 12.0f));
  if (!std::isfinite(samples_per_step) || samples_per_step <= 0.0) {
    return -1.0f;
  }
  const double relative_sample =
      static_cast<double>(absolute_sample) - static_cast<double>(lane.sequencer_start_sample_frame);
  const double relative_step = relative_sample / samples_per_step;
  if (!std::isfinite(relative_step) || relative_step < 0.0) {
    return -1.0f;
  }
  return static_cast<float>(relative_step);
}

float captureNudgeForTargetStep(double target_step_float, int32_t target_step_index) {
  if (!std::isfinite(target_step_float) || target_step_index < 0) {
    return 0.0f;
  }
  return kessho::product::internal::clampFloat(
      static_cast<float>(target_step_float - static_cast<double>(target_step_index)),
      -1.0f,
      1.0f);
}

void maybeCaptureGeneratedFaceEvent(
    KesshoProductEngine& engine,
    const kessho::product::internal::LaneState& lane,
    uint64_t absolute_sample,
    uint32_t lane_index,
    uint32_t source_mode,
    uint32_t target_source_id,
    float midi_note,
    float velocity,
    float gate_seconds,
    int32_t source_step_index,
    int32_t source_layer_index,
    int32_t source_note_index) {
  const KesshoProductGeneratedSequencerCaptureConfig& config =
      engine.generated_sequencer_capture_config;
  if (!kessho::product::shouldCaptureGeneratedSequencerEvent(config, lane_index, source_mode)) {
    return;
  }

  KesshoProductGeneratedSequencerCaptureEvent captured{};
  captured.event_id = engine.generated_sequencer_capture_event_counter++;
  captured.absolute_sample = absolute_sample;
  captured.source_lane_index = lane_index;
  captured.source_mode = source_mode;
  captured.target_source_id = target_source_id;
  captured.midi_note = kessho::product::internal::clampFloat(midi_note, 0.0f, 127.0f);
  captured.velocity = kessho::product::internal::clampFloat(velocity, 0.0f, 1.0f);
  captured.gate_seconds = kessho::product::internal::clampFloat(gate_seconds, 0.001f, 20.0f);
  captured.source_step_index = source_step_index;
  captured.source_layer_index = source_layer_index;
  captured.source_note_index = source_note_index;
  const float target_step_float = captureRelativeStepFloatForSample(engine, lane, absolute_sample);
  captured.target_step_index = captureRelativeStepIndexForSample(engine, lane, absolute_sample);
  captured.target_step_float = target_step_float;
  captured.nudge = captureNudgeForTargetStep(static_cast<double>(target_step_float), captured.target_step_index);

  engine.generated_sequencer_capture_ring.push(captured);
}

bool emitAnchorWalkerTrigger(
    KesshoProductEngine& engine,
    kessho::product::internal::LaneState& lane,
    kessho::product::internal::AnchorWalkerState& walker,
    uint32_t lane_index,
    uint64_t event_sample,
    uint64_t tick_index,
    uint32_t pattern_index,
    int32_t gesture_delta,
    float gesture_velocity,
    uint16_t pitch_mask) {
  using namespace kessho::product::internal;
  const int32_t safe_gesture_delta = clampInt(gesture_delta, -7, 7);
  if (safe_gesture_delta == 0) {
    return true;
  }
  walker.anchor_midi = walkerAnchorMidi(engine, walker);
  walker.anchor_valid = true;
  walker.previous_cursor_midi = walker.cursor_valid ? walker.cursor_midi : walker.anchor_midi;
  walker.cursor_degree = clampInt(walker.cursor_degree + safe_gesture_delta, -4096, 4096);
  uint32_t boundary_event = KESSHO_PRODUCT_ANCHOR_WALKER_BOUNDARY_NONE;
  walker.cursor_midi = walkerDegreeMidiFromMask(
      walker.anchor_midi,
      walker.cursor_degree,
      walker.output_range_min,
      walker.output_range_max,
      pitch_mask,
      walker.boundary_mode,
      &boundary_event);
  walker.cursor_valid = true;
  walker.last_gesture_delta = safe_gesture_delta;
  walker.boundary_event = boundary_event;
  uint32_t active_layer_count = 0u;
  for (uint32_t layer_index = 0u; layer_index < kMaxAnchorWalkerLayers; ++layer_index) {
    if (walker.layers[layer_index].enabled) {
      ++active_layer_count;
    }
  }
  active_layer_count = std::max(1u, active_layer_count);
  uint32_t layer_event_index = 0u;
  walker.last_output_count = 0u;
  for (uint32_t layer_index = 0u; layer_index < kMaxAnchorWalkerLayers; ++layer_index) {
    const AnchorWalkerLayerState& layer = walker.layers[layer_index];
    if (!layer.enabled) {
      continue;
    }
    const int32_t layer_degree = layer.motion == 1u ? -walker.cursor_degree : walker.cursor_degree;
    float layer_midi = walker.cursor_midi;
    if (layer.tuning == 0u) {
      layer_midi = walker.cursor_midi + static_cast<float>(layer.transpose_semitones);
    } else if (layer.tuning == 1u) {
      layer_midi = snapMidiToMask(
          walker.cursor_midi + static_cast<float>(layer.transpose_semitones),
          walker.output_range_min,
          walker.output_range_max,
          pitch_mask);
    } else {
      layer_midi = walkerDegreeMidiFromMask(
          walker.anchor_midi,
          layer_degree + layer.diatonic_offset,
          walker.output_range_min,
          walker.output_range_max,
          pitch_mask,
          walker.boundary_mode) + static_cast<float>(layer.transpose_semitones);
      layer_midi = snapMidiToMask(layer_midi, walker.output_range_min, walker.output_range_max, pitch_mask);
    }
    const float velocity = clampFloat(
        lane.velocity * clampFloat(gesture_velocity, 0.0f, 1.0f) * layer.velocity_scale + layer.velocity_offset,
        0.0f,
        1.0f);
    const float hold_seconds = clampFloat(lane.hold_seconds * layer.gate_ratio, 0.001f, 20.0f);
    const double layer_delay_seconds = layer.delay_seconds > 0.0f
        ? static_cast<double>(layer.delay_seconds)
        : static_cast<double>(walker.spread_seconds) * static_cast<double>(layer_index);
    const uint64_t layer_sample = event_sample + static_cast<uint64_t>(
        std::llround(std::max(0.0, layer_delay_seconds) * engine.sample_rate));
    const uint32_t event_seed = hashU32(
        engine.rng_seed ^
        walker.seed ^
        lane.seed ^
        static_cast<uint32_t>(tick_index * 2654435761ull) ^
        (layer_index * 16777619u));
    const uint32_t event_source = sourceOrFollow(layer.target_source_id, walker.target_source_id);
    if (!sequencerTargetSourceEnabled(engine, event_source)) {
      continue;
    }
    KesshoSequencerEvent event = makeFaceSequencerEvent(
        engine,
        lane,
        lane_index,
        pattern_index,
        event_source,
        layer_midi,
        velocity,
        hold_seconds,
        event_seed,
        layer_index);
    if (layer_event_index < kMaxAnchorWalkerLayers) {
      walker.last_output_midis[layer_event_index] = event.midi_note;
      walker.last_output_velocities[layer_event_index] = event.velocity;
      walker.last_output_source_ids[layer_event_index] = event.source_id;
      walker.last_output_count = layer_event_index + 1u;
    }
    enqueueFaceEvent(
        lane,
        tick_index,
        layer_sample,
        lane_index,
        pattern_index,
        layer_event_index,
        active_layer_count,
        event);
    maybeCaptureGeneratedFaceEvent(
        engine,
        lane,
        layer_sample,
        lane_index,
        KESSHO_PRODUCT_GENERATED_SEQUENCER_CAPTURE_MODE_ANCHOR_WALKER,
        event.source_id,
        event.midi_note,
        event.velocity,
        event.hold_seconds,
        static_cast<int32_t>(pattern_index),
        static_cast<int32_t>(layer_index),
        -1);
    ++layer_event_index;
  }
  lane.emitted_hit_count += 1u;
  return true;
}

bool generateAnchorWalkerLaneEvents(
    KesshoProductEngine& engine,
    kessho::product::internal::LaneState& lane,
    uint32_t lane_index,
    uint32_t frames,
    kessho::product::internal::SequencerBuffer& out) {
  using namespace kessho::product::internal;
  const uint64_t block_start = engine.transport.sample_frame;
  const uint64_t block_end = block_start + frames;
  AnchorWalkerState& walker = lane.anchor_walker;
  if (!lane.enabled || !walker.enabled) {
    engine.resetSequencerLaneRuntime(lane);
    return true;
  }

  const bool gesture_hold = walker.trigger_mode == 0u;
  const bool step_grid = walker.trigger_mode == 1u;
  const bool auto_clock = walker.trigger_mode == 2u;
  double samples_per_period = 0.0;
  if (gesture_hold || auto_clock) {
    samples_per_period = walkerSamplesPerTick(engine, walker);
  } else if (step_grid) {
    if (lane.step_count == 0u || lane.clock_division == 0u) {
      engine.resetSequencerLaneRuntime(lane);
      return true;
    }
    samples_per_period =
        sequencerSamplesPerStep(engine.transport, engine.sample_rate, lane.clock_division) /
        static_cast<double>(clampFloat(lane.tempo_multiplier, 0.25f, 12.0f));
  }
  if ((step_grid || auto_clock) && (!std::isfinite(samples_per_period) || samples_per_period <= 0.0)) {
    engine.resetSequencerLaneRuntime(lane);
    return true;
  }

  if (!lane.sequencer_runtime_initialized || !walker.runtime_initialized || block_start < walker.runtime_sample_frame) {
    const bool wait_for_join_boundary = lane.sequencer_join_pending;
    const bool preserved_gesture_held = walker.gesture_held;
    const int32_t preserved_held_gesture_delta = walker.held_gesture_delta;
    const float preserved_held_gesture_velocity = walker.held_gesture_velocity;
    const uint64_t preserved_gesture_started_sample = walker.gesture_started_sample;
    const uint64_t preserved_next_gesture_walk_sample = walker.next_gesture_walk_sample;
    const uint32_t preserved_pending_gesture_steps = walker.pending_gesture_steps;
    engine.resetSequencerLaneRuntime(lane);
    walker.gesture_held = preserved_gesture_held;
    walker.held_gesture_delta = preserved_held_gesture_delta;
    walker.held_gesture_velocity = preserved_held_gesture_velocity;
    walker.gesture_started_sample = preserved_gesture_started_sample;
    walker.next_gesture_walk_sample = preserved_next_gesture_walk_sample;
    walker.pending_gesture_steps = preserved_pending_gesture_steps;
    const uint64_t start_sample = gesture_hold
        ? block_start
        : (wait_for_join_boundary
            ? sequencerLaneStartSampleFrame(engine.transport, lane, engine.sample_rate, block_start, samples_per_period)
            : sequencerAlignForwardFromOrigin(
                block_start,
                engine.transport.beat_origin_frame,
                samples_per_period));
    lane.sequencer_start_sample_frame = start_sample;
    lane.sequencer_runtime_initialized = true;
    lane.sequencer_join_pending = false;
    walker.runtime_initialized = true;
    walker.runtime_sample_frame = block_start;
    walker.next_walk_sample = start_sample;
    walker.next_gesture_walk_sample = start_sample;
    walker.anchor_midi = walkerAnchorMidi(engine, walker);
    walker.anchor_valid = true;
    walker.cursor_degree = 0;
    walker.cursor_midi = walkerDegreeMidiFromMask(
        walker.anchor_midi,
        0,
        walker.output_range_min,
        walker.output_range_max,
        walkerPitchClassMask(engine, walker),
        walker.boundary_mode);
    walker.cursor_valid = true;
  }
  if (!drainPendingRatchets(lane, block_start, block_end, engine, out, engine.telemetry)) {
    return false;
  }

  const uint16_t pitch_mask = walkerPitchClassMask(engine, walker);
  const uint32_t pattern_length = clampU32(walker.gesture_pattern_length, 1u, kMaxAnchorWalkerPatternSteps);
  if (gesture_hold) {
    uint32_t scheduled_ticks = 0u;
    while (walker.pending_gesture_steps > 0u && scheduled_ticks < 4u) {
      --walker.pending_gesture_steps;
      ++scheduled_ticks;
      const uint64_t tick_index = lane.emitted_hit_count;
      emitAnchorWalkerTrigger(
          engine,
          lane,
          walker,
          lane_index,
          block_start,
          tick_index,
          static_cast<uint32_t>(tick_index % pattern_length),
          walker.held_gesture_delta,
          walker.held_gesture_velocity,
          pitch_mask);
    }
    if (walker.gesture_held && std::isfinite(samples_per_period) && samples_per_period > 0.0) {
      const uint64_t tick_advance = static_cast<uint64_t>(std::max<long long>(
          1ll,
          std::llround(samples_per_period)));
      if (walker.next_gesture_walk_sample <= block_start) {
        walker.next_gesture_walk_sample = block_start + tick_advance;
      }
      while (walker.next_gesture_walk_sample < block_end && scheduled_ticks < 64u) {
        const uint64_t event_sample = walker.next_gesture_walk_sample;
        walker.next_gesture_walk_sample += tick_advance;
        ++scheduled_ticks;
        if (event_sample < block_start) {
          continue;
        }
        if (!engine.trigConditionPass(lane.trig_condition, event_sample)) {
          continue;
        }
        const uint64_t tick_index = lane.emitted_hit_count;
        emitAnchorWalkerTrigger(
            engine,
            lane,
            walker,
            lane_index,
            event_sample,
            tick_index,
            static_cast<uint32_t>(tick_index % pattern_length),
            walker.held_gesture_delta,
            walker.held_gesture_velocity,
            pitch_mask);
      }
    }
  } else if (auto_clock) {
    const double swing_samples = samples_per_period * 0.5 * clampFloat(walker.swing, 0.0f, 0.75f);
    uint32_t scheduled_ticks = 0u;
    while (walker.next_walk_sample < block_end && scheduled_ticks < 64u) {
      const uint64_t tick_index = lane.emitted_hit_count;
      const uint32_t pattern_index = static_cast<uint32_t>(tick_index % pattern_length);
      const int32_t gesture_delta = clampInt(walker.gesture_pattern[pattern_index], -7, 7);
      const double swung_sample = static_cast<double>(walker.next_walk_sample) +
          (((tick_index & 1u) != 0u) ? swing_samples : 0.0);
      const uint64_t event_sample = static_cast<uint64_t>(std::llround(swung_sample));
      const uint64_t tick_advance = static_cast<uint64_t>(std::max<long long>(
          1ll,
          std::llround(samples_per_period)));
      walker.next_walk_sample += tick_advance;
      ++scheduled_ticks;
      if (event_sample < block_start) {
        continue;
      }
      if (!engine.trigConditionPass(lane.trig_condition, event_sample)) {
        continue;
      }
      emitAnchorWalkerTrigger(engine, lane, walker, lane_index, event_sample, tick_index, pattern_index, gesture_delta, 1.0f, pitch_mask);
    }
  } else if (step_grid) {
    if (static_cast<double>(block_end) <= static_cast<double>(lane.sequencer_start_sample_frame)) {
      walker.runtime_sample_frame = block_end;
      lane.sequencer_runtime_sample_frame = block_end;
      return true;
    }
    const double swing_samples = sequencerSwingSamples(engine.transport, lane, samples_per_period);
    const int64_t first_step = sequencerFirstRelativeStep(block_start, lane.sequencer_start_sample_frame, samples_per_period);
    const int64_t last_step = sequencerLastRelativeStep(block_end, lane.sequencer_start_sample_frame, samples_per_period);
    for (int64_t relative_step = first_step; relative_step <= last_step; ++relative_step) {
      if (relative_step < 0) {
        continue;
      }
      const uint32_t step_id = static_cast<uint32_t>(relative_step % static_cast<int64_t>(lane.step_count));
      if (!engine.manualMaskHit(lane, step_id)) {
        continue;
      }
      double event_sample_double = static_cast<double>(lane.sequencer_start_sample_frame) +
          static_cast<double>(relative_step) * samples_per_period;
      if ((step_id & 1u) != 0u) {
        event_sample_double += swing_samples;
      }
      const uint64_t event_sample = static_cast<uint64_t>(std::llround(event_sample_double));
      if (event_sample < block_start || event_sample >= block_end) {
        continue;
      }
      if (!engine.trigConditionPass(lane.trig_condition, event_sample)) {
        continue;
      }
      if (!engine.stepTrigConditionPass(lane, step_id, relative_step)) {
        continue;
      }
      const uint64_t tick_index = lane.emitted_hit_count;
      const uint32_t probability_step_id = engine.subLaneStepForField(
          lane,
          KESSHO_PRODUCT_STEP_FIELD_PROBABILITY,
          step_id,
          relative_step,
          tick_index);
      const float probability = engine.stepFloatValue(
          probability_step_id,
          lane.probability_override_set_low,
          lane.probability_override_set_high,
          lane.probability_overrides,
          lane.probability);
      const uint32_t probability_seed = lane.seed ^
          static_cast<uint32_t>(relative_step * 2654435761ull) ^
          (lane_index * 16777619u);
      if (hashUnit(probability_seed) > clampFloat(probability, 0.0f, 1.0f)) {
        continue;
      }
      const uint32_t pattern_index = static_cast<uint32_t>(tick_index % pattern_length);
      const int32_t gesture_delta = clampInt(walker.gesture_pattern[pattern_index], -7, 7);
      emitAnchorWalkerTrigger(engine, lane, walker, lane_index, event_sample, tick_index, pattern_index, gesture_delta, 1.0f, pitch_mask);
    }
  }
  if (!drainPendingRatchets(lane, block_start, block_end, engine, out, engine.telemetry)) {
    return false;
  }
  walker.runtime_sample_frame = block_end;
  lane.sequencer_runtime_sample_frame = block_end;
  return true;
}

double wrapRadiansDouble(double value) {
  if (!std::isfinite(value)) {
    return 0.0;
  }
  double wrapped = std::fmod(value, kessho::product::internal::kTwoPi);
  if (wrapped < 0.0) {
    wrapped += kessho::product::internal::kTwoPi;
  }
  return wrapped;
}

double signedAngleDelta(double from, double to) {
  double delta = wrapRadiansDouble(to - from);
  if (delta > kessho::product::internal::kTwoPi * 0.5) {
    delta -= kessho::product::internal::kTwoPi;
  }
  return delta;
}

bool crossingFraction(double previous, double current, double& fraction) {
  const double delta = signedAngleDelta(previous, current);
  if (std::abs(delta) < 1.0e-9) {
    return false;
  }
  if (delta > 0.0) {
    if (current <= previous) {
      const double denominator = (kessho::product::internal::kTwoPi - previous) + current;
      fraction = denominator > 0.0 ? (kessho::product::internal::kTwoPi - previous) / denominator : 0.0;
      return true;
    }
    return false;
  }
  if (current >= previous) {
    const double denominator = previous + (kessho::product::internal::kTwoPi - current);
    fraction = denominator > 0.0 ? previous / denominator : 0.0;
    return true;
  }
  return false;
}

bool isUserVisibleEvenOrbitNode(uint32_t index) {
  return (index % 2u) == 1u;
}

double clampOrbitOffset(float value) {
  return std::clamp(std::isfinite(value) ? static_cast<double>(value) : 0.0, -1.0, 1.0);
}

struct OrbitSpeedOffsetStats {
  double center = 0.0;
  double span = 0.0;
};

OrbitSpeedOffsetStats orbitSpeedOffsetStats(const kessho::product::internal::OrbitSequencerState& orbit) {
  const uint32_t note_count = std::min<uint32_t>(orbit.note_count, kessho::product::internal::kMaxOrbitSequencerNotes);
  double sum = 0.0;
  uint32_t count = 0u;
  for (uint32_t index = 0u; index < note_count; ++index) {
    const kessho::product::internal::OrbitNoteState& note = orbit.notes[index];
    if (!note.enabled) {
      continue;
    }
    sum += std::clamp(std::isfinite(note.radius_norm) ? static_cast<double>(note.radius_norm) : 0.0, 0.0, 1.0);
    ++count;
  }
  if (count <= 1u) {
    return {};
  }
  OrbitSpeedOffsetStats stats{};
  stats.center = sum / static_cast<double>(count);
  for (uint32_t index = 0u; index < note_count; ++index) {
    const kessho::product::internal::OrbitNoteState& note = orbit.notes[index];
    if (!note.enabled) {
      continue;
    }
    const double radius = std::clamp(std::isfinite(note.radius_norm) ? static_cast<double>(note.radius_norm) : 0.0, 0.0, 1.0);
    stats.span = std::max(stats.span, std::abs(radius - stats.center));
  }
  if (stats.span <= 1.0e-6) {
    stats.span = 0.0;
  }
  return stats;
}

double orbitSpeedOffsetFactor(float radius_norm, float speed_offset, const OrbitSpeedOffsetStats& stats) {
  const double offset = clampOrbitOffset(speed_offset);
  const double radius = std::clamp(std::isfinite(radius_norm) ? static_cast<double>(radius_norm) : 0.0, 0.0, 1.0);
  if (std::abs(offset) < 1.0e-6 || stats.span <= 1.0e-6) {
    return 1.0;
  }
  return std::clamp(1.0 + offset * ((radius - stats.center) / stats.span), 0.0, 2.0);
}

double effectiveEvenPhaseOffsetTurns(float even_offset) {
  const double value = clampOrbitOffset(even_offset);
  return value <= -0.5 ? -0.5 : value;
}

double orbitFreeOffsetJitter(uint32_t seed, uint32_t index) {
  return static_cast<double>(kessho::product::internal::hashUnit(seed + index * 97u + 41u)) - 0.5;
}

double orbitPhaseOffsetTurns(
    const kessho::product::internal::OrbitSequencerState& orbit,
    uint32_t note_index) {
  const double global = clampOrbitOffset(orbit.global_offset);
  const double even = isUserVisibleEvenOrbitNode(note_index)
      ? effectiveEvenPhaseOffsetTurns(orbit.even_offset)
      : 0.0;
  const double free = clampOrbitOffset(orbit.free_offset) * orbitFreeOffsetJitter(orbit.seed, note_index);
  return global + even + free;
}

double orbitVisualAngle(
    const kessho::product::internal::OrbitSequencerState& orbit,
    uint32_t note_index,
    double authored_angle) {
  return wrapRadiansDouble(authored_angle + orbitPhaseOffsetTurns(orbit, note_index) * kessho::product::internal::kTwoPi);
}

int32_t orbitEffectiveDirection(
    const kessho::product::internal::OrbitSequencerState& orbit,
    const kessho::product::internal::OrbitNoteState& note,
    uint32_t note_index) {
  const int32_t base_direction = note.direction < 0 ? -1 : 1;
  if (
      orbit.even_reverse_mode == 1u &&
      isUserVisibleEvenOrbitNode(note_index) &&
      orbit.even_offset <= -0.5f) {
    return -base_direction;
  }
  return base_direction;
}

double orbitBaseAngularVelocity(
    const KesshoProductEngine& engine,
    const kessho::product::internal::LaneState& lane,
    const kessho::product::internal::OrbitSequencerState& orbit) {
  const double beats_per_second = std::max(1.0f, engine.transport.bpm) / 60.0;
  double orbit_multiplier = static_cast<double>(kessho::product::internal::clampFloat(
      orbit.bpm_percent,
      1.0f,
      800.0f)) / 100.0;
  if (orbit.clock_mode == 0u) {
    const double steps = static_cast<double>(std::max(1u, lane.step_count));
    const double division = static_cast<double>(std::max(1u, lane.clock_division));
    const double tempo = static_cast<double>(kessho::product::internal::clampFloat(
        lane.tempo_multiplier,
        0.25f,
        12.0f));
    const double clock_rate = static_cast<double>(kessho::product::internal::clampFloat(
        orbit.bpm_percent,
        1.0f,
        800.0f)) / 100.0;
    orbit_multiplier = std::clamp((division * tempo / steps) * clock_rate, 0.01, 8.0);
  }
  return kessho::product::internal::kTwoPi * beats_per_second * orbit_multiplier * 0.25;
}

double orbitAngularVelocity(
    const KesshoProductEngine& engine,
    const kessho::product::internal::LaneState& lane,
    const kessho::product::internal::OrbitSequencerState& orbit,
    const kessho::product::internal::OrbitNoteState& note,
    uint32_t note_index,
    const OrbitSpeedOffsetStats& speed_stats) {
  double angular_velocity = orbitBaseAngularVelocity(engine, lane, orbit);
  const double factor = orbitSpeedOffsetFactor(note.radius_norm, orbit.speed_offset, speed_stats);
  if (factor <= 0.0) {
    return 0.0;
  }
  if (note.speed_mode == 0u) {
    angular_velocity *= static_cast<double>(kessho::product::internal::clampFloat(
        note.speed_value,
        1.0f,
        800.0f)) / 100.0 * factor;
  } else {
    const double divisor = std::clamp(
        static_cast<double>(kessho::product::internal::clampFloat(note.speed_value, 0.125f, 800.0f)) / factor,
        0.125,
        64.0);
    angular_velocity /= divisor;
  }
  return angular_velocity * static_cast<double>(orbitEffectiveDirection(orbit, note, note_index));
}

double orbitSplineAngleAtRadius(
    const kessho::product::internal::OrbitSequencerState& orbit,
    double radius_norm,
    double rotation) {
  using namespace kessho::product::internal;
  const double target_radius = std::clamp(radius_norm, 0.0, 1.0);
  const double p1x = static_cast<double>(clampFloat(orbit.spline_h1_x, -1.2f, 1.2f));
  const double p1y = static_cast<double>(clampFloat(orbit.spline_h1_y, -1.2f, 1.2f));
  const double p2x = static_cast<double>(clampFloat(orbit.spline_h2_x, -1.2f, 1.2f));
  const double p2y = static_cast<double>(clampFloat(orbit.spline_h2_y, -1.2f, 1.2f));
  const double p3x = static_cast<double>(clampFloat(orbit.spline_tip_x, -1.2f, 1.2f));
  const double p3y = static_cast<double>(clampFloat(orbit.spline_tip_y, -1.2f, 1.2f));
  const double cos_a = std::cos(rotation);
  const double sin_a = std::sin(rotation);
  double best_distance = 1.0e9;
  double best_x = p3x;
  double best_y = p3y;
  for (uint32_t index = 0u; index < kOrbitSplineLutSize; ++index) {
    const double t = static_cast<double>(index) / static_cast<double>(kOrbitSplineLutSize - 1u);
    const double mt = 1.0 - t;
    const double mt2 = mt * mt;
    const double t2 = t * t;
    const double x = 3.0 * mt2 * t * p1x + 3.0 * mt * t2 * p2x + t2 * t * p3x;
    const double y = 3.0 * mt2 * t * p1y + 3.0 * mt * t2 * p2y + t2 * t * p3y;
    const double rotated_x = x * cos_a - y * sin_a;
    const double rotated_y = x * sin_a + y * cos_a;
    const double sample_radius = std::sqrt(rotated_x * rotated_x + rotated_y * rotated_y);
    const double distance = std::abs(sample_radius - target_radius);
    if (distance < best_distance) {
      best_distance = distance;
      best_x = rotated_x;
      best_y = rotated_y;
    }
  }
  return wrapRadiansDouble(std::atan2(best_y, best_x));
}

float orbitNoteMidi(
    const KesshoProductEngine& engine,
    const kessho::product::internal::OrbitSequencerState& orbit,
    const kessho::product::internal::OrbitNoteState& note,
    uint16_t pitch_mask,
    uint32_t event_seed) {
  const float pitch_min = std::max(orbit.pitch_range_min, note.pitch_range_min);
  const float pitch_max = std::min(orbit.pitch_range_max, note.pitch_range_max);
  const float low = std::min(pitch_min, pitch_max);
  const float high = std::max(pitch_min, pitch_max);
  if (note.pitch_mode == 0u) {
    return orbit.quantize_to_harmony
        ? snapMidiToMask(note.midi_note, low, high, pitch_mask)
        : kessho::product::internal::clampFloat(note.midi_note, low, high);
  }
  if (note.pitch_mode == 2u) {
    return hashedMidiFromMask(low, high, pitch_mask, event_seed ^ note.seed);
  }
  if (note.pitch_mode == 3u) {
    return radiusMidiFromMask(note.radius_norm, low, high, pitch_mask);
  }
  return degreeMidiFromMask(
      kessho::product::internal::clampFloat(engine.harmony.root_midi, 0.0f, 127.0f),
      note.harmony_degree,
      low,
      high,
      pitch_mask);
}

bool generateOrbitLaneEvents(
    KesshoProductEngine& engine,
    kessho::product::internal::LaneState& lane,
    uint32_t lane_index,
    uint32_t frames,
    kessho::product::internal::SequencerBuffer& out) {
  using namespace kessho::product::internal;
  const uint64_t block_start = engine.transport.sample_frame;
  const uint64_t block_end = block_start + frames;
  OrbitSequencerState& orbit = lane.orbit;
  if (!lane.enabled || !orbit.enabled || orbit.note_count == 0u || orbit.trigger_line_count == 0u) {
    engine.resetSequencerLaneRuntime(lane);
    return true;
  }
  if (!lane.sequencer_runtime_initialized || !orbit.runtime_initialized || block_start < orbit.runtime_sample_frame) {
    engine.resetSequencerLaneRuntime(lane);
    lane.sequencer_start_sample_frame = block_start;
    lane.sequencer_runtime_initialized = true;
    lane.sequencer_join_pending = false;
    orbit.runtime_initialized = true;
    orbit.runtime_sample_frame = block_start;
    orbit.prev_base_angle = orbit.base_angle;
    for (uint32_t i = 0u; i < kMaxOrbitSequencerNotes; ++i) {
      orbit.notes[i].prev_angle = orbit.notes[i].angle;
    }
  }
  if (!drainPendingRatchets(lane, block_start, block_end, engine, out, engine.telemetry)) {
    return false;
  }
  const double block_seconds = static_cast<double>(frames) / std::max(1.0, engine.sample_rate);
  const double base_velocity = orbit.spline_spin_enabled
      ? orbitBaseAngularVelocity(engine, lane, orbit) * (orbit.spline_spin_direction < 0 ? -1.0 : 1.0)
      : 0.0;
  const double previous_base_angle = orbit.base_angle;
  orbit.prev_base_angle = static_cast<float>(previous_base_angle);
  orbit.base_angle = static_cast<float>(wrapRadiansDouble(previous_base_angle + base_velocity * block_seconds));
  const uint16_t pitch_mask = orbitPitchClassMask(engine, orbit);
  const uint32_t line_count = clampU32(orbit.trigger_line_count, 1u, kMaxOrbitTriggerLines);
  const uint32_t note_count = std::min<uint32_t>(orbit.note_count, kMaxOrbitSequencerNotes);
  const OrbitSpeedOffsetStats speed_stats = orbitSpeedOffsetStats(orbit);
  for (uint32_t note_index = 0u; note_index < note_count; ++note_index) {
    OrbitNoteState& note = orbit.notes[note_index];
    if (!note.enabled) {
      note.flash = std::max(0.0f, note.flash - static_cast<float>(block_seconds * 8.0));
      note.prev_angle = note.angle;
      continue;
    }
    const double previous_angle = note.angle;
    note.prev_angle = static_cast<float>(previous_angle);
    const double current_angle = wrapRadiansDouble(
        previous_angle + orbitAngularVelocity(engine, lane, orbit, note, note_index, speed_stats) * block_seconds);
    note.angle = static_cast<float>(current_angle);
    const double previous_visual_angle = orbitVisualAngle(orbit, note_index, previous_angle);
    const double current_visual_angle = orbitVisualAngle(orbit, note_index, current_angle);
    bool triggered = false;
    for (uint32_t line_index = 0u; line_index < line_count; ++line_index) {
      const double line_angle = (kTwoPi * static_cast<double>(line_index)) / static_cast<double>(line_count);
      const double previous_spline_angle = orbitSplineAngleAtRadius(
          orbit,
          note.radius_norm,
          previous_base_angle + line_angle);
      const double current_spline_angle = orbitSplineAngleAtRadius(
          orbit,
          note.radius_norm,
          static_cast<double>(orbit.base_angle) + line_angle);
      const double previous_relative = wrapRadiansDouble(previous_visual_angle - previous_spline_angle);
      const double current_relative = wrapRadiansDouble(current_visual_angle - current_spline_angle);
      double fraction = 0.0;
      if (!crossingFraction(previous_relative, current_relative, fraction)) {
        continue;
      }
      const uint32_t event_seed = hashU32(
          engine.rng_seed ^
          lane.seed ^
          orbit.seed ^
          note.seed ^
          (note_index * 16777619u) ^
          (line_index * 2246822519u) ^
          static_cast<uint32_t>(block_start) ^
          static_cast<uint32_t>(block_start >> 32));
      if (hashUnit(event_seed ^ 0x7f4a7c15u) > clampFloat(note.probability, 0.0f, 1.0f)) {
        continue;
      }
      const float midi_note = orbitNoteMidi(engine, orbit, note, pitch_mask, event_seed);
      const float velocity = note.velocity_range_enabled
          ? clampFloat(
              note.velocity_min + hashUnit(event_seed ^ 0xd1b54a32u) * (note.velocity_max - note.velocity_min),
              0.0f,
              1.0f)
          : clampFloat(note.velocity, 0.0f, 1.0f);
      const float gate_beats = note.gate_range_enabled
          ? clampFloat(
              note.gate_min_beats + hashUnit(event_seed ^ 0x85ebca6bu) * (note.gate_max_beats - note.gate_min_beats),
              0.05f,
              8.0f)
          : clampFloat(note.gate_beats, 0.05f, 8.0f);
      const float hold_seconds = clampFloat(
          gate_beats * (60.0f / std::max(1.0f, engine.transport.bpm)),
          0.001f,
          20.0f);
      const uint64_t event_sample = block_start + static_cast<uint64_t>(
          std::clamp(
              std::llround(std::clamp(fraction, 0.0, 1.0) * static_cast<double>(frames)),
              0ll,
              static_cast<long long>(frames > 0u ? frames - 1u : 0u)));
      const uint32_t event_source = sourceOrFollow(note.target_source_id, orbit.target_source_id);
      if (!sequencerTargetSourceEnabled(engine, event_source)) {
        continue;
      }
      KesshoSequencerEvent event = makeFaceSequencerEvent(
          engine,
          lane,
          lane_index,
          note_index,
          event_source,
          midi_note,
          velocity * clampFloat(lane.velocity, 0.0f, 1.0f),
          hold_seconds,
          event_seed,
          (note_index & 0xffu) | ((line_index & 0xffu) << 8u));
      enqueueFaceEvent(
          lane,
          lane.emitted_hit_count,
          event_sample,
          lane_index,
          note_index,
          line_index,
          line_count,
          event);
      maybeCaptureGeneratedFaceEvent(
          engine,
          lane,
          event_sample,
          lane_index,
          KESSHO_PRODUCT_GENERATED_SEQUENCER_CAPTURE_MODE_ORBIT,
          event.source_id,
          event.midi_note,
          event.velocity,
          event.hold_seconds,
          -1,
          -1,
          static_cast<int32_t>(note_index));
      lane.emitted_hit_count += 1u;
      triggered = true;
    }
    note.flash = triggered
        ? 1.0f
        : std::max(0.0f, note.flash - static_cast<float>(block_seconds * 8.0));
  }
  if (!drainPendingRatchets(lane, block_start, block_end, engine, out, engine.telemetry)) {
    return false;
  }
  orbit.runtime_sample_frame = block_end;
  lane.sequencer_runtime_sample_frame = block_end;
  return true;
}

class ScopedSequencerAudibilityGate {
 public:
  ScopedSequencerAudibilityGate(SequencerBuffer& output, bool muted)
      : output_(output), previous_discard_(output.discard_events) {
    output_.discard_events = previous_discard_ || muted;
  }

  ~ScopedSequencerAudibilityGate() {
    output_.discard_events = previous_discard_;
  }

 private:
  SequencerBuffer& output_;
  bool previous_discard_;
};

} // namespace

  void KesshoProductEngine::generateLaneEvents(
      LaneState* lanes,
      uint32_t lane_count,
      uint32_t frames,
      SequencerBuffer& out) {
  const uint64_t block_start = transport.sample_frame;
  const uint64_t block_end = block_start + frames;
  const bool macro_evolution_active = evolutionDepth() > 0.000001f;
  for (uint32_t lane_index = 0; lane_index < lane_count; ++lane_index) {
    LaneState& lane = lanes[lane_index];
    ScopedSequencerAudibilityGate audibility_gate(out, lane.muted);
    if (lane.sequencer_mode == kSequencerModeAnchorWalker) {
      if (!generateAnchorWalkerLaneEvents(*this, lane, lane_index, frames, out)) {
        return;
      }
      continue;
    }
    if (lane.sequencer_mode == kSequencerModeOrbit) {
      if (!generateOrbitLaneEvents(*this, lane, lane_index, frames, out)) {
        return;
      }
      continue;
    }
    const bool drum_lane = lane.target_source_id == KESSHO_PRODUCT_SOURCE_DRUM;
    if (!lane.enabled || lane.step_count == 0u || lane.clock_division == 0u) {
      resetSequencerLaneRuntime(lane);
      continue;
    }
    if (!sequencerTargetSourceEnabled(*this, lane.target_source_id)) {
      clearPendingRatchets(lane);
      lane.sequencer_runtime_sample_frame = block_end;
      continue;
    }
    const double samples_per_step =
        sequencerSamplesPerStep(transport, sample_rate, lane.clock_division) /
        static_cast<double>(clampFloat(lane.tempo_multiplier, 0.25f, 12.0f));
    if (!lane.sequencer_runtime_initialized || block_start < lane.sequencer_runtime_sample_frame) {
      const bool wait_for_join_boundary = lane.sequencer_join_pending;
      resetSequencerLaneRuntime(lane);
      lane.sequencer_start_sample_frame = wait_for_join_boundary
          ? sequencerLaneStartSampleFrame(
              transport,
              lane,
              sample_rate,
              block_start,
              samples_per_step)
          : sequencerAlignForwardFromOrigin(
              block_start,
              transport.beat_origin_frame,
              samples_per_step);
      lane.sequencer_runtime_initialized = true;
      lane.sequencer_join_pending = false;
    }
    if (!drainPendingRatchets(lane, block_start, block_end, *this, out, telemetry)) {
      return;
    }
    if (static_cast<double>(block_end) <= static_cast<double>(lane.sequencer_start_sample_frame)) {
      lane.sequencer_runtime_sample_frame = block_end;
      continue;
    }
    const double swing_samples = sequencerSwingSamples(transport, lane, samples_per_step);
    const bool nudge_active = nudgeSchedulingActive(*this, lane);
    const uint32_t nudge_active_count = nudge_active ? activeTriggerCount(*this, lane) : 0u;
    const int64_t nudge_scan_padding = nudge_active_count > 0u
        ? static_cast<int64_t>(std::max(1u, lane.step_count))
        : 0;
    const int64_t first_step =
        sequencerFirstRelativeStep(block_start, lane.sequencer_start_sample_frame, samples_per_step) -
        nudge_scan_padding;
    const int64_t last_step =
        sequencerLastRelativeStep(block_end, lane.sequencer_start_sample_frame, samples_per_step) +
        nudge_scan_padding;
    for (int64_t relative_step = first_step; relative_step <= last_step; ++relative_step) {
      if (relative_step < 0) {
        continue;
      }
      const uint32_t step_id = static_cast<uint32_t>(relative_step % static_cast<int64_t>(lane.step_count));
      if (!manualMaskHit(lane, step_id)) {
        continue;
      }
      const uint64_t event_sample = nudgedSequencerEventSample(
          *this,
          lane,
          step_id,
          relative_step,
          samples_per_step,
          swing_samples,
          nudge_active_count);
      if (event_sample < block_start || event_sample >= block_end) {
        continue;
      }
      if (!trigConditionPass(lane.trig_condition, event_sample)) {
        continue;
      }
      if (!stepTrigConditionPass(lane, step_id, relative_step)) {
        continue;
      }
      const uint64_t hit_count_phase = lane.emitted_hit_count;
      const uint32_t probability_seed = lane.seed ^ static_cast<uint32_t>(relative_step * 2654435761ull) ^ (lane_index * 16777619u);
      const float drum_midi_note = drum_lane
          ? selectedDrumVoiceMidi(lane, hit_count_phase, probability_seed)
          : lane.midi_note;
      const uint32_t probability_step_id = subLaneStepForField(
          lane,
          KESSHO_PRODUCT_STEP_FIELD_PROBABILITY,
          step_id,
          relative_step,
          hit_count_phase);
      const float probability_base = stepFloatValue(
          probability_step_id,
          lane.probability_override_set_low,
          lane.probability_override_set_high,
          lane.probability_overrides,
          lane.probability);
      const float probability = evolvedLaneValue(
          lane,
          lane_index,
          step_id,
          event_sample,
          1u,
          probability_base,
          probability_base >= 0.999f ? 0.0f : 0.35f,
          0.0f,
          1.0f);
      if (hashUnit(probability_seed) > probability) {
        continue;
      }
      const uint32_t ratchet_step_id = subLaneStepForField(
          lane,
          KESSHO_PRODUCT_STEP_FIELD_RATCHET,
          step_id,
          relative_step,
          hit_count_phase);
      const uint32_t ratchet = clampU32(
          stepU32Value(
              ratchet_step_id,
              lane.ratchet_override_set_low,
              lane.ratchet_override_set_high,
              lane.ratchet_overrides,
              lane.ratchet),
          1u,
          8u);
      const double ratchet_spacing = samples_per_step / static_cast<double>(ratchet);
      const uint32_t midi_step_id = subLaneStepForField(
          lane,
          KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE,
          step_id,
          relative_step,
          hit_count_phase);
      const float sequenced_midi_note = stepFloatValue(
          midi_step_id,
          lane.midi_note_override_set_low,
          lane.midi_note_override_set_high,
          lane.midi_note_overrides,
          resolveHarmonyMidi(lane, lane_index, step_id, event_sample));
      const uint32_t play_note_mask = !drum_lane && midi_step_id < 64u
          ? lane.play_note_voice_masks[midi_step_id]
          : 0u;
      const float trigger_midi_note = drum_lane ? drum_midi_note : sequenced_midi_note;
      const bool synth_arp_enabled = !drum_lane && lane.arp.enabled;
      if (!drum_lane && !synth_arp_enabled && play_note_mask == 0u && trigger_midi_note < 0.0f) {
        lane.emitted_hit_count += 1u;
        continue;
      }
      const float trigger_velocity = evolvedLaneValue(
          lane,
          lane_index,
          step_id,
          event_sample,
          2u,
          lane.velocity,
          0.25f,
          0.0f,
          1.0f);
      const uint32_t event_seed = probability_seed;
      const uint32_t drum_voice = drum_lane
          ? static_cast<uint32_t>(defaultDrumKitMapEntry(trigger_midi_note).voice)
          : DRUM_NUM_VOICE_TYPES;
      const bool morph_field_active = sequencerStepFieldActive(*this, lane, KESSHO_PRODUCT_STEP_FIELD_MORPH, macro_evolution_active);
      const bool distance_field_active = sequencerStepFieldActive(*this, lane, KESSHO_PRODUCT_STEP_FIELD_DISTANCE, macro_evolution_active);
      const bool expression_field_active = sequencerStepFieldActive(*this, lane, KESSHO_PRODUCT_STEP_FIELD_EXPRESSION, macro_evolution_active);
      const uint32_t drum_target = lane.target_source_id == KESSHO_PRODUCT_SOURCE_DRUM
          ? KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE + drum_voice
          : 0u;
      float trigger_morph = -1.0f;
      float trigger_distance = -1.0f;
      float trigger_expression = -1.0f;
      if (morph_field_active) {
        const uint32_t morph_step_id = subLaneStepForField(
            lane,
            KESSHO_PRODUCT_STEP_FIELD_MORPH,
            step_id,
            relative_step,
            hit_count_phase);
        const float morph_base = stepFloatRangeValue(
            morph_step_id,
            lane.morph_override_set_low,
            lane.morph_override_set_high,
            lane.morph_overrides,
            lane.morph_range_set_low,
            lane.morph_range_set_high,
            lane.morph_range_maxes,
            lane.morph,
            event_seed ^ 0x2c1b3c6du);
        trigger_morph = resolveModulatedValue(
            lane.target_source_id,
            KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID,
            morph_base,
            event_seed);
        if (lane.target_source_id == KESSHO_PRODUCT_SOURCE_DRUM) {
          trigger_morph = resolveModulatedValue(
              drum_target,
              KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID,
              trigger_morph,
              event_seed);
        }
        trigger_morph = evolvedLaneValue(
            lane,
            lane_index,
            step_id,
            event_sample,
            3u,
            trigger_morph,
            0.35f,
            0.0f,
            1.0f);
      }
      if (distance_field_active) {
        const uint32_t distance_step_id = subLaneStepForField(
            lane,
            KESSHO_PRODUCT_STEP_FIELD_DISTANCE,
            step_id,
            relative_step,
            hit_count_phase);
        const float distance_base = stepFloatRangeValue(
            distance_step_id,
            lane.distance_override_set_low,
            lane.distance_override_set_high,
            lane.distance_overrides,
            lane.distance_range_set_low,
            lane.distance_range_set_high,
            lane.distance_range_maxes,
            lane.distance,
            event_seed ^ 0x165667b1u);
        trigger_distance = resolveModulatedValue(
            lane.target_source_id,
            KESSHO_PRODUCT_PARAM_SOURCE_DISTANCE_ID,
            distance_base,
            event_seed);
        if (lane.target_source_id == KESSHO_PRODUCT_SOURCE_DRUM) {
          trigger_distance = resolveModulatedValue(
              drum_target,
              KESSHO_PRODUCT_PARAM_SOURCE_DISTANCE_ID,
              trigger_distance,
              event_seed);
        }
        trigger_distance = evolvedLaneValue(
            lane,
            lane_index,
            step_id,
            event_sample,
            4u,
            trigger_distance,
            0.35f,
            0.0f,
            1.0f);
      }
      if (expression_field_active) {
        const uint32_t expression_step_id = subLaneStepForField(
            lane,
            KESSHO_PRODUCT_STEP_FIELD_EXPRESSION,
            step_id,
            relative_step,
            hit_count_phase);
        const float expression_base = stepFloatRangeValue(
            expression_step_id,
            lane.expression_override_set_low,
            lane.expression_override_set_high,
            lane.expression_overrides,
            lane.expression_range_set_low,
            lane.expression_range_set_high,
            lane.expression_range_maxes,
            lane.expression,
            event_seed ^ 0x51f15ca9u);
        trigger_expression = resolveModulatedValue(
            lane.target_source_id,
            KESSHO_PRODUCT_PARAM_SOURCE_EXPRESSION_ID,
            expression_base,
            event_seed);
        if (lane.target_source_id == KESSHO_PRODUCT_SOURCE_DRUM) {
          trigger_expression = resolveModulatedValue(
              drum_target,
              KESSHO_PRODUCT_PARAM_SOURCE_EXPRESSION_ID,
              trigger_expression,
              event_seed);
        }
        trigger_expression = evolvedLaneValue(
            lane,
            lane_index,
            step_id,
            event_sample,
            5u,
            trigger_expression,
            0.25f,
            0.0f,
            1.0f);
      }
      if (!morph_field_active) {
        lane.last_emitted_morph_valid = false;
      }
      if (!distance_field_active) {
        lane.last_emitted_distance_valid = false;
      }
      if (!expression_field_active) {
        lane.last_emitted_expression_valid = false;
      }
      auto enqueueSequencerNoteAtSample = [&](
          float midi_note,
          float velocity_scale,
          float offset_ms,
          uint32_t voice_ordinal,
          uint32_t ratchet_index,
          uint32_t ratchet_count,
          uint64_t note_sample,
          uint32_t arp_step_index = UINT32_MAX) {
        const uint64_t offset_samples = offset_ms > 0.0f
            ? static_cast<uint64_t>(std::llround(static_cast<double>(offset_ms) * sample_rate / 1000.0))
            : 0u;
        KesshoSequencerEvent event{};
        event.source_id = static_cast<uint16_t>(lane.target_source_id);
        event.lane_id = static_cast<uint16_t>(lane_index);
        event.step_id = static_cast<uint16_t>(step_id);
        event.event_kind = static_cast<uint16_t>(KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON);
        event.midi_note = midi_note;
        event.frequency_hz = midiToFrequency(midi_note);
        event.velocity = clampFloat(trigger_velocity * velocity_scale, 0.0f, 1.0f);
        event.hold_seconds = lane.hold_seconds;
        if (drum_lane) {
          event.send_delay_a = ratchet_count > 1u
              ? static_cast<float>((ratchet_spacing / sample_rate) * 0.8)
              : 1.0e10f;
          event.send_delay_b = ratchet_count > 1u
              ? static_cast<float>((ratchet_spacing / sample_rate) * 0.15)
              : 1.0e10f;
          event.send_granular = clampFloat(sequenced_midi_note - lane.midi_note, -24.0f, 24.0f);
        } else {
          event.send_delay_a = ratchet_count > 1u ? 1.0f / static_cast<float>(ratchet_count) : 1.0f;
        }
        event.morph = trigger_morph;
        event.distance = trigger_distance;
        event.expression = trigger_expression;
        const uint64_t pad_voice_phase = lane.emitted_hit_count + static_cast<uint64_t>(voice_ordinal);
        const uint32_t pad_voice_index =
            padVoiceIndexFromMask(lane.target_pad_voice_mask, pad_voice_phase);
        event.flags =
            sequencerPadVoiceEventFlags(pad_voice_index) |
            ratchet_index |
            (voice_ordinal << 8u);
        PendingRatchetEvent pending{};
        pending.parent_step_id = static_cast<uint64_t>(relative_step);
        pending.absolute_sample = note_sample + offset_samples;
        pending.lane_index = lane_index;
        pending.step_index = step_id;
        pending.arp_step_index = arp_step_index;
        pending.ratchet_index = ratchet_index;
        pending.ratchet_count = ratchet_count;
        pending.event = event;
        pushPendingRatchet(lane, pending);
      };
      auto enqueueSequencerNote = [&](float midi_note, float velocity_scale, float offset_ms, uint32_t voice_ordinal, uint32_t ratchet_index) {
        const uint64_t ratchet_sample = event_sample + static_cast<uint64_t>(std::llround(ratchet_spacing * ratchet_index));
        enqueueSequencerNoteAtSample(midi_note, velocity_scale, offset_ms, voice_ordinal, ratchet_index, ratchet, ratchet_sample);
      };
      if (synth_arp_enabled) {
        ProductArpRuntimeState& arp = lane.arp;
        // A parent trigger replaces only the phrase it owns. UI edits stage the
        // next phrase and must not erase notes already scheduled for this one.
        clearPendingArpRatchets(lane);
        const uint32_t arp_length = std::max(1u, std::min<uint32_t>(arp.length, kMaxProductArpSteps));
        const uint64_t window_end = productArpWindowEndSample(
            *this,
            lane,
            relative_step,
            event_sample,
            samples_per_step,
            swing_samples,
            nudge_active_count);
        const uint64_t fallback_window_samples = static_cast<uint64_t>(std::max<int64_t>(
            1,
            std::llround(samples_per_step)));
        const uint64_t window_samples = window_end > event_sample
            ? window_end - event_sample
            : fallback_window_samples;
        const uint32_t window_slots = productArpSlotsPerWindow(arp, window_samples, samples_per_step);
        if (!arp.runtime_initialized) {
          arp.cursor = arp.cursor % arp_length;
          arp.current_step = arp.cursor;
          arp.next_event_sample = event_sample;
          arp.runtime_initialized = true;
        } else if (arp.next_event_sample != event_sample) {
          arp.next_event_sample = event_sample;
        }
        uint32_t emitted_arp_slots = 0u;
        while (emitted_arp_slots < window_slots && emitted_arp_slots < kMaxPendingRatchetsPerLane) {
          const uint32_t arp_step = arp.cursor % arp_length;
          const bool arp_step_active = (arp.active_mask & (1u << arp_step)) != 0u;
          const float arp_midi_note = arp.midi_notes[arp_step];
          const uint64_t arp_sample = productArpSlotSample(
              event_sample,
              window_samples,
              window_slots,
              emitted_arp_slots);
          if (arp_step_active && arp_midi_note >= 0.0f) {
            enqueueSequencerNoteAtSample(
                arp_midi_note,
                1.0f,
                0.0f,
                emitted_arp_slots,
                0u,
                1u,
                arp_sample,
                arp_step);
          }
          advanceProductArpCursor(arp);
          ++emitted_arp_slots;
        }
        arp.next_event_sample = window_end;
      } else {
        for (uint32_t ratchet_index = 0; ratchet_index < ratchet; ++ratchet_index) {
          if (play_note_mask != 0u) {
            uint32_t voice_ordinal = 0u;
            for (uint32_t voice = 0u; voice < kMaxProductPlayVoicesPerStep; ++voice) {
              if ((play_note_mask & (1u << voice)) == 0u) {
                continue;
              }
              const ProductPlayNoteOverride& note = lane.play_note_overrides[midi_step_id][voice];
              enqueueSequencerNote(note.midi_note, note.velocity, note.offset_ms, voice_ordinal, ratchet_index);
              ++voice_ordinal;
            }
          } else {
            enqueueSequencerNote(trigger_midi_note, 1.0f, 0.0f, 0u, ratchet_index);
          }
        }
      }
      lane.emitted_hit_count += 1u;
    }
    if (!drainPendingRatchets(lane, block_start, block_end, *this, out, telemetry)) {
      return;
    }
    lane.sequencer_runtime_sample_frame = block_end;
  }
}

  void KesshoProductEngine::generateSequencerEvents(uint32_t frames) {
  sequencer_events.clear();
  if (!transport.running) {
    return;
  }
  generateLaneEvents(synth_lanes, synth_lane_count, frames, sequencer_events);
  generateLaneEvents(drum_lanes, drum_lane_count, frames, sequencer_events);
  sequencer_events.sortByOffset();
}

  void KesshoProductEngine::triggerSequencerEvent(const KesshoSequencerEvent& event) {
  if (!sequencerTargetSourceEnabled(*this, event.source_id)) {
    return;
  }
  const uint32_t seed = hashU32(
      rng_seed ^
      (static_cast<uint32_t>(event.lane_id) * 16777619u) ^
      (static_cast<uint32_t>(event.step_id) * 2246822519u) ^
      (event.flags * 3266489917u) ^
      static_cast<uint32_t>(transport.sample_frame));
  triggerVoice(
      event.source_id,
      event.midi_note,
      event.velocity,
      event.hold_seconds,
      event.morph,
      event.distance,
      event.expression,
      seed,
      0u,
      true,
      event.source_id == KESSHO_PRODUCT_SOURCE_DRUM ? event.send_granular : 0.0f,
      event.source_id == KESSHO_PRODUCT_SOURCE_DRUM ? event.send_delay_a : 1.0e10f,
      event.source_id == KESSHO_PRODUCT_SOURCE_DRUM ? event.send_delay_b : 1.0e10f,
      padVoiceIndexFromSequencerEventFlags(event.flags),
      event.source_id == KESSHO_PRODUCT_SOURCE_DRUM ? 1.0f : event.send_delay_a);
}
