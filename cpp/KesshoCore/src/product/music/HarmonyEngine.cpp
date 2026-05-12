#include "../KesshoProductEngineInternal.h"

  void KesshoProductEngine::updateHarmonyTelemetry(uint64_t absolute_sample) {
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
