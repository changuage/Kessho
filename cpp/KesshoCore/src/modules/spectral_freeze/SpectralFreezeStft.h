#pragma once

#include <cstdint>
#include <vector>

namespace kessho::spectral_freeze {

class SpectralFreezeStft {
public:
  static constexpr int kFftSize = 4096;
  static constexpr int kHopSize = 1024;
  static constexpr int kBinCount = kFftSize / 2 + 1;

  bool prepare();
  void reset() noexcept;

  void analyze(
      const float* input_frame,
      float* magnitude,
      float* phase) noexcept;
  void synthesize(
      const float* magnitude,
      const float* phase,
      float* output_frame) noexcept;

private:
  void transform(bool inverse) noexcept;

  std::vector<float> window_;
  std::vector<float> twiddle_real_;
  std::vector<float> twiddle_imaginary_;
  std::vector<uint16_t> bit_reversal_;
  std::vector<float> real_;
  std::vector<float> imaginary_;
  bool prepared_ = false;
};

}  // namespace kessho::spectral_freeze
