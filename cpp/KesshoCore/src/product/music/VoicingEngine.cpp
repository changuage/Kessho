#include "../KesshoProductEngineInternal.h"

namespace {

constexpr int kChordToneCapacity = 32;
constexpr int kPassingToneCapacity = 32;

bool scaleContainsInterval(const int intervals[kessho::product::internal::kMaxScaleNotes], uint32_t count, uint32_t interval) {
  for (uint32_t i = 0; i < count; ++i) {
    if (static_cast<uint32_t>(intervals[i]) == interval) {
      return true;
    }
  }
  return false;
}

float pickIndexedNote(const float* notes, int count, uint32_t seed) {
  if (count <= 0) {
    return 60.0f;
  }
  const uint32_t index = static_cast<uint32_t>(kessho::product::internal::hashUnit(seed) * static_cast<float>(count)) %
      static_cast<uint32_t>(count);
  return notes[index];
}

bool liveGestureAppliesToLane(const HarmonyState& harmony, uint32_t lane_index) {
  // Every authored scope is eligible for the single live executor; the target
  // is the routing authority and prevents a gesture from mutating other lanes.
  if (harmony.live_gesture_scope > kessho::product::generated::KESSHO_PRODUCT_HARMONY_GESTURE_SCOPE_SEQLIVE) return false;
  const uint32_t target = harmony.live_gesture_target;
  if (target <= kessho::product::generated::KESSHO_PRODUCT_HARMONY_TAKEOVER_TARGET_OVERVIEW) return true;
  return target >= kessho::product::generated::KESSHO_PRODUCT_HARMONY_TAKEOVER_TARGET_SEQ1 &&
      target <= kessho::product::generated::KESSHO_PRODUCT_HARMONY_TAKEOVER_TARGET_SEQ4 &&
      target - kessho::product::generated::KESSHO_PRODUCT_HARMONY_TAKEOVER_TARGET_SEQ1 == (lane_index % 4u);
}

int collectScaleNotesInRange(
    float root_midi,
    const int* intervals,
    uint32_t interval_count,
    int low,
    int high,
    float* notes,
    int capacity) {
  if (interval_count == 0u || capacity <= 0) {
    return 0;
  }
  const uint32_t root_pitch_class = kessho::product::internal::positiveModulo(
      kessho::product::internal::roundedInt(root_midi),
      12u);
  int count = 0;
  for (int midi = low; midi <= high && count < capacity; ++midi) {
    const uint32_t scale_interval = kessho::product::internal::positiveModulo(midi - static_cast<int>(root_pitch_class), 12u);
    if (scaleContainsInterval(intervals, interval_count, scale_interval)) {
      notes[count++] = static_cast<float>(midi);
    }
  }
  return count;
}

int nearestOctaveOffset(float center, float root_midi) {
  return static_cast<int>(std::round((center - root_midi) / 12.0f));
}

} // namespace

  float KesshoProductEngine::resolveHarmonyMidi(
      const LaneState& lane,
      uint32_t lane_index,
      uint32_t step_id,
      uint64_t absolute_sample) const {
  if (lane.target_source_id == KESSHO_PRODUCT_SOURCE_DRUM) {
    return lane.midi_note;
  }
  if (lane.seed >= 3000u && lane.seed < 5000u) {
    return clampFloat(lane.midi_note, 0.0f, 127.0f);
  }

  if ((harmony.live_gesture_phase == 0u || harmony.live_gesture_phase == 1u) &&
      harmony.live_gesture_note_count > 0u && absolute_sample <= harmony.live_gesture_expires_at_frame &&
      liveGestureAppliesToLane(harmony, lane_index)) {
    float semantic_notes[8]{};
    uint32_t semantic_count = 0u;
    if (harmony.live_gesture_playback_behavior != 2u &&
        harmony.live_gesture_intent_present != 0u) {
      float root = harmony.root_midi;
      if (harmony.live_gesture_intent_root_mode == 0u && harmony.cached_scale_degree_count > 0u) {
        const uint32_t degree = static_cast<uint32_t>(std::max(0, harmony.live_gesture_intent_degree)) % harmony.cached_scale_degree_count;
        root = harmony.root_midi + static_cast<float>(harmony.cached_scale_degree_map[degree]);
      } else if (harmony.live_gesture_intent_root_mode == 2u) {
        root = harmony.live_gesture_captured_root_midi;
      } else {
        root = 60.0f + static_cast<float>(positiveModulo(static_cast<int>(std::round(harmony.live_gesture_intent_root_note)), 12u));
      }
      root += static_cast<float>(harmony.live_gesture_intent_octave - 4) * 12.0f;
      const HarmonyIntentRecipe recipe{
        harmony.live_gesture_intent_present,
        harmony.live_gesture_intent_quality,
        harmony.live_gesture_intent_inversion,
        harmony.live_gesture_intent_spread,
        harmony.live_gesture_intent_bass_mode,
        harmony.live_gesture_intent_bass_note,
        harmony.live_gesture_intent_extension_mask,
        harmony.live_gesture_intent_alteration_mask,
      };
      semantic_count = buildSemanticHarmonyVoicing(harmony, recipe, root, semantic_notes);
    }
    const float* gesture_notes = semantic_count > 0u ? semantic_notes : harmony.live_gesture_notes;
    const uint32_t gesture_count = semantic_count > 0u ? semantic_count : harmony.live_gesture_note_count;
    uint32_t best = 0u;
    float distance = std::abs(gesture_notes[0] - lane.midi_note);
    for (uint32_t index = 1u; index < gesture_count; ++index) {
      const float next_distance = std::abs(gesture_notes[index] - lane.midi_note);
      if (next_distance < distance) { best = index; distance = next_distance; }
    }
    return clampFloat(gesture_notes[best], 0.0f, 127.0f);
  }

  const bool activeSlotExact = harmony.active_slot_id >= 0 && harmony.active_slot_id < 8 &&
      harmony.slot_playback_behavior[static_cast<uint32_t>(harmony.active_slot_id)] == 2u;
  if (harmony.takeover_progress > 0.0f && harmony.takeover_anchor_count > 0u && !activeSlotExact) {
    uint32_t best = 0u;
    float distance = std::abs(harmony.takeover_anchor_source[0] - lane.midi_note);
    for (uint32_t index = 1u; index < harmony.takeover_anchor_count; ++index) {
      const float next_distance = std::abs(harmony.takeover_anchor_source[index] - lane.midi_note);
      if (next_distance < distance) { best = index; distance = next_distance; }
    }
    const float source = harmony.takeover_anchor_source[best];
    const float target = harmony.takeover_anchor_target[best];
    return clampFloat(harmony.takeover_progress < 0.5f ? source : target, 0.0f, 127.0f);
  }

  if (harmony.morph_plan_phase > 0.0f && !activeSlotExact) {
    // The plan chooses a musical handover point (normally 0.5, or the
    // scale-aware point selected by the offline projection). New triggers use
    // one valid integer-MIDI voicing or the other; there is deliberately no
    // cent glide. Existing Harmony-resolved voices are crossfaded by the
    // render path when removed at handover; subsequent triggers cross using
    // integer anchors.
    const float handover = clampFloat(harmony.morph_scale_handover_at, 0.05f, 0.95f);
    const bool target_side = harmony.morph_plan_phase >= handover;
    const uint32_t pair_count = harmony.morph_voice_pair_count > 0u
        ? harmony.morph_voice_pair_count
        : harmony.morph_common_pair_count;
    const float* pair_source = harmony.morph_voice_pair_count > 0u
        ? harmony.morph_voice_pair_source
        : harmony.morph_common_pair_source;
    const float* pair_target = harmony.morph_voice_pair_count > 0u
        ? harmony.morph_voice_pair_target
        : harmony.morph_common_pair_target;
    if (pair_count > 0u) {
    uint32_t best = 0u;
      float distance = std::abs(pair_source[0] - lane.midi_note);
      for (uint32_t index = 1u; index < pair_count; ++index) {
        const float next_distance = std::abs(pair_source[index] - lane.midi_note);
        if (next_distance < distance) { best = index; distance = next_distance; }
      }
      const float source = pair_source[best];
      const float target = pair_target[best];
      return clampFloat(target_side ? target : source, 0.0f, 127.0f);
    }
    if (harmony.morph_unmatched_a_count > 0u || harmony.morph_unmatched_b_count > 0u) {
      // Added/removed voices are not paired by a pitch glide. A removed
      // source is allowed to finish before the handover; an added destination
      // enters only after the handover. This keeps held pads continuous while
      // ensuring every newly triggered note is scale-valid.
      if (!target_side && harmony.morph_unmatched_a_count == 0u) return -1.0f;
      if (target_side && harmony.morph_unmatched_b_count == 0u) return -1.0f;
      const float* candidates = target_side ? harmony.morph_unmatched_b : harmony.morph_unmatched_a;
      const uint32_t candidate_count = target_side ? harmony.morph_unmatched_b_count : harmony.morph_unmatched_a_count;
      uint32_t best = 0u;
      float distance = std::abs(candidates[0] - lane.midi_note);
      for (uint32_t index = 1u; index < candidate_count; ++index) {
        const float next_distance = std::abs(candidates[index] - lane.midi_note);
        if (next_distance < distance) { best = index; distance = next_distance; }
      }
      return clampFloat(candidates[best], 0.0f, 127.0f);
    }
  }

  if (harmony.active_slot_id >= 0 && harmony.active_slot_id < 8 &&
      static_cast<uint32_t>(harmony.active_slot_id) < harmony.cached_voice_leading_candidate_count) {
    const uint32_t slot = static_cast<uint32_t>(harmony.active_slot_id);
    const uint32_t count = harmony.cached_voice_leading_candidate_note_counts[slot];
    if (count > 0u) {
      uint32_t best = 0u;
      const float first = harmony.cached_voice_leading_candidates[slot][0];
      float distance = std::abs(first - lane.midi_note);
      for (uint32_t index = 1u; index < count; ++index) {
        const float candidate = harmony.cached_voice_leading_candidates[slot][index];
        const float next_distance = std::abs(candidate - lane.midi_note);
        if (next_distance < distance) { best = index; distance = next_distance; }
      }
      return clampFloat(harmony.cached_voice_leading_candidates[slot][best], 0.0f, 127.0f);
    }
  }

  if (lane.pitch_mode == kSequencerPitchModeNoteRange) {
    int pitch_intervals[kMaxScaleNotes]{};
    uint32_t pitch_scale_count = 0u;
    if (lane.pitch_scale_id == kSequencerPitchScaleChromatic) {
      for (uint32_t interval = 0u; interval < 12u && interval < kMaxScaleNotes; ++interval) {
        pitch_intervals[interval] = static_cast<int>(interval);
      }
      pitch_scale_count = std::min<uint32_t>(12u, kMaxScaleNotes);
    } else {
      pitch_scale_count = scaleIntervals(lane.pitch_scale_id, pitch_intervals);
    }
    const int low = std::max(24, roundedInt(std::min(lane.note_range_min, lane.note_range_max)));
    const int high = std::min(108, roundedInt(std::max(lane.note_range_min, lane.note_range_max)));
    const float root = lane.pitch_scale_id == kSequencerPitchScaleChromatic ? 60.0f : lane.pitch_root;
    float notes[kPassingToneCapacity]{};
    const int count = collectScaleNotesInRange(root, pitch_intervals, pitch_scale_count, low, high, notes, kPassingToneCapacity);
    if (count > 0) {
      const uint32_t event_seed = hashU32(
          rng_seed ^
          lane.seed ^
          static_cast<uint32_t>(step_id * 2654435761u) ^
          static_cast<uint32_t>(lane_index * 16777619u) ^
          static_cast<uint32_t>(absolute_sample) ^
          static_cast<uint32_t>(absolute_sample >> 32));
      return clampFloat(pickIndexedNote(notes, count, event_seed ^ 0x27d4eb2du), 24.0f, 108.0f);
    }
    return clampFloat((static_cast<float>(low) + static_cast<float>(high)) * 0.5f, 24.0f, 108.0f);
  }

  if (harmony.note_pool_count > 0u) {
    const uint32_t pool_count = std::min<uint32_t>(harmony.note_pool_count, 8u);
    const uint32_t event_seed = hashU32(
        rng_seed ^
        lane.seed ^
        static_cast<uint32_t>(step_id * 2654435761u) ^
        static_cast<uint32_t>(lane_index * 16777619u) ^
        static_cast<uint32_t>(absolute_sample) ^
        static_cast<uint32_t>(absolute_sample >> 32));
    const uint32_t index = static_cast<uint32_t>(hashUnit(event_seed) * static_cast<float>(pool_count)) % pool_count;
    return clampFloat(harmony.note_pool_midi[index], 0.0f, 127.0f);
  }

  const uint32_t scale_count = harmony.cached_scale_degree_count;
  if (scale_count == 0u) {
    return clampFloat(lane.midi_note, 0.0f, 127.0f);
  }

  const uint64_t bar = transport.barIndexAt(sample_rate, absolute_sample);
  const uint64_t phrase = transport.phraseIndexAt(sample_rate, absolute_sample);
  const uint32_t progression_degree = circleOfFifthsProgressionDegree(rng_seed, harmony.tension, bar, phrase, scale_count);

  bool chord_pitch_classes[12]{};
  const uint32_t chord_degrees[4] = {
      progression_degree % scale_count,
      (progression_degree + 2u) % scale_count,
      (progression_degree + 4u) % scale_count,
      (progression_degree + 7u) % scale_count,
  };
  const uint32_t root_pitch_class = positiveModulo(roundedInt(harmony.root_midi), 12u);
  if (harmony.voicing_mode == 0u) {
    const uint32_t degree = (step_id + lane_index + progression_degree) % scale_count;
    const int octave_offset = nearestOctaveOffset(clampFloat(lane.midi_note, 0.0f, 127.0f), harmony.root_midi);
    const float resolved = harmony.root_midi + static_cast<float>(octave_offset * 12 + harmony.cached_scale_degree_map[degree]);
    return clampFloat(resolved, 0.0f, 127.0f);
  }

  for (uint32_t i = 0; i < 4u; ++i) {
    const uint32_t pitch_class = (root_pitch_class + harmony.cached_scale_degree_map[chord_degrees[i] % scale_count]) % 12u;
    chord_pitch_classes[pitch_class] = true;
  }

  const float center = clampFloat(lane.midi_note, 0.0f, 127.0f);
  const int low = std::max(24, roundedInt(center - 6.0f));
  const int high = std::min(108, roundedInt(center + 6.0f));
  float chord_tones[kChordToneCapacity]{};
  float passing_tones[kPassingToneCapacity]{};
  int chord_tone_count = 0;
  int passing_tone_count = 0;

  for (int midi = low; midi <= high; ++midi) {
    const uint32_t scale_interval = positiveModulo(midi - static_cast<int>(root_pitch_class), 12u);
    bool scale_contains = false;
    for (uint32_t scale_index = 0u; scale_index < scale_count; ++scale_index) {
      if (harmony.cached_scale_degree_map[scale_index] == scale_interval) { scale_contains = true; break; }
    }
    if (!scale_contains) {
      continue;
    }
    const uint32_t pitch_class = positiveModulo(midi, 12u);
    if (chord_pitch_classes[pitch_class] && chord_tone_count < kChordToneCapacity) {
      chord_tones[chord_tone_count++] = static_cast<float>(midi);
    } else if (!chord_pitch_classes[pitch_class] && passing_tone_count < kPassingToneCapacity) {
      passing_tones[passing_tone_count++] = static_cast<float>(midi);
    }
  }

  if (chord_tone_count == 0 && passing_tone_count == 0) {
    const uint32_t degree = (step_id + lane_index + progression_degree) % scale_count;
    const int octave_offset = nearestOctaveOffset(center, harmony.root_midi);
    const float resolved = harmony.root_midi + static_cast<float>(octave_offset * 12 + harmony.cached_scale_degree_map[degree]);
    return clampFloat(resolved, 0.0f, 127.0f);
  }

  const uint32_t event_seed = hashU32(
      rng_seed ^
      lane.seed ^
      static_cast<uint32_t>(step_id * 2654435761u) ^
      static_cast<uint32_t>(lane_index * 16777619u) ^
      static_cast<uint32_t>(absolute_sample) ^
      static_cast<uint32_t>(absolute_sample >> 32));
  const float chord_bias = 0.9f - std::max(0.0f, harmony.tension) * 0.4f;
  if (chord_tone_count > 0 && (passing_tone_count == 0 || hashUnit(event_seed) < chord_bias)) {
    return clampFloat(pickIndexedNote(chord_tones, chord_tone_count, event_seed ^ 0x9e3779b9u), 0.0f, 127.0f);
  }
  return clampFloat(pickIndexedNote(passing_tones, passing_tone_count, event_seed ^ 0x85ebca6bu), 0.0f, 127.0f);
}
