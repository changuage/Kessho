#pragma once

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <stdexcept>
#include <vector>

namespace kessho::offline {

// This helper is intentionally scoped to the 48 kHz stereo fixtures used by
// Product Core.  The coefficients below are the 48 kHz BS.1770 K-weighting
// pre-filter (high shelf followed by the RLB high-pass filter).
constexpr uint32_t kLoudnessSampleRateHz = 48000u;
constexpr std::size_t kLoudnessWindowFrames = 19200u; // 400 ms
constexpr std::size_t kLoudnessHopFrames = 4800u; // 100 ms
constexpr double kLoudnessOffsetLufs = -0.691;
constexpr double kAbsoluteGateLufs = -70.0;
constexpr double kRelativeGateOffsetLufs = -10.0;
constexpr double kSilenceLufs = -std::numeric_limits<double>::infinity();

struct LoudnessMeasurement {
  double integrated_lufs = kSilenceLufs;
  double ungated_lufs = kSilenceLufs;
  double absolute_gated_lufs = kSilenceLufs;
  double relative_gate_lufs = kSilenceLufs;
  std::size_t analyzed_blocks = 0u;
  std::size_t absolute_gated_blocks = 0u;
  std::size_t relative_gated_blocks = 0u;

  bool has_signal() const noexcept {
    return relative_gated_blocks != 0u;
  }
};

namespace detail {

struct Biquad {
  constexpr Biquad(
      double b0,
      double b1,
      double b2,
      double a1,
      double a2) noexcept
      : b0(b0), b1(b1), b2(b2), a1(a1), a2(a2) {}

  double process(double input) noexcept {
    const double output = b0 * input + z1;
    z1 = b1 * input - a1 * output + z2;
    z2 = b2 * input - a2 * output;
    return output;
  }

  double b0;
  double b1;
  double b2;
  double a1;
  double a2;
  double z1 = 0.0;
  double z2 = 0.0;
};

struct KWeightingFilter {
  // BS.1770-4 48 kHz coefficients, a0 normalized to 1.
  Biquad high_shelf{
      1.53512485958697,
      -2.69169618940638,
      1.19839281085285,
      -1.69065929318241,
      0.73248077421585};
  Biquad rlb_high_pass{
      1.0,
      -2.0,
      1.0,
      -1.99004745483398,
      0.990072250366005};

  double process(double input) noexcept {
    return rlb_high_pass.process(high_shelf.process(input));
  }
};

inline double lufsFromEnergy(double energy) noexcept {
  return energy > 0.0
      ? kLoudnessOffsetLufs + 10.0 * std::log10(energy)
      : kSilenceLufs;
}

inline LoudnessMeasurement measure(
    const float* left,
    const float* right,
    std::size_t frames,
    std::size_t active_begin,
    std::size_t active_end,
    uint32_t sample_rate_hz) {
  if (sample_rate_hz != kLoudnessSampleRateHz) {
    throw std::invalid_argument("Product loudness meter only supports 48 kHz fixtures");
  }
  if (frames != 0u && (left == nullptr || right == nullptr)) {
    throw std::invalid_argument("Product loudness meter requires both stereo channels");
  }
  if (active_begin > active_end || active_end > frames) {
    throw std::invalid_argument("Product loudness active window is outside the input");
  }

  std::vector<double> energy_prefix(frames + 1u, 0.0);
  KWeightingFilter left_filter;
  KWeightingFilter right_filter;
  for (std::size_t frame = 0u; frame < frames; ++frame) {
    if (!std::isfinite(left[frame]) || !std::isfinite(right[frame])) {
      throw std::invalid_argument("Product loudness meter received a non-finite sample");
    }
    const double filtered_left = left_filter.process(static_cast<double>(left[frame]));
    const double filtered_right = right_filter.process(static_cast<double>(right[frame]));
    const double energy = filtered_left * filtered_left + filtered_right * filtered_right;
    if (!std::isfinite(energy)) {
      throw std::invalid_argument("Product loudness meter produced non-finite energy");
    }
    energy_prefix[frame + 1u] = energy_prefix[frame] + energy;
  }

  LoudnessMeasurement result;
  if (active_end - active_begin < kLoudnessWindowFrames) {
    return result;
  }

  std::vector<double> block_energies;
  block_energies.reserve(
      1u + (active_end - active_begin - kLoudnessWindowFrames) / kLoudnessHopFrames);
  for (std::size_t start = active_begin;
       start <= active_end - kLoudnessWindowFrames;
       start += kLoudnessHopFrames) {
    const double energy =
        (energy_prefix[start + kLoudnessWindowFrames] - energy_prefix[start]) /
        static_cast<double>(kLoudnessWindowFrames);
    block_energies.push_back(energy);
  }
  result.analyzed_blocks = block_energies.size();

  double ungated_energy = 0.0;
  for (const double energy : block_energies) ungated_energy += energy;
  if (!block_energies.empty()) {
    result.ungated_lufs = lufsFromEnergy(ungated_energy / block_energies.size());
  }

  double absolute_energy = 0.0;
  for (const double energy : block_energies) {
    if (lufsFromEnergy(energy) > kAbsoluteGateLufs) {
      absolute_energy += energy;
      ++result.absolute_gated_blocks;
    }
  }
  if (result.absolute_gated_blocks == 0u) {
    return result;
  }

  absolute_energy /= static_cast<double>(result.absolute_gated_blocks);
  result.absolute_gated_lufs = lufsFromEnergy(absolute_energy);
  result.relative_gate_lufs = result.absolute_gated_lufs + kRelativeGateOffsetLufs;

  double relative_energy = 0.0;
  const double final_gate_lufs = std::max(kAbsoluteGateLufs, result.relative_gate_lufs);
  for (const double energy : block_energies) {
    if (lufsFromEnergy(energy) > final_gate_lufs) {
      relative_energy += energy;
      ++result.relative_gated_blocks;
    }
  }
  if (result.relative_gated_blocks != 0u) {
    result.integrated_lufs = lufsFromEnergy(
        relative_energy / static_cast<double>(result.relative_gated_blocks));
  }
  return result;
}

} // namespace detail

// Measures all complete 400 ms blocks in the stream at 100 ms hops.  The
// absolute (-70 LUFS) and relative (-10 LU) gates follow BS.1770.  Incomplete
// leading/trailing blocks are ignored, as required for deterministic fixtures.
inline LoudnessMeasurement measureStereoIntegratedLufs(
    const float* left,
    const float* right,
    std::size_t frames,
    uint32_t sample_rate_hz = kLoudnessSampleRateHz) {
  return detail::measure(left, right, frames, 0u, frames, sample_rate_hz);
}

// Measures only complete windows inside [active_begin, active_end).  The
// K-weighting filter still runs over the complete input first, so callers can
// discard fixture warm-up/tail without introducing filter-reset transients.
inline LoudnessMeasurement measureStereoActiveWindowLufs(
    const float* left,
    const float* right,
    std::size_t frames,
    std::size_t active_begin,
    std::size_t active_end,
    uint32_t sample_rate_hz = kLoudnessSampleRateHz) {
  return detail::measure(left, right, frames, active_begin, active_end, sample_rate_hz);
}

} // namespace kessho::offline
