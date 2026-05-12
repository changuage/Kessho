#include "../KesshoProductEngineInternal.h"

namespace kessho::product::internal {

double sequencerSamplesPerStep(const ProductTransport& transport, double sample_rate, uint32_t clock_division) {
  return transport.samplesPerBeat(sample_rate) * 4.0 / static_cast<double>(std::max(1u, clock_division));
}

double sequencerSwingSamples(const ProductTransport& transport, const LaneState& lane, double samples_per_step) {
  return samples_per_step * 0.5 * clampFloat(transport.swing + lane.swing, 0.0f, 1.0f);
}

int64_t sequencerFirstStep(uint64_t block_start, double samples_per_step) {
  return static_cast<int64_t>(std::floor(static_cast<double>(block_start) / samples_per_step)) - 1;
}

int64_t sequencerLastStep(uint64_t block_end, double samples_per_step) {
  return static_cast<int64_t>(std::ceil(static_cast<double>(block_end) / samples_per_step)) + 1;
}

} // namespace kessho::product::internal
