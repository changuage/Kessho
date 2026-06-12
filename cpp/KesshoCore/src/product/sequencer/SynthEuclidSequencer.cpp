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
    const bool drum_lane = lane.target_source_id == KESSHO_PRODUCT_SOURCE_DRUM;
    if (!lane.enabled || lane.step_count == 0u || lane.clock_division == 0u) {
      resetSequencerLaneRuntime(lane);
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
    if (!drainPendingRatchets(lane, block_start, block_end, out, telemetry)) {
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
    if (!drainPendingRatchets(lane, block_start, block_end, out, telemetry)) {
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
