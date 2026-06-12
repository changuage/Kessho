#include "../KesshoProductEngineInternal.h"

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
      return 36.0f + static_cast<float>(voice);
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

void recordDrainedRatchet(
    kessho::product::internal::LaneState& lane,
    const kessho::product::internal::PendingRatchetEvent& pending) {
  const KesshoSequencerEvent& event = pending.event;
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
  const double samples_per_tick = walkerSamplesPerTick(engine, walker);
  if (!lane.enabled || !walker.enabled || !std::isfinite(samples_per_tick) || samples_per_tick <= 0.0) {
    engine.resetSequencerLaneRuntime(lane);
    return true;
  }
  if (!lane.sequencer_runtime_initialized || !walker.runtime_initialized || block_start < walker.runtime_sample_frame) {
    const bool wait_for_join_boundary = lane.sequencer_join_pending;
    engine.resetSequencerLaneRuntime(lane);
    const uint64_t start_sample = wait_for_join_boundary
        ? sequencerLaneStartSampleFrame(engine.transport, lane, engine.sample_rate, block_start, samples_per_tick)
        : sequencerAlignForwardSampleFrame(block_start, samples_per_tick);
    lane.sequencer_start_sample_frame = start_sample;
    lane.sequencer_runtime_initialized = true;
    lane.sequencer_join_pending = false;
    walker.runtime_initialized = true;
    walker.runtime_sample_frame = block_start;
    walker.next_walk_sample = start_sample;
    walker.anchor_midi = walkerAnchorMidi(engine, walker);
    walker.anchor_valid = true;
    walker.cursor_degree = 0;
    walker.cursor_midi = degreeMidiFromMask(
        walker.anchor_midi,
        0,
        walker.output_range_min,
        walker.output_range_max,
        walkerPitchClassMask(engine, walker));
    walker.cursor_valid = true;
  }
  if (!drainPendingRatchets(lane, block_start, block_end, engine, out, engine.telemetry)) {
    return false;
  }
  const uint16_t pitch_mask = walkerPitchClassMask(engine, walker);
  const uint32_t pattern_length = clampU32(walker.gesture_pattern_length, 1u, kMaxAnchorWalkerPatternSteps);
  const double swing_samples = samples_per_tick * 0.5 * clampFloat(walker.swing, 0.0f, 0.75f);
  uint32_t scheduled_ticks = 0u;
  while (walker.next_walk_sample < block_end && scheduled_ticks < 64u) {
    const uint64_t tick_index = lane.emitted_hit_count;
    const uint32_t pattern_index = static_cast<uint32_t>(tick_index % pattern_length);
    const double swung_sample = static_cast<double>(walker.next_walk_sample) +
        (((tick_index & 1u) != 0u) ? swing_samples : 0.0);
    const uint64_t event_sample = static_cast<uint64_t>(std::llround(swung_sample));
    const uint64_t tick_advance = static_cast<uint64_t>(std::max<long long>(
        1ll,
        std::llround(samples_per_tick)));
    walker.next_walk_sample += tick_advance;
    ++scheduled_ticks;
    if (event_sample < block_start) {
      continue;
    }
    if (!engine.trigConditionPass(lane.trig_condition, event_sample)) {
      continue;
    }
    const int32_t gesture_delta = clampInt(walker.gesture_pattern[pattern_index], -7, 7);
    walker.anchor_midi = walkerAnchorMidi(engine, walker);
    walker.anchor_valid = true;
    walker.cursor_degree = clampInt(walker.cursor_degree + gesture_delta, -256, 256);
    walker.cursor_midi = degreeMidiFromMask(
        walker.anchor_midi,
        walker.cursor_degree,
        walker.output_range_min,
        walker.output_range_max,
        pitch_mask);
    walker.cursor_valid = true;
    uint32_t active_layer_count = 0u;
    for (uint32_t layer_index = 0u; layer_index < kMaxAnchorWalkerLayers; ++layer_index) {
      if (walker.layers[layer_index].enabled) {
        ++active_layer_count;
      }
    }
    active_layer_count = std::max(1u, active_layer_count);
    uint32_t layer_event_index = 0u;
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
        layer_midi = degreeMidiFromMask(
            walker.anchor_midi,
            layer_degree + layer.diatonic_offset,
            walker.output_range_min,
            walker.output_range_max,
            pitch_mask) + static_cast<float>(layer.transpose_semitones);
        layer_midi = snapMidiToMask(layer_midi, walker.output_range_min, walker.output_range_max, pitch_mask);
      }
      const float velocity = clampFloat(
          lane.velocity * layer.velocity_scale + layer.velocity_offset,
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
      enqueueFaceEvent(
          lane,
          tick_index,
          layer_sample,
          lane_index,
          pattern_index,
          layer_event_index,
          active_layer_count,
          event);
      ++layer_event_index;
    }
    lane.emitted_hit_count += 1u;
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

double orbitBaseAngularVelocity(
    const KesshoProductEngine& engine,
    const kessho::product::internal::OrbitSequencerState& orbit) {
  const double beats_per_second = std::max(1.0f, engine.transport.bpm) / 60.0;
  const double orbit_multiplier = static_cast<double>(kessho::product::internal::clampFloat(
      orbit.bpm_percent,
      1.0f,
      800.0f)) / 100.0;
  return kessho::product::internal::kTwoPi * beats_per_second * orbit_multiplier * 0.25;
}

double orbitAngularVelocity(
    const KesshoProductEngine& engine,
    const kessho::product::internal::OrbitSequencerState& orbit,
    const kessho::product::internal::OrbitNoteState& note) {
  double angular_velocity = orbitBaseAngularVelocity(engine, orbit);
  if (note.speed_mode == 0u) {
    angular_velocity *= static_cast<double>(kessho::product::internal::clampFloat(
        note.speed_value,
        1.0f,
        800.0f)) / 100.0;
  } else {
    angular_velocity /= static_cast<double>(kessho::product::internal::clampFloat(
        note.speed_value,
        0.125f,
        64.0f));
  }
  return angular_velocity * (note.direction < 0 ? -1.0 : 1.0);
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
      ? orbitBaseAngularVelocity(engine, orbit) * (orbit.spline_spin_direction < 0 ? -1.0 : 1.0)
      : 0.0;
  const double previous_base_angle = orbit.base_angle;
  orbit.prev_base_angle = static_cast<float>(previous_base_angle);
  orbit.base_angle = static_cast<float>(wrapRadiansDouble(previous_base_angle + base_velocity * block_seconds));
  const uint16_t pitch_mask = orbitPitchClassMask(engine, orbit);
  const uint32_t line_count = clampU32(orbit.trigger_line_count, 1u, kMaxOrbitTriggerLines);
  const uint32_t note_count = std::min<uint32_t>(orbit.note_count, kMaxOrbitSequencerNotes);
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
        previous_angle + orbitAngularVelocity(engine, orbit, note) * block_seconds);
    note.angle = static_cast<float>(current_angle);
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
      const double previous_relative = wrapRadiansDouble(previous_angle - previous_spline_angle);
      const double current_relative = wrapRadiansDouble(current_angle - current_spline_angle);
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
          : sequencerAlignForwardSampleFrame(block_start, samples_per_step);
      lane.sequencer_runtime_initialized = true;
      lane.sequencer_join_pending = false;
    }
    if (!drainPendingRatchets(lane, block_start, block_end, *this, out, telemetry)) {
      return;
    }
    if (block_end <= lane.sequencer_start_sample_frame) {
      lane.sequencer_runtime_sample_frame = block_end;
      continue;
    }
    const double swing_samples = sequencerSwingSamples(transport, lane, samples_per_step);
    const int64_t first_step = sequencerFirstRelativeStep(block_start, lane.sequencer_start_sample_frame, samples_per_step);
    const int64_t last_step = sequencerLastRelativeStep(block_end, lane.sequencer_start_sample_frame, samples_per_step);
    for (int64_t relative_step = first_step; relative_step <= last_step; ++relative_step) {
      if (relative_step < 0) {
        continue;
      }
      const uint32_t step_id = static_cast<uint32_t>(relative_step % static_cast<int64_t>(lane.step_count));
      if (!manualMaskHit(lane, step_id)) {
        continue;
      }
      double event_sample_double = static_cast<double>(lane.sequencer_start_sample_frame) +
          static_cast<double>(relative_step) * samples_per_step;
      if ((step_id & 1u) != 0u) {
        event_sample_double += swing_samples;
      }
      const uint64_t event_sample = static_cast<uint64_t>(std::llround(event_sample_double));
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
      const float trigger_midi_note = drum_lane ? drum_midi_note : sequenced_midi_note;
      const float trigger_frequency = midiToFrequency(trigger_midi_note);
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
          ? static_cast<uint32_t>(std::clamp(roundedInt(trigger_midi_note - 36.0f), 0, DRUM_NUM_VOICE_TYPES - 1))
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
      for (uint32_t ratchet_index = 0; ratchet_index < ratchet; ++ratchet_index) {
        const uint64_t ratchet_sample = event_sample + static_cast<uint64_t>(std::llround(ratchet_spacing * ratchet_index));
        KesshoSequencerEvent event{};
        event.source_id = static_cast<uint16_t>(lane.target_source_id);
        event.lane_id = static_cast<uint16_t>(lane_index);
        event.step_id = static_cast<uint16_t>(step_id);
        event.event_kind = static_cast<uint16_t>(KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON);
        event.midi_note = trigger_midi_note;
        event.frequency_hz = trigger_frequency;
        event.velocity = trigger_velocity;
        event.hold_seconds = lane.hold_seconds;
        if (drum_lane) {
          event.send_delay_a = ratchet > 1u
              ? static_cast<float>((ratchet_spacing / sample_rate) * 0.8)
              : 1.0e10f;
          event.send_delay_b = ratchet > 1u
              ? static_cast<float>((ratchet_spacing / sample_rate) * 0.15)
              : 1.0e10f;
          event.send_granular = clampFloat(sequenced_midi_note - lane.midi_note, -24.0f, 24.0f);
        } else {
          event.send_delay_a = ratchet > 1u ? 1.0f / static_cast<float>(ratchet) : 1.0f;
        }
        event.morph = trigger_morph;
        event.distance = trigger_distance;
        event.expression = trigger_expression;
        const uint32_t pad_voice_index =
            padVoiceIndexFromMask(lane.target_pad_voice_mask, lane.emitted_hit_count);
        event.flags = sequencerPadVoiceEventFlags(pad_voice_index) | ratchet_index;
        PendingRatchetEvent pending{};
        pending.parent_step_id = static_cast<uint64_t>(relative_step);
        pending.absolute_sample = ratchet_sample;
        pending.lane_index = lane_index;
        pending.step_index = step_id;
        pending.ratchet_index = ratchet_index;
        pending.ratchet_count = ratchet;
        pending.event = event;
        pushPendingRatchet(lane, pending);
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
