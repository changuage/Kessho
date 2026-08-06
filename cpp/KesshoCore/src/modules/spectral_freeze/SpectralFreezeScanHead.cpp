#include "SpectralFreezeScanHead.h"

#include <algorithm>
#include <cmath>

namespace kessho::spectral_freeze {

bool SpectralFreezeScanHead::configure(
    int valid_capture_samples,
    int fft_size,
    int hop_size) noexcept {
  valid_ = valid_capture_samples >= fft_size && fft_size >= 2 && hop_size > 0;
  if (!valid_) {
    minimum_position_ = 0.0;
    maximum_position_ = 0.0;
    position_samples_ = 0.0;
    hop_size_ = 0.0;
    return false;
  }

  minimum_position_ = static_cast<double>(fft_size / 2);
  maximum_position_ = static_cast<double>(valid_capture_samples - fft_size / 2 - 1);
  hop_size_ = static_cast<double>(hop_size);
  setNormalizedPosition(0.0f);
  setDirection(direction_);
  return true;
}

void SpectralFreezeScanHead::setDirection(SpectralScanDirection direction) noexcept {
  direction_ = direction;
  direction_sign_ = direction == SpectralScanDirection::Reverse ? -1 : 1;
}

void SpectralFreezeScanHead::setNormalizedPosition(float position) noexcept {
  if (!valid_) {
    position_samples_ = 0.0;
    return;
  }
  const double normalized = static_cast<double>(std::clamp(position, 0.0f, 1.0f));
  position_samples_ = minimum_position_ + normalized * (maximum_position_ - minimum_position_);
}

void SpectralFreezeScanHead::advance(float ratio) noexcept {
  if (!valid_ || !std::isfinite(ratio) || ratio <= 0.0f) {
    return;
  }

  position_samples_ += static_cast<double>(direction_sign_) *
      static_cast<double>(ratio) * hop_size_;
  switch (direction_) {
    case SpectralScanDirection::Forward:
      wrapForward();
      break;
    case SpectralScanDirection::Reverse:
      wrapReverse();
      break;
    case SpectralScanDirection::PingPong:
      reflectIntoBounds();
      break;
  }
}

float SpectralFreezeScanHead::normalizedPosition() const noexcept {
  if (!valid_ || maximum_position_ <= minimum_position_) {
    return 0.0f;
  }
  return static_cast<float>(
      (position_samples_ - minimum_position_) /
      (maximum_position_ - minimum_position_));
}

float SpectralFreezeScanHead::normalizedToRatio(float value) noexcept {
  if (!std::isfinite(value) || value <= 0.0001f) {
    return 0.0f;
  }
  return std::exp2(std::clamp(value, 0.0f, 1.0f) * 6.0f - 6.0f);
}

void SpectralFreezeScanHead::reflectIntoBounds() noexcept {
  while (position_samples_ > maximum_position_ || position_samples_ < minimum_position_) {
    if (position_samples_ > maximum_position_) {
      position_samples_ = maximum_position_ - (position_samples_ - maximum_position_);
      direction_sign_ = -1;
    }
    if (position_samples_ < minimum_position_) {
      position_samples_ = minimum_position_ + (minimum_position_ - position_samples_);
      direction_sign_ = 1;
    }
  }
}

void SpectralFreezeScanHead::wrapForward() noexcept {
  const double span = maximum_position_ - minimum_position_;
  if (span <= 0.0) {
    position_samples_ = minimum_position_;
    return;
  }
  while (position_samples_ > maximum_position_) {
    position_samples_ -= span;
  }
}

void SpectralFreezeScanHead::wrapReverse() noexcept {
  const double span = maximum_position_ - minimum_position_;
  if (span <= 0.0) {
    position_samples_ = maximum_position_;
    return;
  }
  while (position_samples_ < minimum_position_) {
    position_samples_ += span;
  }
}

}  // namespace kessho::spectral_freeze
