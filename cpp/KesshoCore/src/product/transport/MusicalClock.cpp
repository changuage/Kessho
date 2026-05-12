#include "../KesshoProductEngineInternal.h"

double ProductTransport::beatPosition(double sample_rate) const {
  return static_cast<double>(sample_frame) / samplesPerBeat(sample_rate);
}

uint64_t ProductTransport::barIndex(double sample_rate) const {
  const double beats = beatPosition(sample_rate);
  return static_cast<uint64_t>(beats / std::max(1u, beats_per_bar));
}

uint64_t ProductTransport::barIndexAt(double sample_rate, uint64_t sample) const {
  const double beats = static_cast<double>(sample) / samplesPerBeat(sample_rate);
  return static_cast<uint64_t>(beats / std::max(1u, beats_per_bar));
}

uint64_t ProductTransport::phraseIndex(double sample_rate) const {
  return barIndex(sample_rate) / std::max(1u, bars_per_phrase);
}

uint64_t ProductTransport::phraseIndexAt(double sample_rate, uint64_t sample) const {
  return barIndexAt(sample_rate, sample) / std::max(1u, bars_per_phrase);
}
