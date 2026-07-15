#include "../KesshoProductEngineInternal.h"

namespace kessho::product::internal {

double sequencerSamplesPerStep(const ProductTransport& transport, double sample_rate, uint32_t clock_division) {
  return transport.samplesPerBeat(sample_rate) * 4.0 / static_cast<double>(std::max(1u, clock_division));
}

double sequencerSwingSamples(const ProductTransport&, const LaneState& lane, double samples_per_step) {
  return samples_per_step * 0.5 * clampFloat(lane.swing, 0.0f, 1.0f);
}

int64_t sequencerFirstStep(uint64_t block_start, double samples_per_step) {
  return static_cast<int64_t>(std::floor(static_cast<double>(block_start) / samples_per_step)) - 1;
}

int64_t sequencerLastStep(uint64_t block_end, double samples_per_step) {
  return static_cast<int64_t>(std::ceil(static_cast<double>(block_end) / samples_per_step)) + 1;
}

uint64_t sequencerAlignForwardSampleFrame(uint64_t sample_frame, double samples_per_period) {
  if (!std::isfinite(samples_per_period) || samples_per_period <= 0.0) {
    return sample_frame;
  }
  const double target = std::ceil(static_cast<double>(sample_frame) / samples_per_period) * samples_per_period;
  if (!std::isfinite(target) || target <= 0.0) {
    return sample_frame;
  }
  const uint64_t aligned = static_cast<uint64_t>(std::llround(target));
  return aligned < sample_frame ? sample_frame : aligned;
}

uint64_t sequencerAlignForwardFromOrigin(
    uint64_t sample_frame,
    uint64_t origin_frame,
    double samples_per_period) {
  if (sample_frame <= origin_frame) return origin_frame;
  const uint64_t elapsed = sample_frame - origin_frame;
  return origin_frame + sequencerAlignForwardSampleFrame(elapsed, samples_per_period);
}

uint64_t sequencerLaneStartSampleFrame(
    const ProductTransport& transport,
    const LaneState& lane,
    double sample_rate,
    uint64_t block_start,
    double samples_per_step) {
  if (std::isfinite(lane.initial_start_delay_seconds) && lane.initial_start_delay_seconds >= 0.0f) {
    const double delay_samples = std::round(
        static_cast<double>(clampFloat(lane.initial_start_delay_seconds, 0.0f, 64.0f)) * sample_rate);
    if (std::isfinite(delay_samples) && delay_samples > 0.0) {
      return block_start + static_cast<uint64_t>(delay_samples);
    }
    return block_start;
  }
  if (lane.phrase_reset || lane.bar_reset) {
    if (lane.phrase_reset) {
      return transport.phraseBoundaryFrameAt(sample_rate, block_start);
    }
    return transport.barBoundaryFrameAt(sample_rate, block_start);
  }
  return sequencerAlignForwardFromOrigin(
      block_start,
      transport.beat_origin_frame,
      samples_per_step);
}

int64_t sequencerFirstRelativeStep(uint64_t block_start, int64_t origin, double samples_per_step) {
  const double relative = static_cast<double>(block_start) - static_cast<double>(origin);
  return static_cast<int64_t>(std::floor(relative / samples_per_step)) - 1;
}

int64_t sequencerLastRelativeStep(uint64_t block_end, int64_t origin, double samples_per_step) {
  const double relative = static_cast<double>(block_end) - static_cast<double>(origin);
  return static_cast<int64_t>(std::ceil(relative / samples_per_step)) + 1;
}

uint32_t sequencerCurrentRelativeStep(const LaneState& lane, uint64_t sample_frame, double samples_per_step) {
  if (lane.step_count == 0u || !std::isfinite(samples_per_step) || samples_per_step <= 0.0) {
    return 0u;
  }
  if (!lane.sequencer_runtime_initialized ||
      static_cast<double>(sample_frame) <= static_cast<double>(lane.sequencer_start_sample_frame)) {
    return 0u;
  }
  const double relative = static_cast<double>(sample_frame) - static_cast<double>(lane.sequencer_start_sample_frame);
  const int64_t relative_step = static_cast<int64_t>(std::floor(relative / samples_per_step));
  if (relative_step < 0) {
    return 0u;
  }
  return static_cast<uint32_t>(relative_step % static_cast<int64_t>(std::max(1u, lane.step_count)));
}

} // namespace kessho::product::internal
