#include "../KesshoProductEngineInternal.h"

namespace {

uint64_t arrangementFrames(double sample_rate, float seconds) {
  return std::max<uint64_t>(1u, static_cast<uint64_t>(std::llround(
      sample_rate * static_cast<double>(std::max(0.001f, seconds)))));
}

// Mixes the engine seed with the slot's stable part_id so a stream depends on
// who the slot is, never on where it sits.
uint32_t randomSlotStreamSeed(uint32_t engine_seed, uint32_t part_id) {
  uint32_t mixed = hashU32(engine_seed ^ 0x52414e44u);
  mixed = hashU32(mixed ^ hashU32(part_id + 0x9e3779b9u));
  return mixed == 0u ? 1u : mixed;
}

double arrangementNextRandom(uint32_t& state) {
  uint32_t t = (state += 0x6d2b79f5u);
  t = (t ^ (t >> 15u)) * (t | 1u);
  t ^= t + ((t ^ (t >> 7u)) * (t | 61u));
  return static_cast<double>(t ^ (t >> 14u)) / 4294967296.0;
}

struct ArrangementChordVoice {
  uint32_t source_id = 0u;
  float midi = 60.0f;
  uint32_t voice_index = 0u;
  double base_delay_seconds = 0.0;
  float velocity = 1.0f;
};

} // namespace

void KesshoProductEngine::resetArrangementRuntime() {
  arrangement.chord_phrase_start_frame = transport.sample_frame;
  arrangement.chord_phrase_index = harmony.next_phrase_index > 0u
      ? harmony.next_phrase_index - 1u
      : 0u;
  for (uint32_t lane_index = 0u; lane_index < kMaxRandomSlotLanes; ++lane_index) {
    resetRandomSlotRuntime(lane_index);
  }
}

void KesshoProductEngine::resetRandomSlotRuntime(uint32_t lane_index) {
  if (lane_index >= kMaxRandomSlotLanes) return;
  const LaneState& lane = synth_lanes[lane_index];
  RandomSlotState& random = synth_lanes[lane_index].random;
  random.stream_state = randomSlotStreamSeed(rng_seed, random.part_id);
  random.next_phrase_frame = random.initial_delay_seconds <= 0.0f
      ? transport.sample_frame
      : transport.sample_frame + arrangementFrames(sample_rate, random.initial_delay_seconds);
  random.phrase_index = 0u;
  random.chord_pending = lane.sequencer_mode == kSequencerModeRandom && lane.enabled &&
      random.mode == kRandomSlotModeChords;
  random.pending_count = 0u;
}

// A Random lane that becomes active while the transport runs joins on the
// shared phrase timeline, as the singleton producers did when enabled.
void KesshoProductEngine::armRandomSlot(uint32_t lane_index) {
  if (lane_index >= kMaxRandomSlotLanes) return;
  const LaneState& lane = synth_lanes[lane_index];
  RandomSlotState& random = synth_lanes[lane_index].random;
  const bool active = lane.sequencer_mode == kSequencerModeRandom && lane.enabled;
  if (!active) {
    random.chord_pending = false;
    return;
  }
  if (random.mode == kRandomSlotModeChords) {
    if (!transport.running) random.chord_pending = true;
    return;
  }
  random.chord_pending = false;
  if (transport.running) {
    const uint64_t phrase_frames = arrangementFrames(sample_rate, random.phrase_seconds);
    const uint64_t next_shared_boundary = arrangement.chord_phrase_start_frame + phrase_frames;
    random.next_phrase_frame = std::max(transport.sample_frame, next_shared_boundary);
    random.phrase_index = arrangement.chord_phrase_index + 1u;
  }
}

// Harmony owns the pitches; every active Random Chords lane retriggers the
// newly resolved pool at each Harmony tick.
void KesshoProductEngine::requestRandomChordRetrigger() {
  for (uint32_t lane_index = 0u; lane_index < kMaxRandomSlotLanes; ++lane_index) {
    LaneState& lane = synth_lanes[lane_index];
    lane.random.chord_pending = lane.sequencer_mode == kSequencerModeRandom && lane.enabled &&
        lane.random.mode == kRandomSlotModeChords;
  }
}

