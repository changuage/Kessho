#pragma once

#include "SpectralFreezeTypes.h"

namespace kessho::spectral_freeze {

class SpectralFreezeScanHead {
public:
  bool configure(int valid_capture_samples, int fft_size, int hop_size) noexcept;
  void setDirection(SpectralScanDirection direction) noexcept;
  void setNormalizedPosition(float position) noexcept;
  void advance(float ratio) noexcept;

  [[nodiscard]] double positionSamples() const noexcept { return position_samples_; }
  [[nodiscard]] float normalizedPosition() const noexcept;
  [[nodiscard]] double minimumPosition() const noexcept { return minimum_position_; }
  [[nodiscard]] double maximumPosition() const noexcept { return maximum_position_; }
  [[nodiscard]] int directionSign() const noexcept { return direction_sign_; }
  [[nodiscard]] SpectralScanDirection direction() const noexcept { return direction_; }
  [[nodiscard]] bool isValid() const noexcept { return valid_; }

  [[nodiscard]] static float normalizedToRatio(float value) noexcept;

private:
  void reflectIntoBounds() noexcept;
  void wrapForward() noexcept;
  void wrapReverse() noexcept;

  double minimum_position_ = 0.0;
  double maximum_position_ = 0.0;
  double position_samples_ = 0.0;
  double hop_size_ = 0.0;
  SpectralScanDirection direction_ = SpectralScanDirection::PingPong;
  int direction_sign_ = 1;
  bool valid_ = false;
};

}  // namespace kessho::spectral_freeze
