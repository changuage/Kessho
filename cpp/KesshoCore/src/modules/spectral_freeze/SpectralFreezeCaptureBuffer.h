#pragma once

#include <cstdint>
#include <vector>

namespace kessho::spectral_freeze {

class SpectralFreezeCaptureBuffer {
public:
  bool prepare(double sample_rate, double duration_seconds = 16.0);
  void reset() noexcept;

  void write(const float* input_l, const float* input_r, int frames) noexcept;
  bool lock() noexcept;
  void release() noexcept;

  [[nodiscard]] float readLeft(double chronological_position) const noexcept;
  [[nodiscard]] float readRight(double chronological_position) const noexcept;
  [[nodiscard]] float read(int channel, double chronological_position) const noexcept;

  [[nodiscard]] int capacitySamples() const noexcept { return capacity_samples_; }
  [[nodiscard]] int validSamples() const noexcept;
  [[nodiscard]] int writePosition() const noexcept { return write_position_; }
  [[nodiscard]] bool isLocked() const noexcept { return locked_; }

private:
  [[nodiscard]] int activeValidSamples() const noexcept;
  [[nodiscard]] int activeWritePosition() const noexcept;
  [[nodiscard]] int physicalIndex(int chronological_index) const noexcept;

  std::vector<float> left_;
  std::vector<float> right_;
  int capacity_samples_ = 0;
  int valid_samples_ = 0;
  int write_position_ = 0;
  int locked_valid_samples_ = 0;
  int locked_write_position_ = 0;
  bool locked_ = false;
};

}  // namespace kessho::spectral_freeze
