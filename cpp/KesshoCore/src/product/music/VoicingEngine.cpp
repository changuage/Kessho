#include "../KesshoProductEngineInternal.h"

  float KesshoProductEngine::resolveHarmonyMidi(
      const LaneState& lane,
      uint32_t lane_index,
      uint32_t step_id,
      uint64_t absolute_sample) const {
  if (lane.target_source_id == KESSHO_PRODUCT_SOURCE_DRUM) {
    return lane.midi_note;
  }

  int intervals[kMaxScaleNotes]{};
  const uint32_t scale_count = scaleIntervals(harmony.scale_id, intervals);
  const uint64_t bar = transport.barIndexAt(sample_rate, absolute_sample);
  const uint64_t phrase = transport.phraseIndexAt(sample_rate, absolute_sample);
  const uint32_t progression_degree = circleOfFifthsProgressionDegree(rng_seed, harmony.tension, bar, phrase, scale_count);
  const uint32_t degree = (step_id + lane_index + progression_degree) % scale_count;
  const int octave_offset = static_cast<int>(std::floor((lane.midi_note - harmony.root_midi) / 12.0f));
  const float resolved = harmony.root_midi + static_cast<float>(octave_offset * 12 + intervals[degree]);
  return clampFloat(resolved, 0.0f, 127.0f);
}
