#include "SpectralFreezeCaptureBuffer.h"

#include <algorithm>
#include <cmath>
#include <limits>

namespace kessho::spectral_freeze {

bool SpectralFreezeCaptureBuffer::prepare(double sample_rate, double duration_seconds) {
  if (
      !std::isfinite(sample_rate) ||
      !std::isfinite(duration_seconds) ||
      sample_rate <= 0.0 ||
      duration_seconds <= 0.0) {
    return false;
  }

  const double requested_samples = std::ceil(sample_rate * duration_seconds);
  if (requested_samples > static_cast<double>(std::numeric_limits<int>::max())) {
    return false;
  }

  const int capacity = std::max(1, static_cast<int>(requested_samples));
  try {
    left_.assign(static_cast<size_t>(capacity), 0.0f);
    right_.assign(static_cast<size_t>(capacity), 0.0f);
  } catch (...) {
    left_.clear();
    right_.clear();
    capacity_samples_ = 0;
    return false;
  }

  capacity_samples_ = capacity;
  reset();
  return true;
}

void SpectralFreezeCaptureBuffer::reset() noexcept {
  std::fill(left_.begin(), left_.end(), 0.0f);
  std::fill(right_.begin(), right_.end(), 0.0f);
  valid_samples_ = 0;
  write_position_ = 0;
  locked_valid_samples_ = 0;
  locked_write_position_ = 0;
  locked_ = false;
}

void SpectralFreezeCaptureBuffer::write(
    const float* input_l,
    const float* input_r,
    int frames) noexcept {
  if (
      locked_ ||
      input_l == nullptr ||
      input_r == nullptr ||
      frames <= 0 ||
      capacity_samples_ <= 0) {
    return;
  }

  for (int frame = 0; frame < frames; ++frame) {
    left_[static_cast<size_t>(write_position_)] = input_l[frame];
    right_[static_cast<size_t>(write_position_)] = input_r[frame];
    ++write_position_;
    if (write_position_ == capacity_samples_) {
      write_position_ = 0;
    }
    if (valid_samples_ < capacity_samples_) {
      ++valid_samples_;
    }
  }
}

bool SpectralFreezeCaptureBuffer::lock() noexcept {
  if (locked_ || valid_samples_ <= 0) {
    return locked_;
  }
  locked_valid_samples_ = valid_samples_;
  locked_write_position_ = write_position_;
  locked_ = true;
  return true;
}

void SpectralFreezeCaptureBuffer::release() noexcept {
  locked_ = false;
  locked_valid_samples_ = 0;
  locked_write_position_ = 0;
}

float SpectralFreezeCaptureBuffer::readLeft(double chronological_position) const noexcept {
  return read(0, chronological_position);
}

float SpectralFreezeCaptureBuffer::readRight(double chronological_position) const noexcept {
  return read(1, chronological_position);
}

float SpectralFreezeCaptureBuffer::read(int channel, double chronological_position) const noexcept {
  const int valid = activeValidSamples();
  if (valid <= 0 || !std::isfinite(chronological_position)) {
    return 0.0f;
  }

  const double clamped = std::clamp(
      chronological_position,
      0.0,
      static_cast<double>(valid - 1));
  const int index_a = static_cast<int>(clamped);
  const int index_b = std::min(index_a + 1, valid - 1);
  const float fraction = static_cast<float>(clamped - static_cast<double>(index_a));
  const std::vector<float>& samples = channel == 0 ? left_ : right_;
  const float a = samples[static_cast<size_t>(physicalIndex(index_a))];
  const float b = samples[static_cast<size_t>(physicalIndex(index_b))];
  return a + (b - a) * fraction;
}

int SpectralFreezeCaptureBuffer::validSamples() const noexcept {
  return activeValidSamples();
}

int SpectralFreezeCaptureBuffer::activeValidSamples() const noexcept {
  return locked_ ? locked_valid_samples_ : valid_samples_;
}

int SpectralFreezeCaptureBuffer::activeWritePosition() const noexcept {
  return locked_ ? locked_write_position_ : write_position_;
}

int SpectralFreezeCaptureBuffer::physicalIndex(int chronological_index) const noexcept {
  const int valid = activeValidSamples();
  int oldest = activeWritePosition() - valid;
  if (oldest < 0) {
    oldest += capacity_samples_;
  }
  int physical = oldest + chronological_index;
  if (physical >= capacity_samples_) {
    physical -= capacity_samples_;
  }
  return physical;
}

}  // namespace kessho::spectral_freeze
