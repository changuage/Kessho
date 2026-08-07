#include "SpectralFreezeStft.h"

#include <algorithm>
#include <cmath>

namespace kessho::spectral_freeze {
namespace {

constexpr float kPi = 3.14159265358979323846f;
constexpr float kTwoPi = 2.0f * kPi;
constexpr float kOverlapNormalization = 2.0f / 3.0f;

}  // namespace

bool SpectralFreezeStft::prepare() {
  try {
    window_.resize(kFftSize);
    twiddle_real_.resize(kFftSize / 2);
    twiddle_imaginary_.resize(kFftSize / 2);
    bit_reversal_.resize(kFftSize);
    real_.resize(kFftSize);
    imaginary_.resize(kFftSize);
  } catch (...) {
    prepared_ = false;
    return false;
  }

  for (int index = 0; index < kFftSize; ++index) {
    window_[static_cast<size_t>(index)] =
        0.5f - 0.5f * std::cos(kTwoPi * static_cast<float>(index) /
                              static_cast<float>(kFftSize));
  }
  for (int index = 0; index < kFftSize / 2; ++index) {
    const float angle = -kTwoPi * static_cast<float>(index) /
        static_cast<float>(kFftSize);
    twiddle_real_[static_cast<size_t>(index)] = std::cos(angle);
    twiddle_imaginary_[static_cast<size_t>(index)] = std::sin(angle);
  }

  constexpr int bit_count = 12;
  for (int index = 0; index < kFftSize; ++index) {
    uint16_t reversed = 0;
    uint16_t value = static_cast<uint16_t>(index);
    for (int bit = 0; bit < bit_count; ++bit) {
      reversed = static_cast<uint16_t>((reversed << 1u) | (value & 1u));
      value = static_cast<uint16_t>(value >> 1u);
    }
    bit_reversal_[static_cast<size_t>(index)] = reversed;
  }

  prepared_ = true;
  reset();
  return true;
}

void SpectralFreezeStft::reset() noexcept {
  std::fill(real_.begin(), real_.end(), 0.0f);
  std::fill(imaginary_.begin(), imaginary_.end(), 0.0f);
}

void SpectralFreezeStft::analyze(
    const float* input_frame,
    float* magnitude,
    float* phase) noexcept {
  if (!prepared_ || input_frame == nullptr || magnitude == nullptr || phase == nullptr) {
    return;
  }
  transformInput(input_frame);
  for (int bin = 0; bin < kBinCount; ++bin) {
    const float real = real_[static_cast<size_t>(bin)];
    const float imaginary = imaginary_[static_cast<size_t>(bin)];
    magnitude[bin] = std::sqrt(real * real + imaginary * imaginary);
    phase[bin] = std::atan2(imaginary, real);
  }
}

void SpectralFreezeStft::analyzeMagnitude(
    const float* input_frame,
    float* magnitude) noexcept {
  if (!prepared_ || input_frame == nullptr || magnitude == nullptr) {
    return;
  }
  transformInput(input_frame);
  for (int bin = 0; bin < kBinCount; ++bin) {
    const float real = real_[static_cast<size_t>(bin)];
    const float imaginary = imaginary_[static_cast<size_t>(bin)];
    magnitude[bin] = std::sqrt(real * real + imaginary * imaginary);
  }
}

void SpectralFreezeStft::synthesize(
    const float* magnitude,
    const float* phase,
    float* output_frame) noexcept {
  if (!prepared_ || magnitude == nullptr || phase == nullptr || output_frame == nullptr) {
    return;
  }
  for (int bin = 0; bin < kBinCount; ++bin) {
    const float magnitude_value = std::max(0.0f, magnitude[bin]);
    real_[static_cast<size_t>(bin)] = magnitude_value * std::cos(phase[bin]);
    imaginary_[static_cast<size_t>(bin)] = magnitude_value * std::sin(phase[bin]);
  }
  imaginary_[0] = 0.0f;
  imaginary_[kFftSize / 2] = 0.0f;
  for (int bin = 1; bin < kFftSize / 2; ++bin) {
    real_[static_cast<size_t>(kFftSize - bin)] = real_[static_cast<size_t>(bin)];
    imaginary_[static_cast<size_t>(kFftSize - bin)] =
        -imaginary_[static_cast<size_t>(bin)];
  }
  transform(true);
  for (int index = 0; index < kFftSize; ++index) {
    output_frame[index] = real_[static_cast<size_t>(index)] *
        window_[static_cast<size_t>(index)] * kOverlapNormalization;
  }
}

void SpectralFreezeStft::transformInput(const float* input_frame) noexcept {
  for (int index = 0; index < kFftSize; ++index) {
    real_[static_cast<size_t>(index)] =
        input_frame[index] * window_[static_cast<size_t>(index)];
    imaginary_[static_cast<size_t>(index)] = 0.0f;
  }
  transform(false);
}

void SpectralFreezeStft::transform(bool inverse) noexcept {
  for (int index = 0; index < kFftSize; ++index) {
    const int reversed = static_cast<int>(bit_reversal_[static_cast<size_t>(index)]);
    if (index < reversed) {
      std::swap(real_[static_cast<size_t>(index)], real_[static_cast<size_t>(reversed)]);
      std::swap(imaginary_[static_cast<size_t>(index)], imaginary_[static_cast<size_t>(reversed)]);
    }
  }

  for (int length = 2; length <= kFftSize; length <<= 1) {
    const int half_length = length >> 1;
    const int twiddle_stride = kFftSize / length;
    for (int block = 0; block < kFftSize; block += length) {
      for (int offset = 0; offset < half_length; ++offset) {
        const int twiddle_index = offset * twiddle_stride;
        const float twiddle_real = twiddle_real_[static_cast<size_t>(twiddle_index)];
        const float twiddle_imaginary = inverse
            ? -twiddle_imaginary_[static_cast<size_t>(twiddle_index)]
            : twiddle_imaginary_[static_cast<size_t>(twiddle_index)];
        const int even = block + offset;
        const int odd = even + half_length;
        const float odd_real = real_[static_cast<size_t>(odd)] * twiddle_real -
            imaginary_[static_cast<size_t>(odd)] * twiddle_imaginary;
        const float odd_imaginary = real_[static_cast<size_t>(odd)] * twiddle_imaginary +
            imaginary_[static_cast<size_t>(odd)] * twiddle_real;
        const float even_real = real_[static_cast<size_t>(even)];
        const float even_imaginary = imaginary_[static_cast<size_t>(even)];
        real_[static_cast<size_t>(even)] = even_real + odd_real;
        imaginary_[static_cast<size_t>(even)] = even_imaginary + odd_imaginary;
        real_[static_cast<size_t>(odd)] = even_real - odd_real;
        imaginary_[static_cast<size_t>(odd)] = even_imaginary - odd_imaginary;
      }
    }
  }

  if (inverse) {
    constexpr float inverse_size = 1.0f / static_cast<float>(kFftSize);
    for (int index = 0; index < kFftSize; ++index) {
      real_[static_cast<size_t>(index)] *= inverse_size;
      imaginary_[static_cast<size_t>(index)] *= inverse_size;
    }
  }
}

}  // namespace kessho::spectral_freeze
