#include "../KesshoProductEngineInternal.h"

  void KesshoProductEngine::updateHarmonyTelemetry(uint64_t absolute_sample) {
  if (harmony.note_pool_count > 0u) {
    harmony.chord_degree = harmony.active_step_index >= 0 ? static_cast<uint32_t>(harmony.active_step_index) : 0u;
    for (uint32_t i = 0; i < 4u; ++i) {
      harmony.chord_midi[i] = i < harmony.note_pool_count
          ? harmony.note_pool_midi[i]
          : harmony.note_pool_midi[harmony.note_pool_count - 1u];
    }
    return;
  }
  int intervals[kMaxScaleNotes]{};
  const uint32_t scale_count = scaleIntervals(harmony.scale_id, intervals);
  const uint64_t bar = transport.barIndexAt(sample_rate, absolute_sample);
  const uint64_t phrase = transport.phraseIndexAt(sample_rate, absolute_sample);
  harmony.chord_degree = circleOfFifthsProgressionDegree(rng_seed, harmony.tension, bar, phrase, scale_count);

  const uint32_t degrees[4] = {
      harmony.chord_degree % scale_count,
      (harmony.chord_degree + 2u) % scale_count,
      (harmony.chord_degree + 4u) % scale_count,
      (harmony.chord_degree + 7u) % scale_count,
  };
  for (uint32_t i = 0; i < 4u; ++i) {
    const int octave = i == 3u ? 12 : 0;
    harmony.chord_midi[i] = clampFloat(harmony.root_midi + static_cast<float>(intervals[degrees[i]] + octave), 0.0f, 127.0f);
  }
}
