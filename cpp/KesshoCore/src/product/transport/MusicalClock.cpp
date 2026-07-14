#include "../KesshoProductEngineInternal.h"

double ProductTransport::beatPosition(double sample_rate) const {
  const uint64_t elapsed = sample_frame >= beat_origin_frame ? sample_frame - beat_origin_frame : 0u;
  return beat_position_origin + static_cast<double>(elapsed) / samplesPerBeat(sample_rate);
}

uint64_t ProductTransport::barIndex(double sample_rate) const {
  return barIndexAt(sample_rate, sample_frame);
}

uint64_t ProductTransport::barIndexAt(double sample_rate, uint64_t sample) const {
  const uint64_t elapsed = sample >= beat_origin_frame ? sample - beat_origin_frame : 0u;
  const double beats = static_cast<double>(elapsed) / samplesPerBeat(sample_rate);
  return bar_index_origin + static_cast<uint64_t>(beats / std::max(1u, beats_per_bar));
}

uint64_t ProductTransport::phraseIndex(double sample_rate) const {
  return phraseIndexAt(sample_rate, sample_frame);
}

uint64_t ProductTransport::phraseIndexAt(double sample_rate, uint64_t sample) const {
  const uint64_t elapsed = sample >= phrase_origin_frame ? sample - phrase_origin_frame : 0u;
  const double period = samplesPerPhrase(sample_rate);
  if (!std::isfinite(period) || period <= 0.0) return phrase_index_origin;
  return phrase_index_origin + static_cast<uint64_t>(std::floor(static_cast<double>(elapsed) / period));
}
