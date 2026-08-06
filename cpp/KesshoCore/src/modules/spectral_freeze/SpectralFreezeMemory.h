#pragma once

#include <array>
#include <cstdint>
#include <vector>

namespace kessho::spectral_freeze {

class SpectralFreezeMemory {
public:
  static constexpr int kBandCount = 32;

  bool prepare(double sample_rate, int fft_size);
  void reset() noexcept;

  void capture(
      const float* magnitude_l,
      const float* magnitude_r,
      int bin_count) noexcept;
  void updateFromLive(
      const float* magnitude_l,
      const float* magnitude_r,
      int bin_count,
      float refresh,
      float input_sensitivity,
      float sustain) noexcept;

  [[nodiscard]] int binCount() const noexcept { return bin_count_; }
  [[nodiscard]] int bandForBin(int bin) const noexcept;
  [[nodiscard]] float heldLogMagnitude(int channel, int bin) const noexcept;
  [[nodiscard]] float heldMagnitude(int channel, int bin) const noexcept;
  [[nodiscard]] float bandFlux(int band) const noexcept;

private:
  void updateChannel(
      int channel,
      const float* magnitude,
      float refresh,
      float input_sensitivity,
      float sustain) noexcept;

  int bin_count_ = 0;
  std::vector<uint8_t> band_for_bin_;
  std::array<std::vector<float>, 2> held_log_magnitude_;
  std::array<std::vector<float>, 2> previous_live_log_magnitude_;
  std::array<float, kBandCount> band_flux_{};
  std::array<float, kBandCount> smoothed_band_mask_{};
  bool captured_ = false;
};

}  // namespace kessho::spectral_freeze
