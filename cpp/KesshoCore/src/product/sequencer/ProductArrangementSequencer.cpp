#include "../KesshoProductEngineInternal.h"

namespace {

uint64_t arrangementFrames(double sample_rate, float seconds) {
  return std::max<uint64_t>(1u, static_cast<uint64_t>(std::llround(
      sample_rate * static_cast<double>(std::max(0.001f, seconds)))));
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
  arrangement.next_lead_phrase_frame = arrangement.lead_initial_delay_seconds <= 0.0f
      ? transport.sample_frame
      : transport.sample_frame + arrangementFrames(sample_rate, arrangement.lead_initial_delay_seconds);
  arrangement.lead_phrase_index = 0u;
  arrangement.chord_phrase_start_frame = transport.sample_frame;
  arrangement.chord_phrase_index = harmony.next_phrase_index > 0u
      ? harmony.next_phrase_index - 1u
      : 0u;
  arrangement.chord_generator_pending = arrangement.chord_generator_enabled;
  arrangement.pending_count = 0u;
  arrangement.rng_state = arrangement.rng_seed;
}

void KesshoProductEngine::generateArrangementEvents(uint32_t frames, SequencerBuffer& out) {
  if (!transport.running || frames == 0u) return;
  const uint64_t block_start = transport.sample_frame;
  const uint64_t block_end = block_start + frames;
  const auto next_random = [&]() { return arrangementNextRandom(arrangement.rng_state); };

  const auto queue_note = [&](uint64_t absolute_sample, uint32_t source_id, float midi,
                              float velocity, float hold_seconds, uint32_t voice_index,
                              float morph, float distance, float expression,
                              uint32_t visual_kind, uint64_t phrase_start_sample,
                              uint64_t phrase_index, float phrase_seconds,
                              float trigger_interval_seconds) {
    if (arrangement.pending_count >= kMaxArrangementPendingEvents) return;
    ProductArrangementPendingEvent& pending = arrangement.pending[arrangement.pending_count++];
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
    double voice_delays[8]{};
    const double spread_seconds = static_cast<double>(arrangement.wave_spread) *
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
      const bool fit = event_source_id == KESSHO_PRODUCT_SOURCE_PAD1
          ? arrangement.pad1_fit_envelope_to_chord
          : arrangement.pad2_fit_envelope_to_chord;
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
      voice.midi = clampFloat(midi + static_cast<float>(arrangement.synth_octave * 12), 0.0f, 127.0f);
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
      const uint32_t available = arrangement.synth_voice_mask & ~arrangement.pad_euclid_owned_voice_mask & 0xffu;
      uint32_t pad1_mask = 0u;
      uint32_t pad2_mask = 0u;
      if (pad_split) {
        const uint32_t selected = limit_mask(available, voice_count);
        pad1_mask = selected & ~arrangement.pad2_voice_assign;
        pad2_mask = selected & arrangement.pad2_voice_assign;
      } else if (source_id == KESSHO_PRODUCT_SOURCE_PAD2) {
        const uint32_t eligible = available & arrangement.pad2_voice_assign;
        pad2_mask = limit_mask(eligible != 0u ? eligible : available, voice_count);
      } else {
        const uint32_t eligible = available & ~arrangement.pad2_voice_assign;
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
          visual_trigger_interval_seconds);
    };

    for (uint32_t index = 0u; index < built_count; ++index) {
      const float event_hold = hold_span_override
          ? clampFloat(hold_seconds - static_cast<float>(built[index].base_delay_seconds), 0.02f, 24.0f)
          : hold_for_source(built[index].source_id, built[index].base_delay_seconds);
      emit_voice(built[index], built[index].base_delay_seconds, built[index].velocity, event_hold);
    }
  };

  if (arrangement.chord_generator_pending) {
    arrangement.chord_generator_pending = false;
    queue_chord(
        block_start,
        arrangement.chord_generator_source_id,
        arrangement.chord_generator_voice_count,
        1.0f,
        std::max(0.02f, harmony.chord_interval_seconds),
        harmony.chord_interval_seconds,
        arrangement.chord_generator_pad_split,
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

  if (arrangement.lead_random_enabled) {
    const uint64_t phrase_frames = arrangementFrames(sample_rate, arrangement.lead_phrase_seconds);
    while (arrangement.next_lead_phrase_frame < block_end) {
      ++arrangement.lead_phrase_index;
      const uint32_t note_count = std::max<uint32_t>(1u, static_cast<uint32_t>(
          std::floor(arrangement.lead_density * 3.0f + next_random() * 2.0 + 0.5)));
      int scale_intervals[kMaxScaleNotes]{};
      const uint32_t scale_count = std::max<uint32_t>(1u, scaleIntervals(harmony.scale_id, scale_intervals));
      const int32_t low = 64 + arrangement.lead_octave * 12;
      const int32_t high = std::min<int32_t>(108, low + static_cast<int32_t>(arrangement.lead_octave_range * 12u));
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
          if (passing_tone_count == 0u || next_random() < arrangement.lead_chord_bias) {
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
        const uint64_t target = arrangement.next_lead_phrase_frame +
            static_cast<uint64_t>(std::llround(timing * static_cast<double>(phrase_frames)));
        queue_note(
            target,
            arrangement.lead_random_source_id,
            static_cast<float>(std::min(high, midi)),
            arrangement.lead_velocity_min +
                (arrangement.lead_velocity_max - arrangement.lead_velocity_min) * static_cast<float>(velocity_random),
            arrangement.lead_hold_seconds,
            note,
            -1.0f,
            -1.0f,
            1.0f,
            KESSHO_PRODUCT_SIMPLE_SEQUENCER_VISUAL_RANDOM_TIMING,
            arrangement.next_lead_phrase_frame,
            arrangement.lead_phrase_index > 0u ? arrangement.lead_phrase_index - 1u : 0u,
            arrangement.lead_phrase_seconds,
            arrangement.lead_phrase_seconds);
      }
      arrangement.next_lead_phrase_frame += phrase_frames;
    }
  }

  uint32_t write_index = 0u;
  for (uint32_t index = 0u; index < arrangement.pending_count; ++index) {
    ProductArrangementPendingEvent pending = arrangement.pending[index];
    if (pending.absolute_sample < block_end) {
      pending.event.sample_offset = pending.absolute_sample <= block_start
          ? 0u
          : static_cast<uint32_t>(pending.absolute_sample - block_start);
      (void)out.push(pending.event);
      continue;
    }
    arrangement.pending[write_index++] = pending;
  }
  arrangement.pending_count = write_index;
}
