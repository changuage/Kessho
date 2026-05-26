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

  int intervals[kMaxScaleNotes]{};
  const uint32_t scale_count = scaleIntervals(harmony.scale_id, intervals);
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
    const float resolved = harmony.root_midi + static_cast<float>(octave_offset * 12 + intervals[degree]);
    return clampFloat(resolved, 0.0f, 127.0f);
  }

  for (uint32_t i = 0; i < 4u; ++i) {
    const uint32_t pitch_class = (root_pitch_class + static_cast<uint32_t>(intervals[chord_degrees[i]])) % 12u;
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
    if (!scaleContainsInterval(intervals, scale_count, scale_interval)) {
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
    const float resolved = harmony.root_midi + static_cast<float>(octave_offset * 12 + intervals[degree]);
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
