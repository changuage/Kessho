#include "../KesshoProductEngineInternal.h"

  void KesshoProductEngine::generateLaneEvents(
      const LaneState* lanes,
      uint32_t lane_count,
      uint32_t frames,
      SequencerBuffer& out) {
  const uint64_t block_start = transport.sample_frame;
  const uint64_t block_end = block_start + frames;
  for (uint32_t lane_index = 0; lane_index < lane_count; ++lane_index) {
    const LaneState& lane = lanes[lane_index];
    if (!lane.enabled || lane.step_count == 0u || lane.clock_division == 0u) {
      continue;
    }
    const double samples_per_step = sequencerSamplesPerStep(transport, sample_rate, lane.clock_division);
    const double swing_samples = sequencerSwingSamples(transport, lane, samples_per_step);
    const int64_t first_step = sequencerFirstStep(block_start, samples_per_step);
    const int64_t last_step = sequencerLastStep(block_end, samples_per_step);
    for (int64_t absolute_step = first_step; absolute_step <= last_step; ++absolute_step) {
      if (absolute_step < 0) {
        continue;
      }
      const uint32_t step_id = static_cast<uint32_t>(absolute_step % static_cast<int64_t>(lane.step_count));
      if (!manualMaskHit(lane, step_id)) {
        continue;
      }
      double event_sample_double = static_cast<double>(absolute_step) * samples_per_step;
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
      if (!stepTrigConditionPass(lane, step_id, absolute_step)) {
        continue;
      }
      const uint32_t probability_seed = lane.seed ^ static_cast<uint32_t>(absolute_step * 2654435761ull) ^ (lane_index * 16777619u);
      const uint32_t probability_step_id = subLaneStepForField(
          lane,
          KESSHO_PRODUCT_STEP_FIELD_PROBABILITY,
          step_id,
          absolute_step);
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
          absolute_step);
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
      for (uint32_t ratchet_index = 0; ratchet_index < ratchet; ++ratchet_index) {
        const uint64_t ratchet_sample = event_sample + static_cast<uint64_t>(std::llround(ratchet_spacing * ratchet_index));
        if (ratchet_sample < block_start || ratchet_sample >= block_end) {
          continue;
        }
        KesshoSequencerEvent event{};
        event.sample_offset = static_cast<uint32_t>(ratchet_sample - block_start);
        event.source_id = static_cast<uint16_t>(lane.target_source_id);
        event.lane_id = static_cast<uint16_t>(lane_index);
        event.step_id = static_cast<uint16_t>(step_id);
        event.event_kind = static_cast<uint16_t>(KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON);
        const uint32_t midi_step_id = subLaneStepForField(
            lane,
            KESSHO_PRODUCT_STEP_FIELD_MIDI_NOTE,
            step_id,
            absolute_step);
        event.midi_note = stepFloatValue(
            midi_step_id,
            lane.midi_note_override_set_low,
            lane.midi_note_override_set_high,
            lane.midi_note_overrides,
            resolveHarmonyMidi(lane, lane_index, step_id, ratchet_sample));
        event.frequency_hz = midiToFrequency(event.midi_note);
        event.velocity = evolvedLaneValue(
            lane,
            lane_index,
            step_id,
            ratchet_sample,
            2u,
            lane.velocity,
            0.25f,
            0.0f,
            1.0f) /
            static_cast<float>(ratchet_index + 1u);
        event.hold_seconds = lane.hold_seconds;
        const uint32_t event_seed = probability_seed ^ (ratchet_index * 374761393u);
        const uint32_t morph_step_id = subLaneStepForField(
            lane,
            KESSHO_PRODUCT_STEP_FIELD_MORPH,
            step_id,
            absolute_step);
        const uint32_t distance_step_id = subLaneStepForField(
            lane,
            KESSHO_PRODUCT_STEP_FIELD_DISTANCE,
            step_id,
            absolute_step);
        const uint32_t expression_step_id = subLaneStepForField(
            lane,
            KESSHO_PRODUCT_STEP_FIELD_EXPRESSION,
            step_id,
            absolute_step);
        const float morph_base = stepFloatValue(
            morph_step_id,
            lane.morph_override_set_low,
            lane.morph_override_set_high,
            lane.morph_overrides,
            lane.morph);
        const float distance_base = stepFloatValue(
            distance_step_id,
            lane.distance_override_set_low,
            lane.distance_override_set_high,
            lane.distance_overrides,
            lane.distance);
        const float expression_base = stepFloatValue(
            expression_step_id,
            lane.expression_override_set_low,
            lane.expression_override_set_high,
            lane.expression_overrides,
            lane.expression);
        event.morph = resolveModulatedValue(lane.target_source_id, KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID, morph_base, event_seed);
        event.distance = resolveModulatedValue(lane.target_source_id, KESSHO_PRODUCT_PARAM_SOURCE_DISTANCE_ID, distance_base, event_seed);
        event.expression = resolveModulatedValue(lane.target_source_id, KESSHO_PRODUCT_PARAM_SOURCE_EXPRESSION_ID, expression_base, event_seed);
        if (lane.target_source_id == KESSHO_PRODUCT_SOURCE_DRUM) {
          const uint32_t drum_voice = static_cast<uint32_t>(std::clamp(roundedInt(event.midi_note - 36.0f), 0, DRUM_NUM_VOICE_TYPES - 1));
          const uint32_t drum_target = KESSHO_PRODUCT_DRUM_RANGE_TARGET_BASE + drum_voice;
          event.morph = resolveModulatedValue(drum_target, KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID, event.morph, event_seed);
          event.distance = resolveModulatedValue(drum_target, KESSHO_PRODUCT_PARAM_SOURCE_DISTANCE_ID, event.distance, event_seed);
          event.expression = resolveModulatedValue(drum_target, KESSHO_PRODUCT_PARAM_SOURCE_EXPRESSION_ID, event.expression, event_seed);
        }
        event.morph = evolvedLaneValue(lane, lane_index, step_id, ratchet_sample, 3u, event.morph, 0.35f, 0.0f, 1.0f);
        event.distance = evolvedLaneValue(lane, lane_index, step_id, ratchet_sample, 4u, event.distance, 0.35f, 0.0f, 1.0f);
        event.expression = evolvedLaneValue(lane, lane_index, step_id, ratchet_sample, 5u, event.expression, 0.25f, 0.0f, 1.0f);
        event.flags = ratchet_index;
        if (!out.push(event)) {
          telemetry.last_error_code = KESSHO_PRODUCT_ERROR_EVENT_QUEUE_FULL;
          return;
        }
      }
    }
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
      seed);
}