void KesshoProductEngine::applyRandomSlotParamEvent(LaneState& lane, const KesshoProductEvent& event) {
  RandomSlotState& random = lane.random;
  const auto retrigger_chords = [&]() {
    random.chord_pending = lane.sequencer_mode == kSequencerModeRandom && lane.enabled &&
        random.mode == kRandomSlotModeChords;
  };
  switch (event.param_id) {
    case KESSHO_PRODUCT_PARAM_SEQUENCER_RANDOM_MODE_ID: {
      const uint32_t next_mode = clampU32(
          static_cast<uint32_t>(std::lround(std::max(0.0f, event.value))),
          kRandomSlotModeChords, kRandomSlotModeNotes);
      if (random.mode != next_mode) {
        random.mode = next_mode;
        random.pending_count = 0u;
        armRandomSlot(event.index);
      }
      break;
    }
    case KESSHO_PRODUCT_PARAM_SEQUENCER_RANDOM_VOICE_COUNT_ID:
      random.voice_count = clampU32(static_cast<uint32_t>(std::lround(event.value)), 1u, 8u);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_RANDOM_WAVE_SPREAD_ID:
      random.requested_wave_spread = clampFloat(event.value, 0.0f, 1.0f);
      if (!transport.running) {
        random.wave_spread = random.requested_wave_spread;
        retrigger_chords();
      }
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_RANDOM_OCTAVE_ID: {
      const int32_t next_octave = std::max(-4, std::min(4, static_cast<int32_t>(std::lround(event.value))));
      random.requested_octave = next_octave;
      if (!transport.running && random.octave != next_octave) {
        random.octave = next_octave;
        retrigger_chords();
      }
      break;
    }
    case KESSHO_PRODUCT_PARAM_SEQUENCER_RANDOM_PAD_SPLIT_ID:
      random.pad_split = event.value >= 0.5f;
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_RANDOM_PHRASE_SECONDS_ID:
      random.phrase_seconds = clampFloat(event.value, 0.001f, 4096.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_RANDOM_DENSITY_ID:
      random.density = clampFloat(event.value, 0.1f, 12.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_RANDOM_NOTES_OCTAVE_ID:
      random.notes_octave = std::max(-4, std::min(4, static_cast<int32_t>(std::lround(event.value))));
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_RANDOM_OCTAVE_RANGE_ID:
      random.octave_range = clampU32(static_cast<uint32_t>(std::lround(event.value)), 1u, 4u);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_RANDOM_HOLD_SECONDS_ID:
      random.hold_seconds = clampFloat(event.value, 0.02f, 24.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_RANDOM_VELOCITY_MIN_ID:
      random.velocity_min = clampFloat(event.value, 0.001f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_RANDOM_VELOCITY_MAX_ID:
      random.velocity_max = clampFloat(event.value, 0.001f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_RANDOM_CHORD_BIAS_ID:
      random.chord_bias = clampFloat(event.value, 0.0f, 1.0f);
      break;
    case KESSHO_PRODUCT_PARAM_SEQUENCER_RANDOM_INITIAL_DELAY_SECONDS_ID:
      random.initial_delay_seconds = clampFloat(event.value, 0.0f, 4096.0f);
      break;
    default:
      break;
  }
}

void KesshoProductEngine::generateRandomLaneEvents(uint32_t lane_index, uint32_t frames, SequencerBuffer& out) {
  if (!transport.running || frames == 0u || lane_index >= kMaxRandomSlotLanes ||
      !random_slot_pending_storage) return;
  LaneState& lane = synth_lanes[lane_index];
  RandomSlotState& random = lane.random;
  RandomSlotPendingEvent* pending_events = random_slot_pending_storage->events[lane_index];
  const uint32_t lane_source_id = clampU32(lane.target_source_id, 1u, kSourceCount);
  const bool lane_active = lane.enabled;
  const uint64_t block_start = transport.sample_frame;
  const uint64_t block_end = block_start + frames;
  const auto next_random = [&]() { return arrangementNextRandom(random.stream_state); };

  const auto next_capture_attack_id = [&]() {
    const uint64_t id = generated_sequencer_capture_attack_counter++;
    if (generated_sequencer_capture_attack_counter == 0u) generated_sequencer_capture_attack_counter = 1u;
    return id;
  };
  const auto arrangement_capture_wanted = [&](uint32_t mode) {
    return generated_sequencer_capture_ring != nullptr &&
        kessho::product::shouldCaptureGeneratedSequencerEvent(
            generated_sequencer_capture_config, lane_index, mode);
  };
  const auto captureArrangementNote = [&](uint32_t mode, uint64_t absolute_sample,
                                          const KesshoSequencerEvent& event, uint32_t source_id,
                                          uint64_t attack_id) {
    if (mode == 0u || !arrangement_capture_wanted(mode)) return;
    KesshoProductGeneratedSequencerCaptureEvent captured{};
    captured.event_id = generated_sequencer_capture_event_counter++;
    captured.absolute_sample = absolute_sample;
    captured.source_lane_index = lane_index;
    captured.source_mode = mode;
    captured.target_source_id = source_id;
    captured.midi_note = event.midi_note;
    captured.velocity = event.velocity;
    captured.gate_seconds = event.hold_seconds;
    captured.source_step_index = -1;
    captured.source_layer_index = -1;
    captured.source_note_index = -1;
    captured.target_step_index = -1;
    captured.target_step_float = -1.0f;
    captured.nudge = 0.0f;
    captured.attack_id = attack_id != 0u ? attack_id : next_capture_attack_id();
    generated_sequencer_capture_ring->push(captured);
  };

  const auto queue_note = [&](uint64_t absolute_sample, uint32_t source_id, float midi,
                              float velocity, float hold_seconds, uint32_t voice_index,
                              float morph, float distance, float expression,
                              uint32_t visual_kind, uint64_t phrase_start_sample,
                              uint64_t phrase_index, float phrase_seconds,
                              float trigger_interval_seconds, uint32_t capture_mode,
                              uint64_t capture_attack_id) {
    if (random.pending_count >= kMaxRandomSlotPendingEvents) return;
    RandomSlotPendingEvent& pending = pending_events[random.pending_count++];
    pending.absolute_sample = absolute_sample;
    pending.event = {};
    pending.event.source_id = static_cast<uint16_t>(source_id);
    pending.event.lane_id = 0xfffeu;
    pending.event.step_id = static_cast<uint16_t>(voice_index);
    pending.event.event_kind = static_cast<uint16_t>(KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON);
    pending.event.midi_note = clampFloat(midi, 0.0f, 127.0f);
    pending.event.velocity = clampFloat(velocity, 0.001f, 1.0f);
    pending.event.hold_seconds = clampFloat(hold_seconds, 0.02f, 24.0f);
    pending.event.morph = morph;
    pending.event.distance = distance;
    pending.event.expression = expression;
    pending.event.send_delay_a = 1.0e10f;
    pending.event.send_delay_b = 1.0e10f;
    if (source_id == KESSHO_PRODUCT_SOURCE_PAD1 || source_id == KESSHO_PRODUCT_SOURCE_PAD2) {
      pending.event.flags = sequencerPadVoiceEventFlags(voice_index % kProductPadVoiceCount);
    }
    pending.capture_mode = capture_mode;
    pending.capture_attack_id = capture_attack_id;
    // The visualizers are phrase previews, not trigger-history meters. Publish
    // the exact event as soon as it enters the arrangement queue so every dot
    // is visible before the playhead reaches it.
    if (visual_kind != 0u && source_id >= 1u && source_id <= kSourceCount &&
        sources[source_id - 1u].enabled &&
        (simple_sequencer_visual_demand_mask & visual_kind) != 0u) {
      KesshoProductSimpleSequencerVisualEvent visual{};
      visual.event_id = simple_sequencer_visual_event_counter++;
      visual.absolute_sample = absolute_sample;
      visual.phrase_start_sample = phrase_start_sample;
      visual.phrase_index = phrase_index;
      visual.kind = visual_kind;
      visual.target_source_id = pending.event.source_id;
      visual.midi_note = pending.event.midi_note;
      visual.velocity = pending.event.velocity;
      visual.gate_seconds = pending.event.hold_seconds;
      visual.voice_index = voice_index;
      visual.phrase_seconds = phrase_seconds;
      visual.trigger_interval_seconds = trigger_interval_seconds;
      simple_sequencer_visual_ring.push(visual);
    }
  };

  const auto queue_chord = [&](uint64_t absolute_sample, uint32_t source_id,
                               uint32_t voice_count, float velocity, float hold_seconds,
                               float spread_interval_seconds, bool pad_split, bool hold_span_override,
                               const float* override_midi, uint32_t override_count, float morph, float distance,
                               uint32_t visual_kind, uint64_t phrase_start_sample,
                               uint64_t visual_phrase_index, float visual_phrase_seconds,
                               float visual_trigger_interval_seconds) {
    const uint32_t pool_count = override_midi && override_count > 0u
        ? std::min<uint32_t>(override_count, 8u)
        : harmony.note_pool_count > 0u
          ? std::min<uint32_t>(harmony.note_pool_count, 8u)
          : 4u;
    float chord_midi[8]{};
    for (uint32_t index = 0u; index < pool_count; ++index) {
      chord_midi[index] = override_midi && override_count > 0u
          ? override_midi[index]
          : harmony.note_pool_count > 0u
            ? harmony.note_pool_midi[index]
            : harmony.chord_midi[index];
    }
    const uint64_t chord_attack_id = next_capture_attack_id();
    double voice_delays[8]{};
    const double spread_seconds = static_cast<double>(random.wave_spread) *
        static_cast<double>(std::max(0.0f, spread_interval_seconds));
    for (uint32_t voice = 0u; voice < 8u; ++voice) {
      voice_delays[voice] = next_random() * spread_seconds;
    }
    std::sort(voice_delays, voice_delays + 8u);

    const auto limit_mask = [](uint32_t mask, uint32_t count) {
      uint32_t limited = 0u;
      uint32_t selected = 0u;
      for (uint32_t voice = 0u; voice < 8u && selected < count; ++voice) {
        const uint32_t bit = 1u << voice;
        if ((mask & bit) == 0u) continue;
        limited |= bit;
        ++selected;
      }
      return limited;
    };
    const auto voice_rank = [](uint32_t mask, uint32_t voice_index) {
      uint32_t rank = 0u;
      for (uint32_t voice = 0u; voice < voice_index; ++voice) {
        if ((mask & (1u << voice)) != 0u) ++rank;
      }
      return rank;
    };
    const auto hold_for_source = [&](uint32_t event_source_id, double delay_seconds) {
      if (hold_span_override) {
        return clampFloat(
            hold_seconds - static_cast<float>(delay_seconds),
            0.02f,
            24.0f);
      }
      if (event_source_id != KESSHO_PRODUCT_SOURCE_PAD1 && event_source_id != KESSHO_PRODUCT_SOURCE_PAD2) {
        return arrangement.source_hold_seconds[std::min<uint32_t>(event_source_id - 1u, 7u)];
      }
      const SourceState& source = sources[event_source_id - 1u];
      const bool fit = random.fit_envelope_to_chord;
      float hold = source.hold_seconds;
      if (fit) {
        const float available = std::max(
            0.0f,
            spread_interval_seconds - static_cast<float>(delay_seconds) - 0.05f);
        const float max_hold = std::max(
            0.0f,
            available - source.attack_seconds - source.decay_seconds - source.release_seconds);
        hold = clampFloat(hold, 0.0f, max_hold);
      }
      return clampFloat(source.attack_seconds + source.decay_seconds + hold, 0.02f, 20.0f);
    };
    ArrangementChordVoice built[8]{};
    uint32_t built_count = 0u;
    const auto add_voice = [&](uint32_t event_source_id, float midi, uint32_t voice_index) {
      if (built_count >= 8u) return;
      ArrangementChordVoice& voice = built[built_count++];
      voice.source_id = event_source_id;
      voice.midi = clampFloat(midi + static_cast<float>(random.octave * 12), 0.0f, 127.0f);
      voice.voice_index = voice_index;
      voice.base_delay_seconds = voice_delays[voice_index];
      voice.velocity = velocity;
    };
    const auto build_pad_mask = [&](uint32_t mask, uint32_t pad_source_id) {
      float enabled_midi[8]{};
      uint32_t enabled_count = 0u;
      for (uint32_t voice = 0u; voice < std::min<uint32_t>(8u, pool_count); ++voice) {
        if ((mask & (1u << voice)) != 0u) enabled_midi[enabled_count++] = chord_midi[voice];
      }
      if (enabled_count == 0u) enabled_midi[enabled_count++] = chord_midi[0];
      for (uint32_t voice = 0u; voice < 8u; ++voice) {
        if ((mask & (1u << voice)) == 0u) continue;
        const uint32_t rank = voice_rank(mask, voice);
        add_voice(pad_source_id, enabled_midi[rank % enabled_count], voice);
      }
    };

    if (source_id == KESSHO_PRODUCT_SOURCE_PAD1 || source_id == KESSHO_PRODUCT_SOURCE_PAD2 || pad_split) {
      const uint32_t available = random.voice_mask & ~arrangement.pad_euclid_owned_voice_mask & 0xffu;
      uint32_t pad1_mask = 0u;
      uint32_t pad2_mask = 0u;
      if (pad_split) {
        const uint32_t selected = limit_mask(available, voice_count);
        pad1_mask = selected & ~random.pad2_voice_assign;
        pad2_mask = selected & random.pad2_voice_assign;
      } else if (source_id == KESSHO_PRODUCT_SOURCE_PAD2) {
        const uint32_t eligible = available & random.pad2_voice_assign;
        pad2_mask = limit_mask(eligible != 0u ? eligible : available, voice_count);
      } else {
        const uint32_t eligible = available & ~random.pad2_voice_assign;
        pad1_mask = limit_mask(eligible != 0u ? eligible : available, voice_count);
      }
      if (pad1_mask != 0u) build_pad_mask(pad1_mask, KESSHO_PRODUCT_SOURCE_PAD1);
      if (pad2_mask != 0u) build_pad_mask(pad2_mask, KESSHO_PRODUCT_SOURCE_PAD2);
    } else {
      for (uint32_t voice = 0u; voice < voice_count; ++voice) {
        const float base = chord_midi[voice % pool_count];
        const float octave = static_cast<float>((voice / pool_count) * 12u);
        add_voice(source_id, base + octave, voice);
      }
    }

    const auto emit_voice = [&](const ArrangementChordVoice& voice, double delay_seconds,
                                float event_velocity, float event_hold_seconds) {
      const double nudged_delay = std::max(0.0, delay_seconds);
      const uint64_t voice_sample = absolute_sample + static_cast<uint64_t>(std::llround(
          nudged_delay * sample_rate));
      const bool morph_supported = voice.source_id == KESSHO_PRODUCT_SOURCE_PAD1 ||
          voice.source_id == KESSHO_PRODUCT_SOURCE_PAD2 ||
          voice.source_id == KESSHO_PRODUCT_SOURCE_LEAD1 ||
          voice.source_id == KESSHO_PRODUCT_SOURCE_LEAD2;
      const bool distance_supported = morph_supported ||
          voice.source_id == KESSHO_PRODUCT_SOURCE_SAMPLE1 ||
          voice.source_id == KESSHO_PRODUCT_SOURCE_SAMPLE2;
      queue_note(
          voice_sample,
          voice.source_id,
          voice.midi,
          event_velocity,
          event_hold_seconds,
          voice.voice_index,
          morph_supported ? morph : -1.0f,
          distance_supported ? distance : -1.0f,
          1.0f,
          visual_kind,
          phrase_start_sample,
          visual_phrase_index,
          visual_phrase_seconds,
          visual_trigger_interval_seconds,
          KESSHO_PRODUCT_GENERATED_SEQUENCER_CAPTURE_MODE_RANDOM_CHORDS,
          chord_attack_id);
    };

    for (uint32_t index = 0u; index < built_count; ++index) {
      const float event_hold = hold_span_override
          ? clampFloat(hold_seconds - static_cast<float>(built[index].base_delay_seconds), 0.02f, 24.0f)
          : hold_for_source(built[index].source_id, built[index].base_delay_seconds);
      emit_voice(built[index], built[index].base_delay_seconds, built[index].velocity, event_hold);
    }
  };

  if (random.chord_pending) {
    random.chord_pending = false;
    if (lane_active && random.mode == kRandomSlotModeChords) queue_chord(
        block_start,
        lane_source_id,
        random.voice_count,
        1.0f,
        std::max(0.02f, harmony.chord_interval_seconds),
        harmony.chord_interval_seconds,
        random.pad_split,
        false,
        nullptr,
        0u,
        -1.0f,
        -1.0f,
        KESSHO_PRODUCT_SIMPLE_SEQUENCER_VISUAL_CHORD,
        arrangement.chord_phrase_start_frame,
        arrangement.chord_phrase_index,
        harmony.phrase_length_seconds,
        harmony.chord_interval_seconds);
  }

  if (lane_active && random.mode == kRandomSlotModeNotes) {
    const uint64_t phrase_frames = arrangementFrames(sample_rate, random.phrase_seconds);
    while (random.next_phrase_frame < block_end) {
      ++random.phrase_index;
      const uint32_t note_count = std::max<uint32_t>(1u, static_cast<uint32_t>(
          std::floor(random.density * 3.0f + next_random() * 2.0 + 0.5)));
      int scale_intervals[kMaxScaleNotes]{};
      const uint32_t scale_count = std::max<uint32_t>(1u, scaleIntervals(harmony.scale_id, scale_intervals));
      const int32_t low = 64 + random.notes_octave * 12;
      const int32_t high = std::min<int32_t>(127, low + static_cast<int32_t>(random.octave_range * 12u));
      const int32_t root_pitch_class = positiveModulo(roundedInt(harmony.root_midi), 12u);
      const int32_t root_base = 36 + root_pitch_class;
      int32_t available[64]{};
      uint32_t available_count = 0u;
      int32_t chord_tones[64]{};
      uint32_t chord_tone_count = 0u;
      int32_t passing_tones[64]{};
      uint32_t passing_tone_count = 0u;
      for (uint32_t octave = 0u; octave < 8u; ++octave) {
        for (uint32_t scale_index = 0u; scale_index < scale_count; ++scale_index) {
          const int32_t midi = root_base + static_cast<int32_t>(octave * 12u) + scale_intervals[scale_index];
          if (midi < std::max(24, low) || midi > high || available_count >= 64u) continue;
          available[available_count++] = midi;
          bool chord_tone = false;
          const uint32_t chord_count = harmony.note_pool_count > 0u ? harmony.note_pool_count : 4u;
          for (uint32_t chord_index = 0u; chord_index < chord_count; ++chord_index) {
            const float chord_midi = harmony.note_pool_count > 0u
                ? harmony.note_pool_midi[chord_index]
                : harmony.chord_midi[chord_index];
            if (positiveModulo(midi, 12u) == positiveModulo(roundedInt(chord_midi), 12u)) {
              chord_tone = true;
              break;
            }
          }
          if (chord_tone) chord_tones[chord_tone_count++] = midi;
          else passing_tones[passing_tone_count++] = midi;
        }
      }
      for (uint32_t note = 0u; note < note_count; ++note) {
        const double timing = next_random();
        if (available_count == 0u) continue;
        const int32_t* pool = available;
        uint32_t pool_count = available_count;
        if (available_count > 1u && chord_tone_count > 0u) {
          if (passing_tone_count == 0u || next_random() < random.chord_bias) {
            pool = chord_tones;
            pool_count = chord_tone_count;
          } else {
            pool = passing_tones;
            pool_count = passing_tone_count;
          }
        }
        const uint32_t pitch_index = std::min<uint32_t>(
            pool_count - 1u,
            static_cast<uint32_t>(next_random() * static_cast<double>(pool_count)));
        const int32_t midi = pool[pitch_index];
        const double velocity_random = next_random();
        const uint64_t target = random.next_phrase_frame +
            static_cast<uint64_t>(std::llround(timing * static_cast<double>(phrase_frames)));
        queue_note(
            target,
            lane_source_id,
            static_cast<float>(std::min(high, midi)),
            random.velocity_min +
                (random.velocity_max - random.velocity_min) * static_cast<float>(velocity_random),
            random.hold_seconds,
            note,
            -1.0f,
            -1.0f,
            1.0f,
            KESSHO_PRODUCT_SIMPLE_SEQUENCER_VISUAL_RANDOM_TIMING,
            random.next_phrase_frame,
            random.phrase_index > 0u ? random.phrase_index - 1u : 0u,
            random.phrase_seconds,
            random.phrase_seconds,
            KESSHO_PRODUCT_GENERATED_SEQUENCER_CAPTURE_MODE_RANDOM_NOTES,
            0u);
      }
      random.next_phrase_frame += phrase_frames;
    }
  }

  uint32_t write_index = 0u;
  for (uint32_t index = 0u; index < random.pending_count; ++index) {
    RandomSlotPendingEvent pending = pending_events[index];
    if (pending.absolute_sample < block_end) {
      // Tap at emission: the note really sounds now, so a capture armed after
      // it was scheduled still sees it.
      captureArrangementNote(
          pending.capture_mode, pending.absolute_sample, pending.event,
          pending.event.source_id, pending.capture_attack_id);
      pending.event.sample_offset = pending.absolute_sample <= block_start
          ? 0u
          : static_cast<uint32_t>(pending.absolute_sample - block_start);
      (void)out.push(pending.event);
      continue;
    }
    pending_events[write_index++] = pending;
  }
  random.pending_count = write_index;
}
